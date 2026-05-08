/**
 * weakPhonemes.js — 약점 음소 누적 (spec §9-5).
 *
 * Dexie meta key:  'weakPhonemes_en' / 'weakPhonemes_ja' (sync.js USER_META_KEY_MAP 정합)
 * value 구조: { [phonemeSymbol: string]: count: number }
 *  예: { 'θ': 3, 'ɹ': 1 } — Azure 분석에서 점수 <70 으로 marked 된 phoneme 누적 카운트.
 *
 * Wave A.7.3 — Azure 결과의 weakPhonemes 배열을 카운터에 누적.
 *  - 빈 배열 / mockFallback / non-array → noop (DB 변동 없음)
 *  - sync.js 가 백그라운드에서 Supabase study_user_meta.weak_phonemes_en/ja 로 push
 */

export function accumulateWeakPhonemes(prev, weakPhonemes) {
  const counter = (prev && typeof prev === 'object' && !Array.isArray(prev)) ? { ...prev } : {};
  if (!Array.isArray(weakPhonemes)) return counter;
  for (const ph of weakPhonemes) {
    if (typeof ph !== 'string' || ph === '') continue;
    counter[ph] = (Number(counter[ph]) || 0) + 1;
  }
  return counter;
}

export async function applyWeakPhonemesUpdate(db, lang, weakPhonemes) {
  if (!db?.meta || !lang) return null;
  if (!Array.isArray(weakPhonemes) || weakPhonemes.length === 0) return null;
  const key = `weakPhonemes_${lang}`;
  const existing = await db.meta.get(key);
  const prev = existing?.value && typeof existing.value === 'object' ? existing.value : {};
  const next = accumulateWeakPhonemes(prev, weakPhonemes);
  await db.meta.put({ key, value: next, at: Date.now() });
  return next;
}
