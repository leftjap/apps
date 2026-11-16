import { BOARD_R } from '../../src/geo.ts';
import { bitsAt, fillBits, makeBits } from './bits.ts';

// 찻길 위에 찍힌 가로수 옮기기(재작업 W15). 서울시 가로수 위치정보의 점 가운데 일부는 그린 찻길 면 안(연석에서 0.2~3m)에 찍혀 있어,
// 나무 줄기가 차로 한가운데 서고 차가 나무 사이로 다녔다(판 전체 나무 11,026그루 가운데 차로 가운데 1.3m 안 736그루, 그 가운데 653그루가 찻길 면 위).
// 찻길 면(onCar) 위 나무를 가장 가까운 찻길 밖 자리(16방향, 0.5m 씩 MAX m 까지)로 옮기고 같은 방향으로 BEYOND m 더 들인다(보도 안 나무 구덩이 자리).
// W14: 넓힌 찻길·교차로 면 한가운데 찍힌 나무도 옮기도록 12m 까지 본다
const MAX = 12;
const BEYOND = 0.8;

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
