// 높이 다른 찻길 굽기(tools/lib/levels.ts): public/data/board.json 의 찻길 터널 조각에 표시를 달고, 다른 찻길을 노드 없이 넘는 다리를 올린다.
// 사용: node tools/levels.ts  (tools/raw/highways.json 이 있어야 한다. pnpm bake 도 board.json 을 쓰기 전에 같은 함수를 부른다)
import { readFileSync, writeFileSync } from 'node:fs';
import { roadLevels } from './lib/levels.ts';

const file = new URL('../public/data/board.json', import.meta.url);
const board = JSON.parse(readFileSync(file, 'utf8'));
const ways = JSON.parse(readFileSync(new URL('./raw/highways.json', import.meta.url), 'utf8')).elements;
const { tunnels, raised, skipped } = roadLevels(board.r, ways);
writeFileSync(file, JSON.stringify(board));
console.log(`찻길 터널 조각 ${tunnels}, 올린 다리 넘는 자리 ${raised.length}(${raised.join(' ')}), 다리가 아니라 못 올린 곳 ${skipped.length}(${skipped.join(' ')})`);
