import { describe, it, expect, vi } from 'vitest';
import { purgeModuyeongeoEp1415 } from './purgeModuyeongeo.js';

/* 일회성 정리 (2026-08-31 사용자 지시 "모두영어 세션 생성 폐기·오늘 데이터 제거") — 중지했던
 * 자동화가 재부팅으로 부활해 적재한 ep14·ep15 와 그 학습 데이터를 기기 로컬·서버에서 제거한다.
 * 서버만 지우면 reconcile(sync.js)이 로컬 사본을 되살리므로 기기측 정리가 필수다. */
describe('purgeModuyeongeoEp1415', () => {
  function fakeDB() {
    const meta = new Map();
    const store = (rows) => ({
      _rows: rows,
      toArray: async () => rows,
      bulkDelete: vi.fn(async (ids) => { const s = new Set(ids); rows.splice(0, rows.length, ...rows.filter((r) => !s.has(r.id))); }),
    });
    return {
      _meta: meta,
      meta: { get: async (k) => meta.get(k), put: async (row) => { meta.set(row.key, row); } },
      pronunciationLog: store([
        { id: 'p1', sentenceId: 'en-moduyeongeo-ep14-01-how-long-will-it-take' },
        { id: 'p2', sentenceId: 'en-moduyeongeo-ep14-01-how-long-will-it-take#drill#It won\'t take long.' },
        { id: 'p3', sentenceId: 'en-moduyeongeo-ep15-03-i-got-promoted' },
        { id: 'p4', sentenceId: 'en-core100-001-say-again-slowly' },      // 보존
        { id: 'p5', sentenceId: 'en-moduyeongeo-ep13-01-old-episode' },   // ep13 은 정상 이력 — 보존
      ]),
      sessionLogs: store([
        { id: 's1', date: '2026-08-31', newSentenceIds: ['en-moduyeongeo-ep14-01-how-long-will-it-take'] },
        { id: 's2', date: '2026-08-30', newSentenceIds: ['en-core100-001-say-again-slowly'] },
      ]),
      todayLessons: store([
        { id: 'en-moduyeongeo-ep15-01-how-did-you-know' },
        { id: 'en-core100-001-say-again-slowly' },
      ]),
      reviewQueue: store([
        { id: 'en-moduyeongeo-ep14-02-take-a-while' },
        { id: 'en-core100-002-what-do-you-mean' },
      ]),
    };
  }
  function fakeSupabase() {
    const calls = [];
    return {
      _calls: calls,
      from: (table) => ({
        delete: () => ({
          like: vi.fn(async (col, pat) => { calls.push([table, col, pat]); return { error: null }; }),
          contains: vi.fn(async (col, val) => { calls.push([table, col, JSON.stringify(val)]); return { error: null }; }),
        }),
      }),
    };
  }

  it('ep14·ep15 행만 로컬 4개 스토어에서 지우고, 다른 이력(core100·ep13)은 보존한다', async () => {
    const db = fakeDB();
    const ran = await purgeModuyeongeoEp1415(db, fakeSupabase());
    expect(ran).toBe(true);
    expect(db.pronunciationLog._rows.map((r) => r.id)).toEqual(['p4', 'p5']);
    expect(db.sessionLogs._rows.map((r) => r.id)).toEqual(['s2']);
    expect(db.todayLessons._rows.map((r) => r.id)).toEqual(['en-core100-001-say-again-slowly']);
    expect(db.reviewQueue._rows.map((r) => r.id)).toEqual(['en-core100-002-what-do-you-mean']);
  });

  it('서버 잔재도 재소거한다 — 옛 번들 기기의 reconcile 부활 대비', async () => {
    const sb = fakeSupabase();
    await purgeModuyeongeoEp1415(fakeDB(), sb);
    const tables = sb._calls.map((c) => c[0]);
    expect(tables).toContain('study_pronunciation_log');
    expect(tables).toContain('study_today_lessons');
    expect(tables).toContain('study_session_logs');
  });

  it('기기당 1회만 — 두 번째 호출은 no-op', async () => {
    const db = fakeDB();
    expect(await purgeModuyeongeoEp1415(db, null)).toBe(true);
    const before = db.pronunciationLog._rows.length;
    expect(await purgeModuyeongeoEp1415(db, null)).toBe(false);
    expect(db.pronunciationLog._rows.length).toBe(before);
  });

  it('supabase 없이도(오프라인) 로컬 정리는 수행한다', async () => {
    const db = fakeDB();
    expect(await purgeModuyeongeoEp1415(db, null)).toBe(true);
    expect(db.pronunciationLog._rows.map((r) => r.id)).toEqual(['p4', 'p5']);
  });
});
