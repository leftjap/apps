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
