import { describe, expect, it } from 'vitest';
import { cumLen, headingAt, nearestS, pointAt } from '../src/poly.ts';

// (0,0,0) → (10,0,0) → (10,0,20): 동쪽 10m 뒤 남쪽 20m
const L = [0, 0, 0, 10, 0, 0, 10, 0, 20];

describe('poly', () => {
  it('누적 길이', () => expect(Array.from(cumLen(L))).toEqual([0, 10, 30]));
  it('거리로 점 찾기', () => {
    const cum = cumLen(L);
    const o = [0, 0, 0];
    expect(pointAt(L, cum, 5, o)).toBe(0);
    expect(o).toEqual([5, 0, 0]);
    expect(pointAt(L, cum, 20, o)).toBe(1);
    expect(o).toEqual([10, 0, 10]);
  });
  it('범위 밖은 끝점', () => {
    const cum = cumLen(L);
    const o = [0, 0, 0];
    pointAt(L, cum, -5, o);
    expect(o).toEqual([0, 0, 0]);
    pointAt(L, cum, 99, o);
    expect(o).toEqual([10, 0, 20]);
  });
  it('높이도 보간', () => {
    const p = [0, 0, 0, 10, 8, 0];
    const cum = cumLen(p);
    const o = [0, 0, 0];
    pointAt(p, cum, cum[1] / 2, o);
    expect(o[1]).toBeCloseTo(4);
  });
  it('진행 방향: 동쪽 0, 남쪽 π/2', () => {
    expect(headingAt(L, 0)).toBeCloseTo(0);
    expect(headingAt(L, 1)).toBeCloseTo(Math.PI / 2);
  });
  it('가장 가까운 지점', () => {
    const cum = cumLen(L);
    const r = nearestS(L, cum, 13, 12);
    expect(r.s).toBeCloseTo(22);
    expect(r.d).toBeCloseTo(3);
  });
});
