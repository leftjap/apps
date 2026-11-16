// 걷는 길 그물만 다시 굽는다(재작업 W21): public/data 의 판·찻길 면으로 public/data/walk.json 을 새로 쓴다.
// pnpm bake 도 같은 일을 하므로, 판을 굽지 않고 걷는 길만 바꿀 때 쓴다: node tools/walk.ts
import { readFileSync, writeFileSync } from 'node:fs';
import { decodeBoard } from '../src/data/board.ts';
import { decodeSurface, type SurfaceJson } from '../src/data/surface.ts';
import { BOARD_R } from '../src/geo.ts';
import { doorWanted } from '../src/sim/people/zones.ts';
import { boardWalkNet } from './lib/walknet.ts';
import { bakeWalk } from './lib/walkfix.ts';

const read = (f: string) => JSON.parse(readFileSync(new URL(`../public/data/${f}`, import.meta.url), 'utf8'));
const board = decodeBoard(read('board.json'));
const surface = decodeSurface(read('surface.json') as SurfaceJson);
const P = read('surface-polys.json') as { car: number[][]; med: number[][]; isl: number[][]; walk: number[][] };
const dm = (a: number[]) => a.map((v) => v / 10);
const polys = { car: P.car.map((c) => [c[0], dm(c.slice(1))] as [number, number[]]), med: P.med.map(dm), isl: P.isl.map(dm), walk: P.walk.map(dm) };
const draw = surface.draw.map((f) => f.outer);
const t0 = Date.now();
const raw = boardWalkNet(board, surface.faces, draw, polys);
console.log(`뼈대 굽기 ${((Date.now() - t0) / 1000).toFixed(1)}초`);
const area = (p: ArrayLike<number>) => {
  let a = 0;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) a += p[j] * p[i + 1] - p[i] * p[j + 1];
  return Math.abs(a) / 2;
};
const walk = bakeWalk(board, raw, surface.faces, draw, polys, [-BOARD_R, -BOARD_R, BOARD_R, BOARD_R], (i, x, z) => doorWanted(x, z) && area(board.buildings[i].pts) > 40, (s) => console.log(s));
const json = JSON.stringify(walk);
writeFileSync(new URL('../public/data/walk.json', import.meta.url), json);
console.log(`walk.json ${(json.length / 1e6).toFixed(2)}MB, ${((Date.now() - t0) / 1000).toFixed(1)}초`);
