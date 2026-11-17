import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeBoard } from '../src/data/board.ts';
import { buildCarGraph } from '../src/sim/graph.ts';
import { decodeLanes } from '../src/data/road.ts';
import { GREEN, LEFT, makeIntersections, RED, STRAIGHT, YELLOW } from '../src/sim/intersection/index.ts';
import { pedState, signalPoles } from '../src/render/signals.ts';

const board = decodeBoard(JSON.parse(readFileSync(new URL('../public/data/board.json', import.meta.url), 'utf8')));
const edges = buildCarGraph(board.roads, decodeLanes(JSON.parse(readFileSync(new URL('../public/data/road.json', import.meta.url), 'utf8')).lanes));
const signals = makeIntersections(edges, { crosswalks: board.crosswalks, stopLines: board.stopLines }).S;
const poles = signalPoles(edges, signals, board.crosswalks, board.stopLines);

/** 점에서 가장 가까운 정지선(선분)까지 거리 */
const toStop = (x: number, z: number) => {
  const s = board.stopLines;
  let best = Infinity;
  for (let k = 0; k < s.length; k += 4) {
    const ax = s[k], az = s[k + 1], bx = s[k + 2], bz = s[k + 3];
    const l2 = (bx - ax) ** 2 + (bz - az) ** 2 || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / l2));
    best = Math.min(best, Math.hypot(ax + t * (bx - ax) - x, az + t * (bz - az) - z));
  }
  return best;
};

describe('신호등 자리(합정·홍대입구역 교차로)', () => {
  for (const [name, cx, cz] of [['합정', -497, 250], ['홍대입구역', 222, -410]] as const) {
    const near = (x: number, z: number) => Math.hypot(x - cx, z - cz) < 70;
    it(`${name}: 차량 신호는 신호가 걸린 진입로마다 하나이고, 모두 정지선에서 3m 안이다`, () => {
      const into = [...signals.approach.keys()].filter((id) => {
        const e = edges[id];
        return near(e.p[e.p.length - 3], e.p[e.p.length - 1]);
      });
      const mine = poles.car.filter((p) => into.includes(p.edge));
      const inner = poles.inner.filter((id) => into.includes(id));
      expect(into.length).toBeGreaterThan(2);
      // 교차로 안쪽 연결 구간(정지선 자료 없음, 정지 자리가 노드에서 6m 안)만 빼고 모두 세운다
      expect(mine.length + inner.length).toBe(into.length);
      for (const id of inner) expect(signals.approach.get(id)!.setback).toBeLessThan(6);
      // 정지선 자료로 자리를 잡은 신호등은 기둥·등이 모두 정지선에서 3m 안
      for (const p of mine.filter((q) => q.fromData)) {
        expect(toStop(p.x, p.z), `기둥 ${p.edge}`).toBeLessThan(3);
        expect(toStop(p.hx, p.hz), `등 ${p.edge}`).toBeLessThan(3);
      }
      // 정지선 자료가 없는 진입로는 많아야 하나(합정 양화로 e2041: 정지 자리 둘레 6m 안에서 이 방향 차로를 가로지르는 정지선을 찾지 못한다)
      expect(mine.filter((q) => !q.fromData).length).toBeLessThanOrEqual(1);
    });
    it(`${name}: 보행 신호는 신호 횡단보도 양 끝에 하나씩 있다`, () => {
      const xws = board.crosswalks.map((c, i) => ({ c, i })).filter(({ c, i }) => c.sig && signals.crossSite[i] >= 0 && near(c.x, c.z));
      expect(xws.length).toBeGreaterThan(2);
      for (const { c, i } of xws) {
        const mine = poles.ped.filter((p) => p.xw === i);
        expect(mine).toHaveLength(2);
        const ends = mine.map((p) => (p.x - c.x) * c.ux + (p.z - c.z) * c.uz).sort((a, b) => a - b);
        expect(ends[0]).toBeCloseTo(-c.half, -0.4);
        expect(ends[1]).toBeCloseTo(c.half, -0.4);
      }
    });
  }
});

describe('신호 색', () => {
  it('차량 신호의 원은 그 진입로 직진 신호를, 화살표는 좌회전 현시 초록을 쓴다', () => {
    for (const p of poles.car.slice(0, 50)) {
      const ap = signals.approach.get(p.edge)!;
      for (const t of [0, 37, 80, 123]) {
        const st = signals.moveState(ap, STRAIGHT, t);
        const l = signals.moveState(ap, LEFT, t);
        const circle = p.state(t) % 3;
        if (p.arrow && st === RED && l === YELLOW) expect(circle).toBe(YELLOW);
        else expect(circle).toBe(st);
        expect(p.state(t) >= 3).toBe(p.arrow && l === GREEN && st !== GREEN);
      }
    }
  });
  it('보행 신호등은 그 횡단보도의 보행 신호(사람이 건너기 시작할 때 보는 신호)가 초록일 때만 초록이다', () => {
    for (const p of poles.ped.slice(0, 40)) {
      const xw = board.crosswalks[p.xw];
      for (let t = 0; t < 200; t += 3) expect(pedState(signals, p.xw, xw, t) === GREEN).toBe(signals.walkLeft(p.xw, t) > 0);
    }
  });
});
