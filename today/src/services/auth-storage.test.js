/**
 * auth-storage IDB adapter — round-trip + 1회 마이그 검증.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createIndexedDBStorage, __resetDBPromiseForTests } from './auth-storage.js';

function fakeLocalStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    clear: () => map.clear(),
    _map: map,
  };
}

beforeEach(async () => {
  await __resetDBPromiseForTests();
  await new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase('sb-auth');
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('delete blocked'));
  });
  vi.stubGlobal('localStorage', fakeLocalStorage());
});

describe('createIndexedDBStorage', () => {
  it('round-trip — setItem/getItem/removeItem', async () => {
    const s = createIndexedDBStorage();
    expect(await s.getItem('k')).toBeNull();
    await s.setItem('k', 'v');
    expect(await s.getItem('k')).toBe('v');
    await s.removeItem('k');
    expect(await s.getItem('k')).toBeNull();
  });

  it('첫 getItem 시 localStorage legacy 키를 IDB 로 마이그 + localStorage 제거', async () => {
    localStorage.setItem('sb-test-auth-token', 'legacy-session');
    const s = createIndexedDBStorage({ legacyLocalStorageKey: 'sb-test-auth-token' });
    expect(await s.getItem('sb-test-auth-token')).toBe('legacy-session');
    expect(localStorage.getItem('sb-test-auth-token')).toBeNull();
  });

  it('마이그는 1회만 — 두 번째 getItem 은 IDB 의 값 그대로', async () => {
    localStorage.setItem('sb-test-auth-token', 'first');
    const s = createIndexedDBStorage({ legacyLocalStorageKey: 'sb-test-auth-token' });
    await s.getItem('sb-test-auth-token');
    localStorage.setItem('sb-test-auth-token', 'second-but-should-be-ignored');
    await s.setItem('sb-test-auth-token', 'updated-in-idb');
    expect(await s.getItem('sb-test-auth-token')).toBe('updated-in-idb');
  });
});
