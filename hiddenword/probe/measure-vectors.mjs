// 단어 벡터의 순위가 AI 가 매긴 점수와 얼마나 일치하는지, 먼 단어를 납득할 만한 순서로 줄 세우는지 잰다.
import { readFileSync } from 'node:fs';
import { ANSWERS } from './config.mjs';

const at = (p) => new URL(p, import.meta.url);
const DIM = 300;
const words = JSON.parse(readFileSync(at('../data-raw/fasttext/vectors-words.json'), 'utf8'));
const buf = readFileSync(at('../data-raw/fasttext/vectors.bin'));
const all = new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4);
const index = new Map(words.map((w, i) => [w, i]));
const vec = (w) => all.subarray(index.get(w) * DIM, index.get(w) * DIM + DIM);
const norms = words.map((w) => Math.hypot(...vec(w)));
const puzzles = JSON.parse(readFileSync(at('../site/data/puzzles.json'), 'utf8'));

const PROBES = {
  우비: ['우산', '장화', '비옷', '소나기', '장마', '비', '옷', '감기', '운동화', '구두', '어린이', '유치원', '저축', '김치', '냉장고'],
  사자: ['호랑이', '표범', '맹수', '동물', '고양이', '울음', '탈', '가면', '왕', '장님', '저축', '김치', '냉장고'],
  약속: ['맹세', '다짐', '계약', '서약', '신뢰', '신랑', '신부', '카페', '식당', '시간', '저축', '은행', '김치', '냉장고'],
};
const spearman = (xs, ys) => {
  const rank = (v) => { const o = v.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]); const r = []; o.forEach(([, i], k) => { r[i] = k; }); return r; };
  const rx = rank(xs), ry = rank(ys), n = xs.length;
  const d2 = rx.reduce((s, r, i) => s + (r - ry[i]) ** 2, 0);
  return 1 - (6 * d2) / (n * (n * n - 1));
};

console.log(`벡터가 있는 단어 ${words.length}개`);
for (const { word: answer } of ANSWERS) {
  if (!index.has(answer)) { console.log(`\n== ${answer}: 벡터 없음`); continue; }
  const a = vec(answer), na = norms[index.get(answer)];
  const sims = words.map((w, i) => {
    const v = all.subarray(i * DIM, i * DIM + DIM);
    let dot = 0;
    for (let k = 0; k < DIM; k++) dot += a[k] * v[k];
    return [w, dot / (na * norms[i])];
  }).filter(([w]) => w !== answer && !w.includes(answer)).sort((x, y) => y[1] - x[1]);
  const rankOf = new Map(sims.map(([w], i) => [w, i + 1]));
  const simOf = new Map(sims);
  const scores = puzzles.find((p) => p.answer === answer).scores;

  console.log(`\n== ${answer} (견준 단어 ${sims.length}개)`);
  console.log(`벡터 순위 1~40위: ${sims.slice(0, 40).map(([w, s]) => `${w} ${(s * 100).toFixed(0)}${w in scores ? `(${scores[w]})` : '(-)'}`).join(', ')}`);
  for (const at2 of [100, 500, 1000, 3000, 10000, 20000]) {
    console.log(`  ${at2}위 근처: ${sims.slice(at2 - 1, at2 + 7).map(([w, s]) => `${w} ${(s * 100).toFixed(0)}`).join(', ')}`);
  }
  const scored = Object.entries(scores).filter(([w]) => rankOf.has(w));
  console.log(`AI 점수가 있는 단어 ${scored.length}개와의 순위 상관(스피어만): ${spearman(scored.map(([, s]) => s), scored.map(([w]) => simOf.get(w))).toFixed(2)}`);
  for (const [lo, hi, name] of [[99, 100, '99점'], [95, 98, '95~98점'], [80, 94, '80~94점'], [60, 79, '60~79점'], [30, 59, '30~59점']]) {
    const rs = scored.filter(([, s]) => s >= lo && s <= hi).map(([w]) => rankOf.get(w)).sort((x, y) => x - y);
    if (rs.length) console.log(`  AI ${name} ${rs.length}개의 벡터 순위: 가운데 ${rs[Math.floor(rs.length / 2)]}위, 가장 높은 ${rs[0]}위, 가장 낮은 ${rs.at(-1)}위`);
  }
  const unscored = sims.filter(([w]) => !(w in scores));
  console.log(`AI 가 관계없다고 본 단어 중 벡터 순위가 높은 것: ${unscored.slice(0, 25).map(([w]) => `${w}(${rankOf.get(w)}위)`).join(', ')}`);
  console.log(`살펴볼 단어: ${PROBES[answer].map((w) => (rankOf.has(w) ? `${w} ${rankOf.get(w)}위·${(simOf.get(w) * 100).toFixed(0)}·AI ${scores[w] ?? '없음'}` : `${w} 벡터 없음`)).join(' | ')}`);
}
