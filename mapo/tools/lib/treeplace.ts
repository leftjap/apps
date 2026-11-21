import type { Board, Road } from '../../src/data/board.ts';
import { GCELL, tileRings } from '../../src/data/surface.ts';
import { BOARD_R } from '../../src/geo.ts';
import { railSegs } from '../road/surface.ts';
import { bitsAt, fillBits, makeBits, strokeBits, type Bits } from './bits.ts';

// 찻길 위에 찍힌 가로수 옮기기(재작업 W15). 서울시 가로수 위치정보의 점 가운데 일부는 그린 찻길 면 안(연석에서 0.2~3m)에 찍혀 있어,
// 나무 줄기가 차로 한가운데 서고 차가 나무 사이로 다녔다(판 전체 나무 11,026그루 가운데 차로 가운데 1.3m 안 736그루, 그 가운데 653그루가 찻길 면 위).
// 찻길 면(onCar) 위 나무를 가장 가까운 찻길 밖 자리(16방향, 0.5m 씩 MAX m 까지)로 옮기고 같은 방향으로 BEYOND m 더 들인다(보도 안 나무 구덩이 자리).
// W14: 넓힌 찻길·교차로 면 한가운데 찍힌 나무도 옮기도록 12m 까지 본다
const MAX = 12;
const BEYOND = 0.8;
/** 찻길 위 나무를 옮기는 가장 먼 거리(m). 수종 짝짓기(tools/lib/trees.ts)가 같은 거리까지 원래 점을 찾는다 */
export const PUSH_REACH = MAX + BEYOND;

/** trees: [x, z, ...](dm 정수). 그 자리에서 고친다. 옮긴 나무와 찻길 밖 자리를 찾지 못해 남긴 나무 수를 돌려준다 */
export function pushTreesOffRoad(trees: number[], onCar: (x: number, z: number) => boolean): { moved: number; left: number } {
  let moved = 0;
  let left = 0;
  for (let i = 0; i < trees.length; i += 2) {
    const x = trees[i] / 10;
    const z = trees[i + 1] / 10;
    if (!onCar(x, z)) continue;
    let found = false;
    for (let r = 0.5; r <= MAX && !found; r += 0.5)
      for (let k = 0; k < 16; k++) {
        const ux = Math.cos((k * Math.PI) / 8);
        const uz = Math.sin((k * Math.PI) / 8);
        if (onCar(x + ux * r, z + uz * r)) continue;
        const d = onCar(x + ux * (r + BEYOND), z + uz * (r + BEYOND)) ? r : r + BEYOND;
        trees[i] = Math.round((x + ux * d) * 10);
        trees[i + 1] = Math.round((z + uz * d) * 10);
        found = true;
        break;
      }
    if (found) moved++;
    else left++;
  }
  return { moved, left };
}

/** 찻길 면(찻길 띠 고리, m)과 교차로 면(교통섬 구멍 빼고)으로 '찻길 면 위인가'를 0.25m 칸으로 답한다 */
export function carSurface(car: ArrayLike<number>[], faces: { outer: ArrayLike<number>; holes: ArrayLike<number>[] }[]): (x: number, z: number) => boolean {
  const B = makeBits(-BOARD_R, -BOARD_R, BOARD_R, BOARD_R, 0.25);
  for (const c of car) fillBits(B, [c], 1);
  for (const f of faces) fillBits(B, [f.outer, ...f.holes], 1);
  return (x, z) => !!(bitsAt(B, x, z) & 1);
}

// ── 길 정본 찻길 면 위 나무(재작업 W53) ──
// B2(재작업 W51)가 찻길 면을 길 정본 차로 띠로 새로 구운 뒤 그린 찻길 면(surface.json g) 안에 선 나무가 155그루였다(옛 면 91).
// 대부분 서울시 가로수 점이 차로 띠와 몇 m 겹친 자리다: 강변북로 램프 7207 가로수 이팝나무 17그루는 모두 연석에서 3.0~3.75m 안쪽에 나란히 찍혀
// 자료끼리 한 방향으로 어긋난 것이라, 가장 가까운 보도·분리대 녹지로 옮긴다. 녹지에 고정 난수로 뿌린 나무(실제 나무가 아니다)가 찻길 면 위면 지운다.
// 6m 안에 옮길 자리가 없거나 마주 오는 한 방향 길 사이(board gap) 안에 선 가로수는 실제 섬·분리대가 찻길로 칠해졌을 수 있어 그대로 두고 B3 로 넘긴다.
/** 옮길 때 찾는 거리(m), 찻길 면 가장자리에서 들이는 거리(가로수 식재대 가운데, 굽기 줄 맞추기와 같은 1.2m) */
const G_MAX = 6;
const G_IN = 1.2;
/** 찻길 면 안이라고 보는 깊이(시험 test/w53-trees.test.ts 와 같다) */
export const G_DEEP = 0.3;
const GB = { CAR: 1, NO: 2 } as const;

/** surface.json v2 찻길 면 칸 층(g)과 나무를 둘 수 없는 곳(땅에 닿은 건물 외곽선, 땅 위 철도 부지)을 판 0.25m 칸 비트로 */
export function groundBits(ground: ArrayLike<number>, board: Board): Bits {
  const B = makeBits(-BOARD_R, -BOARD_R, BOARD_R, BOARD_R, GCELL);
  for (const b of board.buildings) if (!b.minH) fillBits(B, [b.pts], GB.NO);
  for (const [ax, az, bx, bz, hw] of railSegs(board)) strokeBits(B, [ax, az, bx, bz], hw, GB.NO);
  for (const t of tileRings(ground)) fillBits(B, t.rings, GB.CAR);
  return B;
}

/** groundBits 의 찻길 면 위인가 */
export const isCar = (B: Bits, x: number, z: number) => (bitsAt(B, x, z) & GB.CAR) !== 0;
/** 찻길 면 안, 가장자리에서 r m 넘게 안쪽인가(16방향) */
export function deepOnCar(B: Bits, x: number, z: number, r = G_DEEP): boolean {
  if (!isCar(B, x, z)) return false;
  for (let k = 0; k < 16; k++) if (!isCar(B, x + Math.cos((k * Math.PI) / 8) * r, z + Math.sin((k * Math.PI) / 8) * r)) return false;
  return true;
}
/** 나무를 둘 수 있는 자리: 찻길 면·건물·철도 부지 밖(보도·분리대 녹지·둔치 풀밭 등) */
const plantable = (B: Bits, x: number, z: number) => (bitsAt(B, x, z) & (GB.CAR | GB.NO)) === 0;

/** 마주 오는 한 방향 길 사이(board 의 한 방향 길 왼쪽 분리대 폭 gap ≥ 2m) 안인가: 길 중심선 왼쪽으로 반폭 − 0.5m ~ 반폭 + gap + 0.5m */
export function inDualGap(roads: Road[], x: number, z: number): boolean {
  for (const r of roads) {
    if (!r.oneway || r.tunnel || !(r.gap >= 2)) continue;
    const half = (r.lf * r.lw) / 2;
    const p = r.p;
    for (let i = 3; i < p.length; i += 3) {
      const [ax, az, bx, bz] = [p[i - 3], p[i - 1], p[i], p[i + 2]];
      if (Math.abs(p[i - 2]) > 0.3) continue;
      const L = Math.hypot(bx - ax, bz - az);
      if (L < 1e-6) continue;
      const [ux, uz] = [(bx - ax) / L, (bz - az) / L];
      const t = (x - ax) * ux + (z - az) * uz;
      if (t < 0 || t > L) continue;
      // 판 좌표(동 x, 남 z)에서 진행 방향 왼쪽 = (uz, −ux)
      const left = (x - ax) * uz - (z - az) * ux;
      if (left > half - 0.5 && left < half + r.gap + 0.5) return true;
    }
  }
  return false;
}

export interface GroundTreeResult {
  /** 옮긴 나무 [나무 번호, 전 x, z, 뒤 x, z](m) */
  moved: [number, number, number, number, number][];
  /** 지운 녹지 나무 번호 */
  removed: number[];
  /** 그대로 둔 나무 [나무 번호, x, z, 까닭] */
  kept: [number, number, number, 'gap' | 'far'][];
}

/** trees: [x, z, ...](dm 정수), kinds: 나무마다 모형 번호(6 = 녹지에 뿌린 나무)거나, 녹지 나무가 시작하는 자리를 모르면 null(녹지 나무도 옮긴다).
 *  찻길 면 깊이 0.3m 넘게 안쪽 나무를 옮기거나 지운다. 지운 나무는 trees·kinds 에서 빼고(그 자리에서 고친다) 결과를 돌려준다 */
export function placeTreesOffGround(trees: number[], kinds: number[] | null, B: Bits, roads: Road[]): GroundTreeResult {
  const res: GroundTreeResult = { moved: [], removed: [], kept: [] };
  const drop = new Set<number>();
  for (let i = 0; i < trees.length / 2; i++) {
    const x = trees[i * 2] / 10;
    const z = trees[i * 2 + 1] / 10;
    if (!deepOnCar(B, x, z)) continue;
    if (kinds && kinds[i] === 6) {
      drop.add(i);
      res.removed.push(i);
      continue;
    }
    if (inDualGap(roads, x, z)) {
      res.kept.push([i, x, z, 'gap']);
      continue;
    }
    // 가장 가까운 심을 수 있는 자리(32방향, 0.25m 씩), 그 방향으로 찻길 면 가장자리에서 1.2m 까지 들인다(심을 수 없는 곳이 나오면 그 앞까지)
    let hit: [number, number] | null = null;
    for (let r = 0.25; r <= G_MAX && !hit; r += 0.25)
      for (let k = 0; k < 32; k++) {
        const [ux, uz] = [Math.cos((k * Math.PI) / 16), Math.sin((k * Math.PI) / 16)];
        if (!plantable(B, x + ux * r, z + uz * r)) continue;
        let d = r;
        while (d + 0.25 <= r + G_IN && plantable(B, x + ux * (d + 0.25), z + uz * (d + 0.25))) d += 0.25;
        hit = [x + ux * d, z + uz * d];
        break;
      }
    if (!hit || deepOnCar(B, hit[0], hit[1])) {
      res.kept.push([i, x, z, 'far']);
      continue;
    }
    trees[i * 2] = Math.round(hit[0] * 10);
    trees[i * 2 + 1] = Math.round(hit[1] * 10);
    res.moved.push([i, x, z, trees[i * 2] / 10, trees[i * 2 + 1] / 10]);
  }
  if (drop.size) {
    let w = 0;
    for (let i = 0; i < trees.length / 2; i++) {
      if (drop.has(i)) continue;
      trees[w * 2] = trees[i * 2];
      trees[w * 2 + 1] = trees[i * 2 + 1];
      if (kinds) kinds[w] = kinds[i];
      w++;
    }
    trees.length = w * 2;
    if (kinds) kinds.length = w;
  }
  return res;
}
