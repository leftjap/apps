import { describe, expect, it } from 'vitest';
import { makeCars } from '../src/sim/cars.ts';
import { buildCarGraph } from '../src/sim/graph.ts';
import { makeSignals, GREEN, RED } from '../src/sim/signals.ts';
import { at, crosswalk, fixedProvider, road } from './helpers.ts';

// (0,0)에서 만나는 동서·남북 4차로 십자 교차로. 팔 길이 300m
const cross = () =>
  buildCarGraph([
    road([[-300, 0], [0, 0]], { cls: 1, lanes: 4 }),
    road([[0, 0], [300, 0]], { cls: 1, lanes: 4 }),
    road([[0, -300], [0, 0]], { cls: 2, lanes: 4 }),
    road([[0, 0], [0, 300]], { cls: 2, lanes: 4 }),
  ]);

describe('신호 교차로', () => {
  it('큰길 네 갈래가 만나면 신호 하나, 들어오는 길 넷을 두 무리로 나눈다', () => {
    const g = cross();
    const s = makeSignals(g);
    expect(s.list).toHaveLength(1);
    const into = g.filter((e) => Math.hypot(e.p[e.p.length - 3], e.p[e.p.length - 1]) < 1);
    expect(into).toHaveLength(4);
    const groups = into.map((e) => s.approach.get(e.id)!.group);
    // 마주 오는 길끼리 같은 무리
    const ew = into.filter((e) => Math.abs(e.p[0]) > 1).map((e) => s.approach.get(e.id)!.group);
    expect(new Set(ew).size).toBe(1);
    expect(new Set(groups).size).toBe(2);
  });

  it('두 무리가 동시에 초록인 때는 없고, 한 주기 안에 둘 다 초록이 온다', () => {
    const s = makeSignals(cross());
    const seen = [false, false];
    for (let t = 0; t < 200; t += 0.5) {
      const a = s.state(0, 0, t);
      const b = s.state(0, 1, t);
      expect(a === GREEN && b === GREEN).toBe(false);
      if (a === GREEN) seen[0] = true;
      if (b === GREEN) seen[1] = true;
    }
    expect(seen).toEqual([true, true]);
  });

  it('신호가 없는 작은 길끼리의 교차로에는 신호를 두지 않는다', () => {
    const g = buildCarGraph([
      road([[-100, 0], [0, 0]], { cls: 3 }),
      road([[0, 0], [100, 0]], { cls: 3 }),
      road([[0, -100], [0, 0]], { cls: 3 }),
    ]);
    expect(makeSignals(g).list).toHaveLength(0);
  });

  it('차는 빨간불이면 정지선 앞에 서고, 초록불이 되면 지나간다', () => {
    const g = cross();
    const s = makeSignals(g);
    const west = g.find((e) => e.p[0] < -299 && Math.hypot(e.p[e.p.length - 3], e.p[e.p.length - 1]) < 1)!;
    const grp = s.approach.get(west.id)!.group;
    // 서쪽 길이 빨간불로 바뀌는 시각을 찾는다
    let t0 = 0;
    while (!(s.state(0, grp, t0) === RED && s.state(0, grp, t0 + 30) === RED)) t0 += 1;
    const sim = makeCars(g, fixedProvider(1), 3, 10, [], s);
    sim.put(west.id, 200, 0);
    let minGap = Infinity;
    let tod = t0;
    for (let k = 0; k < 250; k++) {
      sim.step(0.1, { tod, dow: 2, doy: 317 }, false);
      tod += 0.1;
      minGap = Math.min(minGap, -sim.cars.x[0]);
    }
    // 25초 동안 빨간불: 교차로 한가운데까지 들어오지 않고 앞에서 멈춘다
    expect(sim.speedOf(0)).toBeLessThan(0.3);
    expect(minGap).toBeGreaterThan(5);
    // 초록불이 오면 교차로를 지나 동쪽으로 간다
    for (let k = 0; k < 1500; k++) {
      sim.step(0.1, { tod, dow: 2, doy: 317 }, false);
      tod += 0.1;
    }
    expect(sim.cars.n === 0 || sim.cars.x[0] > 5).toBe(true);
  });
  it('시간대와 상관없이 같은 시각은 같은 신호', () => {
    const s = makeSignals(cross());
    expect(s.state(0, 0, at(9).tod)).toBe(s.state(0, 0, at(9).tod));
  });
});

describe('자료로 정한 신호', () => {
  it('보행 신호 횡단보도가 있는 교차로에만 신호를 둔다', () => {
    // 서쪽 팔(15m)을 건너는 횡단보도
    const sigXw = crosswalk(-15, 0, 0, 1, 8, [[-15, 0]]);
    expect(makeSignals(cross(), { crosswalks: [sigXw], stopLines: new Float32Array() }).list).toHaveLength(1);
    expect(makeSignals(cross(), { crosswalks: [{ ...sigXw, sig: false }], stopLines: new Float32Array() }).list).toHaveLength(0);
    expect(makeSignals(cross(), { crosswalks: [], stopLines: new Float32Array() }).list).toHaveLength(0);
  });

  it('교차로가 아닌 곳의 신호 횡단보도는 그 자리에서 끝나는 두 구간에 신호를 두고, 차는 횡단보도 앞에 선다', () => {
    const g = buildCarGraph([road([[-300, 0], [0, 0]], { cls: 2, lanes: 4 }), road([[0, 0], [300, 0]], { cls: 2, lanes: 4 })]);
    const s = makeSignals(g, { crosswalks: [crosswalk(0, 0, 0, 1, 8, [[0, 0]])], stopLines: new Float32Array() });
    expect(s.list).toHaveLength(1);
    const into = g.filter((e) => Math.hypot(e.p[e.p.length - 3], e.p[e.p.length - 1]) < 1);
    expect(into).toHaveLength(2);
    for (const e of into) {
      const ap = s.approach.get(e.id)!;
      expect(ap.group).toBe(0);
      expect(ap.setback).toBeGreaterThan(2.5); // 횡단보도 폭 4m 의 절반 + 여유
      expect(ap.setback).toBeLessThan(5);
    }
    expect(s.crossSite[0]).toBe(0);
    // 사람은 길과 직각으로 건너므로 차와 다른 무리
    expect(s.groupOf(0, Math.PI / 2)).toBe(1);
  });

  it('정지선 자료가 있으면 그 자리를 정지선으로 쓴다', () => {
    const g = cross();
    // 서쪽에서 들어오는 차로(교차로 서쪽 22m)를 가로지르는 정지선
    const s = makeSignals(g, { crosswalks: [crosswalk(-15, 0, 0, 1, 8, [[-15, 0]])], stopLines: Float32Array.from([-22, 0.2, -22, 7]) });
    const west = g.find((e) => e.p[0] < -299 && Math.hypot(e.p[e.p.length - 3], e.p[e.p.length - 1]) < 1)!;
    expect(s.approach.get(west.id)!.setback).toBeCloseTo(22, 0);
  });
});

/** 묶음 c 의 무리 g 초록불이 켜지는 시각(0~90초) */
function greenStart(s: ReturnType<typeof makeSignals>, c: number, g: number): number {
  for (let t = 0; t < 90; t += 0.1) if (s.state(c, g, t) !== GREEN && s.state(c, g, t + 0.1) === GREEN) return t + 0.1;
  return NaN;
}
/** a 에서 b 까지 (90초 주기로) 몇 초 뒤인가 */
const after = (a: number, b: number) => (((b - a) % 90) + 90) % 90;

describe('신호 시각 맞추기', () => {
  // 동서 큰길(4+4차로)에 300m 간격으로 남북 작은 길(1+1차로)과 만나는 네거리 셋
  const corridor = () =>
    buildCarGraph([
      road([[-300, 0], [0, 0]], { cls: 1, lanes: 8, name: '큰길' }),
      road([[0, 0], [300, 0]], { cls: 1, lanes: 8, name: '큰길' }),
      road([[300, 0], [600, 0]], { cls: 1, lanes: 8, name: '큰길' }),
      road([[600, 0], [900, 0]], { cls: 1, lanes: 8, name: '큰길' }),
      ...[0, 300, 600].flatMap((x) => [road([[x, -200], [x, 0]], { cls: 3, lanes: 2 }), road([[x, 0], [x, 200]], { cls: 3, lanes: 2 })]),
    ]);

  it('큰길을 따라 이어지는 교차로 신호는 11m/s 로 달린 차가 다음 신호에 초록불에 닿게 시각이 맞는다', () => {
    const g = corridor();
    const s = makeSignals(g);
    expect(s.list).toHaveLength(3);
    const site = (x: number) => s.list.findIndex((q) => Math.abs(q.x - x) < 1);
    const east = (x: number) => g.find((e) => e.name === '큰길' && Math.abs(e.p[e.p.length - 3] - x) < 1 && e.p[0] < x)!;
    const west = (x: number) => g.find((e) => e.name === '큰길' && Math.abs(e.p[e.p.length - 3] - x) < 1 && e.p[0] > x)!;
    for (const [a, b] of [[0, 300], [300, 600]]) {
      const ca = site(a);
      const cb = site(b);
      // 동쪽으로 가는 차: a 에서 초록불이 켜질 때 떠나 300m 를 27초에 달린다. 서쪽으로 가는 차는 반대
      const eastOk = Math.abs(after(greenStart(s, ca, s.approach.get(east(a).id)!.group), greenStart(s, cb, s.approach.get(east(b).id)!.group)) - 300 / 11) < 1;
      const westOk = Math.abs(after(greenStart(s, cb, s.approach.get(west(b).id)!.group), greenStart(s, ca, s.approach.get(west(a).id)!.group)) - 300 / 11) < 1;
      expect(eastOk || westOk).toBe(true);
    }
  });

  it('큰길 쪽 무리에 초록 시간을 더 주고, 작은 길 쪽도 사람이 건널 만큼은 준다', () => {
    const g = corridor();
    const s = makeSignals(g);
    const c = s.list.findIndex((q) => Math.abs(q.x - 300) < 1);
    const main = s.approach.get(g.find((e) => e.name === '큰길' && Math.abs(e.p[e.p.length - 3] - 300) < 1)!.id)!.group;
    const minor = 1 - main;
    const len = (grp: number) => s.greenLeft(c, grp, greenStart(s, c, grp));
    expect(len(main)).toBeGreaterThan(len(minor) + 10);
    expect(len(minor)).toBeGreaterThan(23.8); // 24초(시각을 0.1초 단위로 찾는다)
  });

  it('길 중간 보행 신호는 위쪽 교차로 신호에 맞춘다', () => {
    const g = buildCarGraph([
      road([[-300, 0], [0, 0]], { cls: 1, lanes: 8, name: '큰길' }),
      road([[0, 0], [200, 0]], { cls: 1, lanes: 8, name: '큰길' }),
      road([[200, 0], [500, 0]], { cls: 1, lanes: 8, name: '큰길' }),
      road([[0, -200], [0, 0]], { cls: 3, lanes: 2 }),
      road([[0, 0], [0, 200]], { cls: 3, lanes: 2 }),
    ]);
    const s = makeSignals(g, { crosswalks: [crosswalk(0, 10, 1, 0, 14, [[0, 10]]), crosswalk(200, 0, 0, 1, 14, [[200, 0]])], stopLines: new Float32Array() });
    expect(s.list).toHaveLength(2);
    const into = (x: number) => g.find((e) => e.name === '큰길' && Math.abs(e.p[e.p.length - 3] - x) < 1 && e.p[0] < x)!;
    const a = s.approach.get(into(0).id)!;
    const b = s.approach.get(into(200).id)!;
    expect(after(greenStart(s, a.c, a.group), greenStart(s, b.c, b.group))).toBeCloseTo(200 / 11, 0);
  });
});
