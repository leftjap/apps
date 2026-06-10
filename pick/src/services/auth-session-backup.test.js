// 세션 백업·복원 — iOS PWA 토큰 소실 방어의 핵심 상태머신 (복원 실패 시 백업 폐기 = 재시도 루프 방지).
import { describe, it, expect, beforeEach } from 'vitest';
import { backupSession, clearBackup, restoreSessionIfMissing } from './auth-session-backup.js';

const KEY = 'sb-test-auth-token';
const BK = `${KEY}-backup`;

// node 환경 — localStorage 스텁
function installLocalStorage() {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  return store;
}

const mockAuth = ({ session = null, setSessionResult } = {}) => ({
  auth: {
    getSession: async () => ({ data: { session } }),
    setSession: async () => setSessionResult ?? { data: { session: null }, error: new Error('no impl') },
  },
});

describe('auth-session-backup', () => {
  let store;
  beforeEach(() => { store = installLocalStorage(); });

  it('backupSession: refresh_token 있을 때만 저장', () => {
    backupSession(KEY, { access_token: 'a', refresh_token: 'r' });
    expect(JSON.parse(store.get(BK))).toEqual({ access_token: 'a', refresh_token: 'r' });
    store.clear();
    backupSession(KEY, { access_token: 'a' });   // refresh 없음 — 저장 안 함
    expect(store.has(BK)).toBe(false);
  });

  it('세션 살아있으면 복원 안 함 (has-session)', async () => {
    backupSession(KEY, { access_token: 'a', refresh_token: 'r' });
    const r = await restoreSessionIfMissing(mockAuth({ session: { user: {} } }), KEY);
    expect(r).toEqual({ restored: false, reason: 'has-session' });
  });

  it('백업 없으면 no-backup', async () => {
    const r = await restoreSessionIfMissing(mockAuth(), KEY);
    expect(r).toEqual({ restored: false, reason: 'no-backup' });
  });

  it('백업에 refresh_token 없으면 bad-backup + 백업 폐기', async () => {
    store.set(BK, JSON.stringify({ access_token: 'a' }));
    const r = await restoreSessionIfMissing(mockAuth(), KEY);
    expect(r).toEqual({ restored: false, reason: 'bad-backup' });
    expect(store.has(BK)).toBe(false);
  });

  it('정상 백업 + setSession 성공 → restored:true (백업 유지)', async () => {
    backupSession(KEY, { access_token: 'a', refresh_token: 'r' });
    const sb = mockAuth({ setSessionResult: { data: { session: { user: {} } }, error: null } });
    const r = await restoreSessionIfMissing(sb, KEY);
    expect(r).toEqual({ restored: true });
    expect(store.has(BK)).toBe(true);
  });

  it('서버가 복원 거부 → restore-failed + 백업 폐기 (매 부팅 재시도 루프 방지)', async () => {
    backupSession(KEY, { access_token: 'a', refresh_token: 'r' });
    const sb = mockAuth({ setSessionResult: { data: { session: null }, error: new Error('invalid refresh') } });
    const r = await restoreSessionIfMissing(sb, KEY);
    expect(r).toEqual({ restored: false, reason: 'restore-failed' });
    expect(store.has(BK)).toBe(false);
  });

  it('clearBackup: 명시 로그아웃 폐기', () => {
    backupSession(KEY, { access_token: 'a', refresh_token: 'r' });
    clearBackup(KEY);
    expect(store.has(BK)).toBe(false);
  });
});
