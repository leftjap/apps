/**
 * cardLoader.js — 세션 페이지 (session-new / session-review) 의 카드 로드 헬퍼.
 *
 * pickCardFields(card)  — Dexie row → UI 가 필요한 필드만 추출 (순수 함수, 테스트 가능)
 * loadNewCards(db, lang, todayISO) — todayLessons 에서 오늘의 미완료 신규 카드 (order_index ASC)
 * loadReviewCards(db, lang, todayISO) — reviewQueue 의 due 카드 (nextReview <= today, 미정 nextReview 도 due)
 */

export function pickCardFields(card) {
  if (!card) return null;
  return {
    id: card.id,
    sentence: card.sentence ?? '',
    pron: card.phonetic_kr ?? '',
    ko: card.meaning ?? '',
    reading: card.reading ?? null,
    lang: card.lang ?? null,
    explanation: card.explanation ?? null,
  };
}

export async function loadNewCards(db, lang, todayISO) {
  // todayISO 인자는 호환성 유지 (호출자 시그니처 변경 회피). 날짜 필터링은 안 함.
  // carry-forward 정책: 미완료 신규는 추가된 날짜와 무관하게 다음 세션에 계속 노출.
  if (!db || !lang) return [];
  const rows = await db.todayLessons.where('lang').equals(lang).toArray();
  const filtered = rows.filter((r) => r.completed !== true);
  filtered.sort((a, b) => {
    const da = a.date || '';
    const db_ = b.date || '';
    if (da !== db_) return da < db_ ? -1 : 1; // 오래된 date 먼저 (FIFO)
    return (a.order_index ?? 0) - (b.order_index ?? 0);
  });
  return filtered;
}

/**
 * advanceCard — 현재 step (1-based) 에서 다음 카드로 전환.
 * 반환: { done: true } 마지막이면 / 아니면 { done: false, step, sentence }
 * cards 빈 배열 또는 step 이 이미 끝/넘침이면 done.
 */
export function advanceCard(cards, currentStep) {
  if (!Array.isArray(cards) || cards.length === 0) return { done: true };
  const nextIdx = currentStep; // step 은 1-based, 다음 카드 0-based 인덱스 = step
  if (nextIdx >= cards.length) return { done: true };
  return {
    done: false,
    step: currentStep + 1,
    sentence: pickCardFields(cards[nextIdx]),
  };
}

export async function loadReviewCards(db, lang, todayISO) {
  if (!db || !lang || !todayISO) return [];
  const rows = await db.reviewQueue.where('lang').equals(lang).toArray();
  const due = rows.filter((r) => !r.nextReview || r.nextReview <= todayISO);
  // 기한 초과 우선 (nextReview ASC, 미정은 가장 오래된 것으로 취급)
  due.sort((a, b) => {
    const av = a.nextReview ?? '';
    const bv = b.nextReview ?? '';
    return av < bv ? -1 : av > bv ? 1 : 0;
  });
  return due;
}

/**
 * loadFreeReviewCards — 자유 복습 (spec §8-4).
 * reviewQueue 전체 (due 무관) → 기한 초과 우선 → 상위 limit (default 20).
 */
export async function loadFreeReviewCards(db, lang, limit = 20) {
  if (!db || !lang) return [];
  const rows = await db.reviewQueue.where('lang').equals(lang).toArray();
  rows.sort((a, b) => {
    const av = a.nextReview ?? '';
    const bv = b.nextReview ?? '';
    return av < bv ? -1 : av > bv ? 1 : 0;
  });
  return rows.slice(0, Math.max(0, Number(limit) || 0));
}
