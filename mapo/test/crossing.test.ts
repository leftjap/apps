import { describe, expect, it } from 'vitest';
import { buildCarGraph, buildWalkGraph, crossLinks, laneTest, turnRules } from '../src/sim/graph.ts';
import { makeSignals, GREEN } from '../src/sim/signals.ts';
import { makeWalkers } from '../src/sim/walkers.ts';
import { makeCars } from '../src/sim/cars.ts';
import { at, crosswalk, fixedProvider, road } from './helpers.ts';

// (0,0)에서 만나는 동서 큰길(4차로, 찻길 반폭 7.1m)과 남북 골목
const tee = () => [
  road([[-200, 0], [0, 0]], { cls: 2, lanes: 4 }),
  road([[0, 0], [200, 0]], { cls: 2, lanes: 4 }),
  road([[0, 0], [0, 120]], { cls: 4, lanes: 1 }),
];

describe('교차로에서 돌아갈 수 있는 길', () => {
  const g = buildWalkGraph(tee());
  const rules = turnRules(g);
  const c = g.nearest(0, 0);
  const arm = (x: number, z: number) => g.adj[c].indexOf(g.nearest(x, z));
  const W = arm(-200, 0);
  const E = arm(200, 0);
  const S = arm(0, 120);
  it('같은 쪽 보도에 머물거나 골목만 건너는 길은 된다', () => {
    // 서쪽에서 동쪽으로 오는 사람의 오른쪽 = 남쪽 보도. 남쪽 골목을 건너 그대로 남쪽 보도로 간다
    expect(rules.allowed(c, W, 1, E, 1)).toBe(true);
    // 남쪽 골목으로 꺾어 들어간다(골목 서쪽 가장자리)
    expect(rules.allowed(c, W, 1, S, -1)).toBe(true);
  });
  it('큰길을 건너야 하는 길은 안 된다', () => {
    // 남쪽 보도에서 북쪽 보도로 옮겨 동쪽으로
    expect(rules.allowed(c, W, 1, E, -1)).toBe(false);
    // 골목에서 나와 큰길 북쪽 보도로
    expect(rules.allowed(c, S, 1, W, 1)).toBe(false);
  });
  it('막다른 곳에서 같은 쪽 보도로 되돌아서는 것은 된다', () => {
    const g2 = buildWalkGraph([road([[0, 0], [100, 0]], { cls: 2, lanes: 4 })]);
    const r2 = turnRules(g2);
    const end = g2.nearest(100, 0);
    expect(r2.allowed(end, 0, 1, 0, -1)).toBe(true);
    expect(r2.allowed(end, 0, 1, 0, 1)).toBe(false);
  });
});

describe('횡단보도로 큰길 건너기', () => {
  // 동서 큰길(4차로) 중간 x = 0 에 남북으로 건너는 횡단보도. 출구는 남쪽 보도(x = −80)와 북쪽 보도(x = 80)
  const roads = () => [road([[-300, 0], [0, 0], [300, 0]], { cls: 2, lanes: 4 })];
  const xw = (sig: boolean) => crosswalk(0, 0, 0, 1, 9, [[0, 0]], sig);
  const exits = [
    { kind: 'exit' as const, key: 's', x: -80, z: 10 },
    { kind: 'exit' as const, key: 'n', x: 80, z: -10 },
  ];

  it('횡단보도 연결은 축 양 끝과 지나는 꼭짓점을 잇는다', () => {
    const g = buildWalkGraph(roads());
    const links = crossLinks(g, [xw(false)]);
    expect(links.list).toHaveLength(1);
    expect(links.list[0].na).toBe(g.nearest(0, 0));
    expect(links.list[0].nb).toBe(links.list[0].na);
    expect(links.list[0].major).toBe(true);
  });

  it('찻길을 건너는 사람은 횡단보도 위로만 건넌다', () => {
    const rs = roads();
    const cars = buildCarGraph(rs);
    const g = buildWalkGraph(rs);
    const xws = [xw(false)];
    const links = crossLinks(g, xws);
    const sim = makeWalkers(g, exits, fixedProvider(1, 0), 3, 60, undefined, undefined, laneTest(cars), laneTest(cars, 1.2), { links });
    let crossed = 0;
    let off = 0;
    for (let k = 0; k < 6000; k++) {
      if (k % 200 === 0) sim.burst('s', 3), sim.burst('n', 3);
      sim.step(0.1, at(14), false);
      for (let i = 0; i < sim.w.n; i++) {
        if (Math.abs(sim.w.z[i]) > 7.1) continue; // 찻길 밖
        if (Math.abs(sim.w.x[i]) <= 2.2) crossed++;
        else off++;
      }
    }
    expect(crossed).toBeGreaterThan(50);
    expect(off).toBe(0);
  });

  it('건너편 출구가 더 가까운 사람은 횡단보도까지 걸어가 건넌 뒤 그 출구로 들어간다', () => {
    const rs = roads();
    const g = buildWalkGraph(rs);
    const links = crossLinks(g, [xw(false)]);
    // 남쪽 출구(x = −80)에서 나온 사람이 동쪽으로 걸어가면 북쪽 출구(x = 20)가 더 가깝다
    let north = 0;
    const sim = makeWalkers(
      g,
      [{ kind: 'exit', key: 's', x: -80, z: 10 }, { kind: 'exit', key: 'n', x: 20, z: -10 }],
      fixedProvider(1, 0),
      5,
      80,
      (_x, z) => z < 0 && north++,
      undefined,
      undefined,
      undefined,
      { links },
    );
    let offCrossing = 0;
    for (let k = 0; k < 9000; k++) {
      if (k % 300 === 0) sim.burst('s', 3);
      sim.step(0.1, at(14), false);
      for (let i = 0; i < sim.w.n; i++) if (Math.abs(sim.w.z[i]) < 7.1 && Math.abs(sim.w.x[i]) > 2.2) offCrossing++;
    }
    expect(north).toBeGreaterThan(0);
    expect(offCrossing).toBe(0);
  });

  it('신호 횡단보도에서는 초록불에만 건너기 시작하고, 건너는 동안 빨간불이 되지 않을 만큼 남았을 때만 출발한다', () => {
    const rs = [road([[-300, 0], [0, 0]], { cls: 2, lanes: 4 }), road([[0, 0], [300, 0]], { cls: 2, lanes: 4 })];
    const cars = buildCarGraph(rs);
    const xws = [xw(true)];
    const signals = makeSignals(cars, { crosswalks: xws, stopLines: new Float32Array() });
    expect(signals.crossSite[0]).toBe(0);
    const g = buildWalkGraph(rs);
    const links = crossLinks(g, xws);
    const sim = makeWalkers(g, exits, fixedProvider(1, 0), 4, 60, undefined, signals, laneTest(cars), laneTest(cars, 1.2), { links });
    let tod = 0;
    let onRed = 0;
    let crossed = 0;
    for (let k = 0; k < 6000; k++) {
      if (k % 200 === 0) sim.burst('s', 3), sim.burst('n', 3);
      sim.step(0.1, { tod, dow: 2, doy: 317 }, false);
      tod += 0.1;
      const walkGreen = signals.state(0, 1, tod) === GREEN;
      for (let i = 0; i < sim.w.n; i++)
        if (Math.abs(sim.w.z[i]) < 6.6 && Math.abs(sim.w.x[i]) < 3) {
          crossed++;
          // 차가 초록불인데 찻길 위에 있는 사람
          if (!walkGreen && signals.state(0, 0, tod) === GREEN) onRed++;
        }
    }
    expect(crossed).toBeGreaterThan(50);
    expect(onRed).toBe(0);
  });

  it('신호 없는 횡단보도에서는 차가 다가오면 기다리고, 건너는 사람이 있으면 바쁨 표시를 한다', () => {
    const rs = roads();
    const g = buildWalkGraph(rs);
    const links = crossLinks(g, [xw(false)]);
    const busy = new Uint32Array(1);
    let carComing = true;
    const sim = makeWalkers(g, exits, fixedProvider(1, 0), 6, 60, undefined, undefined, undefined, undefined, { links, busy, traffic: () => carComing });
    let crossedWhileCar = 0;
    let busySeen = 0;
    for (let k = 0; k < 4000; k++) {
      if (k % 200 === 0) sim.burst('s', 3);
      carComing = k < 2000;
      sim.step(0.1, at(14), false);
      for (let i = 0; i < sim.w.n; i++) if (Math.abs(sim.w.z[i]) < 6.6 && Math.abs(sim.w.x[i]) < 3 && carComing) crossedWhileCar++;
      if (busy[0] > 0) busySeen++;
    }
    expect(crossedWhileCar).toBe(0);
    expect(busySeen).toBeGreaterThan(0);
  });
});

describe('차와 횡단보도', () => {
  it('자기 차로 앞에 건너는 사람이 있으면 차는 횡단보도 앞에 서고, 다 건너면 지나간다', () => {
    const rs = [road([[-300, 0], [0, 0], [300, 0]], { cls: 2, lanes: 4 })];
    const g = buildCarGraph(rs);
    const busy = new Uint32Array(1);
    const sim = makeCars(g, fixedProvider(1), 3, 10, [], undefined, { list: [crosswalk(0, 0, 0, 1, 9, [[0, 0]], false)], busy });
    const east = g.find((e) => e.p[0] < -299)!;
    sim.put(east.id, 150, 0);
    // 축은 북쪽 끝(z = −9)부터 2m 칸. 동쪽으로 가는 0번 차로(z ≈ 1.65)는 축 10.65m 자리(5번 칸)를 지난다
    busy[0] = 1 << 5;
    let front = -Infinity;
    for (let k = 0; k < 400; k++) {
      sim.step(0.1, at(14), false);
      front = Math.max(front, sim.cars.x[0] + 2.3);
    }
    expect(front).toBeLessThan(-2);
    expect(front).toBeGreaterThan(-8);
    expect(sim.approaching(0)).toBe(true);
    // 맞은편 차로 쪽(북쪽 끝 0~4m)에만 사람이 있으면 서지 않는다
    busy[0] = 0b11;
    for (let k = 0; k < 300; k++) sim.step(0.1, at(14), false);
    expect(sim.cars.x[0]).toBeGreaterThan(5);
  });
});
