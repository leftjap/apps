/**
 * sync.test.js — Wave 11.13.1 다운로드 + Wave 11.13.2 업로드 단위 테스트.
 *
 * 검증 범위:
 *  - 11.13.1: TABLE_MAP 4 테이블 / startSync 가드 / stopSync / 인터페이스
 *  - 11.13.2: pushTable 가드·정상·error / queueUpload·flush 동작 / startSync hook 통합
 *
 * Mock 전략:
 *  - 기본 describe: supabase=null (env 미설정 환경) — 가드 검증
 *  - 정상 동작 describe: vi.doMock + vi.resetModules 로 supabase mock 객체 주입
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../services/supabase.js', () => ({
  supabase: null,
  isSupabaseConfigured: false,
}));

describe('sync — Wave 11.13.1 다운로드', () => {
  beforeEach(async () => {
    vi.resetModules();
    if (typeof globalThis.window === 'undefined') {
      globalThis.window = {};
    }
    globalThis.window.studyDB = null;
  });

  afterEach(() => {
    if (globalThis.window) {
      globalThis.window.studyDB = null;
    }
  });

  it('TABLE_MAP — 6 테이블 (review/today/session/pronunciation + math problems/queue), daily_stats/meta 미포함', async () => {
    const { Sync } = await import('./sync.js');
    expect(Sync.TABLE_MAP.length).toBe(6);
    const dexieNames = Sync.TABLE_MAP.map((m) => m.dexie);
    expect(dexieNames).toEqual(
      expect.arrayContaining(['reviewQueue', 'todayLessons', 'sessionLogs', 'pronunciationLog', 'mathProblems', 'mathQueue']),
    );
    expect(dexieNames).not.toContain('dailyStats');
    expect(dexieNames).not.toContain('meta');
  });

  it('TABLE_MAP — supabase 테이블 이름 study_ 접두사 + dexie 와 1:1', async () => {
    const { Sync } = await import('./sync.js');
    for (const m of Sync.TABLE_MAP) {
      expect(m.supabase.startsWith('study_')).toBe(true);
      expect(typeof m.dexie).toBe('string');
      expect(m.dexie.length).toBeGreaterThan(0);
    }
  });

  it('startSync(null) → ok=false, reason=no_user', async () => {
    const { startSync } = await import('./sync.js');
    const result = await startSync(null);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('no_user');
  });

  it('startSync — window.studyDB null 시 ok=false, reason=no_db', async () => {
    const { startSync } = await import('./sync.js');
    const result = await startSync({ id: '11111111-2222-3333-4444-555555555555' });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('no_db');
  });

  it('startSync — supabase null + db 있으면 pullAll reason=no_supabase', async () => {
    // top-level vi.mock 이 다른 describe 의 vi.unmock/doMock 영향으로 새지 않게 명시
    vi.doMock('../services/supabase.js', () => ({
      supabase: null,
      isSupabaseConfigured: false,
    }));
    const { startSync } = await import('./sync.js');
    globalThis.window.studyDB = {
      reviewQueue: { bulkPut: vi.fn() },
      todayLessons: { bulkPut: vi.fn() },
      sessionLogs: { bulkPut: vi.fn() },
      pronunciationLog: { bulkPut: vi.fn() },
    };
    const result = await startSync({ id: '11111111-2222-3333-4444-555555555555' });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('no_supabase');
  });

  it('stopSync → isSyncActive false', async () => {
    const { stopSync, isSyncActive } = await import('./sync.js');
    await stopSync();
    expect(isSyncActive()).toBe(false);
  });

  it('Sync 인터페이스 노출 (Wave 11.13.1 + 11.13.2 + 11.13.3 + 11.13.x)', async () => {
    const { Sync } = await import('./sync.js');
    expect(typeof Sync.startSync).toBe('function');
    expect(typeof Sync.stopSync).toBe('function');
    expect(typeof Sync.isSyncActive).toBe('function');
    expect(typeof Sync.pullTable).toBe('function');
    expect(typeof Sync.pullAll).toBe('function');
    expect(typeof Sync.pushTable).toBe('function');
    expect(typeof Sync.pushAll).toBe('function');
    expect(typeof Sync.queueUpload).toBe('function');
    expect(typeof Sync.flushPendingUploads).toBe('function');
    expect(typeof Sync.resolveConflict).toBe('function');
    expect(typeof Sync.allowEmptyServerPush).toBe('function');
    expect(typeof Sync.dailyStatsDexieToSupabase).toBe('function');
    expect(typeof Sync.dailyStatsSupabaseToDexie).toBe('function');
    expect(typeof Sync.pullDailyStats).toBe('function');
    expect(typeof Sync.pushDailyStats).toBe('function');
    expect(typeof Sync.userMetaDexieToSupabase).toBe('function');
    expect(typeof Sync.userMetaSupabaseToDexie).toBe('function');
    expect(typeof Sync.pullUserMeta).toBe('function');
    expect(typeof Sync.pushUserMeta).toBe('function');
    expect(Array.isArray(Sync.TABLE_MAP)).toBe(true);
    expect(Array.isArray(Sync.USER_META_KEY_MAP)).toBe(true);
    expect(Sync.USER_META_KEY_MAP.length).toBe(4);
    expect(Sync.DEBOUNCE_MS).toBe(3000);
  });
});

describe('sync — 서버 삭제 전파 (staleIdsToDelete + serverOwned)', () => {
  it('staleIdsToDelete: 서버에 없는 로컬 id 만 반환', async () => {
    const { Sync } = await import('./sync.js');
    expect(typeof Sync.staleIdsToDelete).toBe('function');
    expect(Sync.staleIdsToDelete(new Set(['a', 'b']), ['a', 'b', 'ghost1', 'ghost2'])).toEqual(['ghost1', 'ghost2']);
    expect(Sync.staleIdsToDelete(new Set(['a']), ['a'])).toEqual([]);
    expect(Sync.staleIdsToDelete(new Set(['a']), [])).toEqual([]);
  });

  it('serverOwned 플래그: today_lessons·math_problems 만 (기기-작성 테이블 제외)', async () => {
    const { Sync } = await import('./sync.js');
    const owned = Sync.TABLE_MAP.filter((m) => m.serverOwned).map((m) => m.dexie).sort();
    expect(owned).toEqual(['mathProblems', 'todayLessons']);
  });
});

describe('sync — Wave 11.13.2 업로드 가드 (supabase=null)', () => {
  beforeEach(() => {
    vi.resetModules();
    // vi.unmock 호출한 다른 describe 영향 방지 — supabase=null 명시 도입
    vi.doMock('../services/supabase.js', () => ({
      supabase: null,
      isSupabaseConfigured: false,
    }));
    if (typeof globalThis.window === 'undefined') globalThis.window = {};
    globalThis.window.studyDB = null;
  });

  it('pushTable — supabase null → skipped/no_supabase', async () => {
    const { pushTable, TABLE_MAP } = await import('./sync.js');
    const result = await pushTable(TABLE_MAP[0], {}, 'user-1');
    expect(result.status).toBe('skipped');
    expect(result.reason).toBe('no_supabase');
  });

  it('pushAll — supabase null → ok=false/no_supabase', async () => {
    const { pushAll } = await import('./sync.js');
    const result = await pushAll({}, 'user-1');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('no_supabase');
  });
});

/**
 * supabase mock chain. from() 호출 시 select-eq (pull) / upsert (push) 양쪽 지원.
 * 호출 결과를 spy 로 추적 가능하도록 outer 변수에 binding.
 */
function makeSupabaseChainMock() {
  const upsertCalls = [];
  const fromMock = vi.fn(() => {
    // builder 자체를 thenable 화 — await builder → { data: [], error: null }.
    // pullTable 의 select-eq await 패턴 + pullUserMeta 의 select-eq-maybeSingle 패턴 둘 다 지원.
    const builder = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      upsert: vi.fn((rows, opts) => {
        upsertCalls.push({ rows, opts });
        return Promise.resolve({ error: null });
      }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      then: (resolve, reject) =>
        Promise.resolve({ data: [], error: null }).then(resolve, reject),
    };
    return builder;
  });
  return { fromMock, upsertCalls };
}

describe('sync — Wave 11.13.2 pushTable 정상 동작 (supabase mock)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unmock('../services/supabase.js');
  });

  it('pushTable — db null → skipped/no_db', async () => {
    const { fromMock } = makeSupabaseChainMock();
    vi.doMock('../services/supabase.js', () => ({
      supabase: { from: fromMock },
      isSupabaseConfigured: true,
    }));
    const { pushTable, TABLE_MAP } = await import('./sync.js');
    const result = await pushTable(TABLE_MAP[0], null, 'user-1');
    expect(result.status).toBe('skipped');
    expect(result.reason).toBe('no_db');
  });

  it('pushTable — userId null → skipped/no_user', async () => {
    const { fromMock } = makeSupabaseChainMock();
    vi.doMock('../services/supabase.js', () => ({
      supabase: { from: fromMock },
      isSupabaseConfigured: true,
    }));
    const { pushTable, TABLE_MAP } = await import('./sync.js');
    const result = await pushTable(TABLE_MAP[0], {}, null);
    expect(result.status).toBe('skipped');
    expect(result.reason).toBe('no_user');
  });

  it('pushTable — ids=[] → empty (upsert 호출 X)', async () => {
    const { fromMock, upsertCalls } = makeSupabaseChainMock();
    vi.doMock('../services/supabase.js', () => ({
      supabase: { from: fromMock },
      isSupabaseConfigured: true,
    }));
    const { pushTable, TABLE_MAP } = await import('./sync.js');
    const db = { reviewQueue: { bulkGet: vi.fn(), toArray: vi.fn() } };
    const result = await pushTable(TABLE_MAP[0], db, 'user-1', []);
    expect(result.status).toBe('empty');
    expect(upsertCalls.length).toBe(0);
  });

  it('pushTable — ids 지정: bulkGet → toSupabase 변환 → upsert(onConflict=id)', async () => {
    // Wave 11.20 — reviewQueue 의 camelCase → snake_case 변환 + user_id 주입.
    const { fromMock, upsertCalls } = makeSupabaseChainMock();
    vi.doMock('../services/supabase.js', () => ({
      supabase: { from: fromMock },
      isSupabaseConfigured: true,
    }));
    const { pushTable, TABLE_MAP } = await import('./sync.js');
    const dexieRowA = {
      id: 'a',
      lang: 'en',
      sentence: 'Hi',
      meaning: '안녕',
      reading: null,
      explanation: null,
      interval: 2,
      nextReview: '2026-05-01',
      consecutivePass: 1,
      lastResult: 'O',
      category: 'session',
    };
    const dexieRowC = {
      id: 'c',
      lang: 'en',
      sentence: 'Bye',
      meaning: '잘가',
      reading: null,
      explanation: null,
      interval: 1,
      nextReview: '2026-04-30',
      consecutivePass: 0,
      lastResult: null,
      category: null,
    };
    const db = {
      reviewQueue: {
        // bulkGet missing key 는 undefined 반환 — 그 사이 삭제된 row 보호 검증
        bulkGet: vi.fn().mockResolvedValue([dexieRowA, undefined, dexieRowC]),
      },
    };
    const result = await pushTable(TABLE_MAP[0], db, 'user-1', ['a', 'b', 'c']);
    expect(result.status).toBe('ok');
    expect(result.count).toBe(2);
    expect(db.reviewQueue.bulkGet).toHaveBeenCalledWith(['a', 'b', 'c']);
    expect(fromMock).toHaveBeenCalledWith('study_review_queue');
    expect(upsertCalls.length).toBe(1);
    expect(upsertCalls[0].opts).toEqual({ onConflict: 'id' });
    expect(upsertCalls[0].rows).toEqual([
      {
        id: 'a',
        user_id: 'user-1',
        lang: 'en',
        sentence: 'Hi',
        meaning: '안녕',
        reading: null,
        explanation: null,
        interval: 2,
        next_review: '2026-05-01',
        consecutive_pass: 1,
        last_result: 'O',
        category: 'session',
        speaker: null,
      },
      {
        id: 'c',
        user_id: 'user-1',
        lang: 'en',
        sentence: 'Bye',
        meaning: '잘가',
        reading: null,
        explanation: null,
        interval: 1,
        next_review: '2026-04-30',
        consecutive_pass: 0,
        last_result: null,
        category: null,
        speaker: null,
      },
    ]);
  });

  it('pushTable — ids=null + 빈 store → empty', async () => {
    const { fromMock, upsertCalls } = makeSupabaseChainMock();
    vi.doMock('../services/supabase.js', () => ({
      supabase: { from: fromMock },
      isSupabaseConfigured: true,
    }));
    const { pushTable, TABLE_MAP } = await import('./sync.js');
    const db = { reviewQueue: { toArray: vi.fn().mockResolvedValue([]) } };
    const result = await pushTable(TABLE_MAP[0], db, 'user-1', null);
    expect(result.status).toBe('empty');
    expect(upsertCalls.length).toBe(0);
  });

  it('pushTable — upsert error → status=error', async () => {
    const fromMock = vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: [], error: null }),
      upsert: vi.fn().mockResolvedValue({ error: { message: 'rls violation' } }),
    }));
    vi.doMock('../services/supabase.js', () => ({
      supabase: { from: fromMock },
      isSupabaseConfigured: true,
    }));
    // captureConsoleIntegration 정합 — error 로그 의도적 (테스트 노이즈 억제)
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { pushTable, TABLE_MAP } = await import('./sync.js');
    const db = { reviewQueue: { bulkGet: vi.fn().mockResolvedValue([{ id: 'a' }]) } };
    const result = await pushTable(TABLE_MAP[0], db, 'user-1', ['a']);
    expect(result.status).toBe('error');
    errSpy.mockRestore();
  });
});

describe('sync — Wave 11.13.2 queueUpload + flushPendingUploads', () => {
  beforeEach(() => {
    vi.resetModules();
    if (typeof globalThis.window === 'undefined') globalThis.window = {};
    globalThis.window.studyDB = null;
  });

  it('queueUpload — falsy id 무시 (flush 시 큐 빈 상태)', async () => {
    const { fromMock } = makeSupabaseChainMock();
    vi.doMock('../services/supabase.js', () => ({
      supabase: { from: fromMock },
      isSupabaseConfigured: true,
    }));
    const { queueUpload, flushPendingUploads } = await import('./sync.js');
    queueUpload('reviewQueue', null);
    queueUpload('reviewQueue', undefined);
    queueUpload('reviewQueue', 0);
    queueUpload('reviewQueue', '');
    const result = await flushPendingUploads();
    expect(result.ok).toBe(true);
    expect(result.results).toEqual([]);
  });

  it('flushPendingUploads — 큐 빈 상태 즉시 ok=true', async () => {
    const { fromMock } = makeSupabaseChainMock();
    vi.doMock('../services/supabase.js', () => ({
      supabase: { from: fromMock },
      isSupabaseConfigured: true,
    }));
    const { flushPendingUploads } = await import('./sync.js');
    const result = await flushPendingUploads();
    expect(result.ok).toBe(true);
    expect(result.results).toEqual([]);
  });

  it('queueUpload — 유효 id 적재, 컨텍스트 없으면 flush 시 no_session', async () => {
    const { fromMock } = makeSupabaseChainMock();
    vi.doMock('../services/supabase.js', () => ({
      supabase: { from: fromMock },
      isSupabaseConfigured: true,
    }));
    const { queueUpload, flushPendingUploads } = await import('./sync.js');
    queueUpload('reviewQueue', 'id-1');
    const result = await flushPendingUploads();
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('no_session');
  });

  it('queueUpload — no_session 케이스에선 flush 후에도 큐 보존 (sync.js L195 race 방지)', async () => {
    const { fromMock } = makeSupabaseChainMock();
    vi.doMock('../services/supabase.js', () => ({
      supabase: { from: fromMock },
      isSupabaseConfigured: true,
    }));
    const { queueUpload, flushPendingUploads } = await import('./sync.js');
    queueUpload('reviewQueue', 'id-1');
    queueUpload('reviewQueue', 'id-1');
    queueUpload('reviewQueue', 'id-1');
    const r1 = await flushPendingUploads();
    expect(r1.reason).toBe('no_session');
    // 큐 보존 — 다음 flush 도 같은 결과 (다음 startSync 가 컨텍스트 잡으면 flush 가능 설계)
    const r2 = await flushPendingUploads();
    expect(r2.reason).toBe('no_session');
  });
});

describe('sync — Wave 11.13.2 startSync hook 통합', () => {
  beforeEach(() => {
    vi.resetModules();
    if (typeof globalThis.window === 'undefined') globalThis.window = {};
    globalThis.window.studyDB = null;
  });

  afterEach(async () => {
    // 모듈 상태 리셋 — startSync 가 _syncActive 잡으므로 다음 테스트에서 stopSync
    try {
      const { stopSync } = await import('./sync.js');
      await stopSync();
    } catch {
      // ignore
    }
    if (globalThis.window) globalThis.window.studyDB = null;
  });

  it('startSync — pullAll 후 6 테이블 × creating+updating = 12회 hook 등록 (Wave 11.14)', async () => {
    const { fromMock } = makeSupabaseChainMock();
    vi.doMock('../services/supabase.js', () => ({
      supabase: { from: fromMock },
      isSupabaseConfigured: true,
    }));
    const hookSpy = vi.fn(() => ({ unsubscribe: vi.fn() }));
    globalThis.window.studyDB = {
      reviewQueue: { bulkPut: vi.fn(), hook: hookSpy },
      todayLessons: { bulkPut: vi.fn(), hook: hookSpy },
      sessionLogs: { bulkPut: vi.fn(), hook: hookSpy },
      pronunciationLog: { bulkPut: vi.fn(), hook: hookSpy },
      dailyStats: { bulkPut: vi.fn(), hook: hookSpy },
      meta: { bulkPut: vi.fn(), hook: hookSpy },
    };
    const { startSync, stopSync } = await import('./sync.js');
    await startSync({ id: 'user-1' });
    // attach 시 hook(event, fn) 호출 — creating × 6 + updating × 6 = 12
    const attachCalls = hookSpy.mock.calls.filter((args) => args.length === 2);
    expect(attachCalls.length).toBe(12);
    const events = attachCalls.map((c) => c[0]);
    expect(events.filter((e) => e === 'creating').length).toBe(6);
    expect(events.filter((e) => e === 'updating').length).toBe(6);
    await stopSync();
  });

  it('startSync — 이미 활성이면 already_active (재진입 차단)', async () => {
    const { fromMock } = makeSupabaseChainMock();
    vi.doMock('../services/supabase.js', () => ({
      supabase: { from: fromMock },
      isSupabaseConfigured: true,
    }));
    const hookSpy = vi.fn(() => ({ unsubscribe: vi.fn() }));
    globalThis.window.studyDB = {
      reviewQueue: { bulkPut: vi.fn(), hook: hookSpy },
      todayLessons: { bulkPut: vi.fn(), hook: hookSpy },
      sessionLogs: { bulkPut: vi.fn(), hook: hookSpy },
      pronunciationLog: { bulkPut: vi.fn(), hook: hookSpy },
    };
    const { startSync, stopSync, isSyncActive } = await import('./sync.js');
    await startSync({ id: 'user-1' });
    expect(isSyncActive()).toBe(true);
    const second = await startSync({ id: 'user-1' });
    expect(second.ok).toBe(true);
    expect(second.reason).toBe('already_active');
    await stopSync();
  });

  it('stopSync — hook detach + isSyncActive false (Wave 11.14, 6 테이블 × 2 = 12 unsubscribe)', async () => {
    const { fromMock } = makeSupabaseChainMock();
    vi.doMock('../services/supabase.js', () => ({
      supabase: { from: fromMock },
      isSupabaseConfigured: true,
    }));
    const unsubscribeSpy = vi.fn();
    const hookSpy = vi.fn(() => ({ unsubscribe: unsubscribeSpy }));
    globalThis.window.studyDB = {
      reviewQueue: { bulkPut: vi.fn(), hook: hookSpy },
      todayLessons: { bulkPut: vi.fn(), hook: hookSpy },
      sessionLogs: { bulkPut: vi.fn(), hook: hookSpy },
      pronunciationLog: { bulkPut: vi.fn(), hook: hookSpy },
      dailyStats: { bulkPut: vi.fn(), hook: hookSpy },
      meta: { bulkPut: vi.fn(), hook: hookSpy },
    };
    const { startSync, stopSync, isSyncActive } = await import('./sync.js');
    await startSync({ id: 'user-1' });
    await stopSync();
    expect(isSyncActive()).toBe(false);
    // detach: hook('creating').unsubscribe(fn) + hook('updating').unsubscribe(fn) — 6 테이블 × 2 = 12 unsubscribe
    expect(unsubscribeSpy).toHaveBeenCalledTimes(12);
  });
});

describe('sync — Wave 11.14 attachHooks 6 테이블 + meta key 필터', () => {
  beforeEach(() => {
    vi.resetModules();
    if (typeof globalThis.window === 'undefined') globalThis.window = {};
    globalThis.window.studyDB = null;
  });

  afterEach(async () => {
    try {
      const { stopSync } = await import('./sync.js');
      await stopSync();
    } catch {
      /* noop */
    }
    if (globalThis.window) globalThis.window.studyDB = null;
  });

  it('meta hook — USER_META_KEY_MAP 4 keys 만 queueUpload (다른 keys 필터)', async () => {
    const { fromMock } = makeSupabaseChainMock();
    vi.doMock('../services/supabase.js', () => ({
      supabase: { from: fromMock },
      isSupabaseConfigured: true,
    }));
    // meta store 만 callback 캡처
    let metaOnCreating = null;
    const metaHookSpy = vi.fn((event, fn) => {
      if (event === 'creating') metaOnCreating = fn;
      return { unsubscribe: vi.fn() };
    });
    const otherHookSpy = vi.fn(() => ({ unsubscribe: vi.fn() }));
    const metaBulkGetSpy = vi
      .fn()
      .mockResolvedValue([
        { key: 'lang_en', value: { level: 'B1' } },
        undefined,
        { key: 'weakPhonemes_en', value: { ɹ: 5 } },
        undefined,
      ]);
    globalThis.window.studyDB = {
      reviewQueue: { bulkPut: vi.fn(), hook: otherHookSpy },
      todayLessons: { bulkPut: vi.fn(), hook: otherHookSpy },
      sessionLogs: { bulkPut: vi.fn(), hook: otherHookSpy },
      pronunciationLog: { bulkPut: vi.fn(), hook: otherHookSpy },
      dailyStats: { bulkPut: vi.fn(), hook: otherHookSpy },
      meta: { bulkGet: metaBulkGetSpy, hook: metaHookSpy },
    };
    const { startSync, flushPendingUploads, stopSync, allowEmptyServerPush } = await import(
      './sync.js'
    );
    await startSync({ id: 'user-1' });
    // pullAll 모두 empty → _serverCounts.meta=0 마킹 → 신규 사용자 시나리오 차단 회피
    allowEmptyServerPush();
    expect(metaOnCreating).toBeTruthy();

    // USER_META_KEY_MAP 매칭 키
    metaOnCreating('weakPhonemes_en', { key: 'weakPhonemes_en', value: { ɹ: 5 } });
    // 비매칭 키 (studySettings) — 큐 추가 안 됨
    metaOnCreating('studySettings', { key: 'studySettings', value: {} });
    metaOnCreating('activeSession', { key: 'activeSession', value: {} });

    const result = await flushPendingUploads();
    // meta 큐 → pushUserMeta 호출 → bulkGet(USER_META_KEY_MAP keys)
    expect(metaBulkGetSpy).toHaveBeenCalledWith([
      'lang_en',
      'lang_ja',
      'weakPhonemes_en',
      'weakPhonemes_ja',
    ]);
    // result.results 에 meta 항목 (status='ok')
    const metaResult = result.results.find((r) => r.table === 'meta');
    expect(metaResult).toBeDefined();
    expect(metaResult.status).toBe('ok');
    await stopSync();
  });

  it('flushPendingUploads — byTable.dailyStats 있으면 pushDailyStats 호출 (bulkGet dates)', async () => {
    const { fromMock } = makeSupabaseChainMock();
    vi.doMock('../services/supabase.js', () => ({
      supabase: { from: fromMock },
      isSupabaseConfigured: true,
    }));
    let dailyOnCreating = null;
    const dailyHookSpy = vi.fn((event, fn) => {
      if (event === 'creating') dailyOnCreating = fn;
      return { unsubscribe: vi.fn() };
    });
    const otherHookSpy = vi.fn(() => ({ unsubscribe: vi.fn() }));
    const dailyBulkGetSpy = vi.fn().mockResolvedValue([
      {
        date: '2026-04-30',
        lang: 'en',
        utteranceCount: 12,
        studyTimeSec: 600,
        newSentences: 5,
        reviewCount: 8,
      },
    ]);
    globalThis.window.studyDB = {
      reviewQueue: { bulkPut: vi.fn(), hook: otherHookSpy },
      todayLessons: { bulkPut: vi.fn(), hook: otherHookSpy },
      sessionLogs: { bulkPut: vi.fn(), hook: otherHookSpy },
      pronunciationLog: { bulkPut: vi.fn(), hook: otherHookSpy },
      dailyStats: { bulkGet: dailyBulkGetSpy, hook: dailyHookSpy },
      meta: { bulkPut: vi.fn(), hook: otherHookSpy },
    };
    const { startSync, flushPendingUploads, stopSync, allowEmptyServerPush } = await import(
      './sync.js'
    );
    await startSync({ id: 'user-1' });
    // pullAll 가 모두 empty 마킹 → 차단됨. unlock 으로 회피.
    allowEmptyServerPush();
    expect(dailyOnCreating).toBeTruthy();
    dailyOnCreating('2026-04-30', { date: '2026-04-30' });

    const result = await flushPendingUploads();
    expect(dailyBulkGetSpy).toHaveBeenCalledWith(['2026-04-30']);
    const dailyResult = result.results.find((r) => r.table === 'dailyStats');
    expect(dailyResult).toBeDefined();
    expect(dailyResult.status).toBe('ok');
    await stopSync();
  });
});

describe('sync — Wave 11.13.3 resolveConflict (순수 함수)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('local null → server 반환', async () => {
    const { resolveConflict } = await import('./sync.js');
    const server = { id: 'a', lastResult: 'O', nextReview: '2026-05-01' };
    expect(resolveConflict(null, server)).toBe(server);
    expect(resolveConflict(undefined, server)).toBe(server);
  });

  it('server null → local 반환', async () => {
    const { resolveConflict } = await import('./sync.js');
    const local = { id: 'a', lastResult: 'X', nextReview: '2026-04-30' };
    expect(resolveConflict(local, null)).toBe(local);
    expect(resolveConflict(local, undefined)).toBe(local);
  });

  it('"No"(X) 우선 — local X / server O → local', async () => {
    const { resolveConflict } = await import('./sync.js');
    const local = { id: 'a', lastResult: 'X', nextReview: '2026-04-30' };
    const server = { id: 'a', lastResult: 'O', nextReview: '2026-05-10' }; // 더 먼 nextReview 라도
    expect(resolveConflict(local, server)).toBe(local);
  });

  it('"No"(X) 우선 — server X / local O → server', async () => {
    const { resolveConflict } = await import('./sync.js');
    const local = { id: 'a', lastResult: 'O', nextReview: '2026-05-10' };
    const server = { id: 'a', lastResult: 'X', nextReview: '2026-04-30' };
    expect(resolveConflict(local, server)).toBe(server);
  });

  it('둘 다 X — nextReview 큰(먼) 쪽 우선', async () => {
    const { resolveConflict } = await import('./sync.js');
    const local = { id: 'a', lastResult: 'X', nextReview: '2026-05-15' };
    const server = { id: 'a', lastResult: 'X', nextReview: '2026-05-01' };
    expect(resolveConflict(local, server)).toBe(local);
    const local2 = { id: 'a', lastResult: 'X', nextReview: '2026-04-20' };
    const server2 = { id: 'a', lastResult: 'X', nextReview: '2026-05-10' };
    expect(resolveConflict(local2, server2)).toBe(server2);
  });

  it('둘 다 O + 같은 nextReview → server 우선 (동률 일관성)', async () => {
    const { resolveConflict } = await import('./sync.js');
    const local = { id: 'a', lastResult: 'O', nextReview: '2026-05-01' };
    const server = { id: 'a', lastResult: 'O', nextReview: '2026-05-01' };
    expect(resolveConflict(local, server)).toBe(server);
  });

  it('lastResult null (신규 카드) — nextReview 기준만 적용', async () => {
    const { resolveConflict } = await import('./sync.js');
    const local = { id: 'a', lastResult: null, nextReview: '2026-05-15' };
    const server = { id: 'a', lastResult: null, nextReview: '2026-05-01' };
    expect(resolveConflict(local, server)).toBe(local);
  });
});

describe('sync — Wave 11.13.3 pullTable reviewQueue 충돌 해결 통합', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('reviewQueue pull — bulkGet 호출 + resolveConflict 결과로 bulkPut', async () => {
    // 서버 row: lastResult='O', nextReview='2026-05-01'
    // 로컬 row: lastResult='X', nextReview='2026-04-30' → "No" 우선 → local 보존
    const fromMock = vi.fn(() => {
      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn().mockResolvedValue({
          data: [{ id: 'card-1', lastResult: 'O', nextReview: '2026-05-01', user_id: 'u' }],
          error: null,
        }),
      };
      return builder;
    });
    vi.doMock('../services/supabase.js', () => ({
      supabase: { from: fromMock },
      isSupabaseConfigured: true,
    }));
    const { pullTable, TABLE_MAP } = await import('./sync.js');
    const reviewMapping = TABLE_MAP.find((m) => m.dexie === 'reviewQueue');
    const bulkPutSpy = vi.fn().mockResolvedValue();
    const bulkGetSpy = vi
      .fn()
      .mockResolvedValue([{ id: 'card-1', lastResult: 'X', nextReview: '2026-04-30' }]);
    const db = { reviewQueue: { bulkPut: bulkPutSpy, bulkGet: bulkGetSpy } };
    const result = await pullTable(reviewMapping, db, 'user-1');
    expect(result.status).toBe('ok');
    expect(bulkGetSpy).toHaveBeenCalledWith(['card-1']);
    // bulkPut 가 local row (lastResult='X') 로 호출됐는지 검증
    expect(bulkPutSpy).toHaveBeenCalledWith([
      { id: 'card-1', lastResult: 'X', nextReview: '2026-04-30' },
    ]);
  });

  it('todayLessons pull — bulkGet 호출 안 함 (toDexie 변환 후 단순 bulkPut)', async () => {
    // Wave 11.20 — Supabase row (snake_case) → Dexie (camelCase) 변환 검증.
    const fromMock = vi.fn(() => {
      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn().mockResolvedValue({
          data: [{
            id: 'lesson-1',
            user_id: 'u',
            lang: 'en',
            date: '2026-04-15',
            sentence: 'Hi',
            meaning: '안녕',
            reading: null,
            explanation: { foo: 'bar' },
            phonetic_kr: null,
            audio_url: null,
            completed: false,
            order_index: 0,
            created_at: '2026-04-15T00:00:00Z',
          }],
          error: null,
        }),
      };
      return builder;
    });
    vi.doMock('../services/supabase.js', () => ({
      supabase: { from: fromMock },
      isSupabaseConfigured: true,
    }));
    const { pullTable, TABLE_MAP } = await import('./sync.js');
    const lessonMapping = TABLE_MAP.find((m) => m.dexie === 'todayLessons');
    const bulkPutSpy = vi.fn().mockResolvedValue();
    const bulkGetSpy = vi.fn();
    const db = { todayLessons: { bulkPut: bulkPutSpy, bulkGet: bulkGetSpy } };
    const result = await pullTable(lessonMapping, db, 'user-1');
    expect(result.status).toBe('ok');
    expect(bulkGetSpy).not.toHaveBeenCalled();
    expect(bulkPutSpy).toHaveBeenCalledWith([
      {
        id: 'lesson-1',
        lang: 'en',
        date: '2026-04-15',
        sentence: 'Hi',
        meaning: '안녕',
        reading: null,
        explanation: { foo: 'bar' },
        phonetic_kr: null,
        audioUrl: null,
        completed: false,
        order_index: 0,
        speaker: null,
        createdAt: '2026-04-15T00:00:00Z',
      },
    ]);
  });
});

describe('sync — Wave 11.13.3 급감 차단 + unlock', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('pullAll 후 마킹 0 + pushTable 시 로컬 row > 0 → status=blocked', async () => {
    // pullAll: 4 테이블 모두 빈 결과 → _serverCounts 모두 0
    // pushTable: 로컬 row 있음 → 차단
    const upsertSpy = vi.fn().mockResolvedValue({ error: null });
    const fromMock = vi.fn(() => {
      // thenable builder — pullTable 의 await eq() + pullUserMeta 의 .maybeSingle() 둘 다 지원
      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        upsert: upsertSpy,
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        then: (resolve, reject) =>
          Promise.resolve({ data: [], error: null }).then(resolve, reject),
      };
      return builder;
    });
    vi.doMock('../services/supabase.js', () => ({
      supabase: { from: fromMock },
      isSupabaseConfigured: true,
    }));
    const { pullAll, pushTable, TABLE_MAP } = await import('./sync.js');
    const db = {
      reviewQueue: {
        bulkPut: vi.fn(),
        bulkGet: vi.fn().mockResolvedValue([{ id: 'card-1', lastResult: 'O' }]),
      },
      todayLessons: { bulkPut: vi.fn() },
      sessionLogs: { bulkPut: vi.fn() },
      pronunciationLog: { bulkPut: vi.fn() },
    };
    await pullAll(db, 'user-1'); // 마킹 0
    const result = await pushTable(TABLE_MAP[0], db, 'user-1', ['card-1']);
    expect(result.status).toBe('blocked');
    expect(result.reason).toBe('server_empty_local_nonempty');
    expect(result.count).toBe(1);
    expect(upsertSpy).not.toHaveBeenCalled();
  });

  it('pullAll 전 (마킹 없음) → push 차단 안 함', async () => {
    const upsertSpy = vi.fn().mockResolvedValue({ error: null });
    const fromMock = vi.fn(() => {
      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        upsert: upsertSpy,
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        then: (resolve, reject) =>
          Promise.resolve({ data: [], error: null }).then(resolve, reject),
      };
      return builder;
    });
    vi.doMock('../services/supabase.js', () => ({
      supabase: { from: fromMock },
      isSupabaseConfigured: true,
    }));
    const { pushTable, TABLE_MAP } = await import('./sync.js');
    const db = {
      reviewQueue: { bulkGet: vi.fn().mockResolvedValue([{ id: 'card-1' }]) },
    };
    // pullAll 호출 안 함 → _serverCounts 비어있음 → has() false → 차단 안 함
    const result = await pushTable(TABLE_MAP[0], db, 'user-1', ['card-1']);
    expect(result.status).toBe('ok');
    expect(upsertSpy).toHaveBeenCalled();
  });

  it('pullAll 마킹 N>0 + pushTable → 차단 안 함', async () => {
    const upsertSpy = vi.fn().mockResolvedValue({ error: null });
    const fromMock = vi.fn(() => {
      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        upsert: upsertSpy,
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        then: (resolve, reject) =>
          Promise.resolve({
            data: [{ id: 'card-1', lastResult: 'O', user_id: 'u' }],
            error: null,
          }).then(resolve, reject),
      };
      return builder;
    });
    vi.doMock('../services/supabase.js', () => ({
      supabase: { from: fromMock },
      isSupabaseConfigured: true,
    }));
    const { pullAll, pushTable, TABLE_MAP } = await import('./sync.js');
    const db = {
      reviewQueue: {
        bulkPut: vi.fn(),
        bulkGet: vi
          .fn()
          .mockResolvedValueOnce([undefined]) // pullTable 충돌 해결: local 없음
          .mockResolvedValueOnce([{ id: 'card-1', lastResult: 'O' }]), // pushTable bulkGet
      },
      todayLessons: { bulkPut: vi.fn() },
      sessionLogs: { bulkPut: vi.fn() },
      pronunciationLog: { bulkPut: vi.fn() },
    };
    await pullAll(db, 'user-1'); // reviewQueue=1, 나머지=0 마킹
    const result = await pushTable(TABLE_MAP[0], db, 'user-1', ['card-1']);
    expect(result.status).toBe('ok');
    expect(upsertSpy).toHaveBeenCalled();
  });

  it('allowEmptyServerPush — 차단 해제 후 push 정상 ok', async () => {
    const upsertSpy = vi.fn().mockResolvedValue({ error: null });
    const fromMock = vi.fn(() => {
      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        upsert: upsertSpy,
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        then: (resolve, reject) =>
          Promise.resolve({ data: [], error: null }).then(resolve, reject),
      };
      return builder;
    });
    vi.doMock('../services/supabase.js', () => ({
      supabase: { from: fromMock },
      isSupabaseConfigured: true,
    }));
    const { pullAll, pushTable, allowEmptyServerPush, TABLE_MAP } = await import('./sync.js');
    const db = {
      reviewQueue: { bulkGet: vi.fn().mockResolvedValue([{ id: 'card-1' }]) },
      todayLessons: { bulkPut: vi.fn() },
      sessionLogs: { bulkPut: vi.fn() },
      pronunciationLog: { bulkPut: vi.fn() },
    };
    await pullAll(db, 'user-1'); // 마킹 0
    allowEmptyServerPush(); // 차단 해제
    const result = await pushTable(TABLE_MAP[0], db, 'user-1', ['card-1']);
    expect(result.status).toBe('ok');
    expect(upsertSpy).toHaveBeenCalled();
  });
});

describe('sync — Wave 11.13.x dailyStats 변환 헬퍼 (순수 함수)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('dailyStatsDexieToSupabase — 정상 (id 생성 + snake_case)', async () => {
    const { dailyStatsDexieToSupabase } = await import('./sync.js');
    const dexieRow = {
      date: '2026-04-30',
      lang: 'en',
      utteranceCount: 12,
      studyTimeSec: 600,
      newSentences: 5,
      reviewCount: 8,
    };
    const result = dailyStatsDexieToSupabase(dexieRow, 'user-1');
    expect(result).toEqual({
      id: '2026-04-30_en_user-1',
      user_id: 'user-1',
      date: '2026-04-30',
      lang: 'en',
      utterance_count: 12,
      study_time_sec: 600,
      new_sentences: 5,
      review_count: 8,
    });
  });

  it('dailyStatsDexieToSupabase — row null → null', async () => {
    const { dailyStatsDexieToSupabase } = await import('./sync.js');
    expect(dailyStatsDexieToSupabase(null, 'user-1')).toBeNull();
  });

  it('dailyStatsDexieToSupabase — userId null → null', async () => {
    const { dailyStatsDexieToSupabase } = await import('./sync.js');
    expect(dailyStatsDexieToSupabase({ date: '2026-04-30', lang: 'en' }, null)).toBeNull();
  });

  it('dailyStatsDexieToSupabase — 누락 컬럼 0 fallback', async () => {
    const { dailyStatsDexieToSupabase } = await import('./sync.js');
    const result = dailyStatsDexieToSupabase({ date: '2026-04-30', lang: 'en' }, 'user-1');
    expect(result.utterance_count).toBe(0);
    expect(result.study_time_sec).toBe(0);
    expect(result.new_sentences).toBe(0);
    expect(result.review_count).toBe(0);
  });

  it('dailyStatsSupabaseToDexie — 정상 (id 제거 + camelCase)', async () => {
    const { dailyStatsSupabaseToDexie } = await import('./sync.js');
    const supRow = {
      id: '2026-04-30_en_user-1',
      user_id: 'user-1',
      date: '2026-04-30',
      lang: 'en',
      utterance_count: 12,
      study_time_sec: 600,
      new_sentences: 5,
      review_count: 8,
    };
    const result = dailyStatsSupabaseToDexie(supRow);
    expect(result).toEqual({
      date: '2026-04-30',
      lang: 'en',
      utteranceCount: 12,
      studyTimeSec: 600,
      newSentences: 5,
      reviewCount: 8,
    });
    expect(result.id).toBeUndefined();
    expect(result.user_id).toBeUndefined();
  });

  it('dailyStatsSupabaseToDexie — row null → null', async () => {
    const { dailyStatsSupabaseToDexie } = await import('./sync.js');
    expect(dailyStatsSupabaseToDexie(null)).toBeNull();
  });
});

describe('sync — Wave 11.13.x pullDailyStats / pushDailyStats 통합', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('pullDailyStats — 정상 select → 변환 후 bulkPut', async () => {
    const fromMock = vi.fn(() => {
      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn().mockResolvedValue({
          data: [
            {
              id: '2026-04-30_en_u',
              user_id: 'u',
              date: '2026-04-30',
              lang: 'en',
              utterance_count: 10,
              study_time_sec: 300,
              new_sentences: 3,
              review_count: 5,
            },
          ],
          error: null,
        }),
      };
      return builder;
    });
    vi.doMock('../services/supabase.js', () => ({
      supabase: { from: fromMock },
      isSupabaseConfigured: true,
    }));
    const { pullDailyStats } = await import('./sync.js');
    const bulkPutSpy = vi.fn().mockResolvedValue();
    const db = { dailyStats: { bulkPut: bulkPutSpy } };
    const result = await pullDailyStats(db, 'user-1');
    expect(result.status).toBe('ok');
    expect(result.count).toBe(1);
    expect(bulkPutSpy).toHaveBeenCalledWith([
      {
        date: '2026-04-30',
        lang: 'en',
        utteranceCount: 10,
        studyTimeSec: 300,
        newSentences: 3,
        reviewCount: 5,
      },
    ]);
    expect(fromMock).toHaveBeenCalledWith('study_daily_stats');
  });

  it('pushDailyStats — toArray → 변환 (id 생성 + snake_case) → upsert(onConflict=id)', async () => {
    const upsertCalls = [];
    const fromMock = vi.fn(() => ({
      upsert: vi.fn((rows, opts) => {
        upsertCalls.push({ rows, opts });
        return Promise.resolve({ error: null });
      }),
    }));
    vi.doMock('../services/supabase.js', () => ({
      supabase: { from: fromMock },
      isSupabaseConfigured: true,
    }));
    const { pushDailyStats } = await import('./sync.js');
    const db = {
      dailyStats: {
        toArray: vi.fn().mockResolvedValue([
          {
            date: '2026-04-30',
            lang: 'en',
            utteranceCount: 10,
            studyTimeSec: 300,
            newSentences: 3,
            reviewCount: 5,
          },
        ]),
      },
    };
    const result = await pushDailyStats(db, 'user-1', null);
    expect(result.status).toBe('ok');
    expect(result.count).toBe(1);
    expect(fromMock).toHaveBeenCalledWith('study_daily_stats');
    expect(upsertCalls.length).toBe(1);
    expect(upsertCalls[0].opts).toEqual({ onConflict: 'id' });
    expect(upsertCalls[0].rows[0]).toEqual({
      id: '2026-04-30_en_user-1',
      user_id: 'user-1',
      date: '2026-04-30',
      lang: 'en',
      utterance_count: 10,
      study_time_sec: 300,
      new_sentences: 3,
      review_count: 5,
    });
  });
});

describe('sync — Wave 11.13.x user_meta 변환 헬퍼 (순수 함수)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('userMetaDexieToSupabase — 4 rows → 1 row 합산', async () => {
    const { userMetaDexieToSupabase } = await import('./sync.js');
    const rows = [
      { key: 'lang_en', value: { level: 'B1' } },
      { key: 'lang_ja', value: { level: 'A2' } },
      { key: 'weakPhonemes_en', value: { 'ɹ': 5 } },
      { key: 'weakPhonemes_ja', value: { ら: 3 } },
    ];
    const result = userMetaDexieToSupabase(rows, 'user-1');
    expect(result).toEqual({
      user_id: 'user-1',
      lang_en: { level: 'B1' },
      lang_ja: { level: 'A2' },
      weak_phonemes_en: { 'ɹ': 5 },
      weak_phonemes_ja: { ら: 3 },
    });
  });

  it('userMetaDexieToSupabase — 일부 누락 → null fallback', async () => {
    const { userMetaDexieToSupabase } = await import('./sync.js');
    const rows = [
      { key: 'lang_en', value: { level: 'B1' } },
      { key: 'weakPhonemes_en', value: { 'ɹ': 5 } },
    ];
    const result = userMetaDexieToSupabase(rows, 'user-1');
    expect(result.user_id).toBe('user-1');
    expect(result.lang_en).toEqual({ level: 'B1' });
    expect(result.lang_ja).toBeNull();
    expect(result.weak_phonemes_en).toEqual({ 'ɹ': 5 });
    expect(result.weak_phonemes_ja).toBeNull();
  });

  it('userMetaDexieToSupabase — 다른 keys 무시 (studySettings 등)', async () => {
    const { userMetaDexieToSupabase } = await import('./sync.js');
    const rows = [
      { key: 'studySettings', value: { dailyNewCount: 10 } },
      { key: 'activeSession', value: { snapshot: '...' } },
      { key: 'lang_en', value: { level: 'B1' } },
    ];
    const result = userMetaDexieToSupabase(rows, 'user-1');
    expect(result).toEqual({
      user_id: 'user-1',
      lang_en: { level: 'B1' },
      lang_ja: null,
      weak_phonemes_en: null,
      weak_phonemes_ja: null,
    });
  });

  it('userMetaDexieToSupabase — userId null → null', async () => {
    const { userMetaDexieToSupabase } = await import('./sync.js');
    expect(userMetaDexieToSupabase([], null)).toBeNull();
  });

  it('userMetaSupabaseToDexie — 4 컬럼 → 4 rows', async () => {
    const { userMetaSupabaseToDexie } = await import('./sync.js');
    const supRow = {
      user_id: 'user-1',
      lang_en: { level: 'B1' },
      lang_ja: { level: 'A2' },
      weak_phonemes_en: { 'ɹ': 5 },
      weak_phonemes_ja: { ら: 3 },
    };
    const rows = userMetaSupabaseToDexie(supRow);
    expect(rows.length).toBe(4);
    const map = new Map(rows.map((r) => [r.key, r.value]));
    expect(map.get('lang_en')).toEqual({ level: 'B1' });
    expect(map.get('lang_ja')).toEqual({ level: 'A2' });
    expect(map.get('weakPhonemes_en')).toEqual({ 'ɹ': 5 });
    expect(map.get('weakPhonemes_ja')).toEqual({ ら: 3 });
    for (const r of rows) {
      expect(typeof r.at).toBe('number');
    }
  });

  it('userMetaSupabaseToDexie — null 컬럼 → row 안 만듦', async () => {
    const { userMetaSupabaseToDexie } = await import('./sync.js');
    const supRow = {
      user_id: 'user-1',
      lang_en: { level: 'B1' },
      lang_ja: null,
      weak_phonemes_en: null,
      weak_phonemes_ja: null,
    };
    const rows = userMetaSupabaseToDexie(supRow);
    expect(rows.length).toBe(1);
    expect(rows[0].key).toBe('lang_en');
  });

  it('userMetaSupabaseToDexie — row null → []', async () => {
    const { userMetaSupabaseToDexie } = await import('./sync.js');
    expect(userMetaSupabaseToDexie(null)).toEqual([]);
  });
});

describe('sync — Wave 11.13.x pullUserMeta / pushUserMeta 통합', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('pullUserMeta — eq + data[0] (Wave 11.15) → 4 컬럼 → 4 dexie rows bulkPut', async () => {
    // Wave 11.15: .maybeSingle() 제거 → 일반 eq 결과 배열의 [0] 사용
    const fromMock = vi.fn(() => {
      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn().mockResolvedValue({
          data: [
            {
              user_id: 'u',
              lang_en: { level: 'B1' },
              lang_ja: { level: 'A2' },
              weak_phonemes_en: { 'ɹ': 5 },
              weak_phonemes_ja: { ら: 3 },
            },
          ],
          error: null,
        }),
      };
      return builder;
    });
    vi.doMock('../services/supabase.js', () => ({
      supabase: { from: fromMock },
      isSupabaseConfigured: true,
    }));
    const { pullUserMeta } = await import('./sync.js');
    const bulkPutSpy = vi.fn().mockResolvedValue();
    const db = { meta: { bulkPut: bulkPutSpy } };
    const result = await pullUserMeta(db, 'user-1');
    expect(result.status).toBe('ok');
    expect(result.count).toBe(4);
    expect(bulkPutSpy).toHaveBeenCalledTimes(1);
    const putArg = bulkPutSpy.mock.calls[0][0];
    expect(putArg.length).toBe(4);
    expect(fromMock).toHaveBeenCalledWith('study_user_meta');
  });

  it('pullUserMeta — data 빈 배열 → status=empty (Wave 11.15, 서버 row 없음)', async () => {
    const fromMock = vi.fn(() => {
      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn().mockResolvedValue({ data: [], error: null }),
      };
      return builder;
    });
    vi.doMock('../services/supabase.js', () => ({
      supabase: { from: fromMock },
      isSupabaseConfigured: true,
    }));
    const { pullUserMeta } = await import('./sync.js');
    const db = { meta: { bulkPut: vi.fn() } };
    const result = await pullUserMeta(db, 'user-1');
    expect(result.status).toBe('empty');
    expect(result.count).toBe(0);
  });

  it('pushUserMeta — bulkGet 4 keys → 합산 → upsert(onConflict=user_id)', async () => {
    const upsertCalls = [];
    const fromMock = vi.fn(() => ({
      upsert: vi.fn((rows, opts) => {
        upsertCalls.push({ rows, opts });
        return Promise.resolve({ error: null });
      }),
    }));
    vi.doMock('../services/supabase.js', () => ({
      supabase: { from: fromMock },
      isSupabaseConfigured: true,
    }));
    const { pushUserMeta } = await import('./sync.js');
    const bulkGetSpy = vi.fn().mockResolvedValue([
      { key: 'lang_en', value: { level: 'B1' } },
      undefined, // lang_ja 없음
      { key: 'weakPhonemes_en', value: { 'ɹ': 5 } },
      undefined, // weakPhonemes_ja 없음
    ]);
    const db = { meta: { bulkGet: bulkGetSpy } };
    const result = await pushUserMeta(db, 'user-1');
    expect(result.status).toBe('ok');
    expect(result.count).toBe(2);
    expect(bulkGetSpy).toHaveBeenCalledWith([
      'lang_en',
      'lang_ja',
      'weakPhonemes_en',
      'weakPhonemes_ja',
    ]);
    expect(fromMock).toHaveBeenCalledWith('study_user_meta');
    expect(upsertCalls.length).toBe(1);
    expect(upsertCalls[0].opts).toEqual({ onConflict: 'user_id' });
    expect(upsertCalls[0].rows[0]).toEqual({
      user_id: 'user-1',
      lang_en: { level: 'B1' },
      lang_ja: null,
      weak_phonemes_en: { 'ɹ': 5 },
      weak_phonemes_ja: null,
    });
  });

  it('pushUserMeta — 4 keys 모두 없음 → status=empty (push skip)', async () => {
    const fromMock = vi.fn(() => ({ upsert: vi.fn() }));
    vi.doMock('../services/supabase.js', () => ({
      supabase: { from: fromMock },
      isSupabaseConfigured: true,
    }));
    const { pushUserMeta } = await import('./sync.js');
    const bulkGetSpy = vi.fn().mockResolvedValue([undefined, undefined, undefined, undefined]);
    const db = { meta: { bulkGet: bulkGetSpy } };
    const result = await pushUserMeta(db, 'user-1');
    expect(result.status).toBe('empty');
    expect(fromMock).not.toHaveBeenCalled(); // upsert 안 호출
  });
});

describe('sync — Wave 11.13.x pullAll 확장 (4 + dailyStats + user_meta)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('pullAll — 6 results (4 테이블 + dailyStats + user_meta), _serverCounts 마킹', async () => {
    // Wave 11.15 — 모든 테이블 .eq + 빈 배열 패턴 (user_meta 도 .maybeSingle 대신 [0] 사용)
    const fromMock = vi.fn(() => {
      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn().mockResolvedValue({ data: [], error: null }),
      };
      return builder;
    });
    vi.doMock('../services/supabase.js', () => ({
      supabase: { from: fromMock },
      isSupabaseConfigured: true,
    }));
    const { pullAll } = await import('./sync.js');
    const db = {
      reviewQueue: { bulkPut: vi.fn(), bulkGet: vi.fn() },
      todayLessons: { bulkPut: vi.fn() },
      sessionLogs: { bulkPut: vi.fn() },
      pronunciationLog: { bulkPut: vi.fn() },
      dailyStats: { bulkPut: vi.fn() },
      meta: { bulkPut: vi.fn() },
    };
    const result = await pullAll(db, 'user-1');
    // 9 results (6 테이블 + dailyStats + user_meta + pr_records)
    expect(result.results.length).toBe(9);
    expect(result.failed).toBe(0);
    const tables = result.results.map((r) => r.table).sort();
    expect(tables).toEqual(
      ['dailyStats', 'mathProblems', 'mathQueue', 'meta', 'prRecords', 'pronunciationLog', 'reviewQueue', 'sessionLogs', 'todayLessons'],
    );
  });
});

// ============================================================
// Wave 11.68-a — pr_records 매퍼 + pullPrRecords/pushPrRecords (user_meta 패턴 답습)
// ============================================================
describe('sync — Wave 11.68-a pr_records 매퍼', () => {
  it('PR_RECORDS_KEY_MAP — 5 keys (daily*/weekly*/history)', async () => {
    const { PR_RECORDS_KEY_MAP } = await import('./sync.js');
    expect(PR_RECORDS_KEY_MAP.length).toBe(5);
    const dexieKeys = PR_RECORDS_KEY_MAP.map((m) => m.dexieKey);
    expect(dexieKeys).toEqual([
      'prDailyUtterance',
      'prDailyStudyTime',
      'prWeeklyUtterance',
      'prWeeklyPass',
      'prHistory',
    ]);
    const supabaseCols = PR_RECORDS_KEY_MAP.map((m) => m.supabaseCol);
    expect(supabaseCols).toEqual([
      'daily_utterance',
      'daily_study_time',
      'weekly_utterance',
      'weekly_pass',
      'history',
    ]);
  });

  it('prRecordsDexieToSupabase — 5 rows → 1 row, user_id 주입', async () => {
    const { prRecordsDexieToSupabase } = await import('./sync.js');
    const rows = [
      { key: 'prDailyUtterance', value: { value: 50, achieved_at: '2026-05-01', lang: 'en' } },
      { key: 'prHistory', value: [{ type: 'daily_utterance', value: 30, achieved_at: '2026-04-01', lang: 'en' }] },
    ];
    const out = prRecordsDexieToSupabase(rows, 'user-1');
    expect(out.user_id).toBe('user-1');
    expect(out.daily_utterance).toEqual({ value: 50, achieved_at: '2026-05-01', lang: 'en' });
    expect(out.history.length).toBe(1);
    // 누락된 keys 는 null
    expect(out.daily_study_time).toBeNull();
    expect(out.weekly_utterance).toBeNull();
    expect(out.weekly_pass).toBeNull();
  });

  it('prRecordsDexieToSupabase — userId 없으면 null', async () => {
    const { prRecordsDexieToSupabase } = await import('./sync.js');
    expect(prRecordsDexieToSupabase([], null)).toBeNull();
    expect(prRecordsDexieToSupabase([], '')).toBeNull();
  });

  it('prRecordsSupabaseToDexie — 1 row → N Dexie rows (null 제외)', async () => {
    const { prRecordsSupabaseToDexie } = await import('./sync.js');
    const row = {
      user_id: 'user-1',
      daily_utterance: { value: 50, achieved_at: '2026-05-01', lang: 'en' },
      daily_study_time: null,
      weekly_utterance: { value: 200, week_start: '2026-04-27', lang: 'en' },
      weekly_pass: null,
      history: [],
    };
    const out = prRecordsSupabaseToDexie(row);
    expect(out.length).toBe(3); // null 2개 제외
    const keys = out.map((r) => r.key);
    expect(keys).toEqual(['prDailyUtterance', 'prWeeklyUtterance', 'prHistory']);
    expect(out[0].value).toEqual({ value: 50, achieved_at: '2026-05-01', lang: 'en' });
    expect(out.every((r) => typeof r.at === 'number')).toBe(true);
  });

  it('prRecordsSupabaseToDexie — null row → 빈 배열', async () => {
    const { prRecordsSupabaseToDexie } = await import('./sync.js');
    expect(prRecordsSupabaseToDexie(null)).toEqual([]);
  });
});

// ============================================================
// Wave 11.20 — 단순 4 테이블 camelCase ↔ snake_case 변환 함수 단위
// dailyStats/userMeta 의 Wave 11.13.x 케이스 패턴 답습.
// ============================================================
describe('sync — Wave 11.20 reviewQueue 변환', () => {
  it('reviewQueueDexieToSupabase — 정상 row', async () => {
    const { reviewQueueDexieToSupabase } = await import('./sync.js');
    expect(
      reviewQueueDexieToSupabase(
        {
          id: 'r1',
          lang: 'en',
          sentence: 'Hi',
          meaning: '안녕',
          reading: null,
          explanation: { foo: 'bar' },
          interval: 2,
          nextReview: '2026-05-01',
          consecutivePass: 1,
          lastResult: 'O',
          category: 'session',
        },
        'u1',
      ),
    ).toEqual({
      id: 'r1',
      user_id: 'u1',
      lang: 'en',
      sentence: 'Hi',
      meaning: '안녕',
      reading: null,
      explanation: { foo: 'bar' },
      interval: 2,
      next_review: '2026-05-01',
      consecutive_pass: 1,
      last_result: 'O',
      category: 'session',
      speaker: null,
    });
  });

  it('reviewQueueDexieToSupabase — null row → null', async () => {
    const { reviewQueueDexieToSupabase } = await import('./sync.js');
    expect(reviewQueueDexieToSupabase(null, 'u1')).toBe(null);
  });

  it('reviewQueueDexieToSupabase — userId null → null', async () => {
    const { reviewQueueDexieToSupabase } = await import('./sync.js');
    expect(reviewQueueDexieToSupabase({ id: 'r1' }, null)).toBe(null);
  });

  it('reviewQueueDexieToSupabase — 누락 필드 default fallback', async () => {
    const { reviewQueueDexieToSupabase } = await import('./sync.js');
    const out = reviewQueueDexieToSupabase({ id: 'r1', lang: 'en', sentence: 'a', meaning: 'b' }, 'u1');
    expect(out.interval).toBe(1);
    expect(out.consecutive_pass).toBe(0);
    expect(out.last_result).toBe(null);
    expect(out.category).toBe(null);
    expect(out.reading).toBe(null);
    expect(out.explanation).toBe(null);
  });

  it('reviewQueueSupabaseToDexie — 정상 row', async () => {
    const { reviewQueueSupabaseToDexie } = await import('./sync.js');
    expect(
      reviewQueueSupabaseToDexie({
        id: 'r1',
        user_id: 'u1',
        lang: 'en',
        sentence: 'Hi',
        meaning: '안녕',
        reading: null,
        explanation: { foo: 'bar' },
        interval: 2,
        next_review: '2026-05-01',
        consecutive_pass: 1,
        last_result: 'O',
        category: 'session',
        created_at: '2026-04-15T00:00:00Z',
        updated_at: '2026-04-15T00:00:00Z',
      }),
    ).toEqual({
      id: 'r1',
      lang: 'en',
      sentence: 'Hi',
      meaning: '안녕',
      reading: null,
      explanation: { foo: 'bar' },
      interval: 2,
      nextReview: '2026-05-01',
      consecutivePass: 1,
      lastResult: 'O',
      category: 'session',
      speaker: null,
      createdAt: '2026-04-15T00:00:00Z',
      updatedAt: '2026-04-15T00:00:00Z',
    });
  });

  it('reviewQueueSupabaseToDexie — null row → null', async () => {
    const { reviewQueueSupabaseToDexie } = await import('./sync.js');
    expect(reviewQueueSupabaseToDexie(null)).toBe(null);
  });
});

describe('sync — Wave 11.20 todayLessons 변환', () => {
  it('todayLessonsDexieToSupabase — 정상 + completedAt 무시 (SQL 컬럼 부재)', async () => {
    const { todayLessonsDexieToSupabase } = await import('./sync.js');
    const out = todayLessonsDexieToSupabase(
      {
        id: 'l1',
        lang: 'en',
        date: '2026-04-15',
        sentence: 'Hi',
        meaning: '안녕',
        reading: null,
        explanation: { foo: 'bar' },
        phoneticKr: null,
        audioUrl: null,
        completed: true,
        completedAt: '2026-04-15T10:00:00Z', // SQL 컬럼 부재 → 무시
        orderIndex: 3,
      },
      'u1',
    );
    expect(out).toEqual({
      id: 'l1',
      user_id: 'u1',
      lang: 'en',
      date: '2026-04-15',
      sentence: 'Hi',
      meaning: '안녕',
      reading: null,
      explanation: { foo: 'bar' },
      phonetic_kr: null,
      audio_url: null,
      completed: true,
      order_index: 3,
      speaker: null,
    });
    expect(out.completed_at).toBeUndefined(); // SQL 컬럼 부재 검증
  });

  it('todayLessonsDexieToSupabase — null/userId null', async () => {
    const { todayLessonsDexieToSupabase } = await import('./sync.js');
    expect(todayLessonsDexieToSupabase(null, 'u1')).toBe(null);
    expect(todayLessonsDexieToSupabase({ id: 'l1' }, null)).toBe(null);
  });

  it('todayLessonsDexieToSupabase — 누락 default', async () => {
    const { todayLessonsDexieToSupabase } = await import('./sync.js');
    const out = todayLessonsDexieToSupabase({ id: 'l1', lang: 'en', date: '2026-04-15', sentence: 'a', meaning: 'b' }, 'u1');
    expect(out.completed).toBe(false);
    expect(out.explanation).toEqual({});
  });

  it('todayLessonsSupabaseToDexie — 정상 row', async () => {
    const { todayLessonsSupabaseToDexie } = await import('./sync.js');
    expect(
      todayLessonsSupabaseToDexie({
        id: 'l1',
        user_id: 'u1',
        lang: 'en',
        date: '2026-04-15',
        sentence: 'Hi',
        meaning: '안녕',
        reading: null,
        explanation: { foo: 'bar' },
        phonetic_kr: 'pkr',
        audio_url: 'aurl',
        completed: false,
        order_index: 0,
        created_at: '2026-04-15T00:00:00Z',
      }),
    ).toEqual({
      id: 'l1',
      lang: 'en',
      date: '2026-04-15',
      sentence: 'Hi',
      meaning: '안녕',
      reading: null,
      explanation: { foo: 'bar' },
      phonetic_kr: 'pkr',
      audioUrl: 'aurl',
      completed: false,
      order_index: 0,
      speaker: null,
      createdAt: '2026-04-15T00:00:00Z',
    });
  });

  it('todayLessonsSupabaseToDexie — speaker 필드 보존 (라쿤/빅맨)', async () => {
    const { todayLessonsSupabaseToDexie } = await import('./sync.js');
    expect(todayLessonsSupabaseToDexie({ id: 'l-rac', sentence: 'X', meaning: 'Y', explanation: {}, speaker: '라쿤' }).speaker).toBe('라쿤');
    expect(todayLessonsSupabaseToDexie({ id: 'l-big', sentence: 'X', meaning: 'Y', explanation: {}, speaker: '빅맨' }).speaker).toBe('빅맨');
  });

  it('todayLessonsSupabaseToDexie — root speaker 없으면 explanation.speaker fallback', async () => {
    const { todayLessonsSupabaseToDexie } = await import('./sync.js');
    // 기존 카드: root speaker 컬럼이 없는 채로 sync 되어 있음 → explanation jsonb 안의 speaker 사용
    const out = todayLessonsSupabaseToDexie({ id: 'l1', sentence: 'X', meaning: 'Y', explanation: { speaker: '라쿤', key: 'k' } });
    expect(out.speaker).toBe('라쿤');
    // root 우선 (둘 다 있으면 root)
    const out2 = todayLessonsSupabaseToDexie({ id: 'l1', sentence: 'X', meaning: 'Y', explanation: { speaker: '빅맨' }, speaker: '라쿤' });
    expect(out2.speaker).toBe('라쿤');
  });
});

describe('sync — Wave 11.20 sessionLogs 변환', () => {
  it('sessionLogsDexieToSupabase — 정상 + sentence_ids 배열', async () => {
    const { sessionLogsDexieToSupabase } = await import('./sync.js');
    expect(
      sessionLogsDexieToSupabase(
        {
          id: 's1',
          lang: 'en',
          date: '2026-04-15',
          category: 'session',
          durationSec: 600,
          newCount: 3,
          reviewResults: { O: 5, '△': 2, X: 1 },
          utteranceCount: 8,
          passCount: 7,
          sentenceIds: ['a', 'b', 'c'],
          sessionType: 'normal',
        },
        'u1',
      ),
    ).toEqual({
      id: 's1',
      user_id: 'u1',
      lang: 'en',
      date: '2026-04-15',
      category: 'session',
      duration_sec: 600,
      new_count: 3,
      review_results: { O: 5, '△': 2, X: 1 },
      utterance_count: 8,
      pass_count: 7,
      sentence_ids: ['a', 'b', 'c'],
      new_sentence_ids: null,
      session_type: 'normal',
    });
  });

  it('sessionLogsDexieToSupabase — sentenceIds 비배열 → null', async () => {
    const { sessionLogsDexieToSupabase } = await import('./sync.js');
    const out = sessionLogsDexieToSupabase(
      { id: 's1', lang: 'en', date: '2026-04-15', sentenceIds: 'not_array' },
      'u1',
    );
    expect(out.sentence_ids).toBe(null);
  });

  it('sessionLogsSupabaseToDexie — 정상 round-trip', async () => {
    const { sessionLogsDexieToSupabase, sessionLogsSupabaseToDexie } = await import('./sync.js');
    const dexieRow = {
      id: 's1',
      lang: 'en',
      date: '2026-04-15',
      category: 'session',
      durationSec: 600,
      newCount: 3,
      reviewResults: { O: 5 },
      utteranceCount: 8,
      passCount: 7,
      sentenceIds: ['a', 'b'],
      sessionType: 'normal',
    };
    const supabaseRow = sessionLogsDexieToSupabase(dexieRow, 'u1');
    const back = sessionLogsSupabaseToDexie(supabaseRow);
    // Round-trip 핵심 필드 보존 (createdAt 은 Supabase only, 무시).
    for (const k of ['id', 'lang', 'date', 'category', 'durationSec', 'newCount', 'reviewResults', 'utteranceCount', 'passCount', 'sentenceIds', 'sessionType']) {
      expect(back[k]).toEqual(dexieRow[k]);
    }
  });
});

describe('sync — Wave 11.20 pronunciationLog 변환', () => {
  it('pronunciationLogDexieToSupabase — 정상', async () => {
    const { pronunciationLogDexieToSupabase } = await import('./sync.js');
    expect(
      pronunciationLogDexieToSupabase(
        {
          id: 'p1',
          lang: 'en',
          sentenceId: 's1',
          date: '2026-04-15',
          overallScore: 85,
          phonemeScores: [{ symbol: 'a', score: 90 }],
          weakPhonemes: ['r'],
          recognizedText: 'hello',
        },
        'u1',
      ),
    ).toEqual({
      id: 'p1',
      user_id: 'u1',
      lang: 'en',
      sentence_id: 's1',
      date: '2026-04-15',
      overall_score: 85,
      pron_score: null,
      fluency_score: null,
      completeness_score: null,
      prosody_score: null,
      capture_rms: null,
      phoneme_scores: [{ symbol: 'a', score: 90 }],
      weak_phonemes: ['r'],
      recognized_text: 'hello',
      timing: null, // 0008 (2026-09-03) 채점 지연 계측
    });
  });

  it('pronunciationLogSupabaseToDexie — 정상', async () => {
    const { pronunciationLogSupabaseToDexie } = await import('./sync.js');
    expect(
      pronunciationLogSupabaseToDexie({
        id: 'p1',
        user_id: 'u1',
        lang: 'en',
        sentence_id: 's1',
        date: '2026-04-15',
        overall_score: 85,
        phoneme_scores: [{ symbol: 'a', score: 90 }],
        weak_phonemes: ['r'],
        recognized_text: 'hello',
        created_at: '2026-04-15T00:00:00Z',
      }),
    ).toEqual({
      id: 'p1',
      lang: 'en',
      sentenceId: 's1',
      date: '2026-04-15',
      overallScore: 85,
      pronScore: null,
      fluencyScore: null,
      completenessScore: null,
      prosodyScore: null,
      captureRms: null,
      phonemeScores: [{ symbol: 'a', score: 90 }],
      weakPhonemes: ['r'],
      recognizedText: 'hello',
      timing: null, // 0008 (2026-09-03) 채점 지연 계측
      createdAt: '2026-04-15T00:00:00Z',
    });
  });
});

describe('sync — Wave 11.20 TABLE_MAP 인터페이스', () => {
  it('TABLE_MAP 6 entry 모두 toSupabase + toDexie 보유', async () => {
    const { TABLE_MAP } = await import('./sync.js');
    expect(TABLE_MAP.length).toBe(6);
    for (const m of TABLE_MAP) {
      expect(typeof m.toSupabase).toBe('function');
      expect(typeof m.toDexie).toBe('function');
    }
  });

  it('Sync namespace 에서 신규 변환 함수 8종 노출', async () => {
    const { Sync } = await import('./sync.js');
    expect(typeof Sync.reviewQueueDexieToSupabase).toBe('function');
    expect(typeof Sync.reviewQueueSupabaseToDexie).toBe('function');
    expect(typeof Sync.todayLessonsDexieToSupabase).toBe('function');
    expect(typeof Sync.todayLessonsSupabaseToDexie).toBe('function');
    expect(typeof Sync.sessionLogsDexieToSupabase).toBe('function');
    expect(typeof Sync.sessionLogsSupabaseToDexie).toBe('function');
    expect(typeof Sync.pronunciationLogDexieToSupabase).toBe('function');
    expect(typeof Sync.pronunciationLogSupabaseToDexie).toBe('function');
  });
});

describe('sync — todayLessons 변환 ↔ UI 필드 정합 (2026-06-10 실기기 발음 공란·정렬 깨짐 픽스)', () => {
  // pull 산출 row 는 UI 리더와 같은 키를 가져야 한다:
  //  - pickCardFields → card.phonetic_kr (cardLoader.js)
  //  - loadNewCards/home 세션 타이틀 정렬 → row.order_index
  const serverRow = {
    id: 'en-x-1', user_id: 'u', lang: 'en', date: '2026-06-10',
    sentence: 'Fire away.', meaning: '얼마든지요.', reading: null,
    explanation: { key: 'k' }, phonetic_kr: '파이어 어웨이', audio_url: null,
    completed: false, order_index: 3, speaker: null, created_at: '2026-06-10T00:00:00Z',
  };

  it('toDexie: phonetic_kr / order_index 를 snake_case 그대로 보존', async () => {
    const { todayLessonsSupabaseToDexie } = await import('./sync.js');
    const row = todayLessonsSupabaseToDexie(serverRow);
    expect(row.phonetic_kr).toBe('파이어 어웨이');
    expect(row.order_index).toBe(3);
  });

  it('toDexie → pickCardFields round-trip: pron 비공란', async () => {
    const { todayLessonsSupabaseToDexie } = await import('./sync.js');
    const { pickCardFields } = await import('../pages/cardLoader.js');
    const out = pickCardFields(todayLessonsSupabaseToDexie(serverRow));
    expect(out.pron).toBe('파이어 어웨이');
  });

  it('toSupabase: snake_case 우선 + 레거시 camelCase 행 폴백', async () => {
    const { todayLessonsDexieToSupabase } = await import('./sync.js');
    const snake = todayLessonsDexieToSupabase(
      { id: 'a', lang: 'en', date: '2026-06-10', phonetic_kr: '가', order_index: 1 }, 'u');
    expect(snake.phonetic_kr).toBe('가');
    expect(snake.order_index).toBe(1);
    // 기수정 전 pull 이 만든 camelCase 행 (기기 잔존) 도 push 시 값 유실 금지
    const legacy = todayLessonsDexieToSupabase(
      { id: 'b', lang: 'en', date: '2026-06-10', phoneticKr: '나', orderIndex: 2 }, 'u');
    expect(legacy.phonetic_kr).toBe('나');
    expect(legacy.order_index).toBe(2);
  });
});

/**
 * reconcileDailyStats — 서버에 없는 로컬 dailyStats 행만 재push (큐 유실/과거 push 실패 회복).
 * 덮어쓰기 위험 0: 서버에 같은 id 가 있는 행은 절대 push 안 함(missing-only).
 */
function makeReconcileMock(serverIdRows) {
  const upsertCalls = [];
  const fromMock = vi.fn(() => {
    const builder = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      upsert: vi.fn((rows, opts) => { upsertCalls.push({ rows, opts }); return Promise.resolve({ error: null }); }),
      then: (res, rej) => Promise.resolve({ data: serverIdRows, error: null }).then(res, rej),
    };
    return builder;
  });
  return { fromMock, upsertCalls };
}

describe('sync — reconcileDailyStats (서버 누락 로컬 행만 재push)', () => {
  beforeEach(() => { vi.resetModules(); vi.unmock('../services/supabase.js'); });

  const localRows = [
    { date: '2026-06-13', lang: 'en', utteranceCount: 18, studyTimeSec: 3200, newSentences: 0, reviewCount: 0 },
    { date: '2026-06-19', lang: 'en', utteranceCount: 64, studyTimeSec: 25728, newSentences: 0, reviewCount: 0 },
  ];
  function dbWith(rows) {
    return {
      dailyStats: {
        toArray: vi.fn().mockResolvedValue(rows),
        bulkGet: vi.fn((dates) => Promise.resolve(dates.map((d) => rows.find((r) => r.date === d)).filter(Boolean))),
      },
    };
  }

  it('서버에 없는 로컬 행(6/19)만 push — 서버에 있는 행(6/13)은 건드리지 않음', async () => {
    const { fromMock, upsertCalls } = makeReconcileMock([{ id: '2026-06-13_en_user-1' }]); // 서버엔 6/13 만
    vi.doMock('../services/supabase.js', () => ({ supabase: { from: fromMock }, isSupabaseConfigured: true }));
    const { reconcileDailyStats } = await import('./sync.js');
    const r = await reconcileDailyStats(dbWith(localRows), 'user-1');
    expect(r.status).toBe('ok');
    expect(r.missing).toBe(1);
    expect(r.pushed).toBe(1);
    expect(upsertCalls.length).toBe(1);
    expect(upsertCalls[0].rows.map((x) => x.id)).toEqual(['2026-06-19_en_user-1']); // 6/19 만, 6/13 제외
  });

  it('로컬이 모두 서버에 있으면 push 없음', async () => {
    const { fromMock, upsertCalls } = makeReconcileMock([
      { id: '2026-06-13_en_user-1' }, { id: '2026-06-19_en_user-1' },
    ]);
    vi.doMock('../services/supabase.js', () => ({ supabase: { from: fromMock }, isSupabaseConfigured: true }));
    const { reconcileDailyStats } = await import('./sync.js');
    const r = await reconcileDailyStats(dbWith(localRows), 'user-1');
    expect(r.status).toBe('ok');
    expect(r.pushed).toBe(0);
    expect(upsertCalls.length).toBe(0);
  });

  it('supabase=null → skipped (가드)', async () => {
    vi.doMock('../services/supabase.js', () => ({ supabase: null, isSupabaseConfigured: false }));
    const { reconcileDailyStats } = await import('./sync.js');
    const r = await reconcileDailyStats(dbWith(localRows), 'user-1');
    expect(r.status).toBe('skipped');
  });
});

describe('sync — reconcileTable (서버-빈 테이블 멀티기기 동기화 보강)', () => {
  beforeEach(() => { vi.resetModules(); vi.unmock('../services/supabase.js'); });

  const mapping = {
    dexie: 'sessionLogs', supabase: 'study_session_logs',
    toSupabase: (r, uid) => ({ id: r.id, user_id: uid, utterance_count: r.utteranceCount }),
  };
  const dbWith = (rows) => ({ sessionLogs: { toArray: vi.fn().mockResolvedValue(rows) } });

  it('서버-빈 테이블 + 로컬 행 → 전체 upsert (급감 가드 우회 = iPad/타기기 0 버그 회복)', async () => {
    const { fromMock, upsertCalls } = makeReconcileMock([]); // 서버 0행
    vi.doMock('../services/supabase.js', () => ({ supabase: { from: fromMock }, isSupabaseConfigured: true }));
    const { reconcileTable } = await import('./sync.js');
    const r = await reconcileTable(dbWith([{ id: 'sl1', utteranceCount: 45 }, { id: 'sl2', utteranceCount: 12 }]), 'u1', mapping);
    expect(r.status).toBe('ok');
    expect(r.pushed).toBe(2);
    expect(upsertCalls.length).toBe(1);
    expect(upsertCalls[0].opts).toEqual({ onConflict: 'id' });
    expect(upsertCalls[0].rows.map((x) => x.id)).toEqual(['sl1', 'sl2']);
    expect(upsertCalls[0].rows[0]).toEqual({ id: 'sl1', user_id: 'u1', utterance_count: 45 });
  });

  it('서버에 있는 id 는 제외, 누락분만 upsert (삭제 부활·덮어쓰기 없음)', async () => {
    const { fromMock, upsertCalls } = makeReconcileMock([{ id: 'sl1' }]); // 서버엔 sl1 만
    vi.doMock('../services/supabase.js', () => ({ supabase: { from: fromMock }, isSupabaseConfigured: true }));
    const { reconcileTable } = await import('./sync.js');
    const r = await reconcileTable(dbWith([{ id: 'sl1', utteranceCount: 45 }, { id: 'sl2', utteranceCount: 12 }]), 'u1', mapping);
    expect(r.pushed).toBe(1);
    expect(upsertCalls[0].rows.map((x) => x.id)).toEqual(['sl2']);
  });

  it('로컬 전부 서버에 있으면 upsert 없음', async () => {
    const { fromMock, upsertCalls } = makeReconcileMock([{ id: 'sl1' }, { id: 'sl2' }]);
    vi.doMock('../services/supabase.js', () => ({ supabase: { from: fromMock }, isSupabaseConfigured: true }));
    const { reconcileTable } = await import('./sync.js');
    const r = await reconcileTable(dbWith([{ id: 'sl1' }, { id: 'sl2' }]), 'u1', mapping);
    expect(r.pushed).toBe(0);
    expect(upsertCalls.length).toBe(0);
  });

  it('로컬 비어있으면 empty (upsert 없음)', async () => {
    const { fromMock, upsertCalls } = makeReconcileMock([]);
    vi.doMock('../services/supabase.js', () => ({ supabase: { from: fromMock }, isSupabaseConfigured: true }));
    const { reconcileTable } = await import('./sync.js');
    const r = await reconcileTable(dbWith([]), 'u1', mapping);
    expect(r.status).toBe('empty');
    expect(upsertCalls.length).toBe(0);
  });

  it('supabase=null → skipped', async () => {
    vi.doMock('../services/supabase.js', () => ({ supabase: null, isSupabaseConfigured: false }));
    const { reconcileTable } = await import('./sync.js');
    expect((await reconcileTable(dbWith([{ id: 'x' }]), 'u1', mapping)).status).toBe('skipped');
  });
});

describe('sync — pullTable 서버 삭제 전파 통합 (serverOwned + 페이지네이션 가드)', () => {
  beforeEach(() => { vi.resetModules(); vi.unmock('../services/supabase.js'); });

  function pullFromMock(data) {
    return vi.fn(() => {
      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        then: (res, rej) => Promise.resolve({ data, error: null }).then(res, rej),
      };
      return builder;
    });
  }
  function ownedStore(localIds) {
    const store = {
      bulkPut: vi.fn(),
      bulkGet: vi.fn().mockResolvedValue([]),
      toCollection: () => ({ primaryKeys: () => Promise.resolve(localIds) }),
      bulkDelete: vi.fn(async () => {}),
    };
    return store;
  }

  it('serverOwned: 서버에 없는 로컬 유령 카드 bulkDelete', async () => {
    vi.doMock('../services/supabase.js', () => ({ supabase: { from: pullFromMock([{ id: 'a' }, { id: 'b' }]) }, isSupabaseConfigured: true }));
    const { pullTable, TABLE_MAP } = await import('./sync.js');
    const mapping = TABLE_MAP.find((m) => m.dexie === 'todayLessons');
    const store = ownedStore(['a', 'b', 'ghost']);
    const res = await pullTable(mapping, { todayLessons: store }, 'u1');
    expect(res.status).toBe('ok');
    expect(store.bulkDelete).toHaveBeenCalledWith(['ghost']);
  });

  it('서버 0행(empty) → 삭제 전파 안 함 (급감 차단)', async () => {
    vi.doMock('../services/supabase.js', () => ({ supabase: { from: pullFromMock([]) }, isSupabaseConfigured: true }));
    const { pullTable, TABLE_MAP } = await import('./sync.js');
    const mapping = TABLE_MAP.find((m) => m.dexie === 'todayLessons');
    const store = ownedStore(['a', 'b']);
    const res = await pullTable(mapping, { todayLessons: store }, 'u1');
    expect(res.status).toBe('empty');
    expect(store.bulkDelete).not.toHaveBeenCalled();
  });

  it('상한 도달 + 페이지 재조회 실패 → 부분 데이터 폴백 + 삭제 전파 보류 (1000행 밖 오삭제 방지)', async () => {
    /* 2026-08-29 계약 변경 — 상한 도달은 이제 페이지네이션으로 전량 재조회한다. 삭제 보류는
     * '상한 도달'이 아니라 '재조회 실패(complete=false)' 에서만 발동한다. 옛 시나리오(잘린
     * 채로 삭제 전파 보류)는 페이지 조회가 실패하는 경우로 남는다. */
    const full = Array.from({ length: 1000 }, (_, i) => ({ id: `s${i}` }));
    let call = 0;
    const fromMock = vi.fn(() => {
      call += 1; const mine = call;
      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn(() => (mine === 1 ? Promise.resolve({ data: full, error: null }) : builder)),
        order: vi.fn(() => builder),
        range: vi.fn(() => Promise.resolve({ data: null, error: { message: 'boom' } })), // 재조회 실패
      };
      return builder;
    });
    vi.doMock('../services/supabase.js', () => ({ supabase: { from: fromMock }, isSupabaseConfigured: true }));
    const { pullTable, TABLE_MAP } = await import('./sync.js');
    const mapping = TABLE_MAP.find((m) => m.dexie === 'todayLessons');
    const store = ownedStore(['s0', 'beyond-page-row']); // beyond-page-row = 1001번째라 페이지 밖(정상 행)
    const res = await pullTable(mapping, { todayLessons: store }, 'u1');
    expect(res.status).toBe('ok');
    expect(store.bulkDelete).not.toHaveBeenCalled();
  });

  it('상한 도달 + 페이지 재조회 성공 → 전량 확보로 삭제 전파가 정상 동작한다', async () => {
    const total = 1200;
    const rows = Array.from({ length: total }, (_, i) => ({ id: `s${String(i).padStart(5, '0')}` }));
    let call = 0;
    const fromMock = vi.fn(() => {
      call += 1; const mine = call;
      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn(() => (mine === 1 ? Promise.resolve({ data: rows.slice(0, 1000), error: null }) : builder)),
        order: vi.fn(() => builder),
        range: vi.fn((from, to) => Promise.resolve({ data: rows.slice(from, to + 1), error: null })),
      };
      return builder;
    });
    vi.doMock('../services/supabase.js', () => ({ supabase: { from: fromMock }, isSupabaseConfigured: true }));
    const { pullTable, TABLE_MAP } = await import('./sync.js');
    const mapping = TABLE_MAP.find((m) => m.dexie === 'todayLessons');
    const store = ownedStore(['s00000', 'ghost-row']); // ghost = 서버에 없는 로컬 행 → 삭제돼야
    const res = await pullTable(mapping, { todayLessons: store }, 'u1');
    expect(res.status).toBe('ok');
    expect(res.count).toBe(1200);
    expect(store.bulkDelete).toHaveBeenCalledWith(['ghost-row']);
  });

  it('non-serverOwned(reviewQueue): 삭제 전파 안 함 (미푸시 보호)', async () => {
    vi.doMock('../services/supabase.js', () => ({ supabase: { from: pullFromMock([{ id: 'a' }]) }, isSupabaseConfigured: true }));
    const { pullTable, TABLE_MAP } = await import('./sync.js');
    const mapping = TABLE_MAP.find((m) => m.dexie === 'reviewQueue');
    const store = ownedStore(['a', 'localonly']);
    store.bulkGet = vi.fn().mockResolvedValue([undefined]);
    const res = await pullTable(mapping, { reviewQueue: store }, 'u1');
    expect(res.status).toBe('ok');
    expect(store.bulkDelete).not.toHaveBeenCalled();
  });
});

/* soft-delete 1단계 (2026-07-22, 백로그 1순위 착수) — 서버 행 explanation._deleted=true 를 '삭제'로
 * 해석해 pull 시 로컬에서 지운다. pushTable 이 upsert-only 라 서버만 지우면 기기가 되살리던 결함
 * (pos-test 유령, v5→v7 버전 범프 사슬의 원인)의 전파 관문. DDL(deleted_at 컬럼) 적용 수단이 없는
 * 환경이라 JSONB 플래그 방식 — 서버측 클로버 가드(트리거)는 컬럼 도입 가능해질 때 후속. */
describe('sync — reviewQueue 톰스톤(explanation._deleted) pull 전파', () => {
  beforeEach(() => { vi.resetModules(); });

  it('톰스톤 행은 bulkPut 대신 bulkDelete — 산 행만 충돌해결·저장', async () => {
    const fromMock = vi.fn(() => {
      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn().mockResolvedValue({
          data: [
            { id: 'pos-test', lang: 'ja', sentence: 'ありがとう', next_review: '2026-05-10', explanation: { _deleted: true } },
            { id: 'live-1', lang: 'ja', sentence: 'こんにちは', next_review: '2026-07-30', explanation: {} },
          ],
          error: null,
        }),
      };
      return builder;
    });
    vi.doMock('../services/supabase.js', () => ({ supabase: { from: fromMock }, isSupabaseConfigured: true }));
    const { pullTable, TABLE_MAP } = await import('./sync.js');
    const reviewMapping = TABLE_MAP.find((m) => m.dexie === 'reviewQueue');
    const bulkPutSpy = vi.fn().mockResolvedValue();
    const bulkDeleteSpy = vi.fn().mockResolvedValue();
    const bulkGetSpy = vi.fn().mockResolvedValue([undefined]);
    const db = { reviewQueue: { bulkPut: bulkPutSpy, bulkGet: bulkGetSpy, bulkDelete: bulkDeleteSpy } };
    const result = await pullTable(reviewMapping, db, 'user-1');
    expect(result.status).toBe('ok');
    expect(bulkDeleteSpy).toHaveBeenCalledWith(['pos-test']);
    expect(bulkGetSpy).toHaveBeenCalledWith(['live-1']);            // 충돌해결은 산 행만
    expect(bulkPutSpy.mock.calls[0][0].map((r) => r.id)).toEqual(['live-1']); // 톰스톤 저장 금지
  });

  it('톰스톤이 없으면 기존 동작 그대로 (bulkDelete 미호출)', async () => {
    const fromMock = vi.fn(() => {
      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn().mockResolvedValue({
          data: [{ id: 'live-1', lang: 'en', sentence: 'Hi.', next_review: '2026-07-30', explanation: {} }],
          error: null,
        }),
      };
      return builder;
    });
    vi.doMock('../services/supabase.js', () => ({ supabase: { from: fromMock }, isSupabaseConfigured: true }));
    const { pullTable, TABLE_MAP } = await import('./sync.js');
    const reviewMapping = TABLE_MAP.find((m) => m.dexie === 'reviewQueue');
    const bulkPutSpy = vi.fn().mockResolvedValue();
    const bulkDeleteSpy = vi.fn().mockResolvedValue();
    const bulkGetSpy = vi.fn().mockResolvedValue([undefined]);
    const db = { reviewQueue: { bulkPut: bulkPutSpy, bulkGet: bulkGetSpy, bulkDelete: bulkDeleteSpy } };
    const result = await pullTable(reviewMapping, db, 'user-1');
    expect(result.status).toBe('ok');
    expect(bulkDeleteSpy).not.toHaveBeenCalled();
    expect(bulkPutSpy.mock.calls[0][0].map((r) => r.id)).toEqual(['live-1']);
  });
});

/* 2026-07-28 — 문장 모아보기의 lastResultAt(오늘 평가 가라앉힘)은 로컬 전용 필드다.
 * resolveConflict 가 행을 통째 택일하므로 서버 행이 이기면 소실됨 (push 후엔 lastResult·
 * nextReview 가 동률이라 대부분 server 승) → pull 에서 로컬 값을 이월해야 같은 날 유지가 산다. */
describe('preserveLocalOnlyFields — pull 시 로컬 전용 필드 이월', () => {
  it('서버 행이 이겨도 로컬 lastResultAt 을 이월한다', async () => {
    const { preserveLocalOnlyFields } = await import('./sync.js');
    const local = { id: 'a', lastResult: 'X', lastResultAt: '2026-07-28' };
    const chosenServer = { id: 'a', lastResult: 'X' }; // 서버 매핑엔 lastResultAt 없음
    expect(preserveLocalOnlyFields(local, chosenServer)).toMatchObject({ lastResult: 'X', lastResultAt: '2026-07-28' });
  });
  it('로컬이 이긴 행(이미 필드 보유)·로컬 부재는 그대로', async () => {
    const { preserveLocalOnlyFields } = await import('./sync.js');
    const chosenLocal = { id: 'a', lastResultAt: '2026-07-28' };
    expect(preserveLocalOnlyFields(chosenLocal, chosenLocal)).toBe(chosenLocal);
    const server = { id: 'b' };
    expect(preserveLocalOnlyFields(undefined, server)).toBe(server);
  });
});

/* 2026-08-23 실 DB 감사: study_pronunciation_log 385행 중 세부 점수 0건.
 * speech.js:1143 이 Azure 로부터 받고 pronunciationLog.js:27 이 Dexie 에 저장하는데
 * 매핑에 없어 업로드에서 통째로 버려졌다 → 기기 로컬에만 존재(교체 시 영구 소실).
 * 0007_pronunciation_log_subscores.sql 로 컬럼 추가 후 양방향 매핑한다. */
describe('sync — 발음 세부 점수(fluency/prosody 등) 동기화', () => {
  const DEXIE_SUB = {
    pronScore: 88, fluencyScore: 72, completenessScore: 100, prosodyScore: 65, captureRms: 0.031,
  };
  const SB_SUB = {
    pron_score: 88, fluency_score: 72, completeness_score: 100, prosody_score: 65, capture_rms: 0.031,
  };

  it('Dexie → Supabase — 세부 5필드를 버리지 않는다', async () => {
    const { pronunciationLogDexieToSupabase } = await import('./sync.js');
    const out = pronunciationLogDexieToSupabase(
      { id: 'p1', lang: 'en', sentenceId: 's1', date: '2026-08-21', overallScore: 74, ...DEXIE_SUB },
      'u1',
    );
    expect(out).toMatchObject(SB_SUB);
  });

  it('Supabase → Dexie — 세부 5필드 복원', async () => {
    const { pronunciationLogSupabaseToDexie } = await import('./sync.js');
    const out = pronunciationLogSupabaseToDexie(
      { id: 'p1', lang: 'en', sentence_id: 's1', date: '2026-08-21', overall_score: 74, ...SB_SUB },
    );
    expect(out).toMatchObject(DEXIE_SUB);
  });

  it('세부 점수 없는 레거시 행 → null (undefined 로 새지 않음)', async () => {
    const { pronunciationLogDexieToSupabase, pronunciationLogSupabaseToDexie } = await import('./sync.js');
    const up = pronunciationLogDexieToSupabase({ id: 'p2', lang: 'en', date: '2026-05-08' }, 'u1');
    expect(up).toMatchObject({ fluency_score: null, prosody_score: null, capture_rms: null });
    const down = pronunciationLogSupabaseToDexie({ id: 'p2', lang: 'en', date: '2026-05-08' });
    expect(down).toMatchObject({ fluencyScore: null, prosodyScore: null, captureRms: null });
  });
});

/* 2026-08-25 — D1(수학 SRS → Dexie mathQueue) 이후 발견.
 * pushTable 의 급감 가드(sync.js:577)는 '서버 0행 + 로컬 있음' 이면 push 를 영구 차단한다.
 * study_math_queue 는 실 DB 0행이라, 앱이 mathQueue 에 쓰기 시작한 순간부터 모든 push 가 막힌다.
 * 가드를 우회하는 경로는 startSync 끝의 reconcileTable 루프인데, 그 목록이
 * "mathQueue 는 앱 코드가 쓰지 않는 테이블" 이라는 (이제 거짓이 된) 주석과 함께 mathQueue 를
 * 제외하고 있었다 → 수학 진도가 Dexie 에만 남고 클라우드로 못 나간다(D1 목적 무력화).
 * 목록을 상수로 빼고, '기기가 쓰는 테이블은 전부 포함' 을 구조 불변식으로 고정한다. */
describe('sync — 급감 가드 우회 대상(DEVICE_WRITTEN_TABLES)', () => {
  it('serverOwned 가 아닌 TABLE_MAP 테이블은 전부 포함된다', async () => {
    const { TABLE_MAP, DEVICE_WRITTEN_TABLES } = await import('./sync.js');
    const deviceWritten = TABLE_MAP.filter((m) => !m.serverOwned).map((m) => m.dexie);
    expect([...DEVICE_WRITTEN_TABLES].sort()).toEqual(deviceWritten.sort());
  });

  it('mathQueue 가 포함된다 (D1 이후 앱이 쓰는 테이블)', async () => {
    const { DEVICE_WRITTEN_TABLES } = await import('./sync.js');
    expect(DEVICE_WRITTEN_TABLES).toContain('mathQueue');
  });

  it('serverOwned 테이블은 포함하지 않는다 (서버 시드 → 기기가 되밀면 안 됨)', async () => {
    const { DEVICE_WRITTEN_TABLES } = await import('./sync.js');
    expect(DEVICE_WRITTEN_TABLES).not.toContain('todayLessons');
    expect(DEVICE_WRITTEN_TABLES).not.toContain('mathProblems');
  });
});

/* REST 1000행 상한 페이지네이션 (2026-08-29 전면 재감사 확증).
 * pullTable/reconcileTable 이 무제한 .eq() 단발 조회라, 행이 PULL_PAGE_LIMIT 을 넘으면
 * (a) pull 이 잘린 부분만 적재하고 경고도 없다 (pronunciationLog 는 serverOwned 가 아니라 가드 밖)
 * (b) reconcile 이 '서버에 이미 있는' 1000행 밖 로컬 행을 기동마다 영구 재upsert 한다 (실측 재현됨).
 * 드릴 이력 적재로 pronunciationLog 증가율이 커져 도달 시점이 당겨진다 — 상한 도달 시에만
 * 정렬(.order('id'))+range 페이지네이션으로 전체를 재조회한다. */
describe('sync — pull/reconcile 페이지네이션 (PULL_PAGE_LIMIT 초과)', () => {
  beforeEach(() => { vi.resetModules(); });

  const mkRow = (i) => ({ id: `p${String(i).padStart(5, '0')}`, user_id: 'u1', lang: 'en', date: '2026-08-01', overall_score: 80, sentence_id: 'c1' });

  function pagedFromMock(total, limit) {
    // 1번째 호출: .select().eq() 가 첫 limit 행으로 resolve (상한 도달 신호)
    // 2번째~ 호출: .select().eq().order().range(from,to) 가 해당 구간으로 resolve
    let call = 0;
    const calls = { order: 0, ranges: [] };
    const rows = Array.from({ length: total }, (_, i) => mkRow(i));
    const fromMock = vi.fn(() => {
      call += 1;
      const mine = call;
      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn(() => (mine === 1
          ? Promise.resolve({ data: rows.slice(0, limit), error: null })
          : builder)),
        order: vi.fn(() => { calls.order += 1; return builder; }),
        range: vi.fn((from, to) => { calls.ranges.push([from, to]); return Promise.resolve({ data: rows.slice(from, to + 1), error: null }); }),
      };
      return builder;
    });
    return { fromMock, calls, rows };
  }

  it('pullTable — 상한 도달 시 정렬 페이지네이션으로 전체(1500행)를 적재한다', async () => {
    const { fromMock, calls } = pagedFromMock(1500, 1000);
    vi.doMock('../services/supabase.js', () => ({ supabase: { from: fromMock }, isSupabaseConfigured: true }));
    const { pullTable, TABLE_MAP } = await import('./sync.js');
    const mapping = TABLE_MAP.find((m) => m.dexie === 'pronunciationLog');
    const bulkPut = vi.fn().mockResolvedValue();
    const result = await pullTable(mapping, { pronunciationLog: { bulkPut } }, 'u1');
    expect(result.status).toBe('ok');
    expect(result.count).toBe(1500);
    expect(bulkPut.mock.calls[0][0]).toHaveLength(1500);
    expect(calls.ranges).toEqual([[0, 999], [1000, 1999]]);   // 2페이지로 전체 확보
  });

  it('pullTable — 상한 미달이면 페이지네이션 재조회를 하지 않는다 (기존 경로 불변)', async () => {
    const { fromMock, calls } = pagedFromMock(999, 1000);
    vi.doMock('../services/supabase.js', () => ({ supabase: { from: fromMock }, isSupabaseConfigured: true }));
    const { pullTable, TABLE_MAP } = await import('./sync.js');
    const mapping = TABLE_MAP.find((m) => m.dexie === 'pronunciationLog');
    const bulkPut = vi.fn().mockResolvedValue();
    const result = await pullTable(mapping, { pronunciationLog: { bulkPut } }, 'u1');
    expect(result.count).toBe(999);
    expect(calls.order).toBe(0);
    expect(fromMock).toHaveBeenCalledTimes(1);
  });

  it('reconcileTable — 서버 id 1500개를 전부 확보해 재upsert 0건 (종전엔 기동마다 500행 중복 upsert)', async () => {
    const { fromMock, rows } = pagedFromMock(1500, 1000);
    vi.doMock('../services/supabase.js', () => ({ supabase: { from: fromMock }, isSupabaseConfigured: true }));
    const { reconcileTable, TABLE_MAP } = await import('./sync.js');
    const mapping = TABLE_MAP.find((m) => m.dexie === 'pronunciationLog');
    const local = rows.map((r) => ({ id: r.id, lang: 'en', date: r.date, overallScore: 80 }));
    const r = await reconcileTable({ pronunciationLog: { toArray: async () => local } }, 'u1', mapping);
    expect(r.status).toBe('ok');
    expect(r.pushed).toBe(0);
    expect(r.missing).toBe(0);
  });
});

/* prosodyIssues 로컬 보존 (2026-08-29 검증 발견 — high).
 * prosodyIssues 는 동기화 매핑 밖(로컬 전용)인데, pull 의 bulkPut 이 행을 통째로 덮어써서
 * 매 기동(startSync→pullAll)마다 지워졌다 — 감점 단가 보정용 축적이 리셋되는 결함. */
describe('sync — pullTable 이 pronunciationLog 의 로컬 전용 필드를 보존한다', () => {
  beforeEach(() => { vi.resetModules(); });

  it('서버 행으로 덮어써도 로컬 prosodyIssues 가 남는다', async () => {
    const server = [{ id: 'p1', user_id: 'u1', lang: 'en', date: '2026-08-29', overall_score: 90, sentence_id: 'c1' }];
    const fromMock = vi.fn(() => {
      const b = { select: vi.fn(() => b), eq: vi.fn().mockResolvedValue({ data: server, error: null }) };
      return b;
    });
    vi.doMock('../services/supabase.js', () => ({ supabase: { from: fromMock }, isSupabaseConfigured: true }));
    const { pullTable, TABLE_MAP } = await import('./sync.js');
    const mapping = TABLE_MAP.find((m) => m.dexie === 'pronunciationLog');
    const issues = { monotoneWords: ['sorry'], unexpectedBreaks: [], missingBreaks: [] };
    const bulkPut = vi.fn().mockResolvedValue();
    const bulkGet = vi.fn().mockResolvedValue([{ id: 'p1', prosodyIssues: issues }]);
    const r = await pullTable(mapping, { pronunciationLog: { bulkPut, bulkGet } }, 'u1');
    expect(r.status).toBe('ok');
    expect(bulkPut.mock.calls[0][0][0].prosodyIssues).toEqual(issues);
    expect(bulkPut.mock.calls[0][0][0].overallScore).toBe(90);   // 서버 값은 서버가 정본
  });

  it('contractedRef(축약 채택 표식, 2026-09-01)도 이월된다', async () => {
    const server = [{ id: 'p1', user_id: 'u1', lang: 'en', date: '2026-09-01', overall_score: 94, sentence_id: 'c1' }];
    const fromMock = vi.fn(() => {
      const b = { select: vi.fn(() => b), eq: vi.fn().mockResolvedValue({ data: server, error: null }) };
      return b;
    });
    vi.doMock('../services/supabase.js', () => ({ supabase: { from: fromMock }, isSupabaseConfigured: true }));
    const { pullTable, TABLE_MAP } = await import('./sync.js');
    const mapping = TABLE_MAP.find((m) => m.dexie === 'pronunciationLog');
    const bulkPut = vi.fn().mockResolvedValue();
    const bulkGet = vi.fn().mockResolvedValue([{ id: 'p1', contractedRef: 'Whaddaya mean' }]);
    await pullTable(mapping, { pronunciationLog: { bulkPut, bulkGet } }, 'u1');
    expect(bulkPut.mock.calls[0][0][0].contractedRef).toBe('Whaddaya mean');
  });

  it('wordScores·omissions·insertions(감점 보정 원천, 2026-08-29 오후)도 이월된다', async () => {
    const server = [{ id: 'p1', user_id: 'u1', lang: 'en', date: '2026-08-29', overall_score: 90, sentence_id: 'c1' }];
    const fromMock = vi.fn(() => {
      const b = { select: vi.fn(() => b), eq: vi.fn().mockResolvedValue({ data: server, error: null }) };
      return b;
    });
    vi.doMock('../services/supabase.js', () => ({ supabase: { from: fromMock }, isSupabaseConfigured: true }));
    const { pullTable, TABLE_MAP } = await import('./sync.js');
    const mapping = TABLE_MAP.find((m) => m.dexie === 'pronunciationLog');
    const local = { id: 'p1', wordScores: [{ word: 'sorry', score: 88 }], omissions: [], insertions: ['again'] };
    const bulkPut = vi.fn().mockResolvedValue();
    const bulkGet = vi.fn().mockResolvedValue([local]);
    await pullTable(mapping, { pronunciationLog: { bulkPut, bulkGet } }, 'u1');
    const put = bulkPut.mock.calls[0][0][0];
    expect(put.wordScores).toEqual(local.wordScores);
    expect(put.omissions).toEqual([]);
    expect(put.insertions).toEqual(['again']);
  });

  it('accuracyScore·scoreModel(감점제 전환 표식, 2026-08-31)도 이월된다', async () => {
    const server = [{ id: 'p1', user_id: 'u1', lang: 'en', date: '2026-08-31', overall_score: 83, sentence_id: 'c1' }];
    const fromMock = vi.fn(() => {
      const b = { select: vi.fn(() => b), eq: vi.fn().mockResolvedValue({ data: server, error: null }) };
      return b;
    });
    vi.doMock('../services/supabase.js', () => ({ supabase: { from: fromMock }, isSupabaseConfigured: true }));
    const { pullTable, TABLE_MAP } = await import('./sync.js');
    const mapping = TABLE_MAP.find((m) => m.dexie === 'pronunciationLog');
    const bulkPut = vi.fn().mockResolvedValue();
    const bulkGet = vi.fn().mockResolvedValue([{ id: 'p1', accuracyScore: 97, scoreModel: 'ded1' }]);
    await pullTable(mapping, { pronunciationLog: { bulkPut, bulkGet } }, 'u1');
    const put = bulkPut.mock.calls[0][0][0];
    expect(put.accuracyScore).toBe(97);
    expect(put.scoreModel).toBe('ded1');
  });

  it('로컬에 없던 행(bulkGet undefined)은 그대로 저장된다', async () => {
    const server = [{ id: 'p2', user_id: 'u1', lang: 'en', date: '2026-08-29', overall_score: 80, sentence_id: 'c1' }];
    const fromMock = vi.fn(() => {
      const b = { select: vi.fn(() => b), eq: vi.fn().mockResolvedValue({ data: server, error: null }) };
      return b;
    });
    vi.doMock('../services/supabase.js', () => ({ supabase: { from: fromMock }, isSupabaseConfigured: true }));
    const { pullTable, TABLE_MAP } = await import('./sync.js');
    const mapping = TABLE_MAP.find((m) => m.dexie === 'pronunciationLog');
    const bulkPut = vi.fn().mockResolvedValue();
    const bulkGet = vi.fn().mockResolvedValue([undefined]);
    const r = await pullTable(mapping, { pronunciationLog: { bulkPut, bulkGet } }, 'u1');
    expect(r.status).toBe('ok');
    expect(bulkPut.mock.calls[0][0][0].id).toBe('p2');
  });
});

/* 채점 지연 계측 컬럼 (0008, 2026-09-03) — 로컬 전용이면 폰에서 난 지연을 서버에서 볼 수 없다. 양방향 매핑. */
describe('sync — pronunciationLog timing 매핑 (0008)', () => {
  it('Dexie → Supabase 로 timing 을 올린다', async () => {
    const { pronunciationLogDexieToSupabase } = await import('./sync.js');
    const out = pronunciationLogDexieToSupabase({ id: 'p1', lang: 'en', sentenceId: 's', date: '2026-09-03', overallScore: 80, timing: { stopAt: 1, sttMs: 700 } }, 'u1');
    expect(out.timing).toEqual({ stopAt: 1, sttMs: 700 });
  });
  it('Supabase → Dexie 로 timing 을 내린다 (없으면 null)', async () => {
    const { pronunciationLogSupabaseToDexie } = await import('./sync.js');
    expect(pronunciationLogSupabaseToDexie({ id: 'p1', lang: 'en', sentence_id: 's', date: '2026-09-03', overall_score: 80, timing: { sttMs: 700 } }).timing).toEqual({ sttMs: 700 });
    expect(pronunciationLogSupabaseToDexie({ id: 'p2', lang: 'en', sentence_id: 's', date: '2026-09-03', overall_score: 80 }).timing).toBeNull();
  });
});
