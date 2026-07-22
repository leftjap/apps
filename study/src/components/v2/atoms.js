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
     v-settle/v-grow/v-draw 등 1회 안착(both)은 count 1 유지로 무영향. */
  .vh *,.vd *,.vs *{animation-iteration-count:1!important}
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
