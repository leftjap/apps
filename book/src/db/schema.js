/**
 * book IndexedDB 스키마 (spec §3.3 — today/gym 팩토리 패턴 답습).
 *
 * 스토어:
 *  - quotes   : 어구록 (책에서 옮긴 문장).
 *  - comments : 어구록 스레드 댓글.
 *
 * 인덱스:
 *  - [book_ref+updated_at] : 책상세에서 한 책의 어구록 최신순
 *  - updated_at            : 피드 시간순 정렬
 *  - pinned                : 핀 필터
 *  - [quote_id+created_at] : 스레드 댓글 시간순 (today comments [entry_id+created_at] 미러)
 *  - pending_sync          : 오프라인 큐 (sync.js reconcile)
 *
 * 사용자별 DB 이름 격리 (auth.js ensureUserDB 가 book_<hash> 로 호출).
 */
import Dexie from 'dexie';

export function createBookDB(name = 'book') {
  const db = new Dexie(name);
  db.version(1).stores({
    quotes:
      '&id, owner_id, book_ref, updated_at, deleted_at, pinned, [book_ref+updated_at], pending_sync',
    comments:
      '&id, quote_id, author_id, created_at, deleted_at, [quote_id+created_at], pending_sync',
  });
  // v2: 등록 책(알라딘) 저장소 — id=ISBN, 책 메타(앱 형태). quotes/comments 보존.
  db.version(2).stores({
    quotes:
      '&id, owner_id, book_ref, updated_at, deleted_at, pinned, [book_ref+updated_at], pending_sync',
    comments:
      '&id, quote_id, author_id, created_at, deleted_at, [quote_id+created_at], pending_sync',
    books: '&id, created_at, pending_sync',
  });
  // v3: 드래그 형광펜 — quote_highlights(로컬 전용, sync 없음). 행 { quote_id, marks:[{s,e,c}], updated_at }.
  db.version(3).stores({
    quotes:
      '&id, owner_id, book_ref, updated_at, deleted_at, pinned, [book_ref+updated_at], pending_sync',
    comments:
      '&id, quote_id, author_id, created_at, deleted_at, [quote_id+created_at], pending_sync',
    books: '&id, created_at, pending_sync',
    quote_highlights: '&quote_id',
  });
  // v4: 형광펜 서버 동기화(book_quote_highlights, 본인 행만) — pending_sync 인덱스 추가.
  // 기존 v3 행은 pending 1 로 마킹 → 마이그 적용 후 첫 flush 에서 일괄 업로드.
  db.version(4).stores({
    quotes:
      '&id, owner_id, book_ref, updated_at, deleted_at, pinned, [book_ref+updated_at], pending_sync',
    comments:
      '&id, quote_id, author_id, created_at, deleted_at, [quote_id+created_at], pending_sync',
    books: '&id, created_at, pending_sync',
    quote_highlights: '&quote_id, pending_sync',
  }).upgrade((tx) => tx.table('quote_highlights').toCollection().modify((r) => {
    if (r.pending_sync === undefined) r.pending_sync = 1;
  }));
  return db;
}

export default createBookDB;
