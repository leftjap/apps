/**
 * Today SPA 라우터 + mocks 통합 + 인증 가드 (Wave 11.4).
 *
 * 흐름:
 *  - main.js 가 auth 세션 확인 후 showAuthenticated(user) / showLogin() 호출
 *  - mocks 는 한 번만 마운트 (Wave 11.2 패턴), 인증 상태에 따라 visibility 토글
 *  - 로그인 카드는 별도 overlay, 인증 시 숨김
 *
 * 라우트:
 *   #/login                   비인증 진입점
 *   #/navi #/fiction #/blog   글쓰기 카테고리
 *   #/memo #/expense          메모/가계부
 *
 * 라우트 가드: 세션 없는데 카테고리 라우트 접근 → #/login 으로 redirect.
 */
import mocksHtml from '../mocks/today-mac.html?raw';
import { Auth } from './services/auth.js';
import { storageKey } from './services/supabase.js';
import { mountDiag, unmountDiag } from './services/auth-diag.js';
import { Queries } from './db/queries.js';
import * as SheetGesture from './features/sheetGesture.js';

// 바텀 시트 1:1 추적 + snap 순수 로직을 mock 인라인 스크립트(initMobileSheet)에 노출.
// 모듈 로드(top-level) 시점에 세팅 → injectMocks 의 mock 스크립트 재실행보다 먼저 준비됨.
if (typeof window !== 'undefined') window.__todaySheetGesture = SheetGesture;

const ROUTES = ['navi', 'fiction', 'blog', 'memo', 'expense', 'admin'];
const DEFAULT_ROUTE = 'navi';
const WRITING_KINDS = ['navi', 'fiction', 'blog', 'memo']; // entry deep link 지원 카테고리

let _mocksMounted = false;
let _hashListenerBound = false;
let _currentUserId = null;

/** main.js 가 인증 완료 후 호출 — deep link 라우팅에 owner_id 필요. */
export function setRouterUser(userId) {
  _currentUserId = userId || null;
}

// ───────────────────────────────────────────────────────────────────────────
// public API (main.js 가 호출)
// ───────────────────────────────────────────────────────────────────────────

export function showLogin() {
  document.body.dataset.authState = 'out';
  ensureLoginCard();
  if (location.hash !== '#/login') location.hash = '#/login';
  hideInitialLoadingScreen();
  mountDiag(storageKey).catch(() => {});
}

export function showAuthenticated() {
  document.body.dataset.authState = 'in';
  unmountDiag();
  if (!_mocksMounted) {
    injectMocks();
    stampBuildId();
    kickViewportCover();
    mountSheetDiag();
    _mocksMounted = true;
  }
  if (!_hashListenerBound) {
    window.addEventListener('hashchange', syncFromHash);
    _hashListenerBound = true;
  }
  // 인증 직후 hash 정규화 — `#/<kind>` 또는 `#/<kind>/<num>` 만 허용. 나머지 (#/login 등) → default 카테고리.
  // try/catch 필수 — syncFromHash 의 sbTarget.click() 이 mock IIFE 를 실행하다 throw 하면
  // hideInitialLoadingScreen 이 스킵돼 로딩화면(z9999)이 영구 잔존, 드로어 드래그 중 비침.
  const raw = location.hash.replace(/^#\//, '');
  const kindRaw = raw.split('/')[0];
  try {
    if (!ROUTES.includes(kindRaw)) {
      location.hash = `#/${DEFAULT_ROUTE}`;
    } else {
      syncFromHash();
    }
  } catch (e) {
    console.warn('[router] 초기 라우팅 실패 (로딩화면은 계속 제거)', e?.message || e);
  }
  hideInitialLoadingScreen();
}

// 초기 로딩 화면 (index.html 의 #loadingScreen) 숨김.
// requestAnimationFrame 으로 mocks 마운트 paint 직후 → 깜빡임 최소화.
function hideInitialLoadingScreen() {
  const el = typeof document !== 'undefined' && document.getElementById('loadingScreen');
  if (!el || el.classList.contains('hidden')) return;
  requestAnimationFrame(() => el.classList.add('hidden'));
  // 페이드(0.3s) 후 DOM 에서 완전 제거(el.remove) — opacity:0 만으론 z9999 전체화면 오버레이가
  // 무한 애니메이션(bounce/fade)으로 상주해 iOS PWA resume/리페인트 시 잠깐 비칠 수 있음
  // (드로어 드래그 중 로딩화면 "3단" 비침). DOM 제거로 컴포지팅·애니메이션·잔존을 원천 차단.
  const removeLoader = () => { el.remove(); };
  el.addEventListener('transitionend', removeLoader, { once: true });
  setTimeout(removeLoader, 360); // transitionend 누락 환경 fallback (rAF·transition 미발화 시)
  // 느린 기기 콜드스타트 안전망 — 사용자가 boot 중 화면을 터치(드로어 스와이프 등)하면 즉시 제거.
  // 이 시점이면 app 은 이미 마운트됨(showAuthenticated/showLogin 진입). { once } 로 자동 해제.
  document.addEventListener('touchstart', removeLoader, { once: true, capture: true, passive: true });
  document.addEventListener('pointerdown', removeLoader, { once: true, capture: true, passive: true });
}

// ───────────────────────────────────────────────────────────────────────────
// mocks 통합 (Wave 11.2 패턴 그대로)
// ───────────────────────────────────────────────────────────────────────────

function injectMocks() {
  const parsed = new DOMParser().parseFromString(mocksHtml, 'text/html');

  parsed.head.querySelectorAll('style, link[rel="stylesheet"]').forEach((el) => {
    document.head.appendChild(el.cloneNode(true));
  });

  injectAuthOverlayStyles();

  const scripts = [...parsed.body.querySelectorAll('script')];
  scripts.forEach((s) => s.remove());

  const root = document.querySelector('#app');
  // 기존 로그인 카드는 보존, mocks 본문만 root 안에 추가
  const mocksHost = document.createElement('div');
  mocksHost.id = 'today-mocks-host';
  mocksHost.innerHTML = parsed.body.innerHTML;
  root.appendChild(mocksHost);

  for (const original of scripts) {
    const ns = document.createElement('script');
    if (original.type) ns.type = original.type;
    ns.textContent = original.textContent || '';
    document.body.appendChild(ns);
  }
}

/* global __BUILD_ID__ */
// 빌드 식별자를 사이드바 하단(.sb__settings-wrap)에 주입. vite define 으로 빌드시 치환된
// __BUILD_ID__ 표시 — mock(?raw) 문자열엔 define 치환이 안 돼 여기 JS 에서 DOM 주입한다.
function stampBuildId() {
  const wrap = document.querySelector('#today-mocks-host .sb__settings-wrap');
  if (!wrap || wrap.querySelector('.sb__build')) return;
  const id = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev';
  const tag = document.createElement('div');
  tag.className = 'sb__build';
  tag.textContent = `build ${id}`;
  wrap.appendChild(tag);
}

/**
 * iOS 26 standalone cold start 에서 viewport-fit=cover 가 조용히 비활성화돼
 * layout viewport 가 상태바만큼 짧아지는 회귀(실기기 진단 sc375x812·ih768·sat44) 보정.
 * viewport-fit auto↔cover 토글이 기기 회전과 동급의 기하 재계산을 강제해 뷰포트를
 * 전체 화면(812)으로 복원한다. 뷰포트 밖(768~812)은 fixed 요소가 렌더되지 않아
 * CSS 오프셋 보정(--vp-gap)은 불가함이 실기기에서 확인됨 — 뷰포트 자체를 고치는 게 유일 경로.
 * 비 standalone 은 no-op. 재계산 후에도 결손이 남으면 1회 재시도.
 */
function kickViewportCover() {
  const standalone = window.navigator.standalone === true
    || window.matchMedia('(display-mode: standalone)').matches;
  if (!standalone) return;
  const meta = document.querySelector('meta[name="viewport"]');
  const cover = meta?.getAttribute('content') || '';
  if (!cover.includes('viewport-fit=cover')) return;
  const toggle = () => {
    meta.setAttribute('content', cover.replace('viewport-fit=cover', 'viewport-fit=auto'));
    requestAnimationFrame(() => meta.setAttribute('content', cover));
  };
  toggle();
  // cold start 직후 1회로 안 잡히는 경우 대비 — 결손이 남아 있으면(상태바 폭 이내) 한 번 더
  setTimeout(() => {
    const raw = (window.screen?.height || 0) - window.innerHeight;
    if (raw > 0 && raw <= 80) toggle();
  }, 700);
}

// [임시 진단 2026-07-03 — 실기기 댓글 시트 지오메트리 규명 후 제거]
// 미러링/스샷으로 읽는 한 줄: 빌드 7자 · innerHeight · visualViewport · safe-area-bottom ·
// convo rect top/bottom. cB≠ih 이면 fixed 기준 이탈, ih≠852 면 뷰포트 미커버가 원인.
function mountSheetDiag() {
  if (!window.matchMedia('(max-width: 768px)').matches) return;
  if (document.getElementById('sheetDiag')) return;
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;left:0;bottom:0;width:1px;height:0;padding-bottom:env(safe-area-inset-bottom);visibility:hidden;pointer-events:none;';
  document.body.appendChild(probe);
  const probeTop = document.createElement('div');
  probeTop.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:0;padding-top:env(safe-area-inset-top);visibility:hidden;pointer-events:none;';
  document.body.appendChild(probeTop);
  const el = document.createElement('div');
  el.id = 'sheetDiag';
  el.style.cssText = 'position:fixed;left:0;right:0;bottom:1px;z-index:99999;font:10px ui-monospace,monospace;color:#a49e96;text-align:center;pointer-events:none;';
  document.body.appendChild(el);
  const upd = () => {
    const convo = document.getElementById('convoPanel');
    const r = convo && document.body.dataset.convo === '1' ? convo.getBoundingClientRect() : null;
    const sab = Math.round(probe.getBoundingClientRect().height);
    const sat = Math.round(probeTop.getBoundingClientRect().height);
    const bid = (typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev').slice(0, 7);
    el.textContent = `${bid} sc${screen.width}x${screen.height} iw${window.innerWidth} ih${window.innerHeight} sat${sat} sab${sab}`
      + (r ? ` cT${Math.round(r.top)}` : ' c-');
  };
  upd();
  setInterval(upd, 1000);
}

function syncFromHash() {
  const raw = location.hash.replace(/^#\//, '');
  // 비인증 시엔 #/login 만 허용 → main.js 가 showLogin 호출했을 때만 진입
  if (document.body.dataset.authState !== 'in') return;

  // `#/<kind>` / `#/<kind>/<num>` (본인) / `#/<kind>/<slug>/<num>` (partner) 파싱.
  const parts = raw.split('/');
  const kindRaw = parts[0];
  const kind = ROUTES.includes(kindRaw) ? kindRaw : DEFAULT_ROUTE;
  const hasDeepLink = parts.length >= 2 && WRITING_KINDS.includes(kind);

  // 카테고리 hash 정규화 (kindRaw 미정의 ↔ 빈값) — deep link suffix 보존.
  if (!kindRaw || kindRaw !== kind) {
    const suffix = parts.slice(1).join('/');
    const target = suffix ? `#/${kind}/${suffix}` : `#/${kind}`;
    if (location.hash !== target) {
      location.hash = target;
      return;
    }
  }

  // 1) 카테고리 사이드바 active 동기화 (mocks IIFE 가 list/feed 화면 렌더)
  const sbTarget = document.querySelector(`.sb__item[data-category="${kind}"]`);
  if (sbTarget && !sbTarget.classList.contains('sb__item--active')) {
    sbTarget.click();
  }

  // 2) deep link — entry 명시되면 해당 글 로드 (mount 후 hashchange 경로)
  if (hasDeepLink) {
    loadEntryByDeepLink(location.hash).catch((e) => {
      console.warn('[router] deep link load 실패', e?.message || e);
    });
  }
}

async function loadEntryByDeepLink(hash) {
  if (!_currentUserId) return;
  // mount 가드 — mountEntriesView 가 노출하는 window.todayEntries 없으면 mount 전 호출 (page load 직후).
  // 이 경우 mountEntriesView 의 loadEntryFromDeepLink 가 sync 완료 후 처리 — 여기선 no-op.
  const ns = typeof window !== 'undefined' ? window.todayEntries : null;
  const renderFn = ns?.renderDocFromRow;
  const parseFn = ns?.parseEntryDeepLink;
  if (typeof renderFn !== 'function' || typeof parseFn !== 'function') return;
  const parsed = parseFn(hash, _currentUserId);
  if (!parsed) return;
  const row = await Queries.getEntryByKindNumber(parsed.ownerId, parsed.kind, parsed.num);
  if (!row) {
    // 잘못된 번호 — 카테고리 페이지로 fallback (URL 만 갱신, history replace)
    history.replaceState(null, '', `#/${parsed.kind}`);
    return;
  }
  renderFn(row);
}

// ───────────────────────────────────────────────────────────────────────────
// 로그인 카드 overlay
// ───────────────────────────────────────────────────────────────────────────

function ensureLoginCard() {
  let card = document.querySelector('#today-login-card');
  if (card) return card;

  injectAuthOverlayStyles();

  const configured = Auth.isSupabaseConfigured;
  card = document.createElement('div');
  card.id = 'today-login-card';
  const googleG = `
    <svg class="today-login__g" width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  `;
  card.innerHTML = `
    <div class="today-login__inner">
      <h1 class="today-login__brand">Today</h1>
      <p class="today-login__hint" data-role="hint">${
        configured
          ? '초대받은 계정만 접근할 수 있습니다.'
          : '⚠️ Supabase 설정 누락 — .env.local 의 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 확인'
      }</p>
      <button class="today-login__btn" data-role="signin" ${configured ? '' : 'disabled'}>
        ${googleG}
        <span class="today-login__btn-label">Google 로 시작하기</span>
      </button>
      <p class="today-login__error" data-role="error"></p>
    </div>
  `;
  document.querySelector('#app').appendChild(card);

  card.querySelector('[data-role="signin"]').addEventListener('click', async () => {
    const errEl = card.querySelector('[data-role="error"]');
    errEl.textContent = '';
    const { error } = await Auth.signInWithGoogle();
    if (error) errEl.textContent = error.message;
  });

  // 차단 메시지 (이전 시도) 표시
  const prevError = localStorage.getItem(Auth.AUTH_ERROR_KEY);
  if (prevError) {
    card.querySelector('[data-role="error"]').textContent = prevError;
    localStorage.removeItem(Auth.AUTH_ERROR_KEY);
  }
  return card;
}

function injectAuthOverlayStyles() {
  if (document.querySelector('#today-auth-overlay-styles')) return;
  const style = document.createElement('style');
  style.id = 'today-auth-overlay-styles';
  style.textContent = `
    body[data-auth-state="out"] #today-mocks-host { display: none !important; }
    body[data-auth-state="in"]  #today-login-card { display: none !important; }

    #today-login-card {
      position: fixed; inset: 0;
      display: flex; align-items: center; justify-content: center;
      background: #faf9f5;
      z-index: 9999;
      font-family: 'Pretendard', -apple-system, BlinkMacSystemFont, sans-serif;
    }
    .today-login__inner {
      width: min(360px, 88vw);
      padding: 32px 28px;
      background: #ffffff;
      border: 1px solid #e8e4dc;
      border-radius: 16px;
      box-shadow: 0 6px 24px rgba(20,20,19,0.06);
      text-align: center;
    }
    .today-login__brand {
      font-size: 25px; font-weight: 700; color: #141413;
      margin: 0 0 8px;
    }
    .today-login__hint {
      font-size: 14px; color: #8a8475;
      margin: 0 0 24px; line-height: 1.5;
    }
    .today-login__btn {
      width: 100%; padding: 12px 16px;
      background: #ffffff; color: #1f1f1f;
      border: 1px solid #dadce0; border-radius: 10px;
      font-size: 16px; font-weight: 500;
      cursor: pointer;
      display: inline-flex; align-items: center; justify-content: center;
      gap: 10px;
      transition: background 0.15s, border-color 0.15s;
    }
    .today-login__btn:hover:not(:disabled) { background: #f6f6f6; border-color: #c8c8c8; }
    .today-login__btn:disabled { background: #f1efe9; color: #8a8475; border-color: #e8e4dc; cursor: not-allowed; }
    .today-login__g { flex-shrink: 0; }
    .today-login__btn-label { line-height: 1; }
    .today-login__error {
      margin: 16px 0 0; min-height: 18px;
      font-size: 12px; color: #b44d3b;
    }
  `;
  document.head.appendChild(style);
}

// ───────────────────────────────────────────────────────────────────────────
// Wave 11.2 호환 — 기존 mountApp 호출은 여전히 동작 (mocks 직접 마운트)
// main.js 가 이걸 호출하지 않고 showLogin/showAuthenticated 를 사용함.
// ───────────────────────────────────────────────────────────────────────────

export function mountApp() {
  showAuthenticated();
}
