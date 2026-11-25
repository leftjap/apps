// 묶음별 채점 결과를 합쳐 문제 데이터를 만들고, 기준 단어로 묶음 사이의 점수 차이를 잰다.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { ANSWERS, ANCHORS, BATCHES } from './config.mjs';

const dir = new URL('.', import.meta.url);
const all = readFileSync(new URL('words-all.txt', dir), 'utf8').split('\n').filter(Boolean);
const COUNT = BATCHES + 1; // 마지막 묶음은 나중에 더한 단어
const batches = Array.from({ length: COUNT }, (_, i) =>
  JSON.parse(readFileSync(new URL(`scores-batch-${i + 1}.json`, dir), 'utf8')),
);
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

const puzzles = [];
const problems = [];
for (const { no, word: answer, clue } of ANSWERS) {
  const scores = {};
  const spread = [];
  for (const w of all) {
    const seen = batches.map((b) => b[answer]?.[w]).filter((s) => Number.isInteger(s) && s >= 0 && s <= 100);
    if (!seen.length) { problems.push(`${answer}: ${w} 점수 없음`); continue; }
    if (ANCHORS.includes(w)) {
      if (seen.length !== COUNT) problems.push(`${answer}: 기준 단어 ${w} 가 ${seen.length}개 묶음에만 있음`);
      spread.push({ w, min: Math.min(...seen), max: Math.max(...seen), seen });
    }
    scores[w] = median(seen);
  }
  if (!(clue in scores)) problems.push(`${answer}: 단서 ${clue} 의 점수 없음`);
  puzzles.push({ no, answer, clue: { word: clue, score: scores[clue] }, scores });

  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const band = (lo, hi) => sorted.filter(([, s]) => s >= lo && s <= hi).length;
  const diffs = spread.map((x) => x.max - x.min);
  console.log(`\n== ${answer} (단어 ${sorted.length}개)`);
  console.log(`구간: 95+ ${band(95, 100)} · 70~94 ${band(70, 94)} · 50~69 ${band(50, 69)} · 30~49 ${band(30, 49)} · 10~29 ${band(10, 29)} · 0~9 ${band(0, 9)}`);
  console.log(`상위 30: ${sorted.slice(0, 30).map(([w, s]) => `${w} ${s}`).join(', ')}`);
  console.log(`기준 단어 ${spread.length}개의 묶음 사이 차이: 평균 ${(diffs.reduce((a, b) => a + b, 0) / diffs.length).toFixed(1)}, 최대 ${Math.max(...diffs)}`);
  console.log(`차이 5점 이상: ${spread.filter((x) => x.max - x.min >= 5).map((x) => `${x.w}[${x.seen.join(',')}]`).join(' ') || '없음'}`);
}

if (problems.length) {
  console.error(`\n문제 ${problems.length}건:\n${problems.slice(0, 30).join('\n')}`);
  process.exit(1);
}
mkdirSync(new URL('../site/data/', dir), { recursive: true });
writeFileSync(new URL('../site/data/puzzles.json', dir), JSON.stringify(puzzles));
console.log('\nsite/data/puzzles.json 을 썼다');
