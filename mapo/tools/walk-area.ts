// 걷는 면만 다시 굽는다(재작업 W28): 지금 public/data/walk.json 그물은 그대로 두고 걷는 면(a)만 새로 넣는다. node tools/walk-area.ts
// pnpm bake·node tools/walk.ts 는 그물을 구운 뒤 이 도구로 걷는 면을 굽는다
import { readFileSync, writeFileSync } from 'node:fs';
import { decodeBoard } from '../src/data/board.ts';
import { decodeMarks, type MarksJson } from '../src/data/marks.ts';
import { carriageSections, isGroundRoad, roadJoints, decodeSurface, type SurfaceJson } from '../src/data/surface.ts';
import { BOARD_R } from '../src/geo.ts';
import { underpasses, ZONES } from '../src/sim/people/zones.ts';
import type { WalkJson } from '../src/sim/walknet.ts';
import { walkArea } from './lib/walkarea.ts';
import { blockMap } from './lib/walkfix.ts';

const read = (f: string) => JSON.parse(readFileSync(new URL(`../public/data/${f}`, import.meta.url), 'utf8'));
const board = decodeBoard(read('board.json'));
const surface = decodeSurface(read('surface.json') as SurfaceJson);
const P = read('surface-polys.json') as { car: number[][]; med: number[][] };
const dm = (a: number[]) => a.map((v) => v / 10);
const walk = read('walk.json') as WalkJson;
const t0 = Date.now();
const bounds: [number, number, number, number] = [-BOARD_R, -BOARD_R, BOARD_R, BOARD_R];
const { blocked } = blockMap({
  bounds,
  roads: board.roads,
  faces: surface.faces,
  draw: surface.draw.map((f) => f.outer),
  car: P.car.map((c) => [c[0], dm(c.slice(1))] as [number, number[]]),
  med: P.med.map(dm),
  buildings: board.buildings.map((q) => q.pts),
  crosswalks: board.crosswalks,
  underpasses: underpasses(board.roads, ...ZONES.mangwon),
});
console.log(`막힘 칸 ${((Date.now() - t0) / 1000).toFixed(1)}초`);
// 중앙선을 칠한 작은 길(등급 4 이상, 땅 위): 길 가운데선 점의 절반 넘게가 서울시 중앙선(대분류 1) 1.5m 안
const marks = decodeMarks(read('marks.json') as MarksJson);
const CG = 8;
const cen = new Map<number, number[]>();
for (const l of marks.lines) {
  if (l.k !== 1) continue;
  for (let k = 3; k < l.p.length; k += 3) {
    const [ax, az, bx, bz] = [l.p[k - 3], l.p[k - 1], l.p[k], l.p[k + 2]];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 1));
    for (let q = 0; q <= n; q++) {
      const x = ax + ((bx - ax) * q) / n;
      const z = az + ((bz - az) * q) / n;
      const key = Math.floor(x / CG) * 100003 + Math.floor(z / CG);
      (cen.get(key) ?? cen.set(key, []).get(key)!).push(x, z);
    }
  }
}
const nearCen = (x: number, z: number) => {
  for (let a = -1; a <= 1; a++)
    for (let b = -1; b <= 1; b++) {
      const c = cen.get((Math.floor(x / CG) + a) * 100003 + Math.floor(z / CG) + b);
      if (c) for (let k = 0; k < c.length; k += 2) if (Math.hypot(c[k] - x, c[k + 1] - z) < 1.5) return true;
    }
  return false;
};
const joints = roadJoints(board.roads);
const carOff: number[][] = [];
board.roads.forEach((r, i) => {
  if (r.cls <= 3 || !isGroundRoad(r)) return;
  let n = 0;
  let on = 0;
  for (let k = 0; k < r.p.length; k += 2) (n++, nearCen(r.p[k], r.p[k + 1]) && on++);
  if (on * 2 <= n) return;
  const s = carriageSections(r, 0, Infinity, joints.subarray(i * 4, i * 4 + 4));
  if (s.length >= 2) carOff.push([...s.flatMap((q) => [q.lx, q.lz]), ...s.reverse().flatMap((q) => [q.rx, q.rz])]);
});
console.log(`중앙선 칠한 작은 길 ${carOff.length}`);
walk.a = walkArea(walk, blocked, bounds, carOff);
let cells = 0;
let runs = 0;
for (let k = 5; k < walk.a.length; ) {
  const n = walk.a[k++];
  runs += n;
  for (let q = 0; q < n; q++, k += 2) cells += walk.a[k + 1];
}
const json = JSON.stringify(walk);
writeFileSync(new URL('../public/data/walk.json', import.meta.url), json);
console.log(`걷는 면 ${((cells * walk.a[0] * walk.a[0]) / 1e10).toFixed(2)}km², 묶음 ${runs}, walk.json ${(json.length / 1e6).toFixed(2)}MB, ${((Date.now() - t0) / 1000).toFixed(1)}초`);
