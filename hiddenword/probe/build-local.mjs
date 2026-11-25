// site/ 의 화면, 규칙, 점수표, 사전 단어 목록을 파일 하나(local.html)로 합친다. 앱의 미리보기 창은 옆 파일을 읽지 못한다.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const at = (p) => new URL(p, import.meta.url);
const IMPORT = "import { MAX_TRIES, createGame, guess, shareText } from './game.mjs';";
const FETCH = "const [puzzleData, wordData] = await Promise.all(['./data/puzzles.json', './data/words.json'].map((u) => fetch(u).then((r) => r.json())));";

export function buildLocal() {
  const html = readFileSync(at('../site/index.html'), 'utf8');
  const game = readFileSync(at('../site/game.mjs'), 'utf8').replace(/^export /gm, '').trim();
  const json = (name) => readFileSync(at(`../site/data/${name}`), 'utf8').trim().replace(/</g, '\\u003c');
  if (!html.includes(IMPORT) || !html.includes(FETCH)) throw new Error('site/index.html 에서 바꿔 넣을 줄을 찾지 못했다');
  return html
    .replace(IMPORT, () => game)
    .replace(FETCH, () => `const [puzzleData, wordData] = [${json('puzzles.json')}, ${json('words.json')}];`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = buildLocal();
  writeFileSync(at('../local.html'), out);
  console.log(`local.html ${Buffer.byteLength(out)} 바이트`);
}
