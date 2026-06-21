/**
 * activeSession.js — 진행 중 세션 스냅샷 영속화 (spec §8-6).
 *
 * Dexie meta key: 'activeSession'
 * value 구조: { mode, lang, todayISO, startTime, step, tried, passed, lastScore,
 *              pronScores, weakInSession, judged, cardIds, savedAt }
 *
 * 만료 1시간 초과 시 자동 finalize (= finishSession 호출) 후 clear.
 * 종료 버튼 미누름 + 1시간 이탈 시에도 학습 기록 (sessionLog + reviewQueue) 보존.
 */

import { finishSession, clampSessionDuration } from './sessionFinish.js';

const KEY = 'activeSession';
const TTL_MS = 60 * 60 * 1000; // 1시간

export async function saveActiveSession(db, snapshot) {
  if (!db?.meta || !snapshot || typeof snapshot !== 'object') return null;
  const value = { ...snapshot, savedAt: Date.now() };
  await db.meta.put({ key: KEY, value, at: Date.now() });
  return value;
}

export async function loadActiveSession(db) {
  if (!db?.meta) return null;
  const row = await db.meta.get(KEY);
  if (!row?.value || typeof row.value !== 'object') return null;
  const savedAt = Number(row.value.savedAt) || 0;
  if (Date.now() - savedAt > TTL_MS) {
    // expire — 부분 학습 finalize 후 clear (학습 기록 보존)
    try { await finalizeStaleSnapshot(db, row.value); }
    catch (e) { console.error('[activeSession] finalize 실패', e); }
    await clearActiveSession(db);
    return null;
  }
  return row.value;
}

/**
 * 만료된 스냅샷을 finishSession 으로 정식 영속화.
 *  - new 모드: cardIds[0..step-2] 의 todayLessons 카드를 completedNewCards 로 finalize
 *    → sessionLog 생성 + dailyStats merge + 완료 카드 reviewQueue promote
 *  - review 모드: completedReviewCount = step-1 로 finalize
 *    → sessionLog 생성 + dailyStats merge (SRS 판정은 미적용 — snapshot 에 카드별 매핑 없음)
 *
 * step=1 (첫 카드 진행 중, 완료 0) 시 영속화 의미 없음 → skip.
 */
export async function finalizeStaleSnapshot(db, snapshot) {
  if (!db || !snapshot || typeof snapshot !== 'object') return null;
  const step = Number(snapshot.step) || 0;
  const completed = Math.max(0, step - 1);
  if (completed === 0) return null; // 학습한 카드 없음

  const lang = snapshot.lang;
  const date = snapshot.todayISO;
  if (!lang || !date) return null;

  const startTime = Number(snapshot.startTime) || 0;
  const savedAt = Number(snapshot.savedAt) || 0;
  // 여러 날 열어둔 스냅샷은 (savedAt-startTime) 이 비정상적으로 큼(예: 45h) → clamp 로 보정.
  const durationSec = clampSessionDuration(
    startTime > 0 && savedAt > startTime ? Math.floor((savedAt - startTime) / 1000) : 0,
    completed,
  );

  if (snapshot.mode === 'new') {
    const cardIds = Array.isArray(snapshot.cardIds) ? snapshot.cardIds.slice(0, completed) : [];
    if (cardIds.length === 0) return null;
    const cards = await db.todayLessons.bulkGet(cardIds);
    const completedNewCards = cards.filter(Boolean);
    return finishSession(db, {
      mode: 'new', lang, date, durationSec,
      tried: Number(snapshot.tried) || 0,
      passed: Number(snapshot.passed) || 0,
      completedNewCards,
      baseToday: snapshot.base, // 진행 중 flushLiveStats 가 쓴 라이브 값 reconcile (이중집계 방지)
    });
  }
  if (snapshot.mode === 'review' || snapshot.mode === 'free') {
    return finishSession(db, {
      mode: snapshot.mode === 'free' ? 'free' : 'review',
      lang, date, durationSec,
      tried: Number(snapshot.tried) || 0,
      passed: Number(snapshot.passed) || 0,
      completedReviewCount: completed,
      baseToday: snapshot.base,
    });
  }
  return null;
}

export async function clearActiveSession(db) {
  if (!db?.meta?.delete) return;
  try { await db.meta.delete(KEY); } catch { /* noop */ }
}

export function isExpired(savedAt, now = Date.now()) {
  return (Number(now) - (Number(savedAt) || 0)) > TTL_MS;
}

/**
 * snapshot + 현재 cards + mode 검증 → 복원 patch (또는 null).
 * 검증: mode 일치, cardIds 길이 + 순서 일치.
 * 복원 patch: step / tried / passed / lastScore / pronScores / weakInSession / judged / startTime.
 */
export function restoreFromSnapshot(snapshot, cards, mode) {
  if (!snapshot || snapshot.mode !== mode) return null;
  if (!Array.isArray(snapshot.cardIds) || !Array.isArray(cards)) return null;
  if (snapshot.cardIds.length !== cards.length) return null;
  for (let i = 0; i < cards.length; i += 1) {
    if (cards[i]?.id !== snapshot.cardIds[i]) return null;
  }
  return {
    step: Number(snapshot.step) || 1,
    tried: Number(snapshot.tried) || 0,
    passed: Number(snapshot.passed) || 0,
    lastScore: snapshot.lastScore ?? null,
    pronScores: Array.isArray(snapshot.pronScores) ? [...snapshot.pronScores] : [],
    weakInSession: (snapshot.weakInSession && typeof snapshot.weakInSession === 'object') ? { ...snapshot.weakInSession } : {},
    // 카드별 녹음 진행 (count/best) — 버튼 상태·점수 안착 복원 (2026-06-10)
    recLog: (snapshot.recLog && typeof snapshot.recLog === 'object') ? { ...snapshot.recLog } : {},
    judged: (snapshot.judged && typeof snapshot.judged === 'object')
      ? { got: Number(snapshot.judged.got) || 0, hmm: Number(snapshot.judged.hmm) || 0, no: Number(snapshot.judged.no) || 0 }
      : { got: 0, hmm: 0, no: 0 },
    startTime: Number(snapshot.startTime) || Date.now(),
    base: snapshot.base ?? null, // 세션 시작 시 캡처한 그날 dailyStats (라이브 반영 base)
  };
}
