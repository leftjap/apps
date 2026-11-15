import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeBoard } from '../src/data/board.ts';
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

describe('지금 판의 노면 표시', () => {
  const marks = decodeMarks(JSON.parse(readFileSync(new URL('../public/data/marks.json', import.meta.url), 'utf8')) as MarksJson);
  const board = decodeBoard(JSON.parse(readFileSync(new URL('../public/data/board.json', import.meta.url), 'utf8')));
  it('교차로 다섯 곳 둘레 100m 의 서울시 정지선(board.json 의 stopLines, 같은 004 자료) 조각을 모두 긋는다', () => {
    for (const [cx, cz] of [[-497, 250], [222, -410], [694, -804], [-68, -135], [-776, -495]]) {
      const near = (x: number, z: number) => Math.hypot(x - cx, z - cz) < 100;
      const S = board.stopLines;
      let want = 0;
      for (let k = 0; k < S.length; k += 4) if (near((S[k] + S[k + 2]) / 2, (S[k + 1] + S[k + 3]) / 2)) want++;
      let got = 0;
      for (const l of marks.lines.filter((l) => l.k === 4))
        for (let k = 0; k + 3 < l.p.length; k += 3) if (near((l.p[k] + l.p[k + 3]) / 2, (l.p[k + 2] + l.p[k + 5]) / 2)) got++;
      expect(want).toBeGreaterThan(0);
      expect(got).toBe(want);
    }
  });
});
