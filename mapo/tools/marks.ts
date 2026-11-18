// 노면 표시만 다시 굽는다(재작업 W49, 설계 문서 59절 B1): 차로를 가르는 선·정지선을 길 정본(road.json)에서 만들어 public/data/marks.json 을 고쳐 쓴다.
// 다른 산출물(board·road·surface·curbs·walk)은 읽기만 한다. 서울시 선은 굽기(pnpm bake)가 tools/raw/ 에 남긴 것을 읽는다: 자른 서울시 표시(seoul-marks.json, 화살표·안전지대 포함)와
// 선 종류의 근거인 자르기 전 땅 위 선(seoul-lines-ground.json).
// 사용: node tools/marks.ts. tools/road.ts(길 정본 다시 굽기)도 끝에 이것을 부른다
import { readFileSync, writeFileSync } from 'node:fs';
import { decodeBoard, type BoardJson } from '../src/data/board.ts';
import { decodeMarks, type MarksJson } from '../src/data/marks.ts';
import { decodeLanes } from '../src/data/road.ts';
import { decodeSurface } from '../src/data/surface.ts';
import { buildCarGraph } from '../src/sim/graph.ts';
import { makeIntersections } from '../src/sim/intersection/index.ts';
import { bakedGround, laneMarks, refitArrows } from './road/marks.ts';

export function bakeMarksFile(): string {
  const read = (u: string) => JSON.parse(readFileSync(new URL(u, import.meta.url), 'utf8'));
  const board = decodeBoard(read('../public/data/board.json') as BoardJson);
  // 서울시 선만 든 표시(굽기 16 이 정본 선을 넣기 전에 남긴 것): 다시 돌려도 같은 결과가 나오게 지금 marks.json 이 아니라 이것에서 만든다
  const marks = read('./raw/seoul-marks.json') as MarksJson;
  const lanes = decodeLanes(read('../public/data/road.json').lanes);
  const g = buildCarGraph(board.roads, lanes, decodeMarks(marks).arrows);
  const inter = makeIntersections(g, { crosswalks: board.crosswalks, stopLines: board.stopLines, lamps: read('../public/data/signals.json') });
  const [sf, sp] = [decodeSurface(read('../public/data/surface.json')), read('../public/data/surface-polys.json')];
  const ground = bakedGround(board, sf, sp);
  const ground25 = bakedGround(board, sf, sp, 0.25);
  const seoul = decodeMarks(read('./raw/seoul-lines-ground.json') as MarksJson).lines;
  const lm = laneMarks({ board, g, inter, seoul, marks, ground, ground25 });
  // 화살표를 새 차선 칸 가운데로(차로마다 갈 수 있는 쪽이 바뀌지 않는 것만)
  const ra = refitArrows(lm.json, (arrows) => buildCarGraph(board.roads, lanes, arrows));
  writeFileSync(new URL('../public/data/marks.json', import.meta.url), JSON.stringify(ra.json));
  return `${lm.log}; 화살표 새 칸 가운데로 ${ra.moved}개(차로 회전이 바뀌어 되돌린 것 ${ra.reverted})`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const t0 = Date.now();
  console.log(`${bakeMarksFile()}, ${((Date.now() - t0) / 1000).toFixed(1)}초`);
}
