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

/* 응용 드릴 발화 이력 (2026-08-29 사용자 요구) — 복습에서 "이 응용 문장을 몇 번 말했고 보통 몇 점인지"를
 * 보여주려면 원천이 필요하다. 종전에 드릴 점수는 세션 스냅샷(exLog.drills)에만 살아 세션이 끝나면 사라졌다.
 * 새 테이블을 만들지 않고 같은 pronunciationLog 에 `<카드id>#drill<행번호>` 로 구분해 적재한다 —
 * 기존 집계는 전부 **카드 id 로 조회**하므로(session-review loadSentenceLog · stats latestPronScoreByCard ·
 * sentences buildSentenceRows) 이 행들을 그냥 지나친다. 스키마·마이그레이션 변화 0.
 * 행 번호 기준이므로 시드의 drills 순서가 바뀌면 이력이 어긋난다 — 학습 시작 후 재INSERT 금지
 * 규약(lesson-explanation-guide-en §6.3)이 그 경우를 이미 막는다. */
export function drillLogId(cardId, index) {
  return `${cardId}#drill${index}`;
}

/** pronunciationLog 행들 → { 카드id: { 행번호: { count, avg } } }. beforeISO 이후(당일 포함) 기록은 뺀다. */
export function summarizeDrillLog(rows, cardIds, beforeISO) {
  const want = new Set(cardIds ?? []);
  const acc = {};
  for (const r of rows ?? []) {
    const sid = r?.sentenceId;
    const cut = typeof sid === 'string' ? sid.lastIndexOf('#drill') : -1;
    if (cut < 0) continue;
    const cardId = sid.slice(0, cut);
    const index = Number(sid.slice(cut + 6));
    if (!want.has(cardId) || !Number.isInteger(index)) continue;
    if (beforeISO && String(r.date ?? '') >= beforeISO) continue;
    ((acc[cardId] ??= {})[index] ??= []).push(Math.round(Number(r.overallScore) || 0));
  }
  const out = {};
  for (const [cardId, byIndex] of Object.entries(acc)) {
    out[cardId] = {};
    for (const [index, scores] of Object.entries(byIndex)) {
      out[cardId][index] = { count: scores.length, avg: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) };
    }
  }
  return out;
}

/** Dexie 읽기 → summarizeDrillLog. 복습 진입 시 state.drillLog 를 채운다. 실패해도 화면을 막지 않는다. */
export async function loadDrillLog(db, lang, cards, todayISO) {
  if (!db?.pronunciationLog || !Array.isArray(cards) || !cards.length) return {};
  try {
    const rows = await db.pronunciationLog.where('lang').equals(lang).toArray();
    return summarizeDrillLog(rows, cards.map((c) => c?.id).filter(Boolean), todayISO);
  } catch (e) {
    console.error('[pronunciationLog] loadDrillLog', e);
    return {};
  }
}
