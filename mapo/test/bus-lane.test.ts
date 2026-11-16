import { describe, expect, it } from 'vitest';
import { makeBusRoutes } from '../src/sim/buses.ts';
import { makeCars } from '../src/sim/cars.ts';
import { buildCarGraph } from '../src/sim/graph.ts';
import { at, fixedProvider, road } from './helpers.ts';

describe('가로변 버스전용차로(W15)', () => {
  // 동쪽으로 가는 한 방향 3차로. 가운데 조각만 맨 오른쪽 차로가 버스전용차로다
  const g = buildCarGraph([
    road([[-1990, 0], [-200, 0]], { oneway: true, lanes: 3 }),
    road([[-200, 0], [400, 0]], { oneway: true, lanes: 3, busR: true }),
    road([[400, 0], [1990, 0]], { oneway: true, lanes: 3 }),
  ]);
  const busy = g.find((e) => e.road === 1)!;
  it('파란 버스전용차선이 그은 맨 오른쪽 차로를 버스전용차로로 둔다', () => {
    expect(busy.bus).toBe(2);
    expect(g.find((e) => e.road === 0)!.bus).toBe(-1);
  });
  it('일반 차는 버스전용차로에 들어가지 않고, 버스는 그 차로를 따라간다', () => {
    const routes = makeBusRoutes([{ ref: '603', kind: 0, to: '', segs: [1, 2, 3], stops: [], stopNames: [] }], g);
    const sim = makeCars(g, fixedProvider(1), 3, 80, routes);
    for (let k = 0; k < 12; k++) sim.put(g.find((e) => e.road === 0)!.id, 1700 - k * 40, 2); // 맨 오른쪽 차로에서 출발
    sim.addBus(0, 1600);
    const D = sim.debug();
    let carIn = 0;
    let busOut = 0;
    let seenCar = 0;
    let seenBus = 0;
    for (let t = 0; t < 120 * 10; t++) {
      sim.step(0.1, at(14), false);
      for (let i = 0; i < sim.cars.n; i++) {
        if (D.edge[i] !== busy.id || D.s[i] < 30 || D.s[i] > busy.len - 30) continue;
        if (sim.cars.kind[i] === 1) seenBus++;
        else seenCar++;
        if (sim.cars.kind[i] === 1) busOut += D.lane[i] !== busy.bus ? 1 : 0;
        else carIn += D.lane[i] === busy.bus ? 1 : 0;
      }
    }
    expect(seenCar).toBeGreaterThan(1000);
    expect(seenBus).toBeGreaterThan(100);
    expect(carIn).toBe(0);
    expect(busOut).toBe(0);
  });
});
