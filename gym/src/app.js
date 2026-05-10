import loginHtml from '../mocks/login.html?raw';
import homeHtml from '../mocks/home.html?raw';
import sessionHtml from '../mocks/session.html?raw';
import summaryHtml from '../mocks/summary.html?raw';
import statsHtml from '../mocks/stats.html?raw';
import adminHtml from '../mocks/admin.html?raw';

const ROUTES = {
  login: loginHtml,
  home: homeHtml,
  session: sessionHtml,
  summary: summaryHtml,
  stats: statsHtml,
  admin: adminHtml,
};

const DEFAULT_ROUTE = 'login';
const VIEW_ATTR = 'data-gym-view';

function parseRoute() {
  const hash = window.location.hash.replace(/^#\/?/, '');
  const name = hash.split(/[/?]/)[0];
  return ROUTES[name] ? name : DEFAULT_ROUTE;
}

function rewriteMockLinks(html) {
  // 1) window.location.href = 'X.html'  →  window.location.hash = '#/X'
  //    (삼항·변수 할당까지는 아래 2번 규칙이 커버)
  let out = html.replace(
    /window\.location\.href\s*=\s*(['"])([a-zA-Z0-9_-]+)\.html\1\s*;?/g,
    "window.location.hash = '#/$2';",
  );
  // 2) HTML href="X.html"  →  href="#/X"
  out = out.replace(
    /\bhref\s*=\s*(['"])([a-zA-Z0-9_-]+)\.html\1/g,
    'href=$1#/$2$1',
  );
  // 3) 스크립트·속성 내 모든 'X.html' / "X.html" 문자열 리터럴 치환
  //    (삼항 `? 'stats.html' : 'admin.html'` · location.replace('login.html') 등 커버)
  //    .html 확장자이면서 디렉터리 경로 없는 기본 파일명만 대상
  out = out.replace(
    /(['"])([a-zA-Z0-9_-]+)\.html\1/g,
    '$1#/$2$1',
  );
  return out;
}

function clearPreviousView() {
  document.querySelectorAll(`[${VIEW_ATTR}="1"]`).forEach((n) => n.remove());
}

function injectHeadAssets(srcDoc) {
  for (const el of Array.from(srcDoc.head.children)) {
    if (el.tagName === 'TITLE') {
      document.title = el.textContent;
      continue;
    }
    if (el.tagName === 'STYLE' || el.tagName === 'LINK') {
      const clone = el.cloneNode(true);
      clone.setAttribute(VIEW_ATTR, '1');
      document.head.appendChild(clone);
    }
  }
}

function replaceBody(srcDoc) {
  for (const attr of Array.from(document.body.attributes)) {
    if (!['data-route'].includes(attr.name)) {
      document.body.removeAttribute(attr.name);
    }
  }
  for (const attr of Array.from(srcDoc.body.attributes)) {
    document.body.setAttribute(attr.name, attr.value);
  }
  document.body.innerHTML = srcDoc.body.innerHTML;
}

function reExecuteScripts() {
  const scripts = Array.from(document.body.querySelectorAll('script'));
  for (const old of scripts) {
    const ns = document.createElement('script');
    for (const a of old.attributes) ns.setAttribute(a.name, a.value);
    const body = old.textContent || '';
    const hasSrc = old.hasAttribute('src');
    ns.textContent = hasSrc ? body : `(function(){\n${body}\n})();`;
    ns.setAttribute(VIEW_ATTR, '1');
    old.parentNode.replaceChild(ns, old);
  }
}

/**
 * Wave 11.7 — 라우트 가드.
 * SPA + Supabase 환경에서 미인증 (window.gymDB 미할당) 이면 login 외 모든 라우트는 #/login 강제.
 * mocks 허브(iframe) 환경에는 window.gymAuth 가 undefined → 가드 비활성, mocks fallback 유지.
 */
function applyAuthGuard(route) {
  if (typeof window === 'undefined') return route;
  if (!window.gymAuth) return route; // iframe / mocks fallback
  if (route === 'login') return route;
  if (!window.gymDB) {
    if (window.location.hash !== '#/login') {
      window.location.replace('#/login');
    }
    return 'login';
  }
  return route;
}

/**
 * Phase B 단계 5 — 라우트별 feature mount 호출.
 * mocks innerHTML 주입 + inline script 재실행 후 src/features/* 의 mountXxxView 발화.
 *  - login : mocks/login.html inline script 가 직접 wiring (signInWithGoogle)
 *  - summary : mocks/summary.html inline script 가 직접 wiring (홈으로 버튼)
 *  - 그 외 : window.gymXxx.mountXxxView 호출. 미초기화·미마운트 graceful no-op.
 */
const ROUTE_MOUNTS = Object.freeze({
  home: () => window.gymHome?.mountHomeView?.(),
  session: () => window.gymSession?.mountSessionView?.(),
  stats: () => window.gymStats?.mountStatsView?.(),
  admin: () => window.gymManage?.mountManageView?.(),
});

function mount(route) {
  const guarded = applyAuthGuard(route);
  const raw = ROUTES[guarded];
  const html = rewriteMockLinks(raw);
  const doc = new DOMParser().parseFromString(html, 'text/html');

  clearPreviousView();
  injectHeadAssets(doc);
  replaceBody(doc);
  document.body.dataset.route = guarded;
  reExecuteScripts();
  window.scrollTo(0, 0);

  const mountFn = ROUTE_MOUNTS[guarded];
  if (typeof mountFn === 'function') {
    Promise.resolve()
      .then(mountFn)
      .catch((e) => console.error('[gym] mount', guarded, e));
  }
}

/**
 * Wave 11.7 — auth 이벤트 구독 (Wave 11.17 INITIAL_SESSION 보강).
 * - SIGNED_IN / INITIAL_SESSION: allowlist 통과면 ensureUserDB → 현재 라우트가 login 이면 #/home 으로.
 *   hard reload (OAuth callback 후 페이지 reload 포함) 시 GoTrueClient 가 storage 의 session 자동 복원
 *   → INITIAL_SESSION 만 발화 (SIGNED_IN 아님). SIGNED_IN 단독 분기는 라우트 가드 #/login 루프.
 * - SIGNED_OUT: signOut 안에서 closeUserDB 호출됨 → #/login 으로.
 * - TOKEN_REFRESHED / USER_UPDATED 는 별 처리 없음 (세션 유지).
 */
function subscribeAuth() {
  if (typeof window === 'undefined') return;
  const auth = window.gymAuth;
  if (!auth?.isSupabaseConfigured) return;

  auth.onAuthStateChange(async (event, session) => {
    if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session?.user) {
      const user = session.user;
      if (!auth.isAllowedEmail(user.email)) {
        try { localStorage.setItem(auth.AUTH_ERROR_KEY, 'not_allowed'); } catch {}
        try { await auth.signOut(); } catch (e) { console.error('[gym] allowlist signOut 실패', e); }
        if (window.location.hash !== '#/login') window.location.replace('#/login');
        return;
      }
      try { await auth.ensureUserDB(user); }
      catch (e) { console.error('[gym] ensureUserDB 실패', e); return; }
      if (window.gymSync) {
        window.gymSync.startSync(user).catch((e) => console.error('[gym] sync 시작 실패', e));
      }
      if (window.location.hash === '#/login' || window.location.hash === '') {
        window.location.replace('#/home');
        return;
      }
      mount(parseRoute());
    } else if (event === 'SIGNED_OUT') {
      if (window.location.hash !== '#/login') window.location.replace('#/login');
      else mount('login'); // 이미 login 이면 마커 표시 위해 재mount
    }
  });
}

export function initApp() {
  window.addEventListener('hashchange', () => mount(parseRoute()));
  if (!window.location.hash) {
    window.location.replace(`#/${DEFAULT_ROUTE}`);
  }
  subscribeAuth();
  mount(parseRoute());
}
