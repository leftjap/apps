// 나무 수종. 서울시 가로수 위치정보(OA-23040)의 수종 이름을 모형 6가지로 나누고, 판 나무(board.json)와 자리로 맞춘다.
import { toXZ } from '../../src/geo.ts';
import { PUSH_REACH } from './treeplace.ts';

/** 모형 번호 순서. 6 은 가로수 자료에 없는 녹지 나무(굽기가 녹지 칸에 뿌린 것) */
export const TREE_KINDS = ['은행', '양버즘', '느티', '벚', '소나무류', '그 밖 활엽', '녹지'] as const;

export function treeClass(name: string): number {
  if (name.startsWith('은행')) return 0;
  if (name.includes('버즘')) return 1;
  if (name.startsWith('느티')) return 2;
  if (name.includes('벚')) return 3;
  if (/소나무|잣나무|스트로브|곰솔|해송|섬잣/.test(name)) return 4;
  return 5;
}

/** 판 나무 좌표(0.1m 정수, x·z 번갈아)마다 모형 번호. 가로수 원자료의 같은 0.1m 자리에 있는 점의 수종을 쓰고, 없으면 녹지(6) */
/** onCar 를 주면, 찻길 위에서 보도로 옮긴 나무(tools/lib/treeplace.ts)를 찻길 면 위 원래 점에 맞춘다 */
export function treeKinds(boardTrees: ArrayLike<number>, raw: [number, number, string][], onCar?: (x: number, z: number) => boolean): Uint8Array {
  const at = new Map<string, number>();
  for (const [lat, lon, name] of raw) {
    const [x, z] = toXZ(lat, lon);
    const key = `${Math.round(x * 10)},${Math.round(z * 10)}`;
    if (!at.has(key)) at.set(key, treeClass(name));
  }
  // 자리가 꼭 맞는 짝이 없는 판 나무는 짝이 없는 원래 점과 가까운 쌍부터 판 전체에서 짝짓는다(원래 점 하나는 나무 하나에만 준다).
  // 찻길 면 위 원래 점은 굽기가 보도로 옮긴 거리(PUSH_REACH 12.8m, tools/lib/treeplace.ts)까지, 그 밖 원래 점은 연석에서 1.2m 식재대로 맞춘 거리(3m, tools/bake.ts)까지 본다.
  // (판 나무 순서대로 가장 가까운 점을 가져가던 때는 반경을 넓히면 앞 번호 나무(녹지에 뿌린 나무 포함)가 남의 원래 점을 가져갔고,
  //  7m 까지만 찾으면 8~11m 옮긴 소나무 세 그루가 녹지 나무로 적혔다)
  const claimed = new Set<string>();
  for (let i = 0; i < boardTrees.length; i += 2) claimed.add(`${boardTrees[i]},${boardTrees[i + 1]}`);
  const grid = new Map<string, [number, number, number, number][]>();
  for (const [lat, lon, name] of raw) {
    const [x, z] = toXZ(lat, lon);
    if (claimed.has(`${Math.round(x * 10)},${Math.round(z * 10)}`)) continue;
    const reach = onCar && onCar(x, z) ? PUSH_REACH : 3;
    const k = `${Math.floor(x / 10)},${Math.floor(z / 10)}`;
    (grid.get(k) ?? grid.set(k, []).get(k)!).push([x, z, treeClass(name), reach]);
  }
  const out = new Uint8Array(boardTrees.length / 2).fill(6);
  const pairs: [number, number, [number, number, number, number]][] = [];
  for (let i = 0; i < out.length; i++) {
    const exact = at.get(`${boardTrees[i * 2]},${boardTrees[i * 2 + 1]}`);
    if (exact !== undefined) {
      out[i] = exact;
      continue;
    }
    const [x, z] = [boardTrees[i * 2] / 10, boardTrees[i * 2 + 1] / 10];
    for (let gx = -2; gx <= 2; gx++)
      for (let gz = -2; gz <= 2; gz++)
        for (const p of grid.get(`${Math.floor(x / 10) + gx},${Math.floor(z / 10) + gz}`) ?? []) {
          const d = Math.hypot(p[0] - x, p[1] - z);
          if (d < p[3]) pairs.push([d, i, p]);
        }
  }
  pairs.sort((u, v) => u[0] - v[0]);
  const done = new Set<number>();
  const used = new Set<[number, number, number, number]>();
  for (const [, i, p] of pairs) {
    if (done.has(i) || used.has(p)) continue;
    out[i] = p[2];
    done.add(i);
    used.add(p);
  }
  return out;
}
