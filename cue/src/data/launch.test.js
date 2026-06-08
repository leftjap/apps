import { describe, it, expect, vi } from 'vitest';
import { launchHabit } from './launch.js';

describe('launchHabit — 카드 탭 행동 (데모 순환 / 앱 URL 실행 / iPhone 무동작)', () => {
  it('데모 모드: 상태순환(onDemo) 호출, 앱 안 엶', () => {
    const onDemo = vi.fn(); const open = vi.fn();
    const r = launchHabit({ habit: { url: 'https://x' }, demoMode: true, onDemo, open });
    expect(onDemo).toHaveBeenCalledTimes(1);
    expect(open).not.toHaveBeenCalled();
    expect(r).toBe('demo');
  });
  it('실모드 + url 있음: window.open(url, _blank, noopener) 호출', () => {
    const onDemo = vi.fn(); const open = vi.fn();
    const r = launchHabit({ habit: { url: 'https://leftjap.github.io/apps/study/' }, demoMode: false, onDemo, open });
    expect(open).toHaveBeenCalledWith('https://leftjap.github.io/apps/study/', '_blank', 'noopener');
    expect(onDemo).not.toHaveBeenCalled();
    expect(r).toBe('open');
  });
  it('실모드 + url 없음(운동 iPhone 전용): 아무것도 안 함', () => {
    const onDemo = vi.fn(); const open = vi.fn();
    const r = launchHabit({ habit: { url: null, device: 'iPhone' }, demoMode: false, onDemo, open });
    expect(open).not.toHaveBeenCalled();
    expect(onDemo).not.toHaveBeenCalled();
    expect(r).toBe('device-only');
  });
});
