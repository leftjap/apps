/* 로그인 — 데스크톱/모바일 C 파이널 v2 (작업지시서 §8 LoginV2)
 * 단일 폼 카드: Google OAuth + 허용 계정 안내 + 동기화 고지.
 * OAuth/에러 상태 로직은 기존 mocks/login.html 인라인 스크립트에서 포팅 (window.studyAuth).
 */
import { h } from '../components/d1/dom.js';
import { V_VARS, v2Style, ensureV2Fonts } from '../components/v2/atoms.js';

const VL_CSS = `
.vl{width:100%;min-height:100vh;min-height:100dvh;background:var(--bg);color:var(--ink);font-family:Pretendard,sans-serif;display:grid;place-items:center;word-break:keep-all;padding:24px;${V_VARS}}
.vl,.vl *{box-sizing:border-box;margin:0}
.vl-card{width:100%;max-width:380px;background:var(--card);border:1px solid var(--line);border-radius:22px;padding:44px 40px;text-align:center;
  box-shadow:0 1px 0 rgba(25,35,32,.02),0 18px 40px -28px rgba(25,35,32,.25);animation:v-settle .6s both}
.vl-logo{font-family:Outfit;font-size:30px;font-weight:700;letter-spacing:-0.02em;color:var(--teal-deep)}
.vl-copy{font-size:14px;color:var(--mut);margin-top:12px;line-height:1.6}
.vl-copy b{color:var(--ink)}
.vl-err{display:none;margin-top:20px;background:var(--coral-soft);color:var(--coral-deep);border-radius:12px;padding:12px 16px;font-size:12.5px;line-height:1.6}
.vl-err b{font-weight:800}
.vl.state-error .vl-err{display:block}
.vl-btn{width:100%;margin-top:24px;display:inline-flex;align-items:center;justify-content:center;gap:10px;background:#fff;border:1.5px solid var(--line);border-radius:13px;padding:15px 0;font:inherit;font-size:14.5px;font-weight:700;cursor:pointer;color:var(--ink);position:relative}
.vl-btn[disabled]{cursor:wait;color:var(--faint)}
.vl-btn .g{width:20px;height:20px;flex:0 0 auto}
.vl.state-loading .vl-btn .g{display:none}
.vl-spin{display:none;width:18px;height:18px;border:2.5px solid var(--line);border-top-color:var(--teal);border-radius:50%;animation:vl-spin .7s linear infinite}
.vl.state-loading .vl-spin{display:inline-block}
@keyframes vl-spin{to{transform:rotate(360deg)}}
.vl-cap{font-size:11.5px;color:var(--faint);margin-top:14px;line-height:1.5}
.vl-foot{font-size:11.5px;color:var(--faint);margin-top:30px;font-family:Outfit;letter-spacing:.04em}
`;

const G_LOGO = '<svg class="g" viewBox="0 0 48 48" aria-hidden="true"><path fill="#4285F4" d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"/><path fill="#34A853" d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"/><path fill="#FBBC05" d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34A21.97 21.97 0 0 0 2 24c0 3.55.85 6.91 2.34 9.88l7.35-5.7z"/><path fill="#EA4335" d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"/></svg>';

export function mountLogin(host) {
  ensureV2Fonts();
  host.innerHTML = '';
  let state = 'default'; // default | loading | error

  const btnLabel = h('span', {}, 'Google로 계속하기');
  const btn = h('button', { class: 'vl-btn', id: 'btnGoogle', type: 'button' });
  btn.innerHTML = G_LOGO + '<span class="vl-spin"></span>';
  btn.appendChild(btnLabel);

  const root = h('div', { class: 'vl state-default' }, v2Style(VL_CSS),
    h('div', { class: 'vl-card' },
      h('div', { class: 'vl-logo' }, 'Study'),
      h('div', { class: 'vl-copy', html: '하루 <b>19분</b>, 말하면서 배우는<br/>영어 · 일본어 · 수학' }),
      h('div', { class: 'vl-err', id: 'errBanner', html: '허용되지 않은 계정입니다.<br/><b>leftjap@gmail.com</b> 또는 <b>soyoun312@gmail.com</b> 으로 로그인하세요.' }),
      btn,
      h('div', { class: 'vl-cap', html: '허용된 계정만 로그인할 수 있어요.<br/>로그인하면 학습 기록이 자동으로 동기화됩니다.' }),
      h('div', { class: 'vl-foot' }, 'Study · v0.1.0'),
    ),
  );
  host.appendChild(root);

  const LABELS = { default: 'Google로 계속하기', loading: '인증 중…', error: 'Google로 다시 시도' };
  const setState = (s) => {
    state = s;
    root.className = 'vl state-' + s;
    btnLabel.textContent = LABELS[s] || LABELS.default;
    btn.toggleAttribute('disabled', s === 'loading');
  };

  // 직전 인증 시도의 에러 마커 → error 상태 (auth.js/app.js 가 set).
  try {
    const key = window.studyAuth ? window.studyAuth.AUTH_ERROR_KEY : 'studyAuthError';
    if (localStorage.getItem(key)) { setState('error'); localStorage.removeItem(key); }
  } catch { /* localStorage 차단 환경 무시 */ }

  btn.addEventListener('click', async () => {
    if (state === 'loading') return;
    setState('loading');
    if (window.studyAuth) {
      if (!window.studyAuth.isSupabaseConfigured) {
        console.error('[login] Supabase 미설정 — docs/oauth-setup.md 참고');
        setState('error');
        return;
      }
      try {
        const { error } = await window.studyAuth.signInWithGoogle();
        if (error) { console.error('[login] OAuth 실패', error); setState('error'); }
      } catch (e) { console.error('[login] signInWithGoogle 예외', e); setState('error'); }
      return;
    }
    // mocks 단독 (window.studyAuth 미존재) — 데모 흐름.
    setTimeout(() => { window.location.hash = '#/home'; }, 700);
  });

  return () => { host.innerHTML = ''; };
}
