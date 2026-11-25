// 채점 결과를 합쳐 문제 데이터를 만든다.
// - scores-batch-N.json: 처음 만든 단어 목록(words-all.txt)을 모두 채점한 결과
// - scan-N.json: 사전의 나머지 명사를 훑어 정답과 관계가 있는 단어(기준표 10점 이상)만 채점한 결과
// 기준표 10점 미만(관계없는 말)은 점수표에 넣지 않는다. 화면은 사전에 있는 단어이면 「관계없는 말」로 처리한다.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { ANSWERS, ANCHORS, BATCHES } from './config.mjs';
import { toDisplay } from './scale.mjs';

const dir = new URL('.', import.meta.url);
const list = (name) => readFileSync(new URL(name, dir), 'utf8').split(/\s+/).filter(Boolean);
const json = (name) => JSON.parse(readFileSync(new URL(name, dir), 'utf8'));
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const ok = (s) => Number.isInteger(s) && s >= 0 && s <= 100;

const first = list('words-all.txt');
const firstBatches = Array.from({ length: BATCHES + 1 }, (_, i) => json(`scores-batch-${i + 1}.json`));
const scanCount = readdirSync(dir).filter((f) => /^scan-batch-\d+\.txt$/.test(f)).length;
// 같은 묶음을 한 번 더 훑은 결과(rescan-N.json)가 있으면 두 결과를 평균한다. 한쪽에만 있는 단어는 다른 쪽이 5점(관계없는 말)을 준 것으로 본다
const UNLISTED = 5;
const scans = Array.from({ length: scanCount }, (_, i) => {
  const a = json(`scan-${i + 1}.json`);
  if (!existsSync(new URL(`rescan-${i + 1}.json`, dir))) return { words: new Set(list(`scan-batch-${i + 1}.txt`)), scores: a };
  const b = json(`rescan-${i + 1}.json`);
  const scores = {};
  for (const answer of new Set([...Object.keys(a), ...Object.keys(b)])) {
    scores[answer] = {};
    for (const w of new Set([...Object.keys(a[answer] ?? {}), ...Object.keys(b[answer] ?? {})])) {
      scores[answer][w] = Math.round(((a[answer]?.[w] ?? UNLISTED) + (b[answer]?.[w] ?? UNLISTED)) / 2);
    }
  }
  return { words: new Set(list(`scan-batch-${i + 1}.txt`)), scores };
});

const puzzles = [];
const problems = [];
for (const { no, word: answer, hints } of ANSWERS) {
  const raw = {};
  for (const w of first) {
    const seen = firstBatches.map((b) => b[answer]?.[w]).filter(ok);
    if (!seen.length) { problems.push(`${answer}: ${w} 점수 없음`); continue; }
    raw[w] = median(seen);
  }
  let invented = 0;
  const perScan = [];
  for (const { words, scores } of scans) {
    let close = 0;
    for (const [w, s] of Object.entries(scores[answer] ?? {})) {
      if (!words.has(w) || !ok(s)) { invented++; continue; }
      if (ANCHORS.includes(w)) continue; // 기준 단어의 점수는 처음 채점한 값을 쓴다
      raw[w] = s;
      if (s >= 30) close++;
    }
    perScan.push(close);
  }
  // 기준 단어를 묶음마다 어떻게 채점했는지 본다. 결과 파일에 없으면 10점 미만으로 본 것이다
  const drift = ANCHORS.map((w) => {
    const seen = scans.map(({ scores }) => scores[answer]?.[w] ?? 5);
    return { w, base: raw[w], min: Math.min(...seen), max: Math.max(...seen) };
  }).filter((x) => x.base >= 10);

  const kept = Object.entries(raw).filter(([, s]) => s >= 10);
  const scores = Object.fromEntries(kept.map(([w, s]) => [w, toDisplay(s)]));

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
  const fromScan = kept.filter(([w]) => !first.includes(w));
  console.log(`\n== ${answer}: 점수표 ${sorted.length}개 (처음 목록 ${sorted.length - fromScan.length} + 사전에서 찾은 것 ${fromScan.length})`);
  console.log(`화면 점수 구간: 99 ${band(99, 99)} · 95~98 ${band(95, 98)} · 80~94 ${band(80, 94)} · 60~79 ${band(60, 79)} · 30~59 ${band(30, 59)}`);
  for (const level of [99, 98, 97, 96, 95]) {
    console.log(`  ${level}점: ${sorted.filter(([, s]) => s === level).map(([w]) => w).join(', ') || '없음'}`);
  }
  console.log(`단서: ${hints.map((h) => `${h} ${scores[h]}`).join(' → ')}`);
  console.log(`사전에서 찾은 단어 중 기준표 50점 이상: ${fromScan.filter(([, s]) => s >= 50).sort((a, b) => b[1] - a[1]).map(([w, s]) => `${w} ${s}`).join(', ') || '없음'}`);
  console.log(`묶음별로 찾은 단어 수(기준표 30점 이상): ${perScan.join(' ')}`);
  console.log(`기준 단어를 사전 훑기 묶음들이 매긴 점수(처음 점수 → 최저~최고): ${drift.map((x) => `${x.w} ${x.base}→${x.min}~${x.max}`).join(', ')}`);
  if (invented) console.log(`묶음에 없는 단어나 잘못된 점수 ${invented}건은 버렸다`);
}

if (problems.length) {
  console.error(`\n문제 ${problems.length}건:\n${problems.slice(0, 30).join('\n')}`);
  process.exit(1);
}
writeFileSync(new URL('../site/data/puzzles.json', dir), JSON.stringify(puzzles));
console.log('\nsite/data/puzzles.json 을 썼다');
