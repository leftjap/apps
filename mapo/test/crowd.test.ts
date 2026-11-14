import { describe, expect, it } from 'vitest';
import { buildWalkGraph } from '../src/sim/graph.ts';
import type { DataProvider } from '../src/sim/provider.ts';
import { makeWalkers, underpasses, ZONES, type Portal } from '../src/sim/walkers.ts';
import { at, road } from './helpers.ts';

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
/** 구역 id → 혼잡 정도(붐빔 기준 인원 대비 지금 인원) */
const provider = (crowd: Record<string, number>): DataProvider => ({
  mode: 'sim',
  areas: () => Object.entries(crowd).map(([id, c]) => ({ id, name: id, level: 2, label: '약간 붐빔', pplMin: 10000, pplMax: 11000, crowd: c, ages: [5, 10, 25, 20, 15, 12, 8, 5], female: 50 })),
  roadSpeed: () => 1,
  alighting: () => 0,
});
const inZone = (id: string, x: number, z: number, pad = 0) => Math.hypot(x - ZONES[id][0], z - ZONES[id][1]) < ZONES[id][2] + pad;

function settle(crowd: Record<string, number>, secs = 600) {
  const sim = makeWalkers(buildWalkGraph(grid()), portals, provider(crowd), 3, 2500);
  for (let k = 0; k < secs * 2; k++) sim.step(0.5, { ...at(14), tod: 14 * 3600 + k * 0.5 });
  return sim;
}

const density = (sim: ReturnType<typeof settle>, id: string) => {
  let n = 0;
  for (let i = 0; i < sim.w.n; i++) if (inZone(id, sim.w.x[i], sim.w.z[i])) n++;
  return n / (Math.PI * ZONES[id][2] ** 2);
};

describe('구역 혼잡도와 화면 인원', () => {
  it('화면 인원은 상한에 막히지 않고 구역 혼잡도를 따른다', () => {
    const a = settle({ hongdae: 0.4, yeonnam: 0.4 });
    const b = settle({ hongdae: 0.8, yeonnam: 0.8 });
    expect(b.w.n).toBeLessThan(2500);
    expect(b.w.n / a.w.n).toBeGreaterThan(1.6);
    expect(b.w.n / a.w.n).toBeLessThan(2.4);
  });
  it('붐비는 구역이 덜 붐비는 구역보다 빽빽하다(구역 넓이와 상관없이)', () => {
    const sim = settle({ hongdae: 0.3, yeonnam: 1.0 });
    expect(density(sim, 'yeonnam') / density(sim, 'hongdae')).toBeGreaterThan(2.2);
  });
  it('작은 구역에서 나온 사람은 대부분 그 구역 안을 돌아다닌다', () => {
    const sim = settle({ 'hongik-stn': 1.0 });
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
        { id: 'hongik-stn', name: '', level: 3, label: '붐빔', pplMin: 1, pplMax: 2, crowd: 1, ages: [0, 0, 0, 0, 0, 0, 0, 100], female: 100 },
        { id: 'yeonnam', name: '', level: 3, label: '붐빔', pplMin: 1, pplMax: 2, crowd: 1, ages: [100, 0, 0, 0, 0, 0, 0, 0], female: 0 },
      ],
    };
    const sim = makeWalkers(buildWalkGraph(grid()), portals, p, 3, 2500);
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
