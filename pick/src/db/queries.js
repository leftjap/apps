const db = () => { const d = globalThis.tasteDB; if (!d) throw new Error('[tasteQueries] tasteDB 미초기화'); return d; };
const newId = () => (globalThis.crypto?.randomUUID?.() || 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2));
const nowIso = () => new Date().toISOString();
const enqueue = (id) => { try { globalThis.tasteSync?.queueUpload?.('ratings', id); } catch (e) {} };

export async function createRating(input) {
  if (!input?.owner_id) throw new Error('[tasteQueries] owner_id 누락');
  const row = {
    id: newId(), owner_id: input.owner_id, media_type: input.media_type,
    title: input.title, year: input.year ?? null, external_id: input.external_id ?? null,
    rating: input.rating, source: input.source, rated_at: input.rated_at ?? null,
    meta: input.meta ?? {}, created_at: nowIso(), updated_at: nowIso(), deleted_at: null,
    pending_sync: 1,
  };
  await db().ratings.add(row); enqueue(row.id); return row;
}
export async function updateRating(id, patch) {
  const cur = await db().ratings.get(id); if (!cur) return null;
  const next = { ...cur, ...patch, updated_at: nowIso(), pending_sync: 1 };
  await db().ratings.put(next); enqueue(id); return next;
}
export async function softDeleteRating(id) { return updateRating(id, { deleted_at: nowIso() }); }
export async function getRating(owner_id, media_type, title, year) {
  const rows = await db().ratings.where('[owner_id+media_type]').equals([owner_id, media_type]).toArray();
  return rows.find((r) => !r.deleted_at && r.title === title && (r.year ?? null) === (year ?? null)) || null;
}
// soft-deleted 포함 매칭 (alive 우선) — 재평가 시 신규 create 대신 기존 행 부활 재사용용.
// 서버 unique(owner,media,title,year) 를 soft-deleted 행이 점유해 신규 행 upsert 가 23505 로 영구 충돌하므로.
export async function getRatingAny(owner_id, media_type, title, year) {
  const rows = await db().ratings.where('[owner_id+media_type]').equals([owner_id, media_type]).toArray();
  const matches = rows.filter((r) => r.title === title && (r.year ?? null) === (year ?? null));
  return matches.find((r) => !r.deleted_at) || matches[0] || null;
}
export async function listRatings(owner_id, mediaType) {
  const rows = await db().ratings.where('owner_id').equals(owner_id).toArray();
  // rated_at(등록) 기준 — updated_at 은 메타 백필·동기화 reconcile 로도 바뀌어 '최근 평가' 순서가 흔들림.
  return rows.filter((r) => !r.deleted_at && (!mediaType || r.media_type === mediaType))
    .sort((a, b) => String(b.rated_at || b.created_at || '').localeCompare(String(a.rated_at || a.created_at || '')));
}
export async function listPendingRatings() { return db().ratings.where('pending_sync').equals(1).toArray(); }
export async function setPendingSync(id, v) { const c = await db().ratings.get(id); if (c) await db().ratings.put({ ...c, pending_sync: v }); }

export const Queries = { createRating, updateRating, softDeleteRating, getRating, getRatingAny, listRatings, listPendingRatings, setPendingSync };
if (typeof window !== 'undefined') window.tasteQueries = Queries;
