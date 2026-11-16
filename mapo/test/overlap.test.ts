import { describe, expect, it } from 'vitest';
import { makeCars } from '../src/sim/cars.ts';
import { buildCarGraph } from '../src/sim/graph.ts';
import { makeIntersections, RED } from '../src/sim/intersection/index.ts';
import { at, crosswalk, fixedProvider, road } from './helpers.ts';

// 동쪽으로 가는 길이 (0,0)의 보행 신호 횡단보도에서 끊기고, 그 앞 조각이 10m 로 짧다
const midBlock = () => {
  const g = buildCarGraph([
    road([[-400, 0], [-10, 0]], { oneway: true, lanes: 1, cls: 2 }),
    road([[-10, 0], [0, 0]], { oneway: true, lanes: 1, cls: 2 }),
    road([[0, 0], [400, 0]], { oneway: true, lanes: 1, cls: 2 }),
  ]);
  const s = makeIntersections(g, { crosswalks: [crosswalk(0, 0, 0, 1, 6, [[0, 0]])], stopLines: new Float32Array() });
  return { g, s };
};
/** 진입로 a 의 직진이 t 부터 secs 초 넘게 빨간불인 첫 시각 */
const redFrom = (s: ReturnType<typeof makeIntersections>, a: number, secs: number) => {
  let t = 0;
  while (t < 200 && !(s.S.state(a, 2, t) === RED && s.S.state(a, 2, t + secs) === RED)) t += 0.5;
  return t;
};

describe('신호 지키기', () => {
  it('정지선 바로 앞 조각이 짧아도 빨간불이면 그 앞 조각에서부터 늦춰 정지선 앞에 선다', () => {
    const { g, s } = midBlock();
    const ap = s.S.approach.get(1)!;
    expect(ap).toBeDefined();
    const t0 = redFrom(s, 1, 20);
    expect(t0).toBeLessThan(200);
    const sim = makeCars(g, fixedProvider(1), 3, 4, [], s);
    sim.put(0, 250, 0); // 정지선까지 약 150m, 제 속도
    let worst = -Infinity;
    for (let k = 0; k < 20 * 60; k++) {
      sim.step(1 / 60, { ...at(0), tod: t0 + k / 60 }, false);
      worst = Math.max(worst, sim.cars.x[0] + 2.3); // 앞범퍼
    }
    expect(worst).toBeLessThan(-ap.setback + 0.5);
  });

  it('그릴 때 늘일 수 있는 길이(room)는 앞차·뒤차와의 가운데 거리와 정지선까지 거리를 넘지 않는다', () => {
    const { g, s } = midBlock();
    const ap = s.S.approach.get(1)!;
    const t0 = redFrom(s, 1, 24); // 길 중간 신호의 차 빨간불은 27초
    expect(t0).toBeLessThan(200);
    const sim = makeCars(g, fixedProvider(1), 3, 6, [], s);
    for (const at0 of [330, 300, 270]) sim.put(0, at0, 0);
    for (let k = 0; k < 22 * 60; k++) sim.step(1 / 60, { ...at(0), tod: t0 + k / 60 }, false);
    // 세 대가 정지선 앞에 줄지어 섰다
    const xs = [0, 1, 2].map((i) => sim.cars.x[i]).sort((a, b) => b - a);
    expect(sim.speedOf(0) + sim.speedOf(1) + sim.speedOf(2)).toBeLessThan(0.3);
    for (let i = 0; i < 3; i++) {
      const x = sim.cars.x[i];
      const k = xs.indexOf(x);
      const front = k === 0 ? 2 * (-ap.setback - x) : xs[k - 1] - x;
      const back = k === 2 ? Infinity : x - xs[k + 1];
      expect(sim.cars.room[i]).toBeLessThanOrEqual(Math.min(front, back) + 0.01);
      expect(sim.cars.room[i]).toBeGreaterThan(4.4); // 맨 앞 차는 앞범퍼가 정지선에 붙어 차 길이(4.6m)와 거의 같다
    }
  });
});
