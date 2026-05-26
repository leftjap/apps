/**
 * 온디바이스 진단 — 로그인 풀림 원인 판별.
 * 로그인 마커(localStorage). 풀림 발생 시 로그인 화면 진단줄로 판독:
 *   marker 없음·backup 없음·idb 없음  → 저장소 통째 삭제 = eviction
 *   marker 있음·세션 없음              → 저장소 멀쩡, 토큰만 거부 = 서버측
 *   marker 있음·backup 있음·idb 없음   → IndexedDB 만 일시 비가용
 */
const DIAG_DB = 'sb-auth';
const DIAG_STORE = 'kv';

let _lastAuthError = null;
let _consoleHooked = false;

function diagKey(k) { return `${k}-diag`; }
function bkKey(k) { return `${k}-backup`; }

function hookConsoleErrorOnce() {
  if (_consoleHooked || typeof console === 'undefined') return;
  _consoleHooked = true;
  const orig = console.error.bind(console);
  console.error = (...args) => {
    try {
      const s = args.map((a) => a?.message ?? String(a)).join(' ');
      if (/Refresh Token|AuthApiError|AuthError/i.test(s)) {
        _lastAuthError = { ts: Date.now(), msg: s.slice(0, 200) };
      }
    } catch { /* noop */ }
    orig(...args);
  };
}

export function markLogin(storageKey) {
  try { if (storageKey) localStorage.setItem(diagKey(storageKey), JSON.stringify({ ts: Date.now() })); }
  catch { /* noop */ }
}

async function snapshot(storageKey) {
  let markerTs = null;
  try { const raw = localStorage.getItem(diagKey(storageKey)); if (raw) markerTs = JSON.parse(raw)?.ts ?? null; } catch {}
  const backupPresent = !!(storageKey && localStorage.getItem(bkKey(storageKey)));
  let idbPresent = false;
  try {
    idbPresent = await new Promise((res) => {
      const r = indexedDB.open(DIAG_DB, 1);
      r.onsuccess = () => {
        try {
          const tx = r.result.transaction(DIAG_STORE, 'readonly').objectStore(DIAG_STORE).get(storageKey);
          tx.onsuccess = () => res(tx.result != null);
          tx.onerror = () => res(false);
        } catch { res(false); }
      };
      r.onerror = () => res(false);
    });
  } catch {}
  let persisted = 'unknown';
  try { if (navigator.storage?.persisted) persisted = await navigator.storage.persisted(); } catch {}
  return { markerTs, backupPresent, idbPresent, persisted, lastErr: _lastAuthError };
}

function fmt(s) {
  const m = s.markerTs ? new Date(s.markerTs).toISOString().slice(0, 16).replace('T', ' ') : 'never';
  let sig;
  if (!s.markerTs && !s.backupPresent && !s.idbPresent) sig = 'EVICTION 의심 또는 첫 로그인 전';
  else if (s.markerTs && !s.backupPresent && !s.idbPresent) sig = '세션 토큰 제거 (서버거부 or signout)';
  else if (s.markerTs && s.backupPresent && !s.idbPresent) sig = 'IndexedDB 만 소실 (백업 복원 가능)';
  else if (s.markerTs && s.idbPresent) sig = '비정상 — 세션 있는데 로그인 화면';
  else if (!s.markerTs && (s.backupPresent || s.idbPresent)) sig = '마커만 소실 (부분 손상)';
  else sig = '확인필요';
  const err = s.lastErr ? ` | err:${s.lastErr.msg.slice(0, 80)}` : '';
  return `marker:${m} | backup:${s.backupPresent ? 'Y' : 'N'} idb:${s.idbPresent ? 'Y' : 'N'} persist:${s.persisted} | ${sig}${err}`;
}

export async function mountDiag(storageKey) {
  hookConsoleErrorOnce();
  if (typeof document === 'undefined') return;
  let el = document.getElementById('auth-diag-line');
  if (!el) {
    el = document.createElement('div');
    el.id = 'auth-diag-line';
    el.style.cssText = 'position:fixed;bottom:0;left:0;right:0;font:11px/1.4 monospace;background:#222;color:#cf6;padding:4px 8px;z-index:99999;opacity:0.9;word-break:break-all;';
    document.body.appendChild(el);
  }
  el.textContent = '진단 로딩…';
  try { el.textContent = fmt(await snapshot(storageKey)); } catch (e) { el.textContent = 'diag err'; }
}

export function unmountDiag() {
  if (typeof document === 'undefined') return;
  const el = document.getElementById('auth-diag-line');
  if (el) el.remove();
}
