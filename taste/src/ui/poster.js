import { el } from './dom.js';

// 작품마다 결정적 hue (저채도 플레이스홀더 색조). 실데이터엔 hue 없음 → 제목 해시.
export function hueFromString(s) {
  let h = 0;
  const str = String(s || '');
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 360;
  return h;
}

// design-ref/source/app/ui.jsx Poster 포팅. 저채도 줄무늬 + 책등(spine) 플레이스홀더.
// src(실 포스터/표지 URL) 있으면 그 위에 <img> 를 덮고, 로드 실패 시 img 제거 → 플레이스홀더 폴백.
export function poster({ type = 'film', title = '', year = '', hue = 40, w = 96, ratio = 1.48, rounded = 10, label = true, src = null, fill = false } = {}) {
  const h = Math.round(w * ratio);
  const bg = `oklch(0.86 0.045 ${hue})`, bg2 = `oklch(0.81 0.05 ${hue})`, ink = `oklch(0.34 0.06 ${hue})`;
  const stripe = `repeating-linear-gradient(135deg, ${bg} 0 11px, ${bg2} 11px 22px)`;
  // fill: 그리드 셀 너비를 채우는 반응형 포스터(aspect-ratio). 미지정 시 기존 고정 px.
  const size = fill ? `width:100%;aspect-ratio:1 / ${ratio};` : `width:${w}px;height:${h}px;`;
  const p = el('div', { class: 'poster' + (type === 'book' ? ' poster--book' : ''),
    style: `${size}border-radius:${rounded}px;background:${stripe};color:${ink}` });
  if (type === 'book') p.appendChild(el('span', { class: 'poster__spine', style: `background:oklch(0.74 0.06 ${hue})` }));
  p.appendChild(el('span', { class: 'poster__kind' }, type === 'film' ? 'FILM' : 'BOOK'));
  if (label) p.appendChild(el('span', { class: 'poster__title' }, title));
  p.appendChild(el('span', { class: 'poster__year' }, String(year || '')));
  if (src) {
    p.appendChild(el('img', { class: 'poster__img', src, alt: title || '', loading: 'lazy', decoding: 'async',
      onError: (e) => e.currentTarget.remove() }));
  }
  return p;
}

export function chip(text, { active = false, onClick } = {}) {
  return el(onClick ? 'button' : 'span',
    { class: 'chip' + (active ? ' chip--on' : ''), ...(onClick ? { onClick } : {}) }, text);
}
export const dot = (size = 6) => el('span', { class: 'dot', style: `width:${size}px;height:${size}px` });
