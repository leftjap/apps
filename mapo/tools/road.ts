// 길 정본만 다시 굽는다(설계 문서 51절): public/data/board.json 과 서울시 차선으로 public/data/road.json 을 쓴다. board.json 은 고치지 않는다.
// 차선은 굽기(pnpm bake)가 남겨 둔 자르기 전 땅 위 선(tools/raw/seoul-lines-ground.json)을 읽는다. 사용: node tools/road.ts
import { readFileSync, writeFileSync } from 'node:fs';
import { decodeBoard, type BoardJson } from '../src/data/board.ts';
import { decodeMarks, type MarksJson } from '../src/data/marks.ts';
import { bakeRoad } from './road/index.ts';

const t0 = Date.now();
const read = (u: string) => JSON.parse(readFileSync(new URL(u, import.meta.url), 'utf8'));
const board = decodeBoard(read('../public/data/board.json') as BoardJson);
const lines = decodeMarks(read('./raw/seoul-lines-ground.json') as MarksJson).lines;
const { json, log } = bakeRoad(board.roads, lines, board.crosswalks, board.stopLines);
writeFileSync(new URL('../public/data/road.json', import.meta.url), json);
console.log(`${log}, ${((Date.now() - t0) / 1000).toFixed(1)}초`);
