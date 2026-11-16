import { describe, expect, it } from 'vitest';
import type { DataProvider } from '../src/sim/provider.ts';
import { makeWalkers, OUT_BASE, underpasses, walkerScale, zoneTargets, ZONE_IDS, ZONES, type Portal } from '../src/sim/walkers.ts';
import { at, road, walkNet } from './helpers.ts';

// 홍대·홍대입구역·연남 구역을 덮는 60m 간격 골목 격자
function grid() {
  const out = [];
  for (let x = 0; x <= 840; x += 60) for (let z = -1440; z < 120; z += 60) out.push(road([[x, z], [x, z + 60]], { cls: 5, lanes: 1 }));
  for (let z = -1440; z <= 120; z += 60) for (let x = 0; x < 840; x += 60) out.push(road([[x, z], [x + 60, z]], { cls: 5, lanes: 1 }));
  return out;
}
const portals: Portal[] = [
  { kind: 'exit', key: '홍대입구', x: 573, z: -643 },
  { kind: 'exit', key: '연남', x: 300, z: -1050 },
  { kind: 'exit', key: '서교', x: 300, z: -250 },
];
/** 구역 id → 구역 인구 */
const provider = (pop: Record<string, number>): DataProvider => ({
  mode: 'sim',
  areas: () => Object.entries(pop).map(([id, n]) => ({ id, name: id, level: 2, label: '약간 붐빔', pplMin: n, pplMax: n, crowd: 0.7, ages: [5, 10, 25, 20, 15, 12, 8, 5], female: 50 })),
  roadSpeed: () => 1,
  alighting: () => 0,
});
const inZone = (id: string, x: number, z: number, pad = 0) => Math.hypot(x - ZONES[id][0], z - ZONES[id][1]) < ZONES[id][2] + pad;

function settle(pop: Record<string, number>, secs = 600, max = 2500) {
  const sim = makeWalkers(walkNet(grid()), portals, provider(pop), 3, max);
  for (let k = 0; k < secs * 2; k++) sim.step(0.5, { ...at(14), tod: 14 * 3600 + k * 0.5 });
  return sim;
}

const density = (sim: ReturnType<typeof settle>, id: string) => {
  let n = 0;
  for (let i = 0; i < sim.w.n; i++) if (inZone(id, sim.w.x[i], sim.w.z[i])) n++;
  return n / (Math.PI * ZONES[id][2] ** 2);
};

describe('구역 인구와 화면 인원', () => {
  it('상한 안이면 화면 1명이 밖에 나와 걷는 실제 1명이다(구역 인구의 13.5%, 구역 밖 둘레 12% 더)', () => {
    // 이 격자에는 구역 밖 명소 둘레 문이 없으므로 그 칸(마지막)은 채워지지 않는다
    const sim = settle({ hongdae: 6000, yeonnam: 6000 }, 600, 5000);
    expect(walkerScale(provider({ hongdae: 6000, yeonnam: 6000 }), { ...at(14), tod: 14 * 3600 }, 5000)).toBe(1);
    expect(sim.w.n).toBeGreaterThan(12000 * OUT_BASE * 1.12 * 0.8);
    expect(sim.w.n).toBeLessThan(12000 * OUT_BASE * 1.12 * 1.2);
  });
  it('인구가 상한을 넘으면 모든 구역을 같은 배율로 줄인다', () => {
    const p = provider({ hongdae: 60000, yeonnam: 60000 });
    const k = walkerScale(p, { ...at(14), tod: 14 * 3600 }, 2500);
    expect(k).toBeGreaterThan(5);
    const sim = settle({ hongdae: 60000, yeonnam: 60000 });
    expect(sim.w.n).toBeLessThanOrEqual(2500);
    // 구역 밖 명소 칸 몫(이 격자에는 그 문이 없다)을 뺀 만큼은 채운다
    const want = zoneTargets(p, { ...at(14), tod: 14 * 3600 + 600 }, 2500);
    expect(sim.w.n).toBeGreaterThan(want.slice(0, ZONE_IDS.length + 1).reduce((a, b) => a + b, 0) * 0.85);
  });
  it('인구가 같으면 좁은 구역이 넓은 구역보다 빽빽하다', () => {
    const sim = settle({ 'hongik-stn': 6000, yeonnam: 6000 });
    expect(density(sim, 'hongik-stn') / density(sim, 'yeonnam')).toBeGreaterThan(1.8);
  });
  it('작은 구역에서 나온 사람은 대부분 그 구역 안을 돌아다닌다', () => {
    const sim = settle({ 'hongik-stn': 6000 });
    let inside = 0;
    for (let i = 0; i < sim.w.n; i++) if (inZone('hongik-stn', sim.w.x[i], sim.w.z[i], 30)) inside++;
    expect(sim.w.n).toBeGreaterThan(100);
    expect(inside / sim.w.n).toBeGreaterThan(0.85);
  });
});

describe('나이대와 성별', () => {
  it('구역의 나이대 비율대로 사람의 나이대가 정해진다', () => {
    // 홍대입구역에는 70대 이상만, 연남에는 0~9세만 있다고 하면
    const p: DataProvider = {
      ...provider({ 'hongik-stn': 1, yeonnam: 1 }),
      areas: () => [
        { id: 'hongik-stn', name: '', level: 3, label: '붐빔', pplMin: 6000, pplMax: 6000, crowd: 1, ages: [0, 0, 0, 0, 0, 0, 0, 100], female: 100 },
        { id: 'yeonnam', name: '', level: 3, label: '붐빔', pplMin: 6000, pplMax: 6000, crowd: 1, ages: [100, 0, 0, 0, 0, 0, 0, 0], female: 0 },
      ],
    };
    const sim = makeWalkers(walkNet(grid()), portals, p, 3, 2500);
    for (let k = 0; k < 120; k++) sim.step(0.5, { ...at(14), tod: 14 * 3600 + k * 0.5 });
    let old = 0;
    let kid = 0;
    for (let i = 0; i < sim.w.n; i++) {
      if (inZone('hongik-stn', sim.w.x[i], sim.w.z[i], 30)) {
        expect(sim.w.age[i]).toBe(3);
        expect(sim.w.female[i]).toBe(1);
        old++;
      } else if (inZone('yeonnam', sim.w.x[i], sim.w.z[i])) {
        expect(sim.w.age[i]).toBe(0);
        expect(sim.w.female[i]).toBe(0);
        kid++;
      }
    }
    expect(old).toBeGreaterThan(10);
    expect(kid).toBeGreaterThan(10);
  });
});

describe('건물 출입구', () => {
  // 연남 구역 안쪽 골목에 건물 하나: 출구에서 먼 구역 안쪽에도 사람이 드나든다
  const box = (x: number, z: number, h = 12) => ({ kind: 'door' as const, key: '', x, z, poly: Float32Array.from([x - 8, z - 8, x + 8, z - 8, x + 8, z + 8, x - 8, z + 8]), h });
  it('건물에서 나온 사람은 건물 벽에서 나와 보도로 걸어가고, 구역 안쪽에도 사람이 있다', () => {
    // 골목(60m 간격) 바로 옆 건물들
    const doors = [box(131, -1290), box(431, -1290), box(131, -810), box(431, -810)];
    const sim = makeWalkers(walkNet(grid()), [...portals, ...doors], provider({ yeonnam: 6000 }), 3, 2500);
    for (let k = 0; k < 600; k++) sim.step(0.5, { ...at(14), tod: 14 * 3600 + k * 0.5 });
    let deep = 0;
    for (let i = 0; i < sim.w.n; i++) if (Math.hypot(sim.w.x[i] - 300, sim.w.z[i] + 1050) < 260 && Math.hypot(sim.w.x[i] - 300, sim.w.z[i] + 1050) > 60) deep++;
    expect(deep).toBeGreaterThan(80);
    // 막 나온 사람은 처음에 건물 벽 근처에 있다
    const seen = new Set<number>();
    for (let i = 0; i < sim.w.n; i++) seen.add(sim.w.id[i]);
    let near = 0;
    for (let k = 0; k < 300; k++) {
      sim.step(0.1, { ...at(14), tod: 14 * 3600 + 300 + k * 0.1 });
      for (let i = 0; i < sim.w.n; i++) {
        if (seen.has(sim.w.id[i])) continue;
        seen.add(sim.w.id[i]);
        for (const d of doors) if (Math.abs(sim.w.x[i] - d.x) < 9 && Math.abs(sim.w.z[i] - d.z) < 9) near++;
      }
    }
    expect(near).toBeGreaterThan(3);
  });
});

describe('붐비는 길 걷기', () => {
  // 홍대입구역 구역 안 350m 보행 전용 길, 두 끝에 출구
  const street = () => walkNet([road([[400, -643], [750, -643]], { cls: 6, lanes: 1 })]);
  const ends: Portal[] = [
    { kind: 'exit', key: '홍대입구', x: 400, z: -643 },
    { kind: 'exit', key: '홍대입구', x: 750, z: -643 },
  ];
  const run = (pop: number) => {
    const sim = makeWalkers(street(), ends, provider({ 'hongik-stn': pop }), 5, 3000);
    for (let k = 0; k < 400; k++) sim.step(0.5, { ...at(14), tod: 14 * 3600 + k * 0.5 });
    // 걷는 사람이 진행 방향으로 나아가는 평균 속력과, 0.45m 안으로 붙은 두 사람의 비율.
    // 붙은 비율은 길 가운데 250m 에서만 잰다(시험용 길의 두 끝은 막다른 곳이라 되돌아서는 사람이 뭉친다)
    let speed = 0;
    let cnt = 0;
    let close = 0;
    let pairs = 0;
    for (let k = 0; k < 40; k++) {
      const before = new Map<number, [number, number, number]>();
      for (let i = 0; i < sim.w.n; i++) if (sim.w.moving[i]) before.set(sim.w.id[i], [sim.w.x[i], sim.w.z[i], sim.w.yaw[i]]);
      sim.step(0.1, { ...at(14), tod: 14 * 3600 + 200 + k * 0.1 });
      for (let i = 0; i < sim.w.n; i++) {
        const b = before.get(sim.w.id[i]);
        if (!b || !sim.w.moving[i]) continue;
        speed += Math.abs((sim.w.x[i] - b[0]) * Math.cos(b[2]) + (sim.w.z[i] - b[1]) * Math.sin(b[2])) / 0.1;
        cnt++;
      }
      if (k % 10) continue;
      for (let i = 0; i < sim.w.n; i++)
        for (let j = i + 1; j < sim.w.n; j++) {
          if (Math.abs(sim.w.x[i] - sim.w.x[j]) > 1 || sim.w.x[i] < 450 || sim.w.x[i] > 700 || sim.w.fade[i] < 0.99 || sim.w.fade[j] < 0.99) continue;
          pairs++;
          if (Math.hypot(sim.w.x[i] - sim.w.x[j], sim.w.z[i] - sim.w.z[j]) < 0.45) close++;
        }
    }
    return { n: sim.w.n, speed: speed / cnt, close: close / Math.max(1, pairs) };
  };
  it('사람이 많을수록 걸음이 느려지고, 앞사람을 비켜 서로 겹치지 않는다', () => {
    const sparse = run(1500);
    const dense = run(9000);
    expect(dense.n).toBeGreaterThan(sparse.n * 4);
    expect(dense.speed).toBeLessThan(sparse.speed * 0.8);
    expect(dense.close).toBeLessThan(0.08);
  });
});

describe('공원 나들목', () => {
  it('걷는 길이 강변 자동차 전용도로 밑을 지나는 곳을 찾는다', () => {
    const roads = [
      road([[-200, 0], [200, 0]], { cls: 0, oneway: true }),
      road([[0, -100], [0, 100]], { cls: 7, lanes: 1 }),
      road([[150, -100], [150, 100]], { cls: 7, lanes: 1, p: Float32Array.from([150, 8, -100, 150, 8, 100]) }), // 육교는 뺀다
    ];
    const g = underpasses(roads, 0, 0, 300);
    expect(g).toHaveLength(1);
    expect(Math.hypot(g[0][0], g[0][1])).toBeLessThan(1);
  });
});

describe('보는 곳 먼저 채우기', () => {
  const now0 = { ...at(14), tod: 14 * 3600 };
  const big = { hongdae: 60000, yeonnam: 60000 };
  // 홍대 구역 안쪽 한 곳을 가까이 본다: 보는 곳 반지름 200m, 화면은 그 가운데 120m 네모
  const F = { x: 360, z: -300, r: 200 };
  const screen = (x: number, z: number) => Math.abs(x - F.x) < 60 && Math.abs(z - F.z) < 60;
  const inF = (x: number, z: number) => Math.hypot(x - F.x, z - F.z) < F.r;
  const run = (sim: ReturnType<typeof makeWalkers>, from: number, secs: number, each?: () => void) => {
    for (let k = 0; k < secs * 2; k++) {
      sim.step(0.5, { ...now0, tod: now0.tod + from + k * 0.5 });
      each?.();
    }
  };
  const count = (sim: ReturnType<typeof makeWalkers>, f: (x: number, z: number) => boolean) => {
    let n = 0;
    for (let i = 0; i < sim.w.n; i++) if (f(sim.w.x[i], sim.w.z[i])) n++;
    return n;
  };

  it('보는 곳을 정하지 않으면 모든 곳을 같은 배율로 줄인다(옛 방식)', () => {
    const sim = makeWalkers(walkNet(grid()), portals, provider(big), 3, 2500);
    run(sim, 0, 60);
    const [kIn, kOut] = sim.scale();
    expect(kIn).toBeCloseTo(walkerScale(provider(big), now0, 2500), 0);
    expect(kOut).toBeCloseTo(kIn, 5);
  });
  it('가까이 보면 보는 곳 안은 실제 붐빔대로(1명 = 1명) 채우고, 밖은 더 줄인다', () => {
    const sim = makeWalkers(walkNet(grid()), portals, provider(big), 3, 2500);
    sim.setFocus(F.x, F.z, F.r, () => false);
    run(sim, 0, 600);
    const [kIn, kOut] = sim.scale();
    expect(kIn).toBe(1);
    expect(kOut).toBeGreaterThan(walkerScale(provider(big), now0, 2500));
    const real = sim.expected(inF, { ...now0, tod: now0.tod + 600 });
    expect(real).toBeGreaterThan(100);
    const have = count(sim, inF);
    expect(have).toBeGreaterThan(real * 0.85);
    expect(have).toBeLessThan(real * 1.2);
    expect(sim.w.n).toBeLessThanOrEqual(2500);
  });
  it('보는 곳을 옮기면 화면 밖에서 놓고 빼서, 화면 안에서는 갑자기 생기거나 사라지지 않는다', () => {
    const sim = makeWalkers(walkNet(grid()), portals, provider(big), 3, 2500);
    run(sim, 0, 300);
    const before = count(sim, inF);
    // 화면(네모) 안에 문·출구가 없으므로, 화면 안에 새로 보이는 사람은 화면 가장자리에서 걸어 들어온 사람뿐이다
    sim.setFocus(F.x, F.z, F.r, screen);
    let prev = new Map<number, [number, number]>();
    let popped = 0;
    let vanished = 0;
    run(sim, 300, 120, () => {
      const cur = new Map<number, [number, number]>();
      for (let i = 0; i < sim.w.n; i++) cur.set(sim.w.id[i], [sim.w.x[i], sim.w.z[i]]);
      for (const [id, [x, z]] of cur) if (!prev.has(id) && prev.size && screen(x, z) && Math.abs(x - F.x) < 55 && Math.abs(z - F.z) < 55) popped++;
      for (const [id, [x, z]] of prev) if (!cur.has(id) && screen(x, z) && Math.abs(x - F.x) < 55 && Math.abs(z - F.z) < 55) vanished++;
      prev = cur;
    });
    expect(popped).toBe(0);
    expect(vanished).toBe(0);
    expect(count(sim, inF)).toBeGreaterThan(before * 1.8);
  });
  it('판 전체를 보면 지금과 같은 인원이다', () => {
    const a = makeWalkers(walkNet(grid()), portals, provider(big), 3, 2500);
    const b = makeWalkers(walkNet(grid()), portals, provider(big), 3, 2500);
    b.setFocus(0, 0, 1e5, () => true);
    run(a, 0, 300);
    run(b, 0, 300);
    expect(Math.abs(a.w.n - b.w.n)).toBeLessThan(a.w.n * 0.05);
    expect(b.scale()[0]).toBeCloseTo(a.scale()[0], 1);
  });
});
