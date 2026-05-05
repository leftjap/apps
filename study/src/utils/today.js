/**
 * 앱의 "오늘 날짜" 단일 소스 (Wave 11.6A · Wave 11.20+ 동적화).
 *
 * Wave 11.6A: 고정 '2026-04-15' (seed fixture 와 일치 — 데모용).
 * Wave 11.20+: 사용자 default Chrome 실 검증에서 발견 — TODAY_ISO 고정 시
 *   사용자가 학습 후 nextReview 미래로 갱신된 카드들이 dueToday 계산에서 제외됨 (4-15 ≤ nextReview 항상 false).
 *   → 동적 `new Date().toISOString().slice(0,10)` 로 교체. seed fixture 의 nextReview='2026-04-15' 는 항상 dueToday 통과 (오늘 ≥ 4-15).
 *   한 곳만 바꾸면 home/stats/session/seed 전부 전파되도록 단일화 유지.
 */
export const TODAY_ISO = new Date().toISOString().slice(0, 10);

export function todayISO() {
  return TODAY_ISO;
}

/** 'YYYY-MM-DD' → 날짜(숫자). UI 의 주간 캘린더 TODAY 숫자 필드용. */
export function todayDayNumber() {
  return parseInt(TODAY_ISO.slice(-2), 10);
}
