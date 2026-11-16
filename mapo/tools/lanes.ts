// 차로 가운데선 굽기: public/data/board.json 의 도로 조각(차가 다니는 것)마다 public/data/marks.json 의 서울시 차선으로
// 방향별 차로 가운데선을 읽어 public/data/lanes.json 에 쓴다(tools/lib/carlanes.ts). board.json 은 고치지 않는다.
// 사용: node tools/lanes.ts  (pnpm bake 가 끝에 같은 함수를 부른다. board.json·marks.json 을 손으로 바꿨으면 이것을 다시 돌린다)
import { readFileSync, writeFileSync } from 'node:fs';
import { decodeBoard, type BoardJson } from '../src/data/board.ts';
import { decodeMarks, type MarksJson } from '../src/data/marks.ts';
import { bakeLanes } from './lib/carlanes.ts';

const board = decodeBoard(JSON.parse(readFileSync(new URL('../public/data/board.json', import.meta.url), 'utf8')) as BoardJson);
const marks = decodeMarks(JSON.parse(readFileSync(new URL('../public/data/marks.json', import.meta.url), 'utf8')) as MarksJson);
const { json, log } = bakeLanes(board.roads, marks.lines);
writeFileSync(new URL('../public/data/lanes.json', import.meta.url), json);
console.log(log);
