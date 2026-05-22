/**
 * 아이콘 — v14 design-ref/core.jsx 의 I 맵 + Ic 이식.
 *  - icon(name, {sz,st,cls}) → SVG 문자열 (template/innerHTML 합성용).
 *  - iconEl(name, opts) → SVGElement (createElement 합성용).
 */
export const ICON_PATHS = Object.freeze({
  search: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4-4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  quote: '<path d="M7 7h4v4c0 3-1.5 5-4 6"/><path d="M14 7h4v4c0 3-1.5 5-4 6"/>',
  chart: '<path d="M4 19V5"/><path d="M4 19h16"/><path d="M8 14v4"/><path d="M12 9v9"/><path d="M16 12v6"/>',
  dots: '<circle cx="6" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="18" cy="12" r="1.2"/>',
  'dots-v': '<circle cx="12" cy="6" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="12" cy="18" r="1.2"/>',
  ar: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  arL: '<path d="M19 12H5M11 6L5 12l6 6"/>',
  chev: '<path d="M9 6l6 6-6 6"/>',
  chevL: '<path d="M15 6l-6 6 6 6"/>',
  chevD: '<path d="M6 9l6 6 6-6"/>',
  close: '<path d="M6 6l12 12M18 6l-12 12"/>',
  pin: '<path d="M12 3l3 5 5 1-4 4 1 6-5-3-5 3 1-6-4-4 5-1z"/>',
  hash: '<path d="M5 9h14M5 15h14M10 4l-2 16M16 4l-2 16"/>',
  sparkle: '<path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"/>',
  sliders: '<path d="M4 6h10M4 12h6M4 18h14"/><circle cx="17" cy="6" r="2.2"/><circle cx="13" cy="12" r="2.2"/>',
  book: '<path d="M4 4h7v16H4z"/><path d="M11 4h9v16h-9"/><path d="M4 4c0 0 3.5-1 7-1s7 1 7 1"/>',
  user: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c1-4 4-6 7-6s6 2 7 6"/>',
  layer: '<path d="M12 4l9 5-9 5-9-5z"/><path d="M3 14l9 5 9-5"/>',
  cal: '<rect x="4" y="6" width="16" height="14" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  clock: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
  enter: '<path d="M9 10V6h11v12H4l5-5-5-5"/>',
  filter: '<path d="M4 5h16l-6 8v6l-4-2v-4z"/>',
  edit: '<path d="M4 20h4l10-10-4-4L4 16z"/><path d="M14 6l4 4"/>',
  comment: '<path d="M4 5h16v10H10l-4 4V5z"/>',
  share: '<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.2 11l7.6-4.2M8.2 13l7.6 4.2"/>',
  trash: '<path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13"/>',
  check: '<path d="M5 12l5 5 9-11"/>',
});

/** SVG 문자열. style 은 인라인 문자열로 전달 가능. */
export function icon(name, { sz = 18, st = 1.5, cls = '', style = '' } = {}) {
  const inner = ICON_PATHS[name] || '';
  const klass = ('i ' + cls).trim();
  const styleAttr = style ? ` style="${style}"` : '';
  return `<svg class="${klass}" width="${sz}" height="${sz}" viewBox="0 0 24 24" stroke-width="${st}"${styleAttr}>${inner}</svg>`;
}

/** SVGElement. */
export function iconEl(name, opts = {}) {
  const wrap = document.createElement('span');
  wrap.innerHTML = icon(name, opts);
  return wrap.firstElementChild;
}

export default { ICON_PATHS, icon, iconEl };
