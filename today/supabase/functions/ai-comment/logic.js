// 오늘의 네비 자동 댓글 — 순수 판정 로직.
// Deno edge fn(index.ts)과 Node vitest(logic.test.js) 공용. 런타임 전역 의존 없음
// (TextEncoder 는 Deno·Node 양쪽 글로벌). 부수효과·DB 접근 없음 → 단위 테스트 용이.

const HUMAN_NAME_BY_ID = {
  '7bae5645-61c6-4476-9ff2-4c30a72812ff': '지오',
  '9f0408c0-008b-440c-a938-2effd9cb3bfd': '지오',
  'aeafd9a7-4094-4e7c-a621-188d6b2e336d': '소연',
};

/** author_id → 표시 이름. claudeId 면 '클로드'. */
export function nameFor(id, claudeId) {
  if (id === claudeId) return '클로드';
  return HUMAN_NAME_BY_ID[id] || '알수없음';
}

/** 사람(=클로드 아님) author_id 목록. */
export function humanIds(claudeId) {
  return Object.keys(HUMAN_NAME_BY_ID).filter((id) => id !== claudeId);
}

/** HTML 본문 → 평문(에이전트 컨텍스트용). */
export function htmlToText(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

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

/**
 * 댓글 대상 판정. mode: 'initial' | 'reply' | null.
 *   - 클로드 댓글 없음 + 본문 有 + (settle 경과 또는 ignoreSettle) → 'initial'
 *   - 클로드 댓글 有 + 마지막 댓글이 사람 → 'reply'
 *   - 그 외 → null
 * @param {{updated_at:string, content?:string|null}} entry
 * @param {{author_id:string}[]} comments  시간순(asc)
 * @param {{claudeId:string, settleMs:number, ignoreSettle?:boolean}} opts
 */
export function decide(entry, comments, { claudeId, settleMs, ignoreSettle = false }) {
  const hasClaude = comments.some((c) => c.author_id === claudeId);
  const last = comments[comments.length - 1] || null;
  const settled = Date.now() - new Date(entry.updated_at).getTime() >= settleMs;
  if (!hasClaude) {
    if (!(entry.content && htmlToText(entry.content))) return null;
    return ignoreSettle || settled ? 'initial' : null;
  }
  if (last && last.author_id !== claudeId) return 'reply';
  return null;
}

/** 에이전트에게 넘길 컨텍스트 객체. */
export function toContext(entry, comments, mode, claudeId) {
  return {
    entry_id: entry.id,
    kind: entry.kind,
    mode,
    author: nameFor(entry.owner_id, claudeId),
    title: entry.title || '(제목 없음)',
    content: htmlToText(entry.content || ''),
    comments: comments.map((c) => ({ author: nameFor(c.author_id, claudeId), body: c.body, created_at: c.created_at })),
  };
}
