// pick 추천 엔진 — 순수 판정/형성 로직.
// Deno edge fn(index.ts)과 Node vitest(logic.test.js) 공용. 런타임 전역 의존 없음
// (TextEncoder 는 Deno·Node 양쪽 글로벌). 부수효과·DB 접근 없음 → 단위 테스트 용이.
// Today ai-comment/logic.js 미러.

/** 상수시간 문자열 비교 (토큰 타이밍 누출 방지). 비문자열·길이 불일치 → false. */
export function constantTimeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i];
  return diff === 0;
}

/** 평가 중복 제외용 정규화 키: media_type|title(소문자·trim)|year. */
export function ratedKey(media_type, title, year) {
  return `${media_type}|${String(title || '').trim().toLowerCase()}|${year ?? ''}`;
}

/**
 * 추천 재생성이 필요한 owner 목록.
 *   조건: 평가 有 + (추천 없음[콜드스타트] 또는 최신평가 > 최신추천) + settle 경과(now - 최신평가 >= settleMs).
 * settle = 벌크 import 등 연속 변경이 멎은 뒤에만 재생성(Today decide 의 settle 미러).
 * @param {{owner_id:string, updated_at:string, deleted_at?:string|null}[]} ratings
 * @param {{owner_id:string, generated_at:string}[]} recos
 * @param {number} settleMs
 * @param {number} now epoch ms
 * @returns {string[]} owner_ids
 */
export function pendingOwners(ratings, recos, settleMs, now) {
  const maxRated = new Map(); // owner -> max(updated_at) ms
  for (const r of ratings) {
    if (r.deleted_at) continue;
    const t = new Date(r.updated_at).getTime();
    if (!maxRated.has(r.owner_id) || t > maxRated.get(r.owner_id)) maxRated.set(r.owner_id, t);
  }
  const maxReco = new Map(); // owner -> max(generated_at) ms
  for (const r of recos) {
    const t = new Date(r.generated_at).getTime();
    if (!maxReco.has(r.owner_id) || t > maxReco.get(r.owner_id)) maxReco.set(r.owner_id, t);
  }
  const out = [];
  for (const [owner, rated] of maxRated) {
    const reco = maxReco.has(owner) ? maxReco.get(owner) : null;
    const changed = reco === null || rated > reco;
    const settled = now - rated >= settleMs;
    if (changed && settled) out.push(owner);
  }
  return out;
}

/**
 * 루틴(에이전트)에게 넘길 owner별 추천 생성 컨텍스트.
 * 취향 분석(긍/부정 패턴 추출)은 에이전트가 수행 — 여기선 compact 평가 + 제외키만 형성.
 * @param {string} owner_id
 * @param {{media_type,title,year,rating,meta?,deleted_at?}[]} ownerRatings
 */
export function toOwnerContext(owner_id, ownerRatings) {
  const live = ownerRatings.filter((r) => !r.deleted_at);
  return {
    owner_id,
    count: live.length,
    ratings: live.map((r) => ({
      media_type: r.media_type,
      title: r.title,
      year: r.year ?? null,
      rating: r.rating,
      subtype: r.meta?.subtype ?? null,
    })),
    rated_keys: live.map((r) => ratedKey(r.media_type, r.title, r.year)),
  };
}
