/**
 * vanilla DOM 렌더 헬퍼 (book ui 토대).
 *  - el(tag, props, ...children): 하이퍼스크립트. style 객체는 숫자→px 자동 보정 (React style 객체 이식 호환).
 *  - escapeHtml: 모든 사용자 텍스트 XSS 방지 (spec §2.2).
 *  - clear / frag.
 */

const UNITLESS = new Set([
  'opacity', 'zIndex', 'fontWeight', 'lineHeight', 'flex', 'flexGrow', 'flexShrink',
  'order', 'zoom', 'WebkitLineClamp', 'gridRow', 'gridColumn',
]);

export function setStyle(node, styleObj) {
  for (const [k, v] of Object.entries(styleObj)) {
    if (v == null) continue;
    if (k.startsWith('--')) { node.style.setProperty(k, String(v)); continue; }
    const val = typeof v === 'number' && !UNITLESS.has(k) ? `${v}px` : v;
    node.style[k] = val;
  }
}

function appendChildren(node, children) {
  for (const c of children) {
    if (c == null || c === false || c === true) continue;
    if (Array.isArray(c)) { appendChildren(node, c); continue; }
    if (c instanceof Node) { node.appendChild(c); continue; }
    node.appendChild(document.createTextNode(String(c)));
  }
}

/**
 * el('div', { class, style:{}, onClick, dataset:{}, html, ...attrs }, child1, child2, ...)
 *  - style: 객체 (camelCase, 숫자 px 보정) 또는 문자열.
 *  - html: innerHTML 직접 주입 (정적 SVG/아이콘 등 — 사용자 텍스트엔 escapeHtml 필수).
 *  - onXxx: 이벤트 리스너.
 */
export function el(tag, props, ...children) {
  const node = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'style') {
        if (typeof v === 'string') node.style.cssText = v;
        else setStyle(node, v);
      } else if (k === 'class' || k === 'className') {
        node.className = v;
      } else if (k === 'dataset') {
        Object.assign(node.dataset, v);
      } else if (k === 'html') {
        node.innerHTML = v;
      } else if (k.startsWith('on') && typeof v === 'function') {
        node.addEventListener(k.slice(2).toLowerCase(), v);
      } else if (k === 'for') {
        node.setAttribute('for', v);
      } else {
        node.setAttribute(k, v === true ? '' : v);
      }
    }
  }
  appendChildren(node, children);
  return node;
}

export function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

export function frag(...children) {
  const f = document.createDocumentFragment();
  appendChildren(f, children);
  return f;
}
