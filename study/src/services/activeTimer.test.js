import { describe, it, expect } from 'vitest';
import { createActiveTimer, IDLE_MS } from './activeTimer.js';

/** 주입 시계 — advance(ms) 로 전진 */
function fakeClock(start = 0) {
  let t = start;
  const now = () => t;
  now.advance = (ms) => { t += ms; };
  return now;
}

describe('createActiveTimer', () => {
  it('가시+활동 중엔 경과가 그대로 누적', () => {
    const now = fakeClock();
    const timer = createActiveTimer(now);
    now.advance(10_000);
    expect(timer.seconds()).toBe(10);
    now.advance(5_000);
    expect(timer.seconds()).toBe(15);
  });

  it('hidden 구간은 누적 안 함 — 복귀 후 재개', () => {
    const now = fakeClock();
    const timer = createActiveTimer(now);
    now.advance(10_000);
    timer.setHidden(true);
    now.advance(60_000); // 1분 탭 숨김 — 미계상
    timer.setHidden(false);
    now.advance(5_000);
    expect(timer.seconds()).toBe(15);
  });

  it('마지막 활동 후 IDLE_MS 초과분은 누적 안 함 (유예 구간까지만)', () => {
    const now = fakeClock();
    const timer = createActiveTimer(now);
    timer.activity();
    now.advance(IDLE_MS); // 유예 5분 — 계상
    now.advance(30 * 60_000); // 이후 30분 방치 — 미계상
    expect(timer.seconds()).toBe(IDLE_MS / 1000);
    timer.activity(); // 활동 재개
    now.advance(10_000);
    expect(timer.seconds()).toBe(IDLE_MS / 1000 + 10);
  });

  it('유휴 경계에 걸친 단일 샘플은 유예분만 계상 (한 번에 7분 경과 → 5분만)', () => {
    const now = fakeClock();
    const timer = createActiveTimer(now);
    timer.activity();
    now.advance(7 * 60_000); // 샘플 없이 7분 — 유예 5분만 인정
    expect(timer.seconds()).toBe(IDLE_MS / 1000);
  });

  it('restore(sec) 는 누적을 시드 — 복원해도 방치 시간은 0부터', () => {
    const now = fakeClock();
    const timer = createActiveTimer(now);
    timer.restore(42);
    expect(timer.seconds()).toBe(42);
    now.advance(8_000);
    expect(timer.seconds()).toBe(50);
  });

  it('restore 비정상값(NaN/음수) → 0', () => {
    const now = fakeClock();
    const timer = createActiveTimer(now);
    timer.restore(NaN);
    expect(timer.seconds()).toBe(0);
    timer.restore(-10);
    expect(timer.seconds()).toBe(0);
  });
});
