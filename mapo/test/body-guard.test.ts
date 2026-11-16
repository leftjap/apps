// 차 몸통 겹침 막기(W18): 한 걸음 가기 전에 그 자리에서 앞쪽 다른 차 몸통과 겹치는지 보고, 겹치면 걸음을 줄이거나 멈춘다.
// 노드 없이 같은 높이에서 가로지르는 두 길(교차로 잡기도 신호도 없다)에서 두 차가 부딪지 않고, 높이가 다른 길(다리)은 서로 보지 않는다
import { describe, expect, it } from 'vitest';
import { makeCars } from '../src/sim/cars.ts';
import { buildCarGraph } from '../src/sim/graph.ts';
import { at, fixedProvider, road } from './helpers.ts';

/** 두 회전 사각형이 겹치는가 */
function hit(ax: number, az: number, ay: number, al: number, aw: number, bx: number, bz: number, by: number, bl: number, bw: number) {
  for (const t of [ay, ay + Math.PI / 2, by, by + Math.PI / 2]) {
    const ra = Math.abs(al * Math.cos(ay - t)) + Math.abs(aw * Math.sin(ay - t));
    const rb = Math.abs(bl * Math.cos(by - t)) + Math.abs(bw * Math.sin(by - t));
    if (Math.abs((bx - ax) * Math.cos(t) + (bz - az) * Math.sin(t)) >= ra + rb) return false;
  }
  return true;
}

/** 동서 길과, 그 가운데를 노드 없이 가로지르는 남북 길(높이 y) 위에서 두 차가 같은 때 가로지른 자리에 닿게 놓고 돌린다 */
function run(y: number) {
  const ns = road([[0, -200], [0, 200]], { cls: 2, lanes: 1, oneway: true });
  for (let k = 1; k < ns.p.length; k += 3) ns.p[k] = y;
  const g = buildCarGraph([road([[-200, 0], [200, 0]], { cls: 2, lanes: 1, oneway: true }), ns]);
  const sim = makeCars(g, fixedProvider(1), 3, 10);
  const ew = g.find((e) => e.p[0] < -199)!;
  const sn = g.find((e) => e.p[2] < -199)!;
  sim.put(ew.id, 160, 0);
  sim.put(sn.id, 160, 0);
  const c = sim.cars;
  const D = sim.debug();
  let touched = 0;
  const passed = new Set<number>();
  for (let k = 0; k < 400 && c.n === 2; k++) {
    sim.step(0.05, at(14), false);
    if (c.n < 2) break;
    if (hit(c.x[0], c.z[0], c.yaw[0], D.size[0] / 2, D.wid[0], c.x[1], c.z[1], c.yaw[1], D.size[1] / 2, D.wid[1]) && Math.abs(c.y[0] - c.y[1]) < 2.5) touched++;
    for (let i = 0; i < 2; i++) if (c.x[i] > 10 || c.z[i] > 10) passed.add(c.uid[i]);
  }
  return { touched, passed: passed.size };
}

describe('몸통 겹침 막기', () => {
  it('노드 없이 같은 높이에서 가로지르는 길: 두 차 몸통이 겹치지 않고, 하나가 기다렸다가 둘 다 지나간다', () => {
    const r = run(0);
    expect(r.touched).toBe(0);
    expect(r.passed).toBe(2);
  });
  it('높이가 다른 길(다리)은 서로 막지 않는다', () => {
    const r = run(6);
    expect(r.passed).toBe(2);
  });
});
