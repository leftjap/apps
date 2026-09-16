// @vitest-environment jsdom
/**
 * home.dayRollover.test.js — 홈을 띄워 둔 채 날짜가 넘어갔을 때 (2026-09-17).
 *
 * 실사고: 탭·PWA 를 닫지 않고 며칠 쓰면 앱의 '오늘'이 첫 로드 날짜에 묶여, 9/15 학습이
 * date=2026-09-14 로 저장되고 홈 캘린더는 그 뒤 칸을 미래로 비웠다. 날짜 계산을 호출 시점으로
 * 바꾼 것만으로는 이미 그려진 캘린더가 어제 그대로이므로, 떠 있는 화면도 따라가는지 못 박는다.
 */
process.env.TZ = 'Asia/Seoul';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// 데모 픽스처는 todayISO 를 '2026-06-12' 로 박아 두므로 쓸 수 없다 — 실제 경로(비데모)로 띄우고
// studyDB 를 두지 않아 loadStats 가 일찍 null 로 빠지게 한다 (캘린더는 빈 칸으로 그려진다).
vi.mock('../db/sync.js', () => ({ Sync: { currentSyncHealth: () => null } }));
const { mountHome } = await import('./home.js');

/** 캘린더에서 '오늘' 로 칠해진 칸의 날짜 숫자. */
function todayCellNumber(host) {
  return host.querySelector('.vh-cell.today .dt')?.textContent ?? null;
}

describe('home — 날짜가 넘어가면 떠 있는 캘린더도 따라간다', () => {
  let host, cleanup;

  beforeEach(() => {
    document.body.innerHTML = '';
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  afterEach(() => {
    try { cleanup?.(); } catch { /* noop */ }
    vi.useRealTimers();
  });

  it('자정을 넘기면 오늘 칸이 새 날짜로 옮겨간다', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-14T21:00:00+09:00'));
    cleanup = mountHome(host);
    expect(todayCellNumber(host)).toBe('14');

    vi.setSystemTime(new Date('2026-09-15T00:01:00+09:00'));
    vi.advanceTimersByTime(60_000);
    expect(todayCellNumber(host)).toBe('15');
  });

  it('탭에 복귀했을 때 며칠이 지났으면 그 날짜로 맞춘다', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-14T21:00:00+09:00'));
    cleanup = mountHome(host);
    expect(todayCellNumber(host)).toBe('14');

    vi.setSystemTime(new Date('2026-09-17T02:20:00+09:00')); // 사흘 뒤 복귀
    document.dispatchEvent(new Event('visibilitychange'));
    expect(todayCellNumber(host)).toBe('17');
  });

  it('언마운트 뒤에는 더 이상 다시 그리지 않는다', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-14T21:00:00+09:00'));
    cleanup = mountHome(host);
    cleanup();
    cleanup = null;

    vi.setSystemTime(new Date('2026-09-15T00:01:00+09:00'));
    expect(() => vi.advanceTimersByTime(60_000)).not.toThrow();
    expect(host.querySelector('.vh-cell')).toBeNull(); // 정리된 host 에 다시 그리지 않는다
  });
});
