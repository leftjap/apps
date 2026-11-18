import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { decodeBoard, type Line } from '../src/data/board.ts';
import { decodeLanes, type RoadJson } from '../src/data/road.ts';
import { decodeMarks, type MarksJson } from '../src/data/marks.ts';
import { busStopPortals, makeBusRoutes } from '../src/sim/buses.ts';
import { makeCars } from '../src/sim/cars.ts';
import { buildCarGraph } from '../src/sim/graph.ts';
import { makeIntersections } from '../src/sim/intersection/index.ts';
import { decodeArea } from '../src/sim/people/area.ts';
import { makePeople, type Portal } from '../src/sim/people/index.ts';
import { makeSimProvider } from '../src/sim/provider.ts';
import { decodeWalk, type WalkJson } from '../src/sim/walknet.ts';
import { railSite } from '../src/sim/railSite.ts';

// 재작업 W45: 지오 「전철 위를 사람이 다니는 모양새야」(양화진길 2호선 지상·터파기 구간, 선로·열차 위를 사람이 걸음).
// 철도 부지 = 땅 위로 드러난 선로 띠(터널 조각 빼고, 높이 5m 밑으로 지나갈 수 없는 조각: src/sim/railSite.ts).
// 걷는 길 그물의 선, 걷는 면, 사람 자리 모두 이 띠 안에 있으면 안 된다.
// 건널 수 있는 곳(건널목·역사·철도 위 다리·밑 지하도)은 띠에서 빼야 하지만, 판 안 철도에는 OSM railway=level_crossing·crossing 이 없고
// (tools/raw/railways.json 은 선만 45+17개), 지상 구간 둘레 역은 모두 지하라 뺄 곳이 없다. 높이 5m 넘는 다리(당산철교) 밑은 띠가 아니다.
const read = (f: string) => JSON.parse(readFileSync(new URL(`../public/data/${f}`, import.meta.url), 'utf8'));
const board = decodeBoard(read('board.json'));
const wj = read('walk.json') as WalkJson;
const W = decodeWalk(wj);
const A = decodeArea(wj.a)!;
const site = railSite(board.lines as Line[]);

describe('철도 부지 안 걷는 길·걷는 면·사람 0(W45)', () => {
  it('철도 부지가 있다(2호선 양화진길 지상·터파기)', () => {
    expect(site.segs.length).toBeGreaterThan(5);
  });
  it('걷는 길 그물의 선이 철도 부지를 지나는 길이 0', () => {
    const hits: string[] = [];
    for (let a = 0; a < W.adj.length; a++)
      W.adj[a].forEach((b, k) => {
        if (b < a) return;
        const [ax, az, bx, bz] = [W.nx[a * 2], W.nx[a * 2 + 1], W.nx[b * 2], W.nx[b * 2 + 1]];
        const L = Math.hypot(bx - ax, bz - az);
        const m = Math.max(1, Math.ceil(L / 0.25));
        let inL = 0;
        for (let q = 0; q < m; q++) if (site.inside(ax + ((bx - ax) * (q + 0.5)) / m, az + ((bz - az) * (q + 0.5)) / m)) inL += L / m;
        if (inL > 0) hits.push(`${a}-${b} 종류${W.kind[a][k]} ${inL.toFixed(1)}m (${((ax + bx) / 2).toFixed(0)},${((az + bz) / 2).toFixed(0)})`);
      });
    expect(hits).toEqual([]);
  });
  it('걷는 면 칸이 철도 부지 안에 0', () => {
    const [x0, z0, x1, z1] = site.box;
    const hits: string[] = [];
    for (let x = Math.floor(x0 * 2) / 2; x < x1; x += 0.5) for (let z = Math.floor(z0 * 2) / 2; z < z1; z += 0.5) if (A.at(x + 0.25, z + 0.25) && site.inside(x + 0.25, z + 0.25)) hits.push(`${x},${z}`);
    expect(hits.length, hits.slice(0, 10).join(' ')).toBe(0);
  });
});

describe('철도 부지 안 사람×초 0(W45, 판 전체 미리 돌리기 + 지상 구간 보기 90초)', () => {
  const marks = decodeMarks(read('marks.json') as MarksJson);
  const lanes = decodeLanes((read('road.json') as RoadJson).lanes);
  const res: { name: string; secs: number; where: string[] }[] = [];
  beforeAll(() => {
    const [x0, z0, x1, z1] = site.box;
    const run = (name: string, fx: number, fz: number, fr: number, secs: number, cap: number) => {
      const provider = makeSimProvider();
      const start = { tod: 18 * 3600, dow: 6, doy: 320 };
      const carGraph = buildCarGraph(board.roads, lanes, marks.arrows);
      const inter = makeIntersections(carGraph, { crosswalks: board.crosswalks, stopLines: board.stopLines });
      const busy = new Uint32Array(board.crosswalks.length);
      const cars = makeCars(carGraph, provider, 7, 700, makeBusRoutes(board.buses, carGraph, undefined, board.crosswalks), inter, { list: board.crosswalks, busy });
      cars.setFocus(fx, fz, Math.max(250, fr), () => false);
      cars.fill(cars.target(start));
      cars.fillBuses(start);
      const stops = busStopPortals(cars.routes, carGraph);
      const portals: Portal[] = [...board.exits.map((e) => ({ kind: 'exit' as const, key: e.st, x: e.x, z: e.z })), ...stops.portals];
      const walkLeft = (xw: number, tod: number) => (inter.S.crossSite[xw] < 0 ? -1 : inter.S.walkLeft(xw, tod));
      const p = makePeople(W, portals, provider, 7, cap, { buildings: board.buildings, walkLeft, busy, traffic: (xw) => cars.approaching(xw), cars: cars.cars });
      cars.setPeople(p.w);
      p.setFocus(fx, fz, fr);
      p.warm(120, start);
      let s = 0;
      const where = new Map<string, number>();
      const count = (dt: number) => {
        for (let i = 0; i < p.w.n; i++) {
          const x = p.w.x[i];
          const z = p.w.z[i];
          if (x < x0 || x > x1 || z < z0 || z > z1 || !site.inside(x, z)) continue;
          s += dt;
          const k = `${Math.round(x / 10) * 10},${Math.round(z / 10) * 10}`;
          where.set(k, (where.get(k) ?? 0) + dt);
        }
      };
      count(1);
      const DT = 1 / 10;
      const now = { ...start };
      for (let f = 0; f < secs / DT; f++) {
        now.tod = start.tod + f * DT;
        cars.step(DT, now);
        p.step(DT, now);
        count(DT);
      }
      res.push({ name, secs: s, where: [...where].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => `${k}:${v.toFixed(1)}`) });
    };
    run('판 전체', 0, 120, 2200, 0, 8000);
    run('지상 구간', site.mid[0], site.mid[1], 200, 90, 3000);
  }, 300_000);
  it('사람 자리가 철도 부지 안인 사람×초 0', () => {
    expect(res.map((r) => `${r.name} ${r.secs.toFixed(1)}초 ${r.where.join(' ')}`)).toEqual(res.map((r) => `${r.name} 0.0초 `));
  });
});
