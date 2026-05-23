/**
 * book_profiles 초기화 + 페어링 헬퍼 (today profile.js 패턴 답습, D4).
 *
 * 책임:
 *  - signIn 후 book_profiles row 가 없으면 insert (display_name 자동 추출 + partner 자동 매핑)
 *  - 페어링 self-heal — 기존 row partner_user_id NULL 이면 매핑 lookup 후 update
 *  - getMyProfile / getPartnerProfile (RLS: own row + partner row 만 보임)
 *
 * book_profiles 스키마 (§3.1): user_id, display_name, partner_user_id, updated_at.
 * (today_profiles 의 tabs / expense_categories / avatar_url 은 book 미사용.)
 *
 * `window.bookProfile` 노출.
 */
import { supabase } from './supabase.js';

// geo-apps auth.users.id 박제 (today profile.js 와 동일 — 같은 사용자/프로젝트).
// 지오=7bae5645…, 소연=aeafd9a7… → 서로 partner.
export const EMAIL_TO_PARTNER_USER_ID = Object.freeze({
  'leftjap@gmail.com': 'aeafd9a7-4094-4e7c-a621-188d6b2e336d',
  'soyoun312@gmail.com': '7bae5645-61c6-4476-9ff2-4c30a72812ff',
});

export const EMAIL_TO_DISPLAY_NAME = Object.freeze({
  'leftjap@gmail.com': '지오',
  'soyoun312@gmail.com': '소연',
});

export function getPartnerUserIdForEmail(email) {
  if (!email) return null;
  return EMAIL_TO_PARTNER_USER_ID[email] || null;
}

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

const SELECT_COLS = 'user_id, display_name, partner_user_id';

/**
 * book_profiles row 보장.
 *  1) select where user_id = user.id
 *  2) 있으면 그대로 반환 (partner_user_id NULL 이면 매핑으로 self-heal)
 *  3) 없으면 insert (display_name 자동, partner 매핑)
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

  if (existing) {
    const mappedPartner = getPartnerUserIdForEmail(user.email);
    if (!existing.partner_user_id && mappedPartner) {
      const { data: healed, error: healError } = await supabase
        .from('book_profiles')
        .update({ partner_user_id: mappedPartner })
        .eq('user_id', user.id)
        .select(SELECT_COLS)
        .single();
      if (healError) {
        console.warn('[profile] partner_user_id self-heal 실패', healError?.message || healError);
        return existing;
      }
      return healed;
    }
    return existing;
  }

  const displayName = getDisplayNameForEmail(user.email) || deriveDisplayName(user);
  const partnerUserId = getPartnerUserIdForEmail(user.email);
  const insertPayload = { user_id: user.id, display_name: displayName };
  if (partnerUserId) insertPayload.partner_user_id = partnerUserId;
  // upsert(onConflict user_id): 부팅 시 다중 auth 이벤트(INITIAL_SESSION/SIGNED_IN/
  // TOKEN_REFRESHED)가 ensureProfile 를 동시 호출 → SELECT 모두 빈 결과 → INSERT 레이스 →
  // 패자 23505(duplicate key). upsert 로 idempotent 화 (RLS insert+update 정책 양쪽 충족).
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

/** 본인 profile (RLS — own row + partner row 만 보임). */
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

/** 파트너 profile (페어링 후 RLS 로 자동 노출). */
async function getPartnerProfile() {
  if (!supabase) return null;
  const me = await getMyProfile();
  if (!me?.partner_user_id) return null;
  const { data, error } = await supabase
    .from('book_profiles')
    .select('user_id, display_name')
    .eq('user_id', me.partner_user_id)
    .maybeSingle();
  if (error) {
    console.error('[profile] getPartnerProfile 실패', error);
    return null;
  }
  return data;
}

export const Profile = {
  ensureProfile,
  getMyProfile,
  getPartnerProfile,
  deriveDisplayName,
  getPartnerUserIdForEmail,
  getDisplayNameForEmail,
  EMAIL_TO_PARTNER_USER_ID,
  EMAIL_TO_DISPLAY_NAME,
};

if (typeof window !== 'undefined') {
  window.bookProfile = Profile;
}

export default Profile;
