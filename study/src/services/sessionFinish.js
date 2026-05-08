/**
 * sessionFinish.js — 세션 종료 시 영속화 (spec §8-7).
 *
 * 본 wave (A.5) 범위:
 *   1. sessionLogs put
 *   2. dailyStats upsert (date PK 기준 누적)
 *   3. 신규 세션 — 완료한 카드 todayLessons.completed=true + reviewQueue 이관 (interval=1)
 *
 * 별 wave: pronunciationLog · weak phoneme · meta streak · 명시 supabase sync · 종료 모달.
 */

import { todayPlusDays } from './srs.js';
import { applyLangMeta } from './langMeta.js';

function newId(prefix = 's') {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function buildSessionLog({ mode, lang, date, durationSec, tried, passed, newSentenceIds = [] }) {
  return {
    id: newId(),
    lang,
    date,
    sessionType: mode === 'free' ? 'free_review' : 'normal',
    mode, // 'new' | 'review' | 'free' (Wave A.14)
    utteranceCount: Number(tried) || 0,
    passCount: Number(passed) || 0,
    durationSec: Number(durationSec) || 0,
    newSentenceIds: Array.isArray(newSentenceIds) ? newSentenceIds : [],
    createdAt: new Date().toISOString(),
  };
}

export function mergeDailyStats(prev, log) {
  const base = prev || {
    date: log.date, lang: log.lang,
    utteranceCount: 0, studyTimeSec: 0, newSentences: 0, reviewCount: 0,
  };
  const newAdd = log.mode === 'new' ? log.newSentenceIds.length : 0;
  const reviewAdd = (log.mode === 'review' || log.mode === 'free') ? (log.completedReviewCount || 0) : 0;
  return {
    date: base.date,
    lang: base.lang,
    utteranceCount: (base.utteranceCount || 0) + log.utteranceCount,
    studyTimeSec: (base.studyTimeSec || 0) + log.durationSec,
    newSentences: (base.newSentences || 0) + newAdd,
    reviewCount: (base.reviewCount || 0) + reviewAdd,
  };
}

/**
 * finishSession — DB orchestration.
 * params: { mode, lang, date, durationSec, tried, passed, completedNewCards?, completedReviewCount? }
 *   completedNewCards: mode='new' 시 사용자가 완료한 todayLessons 카드 배열 (DB row)
 *   completedReviewCount: mode='review' 시 사용자가 판정 완료한 카드 수
 */
export async function finishSession(db, params) {
  if (!db) return null;
  const completedNew = Array.isArray(params.completedNewCards) ? params.completedNewCards : [];
  const log = buildSessionLog({
    mode: params.mode,
    lang: params.lang,
    date: params.date,
    durationSec: params.durationSec,
    tried: params.tried,
    passed: params.passed,
    newSentenceIds: completedNew.map((c) => c.id),
  });
  log.completedReviewCount = Number(params.completedReviewCount) || 0;

  await db.sessionLogs.put(log);

  const prev = await db.dailyStats.get(log.date);
  await db.dailyStats.put(mergeDailyStats(prev, log));

  // Wave A.11 — lang_${lang} meta 의 totalDays/totalTime/streak 누적.
  await applyLangMeta(db, params.lang, log);

  if (params.mode === 'new' && completedNew.length > 0) {
    const tomorrow = todayPlusDays(log.date, 1);
    for (const card of completedNew) {
      await db.todayLessons.update(card.id, { completed: true });
      await db.reviewQueue.put({
        id: card.id,
        lang: card.lang,
        sentence: card.sentence,
        meaning: card.meaning,
        phonetic_kr: card.phonetic_kr,
        reading: card.reading ?? null,
        explanation: card.explanation ?? null,
        interval: 1,
        nextReview: tomorrow,
        promotedFrom: 'new',
        promotedAt: log.createdAt,
      });
    }
  }

  return log;
}
