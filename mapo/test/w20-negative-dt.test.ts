// 재작업 W20: 화면에서 프레임 시각이 거꾸로 가면(첫 프레임의 requestAnimationFrame 시각이 앞서 잰 시각보다 이름) 단계 시간이 음수가 되어
// 차가 구간 시작 뒤로 물러나 교차로 한가운데 포개져 그려졌다(홍대입구역, s −600m). 0 이하 단계는 아무것도 바꾸지 않는다
import { describe, expect, it } from 'vitest';
import { makeCars } from '../src/sim/cars.ts';
import { buildCarGraph } from '../src/sim/graph.ts';
import { at, fixedProvider, road } from './helpers.ts';

describe('음수 단계 시간', () => {
  it('0 이하 단계에서는 차가 움직이지 않고, 구간 위 거리가 음수가 되지 않는다', () => {
    const g = buildCarGraph([road([[-300, 0], [300, 0]], { cls: 2, lanes: 2 })]);
    const sim = makeCars(g, fixedProvider(1), 3, 10);
    sim.put(0, 100, 0);
    for (let k = 0; k < 30; k++) sim.step(0.1, at(14), false);
    const D = sim.debug();
    const s0 = D.s[0];
    const x0 = sim.cars.x[0];
    sim.step(-2, at(14), false);
    sim.step(0, at(14), false);
    expect(D.s[0]).toBe(s0);
    expect(sim.cars.x[0]).toBe(x0);
    for (let k = 0; k < 30; k++) sim.step(0.1, at(14), false);
    expect(D.s[0]).toBeGreaterThan(s0);
    expect(D.v[0]).toBeGreaterThanOrEqual(0);
  });
});
