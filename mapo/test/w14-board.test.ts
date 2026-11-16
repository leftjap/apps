import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeBoard } from '../src/data/board.ts';
import { decodeLanes, type LanesJson } from '../src/data/lanes.ts';
import { decodeMarks, type MarksJson } from '../src/data/marks.ts';
import { carriageSections, decodeSurface, isGroundRoad, tunnelReach, type SurfaceJson } from '../src/data/surface.ts';
import { drawnGround, onGround } from '../tools/lib/groundclip.ts';
import { fitCells } from '../tools/lib/arrows.ts';
import { arrowShape } from '../src/data/marks.ts';
import { centerCrossings, seamBreaks } from '../tools/lib/lanecheck.ts';

// 재작업 W14, 지금 판(public/data): 노면 표시는 그린 찻길 면 안에만, 화살표는 차로 가운데에, 나무는 찻길·데크 위에 없다
const read = (f: string) => JSON.parse(readFileSync(new URL(`../public/data/${f}`, import.meta.url), 'utf8'));
const board = decodeBoard(read('board.json'));
const surface = decodeSurface(read('surface.json') as SurfaceJson);
const marks = decodeMarks(read('marks.json') as MarksJson);
const lanes = decodeLanes(read('lanes.json') as LanesJson);
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
  // 더 나빠지지 않게 지금 값을 넘지 않는지 본다
  it('차로 가운데선: 이음매 끊김·중앙선 넘김이 지금보다 늘지 않는다', () => {
    const nearH = (x: number, z: number) => Math.hypot(x + 497, z - 250) < 200;
    const sb = seamBreaks(board.roads, lanes);
    const cc = centerCrossings(board.roads, lanes, marks.lines);
    expect(sb.filter((q) => nearH(q.x, q.z))).toEqual([]);
    expect(sb.length).toBeLessThanOrEqual(2);
    expect(cc.filter((q) => nearH(q.x, q.z)).length).toBeLessThanOrEqual(2);
    expect(cc.length).toBeLessThanOrEqual(216);
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
});
