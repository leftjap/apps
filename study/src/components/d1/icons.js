/* d1/icons.js — vanilla SVG icons for the desktop redesign.
 * Ported verbatim from the design handoff (dt-shared.jsx). Colors via currentColor.
 * d1Icon(name, size?) → <svg>
 */
const NS = 'http://www.w3.org/2000/svg';

// name → { a: <svg> attrs, c: [ [childTag, attrs], ... ] }
const DEFS = {
  play: { a: { fill: 'currentColor' }, c: [['path', { d: 'M8 5.2v13.6c0 .9 1 1.5 1.8 1L20 12.9c.7-.5.7-1.5 0-2L9.8 4.2C9 3.7 8 4.3 8 5.2Z' }]] },
  mic: { a: { fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, c: [['rect', { x: 9, y: 3, width: 6, height: 11, rx: 3 }], ['path', { d: 'M6 11a6 6 0 0 0 12 0M12 17v3' }]] },
  repeat: { a: { fill: 'none', stroke: 'currentColor', 'stroke-width': 1.9, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, c: [['path', { d: 'M17 2.5 20.5 6 17 9.5' }], ['path', { d: 'M3.5 11V9.5A3.5 3.5 0 0 1 7 6h13.5' }], ['path', { d: 'M7 21.5 3.5 18 7 14.5' }], ['path', { d: 'M20.5 13v1.5a3.5 3.5 0 0 1-3.5 3.5H3.5' }]] },
  home: { a: { fill: 'none', stroke: 'currentColor', 'stroke-width': 1.9, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, c: [['path', { d: 'M3 11l9-7 9 7' }], ['path', { d: 'M5.5 9.5V20h13V9.5' }]] },
  close: { a: { fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, c: [['path', { d: 'M6 6l12 12M18 6 6 18' }]] },
  cal: { a: { fill: 'none', stroke: 'currentColor', 'stroke-width': 1.7 }, c: [['rect', { x: 3, y: 5, width: 18, height: 16, rx: 2.5 }], ['path', { d: 'M3 9h18M8 3v4M16 3v4' }]] },
  gear: { a: { fill: 'none', stroke: 'currentColor', 'stroke-width': 1.7 }, c: [['circle', { cx: 12, cy: 12, r: 3 }], ['path', { d: 'M19.4 13a7.6 7.6 0 0 0 0-2l1.8-1.4-1.7-3-2.2.9a7.6 7.6 0 0 0-1.7-1l-.3-2.3H9.4l-.3 2.3a7.6 7.6 0 0 0-1.7 1l-2.2-.9-1.7 3L5.3 11a7.6 7.6 0 0 0 0 2l-1.8 1.4 1.7 3 2.2-.9a7.6 7.6 0 0 0 1.7 1l.3 2.3h3.4l.3-2.3a7.6 7.6 0 0 0 1.7-1l2.2.9 1.7-3L19.4 13Z' }]] },
  sound: { a: { fill: 'currentColor' }, c: [['path', { d: 'M11 5 6 9H3v6h3l5 4V5Z' }], ['path', { d: 'M15.5 8.5a5 5 0 0 1 0 7', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round' }]] },
  flame: { a: { fill: 'currentColor' }, c: [['path', { d: 'M12 2c.6 3-1.8 4.2-1.8 6.6 0 1 .6 1.8 1 2.2.3-1.3 1.2-2 1.2-2 .3 2.4 2.4 3.2 2.4 5.6A4.8 4.8 0 0 1 12 22a5 5 0 0 1-5-5c0-3.6 3.4-5 3-9 1.2.6 1.8 1.8 1.8 1.8C13 7 11.6 4.6 12 2Z' }]] },
  back: { a: { fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, c: [['path', { d: 'M19 12H5M11 6l-6 6 6 6' }]] },
  arrow: { a: { fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, c: [['path', { d: 'M5 12h14M13 6l6 6-6 6' }]] },
  chevR: { a: { fill: 'none', stroke: 'currentColor', 'stroke-width': 2.2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, c: [['path', { d: 'M9 6l6 6-6 6' }]] },
  chevL: { a: { fill: 'none', stroke: 'currentColor', 'stroke-width': 2.2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, c: [['path', { d: 'M15 6l-6 6 6 6' }]] },
};

export function d1Icon(name, size = 16) {
  const def = DEFS[name];
  if (!def) throw new Error('d1Icon: unknown icon "' + name + '"');
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  for (const k in def.a) svg.setAttribute(k, def.a[k]);
  for (const [tag, attrs] of def.c) {
    const el = document.createElementNS(NS, tag);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    svg.appendChild(el);
  }
  return svg;
}
