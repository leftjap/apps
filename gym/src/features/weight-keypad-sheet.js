// §10-2 — 오늘 체중 입력 키패드 바텀시트 (session.html keypadSheet 패턴 답습)
const KEYS = ['1','2','3','4','5','6','7','8','9','.','0','del'];
function renderGrid(grid) {
  if (!grid || grid.dataset.spaRendered === '1') return;
  grid.dataset.spaRendered = '1';
  grid.innerHTML = KEYS.map((k) => {
    const label = k === 'del' ? '⌫' : k;
    const isFn = k === 'del' || k === '.';
    const color = isFn ? 'var(--ink-3)' : 'var(--ink-1)';
    const bg = isFn ? 'transparent' : 'var(--sunken)';
    const fs = k === 'del' ? '20px' : '23px';
    return `<button class="keypad-key" data-key="${k}" type="button" style="height:50px;border-radius:var(--r-md);background:${bg};border:0;color:${color};font-family:var(--font-mono);font-size:${fs};font-weight:500;cursor:pointer;display:flex;align-items:center;justify-content:center;">${label}</button>`;
  }).join('');
}
function updateBuf(buf, key) {
  if (key === 'del') return buf.slice(0, -1);
  if (key === '.') return buf.includes('.') ? buf : (buf || '0') + '.';
  return (buf + key).slice(0, 5);
}
function renderValue(sheet, valueEl) {
  // P13 — 큰 값 + 깜빡이는 캐럿 (P3 세션 키패드와 동일 키패드 언어). buf 는 updateBuf 가 숫자/. 만 보장 → innerHTML 안전.
  if (valueEl) valueEl.innerHTML = `${sheet.dataset.buf || '0'}<span class="wk-caret" aria-hidden="true"></span>`;
}
/**
 * P13 참조줄 — rows(체중 date 오름차순) → "직전 <b>Nkg</b> · 7일 평균 <b>Mkg</b>".
 * mock fixture 정적값(69.4/69.7) 하드코딩이 실 데이터를 무시하던 버그 수정 — 동적 계산.
 * 기록 없으면 '오늘 첫 기록'. 숫자만 삽입 (innerHTML 안전).
 */
function formatWkRef(rows) {
  const list = Array.isArray(rows) ? rows.filter((r) => r && Number.isFinite(Number(r.weight))) : [];
  if (!list.length) return '오늘 첫 기록';
  const latest = Number(list[list.length - 1].weight);
  const last7 = list.slice(-7);
  const avg = last7.reduce((s, r) => s + Number(r.weight), 0) / last7.length;
  const fmt = (n) => (Math.round(n * 10) / 10).toFixed(1); // P12 통계(formatWeight)와 동일 표기
  return `직전 <b>${fmt(latest)}kg</b> · 7일 평균 <b>${fmt(avg)}kg</b>`;
}
/** 참조줄 비동기 채움 — 허브(mocks iframe, gymQueries 없음)는 fixture 유지. */
async function hydrateWkRef(doc) {
  const ref = doc.querySelector('[data-bind="wk-ref"]');
  const Q = (typeof window !== 'undefined') ? window.gymQueries : null;
  if (!ref || !Q?.listAllWeights) return;
  try {
    ref.innerHTML = formatWkRef(await Q.listAllWeights());
  } catch (_) { /* db 미초기화 — fixture 유지 */ }
}
export function openWeightKeypad(doc) {
  if (!doc) return;
  const sheet = doc.getElementById('weightKeypadSheet');
  const backdrop = doc.getElementById('weightKeypadBackdrop');
  const value = doc.getElementById('weightKeypadValue');
  if (!sheet || !backdrop || !value) return;
  sheet.dataset.buf = '';
  renderValue(sheet, value);
  hydrateWkRef(doc).catch(() => { /* graceful */ });
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
export const __test__ = { updateBuf, formatWkRef };
