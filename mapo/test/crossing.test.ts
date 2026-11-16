import { describe, expect, it } from 'vitest';
import { buildCarGraph } from '../src/sim/graph.ts';
import { makeSignals, GREEN, RED } from '../src/sim/signals.ts';
import { makeWalkers } from '../src/sim/walkers.ts';
import { makeCars } from '../src/sim/cars.ts';
import { makeBusRoutes } from '../src/sim/buses.ts';
import { at, crosswalk, fixedProvider, road, walkNet } from './helpers.ts';
import { curbAt } from '../src/data/board.ts';

// (0,0)에서 만나는 동서 큰길(4차로, 찻길 반폭 7.1m)과 남북 골목
const tee = () => [
  road([[-200, 0], [0, 0]], { cls: 2, lanes: 4 }),
  road([[0, 0], [200, 0]], { cls: 2, lanes: 4 }),
  road([[0, 0], [0, 120]], { cls: 4, lanes: 1 }),
];

describe('교차로에서 돌아갈 수 있는 길', () => {
  // 큰길은 횡단보도로만 건넌다: 횡단보도가 없으면 큰길 남쪽 보도와 북쪽 보도·골목은 그래프로 이어지지 않는다. 골목은 북쪽 보도와 이어진다
  const g = walkNet(tee());
  const reach = (a: number) => {
    const seen = new Set([a]);
    const q = [a];
    while (q.length) for (const m of g.adj[q.pop()!]) if (!seen.has(m)) seen.add(m), q.push(m);
    return seen;
  };
  const zs = (set: Set<number>) => [...set].map((n) => [g.nx[n * 2], g.nx[n * 2 + 1]]);
  const start = g.nearest(-100, 9.45, false);
  it('같은 쪽 보도에 머물거나 골목만 건너는 길은 된다', () => {
    const pts = zs(reach(start));
    expect(pts.some(([x, z]) => x > 50 && z > 7.1)).toBe(true);
    expect(pts.some(([, z]) => z > 60)).toBe(true);
  });
  it('큰길을 건너야 하는 길은 안 된다', () => {
    expect(g.nx[start * 2 + 1]).toBeGreaterThan(7.1);
    expect(zs(reach(start)).some(([, z]) => z < 0)).toBe(false);
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

  it('횡단보도 연결은 축 양 끝 찻길 밖 기다리는 자리와 양쪽 보도 선을 잇는다', () => {
    const g = walkNet(roads(), { crosswalks: [xw(false)] });
    expect(g.links).toHaveLength(1);
    const l = g.links[0];
    expect(l.major).toBe(true);
    expect(Math.min(Math.abs(l.paz), Math.abs(l.pbz))).toBeGreaterThan(7.1);
    expect(Math.sign(g.nx[l.na * 2 + 1])).not.toBe(Math.sign(g.nx[l.nb * 2 + 1]));
  });

  it('찻길을 건너는 사람은 횡단보도 위로만 건넌다', () => {
    const rs = roads();
    const cars = buildCarGraph(rs);
    const xws = [xw(false)];
    const g = walkNet(rs, { crosswalks: xws });
    const sim = makeWalkers(g, exits, fixedProvider(1, 0), 3, 60, undefined, undefined);
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

  it('기다리는 자리가 축 옆으로 비켜 있어도(축 끝 바로 밖이 건물) 찻길은 칠한 폭 안으로 건넌다', () => {
    const rs = roads();
    const xws = [xw(false)];
    const g = walkNet(rs, { crosswalks: xws, walls: [Float32Array.from([-2, -9.2, 2, -9.2, 2, -20, -2, -20])] });
    expect(g.links).toHaveLength(1);
    const l = g.links[0];
    expect(Math.max(Math.abs(l.pax), Math.abs(l.pbx))).toBeGreaterThan(2);
    const sim = makeWalkers(g, exits, fixedProvider(1, 0), 3, 60, undefined, undefined);
    let crossed = 0;
    let off = 0;
    // 북쪽 보도가 벽에 끊겨 건너는 사람이 드물다(씨앗에 따라 10분에 한두 번). 30분을 돌려 건넘을 여러 번 본다
    for (let k = 0; k < 18000; k++) {
      if (k % 200 === 0) sim.burst('s', 3), sim.burst('n', 3);
      sim.step(0.1, at(14), false);
      for (let i = 0; i < sim.w.n; i++) {
        if (Math.abs(sim.w.z[i]) > 7.1) continue; // 찻길 밖
        if (Math.abs(sim.w.x[i]) <= 2.05) crossed++;
        else off++;
      }
    }
    expect(crossed).toBeGreaterThan(50);
    expect(off).toBe(0);
  });

  it('건너편 출구가 더 가까운 사람은 횡단보도까지 걸어가 건넌 뒤 그 출구로 들어간다', () => {
    const rs = roads();
    const g = walkNet(rs, { crosswalks: [xw(false)] });
    // 남쪽 출구(x = −80)에서 나온 사람이 동쪽으로 걸어가면 북쪽 출구(x = 20)가 더 가깝다
    let north = 0;
    const sim = makeWalkers(
      g,
      [{ kind: 'exit', key: 's', x: -80, z: 10 }, { kind: 'exit', key: 'n', x: 20, z: -10 }],
      fixedProvider(1, 0),
      5,
      80,
      (_x, z) => z < 0 && north++,
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
    const g = walkNet(rs, { crosswalks: xws });
    const sim = makeWalkers(g, exits, fixedProvider(1, 0), 4, 60, undefined, signals);
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

  it('축이 신호 무리를 가르는 45° 에 걸친 횡단보도도 보행 신호등과 같은 무리를 보고 건넌다', () => {
    // 동서 큰길 중간 신호 횡단보도(차 무리 축 0°). 자료의 축은 45.1° 라 보행 신호등은 보행 무리를 보이는데,
    // 걷는 길 연결 끝은 0.1m 로 반올림되어 축이 45° 아래로 기울 수 있다(판의 횡단보도 760). 그 기운 연결을 만든다
    const rs = [road([[-300, 0], [0, 0]], { cls: 2, lanes: 4 }), road([[0, 0], [300, 0]], { cls: 2, lanes: 4 })];
    const cars = buildCarGraph(rs);
    const a = (45.1 * Math.PI) / 180;
    const xws = [crosswalk(0, 0, Math.cos(a), Math.sin(a), 10.6, [[0, 0]], true, 4)];
    const signals = makeSignals(cars, { crosswalks: xws, stopLines: new Float32Array() });
    const g = walkNet(rs, { crosswalks: xws });
    expect(g.links).toHaveLength(1);
    const l = g.links[0];
    l.bx += 0.15;
    expect(signals.groupOf(0, Math.atan2(l.bz - l.az, l.bx - l.ax))).not.toBe(signals.groupOf(0, a));
    const walk = signals.groupOf(0, a); // 보행 신호등(pedState)이 보는 무리
    const sim = makeWalkers(g, exits, fixedProvider(1, 0), 4, 120, undefined, signals);
    const inside = (x: number, z: number) => Math.abs(z) < 6.5 && Math.abs(x * Math.sin(a) - z * Math.cos(a)) < 2; // 연석 안쪽 0.6m 넘게 찻길
    const was = new Map<number, boolean>();
    let entries = 0;
    let onRed = 0;
    for (let k = 0; k < 9000; k++) {
      if (k % 150 === 0) sim.burst('s', 3), sim.burst('n', 3);
      const tod = k * 0.1;
      sim.step(0.1, { tod, dow: 2, doy: 317 }, false);
      const red = signals.state(0, walk, tod) === RED;
      for (let i = 0; i < sim.w.n; i++) {
        const now = inside(sim.w.x[i], sim.w.z[i]);
        if (now && was.get(sim.w.id[i]) === false) {
          entries++;
          if (red) onRed++;
        }
        was.set(sim.w.id[i], now);
      }
    }
    expect(entries).toBeGreaterThan(15);
    expect(onRed).toBe(0);
  });

  it('긴 신호 횡단보도(32m)는 초록불이 모자라면 서둘러 건너, 건너는 동안 빨간불이 되지 않는다', () => {
    // 8차로(찻길 반폭 약 14m) 중간 신호 횡단보도. 보행 초록불은 22초라 1m/s 로는 다 못 건넌다
    const rs = [road([[-300, 0], [0, 0]], { cls: 2, lanes: 8 }), road([[0, 0], [300, 0]], { cls: 2, lanes: 8 })];
    const cars = buildCarGraph(rs);
    const xws = [crosswalk(0, 0, 0, 1, 16, [[0, 0]], true, 5)];
    const signals = makeSignals(cars, { crosswalks: xws, stopLines: new Float32Array() });
    const g = walkNet(rs, { crosswalks: xws });
    expect(g.links).toHaveLength(1);
    const half = curbAt(rs[0], 0, 1); // 찻길 반폭
    expect(half).toBeGreaterThan(12);
    const sim = makeWalkers(g, [{ kind: 'exit', key: 's', x: -80, z: 22 }, { kind: 'exit', key: 'n', x: 80, z: -22 }], fixedProvider(1, 0), 4, 120, undefined, signals);
    const walk = signals.groupOf(0, Math.PI / 2);
    let on = 0;
    let onRed = 0;
    for (let k = 0; k < 9000; k++) {
      if (k % 150 === 0) sim.burst('s', 3), sim.burst('n', 3);
      const tod = k * 0.1;
      sim.step(0.1, { tod, dow: 2, doy: 317 }, false);
      const red = signals.state(0, walk, tod) === RED;
      for (let i = 0; i < sim.w.n; i++)
        if (Math.abs(sim.w.z[i]) < half && Math.abs(sim.w.x[i]) < 3) {
          on++;
          if (red) onRed++;
        }
    }
    expect(on).toBeGreaterThan(500);
    expect(onRed).toBe(0);
  });

  it('기다리는 자리 옆이 찻길이면(옆길 어귀) 우측통행·빈자리로 비켜 서도 찻길 위에 서지 않는다', () => {
    // 동서 큰길(4차로, 반폭 7.1m)과 북쪽으로 나가는 옆길(등급 3, 2차로). 큰길을 건너는 폭 6m 횡단보도가 옆길 어귀 바로 옆 x = 5.5 에 있다
    const rs = [
      road([[-300, 0], [0, 0]], { cls: 2, lanes: 4 }),
      road([[0, 0], [300, 0]], { cls: 2, lanes: 4 }),
      road([[0, 0], [0, -200]], { cls: 3, lanes: 2 }),
    ];
    const cars = buildCarGraph(rs);
    const xws = [crosswalk(5.5, 0, 0, 1, 7.1, [[0, 0]], true, 6)];
    const signals = makeSignals(cars, { crosswalks: xws, stopLines: new Float32Array() });
    const g = walkNet(rs, { crosswalks: xws });
    expect(g.links).toHaveLength(1);
    const side = curbAt(rs[2], 0, 1); // 옆길 찻길 반폭
    const sim = makeWalkers(g, [{ kind: 'exit', key: 'n', x: 40, z: -10 }, { kind: 'exit', key: 's', x: 40, z: 10 }], fixedProvider(1, 0), 4, 200, undefined, signals);
    let stand = 0;
    let onRoad = 0;
    for (let k = 0; k < 6000; k++) {
      if (k % 60 === 0) sim.burst('n', 4), sim.burst('s', 2);
      sim.step(0.1, { tod: k * 0.1, dow: 2, doy: 317 }, false);
      if (k % 10) continue;
      for (let i = 0; i < sim.w.n; i++) {
        if (sim.w.moving[i]) continue;
        const [x, z] = [sim.w.x[i], sim.w.z[i]];
        stand++;
        if (Math.abs(z) < 7.1 && Math.abs(x - 5.5) > 3) onRoad++; // 칠 밖 큰길 찻길
        if (z < -7.1 && Math.abs(x) < side) onRoad++; // 옆길 찻길
      }
    }
    expect(stand).toBeGreaterThan(300);
    expect(onRoad).toBe(0);
  });

  // 폭 6m 신호 횡단보도에 양쪽에서 사람이 몰려오는 경우
  // 장면은 홍대 구역 한가운데(X0, Z0 만큼 옮김)에 둔다. 원점 둘레는 홍대 구역 몫 경계(x ≈ −90)에 걸려, 서쪽으로 간 사람이 곧 되돌아서서
  // 횡단보도 둘레만 붐빈다. 한가운데에서는 길 양 끝(300m)까지 몫 안이다
  const [X0, Z0] = [350, -250];
  const busyCrossing = () => {
    const rs = [road([[X0 - 300, Z0], [X0, Z0]], { cls: 2, lanes: 4 }), road([[X0, Z0], [X0 + 300, Z0]], { cls: 2, lanes: 4 })];
    const cars = buildCarGraph(rs);
    const xws = [crosswalk(X0, Z0, 0, 1, 7.1, [[X0, Z0]], true, 6)]; // 칠한 면은 연석까지
    const signals = makeSignals(cars, { crosswalks: xws, stopLines: new Float32Array() });
    const g = walkNet(rs, { crosswalks: xws });
    const sim = makeWalkers(g, exits.map((e) => ({ ...e, x: e.x + X0, z: e.z + Z0 })), fixedProvider(1, 0), 4, 160, undefined, signals);
    return { sim, signals };
  };

  it('신호를 기다리는 사람들은 횡단보도 앞에 한 점으로 포개지지 않고 서로 0.6m 넘게 떨어져 선다', () => {
    const { sim } = busyCrossing();
    let close = 0;
    let waiting = 0;
    for (let k = 0; k < 12000; k++) {
      if (k % 100 === 0) sim.burst('s', 4), sim.burst('n', 4);
      sim.step(0.1, { tod: k * 0.1, dow: 2, doy: 317 }, false);
      if (k % 10) continue;
      const w = sim.w;
      const stand: number[] = [];
      for (let i = 0; i < w.n; i++) if (!w.moving[i] && w.fade[i] > 0.99 && Math.abs(w.x[i] - X0) < 10 && Math.abs(w.z[i] - Z0) > 6 && Math.abs(w.z[i] - Z0) < 14) stand.push(i);
      waiting += stand.length;
      for (const i of stand) for (const j of stand) if (i < j && Math.hypot(w.x[i] - w.x[j], w.z[i] - w.z[j]) < 0.6) close++;
    }
    expect(waiting).toBeGreaterThan(500);
    // 빈자리로 옮겨 가는 도중 잠깐 붙는 것만 남는다(고치기 전 1,122건)
    expect(close).toBeLessThan(waiting * 0.005);
  });

  it('건너는 사람은 진행 방향 오른쪽으로 건너서 마주 오는 사람과 겹치지 않고, 같은 쪽 사람과도 포개지지 않는다', () => {
    const { sim } = busyCrossing();
    const w = sim.w;
    const prevZ = new Map<number, number>();
    const south: number[] = [];
    const north: number[] = [];
    let close = 0;
    for (let k = 0; k < 6000; k++) {
      if (k % 100 === 0) sim.burst('s', 4), sim.burst('n', 4);
      sim.step(0.1, { tod: k * 0.1, dow: 2, doy: 317 }, false);
      const on: number[] = [];
      for (let i = 0; i < w.n; i++) {
        if (Math.abs(w.z[i] - Z0) > 6 || Math.abs(w.x[i] - X0) > 4) continue;
        on.push(i);
        const z0 = prevZ.get(w.id[i]);
        if (z0 !== undefined && Math.abs(w.z[i] - z0) > 0.05) (w.z[i] > z0 ? south : north).push(w.x[i] - X0);
      }
      prevZ.clear();
      for (const i of on) prevZ.set(w.id[i], w.z[i]);
      for (const i of on) for (const j of on) if (i < j && Math.hypot(w.x[i] - w.x[j], w.z[i] - w.z[j]) < 0.5) close++;
    }
    const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
    expect(south.length).toBeGreaterThan(300);
    expect(north.length).toBeGreaterThan(300);
    // 남쪽(+z)으로 가는 사람의 오른쪽은 −x, 북쪽으로 가는 사람의 오른쪽은 +x
    expect(mean(south)).toBeLessThan(-0.5);
    expect(mean(north)).toBeGreaterThan(0.5);
    expect(close).toBeLessThan(south.length * 0.01);
  });

  it('신호 없는 횡단보도에서는 차가 다가오면 기다리고, 건너는 사람이 있으면 바쁨 표시를 한다', () => {
    const rs = roads();
    const g = walkNet(rs, { crosswalks: [xw(false)] });
    const busy = new Uint32Array(1);
    let carComing = true;
    const sim = makeWalkers(g, exits, fixedProvider(1, 0), 6, 60, undefined, undefined, { busy, traffic: () => carComing });
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
    // 맞은편 차로 쪽(북쪽 끝 0~4m)에만 사람이 있어도 그 횡단보도 면 위에 사람이 있는 동안은 지나가지 않는다(2026-11-17 W12: 사람이 있는 면을 차가 지나가지 않게)
    busy[0] = 0b11;
    for (let k = 0; k < 100; k++) sim.step(0.1, at(14), false);
    expect(sim.cars.x[0] + 2.3).toBeLessThan(-2);
    // 다 건너면 지나간다
    busy[0] = 0;
    for (let k = 0; k < 300; k++) sim.step(0.1, at(14), false);
    expect(sim.cars.x[0]).toBeGreaterThan(5);
  });
});

describe('중앙버스정류장', () => {
  // 동서 큰길(4차로, 찻길 반폭 7.1m) 가운데 x 0~30m 에 승강장(가운데 (15, 0), 폭 2.2m). 버스는 +x 로 가며 승강장 북쪽(−z), x = 18 에 선다.
  // 승강장 서쪽 끝 x = 0 에 남북으로 건너는 폭 5m 신호 횡단보도
  const setup = () => {
    const rs = [road([[-300, 0], [0, 0]], { cls: 2, lanes: 4 }), road([[0, 0], [300, 0]], { cls: 2, lanes: 4 })];
    const cars = buildCarGraph(rs);
    const xws = [crosswalk(0, 0, 0, 1, 9, [[0, 0]], true, 5)];
    const signals = makeSignals(cars, { crosswalks: xws, stopLines: new Float32Array() });
    const g = walkNet(rs, { crosswalks: xws });
    const sim = makeWalkers(g, [{ kind: 'stop', key: 'm', x: 18, z: 0, median: true, yaw: 0 }], fixedProvider(1, 0), 6, 50, undefined, signals);
    return { sim, signals };
  };
  const onIsland = (x: number, z: number) => Math.abs(z) < 1.3 && x > -1 && x < 31;
  const onCrossing = (x: number) => Math.abs(x) < 2.7;

  it('버스에서 내린 사람은 승강장에서 신호를 기다렸다가 횡단보도 나머지를 건너 보도로 가고, 찻길은 횡단보도로만 지난다', () => {
    const { sim, signals } = setup();
    sim.alight('m', 6, 18, -2.6);
    expect(sim.w.n).toBe(6);
    let wrong = 0;
    let onRed = 0;
    let tod = 0;
    for (let k = 0; k < 2400; k++) {
      sim.step(0.1, { tod, dow: 2, doy: 317 }, false);
      tod += 0.1;
      const walkGreen = signals.state(0, 1, tod) === GREEN;
      for (let i = 0; i < sim.w.n; i++) {
        const { x, z } = { x: sim.w.x[i], z: sim.w.z[i] };
        if (Math.abs(z) > 7.1 || onIsland(x, z)) continue;
        if (!onCrossing(x)) wrong++;
        else if (!walkGreen && signals.state(0, 0, tod) === GREEN) onRed++;
      }
    }
    expect(wrong).toBe(0);
    expect(onRed).toBe(0);
    // 모두 보도로 나왔다
    for (let i = 0; i < sim.w.n; i++) expect(Math.abs(sim.w.z[i])).toBeGreaterThan(7.1);
  });

  it('정류장으로 가는 사람은 횡단보도를 건너 승강장에서 줄을 서 기다렸다가 버스를 탄다', () => {
    const { sim } = setup();
    sim.alight('m', 6, 18, -2.6);
    let tod = 0;
    for (let k = 0; k < 9000 && sim.waitingAt('m') < 2; k++) sim.step(0.1, { tod: (tod += 0.1), dow: 2, doy: 317 }, false);
    const waiting = sim.waitingAt('m');
    expect(waiting).toBeGreaterThan(1);
    // 서 있는 사람은 모두 승강장 위에 있고, 서로 겹치지 않는다
    const stand: number[] = [];
    for (let i = 0; i < sim.w.n; i++) if (!sim.w.moving[i] && Math.abs(sim.w.z[i]) < 7.1) stand.push(i);
    expect(stand.length).toBeGreaterThanOrEqual(waiting);
    for (const i of stand) expect(onIsland(sim.w.x[i], sim.w.z[i])).toBe(true);
    for (const i of stand) for (const j of stand) if (i < j) expect(Math.hypot(sim.w.x[i] - sim.w.x[j], sim.w.z[i] - sim.w.z[j])).toBeGreaterThan(0.7);
    sim.board('m', 18, -2.6);
    sim.step(0.1, { tod: (tod += 0.1), dow: 2, doy: 317 }, false);
    expect(sim.waitingAt('m')).toBe(0);
    for (let k = 0; k < 200; k++) sim.step(0.1, { tod: (tod += 0.1), dow: 2, doy: 317 }, false);
    expect(sim.w.n).toBe(6 - waiting);
  });
});

describe('길가 버스 정류장과 횡단보도', () => {
  // 동서 일방 큰길. 정류장(노선 거리 300m) 바로 앞(303m)과 뒤(296m)에 폭 5m 횡단보도
  const rs = () => [road([[0, 0], [600, 0]], { oneway: true })];
  for (const at of [303, 296]) {
    it(`정류장에 선 버스 몸통(앞문 포함)이 횡단보도 칠 위에 놓이지 않게 정류장을 민다(횡단보도 ${at}m)`, () => {
      const g = buildCarGraph(rs());
      const xws = [crosswalk(at, 0, 0, 1, 8, [], false, 5)];
      const [r] = makeBusRoutes([{ ref: '603', kind: 0, to: '', segs: [1], stops: [300], stopNames: ['정류장'] }], g, [], xws);
      // 버스 길이 최대 12m: 가운데에서 앞뒤 6m 가 칠 면(축에서 ±2.5m) 밖이어야 한다
      expect(Math.abs(r.stops[0] - at)).toBeGreaterThanOrEqual(6 + 2.5);
      // 멀리 밀지 않는다
      expect(Math.abs(r.stops[0] - 300)).toBeLessThan(15);
    });
  }
});
