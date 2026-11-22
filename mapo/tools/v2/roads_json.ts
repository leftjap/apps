// 지시서 1(docs/redraw-orders/1-land.md): board.json 의 길 중심선을 파이썬이 읽을 수 있게 뽑는다.
// 등급 0~6 길마다 {cls, oneway, p:[x,y,z,…]}(m) → tmp/v2/roads.json. 실행: node tools/v2/roads_json.ts
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeBoard, type BoardJson } from '../../src/data/board.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const board = decodeBoard(JSON.parse(readFileSync(join(ROOT, 'public', 'data', 'board.json'), 'utf8')) as BoardJson);
// 좌표는 dm 정수를 10 으로 나눈 값이라 0.1m 로 반올림하면 원래 값 그대로다
const roads = board.roads.filter((r) => r.cls <= 6).map((r) => ({ cls: r.cls, oneway: r.oneway, p: Array.from(r.p, (v) => Math.round(v * 10) / 10) }));
const out = join(ROOT, 'tmp', 'v2', 'roads.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(roads));
console.log(`길 ${roads.length}개 → ${out}`);
