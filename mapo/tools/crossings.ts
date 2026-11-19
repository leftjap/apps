// 그리기용 횡단보도 면만 다시 굽는다(재작업 W57, tools/road/crossings.ts): board.json 의 서울시 횡단보도 면을 surface.json 의 그린 찻길 면(g) 경계까지 늘여 marks.json x 에 쓴다.
// 다른 산출물과 marks.json 의 다른 열쇠는 그대로다. tools/surface.ts(찻길 면 다시 굽기)와 굽기 16(tools/bake.ts)도 끝에 같은 함수를 부른다. 사용: node tools/crossings.ts
import { readFileSync, writeFileSync } from 'node:fs';
import { decodeBoard, type BoardJson } from '../src/data/board.ts';
import type { MarksJson } from '../src/data/marks.ts';
import type { SurfaceJson } from '../src/data/surface.ts';
import { crossingFaces } from './road/crossings.ts';

export function bakeCrossingsFile(): string {
  const read = (u: string) => JSON.parse(readFileSync(new URL(u, import.meta.url), 'utf8'));
  const board = decodeBoard(read('../public/data/board.json') as BoardJson);
  const sj = read('../public/data/surface.json') as SurfaceJson;
  const mj = read('../public/data/marks.json') as MarksJson;
  const r = crossingFaces(board, sj.g ?? []);
  writeFileSync(new URL('../public/data/marks.json', import.meta.url), JSON.stringify({ ...mj, x: r.x }));
  return r.log;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const t0 = Date.now();
  console.log(`${bakeCrossingsFile()}, ${((Date.now() - t0) / 1000).toFixed(1)}초`);
}
