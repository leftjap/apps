/**
 * book SPA — hash 라우터 + 인증 가드 + 로그인 카드 (today app.js 패턴 답습 + v14 app.jsx 라우터 이식).
 *
 * 흐름:
 *  - main.js 가 auth 세션 확인 후 showAuthenticated(user) / showLogin() 호출
 *  - 화면은 registerScreen(name, fn) 으로 feature 가 주입 → 라우터가 hash 변화에 dispatch
 *  - 미등록 라우트는 placeholder (Wave 진행 중)
 *
 * 라우트 (작업지시서 §4.1):
 *   #/                      feed
 *   #/stats                 stats
 *   #/book/:ref             book-detail
 *   #/thread/:ref/:quoteId? thread
 *   #/word/:w               word
 *   #/day/:d                day
 *   #/author/:name          author
 *   #/all/:kind             lists (books|authors|pubs|pins)
 *   #/add #/edit/:id #/delete/:id  add-edit
 *   #/login                 로그인 (auth 게이트)
 */
import { Auth } from './services/auth.js';

let _user = null;
let _hashBound = false;
const _screens = new Map();
let _actions = {}; // add-edit.js 가 openAdd/openEdit/openDelete 주입 (setActions)
let _cleanupCurrent = null; // 떠나는 화면의 정리(realtime 구독 해제 등) — 다음 mount 직전 호출

/** 모달 액션 주입 (features/add-edit.js 가 호출). ctx 에 노출됨. */
export function setActions(actions) {
  _actions = { ...(actions || {}) };
}

/** 현재 라우트 재렌더 (저장/삭제 후 변경 반영). */
export function refresh() {
  mountCurrent();
}

// ───────────────────────────────────────────────────────────────────────────
// public API (main.js / feature 가 호출)
// ───────────────────────────────────────────────────────────────────────────

/** main.js 가 인증 완료 후 호출 — 화면이 owner_id 필요. user 객체 또는 id 문자열 허용. */
export function setRouterUser(user) {
  _user = user || null;
}

/** feature 화면 등록. renderFn(host, params, ctx). 현재 라우트면 즉시 remount. */
export function registerScreen(name, renderFn) {
  _screens.set(name, renderFn);
  if (document.body.dataset.authState === 'in' && parseHash().name === name) {
    mountCurrent();
  }
}

/** hash 네비게이션 헬퍼. '#/...' 또는 '/...' 모두 허용. */
export function navigate(path) {
  const target = path.startsWith('#') ? path : '#' + (path.startsWith('/') ? path : '/' + path);
  if (location.hash !== target) location.hash = target;
  else mountCurrent(); // 동일 hash 재클릭 시에도 재마운트
}

export function showLogin() {
  document.body.dataset.authState = 'out';
  ensureLoginCard();
  if (location.hash !== '#/login') location.hash = '#/login';
  hideInitialLoadingScreen();
}

export function showAuthenticated() {
  document.body.dataset.authState = 'in';
  ensureHost();
  if (!_hashBound) {
    window.addEventListener('hashchange', mountCurrent);
    _hashBound = true;
  }
  // 인증 직후 hash 정규화 — #/login 또는 빈 hash → feed.
  const { name } = parseHash();
  if (name === 'login' || !location.hash || location.hash === '#/') {
    if (location.hash !== '#/') location.hash = '#/';
    else mountCurrent();
  } else {
    mountCurrent();
  }
  hideInitialLoadingScreen();
}

// ───────────────────────────────────────────────────────────────────────────
// 라우터 내부
// ───────────────────────────────────────────────────────────────────────────

function ensureHost() {
  let host = document.querySelector('#book-app');
  if (host) return host;
  injectAuthOverlayStyles();
  host = document.createElement('div');
  host.id = 'book-app';
  host.className = 'app-root'; // book.css 셸 (풀뷰포트 + 스크롤바 숨김)
  document.querySelector('#app').appendChild(host);
  return host;
}

/** 현재 hash → { name, params }. */
export function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const parts = raw.split('/').filter((s) => s.length > 0);
  if (parts.length === 0) return { name: 'feed', params: {} };
  const head = parts[0];
  const dec = (s) => { try { return decodeURIComponent(s); } catch { return s; } };
  switch (head) {
    case 'login': return { name: 'login', params: {} };
    case 'stats': return { name: 'stats', params: {} };
    case 'library': return { name: 'library', params: { ref: dec(parts[1] || '') } };
    case 'book': return { name: 'book', params: { ref: dec(parts[1] || ''), quoteId: (parts[2] && parts[2] !== '_') ? dec(parts[2]) : null, term: parts[3] ? dec(parts[3]) : null } };
    case 'thread': return { name: 'thread', params: { ref: dec(parts[1] || ''), quoteId: parts[2] ? dec(parts[2]) : null } };
    case 'word': return { name: 'word', params: { w: dec(parts[1] || '') } };
    case 'day': return { name: 'day', params: { d: dec(parts[1] || '') } };
    case 'author': return { name: 'author', params: { name: dec(parts[1] || '') } };
    case 'all': return { name: 'all', params: { kind: parts[1] || 'books' } };
    case 'add': return { name: 'add', params: {} };
    case 'edit': return { name: 'edit', params: { id: dec(parts[1] || '') } };
    case 'delete': return { name: 'delete', params: { id: dec(parts[1] || '') } };
    default: return { name: 'feed', params: {} };
  }
}

function mountCurrent() {
  if (document.body.dataset.authState !== 'in') return;
  // 떠나는 화면 정리 — realtime 구독 등 전역 리스너 누수 방지. (thread 가 등록한 realtime
  // 리스너가 살아남아, library 를 보는 중 quote/comment 이벤트에 화면을 통째 교체하던 버그 차단.)
  if (_cleanupCurrent) {
    try { _cleanupCurrent(); } catch (e) { console.warn('[router] 화면 정리 실패', e?.message || e); }
    _cleanupCurrent = null;
  }
  const { name, params } = parseHash();
  const host = ensureHost();
  const render = _screens.get(name);
  const ctx = { user: _user, navigate, parseHash, refresh: mountCurrent, onCleanup: (fn) => { _cleanupCurrent = fn; } };
  // 모달 액션 — ctx 바인딩 (opener 가 user/refresh 접근).
  ctx.openAdd = (opts) => _actions.openAdd && _actions.openAdd(ctx, opts);
  ctx.openEdit = (id) => _actions.openEdit && _actions.openEdit(ctx, id);
  ctx.openDelete = (id) => _actions.openDelete && _actions.openDelete(ctx, id);
  ctx.openDeleteBook = (ref, quoteIds) => _actions.openDeleteBook && _actions.openDeleteBook(ctx, ref, quoteIds);
  host.innerHTML = '';
  if (typeof render === 'function') {
    try {
      render(host, params, ctx);
    } catch (e) {
      console.error('[router] screen render 실패', name, e);
      host.appendChild(placeholderEl(name, e?.message || String(e)));
    }
  } else {
    host.appendChild(placeholderEl(name));
  }
  // 화면 전환 시 스크롤 맨 위로 (v14 app.jsx 동작).
  const scroller = host.querySelector('main') || host;
  if (scroller && typeof scroller.scrollTo === 'function') scroller.scrollTo(0, 0);
  else window.scrollTo(0, 0);
}

function placeholderEl(name, err) {
  const el = document.createElement('div');
  el.style.cssText = 'min-height:100dvh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;font-family:var(--sans,system-ui);color:#8a877d;text-align:center;padding:40px';
  const mark = document.createElement('div');
  mark.textContent = 'b';
  mark.style.cssText = 'width:44px;height:44px;border-radius:12px;background:#15140f;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:24px;letter-spacing:-.04em';
  const label = document.createElement('div');
  label.style.cssText = 'font-size:14px;font-weight:600;color:#4a473f';
  label.textContent = err ? `화면 오류: ${name}` : `준비 중 — ${name}`;
  const sub = document.createElement('div');
  sub.style.cssText = 'font-size:12px;color:#b8b5aa';
  sub.textContent = err || `라우트 "${name}" 는 다음 Wave 에서 구현됩니다.`;
  el.append(mark, label, sub);
  return el;
}

// 초기 로딩 화면 (index.html #loadingScreen) 숨김.
function hideInitialLoadingScreen() {
  const el = typeof document !== 'undefined' && document.getElementById('loadingScreen');
  if (!el || el.classList.contains('hidden')) return;
  // 직접 토글 — requestAnimationFrame 콜백은 백그라운드(visibility hidden) 탭에서 멈춰
  // 로딩 화면이 안 사라지는 버그가 있었다. classList 변경은 탭 가시성과 무관하게 즉시 적용된다.
  el.classList.add('hidden');
}

// ───────────────────────────────────────────────────────────────────────────
// 로그인 카드 overlay (book 브랜드)
// ───────────────────────────────────────────────────────────────────────────

function ensureLoginCard() {
  let card = document.querySelector('#book-login-card');
  if (card) return card;

  injectAuthOverlayStyles();

  const configured = Auth.isSupabaseConfigured;
  card = document.createElement('div');
  card.id = 'book-login-card';
  const googleG = `
    <svg class="book-login__g" width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  `;
  card.innerHTML = `
    <div class="book-login__inner">
      <div class="book-login__mark">b</div>
      <h1 class="book-login__brand">book</h1>
      <p class="book-login__hint" data-role="hint">${
        configured
          ? '초대받은 계정만 접근할 수 있습니다.'
          : '⚠️ Supabase 설정 누락 — .env.local 의 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 확인'
      }</p>
      <button class="book-login__btn" data-role="signin" ${configured ? '' : 'disabled'}>
        ${googleG}
        <span class="book-login__btn-label">Google 로 시작하기</span>
      </button>
      <p class="book-login__error" data-role="error"></p>
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
  if (document.querySelector('#book-auth-overlay-styles')) return;
  const style = document.createElement('style');
  style.id = 'book-auth-overlay-styles';
  style.textContent = `
    body[data-auth-state="out"] #book-app { display: none !important; }
    body[data-auth-state="in"]  #book-login-card { display: none !important; }

    #book-login-card {
      position: fixed; inset: 0;
      display: flex; align-items: center; justify-content: center;
      background: #ffffff;
      z-index: 9999;
      font-family: 'Pretendard', -apple-system, BlinkMacSystemFont, sans-serif;
    }
    .book-login__inner {
      width: min(360px, 88vw);
      padding: 36px 28px;
      background: #ffffff;
      border: 1px solid #ececea;
      border-radius: 16px;
      box-shadow: 0 6px 24px rgba(20,18,14,0.06);
      text-align: center;
    }
    .book-login__mark {
      width: 44px; height: 44px; margin: 0 auto 14px;
      border-radius: 12px; background: #15140f; color: #fff;
      display: flex; align-items: center; justify-content: center;
      font-weight: 700; font-size: 24px; letter-spacing: -.04em;
    }
    .book-login__brand {
      font-size: 22px; font-weight: 700; color: #15140f;
      margin: 0 0 8px; letter-spacing: -.022em;
    }
    .book-login__hint {
      font-size: 13px; color: #8a877d;
      margin: 0 0 24px; line-height: 1.5;
    }
    .book-login__btn {
      width: 100%; padding: 12px 16px;
      background: #ffffff; color: #1f1f1f;
      border: 1px solid #dadce0; border-radius: 10px;
      font-size: 15px; font-weight: 500;
      cursor: pointer;
      display: inline-flex; align-items: center; justify-content: center;
      gap: 10px;
      transition: background 0.15s, border-color 0.15s;
    }
    .book-login__btn:hover:not(:disabled) { background: #f6f6f6; border-color: #c8c8c8; }
    .book-login__btn:disabled { background: #f4f2ec; color: #8a877d; border-color: #ececea; cursor: not-allowed; }
    .book-login__g { flex-shrink: 0; }
    .book-login__btn-label { line-height: 1; }
    .book-login__error {
      margin: 16px 0 0; min-height: 18px;
      font-size: 12px; color: #c2553a;
    }
  `;
  document.head.appendChild(style);
}
