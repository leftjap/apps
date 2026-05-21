/**
 * Dev seed (Wave 11.6.7 → 2026-05-03 변경: seeding 비활성, cleanup 전용).
 *
 * 변경 사유:
 *  - Keep import 데이터 (entries 41 + expenses 2358) 가 Supabase 에 들어왔으므로 더 이상 데모 시드 불필요
 *  - 매 로그인마다 시드된 entry-fixture-* / tx-XX 가 사용자 실 데이터와 섞여 가시성 침해
 *  - `seedDevFixturesIdempotent` 는 호출 안 하지만 export 유지 (회귀 위험 0). 신규 진입점 = `cleanupDevFixtures`
 *
 * 데이터 (cleanup 대상 id):
 *  - entries 10건 (`entry-fixture-<kind>-<n>`)
 *  - expenses 23건 (`tx-XX`, splits 포함: tx-06a/b/c/d, tx-10a/b/c, tx-16a/b)
 */
import { Queries } from './queries.js';

const SEED_YEAR = '2026';
const DEFAULT_CARD = '삼성카드 & MILEAGE PLATINUM';

export const ENTRY_FIXTURES = Object.freeze([
  // navi 3건
  {
    id: 'entry-fixture-navi-1',
    kind: 'navi',
    title: '멈췄던 시간을 다시 시작하기',
    content: '<p>한참을 미뤄둔 글을 다시 펼쳤다. 이상하게도 오랜만에 마주한 문장은 처음 쓸 때보다 더 낯설었다.</p><blockquote>새로 쓰는 것보다 어려운 건, 멈춰둔 것을 다시 잇는 일이다.</blockquote><p>오늘은 새로운 문장을 욕심내지 않기로 했다. 어제까지 써둔 단락을 천천히 다시 읽고, 어색한 단어 두어 개만 바꿔두었다.</p>',
    is_shared: 1,
  },
  { id: 'entry-fixture-navi-2', kind: 'navi', title: '4월 셋째주 회고', content: '<p>이번 주는 평소보다 차분했다. 책상 앞에 앉아 있는 시간이 길었다.</p>' },
  { id: 'entry-fixture-navi-3', kind: 'navi', title: '4월 둘째주 회고', content: '<p>비 오는 날이 많았다. 산책 대신 책을 읽었다.</p>' },
  // fiction 2건
  { id: 'entry-fixture-fiction-1', kind: 'fiction', title: '에세이 초안 02', content: '<p>거리에 그늘이 길어지는 시간, 나는 천천히 걸었다.</p><p>모퉁이를 돌면 늘 같은 풍경이 펼쳐진다.</p>' },
  { id: 'entry-fixture-fiction-2', kind: 'fiction', title: '폐허에서 시작하는 법', content: '<p>모든 것이 무너진 다음에야 비로소 보이는 것이 있다.</p>' },
  // memo 3건
  { id: 'entry-fixture-memo-1', kind: 'memo', title: '도시와 그 불확실한 벽 — 메모', content: '<p>3장: 도시의 경계. 인용 — "벽은 안과 밖을 동시에 만든다."</p>' },
  { id: 'entry-fixture-memo-2', kind: 'memo', title: '장보기 — 04월 4주차', content: '<p>우유, 빵, 사과, 커피 원두</p>' },
  { id: 'entry-fixture-memo-3', kind: 'memo', title: '영화 메모 — 결말 없는 이야기', content: '<p>2시간 18분, 페이드아웃이 인상적.</p>' },
  // blog 2건
  { id: 'entry-fixture-blog-1', kind: 'blog', title: '리빌드 노트 — Dexie + Supabase 동기화', content: '<p>오프라인 우선 구조의 트레이드오프를 정리한다.</p>' },
  { id: 'entry-fixture-blog-2', kind: 'blog', title: 'iPhone PWA — 2026 Safari 제약', content: '<p>File System Access API 미지원. Blob URL 다운로드로 우회.</p>' },
]);

export const EXPENSE_FIXTURES = Object.freeze([
  { id: 'tx-01', date: '04-03', category: '편의점', memo: 'GS25 — 김밥+음료', amount_krw: 25000 },
  { id: 'tx-02', date: '04-06', category: '외식', memo: '점심 — 양화정', amount_krw: 24000, merchant: '양화정' },
  { id: 'tx-03', date: '04-08', category: '편의점', memo: 'CU — 간식', amount_krw: 10100 },
  { id: 'tx-04', date: '04-09', category: '구독', memo: '카카오페이 정기', amount_krw: 19000, recurring: 1 },
  { id: 'tx-05', date: '04-10', category: '교통', memo: '지하철 충전', amount_krw: 4500 },
  { id: 'tx-06a', date: '04-11', category: '배달', memo: '주식회사우아', amount_krw: 24000, merchant: '주식회사우아' },
  { id: 'tx-06b', date: '04-11', category: '온라인쇼핑', memo: '쿠팡', amount_krw: 26350, merchant: '쿠팡' },
  { id: 'tx-06c', date: '04-11', category: '온라인쇼핑', memo: '쿠팡', amount_krw: 1490000, merchant: '쿠팡' },
  { id: 'tx-06d', date: '04-11', category: '구독', memo: '쿠팡(와우멤)', amount_krw: 7890, merchant: '쿠팡(와우멤)', recurring: 1 },
  { id: 'tx-07', date: '04-12', category: '배달', memo: '주식회사우아 — 저녁', amount_krw: 11880, merchant: '주식회사우아' },
  { id: 'tx-08', date: '04-15', category: '외식', memo: '점심 — 파인만컴', amount_krw: 21500, merchant: '파인만컴' },
  { id: 'tx-09', date: '04-17', category: '편의점', memo: '7-Eleven', amount_krw: 24000 },
  { id: 'tx-10a', date: '04-19', category: '외식', memo: '회식 1차', amount_krw: 50000, merchant: '장수찜갈비', card: '현대카드 M' },
  { id: 'tx-10b', date: '04-19', category: '외식', memo: '회식 2차', amount_krw: 22570, merchant: '오리엔탈 이자카야', card: '삼성1337' },
  { id: 'tx-10c', date: '04-19', category: '교통', memo: '귀가 택시', amount_krw: 10000, merchant: '카카오T', card: '삼성1337' },
  { id: 'tx-11', date: '04-20', category: '외식', memo: '점심 — 홍대원조통골', amount_krw: 12600, merchant: '홍대원조통골' },
  { id: 'tx-12', date: '04-21', category: '편의점', memo: '간식', amount_krw: 8950 },
  { id: 'tx-13', date: '04-22', category: '구독', memo: '멜론', amount_krw: 4300, recurring: 1 },
  { id: 'tx-14', date: '04-23', category: '외식', memo: '저녁 — 화규', amount_krw: 20000, merchant: '화규' },
  { id: 'tx-15', date: '04-24', category: '문화', memo: '책 — 도시와 그 불확실한 벽', amount_krw: 18000 },
  { id: 'tx-16a', date: '04-25', category: '편의점', memo: 'GS25 음료', amount_krw: 5000, merchant: 'GS25', card: '삼성1337' },
  { id: 'tx-16b', date: '04-25', category: '간식', memo: '동네 빵집', amount_krw: 3000, merchant: '동네 빵집', card: '삼성1337' },
  { id: 'tx-17', date: '04-27', category: '패션', memo: '봄 자켓 — 네이버페이', amount_krw: 305000, merchant: '네이버페이' },
]);

function txDateToIso(monthDay) {
  return `${SEED_YEAR}-${monthDay}T12:00:00.000Z`;
}

/**
 * fixture id 별 idempotent 시드. 매 로그인마다 호출 안전.
 *  - getEntry/getExpense 가 row 반환 (deleted_at 포함) → skip
 *  - row 미존재 → createEntry/createExpense
 */
export async function seedDevFixturesIdempotent(user) {
  if (!user?.id) return { ok: false, reason: 'no_user' };
  const dbi = (typeof globalThis !== 'undefined' && globalThis.todayDB) || null;
  if (!dbi) return { ok: false, reason: 'no_db' };

  let entriesAdded = 0;
  let entriesSkipped = 0;
  for (const e of ENTRY_FIXTURES) {
    try {
      const existing = await Queries.getEntry(e.id);
      if (existing) {
        entriesSkipped += 1;
        continue;
      }
      await Queries.createEntry({
        id: e.id,
        owner_id: user.id,
        kind: e.kind,
        title: e.title,
        content: e.content,
        is_shared: e.is_shared ? 1 : 0,
      });
      entriesAdded += 1;
    } catch (err) {
      console.warn('[devSeed] entry 시드 실패:', e.id, err?.message || err);
    }
  }

  let expensesAdded = 0;
  let expensesSkipped = 0;
  for (const t of EXPENSE_FIXTURES) {
    try {
      const existing = await Queries.getExpense(t.id);
      if (existing) {
        expensesSkipped += 1;
        continue;
      }
      await Queries.createExpense({
        id: t.id,
        owner_id: user.id,
        spent_at: txDateToIso(t.date),
        amount_krw: t.amount_krw,
        merchant: t.merchant || t.memo,
        merchant_raw: t.merchant || t.memo,
        card: t.card || DEFAULT_CARD,
        memo: t.memo,
        category: t.category,
        source: 'manual',
        meta: t.recurring ? { recurring: 1 } : {},
      });
      expensesAdded += 1;
    } catch (err) {
      console.warn('[devSeed] expense 시드 실패:', t.id, err?.message || err);
    }
  }

  return {
    ok: true,
    entries: { added: entriesAdded, skipped: entriesSkipped },
    expenses: { added: expensesAdded, skipped: expensesSkipped },
  };
}

export const ENTRY_FIXTURE_IDS = Object.freeze(ENTRY_FIXTURES.map((e) => e.id));
export const EXPENSE_FIXTURE_IDS = Object.freeze(EXPENSE_FIXTURES.map((e) => e.id));

/**
 * 매 로그인마다 호출 (main.js handleSession). entry-fixture-* / tx-XX 를 Dexie 에서 hard-delete.
 *
 * 정책:
 *  - hard-delete (soft delete 아님) — fixture 는 dev seed 데이터, trash 에 남기지 않는다
 *  - sync.js 가 비-UUID id 는 Supabase push skip 하므로 (Wave 11.6.11) 로컬 hard-delete 가 Supabase 영향 0
 *  - 한 번 비워지면 다음 호출은 noop (멱등)
 *  - 사용자가 fixture id 그대로 사용했을 가능성? entry-fixture-* / tx-XX 는 deterministic prefix 라 사용자 신규 entry (UUID v4) 와 충돌 0
 *
 * 반환: { ok, entriesRemoved, expensesRemoved }
 */
export async function cleanupDevFixtures() {
  const dbi = (typeof globalThis !== 'undefined' && globalThis.todayDB) || null;
  if (!dbi || !dbi.entries || !dbi.expenses) return { ok: false, reason: 'no_db' };

  let entriesRemoved = 0;
  for (const id of ENTRY_FIXTURE_IDS) {
    try {
      const row = await dbi.entries.get(id);
      if (row) {
        await dbi.entries.delete(id);
        entriesRemoved += 1;
      }
    } catch (err) {
      console.warn('[devSeed] cleanup entry 실패:', id, err?.message || err);
    }
  }

  let expensesRemoved = 0;
  for (const id of EXPENSE_FIXTURE_IDS) {
    try {
      const row = await dbi.expenses.get(id);
      if (row) {
        await dbi.expenses.delete(id);
        expensesRemoved += 1;
      }
    } catch (err) {
      console.warn('[devSeed] cleanup expense 실패:', id, err?.message || err);
    }
  }

  return { ok: true, entriesRemoved, expensesRemoved };
}

export const DevSeed = {
  seedDevFixturesIdempotent,
  cleanupDevFixtures,
  ENTRY_FIXTURES,
  EXPENSE_FIXTURES,
  ENTRY_FIXTURE_IDS,
  EXPENSE_FIXTURE_IDS,
};

if (typeof window !== 'undefined') {
  window.todayDevSeed = DevSeed;
}

export default DevSeed;
