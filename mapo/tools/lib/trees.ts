// 나무 수종. 서울시 가로수 위치정보(OA-23040)의 수종 이름을 모형 6가지로 나누고, 판 나무(board.json)와 자리로 맞춘다.
import { toXZ } from '../../src/geo.ts';

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
export function treeKinds(boardTrees: ArrayLike<number>, raw: [number, number, string][]): Uint8Array {
  const at = new Map<string, number>();
  for (const [lat, lon, name] of raw) {
    const [x, z] = toXZ(lat, lon);
    const key = `${Math.round(x * 10)},${Math.round(z * 10)}`;
    if (!at.has(key)) at.set(key, treeClass(name));
  }
  const out = new Uint8Array(boardTrees.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = at.get(`${boardTrees[i * 2]},${boardTrees[i * 2 + 1]}`) ?? 6;
  return out;
}
