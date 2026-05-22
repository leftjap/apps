/**
 * book entry — auth 부트스트랩 + 라우터 시작 (today main.js 패턴 답습).
 *
 * 흐름 (subscribe-first 패턴 — iOS Safari PWA getSession race #1560 회피):
 *  1) onAuthStateChange 즉시 구독 → supabase-js 가 INITIAL_SESSION 으로 persisted session 발화
 *  2) 세션 + 허용 이메일 → ensureUserDB + ensureProfile + showAuthenticated
 *  3) 세션 없거나 비허용 이메일 → signOut + showLogin
 *  4) 이후 SIGNED_IN/TOKEN_REFRESHED/USER_UPDATED/SIGNED_OUT 동일 핸들러로 처리
 */
import { Auth } from './services/auth.js';
import { supabase } from './services/supabase.js';
import { installAuthSessionGuard } from './services/auth-session-guard.js';
import { Profile } from './services/profile.js';
import { showAuthenticated, showLogin, setRouterUser } from './app.js';

async function handleSession(session) {
  const user = session?.user;
  if (!user) {
    showLogin();
    return;
  }
  // allowlist 검증 — 비허용 이메일은 즉시 로그아웃 + 차단 메시지
  if (!Auth.isAllowedEmail(user.email)) {
    localStorage.setItem(
      Auth.AUTH_ERROR_KEY,
      `허용되지 않은 계정입니다: ${user.email || '(이메일 없음)'}`,
    );
    await Auth.signOut();
    showLogin();
    return;
  }
  // Dexie DB 인스턴스 — Supabase 미설정·오프라인에서도 로컬 동작 확보
  await Auth.ensureUserDB(user);
  // ensureProfile 은 RLS · 네트워크 오류 시 null 반환 — 화면은 그대로 진입 (UX 우선)
  await Profile.ensureProfile(user);
  setRouterUser(user);
  showAuthenticated(user);
}

async function bootstrap() {
  // Storage persistence 요청 — WebKit eviction 면제 (today main.js 주석 참조). deny 돼도 무해.
  if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
    navigator.storage.persist()
      .then((granted) => console.info('[main] storage.persist() granted:', granted))
      .catch((e) => console.warn('[main] storage.persist() 실패', e?.message || e));
  }

  // subscribe-first — getSession() 호출 안 함 (iOS WebKit race #1560 회피).
  const guard = installAuthSessionGuard(supabase);

  Auth.onAuthStateChange(async (event, session) => {
    if (
      event === 'INITIAL_SESSION'
      || event === 'SIGNED_IN'
      || event === 'TOKEN_REFRESHED'
      || event === 'USER_UPDATED'
    ) {
      await handleSession(session);
    } else if (event === 'SIGNED_OUT') {
      if (guard) await guard.handleSignedOutWithRetry(showLogin);
      else showLogin();
    }
  });
}

bootstrap();
