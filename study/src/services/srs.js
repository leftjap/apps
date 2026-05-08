/**
 * srs.js — 간격 반복 복습 시스템 (spec §6).
 *
 * 간격: [1, 3, 7, 21, 60]일.
 * 판정 (kind):
 *   - 'no'  → interval=1 (내일 복습)
 *   - 'hmm' → 현재와 다음 간격의 중간값 (올림). 마지막 60 단계면 60 유지.
 *   - 'got' → 다음 간격으로 진행. 마지막 60 단계 통과 시 졸업 (큐에서 제거).
 */

export const SRS_INTERVALS = [1, 3, 7, 21, 60];

export function todayPlusDays(todayISO, days) {
  const d = new Date(`${todayISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function nextSrsState(currentInterval, kind, todayISO) {
  const cur = SRS_INTERVALS.includes(currentInterval) ? currentInterval : 1;

  if (kind === 'no') {
    return { interval: 1, nextReview: todayPlusDays(todayISO, 1), graduate: false };
  }

  const idx = SRS_INTERVALS.indexOf(cur);
  const isLast = idx === SRS_INTERVALS.length - 1;

  if (kind === 'got') {
    if (isLast) return { graduate: true };
    const next = SRS_INTERVALS[idx + 1];
    return { interval: next, nextReview: todayPlusDays(todayISO, next), graduate: false };
  }

  if (kind === 'hmm') {
    if (isLast) {
      return { interval: cur, nextReview: todayPlusDays(todayISO, cur), graduate: false };
    }
    const next = SRS_INTERVALS[idx + 1];
    const mid = Math.ceil((cur + next) / 2);
    return { interval: mid, nextReview: todayPlusDays(todayISO, mid), graduate: false };
  }

  // unknown kind — 보수적으로 현 간격 유지
  return { interval: cur, nextReview: todayPlusDays(todayISO, cur), graduate: false };
}

/**
 * applySrsUpdate — 카드 1장에 판정 적용 → reviewQueue 갱신 (또는 졸업 시 삭제).
 * 반환: nextSrsState() 결과. db/card 누락 시 null.
 */
export async function applySrsUpdate(db, card, kind, todayISO) {
  if (!db || !card || !card.id) return null;
  const next = nextSrsState(card.interval, kind, todayISO);
  if (next.graduate) {
    await db.reviewQueue.delete(card.id);
  } else {
    await db.reviewQueue.update(card.id, {
      interval: next.interval,
      nextReview: next.nextReview,
    });
  }
  return next;
}
