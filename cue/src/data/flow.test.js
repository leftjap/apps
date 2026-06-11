import { describe, it, expect } from 'vitest';
import { staggerLane } from './flow.js';

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
