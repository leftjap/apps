/* d1/shared.js — key-expression highlight, single source of truth.
 * Ported verbatim from the design handoff (dt-data.js window.splitHi).
 *   splitHi(text, hls)    → [{ t, hi }]   (case-insensitive, all occurrences)
 *   hiFragment(text, hls)  → DocumentFragment with <span class="hi"> around matches
 */
export function splitHi(text, hls) {
  if (!hls || !hls.length) return [{ t: text, hi: false }];
  const esc = hls.map((hl) => hl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp('(' + esc.join('|') + ')', 'ig');
  const out = [];
  let last = 0, m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push({ t: text.slice(last, m.index), hi: false });
    out.push({ t: m[0], hi: true });
    last = m.index + m[0].length;
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  if (last < text.length) out.push({ t: text.slice(last), hi: false });
  return out;
}

export function hiFragment(text, hls) {
  const frag = document.createDocumentFragment();
  for (const run of splitHi(text, hls)) {
    if (run.hi) {
      const span = document.createElement('span');
      span.className = 'hi';
      span.textContent = run.t;
      frag.appendChild(span);
    } else {
      frag.appendChild(document.createTextNode(run.t));
    }
  }
  return frag;
}
