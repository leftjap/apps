/**
 * activeSession.js — 진행 중 세션 스냅샷 영속화 (spec §8-6).
 *
 * Wave A.9.1 — save / load / clear. UI restore (A.9.2) 별 wave.
 *
 * Dexie meta key: 'activeSession'
 * value 구조: { mode, lang, todayISO, startTime, step, tried, passed, lastScore,
 *              pronScores, weakInSession, judged, cardIds, savedAt }
 *
 * 만료: savedAt 후 1시간 초과 시 load 가 null + 자동 clear.
 */

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
    await clearActiveSession(db);
    return null;
  }
  return row.value;
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
    judged: (snapshot.judged && typeof snapshot.judged === 'object')
      ? { got: Number(snapshot.judged.got) || 0, hmm: Number(snapshot.judged.hmm) || 0, no: Number(snapshot.judged.no) || 0 }
      : { got: 0, hmm: 0, no: 0 },
    startTime: Number(snapshot.startTime) || Date.now(),
  };
}
