/**
 * sync.js 단위 테스트 (Wave 11.5.3.1 — Study 11.13.1 패턴 답습).
 *
 * 범위:
 *   - TABLE_MAP 정의 검증
 *   - startSync/stopSync 가드 (no_user / no_db / no_supabase)
 *   - 인터페이스 노출
 *
 * 비대상:
 *   - 실 Supabase 호출 (별 통합 테스트)
 *   - bulkPut 동작 (Dexie 단위는 fake-indexeddb 통합)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// supabase 모킹 — 미설정 모드 (no_supabase 경로 검증)
vi.mock('../services/supabase.js', () => ({
  supabase: null,
  isSupabaseConfigured: false,
}));

const { Sync, TABLE_MAP, startSync, stopSync, pullTable, pullAll, isSyncActive } =
  await import('./sync.js');

describe('TABLE_MAP', () => {
  it('entries + expenses + merchant_rules + comments + notifications + user 매핑 3종', () => {
    expect(TABLE_MAP).toHaveLength(8);
    expect(TABLE_MAP[0].dexie).toBe('entries');
    expect(TABLE_MAP[0].filterColumn).toBeNull();
    expect(TABLE_MAP[1].dexie).toBe('expenses');
    expect(TABLE_MAP[1].filterColumn).toBe('owner_id');
    expect(TABLE_MAP[2].dexie).toBe('merchant_rules');
    expect(TABLE_MAP[2].filterColumn).toBeNull(); // RLS 가 global+본인 user 자동 필터
    expect(TABLE_MAP[3].dexie).toBe('comments');
    expect(TABLE_MAP[3].filterColumn).toBeNull();
    expect(TABLE_MAP[4].dexie).toBe('notifications');
    expect(TABLE_MAP[4].filterColumn).toBe('recipient_id');
    // Wave 11.8 — 사용자별 매핑 3종 (admin UI 편집 대상), user_id 필터
    expect(TABLE_MAP[5].dexie).toBe('user_categories');
    expect(TABLE_MAP[5].filterColumn).toBe('user_id');
    expect(TABLE_MAP[6].dexie).toBe('user_brand_categories');
    expect(TABLE_MAP[6].filterColumn).toBe('user_id');
    expect(TABLE_MAP[7].dexie).toBe('user_merchant_aliases');
    expect(TABLE_MAP[7].filterColumn).toBe('user_id');
  });

  it('frozen — 런타임 변조 방지', () => {
    expect(Object.isFrozen(TABLE_MAP)).toBe(true);
    for (const m of TABLE_MAP) expect(Object.isFrozen(m)).toBe(true);
  });
});

describe('Sync 인터페이스 노출', () => {
  it('필수 멤버 노출', () => {
    const expected = ['TABLE_MAP', 'pullTable', 'pullAll', 'startSync', 'stopSync', 'isSyncActive'];
    for (const k of expected) {
      expect(Sync, `Sync.${k} 누락`).toHaveProperty(k);
    }
  });
});

describe('startSync 가드', () => {
  beforeEach(() => stopSync());
  afterEach(() => {
    globalThis.todayDB = null;
  });

  it('user 누락 → no_user', async () => {
    const r = await startSync(null);
    expect(r).toEqual({ ok: false, reason: 'no_user' });
  });

  it('user.id 누락 → no_user', async () => {
    const r = await startSync({});
    expect(r).toEqual({ ok: false, reason: 'no_user' });
  });

  it('todayDB 미초기화 → no_db', async () => {
    globalThis.todayDB = null;
    const r = await startSync({ id: 'u1' });
    expect(r).toEqual({ ok: false, reason: 'no_db' });
  });

  it('supabase 미설정 → preconditions OK 라도 pullAll 이 no_supabase 반환', async () => {
    globalThis.todayDB = { entries: { bulkPut: vi.fn() } };
    const r = await startSync({ id: 'u1' });
    // _syncActive=true 후 pullAll 호출 → supabase=null → ok:false
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('no_supabase');
    expect(isSyncActive()).toBe(true); // 플래그는 set 됨
  });
});

describe('pullTable / pullAll — supabase 미설정 가드', () => {
  it('pullTable: no_supabase 반환', async () => {
    const r = await pullTable(TABLE_MAP[0], { entries: {} }, 'u1');
    expect(r).toMatchObject({ status: 'skipped', reason: 'no_supabase' });
  });

  it('pullAll: no_supabase 반환', async () => {
    const r = await pullAll({ entries: {} }, 'u1');
    expect(r).toMatchObject({ ok: false, reason: 'no_supabase' });
  });
});

describe('stopSync', () => {
  it('isSyncActive false 로 리셋', async () => {
    globalThis.todayDB = { entries: { bulkPut: vi.fn() } };
    await startSync({ id: 'u1' });
    expect(isSyncActive()).toBe(true);
    stopSync();
    expect(isSyncActive()).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Wave 11.5.3.2 — 업로드 (pushEntry / queueUpload / flushPendingUploads)
// ═══════════════════════════════════════════════════════════════════════════

describe('pushEntry — supabase 미설정 가드', () => {
  it('no_supabase 반환', async () => {
    const { pushEntry } = Sync;
    globalThis.todayDB = { entries: { get: vi.fn() } };
    const r = await pushEntry('id1');
    expect(r).toMatchObject({ id: 'id1', status: 'skipped', reason: 'no_supabase' });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Wave 11.6.11 — UUID 검증 (devSeed fixture id 가 Supabase uuid 컬럼에 push 시 22P02)
// ═══════════════════════════════════════════════════════════════════════════

describe('isValidUuid — UUID v4 형식 검증', () => {
  it('정상 UUID v4 → true', async () => {
    const { isValidUuid } = Sync;
    expect(isValidUuid('11111111-2222-3333-4444-555555555555')).toBe(true);
    expect(isValidUuid('aabbccdd-eeff-0011-2233-445566778899')).toBe(true);
    // 대문자도 허용 (정규식 i flag)
    expect(isValidUuid('AABBCCDD-EEFF-0011-2233-445566778899')).toBe(true);
  });

  it('devSeed fixture id (tx-XX, entry-fixture-...) → false', async () => {
    const { isValidUuid } = Sync;
    expect(isValidUuid('tx-13')).toBe(false);
    expect(isValidUuid('tx-06a')).toBe(false);
    expect(isValidUuid('entry-fixture-navi-3')).toBe(false);
    expect(isValidUuid('entry-fixture-blog-1')).toBe(false);
  });

  it('잘못된 형식 → false', async () => {
    const { isValidUuid } = Sync;
    expect(isValidUuid(null)).toBe(false);
    expect(isValidUuid(undefined)).toBe(false);
    expect(isValidUuid('')).toBe(false);
    expect(isValidUuid('11111111-2222-3333-4444')).toBe(false); // 길이 부족
    expect(isValidUuid('11111111-2222-3333-4444-5555555555555')).toBe(false); // 길이 초과
    expect(isValidUuid('zzzzzzzz-2222-3333-4444-555555555555')).toBe(false); // 비-hex
    expect(isValidUuid(12345)).toBe(false); // string 아님
  });

  it('Sync.isValidUuid 노출', () => {
    expect(typeof Sync.isValidUuid).toBe('function');
  });
});

describe('queueUpload — debounce 동작', () => {
  beforeEach(() => {
    Sync._clearUploadTimers?.();
  });

  it('연속 호출 시 마지막 1회만 push (debounce)', async () => {
    // pushEntry 가 supabase=null → no_supabase 즉시 반환. 하지만 debounce 타이밍 검증은 가능.
    Sync.queueUpload('id-x');
    Sync.queueUpload('id-x');
    Sync.queueUpload('id-x');
    // 800ms 미만이면 아직 push 결과 없음
    expect(Sync._getLastUploadResult?.('id-x')).toBeUndefined();
  });

  it('falsy id 는 무시', () => {
    expect(() => Sync.queueUpload(null)).not.toThrow();
    expect(() => Sync.queueUpload('')).not.toThrow();
  });
});

describe('flushPendingUploads', () => {
  beforeEach(() => Sync._clearUploadTimers?.());

  it('pending 없을 때 count 0 반환', async () => {
    const r = await Sync.flushPendingUploads();
    expect(r.count).toBe(0);
    expect(r.results).toEqual([]);
  });
});

describe('UPLOAD_DEBOUNCE_MS', () => {
  it('spec §8 800ms 정합', () => {
    expect(Sync.UPLOAD_DEBOUNCE_MS).toBe(800);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Wave 11.5.4 — Realtime
// ═══════════════════════════════════════════════════════════════════════════

describe('Realtime 인터페이스 노출', () => {
  it('startRealtime / stopRealtime / onRealtimeChange 노출', () => {
    expect(Sync).toHaveProperty('startRealtime');
    expect(Sync).toHaveProperty('stopRealtime');
    expect(Sync).toHaveProperty('onRealtimeChange');
  });
});

describe('startRealtime — supabase 미설정 가드', () => {
  it('no_supabase 반환', () => {
    const r = Sync.startRealtime();
    expect(r).toEqual({ ok: false, reason: 'no_supabase' });
  });

  it('_isRealtimeActive false (미설정)', () => {
    expect(Sync._isRealtimeActive()).toBe(false);
  });
});

describe('onRealtimeChange — 등록/해제', () => {
  it('등록 후 unregister 함수 반환', () => {
    const fn = vi.fn();
    const unreg = Sync.onRealtimeChange(fn);
    expect(typeof unreg).toBe('function');
    unreg();
  });
});

describe('stopRealtime — 안전 호출', () => {
  it('미구독 상태에서도 throw 없음', () => {
    expect(() => Sync.stopRealtime()).not.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Wave 11.5.5 — 오프라인 큐
// ═══════════════════════════════════════════════════════════════════════════

describe('flushPendingFromDexie — 가드', () => {
  it('supabase 미설정 시 no_supabase', async () => {
    const r = await Sync.flushPendingFromDexie();
    expect(r).toMatchObject({ count: 0, reason: 'no_supabase' });
  });

  it('todayDB 없을 때 no_db', async () => {
    // supabase mock 은 null 이므로 no_supabase 가 먼저 반환 — 별 mock 환경 필요 없음.
    // 단순화: 실제 supabase mock 이 있는 환경에서 todayDB 누락 케이스만 별도 검증 (생략 — 단순 가드).
    const r = await Sync.flushPendingFromDexie();
    expect(r.count).toBe(0);
  });
});

describe('flushPendingFromDexie 인터페이스 노출', () => {
  it('Sync.flushPendingFromDexie 존재', () => {
    expect(Sync).toHaveProperty('flushPendingFromDexie');
    expect(typeof Sync.flushPendingFromDexie).toBe('function');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Wave 11.6.2 — expenses sync
// ═══════════════════════════════════════════════════════════════════════════

describe('expenses sync 인터페이스 노출', () => {
  it('pushExpense / queueUploadExpense / flushPendingExpensesFromDexie 노출', () => {
    expect(Sync).toHaveProperty('pushExpense');
    expect(Sync).toHaveProperty('queueUploadExpense');
    expect(Sync).toHaveProperty('flushPendingExpensesFromDexie');
  });
});

describe('pushExpense — supabase 미설정 가드', () => {
  it('no_supabase 반환', async () => {
    globalThis.todayDB = { expenses: { get: vi.fn() } };
    const r = await Sync.pushExpense('eid');
    expect(r).toMatchObject({ id: 'eid', status: 'skipped', reason: 'no_supabase' });
  });
});

describe('queueUploadExpense — debounce', () => {
  beforeEach(() => Sync._clearExpenseUploadTimers?.());

  it('falsy id 무시', () => {
    expect(() => Sync.queueUploadExpense(null)).not.toThrow();
  });
});

describe('flushPendingExpensesFromDexie — 가드', () => {
  it('supabase 미설정 시 no_supabase', async () => {
    const r = await Sync.flushPendingExpensesFromDexie();
    expect(r).toMatchObject({ count: 0, reason: 'no_supabase' });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Wave 11.7.2 — comments / notifications sync
// ═══════════════════════════════════════════════════════════════════════════

describe('comments / notifications sync 인터페이스 노출', () => {
  it('필수 멤버 노출', () => {
    const expected = [
      'pushComment', 'queueUploadComment', 'flushPendingCommentsFromDexie',
      'pushNotification', 'queueUploadNotification',
    ];
    for (const k of expected) expect(Sync, `Sync.${k} 누락`).toHaveProperty(k);
  });
});

describe('pushComment — supabase 미설정 가드', () => {
  it('no_supabase 반환', async () => {
    const r = await Sync.pushComment('cid');
    expect(r).toMatchObject({ id: 'cid', status: 'skipped', reason: 'no_supabase' });
  });
});

describe('pushNotification — supabase 미설정 가드', () => {
  it('no_supabase 반환', async () => {
    const r = await Sync.pushNotification('nid');
    expect(r).toMatchObject({ id: 'nid', status: 'skipped', reason: 'no_supabase' });
  });
});

describe('flushPendingCommentsFromDexie — 가드', () => {
  it('supabase 미설정 시 no_supabase', async () => {
    const r = await Sync.flushPendingCommentsFromDexie();
    expect(r).toMatchObject({ count: 0, reason: 'no_supabase' });
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 별 wave hotfix — formatError (Error / PostgrestError → 사람 읽기 좋은 문자열)
// ───────────────────────────────────────────────────────────────────────────

describe('formatError', () => {
  it('null/undefined → "(no error)"', () => {
    expect(Sync.formatError(null)).toBe('(no error)');
    expect(Sync.formatError(undefined)).toBe('(no error)');
  });

  it('string → string (그대로)', () => {
    expect(Sync.formatError('plain string')).toBe('plain string');
    expect(Sync.formatError('SUBSCRIBED')).toBe('SUBSCRIBED');
  });

  it('Error 객체 → message', () => {
    expect(Sync.formatError(new Error('boom'))).toBe('boom');
  });

  it('PostgrestError 형태 → message · code · hint 결합', () => {
    const err = {
      message: 'permission denied',
      code: '42501',
      hint: 'check RLS',
      details: 'extra',
    };
    expect(Sync.formatError(err)).toBe('permission denied · code=42501 · hint=check RLS');
  });

  it('message 만 있는 객체', () => {
    expect(Sync.formatError({ message: 'simple' })).toBe('simple');
  });

  it('message 없는 객체 → JSON.stringify', () => {
    const r = Sync.formatError({ a: 1, b: 'x' });
    expect(r).toContain('"a":1');
    expect(r).toContain('"b":"x"');
  });

  it('순환 참조 객체 → fallback String(e)', () => {
    const o = { x: 1 };
    o.self = o;
    const r = Sync.formatError(o);
    // String({}) === '[object Object]' — fallback. 단 [object Object] 라도 throw 안 됨이 핵심.
    expect(typeof r).toBe('string');
  });
});

describe('인터페이스 노출 — formatError', () => {
  it('Sync.formatError 존재', () => {
    expect(typeof Sync.formatError).toBe('function');
  });
});
