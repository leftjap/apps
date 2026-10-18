/**
 * send-push/logic.js 단위 테스트 — 웹훅 record → 전송 여부 + 알림 페이로드 (순수 로직).
 */
import { describe, it, expect } from 'vitest';
import { shouldPush, buildPushPayload, PUSHABLE_KINDS } from './logic.js';

const baseRow = {
  id: 'n1',
  recipient_id: 'u-gio',
  kind: 'new_comment',
  entry_id: 'e1',
  comment_id: 'c1',
  preview: '오늘 저녁 뭐 먹지',
};

describe('shouldPush', () => {
  it('new_comment + recipient → true', () => {
    expect(shouldPush(baseRow)).toBe(true);
  });
  it('푸시 대상 아닌 kind(reaction 등) → false', () => {
    expect(shouldPush({ ...baseRow, kind: 'reaction' })).toBe(false);
    expect(shouldPush({ ...baseRow, kind: 'entry_unshared' })).toBe(false);
  });
  it('recipient 없음 → false', () => {
    expect(shouldPush({ ...baseRow, recipient_id: null })).toBe(false);
  });
  it('null/undefined → false', () => {
    expect(shouldPush(null)).toBe(false);
    expect(shouldPush(undefined)).toBe(false);
  });
  it('PUSHABLE_KINDS 에 new_comment 포함', () => {
    expect(PUSHABLE_KINDS.has('new_comment')).toBe(true);
  });
});

describe('buildPushPayload', () => {
  it('preview 있으면 body=preview, tag=comment 기준, data 에 id들', () => {
    const p = buildPushPayload(baseRow);
    expect(p.body).toBe('오늘 저녁 뭐 먹지');
    expect(p.tag).toBe('comment-c1');
    expect(p.data).toMatchObject({
      notificationId: 'n1',
      entryId: 'e1',
      commentId: 'c1',
      recipientId: 'u-gio',
    });
    expect(typeof p.title).toBe('string');
    expect(p.title.length).toBeGreaterThan(0);
  });
  it('preview 비면 fallback body', () => {
    const p = buildPushPayload({ ...baseRow, preview: '   ' });
    expect(p.body.length).toBeGreaterThan(0);
    expect(p.body).not.toBe('   ');
  });
  it('badge = 서버 미읽음 수 (앱 아이콘 배지 정본)', () => {
    expect(buildPushPayload(baseRow, 3).badge).toBe(3);
    expect(buildPushPayload(baseRow, 0).badge).toBe(0);
  });
  it('badge 미지정 시 필드 없음(하위호환)', () => {
    expect('badge' in buildPushPayload(baseRow)).toBe(false);
  });
});

describe('new_post — 클로드 자동댓글(글 완성 신호) 시점 발사', () => {
  const postRow = {
    id: 'n2',
    recipient_id: 'u-gio',
    kind: 'new_post',
    entry_id: 'e1',
    comment_id: null,
    preview: '오늘은 미서부다',
  };
  it('new_post + recipient → true', () => {
    expect(shouldPush(postRow)).toBe(true);
  });
  it('payload: 제목=새 글, tag=post-<entry>, body=preview', () => {
    const p = buildPushPayload(postRow);
    expect(p.title).toBe('새 글');
    expect(p.tag).toBe('post-e1');
    expect(p.body).toBe('오늘은 미서부다');
    expect(p.data).toMatchObject({ notificationId: 'n2', entryId: 'e1', recipientId: 'u-gio' });
  });
  it('HTML preview → 태그 제거 (글 본문은 contenteditable HTML)', () => {
    const p = buildPushPayload({ ...postRow, preview: '<br><div>오늘은</div>&nbsp;미서부다' });
    expect(p.body).toBe('오늘은 미서부다');
  });
  it('빈/태그뿐 preview → fallback body', () => {
    expect(buildPushPayload({ ...postRow, preview: '<br><div><br></div>' }).body).toBe('새 글이 올라왔어요');
    expect(buildPushPayload({ ...postRow, preview: '' }).body).toBe('새 글이 올라왔어요');
  });
});

// Service health notifications must never accept the normal webhook credential.
import * as pushLogic from './logic.js';
describe('private ingest health push', () => {
  const recipient = '11111111-1111-4111-8111-111111111111';
  const body = { type: 'ingest_gap', recipient_id: recipient };
  const secrets = { serviceKey: 'service-test', webhookSecret: 'webhook-test' };
  it('requires service authorization for the generic expense warning', () => {
    expect(pushLogic.authorizePushRequest).toBeTypeOf('function');
    expect(pushLogic.authorizePushRequest(new Headers({ Authorization: 'Bearer service-test' }), body, secrets)).toBe('ingest_gap');
    expect(pushLogic.authorizePushRequest(new Headers({ 'X-Push-Secret': 'webhook-test' }), body, secrets)).toBe(null);
    expect(pushLogic.authorizePushRequest(new Headers({ Authorization: 'Bearer anon-test' }), body, secrets)).toBe(null);
    expect(pushLogic.authorizePushRequest(new Headers(), body, {})).toBe(null);
  });
  it('preserves webhook authorization for normal comments and posts', () => {
    expect(pushLogic.authorizePushRequest).toBeTypeOf('function');
    expect(pushLogic.authorizePushRequest(new Headers({ 'X-Push-Secret': 'webhook-test' }), { record: baseRow }, secrets)).toBe('webhook');
  });
  it('builds a fixed private warning that cannot echo supplied sensitive details', () => {
    expect(pushLogic.buildIngestGapPayload).toBeTypeOf('function');
    const p = pushLogic.buildIngestGapPayload({ preview: 'PRIVATE', card: 'PRIVATE_CARD' });
    expect(p.data).toEqual({ section: 'expense' });
    expect(JSON.stringify(p)).not.toContain('PRIVATE');
    expect(p.title).toContain('가계부');
  });
});

describe('delivery result accounting', () => {
  it('counts expired subscriptions separately and reports a real transport failure', async () => {
    expect(pushLogic.deliverPushMessages).toBeTypeOf('function');
    const removed = [];
    const results = await pushLogic.deliverPushMessages([
      { endpoint: 'ok' }, { endpoint: 'expired' }, { endpoint: 'failed' },
    ], 'generic', {
      send: async (sub, payload) => {
        expect(payload).toBe('generic');
        if (sub.endpoint === 'expired') throw new Error('410 Gone');
        if (sub.endpoint === 'failed') throw new Error('temporary transport failure');
      },
      prune: async (sub) => removed.push(sub.endpoint),
    });
    expect(results).toEqual({ status: 'partial', sent: 1, pruned: 1, failed: 1, total: 3 });
    expect(removed).toEqual(['expired']);
  });
  it('does not report ok when every subscription fails', async () => {
    expect(pushLogic.deliverPushMessages).toBeTypeOf('function');
    expect(await pushLogic.deliverPushMessages([{ endpoint: 'failed' }], 'generic', {
      send: async () => { throw new Error('unavailable'); }, prune: async () => {},
    })).toEqual({ status: 'delivery_failed', sent: 0, pruned: 0, failed: 1, total: 1 });
  });
});

describe('alternate valid project service credentials', () => {
  const body = { type: 'ingest_gap', recipient_id: '11111111-1111-4111-8111-111111111111' };
  const secrets = { serviceKey: 'current-service', webhookSecret: 'webhook', supabaseUrl: 'https://project.example.test' };
  it('accepts an alternate service credential only after same-project admin authentication succeeds', async () => {
    expect(pushLogic.authenticatePushRequest).toBeTypeOf('function');
    let cancelled = false;
    const result = await pushLogic.authenticatePushRequest(new Headers({ Authorization: 'Bearer alternate-service' }), body, {
      ...secrets,
      fetcher: async (url, options) => {
        expect(url).toBe('https://project.example.test/auth/v1/admin/users?page=1&per_page=1');
        expect(options.headers).toMatchObject({ Authorization: 'Bearer alternate-service', apikey: 'alternate-service' });
        return { status: 200, body: { cancel: async () => { cancelled = true; } }, json: () => { throw new Error('private admin data must never be read'); } };
      },
    });
    expect(result).toBe('ingest_gap');
    expect(cancelled).toBe(true);
  });
  it.each([401, 403, 500])('rejects invalid, anon, user or unavailable admin authentication (%i)', async (status) => {
    expect(pushLogic.authenticatePushRequest).toBeTypeOf('function');
    expect(await pushLogic.authenticatePushRequest(new Headers({ Authorization: 'Bearer untrusted-token' }), body, {
      ...secrets, fetcher: async () => ({ status, body: { cancel: async () => {} } }),
    })).toBe(null);
  });
  it('fails closed on a network error and never treats a decoded role claim as authorization', async () => {
    expect(pushLogic.authenticatePushRequest).toBeTypeOf('function');
    expect(await pushLogic.authenticatePushRequest(new Headers({ Authorization: 'Bearer forged.service_role.signature' }), body, {
      ...secrets, fetcher: async () => { throw new Error('network unavailable'); },
    })).toBe(null);
  });
  it('uses the current key and existing webhook fast paths without an admin request', async () => {
    expect(pushLogic.authenticatePushRequest).toBeTypeOf('function');
    const fetcher = async () => { throw new Error('must not contact admin for fast path'); };
    expect(await pushLogic.authenticatePushRequest(new Headers({ Authorization: 'Bearer current-service' }), body, { ...secrets, fetcher })).toBe('ingest_gap');
    expect(await pushLogic.authenticatePushRequest(new Headers({ 'X-Push-Secret': 'webhook' }), { record: baseRow }, { ...secrets, fetcher })).toBe('webhook');
    expect(await pushLogic.authenticatePushRequest(new Headers({ 'X-Push-Secret': 'webhook' }), body, { ...secrets, fetcher })).toBe(null);
  });
});
