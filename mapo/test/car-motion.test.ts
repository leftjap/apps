// 차가 그려지는 자리가 한 단계에 튀지 않는가(tools/measure-cars.ts 로 판에서 확인한 결함의 재현)
import { describe, expect, it } from 'vitest';
import { makeBusRoutes } from '../src/sim/buses.ts';
import { makeCars } from '../src/sim/cars.ts';
import { buildCarGraph } from '../src/sim/graph.ts';
import { makeJunctions } from '../src/sim/junctions.ts';
import { BODY_LEN, bodyType } from '../src/sim/bodies.ts';
import { CAR_SHAPES } from '../src/render/cars.ts';
import { at, fixedProvider, road } from './helpers.ts';

/** 한 단계 동안 차마다(고유 번호로) 진행 방향에 수직으로 움직인 거리 가운데 가장 큰 값과, 옮겨 간 거리 가운데 가장 큰 값 */
function track(sim: ReturnType<typeof makeCars>, steps: number, dt: number, tod = 14) {
  const c = sim.cars;
  const prev = new Map<number, [number, number, number]>();
  let side = 0;
  let move = 0;
  for (let k = 0; k < steps; k++) {
    sim.step(dt, at(tod), false);
    for (let i = 0; i < c.n; i++) {
      const p = prev.get(c.uid[i]);
      if (p) {
        const dx = c.x[i] - p[0];
        const dz = c.z[i] - p[1];
        side = Math.max(side, Math.abs(-dx * Math.sin(p[2]) + dz * Math.cos(p[2])));
        move = Math.max(move, Math.hypot(dx, dz));
      }
      prev.set(c.uid[i], [c.x[i], c.z[i], c.yaw[i]]);
    }
  }
  return { side, move };
}

describe('그린 자리 이어짐', () => {
  it('판 밖으로 나간 차를 지워도 다른 차가 그 자리로 순간 이동해 보이지 않는다', () => {
    // 판을 가로지르는 큰길. 0번 차는 곧 판 동쪽 끝으로 나가고, 1번 차는 판 가운데에 있다
    const g = buildCarGraph([road([[-1990, 0], [0, 0]], { cls: 2 }), road([[0, 0], [1990, 0]], { cls: 2 })]);
    const east = g.find((e) => e.p[0] === 0 && e.p[3] === 1990)!;
    const sim = makeCars(g, fixedProvider(1), 4, 10);
    sim.put(east.id, east.len - 2, 0);
    sim.put(east.id, 100, 0);
    const { move } = track(sim, 20, 0.1);
    expect(sim.cars.n).toBe(1);
    expect(move).toBeLessThan(3);
  });

  it('중앙버스차로 버스는 승강장 가까이 길 조각 이음매를 지날 때 옆으로 튀지 않는다', () => {
    // 분리대 8.1m 를 사이에 둔 한 방향 3차로 찻길 둘. 동쪽으로 가는 길(z=+9)을 정류장(x=0) 10m 앞에서 두 조각으로 나눈다
    const med = { oneway: true, lanes: 3, cls: 1, medBus: true, gap: 8.1, measured: true };
    const g = buildCarGraph([road([[-600, 9], [-10, 9]], med), road([[-10, 9], [600, 9]], med), road([[600, -9], [-600, -9]], med)]);
    const routes = makeBusRoutes([{ ref: '603', kind: 0, to: '', segs: [1, 2], stops: [], stopNames: [] }], g, [['1', '가운데정류장', 0, 2.8]]);
    const sim = makeCars(g, fixedProvider(1), 4, 10, routes);
    sim.addBus(0, 400);
    const { side } = track(sim, 900, 1 / 30);
    expect(sim.dwells.length + sim.cars.n).toBeGreaterThan(0);
    expect(side).toBeLessThan(0.3);
  });

  it('차로가 많은 길이 갈림 없이 급하게 꺾여도 안쪽 차로 차가 뒤로 돌거나 방향이 한 단계에 15° 넘게 꺾이지 않는다', () => {
    const deg = Math.PI / 180;
    const dir = (t: number, d: number): [number, number] => [d * Math.cos(t * deg), d * Math.sin(t * deg)];
    const cases = [
      // 방향마다 3차로인 양방향 길이 오른쪽으로 49° 꺾인다(월드컵로 1.3m 조각 둘레와 같은 꼴)
      buildCarGraph([road([[-300, 0], [0, 0]], { lanes: 6, cls: 1 }), road([[0, 0], dir(49, 300)], { lanes: 6, cls: 1 })]),
      // 4차로 일방통행의 18.6m 조각이 오른쪽으로 104° 꺾여 2차로가 된다(독막로 → 대흥로 이음매와 같은 꼴)
      buildCarGraph([
        road([[-300, 0], [-18.6, 0]], { oneway: true, lanes: 4, cls: 1 }),
        road([[-18.6, 0], [0, 0]], { oneway: true, lanes: 4, cls: 1 }),
        road([[0, 0], dir(104, 300)], { oneway: true, lanes: 2, cls: 1 }),
      ]),
    ];
    for (const g of cases) {
      const sim = makeCars(g, fixedProvider(1), 4, 10);
      const first = g.find((e) => e.p[0] === -300)!;
      for (let l = 0; l < first.lanes; l++) sim.put(first.id, 150 + l * 25, l);
      const c = sim.cars;
      const prev = new Map<number, [number, number, number]>();
      let turn = 0;
      let back = 0;
      for (let k = 0; k < 60 * 30; k++) {
        sim.step(1 / 60, at(14), false);
        for (let i = 0; i < c.n; i++) {
          const p = prev.get(c.uid[i]);
          if (p) {
            let d = c.yaw[i] - p[2];
            while (d > Math.PI) d -= 2 * Math.PI;
            while (d < -Math.PI) d += 2 * Math.PI;
            turn = Math.max(turn, Math.abs(d));
            back = Math.min(back, (c.x[i] - p[0]) * Math.cos(p[2]) + (c.z[i] - p[1]) * Math.sin(p[2]));
          }
          prev.set(c.uid[i], [c.x[i], c.z[i], c.yaw[i]]);
        }
      }
      expect(turn / deg).toBeLessThan(15);
      expect(back).toBeGreaterThan(-0.01);
    }
  });
});

describe('교차로 꼬리 물기', () => {
  it('두 교차로 사이 구간이 차 한 대도 설 수 없이 짧으면, 뒤 교차로가 막혔을 때 앞 교차로 상자 안에 서지 않는다', () => {
    // 동서 큰길이 x=0 과 x=11 에서 남북 일방통행 길(교차로로 들어오기만 한다)과 만난다. x=11 너머 동쪽 길은 40m 앞이 돌발 서행(0.05m/s)으로 막혀 줄이 선다
    const g = buildCarGraph([
      road([[-300, 0], [0, 0]], { cls: 2 }),
      road([[0, 0], [11, 0]], { cls: 2 }),
      road([[11, 0], [300, 0]], { cls: 2 }),
      road([[0, -200], [0, 0]], { cls: 3, oneway: true }),
      road([[0, 200], [0, 0]], { cls: 3, oneway: true }),
      road([[11, -200], [11, 0]], { cls: 3, oneway: true }),
      road([[11, 200], [11, 0]], { cls: 3, oneway: true }),
    ]);
    const jn = makeJunctions(g);
    const west = g.find((e) => e.p[0] === -300)!;
    const east = g.find((e) => e.p[0] === 11 && e.p[3] === 300)!;
    const mid = g.find((e) => e.p[0] === 0 && e.p[3] === 11)!;
    expect(jn.groupOfEnd[west.id]).toBeGreaterThanOrEqual(0);
    const box = jn.rOut[mid.id];
    const sim = makeCars(g, fixedProvider(1), 4, 40);
    sim.setIncidents({ blocks: [], close: [], slow: [{ edge: east.id, at: 40, v: 0.05 }] });
    const c = sim.cars;
    const still = new Map<number, number>();
    let worst = 0;
    for (let k = 0; k < 10 * 120; k++) {
      if (k % 50 === 0) sim.put(west.id, 5, 0);
      sim.step(0.1, at(14), false);
      for (let i = 0; i < c.n; i++) {
        const inA = Math.abs(c.x[i]) < box && Math.abs(c.z[i]) < box;
        const t = inA && sim.speedOf(i) < 0.3 ? (still.get(c.uid[i]) ?? 0) + 0.1 : 0;
        still.set(c.uid[i], t);
        worst = Math.max(worst, t);
      }
    }
    expect(worst).toBeLessThan(5);
  });
});

describe('차 길이', () => {
  it('시뮬레이션이 줄 세우는 차 길이는 그리는 차종의 길이와 같다(멈춘 차 범퍼 사이 2m 가 그림에서도 2m)', () => {
    const shapes = [CAR_SHAPES.sedan, CAR_SHAPES.suv, CAR_SHAPES.kei, CAR_SHAPES.van];
    shapes.forEach((sh, k) => expect(BODY_LEN[k]).toBeCloseTo(2 * sh.look.len, 2));
    const g = buildCarGraph([road([[-300, 0], [300, 0]], { oneway: true, lanes: 1 })]);
    const sim = makeCars(g, fixedProvider(1), 4, 30);
    for (let k = 0; k < 20; k++) sim.put(0, 10 + k * 12, 0);
    const D = sim.debug();
    for (let i = 0; i < sim.cars.n; i++) {
      const want = sim.cars.kind[i] === 2 ? BODY_LEN[0] : BODY_LEN[bodyType(sim.cars.tint[i])];
      expect(D.size[i]).toBeCloseTo(want, 2);
    }
  });
});
