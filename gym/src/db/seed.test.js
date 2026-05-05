/**
 * seed.js 단위 테스트 — today 기준 동적 시드 (Wave A).
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createGymDB } from './schema.js';
import { seedDevSessions, offsetToISO } from './seed.js';

describe('offsetToISO', () => {
  const FIXED = new Date('2026-05-05T12:00:00').getTime();

  it('today (offset 0) → 2026-05-05', () => {
    expect(offsetToISO(0, FIXED)).toBe('2026-05-05');
  });

  it('offset -13 → 2026-04-22', () => {
    expect(offsetToISO(-13, FIXED)).toBe('2026-04-22');
  });

  it('offset -33 → 2026-04-02', () => {
    expect(offsetToISO(-33, FIXED)).toBe('2026-04-02');
  });

  it('월 경계 — offset -1 (5/4) 와 offset +1 (5/6) 모두 ISO 1자리 padStart', () => {
    expect(offsetToISO(-1, FIXED)).toBe('2026-05-04');
    expect(offsetToISO(1, FIXED)).toBe('2026-05-06');
  });
});

describe('seedDevSessions', () => {
  let db;
  beforeEach(() => { db = createGymDB(`test-seed-${Date.now()}-${Math.random()}`); });
  afterEach(async () => { await db.delete(); });

  it('빈 DB → 14건 today 기준 ISO 날짜로 시드', async () => {
    const now = new Date('2026-05-05T12:00:00').getTime();
    const r = await seedDevSessions(db, now);
    expect(r).toEqual({ seeded: true, inserted: 14 });
    const sessions = await db.sessions.orderBy('date').toArray();
    expect(sessions.length).toBe(14);
    expect(sessions[0].date).toBe('2026-04-02');
    expect(sessions[sessions.length - 1].date).toBe('2026-04-22');
    expect(sessions.every((s) => s.status === 'completed')).toBe(true);
  });

  it('이미 시드된 DB → skip (idempotent)', async () => {
    const now = Date.now();
    await seedDevSessions(db, now);
    const r2 = await seedDevSessions(db, now);
    expect(r2.seeded).toBe(false);
    expect(r2.existing).toBe(14);
  });

  it('different now → different dates (today shift 반영)', async () => {
    const r = await seedDevSessions(db, new Date('2026-06-10T12:00:00').getTime());
    expect(r.seeded).toBe(true);
    const sessions = await db.sessions.orderBy('date').toArray();
    expect(sessions[0].date).toBe('2026-05-08'); // 6/10 - 33 = 5/8
    expect(sessions[sessions.length - 1].date).toBe('2026-05-28'); // 6/10 - 13 = 5/28
  });
});
