/**
 * writingClock.js 단위 테스트 — 글쓰기 시간 세는 규칙 (시각을 인자로 받는 순수 로직).
 */
import { describe, it, expect } from 'vitest';
import {
  IDLE_MS,
  AWAY_GRACE_MS,
  createClock,
  onInput,
  setWriting,
  setFront,
  advance,
  drain,
  restore,
  formatDuration,
} from './writingClock.js';

const MIN = 60 * 1000;
const T0 = new Date(2026, 10, 29, 14, 0).getTime();

function seconds(clock) {
  return drain(clock).reduce((sum, r) => sum + r.seconds, 0);
}

function startWriting(t = T0) {
  const c = createClock();
  setWriting(c, true, t);
  onInput(c, t);
  return c;
}

describe('writingClock — 시간 규칙', () => {
  it('상수: 무입력 10분, 자리 비움 허용 5분', () => {
    expect(IDLE_MS).toBe(10 * MIN);
    expect(AWAY_GRACE_MS).toBe(5 * MIN);
  });

  it('입력이 이어지면 흐른 시간을 그대로 센다', () => {
    const c = startWriting();
    for (let i = 1; i <= 5; i++) onInput(c, T0 + i * MIN);
    advance(c, T0 + 5 * MIN);
    expect(seconds(c)).toBe(300);
  });

  it('10분 무입력이면 멈추고, 다음 입력부터 다시 센다', () => {
    const c = startWriting();
    advance(c, T0 + 30 * MIN);
    expect(seconds(c)).toBe(600);
    onInput(c, T0 + 40 * MIN);
    advance(c, T0 + 45 * MIN);
    expect(seconds(c)).toBe(300);
  });

  it('5분 안에 돌아오면 나가 있던 시간을 포함한다', () => {
    const c = startWriting();
    setFront(c, false, T0 + 2 * MIN);
    setFront(c, true, T0 + 6 * MIN);
    onInput(c, T0 + 6 * MIN);
    advance(c, T0 + 7 * MIN);
    expect(seconds(c)).toBe(7 * 60);
  });

  it('5분을 넘겨 돌아오면 나가 있던 시간은 0으로 친다', () => {
    const c = startWriting();
    setFront(c, false, T0 + 2 * MIN);
    setFront(c, true, T0 + 9 * MIN);
    onInput(c, T0 + 9 * MIN);
    advance(c, T0 + 10 * MIN);
    expect(seconds(c)).toBe(3 * 60);
  });

  it('나가 있는 동안 저장해도 돌아왔을 때 이중으로 세지 않는다', () => {
    const c = startWriting();
    setFront(c, false, T0 + 2 * MIN);
    expect(seconds(c)).toBe(120); // pagehide 저장
    advance(c, T0 + 3 * MIN); // 숨김 중 타이머
    setFront(c, true, T0 + 4 * MIN);
    expect(seconds(c)).toBe(120);
  });

  it('blur 와 visibilitychange 가 겹쳐도 나간 시각은 처음 것으로 본다', () => {
    const c = startWriting();
    setFront(c, false, T0 + 2 * MIN);
    setFront(c, false, T0 + 3 * MIN);
    setFront(c, true, T0 + 8 * MIN); // 처음 나간 뒤 6분 → 포함 안 함
    expect(seconds(c)).toBe(120);
  });

  it('글 화면이 닫히면 세지 않는다', () => {
    const c = startWriting();
    onInput(c, T0 + 1 * MIN);
    setWriting(c, false, T0 + 2 * MIN);
    onInput(c, T0 + 3 * MIN);
    advance(c, T0 + 5 * MIN);
    expect(seconds(c)).toBe(120);
  });

  it('자정을 넘기면 두 날짜로 나눈다', () => {
    const start = new Date(2026, 10, 29, 23, 55).getTime();
    const c = startWriting(start);
    for (let i = 1; i <= 10; i++) onInput(c, start + i * MIN);
    advance(c, start + 10 * MIN);
    expect(drain(c)).toEqual([
      { day: '2026-11-29', seconds: 300 },
      { day: '2026-11-30', seconds: 300 },
    ]);
  });

  it('drain 은 1초 미만 나머지를 다음 번으로 넘긴다', () => {
    const c = startWriting();
    advance(c, T0 + 1500);
    expect(drain(c)).toEqual([{ day: '2026-11-29', seconds: 1 }]);
    advance(c, T0 + 2000);
    expect(drain(c)).toEqual([{ day: '2026-11-29', seconds: 1 }]);
  });
});

describe('writingClock — 검수 보완', () => {
  it('같은 기기의 두 탭을 번갈아 써도 이중으로 세지 않는다 (기기 공용 「여기까지 셌다」 시각)', () => {
    const a = createClock();
    const b = createClock();
    let until = -Infinity;
    until = setWriting(a, true, T0, until);
    until = setFront(a, false, T0 + 2 * MIN, until); // A 탭 숨김
    until = setWriting(b, true, T0 + 2 * MIN, until); // B 탭에서 씀
    until = advance(b, T0 + 4 * MIN, until);
    until = setFront(b, false, T0 + 4 * MIN, until);
    until = setFront(a, true, T0 + 4 * MIN, until); // 2분 만에 A 로 돌아옴
    until = advance(a, T0 + 5 * MIN, until);
    expect(seconds(a) + seconds(b)).toBe(5 * 60);
    expect(until).toBe(T0 + 5 * MIN);
  });

  it('글 화면을 열고 입력 없이 읽기만 해도 열린 때부터 10분까지 센다', () => {
    const c = createClock();
    setWriting(c, true, T0);
    advance(c, T0 + 4 * MIN);
    expect(seconds(c)).toBe(4 * 60);
    advance(c, T0 + 30 * MIN);
    expect(seconds(c)).toBe(6 * 60);
  });

  it('창으로 돌아온 시각도 입력으로 친다', () => {
    const c = startWriting();
    setFront(c, false, T0 + 1 * MIN);
    setFront(c, true, T0 + 20 * MIN); // 5분 넘김 → 나가 있던 시간 0
    advance(c, T0 + 25 * MIN);
    expect(seconds(c)).toBe(1 * 60 + 5 * 60);
  });

  it('restore 는 꺼냈던 초를 되돌려 놓는다 (저장 실패 대비)', () => {
    const c = startWriting();
    advance(c, T0 + 2 * MIN);
    const rows = drain(c);
    restore(c, rows);
    expect(drain(c)).toEqual([{ day: '2026-11-29', seconds: 120 }]);
  });

  it('createClock 은 시간을 쌓는 계정을 기억한다', () => {
    expect(createClock('u1').userId).toBe('u1');
  });
});

describe('formatDuration — 시간 표기', () => {
  it('60분 미만은 「42분」', () => {
    expect(formatDuration(42 * 60 + 30)).toBe('42분');
    expect(formatDuration(0)).toBe('0분');
  });
  it('60분 이상은 「1시간 5분」', () => {
    expect(formatDuration(65 * 60)).toBe('1시간 5분');
    expect(formatDuration(120 * 60)).toBe('2시간');
  });
});
