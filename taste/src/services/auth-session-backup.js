/**
 * 세션 백업·자동복원 — iOS PWA 토큰 비정상 제거 대비.
 * 실측: 이 프로젝트는 refresh token rotation OFF → 옛 refresh 토큰이 계속 유효.
 * 따라서 supabase 저장소(IndexedDB sb-auth)와 **별도 키**에 토큰을 미러해 두면,
 * 비정상 _removeSession(스푸리어스·부분 소실) 후에도 setSession 으로 복원 가능.
 * 명시 로그아웃 시엔 clearBackup 으로 폐기(부활 방지). 전체 origin eviction 은 백업도 소실(한계).
 */
function bkKey(storageKey) {
  return `${storageKey}-backup`;
}

export function backupSession(storageKey, session) {
  try {
    if (!storageKey || !session?.refresh_token) return;
    localStorage.setItem(
      bkKey(storageKey),
      JSON.stringify({ access_token: session.access_token, refresh_token: session.refresh_token }),
    );
  } catch { /* localStorage 불가 환경 무시 */ }
}

export function clearBackup(storageKey) {
  try { if (storageKey) localStorage.removeItem(bkKey(storageKey)); } catch { /* noop */ }
}

/**
 * supabase 가 세션을 잃은 상태면 백업으로 1회 복원 시도.
 * @returns {restored:boolean} restored=true 면 setSession 이 SIGNED_IN 을 발화함(호출부는 return).
 */
export async function restoreSessionIfMissing(supabase, storageKey) {
  if (!supabase || !storageKey) return { restored: false, reason: 'no-client' };
  try {
    const cur = await supabase.auth.getSession().catch(() => null);
    if (cur?.data?.session) return { restored: false, reason: 'has-session' };
    const raw = localStorage.getItem(bkKey(storageKey));
    if (!raw) return { restored: false, reason: 'no-backup' };
    const b = JSON.parse(raw);
    if (!b?.refresh_token) { clearBackup(storageKey); return { restored: false, reason: 'bad-backup' }; }
    const { data, error } = await supabase.auth.setSession({
      access_token: b.access_token, refresh_token: b.refresh_token,
    });
    if (!error && data?.session) {
      console.info('[auth-backup] 세션 복원 성공');
      return { restored: true };
    }
    // 서버가 거부 = 세션 실제 사망 → 백업 폐기(매 부팅 재시도 루프 방지)
    clearBackup(storageKey);
    console.warn('[auth-backup] 복원 실패, 백업 폐기', error?.message || error);
    return { restored: false, reason: 'restore-failed' };
  } catch (e) {
    return { restored: false, reason: 'exception', error: e };
  }
}
