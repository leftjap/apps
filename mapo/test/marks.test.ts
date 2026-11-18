import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeBoard } from '../src/data/board.ts';
import { decodeMarks, lineStyle, type MarksJson } from '../src/data/marks.ts';
import { decodeLanes } from '../src/data/road.ts';
import { buildCarGraph } from '../src/sim/graph.ts';
import { makeIntersections } from '../src/sim/intersection/index.ts';
import { lanePoint } from '../src/sim/lanes.ts';

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
  const read = (f: string) => JSON.parse(readFileSync(new URL(`../public/data/${f}`, import.meta.url), 'utf8'));
  const marks = decodeMarks(read('marks.json') as MarksJson);
  const board = decodeBoard(read('board.json'));
  // 재작업 W49(설계 문서 59절 B1): 정지선은 서울시 004 모양 대신, 차가 빨간불에 서는 자리(X.stopAt, 앞 범퍼)에서 0.3m 앞에 진입로 차로 폭만큼 긋는다
  it('교차로 다섯 곳 둘레 100m 의 신호 진입로 차로마다, 차가 서는 자리 0.6m 안에 그린 정지선이 지나간다', () => {
    const g = buildCarGraph(board.roads, decodeLanes(read('road.json').lanes), marks.arrows);
    const { X, S } = makeIntersections(g, { crosswalks: board.crosswalks, stopLines: board.stopLines, lamps: read('signals.json') });
    const drawn = marks.lines.filter((l) => l.k === 4);
    const toDrawn = (x: number, z: number) => {
      let best = Infinity;
      for (const l of drawn)
        for (let q = 0; q + 3 < l.p.length; q += 3) {
          const [ax, az, dx, dz] = [l.p[q], l.p[q + 2], l.p[q + 3] - l.p[q], l.p[q + 5] - l.p[q + 2]];
          const u = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
          best = Math.min(best, Math.hypot(ax + dx * u - x, az + dz * u - z));
        }
      return best;
    };
    const P = [0, 0, 0];
    let seen = 0;
    const far: string[] = [];
    for (const [cx, cz] of [[-497, 250], [222, -410], [694, -804], [-68, -135], [-776, -495]]) {
      for (const e of g) {
        if (X.jEnd[e.id] < 0 || S.siteOf(e.id) < 0) continue;
        for (let l = 0; l < e.lanes; l++) {
          const s = e.len - X.stopAt(e.id, l);
          if (s < 0) continue;
          lanePoint(e, l, s, P);
          if (Math.hypot(P[0] - cx, P[2] - cz) > 100) continue;
          seen++;
          if (toDrawn(P[0], P[2]) > 0.6) far.push(`e${e.id} l${l} ${P[0].toFixed(0)},${P[2].toFixed(0)}`);
        }
      }
    }
    expect(seen).toBeGreaterThan(40);
    expect(far).toEqual([]);
  });
});
