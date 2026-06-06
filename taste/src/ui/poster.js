import { el } from './dom.js';

// 작품마다 결정적 hue (저채도 플레이스홀더 색조). 실데이터엔 hue 없음 → 제목 해시.
export function hueFromString(s) {
  let h = 0;
  const str = String(s || '');
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 360;
  return h;
}

// design-ref/source/app/ui.jsx Poster 포팅. 저채도 줄무늬 + 책등(spine). 실이미지는 추후 교체.
export function poster({ type = 'film', title = '', year = '', hue = 40, w = 96, ratio = 1.48, rounded = 10, label = true } = {}) {
  const h = Math.round(w * ratio);
  const bg = `oklch(0.86 0.045 ${hue})`, bg2 = `oklch(0.81 0.05 ${hue})`, ink = `oklch(0.34 0.06 ${hue})`;
  const stripe = `repeating-linear-gradient(135deg, ${bg} 0 11px, ${bg2} 11px 22px)`;
  const p = el('div', { class: 'poster' + (type === 'book' ? ' poster--book' : ''),
    style: `width:${w}px;height:${h}px;border-radius:${rounded}px;background:${stripe};color:${ink}` });
  if (type === 'book') p.appendChild(el('span', { class: 'poster__spine', style: `background:oklch(0.74 0.06 ${hue})` }));
  p.appendChild(el('span', { class: 'poster__kind' }, type === 'film' ? 'FILM' : 'BOOK'));
  if (label) p.appendChild(el('span', { class: 'poster__title' }, title));
  p.appendChild(el('span', { class: 'poster__year' }, String(year || '')));
  return p;
}

export function chip(text, { active = false, onClick } = {}) {
  return el(onClick ? 'button' : 'span',
    { class: 'chip' + (active ? ' chip--on' : ''), ...(onClick ? { onClick } : {}) }, text);
}
export const dot = (size = 6) => el('span', { class: 'dot', style: `width:${size}px;height:${size}px` });
