/**
 * book_profiles 초기화 (today profile.js 패턴 답습).
 *
 * 책임:
 *  - signIn 후 book_profiles row 가 없으면 insert (display_name 자동 추출)
 *  - getMyProfile (RLS: own row 만 보임)
 *
 * book_profiles 스키마: user_id, display_name, updated_at.
 * (today_profiles 의 tabs / expense_categories / avatar_url 은 book 미사용.)
 *
 * `window.bookProfile` 노출.
 */
import { supabase } from './supabase.js';

export const EMAIL_TO_DISPLAY_NAME = Object.freeze({
  'leftjap@gmail.com': '지오',
});

export function getDisplayNameForEmail(email) {
  if (!email) return null;
  return EMAIL_TO_DISPLAY_NAME[email] || null;
}

function deriveDisplayName(user) {
  if (!user) return 'User';
  const meta = user.user_metadata || {};
  return (
    meta.full_name ||
    meta.name ||
    user.email?.split('@')[0] ||
    'User'
  );
}

const SELECT_COLS = 'user_id, display_name';

/**
 * book_profiles row 보장.
 *  1) select where user_id = user.id
 *  2) 있으면 그대로 반환
 *  3) 없으면 insert (display_name 자동)
 * supabase 미설정 시 → null 반환 (no-op).
 */
async function ensureProfile(user) {
  if (!supabase || !user?.id) return null;

  const { data: existing, error: selectError } = await supabase
    .from('book_profiles')
    .select(SELECT_COLS)
    .eq('user_id', user.id)
    .maybeSingle();

  if (selectError) {
    console.error('[profile] select 실패', selectError);
    return null;
  }

  if (existing) return existing;

  const displayName = getDisplayNameForEmail(user.email) || deriveDisplayName(user);
  const insertPayload = { user_id: user.id, display_name: displayName };
  // upsert(onConflict user_id): 부팅 시 다중 auth 이벤트(INITIAL_SESSION/SIGNED_IN/
  // TOKEN_REFRESHED)가 ensureProfile 를 동시 호출 → SELECT 모두 빈 결과 → INSERT 레이스 →
  // 패자 23505(duplicate key). upsert 로 idempotent 화.
  const { data: inserted, error: insertError } = await supabase
    .from('book_profiles')
    .upsert(insertPayload, { onConflict: 'user_id' })
    .select(SELECT_COLS)
    .single();

  if (insertError) {
    console.error('[profile] upsert 실패', insertError);
    return null;
  }
  return inserted;
}

/** 본인 profile (RLS — own row 만 보임). */
async function getMyProfile() {
  if (!supabase) return null;
  const { data: { user } = {} } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from('book_profiles')
    .select(SELECT_COLS)
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) {
    console.error('[profile] getMyProfile 실패', error);
    return null;
  }
  return data;
}

export const Profile = {
  ensureProfile,
  getMyProfile,
  deriveDisplayName,
  getDisplayNameForEmail,
  EMAIL_TO_DISPLAY_NAME,
};

if (typeof window !== 'undefined') {
  window.bookProfile = Profile;
}

export default Profile;
