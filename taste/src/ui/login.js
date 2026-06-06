// taste 로그인 카드 — today app.js ensureLoginCard 패턴 축약. 브랜드 taste + 코랄 점.
import { Auth } from '../services/auth.js';

export function hideLoadingScreen() {
  const node = document.getElementById('loadingScreen');
  if (node && !node.classList.contains('hidden')) requestAnimationFrame(() => node.classList.add('hidden'));
}

const GOOGLE_G = `
  <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style="flex-shrink:0">
    <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
    <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
    <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
    <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
  </svg>`;

export function ensureLoginCard() {
  let card = document.querySelector('#taste-login-card');
  if (card) return card;
  injectAuthOverlayStyles();
  const configured = Auth.isSupabaseConfigured;
  card = document.createElement('div');
  card.id = 'taste-login-card';
  card.innerHTML = `
    <div class="taste-login__inner">
      <h1 class="taste-login__brand">taste<span class="taste-login__dot"></span></h1>
      <p class="taste-login__hint">${
        configured ? '초대받은 계정만 접근할 수 있습니다.'
          : '⚠️ Supabase 설정 누락 — .env.local 의 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 확인'
      }</p>
      <button class="taste-login__btn" data-role="signin" ${configured ? '' : 'disabled'}>
        ${GOOGLE_G}<span>Google 로 시작하기</span>
      </button>
      <p class="taste-login__error" data-role="error"></p>
    </div>`;
  document.querySelector('#app').appendChild(card);
  card.querySelector('[data-role="signin"]').addEventListener('click', async () => {
    const errEl = card.querySelector('[data-role="error"]');
    errEl.textContent = '';
    const { error } = await Auth.signInWithGoogle();
    if (error) errEl.textContent = error.message;
  });
  const prevError = localStorage.getItem(Auth.AUTH_ERROR_KEY);
  if (prevError) { card.querySelector('[data-role="error"]').textContent = prevError; localStorage.removeItem(Auth.AUTH_ERROR_KEY); }
  return card;
}

function injectAuthOverlayStyles() {
  if (document.querySelector('#taste-auth-overlay-styles')) return;
  const style = document.createElement('style');
  style.id = 'taste-auth-overlay-styles';
  style.textContent = `
    body[data-auth-state="in"] #taste-login-card { display: none !important; }
    #taste-login-card { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; background: var(--paper, #f6f4ee); z-index: 9999; font-family: 'Pretendard', system-ui, sans-serif; }
    .taste-login__inner { width: min(360px, 88vw); padding: 36px 30px; background: var(--bg, #fff); border: 1px solid var(--line, #ececea); border-radius: 18px; box-shadow: var(--shadow-float, 0 24px 48px -24px rgba(20,18,14,.18)); text-align: center; }
    .taste-login__brand { font-size: 30px; font-weight: 700; letter-spacing: -.045em; color: var(--ink-1, #15140f); margin: 0 0 10px; display: inline-flex; align-items: flex-end; justify-content: center; gap: 3px; }
    .taste-login__dot { width: 7px; height: 7px; border-radius: 999px; background: var(--accent, #d97757); margin-bottom: 7px; }
    .taste-login__hint { font-size: 14px; color: var(--ink-3, #8a877d); margin: 0 0 24px; line-height: 1.5; word-break: keep-all; }
    .taste-login__btn { width: 100%; padding: 12px 16px; background: var(--bg, #fff); color: var(--ink-1, #1f1f1f); border: 1px solid #dadce0; border-radius: 999px; font-size: 15px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 10px; transition: background .15s, border-color .15s; }
    .taste-login__btn:hover:not(:disabled) { background: var(--hover, #f4f2ec); border-color: var(--ink-4, #b8b5aa); }
    .taste-login__btn:disabled { background: var(--paper-2, #efece4); color: var(--ink-3, #8a877d); cursor: not-allowed; }
    .taste-login__error { margin: 16px 0 0; min-height: 18px; font-size: 12px; color: var(--danger, #b44d3b); }
  `;
  document.head.appendChild(style);
}
