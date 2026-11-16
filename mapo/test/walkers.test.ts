import { describe, expect, it } from 'vitest';
import { buildCarGraph } from '../src/sim/graph.ts';
import { makeSignals, RED } from '../src/sim/signals.ts';
import { makeWalkers, walkerTarget, zoneTargets, ZONE_IDS, type Portal } from '../src/sim/walkers.ts';
import { makeSimProvider } from '../src/sim/provider.ts';
import { at, crosswalk, fixedProvider, road, walkNet } from './helpers.ts';

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
    const g = walkNet(lanes());
    expect(g.adj.length).toBe(9);
    const centre = g.nearest(100, 100);
    expect(g.adj[centre].length).toBe(4);
  });
  it('간선도로 찻길 위와 교량은 걷지 않는다', () => {
    const g = walkNet([road([[0, 0], [100, 0]], { cls: 0 }), road([[0, 50], [100, 50]], { cls: 4, bridge: true, p: Float32Array.from([0, 12, 50, 100, 12, 50]) })]);
    for (let n = 0; n < g.adj.length; n++) {
      if (!g.adj[n].length) continue;
      expect(Math.abs(g.nx[n * 2 + 1])).toBeGreaterThan(3.8);
      expect(Math.abs(g.nx[n * 2 + 1] - 50)).toBeGreaterThan(3);
    }
  });
});

describe('보행자', () => {
  it('열차가 도착하면 그 역 출구에서 무리가 나온다', () => {
    const sim = makeWalkers(walkNet(lanes()), exits, fixedProvider(1), 1, 200);
    sim.burst('합정', 20);
    expect(sim.w.n).toBe(20);
    for (let i = 0; i < 20; i++) expect(Math.hypot(sim.w.x[i] - 102, sim.w.z[i] - 98)).toBeLessThan(15);
  });
  it('모르는 역이면 아무도 나오지 않는다', () => {
    const sim = makeWalkers(walkNet(lanes()), exits, fixedProvider(1), 1, 200);
    sim.burst('없는역', 5);
    expect(sim.w.n).toBe(0);
  });
  it('60초 뒤에도 모두 길 위를 걷고 있다', () => {
    const sim = makeWalkers(walkNet(lanes()), exits, fixedProvider(1), 2, 200);
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
    const sim = makeWalkers(walkNet(lanes()), exits, fixedProvider(1), 2, 200);
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
  it('비가 오면 밖에 걷는 사람이 줄고, 한강공원은 거리보다 훨씬 많이 준다', () => {
    const p = makeSimProvider();
    const dry = zoneTargets(p, at(14, 0), 1e6);
    const wet = zoneTargets(p, at(14, 0), 1e6, 1);
    const park = ZONE_IDS.indexOf('mangwon');
    const street = ZONE_IDS.indexOf('hongdae');
    expect(wet[street]).toBeLessThan(dry[street] * 0.8);
    expect(wet[street]).toBeGreaterThan(dry[street] * 0.4);
    expect(wet[park]).toBeLessThan(dry[park] * 0.25);
    expect(walkerTarget(p, at(14, 0), 1e6, 0.5)).toBeLessThan(walkerTarget(p, at(14, 0), 1e6));
  });
  it('최대 인원을 넘지 않는다', () => {
    const sim = makeWalkers(walkNet(lanes()), exits, fixedProvider(1, 500000), 3, 50);
    sim.burst('합정', 80);
    for (let i = 0; i < 300; i++) sim.step(0.1, at(21, 5), true);
    expect(sim.w.n).toBeLessThanOrEqual(50);
    expect(sim.w.n).toBeGreaterThan(30);
  });
});

describe('부드럽게 돌기', () => {
  it('모퉁이를 돌거나 되돌아설 때 몸 방향을 한 프레임(1/30초)에 15°넘게 꺾지 않는다', () => {
    const g = walkNet([road([[0, 0], [40, 0], [40, 40], [0, 40]], { cls: 4, lanes: 1 })]);
    const sim = makeWalkers(g, [{ kind: 'exit', key: 'x', x: 10, z: 0 }], fixedProvider(1, 0), 3, 20);
    sim.burst('x', 6);
    const w = sim.w;
    const prev = new Map<number, number>();
    let worst = 0;
    let turns = 0;
    for (let k = 0; k < 3600; k++) {
      sim.step(1 / 30, at(14), false);
      for (let i = 0; i < w.n; i++) {
        const y0 = prev.get(w.id[i]);
        if (y0 === undefined || w.fade[i] < 0.99) continue;
        const d = Math.abs(((((w.yaw[i] - y0) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
        worst = Math.max(worst, d);
        if (d > 0.01) turns++;
      }
      prev.clear();
      for (let i = 0; i < w.n; i++) prev.set(w.id[i], w.yaw[i]);
    }
    expect(turns).toBeGreaterThan(5);
    expect((worst * 180) / Math.PI).toBeLessThan(15);
  });
});

describe('멈춰 서서 구경하기', () => {
  it('붙잡힌 사람은 멈춰 서서 대상을 보며 휴대폰을 들고, 시간이 지나면 다시 걷는다', () => {
    const g = walkNet([road([[0, 0], [400, 0]], { cls: 4, lanes: 1 })]);
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
    const sim = makeWalkers(walkNet(lanes()), portals(), fixedProvider(1, 50000), 4, 300);
    sim.step(0.1, at(14), true);
    expect(sim.w.n).toBeGreaterThan(0);
    for (let i = 0; i < sim.w.n; i++) expect(near(sim.w.x[i], sim.w.z[i], 8)).toBe(true);
  });

  it('사라질 때는 출구나 정류장까지 걸어가서 사라진다', () => {
    const left: [number, number][] = [];
    const sim = makeWalkers(walkNet(lanes()), portals(), fixedProvider(1, 0), 5, 300, (x, z) => left.push([x, z]));
    sim.burst('합정', 25);
    for (let k = 0; k < 6000 && sim.w.n; k++) sim.step(0.1, at(14), false);
    expect(left.length).toBe(25 - sim.w.n);
    expect(left.length).toBeGreaterThan(15);
    // 출구에서는 그 자리에서, 정류장에서는 줄(최대 12명, 1.5m 간격) 어딘가에서 사라진다
    for (const [x, z] of left) expect(near(x, z, 6) || Math.hypot(x - 150, z - 103) < 20).toBe(true);
  });

  it('정류장에 간 사람은 버스를 기다렸다가 타고, 버스에서 내린 사람이 나타난다', () => {
    const sim = makeWalkers(walkNet(lanes()), [{ kind: 'stop', key: 's', x: 150, z: 103 }], fixedProvider(1, 0), 6, 50);
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
    const sim = makeWalkers(walkNet(lanes()), [{ kind: 'stop', key: 's', x: 150, z: 103 }], fixedProvider(1, 0), 8, 50);
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
    const sim = makeWalkers(walkNet(lanes()), [{ kind: 'stop', key: 's', x: 150, z: 103 }], fixedProvider(1, 0), 9, 50, (x, z) => left.push([x, z]));
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
    const g = walkNet([road([[0, 0], [300, 0]], { cls: 2, lanes: 4 }), road([[300, 0], [600, 0]], { cls: 2, lanes: 4 })]);
    const sim = makeWalkers(g, [{ kind: 'exit', key: 'x', x: 280, z: 10 }], fixedProvider(1, 0), 7, 50);
    sim.burst('x', 20);
    for (let k = 0; k < 100; k++) {
      sim.step(0.1, at(14), false);
      for (let i = 0; i < sim.w.n; i++) expect(sim.w.z[i]).toBeGreaterThan(7.1);
    }
  });
});

describe('차도와 겹친 보행로', () => {
  it('차로 위에 그려진 보행로(지도 자료의 보도 선)는 걷지 않아, 사람이 찻길에 들어서지 않는다', () => {
    // 동서로 놓인 한 방향 3차로(찻길 z −5.45~5.45). 차로 한가운데(z = 2)를 따라 그려진 보행로와, 찻길 가장자리에 걸친 보행로(z = 6)
    const roads = [
      road([[-300, 0], [300, 0]], { cls: 1, lanes: 3, oneway: true }),
      road([[-200, 2], [200, 2]], { cls: 7, lanes: 1 }),
      road([[-200, 6], [200, 6]], { cls: 6, lanes: 1 }),
    ];
    const g = walkNet(roads);
    const sim = makeWalkers(g, [{ kind: 'exit', key: 'x', x: -150, z: 8 }, { kind: 'exit', key: 'x', x: 150, z: -8 }], fixedProvider(1, 0), 4, 60);
    let onRoad = 0;
    for (let k = 0; k < 2000; k++) {
      if (k % 100 === 0) sim.burst('x', 3);
      sim.step(0.1, at(14), false);
      for (let i = 0; i < sim.w.n; i++) if (Math.abs(sim.w.z[i]) < 5.45) onRoad++;
    }
    expect(onRoad).toBe(0);
  });
});

describe('찻길과 신호', () => {
  it('신호 교차로가 없는 곳에서는 길 중간을 가로지르는 보행로로도 큰길을 건너지 않고 되돌아선다', () => {
    // 동서로 놓인 4차로 큰길과, 그 길을 남북으로 가로지르는 보행로. 출구는 남쪽 끝
    const roads = [road([[-300, 0], [300, 0]], { cls: 1, lanes: 4 }), road([[0, -60], [0, 60]], { cls: 7, lanes: 1 })];
    const cars = buildCarGraph(roads);
    const signals = makeSignals(cars);
    const g = walkNet(roads);
    const sim = makeWalkers(g, [{ kind: 'exit', key: 'x', x: 0, z: 55 }], fixedProvider(1, 0), 4, 40, undefined, signals);
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
    const g = walkNet(roads);
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
    // 분리대(z −1.55~1.55)를 사이에 둔 한 방향 3차로 둘: 동쪽으로 가는 길은 z = 7(찻길 1.55~12.45), 서쪽으로 가는 길은 z = −7. 출구는 남쪽 바깥 보도
    const g = walkNet(
      [road([[0, 7], [60, 7], [120, 7]], { cls: 1, lanes: 3, oneway: true }), road([[120, -7], [60, -7], [0, -7]], { cls: 1, lanes: 3, oneway: true })],
      { med: [[0, -1.55, 120, -1.55, 120, 1.55, 0, 1.55]] },
    );
    const sim = makeWalkers(g, [{ kind: 'exit', key: 'x', x: 50, z: 14.8 }], fixedProvider(1, 0), 8, 60);
    sim.burst('x', 40);
    for (let k = 0; k < 2000; k++) {
      sim.step(0.1, at(14), false);
      for (let i = 0; i < sim.w.n; i++) expect(sim.w.z[i]).toBeGreaterThan(12.45);
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
    const g = walkNet(roads);
    // 동서 방향(무리 0)이 35초 넘게 빨간불인 시각(큰길 쪽이 초록을 더 받아 빨간불은 40초가 안 된다)
    const grp = signals.groupOf(0, 0);
    let t0 = 0;
    while (t0 < 200 && !(signals.state(0, grp, t0) === RED && signals.state(0, grp, t0 + 35) === RED)) t0 += 1;
    expect(t0).toBeLessThan(200);
    const sim = makeWalkers(g, [{ kind: 'exit', key: 'x', x: -40, z: 9 }], fixedProvider(1, 0), 9, 40, undefined, signals);
    sim.burst('x', 30);
    let tod = t0;
    let inside = 0;
    for (let k = 0; k < 350; k++) {
      sim.step(0.1, { tod, dow: 2, doy: 317 }, false);
      tod += 0.1;
      // 남쪽 보도를 따라 동쪽으로 가던 사람은 남북 찻길(|x| < 7.1)을 가로지르는 횡단보도(보도 연장선)에 들어가지 않는다
      for (let i = 0; i < sim.w.n; i++) if (Math.abs(sim.w.x[i]) < 7.1 && sim.w.z[i] > 7.1 && sim.w.z[i] < 11) inside++;
    }
    expect(inside).toBe(0);
  });

  it('신호 교차로 횡단보도 앞에서는 찻길 밖 보도에 서서 기다리고, 찻길에는 횡단보도로만 들어선다', () => {
    const roads = [
      road([[-300, 0], [0, 0]], { cls: 1, lanes: 4 }),
      road([[0, 0], [300, 0]], { cls: 1, lanes: 4 }),
      road([[0, -300], [0, 0]], { cls: 2, lanes: 4 }),
      road([[0, 0], [0, 300]], { cls: 2, lanes: 4 }),
    ];
    // 남쪽 보도를 잇는, 남북 찻길(|x| < 7.1)을 동서로 건너는 신호 횡단보도(폭 4m, z = 9.45)
    const xws = [crosswalk(0, 9.45, 1, 0, 7.1, [], true, 4)];
    const signals = makeSignals(buildCarGraph(roads), { crosswalks: xws, stopLines: new Float32Array() });
    const g = walkNet(roads, { crosswalks: xws });
    const sim = makeWalkers(g, [{ kind: 'exit', key: 'x', x: -60, z: 9 }, { kind: 'exit', key: 'y', x: 60, z: 9 }], fixedProvider(1, 0), 9, 80, undefined, signals);
    let standOnRoad = 0;
    let offCrossing = 0;
    let waiting = 0;
    let crossed = 0;
    for (let k = 0; k < 3000; k++) {
      if (k % 100 === 0) sim.burst('x', 3), sim.burst('y', 3);
      sim.step(0.1, { tod: k * 0.1, dow: 2, doy: 317 }, false);
      for (let i = 0; i < sim.w.n; i++) {
        const [x, z] = [sim.w.x[i], sim.w.z[i]];
        const road = Math.abs(x) < 7.1 || Math.abs(z) < 7.1;
        if (road && !sim.w.moving[i]) standOnRoad++;
        if (road && !(Math.abs(z - 9.45) < 2.1 && Math.abs(x) < 7.6)) offCrossing++;
        if (road && Math.abs(x) < 3) crossed++;
        if (!sim.w.moving[i] && Math.abs(x) > 7.1 && Math.abs(x) < 12 && z > 7.1 && z < 12) waiting++;
      }
    }
    expect(crossed).toBeGreaterThan(50);
    expect(waiting).toBeGreaterThan(0);
    expect(standOnRoad).toBe(0);
    expect(offCrossing).toBe(0);
  });
});
