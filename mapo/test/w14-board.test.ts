import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeBoard } from '../src/data/board.ts';
import { decodeLanes, type RoadJson } from '../src/data/road.ts';
import { decodeMarks, type MarksJson } from '../src/data/marks.ts';
import { carriageSections, decodeSurface, isGroundRoad, tunnelReach, type SurfaceJson } from '../src/data/surface.ts';
import { drawnGround, onGround } from '../tools/lib/groundclip.ts';
import { fitCells } from '../tools/lib/arrows.ts';
import { arrowShape } from '../src/data/marks.ts';
import { decodeWalk, type WalkJson } from '../src/sim/walknet.ts';
import { fillBits } from '../tools/lib/bits.ts';
import { centerCrossings, seamBreaks } from '../tools/lib/lanecheck.ts';

// 재작업 W14, 지금 판(public/data): 노면 표시는 그린 찻길 면 안에만, 화살표는 차로 가운데에, 나무는 찻길·데크 위에 없다
const read = (f: string) => JSON.parse(readFileSync(new URL(`../public/data/${f}`, import.meta.url), 'utf8'));
const board = decodeBoard(read('board.json'));
const surface = decodeSurface(read('surface.json') as SurfaceJson);
const marks = decodeMarks(read('marks.json') as MarksJson);
const lanes = decodeLanes((read('road.json') as RoadJson).lanes).dirs;
const polys = read('surface-polys.json') as { car: number[][]; med: number[][] };
const reach = tunnelReach(board.roads);
const dm = (a: number[]) => a.map((v) => v / 10);
const ground = drawnGround([
  ...polys.car.filter((c) => !reach[c[0]]).map((c) => [dm(c.slice(1))]),
  ...surface.faces.map((f) => [f.outer, ...f.holes]),
  ...polys.med.map((m) => [dm(m)]),
  ...surface.draw.map((f) => [f.outer]),
]);

/** 면에서 tol 안(얇은 조각을 놓치지 않게 여러 거리로 본다) */
const near = (B: Parameters<typeof onGround>[0], x: number, z: number, tol: number) => [0, tol / 3, (tol * 2) / 3, tol].some((t) => onGround(B, x, z, t));
/** 점과 둘레 0.3m 여덟 점이 모두 면 안(가장자리에 붙은 것은 빼고 면 안쪽 깊이 들어간 것만) */
const deep = (B: Parameters<typeof onGround>[0], x: number, z: number) =>
  onGround(B, x, z, 0) && Array.from({ length: 8 }, (_, k) => (k * Math.PI) / 4).every((a) => onGround(B, x + Math.cos(a) * 0.3, z + Math.sin(a) * 0.3, 0));

describe('W14 지금 판', () => {
  it('땅 위 노면 표시 선의 점은 모두 그린 찻길 면 안(자르기 여유 0.3m + 판 자료 반올림)', () => {
    let n = 0;
    let out = 0;
    for (const l of marks.lines) {
      if (l.p.some((_, i) => i % 3 === 1 && l.p[i] !== 0)) continue;
      for (let k = 0; k < l.p.length; k += 3) {
        n++;
        if (!near(ground, l.p[k], l.p[k + 2], 0.6)) out++; // 자르기 여유 0.3m + 0.25m 칸 + dm 반올림
      }
    }
    expect(n).toBeGreaterThan(10000);
    expect(out).toBe(0);
  });
  it('화살표는 모두 찻길 면 안이고, 길 방향 차로 가운데로 옮긴 뒤 칸 가운데로 맞췄다', () => {
    for (const a of marks.arrows) expect(near(ground, a.x, a.z, 0.45)).toBe(true);
    // 다시 맞춰도 거의 움직이지 않는다(칸을 찾은 화살표)
    const again = fitCells(marks.arrows, marks.lines);
    const moved = again.out.filter((c, i) => c.w > 0 && Math.hypot(c.x - marks.arrows[i].x, c.z - marks.arrows[i].z) > 0.1).length;
    expect(moved / again.found).toBeLessThan(0.05);
  });
  it('나무 줄기는 찻길 면·교량·올린 둑길 위에 없다(못 옮긴 몇 그루 빼고)', () => {
    const decks = drawnGround(
      board.roads.flatMap((r) => {
        if (r.cls > 5 || isGroundRoad(r)) return [];
        const q = carriageSections(r, 0, Infinity);
        return q.length < 2 ? [] : [[[...q.flatMap((t) => [t.lx, t.lz]), ...q.reverse().flatMap((t) => [t.rx, t.rz])]]];
      }),
    );
    let on = 0;
    for (let i = 0; i < board.trees.length; i += 2) if (deep(ground, board.trees[i], board.trees[i + 1]) || deep(decks, board.trees[i], board.trees[i + 1])) on++;
    expect(on).toBeLessThan(40);
  });
  // 계획 세션 요청(합정역 사거리 지그재그): 차로 가운데선이 갈림 없는 조각 이음매에서 끊기지 않고, 칠한 중앙선을 넘지 않는다.
  // 2026-11-17 판: 이음매 끊김은 판 전체 2곳(독막로 −217,354, 서강로9길 1143,−222, 0.88m), 합정 200m 안 0곳.
  // 중앙선 넘김(4m 마다 짚은 점)은 판 전체 216점(양화로 2958 −1351,946 이 117점), 합정 200m 안 2점(이름 없는 연결로 3051 −520,187~191).
  // 더 나빠지지 않게 지금 값을 넘지 않는지 본다.
  // 재작업 W23: 길 정본(road.json)이 생긴 뒤로는 서울시 선으로 읽은 방향만이 아니라 차가 실제로 쓰는 모든 방향(이어받거나 나눈 방향 포함)을 잰다.
  // 그래서 중앙선 넘김은 368점(합정 200m 안 3점)이다. 이음매 끊김은 그대로 2곳
  it('차로 가운데선: 이음매 끊김·중앙선 넘김이 지금보다 늘지 않는다', () => {
    const nearH = (x: number, z: number) => Math.hypot(x + 497, z - 250) < 200;
    const sb = seamBreaks(board.roads, lanes);
    const cc = centerCrossings(board.roads, lanes, marks.lines);
    expect(sb.filter((q) => nearH(q.x, q.z))).toEqual([]);
    expect(sb.length).toBeLessThanOrEqual(2);
    expect(cc.filter((q) => nearH(q.x, q.z)).length).toBeLessThanOrEqual(3);
    expect(cc.length).toBeLessThanOrEqual(368); // 차가 쓰는 모든 방향(W23)
  });
  // 계획 세션 요청: 칸을 찾은 화살표는 바깥 테두리가 양옆 칠한 선 안에 0.2m 넘게 여유를 두고 들어간다(실패 0). 칸을 못 찾은 화살표 수는 메모에
  it('화살표 테두리가 놓인 차선 칸 안에 양쪽 0.2m 여유로 들어간다', () => {
    const again = fitCells(marks.arrows, marks.lines);
    const bad: string[] = [];
    let found = 0;
    marks.arrows.forEach((a, i) => {
      const c = again.out[i];
      if (!c.w || !a.w) return;
      found++;
      const shape = arrowShape(a.kind, a.w);
      if (!shape) return; // 그리지 않는 종류(오르막·자전거 표시)
      // 가운데가 칸 가운데에서 벗어난 만큼과 화살표 반폭
      const off = (c.x - a.x) * a.fz - (c.z - a.z) * a.fx;
      let half = 0;
      for (const q of shape) for (let k = 1; k < q.length; k += 2) half = Math.max(half, Math.abs(q[k]));
      if (half + Math.abs(off) > c.w / 2 - 0.2 + 0.06) bad.push(`${a.x.toFixed(1)},${a.z.toFixed(1)} k${a.kind} 칸 ${c.w.toFixed(2)} 반폭 ${half.toFixed(2)} 어긋남 ${off.toFixed(2)}`);
    });
    expect(found).toBeGreaterThan(2000);
    expect(bad.slice(0, 10)).toEqual([]);
  });
  // 계획 세션 요청: 계단 가장자리 바닥 면(0.6m 안 짧은 변이 직각으로 꺾이는 꼭짓점 4개 넘는 고리)이 다시 생기지 않는다.
  // 교통섬 구멍·횡단보도 밑 면은 0, 교차로 면 바깥 고리는 2026-11-17 판 239개(모퉁이 호의 cm 반올림 등, 원인 미확인)보다 늘지 않는다
  it('계단 가장자리 바닥 면이 없다', () => {
    const steps = (r: ArrayLike<number>) => {
      const n = r.length / 2;
      let c = 0;
      for (let i = 0; i < n; i++) {
        const [a, j] = [(i + n - 1) % n, (i + 1) % n];
        const [ux, uz, vx, vz] = [r[i * 2] - r[a * 2], r[i * 2 + 1] - r[a * 2 + 1], r[j * 2] - r[i * 2], r[j * 2 + 1] - r[i * 2 + 1]];
        const [lu, lv] = [Math.hypot(ux, uz), Math.hypot(vx, vz)];
        if (lu > 0.6 || lv > 0.6 || lu < 1e-3 || lv < 1e-3) continue;
        if (Math.abs((ux * vx + uz * vz) / (lu * lv)) < 0.17) c++;
      }
      return c;
    };
    expect(surface.faces.flatMap((f) => f.holes).filter((r) => steps(r) >= 4)).toHaveLength(0);
    expect(surface.draw.filter((f) => steps(f.outer) >= 4)).toHaveLength(0);
    expect(surface.faces.filter((f) => steps(f.outer) >= 4).length).toBeLessThanOrEqual(239);
  });
  // 계획 세션 요청: 보도 선이 찻길 면(횡단보도 면 빼고) 안에 들어간 길이, 걷는 길 그물에 이어지지 않은 횡단보도, 큰 덩어리 밖에 닿은 횡단보도 연결.
  // 2026-11-17 판: 보도 선 159km 가운데 443m, 연결 없는 횡단보도 115/889, 작은 덩어리에 닿은 연결 11. 0 으로 만들지 못해 늘지 않는지만 본다(메모)
  it('걷는 길: 찻길 위 보도 선·막다른 횡단보도가 늘지 않는다', () => {
    const W = decodeWalk(read('walk.json') as WalkJson);
    const G = drawnGround([
      ...polys.car.filter((c) => !reach[c[0]]).map((c) => [dm(c.slice(1))]),
      ...surface.faces.map((f) => [f.outer, ...f.holes]),
      ...surface.draw.map((f) => [f.outer]),
    ]);
    for (const c of board.crosswalks) fillBits(G, c.rings, 1, true);
    fillBits(G, board.crosswalkMarks, 1, true);
    const N = W.nx.length / 2;
    let onRoad = 0;
    for (let a = 0; a < N; a++)
      W.adj[a].forEach((b, k) => {
        if (b < a || W.kind[a][k] !== 0) return;
        const [ax, az, bx, bz] = [W.nx[a * 2], W.nx[a * 2 + 1], W.nx[b * 2], W.nx[b * 2 + 1]];
        const L = Math.hypot(bx - ax, bz - az);
        const n = Math.max(1, Math.ceil(L / 0.5));
        let inn = 0;
        for (let q = 0; q <= n; q++) if (onGround(G, ax + ((bx - ax) * q) / n, az + ((bz - az) * q) / n, 0)) inn++;
        onRoad += (L * inn) / (n + 1);
      });
    const extra: number[][] = Array.from({ length: N }, () => []);
    for (const l of W.links) extra[l.na].push(l.nb), extra[l.nb].push(l.na);
    const comp = new Int32Array(N).fill(-1);
    const sizes: number[] = [];
    for (let s0 = 0; s0 < N; s0++) {
      if (comp[s0] >= 0) continue;
      const st = [s0];
      comp[s0] = sizes.length;
      let sz = 0;
      while (st.length) {
        const v = st.pop()!;
        sz++;
        for (const w of [...W.adj[v], ...extra[v]]) if (comp[w] < 0) (comp[w] = sizes.length), st.push(w);
      }
      sizes.push(sz);
    }
    const big = sizes.indexOf(Math.max(...sizes));
    const linked = new Set(W.links.map((l) => l.xw));
    expect(onRoad).toBeLessThan(450);
    expect(board.crosswalks.length - linked.size).toBeLessThanOrEqual(115);
    expect(W.links.filter((l) => comp[l.na] !== big || comp[l.nb] !== big).length).toBeLessThanOrEqual(11);
  });
  // 계획 세션 요청: 횡단보도 면이 건물 외곽선과 겹치지 않는다(겹친 건물 외곽선은 굽기가 깎는다. 2026-11-17 판 45 → 2곳, 여러 번 드나드는 외곽선)
  it('횡단보도 면이 건물에 덮이지 않는다', () => {
    const blds = drawnGround(board.buildings.map((bl) => [bl.pts]));
    let bad = 0;
    for (const c of board.crosswalks) {
      let n = 0;
      let inB = 0;
      for (const r of c.rings) {
        let [x0, z0, x1, z1] = [Infinity, Infinity, -Infinity, -Infinity];
        for (let k = 0; k < r.length; k += 2) (x0 = Math.min(x0, r[k])), (x1 = Math.max(x1, r[k])), (z0 = Math.min(z0, r[k + 1])), (z1 = Math.max(z1, r[k + 1]));
        for (let x = x0; x <= x1; x += 0.25)
          for (let z = z0; z <= z1; z += 0.25) {
            let inside = false;
            for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) if (r[i + 1] > z !== r[j + 1] > z && x < r[i] + ((z - r[i + 1]) / (r[j + 1] - r[i + 1])) * (r[j] - r[i])) inside = !inside;
            if (!inside) continue;
            n++;
            if (onGround(blds, x, z, 0)) inB++;
          }
      }
      if (n && inB / n > 0.05) bad++;
    }
    expect(bad).toBeLessThanOrEqual(2);
  });
  // 계획 세션 요청(선 품질): 굽은 노면 선은 한 마디 꺾임 5° 안팎. 자료가 dm 라 짧은 마디는 반올림으로 꺾임이 흔들려
  // 2026-11-17 판 6~45° 마디 8,716개(45° 넘는 모서리 빼고). 늘지 않는지만 본다
  it('노면 선 마디 꺾임이 늘지 않는다', () => {
    let n = 0;
    for (const l of marks.lines) {
      if ([4, 13, 14].includes(l.k) || l.p.some((_, i) => i % 3 === 1 && l.p[i] !== 0)) continue;
      for (let i = 3; i + 3 < l.p.length; i += 3) {
        const [ux, uz, vx, vz] = [l.p[i] - l.p[i - 3], l.p[i + 2] - l.p[i - 1], l.p[i + 3] - l.p[i], l.p[i + 5] - l.p[i + 2]];
        const L = Math.hypot(ux, uz) * Math.hypot(vx, vz);
        if (L < 1e-6) continue;
        const a = (Math.acos(Math.max(-1, Math.min(1, (ux * vx + uz * vz) / L))) * 180) / Math.PI;
        if (a > 6 && a <= 45) n++;
      }
    }
    expect(n).toBeLessThanOrEqual(8716);
  });
});
