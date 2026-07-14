// @vitest-environment jsdom
/**
 * sync.outbox.test.js — 아웃박스 내구성 + push/pull 순서 (2026-07-15 데이터 유실 감사).
 *
 * 배경: _pendingUploads 가 in-memory Map 이라 3초 debounce 창에서 탭이 닫히면 tail 유실.
 * flushPendingUploads 는 await 이전에 큐를 clear 하므로 push 실패 시에도 id 가 영구 소실.
 * 스펙 §4(line 223-224) 는 "디바운스 3초 배치" 를 "세션 완료 시 즉시 동기화" 와 한 쌍으로
 * 설계했는데 후자가 미구현 → 3초 창이 그대로 노출.
 *
 * 검증:
 *  1) queueUpload → localStorage 아웃박스 영속 (탭이 죽어도 목록 잔존)
 *  2) push 실패/blocked → 아웃박스 잔존 (재시도 가능)
 *  3) 새 탭 startSync → 아웃박스 복원 후 push
 *  4) 순서: 기기-소유 테이블은 pull(bulkPut) 이전에 push (로컬 누적분이 서버 옛 값에 덮이기 전)
 *  5) serverOwned(todayLessons) 는 pull 이후 push (서버 삭제 행 부활 방지)
 *  6) reconcile 대상에 pronunciationLog / prRecords 포함
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const USER = { id: 'user-1' };
const OUTBOX_KEY = 'study.syncOutbox.user-1';

/** 호출 순서를 기록하는 supabase mock. data[table] 로 pull 결과 주입. */
function makeSupabase({ data = {}, upsertError = null, gate = null } = {}) {
  const order = [];
  const upserts = [];
  const from = vi.fn((table) => {
    const builder = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      upsert: vi.fn(async (rows) => {
        order.push(`upsert:${table}`);
        upserts.push({ table, rows });
        // gate: 응답이 오기 전 상태(탭 사망 시점)를 관찰하기 위한 지연
        if (gate?.armed && table === gate.table) await gate.promise;
        const err = typeof upsertError === 'function' ? upsertError(table) : upsertError;
        return { error: err };
      }),
      then: (resolve, reject) => {
        order.push(`select:${table}`);
        return Promise.resolve({ data: data[table] ?? [], error: null }).then(resolve, reject);
      },
    };
    return builder;
  });
  return { supabase: { from }, order, upserts };
}

/** Dexie store mock. bulkPut/bulkGet/toArray 호출을 order 에 기록. */
function makeStore(order, name, rows = []) {
  const byId = new Map(rows.map((r) => [r.id ?? r.date ?? r.key, r]));
  return {
    bulkPut: vi.fn(async (put) => {
      order.push(`bulkPut:${name}`);
      for (const r of put) byId.set(r.id ?? r.date ?? r.key, r);
    }),
    bulkGet: vi.fn(async (keys) => keys.map((k) => byId.get(k))),
    toArray: vi.fn(async () => Array.from(byId.values())),
    bulkDelete: vi.fn(async () => {}),
    toCollection: () => ({ primaryKeys: async () => Array.from(byId.keys()) }),
    hook: vi.fn(() => ({ unsubscribe: vi.fn() })),
  };
}

function makeDB(order, seed = {}) {
  return {
    reviewQueue: makeStore(order, 'reviewQueue', seed.reviewQueue),
    todayLessons: makeStore(order, 'todayLessons', seed.todayLessons),
    sessionLogs: makeStore(order, 'sessionLogs', seed.sessionLogs),
    pronunciationLog: makeStore(order, 'pronunciationLog', seed.pronunciationLog),
    mathProblems: makeStore(order, 'mathProblems', seed.mathProblems),
    mathQueue: makeStore(order, 'mathQueue', seed.mathQueue),
    dailyStats: makeStore(order, 'dailyStats', seed.dailyStats),
    meta: makeStore(order, 'meta', seed.meta),
  };
}

describe('sync 아웃박스 — 내구성', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unmock('../services/supabase.js');
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('queueUpload — pending id 를 localStorage 아웃박스에 즉시 영속 (탭 종료 대비)', async () => {
    const { supabase } = makeSupabase();
    vi.doMock('../services/supabase.js', () => ({ supabase, isSupabaseConfigured: true }));
    const order = [];
    window.studyDB = makeDB(order);
    const { startSync, queueUpload, stopSync } = await import('./sync.js');
    await startSync(USER);

    queueUpload('sessionLogs', 'log-1');

    const saved = JSON.parse(localStorage.getItem(OUTBOX_KEY) || '{}');
    expect(saved.sessionLogs).toContain('log-1');
    await stopSync();
  });

  it('flush 성공 — 아웃박스에서 제거', async () => {
    const { supabase } = makeSupabase();
    vi.doMock('../services/supabase.js', () => ({ supabase, isSupabaseConfigured: true }));
    const order = [];
    window.studyDB = makeDB(order, { sessionLogs: [{ id: 'log-1', lang: 'en', date: '2026-07-14' }] });
    const { startSync, queueUpload, flushPendingUploads, allowEmptyServerPush, stopSync } =
      await import('./sync.js');
    await startSync(USER);
    allowEmptyServerPush(); // 서버 전부 empty → 급감 가드 해제 (신규 유저 경로)

    queueUpload('sessionLogs', 'log-1');
    await flushPendingUploads();

    expect(localStorage.getItem(OUTBOX_KEY)).toBeNull();
    await stopSync();
  });

  it('flush 실패 — 아웃박스에 id 잔존 (현재는 clear 후 await 라 영구 유실)', async () => {
    const { supabase } = makeSupabase({
      upsertError: (t) => (t === 'study_session_logs' ? { message: 'network' } : null),
    });
    vi.doMock('../services/supabase.js', () => ({ supabase, isSupabaseConfigured: true }));
    const order = [];
    window.studyDB = makeDB(order, { sessionLogs: [{ id: 'log-1', lang: 'en', date: '2026-07-14' }] });
    const { startSync, queueUpload, flushPendingUploads, allowEmptyServerPush, stopSync } =
      await import('./sync.js');
    await startSync(USER);
    allowEmptyServerPush();

    queueUpload('sessionLogs', 'log-1');
    const result = await flushPendingUploads();

    expect(result.failed).toBe(1);
    const saved = JSON.parse(localStorage.getItem(OUTBOX_KEY) || '{}');
    expect(saved.sessionLogs).toContain('log-1');
    await stopSync();
  });

  // 실기기 검증(2026-07-15 로컬 dev, chrome)에서 잡은 회귀:
  // flush 시작 시 아웃박스를 낙관적으로 먼저 비우면, pagehide flush 도중 탭이 죽는 순간
  // (= 이 기능이 지켜야 할 바로 그 시나리오) 디스크는 이미 비었고 응답이 안 와 재큐잉도 못 해
  // tail 이 그대로 증발한다. 드레인은 서버 성공 응답 이후에만.
  it('flush 진행 중(응답 전) 탭 사망 — 디스크 아웃박스 유지', async () => {
    let openGate;
    const gate = { table: 'study_session_logs', armed: false, promise: new Promise((r) => { openGate = r; }) };
    const { supabase } = makeSupabase({ gate });
    vi.doMock('../services/supabase.js', () => ({ supabase, isSupabaseConfigured: true }));
    const order = [];
    window.studyDB = makeDB(order, { sessionLogs: [{ id: 'log-1', lang: 'en', date: '2026-07-14' }] });
    const { startSync, queueUpload, flushPendingUploads, allowEmptyServerPush, stopSync } =
      await import('./sync.js');
    await startSync(USER); // reconcile 까지 끝난 뒤에 게이트를 연다
    allowEmptyServerPush();
    gate.armed = true;

    queueUpload('sessionLogs', 'log-1');
    const inFlight = flushPendingUploads(); // 아직 서버 응답 전 — 이 순간 탭이 죽는다고 가정
    await vi.waitFor(() =>
      expect(JSON.parse(localStorage.getItem(OUTBOX_KEY) || '{}').sessionLogs).toContain('log-1'),
    );

    openGate();
    await inFlight;
    expect(localStorage.getItem(OUTBOX_KEY)).toBeNull(); // 성공 응답 후에만 드레인
    await stopSync();
  });

  it('새 탭 startSync — 아웃박스 복원 후 push (debounce 창에서 죽은 tail 회복)', async () => {
    // 서버에 log-1 이 이미 있음(옛 값) → reconcileTable(누락 id 만 push)은 이 행을 못 살린다.
    // 로컬의 미푸시 '수정분'(passCount 9)은 아웃박스 복원으로만 회복된다.
    localStorage.setItem(OUTBOX_KEY, JSON.stringify({ sessionLogs: ['log-1'] }));
    const { supabase, upserts } = makeSupabase({
      data: {
        study_session_logs: [
          { id: 'log-1', lang: 'en', date: '2026-07-14', pass_count: 1, utterance_count: 1 },
        ],
      },
    });
    vi.doMock('../services/supabase.js', () => ({ supabase, isSupabaseConfigured: true }));
    const order = [];
    window.studyDB = makeDB(order, {
      sessionLogs: [{ id: 'log-1', lang: 'en', date: '2026-07-14', passCount: 9, utteranceCount: 9 }],
    });
    const { startSync, stopSync } = await import('./sync.js');

    await startSync(USER);

    const pushed = upserts.find((u) => u.table === 'study_session_logs');
    expect(pushed).toBeTruthy();
    expect(pushed.rows[0].id).toBe('log-1');
    expect(pushed.rows[0].pass_count).toBe(9); // 서버 옛 값(1)이 아니라 로컬 미푸시 값
    await stopSync();
  });
});

describe('sync 아웃박스 — 백그라운드 flush 리스너', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unmock('../services/supabase.js');
    localStorage.clear();
  });

  afterEach(() => localStorage.clear());

  // startSync 의 reconcile 이 같은 테이블을 upsert 하므로, 리스너 효과는 '증가분'으로만 판정한다.
  async function armed() {
    const { supabase, upserts } = makeSupabase();
    vi.doMock('../services/supabase.js', () => ({ supabase, isSupabaseConfigured: true }));
    const order = [];
    window.studyDB = makeDB(order, { sessionLogs: [{ id: 'log-1', lang: 'en', date: '2026-07-14' }] });
    const mod = await import('./sync.js');
    const { installFlushOnHide } = await import('./flushOnHide.js');
    await mod.startSync(USER);
    mod.allowEmptyServerPush(); // 급감 가드 해제 (서버 전부 empty 마킹 상태)
    // main.js 와 동일 배선 (다른 세션이 올린 flushOnHide 모듈이 정본 — 리스너 이중 등록 방지)
    installFlushOnHide(() => mod.flushPendingUploads(), window, document);
    const baseline = upserts.length;
    mod.queueUpload('sessionLogs', 'log-1'); // 3초 debounce 대기 상태
    const pushedSince = () =>
      upserts.slice(baseline).filter((u) => u.table === 'study_session_logs').length;
    return { mod, upserts, pushedSince };
  }

  // iOS PWA 는 백그라운드 진입 시 setTimeout(3초 debounce)이 pause/discard 될 수 있어
  // hidden/pagehide/freeze 시점에 즉시 flush 해야 한다. online 은 오프라인 중 쌓인 큐 회복.
  it.each(['pagehide', 'freeze', 'online'])('%s → 즉시 flush', async (evt) => {
    const { mod, pushedSince } = await armed();
    expect(pushedSince()).toBe(0);

    if (evt === 'freeze') document.dispatchEvent(new Event(evt, { bubbles: true }));
    else window.dispatchEvent(new Event(evt));
    await vi.waitFor(() => expect(pushedSince()).toBe(1));

    await mod.stopSync();
  });

  it('visibilitychange(hidden) → flush, visible → flush 안 함', async () => {
    const { mod, pushedSince } = await armed();

    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange', { bubbles: true }));
    await Promise.resolve();
    expect(pushedSince()).toBe(0);

    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange', { bubbles: true }));
    await vi.waitFor(() => expect(pushedSince()).toBe(1));

    await mod.stopSync();
    vi.restoreAllMocks();
  });
});

describe('sync 아웃박스 — push/pull 순서', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unmock('../services/supabase.js');
    localStorage.clear();
  });

  afterEach(() => localStorage.clear());

  it('기기-소유(dailyStats) — pull 의 bulkPut 이전에 push (로컬 누적분 보존)', async () => {
    // 서버에 그날 옛 행이 이미 있음 → pull 이 bulkPut 하면 로컬 누적(발화 12)이 서버 값(3)으로 덮임.
    localStorage.setItem(OUTBOX_KEY, JSON.stringify({ dailyStats: ['2026-07-14'] }));
    const { supabase, order } = makeSupabase({
      data: {
        study_daily_stats: [
          { id: '2026-07-14_en_user-1', date: '2026-07-14', lang: 'en', utterance_count: 3 },
        ],
      },
    });
    vi.doMock('../services/supabase.js', () => ({ supabase, isSupabaseConfigured: true }));
    window.studyDB = makeDB(order, {
      dailyStats: [{ date: '2026-07-14', lang: 'en', utteranceCount: 12, studyTimeSec: 600 }],
    });
    const { startSync, stopSync } = await import('./sync.js');

    await startSync(USER);

    const pushAt = order.indexOf('upsert:study_daily_stats');
    const pullAt = order.indexOf('bulkPut:dailyStats');
    expect(pushAt).toBeGreaterThanOrEqual(0);
    expect(pullAt).toBeGreaterThanOrEqual(0);
    expect(pushAt).toBeLessThan(pullAt); // push 가 먼저여야 로컬 12 가 살아남음
    await stopSync();
  });

  it('serverOwned(todayLessons) — pull 이후 push (서버 삭제 행 부활 방지)', async () => {
    localStorage.setItem(OUTBOX_KEY, JSON.stringify({ todayLessons: ['t-1'] }));
    const { supabase, order } = makeSupabase({
      data: {
        study_today_lessons: [
          { id: 't-2', lang: 'en', date: '2026-07-14', sentence: 's', meaning: 'm' },
        ],
      },
    });
    vi.doMock('../services/supabase.js', () => ({ supabase, isSupabaseConfigured: true }));
    // 로컬엔 t-1(서버에서 삭제된 유령) + t-2. pull 의 stale 삭제 전파가 t-1 을 지움 → push 대상 소멸.
    window.studyDB = makeDB(order, {
      todayLessons: [
        { id: 't-1', lang: 'en', date: '2026-07-01', sentence: 'ghost', meaning: 'g' },
        { id: 't-2', lang: 'en', date: '2026-07-14', sentence: 's', meaning: 'm' },
      ],
    });
    const { startSync, stopSync } = await import('./sync.js');

    await startSync(USER);

    const pullAt = order.indexOf('bulkPut:todayLessons');
    const pushAt = order.indexOf('upsert:study_today_lessons');
    expect(pullAt).toBeGreaterThanOrEqual(0);
    if (pushAt >= 0) expect(pushAt).toBeGreaterThan(pullAt);
    // 유령 t-1 은 pull 의 삭제 전파 후 bulkDelete 됨 → 부활 push 없음
    expect(window.studyDB.todayLessons.bulkDelete).toHaveBeenCalledWith(['t-1']);
    await stopSync();
  });
});

describe('sync reconcile — 기기-작성 테이블 누락분 보강', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unmock('../services/supabase.js');
    localStorage.clear();
  });

  afterEach(() => localStorage.clear());

  it('pronunciationLog — 서버-빈 기존 유저의 로컬 전용 행을 직접 upsert', async () => {
    const { supabase, upserts } = makeSupabase({
      // reviewQueue 는 서버에 데이터 있음 → 신규 유저 아님 (allowEmptyServerPush 미발동 상황)
      data: {
        study_review_queue: [
          { id: 'r-1', lang: 'en', sentence: 's', meaning: 'm', next_review: '2026-07-20' },
        ],
      },
    });
    vi.doMock('../services/supabase.js', () => ({ supabase, isSupabaseConfigured: true }));
    const order = [];
    window.studyDB = makeDB(order, {
      pronunciationLog: [{ id: 'p-1', lang: 'en', date: '2026-07-14', overallScore: 88 }],
    });
    const { startSync, stopSync } = await import('./sync.js');

    await startSync(USER);

    const pushed = upserts.find((u) => u.table === 'study_pronunciation_log');
    expect(pushed).toBeTruthy();
    expect(pushed.rows[0].id).toBe('p-1');
    await stopSync();
  });

  it('prRecords — 서버 행 부재 + 로컬 PR 키 존재 → 직접 upsert (급감 가드 우회)', async () => {
    const { supabase, upserts } = makeSupabase({
      data: {
        study_review_queue: [
          { id: 'r-1', lang: 'en', sentence: 's', meaning: 'm', next_review: '2026-07-20' },
        ],
      },
    });
    vi.doMock('../services/supabase.js', () => ({ supabase, isSupabaseConfigured: true }));
    const order = [];
    window.studyDB = makeDB(order, {
      meta: [{ key: 'prDailyUtterance', value: { value: 120, date: '2026-07-10' } }],
    });
    const { startSync, stopSync } = await import('./sync.js');

    await startSync(USER);

    const pushed = upserts.find((u) => u.table === 'study_pr_records');
    expect(pushed).toBeTruthy();
    expect(pushed.rows[0].daily_utterance).toEqual({ value: 120, date: '2026-07-10' });
    await stopSync();
  });

  it('mathQueue — 앱이 쓰지 않는 테이블이라 reconcile 대상 아님 (dead code 금지)', async () => {
    const { supabase, upserts } = makeSupabase({
      data: {
        study_review_queue: [
          { id: 'r-1', lang: 'en', sentence: 's', meaning: 'm', next_review: '2026-07-20' },
        ],
      },
    });
    vi.doMock('../services/supabase.js', () => ({ supabase, isSupabaseConfigured: true }));
    const order = [];
    window.studyDB = makeDB(order);
    const { startSync, stopSync } = await import('./sync.js');

    await startSync(USER);

    expect(upserts.find((u) => u.table === 'study_math_queue')).toBeUndefined();
    await stopSync();
  });
});
