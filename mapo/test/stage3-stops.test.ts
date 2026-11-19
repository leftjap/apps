// @stage3
// 3단계(차량 주행) 시험: 그린 정지선과 차가 빨간불에 서는 자리(X.stopAt)를 견준다. 1·2단계 지도 시험(pnpm test:map)에서는 빼고 pnpm test:sim 이 돈다(tools/test-sets.mjs)
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeBoard } from '../src/data/board.ts';
import { decodeMarks, type MarksJson } from '../src/data/marks.ts';
import { decodeLanes } from '../src/data/road.ts';
import { buildCarGraph } from '../src/sim/graph.ts';
import { makeIntersections } from '../src/sim/intersection/index.ts';
import { lanePoint } from '../src/sim/lanes.ts';

describe('지금 판의 정지선과 차가 서는 자리', () => {
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
          const d = toDrawn(P[0], P[2]);
          if (d > 0.6) far.push(`e${e.id} l${l} ${d.toFixed(2)}m @ ${P[0].toFixed(0)},${P[2].toFixed(0)}`);
        }
      }
    }
    if (far.length) console.log(`차가 서는 자리에서 그린 정지선이 0.6m 넘게 먼 진입로 차로 ${far.length}곳(구간, 차로, 거리):\n${far.join('\n')}`);
    expect(seen).toBeGreaterThan(40);
    expect(far.length, far.join('\n')).toBe(0);
  });
});
