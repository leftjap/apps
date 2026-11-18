// 찻길 면 위 나무 정리(tools/lib/treeplace.ts placeTreesOffGround, 재작업 W53): public/data/board.json 의 나무 가운데 길 정본 찻길 면(surface.json g) 안
// 가장자리에서 0.3m 넘게 안쪽 나무를 가장 가까운 보도·분리대 녹지로 옮기고, 녹지에 뿌린 나무는 지운다. 수종(trees.json)은 나무 순서대로 함께 고친다.
// 사용: node tools/treeplace.ts  (pnpm bake 는 찻길 면을 구운 뒤 같은 함수를 부른다. node tools/surface.ts 로 찻길 면만 다시 구웠으면 이것을 다시 돌린다)
import { readFileSync, writeFileSync } from 'node:fs';
import { decodeBoard, type BoardJson } from '../src/data/board.ts';
import { decodeSurface, type SurfaceJson } from '../src/data/surface.ts';
import { groundBits, placeTreesOffGround } from './lib/treeplace.ts';

const dir = new URL('../public/data/', import.meta.url);
const read = (f: string) => JSON.parse(readFileSync(new URL(f, dir), 'utf8'));
const board = read('board.json') as BoardJson & { trees: number[] };
const tj = read('trees.json') as { src: string; kinds: string[]; k: string };
const kinds = Array.from(tj.k, Number);
if (kinds.length !== board.trees.length / 2) throw new Error(`trees.json ${kinds.length} 그루, board.json ${board.trees.length / 2} 그루: node tools/trees.ts 를 먼저 돌린다`);
const bd = decodeBoard(board);
const r = placeTreesOffGround(board.trees, kinds, groundBits(decodeSurface(read('surface.json') as SurfaceJson).ground, bd), bd.roads);
writeFileSync(new URL('board.json', dir), JSON.stringify(board));
writeFileSync(new URL('trees.json', dir), JSON.stringify({ ...tj, k: kinds.join('') }));
console.log(`찻길 면 위 나무: 옮김 ${r.moved.length}, 녹지 나무 지움 ${r.removed.length}, 그대로 둠 ${r.kept.length}(${r.kept.map(([, x, z, w]) => `${w} ${x.toFixed(1)},${z.toFixed(1)}`).join(' ')})`);
