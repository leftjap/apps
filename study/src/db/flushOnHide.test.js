import { describe, it, expect, vi } from 'vitest';
import { installFlushOnHide } from './flushOnHide.js';

// 탭 종료/숨김 시 in-memory 업로드 큐(3초 debounce)를 flush — 미설치 시 그 창에서 유실.
// today PWA(main.js beforeunload flush) 정합. study 엔 없어 로그인 상태 유실 위험(AT_RISK).
function fakeWin() {
  const handlers = {};
  return {
    addEventListener: (ev, fn) => { (handlers[ev] ||= []).push(fn); },
    fire: (ev) => (handlers[ev] || []).forEach((fn) => fn()),
    handlers,
  };
}

describe('installFlushOnHide', () => {
  it('pagehide·beforeunload·visibilitychange 를 등록한다', () => {
    const win = fakeWin();
    installFlushOnHide(() => {}, win, { visibilityState: 'visible' });
    expect(win.handlers.pagehide).toBeTruthy();
    expect(win.handlers.beforeunload).toBeTruthy();
    expect(win.handlers.visibilitychange).toBeTruthy();
  });

  it('pagehide 발생 시 flush 를 호출한다', () => {
    const win = fakeWin();
    const flush = vi.fn();
    installFlushOnHide(flush, win, { visibilityState: 'visible' });
    win.fire('pagehide');
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it('visibilitychange 는 hidden 일 때만 flush 한다', () => {
    const win = fakeWin();
    const flush = vi.fn();
    const doc = { visibilityState: 'visible' };
    installFlushOnHide(flush, win, doc);
    win.fire('visibilitychange');           // 아직 visible
    expect(flush).not.toHaveBeenCalled();
    doc.visibilityState = 'hidden';
    win.fire('visibilitychange');           // 이제 hidden
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it('flush 가 throw 해도 삼켜서 언로드를 막지 않는다', () => {
    const win = fakeWin();
    installFlushOnHide(() => { throw new Error('boom'); }, win, { visibilityState: 'visible' });
    expect(() => win.fire('pagehide')).not.toThrow();
  });
});
