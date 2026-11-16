// 교차로·신호 모델(재작업 W20, src/sim/intersection/). 지오 규칙: 빨간불이면 선다, 좌회전 신호면 좌회전 차로 차만, 직진 신호면 직진 차로 차만 간다, 보행 신호는 그에 맞춰 켜진다
import { describe, expect, it } from 'vitest';
import { makeCars } from '../src/sim/cars.ts';
import { buildCarGraph } from '../src/sim/graph.ts';
import { CYCLE, GREEN, LEFT, makeIntersections, RED, RIGHT, STRAIGHT, UTURN, YELLOW } from '../src/sim/intersection/index.ts';
import { crosswalk, fixedProvider, road } from './helpers.ts';

// (0,0)에서 만나는 동서(주간선)·남북(보조간선) 4차로 십자 교차로. 팔 길이 300m
const cross = () =>
  buildCarGraph([
    road([[-300, 0], [0, 0]], { cls: 1, lanes: 4 }),
    road([[0, 0], [300, 0]], { cls: 1, lanes: 4 }),
    road([[0, -300], [0, 0]], { cls: 2, lanes: 4 }),
    road([[0, 0], [0, 300]], { cls: 2, lanes: 4 }),
  ]);
const into = (g: ReturnType<typeof cross>) => g.filter((e) => Math.hypot(e.p[e.p.length - 3], e.p[e.p.length - 1]) < 1);
// 네 팔마다 교차로 15m 앞 보행 신호 횡단보도
const xws = () => [crosswalk(-15, 0, 0, 1, 8, []), crosswalk(15, 0, 0, 1, 8, []), crosswalk(0, -15, 1, 0, 8, []), crosswalk(0, 15, 1, 0, 8, [])];
// 서울시 신호등 부착대 자료 흉내: 진입로마다 교차로 건너 25m, 오른쪽 지주(12m)에서 찻길 위로 뻗은 팔. kind 3 3색등, 4 4색등, bits 1 비보호 표지
const lampsFor = (g: ReturnType<typeof cross>, kind: number, bits = 0) => {
  const lamps: number[] = [];
  for (const e of into(g)) {
    const n = e.p.length;
    const ux = Math.sign(e.p[n - 3] - e.p[0]) || 0;
    const uz = Math.sign(e.p[n - 1] - e.p[2]) || 0;
    const [rx, rz] = [-uz, ux];
    lamps.push(ux * 25 + rx * 12, uz * 25 + rz * 12, ux * 25 + rx * 2, uz * 25 + rz * 2, kind, bits);
  }
  return { lamps, signs: [] };
};
const MOVES = [LEFT, STRAIGHT, RIGHT, UTURN];

describe('교차로와 신호 하나', () => {
  it('큰길 네 갈래가 만나면 교차로 하나에 신호 하나, 진입로 넷을 마주 오는 길끼리 두 무리로 나눈다', () => {
    const g = cross();
    const { X, S } = makeIntersections(g, { crosswalks: xws(), stopLines: new Float32Array() });
    expect(X.list).toHaveLength(1);
    expect(S.list.filter((s) => s.j >= 0)).toHaveLength(1);
    const groups = into(g).map((e) => S.approach.get(e.id)!.group);
    expect(new Set(groups).size).toBe(2);
    const ew = into(g).filter((e) => Math.abs(e.p[0]) > 1).map((e) => S.approach.get(e.id)!.group);
    expect(new Set(ew).size).toBe(1);
  });

  it('4색등 교차로: 좌회전은 어느 직진과도, 두 무리의 직진끼리도 같은 때 초록이 아니다', () => {
    const g = cross();
    const { S } = makeIntersections(g, { crosswalks: xws(), stopLines: new Float32Array(), lamps: lampsFor(g, 4) });
    const aps = into(g).map((e) => e.id);
    expect(aps.every((a) => S.approach.get(a)!.left === 1)).toBe(true);
    let leftGreen = 0;
    for (let t = 0; t < CYCLE; t += 0.5)
      for (const a of aps)
        for (const b of aps) {
          if (a === b) continue;
          const aL = S.state(a, LEFT, t) === GREEN;
          if (aL) leftGreen++;
          expect(aL && S.state(b, STRAIGHT, t) === GREEN).toBe(false);
          if (S.approach.get(a)!.group !== S.approach.get(b)!.group) expect(S.state(a, STRAIGHT, t) === GREEN && S.state(b, STRAIGHT, t) === GREEN).toBe(false);
        }
    expect(leftGreen).toBeGreaterThan(0);
  });

  it('보행 신호는 그 횡단보도를 지나는 차 움직임이 모두 빨간불일 때만 초록이다(노랑도 아니다)', () => {
    for (const kind of [3, 4]) {
      const g = cross();
      const { X, S } = makeIntersections(g, { crosswalks: xws(), stopLines: new Float32Array(), lamps: lampsFor(g, kind, 1) });
      const paths = into(g).flatMap((e) => (X.exits.get(e.id) ?? []).flatMap((_, k) => [0, 1, 2, 3].map((l) => X.path(e.id, l, k)).filter((p) => !!p)));
      expect(paths.some((p) => p!.xw.length > 0)).toBe(true);
      let walks = 0;
      for (let t = 0; t < CYCLE; t += 0.5)
        for (let x = 0; x < 4; x++) {
          if (S.walkState(x, t) !== GREEN) continue;
          walks++;
          for (const p of paths) if (p!.xw.includes(x)) expect(S.state(p!.a, p!.move, t)).toBe(RED);
        }
      expect(walks).toBeGreaterThan(0);
    }
  });

  it('같은 때 초록인 두 움직임의 경로가 부딪으면 한쪽은 양보하는 움직임이다(비보호 좌회전 등)', () => {
    const g = cross();
    const { X, S } = makeIntersections(g, { crosswalks: xws(), stopLines: new Float32Array(), lamps: lampsFor(g, 3, 1) });
    const paths = into(g).flatMap((e) => (X.exits.get(e.id) ?? []).flatMap((_, k) => [0, 1, 2, 3].map((l) => X.path(e.id, l, k)).filter((p) => !!p)));
    let yielded = 0;
    for (let t = 0; t < CYCLE; t += 1)
      for (const p of paths)
        for (const q of paths) {
          if (p!.id >= q!.id || p!.a === q!.a || !X.conflict(p!.id, q!.id)) continue;
          if (S.state(p!.a, p!.move, t) !== GREEN || S.state(q!.a, q!.move, t) !== GREEN) continue;
          const y = S.yields(p!.a, p!.move, t) || S.yields(q!.a, q!.move, t);
          expect(y).toBe(true);
          yielded++;
        }
    expect(yielded).toBeGreaterThan(0);
  });

  it('3색등에 비보호 표지가 없으면 좌회전하는 차로가 없고, 비보호 표지가 있으면 맨 왼쪽 차로가 양보하며 좌회전한다', () => {
    const g = cross();
    const none = makeIntersections(g, { crosswalks: xws(), stopLines: new Float32Array(), lamps: lampsFor(g, 3) });
    for (const e of into(g)) for (let l = 0; l < e.lanes; l++) expect(none.X.laneMoves(e.id, l) & LEFT).toBe(0);
    const g2 = cross();
    const perm = makeIntersections(g2, { crosswalks: xws(), stopLines: new Float32Array(), lamps: lampsFor(g2, 3, 1) });
    for (const e of into(g2)) {
      expect(perm.S.approach.get(e.id)!.left).toBe(2);
      expect(perm.X.laneMoves(e.id, 0) & LEFT).toBe(LEFT);
      let yieldGreen = 0;
      for (let t = 0; t < CYCLE; t += 1) if (perm.S.state(e.id, LEFT, t) === GREEN) yieldGreen += perm.S.yields(e.id, LEFT, t) ? 1 : 0;
      expect(yieldGreen).toBeGreaterThan(0);
    }
  });

  it('화살표 없는 차로: 좌회전은 맨 왼쪽, 우회전은 맨 오른쪽 차로에서만, 직진은 어느 차로나', () => {
    const g = cross();
    const { X } = makeIntersections(g);
    const west = into(g).find((e) => e.p[0] < -299)!;
    expect(west.lanes).toBe(2);
    const by = (m: number) => [0, 1].filter((l) => X.laneMoves(west.id, l) & m);
    expect(by(LEFT)).toEqual([0]);
    expect(by(RIGHT)).toEqual([1]);
    expect(by(STRAIGHT)).toEqual([0, 1]);
    expect(by(UTURN)).toEqual([]);
  });

  it('차는 자기 움직임이 빨간불이면 게이트 앞에 서고, 초록이 되면 교차로 경로를 따라 지나간다', () => {
    const g = cross();
    const inter = makeIntersections(g, { crosswalks: xws(), stopLines: new Float32Array(), lamps: lampsFor(g, 4) });
    const { X, S } = inter;
    const west = into(g).find((e) => e.p[0] < -299)!;
    let t0 = 0;
    while (!(MOVES.every((m) => S.state(west.id, m, t0) === RED) && MOVES.every((m) => S.state(west.id, m, t0 + 30) === RED))) t0 += 1;
    const sim = makeCars(g, fixedProvider(1), 3, 10, [], inter);
    sim.put(west.id, 200, 1);
    const D = sim.debug();
    let tod = t0;
    let worst = -Infinity;
    for (let k = 0; k < 250; k++) {
      sim.step(0.1, { tod, dow: 2, doy: 317 }, false);
      tod += 0.1;
      worst = Math.max(worst, D.s[0] + D.size[0] / 2 - (west.len - X.gate(west.id, D.lane[0])));
    }
    expect(sim.speedOf(0)).toBeLessThan(0.3);
    expect(worst).toBeLessThan(0);
    for (let k = 0; k < 1500 && sim.cars.n; k++) {
      sim.step(0.1, { tod, dow: 2, doy: 317 }, false);
      tod += 0.1;
    }
    expect(sim.cars.n === 0 || Math.hypot(sim.cars.x[0], sim.cars.z[0]) > 20).toBe(true);
    expect(YELLOW).toBe(1);
  });
});
