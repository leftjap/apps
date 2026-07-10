/**
 * auth.js — cue 인증 (최소). Google OAuth + 세션 조회 + 변경 구독 + 로그아웃.
 * cue 는 읽기 전용·자기 sync 없음 → 형제 앱의 sync 중단/Dexie 로직 불필요.
 * RLS 가 데이터 격리 (로그인 사용자 자기 행만) → ALLOWED_EMAILS 화이트리스트 생략.
 */
import { supabase, isSupabaseConfigured } from './supabase.js';

// OAuth 후 돌아올 주소 = 현재 origin + Vite base (/ 로컬, /apps/cue/ 배포).
// ※ 이 URL 은 Supabase Auth "Redirect URLs" 허용목록에 등록돼 있어야 함
//   (배포: https://leftjap.github.io/apps/cue/ · 로컬: http://localhost:5178/).
const REDIRECT_TO =
  typeof window !== 'undefined' ? window.location.origin + import.meta.env.BASE_URL : '/';

export { isSupabaseConfigured };

/** 현재 세션 (없으면 null). */
export async function getSession() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session || null;
}

/** 현재 로그인 사용자 (없으면 null). */
export async function getUser() {
  const session = await getSession();
  return session?.user || null;
}

/** 인증 상태 변경 구독. 반환값 호출 시 구독 해제. */
export function onAuthChange(cb) {
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((_event, session) => cb(session));
  return () => data.subscription.unsubscribe();
}

/** Google 로그인 (현재 탭에서 OAuth 리다이렉트). */
export async function signInWithGoogle() {
  if (!supabase) return;
  await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: REDIRECT_TO, queryParams: { prompt: 'select_account' } },
  });
}

/** 로그아웃. 이 기기에서만 — scope 기본값 global 은 다른 기기 세션까지 서버에서 삭제한다. */
export async function signOut() {
  if (!supabase) return;
  await supabase.auth.signOut({ scope: 'local' });
}
