// 받는 단어 전체(site/data/words.json + 외래어 목록)를 채점 묶음(all-batch-N.txt)으로 나눈다.
// 두 채점자 평균 방식에서 쓴다. 모든 묶음 맨 앞에 기준 단어(ANCHORS_V2)를 넣는다.
import { readFileSync, writeFileSync } from 'node:fs';
import { ANSWERS, ANCHORS_V2 } from './config.mjs';

const at = (p) => new URL(p, import.meta.url);
const SIZE = 2400;
const PER_LINE = 25;

const byLength = JSON.parse(readFileSync(at('../site/data/words.json'), 'utf8'));
const words = new Set();
for (const [len, joined] of Object.entries(byLength)) for (let i = 0; i < joined.length; i += Number(len)) words.add(joined.slice(i, i + Number(len)));
for (const w of readFileSync(at('words-loan.txt'), 'utf8').split(/\s+/)) if (w) words.add(w.normalize('NFC'));
for (const { word } of ANSWERS) words.add(word);
writeFileSync(at('../site/data/words.json'), JSON.stringify(
  [...words].sort().reduce((o, w) => ((o[w.length] = (o[w.length] ?? '') + w), o), {}),
));

const answers = new Set(ANSWERS.map((a) => a.word));
const hash = (w) => [...w].reduce((h, c) => Math.imul(h ^ c.codePointAt(0), 16777619) >>> 0, 2166136261);
const todo = [...words].filter((w) => !answers.has(w) && !ANCHORS_V2.includes(w)).sort((a, b) => hash(a) - hash(b) || a.localeCompare(b));
const count = Math.ceil(todo.length / SIZE);
for (let i = 0; i < count; i++) {
  const batch = [...ANCHORS_V2, ...todo.slice(i * SIZE, (i + 1) * SIZE)];
  const lines = [];
  for (let j = 0; j < batch.length; j += PER_LINE) lines.push(batch.slice(j, j + PER_LINE).join(' '));
  writeFileSync(at(`all-batch-${i + 1}.txt`), lines.join('\n') + '\n');
}
console.log(`받는 단어 ${words.size}개, 채점할 단어 ${todo.length}개 + 기준 단어 ${ANCHORS_V2.length}개, 묶음 ${count}개`);
