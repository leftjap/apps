/**
 * cleanupDummy.js — 더미 데이터 영구 제거 + 시드 비활성화 후속.
 *
 * 책임:
 *  - 첫 호출 시 Supabase 4 테이블 (현재 user_id 한정) + Dexie 5 store 비우기.
 *  - meta.dummyCleanup === CLEANUP_VERSION 마커로 두 번째 호출 skip (멱등).
 *  - meta.seeded 동시 삭제 (잔존 v11 마커 정리).
 *
 * 순서:
 *  1) Supabase 직렬 delete. 실패 시 즉시 abort + Dexie 미수정 + 마커 미기록.
 *     → 다음 로그인에 재시도 (Dexie 가 그대로면 sync 다시 pull 가능, 마커 없으면 cleanup 재진입).
 *  2) Dexie 트랜잭션: 5 store clear + meta.seeded 삭제 + dummyCleanup 마커 기록.
 *
 * 참고:
 *  - sync.js attachHooks (L921) 는 deleting hook 을 등록하지 않음.
 *    → Dexie clear 가 Supabase 자동 push 트리거 안 함 → 명시적 Supabase delete 필요.
 *  - supabase / userId 가 falsy 면 Supabase 단계 skip 후 Dexie 만 정리 (테스트 격리 + 미인증 시나리오).
 */
import { supabase } from '../services/supabase.js';

export const CLEANUP_VERSION = 'v1';

export const SUPABASE_TABLES = Object.freeze([
  'study_review_queue',
  'study_today_lessons',
  'study_session_logs',
  'study_pronunciation_log',
]);

export async function cleanupDummyDataIfNeeded(db, userId, supabaseClient = supabase) {
  if (!db) return { skipped: true, reason: 'no-db' };

  const marker = await db.meta.get('dummyCleanup');
  if (marker?.value === CLEANUP_VERSION) return { skipped: true, reason: 'done' };

  if (supabaseClient && userId) {
    for (const table of SUPABASE_TABLES) {
      const { error } = await supabaseClient.from(table).delete().eq('user_id', userId);
      if (error) {
        console.error(`[cleanupDummy] ${table} delete 실패`, error);
        return { skipped: false, ok: false, failedTable: table, error: error.message };
      }
    }
  }

  await db.transaction(
    'rw',
    db.reviewQueue,
    db.todayLessons,
    db.sessionLogs,
    db.dailyStats,
    db.pronunciationLog,
    db.meta,
    async () => {
      await db.reviewQueue.clear();
      await db.todayLessons.clear();
      await db.sessionLogs.clear();
      await db.dailyStats.clear();
      await db.pronunciationLog.clear();
      await db.meta.delete('seeded');
      await db.meta.put({ key: 'dummyCleanup', value: CLEANUP_VERSION, at: new Date().toISOString() });
    },
  );

  return { skipped: false, ok: true, version: CLEANUP_VERSION };
}

export default cleanupDummyDataIfNeeded;
