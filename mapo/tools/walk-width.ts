// 걷는 선 면 폭(w)과 갈래 영역(j)만 다시 굽는다(재작업 W31 S2, tools/lib/walkwidth.ts): 지금 public/data/walk.json 의 그물·걷는 면은 그대로 둔다. node tools/walk-width.ts
// tools/walk-area.ts 가 걷는 면을 구운 뒤 이 도구를 부른다
import { readFileSync, writeFileSync } from 'node:fs';
import type { WalkJson } from '../src/sim/walknet.ts';
import { edgeWidths, junctions } from './lib/walkwidth.ts';

const url = new URL('../public/data/walk.json', import.meta.url);
const before = readFileSync(url, 'utf8');
const walk = JSON.parse(before) as WalkJson;
const t0 = Date.now();
delete walk.w;
delete walk.j;
const base = JSON.stringify(walk).length;
walk.w = edgeWidths(walk);
walk.j = junctions(walk, walk.w);
let areas = 0;
let nodes = 0;
for (let k = 0; k < walk.j.length; k += 2 + walk.j[k]) (areas++, (nodes += walk.j[k]));
const json = JSON.stringify(walk);
writeFileSync(url, json);
console.log(`면 폭 ${walk.w.length}선, 갈래 영역 ${areas}곳(노드 ${nodes}), walk.json ${(json.length / 1e6).toFixed(2)}MB(면 폭·영역 ${((json.length - base) / 1e6).toFixed(2)}MB), ${((Date.now() - t0) / 1000).toFixed(1)}초`);
