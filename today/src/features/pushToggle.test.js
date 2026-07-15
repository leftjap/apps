/**
 * pushToggle.js 단위 테스트 — 구독 상태 → 메뉴 라벨/동작 (순수 로직) + 마운트 클릭 배선.
 */
import { describe, it, expect, vi } from 'vitest';
import { pushToggleLabel, mountPushToggle } from './pushToggle.js';

describe('pushToggleLabel', () => {
  it('미지원 → disabled + 미지원 문구', () => {
    const r = pushToggleLabel({ supported: false, permission: 'default', subscribed: false });
    expect(r.disabled).toBe(true);
    expect(r.sub).toMatch(/미지원/);
  });
  it('권한 거부 → disabled + 거부 문구', () => {
    const r = pushToggleLabel({ supported: true, permission: 'denied', subscribed: false });
    expect(r.disabled).toBe(true);
    expect(r.sub).toMatch(/거부/);
  });
  it('구독됨 → 켜짐 + on:true', () => {
    const r = pushToggleLabel({ supported: true, permission: 'granted', subscribed: true });
    expect(r.on).toBe(true);
    expect(r.sub).toMatch(/켜짐/);
  });
  it('미구독 → 꺼짐 + on:false', () => {
    const r = pushToggleLabel({ supported: true, permission: 'default', subscribed: false });
    expect(r.on).toBe(false);
    expect(r.sub).toMatch(/꺼짐/);
  });
});

describe('mountPushToggle', () => {
  function makeDoc(item) {
    return { getElementById: (id) => (id === 'pushToggleItem' ? item : null) };
  }
  function makeItem() {
    const listeners = {};
    return {
      _l: listeners,
      addEventListener: (t, h) => { listeners[t] = h; },
      setAttribute: vi.fn(),
      querySelector: vi.fn(() => ({ textContent: '' })),
      dispatchEvent: (t) => listeners[t] && listeners[t]({ preventDefault() {} }),
    };
  }

  it('미구독 상태에서 클릭 → enablePush 호출', async () => {
    const item = makeItem();
    const enablePush = vi.fn(async () => ({ ok: true }));
    const disablePush = vi.fn(async () => ({ ok: true }));
    const getPushStatus = vi.fn(async () => ({ supported: true, permission: 'default', subscribed: false }));
    const user = { id: 'u1' };

    await mountPushToggle(user, { doc: makeDoc(item), enablePush, disablePush, getPushStatus });
    await item._l.click({ preventDefault() {} });

    expect(enablePush).toHaveBeenCalledWith(user);
    expect(disablePush).not.toHaveBeenCalled();
  });

  it('구독 상태에서 클릭 → disablePush 호출', async () => {
    const item = makeItem();
    const enablePush = vi.fn(async () => ({ ok: true }));
    const disablePush = vi.fn(async () => ({ ok: true }));
    const getPushStatus = vi.fn(async () => ({ supported: true, permission: 'granted', subscribed: true }));

    await mountPushToggle({ id: 'u1' }, { doc: makeDoc(item), enablePush, disablePush, getPushStatus });
    await item._l.click({ preventDefault() {} });

    expect(disablePush).toHaveBeenCalled();
    expect(enablePush).not.toHaveBeenCalled();
  });

  it('토글 아이템 없으면 no-op (에러 없음)', async () => {
    const res = await mountPushToggle({ id: 'u1' }, {
      doc: { getElementById: () => null },
      enablePush: vi.fn(), disablePush: vi.fn(),
      getPushStatus: vi.fn(async () => ({ supported: true, permission: 'default', subscribed: false })),
    });
    expect(res.found).toBe(false);
  });
});
