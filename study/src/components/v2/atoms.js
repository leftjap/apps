/* C 파이널 v2 공통 — 상태별 색상 시스템 + 모션 라이브러리 + 아이콘/DOM 헬퍼
 * 정본: 작업지시서 C 파이널 v2 (시안 v-common.jsx 포팅).
 * 색: 틸=진행·통과·CTA / 블루=듣기·재생 / 코랄=녹음·보상·적기 / 골드=중간단계 / 잉크·뉴트럴=본문
 * 모션: 진행형(프로그레스·녹음·재생)=루프, 결과(점수·체크·잠금해제)=1회 안착, CTA=브리딩.
 *
 * V_VARS 는 각 페이지 루트(.vh/.vd/...)에 스코프 주입 → 전역 tokens.css 와 충돌 없음.
 * V_KEYS + 페이지 CSS 는 render 시 인라인 <style> 로 주입 → mock(단독)·SPA 양쪽 동작.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

export const V_VARS = "--ink:#25322f;--teal:oklch(44% .062 192);--teal-deep:oklch(35% .058 192);--teal-soft:oklch(44% .062 192/.08);--teal-line:oklch(44% .062 192/.32);--blue:oklch(50% .075 235);--blue-deep:oklch(40% .07 235);--blue-soft:oklch(50% .075 235/.1);--blue-line:oklch(50% .075 235/.4);--coral:oklch(58% .115 32);--coral-deep:oklch(47% .11 32);--coral-soft:oklch(58% .115 32/.12);--gold:oklch(70% .105 82);--gold-deep:oklch(50% .09 82);--gold-soft:oklch(70% .105 82/.14);--mut:#6f7a75;--faint:#9da69f;--line:#e7e3d6;--bg:oklch(97.5% .009 95);--card:#fffefb;";

export const V_KEYS = `
@keyframes v-eq{0%,100%{height:4px}50%{height:100%}}
@keyframes v-pulse{0%{transform:scale(1);opacity:.45}100%{transform:scale(1.5);opacity:0}}
@keyframes v-blink{0%,100%{opacity:1}50%{opacity:.25}}
@keyframes v-settle{0%{transform:translateY(7px) scale(.94);opacity:0}60%{transform:translateY(0) scale(1.04)}100%{transform:none;opacity:1}}
@keyframes v-bounce{0%,100%{transform:translateY(0);opacity:.4}50%{transform:translateY(-7px);opacity:1}}
@keyframes v-grow{from{transform:scaleY(0)}}
@keyframes v-fill{from{width:0}}
@keyframes v-draw{to{stroke-dashoffset:0}}
@keyframes v-sheen{0%{transform:translateX(-110%)}55%,100%{transform:translateX(160%)}}
/* 2026-07-22 — 확산 링이 두껍고(12px) 시작 불투명도가 높아(.5) 버튼 둘레가 회청색 테두리처럼
   보인다는 실사용 지적. 링만 은은하게 낮춘다(.5→.3, 12px→8px). 아래 그림자·주기는 유지. */
@keyframes v-breathe{0%,100%{box-shadow:0 8px 16px -11px oklch(44% .062 192/.7),0 0 0 0 oklch(44% .062 192/.3)}55%{box-shadow:0 10px 20px -11px oklch(44% .062 192/.8),0 0 0 8px oklch(44% .062 192/0)}}
/* 코랄 변형 — 녹음 버튼용. 색 규약이 '코랄=녹음'이므로 녹음 CTA 는 틸이 아니라 코랄로 숨쉰다. */
@keyframes v-breatheC{0%,100%{box-shadow:0 8px 16px -11px oklch(58% .115 32/.7),0 0 0 0 oklch(58% .115 32/.3)}55%{box-shadow:0 10px 20px -11px oklch(58% .115 32/.8),0 0 0 8px oklch(58% .115 32/0)}}
@keyframes v-flicker{0%,100%{transform:scale(1) rotate(0)}30%{transform:scale(1.2) rotate(-4deg)}60%{transform:scale(.92) rotate(3deg)}}
@keyframes v-haloT{0%,100%{box-shadow:inset 0 0 0 1.5px var(--teal-line),0 0 0 0 oklch(44% .062 192/.25)}55%{box-shadow:inset 0 0 0 1.5px var(--teal-line),0 0 0 7px oklch(44% .062 192/0)}}
@keyframes v-floatup{0%{opacity:0;transform:translateY(8px)}25%{opacity:1}80%{opacity:1;transform:translateY(-4px)}100%{opacity:0;transform:translateY(-12px)}}
.v-eq{display:inline-flex;gap:2.5px;align-items:center;height:13px}
.v-eq i{width:2.5px;height:4px;border-radius:2px;background:currentColor;animation:v-eq .9s ease-in-out infinite}
.v-eq i:nth-child(2){animation-delay:.12s}.v-eq i:nth-child(3){animation-delay:.24s}.v-eq i:nth-child(4){animation-delay:.36s}.v-eq i:nth-child(5){animation-delay:.48s}
.v-draw{animation:v-draw .5s .4s ease-out both}
.v-bar{position:relative;border-radius:999px;background:#ece8da;overflow:hidden}
.v-bar > i{position:relative;display:block;height:100%;border-radius:999px;animation:v-fill 1s cubic-bezier(.3,.7,.3,1) both;overflow:hidden}
.v-bar > i::after{content:"";position:absolute;inset:0;background:linear-gradient(100deg,transparent 25%,rgba(255,255,255,.8) 50%,transparent 75%);animation:v-sheen 2.2s 1s ease-in-out infinite}
@media (prefers-reduced-motion: reduce){
  .v-eq i,.v-draw,.v-bar > i,.v-bar > i::after{animation:none!important}
  .v-bar > i{width:var(--w,100%)}
  /* 루프(infinite) 데코 애니는 1회만 — breathe/flicker/pulse/halo/sheen/blink/lineprog 등 무한 반복 차단.
     v-settle/v-grow/v-draw 등 1회 안착(both)은 count 1 유지로 무영향.
     2026-08-26 — .vr(복습) 이 목록에서 빠져 있었다. 복습 화면에 오늘 칸 펄스·링 확산이 붙으면서
     같은 정책을 받아야 하므로 추가. */
  .vh *,.vd *,.vs *,.vr *{animation-iteration-count:1!important}
}
`;

export const VI = {
  PLAY: 'M8 5v14l11-7z',
  PAUSE: 'M7 5h3v14H7zM14 5h3v14h-3z',
  MIC: 'M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3',
  REPEAT: 'M17 2l4 4-4 4M21 6H7a4 4 0 0 0-4 4v1M7 22l-4-4 4-4M3 18h14a4 4 0 0 0 4-4v-1',
  CAL: 'M3 5h18v16H3zM3 10h18M8 3v4M16 3v4',
  GEAR: 'M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  HOME: 'M3 11l9-8 9 8M5 9v12h14V9',
  CHECK: 'M5 12l5 5 9-10',
  FLAME: 'M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z',
  ZAP: 'M13 2L3 14h7l-1 8 10-12h-7l1-8',
  CHEV_DOWN: 'M6 9l6 6 6-6',
};

/* VIcon — 시안과 동일. fill=true → 채움, false → stroke. */
export function vIcon(d, { size = 15, sw = 1.8, fill = false } = {}) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  if (fill) {
    svg.setAttribute('fill', 'currentColor');
  } else {
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', sw);
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
  }
  const p = document.createElementNS(SVG_NS, 'path');
  p.setAttribute('d', d);
  svg.appendChild(p);
  return svg;
}

/* VEq — 재생 이퀄라이저 (n 바). */
export function vEq(n = 5) {
  const span = document.createElement('span');
  span.className = 'v-eq';
  span.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < n; i++) span.appendChild(document.createElement('i'));
  return span;
}

/* VCheck — 완료 표시(그려지는 체크). */
export function vCheck({ size = 13, sw = 2.6 } = {}) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', sw);
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(SVG_NS, 'path');
  p.setAttribute('class', 'v-draw');
  p.setAttribute('d', 'M5 12l5 5 9-10');
  p.setAttribute('stroke-dasharray', '24');
  p.setAttribute('stroke-dashoffset', '24');
  svg.appendChild(p);
  return svg;
}

/* Outfit · Pretendard · JetBrains Mono 폰트 로드 (head 1회). mock·SPA 공용. */
const FONT_LINKS = [
  { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
  { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
  { rel: 'stylesheet', href: 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css' },
  { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap' },
];

export function ensureV2Fonts() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('v2-fonts')) return;
  const marker = document.createElement('meta');
  marker.id = 'v2-fonts';
  document.head.appendChild(marker);
  for (const spec of FONT_LINKS) {
    const link = document.createElement('link');
    for (const k in spec) {
      if (k === 'crossorigin') link.crossOrigin = spec[k];
      else link.setAttribute(k, spec[k]);
    }
    document.head.appendChild(link);
  }
}

/* render 시 페이지 CSS 인라인 주입용 <style> 생성 헬퍼. */
export function v2Style(css) {
  const style = document.createElement('style');
  style.textContent = V_KEYS + css;
  return style;
}

/* ────────── 기록/갱신 v3 공용 (작업지시서 §4.1 점수 원 · §4.2 캘린더) ──────────
 * 세 화면(홈·신규·복습)이 같은 어휘를 쓰도록 여기 모은다.
 * keyframe·색 토큰은 새로 만들지 않는다 — 아래 CSS 는 V_VARS·V_KEYS 와 stats.js 의 기존 규칙만 조합.
 */

/* 점수 3단 색 — 정본은 stats.js scoreCls (75/60 경계). 세션 화면이 stats 를 import 하지 않으므로 동일 규칙을 여기 둔다. */
export function scoreClass(score) { return score >= 75 ? 'good' : score >= 60 ? 'mid' : 'low'; }

/* 점수 원 / 통과 체크 원 / 빈 슬롯 원 — 작업지시서 §4.1 표. */
export const V_DOT_CSS = `
.v-dots{display:inline-flex;align-items:center;gap:5px;flex-wrap:wrap}
.v-dot{display:inline-grid;place-items:center;border-radius:50%;font-family:Outfit;font-weight:700;flex:0 0 auto;box-sizing:border-box;line-height:1}
.v-dot.good{background:oklch(44% .062 192/.14);color:oklch(30% .055 192);box-shadow:inset 0 0 0 1.5px var(--teal-line)}
.v-dot.mid{background:var(--gold-soft);color:var(--gold-deep);box-shadow:inset 0 0 0 1.5px oklch(70% .105 82/.35)}
.v-dot.low{background:var(--coral-soft);color:var(--coral-deep);box-shadow:inset 0 0 0 1.5px oklch(58% .115 32/.35)}
.v-dot.fresh{background:var(--teal);color:#fff;box-shadow:none;animation:v-settle .5s both}
.v-dot.pass{background:var(--teal);color:#fff;box-shadow:none}
.v-dot.empty{background:transparent;box-shadow:inset 0 0 0 1.5px #d8d2c2}
`;

const dotFont = (size) => (size >= 30 ? '11.5px' : '10.5px');

function dotEl(cls, size) {
  const el = document.createElement('span');
  el.className = 'v-dot ' + cls;
  el.style.cssText = `width:${size}px;height:${size}px;font-size:${dotFont(size)}`;
  return el;
}

/* 점수 원. fresh=방금 시도(틸 채움 + v-settle). */
export function scoreDot(score, { size = 30, fresh = false } = {}) {
  const el = dotEl(fresh ? 'fresh' : scoreClass(score), size);
  el.textContent = String(Math.round(score));
  return el;
}

/* 통과 표시(점수 없는 항목) — 틸 채움 + 흰 체크. '통과 ✓' 텍스트를 쓰지 않는다. */
export function passDot({ size = 26 } = {}) {
  const el = dotEl('pass', size);
  el.appendChild(vCheck({ size: Math.round(size * 0.5) }));
  return el;
}

/* 빈 슬롯 — 목표까지 남은 자리. */
export function emptyDot({ size = 30 } = {}) {
  return dotEl('empty', size);
}

/* 사이드바 미니 캘린더 (신규 §6.6② 4주 · 복습 §7.4② 월간) — 숫자 없이 농도 3단.
 * vt2-today 는 stats.js:51 이 정본 — 페이지별 <style> 주입 구조라 여기서도 같은 값으로 선언한다. */
/* '오늘' 칸 펄스 — 정본은 stats.js 의 vt2-today. 홈·세션이 각자 페이지 CSS 를 주입하는 구조라
 * 이름이 갈리지 않도록 여기 한 벌만 두고 양쪽이 가져다 쓴다 (§13 '새 keyframe 을 만들지 않았다'). */
export const V_TODAY_KEY = `@keyframes vt2-today{0%,100%{outline:2.2px solid var(--coral);outline-offset:2px}50%{outline:2.2px solid oklch(58% .115 32/.3);outline-offset:5px}}`;

export const V_MINICAL_CSS = `
.v-cal{display:grid;grid-template-columns:repeat(7,1fr);gap:3px;margin-top:12px}
.v-cal .dw{font-family:Outfit;font-size:9px;font-weight:600;color:#b8b1a0;text-align:center;padding-bottom:3px}
.v-cal .cd{aspect-ratio:1.1;border-radius:8px;display:grid;place-items:center;font-family:Outfit;font-size:9.5px;color:#b8b1a0}
.v-cal .cd.t1{background:oklch(44% .062 192/.09);color:var(--mut);font-weight:600}
.v-cal .cd.t2{background:oklch(44% .062 192/.17);color:oklch(30% .055 192);font-weight:600}
.v-cal .cd.t3{background:oklch(44% .062 192/.26);color:oklch(30% .055 192);font-weight:700}
.v-cal .cd.pr{background:var(--coral);color:#fff;font-weight:700;box-shadow:inset 0 0 0 2px rgba(255,255,255,.4)}
.v-cal .cd.today{animation:vt2-today 2.4s 1s ease-in-out infinite;color:var(--coral-deep);font-weight:700}
.v-cal .cd.fut{color:#d8d2c2}
${V_TODAY_KEY}
`;

export const DOW_KO = ['월', '화', '수', '목', '금', '토', '일'];

/* 사이드바 캘린더 농도 3단.
 * 기본은 문장 단위 시도 수(1~5회 규모)에 맞춘 절대 구간 — 복습 화면의 '이 문장 연습 이력'용.
 * 하루 발화 수(20~50회 규모)처럼 스케일이 다른 데이터는 makeMiniTier 로 분포에서 구간을 잡는다.
 */
export function miniTier(v) { if (!v) return 0; if (v < 2) return 1; if (v < 4) return 2; return 3; }

/* 값 분포(삼분위)로 3단 구간을 잡는 tier 함수 생성 — 사람마다 하루 발화량이 달라 절대 구간은 계조가 죽는다. */
export function makeMiniTier(values) {
  const vals = (values || []).filter((v) => v > 0).sort((a, b) => a - b);
  if (!vals.length) return miniTier;
  const q = (pct) => vals[Math.min(vals.length - 1, Math.floor(vals.length * pct))];
  const q1 = q(1 / 3), q2 = q(2 / 3);
  return (v) => (!v ? 0 : v <= q1 ? 1 : v <= q2 ? 2 : 3);
}

/* ISO 날짜 유틸 — 세 화면 공통 (UTC 고정: 기존 home.js·pr.js 관례). */
export function isoShift(iso, days) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
/* 월요일 시작 요일 인덱스 (stats.js firstDow 와 동일 식). */
export function mondayIndex(iso) { return (new Date(iso + 'T00:00:00Z').getUTCDay() + 6) % 7; }
/* 그 주 월요일. */
export function mondayOf(iso) { return isoShift(iso, -mondayIndex(iso)); }

/* 사이드바 미니 캘린더 그리드 — 요일 헤더 + 앞 공백 + 날짜 칸.
 *   dates    : 표시할 ISO 날짜 배열 (연속, 월요일 시작 정렬)
 *   countOf  : (iso) => 그날 값 (0 = 미학습)
 *   todayISO : 오늘
 *   lead     : 1일 앞 빈 칸 수 (월간 캘린더용)
 *   prDays   : 코랄로 칠할 날짜 Set (없으면 생략)
 *   tierOf   : 값 → 농도 1~3 (기본 miniTier · 스케일이 다르면 makeMiniTier)
 */
export function miniCalGrid(dates, { countOf, todayISO, lead = 0, prDays, tierOf = miniTier } = {}) {
  const grid = document.createElement('div');
  grid.className = 'v-cal';
  for (const w of DOW_KO) {
    const el = document.createElement('span');
    el.className = 'dw'; el.textContent = w;
    grid.appendChild(el);
  }
  for (let i = 0; i < lead; i++) grid.appendChild(document.createElement('span'));
  for (const iso of dates) {
    const cell = document.createElement('span');
    const future = iso > todayISO;
    const v = future ? 0 : Number(countOf?.(iso)) || 0;
    const cls = ['cd'];
    if (future) cls.push('fut');
    else if (prDays?.has(iso) && v > 0) cls.push('pr');
    else if (v > 0) cls.push('t' + tierOf(v));
    if (iso === todayISO) cls.push('today');
    cell.className = cls.join(' ');
    const num = document.createElement('span');
    num.textContent = String(+iso.slice(8, 10));
    cell.appendChild(num);
    grid.appendChild(cell);
  }
  return grid;
}
