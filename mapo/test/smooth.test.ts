import { describe, expect, it } from 'vitest';
import { makeBusRoutes } from '../src/sim/buses.ts';
import { makeCars } from '../src/sim/cars.ts';
import { buildCarGraph } from '../src/sim/graph.ts';
import { at, fixedProvider, road } from './helpers.ts';

/** 차 i 의 속도를 매 단계 보며 secs 초 돌린다. 가장 센 감속(m/s², 양수)을 돌려준다 */
function drive(sim: ReturnType<typeof makeCars>, secs: number, i = 1) {
  let hardest = 0;
  let prev = sim.speedOf(i);
  for (let k = 0; k < secs * 60; k++) {
    sim.step(1 / 60, at(14), false);
    const v = sim.speedOf(i);
    hardest = Math.max(hardest, (prev - v) * 60);
    prev = v;
  }
  return hardest;
}

describe('부드러운 감속', () => {
  it('제 속도로 가다 30m 앞에 선 버스를 보면 4m/s² 넘게 세게 밟지 않고 그 뒤에 선다', () => {
    const g = buildCarGraph([road([[0, 0], [600, 0]], { oneway: true, lanes: 1, cls: 2 })]);
    const routes = makeBusRoutes([{ ref: '603', kind: 0, to: '', segs: [1], stops: [300], stopNames: ['정류장'] }], g, []);
    const sim = makeCars(g, fixedProvider(1), 3, 4, routes);
    sim.addBus(0, 260);
    for (let k = 0; k < 20 * 60 && !sim.dwells.length; k++) sim.step(1 / 60, at(14), false);
    expect(sim.dwells.length).toBe(1); // 버스가 정류장에 섰다(9초 넘게 선다)
    sim.put(0, sim.cars.x[0] - 5.75 - 30 - 2.3, 0); // 버스 꽁무니 30m 뒤, 제 속도 둘레로 달리는 승용차
    const hardest = drive(sim, 8);
    expect(sim.cars.x[0] - 5.75 - (sim.cars.x[1] + 2.3)).toBeGreaterThan(1);
    expect(hardest).toBeLessThan(4);
  });

  it('빠른 길에서 느린 길로 들어서도 앞이 비어 있으면 편안하게(2.5m/s² 안으로) 늦춘다', () => {
    const g = buildCarGraph([road([[0, 0], [300, 0]], { oneway: true, lanes: 1, cls: 0 }), road([[300, 0], [900, 0]], { oneway: true, lanes: 1, cls: 4, bus: true })]);
    const sim = makeCars(g, fixedProvider(1), 3, 4, []);
    sim.put(0, 250, 0);
    sim.put(0, 10, 0); // 기록용 차는 1번
    expect(drive(sim, 20, 0)).toBeLessThan(2.5);
  });

  it('차로가 줄 때 옆 차로에 거의 나란히 달리던 차에게는 편안하게(3m/s² 안으로) 자리를 내주고 부딪지 않는다', () => {
    const g = buildCarGraph([road([[0, 0], [300, 0]], { oneway: true, lanes: 2, cls: 2 }), road([[300, 0], [900, 0]], { oneway: true, lanes: 1, cls: 2 })]);
    const sim = makeCars(g, fixedProvider(1), 5, 4, []);
    sim.put(0, 262, 1); // 바깥 차로, 1m 앞
    sim.put(0, 261, 0); // 안쪽 차로(기록용 1번)
    let worst = 0;
    let closest = Infinity;
    let prev = sim.speedOf(1);
    for (let k = 0; k < 15 * 60; k++) {
      sim.step(1 / 60, at(14), false);
      const v = sim.speedOf(1);
      worst = Math.max(worst, (prev - v) * 60);
      prev = v;
      if (sim.cars.x[1] > 305 && sim.cars.x[0] > 305) closest = Math.min(closest, Math.abs(sim.cars.x[0] - sim.cars.x[1]));
    }
    expect(worst).toBeLessThan(3.01); // 3m/s² 까지(부동소수점 여유)
    expect(closest).toBeGreaterThan(4.6);
  });

  it('꺾인 길 꼭짓점을 지날 때 그려진 자리와 방향이 한순간에 튀지 않는다', () => {
    // 20° 꺾인 3차로 일방통행, 바깥 차로(오른쪽 3.3m)를 달리는 차
    const a = (20 * Math.PI) / 180;
    const g = buildCarGraph([road([[0, 0], [200, 0], [200 + 200 * Math.cos(a), 200 * Math.sin(a)]], { oneway: true, lanes: 3, cls: 2 })]);
    const sim = makeCars(g, fixedProvider(1), 3, 2, []);
    sim.put(0, 150, 2);
    let px = sim.cars.x[0];
    let pz = sim.cars.z[0];
    let pyaw = sim.cars.yaw[0];
    let worstMove = 0;
    let worstTurn = 0;
    for (let k = 0; k < 8 * 60; k++) {
      sim.step(1 / 60, at(14), false);
      const v = sim.speedOf(0);
      worstMove = Math.max(worstMove, Math.abs(Math.hypot(sim.cars.x[0] - px, sim.cars.z[0] - pz) - v / 60));
      worstTurn = Math.max(worstTurn, Math.abs(sim.cars.yaw[0] - pyaw));
      px = sim.cars.x[0];
      pz = sim.cars.z[0];
      pyaw = sim.cars.yaw[0];
    }
    expect(worstMove).toBeLessThan(0.08);
    expect(worstTurn).toBeLessThan(0.05);
  });
});
