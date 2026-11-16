import { describe, expect, it } from 'vitest';
import type { MarkLine } from '../src/data/marks.ts';
import { decodeDir } from '../src/data/lanes.ts';
import { cumLen } from '../src/poly.ts';
import { encodeDir, lineIndex, readDirection } from '../tools/lib/carlanes.ts';

// 동쪽(+x)으로 가는 100m 길. 진행 방향 오른쪽이 +z 이다
const line = (k: number, z: number, x0 = 0, x1 = 100): MarkLine => ({ k, k2: 1, p: Float32Array.from([x0, 0, z, x1, 0, z]) });
const east = Float32Array.from([0, 0, 0, 100, 0, 0]);
const west = Float32Array.from([100, 0, 0, 0, 0, 0]);
const read = (lines: MarkLine[], p = east, twoWay = false, medBus = false) => readDirection(lineIndex(lines), p, cumLen(p), twoWay, medBus);

describe('차로 가운데선 굽기', () => {
  it('한 방향 길: 왼쪽 가장자리선에서 오른쪽 연석선까지 이웃한 두 선 사이 가운데가 차로 가운데다', () => {
    const d = read([line(7, -5), line(6, -1.8), line(6, 1.4), line(9, 4.8)])!;
    expect(d.runs).toHaveLength(1);
    const r = d.runs[0];
    expect(r.n).toBe(3);
    expect(r.off.slice(0, 3).map((v) => +v.toFixed(2))).toEqual([-3.4, -0.2, 3.1]);
  });
  it('양방향 길: 진행 방향은 중앙선 오른쪽, 반대 방향은 왼쪽 차로를 그 방향 기준으로 읽는다', () => {
    const lines = [line(1, 0.4), line(6, 3.6), line(9, 7), line(9, -6.5)];
    const f = read(lines, east, true)!;
    expect(f.runs[0].n).toBe(2);
    expect(f.runs[0].off.slice(0, 2).map((v) => +v.toFixed(2))).toEqual([2, 5.3]);
    const b = read(lines, west, true)!;
    expect(b.runs[0].n).toBe(1);
    expect(b.runs[0].off[0]).toBeCloseTo(3.05, 2); // 서쪽으로 가면 −z 가 오른쪽: 중앙선(−0.4)과 연석선(6.5) 가운데
  });
  it('길을 따라 차로가 하나 늘면 그 자리에서 차로 수 구간이 나뉜다', () => {
    const d = read([line(7, -5), line(6, -1.8), line(6, 1.4), line(9, 4.8, 0, 50), line(6, 4.8, 50, 100), line(9, 8, 50, 100)])!;
    expect(d.runs.map((r) => r.n)).toEqual([3, 4]);
    expect(d.runs[0].s1).toBeGreaterThan(46);
    expect(d.runs[0].s1).toBeLessThan(54);
    expect(d.runs[1].off.slice(0, 4).map((v) => +v.toFixed(1))).toEqual([-3.4, -0.2, 3.1, 6.4]);
  });
  it('교차로 앞에서 오른쪽 차로 선만 먼저 끝나도(연석선에 닿지 못한 단면) 차로 수를 줄이지 않고, 차로가 끝나는 자리를 적는다', () => {
    const d = read([line(7, -5, 0, 90), line(6, -1.8, 0, 90), line(6, 1.4, 0, 70), line(9, 4.8, 0, 70)])!;
    expect(d.runs.map((r) => r.n)).toEqual([3]);
    expect(d.b).toBeGreaterThan(86);
    expect(d.b).toBeLessThan(90);
    expect(d.a).toBeLessThan(2);
  });
  it('중앙버스차로가 붙은 한 방향 길은 중앙버스전용차선 왼쪽 선까지 사이 가운데를 버스차로로 읽는다', () => {
    const d = read([line(1, -9), line(17, -5.6), line(6, -2.4), line(9, 1)], east, false, true)!;
    expect(d.runs[0].n).toBe(2);
    expect(d.runs[0].med[0]).toBeCloseTo(-7.3, 1);
  });
  it('파일 꼴로 줄였다 되살려도 차로 가운데는 1cm 안이다', () => {
    const d = read([line(7, -5), line(6, -1.8), line(6, 1.4), line(9, 4.8)])!;
    const back = decodeDir(encodeDir(d));
    expect(back.runs[0].n).toBe(3);
    back.runs[0].off.forEach((v, i) => expect(Math.abs(v - d.runs[0].off[i])).toBeLessThan(0.01));
  });
});
