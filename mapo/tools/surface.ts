// 찻길 면·보도 면·분리대·연석 자리만 다시 굽는다(재작업 W51, 설계 문서 59절 B2, tools/road/surface.ts): public/data/surface.json 에 v2 칸 층(g·w·m)을 넣고
// curbs.json 의 점자블록을 새 찻길 면으로 다시 잡는다(연석 선은 앱이 g 외곽선에서 만든다). 다른 산출물(board·road·marks·walk·surface-polys)은 읽기만 한다.
// 서울시 선은 굽기(pnpm bake)가 tools/raw/ 에 남긴 자르기 전 땅 위 선(seoul-lines-ground.json)을 읽는다.
// 사용: node tools/surface.ts. 굽기 16(tools/bake.ts)도 길 정본을 구운 뒤 같은 함수를 부른다
import { readFileSync, writeFileSync } from 'node:fs';
import { decodeBoard, type BoardJson } from '../src/data/board.ts';
import { decodeMarks, type MarksJson } from '../src/data/marks.ts';
import { decodeLanes } from '../src/data/road.ts';
import { decodeSurface, tileRings, type SurfaceJson } from '../src/data/surface.ts';
import { buildCarGraph } from '../src/sim/graph.ts';
import { makeIntersections } from '../src/sim/intersection/index.ts';
import { groundQuery } from '../src/data/offroad.ts';
import { centerArrows } from './road/arrows.ts';
import { crossingFaces } from './road/crossings.ts';
import { bakeSurface, clipMarksToGround } from './road/surface.ts';

export function bakeSurfaceFile(): string {
  const read = (u: string) => JSON.parse(readFileSync(new URL(u, import.meta.url), 'utf8'));
  const board = decodeBoard(read('../public/data/board.json') as BoardJson);
  const marks = decodeMarks(read('../public/data/marks.json') as MarksJson);
  const lanes = decodeLanes(read('../public/data/road.json').lanes);
  const g = buildCarGraph(board.roads, lanes, marks.arrows);
  const inter = makeIntersections(g, { crosswalks: board.crosswalks, stopLines: board.stopLines, lamps: read('../public/data/signals.json') });
  const sj = read('../public/data/surface.json') as SurfaceJson;
  const sp = read('../public/data/surface-polys.json');
  const seoul = decodeMarks(read('./raw/seoul-lines-ground.json') as MarksJson).lines;
  const r = bakeSurface({ board, g, inter, sf: decodeSurface(sj), polys: sp, seoul, walk: read('../public/data/walk.json') });
  const json: SurfaceJson = { v: 2, cut: sj.cut, jn: sj.jn, dr: sj.dr, g: r.g, w: r.w, m: r.m };
  writeFileSync(new URL('../public/data/surface.json', import.meta.url), JSON.stringify(json));
  writeFileSync(new URL('../public/data/curbs.json', import.meta.url), JSON.stringify({ v: 2, c: [], t: r.tactile }));
  // 노면 표시(땅 위 선)를 새 찻길 면 안으로 자른다. 화살표·안전지대·고가 선은 그대로(차 그래프·시험이 읽는다)
  const mj = read('../public/data/marks.json') as MarksJson;
  const cm = clipMarksToGround({ l: mj.l, ld: mj.ld }, r.g);
  // 횡단보도 줄무늬는 새 찻길 면 경계까지(재작업 W57, 그리기 전용)
  const cx = crossingFaces(board, r.g);
  // 칠한 선 칸이 없는 화살표는 정본 차로 가운데로(재작업 W57, 차로 회전이 바뀌지 않을 때만)
  const q = groundQuery(tileRings(r.g));
  const ca = centerArrows({ ...mj, l: cm.l, ld: cm.ld, x: cx.x }, (arrows) => buildCarGraph(board.roads, lanes, arrows), (x, z) => q.deep(x, z, 0.5));
  writeFileSync(new URL('../public/data/marks.json', import.meta.url), JSON.stringify(ca.json));
  return `${r.log}; 새 찻길 면 밖이라 자른 노면 표시 ${cm.cut.toFixed(0)}m; ${cx.log}; 화살표 정본 차로 가운데로 ${ca.moved}개`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const t0 = Date.now();
  console.log(`${bakeSurfaceFile()}, ${((Date.now() - t0) / 1000).toFixed(1)}초`);
}
