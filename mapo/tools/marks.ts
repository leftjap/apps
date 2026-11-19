// 노면 표시만 다시 굽는다(재작업 W49, 설계 문서 59절 B1): 차로를 가르는 선·정지선을 길 정본(road.json)에서 만들어 public/data/marks.json 을 고쳐 쓴다.
// 다른 산출물(board·road·surface·curbs·walk)은 읽기만 한다. 서울시 선은 굽기(pnpm bake)가 tools/raw/ 에 남긴 것을 읽는다: 자른 서울시 표시(seoul-marks.json, 화살표·안전지대 포함)와
// 선 종류의 근거인 자르기 전 땅 위 선(seoul-lines-ground.json).
// 사용: node tools/marks.ts [--keep-arrows]. tools/road.ts(길 정본 다시 굽기)도 끝에 이것을 부른다
import { readFileSync, writeFileSync } from 'node:fs';
import { decodeBoard, type BoardJson } from '../src/data/board.ts';
import { decodeMarks, type MarksJson } from '../src/data/marks.ts';
import { decodeLanes } from '../src/data/road.ts';
import { decodeSurface } from '../src/data/surface.ts';
import { buildCarGraph } from '../src/sim/graph.ts';
import { makeIntersections } from '../src/sim/intersection/index.ts';
import { bakedGround, laneMarks, refitArrows } from './road/marks.ts';

/** keepArrows: 선만 다시 긋고 화살표는 지금 marks.json 자리에서, 새 선으로 칸이 달라진 것만 다시 맞춘다(재작업 W55: 차로마다 갈 수 있는 쪽·차 그래프는 그대로) */
export function bakeMarksFile(keepArrows = false): string {
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
  // 선만 고칠 때는 지금 화살표 자리를 넘겨 새로 긋는 선이 화살표를 지나지 않게 한다
  const now = keepArrows ? (read('../public/data/marks.json') as MarksJson) : null;
  // 그리기용 횡단보도 면(x, 재작업 W57)은 찻길 면에서 굽는 것이라 선을 다시 그어도 그대로 둔다
  const x = (read('../public/data/marks.json') as MarksJson).x;
  const lm = laneMarks({ board, g, inter, seoul, marks, ground, ground25, ...(now ? { arrows: decodeMarks(now).arrows } : {}) });
  // 화살표를 새 차선 칸 가운데로(차로마다 갈 수 있는 쪽이 바뀌지 않는 것만)
  if (now) {
    // 지금 화살표에서 시작해 새 선 칸에 다시 맞추고(refitArrows: 차로마다 갈 수 있는 쪽은 그대로), 칸 가운데·칸 폭이 0.1m 안으로 같은 화살표는 지금 값 그대로 둔다
    const ra = refitArrows({ ...lm.json, a: now.a, aw: now.aw }, (arrows) => buildCarGraph(board.roads, lanes, arrows));
    const a = ra.json.a.slice();
    const aw = (ra.json.aw ?? []).slice();
    let changed = 0;
    for (let i = 0; i < a.length / 4; i++) {
      if (Math.hypot(a[i * 4 + 1] - now.a[i * 4 + 1], a[i * 4 + 2] - now.a[i * 4 + 2]) <= 1 && Math.abs(aw[i] - (now.aw?.[i] ?? 0)) <= 1) {
        a.splice(i * 4, 4, ...now.a.slice(i * 4, i * 4 + 4));
        aw[i] = now.aw?.[i] ?? 0;
      } else changed++;
    }
    const turns = (arr: MarksJson) => buildCarGraph(board.roads, lanes, decodeMarks(arr).arrows).map((e) => Array.from(e.turns).join(',')).join(';');
    const out = turns({ ...lm.json, a, aw }) === turns(now) ? { ...lm.json, a, aw } : ra.json;
    writeFileSync(new URL('../public/data/marks.json', import.meta.url), JSON.stringify({ ...out, ...(x ? { x } : {}) }));
    return `${lm.log}; 화살표는 지금 자리에서 새 선 칸이 달라진 ${out === ra.json ? ra.moved : changed}개만 다시 맞춤(차로 회전 그대로)`;
  }
  const ra = refitArrows(lm.json, (arrows) => buildCarGraph(board.roads, lanes, arrows));
  writeFileSync(new URL('../public/data/marks.json', import.meta.url), JSON.stringify({ ...ra.json, ...(x ? { x } : {}) }));
  return `${lm.log}; 화살표 새 칸 가운데로 ${ra.moved}개(차로 회전이 바뀌어 되돌린 것 ${ra.reverted})`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const t0 = Date.now();
  console.log(`${bakeMarksFile(process.argv.includes('--keep-arrows'))}, ${((Date.now() - t0) / 1000).toFixed(1)}초`);
}
