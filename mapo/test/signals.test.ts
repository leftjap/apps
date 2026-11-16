import { describe, expect, it } from 'vitest';
import { makeCars } from '../src/sim/cars.ts';
import { buildCarGraph, turnAllowed, turnOf } from '../src/sim/graph.ts';
import { CYCLE, makeSignals, GREEN, LEFT, RED, RIGHT, STRAIGHT, UTURN } from '../src/sim/signals.ts';
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
  it('빨간불에 정지선을 넘는 차와, 노란불이 켜졌을 때 편안히(3m/s²) 멈출 수 있었는데 지나가는 차가 없다', () => {
    const g = cross();
    const s = makeSignals(g);
    const into = g.filter((e) => Math.hypot(e.p[e.p.length - 3], e.p[e.p.length - 1]) < 1);
    const sim = makeCars(g, fixedProvider(1), 7, 200, [], s);
    const D = sim.debug();
    const last = new Map<number, { e: number; d: number; could: boolean; wrong: boolean }>();
    let crossed = 0;
    let bad = 0;
    let tod = 0;
    for (let k = 0; k < 10 * 300; k++) {
      // 진입 구간마다 3.3초 간격으로 차를 넣는다(노란불이 여러 거리에서 켜지게)
      if (k % 33 === 0) for (const e of into) sim.put(e.id, 5 + (k % 7), (k / 33) % 2);
      sim.step(0.1, { tod, dow: 2, doy: 317 }, false);
      tod += 0.1;
      for (let i = 0; i < sim.cars.n; i++) {
        const ap = s.approach.get(D.edge[i]);
        if (!ap) continue;
        // 차는 자기 움직임(좌·직·우)의 신호를 본다
        // 빨간불 우회전(멈춘 뒤, 건너는 횡단보도가 빨간불일 때)은 위반이 아니다
        const st = D.mv[i] === RIGHT && s.rightOnRed(ap, tod) ? GREEN : s.moveState(ap, D.mv[i] || STRAIGHT, tod);
        const d = g[D.edge[i]].len - ap.setback - (D.s[i] + D.size[i] / 2);
        const p = last.get(sim.cars.uid[i]);
        const same = p?.e === D.edge[i];
        const could = (same && p!.could) || (st !== GREEN && d > (D.v[i] * D.v[i]) / 6 + 0.5);
        // 앞 범퍼가 정지선을 넘는 순간의 신호로 판단하고, 0.5m 넘게 더 나아간 차만 센다
        const now = st === RED || (st !== GREEN && could);
        const wrong = same && ((p!.d > 0 && d <= 0) || (d <= 0 && d > -0.5 && D.v[i] < 0.3)) ? now : same ? p!.wrong : false;
        if (same && p!.d > -0.5 && d <= -0.5) {
          crossed++;
          if (wrong) bad++;
        }
        last.set(sim.cars.uid[i], { e: D.edge[i], d, could: st === GREEN ? false : could, wrong });
      }
    }
    expect(crossed).toBeGreaterThan(100);
    expect(bad).toBe(0);
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

  it('신호 없는 횡단보도의 축이 신호 횡단보도 칠 안을 지나면(자료에 겹쳐 그려진 횡단보도) 그 신호를 따른다', () => {
    const g = buildCarGraph([road([[-300, 0], [0, 0]], { cls: 2, lanes: 4 }), road([[0, 0], [300, 0]], { cls: 2, lanes: 4 })]);
    const a = Math.PI / 2 - 0.5; // 신호 횡단보도와 29° 비스듬히 겹친다
    const xws = [crosswalk(0, 0, 0, 1, 8, [[0, 0]]), crosswalk(1, 0, Math.cos(a), Math.sin(a), 8, [], false), crosswalk(60, 0, 0, 1, 8, [], false)];
    const s = makeSignals(g, { crosswalks: xws, stopLines: new Float32Array() });
    expect(s.crossSite[0]).toBe(0);
    expect(s.crossSite[1]).toBe(0);
    expect(s.crossSite[2]).toBe(-1);
  });
  it('정지선 자료가 있으면 그 자리를 정지선으로 쓴다', () => {
    const g = cross();
    // 서쪽에서 들어오는 차로(교차로 서쪽 22m)를 가로지르는 정지선
    const s = makeSignals(g, { crosswalks: [crosswalk(-15, 0, 0, 1, 8, [[-15, 0]])], stopLines: Float32Array.from([-22, 0.2, -22, 7]) });
    const west = g.find((e) => e.p[0] < -299 && Math.hypot(e.p[e.p.length - 3], e.p[e.p.length - 1]) < 1)!;
    expect(s.approach.get(west.id)!.setback).toBeCloseTo(22, 0);
  });
});

/** 묶음 c 의 무리 g 직진 초록불이 켜지는 시각(한 주기 안) */
function greenStart(s: ReturnType<typeof makeSignals>, c: number, g: number): number {
  for (let t = 0; t < CYCLE; t += 0.1) if (s.state(c, g, t) !== GREEN && s.state(c, g, t + 0.1) === GREEN) return t + 0.1;
  return NaN;
}
/** a 에서 b 까지 (한 주기 안에서) 몇 초 뒤인가 */
const after = (a: number, b: number) => (((b - a) % CYCLE) + CYCLE) % CYCLE;

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

describe('움직임 단위 현시(W18)', () => {
  // 서울시 신호등 부착대 자료 흉내: 진입로마다 교차로 건너 25m, 오른쪽 지주(12m)에서 찻길 위로 뻗은 팔(끝 2m). kind 3 3색등, 4 4색등
  const lampsFor = (g: ReturnType<typeof cross>, kind: number, bits = 0) => {
    const lamps: number[] = [];
    for (const e of g.filter((q) => Math.hypot(q.p[q.p.length - 3], q.p[q.p.length - 1]) < 1)) {
      const n = e.p.length;
      const ux = Math.sign(e.p[n - 3] - e.p[0]) || 0;
      const uz = Math.sign(e.p[n - 1] - e.p[2]) || 0;
      const [rx, rz] = [-uz, ux];
      lamps.push(ux * 25 + rx * 12, uz * 25 + rz * 12, ux * 25 + rx * 2, uz * 25 + rz * 2, kind, bits);
    }
    return { lamps, signs: [] };
  };
  const xw = () => [crosswalk(-15, 0, 0, 1, 8, [[-15, 0]])];
  const into = (g: ReturnType<typeof cross>) => g.filter((e) => Math.hypot(e.p[e.p.length - 3], e.p[e.p.length - 1]) < 1);

  it('4색등 교차로: 좌회전과 마주 오는 직진, 두 축의 직진은 같은 때 초록이 아니다', () => {
    const g = cross();
    const s = makeSignals(g, { crosswalks: xw(), stopLines: new Float32Array(), lamps: lampsFor(g, 4) });
    const aps = into(g).map((e) => s.approach.get(e.id)!);
    expect(aps.every((a) => a.left === 1 && a.arrow)).toBe(true);
    expect(s.list[0].phases).toHaveLength(4);
    const seen = new Set<string>();
    for (let t = 0; t < CYCLE; t += 0.5)
      for (const a of aps)
        for (const b of aps) {
          if (a === b) continue;
          const aL = s.moveState(a, LEFT, t) === GREEN;
          const bS = s.moveState(b, STRAIGHT, t) === GREEN;
          const aS = s.moveState(a, STRAIGHT, t) === GREEN;
          if (aL) seen.add('L');
          // 좌회전은 어느 진입로의 직진과도 함께 초록이 아니다(좌회전 현시는 따로)
          expect(aL && bS).toBe(false);
          // 다른 무리의 직진끼리는 함께 초록이 아니다
          if (a.group !== b.group) expect(aS && bS).toBe(false);
        }
    expect(seen.has('L')).toBe(true);
  });

  it('3색등에 비보호 표지가 없으면 좌회전하지 않고, 비보호 표지가 있으면 직진 초록에 기다렸다가 한다', () => {
    const g = cross();
    const none = makeSignals(g, { crosswalks: xw(), stopLines: new Float32Array(), lamps: lampsFor(g, 3) });
    expect(into(g).every((e) => none.approach.get(e.id)!.left === 0)).toBe(true);
    const perm = makeSignals(g, { crosswalks: xw(), stopLines: new Float32Array(), lamps: lampsFor(g, 3, 1) });
    for (const e of into(g)) {
      const ap = perm.approach.get(e.id)!;
      expect(ap.left).toBe(2);
      expect(perm.permissive(ap, LEFT)).toBe(true);
    }
    // 좌회전 금지 교차로에서 차는 좌회전 출구를 고르지 않는다
    const sim = makeCars(g, fixedProvider(1), 5, 400, [], none);
    const D = sim.debug();
    let tod = 0;
    let lefts = 0;
    let moves = 0;
    for (let k = 0; k < 3000; k++) {
      if (k % 40 === 0) for (const e of into(g)) for (const l of [0, 1]) sim.put(e.id, 5, l);
      sim.step(0.1, { tod, dow: 2, doy: 317 }, false);
      tod += 0.1;
      for (let i = 0; i < sim.cars.n; i++) {
        const ap = none.approach.get(D.edge[i]);
        if (!ap || D.mv[i] === 0) continue;
        moves++;
        if (D.mv[i] === LEFT || D.mv[i] === UTURN) lefts++;
      }
    }
    expect(moves).toBeGreaterThan(100);
    expect(lefts).toBe(0);
  });

  it('화살표 없는 차로: 좌회전은 맨 왼쪽, 우회전은 맨 오른쪽 차로에서만', () => {
    const g = cross();
    const west = into(g).find((e) => e.p[0] < -299)!;
    const outs = west.next.map((k) => g[k]);
    const leftExit = outs.find((o) => turnOf(west, o) === 1)!;
    const rightExit = outs.find((o) => turnOf(west, o) === 4)!;
    const straight = outs.find((o) => turnOf(west, o) === 2)!;
    expect(west.lanes).toBe(2);
    expect([0, 1].filter((l) => turnAllowed(west, leftExit, l))).toEqual([0]);
    expect([0, 1].filter((l) => turnAllowed(west, rightExit, l))).toEqual([1]);
    expect([0, 1].filter((l) => turnAllowed(west, straight, l))).toEqual([0, 1]);
  });

  it('보행 신호는 그 횡단보도를 가로지르는 직진·좌회전 차 신호와 겹치지 않는다', () => {
    const g = cross();
    const s = makeSignals(g, { crosswalks: xw(), stopLines: new Float32Array(), lamps: lampsFor(g, 4) });
    // 서쪽 팔을 건너는 횡단보도(남북으로 건넌다): 서쪽에서 들어오는 차와 서쪽으로 나가는 직진·좌회전이 가로지른다
    const grp = s.crossGroup[0];
    const west = s.approach.get(into(g).find((e) => e.p[0] < -299)!.id)!;
    const east = s.approach.get(into(g).find((e) => e.p[0] > 299)!.id)!;
    const ns = into(g).filter((e) => Math.abs(e.p[0]) < 1).map((e) => s.approach.get(e.id)!);
    for (let t = 0; t < CYCLE; t += 0.5) {
      if (s.state(0, grp, t) !== GREEN) continue;
      for (const k of [STRAIGHT, LEFT]) expect(s.moveState(west, k, t)).not.toBe(GREEN);
      expect(s.moveState(east, STRAIGHT, t)).not.toBe(GREEN);
      for (const a of ns) expect(s.moveState(a, LEFT, t)).not.toBe(GREEN);
    }
  });
});
