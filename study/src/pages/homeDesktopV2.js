/* 홈 — 데스크톱 C 파이널 v2 (작업지시서 §1)
 * 신규 학습 진입 3상태: fresh(학습 시작) / mid(이어서 하기) / done(다시 듣기)
 * 정본 시안: 작업지시서 v-home.jsx (HomeV2)
 *
 * phase 파생:
 *   resume==='new'            → mid  (activeSession 스냅샷 존재)
 *   newCount===0 && 오늘 신규 진행 흔적 → done
 *   그 외(newCount>=1)        → fresh
 *
 * 데이터: home.js state. demo 모드는 DEMO_FIXTURES 로 시안 재현(검증용).
 */
import { h } from '../components/d1/dom.js';
import { localISODate } from '../utils/today.js';
import { V_VARS, VI, vIcon, vEq, vCheck, v2Style, ensureV2Fonts, DOW_KO, isoShift, mondayOf } from '../components/v2/atoms.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const VH_CSS = `
.vh{width:100%;min-height:100vh;min-height:100dvh;background:var(--bg);color:var(--ink);font-family:Pretendard,sans-serif;word-break:keep-all;${V_VARS}}
.vh *{box-sizing:border-box;margin:0}
.vh-wrap{width:100%;max-width:1120px;margin:0 auto;padding:30px 28px 36px}
.vh-top{display:flex;justify-content:space-between;align-items:center}
.vh-logo{font-family:Outfit,sans-serif;font-weight:700;font-size:20px;letter-spacing:-0.02em;color:var(--teal-deep)}
.vh-seg{display:flex;gap:22px}
.vh-seg button{font:inherit;background:none;border:0;cursor:pointer;font-size:14px;font-weight:600;color:var(--faint);display:inline-flex;align-items:center;gap:7px;white-space:nowrap;padding:0}
.vh-seg button.on{color:var(--teal-deep)}
.vh-seg button.on i{width:6px;height:6px;border-radius:50%;background:var(--coral)}
.vh-icons{display:flex;gap:14px;color:var(--faint)}
.vh-icons button{background:none;border:0;padding:0;color:inherit;cursor:pointer;display:inline-flex}
.vh-main{margin-top:26px;display:grid;grid-template-columns:minmax(0,1fr) 356px;gap:22px;align-items:start}
.vh-col{display:flex;flex-direction:column;gap:14px;min-width:0}
.vh-card{background:var(--card);border:1px solid var(--line);border-radius:22px;
  box-shadow:0 1px 0 rgba(25,35,32,.02),0 10px 22px -18px rgba(25,35,32,.12)}
.vh-lab{font-family:Outfit;font-size:10.5px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:var(--faint);white-space:nowrap}

/* ── 최근 4주 캘린더 (§5.3) ── */
.vh-calcard{padding:26px 28px}
.vh-calhd{display:flex;justify-content:space-between;align-items:baseline}
.vh-calhd .mo{font-family:Outfit;font-size:11.5px;font-weight:600;letter-spacing:.06em;color:var(--faint)}
.vh-calgrid{display:grid;grid-template-columns:repeat(7,1fr) 150px;gap:8px}
.vh-caldow{margin-top:16px;font-family:Outfit;font-size:10.5px;font-weight:600;letter-spacing:.08em;color:var(--faint);text-align:center}
.vh-caldow .wk{text-align:left;letter-spacing:.04em;padding-left:16px}
.vh-calcells{margin-top:10px}
.vh-cell{height:72px;border-radius:12px;padding:8px 10px;display:flex;flex-direction:column;justify-content:space-between;animation:v-settle .4s both}
.vh-cell .dt{font-size:10.5px;font-weight:600;line-height:1}
.vh-cell .vv{font-family:Outfit;font-size:17px;font-weight:700;letter-spacing:-.02em;line-height:1}
.vh-cell.t0{background:var(--card);border:1px solid #eeeadd;padding:7px 9px}
.vh-cell.t0 .dt{color:#c9c2b0}
.vh-cell.t1{background:oklch(44% .062 192/.15)}
.vh-cell.t1 .dt{color:oklch(30% .055 192/.5)}
.vh-cell.t1 .vv{color:oklch(32% .055 192)}
.vh-cell.t2{background:oklch(44% .062 192/.3)}
.vh-cell.t2 .dt{color:oklch(30% .055 192/.55)}
.vh-cell.t2 .vv{color:oklch(30% .055 192)}
.vh-cell.t3{background:oklch(44% .062 192/.48)}
.vh-cell.t3 .dt{color:oklch(30% .055 192/.6)}
.vh-cell.t3 .vv{color:oklch(28% .05 192)}
.vh-cell.t4{background:oklch(46% .06 192)}
.vh-cell.t4 .dt{color:rgba(255,255,255,.65)}
.vh-cell.t4 .vv{color:#fff}
.vh-cell.pr{background:var(--coral);border:0;padding:8px 10px;box-shadow:inset 0 0 0 2px rgba(255,255,255,.4),0 6px 14px -8px oklch(58% .115 32/.8)}
.vh-cell.pr .dt{color:rgba(255,255,255,.75)}
.vh-cell.pr .vv{color:#fff;font-size:18px}
.vh-cell.today{background:var(--card);border:0;padding:8px 10px;animation:v-settle .4s both,vh-today 2.4s 1s ease-in-out infinite}
.vh-cell.today .dt{color:var(--coral-deep);font-weight:700}
.vh-cell.today .vv{font-family:Pretendard,sans-serif;font-size:10px;font-weight:700;color:var(--coral-deep);letter-spacing:.04em}
.vh-cell.fut{background:transparent;border:0;padding:7px 9px}
.vh-cell.fut .dt{color:#d8d2c2;font-weight:400}
@keyframes vh-today{0%,100%{outline:2.2px solid var(--coral);outline-offset:2px}50%{outline:2.2px solid oklch(58% .115 32/.3);outline-offset:5px}}
.vh-wkcol{grid-column:8;grid-row:1/5;border-left:1px solid #f1ede0;padding-left:16px;display:flex;flex-direction:column;gap:8px}
.vh-wk{height:72px;display:flex;flex-direction:column;justify-content:center;gap:8px}
.vh-wk .v{font-family:Outfit;font-size:16px;font-weight:700;letter-spacing:-.02em;line-height:1;color:var(--ink);white-space:nowrap}
.vh-wk .v em{font-style:normal;font-size:10.5px;font-weight:700;margin-left:5px;letter-spacing:.02em}
.vh-wk.best .v{color:var(--coral-deep)}
.vh-wk.now .v{color:#b8b1a0}
.vh-wk .tr{height:7px;border-radius:999px;background:#ece8da;position:relative}
.vh-wk .tr > i{position:absolute;left:0;top:0;bottom:0;border-radius:999px;background:var(--teal);animation:v-fill .9s cubic-bezier(.3,.7,.3,1) both}
.vh-wk.best .tr > i{background:var(--coral)}
.vh-wk .tr > b{position:absolute;top:50%;transform:translate(-50%,-50%);width:9px;height:9px;border-radius:50%;background:var(--teal-deep);box-shadow:0 0 0 3px var(--card)}

/* ── 누적 (§5.6) ── */
.vh-cum{padding:20px 26px 22px;display:grid;gap:20px}
.vh-cum .k{font-size:11.5px;font-weight:600;color:var(--faint)}
.vh-cum .v{font-family:Outfit;font-size:21px;font-weight:700;letter-spacing:-.02em;color:var(--ink);margin-top:5px;white-space:nowrap}
.vh-cum .v em{font-style:normal;font-size:12px;color:var(--faint);font-weight:600}

/* ── 오늘 발화 링 (§5.4) ── */
.vh-todaycard{padding:22px 24px}
.vh-todayhd{display:flex;justify-content:space-between;align-items:baseline}
.vh-todayhd .d{font-size:14px;font-weight:700;color:var(--ink)}
.vh-todayhd .t{font-size:12px;font-weight:600;color:var(--faint)}
.vh-ringwrap{display:flex;justify-content:center;margin-top:16px;margin-bottom:6px}
.vh-ring2{position:relative;width:172px;height:172px}
.vh-ring2 svg{transform:rotate(-90deg)}
.vh-ring2 .arc{transition:stroke-dashoffset .6s cubic-bezier(.3,.7,.3,1),stroke .3s}
.vh-ring2 .pl{position:absolute;inset:8px;border-radius:50%;border:1.5px solid var(--coral);animation:v-pulse 1.5s ease-out infinite}
.vh-ring2 .cn{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
.vh-ring2 .cn .lb{font-size:11.5px;font-weight:600;color:var(--faint)}
.vh-ring2 .cn .n{font-family:Outfit;font-size:50px;font-weight:700;letter-spacing:-.04em;line-height:1;color:var(--ink);margin-top:7px;animation:v-settle .6s .3s both}
.vh-ring2 .cn .pv{font-family:Outfit;font-size:13px;font-weight:700;color:var(--teal-deep);margin-top:8px}
.vh-ring2 .cn .pv.over{color:var(--faint);text-decoration:line-through}

/* ── CTA 3개 (§5.5) ── */
.vh-ctacard{padding:20px 24px 22px;display:flex;flex-direction:column;gap:10px}
.vh-cta{display:flex;align-items:center;justify-content:space-between;gap:12px;font:inherit;text-align:left;border-radius:14px;cursor:pointer;transition:background .15s}
.vh-cta .t1{display:block;font-size:14.5px;font-weight:700}
.vh-cta .t2{display:block;font-size:11.5px;color:var(--faint);margin-top:3px}
.vh-cta.pri{color:var(--card);background:var(--teal);border:0;padding:15px 18px;animation:v-breathe 2.6s ease-in-out infinite}
.vh-cta.pri .t1{font-size:15px}
.vh-cta.pri .t2{color:inherit;opacity:.85}
.vh-cta.pri:hover{background:oklch(39% .06 192)}
.vh-cta.rev{color:var(--coral-deep);background:transparent;border:1.5px solid oklch(58% .115 32/.5);padding:14px 18px}
.vh-cta.rev:hover{background:oklch(58% .115 32/.07)}
.vh-cta.sec{color:var(--ink);background:transparent;border:1.5px solid var(--line);padding:14px 18px}
.vh-cta.sec:hover{background:#f8f6ee}
.vh-cta .go{font-size:13px;font-weight:700;color:var(--faint);flex:0 0 auto}
@media (max-width:980px){
  .vh-main{grid-template-columns:1fr}
  .vh-calgrid{grid-template-columns:repeat(7,1fr)}
  .vh-wkcol{display:none}
}
`;

const DOWS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DOW_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function dateLabel(iso) {
  const d = new Date(iso + 'T00:00:00Z');
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()} · ${DOW_FULL[d.getUTCDay()]}`;
}

function ringSvg(offset, color, withCap) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', '212'); svg.setAttribute('height', '212'); svg.setAttribute('viewBox', '0 0 212 212');
  const track = document.createElementNS(SVG_NS, 'circle');
  track.setAttribute('cx', '106'); track.setAttribute('cy', '106'); track.setAttribute('r', '84');
  track.setAttribute('fill', 'none'); track.setAttribute('stroke', '#ece9db'); track.setAttribute('stroke-width', '12');
  svg.appendChild(track);
  if (offset < 528) {
    const arc = document.createElementNS(SVG_NS, 'circle');
    arc.setAttribute('class', 'arc');
    arc.setAttribute('cx', '106'); arc.setAttribute('cy', '106'); arc.setAttribute('r', '84');
    arc.setAttribute('fill', 'none'); arc.setAttribute('stroke', color); arc.setAttribute('stroke-width', '12');
    arc.setAttribute('stroke-linecap', 'round'); arc.setAttribute('stroke-dasharray', '528'); arc.setAttribute('stroke-dashoffset', String(offset));
    svg.appendChild(arc);
  }
  if (withCap) {
    const cap = document.createElementNS(SVG_NS, 'circle');
    cap.setAttribute('class', 'vh-cap');
    cap.setAttribute('cx', '190'); cap.setAttribute('cy', '106'); cap.setAttribute('r', '5');
    cap.setAttribute('fill', 'none'); cap.setAttribute('stroke', 'oklch(44% .062 192/.55)'); cap.setAttribute('stroke-width', '2.5');
    svg.appendChild(cap);
  }
  return svg;
}

function langSeg(state) {
  const subs = [
    { key: 'en', label: '영어' },
    { key: 'ja', label: '일본어' },
    { key: 'math', label: '수학' },
  ];
  return h('div', { class: 'vh-seg' }, subs.map((s) => {
    const on = s.key === state.lang;
    return h('button', {
      class: on ? 'on' : '', type: 'button',
      onClick: () => { if (typeof state.onLangChange === 'function') state.onLangChange(s.key); },
    }, on ? h('i') : null, s.label);
  }));
}

/* ────────── 홈 v3 (작업지시서 §5) — 데스크톱 전용 빌더 ──────────
 * 좌: 최근 4주 캘린더 + 누적 4열 / 우: 오늘 발화 링 + CTA 3개.
 * 분모는 고정 목표가 아니라 '직전 학습일 발화 수' (§1-1).
 */

/* state.todayISO 는 home.js 가 항상 채우지만, 단독 렌더(테스트·mock)엔 없을 수 있다. */
function todayOf(state) {
  return state?.todayISO || (typeof window !== 'undefined' && window.studyDay?.TODAY_ISO) || localISODate();
}

const RING_R = 73;
const RING_C = 458.7; // 2πr — 시안 값

/* 8월 25일 화요일 (영문 날짜 표기 금지 — §11) */
function koDateLabel(iso) {
  const d = new Date(iso + 'T00:00:00Z');
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 ${DOW_KO[(d.getUTCDay() + 6) % 7]}요일`;
}

/* 최근 4주(월요일 시작) 날짜 ISO 28개 — 오늘이 속한 주가 마지막. */
function fourWeekDays(todayISO) {
  const start = isoShift(mondayOf(todayISO), -21);
  return Array.from({ length: 28 }, (_, i) => isoShift(start, i));
}

/* 발화량 5단 — 0 은 미학습, 1~4 는 창 안 비영값의 사분위(§5.3 "데이터 분포로 결정").
 * 절대 구간을 박으면 하루 8회 쓰는 사람과 40회 쓰는 사람 중 한쪽은 계조가 죽는다. */
function makeTierFn(values) {
  const vals = values.filter((v) => v > 0).sort((x, y) => x - y);
  if (!vals.length) return () => 0;
  const q = (pct) => vals[Math.min(vals.length - 1, Math.floor(vals.length * pct))];
  const q1 = q(0.25), q2 = q(0.5), q3 = q(0.75);
  return (v) => (!v ? 0 : v <= q1 ? 1 : v <= q2 ? 2 : v <= q3 ? 3 : 4);
}

function calendarCard(state, d) {
  const today = todayOf(state);
  const dayMap = state.dayMap || {};
  const prDays = new Set(state.prDays || []);
  const days = fourWeekDays(today);
  const valOf = (iso) => (iso === today ? (Number(state.tried) || 0) : (Number(dayMap[iso]) || 0));
  const tierOf = makeTierFn(days.filter((iso) => iso <= today).map(valOf));

  const cells = days.map((iso, i) => {
    const dnum = String(+iso.slice(8, 10));
    if (iso > today) return h('div', { class: 'vh-cell fut' }, h('span', { class: 'dt' }, dnum));
    const v = valOf(iso);
    // 오늘 칸은 발화 수 대신 '오늘' — 오늘의 숫자는 바로 옆 링이 크게 말한다 (§5.3).
    if (iso === today) {
      return h('div', { class: 'vh-cell today', style: `animation-delay:${i * 12}ms` },
        h('span', { class: 'dt' }, dnum),
        h('span', { class: 'vv' }, '오늘'));
    }
    const isPR = prDays.has(iso) && v > 0;
    return h('div', { class: 'vh-cell ' + (isPR ? 'pr' : 't' + tierOf(v)), style: `animation-delay:${i * 12}ms` },
      h('span', { class: 'dt' }, dnum),
      v > 0 ? h('span', { class: 'vv' }, String(v)) : null);
  });

  // 주 발화 4블록 — 마지막이 진행 중인 주.
  const sums = [0, 1, 2, 3].map((w) => days.slice(w * 7, w * 7 + 7)
    .filter((iso) => iso <= today).reduce((acc, iso) => acc + valOf(iso), 0));
  const mx = Math.max(...sums, 1);
  const bestVal = Math.max(...sums.slice(0, 3));
  const weeks = sums.map((v, w) => {
    const isNow = w === 3;
    const isBest = !isNow && v > 0 && v === bestVal;
    const track = h('div', { class: 'tr' },
      v > 0 ? h('i', { style: `width:${Math.round((v / mx) * 100)}%;animation-delay:${[0.1, 0.25, 0.4, 0.4][w]}s` }) : null,
      isNow && sums[2] > 0 ? h('b', { style: `left:${Math.round((sums[2] / mx) * 100)}%` }) : null);
    return h('div', { class: 'vh-wk' + (isBest ? ' best' : '') + (isNow ? ' now' : '') },
      h('span', { class: 'v' }, String(v), isBest ? h('em', {}, '최고') : null), track);
  });

  return h('div', { class: 'vh-card vh-calcard' },
    h('div', { class: 'vh-calhd' },
      h('span', { class: 'vh-lab' }, '최근 4주 · 발화 기록'),
      h('span', { class: 'mo' }, `${+today.slice(0, 4)} · ${+today.slice(5, 7)}월`)),
    h('div', { class: 'vh-calgrid vh-caldow' },
      DOW_KO.map((w) => h('span', {}, w)), h('span', { class: 'wk' }, '주 발화')),
    h('div', { class: 'vh-calgrid vh-calcells' },
      h('div', { class: 'vh-wkcol' }, weeks), cells),
  );
}

/* 42시간 10분 */
function hourMin(sec) {
  const total = Math.max(0, Math.round(Number(sec) || 0) / 60);
  return [Math.floor(total / 60), Math.round(total % 60)];
}

function cumCard(state, d) {
  const isMath = state.lang === 'math';
  const cells = [];
  if (state.cumStudySec != null) {
    const [hh, mm] = hourMin(state.cumStudySec);
    cells.push(['누적 공부 시간', [String(hh), h('em', {}, '시간'), ' ' + mm, h('em', {}, '분')]]);
  }
  cells.push([isMath ? '총 시도' : '총 발화', [(d.cumUtter || 0).toLocaleString(), h('em', {}, isMath ? '문제' : '회')]]);
  cells.push([isMath ? '배운 문제' : '배운 표현', [String(d.cumExpr), h('em', {}, '개')]]);
  cells.push([isMath ? '마스터한 문제' : '마스터한 문장', [String(d.cumMaster), h('em', {}, '개')]]);
  return h('div', { class: 'vh-card vh-cum', style: `grid-template-columns:repeat(${cells.length},1fr)` },
    cells.map(([k, v]) => h('div', {}, h('div', { class: 'k' }, k), h('div', { class: 'v' }, v))));
}

/* 직전 학습일 발화 수 — 오늘보다 앞선 가장 최근 학습일. 없으면 0 (분모 없음 → 비교 UI 미표시). */
function prevDayUtterance(dayMap, todayISO) {
  let best = null;
  for (const iso in (dayMap || {})) {
    if (iso >= todayISO || !(Number(dayMap[iso]) > 0)) continue;
    if (best === null || iso > best) best = iso;
  }
  return best ? Number(dayMap[best]) || 0 : 0;
}

function todayRingCard(state) {
  const todayISO = todayOf(state);
  const todayN = Number(state.tried) || 0;
  const prev = prevDayUtterance(state.dayMap, todayISO);
  const over = prev > 0 && todayN > prev;
  const ratio = prev > 0 ? Math.min(todayN / prev, 1) : 0;
  const offset = over ? 0 : RING_C * (1 - ratio);
  const color = over ? 'oklch(58% .115 32)' : 'oklch(44% .062 192)';

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', '172'); svg.setAttribute('height', '172'); svg.setAttribute('viewBox', '0 0 172 172');
  for (const [cls, stroke, off] of [['tk', over ? 'oklch(58% .115 32/.15)' : '#ece8da', null], ['arc', color, offset]]) {
    const c = document.createElementNS(SVG_NS, 'circle');
    c.setAttribute('class', cls);
    c.setAttribute('cx', '86'); c.setAttribute('cy', '86'); c.setAttribute('r', String(RING_R));
    c.setAttribute('fill', 'none'); c.setAttribute('stroke', stroke); c.setAttribute('stroke-width', '11');
    if (off !== null) {
      c.setAttribute('stroke-linecap', 'round');
      c.setAttribute('stroke-dasharray', String(RING_C));
      c.setAttribute('stroke-dashoffset', String(Math.round(off * 10) / 10));
    }
    svg.appendChild(c);
  }

  return h('div', { class: 'vh-card vh-todaycard' },
    h('div', { class: 'vh-todayhd' },
      h('span', { class: 'd' }, koDateLabel(todayISO)),
      h('span', { class: 't' }, '오늘')),
    h('div', { class: 'vh-ringwrap' },
      h('div', { class: 'vh-ring2' }, svg,
        over ? h('i', { class: 'pl' }) : null,
        h('span', { class: 'cn' },
          h('span', { class: 'lb' }, '오늘 발화'),
          h('span', { class: 'n' }, String(todayN)),
          prev > 0 ? h('span', { class: 'pv' + (over ? ' over' : '') }, `직전 ${prev}회`) : null))),
  );
}

/* CTA 3개 — 1번 라벨은 기존 phase 분기를 그대로 따른다(fresh/mid/done). */
function ctaCard(state, d) {
  const isMath = state.lang === 'math';
  const newUnit = isMath ? '문제' : '표현';
  const reviewUnit = isMath ? '문제' : '문장';
  const goNew = () => { window.location.hash = isMath ? '#/session-math?mode=new' : '#/session-new'; };
  const goReview = () => {
    if (isMath) { window.location.hash = '#/session-math?mode=review'; return; }
    window.location.hash = d.reviewFree ? '#/session-review?mode=free' : '#/session-review';
  };

  const newLabel = d.phase === 'done' ? '다시 듣기' : d.phase === 'mid' ? '이어서 하기' : '학습 시작';
  const newSub = d.phase === 'done'
    ? d.doneNewMeta
    : d.phase === 'mid'
      ? `남은 ${newUnit} ${state.newCount}개 · 약 ${d.newMin}분 남음`
      : `${d.sceneChip} · ${newUnit} ${state.newCount}개 · 약 ${d.newMin}분`;

  const showReview = state.reviewCount >= 1 || (!isMath && state.totalReview >= 1);
  const reviewN = d.reviewFree ? state.totalReview : state.reviewCount;
  const reviewSub = d.reviewFree
    ? `복습 큐 ${state.totalReview}${reviewUnit} · 원하는 만큼`
    : `복습 ${reviewUnit} ${reviewN} · 오늘이 적기 · 약 ${d.reviewMin}분`;

  return h('div', { class: 'vh-card vh-ctacard' },
    h('button', { class: 'vh-cta pri', type: 'button', onClick: goNew },
      h('span', {}, h('span', { class: 't1' }, newLabel), h('span', { class: 't2' }, newSub)),
      vIcon(VI.PLAY, { size: 14, fill: true })),
    showReview ? h('button', { class: 'vh-cta rev', type: 'button', onClick: goReview },
      h('span', {}, h('span', { class: 't1' }, d.reviewFree ? '자유 복습' : '복습 시작'), h('span', { class: 't2' }, reviewSub)),
      vIcon(VI.REPEAT, { size: 14, sw: 2 })) : null,
    isMath ? null : h('button', { class: 'vh-cta sec', type: 'button', onClick: () => { window.location.hash = '#/sentences'; } },
      h('span', {}, h('span', { class: 't1' }, '문장 모아보기'), h('span', { class: 't2' }, '지금까지 공부한 문장 · 한글 보고 떠올리기')),
      h('span', { class: 'go' }, '열기')),
  );
}

function dotsRow(done, total) {
  const safeTotal = Math.max(total, 1);
  const dots = [];
  for (let i = 0; i < safeTotal; i++) dots.push(h('i', { class: i < done ? 'f' : '' }));
  return h('span', { class: 'vh-dots' }, dots);
}

/* phase + 표시 데이터 파생. demo state 는 시안 카피를 그대로 채움. */
function derive(state) {
  const phase = state.phase
    || (state.resume === 'new' ? 'mid'
      : (state.newCount === 0 && (state.todayNewDone > 0 || state.totalReview > 0)) ? 'done'
        : 'fresh');

  const doneItems = state.todayNewDone + state.todayReviewDone;
  const remaining = state.newCount + state.reviewCount;
  const total = Math.max(doneItems + remaining, 1);
  const ratio = phase === 'done' ? 1 : doneItems / total;
  const ringOffset = Math.round(528 * (1 - ratio));
  const ringColor = phase === 'done' ? 'oklch(58% .115 32)' : 'oklch(44% .062 192)';

  const target = state.speechTarget || 30;
  const sayN = state.tried;
  const sayOver = sayN > target;
  const sayW = Math.min(Math.round((sayN / target) * 100), 100) + '%';
  const sayUnit = sayOver ? ` / ${target}회 · +${sayN - target} 초과` : ` / ${target}회`;

  const scenePrefix = state.lang === 'math' ? '오늘의 문제' : '오늘의 장면';
  // 실데이터 sceneTitle 이 프리픽스와 같으면('오늘의 장면') 중복 표기 방지.
  const hasTitle = !!state.sessionTitle && state.sessionTitle !== scenePrefix;
  const sceneTitle = hasTitle ? state.sessionTitle : scenePrefix;
  const sceneChip = hasTitle ? `${scenePrefix} — ${state.sessionTitle}` : scenePrefix;
  const newMin = state.newMin || Math.max(state.newCount * 3, 4);
  const reviewMin = state.reviewMin || Math.max((state.reviewCount || state.totalReview) * 2, 2);

  // bestStreak = 현재 연속을 제외한 '이전 최고' 연속일 (home.js streakStats).
  // 0 = 주장할 이전 기록이 없다 → 아무 문구도 붙이지 않는다 (첫날 "경신 중" 방지).
  const prevBest = Number(state.bestStreak) || 0;
  let recordTail = '';
  if (prevBest > 0) {
    if (state.streak > prevBest) recordTail = ' — 최고 기록 경신 중';
    else if (state.streak === prevBest) recordTail = ' — 최고 기록 타이';
    else recordTail = ` — 최고 기록까지 ${prevBest - state.streak}일`;
  }
  const streakText = phase === 'done'
    ? `${state.streak}일 연속 달성${recordTail}`
    : `${state.streak}일 연속 — 오늘 하면 ${state.streak + 1}일째`;

  let msg;
  if (phase === 'fresh') {
    const lead = hasTitle
      ? `${scenePrefix} <b>'${state.sessionTitle}'</b>이 준비됐어요.`
      : (state.lang === 'math' ? '오늘 풀 새 문제가 준비됐어요.' : '오늘 익힐 새 표현이 준비됐어요.');
    msg = `<span>${lead}<br/>다 해도 약 ${newMin + reviewMin}분이면 충분해요.</span>`;
  } else if (phase === 'done') {
    // 2026-08-23 — 종전엔 pronAvg 를 '점'으로 붙이고 아무 비교 없이 '이번 주 최고 기록이에요' 를
    // 무조건 달았다. pronAvg 는 실제로 이번 주 발화(수학은 문제) 수다 (home.js loadStats).
    const weekTail = state.lang === 'math'
      ? `이번 주 <b class="c">${state.pronAvg}문제</b> 풀었어요.`
      : `이번 주 발화 <b class="c">${state.pronAvg}회</b>예요.`;
    msg = `<span>오늘 분량 끝!${state.pronAvg ? ` ${weekTail}` : ' 수고했어요.'}</span>`;
  } else {
    msg = `<span>전체 대화 듣기까지 끝냈어요.<br/><b>새 ${state.lang === 'math' ? '문제' : '표현'} ${state.newCount}개</b>만 더 하면 오늘 목표 달성!</span>`;
  }

  const slimHtml = state.slimHtml
    || `이번 주 시도 <b>${state.weekUtter}</b> · 통과 <b>${state.weekPass}</b>${phase === 'done' ? ' — 오늘도 끝까지 했어요' : ''}`;

  return {
    phase, ringOffset, ringColor,
    sayN, sayOver, sayW, sayUnit, msg, streakText, slimHtml,
    sceneTitle, sceneChip, hasTitle, newMin, reviewMin,
    reviewFree: state.lang !== 'math' && state.reviewCount === 0 && state.totalReview > 0,
    reviewPreview: state.reviewPreview || '',
    newMetaText: state.newMetaText || (state.lang === 'math' ? `개념 + 응용 ${state.newCount}문제` : `전체 대화 듣기 → 표현 ${state.newCount}개`),
    doneNewMeta: state.doneNewMeta || `${state.lang === 'math' ? '문제' : '표현'} ${state.todayNewDone}개 완료 · 발화 ${state.tried}회`,
    doneReviewMeta: state.doneReviewMeta || `복습 ${state.todayReviewDone}문장 완료`,
    stripLeftLabel: state.stripLeftLabel || '발음 점수 · 14일',
    stripLeftHead: state.stripLeftHead || '이번 주 평균',
    stripLeftUnit: state.stripLeftUnit || '점',
    pronBars: state.pronBars || Array.from({ length: 14 }, () => 0),
    pronAvg: state.pronAvg || 0,
    pronDelta: state.pronDelta || 0,
    cumExpr: state.cumExpr ?? 0,
    cumMaster: state.cumMaster ?? state.totalReview ?? 0,
    cumUtter: state.cumUtter ?? 0,
    grass: state.grass || weekGrass(state),
    weekDoneText: state.weekDoneText || (phase === 'done' ? '오늘까지 완료' : '진행 중'),
  };
}

// 이번 주 잔디(월–일 7칸) — 데모 미제공 시 빈 칸. (실데이터는 home.js 가 grass 주입)
function weekGrass(state) {
  const td = new Date(state.todayISO + 'T00:00:00Z');
  const todayDow = (td.getUTCDay() + 6) % 7; // Mon=0
  return Array.from({ length: 7 }, (_, i) => (i === todayDow ? 't' : ''));
}

/* ────────── 모바일(phone/tablet) — C 파이널 v2 단일 칼럼 (작업지시서 모바일 §3-1) ────────── */
const VHM_CSS = `
.vhm{min-height:100vh;min-height:100dvh;background:var(--bg);color:var(--ink);font-family:Pretendard,sans-serif;word-break:keep-all;display:flex;flex-direction:column;${V_VARS}}
.vhm *{box-sizing:border-box;margin:0}
.vhm button{font:inherit;background:none;border:0;cursor:pointer;padding:0;color:inherit}
.m-topa{position:sticky;top:0;z-index:6;background:oklch(97.5% .009 95/.92);backdrop-filter:blur(8px);border-bottom:1px solid var(--line);padding:calc(8px + env(safe-area-inset-top)) 20px 9px;display:flex;align-items:center;justify-content:space-between;gap:10px}
.m-logo{font-family:Outfit,sans-serif;font-weight:700;font-size:20px;letter-spacing:-.02em;color:var(--teal-deep)}
.m-seg{display:flex;gap:16px}
.m-seg button{font-size:14px;font-weight:600;color:var(--faint);display:inline-flex;align-items:center;gap:6px;white-space:nowrap;min-height:36px}
.m-seg button.on{color:var(--teal-deep)}
.m-seg button.on i{width:5px;height:5px;border-radius:50%;background:var(--coral)}
.m-icons{display:flex;gap:6px;color:var(--faint);margin-right:-10px}
.m-icons button{display:inline-flex;align-items:center;justify-content:center;color:inherit;width:38px;height:38px;border-radius:10px}
.m-pad{padding:0 20px calc(24px + env(safe-area-inset-bottom));max-width:540px;margin:0 auto;width:100%}
.vh-ringcard{background:var(--card);border:1px solid var(--line);border-radius:22px;padding:24px 24px 22px;display:flex;flex-direction:column;align-items:center;box-shadow:0 1px 0 rgba(25,35,32,.02),0 10px 22px -18px rgba(25,35,32,.12);margin-top:16px}
.vh-date{font-family:Outfit;font-size:11px;letter-spacing:.16em;color:var(--faint);font-weight:600;text-transform:uppercase;white-space:nowrap}
.vh-ring{position:relative;width:188px;height:188px;margin-top:18px}
.vh-ring svg{transform:rotate(-90deg)}
.vh-ring .arc{animation:vh-sweep 1.4s cubic-bezier(.3,.7,.3,1) both}
@keyframes vh-sweep{from{stroke-dashoffset:528}}
.vh-cap{animation:vh-cappulse 2.2s 1.4s ease-out infinite}
@keyframes vh-cappulse{0%{r:5;opacity:.55}45%,100%{r:15;opacity:0}}
.vh-ring-c{position:absolute;inset:0;display:grid;place-items:center;text-align:center}
.vh-ring-c .in{animation:v-settle .6s .5s both}
.vh-ring-c .n{font-family:Outfit;font-size:40px;font-weight:700;letter-spacing:-.03em;line-height:1;white-space:nowrap}
.vh-ring-c .n em{font-style:normal;font-size:17px;color:var(--faint);font-weight:600}
.vh-ring-c .d{font-size:12px;color:var(--mut);margin-top:6px;white-space:nowrap}
.vh-msg{font-size:13.5px;color:var(--mut);margin-top:16px;text-align:center;line-height:1.6;max-width:280px}
.vh-msg b{color:var(--teal-deep)}.vh-msg b.c{color:var(--coral-deep)}
.vh-streak{margin-top:14px;display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:700;color:var(--coral-deep);white-space:nowrap}
.vh-streak.win{background:var(--coral-soft);border-radius:999px;padding:7px 15px}
.vh-streak .fl{display:inline-flex;animation:v-flicker 1.6s ease-in-out infinite;transform-origin:50% 90%;color:var(--coral)}
.vh-say{margin-top:15px;width:100%;border-top:1px solid var(--line);padding-top:14px}
.vh-say .r{display:flex;justify-content:space-between;align-items:baseline;font-size:12.5px;color:var(--mut)}
.vh-say .r b{font-family:Outfit;font-size:15px;color:var(--ink)}
.vh-say .r .ov{color:var(--coral-deep);font-weight:700}
.vh-say .v-bar{height:5px;margin-top:8px}
.vh-say .v-bar > i{background:var(--teal)}
.vh-say .v-bar > i.cor{background:var(--coral)}
.vh-tasks{display:flex;flex-direction:column;gap:12px;margin-top:14px}
.vh-task{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:18px 20px;display:flex;align-items:center;gap:16px}
.vh-task.dn{background:var(--teal-soft);border-color:oklch(44% .062 192/.18)}
.vh-chk{width:28px;height:28px;border-radius:50%;background:var(--teal);color:#fff;display:grid;place-items:center;flex:0 0 auto}
.vh-task .num{font-family:Outfit;font-size:40px;font-weight:700;letter-spacing:-.04em;color:var(--teal);line-height:1;flex:0 0 auto;animation:v-settle .6s .25s both}
.vh-task .num.cor{color:var(--coral-deep)}
.vh-task .bd{min-width:0;flex:1}
.vh-task .tt{font-size:16.5px;font-weight:800;letter-spacing:-.01em;margin-top:7px}
.vh-task .tt.solo{margin-top:0}
.vh-task .tt2{font-size:15px;font-weight:700;color:var(--teal-deep)}
.vh-task .tm2{font-size:12px;color:var(--mut);margin-top:3px}
.vh-task .tm{font-size:12.5px;color:var(--mut);margin-top:6px;display:flex;align-items:center;gap:5px 8px;flex-wrap:wrap}
.vh-task .tm b{color:var(--teal-deep);font-weight:700}
.vh-task .tm .dv{color:#d4cfbe}
.vh-ck{display:inline-flex;align-items:center;gap:4px;color:var(--teal-deep);font-weight:700}
.vh-replay{color:var(--blue);font-weight:700;font-size:12px;display:inline-flex;align-items:center;gap:4px}
.vh-dots{display:inline-flex;gap:4px;align-items:center}
.vh-dots i{width:6px;height:6px;border-radius:50%;background:#ddd9c9}
.vh-dots i.f{background:var(--teal)}
.scene-chip{display:inline-flex;font-family:Outfit;font-size:11px;font-weight:700;color:var(--teal-deep);background:var(--teal-soft);border-radius:999px;padding:5px 11px;letter-spacing:.02em;white-space:nowrap}
.vh-tbtn{display:inline-flex;align-items:center;justify-content:center;gap:7px;font-size:14px;font-weight:700;border-radius:12px;padding:13px 18px;white-space:nowrap;min-height:46px;width:100%}
.vh-tbtn.pri{background:var(--teal);color:#fff;animation:v-breathe 2.6s ease-in-out infinite}
.vh-tbtn.sec{background:transparent;border:1.5px solid #d9d5c7;color:var(--ink)}
.vh-tbtn.rev{background:transparent;border:1.5px solid oklch(58% .115 32/.5);color:var(--coral-deep)}
.vh-task.slim{padding:14px 20px}
.vh-task.slim .tt3{font-size:13.5px;font-weight:600;color:var(--mut)}
.vh-task.slim .tt3 b{color:var(--teal-deep);font-weight:700}
.vh-task.slim .tt3 b.c{color:var(--coral-deep)}
.vh-strip{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px}
.vh-pane{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:16px 18px;min-width:0}
.vh-pane.wide{grid-column:1/-1}
.vh-lab{font-family:Outfit;font-size:10px;letter-spacing:.14em;font-weight:600;color:var(--faint);text-transform:uppercase}
.vh-bars{display:flex;align-items:flex-end;gap:4px;height:52px;margin-top:13px}
.vh-bars i{flex:1;border-radius:3px 3px 1px 1px;background:#e3dfd0;transform-origin:bottom;animation:v-grow .7s cubic-bezier(.3,.7,.3,1) both}
.vh-bars i.hot{background:var(--coral)}
.vh-kv{display:flex;justify-content:space-between;align-items:baseline;font-size:13px;color:var(--mut);margin-top:10px}
.vh-kv b{font-family:Outfit;font-size:19px;font-weight:700;color:var(--ink)}
.vh-kv .up{font-size:11.5px;color:var(--coral-deep);font-weight:700;margin-left:5px}
.vh-grass{display:flex;gap:5px;margin-top:13px}
.vh-grass i{flex:1;height:26px;border-radius:6px;background:#eeebdd;animation:v-settle .5s both}
.vh-grass i.f{background:oklch(44% .062 192/.3)}
.vh-grass i.ff{background:oklch(44% .062 192/.55)}
.vh-grass i.t{background:oklch(44% .062 192/.3)}
.vh-grass i.tg{background:var(--coral)}
`;

function mLangSeg(state) {
  const subs = [{ key: 'en', label: '영어' }, { key: 'ja', label: '일본어' }, { key: 'math', label: '수학' }];
  return h('div', { class: 'm-seg' }, subs.map((s) => {
    const on = s.key === state.lang;
    return h('button', { class: on ? 'on' : '', type: 'button', onClick: () => { if (typeof state.onLangChange === 'function') state.onLangChange(s.key); } },
      on ? h('i') : null, s.label);
  }));
}

// 모바일 태스크 — 데스크톱 tasksColumn 과 동일 데이터, 버튼은 카드 아래 full-width.
function mTasks(state, d) {
  const isMath = state.lang === 'math';
  const newUnit = isMath ? '문제' : '표현';
  const reviewUnit = isMath ? '문제' : '문장';
  const goNew = () => { window.location.hash = isMath ? '#/session-math?mode=new' : '#/session-new'; };
  const goReview = () => {
    if (isMath) { window.location.hash = '#/session-math?mode=review'; return; }
    window.location.hash = d.reviewFree ? '#/session-review?mode=free' : '#/session-review';
  };
  const slim = h('div', { class: 'vh-task slim' }, h('div', { class: 'tt3', html: d.slimHtml }));
  /* 문장 모아보기 진입 — 모바일(데스크톱과 동일 동선). 수학은 문장이 없어 제외. */
  const sentRow = isMath ? null : h('div', { class: 'vh-task' },
    h('div', { class: 'bd' },
      h('div', { class: 'tt solo' }, '문장 모아보기'),
      h('div', { class: 'tm' }, h('span', {}, '지금까지 공부한 문장'), h('span', { class: 'dv' }, '·'), h('span', {}, '한글 보고 떠올리기'))),
  );
  const sentBtn = isMath ? null : h('button', { class: 'vh-tbtn', type: 'button', onClick: () => { window.location.hash = '#/sentences'; } }, '한글 보고 떠올리기');
  const items = [];

  if (d.phase === 'done') {
    items.push(h('div', { class: 'vh-task dn' },
      h('span', { class: 'vh-chk' }, vCheck()),
      h('div', { class: 'bd' },
        h('div', { class: 'tt2' }, `신규 학습 완료${d.hasTitle ? ' — ' + d.sceneTitle : ''}`),
        h('div', { class: 'tm2' }, d.doneNewMeta)),
    ));
    items.push(h('button', { class: 'vh-tbtn sec', type: 'button', onClick: goNew }, vIcon(VI.PLAY, { size: 13, fill: true }), '다시 듣기'));
    if (state.todayReviewDone > 0) {
      items.push(h('div', { class: 'vh-task dn' },
        h('span', { class: 'vh-chk' }, vCheck()),
        h('div', { class: 'bd' },
          h('div', { class: 'tt2' }, `복습 ${state.todayReviewDone}${reviewUnit} 완료`),
          h('div', { class: 'tm2' }, d.doneReviewMeta)),
      ));
    }
    if (state.totalReview > 0) {
      items.push(h('div', { class: 'vh-task' },
        h('div', { class: 'bd' },
          h('div', { class: 'tt solo' }, '더 하고 싶다면 — 자유 복습'),
          h('div', { class: 'tm' }, h('span', {}, `복습 큐 ${state.totalReview}${reviewUnit}`), h('span', { class: 'dv' }, '·'), h('span', {}, '원하는 만큼'))),
      ));
      items.push(h('button', { class: 'vh-tbtn rev', type: 'button', onClick: () => { window.location.hash = isMath ? '#/session-math?mode=review' : '#/session-review?mode=free'; } }, vIcon(VI.REPEAT, { size: 14, sw: 2 }), '자유 복습'));
    }
    items.push(sentRow, sentBtn, slim);
    return h('div', { class: 'vh-tasks' }, items);
  }

  // fresh / mid — 신규 카드
  if (d.phase === 'mid') {
    items.push(h('div', { class: 'vh-task' },
      h('span', { class: 'num' }, String(state.newCount)),
      h('div', { class: 'bd' },
        h('span', { class: 'scene-chip' }, d.sceneChip),
        h('div', { class: 'tt' }, isMath ? '문제 이어서 풀기' : '새 표현 따라 말하기'),
        h('div', { class: 'tm' },
          h('span', { class: 'vh-ck' }, vIcon(VI.CHECK, { size: 11, sw: 3 }), isMath ? '개념 확인' : '대화 듣기 완료'),
          h('span', { class: 'dv' }, '·'),
          dotsRow(state.todayNewDone, state.todayNewDone + state.newCount),
          h('span', {}, `${state.todayNewDone} / ${state.todayNewDone + state.newCount}`)),
        h('div', { class: 'tm', style: 'margin-top:4px;' }, h('span', {}, `남은 ${newUnit} ${state.newCount}개`), h('span', { class: 'dv' }, '·'), h('span', {}, `약 ${d.newMin}분 남음`)),
      ),
    ));
    items.push(h('button', { class: 'vh-tbtn pri', type: 'button', onClick: goNew }, vIcon(VI.MIC, { size: 14, sw: 2 }), '이어서 하기'));
  } else {
    items.push(h('div', { class: 'vh-task' },
      h('span', { class: 'num' }, String(state.newCount)),
      h('div', { class: 'bd' },
        h('span', { class: 'scene-chip' }, d.sceneChip),
        h('div', { class: 'tt' }, isMath ? '오늘의 새 문제' : '새 표현 따라 말하기'),
        h('div', { class: 'tm' }, h('span', {}, d.newMetaText), h('span', { class: 'dv' }, '·'), h('span', {}, `약 ${d.newMin}분`))),
    ));
    items.push(h('button', { class: 'vh-tbtn pri', type: 'button', onClick: goNew }, vIcon(VI.PLAY, { size: 14, fill: true }), '학습 시작'));
  }

  // 복습 카드
  if (state.reviewCount >= 1 || (!isMath && state.totalReview >= 1)) {
    items.push(h('div', { class: 'vh-task' },
      h('span', { class: 'num cor' }, String(d.reviewFree ? state.totalReview : state.reviewCount)),
      h('div', { class: 'bd' },
        h('div', { class: 'tt solo' }, d.reviewFree ? '자유 복습' : '복습 문장'),
        h('div', { class: 'tm' },
          d.reviewPreview ? h('span', {}, h('b', {}, d.reviewPreview)) : h('span', {}, `복습 ${reviewUnit} ${d.reviewFree ? state.totalReview : state.reviewCount}`),
          h('span', { class: 'dv' }, '·'),
          h('span', {}, `약 ${d.reviewMin}분`),
          d.reviewFree ? null : h('span', { class: 'dv' }, '·'),
          d.reviewFree ? null : h('span', { style: 'color:var(--coral-deep);font-weight:700;' }, '오늘이 적기')),
      ),
    ));
    items.push(h('button', { class: 'vh-tbtn rev', type: 'button', onClick: goReview }, vIcon(VI.REPEAT, { size: 14, sw: 2 }), d.reviewFree ? '자유 복습' : '복습 시작'));
  }
  items.push(sentRow, sentBtn, slim);
  return h('div', { class: 'vh-tasks' }, items);
}

function mStrip(state, d) {
  const isMath = state.lang === 'math';
  const langLabel = isMath ? '수학' : state.lang === 'ja' ? '일본어' : '영어';
  const maxBar = Math.max(...d.pronBars, 1);
  const bars = d.pronBars.map((v, i) => h('i', { class: i === d.pronBars.length - 1 ? 'hot' : '', style: `height:${Math.round((v / maxBar) * 46)}px;animation-delay:${i * 40}ms` }));
  const grass = d.grass.map((g, i) => h('i', { class: g, style: `animation-delay:${i * 70}ms` }));
  return h('div', { class: 'vh-strip' },
    h('div', { class: 'vh-pane' },
      h('div', { class: 'vh-lab' }, d.stripLeftLabel),
      h('div', { class: 'vh-bars' }, bars),
      h('div', { class: 'vh-kv' }, h('span', {}, d.stripLeftHead), h('b', {}, `${d.pronAvg}${d.stripLeftUnit}`, d.pronDelta ? h('span', { class: 'up' }, `▲ ${d.pronDelta}`) : null))),
    h('div', { class: 'vh-pane' },
      h('div', { class: 'vh-lab' }, `누적 진도 · ${langLabel}`),
      h('div', { class: 'vh-kv' }, h('span', {}, isMath ? '배운 문제' : '배운 표현'), h('b', {}, String(d.cumExpr))),
      h('div', { class: 'vh-kv' }, h('span', {}, isMath ? '마스터한 문제' : '마스터한 문장'), h('b', {}, String(d.cumMaster))),
      h('div', { class: 'vh-kv' }, h('span', {}, isMath ? '총 시도' : '총 발화'), h('b', {}, (d.cumUtter || 0).toLocaleString()))),
    h('div', { class: 'vh-pane wide' },
      h('div', { class: 'vh-lab' }, '이번 주 학습'),
      h('div', { class: 'vh-grass' }, grass),
      h('div', { class: 'vh-kv', style: 'margin-top:13px;' }, h('span', {}, d.weekDoneText), h('b', { style: 'font-size:14px;' }, '월–금'))),
  );
}

export function renderHomeMobileV2(state) {
  ensureV2Fonts();
  const d = derive(state);

  const ringCard = h('div', { class: 'vh-ringcard' },
    h('div', { class: 'vh-date' }, dateLabel(state.todayISO)),
    h('div', { class: 'vh-ring' },
      ringSvg(d.ringOffset, d.ringColor, d.phase === 'mid'),
      h('div', { class: 'vh-ring-c' }, h('div', { class: 'in' },
        h('div', { class: 'n' }, String(state.todayNewDone + state.todayReviewDone), h('em', {}, ` / ${Math.max(state.todayNewDone + state.todayReviewDone + state.newCount + state.reviewCount, 1)}`)),
        h('div', { class: 'd' }, d.phase === 'done' ? '오늘 항목 완료' : '오늘 항목'))),
    ),
    h('div', { class: 'vh-msg', html: d.msg }),
    h('div', { class: 'vh-streak' + (d.phase === 'done' ? ' win' : '') }, h('span', { class: 'fl' }, vIcon(VI.FLAME, { size: 15, sw: 2, fill: true })), d.streakText),
    h('div', { class: 'vh-say' },
      h('div', { class: 'r' }, h('span', {}, '오늘 발화'), h('span', {}, h('b', {}, String(d.sayN)), h('span', { class: d.sayOver ? 'ov' : '' }, d.sayUnit))),
      h('div', { class: 'v-bar' }, h('i', { class: d.sayOver ? 'cor' : '', style: `width:${d.sayW};--w:${d.sayW}` }))),
  );

  return h('div', { class: 'vhm' },
    v2Style(VHM_CSS),
    h('div', { class: 'm-topa' },
      h('span', { class: 'm-logo' }, 'Study'),
      mLangSeg(state),
      h('div', { class: 'm-icons' },
        h('button', { type: 'button', 'aria-label': '기록', onClick: () => { window.location.hash = '#/stats'; } }, vIcon(VI.CAL, { size: 18 })),
        h('button', { type: 'button', 'aria-label': '설정', onClick: () => { window.location.hash = '#/settings'; } }, vIcon(VI.GEAR, { size: 18 }))),
    ),
    h('div', { class: 'm-pad' }, ringCard, mTasks(state, d), mStrip(state, d)),
  );
}

export function renderHomeDesktopV2(state) {
  ensureV2Fonts();
  const d = derive(state);

  return h('div', { class: 'vh' },
    v2Style(VH_CSS),
    h('div', { class: 'vh-wrap' },
      h('div', { class: 'vh-top' },
        h('span', { class: 'vh-logo' }, 'Study'),
        langSeg(state),
        h('div', { class: 'vh-icons' },
          h('button', { type: 'button', 'aria-label': '기록', onClick: () => { window.location.hash = '#/stats'; } }, vIcon(VI.CAL, { size: 18 })),
          h('button', { type: 'button', 'aria-label': '설정', onClick: () => { window.location.hash = '#/settings'; } }, vIcon(VI.GEAR, { size: 18 })),
        ),
      ),
      h('div', { class: 'vh-main' },
        h('div', { class: 'vh-col' }, calendarCard(state, d), cumCard(state, d)),
        h('div', { class: 'vh-col' }, todayRingCard(state), ctaCard(state, d)),
      ),
    ),
  );
}
