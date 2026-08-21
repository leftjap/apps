import { supabase, storageKey } from './services/supabase.js';
import { installAuthSessionGuard } from './services/auth-session-guard.js';
import { backupSession, restoreSessionIfMissing } from './services/auth-session-backup.js';
import { markLogin, mountDiag, unmountDiag } from './services/auth-diag.js';
import loginHtml from '../mocks/login.html?raw';
import homeHtml from '../mocks/home.html?raw';
import sessionNewHtml from '../mocks/session-new.html?raw';
import sessionReviewHtml from '../mocks/session-review.html?raw';
import sessionMathHtml from '../mocks/session-math.html?raw';
import summaryHtml from '../mocks/summary.html?raw';
import statsHtml from '../mocks/stats.html?raw';
import sentencesHtml from '../mocks/sentences.html?raw';
import settingsHtml from '../mocks/settings.html?raw';
import bsSheetCss from './styles/bs-sheet.css?raw';
import { mountHome } from './pages/home.js';
import { mountSessionNew } from './pages/session-new.js';
import { mountSessionReview } from './pages/session-review.js';
import { mountSessionMath } from './pages/session-math.js';
import { mountSummary } from './pages/summary.js';
import { mountLogin } from './pages/login.js';
import { mountSettings } from './pages/settings.js';
import { mountStats } from './pages/stats.js';
import { mountSentences } from './pages/sentences.js';

const ROUTES = {
  login: loginHtml,
  home: homeHtml,
  'session-new': sessionNewHtml,
  'session-review': sessionReviewHtml,
  'session-math': sessionMathHtml,
  summary: summaryHtml,
  stats: statsHtml,
  sentences: sentencesHtml,
  settings: settingsHtml,
};

// SPA 진입 시 mocks/*.html 내부의 인라인 module mount 스크립트는 IIFE 래핑 부적합 (import 구문 SyntaxError)
// + prod 번들에 /src/pages/*.js 절대경로 미존재 → 404. 따라서 SPA 라우터가 직접 mount 함수 호출.
// mocks 단독 preview (multi-page input) 는 인라인 스크립트로 그대로 동작.
const PAGE_MOUNTS = {
  login: mountLogin,
  home: mountHome,
  'session-new': mountSessionNew,
  'session-review': mountSessionReview,
  'session-math': mountSessionMath,
  summary: mountSummary,
  settings: mountSettings,
  stats: mountStats,
  sentences: mountSentences,
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

let currentCleanup = null;
// 마지막 mount 시점의 활성 DB 인스턴스 — SIGNED_IN 재발화 시 재마운트 필요 여부 판정용.
let lastMountedDB = null;

export function mount(route) {
  if (!isAuthorized(route.name)) {
    window.location.replace('#/login');
    return;
  }
  // 직전 뷰 teardown — 페이지 mount 가 반환한 cleanup 을 라우터가 호출한다.
  // (listener/interval 해제 + 세션 activeSession 스냅샷 저장 → 인앱 이탈 시 '이어하기' 보존)
  if (typeof currentCleanup === 'function') {
    try { currentCleanup(); } catch (e) { console.error('[router] view cleanup', e); }
  }
  currentCleanup = null;
  const raw = ROUTES[route.name];
  const html = rewriteMockLinks(raw);
  const doc = new DOMParser().parseFromString(html, 'text/html');

  // 프로토타입 IIFE 가 읽을 수 있도록 현재 라우트를 전역 노출.
  // 예: session.html 의 getMode() 가 window.studyRoute.params.mode 를 참조.
  window.studyRoute = route;

  // mocks/*.html 의 인라인 module mount 스크립트는 SPA 진입 시 제거 (PAGE_MOUNTS 가 대체).
  // src 속성 없는 module 스크립트만 제거 — 외부 src 의존 (Azure SDK 등) 은 보존.
  const pageMount = PAGE_MOUNTS[route.name];
  if (pageMount) {
    // mocks/*.html 의 인라인 스크립트 제거 (PAGE_MOUNTS 가 대체). external src 는 보존 (Azure SDK 등).
    doc.body.querySelectorAll('script:not([src])').forEach((s) => s.remove());
    // mocks/*.html 의 /src/styles/*.css 링크 제거 — main.js 가 동일 CSS 를 번들링.
    // prod 에서 /src/* 절대경로는 404. injectHeadAssets 가 이걸 head 로 복제하기 전에 제거.
    doc.head
      .querySelectorAll('link[rel="stylesheet"][href^="/src/"]')
      .forEach((l) => l.remove());
  }

  clearPreviousView();
  injectHeadAssets(doc);
  replaceBody(doc);
  document.body.dataset.route = route.name;
  reExecuteScripts();
  if (pageMount) {
    // home / session-* 은 #root 에 빌드. summary 등은 body 에 직접 DOM (mocks 원본 보존).
    const host = document.getElementById('root') || document.body;
    const ret = pageMount(host);
    currentCleanup = (typeof ret === 'function') ? ret : null;
  }
  // Wave 11.30 — mocks 의 .pv-bar (Normal/Free/Milestone 등 디버그 chip) SPA 모드에서 일괄 hide.
  // mocks 단독 진입 (iframe 허브) 에서는 그대로 노출 (시안 도구). SPA = 실 앱 = 디버그 chip 노출 X.
  // session.html 의 인라인 분기 (Wave 11.22 후속 b) 는 그대로 유지 — idempotent (두 번 hide 무해).
  hidePvChips();
  lastMountedDB = (typeof window !== 'undefined' ? window.studyDB : null) ?? null;
  window.scrollTo(0, 0);
  if (route.name === 'login') mountDiag(storageKey).catch(() => {}); else unmountDiag();
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
let _guard = null;

function bindAuthEvents() {
  if (typeof window === 'undefined' || !window.studyAuth) return;
  const auth = window.studyAuth;
  _guard ??= installAuthSessionGuard(supabase);
  auth.onAuthStateChange(async (event, session) => {
    if (session?.user) {
      backupSession(storageKey, session); // 복원용 미러 (rotation OFF 라 refresh 토큰 장수명)
      markLogin(storageKey); // 진단 마커
    }
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
        const syncPromise = window.studySync.startSync(user);
        // iOS 비동기 세션복원(SIGNED_IN/INITIAL_SESSION) 경로에서도 home.js 의 __syncReady.then(refreshStats)
        // 가 동작하도록 노출 — 미설정 시 빈 IndexedDB 기기가 서버 데이터를 받아도 홈이 0 으로 굳음(2026-06
        // 멀티기기 버그). main.js boot 가 이미 real-pull promise 를 넣었으면(데스크톱) ??= 로 보존.
        window.__syncReady ??= syncPromise;
        syncPromise
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
      } else if (window.studyDB !== lastMountedDB) {
        // db 인스턴스가 바뀐 경우만 재마운트 (계정 전환·뒤늦은 ensureUserDB) — 활성 db 반영.
        // 무조건 재마운트하면 안 된다: GoTrue 는 탭 hidden→visible 마다 SIGNED_IN 을 재발화하므로
        // (auth-js _onVisibilityChanged → _recoverAndRefresh) 진행 중 세션 화면이 탭 복귀마다
        // 리셋돼 응용 연습 점수·녹음 카운터가 소실됐다 (2026-08-21).
        mount(current);
      }
    } else if (event === 'INITIAL_SESSION') {
      // 부팅 시 토큰 없음 → 백업으로 1회 복원 (성공 시 SIGNED_IN 후속 발화로 재진입)
      await restoreSessionIfMissing(supabase, storageKey);
    } else if (event === 'SIGNED_OUT') {
      // 비정상 제거면 백업 복원 우선 (명시 로그아웃은 백업이 이미 폐기됨)
      const r = await restoreSessionIfMissing(supabase, storageKey);
      if (r.restored) return;
      const forceSignOut = () => {
        if (parseRoute().name !== 'login') {
          window.location.hash = '#/login';
        } else {
          mount(parseRoute());
        }
      };
      if (_guard) await _guard.handleSignedOutWithRetry(forceSignOut);
      else forceSignOut();
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
