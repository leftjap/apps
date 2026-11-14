import { describe, expect, it } from 'vitest';
import { makeCars } from '../src/sim/cars.ts';
import { buildCarGraph } from '../src/sim/graph.ts';
import { fixedProvider, road } from './helpers.ts';

const R = 1990;
const now = (t = 0) => ({ tod: 14 * 3600 + t, dow: 2, doy: 317 });
// 판을 가로지르는 한 방향 4차로 길 둘: 북쪽 길은 서→동, 남쪽 길은 동→서. 길마다 차로 약 15.9km
const twoRoads = () =>
  buildCarGraph([road([[-R, -300], [R, -300]], { oneway: true, lanes: 4 }), road([[R, 300], [-R, 300]], { oneway: true, lanes: 4 })]);
const laneKm = 2 * ((2 * Math.sqrt(R * R - 300 * 300)) / 1000) * 4;

describe('차량 수', () => {
  it('흐름 속도가 느린 길일수록 차가 많고, 꽉 막히면 차로 1km 에 100대 가까이 선다', () => {
    const jam = makeCars(twoRoads(), fixedProvider(0.15), 1, 20000).target(now());
    const free = makeCars(twoRoads(), fixedProvider(0.95), 1, 20000).target(now());
    expect(jam / laneKm).toBeGreaterThan(80);
    expect(jam / laneKm).toBeLessThan(115);
    expect(jam).toBeGreaterThan(free * 5);
  });
  it('상한보다 많이 둘 수는 없다', () => {
    expect(makeCars(twoRoads(), fixedProvider(0.3), 1, 500).target(now())).toBeLessThanOrEqual(500);
  });
});

describe('보는 곳 위주로 채우기', () => {
  // 상한이 모자라면 초점(북쪽 길 가운데, 반지름 600m) 안은 실제 밀도로, 밖은 남은 몫으로 성기게 채운다
  const run = (visible: (x: number, z: number) => boolean) => {
    const sim = makeCars(twoRoads(), fixedProvider(0.3), 2, 1000);
    sim.setFocus(0, -300, 600, visible);
    sim.fill(sim.target(now()));
    return sim;
  };
  const perLaneKm = (sim: ReturnType<typeof run>, inside: (x: number, z: number) => boolean, km: number) => {
    let n = 0;
    for (let i = 0; i < sim.cars.n; i++) if (inside(sim.cars.x[i], sim.cars.z[i])) n++;
    return n / km;
  };
  const north = (x: number, z: number) => Math.abs(z + 300) < 12 && Math.abs(x) < 500;
  const south = (x: number, z: number) => Math.abs(z - 300) < 12 && Math.abs(x) < 1500;
  it('초점 안 길은 실제 밀도에 가깝게, 초점 밖 길은 성기게 채우고 시간이 지나도 유지한다', () => {
    const sim = run(() => false);
    for (let k = 0; k < 1200; k++) sim.step(0.1, now(k * 0.1));
    const real = 6.5 + (100 - 6.5) * 0.7; // 오후 2시 시간대 교통량 6.5대에서 속도 비율 0.3 만큼 늘어 차로 1km 에 약 72대
    expect(perLaneKm(sim, north, 4)).toBeGreaterThan(real * 0.75);
    expect(perLaneKm(sim, south, 12)).toBeLessThan(perLaneKm(sim, north, 4) * 0.5);
  });
  it('화면에 보이는 곳에서는 차가 길 한가운데에서 나타나거나 사라지지 않는다', () => {
    // 화면 판정은 화면 가장자리보다 조금 넓게 한다(main.ts 의 onScreen 처럼)
    const band = (x: number) => Math.abs(x) < 300;
    const sim = run((x) => Math.abs(x) < 330);
    let last = new Map<number, number>();
    for (let i = 0; i < sim.cars.n; i++) last.set(sim.cars.uid[i], sim.cars.x[i]);
    let pops = 0;
    for (let k = 0; k < 1200; k++) {
      sim.step(0.1, now(k * 0.1));
      const cur = new Map<number, number>();
      for (let i = 0; i < sim.cars.n; i++) {
        cur.set(sim.cars.uid[i], sim.cars.x[i]);
        if (!last.has(sim.cars.uid[i]) && band(sim.cars.x[i])) pops++;
      }
      for (const [u, x] of last) if (!cur.has(u) && band(x)) pops++;
      last = cur;
    }
    expect(pops).toBe(0);
  });
});
