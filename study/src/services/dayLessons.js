/**
 * dayLessons.js — 캘린더 바텀시트 "그날 신규 학습한 문장" 조회 헬퍼.
 *
 * 사용처: mocks/home.html (주간 캘린더) · mocks/stats.html (월간 캘린더) 의 openBS.
 *
 * 정책: **신규 학습 카드만** 노출 (사용자 요구). review 혼재 금지.
 *
 * 데이터 흐름:
 *  1) sessionLogs.where({lang, date}) 로 그날 세션 row 들 조회
 *  2) 각 row 의 newSentenceIds 만 사용. 빈 배열 / undefined 모두 "신규 0건" 으로 취급.
 *  3) todayLessons + reviewQueue 양쪽에서 카드 정보 조회 (신규 → 자동 이관 후 reviewQueue 잔존).
 *
 * 주의:
 *  - newSentenceIds 는 finish() 가 state.newCompleted 기반으로 저장하는 신규 카드 ID.
 *  - 구 row (newSentenceIds 필드 없음) → 빈 목록 = "신규 학습 없음" 노출. sentenceIds 폴백 폐기 — 폴백은
 *    review 혼재 위험 + JS `??` 가 빈 배열을 truthy 로 처리해 의도와 다른 분기로 빠지는 결함 동반.
 */

export async function fetchDayLessonsForDay(db, lang, dateISO) {
  if (!db || !lang || !dateISO) return [];
  const logs = await db.sessionLogs.where({ lang, date: dateISO }).toArray();
  const ids = [...new Set(logs.flatMap((l) => l.newSentenceIds ?? []))];
  if (ids.length === 0) return [];
  const [todayCards, reviewCards] = await Promise.all([
    db.todayLessons.bulkGet(ids),
    db.reviewQueue.bulkGet(ids),
  ]);
  return ids
    .map((id, i) => todayCards[i] || reviewCards[i] || null)
    .filter(Boolean);
}

export default fetchDayLessonsForDay;
