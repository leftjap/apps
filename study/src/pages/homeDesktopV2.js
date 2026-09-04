/* 홈 — 데스크톱/모바일 (작업지시서 "기록/갱신" §5)
 * 4카드 구성: 최근 4주 캘린더 · 오늘 발화 링 · CTA 3개 · 누적.
 * 데스크톱은 2칼럼(좌 캘린더+누적 / 우 링+CTA), 모바일은 링 → CTA → 캘린더 → 누적 단일 칼럼.
 *
 * 분모는 고정 목표가 아니라 '직전 학습일 발화 수' (§1-1) — 넘어서면 코랄 + 확산 펄스.
 *
 * 신규 학습 진입 3상태: fresh(학습 시작) / mid(이어서 하기) / done(다시 듣기)
 *   resume==='new'            → mid  (activeSession 스냅샷 존재)
 *   newPractice (2026-09-04)  → mid  (만료 마감된 묶음에 연습 기록이 남음 — home.nextSessionPractice)
 *   newCount===0 && 오늘 신규 진행 흔적 → done
 *   그 외(newCount>=1)        → fresh
 *
 * 데이터: home.js state (demo 모드는 home.js 의 DEMO_BY_PHASE 픽스처로 시안 재현 — 검증용).
 */
import { h } from '../components/d1/dom.js';
import { localISODate } from '../utils/today.js';
import { V_VARS, VI, vIcon, v2Style, ensureV2Fonts, DOW_KO, isoShift, mondayOf, V_TODAY_KEY } from '../components/v2/atoms.js';

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
.vh-cell.today{background:var(--card);border:0;padding:8px 10px;animation:v-settle .4s both,vt2-today 2.4s 1s ease-in-out infinite}
.vh-cell.today .dt{color:var(--coral-deep);font-weight:700}
.vh-cell.today .vv{font-family:Pretendard,sans-serif;font-size:10px;font-weight:700;color:var(--coral-deep);letter-spacing:.04em}
.vh-cell.fut{background:transparent;border:0;padding:7px 9px}
.vh-cell.fut .dt{color:#d8d2c2;font-weight:400}
${V_TODAY_KEY}
.vh-wklab{display:none}
.vh-wkcol{grid-column:8;grid-row:1/5;border-left:1px solid #f1ede0;padding-left:16px;display:flex;flex-direction:column;gap:8px}
.vh-wk{height:72px;display:flex;flex-direction:column;justify-content:center;gap:8px}
.vh-wk .v{font-family:Outfit;font-size:16px;font-weight:700;letter-spacing:-.02em;line-height:1;color:var(--ink);white-space:nowrap}
.vh-wk .v em{font-style:normal;font-size:10.5px;font-weight:700;margin-left:5px;letter-spacing:.02em}
.vh-wk.best .v{color:var(--coral-deep)}
.vh-wk.now:not(.best) .v{color:#b8b1a0}
.vh-wk .tr{height:7px;border-radius:999px;background:#ece8da;position:relative}
.vh-wk .tr > i{position:absolute;left:0;top:0;bottom:0;border-radius:999px;background:var(--teal);animation:v-fill .9s cubic-bezier(.3,.7,.3,1) both}
.vh-wk.best .tr > i{background:var(--coral)}
.vh-wk .tr > b{position:absolute;top:50%;transform:translate(-50%,-50%);width:9px;height:9px;border-radius:50%;background:var(--teal-deep);box-shadow:0 0 0 3px var(--card)}

/* ── 누적 (§5.6) ── */
.vh-cum{padding:20px 26px 22px;display:grid;gap:20px;grid-template-columns:repeat(var(--cols,4),1fr)}
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

  /* 주 발화 4블록 — 마지막이 진행 중인 주.
   * 분모는 주 발화 개인기록(prWeeklyUtterance)이다. 4주 최댓값을 쓰면 기준이 스스로 움직여
   * '기록'이 아니게 된다 (클로드디자인 2026-08-27). 기록 보유 주는 정의상 100% + '최고' 배지고,
   * 진행 중인 주가 그걸 넘으면 그것이 곧 갱신이라 배지가 그 주로 옮겨간다 — 홈 링과 같은 문법.
   * 기록 주가 4주 밖이면 배지 없이 전부 100% 미만: '천장이 화면 밖'이라는 정보 자체가 값어치다.
   * 기록이 아직 없으면(첫 세션 전) 배지 없이 창 최댓값으로만 눈금을 잡는다. */
  const sums = [0, 1, 2, 3].map((w) => days.slice(w * 7, w * 7 + 7)
    .filter((iso) => iso <= today).reduce((acc, iso) => acc + valOf(iso), 0));
  const prVal = Number(state.weeklyPR?.value) || 0;
  const prWeek = state.weeklyPR?.week_start || null;
  const overPR = prVal > 0 && sums[3] > prVal;
  const denom = overPR ? sums[3] : (prVal || Math.max(...sums, 1));
  // 배지는 한 주에만 — 개인기록은 단일 값이라 동률 중복이 생기지 않는다.
  const bestIdx = overPR ? 3 : (prWeek ? [0, 1, 2, 3].findIndex((w) => days[w * 7] === prWeek) : -1);
  const pct = (v) => Math.min(Math.round((v / denom) * 100), 100);
  const weeks = sums.map((v, w) => {
    const isNow = w === 3;
    const isBest = w === bestIdx;
    const track = h('div', { class: 'tr' },
      v > 0 ? h('i', { style: `width:${pct(v)}%;animation-delay:${[0.1, 0.25, 0.4, 0.4][w]}s` }) : null,
      isNow && sums[2] > 0 ? h('b', { style: `left:${pct(sums[2])}%` }) : null);
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
      h('div', { class: 'vh-wkcol' }, h('span', { class: 'vh-wklab' }, '주 발화'), weeks), cells),
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
  // 수학 SRS 는 consecutivePass 를 저장하지 않는다(mathQueue.js:45) — 마스터 기준을 세울 수 없으므로
  // 값(= srs 큐 전체 수)에 맞는 라벨을 쓴다. 영어/일본어만 masteredCount(연속 통과 2회) 로 센다.
  cells.push([isMath ? '복습 중인 문제' : '마스터한 문장', [String(d.cumMaster), h('em', {}, '개')]]);
  return h('div', { class: 'vh-card vh-cum', style: `--cols:${cells.length}` },
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
      ? (state.resume !== 'new' && state.newPractice
        ? `지난 연습 발화 ${state.newPractice.utterances}회 · 「${state.newPractice.firstMeaning}」부터`
        : `남은 ${newUnit} ${state.newCount}개 · 약 ${d.newMin}분 남음`)
      : [d.sceneLine, `${newUnit} ${state.newCount}개`, `약 ${d.newMin}분`].filter(Boolean).join(' · ');

  /* CTA 는 항상 3개다 (§5.5 '3버튼 모두') — 종전엔 복습 큐가 비면 '복습 시작' 을 통째로 숨겼다.
   * 보조줄만 상태에 따라 다르게: 큐가 비었으면 '오늘이 적기' 같은 없는 사실을 주장하지 않는다. */
  const reviewSub = state.totalReview <= 0
    ? '복습할 문장이 없어요'
    : d.reviewFree
      ? `복습 큐 ${state.totalReview}${reviewUnit} · 원하는 만큼`
      : `복습 ${reviewUnit} ${state.totalReview} · 오늘이 적기 · ${state.reviewCount}${reviewUnit} ≈ ${d.reviewMin}분`;
  const reviewLabel = d.reviewFree ? '자유 복습' : '복습 시작';

  return h('div', { class: 'vh-card vh-ctacard' },
    h('button', { class: 'vh-cta pri', type: 'button', onClick: goNew },
      h('span', {}, h('span', { class: 't1' }, newLabel), h('span', { class: 't2' }, newSub)),
      vIcon(VI.PLAY, { size: 14, fill: true })),
    h('button', { class: 'vh-cta rev', type: 'button', onClick: goReview },
      h('span', {}, h('span', { class: 't1' }, reviewLabel), h('span', { class: 't2' }, reviewSub)),
      vIcon(VI.REPEAT, { size: 14, sw: 2 })),
    isMath ? null : h('button', { class: 'vh-cta sec', type: 'button', onClick: () => { window.location.hash = '#/sentences'; } },
      h('span', {}, h('span', { class: 't1' }, '문장 모아보기'), h('span', { class: 't2' }, '지금까지 공부한 문장 · 한글 보고 떠올리기')),
      h('span', { class: 'go' }, '열기')),
  );
}

/* phase + CTA 표시 데이터 파생. demo state 는 시안 카피를 그대로 채움.
 * 홈이 4카드(캘린더·링·CTA·누적) 구성이 되면서 히어로 메시지·연속 칩·하단 스트립이 사라졌다 —
 * 그 값들을 만들던 계산(링 오프셋·발화 바·메시지·연속 문구·발음 바·잔디)도 함께 정리했다. */
function derive(state) {
  // newPractice (2026-09-04): 만료로 마감된 묶음에 연습 기록이 남아 있으면 스냅샷 없이도 mid — home.nextSessionPractice
  const phase = state.phase
    || ((state.resume === 'new' || (state.newPractice && state.newCount >= 1)) ? 'mid'
      : (state.newCount === 0 && (state.todayNewDone > 0 || state.totalReview > 0)) ? 'done'
        : 'fresh');

  /* CTA 보조줄에서 '오늘의 장면' 접두사를 뺀다 — 그 말은 장면명을 실어 나르는 자리였을 뿐이라
   * 장면이 없는 트랙(모두영어 core100)에서는 거짓이 된다 (클로드디자인 2026-08-27).
   * 장면이 있으면 이름만 앞에 싣고, 없으면 분량만 말한다. */
  const sceneLine = state.sessionTitle || '';
  const newMin = state.newMin || Math.max(state.newCount * 3, 4);
  const reviewMin = state.reviewMin || Math.max((state.reviewCount || state.totalReview) * 2, 2);

  return {
    phase, sceneLine, newMin, reviewMin,
    reviewFree: state.lang !== 'math' && state.reviewCount === 0 && state.totalReview > 0,
    doneNewMeta: state.doneNewMeta || `${state.lang === 'math' ? '문제' : '표현'} ${state.todayNewDone}개 완료 · 발화 ${state.tried}회`,
    cumExpr: state.cumExpr ?? 0,
    cumMaster: state.cumMaster ?? state.totalReview ?? 0,
    cumUtter: state.cumUtter ?? 0,
  };
}

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
.m-pad{padding:14px 20px calc(24px + env(safe-area-inset-bottom));max-width:540px;margin:0 auto;width:100%;display:flex;flex-direction:column;gap:12px}
.vh-card{background:var(--card);border:1px solid var(--line);border-radius:20px;
  box-shadow:0 1px 0 rgba(25,35,32,.02),0 10px 22px -18px rgba(25,35,32,.12)}
.vh-lab{font-family:Outfit;font-size:10px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--faint);white-space:nowrap}

/* ── 오늘 발화 링 (§5.4) ── */
.vh-todaycard{padding:18px 20px 16px}
.vh-todayhd{display:flex;justify-content:space-between;align-items:baseline}
.vh-todayhd .d{font-size:14px;font-weight:700;color:var(--ink)}
.vh-todayhd .t{font-size:12px;font-weight:600;color:var(--faint)}
.vh-ringwrap{display:flex;justify-content:center;margin-top:12px;margin-bottom:4px}
.vh-ring2{position:relative;width:172px;height:172px}
.vh-ring2 svg{transform:rotate(-90deg)}
.vh-ring2 .arc{transition:stroke-dashoffset .6s cubic-bezier(.3,.7,.3,1),stroke .3s}
.vh-ring2 .pl{position:absolute;inset:8px;border-radius:50%;border:1.5px solid var(--coral);animation:v-pulse 1.5s ease-out infinite}
.vh-ring2 .cn{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
.vh-ring2 .cn .lb{font-size:11px;font-weight:600;color:var(--faint)}
.vh-ring2 .cn .n{font-family:Outfit;font-size:46px;font-weight:700;letter-spacing:-.04em;line-height:1;color:var(--ink);margin-top:6px;animation:v-settle .6s .3s both}
.vh-ring2 .cn .pv{font-family:Outfit;font-size:12.5px;font-weight:700;color:var(--teal-deep);margin-top:7px}
.vh-ring2 .cn .pv.over{color:var(--faint);text-decoration:line-through}

/* ── CTA 3개 (§5.5) ── */
.vh-ctacard{padding:16px 16px 18px;display:flex;flex-direction:column;gap:9px}
.vh-cta{display:flex;align-items:center;justify-content:space-between;gap:10px;font:inherit;text-align:left;border-radius:14px;min-height:56px}
.vh-cta .t1{display:block;font-size:14.5px;font-weight:700}
.vh-cta .t2{display:block;font-size:11.5px;color:var(--faint);margin-top:3px;line-height:1.4}
.vh-cta.pri{color:var(--card);background:var(--teal);padding:14px 16px;animation:v-breathe 2.6s ease-in-out infinite}
.vh-cta.pri .t1{font-size:15px}
.vh-cta.pri .t2{color:inherit;opacity:.85}
.vh-cta.rev{color:var(--coral-deep);background:transparent;border:1.5px solid oklch(58% .115 32/.5);padding:13px 16px}
.vh-cta.sec{color:var(--ink);background:transparent;border:1.5px solid var(--line);padding:13px 16px}
.vh-cta .go{font-size:13px;font-weight:700;color:var(--faint);flex:0 0 auto}

/* ── 최근 4주 캘린더 (§5.3) — 7열 + 주 발화는 아래 가로 4바로 접는다 ── */
.vh-calcard{padding:18px 16px 18px}
.vh-calhd{display:flex;justify-content:space-between;align-items:baseline}
.vh-calhd .mo{font-family:Outfit;font-size:11px;font-weight:600;letter-spacing:.06em;color:var(--faint)}
.vh-calgrid{display:grid;grid-template-columns:repeat(7,1fr);gap:4px}
.vh-caldow{margin-top:13px;font-family:Outfit;font-size:9.5px;font-weight:600;letter-spacing:.06em;color:var(--faint);text-align:center}
.vh-caldow .wk{display:none}
.vh-calcells{margin-top:7px}
.vh-cell{height:52px;border-radius:10px;padding:6px 7px;display:flex;flex-direction:column;justify-content:space-between;animation:v-settle .4s both}
.vh-cell .dt{font-size:9.5px;font-weight:600;line-height:1}
.vh-cell .vv{font-family:Outfit;font-size:14px;font-weight:700;letter-spacing:-.02em;line-height:1}
.vh-cell.t0{background:var(--card);border:1px solid #eeeadd;padding:5px 6px}
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
.vh-cell.pr{background:var(--coral);border:0;padding:6px 7px;box-shadow:inset 0 0 0 2px rgba(255,255,255,.4),0 6px 14px -8px oklch(58% .115 32/.8)}
.vh-cell.pr .dt{color:rgba(255,255,255,.75)}
.vh-cell.pr .vv{color:#fff;font-size:15px}
.vh-cell.today{background:var(--card);border:0;padding:6px 7px;animation:v-settle .4s both,vt2-today 2.4s 1s ease-in-out infinite}
.vh-cell.today .dt{color:var(--coral-deep);font-weight:700}
.vh-cell.today .vv{font-family:Pretendard,sans-serif;font-size:9px;font-weight:700;color:var(--coral-deep);letter-spacing:.03em}
.vh-cell.fut{background:transparent;border:0;padding:5px 6px}
.vh-cell.fut .dt{color:#d8d2c2;font-weight:400}
${V_TODAY_KEY}
/* 8번째 컬럼을 셀 아래 전체 폭 가로 줄로 — 375px 에 150px 사이드 컬럼이 들어가지 않는다.
   grid-row 를 5(날짜 4주 다음 줄)로 명시하지 않으면 DOM 순서대로 1행에 얹혀 셀 위로 올라간다. */
.vh-wkcol{grid-column:1/-1;grid-row:5;border-left:0;padding-left:0;margin-top:12px;border-top:1px solid #f1ede0;padding-top:12px;
  display:flex;flex-direction:row;flex-wrap:wrap;align-items:flex-end;gap:10px}
.vh-wklab{display:block;width:100%;font-family:Outfit;font-size:9.5px;font-weight:600;letter-spacing:.06em;color:var(--faint);margin-bottom:-4px;order:-1}
.vh-wk{height:auto;flex:1;min-width:0;display:flex;flex-direction:column;justify-content:flex-end;gap:6px}
.vh-wk .v{font-family:Outfit;font-size:13.5px;font-weight:700;letter-spacing:-.02em;line-height:1;color:var(--ink);white-space:nowrap}
.vh-wk .v em{font-style:normal;font-size:9px;font-weight:700;margin-left:3px;letter-spacing:.02em}
.vh-wk.best .v{color:var(--coral-deep)}
.vh-wk.now:not(.best) .v{color:#b8b1a0}
.vh-wk .tr{height:6px;border-radius:999px;background:#ece8da;position:relative}
.vh-wk .tr > i{position:absolute;left:0;top:0;bottom:0;border-radius:999px;background:var(--teal);animation:v-fill .9s cubic-bezier(.3,.7,.3,1) both}
.vh-wk.best .tr > i{background:var(--coral)}
.vh-wk .tr > b{position:absolute;top:50%;transform:translate(-50%,-50%);width:8px;height:8px;border-radius:50%;background:var(--teal-deep);box-shadow:0 0 0 3px var(--card)}

/* ── 누적 (§5.6) — 2열로 접는다 ── */
.vh-cum{padding:16px 18px 18px;display:grid;gap:14px 12px;grid-template-columns:repeat(2,1fr)}
.vh-cum .k{font-size:11px;font-weight:600;color:var(--faint)}
.vh-cum .v{font-family:Outfit;font-size:19px;font-weight:700;letter-spacing:-.02em;color:var(--ink);margin-top:4px;white-space:nowrap}
.vh-cum .v em{font-style:normal;font-size:11.5px;color:var(--faint);font-weight:600}
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
export function renderHomeMobileV2(state) {
  ensureV2Fonts();
  const d = derive(state);

  // 데스크톱과 같은 구성 — 단일 칼럼이라 손이 먼저 닿는 CTA 를 링 바로 아래로 올린다.
  return h('div', { class: 'vhm' },
    v2Style(VHM_CSS),
    h('div', { class: 'm-topa' },
      h('span', { class: 'm-logo' }, 'Study'),
      mLangSeg(state),
      h('div', { class: 'm-icons' },
        h('button', { type: 'button', 'aria-label': '기록', onClick: () => { window.location.hash = '#/stats'; } }, vIcon(VI.CAL, { size: 18 })),
        h('button', { type: 'button', 'aria-label': '설정', onClick: () => { window.location.hash = '#/settings'; } }, vIcon(VI.GEAR, { size: 18 })))),
    h('div', { class: 'm-pad' },
      todayRingCard(state), ctaCard(state, d), calendarCard(state, d), cumCard(state, d)),
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
