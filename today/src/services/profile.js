/**
 * today_profiles 초기화 + 페어링 헬퍼 (Wave 11.4).
 *
 * 책임:
 *  - signIn 후 today_profiles row 가 없으면 insert (display_name 자동 추출)
 *  - 페어링은 admin SQL 1회 (Supabase 대시보드, 양쪽 사용자 첫 로그인 후)
 *    → RLS 가 다른 사용자의 row 를 보호하므로 클라이언트 페어링은 불가
 *
 * mocks IIFE 접근용 `window.todayProfile` 노출.
 */
import { supabase } from './supabase.js';

// 2026-05-05 — production 사용자 매핑 박제. ensureProfile 신규 row insert 시 자동 채움 +
// 기존 row partner_user_id NULL 시 self-heal. 별 dev DB 의 user_id 가 다르면 매칭 0건 (안전).
// 패턴: expense-classifier.js:43-46 EMAIL_TO_CATEGORIES 답습.
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

/**
 * today_profiles row 보장.
 *
 * 흐름:
 *  1) select where user_id = user.id
 *  2) 있으면 그대로 반환
 *  3) 없으면 insert (display_name 자동, partner_user_id null)
 *
 * supabase 미설정 시 → null 반환 (no-op).
 */
async function ensureProfile(user) {
  if (!supabase || !user?.id) return null;

  const { data: existing, error: selectError } = await supabase
    .from('today_profiles')
    .select('user_id, display_name, partner_user_id, tabs, avatar_url')
    .eq('user_id', user.id)
    .maybeSingle();

  if (selectError) {
    console.error('[profile] select 실패', selectError);
    return null;
  }

  if (existing) {
    // 2026-05-05 self-heal — 기존 row partner_user_id NULL 이면 매핑 lookup 후 update.
    // 0011 migration 적용 안 된 환경 (또는 신규 가입 시 race) 안전망.
    const mappedPartner = getPartnerUserIdForEmail(user.email);
    if (!existing.partner_user_id && mappedPartner) {
      const { data: healed, error: healError } = await supabase
        .from('today_profiles')
        .update({ partner_user_id: mappedPartner })
        .eq('user_id', user.id)
        .select('user_id, display_name, partner_user_id, tabs, avatar_url')
        .single();
      if (healError) {
        console.warn('[profile] partner_user_id self-heal 실패', healError?.message || healError);
        return existing;
      }
      return healed;
    }
    return existing;
  }

  // 신규 row insert — 매핑된 email 이면 partner_user_id + display_name 자동 채움.
  const displayName = getDisplayNameForEmail(user.email) || deriveDisplayName(user);
  const partnerUserId = getPartnerUserIdForEmail(user.email);
  const insertPayload = {
    user_id: user.id,
    display_name: displayName,
  };
  if (partnerUserId) insertPayload.partner_user_id = partnerUserId;
  const { data: inserted, error: insertError } = await supabase
    .from('today_profiles')
    .insert(insertPayload)
    .select('user_id, display_name, partner_user_id, tabs, avatar_url')
    .single();

  if (insertError) {
    console.error('[profile] insert 실패', insertError);
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
    .from('today_profiles')
    .select('user_id, display_name, partner_user_id, tabs, avatar_url')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) {
    console.error('[profile] getMyProfile 실패', error);
    return null;
  }
  return data;
}

/**
 * Wave 11.5.9 — 본인 profile update (display_name 허용).
 * Wave 11.10 — avatar_url 도 허용 (uploadAvatar 가 호출).
 *
 * RLS: own row 만 update 허용. supabase 미설정 / 인증 없음 → null.
 *
 * @param {{display_name?: string, avatar_url?: string}} patch
 * @returns {Promise<{user_id, display_name, partner_user_id, tabs, avatar_url} | null>}
 */
async function updateProfile(patch) {
  if (!supabase) return null;
  const { data: { user } = {} } = await supabase.auth.getUser();
  if (!user?.id) return null;
  const allowed = {};
  if (typeof patch?.display_name === 'string') {
    const trimmed = patch.display_name.trim();
    if (trimmed) allowed.display_name = trimmed;
  }
  if (typeof patch?.avatar_url === 'string') {
    const trimmed = patch.avatar_url.trim();
    if (trimmed) allowed.avatar_url = trimmed;
  }
  if (Object.keys(allowed).length === 0) return null;
  const { data, error } = await supabase
    .from('today_profiles')
    .update(allowed)
    .eq('user_id', user.id)
    .select('user_id, display_name, partner_user_id, tabs, avatar_url')
    .single();
  if (error) {
    console.error('[profile] updateProfile 실패', error);
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
    .from('today_profiles')
    .select('user_id, display_name, avatar_url')
    .eq('user_id', me.partner_user_id)
    .maybeSingle();
  if (error) {
    console.error('[profile] getPartnerProfile 실패', error);
    return null;
  }
  return data;
}

/**
 * Wave 11.10 — 프로필 사진 업로드.
 *
 * 입력: dataUrl (compressImage 출력 — 정사각 256px JPEG/PNG/WebP).
 * 흐름:
 *   1) dataUrl → Blob (fetch)
 *   2) supabase.storage.from('today-avatars').upload({user_id}/avatar.{ext}, blob, {upsert:true})
 *   3) getPublicUrl + cache-bust query (?t=Date.now()) — CDN 캐시 우회
 *   4) updateProfile({ avatar_url })
 *
 * 실패 시 caller 가 분기 가능하게 reason 동반:
 *   invalid_dataurl / no_user / no_supabase / blob_failed / upload_failed /
 *   upload_exception / no_public_url / profile_update_failed
 *
 * opts.user_id — 사전 주입 (테스트 / pre-auth 흐름). 없으면 supabase.auth.getUser().
 * opts.bucket — default 'today-avatars'.
 * opts.supabase — 명시 주입 (테스트 정합. 'supabase' in opts 분기로 null 의도 보존).
 * opts.updateProfile — 명시 주입 (테스트 정합. 기본값 module updateProfile).
 */
async function uploadAvatar(dataUrl, opts = {}) {
  const bucket = opts.bucket || 'today-avatars';
  const client = 'supabase' in opts ? opts.supabase : supabase;
  if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
    return { ok: false, reason: 'invalid_dataurl' };
  }
  if (!client || !client.storage) {
    return { ok: false, reason: 'no_supabase' };
  }
  let userId = opts.user_id;
  if (!userId) {
    try {
      const { data: { user } = {} } = await client.auth.getUser();
      userId = user?.id;
    } catch {
      // getUser 실패 → no_user
    }
  }
  if (!userId) return { ok: false, reason: 'no_user' };
  let blob;
  try {
    blob = await fetch(dataUrl).then((r) => r.blob());
  } catch (err) {
    return { ok: false, reason: 'blob_failed', error: err };
  }
  const mime = blob?.type || 'image/jpeg';
  const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpeg';
  const path = `${userId}/avatar.${ext}`;
  try {
    const { error: upErr } = await client.storage
      .from(bucket)
      .upload(path, blob, { upsert: true, contentType: mime });
    if (upErr) return { ok: false, reason: 'upload_failed', error: upErr };
  } catch (err) {
    return { ok: false, reason: 'upload_exception', error: err };
  }
  const { data: urlData } = client.storage.from(bucket).getPublicUrl(path);
  let publicUrl = urlData?.publicUrl;
  if (!publicUrl) return { ok: false, reason: 'no_public_url' };
  // cache-bust: 동일 path upsert 후 브라우저/CDN 캐시 우회
  publicUrl = `${publicUrl}${publicUrl.includes('?') ? '&' : '?'}t=${Date.now()}`;
  const updateFn = typeof opts.updateProfile === 'function' ? opts.updateProfile : updateProfile;
  const updated = await updateFn({ avatar_url: publicUrl });
  if (!updated) return { ok: false, reason: 'profile_update_failed', avatar_url: publicUrl };
  return { ok: true, avatar_url: publicUrl, profile: updated };
}

export const Profile = {
  ensureProfile,
  getMyProfile,
  getPartnerProfile,
  updateProfile,
  uploadAvatar,
  deriveDisplayName,
  getPartnerUserIdForEmail,
  getDisplayNameForEmail,
  EMAIL_TO_PARTNER_USER_ID,
  EMAIL_TO_DISPLAY_NAME,
};

if (typeof window !== 'undefined') {
  window.todayProfile = Profile;
}

export default Profile;
