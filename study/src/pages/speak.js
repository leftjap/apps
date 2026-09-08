/* 말하기 연습 — 배운 표현으로 ChatGPT 음성 대화 프롬프트를 만든다 (2026-09-08 작업지시서 §5~§9).
 * 종전엔 세션 요약(summaryV2)에서만 나와 화면을 닫으면 다시 만들 수 없었다. 여기서는 저장된 프롬프트 없이
 * 매번 Dexie 에서 표현을 다시 고른다(services/speakPicks.js). 영어 전용. 마운트 구조는 listen.js 와 같다. */
import { h } from '../components/d1/dom.js';
import { V_VARS, VI, vIcon, v2Style, ensureV2Fonts } from '../components/v2/atoms.js';
import { loadSpeakItems, SPEAK_SCOPES, SPEAK_MAX } from '../services/speakPicks.js';
import { buildVoicePrompt } from '../services/voicePrompt.js';
import { localISODate } from '../utils/today.js';

export const SCOPE_LABELS = { today: '오늘 배운 표현', hard: '최근 어려웠던 표현', random: '랜덤 복습' };
const EMPTY_TEXT = { today: '오늘 학습한 표현이 없어요', hard: '최근 어려웠다고 판정한 표현이 없어요', random: '복습 카드가 없어요' };
const getTodayISO = () => window.studyDay?.TODAY_ISO || localISODate();
function getLang() { try { return sessionStorage.getItem('studyLang') === 'ja' ? 'ja' : 'en'; } catch { return 'en'; } }

const CSS = `
.sp{width:100%;min-height:100vh;min-height:100dvh;background:var(--bg);color:var(--ink);font-family:Pretendard,sans-serif;word-break:keep-all;${V_VARS}}
.sp *{box-sizing:border-box;margin:0}
.sp button{font-family:inherit;cursor:pointer}
.sp-top{height:60px;border-bottom:1px solid var(--line);display:flex;align-items:center}
.sp-top-in{width:100%;max-width:560px;margin:0 auto;padding:0 20px;display:flex;align-items:center;justify-content:space-between}
.sp-home{display:inline-flex;align-items:center;gap:8px;font-size:13px;font-weight:600;color:var(--mut);background:none;border:0}
.sp-wrap{width:100%;max-width:560px;margin:0 auto;padding:36px 20px 56px;display:flex;flex-direction:column;gap:16px}
.sp-h1{font-family:Outfit,Pretendard,sans-serif;font-size:26px;font-weight:700;letter-spacing:-0.02em}
.sp-sub{font-size:14px;color:var(--mut);line-height:1.5}
.sp-scopes{display:flex;gap:8px;flex-wrap:wrap}
.sp-scope{font-size:13px;font-weight:700;padding:9px 14px;border-radius:999px;border:1.5px solid var(--line);background:transparent;color:var(--ink)}
.sp-scope.on{background:var(--teal);border-color:var(--teal);color:var(--card)}
.sp-list{display:flex;flex-direction:column;gap:6px}
.sp-item{display:grid;grid-template-columns:22px 1fr;gap:10px;align-items:start;padding:10px 12px;border-radius:12px;background:var(--card);border:1px solid var(--line);cursor:pointer}
.sp-item input{width:18px;height:18px;margin-top:2px;accent-color:var(--teal)}
.sp-item .ex{display:block;font-size:16px;font-weight:700;line-height:1.35}
.sp-item .si{display:block;font-size:12.5px;color:var(--mut);margin-top:2px}
.sp-empty{font-size:14px;color:var(--mut);padding:18px 0}
.sp-steps{font-size:13px;color:var(--mut);line-height:1.6;padding:12px 14px;border-radius:12px;background:var(--teal-soft)}
.sp-ta{width:100%;padding:12px 14px;border:1px solid var(--line);border-radius:12px;background:var(--card);color:var(--ink);font-size:12.5px;line-height:1.5;resize:vertical;font-family:inherit}
.sp-copy{font-size:15px;font-weight:800;padding:14px 18px;border-radius:12px;border:0;background:var(--teal);color:var(--card)}
.sp-copy:disabled{opacity:.45;cursor:default}`;

export function mountSpeak(host) {
  ensureV2Fonts();
  host.innerHTML = '';
  const lang = getLang();
  const todayISO = getTodayISO();
  let scope = 'today';
  let items = [];
  const checked = new Set();

  const scopeBtns = SPEAK_SCOPES.map((s) => h('button', { class: 'sp-scope', type: 'button', 'data-scope': s, onClick: () => load(s, false) }, SCOPE_LABELS[s]));
  const listEl = h('div', { class: 'sp-list', 'data-role': 'list' });
  const ta = h('textarea', { class: 'sp-ta', readonly: 'readonly', rows: '10' });
  const COPY_LABEL = '프롬프트 복사';
  const copyBtn = h('button', { class: 'sp-copy', type: 'button', 'data-role': 'copy' }, COPY_LABEL);
  copyBtn.addEventListener('click', async () => {
    const text = ta.value;
    try { await navigator.clipboard.writeText(text); }
    catch { try { ta.focus(); ta.select(); document.execCommand('copy'); } catch { /* noop */ } }
    copyBtn.textContent = '복사됨 ✓';
    setTimeout(() => { copyBtn.textContent = COPY_LABEL; }, 1500);
  });

  const paintScopes = () => scopeBtns.forEach((b) => b.classList.toggle('on', b.getAttribute('data-scope') === scope));
  const paintPrompt = () => {
    const sel = items.filter((it) => checked.has(it.id));
    ta.value = buildVoicePrompt(sel);
    copyBtn.disabled = sel.length === 0;
  };
  const paintList = () => {
    listEl.replaceChildren(...(items.length ? items.map((it) => {
      const box = h('input', { type: 'checkbox', checked: checked.has(it.id) });
      box.addEventListener('change', () => { if (box.checked) checked.add(it.id); else checked.delete(it.id); paintPrompt(); });
      return h('label', { class: 'sp-item', 'data-role': 'item' }, box,
        h('span', {}, h('span', { class: 'ex' }, it.expr), it.situation ? h('span', { class: 'si' }, it.situation) : null));
    }) : [h('div', { class: 'sp-empty' }, `${EMPTY_TEXT[scope]} · 다른 범위를 골라 보세요`)]));
    paintPrompt();
  };

  /* fallback=true(진입 시): 오늘 → 어려웠던 → 랜덤 순으로 비어 있지 않은 첫 범위를 연다. */
  async function load(s, fallback) {
    scope = s; paintScopes();
    let got = [];
    try { got = await loadSpeakItems(window.studyDB, lang, s, todayISO); } catch (e) { console.error('[speak] load', e); got = []; }
    if (!got.length && fallback) {
      const next = SPEAK_SCOPES[SPEAK_SCOPES.indexOf(s) + 1];
      if (next) return load(next, true);
    }
    items = got; checked.clear(); items.forEach((it) => checked.add(it.id));
    paintList();
  }

  const root = h('div', { class: 'sp' }, v2Style(CSS),
    h('div', { class: 'sp-top' }, h('div', { class: 'sp-top-in' },
      h('button', { class: 'sp-home', type: 'button', onClick: () => { window.location.hash = '#/home'; } }, vIcon(VI.HOME, { size: 15 }), '홈으로'),
      h('span', { class: 'sp-sub' }, '영어'))),
    h('div', { class: 'sp-wrap' },
      h('h1', { class: 'sp-h1' }, '말하기 연습'),
      h('div', { class: 'sp-sub' }, `배운 표현 최대 ${SPEAK_MAX}개로 ChatGPT 음성 대화 프롬프트를 만듭니다. 상대가 표현을 먼저 말하지 않고, 비슷하지만 다른 상황을 만들어 그 표현이 필요해지게 이끕니다.`),
      h('div', { class: 'sp-scopes' }, scopeBtns),
      listEl,
      h('div', { class: 'sp-steps' }, '1 복사 → 2 ChatGPT 새 대화에 붙여 넣어 보내기 → 3 같은 대화에서 음성 모드 시작 → 4 약 10분 대화 → 5 끝나면 못 한 표현을 문장 모아보기에서 확인'),
      ta, copyBtn));
  host.appendChild(root);
  load('today', true);
}
