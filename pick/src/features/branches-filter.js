// 갈래 추천에서 이미 평가한 작품 제외.
// engine(pick-reco/logic.js ratedKey)과 동일 정규화 — 엔진은 LLM 에 rated_keys 를 "제외하라"고 넘기지만
// 소프트 지시라 누락 가능 + 평가가 갈래 생성 이후일 수도 있음 → 표시 단계의 결정적 안전망.
export function ratedKey(media_type, title, year) {
  return `${media_type}|${String(title || '').trim().toLowerCase()}|${year ?? ''}`;
}

/** branches 중 ratings(soft-delete 제외)와 ratedKey 일치하는 것을 제거. */
export function excludeRated(branches, ratings) {
  const rated = new Set(
    (ratings || []).filter((r) => !r.deleted_at).map((r) => ratedKey(r.media_type, r.title, r.year)),
  );
  return (branches || []).filter((b) => !rated.has(ratedKey(b.media_type, b.title, b.year)));
}
