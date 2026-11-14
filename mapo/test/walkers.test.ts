import { describe, expect, it } from 'vitest';
import { buildCarGraph, buildWalkGraph, clearWalkFromCars, laneTest } from '../src/sim/graph.ts';
import { makeSignals, RED } from '../src/sim/signals.ts';
import { makeWalkers, walkerTarget, type Portal } from '../src/sim/walkers.ts';
import { makeSimProvider } from '../src/sim/provider.ts';
import { at, fixedProvider, road } from './helpers.ts';

// 100m 간격 격자 골목 (가로 3줄, 세로 3줄)
const lanes = () => {
  const out = [];
  for (const k of [0, 100, 200]) {
    out.push(road([[0, k], [100, k]], { cls: 4, lanes: 1 }), road([[100, k], [200, k]], { cls: 4, lanes: 1 }));
    out.push(road([[k, 0], [k, 100]], { cls: 4, lanes: 1 }), road([[k, 100], [k, 200]], { cls: 4, lanes: 1 }));
  }
  return out;
};
const exits: Portal[] = [{ kind: 'exit', key: '합정', x: 102, z: 98 }, { kind: 'exit', key: '상수', x: 0, z: 200 }];
const offGrid = (x: number, z: number) => {
  const d = (v: number) => Math.min(...[0, 100, 200].map((k) => Math.abs(v - k)));
  return Math.min(d(x), d(z));
};

describe('보행 그래프', () => {
  it('꼭짓점이 노드가 되고 맞닿은 길끼리 이어진다', () => {
    const g = buildWalkGraph(lanes());
    expect(g.adj.length).toBe(9);
    const centre = g.nearest(100, 100);
    expect(g.adj[centre].length).toBe(4);
  });
  it('간선도로와 교량은 걷지 않는다', () => {
    const g = buildWalkGraph([road([[0, 0], [100, 0]], { cls: 0 }), road([[0, 50], [100, 50]], { cls: 4, bridge: true, p: Float32Array.from([0, 12, 50, 100, 12, 50]) })]);
    expect(g.adj.length).toBe(0);
  });
});

describe('보행자', () => {
  it('열차가 도착하면 그 역 출구에서 무리가 나온다', () => {
    const sim = makeWalkers(buildWalkGraph(lanes()), exits, fixedProvider(1), 1, 200);
    sim.burst('합정', 20);
    expect(sim.w.n).toBe(20);
    for (let i = 0; i < 20; i++) expect(Math.hypot(sim.w.x[i] - 102, sim.w.z[i] - 98)).toBeLessThan(15);
  });
  it('모르는 역이면 아무도 나오지 않는다', () => {
    const sim = makeWalkers(buildWalkGraph(lanes()), exits, fixedProvider(1), 1, 200);
    sim.burst('없는역', 5);
    expect(sim.w.n).toBe(0);
  });
  it('60초 뒤에도 모두 길 위를 걷고 있다', () => {
    const sim = makeWalkers(buildWalkGraph(lanes()), exits, fixedProvider(1), 2, 200);
    sim.burst('합정', 30);
    const x0 = Array.from(sim.w.x.subarray(0, 30));
    for (let i = 0; i < 600; i++) sim.step(0.1, at(21, 5), false);
    let moved = 0;
    for (let i = 0; i < sim.w.n; i++) {
      expect(offGrid(sim.w.x[i], sim.w.z[i])).toBeLessThan(4.5);
      if (i < 30 && Math.abs(sim.w.x[i] - x0[i]) > 5) moved++;
    }
    expect(moved).toBeGreaterThan(10);
  });
  it('걸음 위상이 걸은 만큼 늘어난다', () => {
    const sim = makeWalkers(buildWalkGraph(lanes()), exits, fixedProvider(1), 2, 200);
    sim.burst('합정', 1);
    const p0 = sim.w.phase[0];
    for (let i = 0; i < 50; i++) sim.step(0.1, at(21, 5), false);
    expect(sim.w.phase[0]).toBeGreaterThan(p0 + 3);
  });
  it('목표 인원: 금요일 21시가 화요일 4시보다 훨씬 많다', () => {
    const p = makeSimProvider();
    // 상한에 닿지 않게 넉넉히 두고 시간대 차이만 본다(상한은 crowd.test.ts 에서 따로 본다)
    expect(walkerTarget(p, at(21, 5), 1e6)).toBeGreaterThan(walkerTarget(p, at(4, 2), 1e6) * 5);
  });
  it('최대 인원을 넘지 않는다', () => {
    const sim = makeWalkers(buildWalkGraph(lanes()), exits, fixedProvider(1, 500000), 3, 50);
    sim.burst('합정', 80);
    for (let i = 0; i < 300; i++) sim.step(0.1, at(21, 5), true);
    expect(sim.w.n).toBeLessThanOrEqual(50);
    expect(sim.w.n).toBeGreaterThan(30);
  });
});

describe('멈춰 서서 구경하기', () => {
  it('붙잡힌 사람은 멈춰 서서 대상을 보며 휴대폰을 들고, 시간이 지나면 다시 걷는다', () => {
    const g = buildWalkGraph([road([[0, 0], [400, 0]], { cls: 4, lanes: 1 })]);
    const sim = makeWalkers(g, [{ kind: 'exit', key: 'x', x: 100, z: 0 }], fixedProvider(1, 0), 3, 10);
    sim.burst('x', 1);
    for (let k = 0; k < 20; k++) sim.step(0.1, at(14), false);
    const w = sim.w;
    const id = w.id[0];
    sim.hold(id, 5, w.x[0], w.z[0] + 2);
    sim.step(0.1, at(14), false);
    const x0 = w.x[0];
    for (let k = 0; k < 30; k++) sim.step(0.1, at(14), false);
    expect(Math.abs(w.x[0] - x0)).toBeLessThan(0.05);
    expect(Math.abs(w.yaw[0] - Math.PI / 2)).toBeLessThan(0.2);
    expect(w.photo[0]).toBeGreaterThan(0.5);
    for (let k = 0; k < 60; k++) sim.step(0.1, at(14), false);
    expect(Math.abs(w.x[0] - x0)).toBeGreaterThan(1);
    expect(w.photo[0]).toBeLessThan(0.5);
  });
});

describe('들고 나는 곳: 역 출구와 버스 정류장', () => {
  const portals = (): Portal[] => [
    { kind: 'exit', key: '합정', x: 102, z: 98 },
    { kind: 'exit', key: '상수', x: 3, z: 200 },
    { kind: 'stop', key: 'stop-1', x: 150, z: 103 },
  ];
  const near = (x: number, z: number, lim: number) => portals().some((p) => Math.hypot(p.x - x, p.z - z) < lim);

  it('평소에 생기는 사람도 출구나 정류장에서만 나타난다', () => {
    const sim = makeWalkers(buildWalkGraph(lanes()), portals(), fixedProvider(1, 50000), 4, 300);
    sim.step(0.1, at(14), true);
    expect(sim.w.n).toBeGreaterThan(0);
    for (let i = 0; i < sim.w.n; i++) expect(near(sim.w.x[i], sim.w.z[i], 8)).toBe(true);
  });

  it('사라질 때는 출구나 정류장까지 걸어가서 사라진다', () => {
    const left: [number, number][] = [];
    const sim = makeWalkers(buildWalkGraph(lanes()), portals(), fixedProvider(1, 0), 5, 300, (x, z) => left.push([x, z]));
    sim.burst('합정', 25);
    for (let k = 0; k < 6000 && sim.w.n; k++) sim.step(0.1, at(14), false);
    expect(left.length).toBe(25 - sim.w.n);
    expect(left.length).toBeGreaterThan(15);
    // 출구에서는 그 자리에서, 정류장에서는 줄(최대 12명, 1.5m 간격) 어딘가에서 사라진다
    for (const [x, z] of left) expect(near(x, z, 6) || Math.hypot(x - 150, z - 103) < 20).toBe(true);
  });

  it('정류장에 간 사람은 버스를 기다렸다가 타고, 버스에서 내린 사람이 나타난다', () => {
    const sim = makeWalkers(buildWalkGraph(lanes()), [{ kind: 'stop', key: 's', x: 150, z: 103 }], fixedProvider(1, 0), 6, 50);
    sim.alight('s', 6, 150, 108);
    expect(sim.w.n).toBe(6);
    for (let k = 0; k < 6000 && sim.waitingAt('s') === 0; k++) sim.step(0.1, at(14), false);
    const waiting = sim.waitingAt('s');
    expect(waiting).toBeGreaterThan(0);
    sim.board('s', 150, 108);
    sim.step(0.1, at(14), false);
    expect(sim.waitingAt('s')).toBe(0);
    for (let k = 0; k < 200; k++) sim.step(0.1, at(14), false);
    expect(sim.w.n).toBe(6 - waiting);
  });

  it('정류장에서 기다리는 사람은 한 점에 몰리지 않고 보도를 따라 줄을 선다', () => {
    const sim = makeWalkers(buildWalkGraph(lanes()), [{ kind: 'stop', key: 's', x: 150, z: 103 }], fixedProvider(1, 0), 8, 50);
    sim.alight('s', 14, 150, 108);
    for (let k = 0; k < 9000 && sim.waitingAt('s') < 8; k++) sim.step(0.1, at(14), false);
    const still = [];
    for (let i = 0; i < sim.w.n; i++) if (!sim.w.moving[i]) still.push([sim.w.x[i], sim.w.z[i]]);
    expect(still.length).toBeGreaterThanOrEqual(8);
    // 어느 쪽에서 걸어왔든 정류장이 있는 쪽(남쪽, z > 100) 보도에 선다
    for (const [, z] of still) expect(z).toBeGreaterThan(100);
    for (let a = 0; a < still.length; a++)
      for (let b = a + 1; b < still.length; b++) expect(Math.hypot(still[a][0] - still[b][0], still[a][1] - still[b][1])).toBeGreaterThan(0.6);
  });

  it('버스가 서면 기다리던 사람이 버스 문까지 걸어가서 타고, 내리는 사람은 버스 문에서 나와 보도로 간다', () => {
    const left: [number, number][] = [];
    const sim = makeWalkers(buildWalkGraph(lanes()), [{ kind: 'stop', key: 's', x: 150, z: 103 }], fixedProvider(1, 0), 9, 50, (x, z) => left.push([x, z]));
    sim.alight('s', 5, 150, 108);
    // 내린 사람은 버스 문 둘레에서 시작해 한 사람씩 0.5초 간격으로 보도로 옮겨 간다(다섯 명이면 4초 안)
    for (let i = 0; i < sim.w.n; i++) expect(Math.hypot(sim.w.x[i] - 150, sim.w.z[i] - 108)).toBeLessThan(1.5);
    for (let k = 0; k < 40; k++) sim.step(0.1, at(14), false);
    for (let i = 0; i < sim.w.n; i++) expect(offGrid(sim.w.x[i], sim.w.z[i])).toBeLessThan(6);
    for (let k = 0; k < 9000 && sim.waitingAt('s') < 3; k++) sim.step(0.1, at(14), false);
    const waiting = sim.waitingAt('s');
    expect(waiting).toBeGreaterThanOrEqual(3);
    sim.board('s', 156, 110);
    for (let k = 0; k < 200; k++) sim.step(0.1, at(14), false);
    expect(left.length).toBeGreaterThanOrEqual(waiting);
    for (const [x, z] of left.slice(-waiting)) expect(Math.hypot(x - 156, z - 110)).toBeLessThan(1);
  });

  it('큰길 옆 출구에서 나온 사람은 찻길로 들어가지 않고 그쪽 보도로 걷는다', () => {
    // 동서로 놓인 4차로 길(폭 14.2m), 출구는 남쪽 보도(z = +10)
    const g = buildWalkGraph([road([[0, 0], [300, 0]], { cls: 2, lanes: 4 }), road([[300, 0], [600, 0]], { cls: 2, lanes: 4 })]);
    const sim = makeWalkers(g, [{ kind: 'exit', key: 'x', x: 280, z: 10 }], fixedProvider(1, 0), 7, 50);
    sim.burst('x', 20);
    for (let k = 0; k < 100; k++) {
      sim.step(0.1, at(14), false);
      for (let i = 0; i < sim.w.n; i++) expect(sim.w.z[i]).toBeGreaterThan(7.1);
    }
  });
});

describe('차도와 겹친 보행로', () => {
  it('차로 위에 그려진 보행로는 걷지 않고, 차로와 겹치지 않는 쪽만 걷는다', () => {
    // 동서로 놓인 한 방향 3차로(차로 폭 ±4.95m). 차로 한가운데(z = 2)를 따라 그려진 보행로, 길 가장자리 밖(z = 12)의 보행로
    const roads = [
      road([[-300, 0], [300, 0]], { cls: 1, lanes: 3, oneway: true }),
      road([[-200, 2], [200, 2]], { cls: 7, lanes: 1 }),
      road([[-200, 6], [200, 6]], { cls: 6, lanes: 1 }),
    ];
    const g = buildWalkGraph(roads);
    clearWalkFromCars(g, buildCarGraph(roads));
    const edge = (z: number) => {
      const a = g.nearest(-200, z);
      return { a, k: g.adj[a].findIndex((b) => Math.abs(g.nx[b * 2 + 1] - z) < 0.1) };
    };
    const onLanes = edge(2);
    expect(g.aw[onLanes.a][onLanes.k]).toBe(0);
    // z = 6 보행로(걷는 띠 0~2.6m): 차로 쪽(북쪽, 서→동으로 걸을 때 왼쪽)은 막고 남쪽만 걷는다
    const beside = edge(6);
    expect(g.aw[beside.a][beside.k]).toBeGreaterThan(0);
    expect(g.dir[beside.a][beside.k]).toBe(1);
  });
  it('짧은 조각이 이어진 길도 보도가 다른 길 차로 위면 그쪽으로 걷지 않는다', () => {
    // 동서 한 방향 4차로 큰길(차로 z −6.6~6.6)과, 그 북쪽 z = −9 에 붙어 동쪽으로 가는 한 방향 합류 길(5m 마다 꼭짓점).
    // 합류 길의 바깥(진행 방향 오른쪽 = 남쪽) 보도는 z −6.1~−4.5 로 큰길 차로 위이므로 북쪽 보도로 걷는다
    const merge: [number, number][] = [];
    for (let x = -100; x <= 100; x += 5) merge.push([x, -9]);
    const roads = [road([[-300, 0], [300, 0]], { cls: 1, lanes: 4, oneway: true }), road(merge, { cls: 1, lanes: 1, oneway: true })];
    const g = buildWalkGraph(roads);
    clearWalkFromCars(g, buildCarGraph(roads));
    for (const x of [-50, 0, 50]) {
      const a = g.nearest(x, -9);
      const k = g.adj[a].findIndex((b) => g.nx[b * 2] > x);
      expect(g.aw[a][k] === 0 || g.dir[a][k] === -1).toBe(true);
    }
  });
});

describe('찻길과 신호', () => {
  it('신호 교차로가 없는 곳에서는 길 중간을 가로지르는 보행로로도 큰길을 건너지 않고 되돌아선다', () => {
    // 동서로 놓인 4차로 큰길과, 그 길을 남북으로 가로지르는 보행로. 출구는 남쪽 끝
    const roads = [road([[-300, 0], [300, 0]], { cls: 1, lanes: 4 }), road([[0, -60], [0, 60]], { cls: 7, lanes: 1 })];
    const cars = buildCarGraph(roads);
    const signals = makeSignals(cars);
    const g = buildWalkGraph(roads);
    const sim = makeWalkers(g, [{ kind: 'exit', key: 'x', x: 0, z: 55 }], fixedProvider(1, 0), 4, 40, undefined, signals, laneTest(cars), laneTest(cars, 1.2));
    let deep = 0;
    for (let k = 0; k < 2000; k++) {
      if (k % 100 === 0) sim.burst('x', 3);
      sim.step(0.1, at(14), false);
      for (let i = 0; i < sim.w.n; i++) if (Math.abs(sim.w.z[i]) < 6.6 - 1.2) deep++;
    }
    expect(deep).toBe(0);
  });

  it('신호 없는 교차로에서는 큰길을 건너지 않는다', () => {
    // 집산도로(신호를 두지 않는 등급)끼리 만나는 네거리, 출구는 남동쪽 모퉁이 보도
    const roads = [
      road([[-300, 0], [0, 0]], { cls: 3, lanes: 4 }),
      road([[0, 0], [300, 0]], { cls: 3, lanes: 4 }),
      road([[0, -300], [0, 0]], { cls: 3, lanes: 4 }),
      road([[0, 0], [0, 300]], { cls: 3, lanes: 4 }),
    ];
    const signals = makeSignals(buildCarGraph(roads));
    expect(signals.list.length).toBe(0);
    const g = buildWalkGraph(roads);
    const sim = makeWalkers(g, [{ kind: 'exit', key: 'x', x: 40, z: 10 }, { kind: 'exit', key: 'x', x: 10, z: 40 }], fixedProvider(1, 0), 9, 80, undefined, signals);
    let onRoad = 0;
    for (let k = 0; k < 3000; k++) {
      if (k % 50 === 0) sim.burst('x', 4);
      sim.step(0.1, at(14), false);
      // 찻길(가운데선에서 7.1m 안) 위에 선 사람
      for (let i = 0; i < sim.w.n; i++) if (Math.abs(sim.w.x[i]) < 6.6 || Math.abs(sim.w.z[i]) < 6.6) onRoad++;
    }
    expect(onRoad).toBe(0);
  });


  it('한 방향 큰길(중앙분리대가 있는 길의 한쪽)에서는 바깥쪽 보도로만 걷는다', () => {
    // 동쪽으로만 가는 3차로. 바깥쪽은 진행 방향 오른쪽 = 남쪽(+z)
    const g = buildWalkGraph([road([[0, 0], [60, 0]], { cls: 1, lanes: 3, oneway: true }), road([[60, 0], [120, 0]], { cls: 1, lanes: 3, oneway: true })]);
    const sim = makeWalkers(g, [{ kind: 'exit', key: 'x', x: 50, z: 9 }], fixedProvider(1, 0), 8, 60);
    sim.burst('x', 40);
    for (let k = 0; k < 2000; k++) {
      sim.step(0.1, at(14), false);
      for (let i = 0; i < sim.w.n; i++) expect(sim.w.z[i]).toBeGreaterThan(5);
    }
  });

  it('신호 교차로에서는 건너는 방향이 빨간불이면 횡단보도 앞에서 기다린다', () => {
    const roads = [
      road([[-300, 0], [0, 0]], { cls: 1, lanes: 4 }),
      road([[0, 0], [300, 0]], { cls: 1, lanes: 4 }),
      road([[0, -300], [0, 0]], { cls: 2, lanes: 4 }),
      road([[0, 0], [0, 300]], { cls: 2, lanes: 4 }),
    ];
    const signals = makeSignals(buildCarGraph(roads));
    const g = buildWalkGraph(roads);
    // 동서 방향(무리 0)이 빨간불인 시각
    const grp = signals.groupOf(0, 0);
    let t0 = 0;
    while (!(signals.state(0, grp, t0) === RED && signals.state(0, grp, t0 + 40) === RED)) t0 += 1;
    const sim = makeWalkers(g, [{ kind: 'exit', key: 'x', x: -40, z: 9 }], fixedProvider(1, 0), 9, 40, undefined, signals);
    sim.burst('x', 30);
    let tod = t0;
    let inside = 0;
    for (let k = 0; k < 400; k++) {
      sim.step(0.1, { tod, dow: 2, doy: 317 }, false);
      tod += 0.1;
      // 남쪽 보도를 따라 동쪽으로 가던 사람은 남북 찻길(|x| < 7.1)을 가로지르는 횡단보도(보도 연장선)에 들어가지 않는다
      for (let i = 0; i < sim.w.n; i++) if (Math.abs(sim.w.x[i]) < 7.1 && sim.w.z[i] > 7.1 && sim.w.z[i] < 11) inside++;
    }
    expect(inside).toBe(0);
  });

  it('횡단보도 앞 기다리는 자리가 차로 위(비스듬히 만나는 길 등)면 차로 밖으로 물러서서 기다린다', () => {
    const roads = [
      road([[-300, 0], [0, 0]], { cls: 1, lanes: 4 }),
      road([[0, 0], [300, 0]], { cls: 1, lanes: 4 }),
      road([[0, -300], [0, 0]], { cls: 2, lanes: 4 }),
      road([[0, 0], [0, 300]], { cls: 2, lanes: 4 }),
    ];
    const signals = makeSignals(buildCarGraph(roads));
    const g = buildWalkGraph(roads);
    const grp = signals.groupOf(0, 0);
    let t0 = 0;
    while (!(signals.state(0, grp, t0) === RED && signals.state(0, grp, t0 + 40) === RED)) t0 += 1;
    // 남쪽 보도의 횡단보도 앞(대기 자리 x ≈ −9~−12 둘레)을 차로라고 친다
    const lanesAt = (x: number, z: number) => x > -16 && x < 0 && z > 0 && z < 12;
    const sim = makeWalkers(g, [{ kind: 'exit', key: 'x', x: -60, z: 9 }], fixedProvider(1, 0), 9, 40, undefined, signals, lanesAt);
    sim.burst('x', 20);
    let tod = t0;
    let onLanes = 0;
    let waiting = 0;
    for (let k = 0; k < 400; k++) {
      sim.step(0.1, { tod, dow: 2, doy: 317 }, false);
      tod += 0.1;
      for (let i = 0; i < sim.w.n; i++) {
        if (lanesAt(sim.w.x[i], sim.w.z[i]) && !sim.w.moving[i]) onLanes++; // 차로 위에 서서 기다리는 사람
        if (sim.w.x[i] > -24 && sim.w.x[i] <= -16 && !sim.w.moving[i]) waiting++;
      }
    }
    expect(onLanes).toBe(0);
    expect(waiting).toBeGreaterThan(0);
  });

  it('신호 교차로 둘레에서 걷던 길이 차로로 들어가면(노드가 여럿인 교차로 등) 그 앞에서 신호를 지킨다', () => {
    const roads = [
      road([[-300, 0], [0, 0]], { cls: 1, lanes: 4 }),
      road([[0, 0], [300, 0]], { cls: 1, lanes: 4 }),
      road([[0, -300], [0, 0]], { cls: 2, lanes: 4 }),
      road([[0, 0], [0, 300]], { cls: 2, lanes: 4 }),
    ];
    const signals = makeSignals(buildCarGraph(roads));
    const g = buildWalkGraph(roads);
    const grp = signals.groupOf(0, 0);
    let t0 = 0;
    while (!(signals.state(0, grp, t0) === RED && signals.state(0, grp, t0 + 40) === RED)) t0 += 1;
    // 교차로 서쪽 20~26m 의 남쪽 보도를 다른 길의 차로가 가로지른다고 친다
    const lanesAt = (x: number, z: number) => x > -26 && x < -20 && z > 0 && z < 12;
    const sim = makeWalkers(g, [{ kind: 'exit', key: 'x', x: -60, z: 9 }], fixedProvider(1, 0), 9, 40, undefined, signals, lanesAt);
    sim.burst('x', 20);
    let tod = t0;
    let entered = 0;
    for (let k = 0; k < 300; k++) {
      sim.step(0.1, { tod, dow: 2, doy: 317 }, false);
      tod += 0.1;
      for (let i = 0; i < sim.w.n; i++) if (lanesAt(sim.w.x[i], sim.w.z[i])) entered++;
    }
    expect(entered).toBe(0);
  });
});
