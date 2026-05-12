// §10-2 — 오늘 체중 입력 키패드 바텀시트 (session.html keypadSheet 패턴 답습)
const KEYS = ['1','2','3','4','5','6','7','8','9','.','0','del'];
function renderGrid(grid) {
  if (!grid || grid.dataset.spaRendered === '1') return;
  grid.dataset.spaRendered = '1';
  grid.innerHTML = KEYS.map((k) => {
    const label = k === 'del' ? '⌫' : k;
    const color = k === 'del' ? 'rgba(255,255,255,0.7)' : '#fff';
    const fs = k === 'del' ? '18px' : '20px';
    return `<button class="keypad-key kr" data-key="${k}" type="button" style="height:48px;border-radius:10px;background:rgba(255,255,255,0.06);border:0;color:${color};font-family:var(--font-display);font-size:${fs};font-weight:300;cursor:pointer;">${label}</button>`;
  }).join('');
}
function updateBuf(buf, key) {
  if (key === 'del') return buf.slice(0, -1);
  if (key === '.') return buf.includes('.') ? buf : (buf || '0') + '.';
  return (buf + key).slice(0, 5);
}
function renderValue(sheet, valueEl) {
  if (valueEl) valueEl.textContent = sheet.dataset.buf || '0';
}
export function openWeightKeypad(doc) {
  if (!doc) return;
  const sheet = doc.getElementById('weightKeypadSheet');
  const backdrop = doc.getElementById('weightKeypadBackdrop');
  const value = doc.getElementById('weightKeypadValue');
  if (!sheet || !backdrop || !value) return;
  sheet.dataset.buf = '';
  renderValue(sheet, value);
  sheet.dataset.open = 'true';
  sheet.style.transform = 'translateY(0)';
  backdrop.dataset.open = 'true';
  backdrop.style.opacity = '1';
  backdrop.style.pointerEvents = 'auto';
}
export function closeWeightKeypad(doc) {
  if (!doc) return;
  const sheet = doc.getElementById('weightKeypadSheet');
  const backdrop = doc.getElementById('weightKeypadBackdrop');
  if (!sheet || !backdrop) return;
  sheet.dataset.open = 'false';
  sheet.style.transform = 'translateY(100%)';
  backdrop.dataset.open = 'false';
  backdrop.style.opacity = '0';
  backdrop.style.pointerEvents = 'none';
}
async function applyValue(doc) {
  const sheet = doc.getElementById('weightKeypadSheet');
  if (!sheet) return;
  const buf = sheet.dataset.buf || '';
  if (!buf) { closeWeightKeypad(doc); return; }
  const save = (typeof window !== 'undefined') ? window.gymWeights?.saveWeightInput : null;
  if (typeof save !== 'function') { closeWeightKeypad(doc); return; }
  try { await save(buf, null, doc); } catch (e) { console.error('[gymWeightKeypad] save', e); }
  closeWeightKeypad(doc);
}
export function wireWeightKeypad(doc) {
  if (!doc) return { wired: 0 };
  const sheet = doc.getElementById('weightKeypadSheet');
  const backdrop = doc.getElementById('weightKeypadBackdrop');
  const grid = doc.getElementById('weightKeypadGrid');
  const value = doc.getElementById('weightKeypadValue');
  const done = doc.getElementById('weightKeypadDone');
  const trigger = doc.querySelector('[data-bind="weight-input-trigger"]');
  if (!sheet || !backdrop || !grid || !value || !done) return { wired: 0 };
  renderGrid(grid);
  if (trigger && trigger.dataset.spaHooked !== '1') {
    trigger.addEventListener('click', () => openWeightKeypad(doc));
    trigger.dataset.spaHooked = '1';
  }
  if (sheet.dataset.spaHooked === '1') return { wired: 0 };
  sheet.dataset.spaHooked = '1';
  grid.addEventListener('click', (e) => {
    const btn = e.target?.closest?.('.keypad-key');
    if (!btn) return;
    sheet.dataset.buf = updateBuf(sheet.dataset.buf || '', btn.dataset.key);
    renderValue(sheet, value);
  });
  done.addEventListener('click', () => { applyValue(doc).catch((e) => console.error('[gymWeightKeypad] done', e)); });
  backdrop.addEventListener('click', () => closeWeightKeypad(doc));
  let downY = 0, tracking = false;
  sheet.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.keypad-key, #weightKeypadDone')) return;
    downY = e.clientY; tracking = true;
  });
  sheet.addEventListener('pointerup', (e) => {
    if (!tracking) return;
    tracking = false;
    if (e.clientY - downY >= 60) closeWeightKeypad(doc);
  });
  return { wired: 1 };
}
if (typeof window !== 'undefined') {
  window.gymWeightKeypad = { openWeightKeypad, closeWeightKeypad, wireWeightKeypad };
}
export const __test__ = { updateBuf };
