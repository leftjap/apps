/**
 * sync.js 단위 테스트 (Wave 11.8.1).
 *
 * 환경: vitest. supabase 는 services/supabase.js 에서 default null (env 미설정 모킹 환경).
 *
 * 범위:
 *  - TABLE_MAP 노출 (4 테이블, frozen)
 *  - 변환 함수 (fromSupabase) 포맷 검증
 *  - 가드 (no_supabase / no_db / no_user → status='skipped')
 *  - startSync 가드 (no_user / no_db / already_active)
 *
 * 비대상:
 *  - 실 supabase 호출 — Wave 11.8.2 e2e 또는 사용자 환경 검증.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let TABLE_MAP, pullTable, pullAll, startSync, stopSync, isSyncActive, Sync;

// supabase null 환경 모킹 — 모든 가드 검증
beforeEach(async () => {
  vi.resetModules();
  vi.doMock('../services/supabase.js', () => ({
    supabase: null,
    isSupabaseConfigured: false,
  }));
  const mod = await import('./sync.js');
  TABLE_MAP = mod.TABLE_MAP;
  pullTable = mod.pullTable;
  pullAll = mod.pullAll;
  startSync = mod.startSync;
  stopSync = mod.stopSync;
  isSyncActive = mod.isSyncActive;
  Sync = mod.Sync;
  globalThis.window = globalThis.window || {};
  globalThis.window.gymDB = null;
});

afterEach(() => {
  vi.unmock('../services/supabase.js');
  vi.resetModules();
  if (globalThis.window) globalThis.window.gymDB = null;
});

describe('TABLE_MAP', () => {
  it('5 테이블 매핑 (Wave 11.8.x — settings 추가)', () => {
    expect(TABLE_MAP).toHaveLength(5);
    const dexies = TABLE_MAP.map(m => m.dexie);
    expect(dexies).toEqual(['sessions', 'prs', 'weights', 'customExercises', 'settings']);
  });
  it('Supabase 이름 = gym_ 접두사', () => {
    TABLE_MAP.forEach(m => expect(m.supabase).toMatch(/^gym_/));
  });
  it('각 매핑은 fromSupabase 함수 보유', () => {
    TABLE_MAP.forEach(m => expect(typeof m.fromSupabase).toBe('function'));
  });
  it('frozen', () => {
    expect(Object.isFrozen(TABLE_MAP)).toBe(true);
    TABLE_MAP.forEach(m => expect(Object.isFrozen(m)).toBe(true));
  });
  it('settings 의 onConflict = user_id', () => {
    const m = TABLE_MAP.find((x) => x.dexie === 'settings');
    expect(m.onConflict).toBe('user_id');
    expect(m.supabase).toBe('gym_user_settings');
  });
});

describe('변환 함수 — fromSupabase', () => {
  it('sessions — snake_case → camelCase + 숫자 변환', () => {
    const m = TABLE_MAP.find(x => x.dexie === 'sessions');
    const out = m.fromSupabase({
      id: 'sess-1', date: '2026-04-01', status: 'completed',
      start_time: '1700000000000', end_time: '1700001000000',
      blocks: [{ type: 'single' }], tags: ['chest'],
      total_volume: '1500', total_calories: '300', duration_min: '45',
      user_id: 'uuid', created_at: 'ignored',
    });
    expect(out.id).toBe('sess-1');
    expect(out.startTime).toBe(1700000000000);
    expect(out.totalVolume).toBe(1500);
    expect(out.tags).toEqual(['chest']);
    expect(out.user_id).toBeUndefined(); // 의도적 누락
  });

  it('prs — id 무시, exerciseId/type 사용 + 숫자 변환', () => {
    const m = TABLE_MAP.find(x => x.dexie === 'prs');
    const out = m.fromSupabase({
      id: 'bench_press_e1rm',
      user_id: 'uuid',
      exercise_id: 'bench_press',
      type: 'e1rm',
      weight: '60',
      reps: '10',
      e1rm: '80',
      date: '2026-04-01',
      session_id: 'sess-1',
    });
    expect(out.exerciseId).toBe('bench_press');
    expect(out.type).toBe('e1rm');
    expect(out.weight).toBe(60);
    expect(out.e1rm).toBe(80);
    expect(out.sessionId).toBe('sess-1');
    expect(out.id).toBeUndefined(); // Dexie PK 는 [exerciseId+type] 복합
  });

  it('weights — date/weight/height + 누락 시 null', () => {
    const m = TABLE_MAP.find(x => x.dexie === 'weights');
    const out = m.fromSupabase({ date: '2026-04-01', weight: '73.4', height: '173' });
    expect(out.weight).toBe(73.4);
    expect(out.height).toBe(173);
    const noHeight = m.fromSupabase({ date: '2026-04-01', weight: '70' });
    expect(noHeight.height).toBeNull();
  });

  it('customExercises — snake_case → camelCase + timestamp 숫자', () => {
    const m = TABLE_MAP.find(x => x.dexie === 'customExercises');
    const out = m.fromSupabase({
      id: 'cust_1', name: '내 운동', part: 'chest', equipment: 'barbell',
      default_sets: '3', default_reps: '10', default_weight: '60', met: '4.5',
      created_at: '2026-04-01T00:00:00Z',
      updated_at: '2026-04-15T00:00:00Z',
    });
    expect(out.id).toBe('cust_1');
    expect(out.defaultSets).toBe(3);
    expect(out.met).toBe(4.5);
    expect(typeof out.createdAt).toBe('number');
    expect(typeof out.updatedAt).toBe('number');
  });

  it('settings — JSONB → 평면 + key 주입 + default fallback', () => {
    const m = TABLE_MAP.find(x => x.dexie === 'settings');
    const out = m.fromSupabase({
      user_id: 'uuid',
      settings: { weeklyGoal: 5, height: 180, hiddenExercises: ['bench_press'] },
      updated_at: '2026-04-15T00:00:00Z',
    });
    expect(out.key).toBe('userSettings');
    expect(out.weeklyGoal).toBe(5);
    expect(out.height).toBe(180);
    expect(out.hiddenExercises).toEqual(['bench_press']);
    // 누락 필드는 default
    expect(out.goalWeight).toBe(69);
    expect(out.exerciseOrder).toEqual({});
  });

  it('settings — 빈 JSONB 도 안전 (모든 default 적용)', () => {
    const m = TABLE_MAP.find(x => x.dexie === 'settings');
    const out = m.fromSupabase({ user_id: 'uuid', settings: {} });
    expect(out.weeklyGoal).toBe(4);
    expect(out.goalWeight).toBe(69);
    expect(out.hiddenExercises).toEqual([]);
  });
});

describe('pullTable 가드', () => {
  it('supabase null → skipped', async () => {
    const m = TABLE_MAP[0];
    const r = await pullTable(m, {}, 'user-1');
    expect(r.status).toBe('skipped');
    expect(r.reason).toBe('no_supabase');
  });

  it('db null → skipped (supabase 모킹 필요)', async () => {
    // 위 beforeEach 가 supabase=null 로 모킹 — 이 케이스는 no_supabase 우선.
    // db null 케이스는 supabase 가 있을 때 검증 — 별 doMock 으로 확인.
    vi.resetModules();
    vi.doMock('../services/supabase.js', () => ({ supabase: { from: () => {} }, isSupabaseConfigured: true }));
    const mod = await import('./sync.js');
    const r = await mod.pullTable(mod.TABLE_MAP[0], null, 'user-1');
    expect(r.status).toBe('skipped');
    expect(r.reason).toBe('no_db');
  });

  it('user null → skipped', async () => {
    vi.resetModules();
    vi.doMock('../services/supabase.js', () => ({ supabase: { from: () => {} }, isSupabaseConfigured: true }));
    const mod = await import('./sync.js');
    const r = await mod.pullTable(mod.TABLE_MAP[0], {}, null);
    expect(r.status).toBe('skipped');
    expect(r.reason).toBe('no_user');
  });
});

describe('pullAll 가드', () => {
  it('supabase null → ok=false, reason=no_supabase', async () => {
    const r = await pullAll({}, 'user-1');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('no_supabase');
  });

  it('db/user 누락 → preconditions', async () => {
    vi.resetModules();
    vi.doMock('../services/supabase.js', () => ({ supabase: { from: () => {} }, isSupabaseConfigured: true }));
    const mod = await import('./sync.js');
    const r = await mod.pullAll(null, null);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('preconditions');
  });
});

describe('startSync / stopSync', () => {
  it('user 없음 → no_user', async () => {
    const r = await startSync(null);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('no_user');
  });

  it('window.gymDB 없음 → no_db', async () => {
    globalThis.window.gymDB = null;
    const r = await startSync({ id: 'u1' });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('no_db');
  });

  it('already_active 재진입 차단 + stopSync 후 재시작 가능', async () => {
    vi.resetModules();
    vi.doMock('../services/supabase.js', () => ({
      supabase: {
        from: () => ({
          select: () => ({ eq: async () => ({ data: [], error: null }) }),
        }),
      },
      isSupabaseConfigured: true,
    }));
    const mod = await import('./sync.js');
    globalThis.window.gymDB = { sessions: { bulkPut: async () => {} }, prs: { bulkPut: async () => {} }, weights: { bulkPut: async () => {} }, customExercises: { bulkPut: async () => {} } };
    const r1 = await mod.startSync({ id: 'u1' });
    expect(r1.ok).toBe(true);
    expect(mod.isSyncActive()).toBe(true);
    const r2 = await mod.startSync({ id: 'u1' });
    expect(r2.reason).toBe('already_active');
    mod.stopSync();
    expect(mod.isSyncActive()).toBe(false);
  });
});

describe('Sync 인터페이스 노출', () => {
  it('11.8.1 + 11.8.2 API 모두 노출', () => {
    expect(Sync.TABLE_MAP).toBe(TABLE_MAP);
    expect(Sync.DEBOUNCE_MS).toBe(3000);
    expect(typeof Sync.pullTable).toBe('function');
    expect(typeof Sync.pullAll).toBe('function');
    expect(typeof Sync.pushTable).toBe('function');
    expect(typeof Sync.pushAll).toBe('function');
    expect(typeof Sync.queueUpload).toBe('function');
    expect(typeof Sync.flushPendingUploads).toBe('function');
    expect(typeof Sync.attachHooks).toBe('function');
    expect(typeof Sync.detachHooks).toBe('function');
    expect(typeof Sync.startSync).toBe('function');
    expect(typeof Sync.stopSync).toBe('function');
    expect(typeof Sync.isSyncActive).toBe('function');
    expect(typeof Sync.findMapping).toBe('function');
  });
});

describe('toSupabase 변환', () => {
  it('sessions — camelCase → snake_case + user_id 주입', () => {
    const m = TABLE_MAP.find((x) => x.dexie === 'sessions');
    const out = m.toSupabase({
      id: 'sess-1', date: '2026-04-01', status: 'completed',
      startTime: 1700000000000, endTime: 1700001000000,
      blocks: [{ type: 'single' }], tags: ['chest'],
      totalVolume: 1500, totalCalories: 300, durationMin: 45,
    }, 'user-uuid');
    expect(out.user_id).toBe('user-uuid');
    expect(out.start_time).toBe(1700000000000);
    expect(out.total_volume).toBe(1500);
    expect(out.duration_min).toBe(45);
    expect(out.startTime).toBeUndefined();
  });

  it('prs — id 합성 (exerciseId + _ + type)', () => {
    const m = TABLE_MAP.find((x) => x.dexie === 'prs');
    const out = m.toSupabase({
      exerciseId: 'bench_press', type: 'e1rm',
      weight: 60, reps: 10, e1rm: 80,
      date: '2026-04-01', sessionId: 'sess-1',
    }, 'user-uuid');
    expect(out.id).toBe('bench_press_e1rm');
    expect(out.exercise_id).toBe('bench_press');
    expect(out.session_id).toBe('sess-1');
  });

  it('weights — date/weight/height + user_id', () => {
    const m = TABLE_MAP.find((x) => x.dexie === 'weights');
    const out = m.toSupabase({ date: '2026-04-01', weight: 73.4, height: 173 }, 'user-uuid');
    expect(out.user_id).toBe('user-uuid');
    expect(out.weight).toBe(73.4);
    expect(out.height).toBe(173);
  });

  it('weights — height null 보존', () => {
    const m = TABLE_MAP.find((x) => x.dexie === 'weights');
    const out = m.toSupabase({ date: '2026-04-01', weight: 70, height: null }, 'user-uuid');
    expect(out.height).toBeNull();
  });

  it('customExercises — created_at/updated_at 누락 (Supabase 트리거 처리)', () => {
    const m = TABLE_MAP.find((x) => x.dexie === 'customExercises');
    const out = m.toSupabase({
      id: 'cust_1', name: '내 운동', part: 'chest', equipment: 'barbell',
      defaultSets: 3, defaultReps: 10, defaultWeight: 60, met: 4.5,
      createdAt: 12345, updatedAt: 67890,
    }, 'user-uuid');
    expect(out.id).toBe('cust_1');
    expect(out.default_sets).toBe(3);
    expect(out.met).toBe(4.5);
    expect(out.created_at).toBeUndefined();
    expect(out.updated_at).toBeUndefined();
  });

  it('settings — 평면 → JSONB (key 컬럼 제외)', () => {
    const m = TABLE_MAP.find((x) => x.dexie === 'settings');
    const out = m.toSupabase({
      key: 'userSettings',
      weeklyGoal: 5,
      height: 180,
      birthYear: 1990,
      goalWeight: 70,
      hiddenExercises: ['bench_press'],
      exerciseOrder: { chest: ['bench_press'] },
      exercisePartOverride: { bench_press: 'back' },
    }, 'user-uuid');
    expect(out.user_id).toBe('user-uuid');
    expect(out.settings).toBeTypeOf('object');
    expect(out.settings.key).toBeUndefined();
    expect(out.settings.weeklyGoal).toBe(5);
    expect(out.settings.hiddenExercises).toEqual(['bench_press']);
    expect(out.settings.exercisePartOverride).toEqual({ bench_press: 'back' });
  });
});

describe('deleteTable settings — unsupported (Wave 11.8.x 안전장치)', () => {
  it('settings delete → skipped, settings_delete_unsupported', async () => {
    vi.resetModules();
    vi.doMock('../services/supabase.js', () => ({
      supabase: { from: () => ({ delete: () => ({ eq: () => ({ in: async () => ({ error: null }) }) }) }) },
      isSupabaseConfigured: true,
    }));
    const mod = await import('./sync.js');
    const m = mod.TABLE_MAP.find((x) => x.dexie === 'settings');
    const r = await mod.deleteTable(m, 'u1', ['userSettings']);
    expect(r.status).toBe('skipped');
    expect(r.reason).toBe('settings_delete_unsupported');
  });
});

describe('onConflict 매핑', () => {
  it('sessions·prs·customExercises = id / weights = user_id,date', () => {
    expect(TABLE_MAP.find((m) => m.dexie === 'sessions').onConflict).toBe('id');
    expect(TABLE_MAP.find((m) => m.dexie === 'prs').onConflict).toBe('id');
    expect(TABLE_MAP.find((m) => m.dexie === 'customExercises').onConflict).toBe('id');
    expect(TABLE_MAP.find((m) => m.dexie === 'weights').onConflict).toBe('user_id,date');
  });
});

describe('pushTable / pushAll 가드', () => {
  it('pushTable supabase null → skipped', async () => {
    const m = TABLE_MAP[0];
    const r = await Sync.pushTable(m, {}, 'user-1');
    expect(r.status).toBe('skipped');
    expect(r.reason).toBe('no_supabase');
  });

  it('pushAll supabase null → ok=false', async () => {
    const r = await Sync.pushAll({}, 'user-1');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('no_supabase');
  });

  it('pushTable ids=[] → empty (no-op)', async () => {
    vi.resetModules();
    vi.doMock('../services/supabase.js', () => ({
      supabase: { from: () => ({ upsert: async () => ({ error: null }) }) },
      isSupabaseConfigured: true,
    }));
    const mod = await import('./sync.js');
    const m = mod.TABLE_MAP[0];
    const r = await mod.pushTable(m, { sessions: { bulkGet: async () => [] } }, 'u1', []);
    expect(r.status).toBe('empty');
  });

  it('pushTable ids=[id1] → bulkGet → upsert ok', async () => {
    vi.resetModules();
    let upsertCalled = null;
    vi.doMock('../services/supabase.js', () => ({
      supabase: {
        from: () => ({
          upsert: async (rows, opts) => {
            upsertCalled = { rows, opts };
            return { error: null };
          },
        }),
      },
      isSupabaseConfigured: true,
    }));
    const mod = await import('./sync.js');
    const m = mod.TABLE_MAP.find((x) => x.dexie === 'sessions');
    const fakeRow = { id: 'sess-1', date: '2026-04-01', status: 'completed', startTime: 1700000000000, blocks: [], tags: [], totalVolume: 0, totalCalories: 0, durationMin: 0 };
    const fakeDB = { sessions: { bulkGet: async () => [fakeRow] } };
    const r = await mod.pushTable(m, fakeDB, 'user-uuid', ['sess-1']);
    expect(r.status).toBe('ok');
    expect(r.count).toBe(1);
    expect(upsertCalled.opts.onConflict).toBe('id');
    expect(upsertCalled.rows[0].user_id).toBe('user-uuid');
    expect(upsertCalled.rows[0].start_time).toBe(1700000000000);
  });
});

describe('queueUpload + flushPendingUploads 디바운스', () => {
  it('falsy 입력 → ok=false', () => {
    const r = Sync.queueUpload(null, {});
    expect(r.ok).toBe(false);
    const r2 = Sync.queueUpload('sessions', null);
    expect(r2.ok).toBe(false);
  });

  it('정상 호출 → 큐에 적재', () => {
    const r = Sync.queueUpload('sessions', { id: 'sess-1' });
    expect(r.ok).toBe(true);
    expect(r.dexieName).toBe('sessions');
    expect(r.queued).toBeGreaterThanOrEqual(1);
  });

  it('flushPendingUploads — ctx 없으면 no_session (큐 보존)', async () => {
    Sync.queueUpload('sessions', { id: 'sess-flush-1' });
    const r = await Sync.flushPendingUploads();
    expect(r.ok).toBe(false);
    expect(r.status).toBe('no_session');
  });

  it('flushPendingUploads — 큐 비어있으면 empty', async () => {
    // 직전 케이스에서 큐 보존됨 — 명시 비우기 위해 모듈 reload
    vi.resetModules();
    vi.doMock('../services/supabase.js', () => ({ supabase: null, isSupabaseConfigured: false }));
    const mod = await import('./sync.js');
    const r = await mod.flushPendingUploads();
    expect(r.status).toBe('empty');
  });
});

describe('resolveConflict (Wave 11.8.3 — prs 한정)', () => {
  it('local null → server', () => {
    expect(Sync.resolveConflict(null, { e1rm: 80 })).toEqual({ e1rm: 80 });
  });
  it('server null → local', () => {
    expect(Sync.resolveConflict({ e1rm: 80 }, null)).toEqual({ e1rm: 80 });
  });
  it('local e1rm 큼 → local', () => {
    expect(Sync.resolveConflict({ e1rm: 90 }, { e1rm: 80 }).e1rm).toBe(90);
  });
  it('server e1rm 큼 → server', () => {
    expect(Sync.resolveConflict({ e1rm: 80 }, { e1rm: 90 }).e1rm).toBe(90);
  });
  it('동률 → server (push 일관성)', () => {
    const local = { e1rm: 80, src: 'local' };
    const server = { e1rm: 80, src: 'server' };
    expect(Sync.resolveConflict(local, server).src).toBe('server');
  });
});

describe('getServerCount / clearServerCounts (Wave 11.8.3)', () => {
  beforeEach(() => Sync.clearServerCounts());
  it('마킹 없으면 null', () => {
    expect(Sync.getServerCount('sessions')).toBeNull();
  });
  it('clear 후 다시 null', () => {
    Sync.clearServerCounts();
    expect(Sync.getServerCount('sessions')).toBeNull();
  });
});

describe('pushTable 급감 차단 (Wave 11.8.3)', () => {
  it('server count=0 + local>0 → blocked', async () => {
    vi.resetModules();
    vi.doMock('../services/supabase.js', () => ({
      supabase: {
        from: () => ({
          select: () => ({ eq: async () => ({ data: [], error: null }) }),
          upsert: async () => ({ error: null }),
        }),
      },
      isSupabaseConfigured: true,
    }));
    const mod = await import('./sync.js');
    // pullAll 로 server count 마킹
    const fakeDB = {
      sessions: { bulkPut: async () => {}, bulkGet: async () => [], toArray: async () => [{ id: 's1' }] },
      prs: { bulkPut: async () => {}, bulkGet: async () => [] },
      weights: { bulkPut: async () => {} },
      customExercises: { bulkPut: async () => {} },
    };
    const r1 = await mod.pullAll(fakeDB, 'u1');
    expect(r1.ok).toBe(true);
    expect(mod.getServerCount('sessions')).toBe(0);
    // pushTable 시 local>0 + server=0 → blocked
    const m = mod.TABLE_MAP.find((x) => x.dexie === 'sessions');
    const r2 = await mod.pushTable(m, fakeDB, 'u1', null);
    expect(r2.status).toBe('blocked');
    expect(r2.reason).toBe('server_empty_local_nonempty');
  });

  it('clearServerCounts 후 차단 해제', async () => {
    vi.resetModules();
    let upsertCalled = false;
    vi.doMock('../services/supabase.js', () => ({
      supabase: {
        from: () => ({
          select: () => ({ eq: async () => ({ data: [], error: null }) }),
          upsert: async () => { upsertCalled = true; return { error: null }; },
        }),
      },
      isSupabaseConfigured: true,
    }));
    const mod = await import('./sync.js');
    const fakeDB = {
      sessions: {
        bulkPut: async () => {},
        bulkGet: async () => [{ id: 's1', date: '2026-04-01', status: 'completed', startTime: 0, blocks: [], tags: [], totalVolume: 0, totalCalories: 0, durationMin: 0 }],
        toArray: async () => [{ id: 's1', date: '2026-04-01', status: 'completed', startTime: 0, blocks: [], tags: [], totalVolume: 0, totalCalories: 0, durationMin: 0 }],
      },
      prs: { bulkPut: async () => {}, bulkGet: async () => [] },
      weights: { bulkPut: async () => {} },
      customExercises: { bulkPut: async () => {} },
    };
    await mod.pullAll(fakeDB, 'u1');
    mod.clearServerCounts();
    const m = mod.TABLE_MAP.find((x) => x.dexie === 'sessions');
    const r = await mod.pushTable(m, fakeDB, 'u1', ['s1']);
    expect(r.status).toBe('ok');
    expect(upsertCalled).toBe(true);
  });
});

describe('queueDelete + deleteAll (Wave 11.8.3)', () => {
  it('queueDelete falsy → ok=false', () => {
    const r = Sync.queueDelete(null, {});
    expect(r.ok).toBe(false);
  });
  it('queueDelete 정상 → 큐 적재', () => {
    const r = Sync.queueDelete('sessions', { id: 's-del-1' });
    expect(r.ok).toBe(true);
    expect(r.dexieName).toBe('sessions');
  });
  it('deleteAll supabase null → ok=false', async () => {
    const r = await Sync.deleteAll('u1', new Map());
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('no_supabase');
  });
  it('deleteTable empty keys → empty', async () => {
    vi.resetModules();
    vi.doMock('../services/supabase.js', () => ({
      supabase: { from: () => ({ delete: () => ({ eq: () => ({ in: async () => ({ error: null }) }) }) }) },
      isSupabaseConfigured: true,
    }));
    const mod = await import('./sync.js');
    const m = mod.TABLE_MAP[0];
    const r = await mod.deleteTable(m, 'u1', []);
    expect(r.status).toBe('empty');
  });
});
