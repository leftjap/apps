import { describe, expect, it } from 'vitest';
import { busHeadway, busStopPortals, makeBusRoutes } from '../src/sim/buses.ts';
import { makeCars } from '../src/sim/cars.ts';
import { buildCarGraph } from '../src/sim/graph.ts';
import { makeSimProvider } from '../src/sim/provider.ts';
import { at, fixedProvider, road } from './helpers.ts';

// 한 변 400m 정사각형을 시계 방향으로 도는 일방통행 1차로 순환로
const ring = () =>
  buildCarGraph([
    road([[0, 0], [400, 0]], { oneway: true, lanes: 1 }),
    road([[400, 0], [400, 400]], { oneway: true, lanes: 1 }),
    road([[400, 400], [0, 400]], { oneway: true, lanes: 1 }),
    road([[0, 400], [0, 0]], { oneway: true, lanes: 1 }),
  ]);

describe('차 그래프', () => {
  it('양방향 도로는 서로 반대인 구간 둘, 일방통행은 하나', () => {
    const two = buildCarGraph([road([[0, 0], [100, 0]])]);
    expect(two.length).toBe(2);
    expect(two[0].p[0]).toBe(0);
    expect(two[1].p[0]).toBe(100);
    expect(buildCarGraph([road([[0, 0], [100, 0]], { oneway: true })]).length).toBe(1);
  });
  it('끝이 맞닿으면 이어지고, 온 길로 되돌아가는 구간은 뺀다', () => {
    const g = buildCarGraph([road([[0, 0], [100, 0]]), road([[100, 0], [200, 0]])]);
    const fwd = g.find((e) => e.p[0] === 0)!;
    const next = fwd.next.map((i) => g[i]);
    expect(next.length).toBe(1);
    expect(next[0].p[0]).toBe(100);
    expect(next[0].p[3]).toBe(200);
  });
  it('보행로와 골목에는 차 구간을 만들지 않는다', () => {
    expect(buildCarGraph([road([[0, 0], [100, 0]], { cls: 7 }), road([[0, 0], [0, 100]], { cls: 4 })]).length).toBe(0);
  });
  it('양방향 도로의 차로는 진행 방향 오른쪽에 놓인다', () => {
    const [e] = buildCarGraph([road([[0, 0], [100, 0]], { lanes: 4 })]);
    expect(e.lanes).toBe(2);
    expect(e.off0).toBeGreaterThan(0);
  });
});

describe('차 이동', () => {
  it('300초 뒤에도 같은 차로의 앞뒤 차는 4.5m 넘게 떨어져 있다', () => {
    const g = ring();
    const sim = makeCars(g, fixedProvider(1), 7, 60);
    sim.fill(60);
    for (let i = 0; i < 3000; i++) sim.step(0.1, at(8.5), false);
    expect(sim.cars.n).toBe(60);
    const c = sim.cars;
    let min = Infinity;
    for (let i = 0; i < c.n; i++)
      for (let j = i + 1; j < c.n; j++) min = Math.min(min, Math.hypot(c.x[i] - c.x[j], c.z[i] - c.z[j]));
    expect(min).toBeGreaterThan(4.5);
  });
  it('차는 길 위에 있다', () => {
    const sim = makeCars(ring(), fixedProvider(1), 3, 40);
    sim.fill(40);
    for (let i = 0; i < 600; i++) sim.step(0.1, at(8.5), false);
    const c = sim.cars;
    for (let i = 0; i < c.n; i++) {
      const dEdge = Math.min(Math.abs(c.z[i]), Math.abs(c.x[i] - 400), Math.abs(c.z[i] - 400), Math.abs(c.x[i]));
      expect(dEdge).toBeLessThan(3);
    }
  });
  it('속도 비율이 낮으면 느려지고 브레이크등이 늘어난다', () => {
    const run = (k: number) => {
      const sim = makeCars(ring(), fixedProvider(k), 5, 40);
      sim.fill(40);
      for (let i = 0; i < 1200; i++) sim.step(0.1, at(8.5), false);
      const c = sim.cars;
      let brake = 0;
      for (let i = 0; i < c.n; i++) brake += c.brake[i] > 0.5 ? 1 : 0;
      return { speed: sim.meanSpeed(), brake };
    };
    const free = run(1);
    const jam = run(0.2);
    expect(jam.speed).toBeLessThan(free.speed * 0.5);
    expect(jam.brake).toBeGreaterThan(free.brake);
  });
  it('새벽 3시의 목표 대수는 출근 시간보다 적다', () => {
    const sim = makeCars(ring(), makeSimProvider(), 1, 500);
    expect(sim.target(at(3))).toBeLessThan(sim.target(at(8.5)) * 0.5);
  });
});

describe('판 가장자리 진출입', () => {
  // 판 서쪽 끝에서 동쪽 끝까지 가로지르는 큰길과, 가운데에서 북쪽으로 300m 들어가다 끊긴 막다른 길
  const board = () =>
    buildCarGraph([
      road([[-1990, 0], [0, 0]], { cls: 2 }),
      road([[0, 0], [1990, 0]], { cls: 2 }),
      road([[0, 0], [0, -300]], { cls: 3 }),
    ]);
  it('새 차는 판 가장자리에서만 나타나고, 막다른 길로 들어가지 않는다', () => {
    const sim = makeCars(board(), fixedProvider(1), 4, 80);
    const seen = new Set<number>();
    let inner = 0;
    let spur = 0;
    for (let k = 0; k < 6000; k++) {
      sim.step(0.1, at(8.5));
      const c = sim.cars;
      for (let i = 0; i < c.n; i++) {
        if (!seen.has(c.uid[i])) {
          seen.add(c.uid[i]);
          if (Math.abs(c.x[i]) < 1900) inner++;
        }
        if (c.z[i] < -20) spur++;
      }
    }
    expect(seen.size).toBeGreaterThan(20);
    expect(inner).toBe(0);
    expect(spur).toBe(0);
  });
});

describe('버스', () => {
  // 0→100→300 동서로 곧은 양방향 2차로와, 100에서 남쪽으로 꺾는 길
  const tee = () => [
    road([[0, 0], [100, 0]], { bus: true }),
    road([[100, 0], [300, 0]]),
    road([[100, 0], [100, 200]], { cls: 4, lanes: 1, bus: true }),
  ];

  it('버스가 지나는 골목은 차 그래프에 들어간다', () => {
    const g = buildCarGraph(tee());
    expect(g.some((e) => e.road === 2)).toBe(true);
    expect(buildCarGraph([road([[0, 0], [0, 100]], { cls: 4 })]).length).toBe(0);
  });

  it('노선의 조각 번호를 차 구간으로 바꾸고 구간마다 시작 거리를 적는다', () => {
    const g = buildCarGraph(tee());
    const [fwd, back] = makeBusRoutes(
      [
        { ref: '271', kind: 0, to: '', segs: [1, 2], stops: [], stopNames: [] },
        { ref: '271', kind: 0, to: '', segs: [-2, -1], stops: [], stopNames: [] },
      ],
      g,
    );
    expect(fwd.edges.map((e) => g[e].p[0])).toEqual([0, 100]);
    expect(back.edges.map((e) => g[e].p[0])).toEqual([300, 100]);
    expect(fwd.start).toEqual([0, 100]);
    expect(fwd.len).toBeCloseTo(300);
  });

  it('갈림길에서 노선을 따라 꺾고, 노선이 끝나면 사라진다', () => {
    const g = buildCarGraph(tee());
    const routes = makeBusRoutes([{ ref: '마포09', kind: 3, to: '', segs: [1, 3], stops: [], stopNames: [] }], g);
    const sim = makeCars(g, fixedProvider(1), 2, 20, routes);
    sim.addBus(0, 1);
    let maxZ = 0;
    let maxX = 0;
    for (let k = 0; k < 400 && sim.cars.n; k++) {
      sim.step(0.1, at(14), false);
      if (sim.cars.n) (maxZ = Math.max(maxZ, sim.cars.z[0])), (maxX = Math.max(maxX, sim.cars.x[0]));
    }
    expect(maxZ).toBeGreaterThan(150);
    expect(maxX).toBeLessThan(110);
    expect(sim.cars.n).toBe(0);
  });

  it('정류장에서 잠시 멈췄다가 다시 간다', () => {
    const g = buildCarGraph([road([[0, 0], [600, 0]], { oneway: true })]);
    const routes = makeBusRoutes([{ ref: '603', kind: 0, to: '', segs: [1], stops: [300], stopNames: ['홍대입구역'] }], g);
    const sim = makeCars(g, fixedProvider(1), 4, 20, routes);
    sim.addBus(0, 1);
    let still = 0;
    for (let k = 0; k < 2000 && sim.cars.n; k++) {
      sim.step(0.1, at(14), false);
      if (sim.cars.n && Math.abs(sim.cars.x[0] - 300) < 3 && sim.speedOf(0) < 0.2) still += 0.1;
    }
    expect(still).toBeGreaterThan(7);
    expect(sim.cars.n).toBe(0);
  });

  it('버스 문은 차체 앞쪽 오른편에 있다', () => {
    const g = buildCarGraph([road([[0, 0], [600, 0]], { oneway: true, lanes: 1 })]);
    const routes = makeBusRoutes([{ ref: '603', kind: 0, to: '', segs: [1], stops: [], stopNames: [] }], g);
    const sim = makeCars(g, fixedProvider(1), 4, 20, routes);
    expect(sim.addBus(0, 300)).toBe(true);
    const [x, z] = sim.door(0);
    expect(x).toBeGreaterThan(sim.cars.x[0] + 3);
    expect(z).toBeGreaterThan(sim.cars.z[0] + 1);
  });

  it('버스는 진행 방향 맨 오른쪽 차로로 달린다', () => {
    const g = buildCarGraph([road([[0, 0], [600, 0]], { oneway: true, lanes: 3 })]);
    const routes = makeBusRoutes([{ ref: '603', kind: 0, to: '', segs: [1], stops: [], stopNames: [] }], g);
    const sim = makeCars(g, fixedProvider(1), 4, 20, routes);
    sim.addBus(0, 1);
    sim.step(0.1, at(14), false);
    expect(sim.cars.z[0]).toBeCloseTo(3.3, 1); // 동쪽으로 갈 때 오른쪽은 남쪽(+z)
  });
});

describe('버스 배차', () => {
  it('심야 버스는 밤에만, 다른 버스는 새벽에 쉰다', () => {
    expect(busHeadway({ kind: 0, ref: 'N26' }, 3 * 3600)).toBeGreaterThan(0);
    expect(busHeadway({ kind: 0, ref: 'N26' }, 14 * 3600)).toBe(0);
    expect(busHeadway({ kind: 0, ref: '271' }, 3 * 3600)).toBe(0);
    expect(busHeadway({ kind: 0, ref: '271' }, 8 * 3600)).toBeLessThan(busHeadway({ kind: 0, ref: '271' }, 14 * 3600));
  });
});

describe('버스 정류장과 승하차', () => {
  it('정류장은 진행 방향 오른쪽 보도에 놓이고, 같은 자리의 정류장은 하나로 합친다', () => {
    const g = buildCarGraph([road([[0, 0], [600, 0]], { oneway: true, lanes: 2 })]);
    const routes = makeBusRoutes(
      [
        { ref: '603', kind: 0, to: '', segs: [1], stops: [300], stopNames: ['홍대입구역'] },
        { ref: '604', kind: 0, to: '', segs: [1], stops: [305], stopNames: ['홍대입구역'] },
      ],
      g,
    );
    const { portals, keyOf } = busStopPortals(routes, g);
    expect(portals).toHaveLength(1);
    expect(keyOf(0, 0)).toBe(keyOf(1, 0));
    expect(portals[0].x).toBeCloseTo(300, -1);
    expect(portals[0].z).toBeGreaterThan(3.3); // 동쪽으로 가는 길의 오른쪽(남쪽) 보도
  });
  it('버스가 정류장에 서는 순간을 알린다', () => {
    const g = buildCarGraph([road([[0, 0], [600, 0]], { oneway: true })]);
    const routes = makeBusRoutes([{ ref: '603', kind: 0, to: '', segs: [1], stops: [300], stopNames: ['홍대입구역'] }], g);
    const sim = makeCars(g, fixedProvider(1), 4, 20, routes);
    sim.addBus(0, 1);
    const seen: [number, number, number][] = [];
    for (let k = 0; k < 2000 && sim.cars.n; k++) {
      sim.step(0.1, at(14), false);
      seen.push(...sim.dwells);
    }
    expect(seen).toEqual([[0, 0, 0]]);
  });
});
