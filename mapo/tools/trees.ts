// 나무 수종 굽기: tools/raw/seoul-trees.json(tools/ground.py 가 받는 서울시 가로수 위치정보 OA-23040)의 수종을
// public/data/board.json 의 나무와 자리로 맞춰 public/data/trees.json 에 쓴다. board.json 은 고치지 않는다.
// 사용: node tools/trees.ts  (board.json 을 다시 구우면 이것도 다시 돌린다)
import { readFileSync, writeFileSync } from 'node:fs';
import { TREE_KINDS, treeKinds } from './lib/trees.ts';
import { carSurface } from './lib/treeplace.ts';
import { decodeSurface, type SurfaceJson } from '../src/data/surface.ts';

const board = JSON.parse(readFileSync(new URL('../public/data/board.json', import.meta.url), 'utf8')) as { trees: number[] };
const raw = JSON.parse(readFileSync(new URL('./raw/seoul-trees.json', import.meta.url), 'utf8')) as { src: string; trees: [number, number, string][] };
// 찻길 위에서 보도로 옮긴 나무(tools/treeplace.ts)는 찻길 면 위 원래 점에 맞춘다
const polys = JSON.parse(readFileSync(new URL('../public/data/surface-polys.json', import.meta.url), 'utf8')) as { car: number[][] };
const surface = decodeSurface(JSON.parse(readFileSync(new URL('../public/data/surface.json', import.meta.url), 'utf8')) as SurfaceJson);
const kinds = treeKinds(board.trees, raw.trees, carSurface(polys.car.map((c) => c.slice(1).map((v) => v / 10)), surface.faces));
const out = { src: raw.src, kinds: TREE_KINDS, k: Array.from(kinds).join('') };
writeFileSync(new URL('../public/data/trees.json', import.meta.url), JSON.stringify(out));
const count = TREE_KINDS.map((name, k) => `${name} ${kinds.filter((v) => v === k).length}`);
console.log(`나무 ${kinds.length}그루: ${count.join(', ')}`);
