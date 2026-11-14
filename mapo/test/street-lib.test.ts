import { describe, expect, it } from 'vitest';
import { mergeStages, minRect } from '../tools/lib/crosswalk.ts';
import { analysePiece, laneIndex, type LaneSeg } from '../tools/lib/lanes.ts';

describe('횡단보도 면 → 축', () => {
  it('긴 변이 건너는 방향, 짧은 변이 폭', () => {
    // 남북으로 20m 건너고 폭 4m 인 직사각형(가운데 (10, 5))
    const r = minRect([[8, -5], [12, -5], [12, 15], [8, 15], [8, -5]]);
    expect(r.cx).toBeCloseTo(10, 5);
    expect(r.cz).toBeCloseTo(5, 5);
    expect(r.len).toBeCloseTo(20, 5);
    expect(r.wid).toBeCloseTo(4, 5);
    expect(Math.abs(r.uz)).toBeCloseTo(1, 5);
  });
  it('기울어진 면도 축을 찾는다', () => {
    const a = Math.PI / 6;
    const pt = (u: number, v: number): [number, number] => [u * Math.cos(a) - v * Math.sin(a), u * Math.sin(a) + v * Math.cos(a)];
    const r = minRect([pt(-9, -2), pt(9, -2), pt(9, 2), pt(-9, 2)]);
    expect(r.len).toBeCloseTo(18, 3);
    expect(r.wid).toBeCloseTo(4, 3);
    expect(Math.abs(r.ux * Math.cos(a) + r.uz * Math.sin(a))).toBeCloseTo(1, 3);
  });
  it('중앙섬을 사이에 둔 두 단 횡단보도는 하나로 잇는다', () => {
    const a = minRect([[-2, 0], [2, 0], [2, 12], [-2, 12]]);
    const b = minRect([[-2, 15], [2, 15], [2, 27], [-2, 27]]);
    const c = minRect([[40, 0], [44, 0], [44, 12], [40, 12]]); // 멀리 떨어진 다른 횡단보도
    const m = mergeStages([a, b, c]);
    expect(m).toHaveLength(2);
    const long = m.find((r) => r.len > 20)!;
    expect(long.len).toBeCloseTo(27, 3);
    expect(long.cz).toBeCloseTo(13.5, 3);
  });
});

// 동쪽으로 뻗은 길(가운데선 z = 0)과 그 위의 차선. 진행 방향(+x) 오른쪽이 +z
const line = (z: number, k: string, k2 = '001'): LaneSeg => ({ ax: -200, az: z, bx: 200, bz: z, k, k2 });

describe('차선으로 길 모양 읽기', () => {
  it('양방향 길: 중앙선 자리로 가운데선을 옮기고, 방향별 차로 수와 차로 폭을 센다', () => {
    // 황색 복선이 z = 1.5, 오른쪽(+z)에 차선 3줄(3차로), 왼쪽에 1줄(2차로), 차로 폭 3.1m
    const idx = laneIndex([line(1.5, '001', '003'), line(4.6, '006', '002'), line(7.7, '006', '002'), line(-1.6, '006', '002'), line(10.8, '009')]);
    const r = analysePiece(idx, [[0, 0], [120, 0]], false)!;
    expect(r.off).toBeCloseTo(1.5, 1);
    expect(r.lf).toBe(3);
    expect(r.lb).toBe(2);
    expect(r.lw).toBeCloseTo(3.1, 1);
    expect(r.ctype).toBe(3);
  });
  it('한 방향 길: 왼쪽 경계(중앙버스차로 선)에서 차로를 세고 가운데로 옮긴다', () => {
    // 길 왼쪽 z = -7 에 중앙버스전용차선, 차선 3줄 → 4차로, 차로 폭 3m. 실제 가운데는 z = -1
    const idx = laneIndex([line(-7, '017'), line(-4, '006', '002'), line(-1, '006', '002'), line(2, '006', '002')]);
    const r = analysePiece(idx, [[0, 0], [120, 0]], true)!;
    expect(r.lf).toBe(4);
    expect(r.off).toBeCloseTo(-1, 1);
    expect(r.medBus).toBe(true);
  });
  it('연석선(주정차금지선 등)이 있으면 그 자리까지를 찻길로 보고 차로 폭을 나눈다', () => {
    // 한 방향 3차로: 왼쪽 중앙버스차선 −5.5, 차선 −0.4·2.5(중앙버스차선 옆 차로가 넓다), 오른쪽 연석선 5.7
    const idx = laneIndex([line(-5.5, '017'), line(-0.4, '006', '002'), line(2.5, '006', '002'), line(5.7, '009')]);
    const r = analysePiece(idx, [[0, 0], [120, 0]], true)!;
    expect(r.lf).toBe(3);
    expect(r.off).toBeCloseTo(0.1, 1);
    expect(r.lw).toBeCloseTo(11.2 / 3, 1);
  });
  it('차선이 없으면 읽지 않는다', () => {
    expect(analysePiece(laneIndex([]), [[0, 0], [120, 0]], false)).toBeNull();
  });
  it('길과 비스듬한 선(정지선 등)은 차로로 세지 않는다', () => {
    const idx = laneIndex([line(0.2, '001', '001'), { ax: 50, az: -10, bx: 50, bz: 10, k: '006', k2: '001' }]);
    const r = analysePiece(idx, [[0, 0], [120, 0]], false)!;
    expect(r.lf).toBe(1);
    expect(r.lb).toBe(1);
  });
  it('오른쪽 끝 차로가 가로변 버스전용차로면 표시한다', () => {
    const idx = laneIndex([line(0, '001', '003'), line(3.2, '006', '002'), line(6.4, '005', '001'), line(-3.2, '006', '002')]);
    const r = analysePiece(idx, [[0, 0], [120, 0]], false)!;
    expect(r.lf).toBe(3);
    expect(r.busR).toBe(true);
  });
});
