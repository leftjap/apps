/* d1/dom.js — tiny hyperscript helper for the desktop redesign (D1).
 * h(tag, props?, ...children) → HTMLElement
 *   props.class   → className
 *   props.style   → cssText (string)
 *   props.onClick → click listener
 *   props.html    → innerHTML (escape hatch — use sparingly)
 *   other keys    → setAttribute (skips null/undefined/false; `true` → empty attr)
 * children: string|number → text · Node → append · array → flatten · null/false → skip
 */
export function h(tag, props = {}, ...children) {
  const n = document.createElement(tag);
  for (const k in props) {
    const v = props[k];
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'style') n.style.cssText = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k === 'onClick') n.addEventListener('click', v);
    else n.setAttribute(k, v === true ? '' : String(v));
  }
  append(n, children);
  return n;
}

function append(node, children) {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) append(node, c);
    else if (c instanceof Node) node.appendChild(c);
    else node.appendChild(document.createTextNode(String(c)));
  }
}
