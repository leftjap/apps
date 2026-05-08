import loginHtml from '../mocks/login.html?raw';
import homeHtml from '../mocks/home.html?raw';
import sessionNewHtml from '../mocks/session-new.html?raw';
import sessionReviewHtml from '../mocks/session-review.html?raw';
import summaryHtml from '../mocks/summary.html?raw';
import statsHtml from '../mocks/stats.html?raw';
import settingsHtml from '../mocks/settings.html?raw';
import bsSheetCss from './styles/bs-sheet.css?raw';

const ROUTES = {
  login: loginHtml,
  home: homeHtml,
  'session-new': sessionNewHtml,
  'session-review': sessionReviewHtml,
  summary: summaryHtml,
  stats: statsHtml,
  settings: settingsHtml,
};

const DEFAULT_ROUTE = 'login';
const VIEW_ATTR = 'data-study-view';

// 해시 라우트 + 쿼리 파라미터 파싱.
// 예: '#/session-review?sentenceId=abc&from=stats' → { name: 'session-review', params: {sentenceId, from} }
function parseRoute() {
  const hash = window.location.hash.replace(/^#\/?/, '');
  const [pathPart = '', queryPart = ''] = hash.split('?');
  const rawName = pathPart.split('/')[0];
  const name = ROUTES[rawName] ? rawName : DEFAULT_ROUTE;
  const params = {};
  if (queryPart) {
    for (const pair of queryPart.split('&')) {
      if (!pair) continue;
      const eq = pair.indexOf('=');
      const k = eq === -1 ? pair : pair.slice(0, eq);
      const v = eq === -1 ? '' : pair.slice(eq + 1);
      try { params[decodeURIComponent(k)] = decodeURIComponent(v); }
      catch { params[k] = v; }
    }
  }
  return { name, params };
}

function rewriteMockLinks(html) {
  // 1) window.location.href = 'X.html' 또는 'X.html?q=v'  →  window.location.hash = '#/X' 또는 '#/X?q=v'
  // 원본의 뒤 공백·세미콜론을 그대로 보존해야 `'X.html?q=' + expr` 형태의 문자열 concat 이 끊기지 않는다.
  let out = html.replace(
    /window\.location\.href\s*=\s*(['"])([a-zA-Z0-9_-]+)\.html(\?[^'"]*)?\1(\s*;?)/g,
    (_m, q, name, query, tail) => `window.location.hash = ${q}#/${name}${query || ''}${q}${tail}`,
  );
  // 2) HTML href="X.html" 또는 href="X.html?q=v"  →  href="#/X" 또는 href="#/X?q=v"
  out = out.replace(
    /\bhref\s*=\s*(['"])([a-zA-Z0-9_-]+)\.html(\?[^'"]*)?\1/g,
    (_m, q, name, query = '') => `href=${q}#/${name}${query}${q}`,
  );
  // 3) 스크립트·속성 내 모든 'X.html' / "X.html" (쿼리 포함) 문자열 리터럴 치환.
  //    (삼항 `? 'stats.html' : 'settings.html'` · location.replace('login.html') ·
  //     `'session.html?mode=' + m` 같은 동적 조립의 기저 리터럴 등 커버)
  out = out.replace(
    /(['"])([a-zA-Z0-9_-]+)\.html(\?[^'"]*)?\1/g,
    (_m, q, name, query = '') => `${q}#/${name}${query}${q}`,
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
  // body 속성 중 SPA 가 관리하는 data-route 만 유지
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
  // innerHTML 로 주입된 <script> 는 실행되지 않음 → 동적 생성 + IIFE 래핑
  // IIFE 로 감싸는 이유: 프로토타입 script 가 전역 `const STATES = {}` 등을 선언하면 다음 라우트에서
  // 재선언 SyntaxError 발생. IIFE 로 스코프 격리.
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

// home·stats 양쪽에서 쓰는 바텀시트 스타일을 head 에 1회만 주입.
// VIEW_ATTR 를 달지 않아 clearPreviousView 가 제거하지 않음 → 라우트 전환 간 유지.
function injectSharedStyles() {
  if (document.getElementById('bs-sheet-shared')) return;
  const style = document.createElement('style');
  style.id = 'bs-sheet-shared';
  style.textContent = bsSheetCss;
  document.head.appendChild(style);
}

/**
 * 라우트 가드 (Wave 11.12).
 * - login 라우트: 항상 허용.
 * - 그 외: window.studyDB 가 있어야 통과 (= 인증 + DB 초기화 완료).
 *   미충족 시 #/login 으로 강제 이동 → hashchange 가 다시 mount 호출.
 *
 * mocks 허브 (iframe 환경) 는 main.js 미경유 → 이 코드 자체가 로드되지 않으므로 영향 없음.
 */
function isAuthorized(routeName) {
  if (routeName === 'login') return true;
  return Boolean(typeof window !== 'undefined' && window.studyDB);
}

function mount(route) {
  if (!isAuthorized(route.name)) {
    window.location.replace('#/login');
    return;
  }
  const raw = ROUTES[route.name];
  const html = rewriteMockLinks(raw);
  const doc = new DOMParser().parseFromString(html, 'text/html');

  // 프로토타입 IIFE 가 읽을 수 있도록 현재 라우트를 전역 노출.
  // 예: session.html 의 getMode() 가 window.studyRoute.params.mode 를 참조.
  window.studyRoute = route;

  clearPreviousView();
  injectHeadAssets(doc);
  replaceBody(doc);
  document.body.dataset.route = route.name;
  reExecuteScripts();
  // Wave 11.30 — mocks 의 .pv-bar (Normal/Free/Milestone 등 디버그 chip) SPA 모드에서 일괄 hide.
  // mocks 단독 진입 (iframe 허브) 에서는 그대로 노출 (시안 도구). SPA = 실 앱 = 디버그 chip 노출 X.
  // session.html 의 인라인 분기 (Wave 11.22 후속 b) 는 그대로 유지 — idempotent (두 번 hide 무해).
  hidePvChips();
  window.scrollTo(0, 0);
}

// Wave 11.30 — SPA 모드에서 mocks 디버그 chip 일괄 hide.
// home / login / session / summary / (향후 추가) 모두 cover. !important 로 mocks IIFE 의 후행 변경 차단.
// 가드 = mount() 호출 자체 (= SPA 라우터 경유). mocks 단독 진입 (iframe 허브 / file://) 은
// main.js 미경유 → app.js 미실행 → mount() 미호출 → 자연스럽게 .pv-bar 노출 유지.
// window.studyDB 가드는 부적합 — login 라우트는 db 없이 진입 가능하지만 SPA 모드라 hide 필요.
function hidePvChips() {
  document.querySelectorAll('.pv-bar, .pv-spacer').forEach((el) => {
    el.style.setProperty('display', 'none', 'important');
  });
}

/**
 * Auth state 구독 (Wave 11.12 · Wave 11.19 INITIAL_SESSION 보강).
 * - SIGNED_IN / INITIAL_SESSION: allowlist 검증 → 통과 시 ensureUserDB → 현재 라우트가 login 이면 #/home 으로.
 *   Wave 11.19 발견: hard reload 시 GoTrueClient 가 storage 의 session 자동 복원 → INITIAL_SESSION 만 발화 (SIGNED_IN 아님).
 *   기존 SIGNED_IN 단독 분기는 main.js IIFE 의 ensureUserDB 의존 — race 시 라우트 가드 #/login 으로 빠짐.
 * - SIGNED_OUT: ensureUserDB 의 close 는 auth.signOut 내부에서 처리됨. 라우트만 #/login 강제.
 */
function bindAuthEvents() {
  if (typeof window === 'undefined' || !window.studyAuth) return;
  const auth = window.studyAuth;
  auth.onAuthStateChange(async (event, session) => {
    if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session?.user) {
      const user = session.user;
      if (!auth.isAllowedEmail(user.email)) {
        localStorage.setItem(auth.AUTH_ERROR_KEY, 'not_allowed');
        await auth.signOut(); // SIGNED_OUT 이벤트 별도 발행 → 라우트 정리는 그쪽에서
        return;
      }
      try { await auth.ensureUserDB(user); }
      catch (e) { console.error('[app] ensureUserDB 실패', e); return; }
      // Wave 11.13.1 — sync 시작 (signOut hook 은 main.js 에서 등록)
      // Wave 11.14 — 모든 테이블 empty 시 신규 사용자 자동 unlock (allowEmptyServerPush)
      if (typeof window !== 'undefined' && window.studySync) {
        window.studySync
          .startSync(user)
          .then((result) => {
            if (
              result?.ok &&
              Array.isArray(result?.results) &&
              result.results.length > 0 &&
              result.results.every((r) => r.status === 'empty')
            ) {
              window.studySync.allowEmptyServerPush();
            }
          })
          .catch((e) => console.error('[app] sync 시작 실패', e));
      }
      const current = parseRoute();
      if (current.name === 'login') {
        window.location.hash = '#/home';
      } else {
        // 이미 다른 라우트 (예: 새로고침 후 라우트 가드 통과) — 재마운트로 db 활성 반영
        mount(current);
      }
    } else if (event === 'SIGNED_OUT') {
      if (parseRoute().name !== 'login') {
        window.location.hash = '#/login';
      } else {
        // 이미 login 화면이면 mount 만 강제 (error banner 등 표시 위해)
        mount(parseRoute());
      }
    }
  });
}

export function initApp() {
  injectSharedStyles();
  bindAuthEvents();
  window.addEventListener('hashchange', () => mount(parseRoute()));
  if (!window.location.hash) {
    window.location.replace(`#/${DEFAULT_ROUTE}`);
  }
  mount(parseRoute());
}
