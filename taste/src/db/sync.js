import { supabase } from '../services/supabase.js';
import { listPendingRatings, setPendingSync } from './queries.js';

export const TABLE_MAP = Object.freeze([
  { dexie: 'ratings', supabase: 'taste_ratings', filterColumn: 'owner_id' },
  // recommendations 는 루틴이 owner별 전량 교체하는 스냅샷(로컬 편집 없음) → pull 시 owner 행 clear 후 재적재(stale 제거).
  { dexie: 'recommendations', supabase: 'taste_recommendations', filterColumn: 'owner_id', replace: true },
]);
const PAGE = 1000;
const isUuid = (id) => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id);
const stripMeta = (row) => { const o = { ...row }; delete o.pending_sync; return o; };

async function pullTable(m, db, userId) {
  if (!supabase || !db || !userId) return;
  let from = 0, all = [];
  for (;;) {
    const { data, error } = await supabase.from(m.supabase).select('*').eq(m.filterColumn, userId).range(from, from + PAGE - 1);
    if (error) return; all = all.concat(data || []);
    if (!data || data.length < PAGE) break; from += PAGE;
  }
  if (m.replace) { try { await db[m.dexie].where(m.filterColumn).equals(userId).delete(); } catch (e) { /* noop */ } }
  await db[m.dexie].bulkPut(all.map((r) => ({ ...r, pending_sync: 0 })));
}
export async function pullAll(db, userId) { await Promise.all(TABLE_MAP.map((m) => pullTable(m, db, userId))); }

let _timers = {};
export function queueUpload(store, id) { clearTimeout(_timers[id]); _timers[id] = setTimeout(() => pushRating(id), 800); }
async function pushRating(id) {
  if (!supabase) return;
  const db = globalThis.tasteDB; const row = await db.ratings.get(id); if (!row) return;
  if (!isUuid(id)) { await setPendingSync(id, 0); return; }
  const { error } = await supabase.from('taste_ratings').upsert(stripMeta(row), { onConflict: 'id' });
  await setPendingSync(id, error ? 1 : 0);
}
export async function flushPending() { const p = await listPendingRatings(); for (const r of p) await pushRating(r.id); }

export async function startSync(user) { const db = globalThis.tasteDB; if (!db || !user) return; await pullAll(db, user.id); await flushPending(); }
export const Sync = { TABLE_MAP, pullAll, queueUpload, flushPending, startSync };
if (typeof window !== 'undefined') window.tasteSync = Sync;
