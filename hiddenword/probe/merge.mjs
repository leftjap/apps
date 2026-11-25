// 묶음별 채점 결과를 합쳐 문제 데이터를 만들고, 기준 단어로 묶음 사이의 점수 차이를 잰다.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { ANSWERS, ANCHORS, BATCHES } from './config.mjs';
import { toDisplay } from './scale.mjs';

const dir = new URL('.', import.meta.url);
const all = readFileSync(new URL('words-all.txt', dir), 'utf8').split('\n').filter(Boolean);
const COUNT = BATCHES + 1; // 마지막 묶음은 나중에 더한 단어
const batches = Array.from({ length: COUNT }, (_, i) =>
  JSON.parse(readFileSync(new URL(`scores-batch-${i + 1}.json`, dir), 'utf8')),
);
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

const puzzles = [];
const problems = [];
for (const { no, word: answer, hints } of ANSWERS) {
  const raw = {};
  const spread = [];
  for (const w of all) {
    const seen = batches.map((b) => b[answer]?.[w]).filter((s) => Number.isInteger(s) && s >= 0 && s <= 100);
    if (!seen.length) { problems.push(`${answer}: ${w} 점수 없음`); continue; }
    if (ANCHORS.includes(w)) {
      if (seen.length !== COUNT) problems.push(`${answer}: 기준 단어 ${w} 가 ${seen.length}개 묶음에만 있음`);
      spread.push({ w, min: Math.min(...seen), max: Math.max(...seen), seen });
    }
    raw[w] = median(seen);
  }
  // 화면에 보이는 점수는 기준표 점수를 환산한 값이다
  const scores = Object.fromEntries(Object.entries(raw).map(([w, s]) => [w, toDisplay(s)]));

  let prev = 94;
  for (const h of hints) {
    if (!(h in scores)) problems.push(`${answer}: 단서 ${h} 의 점수 없음`);
    else if (h.includes(answer) || answer.includes(h)) problems.push(`${answer}: 단서 ${h} 에 정답이 드러남`);
    else if (scores[h] <= prev) problems.push(`${answer}: 단서 ${h}(${scores[h]}점)가 95점 미만이거나 앞 단서보다 높지 않음`);
    prev = scores[h] ?? prev;
  }
  puzzles.push({ no, answer, hints: hints.map((word) => ({ word, score: scores[word] })), scores });

  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1] || raw[b[0]] - raw[a[0]]);
  const band = (lo, hi) => sorted.filter(([, s]) => s >= lo && s <= hi).length;
  const diffs = spread.map((x) => x.max - x.min);
  console.log(`\n== ${answer} (단어 ${sorted.length}개)`);
  console.log(`화면 점수 구간: 99 ${band(99, 99)} · 95~98 ${band(95, 98)} · 80~94 ${band(80, 94)} · 60~79 ${band(60, 79)} · 30~59 ${band(30, 59)} · 0~29 ${band(0, 29)}`);
  for (const level of [99, 98, 97, 96, 95]) {
    console.log(`  ${level}점: ${sorted.filter(([, s]) => s === level).map(([w]) => w).join(', ') || '없음'}`);
  }
  console.log(`단서: ${hints.map((h) => `${h} ${scores[h]}`).join(' → ')}`);
  console.log(`기준 단어 ${spread.length}개의 묶음 사이 차이(기준표 점수): 평균 ${(diffs.reduce((a, b) => a + b, 0) / diffs.length).toFixed(1)}, 최대 ${Math.max(...diffs)}`);
}

if (problems.length) {
  console.error(`\n문제 ${problems.length}건:\n${problems.slice(0, 30).join('\n')}`);
  process.exit(1);
}
mkdirSync(new URL('../site/data/', dir), { recursive: true });
writeFileSync(new URL('../site/data/puzzles.json', dir), JSON.stringify(puzzles));
console.log('\nsite/data/puzzles.json 을 썼다');
