import { supabase } from '../services/supabase.js';
import { listPendingRatings, setPendingSync } from './queries.js';

export const TABLE_MAP = Object.freeze([
  { dexie: 'ratings', supabase: 'pick_ratings', filterColumn: 'owner_id' },
  // recommendations 는 루틴이 owner별 전량 교체하는 스냅샷(로컬 편집 없음) → pull 시 owner 행 clear 후 재적재(stale 제거).
  { dexie: 'recommendations', supabase: 'pick_recommendations', filterColumn: 'owner_id', replace: true },
]);
const PAGE = 1000;
const isUuid = (id) => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
const stripMeta = (row) => { const o = { ...row }; delete o.pending_sync; return o; };

async function pullTable(m, db, userId) {
  if (!supabase || !db || !userId) return;
  let from = 0, all = [];
  for (;;) {
    const { data, error } = await supabase.from(m.supabase).select('*').eq(m.filterColumn, userId).range(from, from + PAGE - 1);
    if (error) return; all = all.concat(data || []);
    if (!data || data.length < PAGE) break; from += PAGE;
  }
  // replace 의 delete+bulkPut 을 한 트랜잭션으로 — bulkPut 실패 시 롤백 (빈 추천 화면 방지).
  await db.transaction('rw', db[m.dexie], async () => {
    if (m.replace) await db[m.dexie].where(m.filterColumn).equals(userId).delete();
    await db[m.dexie].bulkPut(all.map((r) => ({ ...r, pending_sync: 0 })));
  });
}
export async function pullAll(db, userId) { await Promise.all(TABLE_MAP.map((m) => pullTable(m, db, userId))); }

// 홈 첫 렌더가 로그인 startSync 보다 빠르면 추천이 비어 보임 → 홈이 추천만 즉시 당기도록(replace).
export async function pullRecommendations(userId) {
  const db = globalThis.pickDB; if (!db || !userId) return;
  const m = TABLE_MAP.find((x) => x.dexie === 'recommendations');
  if (m) await pullTable(m, db, userId);
}

let _timers = {};
export function queueUpload(store, id) { clearTimeout(_timers[id]); _timers[id] = setTimeout(() => pushRating(id), 800); }
async function pushRating(id) {
  if (!supabase) return;
  const db = globalThis.pickDB; const row = await db.ratings.get(id); if (!row) return;
  if (!isUuid(id)) { await setPendingSync(id, 0); return; }
  const { error } = await supabase.from('pick_ratings').upsert(stripMeta(row), { onConflict: 'id' });
  if (error && error.code === '23505') { await reconcileDup(db, row); return; }
  await setPendingSync(id, error ? 1 : 0);
}

// 23505: 서버 unique(owner,media,title,year) 를 같은 키의 다른 행(주로 soft-deleted)이 점유 → upsert 영구 재시도 루프.
// 해소: 서버 행 채택(LWW) — 로컬이 최신이면 서버 행을 로컬 값으로 갱신(부활 포함), 로컬 dup 행은 서버 행으로 교체.
async function reconcileDup(db, row) {
  let q = supabase.from('pick_ratings').select('*')
    .eq('owner_id', row.owner_id).eq('media_type', row.media_type).eq('title', row.title);
  q = (row.year ?? null) === null ? q.is('year', null) : q.eq('year', row.year);
  const { data, error } = await q;
  if (error) { await setPendingSync(row.id, 1); return; }
  const srv = (data || []).find((s) => s.id !== row.id);
  if (!srv) { await setPendingSync(row.id, 1); return; }  // 23505 인데 서버 행 미발견 — 다음 flush 재시도
  const localNewer = new Date(row.updated_at) > new Date(srv.updated_at);
  if (localNewer) {
    const patch = { rating: row.rating, rated_at: row.rated_at, source: row.source, meta: row.meta, updated_at: row.updated_at, deleted_at: row.deleted_at ?? null };
    const { error: upErr } = await supabase.from('pick_ratings').update(patch).eq('id', srv.id);
    if (upErr) { await setPendingSync(row.id, 1); return; }
  }
  const adopted = localNewer
    ? { ...srv, rating: row.rating, rated_at: row.rated_at, source: row.source, meta: row.meta, updated_at: row.updated_at, deleted_at: row.deleted_at ?? null }
    : srv;
  await db.ratings.delete(row.id);
  await db.ratings.put({ ...adopted, pending_sync: 0 });
}
export async function flushPending() { const p = await listPendingRatings(); for (const r of p) await pushRating(r.id); }

export async function startSync(user) { const db = globalThis.pickDB; if (!db || !user) return; await pullAll(db, user.id); await flushPending(); }
export const Sync = { TABLE_MAP, pullAll, pullRecommendations, queueUpload, flushPending, startSync };
if (typeof window !== 'undefined') window.pickSync = Sync;
