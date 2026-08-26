/* 표현 학습 세션 — 데스크톱 C 파이널 v2 (작업지시서 §3)
 * 발화 누적 + 직전 기록 비교, 응용 연습 행 리스트, 단일 해설 패널, 발화 3회 게이트·콤보·점수 링.
 * 정본 시안: 작업지시서 v-session.jsx (SessV2)
 *
 * 라이브 녹음/채점은 기존 services 재사용 (startMicRecording·stopAndAnalyze·savePronunciationLog 등).
 * 시각만 v2 로 교체. 데모(?demo=1&view=session)는 마이크 없이 정적 렌더로 검증.
 */
import { h } from '../components/d1/dom.js';
import { V_VARS, VI, vIcon, vEq, vCheck, v2Style, ensureV2Fonts,
  V_DOT_CSS, V_MINICAL_CSS, scoreDot, passDot, emptyDot, miniCalGrid, makeMiniTier, isoShift, mondayOf, DOW_KO } from '../components/v2/atoms.js';
import { exprOf, bumpRecLog, canAdvance, REC_TARGET } from '../components/d1/sessionShell.js';
import { startMicRecording, stopAndAnalyze } from '../services/sessionAnalyze.js';
import { savePronunciationLog } from '../services/pronunciationLog.js';
import { applyWeakPhonemesUpdate } from '../services/weakPhonemes.js';
import { recordErrorMessage, showRecordToast } from '../components/session/recordToast.js';
import { speakWithFeedback } from '../components/session/atoms.js';
import { buildChainSteps, chainHint, filterNearDupDrills, pickPracticeVoice, firstWordsHint, PRACTICE_VOICES } from '../components/session/applied.js';
import { judgeCoverage, judgeProduction } from '../services/coverageJudge.js';
import { localISODate } from '../utils/today.js';

const PASS_THRESHOLD = 80;
const SVG_NS = 'http://www.w3.org/2000/svg';

// 점수·통과 배지 등장 애니 재트리거 (전역 .score-pop = scorePop 키프레임, src/styles/session.css).
// remove→reflow→add 로 같은 요소에 반복 재생. reduce-motion 은 CSS 가 알아서 무시.
function popScore(el) {
  if (!el) return;
  el.classList.remove('score-pop');
  void el.offsetWidth; // 강제 reflow — 애니 재시작
  el.classList.add('score-pop');
}
function getTodayISO() { return window.studyDay?.TODAY_ISO || localISODate(); }

export const VS_CSS = `
.vs{width:100%;min-height:100vh;min-height:100dvh;background:var(--bg);color:var(--ink);font-family:Pretendard,sans-serif;display:flex;word-break:keep-all;${V_VARS}}
.vs *{box-sizing:border-box;margin:0}
.vs-rail{width:88px;border-right:1px solid var(--line);display:flex;flex-direction:column;align-items:center;padding:24px 0;gap:8px;flex:0 0 auto}
.vs-rail .hm{color:var(--faint);margin-bottom:16px;background:none;border:0;cursor:pointer;display:inline-flex}
.vs-rstep{width:38px;height:38px;border-radius:13px;display:grid;place-items:center;font-family:Outfit;font-size:13.5px;font-weight:700;color:var(--faint);cursor:pointer;background:none;border:0}
.vs-rstep.on{background:var(--teal-soft);color:var(--teal-deep);animation:v-haloT 2.4s ease-in-out infinite}
.vs-rstep.done{color:var(--teal-deep)}
.vs-rail .sp{flex:1}
.vs-rail .tm{font-family:Outfit;font-size:11px;color:var(--faint);letter-spacing:.08em;white-space:nowrap}
.vs-mainwrap{flex:1;display:flex;justify-content:center;gap:26px;padding:38px 46px 40px}
.vs-main{width:760px;max-width:100%}
.vs-crumb{display:flex;align-items:center;gap:14px}
.vs-scene{font-size:12px;font-weight:700;color:var(--teal-deep);background:var(--teal-soft);border-radius:999px;padding:6px 13px;white-space:nowrap}
.vs-prog{flex:1;display:flex;gap:5px}
.vs-prog i{flex:1;height:4px;border-radius:2px;background:#e7e3d4}
.vs-prog i.f{background:var(--teal)}
.vs-prog-t{font-family:Outfit;font-size:12px;color:var(--faint);font-weight:600;white-space:nowrap}
.vs-card{background:var(--card);border:1px solid var(--line);border-radius:22px;padding:28px 40px 30px;margin-top:18px;
  box-shadow:0 1px 0 rgba(25,35,32,.02),0 12px 26px -20px rgba(25,35,32,.14)}
.vs-h1{font-family:Outfit;font-size:42px;font-weight:700;letter-spacing:-0.03em;line-height:1.12}
/* 밑줄은 그라디언트 언더레이 — text-decoration 은 단어 사이가 끊긴다 (§4.4). */
.vs-h1 b{font-weight:700;background:linear-gradient(oklch(44% .062 192/.35),oklch(44% .062 192/.35)) 0 100%/100% 5px no-repeat;padding-bottom:6px}
.vs-ko{font-size:17px;color:var(--mut);margin-top:12px}
.vs-pron{font-size:13px;color:var(--faint);margin-top:5px}
.vs-ctrl{display:flex;align-items:center;gap:12px;margin-top:26px;min-height:56px;flex-wrap:wrap}
.vs-pill{position:relative;display:inline-flex;align-items:center;gap:9px;border-radius:999px;padding:13px 23px;font:inherit;font-size:14px;font-weight:700;cursor:pointer;border:1.5px solid var(--line);background:#fff;color:var(--ink);white-space:nowrap}
.vs-pill.playing{border-color:var(--blue-line);color:var(--blue-deep);background:var(--blue-soft)}
/* 녹음 CTA 는 코랄 — 색 규약 '코랄=녹음'(v2/atoms.js 머리주석)과 구 D1(terra) 관례. 2026-07-22 복원. */
.vs-pill.pri{background:var(--coral);border-color:var(--coral);color:#fff;animation:v-breatheC 2.6s ease-in-out infinite}
.vs-pill.recing{background:var(--coral-deep);border-color:var(--coral-deep);color:#fff;animation:none}
.vs-pill.recing::after{content:"";position:absolute;inset:-3px;border-radius:999px;border:1.5px solid var(--coral);animation:v-pulse 1.5s ease-out infinite}
.vs-pill.playing::after{content:"";position:absolute;inset:-3px;border-radius:999px;border:1.5px solid var(--blue);animation:v-pulse 1.5s ease-out infinite}
.vs-ring{position:relative;width:54px;height:54px;flex:0 0 auto}
.vs-ring svg{transform:rotate(-90deg)}
.vs-ring .cn{position:absolute;inset:0;display:grid;place-items:center;font-family:Outfit;font-size:15.5px;font-weight:700;color:var(--teal-deep)}
.vs-cap{font-size:11.5px;color:var(--faint);white-space:nowrap}
.vs-meta{display:flex;align-items:center;gap:12px;margin-top:22px;min-height:30px;flex-wrap:wrap;color:var(--faint)}
.vs-meta .tot{font-family:Outfit;font-size:12px;font-weight:700;color:var(--mut);white-space:nowrap;margin-left:auto}
.vs-meta .tot b{color:var(--ink)}
.vs-labrow{display:flex;align-items:baseline;justify-content:space-between;margin-top:26px}
.vs-lab{font-family:Outfit;font-size:10.5px;letter-spacing:.15em;font-weight:600;color:var(--faint);text-transform:uppercase;white-space:nowrap}
.vs-labrow .ct{font-family:Outfit;font-size:11.5px;color:var(--mut);font-weight:600;white-space:nowrap}
.vs-labrow .ct b{color:var(--teal-deep)}
.vs-drow{display:flex;align-items:center;gap:14px;padding:13px 2px;border-bottom:1px solid var(--line)}
.vs-drow:last-of-type{border-bottom:0}
.vs-drow .ix{font-family:Outfit;font-size:11px;color:var(--faint);width:16px;flex:0 0 auto;text-align:right}
.vs-drow .en{font-size:15.5px;font-weight:700;letter-spacing:-0.01em}
.vs-drow .en b{font-weight:800;background:linear-gradient(oklch(44% .062 192/.3),oklch(44% .062 192/.3)) 0 100%/100% 2.5px no-repeat;padding-bottom:2px}
.vs-drow .sub{font-size:12px;color:var(--faint);margin-top:3px}
.vs-drow .grow{flex:1}
.vs-drow.recing{background:var(--coral-soft);margin:0 -14px;padding-left:16px;padding-right:14px;border-radius:12px;border-bottom-color:transparent}
.vs-cir{width:33px;height:33px;border-radius:50%;border:1.5px solid var(--line);background:#fff;color:var(--mut);display:grid;place-items:center;cursor:pointer;flex:0 0 auto;position:relative;padding:0}
.vs-cir.eqq{border-color:var(--blue-line);color:var(--blue)}
.vs-cir.recing{background:var(--coral);border-color:var(--coral);color:#fff}
.vs-cir.recing::after{content:"";position:absolute;inset:-3px;border-radius:50%;border:1.5px solid var(--coral);animation:v-pulse 1.5s ease-out infinite}
.vs-cir.playing::after{content:"";position:absolute;inset:-3px;border-radius:50%;border:1.5px solid var(--blue);animation:v-pulse 1.5s ease-out infinite}
.vs-gscore{display:inline-flex;align-items:center;gap:5px;white-space:nowrap}
.vs-side{width:324px;flex:0 0 auto}
.vs-rec{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:18px 20px 16px}
.vs-rec .hd{display:flex;justify-content:space-between;align-items:center;min-height:21px}
.vs-rec .lb{font-family:Outfit;font-size:10px;letter-spacing:.16em;font-weight:600;color:var(--faint);text-transform:uppercase;white-space:nowrap}
.vs-rec .msg{font-size:11.5px;color:var(--mut);margin-top:9px;line-height:1.5;text-align:center}
.vs-rec .msg b{color:var(--coral-deep)}
.vs-newrec{display:inline-flex;align-items:center;gap:5px;font-family:Outfit;font-size:10.5px;font-weight:800;color:var(--coral-deep);background:var(--coral-soft);border-radius:999px;padding:4px 10px;white-space:nowrap;animation:v-settle .5s both}
.vs-uring{position:relative;margin:12px auto 0}
.vs-uring svg{transform:rotate(-90deg)}
.vs-uring .arc{transition:stroke-dashoffset .6s cubic-bezier(.3,.7,.3,1),stroke .3s}
.vs-uring .pl{position:absolute;inset:8px;border-radius:50%;border:1.5px solid var(--coral);animation:v-pulse 1.5s ease-out infinite}
.vs-uring .cn{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
.vs-uring .n{font-family:Outfit;font-size:36px;font-weight:700;line-height:1;color:var(--ink)}
.vs-uring .n em{font-style:normal;font-family:Outfit;font-size:14px;font-weight:700;color:var(--coral-deep);margin-left:5px}
.vs-uring .pv{font-family:Outfit;font-size:11.5px;font-weight:700;color:var(--teal-deep);margin-top:7px;white-space:nowrap}
.vs-uring .pv.over{color:var(--coral-deep)}
.vs-hist{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:18px 20px 20px;margin-top:13px}
.vs-hist .lb{font-family:Outfit;font-size:10px;letter-spacing:.16em;font-weight:600;color:var(--faint);text-transform:uppercase;white-space:nowrap}
.vs-panel{position:relative;background:var(--card);border:1px solid var(--line);border-radius:16px;margin-top:13px}
.vs-panel .ph2d{display:flex;justify-content:space-between;align-items:center;padding:18px 24px 0;cursor:pointer}
.vs-panel .chev{width:26px;height:26px;border-radius:50%;border:1.5px solid var(--line);display:grid;place-items:center;color:var(--mut);transition:transform .2s;flex:0 0 auto}
.vs-panel.open .chev{transform:rotate(180deg)}
.vs-klab{font-family:Outfit;font-size:10px;letter-spacing:.16em;font-weight:600;color:var(--faint);text-transform:uppercase;white-space:nowrap}
.vs-panel .inner{padding:14px 24px 30px;max-height:584px;overflow-y:auto}
.vs-kbox{background:var(--teal-soft);border-radius:12px;padding:12px 14px;font-size:12.5px;line-height:1.6}
.vs-kbox b{font-weight:700}
.vs-sec{margin-top:14px}
.vs-sec .b2{font-size:12.5px;line-height:1.7;color:#4a5450;margin-top:6px;text-wrap:pretty}
.vs-sec .b2 b{color:var(--ink)}
.vs-sec .b2 + .b2{margin-top:8px}
.vs-ex{border-left:2px solid var(--teal-line);padding:2px 0 2px 12px;margin-top:8px;font-size:12.5px;line-height:1.6;color:#4a5450}
.vs-ex b{color:var(--ink)}
.vs-ex .k{color:var(--faint);font-size:11.5px}
.vs-chips{display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;max-width:100%}
/* 2026-07-22 — nowrap 이면 긴 음소 설명이 해설 박스를 넘어갔다. 줄바꿈 허용 + 라운드 완화. */
.vs-chip{font-size:11.5px;color:var(--mut);border:1px solid var(--line);border-radius:12px;padding:5px 11px;background:#fbf9f2;max-width:100%;white-space:normal;word-break:keep-all;overflow-wrap:anywhere;line-height:1.5}
.vs-next{width:100%;margin-top:13px;font:inherit;font-size:14.5px;font-weight:700;border-radius:13px;padding:15px 0;cursor:pointer;border:1.5px solid var(--line);background:transparent;color:var(--faint)}
.vs-next.unlock{background:var(--teal);border-color:var(--teal);color:#fff;box-shadow:0 8px 16px -11px oklch(44% .062 192/.7)}
.vs-gate{font-size:11.5px;color:var(--faint);text-align:center;margin-top:9px;white-space:nowrap}
@media (max-width:1100px){.vs-mainwrap{flex-direction:column;align-items:center}.vs-side{width:760px;max-width:100%}}
${V_DOT_CSS}${V_MINICAL_CSS}
`;

function ringEl(score) {
  const wrap = h('div', { class: 'vs-ring' });
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', '54'); svg.setAttribute('height', '54'); svg.setAttribute('viewBox', '0 0 54 54');
  const track = document.createElementNS(SVG_NS, 'circle');
  track.setAttribute('cx', '27'); track.setAttribute('cy', '27'); track.setAttribute('r', '23');
  track.setAttribute('fill', 'none'); track.setAttribute('stroke', '#eae6d8'); track.setAttribute('stroke-width', '5');
  const arc = document.createElementNS(SVG_NS, 'circle');
  const off = 144.5 - Math.round((Math.min(Math.max(score, 0), 100) / 100) * 1245) / 10;
  arc.setAttribute('cx', '27'); arc.setAttribute('cy', '27'); arc.setAttribute('r', '23');
  arc.setAttribute('fill', 'none'); arc.setAttribute('stroke', 'oklch(44% .062 192)'); arc.setAttribute('stroke-width', '5');
  arc.setAttribute('stroke-linecap', 'round'); arc.setAttribute('stroke-dasharray', '144.5'); arc.setAttribute('stroke-dashoffset', String(off));
  svg.append(track, arc);
  wrap.append(svg, h('span', { class: 'cn' }, score != null ? String(score) : '—'));
  return wrap;
}

/* ── 오늘 발화 링 카드 (§6.6① · §6.8) — 신규·복습 공통 ──
 * 분모는 '직전 학습일 발화 수'. 넘어서면 링이 코랄로 바뀌고 안쪽 확산 펄스(§3.3 (A) — 기존 v-pulse 재사용)가 돈다.
 * 잔여 계산 헬퍼는 pr.js 에 없다 — 여기서 (직전 − 오늘) 로 구한다.
 */
export function utterRingCard({ size = 140, caption = true } = {}) {
  const r = size === 140 ? 59 : Math.round((size - 22) / 2);
  const circ = Math.round(2 * Math.PI * r * 10) / 10;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', String(size)); svg.setAttribute('height', String(size));
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  const mk = (cls) => {
    const c = document.createElementNS(SVG_NS, 'circle');
    c.setAttribute('class', cls);
    c.setAttribute('cx', String(size / 2)); c.setAttribute('cy', String(size / 2)); c.setAttribute('r', String(r));
    c.setAttribute('fill', 'none'); c.setAttribute('stroke-width', '9');
    svg.appendChild(c);
    return c;
  };
  const track = mk('tk');
  const arc = mk('arc');
  arc.setAttribute('stroke-linecap', 'round');
  arc.setAttribute('stroke-dasharray', String(circ));
  arc.setAttribute('stroke-dashoffset', String(circ));

  const nEl = h('span', { class: 'n' }, '0');
  const pvEl = h('span', { class: 'pv' }, '');
  const pulse = h('i', { class: 'pl', style: 'display:none;' });
  const ring = h('div', { class: 'vs-uring', style: `width:${size}px;height:${size}px` },
    svg, pulse, h('span', { class: 'cn' }, nEl, pvEl));
  const chip = h('span', { class: 'vs-newrec', style: 'display:none;' }, vIcon(VI.ZAP, { size: 10, fill: true }), '기록 갱신!');
  const msg = h('div', { class: 'msg' }, '');
  const el = h('div', { class: 'vs-rec' },
    h('div', { class: 'hd' }, h('span', { class: 'lb' }, '오늘 발화'), chip),
    ring, caption ? msg : null);

  function update(today, prev) {
    const t = Math.max(0, Number(today) || 0);
    const p = Math.max(0, Number(prev) || 0);
    const over = p > 0 && t > p;
    nEl.textContent = String(t); // 자식(+N)도 함께 초기화된다
    if (over) nEl.appendChild(h('em', {}, `+${t - p}`));
    track.setAttribute('stroke', over ? 'oklch(58% .115 32/.15)' : '#ece8da');
    arc.setAttribute('stroke', over ? 'oklch(58% .115 32)' : 'oklch(44% .062 192)');
    const ratio = p > 0 ? Math.min(t / p, 1) : 0;
    arc.setAttribute('stroke-dashoffset', String(Math.round(circ * (1 - ratio) * 10) / 10));
    pulse.style.display = over ? '' : 'none';
    chip.style.display = over ? '' : 'none';
    pvEl.className = 'pv' + (over ? ' over' : '');
    pvEl.textContent = p > 0 ? (over ? `직전 ${p} 넘김` : `직전 ${p}회`) : '';
    if (!caption) return;
    // 직전 기록이 없거나 이미 넘었으면 캡션을 붙이지 않는다 (없는 숫자를 지어내지 않음).
    msg.innerHTML = (p > 0 && !over) ? `<b>${p - t}회</b>만 더 말하면 직전 세션 기록을 깨요!` : '';
  }
  update(0, 0);
  return { el, update };
}

/* ── 공부 이력 · 최근 4주 (§6.6②) — 셀 안 숫자 없이 농도만. 오늘 칸은 발화가 쌓이면 실시간으로 진해진다. */
export function historyCalCard(todayISO, dayMap, todayCount) {
  const start = isoShift(mondayOf(todayISO), -21);
  const dates = Array.from({ length: 28 }, (_, i) => isoShift(start, i));
  const el = h('div', { class: 'vs-hist' }, h('span', { class: 'lb vs-histlab' }, '공부 이력'));
  const countOf = (iso) => (iso === todayISO ? todayCount() : Number(dayMap?.[iso]) || 0);
  // 하루 발화 수는 사람마다 스케일이 다르다 — 이 4주 창의 분포로 3단을 잡는다.
  const build = () => miniCalGrid(dates, {
    countOf, todayISO,
    tierOf: makeMiniTier(dates.filter((iso) => iso <= todayISO).map(countOf)),
  });
  let grid = build();
  el.appendChild(grid);
  return {
    el,
    update() { const next = build(); grid.replaceWith(next); grid = next; },
  };
}

export function hlNode(text, term) {
  if (!term) return document.createTextNode(text);
  const i = text.toLowerCase().indexOf(String(term).toLowerCase());
  if (i < 0) return document.createTextNode(text);
  const frag = document.createDocumentFragment();
  frag.append(document.createTextNode(text.slice(0, i)));
  const b = document.createElement('b'); b.textContent = text.slice(i, i + term.length); frag.appendChild(b);
  frag.append(document.createTextNode(text.slice(i + term.length)));
  return frag;
}

/* 표현 해설 패널 — 단일 스크롤 (탭 금지). ex 필드 graceful.
 * 복습 세션(sessionReviewV2)도 같은 패널을 쓴다 — 해설이 두 화면에서 달라지지 않게 (2026-07-10 사용자 지시).
 * 복습은 자체 '표현 해설' 헤더를 이미 가지므로 showHeader=false 로 부른다. */
export function explainPanel(ex, showHeader = true) {
  const inner = h('div', { class: 'inner' });
  if (ex?.key) inner.appendChild(h('div', { class: 'vs-kbox', style: 'margin-top:10px;' }, hlNode(String(ex.key), null)));
  const situation = ex?.situation || ex?.whenToUse;
  if (situation) inner.appendChild(h('div', { class: 'vs-sec' }, h('div', { class: 'vs-klab' }, '이런 상황에서 써요'), h('div', { class: 'b2' }, String(situation))));
  if (Array.isArray(ex?.grammar) && ex.grammar.length) {
    const sec = h('div', { class: 'vs-sec' }, h('div', { class: 'vs-klab' }, '문법 뜯어보기'));
    ex.grammar.forEach((g, i) => {
      const struct = typeof g === 'string' ? g : (g?.struct || '');
      const body = (g && typeof g === 'object') ? g.body : '';
      if (i === 0) sec.appendChild(h('div', { class: 'b2' }, h('b', {}, struct), body ? ' — ' + body : ''));
      else sec.appendChild(h('div', { class: 'vs-ex' }, h('b', {}, struct), body ? [document.createElement('br'), h('span', { class: 'k' }, body)] : null));
    });
    inner.appendChild(sec);
  }
  if (Array.isArray(ex?.phonemes) && ex.phonemes.length) {
    inner.appendChild(h('div', { class: 'vs-sec' }, h('div', { class: 'vs-klab' }, '주의 음소'),
      h('div', { class: 'vs-chips' }, ex.phonemes.map((p) => h('span', { class: 'vs-chip' }, Array.isArray(p) ? (p[0] + ' ' + (p[1] || '')).trim() : String(p))))));
  }
  const mistake = ex?.mistake || ex?.commonMistakes;
  if (mistake) inner.appendChild(h('div', { class: 'vs-sec' }, h('div', { class: 'vs-klab' }, '한국인 실수'), h('div', { class: 'b2' }, String(mistake))));
  let similar = null;
  if (typeof ex?.similar === 'string') similar = ex.similar;
  else if (Array.isArray(ex?.similar)) similar = ex.similar.map((x) => x?.expression || x).filter(Boolean).join(' / ');
  if (similar) inner.appendChild(h('div', { class: 'vs-sec' }, h('div', { class: 'vs-klab' }, '비슷한 표현'), h('div', { class: 'b2' }, similar)));

  return h('div', { class: 'vs-panel' },
    showHeader ? h('div', { class: 'ph2d' }, h('span', { class: 'vs-klab' }, '표현 해설'), h('span', { class: 'vs-klab', style: 'letter-spacing:.08em' }, '스크롤 ↓')) : null,
    inner,
  );
}

/* 행 점수 저장 형식 정규화 — 숫자(구 스냅샷) | 숫자 배열 | 빈 값. */
export function normScores(v) {
  if (Array.isArray(v)) return v.map((x) => Math.round(Number(x) || 0));
  return Number.isFinite(v) ? [Math.round(v)] : [];
}

/* 응용 연습 행 — 듣기/녹음 (services 재사용). onScore(i, result): 채점 성공 시 세션 집계 위임.
 * demo=true 면 마이크 없이 시뮬 채점 (?demo=1 화면 검증용 — 메인 recPill 데모 분기와 동일).
 * 재생은 체이닝과 동일하게 매번 화자 변주 + 길이별 속도 — 카드 화자 고정 폐기 (2026-07-22 사용자 지시). */
export function drillRows(drills, hlTerm, lang, onScore, demo, { saved } = {}) {
  const ttsLang = lang === 'ja' ? 'ja-JP' : 'en-US';
  let recCtrl = null, recRow = null, plays = 0;
  return (Array.isArray(drills) ? drills : []).map((d, i) => {
    // saved[i] = 이 세션에서 이미 받은 점수들 (state.exLog 복원) — 재렌더에도 배지 유지.
    // 구 스냅샷은 숫자 1개로 저장돼 있다 (2026-08-21 형식) — 배열로 정규화해 읽는다.
    const hist = normScores(saved?.[i]);
    const scoreEl = h('span', { class: 'vs-gscore', style: hist.length ? '' : 'display:none;' },
      hist.map((v, k) => scoreDot(v, { size: 26, fresh: false })));
    const playBtn = h('button', { class: 'vs-cir', type: 'button', 'aria-label': '듣기' }, vIcon(VI.PLAY, { size: 11, fill: true }));
    // 재생 중 이퀄라이저 + 블루 펄스 (2026-07-22 — 종전엔 눌러도 아무 반응이 없었다)
    playBtn.addEventListener('click', () => {
      plays += 1;
      const wcnt = String(d.en ?? '').trim().split(/\s+/).filter(Boolean).length;
      const v = pickPracticeVoice(plays, wcnt);
      speakWithFeedback(playBtn, d.en, { lang: ttsLang, voice: v.voice, rate: v.rate });
    });
    const recBtn = h('button', { class: 'vs-cir', type: 'button', 'aria-label': '녹음' }, vIcon(VI.MIC, { size: 13, sw: 2 }));
    const row = h('div', { class: 'vs-drow' },
      h('span', { class: 'ix' }, String(i + 1)),
      h('div', {}, h('div', { class: 'en' }, hlNode(d.en || '', hlTerm)), h('div', { class: 'sub' }, [d.kr, d.ko].filter(Boolean).join(' · '))),
      h('span', { class: 'grow' }), scoreEl, playBtn, recBtn,
    );
    recBtn.addEventListener('click', async () => {
      if (demo) {
        // 데모 — 마이크 없이 시뮬 채점 (화면 검증). 행 단위 진행 표시.
        if (row.classList.contains('recing')) return;
        row.classList.add('recing'); recBtn.classList.add('recing');
        setTimeout(() => {
          row.classList.remove('recing'); recBtn.classList.remove('recing');
          const result = { score: Math.min(82 + i * 4, 99), weakPhonemes: ['ð'] };
          pushScore(result.score);
          onScore?.(i, result);
        }, 800);
        return;
      }
      if (recCtrl && recRow === row) { finishDrill(); return; }
      // 말 끝나면(발화 후 1.2초 무음) 자동 종료 — 메인 카드와 동일. 수동 멈추기도 유지.
      const r = await startMicRecording({ autoStopSilenceMs: 2000, onAutoStop: () => finishDrill() });
      if (r.error) { showRecordToast(recordErrorMessage(r.error)); return; }
      recCtrl = r.controller; recRow = row;
      row.classList.add('recing'); recBtn.classList.add('recing');
    });
    // 드릴 녹음 종료·채점 — 수동 멈추기와 무음 자동종료 공유. recRow 가드로 중복/오행 방지.
    async function finishDrill() {
      if (!(recCtrl && recRow === row)) return;
      const ctrl = recCtrl; recCtrl = null; recRow = null;
      row.classList.remove('recing'); recBtn.classList.remove('recing');
      const result = await stopAndAnalyze(ctrl, d.en || '', { lang });
      if (result?.mockFallback) { showRecordToast(recordErrorMessage(result.fallbackReason)); return; }
      pushScore(result?.score ?? 0);
      onScore?.(i, result);
    }
    /* 시도할 때마다 점수 원이 하나씩 붙는다 — 같은 문장을 여러 번 말한 흔적이 곧 기록이다. */
    function pushScore(raw) {
      hist.push(Math.round(Number(raw) || 0));
      scoreEl.replaceChildren(...hist.map((v, k) => scoreDot(v, { size: 26, fresh: k === hist.length - 1 })));
      scoreEl.style.display = '';
      popScore(scoreEl);
    }
    return row;
  });
}

/* 체이닝 — 무자막 청각 확장 (elicited imitation, 2026-07-09 사용자 결정).
 * 단계 = chunks 누적. 화면에 영어를 보여주지 않는다(= 인출 강제, "보고 따라 읽기" 폐기).
 * 재생마다 화자·속도를 바꿔 '리듬 통째 암기'를 막는다. 통과 판정은 발음 점수가 아니라 **단어 누락 0**
 * (전사 vs 기대문 — judgeCoverage. Azure omission 판정은 false omission 실측으로 폐기 2026-07-12).
 * 3회 실패부터 힌트(뜻 → 첫 단어 → 전체 공개).
 * 체이닝 발화도 '오늘 발화' 1건 — onUtterance(result) 로 세션 집계·3회 게이트에 반영(응용 드릴과 동일).
 * demo(?demo=1) 는 마이크 없이 통과 시뮬. */
export function chainBlockEl(chain, lang, card, demo, onUtterance, { saved, onSave } = {}) {
  const steps = buildChainSteps(chain);
  if (!steps.length) return null;
  const ttsLang = lang === 'ja' ? 'ja-JP' : 'en-US';
  // saved.cur = 이미 통과한 단계 수 (state.exLog 복원)
  let cur = Math.min(Math.max(Number(saved?.cur) || 0, 0), steps.length);
  let plays = 0, fails = 0, recCtrl = null, recRow = null;

  const hintEl = h('div', { class: 'vs-gate', style: 'text-align:left;margin-top:10px;min-height:18px;white-space:normal;' }, '');
  const countEl = h('b', {}, String(cur));
  const rowEls = [];

  // 안내문은 두지 않는다 (§4.3) — 실패했을 때 나오는 실제 힌트만 남긴다.
  const renderHint = () => {
    const step = steps[cur];
    if (!step) { hintEl.textContent = ''; return; }
    const { kind, text } = chainHint(fails, { stepText: step.text, ko: chain.ko, isLast: cur === steps.length - 1 });
    if (kind === 'none') { hintEl.textContent = ''; return; }
    if (kind === 'ko') hintEl.textContent = `힌트 · 뜻: ${text}`;
    else if (kind === 'first') hintEl.textContent = `힌트 · 시작: ${text}`;
    else hintEl.textContent = `힌트 · 전체: ${text}`;
  };
  const refresh = () => {
    rowEls.forEach((r, i) => {
      const active = i === cur;
      r.row.style.opacity = i < cur ? '0.5' : active ? '1' : '0.35';
      r.playBtn.disabled = !active;
      r.recBtn.disabled = !active;
      r.mark.style.display = i < cur ? '' : 'none';
    });
    countEl.textContent = String(cur);
    if (cur >= steps.length) hintEl.textContent = '';
    else renderHint();
  };
  const advance = () => { cur += 1; fails = 0; onSave?.({ cur }); refresh(); };

  steps.forEach((step, i) => {
    const wc = step.text.trim().split(/\s+/).filter(Boolean).length;
    const mark = h('span', { class: 'vs-gscore', style: 'display:none;' }, passDot({ size: 26 }));
    const playBtn = h('button', { class: 'vs-cir', type: 'button', 'aria-label': '듣기' }, vIcon(VI.PLAY, { size: 11, fill: true }));
    const recBtn = h('button', { class: 'vs-cir', type: 'button', 'aria-label': '녹음' }, vIcon(VI.MIC, { size: 13, sw: 2 }));
    const row = h('div', { class: 'vs-drow' },
      h('span', { class: 'ix' }, String(i + 1)),
      h('div', {}, h('div', { class: 'en' }, `${i + 1}단계 · ${wc}단어`)),
      h('span', { class: 'grow' }), mark, playBtn, recBtn);

    playBtn.addEventListener('click', () => {
      if (i !== cur || !window.studySpeech?.speak) return;
      plays += 1;
      const v = pickPracticeVoice(plays, wc); // 매 재생마다 화자 변주 + 단계 길이별 속도
      speakWithFeedback(playBtn, step.text, { lang: ttsLang, voice: v.voice, rate: v.rate });
    });

    async function finish() {
      if (!(recCtrl && recRow === row)) return;
      const ctrl = recCtrl; recCtrl = null; recRow = null;
      row.classList.remove('recing'); recBtn.classList.remove('recing');
      const result = await stopAndAnalyze(ctrl, step.text, card, { enableMiscue: true });
      if (result?.mockFallback) { showRecordToast(recordErrorMessage(result.fallbackReason)); return; }
      onUtterance?.(result); // 통과 여부와 무관 — 말했으면 발화 1건
      // 2026-07-12 — 통과 판정을 Azure omission(passesCoverage) → 전사 비교(judgeCoverage)로 교체.
      // Azure 가 긴 L2 문장에서 false omission 을 내던 실측(coverageJudge.js 박제) 후속 배선.
      // ※ enableMiscue:true 유지 필수 — false 면 recognizedText 가 레퍼런스를 에코해 항상 통과(실측 2026-07-12).
      const judge = judgeCoverage(result?.recognizedText, step.text);
      if (judge.pass) { advance(); popScore(mark); return; } // 방금 통과한 단계 mark 팝
      fails += 1;
      const miss = judge.missing.length;
      showRecordToast(miss ? `${miss}개 빠뜨렸어요 — 다시 들어보세요` : '다시 한 번 말해 보세요');
      refresh();
    }

    recBtn.addEventListener('click', async () => {
      if (i !== cur) return;
      if (demo) {
        if (row.classList.contains('recing')) return;
        row.classList.add('recing'); recBtn.classList.add('recing');
        setTimeout(() => {
          row.classList.remove('recing'); recBtn.classList.remove('recing');
          onUtterance?.({ score: 90, omissions: [], weakPhonemes: [] });
          advance(); popScore(mark); // 방금 통과한 단계 mark 팝 (실경로와 동일)
        }, 800);
        return;
      }
      if (recCtrl && recRow === row) { finish(); return; }
      const r = await startMicRecording({ autoStopSilenceMs: 2000, onAutoStop: () => finish() });
      if (r.error) { showRecordToast(recordErrorMessage(r.error)); return; }
      recCtrl = r.controller; recRow = row;
      row.classList.add('recing'); recBtn.classList.add('recing');
    });

    rowEls.push({ row, playBtn, recBtn, mark });
  });

  const block = h('div', { class: 'vs-chain', style: 'margin-top:26px;' },
    h('div', { class: 'vs-labrow' }, h('span', { class: 'vs-lab' }, '체이닝'),
      h('span', { class: 'ct' }, '통과 ', countEl, ' / ' + steps.length)),
    h('div', { style: 'margin-top:4px;' }, rowEls.map((r) => r.row)),
    hintEl);
  refresh();
  return block;
}

/* 생산 연습(한→영) — 방금 연습한 드릴 중 3개를 한글만 보고 영어로 재현 (2026-07-22 사용자 결정).
 * 자유 작문이 아니라 직전 연습 문장의 인출 재현 — 대안 표현은 오답 처리된다(의도).
 * 통과 판정은 체이닝과 동일(전사 비교 judgeCoverage). 실패 2회 → 첫 단어 힌트, 3회 → 정답 공개 후 완료.
 * 게임 요소(연속 ✓ 스트릭·완주 뱃지)는 이 블록에만 접붙임 — 반응 나쁘면 블록째 폐기.
 * 정답(en·kr)은 공개 전 DOM 미부착 — 체이닝 자막 금지와 동일 계약. onStart: 첫 녹음 시 1회(드릴 목록 접기). */
// 생산 연습 발음 정확도 하한 — 커버리지만으로는 웅얼거림이 통과된다 (2026-07-23 사용자 지적).
// 메인 PASS_THRESHOLD(80)보다 관대: 인출이 주목적, 발음은 최소선만.
const PROD_MIN_ACCURACY = 65;

export function productionBlockEl(drills, lang, card, demo, onScore, { onStart, saved, onSave } = {}) {
  const pool = (Array.isArray(drills) ? drills : []).filter((d) => d?.en && d?.ko);
  if (!pool.length) return null;
  // 출제 문항은 pool 인덱스로 고정해 저장한다 — 종전엔 재렌더마다 재추첨돼 복원 시 문항이 바뀌었다.
  // 하나라도 어긋나면(드릴 구성 변경) 저장분을 통째로 버리고 재추첨 — 부분 렌더 방지.
  const savedPicks = Array.isArray(saved?.picks)
    && saved.picks.every((n) => Number.isInteger(n) && n >= 0 && n < pool.length)
    ? saved.picks : [];
  const allIdx = pool.map((_, i) => i);
  const pickIdx = savedPicks.length
    ? savedPicks
    : (pool.length <= 3 ? allIdx : allIdx.sort(() => Math.random() - 0.5).slice(0, 3));
  const picks = pickIdx.map((n) => pool[n]);
  const rowsDone = { ...(saved?.rows || {}) }; // 행 인덱스 → 통과 여부 (공개했으면 false)
  let restoring = false;
  const ttsLang = lang === 'ja' ? 'ja-JP' : 'en-US';
  let recCtrl = null, recRow = null, started = false, plays = 0;
  const persist = () => { if (!restoring) onSave?.({ picks: pickIdx, rows: { ...rowsDone } }); };
  const passEl = h('b', {}, '0');
  let passCount = 0;

  const rows = picks.map((d, i) => {
    const wcnt = String(d.en).trim().split(/\s+/).filter(Boolean).length;
    let fails = 0, done = false;
    const mark = h('span', { class: 'vs-gscore', style: 'display:none;' }, passDot({ size: 26 }));
    const playBtn = h('button', { class: 'vs-cir', type: 'button', 'aria-label': '듣기' }, vIcon(VI.PLAY, { size: 11, fill: true }));
    playBtn.disabled = true; // 정답 오디오 잠금 — 공개 전 듣기가 곧 정답 유출
    const recBtn = h('button', { class: 'vs-cir', type: 'button', 'aria-label': '녹음' }, vIcon(VI.MIC, { size: 13, sw: 2 }));
    const hintEl = h('div', { class: 'sub', style: 'display:none;' }, '');
    const ansEl = h('div', { class: 'sub' }); // 정답 줄 — 공개 시점에만 텍스트 주입
    // 정답 보기 — 녹음 3회를 채우지 않고도 바로 공개 (2026-07-24 사용자 지시,
    // 복습의 "발화는 전진 조건이 아니다" 원칙). 공개는 통과가 아니다(스트릭 0).
    // 데스크톱 VS_CSS 엔 '.vs button' 리셋이 없으므로 크롬 제거는 인라인.
    const giveBtn = h('button', { class: 'vs-prod-give', type: 'button', style: 'display:block;text-align:left;padding:2px 0;font:inherit;font-size:12px;font-weight:600;color:var(--faint);background:none;border:0;cursor:pointer;' }, '정답 보기');
    const row = h('div', { class: 'vs-drow vs-prod' },
      h('span', { class: 'ix' }, String(i + 1)),
      h('div', {}, h('div', { class: 'en' }, String(d.ko)), h('div', { class: 'sub' }, `${wcnt}단어`), hintEl, ansEl, giveBtn),
      h('span', { class: 'grow' }), mark, playBtn, recBtn);

    const reveal = (pass) => {
      if (done) return;
      done = true;
      ansEl.textContent = [d.en, d.kr].filter(Boolean).join(' · ');
      playBtn.disabled = false;
      recBtn.disabled = true;
      giveBtn.style.display = 'none';
      hintEl.style.display = 'none';
      if (pass) { mark.style.display = ''; popScore(mark); passCount += 1; }
      passEl.textContent = String(passCount);
      rowsDone[i] = pass;
      persist();
    };
    const failOnce = (msg) => {
      fails += 1;
      if (fails >= 3) { reveal(false); showRecordToast('정답을 공개했어요 — 듣고 한 번 더 말해 보세요'); return; }
      if (fails >= 2) { hintEl.textContent = `힌트 · 시작: ${firstWordsHint(d.en)}`; hintEl.style.display = ''; }
      showRecordToast(msg ?? '다시 한 번 — 한글 뜻을 영어로 말해 보세요');
    };

    async function finish() {
      if (!(recCtrl && recRow === row)) return;
      const ctrl = recCtrl; recCtrl = null; recRow = null;
      row.classList.remove('recing'); recBtn.classList.remove('recing');
      const result = await stopAndAnalyze(ctrl, d.en, card, { enableMiscue: true });
      if (result?.mockFallback) { showRecordToast(recordErrorMessage(result.fallbackReason)); return; }
      onScore?.(result); // 통과 여부와 무관 — 말했으면 발화 1건 (체이닝과 동일)
      // 통과 = 커버리지 + 문장 정확도 하한 + 단어 하한 (judgeProduction, 2026-07-23 사용자 지적
      // "정확하게 발음 못했는데 패스" · "엉뚱한 단어도 통과"). 실패도 1회로 누적 — 3회면 정답 공개.
      const judge = judgeProduction(result, d.en, { minAccuracy: PROD_MIN_ACCURACY });
      if (judge.pass) reveal(true);
      else if (judge.missing.length) failOnce();
      else if (judge.badWords.length) failOnce(`발음이 어긋난 단어가 있어요: ${judge.badWords.slice(0, 2).join(', ')} — 또렷하게 다시`);
      else failOnce(`단어는 다 맞았어요 — 발음을 더 또렷하게 (${judge.accuracy}점)`);
    }

    recBtn.addEventListener('click', async () => {
      if (done) return;
      if (!started) { started = true; onStart?.(); }
      if (demo) {
        if (row.classList.contains('recing')) return;
        row.classList.add('recing'); recBtn.classList.add('recing');
        setTimeout(() => {
          row.classList.remove('recing'); recBtn.classList.remove('recing');
          onScore?.({ score: 90, weakPhonemes: [] });
          reveal(true);
        }, 800);
        return;
      }
      if (recCtrl && recRow === row) { finish(); return; }
      const r = await startMicRecording({ autoStopSilenceMs: 2000, onAutoStop: () => finish() });
      if (r.error) { showRecordToast(recordErrorMessage(r.error)); return; }
      recCtrl = r.controller; recRow = row;
      row.classList.add('recing'); recBtn.classList.add('recing');
    });
    playBtn.addEventListener('click', () => {
      if (playBtn.disabled) return;
      plays += 1;
      const v = pickPracticeVoice(plays, wcnt);
      speakWithFeedback(playBtn, d.en, { lang: ttsLang, voice: v.voice, rate: v.rate });
    });
    giveBtn.addEventListener('click', () => { if (!done) reveal(false); });
    return { row, reveal, i };
  });

  // 저장된 진행 복원 — reveal 을 행 순서대로 재생해 스트릭·완주 뱃지까지 같은 상태로 되돌린다.
  restoring = true;
  for (const r of rows) { if (rowsDone[r.i] !== undefined) r.reveal(rowsDone[r.i]); }
  restoring = false;
  if (!savedPicks.length) persist(); // 새로 추첨한 문항을 고정 저장

  return h('div', { class: 'vs-prodblock', style: 'margin-top:26px;' },
    h('div', { class: 'vs-labrow' }, h('span', { class: 'vs-lab' }, '생산 연습'),
      h('span', { class: 'ct' }, '통과 ', passEl, ' / ' + picks.length)),
    h('div', { style: 'margin-top:4px;' }, rows.map((r) => r.row)));
}

/* 모바일(phone/tablet) — 동일 로직, 단일 칼럼 셸(m-topb/m-steps/m-cta) + 해설 fold (작업지시서 모바일 §3-3) */
export const VSM_CSS = `
.vs{min-height:100vh;min-height:100dvh;background:var(--bg);color:var(--ink);font-family:Pretendard,sans-serif;word-break:keep-all;display:flex;flex-direction:column;${V_VARS}}
.vs *{box-sizing:border-box;margin:0}
.vs button{font:inherit;background:none;border:0;cursor:pointer;padding:0;color:inherit}
.m-topb{position:sticky;top:0;z-index:6;background:oklch(97.5% .009 95/.92);backdrop-filter:blur(8px);border-bottom:1px solid var(--line);padding:calc(9px + env(safe-area-inset-top)) 16px 11px;flex:0 0 auto}
.m-topb-row{display:flex;align-items:center;justify-content:space-between;gap:12px}
.m-home{display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:600;color:var(--mut)}
.m-topb-meta{font-family:Outfit,sans-serif;font-size:12px;color:var(--faint);letter-spacing:.04em;white-space:nowrap}
.m-topb-time{font-family:Outfit,sans-serif;font-size:12px;font-weight:600;color:var(--faint)}
.m-prog{display:flex;gap:4px;margin-top:9px}
.m-prog i{flex:1;height:4px;border-radius:2px;background:#e7e3d4}
.m-prog i.f{background:var(--teal)}
.m-steps{display:flex;align-items:center;gap:7px;padding:11px 20px 3px;flex:0 0 auto;overflow-x:auto}
.m-rstep{width:30px;height:30px;border-radius:10px;display:grid;place-items:center;font-family:Outfit;font-size:12.5px;font-weight:700;color:var(--faint);flex:0 0 auto}
.m-rstep.on{background:var(--teal-soft);color:var(--teal-deep);animation:v-haloT 2.4s ease-in-out infinite}
.m-rstep.done{color:var(--teal-deep)}
.m-steps .sp{flex:1}
.m-steps .pt{font-family:Outfit;font-size:12px;font-weight:600;color:var(--faint);white-space:nowrap}
.m-pad{padding:0 20px 24px;max-width:560px;margin:0 auto;width:100%}
.m-cta{flex:0 0 auto;background:oklch(97.5% .009 95/.96);backdrop-filter:blur(8px);border-top:1px solid var(--line);padding:12px 20px calc(12px + env(safe-area-inset-bottom))}
.m-cta .vs-gate{font-size:11.5px;color:var(--faint);text-align:center;margin-bottom:9px;white-space:nowrap}
.m-cta .vs-gate.ok{color:var(--teal-deep);font-weight:600}
.m-cta .vs-next{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;min-height:52px;border-radius:14px;font-size:15px;font-weight:700;white-space:nowrap;background:transparent;border:1.5px solid var(--line);color:var(--faint)}
.m-cta .vs-next.unlock{background:var(--teal);border-color:var(--teal);color:#fff;animation:v-breathe 2.6s ease-in-out infinite}
.scene-chip{display:inline-flex;font-family:Outfit;font-size:11px;font-weight:700;color:var(--teal-deep);background:var(--teal-soft);border-radius:999px;padding:5px 11px;letter-spacing:.02em;white-space:nowrap}
.vs-card{background:var(--card);border:1px solid var(--line);border-radius:20px;padding:24px 22px;margin-top:14px;box-shadow:0 1px 0 rgba(25,35,32,.02),0 12px 26px -20px rgba(25,35,32,.14)}
.vs-h1{font-family:Outfit;font-size:30px;font-weight:700;letter-spacing:-.03em;line-height:1.15}
.vs-h1 b{font-weight:700;background:linear-gradient(oklch(44% .062 192/.35),oklch(44% .062 192/.35)) 0 100%/100% 4px no-repeat;padding-bottom:4px}
.vs-ko{font-size:16px;color:var(--mut);margin-top:11px}
.vs-pron{font-size:12.5px;color:var(--faint);margin-top:5px}
.vs-ctrl{display:flex;align-items:center;gap:10px;margin-top:20px;flex-wrap:wrap}
/* 셀렉터에 button 을 붙여 명시도(0,0,1,1)를 위 '.vs button' 리셋과 동률로 올린다 — 안 그러면
   '.vs button' 의 padding:0 (0,0,1,1)이 '.vs-pill'(0,0,1,0)을 이겨 패딩이 0 이 되고, 타원 버튼
   경계에 글자가 붙어 삐져나온다(2026-07-18 iPhone 보고). '.vs-pill.pri' 등 파생(0,0,2,0)은
   여전히 background/border override 를 이겨 회귀 없음. 데스크톱 VS_CSS 엔 '.vs button' 리셋이 없어 무관. */
button.vs-pill{position:relative;display:inline-flex;align-items:center;gap:8px;border-radius:999px;padding:12px 18px;font-size:13.5px;font-weight:700;border:1.5px solid var(--line);background:#fff;color:var(--ink);white-space:nowrap;min-height:46px}
.vs-pill.playing{border-color:var(--blue-line);color:var(--blue-deep);background:var(--blue-soft)}
/* 녹음 CTA 는 코랄 — 색 규약 '코랄=녹음'(v2/atoms.js 머리주석)과 구 D1(terra) 관례. 2026-07-22 복원. */
.vs-pill.pri{background:var(--coral);border-color:var(--coral);color:#fff;animation:v-breatheC 2.6s ease-in-out infinite}
.vs-pill.recing{background:var(--coral-deep);border-color:var(--coral-deep);color:#fff;animation:none}
.vs-pill.recing::after{content:"";position:absolute;inset:-3px;border-radius:999px;border:1.5px solid var(--coral);animation:v-pulse 1.5s ease-out infinite}
.vs-pill.playing::after{content:"";position:absolute;inset:-3px;border-radius:999px;border:1.5px solid var(--blue);animation:v-pulse 1.5s ease-out infinite}
.vs-ring{position:relative;width:54px;height:54px;flex:0 0 auto;margin-left:auto}
.vs-ring svg{transform:rotate(-90deg)}
.vs-ring .cn{position:absolute;inset:0;display:grid;place-items:center;font-family:Outfit;font-size:15.5px;font-weight:700;color:var(--teal-deep)}
.vs-cap{display:none}
.vs-meta{display:flex;align-items:center;gap:10px;margin-top:18px;flex-wrap:wrap;color:var(--faint)}
.vs-meta .tot{font-family:Outfit;font-size:12px;font-weight:700;color:var(--mut);white-space:nowrap;margin-left:auto}
.vs-meta .tot b{color:var(--ink)}
.vs-rec{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px 18px 14px;margin-top:12px}
.vs-rec .hd{display:flex;justify-content:space-between;align-items:center;min-height:21px}
.vs-rec .lb{font-family:Outfit;font-size:10px;letter-spacing:.14em;font-weight:600;color:var(--faint);text-transform:uppercase}
.vs-newrec{display:inline-flex;align-items:center;gap:4px;font-family:Outfit;font-size:10.5px;font-weight:800;color:var(--coral-deep);background:var(--coral-soft);border-radius:999px;padding:4px 10px;white-space:nowrap;animation:v-settle .5s both}
.vs-rec .msg{font-size:11.5px;color:var(--mut);margin-top:8px;line-height:1.5;text-align:center}
.vs-rec .msg b{color:var(--coral-deep)}
.vs-uring{position:relative;margin:12px auto 0}
.vs-uring svg{transform:rotate(-90deg)}
.vs-uring .arc{transition:stroke-dashoffset .6s cubic-bezier(.3,.7,.3,1),stroke .3s}
.vs-uring .pl{position:absolute;inset:8px;border-radius:50%;border:1.5px solid var(--coral);animation:v-pulse 1.5s ease-out infinite}
.vs-uring .cn{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
.vs-uring .n{font-family:Outfit;font-size:34px;font-weight:700;line-height:1;color:var(--ink)}
.vs-uring .n em{font-style:normal;font-family:Outfit;font-size:13px;font-weight:700;color:var(--coral-deep);margin-left:5px}
.vs-uring .pv{font-family:Outfit;font-size:11px;font-weight:700;color:var(--teal-deep);margin-top:6px;white-space:nowrap}
.vs-uring .pv.over{color:var(--coral-deep)}
.vs-hist{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px 18px 18px;margin-top:12px}
.vs-hist .lb{font-family:Outfit;font-size:10px;letter-spacing:.14em;font-weight:600;color:var(--faint);text-transform:uppercase;white-space:nowrap}
.vs-labrow{display:flex;align-items:baseline;justify-content:space-between;margin-top:18px}
.vs-lab{font-family:Outfit;font-size:10px;letter-spacing:.13em;font-weight:600;color:var(--faint);text-transform:uppercase}
.vs-labrow .ct{font-family:Outfit;font-size:11px;color:var(--mut);font-weight:600}
.vs-labrow .ct b{color:var(--teal-deep)}
.vs-drow{display:flex;align-items:center;gap:11px;padding:12px 2px;border-bottom:1px solid var(--line)}
.vs-drow:last-of-type{border-bottom:0}
.vs-drow.recing{background:var(--coral-soft);margin:0 -10px;padding:12px 10px;border-radius:12px;border-bottom-color:transparent}
.vs-drow .ix{font-family:Outfit;font-size:11px;color:var(--faint);width:14px;flex:0 0 auto}
.vs-drow > div{min-width:0;flex:1}
.vs-drow .en{font-size:14.5px;font-weight:700;letter-spacing:-.01em}
.vs-drow .en b{font-weight:800;background:linear-gradient(oklch(44% .062 192/.3),oklch(44% .062 192/.3)) 0 100%/100% 2px no-repeat;padding-bottom:2px}
.vs-drow .sub{font-size:11.5px;color:var(--faint);margin-top:2px}
.vs-drow .grow{flex:0 0 auto}
.vs-cir{width:32px;height:32px;border-radius:50%;border:1.5px solid var(--line);background:#fff;color:var(--mut);display:grid;place-items:center;flex:0 0 auto;position:relative;padding:0}
.vs-cir.eqq{border-color:var(--blue-line);color:var(--blue)}
.vs-cir.recing{background:var(--coral);border-color:var(--coral);color:#fff}
.vs-cir.recing::after{content:"";position:absolute;inset:-3px;border-radius:50%;border:1.5px solid var(--coral);animation:v-pulse 1.5s ease-out infinite}
.vs-cir.playing::after{content:"";position:absolute;inset:-3px;border-radius:50%;border:1.5px solid var(--blue);animation:v-pulse 1.5s ease-out infinite}
.vs-gscore{display:inline-flex;align-items:center;gap:5px;white-space:nowrap}
.vs-fold{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px 18px;margin-top:12px}
.vs-fold .fhd{display:flex;justify-content:space-between;align-items:center;cursor:pointer}
.vs-fold .ft{font-family:Outfit;font-size:10px;letter-spacing:.14em;font-weight:600;color:var(--faint);text-transform:uppercase}
.vs-fold .chev{width:26px;height:26px;border-radius:50%;border:1.5px solid var(--line);display:grid;place-items:center;color:var(--mut);transition:transform .2s}
.vs-fold.open .chev{transform:rotate(180deg)}
.vs-fold .fbd{margin-top:13px}
.vs-fold .vs-panel{padding:0;border:0;background:none;margin:0}
.vs-fold .ph2d{display:none}
.vs-kbox{background:var(--teal-soft);border-radius:12px;padding:12px 14px;font-size:12.5px;line-height:1.6}
.vs-sec{margin-top:14px}
.vs-klab{font-family:Outfit;font-size:10px;letter-spacing:.14em;font-weight:600;color:var(--faint);text-transform:uppercase}
.vs-sec .b2{font-size:12.5px;line-height:1.65;color:var(--mut);margin-top:5px;text-wrap:pretty}
.vs-sec .b2 b{color:var(--ink)}
.vs-ex{margin-top:8px;font-size:12.5px;line-height:1.6}
.vs-ex .k{color:var(--mut)}
.vs-chips{display:flex;gap:6px;margin-top:7px;flex-wrap:wrap;max-width:100%}
.vs-chip{font-size:11px;color:var(--mut);border:1px solid var(--line);border-radius:12px;padding:4px 10px;background:#fbf9f2;max-width:100%;white-space:normal;word-break:keep-all;overflow-wrap:anywhere;line-height:1.5}
${V_DOT_CSS}${V_MINICAL_CSS}
`;

export function renderSessionExprV2(host, state, handlers = {}) {
  ensureV2Fonts();
  const lang = state.sentence?.lang || 'en';
  const ttsLang = lang === 'ja' ? 'ja-JP' : 'en-US';
  const subjLabel = lang === 'ja' ? '일본어' : '영어';
  const s = state.sentence;
  const ex = s?.explanation || {};
  // 카드별 연습 진행 (응용 행 점수 / 생산 연습 / 체이닝) — 재렌더·재마운트·새로고침 복원 (2026-08-21).
  // 스냅샷(activeSession)에 exLog 로 실려 나간다.
  if (!state.exLog || typeof state.exLog !== 'object') state.exLog = {};
  const cardEx = s?.id ? (state.exLog[s.id] ??= {}) : {};

  const hasScene = Array.isArray(state.cards[0]?.explanation?.dialogue);
  const offset = hasScene ? 1 : 0;
  const exprCards = state.cards.slice(offset);
  const total = exprCards.length;
  const idx = Math.max(1, state.step - offset);
  const sceneTitle = hasScene ? (state.cards[0].explanation.sceneTitle || '') : '';
  const expr = exprOf(s || {});
  // 오늘 발화의 분모 = 직전 학습일 발화 수 (§1-1). 0 = 직전 학습일 없음 → 비교 UI 미표시.
  const prevDay = Number(state.prevDayUtter) || 0;
  const todayISO = getTodayISO();

  // 좌측 레일 — 표현 스텝
  const rail = h('div', { class: 'vs-rail' },
    h('button', { class: 'hm', type: 'button', 'aria-label': '홈', onClick: handlers.onHome || (() => { window.location.hash = '#/home'; }) }, vIcon(VI.HOME, { size: 17 })),
    Array.from({ length: total }, (_, i) => h('button', {
      class: 'vs-rstep' + (i + 1 === idx ? ' on' : i + 1 < idx ? ' done' : ''), type: 'button',
      onClick: () => handlers.onJump?.(i + 1 + offset),
    }, String(i + 1))),
    h('span', { class: 'sp' }),
    h('span', { class: 'tm' }, state.time || '00:00'),
  );

  // ── 카드 컨트롤 (듣기 / 따라 말하기 / 점수 링) ──
  let playing = false, recCtrl = null;
  const listenPill = h('button', { class: 'vs-pill', type: 'button' }, vIcon(VI.PLAY, { size: 12, fill: true }), '듣기');
  const recPill = h('button', { class: 'vs-pill pri', type: 'button' }, vIcon(VI.MIC, { size: 14, sw: 2 }), '따라 말하기');
  const recCount = () => state.recLog?.[s?.id]?.count ?? 0;
  // 점수링 캡션 — 링에 뜬 값은 방금 받은 점수다. 점수 없이 시도만(응용 발화 등) 있으면 'N회 시도', 없으면 '아직 시도 전'.
  const capText = () => (state.lastScore != null ? '방금 점수' : (recCount() > 0 ? `${recCount()}회 시도` : '아직 시도 전'));
  const ring = ringEl(state.lastScore);
  const ringHost = h('div', { style: 'margin-left:auto;display:flex;align-items:center;gap:10px;' }, ring,
    h('span', { class: 'vs-cap', id: 'vs-cap' }, capText()));
  const ctrl = h('div', { class: 'vs-ctrl' }, listenPill, recPill, ringHost);

  const stopPlaying = () => { playing = false; listenPill.classList.remove('playing'); listenPill.lastChild.textContent = '듣기'; };
  let mainPlays = 0;
  listenPill.addEventListener('click', () => {
    if (state.recording) return;
    if (playing) { try { window.studySpeech?.cancel?.(); } catch { /* noop */ } stopPlaying(); return; }
    if (!s?.sentence || !window.studySpeech?.speak) return;
    playing = true; listenPill.classList.add('playing'); listenPill.lastChild.textContent = '재생 중';
    // 메인 카드도 재생마다 화자 순환 (2026-07-23 사용자 지시 — 응용·체이닝과 동일 원리).
    // 속도는 메인 학습 기본(0.85)을 유지 — 길이별 속도 규칙은 응용·체이닝 전용.
    // ja 는 PRACTICE_VOICES 가 en 전용이라 기존 speaker(AoiNeural) 경로 유지.
    if (lang === 'ja') {
      window.studySpeech.speak(s.sentence, { lang: ttsLang, speaker: s?.speaker, onEnd: stopPlaying });
    } else {
      const voice = PRACTICE_VOICES[mainPlays % PRACTICE_VOICES.length];
      mainPlays += 1;
      window.studySpeech.speak(s.sentence, { lang: ttsLang, voice, onEnd: stopPlaying });
    }
    setTimeout(stopPlaying, 30000);
  });

  /* 발화 점수 열 — 이 카드에서 말한 점수를 오래된 것 → 최신 순으로. 6회 이상이면 최근 5개만.
   * 점(dot)·콤보 칩·PASS 칩은 폐기 (§6.1) — 갱신의 근거는 '몇 번 눌렀나'가 아니라 '점수가 오르나'다. */
  const utterScores = () => (Array.isArray(cardEx.utter) ? cardEx.utter : []);
  const pushUtter = (score) => { (cardEx.utter ??= []).push(Math.round(Number(score) || 0)); };
  const dotsEl = h('span', { class: 'v-dots' });
  const totEl = h('span', { class: 'tot' }, '총 ', h('b', {}, '0'), '회');
  const meta = h('div', { class: 'vs-meta' }, vIcon(VI.MIC, { size: 14, sw: 2 }), dotsEl, totEl);

  // 우측 ① 오늘 발화 링 (분모 = 직전 학습일 발화) · ② 공부 이력 4주 캘린더
  const ring140 = utterRingCard({ size: 140 });
  const recWidget = ring140.el;
  const todayUtter = () => (Number(state.todayUtterBase) || 0) + (Number(state.tried) || 0);
  const histCard = historyCalCard(todayISO, state.dayMap, todayUtter);

  const refreshDots = () => {
    const all = utterScores();
    const shown = all.slice(-5);
    dotsEl.replaceChildren(...shown.map((v, i) => scoreDot(v, { size: 30, fresh: i === shown.length - 1 && all.length > 0 })));
    totEl.querySelector('b').textContent = String(recCount());
    // 게이트는 캡션이 아니라 버튼 활성/비활성으로만 표현한다 (§4.3 삭제).
    nextBtn.classList.toggle('unlock', canAdvance(state, s?.id) && recCount() >= REC_TARGET);
  };
  const refreshRecWidget = () => {
    ring140.update(todayUtter(), prevDay);
    histCard.update();
  };

  // 점수 → 리빌 적용 (state·DOM·애니). DB 쓰기는 실경로에서만 별도 호출. 데모 시뮬과 단일 출처 공유.
  let curRing = ring;
  function applyScore(score, weakPhonemes) {
    state.lastScore = score; state.tried = (state.tried || 0) + 1;
    const passed = score >= PASS_THRESHOLD;
    if (passed) { state.passed = (state.passed || 0) + 1; state.combo = (state.combo || 0) + 1; } else { state.combo = 0; }
    if (!Array.isArray(state.pronScores)) state.pronScores = [];
    state.pronScores.push(score);
    if (Array.isArray(weakPhonemes)) { if (!state.weakInSession) state.weakInSession = {}; for (const ph of weakPhonemes) if (ph) state.weakInSession[ph] = (state.weakInSession[ph] || 0) + 1; }
    bumpRecLog(state, s?.id, score);
    pushUtter(score);
    const newRing = ringEl(score); curRing.replaceWith(newRing); curRing = newRing; popScore(newRing);
    ringHost.lastChild.textContent = capText();
    refreshDots(); refreshRecWidget();
  }
  const setRecVisual = (on) => {
    recPill.classList.toggle('recing', on); recPill.classList.toggle('pri', !on);
    recPill.replaceChild(on ? vEq(4) : vIcon(VI.MIC, { size: 14, sw: 2 }), recPill.firstChild);
    recPill.lastChild.textContent = on ? '녹음 멈추기' : (recCount() > 0 ? '다시 말하기' : '따라 말하기');
  };

  recPill.addEventListener('click', async () => {
    // 데모(?demo=1&view=session) — 마이크 없이 녹음→리빌 시뮬레이션 (검증용).
    if (state.demo) {
      if (state.recording) return;
      state.recording = true; setRecVisual(true);
      setTimeout(() => {
        state.recording = false;
        applyScore(Math.min(88 + Math.min(recCount(), 2) * 3, 99), ['ð']);
        setRecVisual(false); // applyScore(bumpRecLog) 후 → 라벨 '다시 말하기' 반영
      }, 1000);
      return;
    }
    if (!state.recording) {
      state.recording = true; setRecVisual(true);
      // 말 끝나면(발화 후 1.2초 무음) 자동 종료 — 듣기처럼 손 안 대도 마무리. 수동 멈추기도 유지.
      const rec = await startMicRecording({ autoStopSilenceMs: 2000, onAutoStop: () => { finishRecording(); } });
      if (rec.error) {
        state.recording = false; recCtrl = null; state.micBlocked = true;
        setRecVisual(false);
        showRecordToast(recordErrorMessage(rec.error));
        return;
      }
      recCtrl = rec.controller;
    } else {
      finishRecording();
    }
  });

  // 녹음 종료·채점 — 수동 '멈추기' 클릭과 무음 자동종료가 공유. recCtrl null 가드로 중복 방지.
  async function finishRecording() {
    if (!state.recording || !recCtrl) return;
    const ctrlR = recCtrl; recCtrl = null;
    const result = await stopAndAnalyze(ctrlR, s.sentence, s);
    state.recording = false;
    if (result?.mockFallback) { setRecVisual(false); showRecordToast(recordErrorMessage(result.fallbackReason)); return; }
    applyScore(Number(result?.score) || 0, result?.weakPhonemes);
    setRecVisual(false); // applyScore(bumpRecLog) 후 → 라벨 '다시 말하기' 반영
    try {
      await savePronunciationLog(window.studyDB, { result, sentenceId: s.id, lang, date: getTodayISO() });
      await applyWeakPhonemesUpdate(window.studyDB, lang, result?.weakPhonemes);
    } catch (e) { console.error('[sessionExprV2] pron persist', e); }
    handlers.saveSnapshot?.();
  }

  // 다음 표현 버튼 + 게이트
  const nextBtn = h('button', { class: 'vs-next', type: 'button', onClick: handlers.onNext }, idx >= total ? '학습 완료 →' : '다음 표현 →');

  // 응용 연습 — 드릴 녹음도 세션 발화 1건으로 집계 ('오늘 발화' + 요약 통과율/평균/약점음소)
  // + 다음-표현 게이트(recLog count)에도 포함 (2026-07-01 사용자 지시 — 응용 발화도 3회 게이트에 셈).
  // 단 콤보·PASS 칩(연속 PASS 게이미피케이션)은 메인 표현 전용 — drill 미반영 유지.
  // 근접중복(호칭·감탄사만 덧붙인 드릴)은 렌더에서 제외 — 원본 데이터는 손대지 않음(사용자 결정 2026-07-09).
  const drills = filterNearDupDrills(s?.sentence, ex.drills);
  const savedDrills = cardEx.drills || {};
  const recordedDrills = new Set(Object.keys(savedDrills).map(Number));
  const drillCountEl = h('b', {}, String(Math.min(recordedDrills.size, drills.length)));
  const onDrillScore = (i, result) => {
    const score = Math.round(Number(result?.score) || 0);
    state.tried = (state.tried || 0) + 1;
    if (score >= PASS_THRESHOLD) state.passed = (state.passed || 0) + 1;
    if (!Array.isArray(state.pronScores)) state.pronScores = [];
    state.pronScores.push(score);
    if (Array.isArray(result?.weakPhonemes)) { if (!state.weakInSession) state.weakInSession = {}; for (const ph of result.weakPhonemes) if (ph) state.weakInSession[ph] = (state.weakInSession[ph] || 0) + 1; }
    if (!recordedDrills.has(i)) { recordedDrills.add(i); drillCountEl.textContent = String(Math.min(recordedDrills.size, drills.length)); }
    bumpRecLog(state, s?.id, score);  // 응용 발화도 '다음 표현' 3회 게이트에 카운트
    // 행 점수 영속화 (재렌더 복원) — 시도마다 누적해 점수 원이 늘어난다.
    const rows = ((cardEx.drills ??= {}));
    rows[i] = [...normScores(rows[i]), score];
    pushUtter(score);
    refreshDots();
    ringHost.lastChild.textContent = capText();
    refreshRecWidget();
    handlers.saveSnapshot?.();
  };
  // 생산 연습 시작 시 자동 접힘(답 훔쳐보기 방지) — 펼치기는 자유 (2026-07-22).
  const drillList = h('div', { class: 'vs-drills-list', style: 'margin-top:4px;' }, drillRows(drills, expr, lang, onDrillScore, state.demo, { saved: savedDrills }));
  // 데스크톱 VS_CSS 엔 '.vs button' 리셋이 없으므로 (L483 주석) 네이티브 버튼 크롬을 인라인으로 제거.
  const unfoldBtn = h('button', { class: 'vs-drills-unfold', type: 'button', style: 'display:none;text-align:left;padding:6px 0;font:inherit;font-size:12.5px;font-weight:600;color:var(--faint);background:none;border:0;cursor:pointer;' }, '응용 목록 펼치기 ▾');
  unfoldBtn.addEventListener('click', () => { drillList.style.display = ''; unfoldBtn.style.display = 'none'; });
  const collapseDrills = () => {
    if (!drills.length || drillList.style.display === 'none') return;
    drillList.style.display = 'none'; unfoldBtn.style.display = '';
  };
  const drillsBlock = drills.length ? h('div', {},
    h('div', { class: 'vs-labrow' }, h('span', { class: 'vs-lab' }, '응용 연습'), h('span', { class: 'ct' }, '녹음 ', drillCountEl, ' / ' + drills.length)),
    drillList, unfoldBtn,
  ) : null;

  // 체이닝(chain) — 확장 사다리(ladder) 폐기 후속. 자막 없이 듣고 따라 말하기 + 단어 누락 0 통과.
  // 체이닝 발화도 세션 발화 1건 (드릴과 동일하게 '오늘 발화'·3회 게이트에 집계).
  // 단 '통과'(passed) 는 발음 점수 기준을 유지 — 체이닝의 통과/실패는 단계 진행에만 쓰인다.
  const onChainScore = (result) => {
    const score = Math.round(Number(result?.score) || 0);
    state.tried = (state.tried || 0) + 1;
    if (score >= PASS_THRESHOLD) state.passed = (state.passed || 0) + 1;
    if (!Array.isArray(state.pronScores)) state.pronScores = [];
    state.pronScores.push(score);
    if (Array.isArray(result?.weakPhonemes)) { if (!state.weakInSession) state.weakInSession = {}; for (const ph of result.weakPhonemes) if (ph) state.weakInSession[ph] = (state.weakInSession[ph] || 0) + 1; }
    bumpRecLog(state, s?.id, score);
    pushUtter(score);
    refreshDots();
    ringHost.lastChild.textContent = capText();
    refreshRecWidget();
    handlers.saveSnapshot?.();
  };
  const chainBlock = chainBlockEl(ex.chain, lang, s, state.demo, onChainScore, {
    saved: cardEx.chain,
    onSave: (v) => { cardEx.chain = v; handlers.saveSnapshot?.(); },
  });

  // 생산 연습(한→영) — 응용 아래·체이닝 위. 발화 집계는 체이닝과 동일 경로(onChainScore) 재사용.
  const prodBlock = productionBlockEl(drills, lang, s, state.demo, onChainScore, {
    onStart: collapseDrills,
    saved: cardEx.prod,
    onSave: (v) => { cardEx.prod = v; handlers.saveSnapshot?.(); },
  });

  const progBars = Array.from({ length: total }, (_, i) => h('i', { class: i < idx ? 'f' : '' }));

  const cardEl = h('div', { class: 'vs-card' },
    h('h1', { class: 'vs-h1' }, hlNode(s?.sentence || '', expr || pickUnderline(s?.sentence))),
    h('div', { class: 'vs-ko' }, s?.ko || ''),
    s?.pron ? h('div', { class: 'vs-pron' }, s.pron) : null,
    ctrl, meta);

  let root, timeUpdate;
  if (state.size !== 'desktop') {
    // ── 모바일 단일 칼럼 ──
    const mTime = h('span', { class: 'm-topb-time' }, state.time || '00:00');
    const mTopb = h('div', { class: 'm-topb' },
      h('div', { class: 'm-topb-row' },
        h('button', { class: 'm-home', type: 'button', onClick: handlers.onHome || (() => { window.location.hash = '#/home'; }) }, vIcon(VI.HOME, { size: 14 }), '홈으로'),
        h('span', { class: 'm-topb-meta' }, '신규 학습 · ' + subjLabel),
        mTime),
      h('div', { class: 'm-prog' }, progBars));
    const mSteps = h('div', { class: 'm-steps' },
      Array.from({ length: total }, (_, i) => h('button', { class: 'm-rstep' + (i + 1 === idx ? ' on' : i + 1 < idx ? ' done' : ''), type: 'button', onClick: () => handlers.onJump?.(i + 1 + offset) }, String(i + 1))),
      h('span', { class: 'sp' }), h('span', { class: 'pt' }, `${idx} / ${total}`));
    const foldBd = h('div', { class: 'fbd', style: 'display:none;' }, explainPanel(ex));
    const fhd = h('div', { class: 'fhd' }, h('span', { class: 'ft' }, '표현 해설'), h('span', { class: 'chev' }, vIcon(VI.CHEV_DOWN, { size: 13, sw: 2 })));
    const fold = h('div', { class: 'vs-fold' }, fhd, foldBd);
    fhd.addEventListener('click', () => { const open = fold.classList.toggle('open'); foldBd.style.display = open ? '' : 'none'; });
    const sceneChip = sceneTitle ? `${sceneTitle} · ${subjLabel}` : `신규 학습 · ${subjLabel}`;
    root = h('div', { class: 'vs' }, v2Style(VSM_CSS),
      mTopb, mSteps,
      h('div', { class: 'm-pad' },
        h('div', { style: 'margin-top:8px;' }, h('span', { class: 'scene-chip' }, sceneChip)),
        cardEl, recWidget, histCard.el, drillsBlock, prodBlock, chainBlock, fold),
      h('div', { class: 'm-cta' }, nextBtn));
    timeUpdate = (t) => { mTime.textContent = t; };
  } else {
    // ── 데스크톱 3칼럼 ──
    // 해설은 기본 접힘 — 접힌 상태엔 정의 박스만 (§6.6 ③). 펼치면 기존 5섹션이 순서 그대로.
    const foldPanel = explainPanel(ex);
    const fhd2 = foldPanel.querySelector('.ph2d');
    fhd2.replaceChild(h('span', { class: 'chev' }, vIcon(VI.CHEV_DOWN, { size: 13, sw: 2 })), fhd2.lastChild);
    const inner2 = foldPanel.querySelector('.inner');
    const secs = [...inner2.children].filter((n) => !n.classList.contains('vs-kbox'));
    const secBody = h('div', { class: 'vs-secs', style: 'display:none;' }, secs);
    inner2.appendChild(secBody);
    fhd2.addEventListener('click', () => {
      const open = foldPanel.classList.toggle('open');
      secBody.style.display = open ? '' : 'none';
    });
    const main = h('div', { class: 'vs-main' },
      h('div', { class: 'vs-crumb' },
        h('span', { class: 'vs-scene' }, (sceneTitle || '신규 학습') + ' · ' + subjLabel),
        h('div', { class: 'vs-prog' }, progBars),
        h('span', { class: 'vs-prog-t' }, `${idx} / ${total}`)),
      cardEl, drillsBlock, prodBlock, chainBlock);
    const side = h('aside', { class: 'vs-side' }, recWidget, histCard.el, foldPanel, nextBtn);
    root = h('div', { class: 'vs' }, v2Style(VS_CSS), rail, h('div', { class: 'vs-mainwrap' }, main, side));
    timeUpdate = (t) => { const el = rail.querySelector('.tm'); if (el) el.textContent = t; };
  }
  host.appendChild(root);
  refreshDots(); refreshRecWidget();

  const layout = { update(st) { if (st && 'time' in st) timeUpdate(st.time); } };
  return { cleanup: () => { try { window.studySpeech?.cancel?.(); if (recCtrl?.stop) recCtrl.stop(); } catch { /* noop */ } host.innerHTML = ''; }, layout };
}

// 표현 키가 없을 때 밑줄 대상 — 마지막 단어(대략) 강조.
function pickUnderline(sentence) {
  if (!sentence) return null;
  const words = String(sentence).replace(/[?.!,]/g, '').split(' ').filter(Boolean);
  return words.length ? words[words.length - 1] : null;
}
