// 두 채점자 평균 방식: all-N{a,b}.json 을 합쳐 문제 데이터(site/data/puzzles.json)를 만든다.
// - 두 채점자가 모두 고른 단어: 두 점수의 평균
// - 한 채점자만 고른 단어: 다른 채점자가 5점(관계없는 말)을 준 것으로 보고 평균
// - 평균이 10 미만이면 점수표에 넣지 않는다(화면에서 「관계없는 말」)
// 정답의 hints 가 비어 있으면 단서 후보를 보여 주고 파일은 쓰지 않는다.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { ANSWERS, ANCHORS_V2 } from './config.mjs';
import { toDisplay } from './scale.mjs';

const at = (p) => new URL(p, import.meta.url);
const UNLISTED = 5;
const count = readdirSync(at('.')).filter((f) => /^all-batch-\d+\.txt$/.test(f)).length;
const read = (f) => JSON.parse(readFileSync(at(f), 'utf8'));
const pairs = [];
const missing = [];
for (let i = 1; i <= count; i++) {
  try { pairs.push({ i, a: read(`all-${i}a.json`), b: read(`all-${i}b.json`), words: new Set(readFileSync(at(`all-batch-${i}.txt`), 'utf8').split(/\s+/).filter(Boolean)) }); }
  catch { missing.push(i); }
}
if (missing.length) { console.error(`결과 파일이 없는 묶음: ${missing.join(', ')}`); process.exit(1); }

const score = (v) => (Array.isArray(v) ? v[0] : v);
const ok = (s) => Number.isInteger(s) && s >= 0 && s <= 100;
const puzzles = [];
const problems = [];
let needHints = false;
for (const { no, word: answer, hints } of ANSWERS) {
  const raw = {};
  const reason = {};
  let both = 0, one = 0, dropped = 0;
  const anchor = {};
  for (const { i, a, b, words } of pairs) {
    const x = a[answer] ?? {}, y = b[answer] ?? {};
    for (const w of new Set([...Object.keys(x), ...Object.keys(y)])) {
      if (!words.has(w)) { dropped++; continue; }
      const sx = score(x[w]), sy = score(y[w]);
      if ((x[w] && !ok(sx)) || (y[w] && !ok(sy))) { dropped++; continue; }
      const avg = Math.round(((x[w] ? sx : UNLISTED) + (y[w] ? sy : UNLISTED)) / 2);
      if (ANCHORS_V2.includes(w)) { (anchor[w] ??= []).push(avg); continue; }
      x[w] && y[w] ? both++ : one++;
      if (avg >= 10) { raw[w] = avg; reason[w] = [x[w]?.[1], y[w]?.[1]].filter(Boolean).join(' / '); }
    }
  }
  // 기준 단어는 묶음마다 들어 있으므로 묶음별 평균의 가운데 값을 쓴다
  const spread = [];
  for (const w of ANCHORS_V2) {
    const vs = (anchor[w] ?? []).concat(Array(count - (anchor[w]?.length ?? 0)).fill(UNLISTED));
    const sorted = [...vs].sort((p, q) => p - q);
    const mid = sorted[Math.floor(sorted.length / 2)];
    if (mid >= 10) raw[w] = mid;
    if (sorted.at(-1) >= 10) spread.push(`${w} ${sorted[0]}~${sorted.at(-1)}`);
  }
  const scores = Object.fromEntries(Object.entries(raw).map(([w, s]) => [w, toDisplay(s)]));
  const sorted = Object.entries(scores).sort((p, q) => q[1] - p[1] || raw[q[0]] - raw[p[0]]);
  const band = (lo, hi) => sorted.filter(([, s]) => s >= lo && s <= hi).length;
  console.log(`\n== ${answer}: 점수표 ${sorted.length}개 (두 채점자 모두 ${both}, 한쪽만 ${one}, 버린 것 ${dropped})`);
  console.log(`화면 점수: 99 ${band(99, 99)} · 95~98 ${band(95, 98)} · 80~94 ${band(80, 94)} · 60~79 ${band(60, 79)} · 30~59 ${band(30, 59)}`);
  for (const level of [99, 98, 97, 96, 95]) console.log(`  ${level}점: ${sorted.filter(([, s]) => s === level).map(([w]) => w).join(', ') || '없음'}`);
  console.log(`  80~94점 앞 20개: ${sorted.filter(([, s]) => s >= 80 && s <= 94).slice(0, 20).map(([w, s]) => `${w} ${s}`).join(', ')}`);
  console.log(`  기준 단어 묶음 사이 범위(기준표 점수): ${spread.join(', ')}`);

  if (!hints.length) { needHints = true; continue; }
  let prev = 94;
  for (const h of hints) {
    if (!(h in scores)) problems.push(`${answer}: 단서 ${h} 의 점수 없음`);
    else if (h.includes(answer) || answer.includes(h)) problems.push(`${answer}: 단서 ${h} 에 정답이 드러남`);
    else if (scores[h] <= prev) problems.push(`${answer}: 단서 ${h}(${scores[h]}점)가 95점 미만이거나 앞 단서보다 높지 않음`);
    prev = scores[h] ?? prev;
  }
  console.log(`  단서: ${hints.map((h) => `${h} ${scores[h]}`).join(' → ')}`);
  puzzles.push({ no, answer, hints: hints.map((w) => ({ word: w, score: scores[w] })), scores });
}
if (needHints) { console.error('\n단서가 정해지지 않은 정답이 있어 파일을 쓰지 않았다(config.mjs 의 hints)'); process.exit(1); }
if (problems.length) { console.error(`\n문제 ${problems.length}건:\n${problems.join('\n')}`); process.exit(1); }
writeFileSync(at('../site/data/puzzles.json'), JSON.stringify(puzzles));
console.log('\nsite/data/puzzles.json 을 썼다');
