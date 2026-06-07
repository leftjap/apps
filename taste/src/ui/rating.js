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
// ⚠ 호버는 채움만 갱신(paint) — DOM 을 재생성하면 클릭/드래그 대상 버튼이 파괴돼 확정(onChange)이
//    삼켜진다(버그). 확정은 pointerup 으로 — 마우스 클릭·드래그-릴리스·터치 탭 모두 커버.
export function starRating({ value = 0, editable = false, onChange, size = 22, showValue = true } = {}) {
  const wrap = el('div', { class: 'stars' });
  const row = el('div', { class: 'stars__row' });
  const cells = [];
  for (let i = 1; i <= 5; i++) {
    // fill = 전체폭(size) 별 모양. clip = X% overflow 래퍼 → 찌그러짐 없이 왼쪽 X% 노출.
    const fill = el('div', { class: 'star__fill', style: `clip-path:${STAR_CLIP};width:${size}px` });
    const clip = el('div', { class: 'star__clip' }, fill);
    cells.push({ clip, fill });
    const star = el('div', { class: 'star', style: `width:${size}px;height:${size}px` },
      el('div', { class: 'star__track', style: `clip-path:${STAR_CLIP}` }), clip);
    if (editable) {
      const hit = (val, side) => el('button', {
        class: 'star__hit', style: side, 'aria-label': `${val}점`,
        onPointerup: () => onChange && onChange(val),
        onMouseenter: () => paint(val),
      });
      star.append(hit(i - 0.5, 'left:0'), hit(i, 'right:0'));
    }
    row.appendChild(star);
  }
  wrap.appendChild(row);
  const meta = showValue ? el('div', { class: 'stars__meta' }) : null;
  if (meta) wrap.appendChild(meta);

  function paint(shown) {
    const pan = isPan(shown);
    wrap.className = 'stars' + (pan ? ' stars--pan' : '');
    const color = pan ? 'var(--danger)' : 'var(--gold)';
    cells.forEach(({ clip, fill }, idx) => { clip.style.width = `${starFill(shown, idx + 1)}%`; fill.style.background = color; });
    if (meta) {
      meta.innerHTML = '';
      if (shown > 0) {
        meta.appendChild(el('span', { class: 'stars__val' }, shown.toFixed(1)));
        if (pan) meta.appendChild(el('span', { class: 'stars__pan' }, '비추'));
      } else meta.appendChild(el('span', { class: 'stars__empty' }, editable ? '평가하기' : '미평가'));
    }
  }
  if (editable) wrap.addEventListener('mouseleave', () => paint(value));
  paint(value);
  return wrap;
}
