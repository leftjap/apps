import { describe, expect, it } from 'vitest';
import { busKind, traceRuns } from '../tools/lib/bus.ts';


describe('busKind', () => {
  it('노선 번호 모양으로 간선·지선·광역·마을을 가른다', () => {
    expect(busKind('271')).toBe(0);
    expect(busKind('110B')).toBe(0);
    expect(busKind('N26')).toBe(0);
    expect(busKind('7016')).toBe(1);
    expect(busKind('7013A')).toBe(1);
    expect(busKind('9707')).toBe(2);
    expect(busKind('M6117')).toBe(2);
    expect(busKind('G6000')).toBe(2);
    expect(busKind('1000')).toBe(2);
    expect(busKind('마포05')).toBe(3);
    expect(busKind('서대문03', '#5bb025')).toBe(3);
  });
  it('번호로 모르면 색 태그를 본다', () => {
    expect(busKind('70-2', '#009775')).toBe(1);
    expect(busKind('10', '#3D5BAB')).toBe(0);
    expect(busKind('x', '#F72F08')).toBe(2);
  });
});

describe('traceRuns', () => {
  // 노드 번호 = x 좌표인 동서 방향 길. 곧음은 모두 같다
  const flat = () => 1;
  const seg = (road: number, s: number, e: number, oneway = false) => ({ road, s, e, oneway });

  it('양방향 길이면 양쪽 끝에서 하나씩, 두 방향 노선을 만든다', () => {
    const runs = traceRuns([seg(0, 1, 2), seg(1, 2, 3), seg(2, 4, 3)], flat);
    expect(runs).toContainEqual([1, 2, -3]);
    expect(runs).toContainEqual([3, -2, -1]);
    expect(runs).toHaveLength(2);
  });
  it('일방통행은 거슬러 가지 않는다', () => {
    const runs = traceRuns([seg(0, 1, 2), seg(1, 2, 3, true), seg(2, 3, 4)], flat);
    expect(runs).toContainEqual([1, 2, 3]);
    expect(runs).not.toContainEqual(expect.arrayContaining([-2]));
  });
  it('갈림길에서는 더 곧은 쪽으로 간다', () => {
    // 1→2 다음에 2→3(곧음 0.9)과 2→5(곧음 0.1)
    const straight = (_a: number, b: number) => (Math.abs(b) === 2 ? 0.9 : 0.1);
    const runs = traceRuns([seg(0, 1, 2, true), seg(1, 2, 3, true), seg(2, 2, 5, true)], straight);
    expect(runs[0]).toEqual([1, 2]);
  });
  it('들어오는 조각이 없는 원형 노선은 만들지 않는다', () => {
    expect(traceRuns([seg(0, 1, 2, true), seg(1, 2, 3, true), seg(2, 3, 1, true)], flat)).toEqual([]);
  });
});
