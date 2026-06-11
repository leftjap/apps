import { describe, it, expect } from 'vitest';
import { staggerLane, nextOf, fmt, remainLabel } from './flow.js';

describe('staggerLane — 레인 내 라벨 충돌 회피 (작업지시서 §3.3)', () => {
  const stops = (...pos) => pos.map((p, i) => ({ id: i, pos: p }));

  it('19%p 이상 떨어지면 전부 row 0', () => {
    const out = staggerLane(stops(5, 30, 60, 90));
    expect(out.map((s) => s.row)).toEqual([0, 0, 0, 0]);
  });

  it('근접 2개 — 뒤가 row 1 로 내려감', () => {
    const out = staggerLane(stops(40, 50));
    expect(out.map((s) => s.row)).toEqual([0, 1]);
  });

  it('동률 pos — 같은 좌표도 줄로 분리', () => {
    const out = staggerLane(stops(50, 50));
    expect(out.map((s) => s.row)).toEqual([0, 1]);
  });

  it('3개 밀집 — row 0/1/2, 최대 3줄 (4번째 밀집은 row 2 고정)', () => {
    const out = staggerLane(stops(50, 52, 54, 56));
    expect(out.map((s) => s.row)).toEqual([0, 1, 2, 2]);
  });

  it('연속 근접 체인 — 줄이 풀리면 다시 row 0 사용', () => {
    // 10/20 근접(row 0/1) → 40은 row0(10)과 19 이상 → row 0
    const out = staggerLane(stops(10, 20, 40));
    expect(out.map((s) => s.row)).toEqual([0, 1, 0]);
  });

  it('결정론적 — 입력 순서 무관, pos 오름차순 정렬 후 동일 배치', () => {
    const a = staggerLane(stops(50, 40));
    expect(a.map((s) => s.pos)).toEqual([40, 50]);
    expect(a.map((s) => s.row)).toEqual([0, 1]);
  });

  it('원본 배열 비변경 (slice 후 정렬)', () => {
    const input = stops(90, 10);
    staggerLane(input);
    expect(input.map((s) => s.pos)).toEqual([90, 10]);
  });
});

describe('nextOf — "다음" 선정 (작업지시서 §3.4)', () => {
  const pend = (entries) => entries.map(([id, usualMin]) => ({ h: { id, usualMin } }));

  it('밀린 것(usualMin ≤ 지금) 우선, 그중 가장 이른 것', () => {
    const p = pend([['study', 1200], ['gym', 830], ['book', 1350]]);
    expect(nextOf(p, 1250)).toBe('gym'); // gym(830)·study(1200) 밀림 → 이른 gym
  });

  it('밀린 것 없으면 가장 가까운 예정', () => {
    const p = pend([['book', 1350], ['study', 1200]]);
    expect(nextOf(p, 600)).toBe('study');
  });

  it('미실행 없으면 null', () => {
    expect(nextOf([], 600)).toBe(null);
  });
});

describe('fmt — 분 → HH:MM', () => {
  it('zero-pad + 24시간', () => {
    expect(fmt(400)).toBe('06:40');
    expect(fmt(0)).toBe('00:00');
    expect(fmt(1439)).toBe('23:59');
  });
});

describe('remainLabel — 잔여 시간 문구 (§3.1)', () => {
  it('시간+분 / 분만', () => {
    expect(remainLabel(16 * 60 + 16)).toBe('7시간 44분');
    expect(remainLabel(23 * 60 + 15)).toBe('45분');
  });
  it('자정 넘은 값은 0분으로 클램프', () => {
    expect(remainLabel(1500)).toBe('0분');
  });
});
