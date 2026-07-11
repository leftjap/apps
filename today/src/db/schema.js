/**
 * Today IndexedDB 스키마 (Wave 11.5.1).
 *
 * 스토어 (Wave 11.5.1 — entries 만, 다른 스토어는 후행 sub-wave):
 *  - entries : 글/메모 (kind 별 navi/fiction/blog/memo)
 *
 * Wave 11.5.x 추가 예정:
 *  - expenses : 가계부 (Wave 11.6)
 *  - comments / notifications : 피드 (Wave 11.7)
 *  - settings : 사용자 설정 (필요 시)
 *
 * 인덱스:
 *  - kind+updated_at : 카테고리별 최신순 정렬
 *  - is_shared : 공유 글 필터
 *  - deleted_at : 휴지통 필터
 *
 * Gym Wave 11.7 패턴 답습 — 팩토리 함수 + 사용자별 DB 이름 격리.
 */
import Dexie from 'dexie';

export function createTodayDB(name = 'today') {
  const db = new Dexie(name);
  // v1 (Wave 11.5.1) — entries 기본 스키마
  db.version(1).stores({
    entries: '&id, owner_id, kind, updated_at, deleted_at, is_shared, pinned, [kind+updated_at]',
  });
  // v2 (Wave 11.5.5) — pending_sync 인덱스 추가 (오프라인 큐)
  db.version(2)
    .stores({
      entries:
        '&id, owner_id, kind, updated_at, deleted_at, is_shared, pinned, [kind+updated_at], pending_sync',
    })
    .upgrade((tx) =>
      tx.table('entries').toCollection().modify((e) => {
        if (e.pending_sync === undefined) e.pending_sync = 0;
      }),
    );
  // v3 (Wave 11.6.1) — expenses 스토어 추가
  // spec §6 line 196-219 — owner_id / spent_at / amount_krw / merchant / category / source 등
  db.version(3).stores({
    entries:
      '&id, owner_id, kind, updated_at, deleted_at, is_shared, pinned, [kind+updated_at], pending_sync',
    expenses:
      '&id, owner_id, spent_at, category, brand, merchant, source, deleted_at, updated_at, pending_sync',
  });
  // v4 (Wave 11.6.4a) — merchant_rules 스토어 추가
  // spec §6 line 221-232 / §13 — global + user scope 매칭 룰 (auto category 매핑)
  db.version(4).stores({
    entries:
      '&id, owner_id, kind, updated_at, deleted_at, is_shared, pinned, [kind+updated_at], pending_sync',
    expenses:
      '&id, owner_id, spent_at, category, brand, merchant, source, deleted_at, updated_at, pending_sync',
    merchant_rules: '&id, scope, user_id, priority, [scope+priority], pending_sync',
  });
  // v5 (Wave 11.7.1) — comments + notifications
  // spec §6 line 234-259 / §11 / §12 — 피드 댓글 + 알림 인박스
  db.version(5).stores({
    entries:
      '&id, owner_id, kind, updated_at, deleted_at, is_shared, pinned, [kind+updated_at], pending_sync',
    expenses:
      '&id, owner_id, spent_at, category, brand, merchant, source, deleted_at, updated_at, pending_sync',
    merchant_rules: '&id, scope, user_id, priority, [scope+priority], pending_sync',
    comments:
      '&id, entry_id, author_id, created_at, deleted_at, [entry_id+created_at], pending_sync',
    notifications:
      '&id, recipient_id, kind, entry_id, comment_id, read_at, created_at',
  });
  // v6 (Wave 11.8) — 사용자별 카테고리 / 브랜드 매핑 / 매장 alias
  // 0019 마이그레이션의 (user_id, id) / (user_id, brand) / (user_id, merchant_pattern)
  // 복합 PK 그대로 Dexie 복합 키로 보존. admin UI 가 CRUD 수행.
  db.version(6).stores({
    entries:
      '&id, owner_id, kind, updated_at, deleted_at, is_shared, pinned, [kind+updated_at], pending_sync',
    expenses:
      '&id, owner_id, spent_at, category, brand, merchant, source, deleted_at, updated_at, pending_sync',
    merchant_rules: '&id, scope, user_id, priority, [scope+priority], pending_sync',
    comments:
      '&id, entry_id, author_id, created_at, deleted_at, [entry_id+created_at], pending_sync',
    notifications:
      '&id, recipient_id, kind, entry_id, comment_id, read_at, created_at',
    user_categories: '&[user_id+id], user_id, display_order',
    user_brand_categories: '&[user_id+brand], user_id',
    user_merchant_aliases: '&[user_id+merchant_pattern], user_id',
  });
  // v7 — entries.kind_number 영구 일련번호 (deep link `#/navi/79`).
  // 0023 마이그: owner_id + kind 별 created_at asc 순서로 1..N 부여. 삭제 시 보존.
  db.version(7).stores({
    entries:
      '&id, owner_id, kind, updated_at, deleted_at, is_shared, pinned, [kind+updated_at], pending_sync, [owner_id+kind+kind_number]',
  });
  // v8 — reactions (이모지 리액션). 0027 마이그: entry/comment 이중타겟, 토글.
  //   조회: comment_id / entry_id 별. 토글: 내 반응(author+emoji) 탐색.
  db.version(8).stores({
    reactions:
      '&id, entry_id, comment_id, author_id, emoji, [entry_id+author_id], [comment_id+author_id], pending_sync',
  });
  return db;
}

export default createTodayDB;
