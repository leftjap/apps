import './styles/pick.css';
// pick 진입점 — today 부트스트랩 미러(subscribe-first OAuth). partner/feature-mount 제거.
import { Auth } from './services/auth.js';
import { supabase, storageKey } from './services/supabase.js';
import { installAuthSessionGuard } from './services/auth-session-guard.js';
import { backupSession, restoreSessionIfMissing } from './services/auth-session-backup.js';
import { Profile } from './services/profile.js';
import { Sync } from './db/sync.js';
import { showAuthenticated, showLogin, setRouterUser } from './app.js';

async function handleSession(session) {
  const user = session?.user;
  if (!user) { showLogin(); return; }
  if (!Auth.isAllowedEmail(user.email)) {
    localStorage.setItem(Auth.AUTH_ERROR_KEY, `허용되지 않은 계정입니다: ${user.email || '(이메일 없음)'}`);
    await Auth.signOut();
    showLogin();
    return;
  }
  await Auth.ensureUserDB(user);
  await Profile.ensureProfile(user);
  setRouterUser(user.id, user.email);
  showAuthenticated(user);
  // Supabase → Dexie 동기화 (백그라운드, 실패해도 화면 진입).
  Sync.startSync(user).catch((e) => console.warn('[main] startSync 실패', e?.message || e));
}

async function bootstrap() {
  if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
    navigator.storage.persist().catch(() => {});
  }
  // subscribe-first — supabase-js 가 INITIAL_SESSION 으로 persisted session 발화 (iOS WebKit race 회피).
  const guard = installAuthSessionGuard(supabase);
  Auth.onAuthStateChange(async (event, session) => {
    if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
      if (session) {
        backupSession(storageKey, session);
        await handleSession(session);
      } else if (event === 'INITIAL_SESSION') {
        const r = await restoreSessionIfMissing(supabase, storageKey);
        if (!r.restored) await handleSession(null);
      } else {
        await handleSession(session);
      }
    } else if (event === 'SIGNED_OUT') {
      const r = await restoreSessionIfMissing(supabase, storageKey);
      if (r.restored) return;
      if (guard) await guard.handleSignedOutWithRetry(showLogin);
      else showLogin();
    }
  });
}

bootstrap();
