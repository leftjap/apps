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
 *
 * ⚠ 이 누적값은 지금 형태로 '약점 순위'로 쓸 수 없다 (2026-08-29 실측, 발음로그 411건):
 *  ① **등장 빈도에 지배된다.** 원시 태그 수 상위는 t·s·ih·ax·n 인데, 각 음소의 등장 횟수로
 *     정규화하면(정상 행만·등장 하한 없음) f(57.4%)·z(52.9%)·eh(40.8%)·s(39.0%)·k(38.7%) 로
 *     뒤집힌다. ih·ax·n·r·m 은 흔해서 올라와 있었을 뿐이고, f·z·eh 같은 진짜 약점은 묻혔다.
 *     (2026-08-29 재감사 정정 — 첫 계산이 등장 n≥60 하한을 무언 적용해 1위 f(n=47)를 누락했었다.)
 *  ② **무너진 녹음이 오염시켰다.** 음소평균 50 미만인 행은 전체의 24.6%(101/411)인데
 *     약점 태그의 49%(1,106/2,263)를 만들었다 — 2배 과대 기여.
 * ②는 2026-08-29 의 녹음 품질 게이트(coverageJudge.judgeRecording)가 앞으로를 막지만,
 * ①은 설계 문제라 남아 있고 **기존 누적값은 소급 신뢰할 수 없다**. 순위로 쓰려면 분모(등장 횟수)를
 * 함께 세야 한다 — 그러려면 phonemeScores 전체를 누적해야 하므로 스키마 변경이 필요하다.
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
