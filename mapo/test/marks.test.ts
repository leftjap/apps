import { describe, expect, it } from 'vitest';
import { decodeMarks, lineStyle, type MarksJson } from '../src/data/marks.ts';

describe('노면 표시 모양(서울시 차선 코드)', () => {
  it('차선 점선은 백색 3m/5m, 중앙선 복선은 황색 두 줄, 정지선은 굵은 백색 실선, 유도선은 1m 점선, 자전거횡단도는 백색 네모 줄', () => {
    expect(lineStyle(6, 2)).toMatchObject({ color: 0, sep: 0, dashL: 1 });
    expect(lineStyle(6, 1)).toMatchObject({ color: 0, dashL: 0 });
    expect(lineStyle(1, 3)).toMatchObject({ color: 1, dashL: 0, dashR: 0 });
    expect(lineStyle(1, 3).sep).toBeGreaterThan(0);
    expect(lineStyle(1, 4)).toMatchObject({ color: 1, dashL: 0, dashR: 1 });
    expect(lineStyle(4, 1)).toMatchObject({ color: 0, w: 0.45, dashL: 0 });
    expect(lineStyle(12, 1)).toMatchObject({ color: 0, dashL: 2 });
    // 자전거횡단도(534): 백색 0.5m 정사각형을 0.5m 간격으로 한 줄(서울시 자료는 두 줄을 따로 적는다)
    expect(lineStyle(13, 1)).toMatchObject({ color: 0, w: 0.5, sep: 0, dashL: 3 });
    expect(lineStyle(17, 1)).toMatchObject({ color: 2, dashL: 0 });
    expect(lineStyle(9, 1)).toMatchObject({ color: 1, dashL: 2 });
  });
  it('선·안전지대 좌표는 첫 점과 차이(dm)로 풀고, 화살표 각도는 동쪽에서 반시계(북쪽이 −z)다', () => {
    const m = decodeMarks({ v: 1, l: [[62, 3, 10, 20, 5, -5, 5, 0]], h: [], z: [[1, 3, 0, 0, 10, 0, 0, 10]], a: [7, 100, 200, 90] } as MarksJson);
    expect(Array.from(m.lines[0].p)).toEqual([1, 0, 2, 1.5, 0, 1.5, 2, 0, 1.5]);
    expect(m.lines[0]).toMatchObject({ k: 6, k2: 2 });
    expect(Array.from(m.zones[0].ring)).toEqual([0, 0, 1, 0, 1, 1]);
    expect(m.arrows[0].fx).toBeCloseTo(0, 6);
    expect(m.arrows[0].fz).toBeCloseTo(-1, 6);
  });
});
