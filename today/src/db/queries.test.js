/**
 * queries.js 단위 테스트 (Wave 11.5.1).
 * 환경: vitest (node) + fake-indexeddb 폴리필.
 *
 * 범위:
 *   - createEntry / listEntries / getEntry
 *   - updateEntry (updated_at 자동 갱신)
 *   - softDeleteEntry / restoreEntry
 *   - togglePin
 *   - countEntriesByKind
 *   - kind 필터 격리 (다른 kind 안 섞임)
 *
 * 비대상:
 *   - Supabase 동기화 (Wave 11.5.3)
 *   - listSharedEntries (Wave 11.7 본격 사용)
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTodayDB } from './schema.js';
import {
  createEntry,
  listEntries,
  listSharedNaviEntries,
  searchEntries,
  searchExpenses,
  getEntry,
  updateEntry,
  softDeleteEntry,
  restoreEntry,
  togglePin,
  countEntriesByKind,
  listDeletedEntries,
  listPendingEntries,
  setPendingSync,
  // Wave 11.6.1 — expenses
  createExpense,
  getExpense,
  updateExpense,
  softDeleteExpense,
  listExpensesByRange,
  listExpensesByMonth,
  listExpensesByDate,
  sumExpensesByCategoryMonth,
  sumExpensesMonth,
  findExpenseBySmsRaw,
  // Wave 11.6.4a — merchant_rules
  createMerchantRule,
  listMerchantRules,
  autoMatchMerchantRule,
  createExpenseWithAutoMatch,
  // Wave 11.7.1 — comments
  createComment,
  listCommentsByEntry,
  countCommentsByEntry,
  softDeleteComment,
  // Wave 11.7.1 — notifications
  listNotifications,
  countUnreadNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from './queries.js';

const OWNER = '11111111-2222-3333-4444-555555555555';

beforeEach(async () => {
  // 새 in-memory IDB 인스턴스 (테스트별 격리)
  const dbName = 'today_test_' + Math.random().toString(36).slice(2, 10);
  globalThis.todayDB = createTodayDB(dbName);
});

afterEach(async () => {
  if (globalThis.todayDB) {
    await globalThis.todayDB.delete();
    globalThis.todayDB = null;
  }
});

describe('createEntry', () => {
  it('id 자동 생성 + created_at·updated_at 채움 (navi 는 is_shared default=1)', async () => {
    const e = await createEntry({ owner_id: OWNER, kind: 'navi', title: 'T', content: 'C' });
    expect(e.id).toMatch(/[0-9a-f-]{30,}/);
    expect(e.created_at).toMatch(/^\d{4}-/);
    expect(e.updated_at).toBe(e.created_at);
    expect(e.deleted_at).toBeNull();
    expect(e.is_shared).toBe(1);
    expect(e.pinned).toBe(0);
  });

  it('soyoun_navi 도 is_shared default=1 (사용자 결정 2026-05-04)', async () => {
    const e = await createEntry({ owner_id: OWNER, kind: 'soyoun_navi', title: 'T' });
    expect(e.is_shared).toBe(1);
  });

  it('fiction/blog/memo 는 is_shared default=0 (개인)', async () => {
    for (const kind of ['fiction', 'blog', 'memo']) {
      const e = await createEntry({ owner_id: OWNER, kind, title: 'T' });
      expect(e.is_shared, kind).toBe(0);
    }
  });

  it('input.is_shared 명시 시 그 값 우선 (navi 라도 false 가능)', async () => {
    const e = await createEntry({ owner_id: OWNER, kind: 'navi', title: 'T', is_shared: false });
    expect(e.is_shared).toBe(0);
  });

  it('owner_id 누락 시 throw', async () => {
    await expect(createEntry({ kind: 'navi' })).rejects.toThrow(/owner_id/);
  });

  it('unknown kind 시 throw', async () => {
    await expect(createEntry({ owner_id: OWNER, kind: 'invalid' })).rejects.toThrow(/unknown kind/);
  });
});

describe('listEntries (kind 필터)', () => {
  it('kind 별로 격리 — 다른 kind 안 섞임', async () => {
    await createEntry({ owner_id: OWNER, kind: 'navi', title: 'N1' });
    await createEntry({ owner_id: OWNER, kind: 'navi', title: 'N2' });
    await createEntry({ owner_id: OWNER, kind: 'fiction', title: 'F1' });
    await createEntry({ owner_id: OWNER, kind: 'memo', title: 'M1' });

    const naviList = await listEntries('navi');
    const fictionList = await listEntries('fiction');
    const memoList = await listEntries('memo');

    expect(naviList).toHaveLength(2);
    expect(fictionList).toHaveLength(1);
    expect(memoList).toHaveLength(1);
    expect(naviList.every((r) => r.kind === 'navi')).toBe(true);
  });

  it('updated_at desc 정렬 (최신 먼저)', async () => {
    const e1 = await createEntry({ owner_id: OWNER, kind: 'navi', title: 'old' });
    await new Promise((r) => setTimeout(r, 5));
    const e2 = await createEntry({ owner_id: OWNER, kind: 'navi', title: 'new' });
    const list = await listEntries('navi');
    expect(list[0].id).toBe(e2.id);
    expect(list[1].id).toBe(e1.id);
  });

  it('soft-deleted 항목은 기본 제외', async () => {
    const e = await createEntry({ owner_id: OWNER, kind: 'navi' });
    await softDeleteEntry(e.id);
    const list = await listEntries('navi');
    expect(list).toHaveLength(0);
  });

  it('opts.includeDeleted=true 면 휴지통 포함', async () => {
    const e = await createEntry({ owner_id: OWNER, kind: 'navi' });
    await softDeleteEntry(e.id);
    const list = await listEntries('navi', { includeDeleted: true });
    expect(list).toHaveLength(1);
    expect(list[0].deleted_at).not.toBeNull();
  });
});

describe('getEntry', () => {
  it('존재하는 id 조회', async () => {
    const e = await createEntry({ owner_id: OWNER, kind: 'navi', title: 'T' });
    const got = await getEntry(e.id);
    expect(got?.id).toBe(e.id);
    expect(got?.title).toBe('T');
  });

  it('없는 id 는 undefined', async () => {
    const got = await getEntry('nonexistent');
    expect(got).toBeUndefined();
  });
});

describe('updateEntry', () => {
  it('부분 patch 반영 + updated_at 자동 갱신', async () => {
    const e = await createEntry({ owner_id: OWNER, kind: 'navi', title: 'T1' });
    const before = e.updated_at;
    await new Promise((r) => setTimeout(r, 5));
    const updated = await updateEntry(e.id, { title: 'T2', content: 'C2' });
    expect(updated.title).toBe('T2');
    expect(updated.content).toBe('C2');
    expect(updated.updated_at > before).toBe(true);
    expect(updated.created_at).toBe(e.created_at);
  });

  it('is_shared·pinned 0/1 정규화', async () => {
    const e = await createEntry({ owner_id: OWNER, kind: 'navi' });
    const u = await updateEntry(e.id, { is_shared: true, pinned: false });
    expect(u.is_shared).toBe(1);
    expect(u.pinned).toBe(0);
  });

  it('없는 id 는 throw', async () => {
    await expect(updateEntry('nope', { title: 'X' })).rejects.toThrow(/not found/);
  });
});

describe('softDelete / restore', () => {
  it('softDelete 후 deleted_at 채워짐, restore 후 null', async () => {
    const e = await createEntry({ owner_id: OWNER, kind: 'navi' });
    const deleted = await softDeleteEntry(e.id);
    expect(deleted.deleted_at).toMatch(/^\d{4}-/);
    const restored = await restoreEntry(e.id);
    expect(restored.deleted_at).toBeNull();
  });
});

describe('togglePin', () => {
  it('pinned 0 → 1 → 0', async () => {
    const e = await createEntry({ owner_id: OWNER, kind: 'navi' });
    expect(e.pinned).toBe(0);
    const p1 = await togglePin(e.id);
    expect(p1.pinned).toBe(1);
    const p2 = await togglePin(e.id);
    expect(p2.pinned).toBe(0);
  });
});

describe('countEntriesByKind', () => {
  it('deleted 제외 카운트', async () => {
    await createEntry({ owner_id: OWNER, kind: 'navi' });
    await createEntry({ owner_id: OWNER, kind: 'navi' });
    const e = await createEntry({ owner_id: OWNER, kind: 'navi' });
    await softDeleteEntry(e.id);
    expect(await countEntriesByKind('navi')).toBe(2);
  });
});

describe('listDeletedEntries (Wave 11.5.9 — 휴지통)', () => {
  it('deleted_at not null 만 반환 (모든 kind 합집합)', async () => {
    const a = await createEntry({ owner_id: OWNER, kind: 'navi', title: 'A' });
    const b = await createEntry({ owner_id: OWNER, kind: 'fiction', title: 'B' });
    const c = await createEntry({ owner_id: OWNER, kind: 'memo', title: 'C' });
    await createEntry({ owner_id: OWNER, kind: 'blog', title: 'D' }); // 살아있음 — 노출 X
    await softDeleteEntry(a.id);
    await softDeleteEntry(b.id);
    await softDeleteEntry(c.id);
    const trashed = await listDeletedEntries();
    expect(trashed.length).toBe(3);
    const titles = trashed.map((r) => r.title).sort();
    expect(titles).toEqual(['A', 'B', 'C']);
  });

  it('빈 휴지통 → []', async () => {
    await createEntry({ owner_id: OWNER, kind: 'navi' });
    await createEntry({ owner_id: OWNER, kind: 'fiction' });
    expect(await listDeletedEntries()).toEqual([]);
  });

  it('updated_at desc 정렬', async () => {
    const a = await createEntry({ owner_id: OWNER, kind: 'navi', title: 'A' });
    const b = await createEntry({ owner_id: OWNER, kind: 'navi', title: 'B' });
    await softDeleteEntry(a.id);
    await new Promise((r) => setTimeout(r, 5));
    await softDeleteEntry(b.id);
    const trashed = await listDeletedEntries();
    expect(trashed[0].title).toBe('B');
    expect(trashed[1].title).toBe('A');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Wave 11.7.3a — 네비 탭 '우리 글' (spec §4 L127-131)
// ─────────────────────────────────────────────────────────────────────────

describe('listSharedNaviEntries', () => {
  it('빈 DB → []', async () => {
    expect(await listSharedNaviEntries()).toEqual([]);
  });

  it('navi + soyoun_navi + is_shared=true 만 합집합 (시간 desc)', async () => {
    const e1 = await createEntry({ owner_id: OWNER, kind: 'navi', title: 'A', is_shared: true, updated_at: '2026-04-15T10:00:00Z' });
    const e2 = await createEntry({ owner_id: OWNER, kind: 'soyoun_navi', title: 'B', is_shared: true, updated_at: '2026-04-20T10:00:00Z' });
    const e3 = await createEntry({ owner_id: OWNER, kind: 'navi', title: 'C', is_shared: true, updated_at: '2026-04-10T10:00:00Z' });
    const rows = await listSharedNaviEntries();
    expect(rows.map((r) => r.id)).toEqual([e2.id, e1.id, e3.id]);
  });

  it('is_shared=false navi 는 제외', async () => {
    await createEntry({ owner_id: OWNER, kind: 'navi', is_shared: true });
    await createEntry({ owner_id: OWNER, kind: 'navi', is_shared: false });
    expect((await listSharedNaviEntries()).length).toBe(1);
  });

  it('navi/soyoun_navi 외 다른 kind (fiction/blog/memo/flight_diary/soyoun_blog) 는 제외', async () => {
    await createEntry({ owner_id: OWNER, kind: 'navi', is_shared: true });
    await createEntry({ owner_id: OWNER, kind: 'fiction', is_shared: true });
    await createEntry({ owner_id: OWNER, kind: 'blog', is_shared: true });
    await createEntry({ owner_id: OWNER, kind: 'memo', is_shared: true });
    await createEntry({ owner_id: OWNER, kind: 'flight_diary', is_shared: true });
    await createEntry({ owner_id: OWNER, kind: 'soyoun_blog', is_shared: true });
    await createEntry({ owner_id: OWNER, kind: 'soyoun_navi', is_shared: true });
    const rows = await listSharedNaviEntries();
    expect(rows.length).toBe(2);
    expect(rows.every((r) => r.kind === 'navi' || r.kind === 'soyoun_navi')).toBe(true);
  });

  it('softDelete 후 deleted_at 마킹된 row 는 제외', async () => {
    const e1 = await createEntry({ owner_id: OWNER, kind: 'navi', is_shared: true });
    const e2 = await createEntry({ owner_id: OWNER, kind: 'soyoun_navi', is_shared: true });
    await softDeleteEntry(e1.id);
    const rows = await listSharedNaviEntries();
    expect(rows.length).toBe(1);
    expect(rows[0].id).toBe(e2.id);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Wave 11.5.7 — Spotlight 검색 (searchEntries / searchExpenses)
// ─────────────────────────────────────────────────────────────────────────

describe('searchEntries (Wave 11.5.7)', () => {
  it('빈 DB → []', async () => {
    expect(await searchEntries('')).toEqual([]);
    expect(await searchEntries('foo')).toEqual([]);
  });

  it('본인 모든 kind 합집합 (navi/fiction/blog/memo) — 빈 q', async () => {
    await createEntry({ owner_id: OWNER, kind: 'navi', title: 'N1' });
    await createEntry({ owner_id: OWNER, kind: 'fiction', title: 'F1' });
    await createEntry({ owner_id: OWNER, kind: 'blog', title: 'B1' });
    await createEntry({ owner_id: OWNER, kind: 'memo', title: 'M1' });
    const rows = await searchEntries('');
    expect(rows.length).toBe(4);
  });

  it('partner shared navi (soyoun_navi + is_shared=1) 포함', async () => {
    await createEntry({ owner_id: OWNER, kind: 'navi', title: '본인' });
    await createEntry({ owner_id: OWNER, kind: 'soyoun_navi', title: '파트너 공유', is_shared: true });
    await createEntry({ owner_id: OWNER, kind: 'soyoun_navi', title: '파트너 비공유', is_shared: false });
    const rows = await searchEntries('');
    expect(rows.length).toBe(2);
    expect(rows.find((r) => r.title === '파트너 비공유')).toBeUndefined();
  });

  it('title / content 부분 일치 (case-insensitive)', async () => {
    await createEntry({ owner_id: OWNER, kind: 'navi', title: 'Hello World', content: '본문 1' });
    await createEntry({ owner_id: OWNER, kind: 'navi', title: '제목', content: 'apple banana' });
    expect((await searchEntries('hello')).length).toBe(1);
    expect((await searchEntries('HELLO')).length).toBe(1);
    expect((await searchEntries('banana')).length).toBe(1);
    expect((await searchEntries('foo')).length).toBe(0);
  });

  it('partnerOnly=true → soyoun_navi(shared) 만', async () => {
    await createEntry({ owner_id: OWNER, kind: 'navi', title: '본인', is_shared: true });
    await createEntry({ owner_id: OWNER, kind: 'soyoun_navi', title: '파트너', is_shared: true });
    await createEntry({ owner_id: OWNER, kind: 'soyoun_navi', title: '파트너 비공유', is_shared: false });
    const rows = await searchEntries('', { partnerOnly: true });
    expect(rows.length).toBe(1);
    expect(rows[0].title).toBe('파트너');
  });

  it('deleted_at 제외', async () => {
    const e1 = await createEntry({ owner_id: OWNER, kind: 'navi', title: 'A' });
    await createEntry({ owner_id: OWNER, kind: 'navi', title: 'B' });
    await softDeleteEntry(e1.id);
    const rows = await searchEntries('');
    expect(rows.length).toBe(1);
    expect(rows[0].title).toBe('B');
  });

  it('updated_at desc 정렬', async () => {
    const e1 = await createEntry({ owner_id: OWNER, kind: 'navi', title: 'old', updated_at: '2026-04-10T00:00:00Z' });
    const e2 = await createEntry({ owner_id: OWNER, kind: 'navi', title: 'new', updated_at: '2026-04-20T00:00:00Z' });
    const rows = await searchEntries('');
    expect(rows.map((r) => r.id)).toEqual([e2.id, e1.id]);
  });

  it('flight_diary / soyoun_blog (미사용 kind) 는 제외', async () => {
    await createEntry({ owner_id: OWNER, kind: 'navi', title: '본인', is_shared: true });
    await createEntry({ owner_id: OWNER, kind: 'flight_diary', title: '비행 일지', is_shared: true });
    await createEntry({ owner_id: OWNER, kind: 'soyoun_blog', title: '소연 블로그', is_shared: true });
    const rows = await searchEntries('');
    expect(rows.length).toBe(1);
  });
});

describe('searchExpenses (Wave 11.5.7)', () => {
  it('빈 DB → []', async () => {
    expect(await searchExpenses('')).toEqual([]);
    expect(await searchExpenses('foo')).toEqual([]);
  });

  it('빈 q → 전체 (deleted_at 제외)', async () => {
    await createExpense({ owner_id: OWNER, spent_at: '2026-04-15T00:00:00Z', amount_krw: 1000, source: 'manual' });
    await createExpense({ owner_id: OWNER, spent_at: '2026-04-16T00:00:00Z', amount_krw: 2000, source: 'manual' });
    const rows = await searchExpenses('');
    expect(rows.length).toBe(2);
  });

  it('merchant / memo / category 부분 일치 (case-insensitive)', async () => {
    await createExpense({ owner_id: OWNER, spent_at: '2026-04-15T00:00:00Z', amount_krw: 1000, source: 'manual', merchant: '쿠팡', category: '온라인쇼핑' });
    await createExpense({ owner_id: OWNER, spent_at: '2026-04-16T00:00:00Z', amount_krw: 2000, source: 'manual', merchant: '주식회사우아', memo: '점심 배달', category: '배달' });
    expect((await searchExpenses('쿠팡')).length).toBe(1);
    expect((await searchExpenses('점심')).length).toBe(1);
    expect((await searchExpenses('배달')).length).toBe(1);
    expect((await searchExpenses('foo')).length).toBe(0);
  });

  it('spent_at desc 정렬', async () => {
    await createExpense({ owner_id: OWNER, spent_at: '2026-04-10T00:00:00Z', amount_krw: 1000, source: 'manual', merchant: 'A' });
    await createExpense({ owner_id: OWNER, spent_at: '2026-04-20T00:00:00Z', amount_krw: 2000, source: 'manual', merchant: 'B' });
    const rows = await searchExpenses('');
    expect(rows[0].merchant).toBe('B');
    expect(rows[1].merchant).toBe('A');
  });

  it('softDeleted 제외', async () => {
    const e1 = await createExpense({ owner_id: OWNER, spent_at: '2026-04-15T00:00:00Z', amount_krw: 1000, source: 'manual' });
    await createExpense({ owner_id: OWNER, spent_at: '2026-04-16T00:00:00Z', amount_krw: 2000, source: 'manual' });
    await softDeleteExpense(e1.id);
    const rows = await searchExpenses('');
    expect(rows.length).toBe(1);
  });
});

describe('window.todayDB 미초기화', () => {
  it('db() 호출 시 throw', async () => {
    globalThis.todayDB = null;
    await expect(listEntries('navi')).rejects.toThrow(/미초기화/);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Wave 11.5.5 — 오프라인 큐 헬퍼
// ─────────────────────────────────────────────────────────────────────────

describe('listPendingEntries / setPendingSync', () => {
  it('생성 직후 pending_sync = 0 (기본 미마킹)', async () => {
    const e = await createEntry({ owner_id: OWNER, kind: 'navi' });
    const got = await getEntry(e.id);
    // createEntry 가 명시 안 함 — undefined 또는 0
    expect(got.pending_sync ?? 0).toBe(0);
  });

  it('setPendingSync(id, true) 후 listPendingEntries 에 포함', async () => {
    const e1 = await createEntry({ owner_id: OWNER, kind: 'navi' });
    const e2 = await createEntry({ owner_id: OWNER, kind: 'fiction' });
    await setPendingSync(e1.id, true);
    const pending = await listPendingEntries();
    expect(pending).toHaveLength(1);
    expect(pending[0].id).toBe(e1.id);
  });

  it('setPendingSync(id, false) 로 해제', async () => {
    const e = await createEntry({ owner_id: OWNER, kind: 'navi' });
    await setPendingSync(e.id, true);
    expect((await listPendingEntries()).length).toBe(1);
    await setPendingSync(e.id, false);
    expect((await listPendingEntries()).length).toBe(0);
  });

  it('setPendingSync 없는 id 는 null 반환', async () => {
    const r = await setPendingSync('nonexistent', true);
    expect(r).toBeNull();
  });

  it('updated_at 은 setPendingSync 로 변경되지 않음 (sync 메타 변경 ≠ 기록 변경)', async () => {
    const e = await createEntry({ owner_id: OWNER, kind: 'navi' });
    const before = (await getEntry(e.id)).updated_at;
    await new Promise((r) => setTimeout(r, 5));
    await setPendingSync(e.id, true);
    const after = (await getEntry(e.id)).updated_at;
    expect(after).toBe(before);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Wave 11.6.1 — expenses CRUD
// ═══════════════════════════════════════════════════════════════════════════

describe('createExpense', () => {
  it('필수 필드 채움 + id/created_at/updated_at 자동', async () => {
    const e = await createExpense({
      owner_id: OWNER,
      spent_at: '2026-04-15T12:30:00.000Z',
      amount_krw: 5500,
      source: 'manual',
      merchant: 'GS25',
      category: 'convenience',
    });
    expect(e.id).toMatch(/[0-9a-f-]{30,}/);
    expect(e.amount_krw).toBe(5500);
    expect(e.merchant).toBe('GS25');
    expect(e.deleted_at).toBeNull();
    expect(e.pending_sync).toBe(0);
    expect(e.created_at).toBe(e.updated_at);
  });

  it('owner_id 누락 → throw', async () => {
    await expect(
      createExpense({ spent_at: '2026-04-15T00:00:00Z', amount_krw: 100, source: 'manual' }),
    ).rejects.toThrow(/owner_id/);
  });

  it('spent_at 누락 → throw', async () => {
    await expect(
      createExpense({ owner_id: OWNER, amount_krw: 100, source: 'manual' }),
    ).rejects.toThrow(/spent_at/);
  });

  it('amount_krw 비숫자 → throw', async () => {
    await expect(
      createExpense({ owner_id: OWNER, spent_at: '2026-04-15T00:00:00Z', amount_krw: 'abc', source: 'manual' }),
    ).rejects.toThrow(/amount_krw/);
  });

  it('unknown source → throw', async () => {
    await expect(
      createExpense({ owner_id: OWNER, spent_at: '2026-04-15T00:00:00Z', amount_krw: 100, source: 'invalid' }),
    ).rejects.toThrow(/unknown source/);
  });
});

describe('listExpensesByRange / listExpensesByMonth (KST 월 경계)', () => {
  // spent_at 은 UTC 인스턴트. 귀속 월 = KST(+9) 환산 달 (캘린더 isoToMockDate 도 로컬=KST 버킷).
  // 각 거래의 KST 환산을 주석에 명시 — 코드와 독립적으로 진실을 도출해 assert.
  beforeEach(async () => {
    await createExpense({ owner_id: OWNER, spent_at: '2026-04-01T10:00:00.000Z', amount_krw: 1000, source: 'manual', category: 'dining' });    // KST 4/1 19:00 → 4월
    await createExpense({ owner_id: OWNER, spent_at: '2026-04-15T15:00:00.000Z', amount_krw: 2000, source: 'manual', category: 'dining' });    // KST 4/16 00:00 → 4월
    await createExpense({ owner_id: OWNER, spent_at: '2026-04-30T20:00:00.000Z', amount_krw: 3000, source: 'manual', category: 'subscribe' });  // KST 5/1 05:00 → 5월(경계)
    await createExpense({ owner_id: OWNER, spent_at: '2026-05-01T10:00:00.000Z', amount_krw: 9999, source: 'manual', category: 'dining' });    // KST 5/1 19:00 → 5월
  });

  it('KST 4월 = 2건 (4/30 20:00 UTC = KST 5/1 05:00 은 5월로 귀속, 이전 UTC 경계 버그 회귀 방지)', async () => {
    const apr = await listExpensesByMonth(2026, 4);
    expect(apr.map((e) => e.amount_krw).sort((a, b) => a - b)).toEqual([1000, 2000]);
  });

  it('KST 5월 = 2건 (월초 새벽 KST 거래가 5월에 포함)', async () => {
    const may = await listExpensesByMonth(2026, 5);
    expect(may.map((e) => e.amount_krw).sort((a, b) => a - b)).toEqual([3000, 9999]);
  });

  it('spent_at desc 정렬 (최신 먼저)', async () => {
    const apr = await listExpensesByMonth(2026, 4);
    expect(apr[0].amount_krw).toBe(2000); // 4/15
    expect(apr[1].amount_krw).toBe(1000); // 4/1
  });

  it('softDeleted 제외', async () => {
    const apr = await listExpensesByMonth(2026, 4);
    await softDeleteExpense(apr[0].id);
    const after = await listExpensesByMonth(2026, 4);
    expect(after).toHaveLength(1);
  });
});

describe('listExpensesByDate (Wave 11.6.3.2 — 일자 popover)', () => {
  beforeEach(async () => {
    await createExpense({ owner_id: OWNER, spent_at: '2026-04-15T03:00:00.000Z', amount_krw: 1000, source: 'manual' });
    await createExpense({ owner_id: OWNER, spent_at: '2026-04-15T15:00:00.000Z', amount_krw: 2000, source: 'manual' });
    await createExpense({ owner_id: OWNER, spent_at: '2026-04-15T23:59:00.000Z', amount_krw: 3000, source: 'manual' });
    await createExpense({ owner_id: OWNER, spent_at: '2026-04-16T00:00:00.000Z', amount_krw: 9999, source: 'manual' });
  });

  it('정상 ISO date → 해당 일자 row 만 (15일 3건)', async () => {
    const rows = await listExpensesByDate('2026-04-15');
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.spent_at.startsWith('2026-04-15'))).toBe(true);
  });

  it('spent_at desc 정렬', async () => {
    const rows = await listExpensesByDate('2026-04-15');
    expect(rows[0].amount_krw).toBe(3000);
    expect(rows[2].amount_krw).toBe(1000);
  });

  it('softDeleted 제외', async () => {
    const rows = await listExpensesByDate('2026-04-15');
    await softDeleteExpense(rows[0].id);
    const after = await listExpensesByDate('2026-04-15');
    expect(after).toHaveLength(2);
  });

  it('null/빈/형식 mismatch → []', async () => {
    expect(await listExpensesByDate(null)).toEqual([]);
    expect(await listExpensesByDate('')).toEqual([]);
    expect(await listExpensesByDate('04-15')).toEqual([]);
    expect(await listExpensesByDate('2026/04/15')).toEqual([]);
    expect(await listExpensesByDate('not-a-date')).toEqual([]);
  });

  it('해당 일자 0건 → []', async () => {
    const rows = await listExpensesByDate('2026-04-20');
    expect(rows).toEqual([]);
  });
});

describe('sumExpensesMonth / sumExpensesByCategoryMonth', () => {
  beforeEach(async () => {
    await createExpense({ owner_id: OWNER, spent_at: '2026-04-01T00:00:00Z', amount_krw: 1000, source: 'manual', category: 'dining' });
    await createExpense({ owner_id: OWNER, spent_at: '2026-04-15T00:00:00Z', amount_krw: 2000, source: 'manual', category: 'dining' });
    await createExpense({ owner_id: OWNER, spent_at: '2026-04-30T00:00:00Z', amount_krw: 3000, source: 'manual', category: 'subscribe' });
  });

  it('sumExpensesMonth = 6000', async () => {
    expect(await sumExpensesMonth(2026, 4)).toBe(6000);
  });

  it('카테고리별 합계 — dining 3000 / subscribe 3000', async () => {
    const totals = await sumExpensesByCategoryMonth(2026, 4);
    const map = new Map(totals.map((t) => [t.category, t.amount]));
    expect(map.get('dining')).toBe(3000);
    expect(map.get('subscribe')).toBe(3000);
  });
});

describe('updateExpense / softDeleteExpense', () => {
  it('updateExpense → updated_at 갱신', async () => {
    const e = await createExpense({
      owner_id: OWNER, spent_at: '2026-04-15T00:00:00Z', amount_krw: 1000, source: 'manual',
    });
    const before = e.updated_at;
    await new Promise((r) => setTimeout(r, 5));
    const u = await updateExpense(e.id, { memo: '점심값' });
    expect(u.memo).toBe('점심값');
    expect(u.updated_at > before).toBe(true);
  });

  it('softDelete → deleted_at 채움', async () => {
    const e = await createExpense({
      owner_id: OWNER, spent_at: '2026-04-15T00:00:00Z', amount_krw: 1000, source: 'manual',
    });
    const d = await softDeleteExpense(e.id);
    expect(d.deleted_at).toMatch(/^\d{4}-/);
  });
});

describe('findExpenseBySmsRaw', () => {
  it('SMS 원문 + spent_at 일치 시 row 반환 (중복 방지)', async () => {
    const e = await createExpense({
      owner_id: OWNER,
      spent_at: '2026-04-15T12:00:00.000Z',
      amount_krw: 5500,
      source: 'sms',
      sms_raw: '[국민카드] 5,500원 GS25 강남점 04/15 12:00',
    });
    const found = await findExpenseBySmsRaw(OWNER, e.sms_raw, e.spent_at);
    expect(found?.id).toBe(e.id);
  });

  it('일치하는 row 없으면 null', async () => {
    const r = await findExpenseBySmsRaw(OWNER, '없는 SMS', '2026-04-15T00:00:00Z');
    expect(r).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Wave 11.6.4a — merchant_rules + auto-match
// ═══════════════════════════════════════════════════════════════════════════

describe('createMerchantRule', () => {
  it('global scope rule — user_id null', async () => {
    const r = await createMerchantRule({
      scope: 'global', pattern: 'GS25', brand: 'GS25', category: 'convenience', priority: 10,
    });
    expect(r.scope).toBe('global');
    expect(r.user_id).toBeNull();
    expect(r.priority).toBe(10);
  });

  it('user scope rule — user_id 필수', async () => {
    const r = await createMerchantRule({
      scope: 'user', user_id: OWNER, pattern: '집근처식당', brand: null, category: 'dining',
    });
    expect(r.user_id).toBe(OWNER);
  });

  it('user scope + user_id 누락 → throw', async () => {
    await expect(
      createMerchantRule({ scope: 'user', pattern: 'X', category: 'dining' }),
    ).rejects.toThrow(/user_id/);
  });

  it('global scope + user_id 있음 → throw', async () => {
    await expect(
      createMerchantRule({ scope: 'global', user_id: OWNER, pattern: 'X', category: 'dining' }),
    ).rejects.toThrow(/global rule/);
  });

  it('unknown scope → throw', async () => {
    await expect(
      createMerchantRule({ scope: 'invalid', pattern: 'X' }),
    ).rejects.toThrow(/unknown rule scope/);
  });

  it('pattern 누락 → throw', async () => {
    await expect(
      createMerchantRule({ scope: 'global' }),
    ).rejects.toThrow(/pattern/);
  });
});

describe('listMerchantRules', () => {
  beforeEach(async () => {
    await createMerchantRule({ scope: 'global', pattern: 'GS25', category: 'convenience', priority: 5 });
    await createMerchantRule({ scope: 'global', pattern: 'CU', category: 'convenience', priority: 5 });
    await createMerchantRule({ scope: 'user', user_id: OWNER, pattern: '카카오페이', category: 'subscribe', priority: 10 });
    await createMerchantRule({ scope: 'user', user_id: 'other-user', pattern: 'OTHER', category: 'misc', priority: 100 });
  });

  it('global + 본인 user 만 반환 (다른 user 제외)', async () => {
    const list = await listMerchantRules(OWNER);
    expect(list).toHaveLength(3);
    expect(list.find((r) => r.pattern === 'OTHER')).toBeUndefined();
  });

  it('priority desc 정렬', async () => {
    const list = await listMerchantRules(OWNER);
    expect(list[0].pattern).toBe('카카오페이'); // priority 10
  });
});

describe('autoMatchMerchantRule', () => {
  beforeEach(async () => {
    await createMerchantRule({ scope: 'global', pattern: 'GS25', brand: 'GS25', category: 'convenience', priority: 5 });
    await createMerchantRule({ scope: 'user', user_id: OWNER, pattern: '카카오페이', brand: 'KakaoPay', category: 'subscribe', priority: 10 });
  });

  it('substring 매치 (대소문자 무관)', async () => {
    const r = await autoMatchMerchantRule('GS25 강남점', OWNER);
    expect(r?.brand).toBe('GS25');
    expect(r?.category).toBe('convenience');
  });

  it('priority 높은 룰 우선', async () => {
    // 'GS25' + '카카오페이' 둘 다 매치되는 SMS
    const r = await autoMatchMerchantRule('카카오페이 GS25 정기결제', OWNER);
    expect(r?.brand).toBe('KakaoPay');
  });

  it('매치 없으면 null', async () => {
    const r = await autoMatchMerchantRule('스타벅스', OWNER);
    expect(r).toBeNull();
  });

  it('빈 입력 → null', async () => {
    expect(await autoMatchMerchantRule('', OWNER)).toBeNull();
    expect(await autoMatchMerchantRule(null, OWNER)).toBeNull();
  });
});

describe('createExpenseWithAutoMatch', () => {
  beforeEach(async () => {
    await createMerchantRule({ scope: 'global', pattern: 'GS25', brand: 'GS25', category: 'convenience', priority: 5 });
  });

  it('merchant_raw 매칭 시 brand/category 자동 채움', async () => {
    const e = await createExpenseWithAutoMatch({
      owner_id: OWNER,
      spent_at: '2026-04-15T12:00:00Z',
      amount_krw: 5500,
      source: 'sms',
      merchant_raw: 'GS25 강남점',
    });
    expect(e.brand).toBe('GS25');
    expect(e.category).toBe('convenience');
  });

  it('사용자 입력 brand 가 우선 (자동 매칭 덮어쓰기 안 함)', async () => {
    const e = await createExpenseWithAutoMatch({
      owner_id: OWNER,
      spent_at: '2026-04-15T12:00:00Z',
      amount_krw: 5500,
      source: 'sms',
      merchant_raw: 'GS25 강남점',
      brand: '직접입력브랜드',
    });
    expect(e.brand).toBe('직접입력브랜드');
    expect(e.category).toBe('convenience'); // category 는 매칭으로 채움
  });

  it('매칭 없으면 그대로 createExpense', async () => {
    const e = await createExpenseWithAutoMatch({
      owner_id: OWNER,
      spent_at: '2026-04-15T12:00:00Z',
      amount_krw: 1000,
      source: 'manual',
      merchant_raw: '없는상점',
    });
    expect(e.brand).toBeNull();
    expect(e.category).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Wave 11.7.1 — comments
// ═══════════════════════════════════════════════════════════════════════════

describe('createComment / listCommentsByEntry', () => {
  const ENTRY = 'entry-uuid-1';

  it('createComment — 필수 필드 채움', async () => {
    const c = await createComment({ entry_id: ENTRY, author_id: OWNER, body: '좋네' });
    expect(c.id).toMatch(/[0-9a-f-]{30,}/);
    expect(c.body).toBe('좋네');
    expect(c.deleted_at).toBeNull();
    expect(c.created_at).toBe(c.updated_at);
  });

  it('필수 필드 누락 → throw', async () => {
    await expect(createComment({ entry_id: ENTRY, body: 'X' })).rejects.toThrow(/author_id/);
    await expect(createComment({ author_id: OWNER, body: 'X' })).rejects.toThrow(/entry_id/);
    await expect(createComment({ entry_id: ENTRY, author_id: OWNER })).rejects.toThrow(/body/);
  });

  it('listCommentsByEntry — entry 별 격리 + asc 정렬', async () => {
    await createComment({ entry_id: ENTRY, author_id: OWNER, body: '1번' });
    await new Promise((r) => setTimeout(r, 5));
    await createComment({ entry_id: ENTRY, author_id: OWNER, body: '2번' });
    await createComment({ entry_id: 'other-entry', author_id: OWNER, body: '다른 entry' });

    const list = await listCommentsByEntry(ENTRY);
    expect(list).toHaveLength(2);
    expect(list[0].body).toBe('1번');
    expect(list[1].body).toBe('2번');
  });

  it('softDeleteComment → list 에서 제외', async () => {
    const c = await createComment({ entry_id: ENTRY, author_id: OWNER, body: 'X' });
    await softDeleteComment(c.id);
    const list = await listCommentsByEntry(ENTRY);
    expect(list).toHaveLength(0);
  });

  it('countCommentsByEntry — deleted 제외', async () => {
    await createComment({ entry_id: ENTRY, author_id: OWNER, body: 'A' });
    const c2 = await createComment({ entry_id: ENTRY, author_id: OWNER, body: 'B' });
    await softDeleteComment(c2.id);
    expect(await countCommentsByEntry(ENTRY)).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Wave 11.7.1 — notifications
// ═══════════════════════════════════════════════════════════════════════════

describe('notifications', () => {
  const ME = 'me-user';
  const OTHER = 'other-user';

  beforeEach(async () => {
    // 알림은 보통 DB trigger 가 INSERT — 테스트에선 직접 put.
    await globalThis.todayDB.notifications.bulkPut([
      { id: 'n1', recipient_id: ME, kind: 'new_post', entry_id: 'e1', comment_id: null, preview: 'p1', read_at: null, created_at: '2026-04-15T10:00:00Z' },
      { id: 'n2', recipient_id: ME, kind: 'new_comment', entry_id: 'e1', comment_id: 'c1', preview: 'p2', read_at: null, created_at: '2026-04-16T10:00:00Z' },
      { id: 'n3', recipient_id: ME, kind: 'new_post', entry_id: 'e2', comment_id: null, preview: 'p3', read_at: '2026-04-17T10:00:00Z', created_at: '2026-04-14T10:00:00Z' },
      { id: 'n4', recipient_id: OTHER, kind: 'new_post', entry_id: 'e3', comment_id: null, preview: 'p4', read_at: null, created_at: '2026-04-15T10:00:00Z' },
    ]);
  });

  it('listNotifications — 본인만 + created_at desc', async () => {
    const list = await listNotifications(ME);
    expect(list).toHaveLength(3);
    expect(list[0].id).toBe('n2'); // 04-16 가장 최근
    expect(list.find((n) => n.id === 'n4')).toBeUndefined();
  });

  it('listNotifications unreadOnly — read_at null 만', async () => {
    const list = await listNotifications(ME, { unreadOnly: true });
    expect(list).toHaveLength(2);
    expect(list.every((n) => !n.read_at)).toBe(true);
  });

  it('countUnreadNotifications', async () => {
    expect(await countUnreadNotifications(ME)).toBe(2);
    expect(await countUnreadNotifications(OTHER)).toBe(1);
  });

  it('markNotificationRead → read_at 채움', async () => {
    const n = await markNotificationRead('n1');
    expect(n.read_at).toMatch(/^\d{4}-/);
    expect(await countUnreadNotifications(ME)).toBe(1);
  });

  it('markNotificationRead — 이미 읽은 건 idempotent', async () => {
    const before = await markNotificationRead('n3');
    expect(before.read_at).toBe('2026-04-17T10:00:00Z'); // 변경 없음
  });

  it('markAllNotificationsRead', async () => {
    const count = await markAllNotificationsRead(ME);
    expect(count).toBe(2);
    expect(await countUnreadNotifications(ME)).toBe(0);
  });

  it('없는 id markRead → null', async () => {
    expect(await markNotificationRead('nonexistent')).toBeNull();
  });
});
