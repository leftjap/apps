// 오늘의 네비 자동 댓글 — '미답 글' 선별 (navi-realtime-daemon catchUp 용 순수 로직).
// 부수효과·DB 접근 없음 → 단위 테스트 용이.
//
// 회귀 수정(2026-06-22): daemon 의 멱등성을 '시도했나(seen/last_seen)' 가 아니라
// '실제 클로드 댓글 유무' 로 판단해, 첫 시도가 실패한 글이 영구 누락되던 버그를 막는다.
// 일부러 지운 댓글(soft-deleted)은 부활시키지 않도록, 호출측은 commentedIds 에
// '삭제 이력 포함' 클로드 댓글이 있는 entry 를 담아 넘긴다.

/** HTML/텍스트 본문이 실질적으로 비었는지 (태그 제거 후 공백만이면 true). */
export function isBlank(content) {
  return !String(content ?? '').replace(/<[^>]+>/g, '').trim();
}

/**
 * 클로드 초기 댓글이 필요한 글 id 목록 (created_at 오름차순).
 * 조건: 삭제 안 됨 · is_shared=true · 본문 有 · 최근(windowMs) · 클로드 댓글 전혀 없음(삭제 이력 포함).
 * settle(정착)은 스케줄러(schedule/runClaude)가 created_at/updated_at 으로 처리하므로 여기선 보지 않는다.
 * @param {{id:string, is_shared?:boolean, content?:string|null, deleted_at?:string|null, created_at:string}[]} entries
 * @param {Set<string>|string[]} commentedIds  클로드 댓글(삭제 포함)이 있는 entry_id
 * @param {{windowMs:number, nowMs:number}} opts
 * @returns {string[]}
 */
export function selectPendingInitial(entries, commentedIds, { windowMs, nowMs }) {
  const commented = commentedIds instanceof Set ? commentedIds : new Set(commentedIds || []);
  const since = nowMs - windowMs;
  return (entries || [])
    .filter((e) =>
      e
      && !e.deleted_at
      && e.is_shared === true
      && !isBlank(e.content)
      && new Date(e.created_at).getTime() >= since
      && !commented.has(e.id))
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .map((e) => e.id);
}

/**
 * 클로드 대댓글(reply)이 필요한 글 id 목록 (마지막 사람 댓글 시각 오름차순 = 오래 기다린 순).
 * 조건(배포된 today_ai_has_pending() 경로 b · decide() reply 분기와 동일):
 *   삭제 안 됨 · is_shared=true · 클로드 비삭제 댓글 존재 · 마지막(비삭제) 댓글이 사람.
 * settle(정착) gate 없음 — 사람 댓글엔 즉시 응답.
 * @param {{id:string, is_shared?:boolean, deleted_at?:string|null}[]} entries
 * @param {Map<string, {author_id:string, created_at:string}[]>} commentsByEntry  entry_id → 비삭제 댓글
 * @param {{claudeId:string}} opts
 * @returns {string[]}
 */
export function selectPendingReplies(entries, commentsByEntry, { claudeId }) {
  const cmts = commentsByEntry instanceof Map ? commentsByEntry : new Map(Object.entries(commentsByEntry || {}));
  const lastAt = (list) => list.reduce((m, c) => Math.max(m, new Date(c.created_at).getTime()), -Infinity);
  return (entries || [])
    .filter((e) => e && !e.deleted_at && e.is_shared === true)
    .map((e) => ({ e, list: (cmts.get(e.id) || []).slice().sort((a, b) => new Date(a.created_at) - new Date(b.created_at)) }))
    .filter(({ list }) => {
      if (!list.length) return false;
      const hasClaude = list.some((c) => c.author_id === claudeId);
      return hasClaude && list[list.length - 1].author_id !== claudeId;
    })
    .sort((a, b) => lastAt(a.list) - lastAt(b.list))
    .map(({ e }) => e.id);
}
