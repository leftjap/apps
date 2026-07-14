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
import { flushPendingUploads } from '../db/sync.js';

function newId(prefix = 's') {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 세션 시간 보정 — startTime 이 비정상적으로 오래된(>12h) 세션(방치 후 재개)은 벽시계 시간이
 * 무의미(예: 44h). 그 경우 완료 카드 기반 추정(카드당 90초)으로 대체. 정상(<12h)은 그대로 둬
 * legit 장시간 세션을 보존한다.
 */
export function clampSessionDuration(rawSec, completed = 0) {
  const raw = Math.max(0, Number(rawSec) || 0);
  if (raw > 12 * 3600) return Math.max(60, (Number(completed) || 0) * 90);
  return raw;
}

export function buildSessionLog({ mode, lang, date, durationSec, tried, passed, newSentenceIds = [], reviewedIds = [] }) {
  const newIds = Array.isArray(newSentenceIds) ? newSentenceIds : [];
  const reviewIds = Array.isArray(reviewedIds) ? reviewedIds : [];
  return {
    id: newId(),
    lang,
    date,
    sessionType: mode === 'free' ? 'free_review' : 'normal',
    mode, // 'new' | 'review' | 'free' (Wave A.14)
    utteranceCount: Number(tried) || 0,
    passCount: Number(passed) || 0,
    durationSec: Number(durationSec) || 0,
    newSentenceIds: newIds,
    // sentenceIds = 이 세션에서 다룬 모든 문장 id. stats 의 fetchSentencesWithLastLearned 가 사용.
    sentenceIds: [...new Set([...newIds, ...reviewIds])],
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
  const allCompleted = Array.isArray(params.completedNewCards) ? params.completedNewCards : [];
  const isSceneCard = (c) => c && c.explanation && Array.isArray(c.explanation.dialogue);
  // scene 카드(전체 다이얼로그)는 외울 문장이 아니라 복습 이관·newSentenceIds 제외 (완료 표시는 함)
  const completedNew = allCompleted.filter((c) => !isSceneCard(c));
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

  // baseToday(세션 시작 시 캡처한 그날 dailyStats) 가 있으면 base+최종 으로 reconcile —
  // 진행 중 flushLiveStats 가 쓴 라이브 값을 덮어써 이중집계 방지. 없으면 기존 누적(하위호환).
  const base = params.baseToday !== undefined ? params.baseToday : await db.dailyStats.get(log.date);
  await db.dailyStats.put(mergeDailyStats(base, log));

  // Wave A.11 — lang_${lang} meta 의 totalDays/totalTime/streak 누적.
  await applyLangMeta(db, params.lang, log);

  if (params.mode === 'new' && allCompleted.length > 0) {
    const tomorrow = todayPlusDays(log.date, 1);
    for (const card of allCompleted) {
      await db.todayLessons.update(card.id, { completed: true });
      if (isSceneCard(card)) continue; // scene 은 복습 이관 X (완료 표시만)
      await db.reviewQueue.put({
        id: card.id,
        lang: card.lang,
        sentence: card.sentence,
        meaning: card.meaning,
        phonetic_kr: card.phonetic_kr,
        reading: card.reading ?? null,
        explanation: card.explanation ?? null,
        speaker: card.speaker ?? null,
        interval: 1,
        nextReview: tomorrow,
        promotedFrom: 'new',
        promotedAt: log.createdAt,
        // stats.html fetchSentencesWithLastLearned 의 createdAt fallback 정합 (sessionLog 누락 시 reviewQueue 의 createdAt 사용).
        createdAt: log.createdAt,
      });
    }
  }

  // spec §4 (line 223) "세션 완료 시 즉시 동기화" — 3초 debounce 를 기다리지 않는다.
  // 세션의 산출물(sessionLog + dailyStats + 카드 이관)이 가장 크고, 완료 직후 앱을 닫는 게 정상 흐름이라
  // 이 시점이 유실 노출의 정점이었다. 실패해도 로컬(Dexie)이 정본이고 아웃박스가 재시도 → await 안 함.
  flushPendingUploads().catch((e) => console.warn('[sessionFinish] 즉시 flush 실패', e?.message || e));

  return log;
}

/**
 * flushLiveStats — 진행 중(미종료) 세션의 현재 진척을 오늘 dailyStats 에 멱등 기록.
 * cue 가 study_daily_stats 를 읽으므로, 세션을 끝내기 전에도 '오늘 학습'이 대시보드에 반영된다.
 *  - snapshot.base = 세션 시작 시 캡처한 그날 dailyStats(없으면 null). 항상 base+현재세션 으로 써서
 *    여러 번 호출해도 누적되지 않음(멱등). finishSession 이 같은 base 로 최종값을 덮어쓴다.
 *  - dailyStats 만 건드림(sessionLogs/langMeta/reviewQueue 는 finishSession 에서 1회) → 이중집계 0.
 *  - demo 모드 차단·db 가드는 호출부(세션 페이지)에서. 여기선 db/snapshot 만 방어.
 */
export async function flushLiveStats(db, snapshot) {
  if (!db?.dailyStats || !snapshot) return null;
  const { mode, lang, todayISO: date, startTime } = snapshot;
  if (!lang || !date) return null;
  // 드리프트 가드: startTime 이 12h 넘게 지난(여러 날 열어둔/오래된) 세션은 활동일이 불확실해
  // 라이브 반영 시 엉뚱한 날에 기록될 수 있다(예: 6/20 학습이 6/21 로). 정상 당일 세션만 반영하고,
  // 오래된 세션은 종료/자동마감(finalizeStaleSnapshot) 경로가 처리하도록 둔다.
  if (startTime && (Date.now() - Number(startTime)) > 12 * 3600 * 1000) return null;
  const completed = Math.max(0, (Number(snapshot.step) || 0) - 1);
  // activeSec(가시+비유휴 활성 시간, activeTimer) 우선 — 벽시계는 탭 방치 시 폭주
  // (발화 0회 study_time_sec 7h, 2026-07-04 진단). 없는 legacy 스냅샷만 벽시계 폴백.
  const activeSec = Math.floor(Number(snapshot.activeSec));
  const rawSec = Number.isFinite(activeSec) && activeSec >= 0
    ? activeSec
    : (startTime ? Math.floor((Date.now() - Number(startTime)) / 1000) : 0);
  const durationSec = clampSessionDuration(rawSec, completed);
  let newSentenceIds = [];
  let completedReviewCount = 0;
  if (mode === 'new') {
    const ids = Array.isArray(snapshot.cardIds) ? snapshot.cardIds.slice(0, completed) : [];
    if (ids.length && db.todayLessons?.bulkGet) {
      const cards = (await db.todayLessons.bulkGet(ids)).filter(Boolean);
      const isSceneCard = (c) => c && c.explanation && Array.isArray(c.explanation.dialogue);
      newSentenceIds = cards.filter((c) => !isSceneCard(c)).map((c) => c.id);
    }
  } else {
    completedReviewCount = completed;
  }
  const log = buildSessionLog({ mode, lang, date, durationSec, tried: snapshot.tried, passed: snapshot.passed, newSentenceIds });
  log.completedReviewCount = completedReviewCount;
  await db.dailyStats.put(mergeDailyStats(snapshot.base ?? null, log));
  return log;
}
