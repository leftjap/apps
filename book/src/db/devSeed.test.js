/**
 * devSeed.js 단위 테스트 — 시드 멱등성 / owner 매핑 / pin / cleanup.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { createBookDB } from './schema.js';
import { seedDemoData, cleanupDemoData, SEED_QUOTES } from './devSeed.js';
import { listFeed, listPinned, listCommentsByQuote } from './queries.js';

const ME = '11111111-2222-3333-4444-555555555555';
const PARTNER = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

beforeEach(() => {
  const dbName = 'book_test_' + Math.random().toString(36).slice(2, 10);
  globalThis.bookDB = createBookDB(dbName);
});

describe('seedDemoData', () => {
  it('15 quotes + 4 comments 시드, who 매핑', async () => {
    const r = await seedDemoData({ meId: ME, partnerId: PARTNER });
    expect(r.ok).toBe(true);
    expect(r.quotesAdded).toBe(SEED_QUOTES.length); // 15
    expect(r.commentsAdded).toBe(4); // q1(3) + q6(1)

    const feed = await listFeed([ME, PARTNER]);
    expect(feed).toHaveLength(15);
    // who:'y' (q5,q8,q11,q15) → partner owner
    const partnerCount = feed.filter((q) => q.owner_id === PARTNER).length;
    expect(partnerCount).toBe(4);
  });

  it('pin 3건 (q1,q5,q7)', async () => {
    await seedDemoData({ meId: ME, partnerId: PARTNER });
    expect(await listPinned([ME, PARTNER])).toHaveLength(3);
  });

  it('q1 댓글 3건 시드', async () => {
    await seedDemoData({ meId: ME, partnerId: PARTNER });
    const feed = await listFeed([ME, PARTNER]);
    const q1 = feed.find((q) => q.text.startsWith('걷는 동안'));
    const comments = await listCommentsByQuote(q1.id);
    expect(comments).toHaveLength(3);
  });

  it('멱등 — 재호출 시 skip', async () => {
    await seedDemoData({ meId: ME, partnerId: PARTNER });
    const r2 = await seedDemoData({ meId: ME, partnerId: PARTNER });
    expect(r2.quotesAdded).toBe(0);
    expect(r2.quotesSkipped).toBe(15);
  });

  it('meId 없으면 no_meId', async () => {
    expect(await seedDemoData({})).toMatchObject({ ok: false, reason: 'no_meId' });
  });
});

describe('cleanupDemoData', () => {
  it('시드 전부 제거', async () => {
    await seedDemoData({ meId: ME, partnerId: PARTNER });
    const r = await cleanupDemoData();
    expect(r.quotesRemoved).toBe(15);
    expect(r.commentsRemoved).toBe(4);
    expect(await listFeed([ME, PARTNER])).toHaveLength(0);
  });
});
