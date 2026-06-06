import Dexie from 'dexie';

export function createTasteDB(name = 'taste') {
  const db = new Dexie(name);
  db.version(1).stores({
    ratings: '&id, owner_id, media_type, updated_at, deleted_at, [owner_id+media_type], pending_sync',
    recommendations: '&id, owner_id, media_type, batch_id, generated_at, pending_sync',
  });
  return db;
}
export default createTasteDB;
