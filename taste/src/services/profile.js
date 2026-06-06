// taste profiles: 개인 격리. partner_user_id 없음. display_name만.
import { supabase } from './supabase.js';

export async function ensureProfile(user) {
  if (!supabase || !user) return null;
  const { data } = await supabase.from('taste_profiles')
    .select('user_id, display_name').eq('user_id', user.id).maybeSingle();
  if (data) return data;
  const display_name = user.user_metadata?.name || user.email || 'me';
  const { data: created } = await supabase.from('taste_profiles')
    .upsert({ user_id: user.id, display_name }, { onConflict: 'user_id' })
    .select('user_id, display_name').maybeSingle();
  return created || null;
}

export const Profile = { ensureProfile };
if (typeof window !== 'undefined') window.tasteProfile = Profile;
