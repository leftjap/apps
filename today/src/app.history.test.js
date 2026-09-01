/**
 * 라우팅이 히스토리를 쌓지 않는다 — iOS standalone 뒤로가기 스와이프 회귀 방지.
 *
 * 버그(2026-09-01 실기기 스샷): 본문 우스와이프(드로어 열기)에 iOS 26 standalone 의
 * 히스토리 뒤로가기 엣지 스와이프가 함께 걸려, 이전 히스토리 항목의 스냅샷(부팅 중
 * 로딩 화면 비트맵)이 왼쪽에 3단으로 비침.
 * 원인: showLogin / showAuthenticated 정규화 / syncFromHash 정규화의 `location.hash =`
 *      대입이 뒤로 항목을 푸시 (항목 0 스냅샷 = 로딩 화면).
 * 규약: 앱은 단일 히스토리 항목 유지 — 해시 전환은 전부 history.replaceState
 *      (updateDeepLinkUrl 의 "back stack 오염 없이" 원칙과 동일).
 *
 * jsdom 미설치 프로젝트라 필요한 표면만 스텁 (app.viewport.test.js 패턴).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../mocks/today-mac.html?raw', () => ({ default: '<html><head></head><body></body></html>' }));
vi.mock('./services/auth.js', () => ({ Auth: {} }));
vi.mock('./services/supabase.js', () => ({ storageKey: 'k' }));
vi.mock('./services/auth-diag.js', () => ({ mountDiag: vi.fn(async () => {}), unmountDiag: vi.fn() }));
vi.mock('./db/queries.js', () => ({ Queries: {} }));
vi.mock('./features/sheetGesture.js', () => ({}));

let hashValue;      // location.hash 현재 값
let hashSetCount;   // location.hash 대입 횟수 — 대입 = 히스토리 푸시 (0 이어야 함)
let replaceCalls;   // history.replaceState 호출 기록
let winListeners;   // window 레벨 리스너 (hashchange 캡처용)

function setupEnv({ hash = '' } = {}) {
  hashValue = hash;
  hashSetCount = 0;
  replaceCalls = [];
  winListeners = {};

  const el = () => ({
    id: '', innerHTML: '', textContent: '', className: '',
    appendChild: () => {}, querySelector: () => null, querySelectorAll: () => [],
    addEventListener: () => {}, classList: { add: () => {}, contains: () => false },
  });

  globalThis.document = {
    getElementById: () => null,                       // loadingScreen 없음 — hide 경로 스킵
    querySelector: (sel) => {
      // ensureLoginCard / injectAuthOverlayStyles / stampBuildId 조기 반환 유도
      if (sel === '#today-login-card' || sel === '#today-auth-overlay-styles') return el();
      if (sel === '#app') return el();
      return null;                                     // .sb__item[...] 등 — 정규화 후 no-op
    },
    querySelectorAll: () => [],
    createElement: el,
    head: { appendChild: () => {} },
    body: { dataset: {}, appendChild: () => {} },
    addEventListener: () => {},
  };
  globalThis.window = {
    navigator: { standalone: false },
    matchMedia: () => ({ matches: false }),            // 비 standalone — 뷰포트 재보정 스킵
    addEventListener: (type, fn) => { winListeners[type] = fn; },
    screen: { height: 812 },
    innerHeight: 812,
  };
  globalThis.DOMParser = class {
    parseFromString() {
      return {
        head: { querySelectorAll: () => [] },
        body: { querySelectorAll: () => [], innerHTML: '' },
      };
    }
  };
  globalThis.location = {};
  Object.defineProperty(globalThis.location, 'hash', {
    get: () => hashValue,
    set: (v) => { hashValue = v; hashSetCount += 1; },  // 대입 = pushState 상당 — 금지 대상
    configurable: true,
  });
  globalThis.history = {
    replaceState: (_s, _t, url) => {
      replaceCalls.push(url);
      const i = String(url).indexOf('#');
      hashValue = i >= 0 ? String(url).slice(i) : '';
    },
  };
  globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 16);
}

let app;

beforeEach(async () => {
  vi.resetModules();
});

afterEach(() => {
  delete globalThis.document;
  delete globalThis.window;
  delete globalThis.DOMParser;
  delete globalThis.location;
  delete globalThis.history;
  delete globalThis.requestAnimationFrame;
});

async function loadApp() {
  app = await import('./app.js');
  return app;
}

describe('라우팅 히스토리 위생 — 해시 전환은 전부 replaceState (푸시 0)', () => {
  it('showLogin — #/login 진입이 히스토리를 쌓지 않는다', async () => {
    setupEnv({ hash: '' });
    const { showLogin } = await loadApp();

    showLogin();

    expect(hashSetCount).toBe(0);
    expect(replaceCalls).toContain('#/login');
    expect(hashValue).toBe('#/login');
  });

  it('showLogin — 이미 #/login 이면 replaceState 도 불필요 (no-op)', async () => {
    setupEnv({ hash: '#/login' });
    const { showLogin } = await loadApp();

    showLogin();

    expect(hashSetCount).toBe(0);
    expect(replaceCalls).toEqual([]);
  });

  it('showAuthenticated — 부팅 정규화(#/login → #/navi)가 히스토리를 쌓지 않는다', async () => {
    setupEnv({ hash: '#/login' });
    const { showAuthenticated } = await loadApp();

    showAuthenticated();

    expect(hashSetCount).toBe(0);
    expect(replaceCalls).toContain('#/navi');
    expect(hashValue).toBe('#/navi');
  });

  it('showAuthenticated — 빈 해시 콜드 스타트(스샷 시나리오)도 푸시 0', async () => {
    setupEnv({ hash: '' });
    const { showAuthenticated } = await loadApp();

    showAuthenticated();

    expect(hashSetCount).toBe(0);
    expect(hashValue).toBe('#/navi');
  });

  it('syncFromHash 정규화 — hashchange 로 들어온 무효 해시도 푸시 없이 정규화', async () => {
    setupEnv({ hash: '#/navi' });
    const { showAuthenticated } = await loadApp();
    showAuthenticated();                                // hashchange 리스너 등록
    const onHashChange = winListeners.hashchange;
    expect(typeof onHashChange).toBe('function');
    replaceCalls.length = 0;

    hashValue = '#/';                                   // 무효 해시 (사용자 URL 편집 등)
    onHashChange();

    expect(hashSetCount).toBe(0);
    expect(hashValue).toBe('#/navi');
  });
});
