/**
 * push.js 단위 테스트 (Web Push 구독).
 *
 * 범위:
 *  - urlBase64ToUint8Array — VAPID 공개키(base64url) → Uint8Array(65) (P-256 uncompressed point).
 *  - serializeSubscription — PushSubscription → { endpoint, p256dh, auth }.
 *  - enablePush — 권한 granted → subscribe + today_push_subscriptions upsert(onConflict endpoint).
 *    권한 denied → { ok:false, reason:'denied' }, subscribe 미호출.
 *    no_supabase / no_user 가드.
 *
 * 전략: profile.test.js 처럼 opts 로 supabase / registration / Notification 주입해 전역 우회.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  enablePush,
  mountBadgeClear,
  serializeSubscription,
  urlBase64ToUint8Array,
  VAPID_PUBLIC_KEY,
} from './push.js';

const USER = { id: '00000000-0000-0000-0000-000000000099' };

function makeSubscription({
  endpoint = 'https://web.push.apple.com/abc123',
  p256dh = 'BPubKeyStub',
  auth = 'AuthSecretStub',
} = {}) {
  return {
    endpoint,
    toJSON: () => ({ endpoint, keys: { p256dh, auth } }),
    unsubscribe: vi.fn(async () => true),
  };
}

function makeMockSupabase() {
  const upsert = vi.fn(async () => ({ data: [{ id: 'row1' }], error: null }));
  const del = vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) }));
  const from = vi.fn(() => ({ upsert, delete: del }));
  return { from, _upsert: upsert, _from: from };
}

function makeRegistration(subscription) {
  return {
    pushManager: {
      subscribe: vi.fn(async () => subscription),
      getSubscription: vi.fn(async () => null),
    },
  };
}

describe('urlBase64ToUint8Array', () => {
  it('VAPID 공개키 → Uint8Array(65) (P-256 uncompressed point, 0x04 prefix)', () => {
    const arr = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
    expect(arr).toBeInstanceOf(Uint8Array);
    expect(arr.length).toBe(65);
    expect(arr[0]).toBe(0x04);
  });
});

describe('serializeSubscription', () => {
  it('PushSubscription → { endpoint, p256dh, auth }', () => {
    const sub = makeSubscription({ endpoint: 'https://ep/x', p256dh: 'PK', auth: 'AU' });
    expect(serializeSubscription(sub)).toEqual({
      endpoint: 'https://ep/x',
      p256dh: 'PK',
      auth: 'AU',
    });
  });
});

describe('enablePush', () => {
  it('권한 granted → subscribe + upsert(onConflict endpoint) + ok:true', async () => {
    const sub = makeSubscription();
    const registration = makeRegistration(sub);
    const supabase = makeMockSupabase();
    const Notification = { requestPermission: vi.fn(async () => 'granted') };

    const res = await enablePush(USER, { supabase, registration, Notification });

    expect(res.ok).toBe(true);
    expect(registration.pushManager.subscribe).toHaveBeenCalledWith(
      expect.objectContaining({ userVisibleOnly: true }),
    );
    expect(supabase._from).toHaveBeenCalledWith('today_push_subscriptions');
    const [payload, options] = supabase._upsert.mock.calls[0];
    expect(payload).toMatchObject({
      user_id: USER.id,
      endpoint: sub.endpoint,
      p256dh: 'BPubKeyStub',
      auth: 'AuthSecretStub',
    });
    expect(options).toMatchObject({ onConflict: 'endpoint' });
  });

  it('권한 denied → ok:false reason denied, subscribe 미호출', async () => {
    const registration = makeRegistration(makeSubscription());
    const supabase = makeMockSupabase();
    const Notification = { requestPermission: vi.fn(async () => 'denied') };

    const res = await enablePush(USER, { supabase, registration, Notification });

    expect(res).toEqual({ ok: false, reason: 'denied' });
    expect(registration.pushManager.subscribe).not.toHaveBeenCalled();
    expect(supabase._upsert).not.toHaveBeenCalled();
  });

  it('no_supabase 가드', async () => {
    const res = await enablePush(USER, {
      supabase: null,
      registration: makeRegistration(makeSubscription()),
      Notification: { requestPermission: vi.fn(async () => 'granted') },
    });
    expect(res).toEqual({ ok: false, reason: 'no_supabase' });
  });

  it('no_user 가드', async () => {
    const res = await enablePush(null, {
      supabase: makeMockSupabase(),
      registration: makeRegistration(makeSubscription()),
      Notification: { requestPermission: vi.fn(async () => 'granted') },
    });
    expect(res).toEqual({ ok: false, reason: 'no_user' });
  });
});

describe('mountBadgeClear', () => {
  function makeDoc(visibilityState = 'visible') {
    const listeners = {};
    return {
      visibilityState,
      addEventListener: (t, h) => {
        listeners[t] = h;
      },
      _fire: (t) => listeners[t] && listeners[t](),
    };
  }
  function makeSeenSupabase() {
    const eq = vi.fn(async () => ({ error: null }));
    const update = vi.fn(() => ({ eq }));
    return { from: vi.fn(() => ({ update })), _update: update, _eq: eq };
  }

  it('앱 진입 즉시 clearAppBadge 호출 + true', () => {
    const nav = { clearAppBadge: vi.fn(async () => {}) };
    expect(mountBadgeClear({ nav, doc: makeDoc() })).toBe(true);
    expect(nav.clearAppBadge).toHaveBeenCalledTimes(1);
  });

  it('포그라운드 복귀(visibilitychange→visible) 시 재호출', () => {
    const nav = { clearAppBadge: vi.fn(async () => {}) };
    const doc = makeDoc('visible');
    mountBadgeClear({ nav, doc });
    doc._fire('visibilitychange');
    expect(nav.clearAppBadge).toHaveBeenCalledTimes(2);
  });

  it('hidden 상태의 visibilitychange 는 미호출', () => {
    const nav = { clearAppBadge: vi.fn(async () => {}) };
    const doc = makeDoc('visible');
    mountBadgeClear({ nav, doc });
    doc.visibilityState = 'hidden';
    doc._fire('visibilitychange');
    expect(nav.clearAppBadge).toHaveBeenCalledTimes(1);
  });

  it('Badging API 미지원 → false, 에러 없음', () => {
    expect(mountBadgeClear({ nav: {}, doc: makeDoc() })).toBe(false);
  });

  it('user 있으면 진입 시 badge_seen_at 기록 (배지 = 이후 새 알림만)', () => {
    const nav = { clearAppBadge: vi.fn(async () => {}) };
    const sb = makeSeenSupabase();
    mountBadgeClear({ nav, doc: makeDoc(), user: USER, supabase: sb });
    expect(sb.from).toHaveBeenCalledWith('today_profiles');
    const [payload] = sb._update.mock.calls[0];
    expect(typeof payload.badge_seen_at).toBe('string');
    expect(sb._eq).toHaveBeenCalledWith('user_id', USER.id);
  });

  it('포그라운드 복귀 시 badge_seen_at 재기록', () => {
    const nav = { clearAppBadge: vi.fn(async () => {}) };
    const sb = makeSeenSupabase();
    const doc = makeDoc('visible');
    mountBadgeClear({ nav, doc, user: USER, supabase: sb });
    doc._fire('visibilitychange');
    expect(sb._update).toHaveBeenCalledTimes(2);
  });

  it('Badging API 미지원이어도 badge_seen_at 은 기록 (앱을 연 사실은 유효)', () => {
    const sb = makeSeenSupabase();
    expect(mountBadgeClear({ nav: {}, doc: makeDoc(), user: USER, supabase: sb })).toBe(false);
    expect(sb._update).toHaveBeenCalledTimes(1);
  });

  it('user 없으면 seen 기록 안 함 (기존 호환)', () => {
    const nav = { clearAppBadge: vi.fn(async () => {}) };
    const sb = makeSeenSupabase();
    mountBadgeClear({ nav, doc: makeDoc(), supabase: sb });
    expect(sb._update).not.toHaveBeenCalled();
  });
});
