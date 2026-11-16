// 찻길 위 가로수 옮기기(tools/lib/treeplace.ts): public/data/board.json 의 나무 가운데 찻길 면(surface-polys.json 의 car + surface.json 교차로 면) 위의 것을 보도로 옮긴다.
// 사용: node tools/treeplace.ts 다음 node tools/trees.ts  (pnpm bake 도 같은 함수를 부른다. tools/trees.ts 는 옮긴 나무를 찻길 면 위 원래 점에 맞춘다)
import { readFileSync, writeFileSync } from 'node:fs';
import { decodeSurface, type SurfaceJson } from '../src/data/surface.ts';
import { carSurface, pushTreesOffRoad } from './lib/treeplace.ts';

const dir = new URL('../public/data/', import.meta.url);
const read = (f: string) => JSON.parse(readFileSync(new URL(f, dir), 'utf8'));
const board = read('board.json');
const polys = read('surface-polys.json') as { car: number[][] };
const onCar = carSurface(polys.car.map((c) => c.slice(1).map((v) => v / 10)), decodeSurface(read('surface.json') as SurfaceJson).faces);
const r = pushTreesOffRoad(board.trees, onCar);
writeFileSync(new URL('board.json', dir), JSON.stringify(board));
console.log(`찻길 위 나무 ${r.moved}그루 옮김, 찻길 밖 자리를 못 찾아 남김 ${r.left}그루`);
