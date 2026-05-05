/**
 * notifications.js 단위 테스트 (Wave 11.7.3c-1 — 알림 미읽음 배지 wiring).
 *
 * 범위:
 *   - applyBadge — count 0 / count > 0 / null button
 *   - findAlertBellButton — alert-dot 자식 매칭 (DOM-less 환경에선 skip)
 *   - mountNotificationsView — user 누락 no-op
 *   - 인터페이스 노출
 *
 * 비대상 (e2e 영역):
 *   - findAlertBellButton DOM 매칭 (jsdom 미도입 → e2e)
 *   - updateAlertBadge 의 Dexie countUnreadNotifications (e2e)
 */
import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import {
  Notifications,
  applyBadge,
  mountNotificationsView,
  formatRelativeTime,
  buildNotifRowHtml,
  handleNotifClick,
  handleRealtimeNotificationChange,
} from './notifications.js';

describe('Notifications 인터페이스 노출', () => {
  it('필수 멤버 노출 (Wave 11.7.3c-1 + c-2)', () => {
    const expected = [
      'findAlertBellButton', 'updateAlertBadge', 'applyBadge',
      'mountNotificationsView', 'refreshAlertBadge',
      // Wave 11.7.3c-2
      'formatRelativeTime', 'buildNotifRowHtml',
      'injectNotifDropdownStyles', 'injectNotifDropdown',
      'renderNotifDropdown',
      'openNotifDropdown', 'closeNotifDropdown', 'toggleNotifDropdown',
      'markAllReadAndRefresh', 'installBellClickHandler',
      // Wave 11.7.3c-3
      'handleNotifClick',
      // Wave 11.7.3c-4
      'handleRealtimeNotificationChange',
    ];
    for (const k of expected) {
      expect(Notifications, `Notifications.${k} 누락`).toHaveProperty(k);
    }
  });
});

describe('mountNotificationsView', () => {
  it('user 누락 시 no-op (throw 없음)', async () => {
    await expect(mountNotificationsView(null)).resolves.toBeUndefined();
    await expect(mountNotificationsView({})).resolves.toBeUndefined();
  });
});

describe('applyBadge — count → 클래스 + title 동기화', () => {
  function makeFakeButton() {
    const classList = new Set();
    const attrs = {};
    return {
      classList: {
        add: (c) => classList.add(c),
        remove: (c) => classList.delete(c),
        contains: (c) => classList.has(c),
      },
      setAttribute: (k, v) => { attrs[k] = v; },
      getAttribute: (k) => attrs[k],
      _classList: classList,
      _attrs: attrs,
    };
  }

  it('count > 0 → has-alert 클래스 + 본문 갱신', () => {
    const btn = makeFakeButton();
    const ok = applyBadge(btn, 3);
    expect(ok).toBe(true);
    expect(btn._classList.has('sb__icon-btn--has-alert')).toBe(true);
    expect(btn._attrs.title).toBe('새 알림 3개');
  });

  it('count = 0 → 클래스 제거 + title 변경', () => {
    const btn = makeFakeButton();
    btn.classList.add('sb__icon-btn--has-alert');
    applyBadge(btn, 0);
    expect(btn._classList.has('sb__icon-btn--has-alert')).toBe(false);
    expect(btn._attrs.title).toBe('알림');
  });

  it('count null/undefined → 0 처리 (클래스 제거)', () => {
    const btn = makeFakeButton();
    btn.classList.add('sb__icon-btn--has-alert');
    applyBadge(btn, null);
    expect(btn._classList.has('sb__icon-btn--has-alert')).toBe(false);
    expect(btn._attrs.title).toBe('알림');
    applyBadge(btn, undefined);
    expect(btn._classList.has('sb__icon-btn--has-alert')).toBe(false);
  });

  it('count 음수 → 0 처리 (NaN 안전)', () => {
    const btn = makeFakeButton();
    applyBadge(btn, -1);
    expect(btn._attrs.title).toBe('알림');
    applyBadge(btn, NaN);
    expect(btn._attrs.title).toBe('알림');
  });

  it('button null → false 반환', () => {
    expect(applyBadge(null, 5)).toBe(false);
    expect(applyBadge(undefined, 5)).toBe(false);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Wave 11.7.3c-2 — 어댑터 (formatRelativeTime / buildNotifRowHtml)
// ───────────────────────────────────────────────────────────────────────────

describe('formatRelativeTime — 상대 시간 포맷', () => {
  const NOW = new Date('2026-04-30T10:00:00Z');

  it('60초 미만 → "방금"', () => {
    expect(formatRelativeTime('2026-04-30T10:00:00Z', NOW)).toBe('방금');
    expect(formatRelativeTime('2026-04-30T09:59:30Z', NOW)).toBe('방금');
  });

  it('60초 이상 60분 미만 → "N분 전"', () => {
    expect(formatRelativeTime('2026-04-30T09:59:00Z', NOW)).toBe('1분 전');
    expect(formatRelativeTime('2026-04-30T09:30:00Z', NOW)).toBe('30분 전');
    expect(formatRelativeTime('2026-04-30T09:01:00Z', NOW)).toBe('59분 전');
  });

  it('60분 이상 24시간 미만 → "N시간 전"', () => {
    expect(formatRelativeTime('2026-04-30T09:00:00Z', NOW)).toBe('1시간 전');
    expect(formatRelativeTime('2026-04-29T15:00:00Z', NOW)).toBe('19시간 전');
  });

  it('24시간 이상 7일 미만 → "N일 전"', () => {
    expect(formatRelativeTime('2026-04-29T10:00:00Z', NOW)).toBe('1일 전');
    expect(formatRelativeTime('2026-04-25T10:00:00Z', NOW)).toBe('5일 전');
  });

  it('7일 이상 → "MM/DD"', () => {
    expect(formatRelativeTime('2026-04-22T10:00:00Z', NOW)).toBe('04/22');
    expect(formatRelativeTime('2026-01-15T10:00:00Z', NOW)).toBe('01/15');
  });

  it('null / 잘못된 입력 → ""', () => {
    expect(formatRelativeTime(null, NOW)).toBe('');
    expect(formatRelativeTime(undefined, NOW)).toBe('');
    expect(formatRelativeTime('not-iso', NOW)).toBe('');
    expect(formatRelativeTime('', NOW)).toBe('');
  });
});

describe('buildNotifRowHtml — 알림 행 HTML', () => {
  const NOW = new Date('2026-04-30T10:00:00Z');

  it('정상 row — preview / time / data-notif-id / data-entry-id', () => {
    const html = buildNotifRowHtml({
      id: 'notif-1',
      entry_id: 'entry-x',
      preview: '소연이 새 글을 공유했어요',
      created_at: '2026-04-30T09:30:00Z',
      read_at: null,
    }, NOW);
    expect(html).toContain('data-notif-id="notif-1"');
    expect(html).toContain('data-entry-id="entry-x"');
    expect(html).toContain('소연이 새 글을 공유했어요');
    expect(html).toContain('30분 전');
    expect(html).toContain('notif-dropdown__unread-dot"'); // is-read 없음
  });

  it('읽음 row — is-read 클래스 추가', () => {
    const html = buildNotifRowHtml({
      id: 'notif-2',
      preview: '읽음 알림',
      created_at: '2026-04-30T09:00:00Z',
      read_at: '2026-04-30T09:05:00Z',
    }, NOW);
    expect(html).toContain('notif-dropdown__unread-dot is-read');
  });

  it('preview 누락 → "(미리보기 없음)"', () => {
    const html = buildNotifRowHtml({
      id: 'x',
      created_at: '2026-04-30T09:50:00Z',
      read_at: null,
    }, NOW);
    expect(html).toContain('(미리보기 없음)');
  });

  it('preview HTML escape', () => {
    const html = buildNotifRowHtml({
      id: 'x',
      preview: '<img onerror=1>',
      created_at: '2026-04-30T09:50:00Z',
      read_at: null,
    }, NOW);
    expect(html).toContain('&lt;img onerror=1&gt;');
    expect(html).not.toContain('<img onerror=1>');
  });

  it('entry_id 누락 → 빈 문자열', () => {
    const html = buildNotifRowHtml({
      id: 'x',
      preview: 'p',
      created_at: '2026-04-30T09:50:00Z',
      read_at: null,
    }, NOW);
    expect(html).toContain('data-entry-id=""');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Wave 11.7.3c-3 — 딥링크 (handleNotifClick)
// DOM 의존 검증은 e2e. 여기선 entry_id 가드.
// ───────────────────────────────────────────────────────────────────────────

describe('handleNotifClick — entry_id 가드', () => {
  it('entry_id 누락 → reason no_entry_id', async () => {
    const result = await handleNotifClick({ id: 'n1' });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('no_entry_id');
  });

  it('null notif → reason no_entry_id', async () => {
    const result = await handleNotifClick(null);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('no_entry_id');
  });

  it('빈 entry_id → reason no_entry_id', async () => {
    const result = await handleNotifClick({ id: 'x', entry_id: '' });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('no_entry_id');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Wave 11.7.3c-4 — Realtime 자동 갱신
// DOM 접근은 우회 (default doc lazy 가드 — node 환경 'no_document' 반환)
// ───────────────────────────────────────────────────────────────────────────

describe('handleRealtimeNotificationChange — table 필터 + recipient 가드', () => {
  it('payload 없음 / table mismatch → applied false', async () => {
    expect((await handleRealtimeNotificationChange(null)).reason).toBe('no_document');
    // doc 명시 (단순 stub)
    const stubDoc = { getElementById: () => null };
    const r1 = await handleRealtimeNotificationChange(null, stubDoc);
    expect(r1.applied).toBe(false);
    expect(r1.reason).toBe('table_mismatch');
    const r2 = await handleRealtimeNotificationChange({ table: 'today_entries' }, stubDoc);
    expect(r2.applied).toBe(false);
    expect(r2.reason).toBe('table_mismatch');
    expect(r2.table).toBe('today_entries');
  });

  it('today_notifications 매치 — recipient 다른 사용자면 not_recipient', async () => {
    const stubDoc = { getElementById: () => null };
    // _currentUser 는 mountNotificationsView 가 set. 직전 케이스에서 set 안 했으면 null.
    // 명시 mount.
    Notifications.mountNotificationsView({ id: 'OWNER-AAA' });
    const result = await handleRealtimeNotificationChange({
      table: 'today_notifications',
      eventType: 'INSERT',
      new: { id: 'n-X', recipient_id: 'OTHER-BBB', preview: 'p', read_at: null },
    }, stubDoc);
    expect(result.applied).toBe(false);
    expect(result.reason).toBe('not_recipient');
  });

  it('today_notifications 매치 + recipient 본인 — refreshAlertBadge 시도', async () => {
    // updateAlertBadge 는 button 부재 시 found false → query_error/no_button 단순 반환
    const stubDoc = {
      getElementById: () => null,
      querySelectorAll: () => [], // findAlertBellButton 호출 시 빈 배열
    };
    Notifications.mountNotificationsView({ id: 'OWNER-AAA' });
    const result = await handleRealtimeNotificationChange({
      table: 'today_notifications',
      eventType: 'INSERT',
      new: { id: 'n-Y', recipient_id: 'OWNER-AAA', preview: 'p', read_at: null },
    }, stubDoc);
    // 회귀 2 fix — dropdown 닫혀있어도 list re-fetch 시도 (closed dropdown 재렌더 정책 변경).
    // refresh 자체는 시도됨 (applied=true).
    expect(result.applied).toBe(true);
    expect(result.reason).toBe('refreshed');
  });
});
