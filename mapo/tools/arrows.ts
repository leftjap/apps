// 노면 화살표만 정본 차로 가운데로 옮긴다(재작업 W57, tools/road/arrows.ts centerArrows): public/data/marks.json 의 a·aw 만 고쳐 쓰고 선·안전지대·횡단보도 면은 그대로 둔다.
// 칠한 선 칸을 찾지 못한 화살표만, 차 그래프 차로 회전이 바뀌지 않을 때만 옮긴다. 찻길 면을 다시 굽는 곳(tools/surface.ts, 굽기 16)도 끝에 같은 함수를 부른다. 사용: node tools/arrows.ts
import { readFileSync, writeFileSync } from 'node:fs';
import { decodeBoard, type BoardJson } from '../src/data/board.ts';
import type { MarksJson } from '../src/data/marks.ts';
import { decodeLanes } from '../src/data/road.ts';
import { buildCarGraph } from '../src/sim/graph.ts';
import { groundQuery } from '../src/data/offroad.ts';
import { tileRings, type SurfaceJson } from '../src/data/surface.ts';
import { centerArrows } from './road/arrows.ts';

export function bakeArrowsFile(): string {
  const read = (u: string) => JSON.parse(readFileSync(new URL(u, import.meta.url), 'utf8'));
  const board = decodeBoard(read('../public/data/board.json') as BoardJson);
  const lanes = decodeLanes(read('../public/data/road.json').lanes);
  const mj = read('../public/data/marks.json') as MarksJson;
  const q = groundQuery(tileRings((read('../public/data/surface.json') as SurfaceJson).g ?? []));
  const r = centerArrows(mj, (arrows) => buildCarGraph(board.roads, lanes, arrows), (x, z) => q.deep(x, z, 0.5));
  writeFileSync(new URL('../public/data/marks.json', import.meta.url), JSON.stringify(r.json));
  return `화살표 정본 차로 가운데로 ${r.moved}개(차로 회전이 바뀌어 되돌린 것 ${r.reverted})`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const t0 = Date.now();
  console.log(`${bakeArrowsFile()}, ${((Date.now() - t0) / 1000).toFixed(1)}초`);
}
