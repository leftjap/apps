import { el } from './dom.js';

// design-ref/source/app/ui.jsx STAR_CLIP — 별 폴리곤(트랙/채움 2겹 clip-path).
export const STAR_CLIP = 'polygon(50% 2%, 61% 35%, 97% 35%, 68% 57%, 79% 92%, 50% 71%, 21% 92%, 32% 57%, 3% 35%, 39% 35%)';

// 별 i(1~5)의 채움 비율 0~100%.
export const starFill = (value, i) => Math.max(0, Math.min(1, (value || 0) - (i - 1))) * 100;
// 0.5★ = 비추 (앱 정체성). 0 < v <= 0.5.
export const isPan = (value) => value > 0 && value <= 0.5;
// 보조 앵커 라벨 (UI 미표시 — aria/유틸용. spec D2).
export function ratingLabel(v) {
  if (v == null) return '';
  if (v <= 0.5) return '비추';
  if (v <= 2.0) return '별로';
  if (v <= 3.0) return '보통';
  if (v <= 4.0) return '추천';
  return '최애';
}

// design-ref/source/app/ui.jsx StarRating 포팅. 값 표시 = 숫자 + 0.5★ 비추 칩(R5).
export function starRating({ value = 0, editable = false, onChange, size = 22, showValue = true } = {}) {
  const wrap = el('div', { class: 'stars' });
  let hover = null;
  const draw = () => {
    const shown = hover != null ? hover : value;
    const pan = isPan(shown);
    const fillColor = pan ? 'var(--danger)' : 'var(--gold)';
    wrap.className = 'stars' + (pan ? ' stars--pan' : '');
    wrap.innerHTML = '';
    const row = el('div', { class: 'stars__row' });
    for (let i = 1; i <= 5; i++) {
      const star = el('div', { class: 'star', style: `width:${size}px;height:${size}px` },
        el('div', { class: 'star__track', style: `clip-path:${STAR_CLIP}` }),
        el('div', { class: 'star__fill', style: `clip-path:${STAR_CLIP};width:${starFill(shown, i)}%;background:${fillColor}` }));
      if (editable) {
        const half = el('button', { class: 'star__hit', style: 'left:0', 'aria-label': `${i - 0.5}점`,
          onClick: () => onChange && onChange(i - 0.5),
          onMouseenter: () => { hover = i - 0.5; draw(); } });
        const full = el('button', { class: 'star__hit', style: 'right:0', 'aria-label': `${i}점`,
          onClick: () => onChange && onChange(i),
          onMouseenter: () => { hover = i; draw(); } });
        star.append(half, full);
      }
      row.appendChild(star);
    }
    wrap.appendChild(row);
    if (showValue) {
      const meta = el('div', { class: 'stars__meta' });
      if (shown > 0) {
        meta.appendChild(el('span', { class: 'stars__val' }, shown.toFixed(1)));
        if (pan) meta.appendChild(el('span', { class: 'stars__pan' }, '비추'));
      } else meta.appendChild(el('span', { class: 'stars__empty' }, editable ? '평가하기' : '미평가'));
      wrap.appendChild(meta);
    }
  };
  if (editable) wrap.addEventListener('mouseleave', () => { hover = null; draw(); });
  draw();
  return wrap;
}
