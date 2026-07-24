/**
 * standalone 부팅 시퀀스 — 뷰포트 재보정 깜빡임 회귀 방지.
 *
 * 버그(2026-07-23 실기기 보고): 고양이 로딩화면이 사라진 뒤 홈화면이 확대됐다 줄어듦.
 * 원인: kickViewportCover 의 재시도 toggle(700ms, 기기 회전 등가 기하 재계산) 이
 *      로딩화면 제거(~360ms) 보다 늦게 발화 → 재계산이 사용자에게 그대로 노출.
 * 규약: standalone 에서는 재보정이 끝날 때까지 로딩화면이 화면을 덮고 있어야 한다.
 *
 * jsdom 미설치 프로젝트라 필요한 표면만 스텁 (전역 document/window).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../mocks/today-mac.html?raw', () => ({ default: '<html><head></head><body></body></html>' }));
vi.mock('./services/auth.js', () => ({ Auth: {} }));
vi.mock('./services/supabase.js', () => ({ storageKey: 'k' }));
vi.mock('./services/auth-diag.js', () => ({ mountDiag: vi.fn(async () => {}), unmountDiag: vi.fn() }));
vi.mock('./db/queries.js', () => ({ Queries: {} }));
vi.mock('./features/sheetGesture.js', () => ({}));

const VIEWPORT_META = 'width=device-width, initial-scale=1.0, viewport-fit=cover, user-scalable=no';

let loader;         // #loadingScreen 스텁
let metaContent;    // viewport meta 의 현재 content
let metaSetCount;   // setAttribute 호출 횟수 — 토글 1회 = 2 (auto → cover)
let docListeners;   // document 레벨 리스너 (touchstart/pointerdown)

function makeLoader() {
  const classes = new Set();
  return {
    removed: false,
    classList: { add: (c) => classes.add(c), contains: (c) => classes.has(c) },
    remove() { this.removed = true; },
    addEventListener() {},           // transitionend — 스텁 환경에선 미발화
  };
}

/**
 * @param {boolean} standalone 설치된 PWA 여부
 * @param {number} innerH  결손 재현 (screen.height - innerHeight ∈ (0,80] 이면 재시도 발화)
 */
function setupEnv({ standalone, innerH = 768 }) {
  loader = makeLoader();
  metaContent = VIEWPORT_META;
  metaSetCount = 0;
  docListeners = {};

  globalThis.document = {
    getElementById: (id) => (id === 'loadingScreen' && !loader.removed ? loader : null),
    querySelector: (sel) => (sel.includes('viewport')
      ? { getAttribute: () => metaContent, setAttribute: (_, v) => { metaContent = v; metaSetCount += 1; } }
      : null),
    addEventListener: (type, fn) => { docListeners[type] = fn; },
    body: { dataset: {} },
  };
  globalThis.window = {
    navigator: { standalone },
    matchMedia: (q) => ({ matches: standalone && q.includes('display-mode: standalone') }),
    screen: { height: 812 },
    innerHeight: innerH,
  };
  globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 16);
}

let app;

beforeEach(async () => {
  vi.resetModules();
  // rAF 는 위 스텁(setTimeout 기반)을 쓰도록 타이머만 fake.
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});

afterEach(() => {
  vi.useRealTimers();
  delete globalThis.document;
  delete globalThis.window;
  delete globalThis.requestAnimationFrame;
});

async function loadApp() {
  app = await import('./app.js');
  return app;
}

describe('kickViewportCover — 로딩화면이 덮어야 할 시간을 알려준다', () => {
  it('standalone 이면 재시도(700ms) 이후까지 덮도록 지연값을 돌려준다', async () => {
    setupEnv({ standalone: true });
    const { kickViewportCover, VIEWPORT_RETRY_MS } = await loadApp();

    const delay = kickViewportCover();

    expect(delay).toBeGreaterThan(VIEWPORT_RETRY_MS);
  });

  it('비 standalone(브라우저) 이면 지연 0 — 부팅 체감 무변경', async () => {
    setupEnv({ standalone: false, innerH: 812 });
    const { kickViewportCover } = await loadApp();

    expect(kickViewportCover()).toBe(0);
  });

  it('standalone 결손이 남아 있으면 700ms 에 재시도 토글이 실제로 발화한다', async () => {
    setupEnv({ standalone: true, innerH: 768 }); // 결손 44px
    const { kickViewportCover } = await loadApp();
    kickViewportCover();
    vi.advanceTimersByTime(16);   // 1차 토글 (auto→cover) 완료
    const afterFirst = metaSetCount;

    vi.advanceTimersByTime(700);  // 재시도 발화

    expect(metaSetCount).toBeGreaterThan(afterFirst); // 재시도 토글이 meta 를 다시 건드림
  });
});

describe('hideInitialLoadingScreen — 재보정이 끝날 때까지 덮는다', () => {
  it('지연이 주어지면 재시도(700ms) 시점에 로딩화면이 아직 남아 있다', async () => {
    setupEnv({ standalone: true });
    const { hideInitialLoadingScreen, kickViewportCover } = await loadApp();

    hideInitialLoadingScreen(kickViewportCover());
    vi.advanceTimersByTime(700);

    expect(loader.removed).toBe(false);
  });

  it('재보정 후에는 제거된다 (영구 잔존 금지)', async () => {
    setupEnv({ standalone: true });
    const { hideInitialLoadingScreen, kickViewportCover } = await loadApp();

    hideInitialLoadingScreen(kickViewportCover());
    vi.advanceTimersByTime(3000);

    expect(loader.removed).toBe(true);
  });

  it('지연 0(브라우저) 이면 기존대로 ~360ms 에 제거된다', async () => {
    setupEnv({ standalone: false, innerH: 812 });
    const { hideInitialLoadingScreen } = await loadApp();

    hideInitialLoadingScreen(0);
    vi.advanceTimersByTime(400);

    expect(loader.removed).toBe(true);
  });

  it('부팅 중 터치하면 지연과 무관하게 즉시 제거된다 (느린 기기 안전망 유지)', async () => {
    setupEnv({ standalone: true });
    const { hideInitialLoadingScreen, kickViewportCover } = await loadApp();

    hideInitialLoadingScreen(kickViewportCover());
    docListeners.pointerdown?.();

    expect(loader.removed).toBe(true);
  });
});
