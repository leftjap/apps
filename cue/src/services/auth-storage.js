/**
 * IndexedDB Supabase auth storage adapter — iOS PWA ITP 7일 룰 회피.
 * IndexedDB 는 ITP 적용 대상 아님. localStorage 의 legacy 세션은 첫 getItem 시 1회 마이그.
 * Supabase auth 의 storage interface (`{getItem,setItem,removeItem}`, Promise OK) 충족.
 * (today/study/gym 패턴 verbatim — 같은 storageKey 로 github.io 동일 origin 세션 공유)
 */
const DB_NAME = 'sb-auth';
const STORE = 'kv';
let _dbPromise = null;

function openDB() {
  if (_dbPromise) return _dbPromise;
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('indexedDB unavailable'));
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
}

async function idbOp(mode, run) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = run(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function createIndexedDBStorage({ legacyLocalStorageKey } = {}) {
  let migratePromise = null;
  function migrateOnce() {
    if (migratePromise) return migratePromise;
    migratePromise = (async () => {
      try {
        if (!legacyLocalStorageKey || typeof localStorage === 'undefined') return;
        const legacy = localStorage.getItem(legacyLocalStorageKey);
        if (!legacy) return;
        const existing = await idbOp('readonly', (s) => s.get(legacyLocalStorageKey)).catch(() => undefined);
        if (existing == null) await idbOp('readwrite', (s) => s.put(legacy, legacyLocalStorageKey));
        localStorage.removeItem(legacyLocalStorageKey);
      } catch (e) { console.warn('[auth-storage] migrate', e); }
    })();
    return migratePromise;
  }
  return {
    async getItem(key) {
      await migrateOnce();
      try { return (await idbOp('readonly', (s) => s.get(key))) ?? null; }
      catch (e) {
        console.warn('[auth-storage] getItem', e);
        return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
      }
    },
    async setItem(key, value) {
      await migrateOnce();
      try { await idbOp('readwrite', (s) => s.put(value, key)); }
      catch (e) {
        console.warn('[auth-storage] setItem', e);
        if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
      }
    },
    async removeItem(key) {
      try { await idbOp('readwrite', (s) => s.delete(key)); } catch { /* ignore */ }
      if (typeof localStorage !== 'undefined') { try { localStorage.removeItem(key); } catch { /* ignore */ } }
    },
  };
}
