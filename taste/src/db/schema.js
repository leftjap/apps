import Dexie from 'dexie';

export function createTasteDB(name = 'taste') {
  const db = new Dexie(name);
  db.version(1).stores({
    ratings: '&id, owner_id, media_type, updated_at, deleted_at, [owner_id+media_type], pending_sync',
    recommendations: '&id, owner_id, media_type, batch_id, generated_at, pending_sync',
  });
  // v2 (마이그 0002): 추천 갈래 차원 — kind(home|branch)·source_work 인덱스로 상세 갈래 조회.
  db.version(2).stores({
    ratings: '&id, owner_id, media_type, updated_at, deleted_at, [owner_id+media_type], pending_sync',
    recommendations: '&id, owner_id, media_type, kind, batch_id, generated_at, source_work, [owner_id+kind], pending_sync',
  });
  return db;
}
export default createTasteDB;
