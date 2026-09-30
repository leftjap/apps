/* 말하기 연습 — 배운 표현으로 ChatGPT 음성 대화 프롬프트를 만든다 (2026-09-08 작업지시서 §5~§9).
 * 종전엔 세션 요약(summaryV2)에서만 나와 화면을 닫으면 다시 만들 수 없었다. 여기서는 저장된 프롬프트 없이
 * 매번 Dexie 에서 표현을 다시 고른다(services/speakPicks.js). 영어 전용. 마운트 구조는 listen.js 와 같다. */
import { h } from '../components/d1/dom.js';
import { V_VARS, VI, vIcon, v2Style, ensureV2Fonts } from '../components/v2/atoms.js';
import { loadSpeakItems, loadSpeakSessions, SPEAK_SCOPES, SPEAK_MAX, HARD_WINDOW_DAYS } from '../services/speakPicks.js';
import { buildVoicePrompt } from '../services/voicePrompt.js';
import { localISODate } from '../utils/today.js';

export const SCOPE_LABELS = { session: '세션', hard: '최근 어려웠던 표현', random: '랜덤 복습' };
const EMPTY_TEXT = { session: '공부한 세션이 없어요', hard: '최근 어려웠다고 판정한 표현이 없어요', random: '복습 카드가 없어요' };
/* PC 범위 설명 카드 (시안 §2-4) — speakPicks 의 pickHard·pickRandom 규칙을 그대로 옮긴 문장. */
const SCOPE_NOTE = {
  hard: `최근 ${HARD_WINDOW_DAYS}일 안에 어려움으로 판정했거나 마지막 판정이 어려움인 표현을, 최근 순으로 최대 ${SPEAK_MAX}개 모읍니다.`,
  random: `복습 카드에서 무작위로 최대 ${SPEAK_MAX}개를 뽑습니다. 탭을 다시 누르면 새로 뽑습니다.`,
};
const dateLabel = (iso) => { const [, m, d] = iso.split('-'); return `${Number(m)}월 ${Number(d)}일`; };
/* 세션 목록 항목 — "9월 20일 · 첫 문장 외 3". 2026-09-25 부터 오늘 세션뿐 아니라 지난 세션도 고른다. */
const sessionLabel = (s) => {
  const first = s.items[0];
  return `${dateLabel(s.date)} · ${first.sentence || first.expr}${s.items.length > 1 ? ` 외 ${s.items.length - 1}` : ''}`;
};
/* 카드 머리 상황 — voicePrompt.js background() 와 같은 규칙(빈 값·중복 빼고 공백으로 잇기). 그 함수는 export 되어 있지 않다. */
const situationOf = (list) => [...new Set(list.map((it) => it.situation).filter(Boolean))].join(' ');
/* 문장이 표현과 같으면(끝 문장부호만 다른 것 포함) 문장 줄을 두지 않는다 — voicePrompt.js patternBlock() 의 named 판정과 같은 규칙. */
const sentenceShown = (it) => Boolean(it.sentence) && it.expr !== it.sentence && it.expr !== it.sentence.replace(/[.?!]$/, '');
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
.sp-sess{width:100%;padding:11px 12px;border:1px solid var(--line);border-radius:12px;background:var(--card);color:var(--ink);font-size:16px;font-family:inherit}
.sp-list{display:flex;flex-direction:column;gap:6px}
.sp-item{display:grid;grid-template-columns:22px 1fr;gap:10px;align-items:start;padding:10px 12px;border-radius:12px;background:var(--card);border:1px solid var(--line);cursor:pointer}
.sp-item input{width:18px;height:18px;margin-top:2px;accent-color:var(--teal)}
.sp-item .ex{display:block;font-size:16px;font-weight:700;line-height:1.35}
.sp-item .si{display:block;font-size:12.5px;color:var(--mut);margin-top:2px}
.sp-empty{font-size:14px;color:var(--mut);padding:18px 0}
.sp-steps{font-size:13px;color:var(--mut);line-height:1.6;padding:12px 14px;border-radius:12px;background:var(--teal-soft)}
.sp-ta{width:100%;padding:12px 14px;border:1px solid var(--line);border-radius:12px;background:var(--card);color:var(--ink);font-size:12.5px;line-height:1.5;resize:vertical;font-family:inherit}
.sp-copy{font-size:15px;font-weight:800;padding:14px 18px;border-radius:12px;border:0;background:var(--teal);color:var(--card)}
.sp-copy:disabled{opacity:.45;cursor:default}
/* PC(1024~) 배치 — 시안 design-ref/design_handoff_pc_listen_speak §2. 1023 이하에서는 묶음 상자를 없애(display:contents)
 * 자식들이 현행처럼 .sp-wrap 의 한 줄 흐름에 놓이게 하고, PC 에만 있는 요소는 숨긴다. */
.sp-head,.sp-main,.sp-side,.sp-body,.sp-card,.sp-pcard{display:contents}
.sp-sesslist,.sp-note,.sp-chead,.sp-phead,.sp-item .se,.sp-item .ko{display:none}
@media (min-width:1024px){
.sp-top-in{max-width:1064px}
.sp-wrap{max-width:1064px;padding:26px 20px 56px;gap:22px}
.sp-head{display:flex;flex-direction:column;gap:10px}
.sp-head .sp-sub{max-width:720px}
.sp-main{display:grid;grid-template-columns:356px minmax(0,1fr);gap:26px;align-items:start}
.sp-side,.sp-body{display:flex;flex-direction:column;gap:14px;min-width:0}
.sp-scopes{align-self:flex-start;flex-wrap:nowrap;gap:4px;background:#efebde;border-radius:11px;padding:4px}
.sp-scope{height:36px;padding:0 18px;border:0;border-radius:8px;color:var(--mut);white-space:nowrap}
.sp-scope.on{background:var(--card);color:var(--teal-deep);box-shadow:0 2px 6px -3px rgba(25,35,32,.22)}
.sp-sess{display:none}
.sp-sesslist:not([hidden]),.sp-note:not([hidden]),.sp-card,.sp-pcard{background:var(--card);border:1px solid var(--line);border-radius:20px;box-shadow:0 1px 0 rgba(25,35,32,.02),0 10px 22px -18px rgba(25,35,32,.12)}
.sp-lab{font-family:Outfit,Pretendard,sans-serif;font-size:10.5px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:var(--faint)}
.sp-sesslist:not([hidden]){display:flex;flex-direction:column;gap:4px;padding:14px 10px 10px}
.sp-shead{display:flex;align-items:baseline;justify-content:space-between;padding:0 10px 8px}
.sp-shead .cnt{font-family:Outfit,sans-serif;font-size:12px;font-weight:600;color:var(--faint)}
.sp-srow{display:flex;align-items:flex-start;gap:8px;padding:4px 8px 4px 4px;border-radius:14px}
.sp-srow.on{background:var(--teal-soft)}
.sp-srow:not(.on):hover{background:#f8f6ee}
.sp-spick{flex:1;min-width:0;display:flex;flex-direction:column;gap:4px;padding:9px 10px;border:0;background:transparent;text-align:left;color:inherit;border-radius:10px}
.sp-spick .meta{font-size:12px;font-weight:600;color:var(--faint)}
.sp-spick .first{width:100%;font-size:14.5px;font-weight:700;line-height:1.4;color:var(--ink);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.sp-srow.on .meta,.sp-srow.on .first{color:var(--teal-deep)}
.sp-scopy{flex:0 0 auto;margin-top:9px;height:32px;min-width:58px;padding:0 12px;font-size:12.5px;font-weight:700;border-radius:999px;border:1.5px solid var(--line);background:var(--card);color:var(--mut);white-space:nowrap}
.sp-srow.on .sp-scopy{border-color:var(--teal);color:var(--teal-deep)}
.sp-note:not([hidden]){display:block;padding:18px 20px;font-size:13px;line-height:1.6;color:var(--mut)}
.sp-card{display:flex;flex-direction:column;gap:14px;padding:22px 26px 24px}
.sp-chead{display:flex;flex-direction:column;gap:6px}
.sp-ctitle{font-family:Outfit,Pretendard,sans-serif;font-size:20px;font-weight:700;letter-spacing:-0.02em}
.sp-csit{font-size:13px;line-height:1.5;color:var(--mut)}
.sp-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.sp-item{padding:12px 14px;background:#f8f6ee;border-color:#f1ede0}
.sp-item .tx{display:flex;flex-direction:column;gap:3px;min-width:0}
.sp-item .se{display:block;font-size:13.5px;line-height:1.4}
.sp-item .ko{display:block;font-size:12.5px;color:var(--mut)}
.sp-item .si{display:none}
.sp-empty{grid-column:1/-1;padding:2px 0 4px;font-size:15px;line-height:1.5;color:var(--ink)}
.sp-body:has(.sp-empty) .sp-steps,.sp-body:has(.sp-empty) .sp-pcard{display:none}
.sp-pcard{display:grid;grid-template-columns:minmax(0,1fr) auto;grid-template-areas:"meta copy" "ta ta";align-items:center;gap:14px 16px;padding:20px 26px 24px}
.sp-phead{grid-area:meta;display:flex;flex-direction:column;gap:4px}
.sp-pdesc{font-size:13px;color:var(--mut)}
.sp-ta{grid-area:ta;height:420px;resize:none;padding:14px 16px;font-size:13px;line-height:1.55;background:#f8f6ee}
.sp-copy{grid-area:copy;height:46px;min-width:132px;padding:0 20px;white-space:nowrap}
.sp-copy:not(:disabled):hover{background:oklch(39% .06 192)}
}`;

export function mountSpeak(host) {
  ensureV2Fonts();
  host.innerHTML = '';
  const lang = getLang();
  const todayISO = getTodayISO();
  let scope = 'session';
  let items = [];
  let sessions = [];
  const checked = new Set();

  const scopeBtns = SPEAK_SCOPES.map((s) => h('button', { class: 'sp-scope', type: 'button', 'data-scope': s, onClick: () => load(s, false) }, SCOPE_LABELS[s]));
  const sessSel = h('select', { class: 'sp-sess', 'data-role': 'session', 'aria-label': '세션' });
  sessSel.addEventListener('change', () => show(sessions.find((s) => s.key === sessSel.value)?.items || []));
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

  /* PC 전용 요소 — 세션 목록(모바일 <select> 자리)·범위 설명·카드 머리·프롬프트 설명. 1023 이하에서는 CSS 로 숨긴다. */
  const sessCnt = h('span', { class: 'cnt' });
  const sessHead = h('div', { class: 'sp-shead' }, h('span', { class: 'sp-lab' }, '세션'), sessCnt);
  const sessList = h('div', { class: 'sp-sesslist', 'data-role': 'session-list' });
  const note = h('div', { class: 'sp-note' });
  const cLab = h('span', { class: 'sp-lab' });
  const cTitle = h('span', { class: 'sp-ctitle' });
  const cSit = h('span', { class: 'sp-csit' });
  const pdesc = h('span', { class: 'sp-pdesc' });

  /* 세션 줄 복사 — 고른 세션이면 체크 해제가 반영된 textarea 값, 다른 세션이면 그 세션 표현 전부. 선택은 바꾸지 않는다.
   * 클립보드가 막히면 execCommand 로 복사하되, 다른 세션 문구를 담아야 하므로 화면 textarea 대신 임시 textarea 를 쓴다. */
  const copyRow = async (s, btn) => {
    const text = scope === 'session' && s.key === sessSel.value ? ta.value : buildVoicePrompt(s.items);
    try { await navigator.clipboard.writeText(text); }
    catch {
      const tmp = h('textarea', { readonly: 'readonly', style: 'position:fixed;top:0;left:0;opacity:0' });
      tmp.value = text; document.body.appendChild(tmp);
      try { tmp.focus({ preventScroll: true }); tmp.select(); document.execCommand('copy'); } catch { /* noop */ }
      tmp.remove();
    }
    btn.textContent = '복사됨';
    setTimeout(() => { btn.textContent = '복사'; }, 1500);
  };
  /* 선택 상태의 원본은 sessSel.value 하나 — 줄을 누르면 select 에 넣고 change 를 내서 모바일과 같은 경로로 처리한다. */
  const renderRows = () => {
    sessCnt.textContent = `${sessions.length}개`;
    sessList.replaceChildren(sessHead, ...sessions.map((s) => h('div', { class: 'sp-srow', 'data-role': 'session-row', 'data-key': s.key },
      h('button', { class: 'sp-spick', type: 'button', onClick: () => { sessSel.value = s.key; sessSel.dispatchEvent(new Event('change')); } },
        h('span', { class: 'meta' }, `${dateLabel(s.date)} · 표현 ${s.items.length}개`),
        h('span', { class: 'first' }, s.items[0].sentence || s.items[0].expr)),
      h('button', { class: 'sp-scopy', type: 'button', 'data-role': 'session-copy', 'aria-label': `${dateLabel(s.date)} 세션 프롬프트 복사`, onClick: (e) => copyRow(s, e.currentTarget) }, '복사'))));
  };
  /* 카드 머리·범위 설명·세션 목록 선택 표시 — 표현이 없으면 제목·상황을 숨긴다. */
  const paintHead = () => {
    const cur = scope === 'session' ? sessions.find((s) => s.key === sessSel.value) : null;
    cLab.textContent = scope === 'session' ? '고른 세션' : SCOPE_LABELS[scope];
    cTitle.textContent = `${cur ? `${dateLabel(cur.date)} · ` : ''}표현 ${items.length}개`;
    cTitle.hidden = !items.length;
    cSit.textContent = situationOf(items);
    cSit.hidden = !cSit.textContent;
    note.textContent = SCOPE_NOTE[scope] || '';
    note.hidden = scope === 'session';
    sessList.querySelectorAll('.sp-srow').forEach((r) => {
      const on = r.dataset.key === sessSel.value;
      r.classList.toggle('on', on);
      if (on) r.firstChild.setAttribute('aria-current', 'true'); else r.firstChild.removeAttribute('aria-current');
    });
  };

  const paintScopes = () => scopeBtns.forEach((b) => b.classList.toggle('on', b.getAttribute('data-scope') === scope));
  const paintPrompt = () => {
    const sel = items.filter((it) => checked.has(it.id));
    ta.value = buildVoicePrompt(sel);
    copyBtn.disabled = sel.length === 0;
    pdesc.textContent = sel.length ? `고른 표현 ${sel.length}개로 만든 프롬프트 · ChatGPT 새 대화에 붙여 넣기` : '표현을 하나 이상 고르세요';
  };
  const paintList = () => {
    listEl.replaceChildren(...(items.length ? items.map((it) => {
      const box = h('input', { type: 'checkbox', checked: checked.has(it.id) });
      box.addEventListener('change', () => { if (box.checked) checked.add(it.id); else checked.delete(it.id); paintPrompt(); });
      return h('label', { class: 'sp-item', 'data-role': 'item' }, box,
        h('span', { class: 'tx' }, h('span', { class: 'ex' }, it.expr),
          sentenceShown(it) ? h('span', { class: 'se' }, it.sentence) : null,
          it.ko ? h('span', { class: 'ko' }, it.ko) : null,
          it.situation ? h('span', { class: 'si' }, it.situation) : null));
    }) : [h('div', { class: 'sp-empty' }, `${EMPTY_TEXT[scope]} · 다른 범위를 골라 보세요`)]));
    paintHead();
    paintPrompt();
  };

  const show = (list) => { items = list; checked.clear(); items.forEach((it) => checked.add(it.id)); paintList(); };

  /* fallback=true(진입 시): 세션(가장 최근) → 어려웠던 → 랜덤 순으로 비어 있지 않은 첫 범위를 연다.
   * 세션 범위로 돌아오면 목록을 다시 읽되, 고른 세션이 아직 있으면 그대로 둔다. */
  async function load(s, fallback) {
    scope = s; paintScopes();
    let got = [];
    try {
      if (s === 'session') {
        const prev = sessSel.value;
        sessions = await loadSpeakSessions(window.studyDB, lang);
        sessSel.replaceChildren(...sessions.map((x) => h('option', { value: x.key }, sessionLabel(x))));
        if (sessions.some((x) => x.key === prev)) sessSel.value = prev;
        renderRows();
        got = sessions.find((x) => x.key === sessSel.value)?.items || [];
      } else got = await loadSpeakItems(window.studyDB, lang, s, todayISO);
    } catch (e) { console.error('[speak] load', e); got = []; }
    sessSel.hidden = s !== 'session' || !sessions.length;
    sessList.hidden = sessSel.hidden;
    if (!got.length && fallback) {
      const next = SPEAK_SCOPES[SPEAK_SCOPES.indexOf(s) + 1];
      if (next) return load(next, true);
    }
    show(got);
  }

  const root = h('div', { class: 'sp' }, v2Style(CSS),
    h('div', { class: 'sp-top' }, h('div', { class: 'sp-top-in' },
      h('button', { class: 'sp-home', type: 'button', onClick: () => { window.location.hash = '#/home'; } }, vIcon(VI.HOME, { size: 15 }), '홈으로'),
      h('span', { class: 'sp-sub' }, '영어'))),
    h('div', { class: 'sp-wrap' },
      h('div', { class: 'sp-head' },
        h('h1', { class: 'sp-h1' }, '말하기 연습'),
        h('div', { class: 'sp-sub' }, `배운 표현 최대 ${SPEAK_MAX}개로 ChatGPT 음성 연습 프롬프트를 만듭니다. 상대가 질문을 던지면 그 답으로 오늘 문장을 꺼내 말하고, 한 번은 사람·시간·사물을 바꿔 말하게 됩니다.`)),
      h('div', { class: 'sp-main' },
        h('div', { class: 'sp-side' }, h('div', { class: 'sp-scopes' }, scopeBtns), sessSel, sessList, note),
        h('div', { class: 'sp-body' },
          h('div', { class: 'sp-card' },
            h('div', { class: 'sp-chead' }, cLab, cTitle, cSit),
            listEl,
            h('div', { class: 'sp-steps' }, '1 복사 → 2 ChatGPT 새 대화에 붙여 넣어 보내기 → 3 같은 대화에서 음성 모드 시작 → 4 약 10분 대화 → 5 끝나면 못 한 표현을 문장 모아보기에서 확인')),
          /* 모바일은 현행 순서(textarea 다음 복사 버튼) — PC 에서만 grid-template-areas 로 복사 버튼을 머리 줄 오른쪽에 놓는다. */
          h('div', { class: 'sp-pcard' }, h('div', { class: 'sp-phead' }, h('span', { class: 'sp-lab' }, '프롬프트'), pdesc), ta, copyBtn)))));
  host.appendChild(root);
  load('session', true);
}
