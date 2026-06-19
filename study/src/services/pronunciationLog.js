/**
 * pronunciationLog.js — 발음 분석 결과 영속화 (spec §9-5 약점 음소 누적의 데이터 source).
 *
 * Wave A.7.2 범위:
 *  - buildPronunciationLog(params)  : Azure 결과 → Dexie row (순수). mockFallback 결과는 null 반환 (저장 스킵)
 *  - savePronunciationLog(db, params): Dexie put. db/log 누락 또는 mock 결과 시 noop
 *
 * Dexie row schema (sync.js L153-180 정합):
 *   { id, lang, sentenceId, date, overallScore, phonemeScores, weakPhonemes, recognizedText, createdAt }
 */

function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `p_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function buildPronunciationLog({ result, sentenceId, lang, date } = {}) {
  if (!result || result.mockFallback) return null;
  return {
    id: newId(),
    lang,
    date,
    sentenceId: sentenceId ?? null,
    overallScore: Number(result.score) || 0,
    // Wave A.18.1 — 진단용 하위점수 + 캡처 레벨(rms). 저점 원인 추적(정확도 vs 유창성·완성도 vs 약한 캡처).
    pronScore: result.pronScore ?? null,
    fluencyScore: result.fluencyScore ?? null,
    completenessScore: result.completenessScore ?? null,
    prosodyScore: result.prosodyScore ?? null,
    captureRms: result.captureRms ?? null,
    phonemeScores: Array.isArray(result.phonemeScores) ? result.phonemeScores : [],
    weakPhonemes: Array.isArray(result.weakPhonemes) ? result.weakPhonemes : [],
    recognizedText: result.recognizedText ?? null,
    createdAt: new Date().toISOString(),
  };
}

export async function savePronunciationLog(db, params) {
  if (!db?.pronunciationLog) return null;
  const log = buildPronunciationLog(params);
  if (!log) return null;
  await db.pronunciationLog.put(log);
  return log;
}
