/**
 * book 쿼리 레이어 (Dexie — today queries.js 패턴 답습, quotes+comments).
 *
 * 책임:
 *  - quotes CRUD (listFeed / listByBook / get / create / update / softDelete / restore / togglePin)
 *  - comments CRUD (create / list / count / update / softDelete)
 *  - 사용자별 DB 인스턴스 동적 조회 (globalThis.bookDB)
 *  - sync.js 업로드 큐 등록 (순환 참조 회피 — globalThis.bookSync 동적 lookup)
 *  - `window.bookQueries` 노출
 *
 * 부부 공유 모델: 어구록은 owner_id 로만 구분. is_shared 없음.
 * 피드/리스트는 (본인 + 파트너) owner 집합으로 필터.
 */

function db() {
  // globalThis 우선 — vitest(node) 와 브라우저(window) 모두 호환.
  const inst = globalThis.bookDB || null;
  if (!inst) {
    throw new Error('[bookQueries] globalThis.bookDB 미초기화 — 인증 후 ensureUserDB 호출 필요.');
  }
  return inst;
}

function nowIso() {
  return new Date().toISOString();
}

function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function ownerSet(ownerIds) {
  if (Array.isArray(ownerIds)) return ownerIds.filter(Boolean);
  return ownerIds ? [ownerIds] : [];
}

function enqueueQuoteSync(id) {
  const sync = globalThis.bookSync;
  if (sync && typeof sync.queueUploadQuote === 'function') sync.queueUploadQuote(id);
}

function enqueueCommentSync(id) {
  const sync = globalThis.bookSync;
  if (sync && typeof sync.queueUploadComment === 'function') sync.queueUploadComment(id);
}

// ═══════════════════════════════════════════════════════════════════════════
// quotes — read
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 부부 피드 — (본인 + 파트너) owner 의 어구록, deleted 제외, updated_at desc.
 * @param {string|string[]} ownerIds 본인 id 또는 [본인, 파트너] 배열
 */
export async function listFeed(ownerIds) {
  const owners = ownerSet(ownerIds);
  if (owners.length === 0) return [];
  const rows = await db().quotes.where('owner_id').anyOf(owners).toArray();
  return rows
    .filter((r) => !r.deleted_at)
    .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
}

/** 한 책의 어구록 (book_ref), deleted 제외, updated_at desc. owner 필터(옵션). */
export async function listByBook(bookRef, ownerIds) {
  if (bookRef == null) return [];
  const ref = String(bookRef);
  const owners = ownerSet(ownerIds);
  const rows = await db().quotes
    .where('[book_ref+updated_at]')
    .between([ref, ''], [ref, '￿'], true, true)
    .reverse()
    .toArray();
  return rows.filter((r) => {
    if (r.deleted_at) return false;
    if (owners.length && !owners.includes(r.owner_id)) return false;
    return true;
  });
}

/** id 로 단일 어구록. */
export async function getQuote(id) {
  return await db().quotes.get(id);
}

/** 핀 어구록 ((본인+파트너) owner), updated_at desc. */
export async function listPinned(ownerIds) {
  const owners = ownerSet(ownerIds);
  const rows = await db().quotes.where('pinned').equals(1).toArray();
  return rows
    .filter((r) => !r.deleted_at && (!owners.length || owners.includes(r.owner_id)))
    .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
}

/** 전체 어구록 ((본인+파트너) owner, deleted 제외) — 통계/모두보기. updated_at desc. */
export async function listAllQuotes(ownerIds) {
  const owners = ownerSet(ownerIds);
  let rows = owners.length
    ? await db().quotes.where('owner_id').anyOf(owners).toArray()
    : await db().quotes.toArray();
  return rows
    .filter((r) => !r.deleted_at)
    .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
}

/** 어구록 본문 부분 일치 검색 ((본인+파트너) owner). updated_at desc. */
export async function searchQuotes(q, ownerIds) {
  const all = await listAllQuotes(ownerIds);
  const needle = (q == null ? '' : String(q)).trim().toLowerCase();
  if (!needle) return all;
  return all.filter((r) => (r.text || '').toLowerCase().includes(needle));
}

// ═══════════════════════════════════════════════════════════════════════════
// quotes — write
// ═══════════════════════════════════════════════════════════════════════════

/** 신규 어구록. owner_id / book_ref / text 필수. */
export async function createQuote(input) {
  if (!input?.owner_id) throw new Error('[bookQueries] quote owner_id 누락');
  if (input.book_ref == null || input.book_ref === '') throw new Error('[bookQueries] quote book_ref 누락');
  if (!input?.text) throw new Error('[bookQueries] quote text 누락');
  const ts = nowIso();
  const row = {
    id: input.id || newId(),
    owner_id: input.owner_id,
    book_ref: String(input.book_ref),
    text: input.text,
    pinned: input.pinned ? 1 : 0,
    created_at: input.created_at || ts,
    updated_at: input.updated_at || ts,
    deleted_at: input.deleted_at || null,
    pending_sync: 0,
  };
  await db().quotes.add(row);
  enqueueQuoteSync(row.id);
  return row;
}

/** 부분 업데이트. updated_at 자동 갱신. */
export async function updateQuote(id, patch) {
  const existing = await db().quotes.get(id);
  if (!existing) throw new Error(`[bookQueries] quote not found: ${id}`);
  const next = { ...existing, ...patch, updated_at: patch?.updated_at || nowIso() };
  if (patch && 'pinned' in patch) next.pinned = patch.pinned ? 1 : 0;
  if (patch && 'book_ref' in patch) next.book_ref = String(patch.book_ref);
  await db().quotes.put(next);
  enqueueQuoteSync(id);
  return next;
}

export async function softDeleteQuote(id) {
  return await updateQuote(id, { deleted_at: nowIso() });
}

export async function restoreQuote(id) {
  return await updateQuote(id, { deleted_at: null });
}

/** pinned 토글. */
export async function togglePinQuote(id) {
  const existing = await db().quotes.get(id);
  if (!existing) throw new Error(`[bookQueries] quote not found: ${id}`);
  return await updateQuote(id, { pinned: existing.pinned ? 0 : 1 });
}

/** pending_sync=1 어구록 (오프라인 → online flush 대상). */
export async function listPendingQuotes() {
  return await db().quotes.where('pending_sync').equals(1).toArray();
}

/** pending_sync 플래그 설정 (sync.js 호출). updated_at 갱신 안 함. */
export async function setQuotePendingSync(id, value) {
  const flag = value ? 1 : 0;
  const existing = await db().quotes.get(id);
  if (!existing) return null;
  await db().quotes.put({ ...existing, pending_sync: flag });
  return flag;
}

// ═══════════════════════════════════════════════════════════════════════════
// comments
// ═══════════════════════════════════════════════════════════════════════════

/** 신규 댓글. quote_id / author_id / body 필수. */
export async function createComment(input) {
  if (!input?.quote_id) throw new Error('[bookQueries] comment quote_id 누락');
  if (!input?.author_id) throw new Error('[bookQueries] comment author_id 누락');
  if (!input?.body) throw new Error('[bookQueries] comment body 누락');
  const ts = nowIso();
  const row = {
    id: input.id || newId(),
    quote_id: input.quote_id,
    author_id: input.author_id,
    body: input.body,
    created_at: input.created_at || ts,
    updated_at: input.updated_at || ts,
    deleted_at: input.deleted_at || null,
    pending_sync: 0,
  };
  await db().comments.add(row);
  enqueueCommentSync(row.id);
  return row;
}

export async function getComment(id) {
  return await db().comments.get(id);
}

export async function updateComment(id, patch) {
  const existing = await db().comments.get(id);
  if (!existing) throw new Error(`[bookQueries] comment not found: ${id}`);
  const next = { ...existing, ...patch, updated_at: patch?.updated_at || nowIso() };
  await db().comments.put(next);
  enqueueCommentSync(id);
  return next;
}

export async function softDeleteComment(id) {
  return await updateComment(id, { deleted_at: nowIso() });
}

/** quote_id 별 댓글 (deleted 제외, created_at asc). */
export async function listCommentsByQuote(quoteId) {
  if (!quoteId) return [];
  const rows = await db().comments
    .where('[quote_id+created_at]')
    .between([quoteId, ''], [quoteId, '￿'], true, true)
    .toArray();
  return rows.filter((r) => !r.deleted_at);
}

/** quote_id 별 댓글 수 (deleted 제외). */
export async function countCommentsByQuote(quoteId) {
  const rows = await listCommentsByQuote(quoteId);
  return rows.length;
}

/** quote_id 집합 별 댓글 수 맵 (피드 카드 카운트용). */
export async function countCommentsForQuotes(quoteIds) {
  const ids = Array.isArray(quoteIds) ? quoteIds.filter(Boolean) : [];
  const out = {};
  for (const qid of ids) out[qid] = await countCommentsByQuote(qid);
  return out;
}

export async function listPendingComments() {
  return await db().comments.where('pending_sync').equals(1).toArray();
}

export async function setCommentPendingSync(id, value) {
  const flag = value ? 1 : 0;
  const existing = await db().comments.get(id);
  if (!existing) return null;
  await db().comments.put({ ...existing, pending_sync: flag });
  return flag;
}

// ───────────────────────────────────────────────────────────────────────────
// 노출
// ───────────────────────────────────────────────────────────────────────────

export const Queries = {
  // quotes
  listFeed,
  listByBook,
  getQuote,
  listPinned,
  listAllQuotes,
  searchQuotes,
  createQuote,
  updateQuote,
  softDeleteQuote,
  restoreQuote,
  togglePinQuote,
  listPendingQuotes,
  setQuotePendingSync,
  // comments
  createComment,
  getComment,
  updateComment,
  softDeleteComment,
  listCommentsByQuote,
  countCommentsByQuote,
  countCommentsForQuotes,
  listPendingComments,
  setCommentPendingSync,
};

if (typeof window !== 'undefined') {
  window.bookQueries = Queries;
}

export default Queries;
