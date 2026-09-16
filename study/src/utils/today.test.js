// 활동을 KST(로컬) 날짜로 귀속 — UTC 드리프트(새벽 학습이 전날로 기록) 방지.
// 날짜 계산은 로컬 시간대 전제(gym·today 와 동일). UTC 러너에서도 결정적이도록 TZ 고정.
process.env.TZ = 'Asia/Seoul';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { localISODate } from './today.js';

describe('localISODate — KST(로컬) 날짜 귀속 (UTC 드리프트 방지)', () => {
  it('KST 새벽(전날 UTC)인 순간을 KST 날짜로 귀속한다', () => {
    // 2026-06-21T19:30:00Z = KST 2026-06-22 04:30 → 6/22 (UTC 계산이면 6/21 오답)
    expect(localISODate(new Date('2026-06-21T19:30:00Z'))).toBe('2026-06-22');
  });

  it('낮 시간은 UTC·KST 동일 날짜', () => {
    // 2026-06-22T03:00:00Z = KST 2026-06-22 12:00 → 6/22
    expect(localISODate(new Date('2026-06-22T03:00:00Z'))).toBe('2026-06-22');
  });

  it('월말 경계 — KST 자정 직후(전날 UTC 23:xx)도 다음 달 1일로 귀속', () => {
    // 2026-06-30T15:30:00Z = KST 2026-07-01 00:30 → 7/01
    expect(localISODate(new Date('2026-06-30T15:30:00Z'))).toBe('2026-07-01');
  });
});

/* 2026-09-17 — 앱(탭·PWA)을 닫지 않고 며칠 쓰면 "오늘"이 첫 로드 날짜에 묶여 있었다.
 * 실측: 9/15 18:53 에 저장된 발화 기록이 date=2026-09-14 로, 9/12 21:11 저장분이 date=2026-09-08 로
 * 들어갔고, 홈 캘린더는 그 굳은 날짜를 오늘로 삼아 이후 칸을 미래로 비웠다. */
describe('todayISO — 호출 시점 날짜 (앱을 며칠 열어둬도 굳지 않는다)', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('앱이 로드된 뒤 날짜가 넘어가면 넘어간 날짜를 돌려준다', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-14T21:00:00+09:00'));
    vi.resetModules();
    const mod = await import('./today.js'); // 9/14 저녁에 연 앱
    expect(mod.todayISO()).toBe('2026-09-14');

    vi.setSystemTime(new Date('2026-09-17T02:20:00+09:00')); // 탭을 닫지 않고 사흘
    expect(mod.todayISO()).toBe('2026-09-17');
  });

  it('todayDayNumber 도 호출 시점 날짜를 따른다', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-14T21:00:00+09:00'));
    vi.resetModules();
    const mod = await import('./today.js');
    expect(mod.todayDayNumber()).toBe(14);

    vi.setSystemTime(new Date('2026-09-17T02:20:00+09:00'));
    expect(mod.todayDayNumber()).toBe(17);
  });
});

/* 홈이 떠 있는 채로 날짜가 넘어가면 화면도 따라가야 한다 — 위 수정만으로는 이미 그려진 캘린더가 그대로다. */
describe('watchDayChange — 떠 있는 화면의 날짜 전환 감지', () => {
  afterEach(() => { vi.useRealTimers(); });

  function fakeHost() {
    const listeners = {};
    return {
      addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); },
      removeEventListener: (type, fn) => { listeners[type] = (listeners[type] || []).filter((f) => f !== fn); },
      emit: (type) => { (listeners[type] || []).forEach((f) => f()); },
      count: (type) => (listeners[type] || []).length,
      visibilityState: 'visible',
    };
  }

  it('탭에 복귀했을 때 날짜가 바뀌었으면 새 날짜로 알린다', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-14T21:00:00+09:00'));
    vi.resetModules();
    const { watchDayChange } = await import('./today.js');
    const seen = [];
    const win = fakeHost(); const doc = fakeHost();
    watchDayChange((iso) => seen.push(iso), { win, doc });

    doc.emit('visibilitychange');
    expect(seen).toEqual([]); // 같은 날 복귀는 알리지 않는다

    vi.setSystemTime(new Date('2026-09-15T00:01:00+09:00'));
    doc.emit('visibilitychange');
    expect(seen).toEqual(['2026-09-15']);

    doc.emit('visibilitychange');
    expect(seen).toEqual(['2026-09-15']); // 같은 날 반복 복귀는 한 번만
  });

  it('탭을 켜 둔 채 자정을 넘겨도 주기 점검이 잡아낸다', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-14T23:59:00+09:00'));
    vi.resetModules();
    const { watchDayChange } = await import('./today.js');
    const seen = [];
    const win = fakeHost(); const doc = fakeHost();
    watchDayChange((iso) => seen.push(iso), { win, doc, intervalMs: 60000 });

    vi.setSystemTime(new Date('2026-09-15T00:00:30+09:00'));
    vi.advanceTimersByTime(60000);
    expect(seen).toEqual(['2026-09-15']);
  });

  it('창 포커스 복귀도 같은 판정을 쓴다', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-14T21:00:00+09:00'));
    vi.resetModules();
    const { watchDayChange } = await import('./today.js');
    const seen = [];
    const win = fakeHost(); const doc = fakeHost();
    watchDayChange((iso) => seen.push(iso), { win, doc });

    vi.setSystemTime(new Date('2026-09-17T02:20:00+09:00'));
    win.emit('focus');
    expect(seen).toEqual(['2026-09-17']);
  });

  it('정리 함수는 리스너와 타이머를 모두 거둔다', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-14T21:00:00+09:00'));
    vi.resetModules();
    const { watchDayChange } = await import('./today.js');
    const seen = [];
    const win = fakeHost(); const doc = fakeHost();
    const stop = watchDayChange((iso) => seen.push(iso), { win, doc, intervalMs: 60000 });
    stop();

    expect(doc.count('visibilitychange')).toBe(0);
    expect(win.count('focus')).toBe(0);
    vi.setSystemTime(new Date('2026-09-15T00:01:00+09:00'));
    vi.advanceTimersByTime(60000);
    expect(seen).toEqual([]);
  });
});
