// 맞춤법 사전(hunspell-dict-ko)에서 명사를 뽑아 「실제 있는 단어」 목록을 만들고,
// 아직 채점하지 않은 명사를 훑어볼 묶음(scan-batch-N.txt)으로 나눈다.
// 사전은 data-raw/ 에 받아 두며 커밋하지 않는다: https://github.com/spellcheck-ko/hunspell-dict-ko/releases (0.7.92)
import { readFileSync, writeFileSync } from 'node:fs';
import { ANSWERS, ANCHORS } from './config.mjs';

const dir = new URL('.', import.meta.url);
const NOUN_FLAGS = new Set(['9', '10', '24', '25']); // 명사와 단위 명사
const SCAN_SIZE = 2500;
const PER_LINE = 25;

const dic = readFileSync(new URL('../data-raw/hunspell/ko-aff-dic-0.7.92/ko.dic', dir), 'utf8').split('\n').slice(1);
const nouns = new Set();
for (const line of dic) {
  const [word, rest = ''] = line.split('/');
  const flags = rest.split(' ')[0].split(',');
  const w = word.normalize('NFC');
  if (flags.some((f) => NOUN_FLAGS.has(f)) && /^[가-힣]{1,6}$/.test(w)) nouns.add(w);
}

const scored = readFileSync(new URL('words-all.txt', dir), 'utf8').split('\n').filter(Boolean);
const answers = ANSWERS.map((a) => a.word);
const valid = new Set([...nouns, ...scored, ...answers]);

// 글자 수별로 단어를 이어 붙여 저장한다(구분 글자를 넣지 않아 파일이 작아진다)
const byLength = {};
for (const w of [...valid].sort()) byLength[w.length] = (byLength[w.length] ?? '') + w;
writeFileSync(new URL('../site/data/words.json', dir), JSON.stringify(byLength));

const hash = (w) => [...w].reduce((h, c) => Math.imul(h ^ c.codePointAt(0), 16777619) >>> 0, 2166136261);
const seen = new Set([...scored, ...answers]);
const todo = [...nouns].filter((w) => !seen.has(w)).sort((a, b) => hash(a) - hash(b) || a.localeCompare(b));
const count = Math.ceil(todo.length / SCAN_SIZE);
for (let i = 0; i < count; i++) {
  const words = [...ANCHORS, ...todo.slice(i * SCAN_SIZE, (i + 1) * SCAN_SIZE)];
  const lines = [];
  for (let j = 0; j < words.length; j += PER_LINE) lines.push(words.slice(j, j + PER_LINE).join(' '));
  writeFileSync(new URL(`scan-batch-${i + 1}.txt`, dir), lines.join('\n') + '\n');
}
writeFileSync(new URL('scan-words.txt', dir), todo.join('\n') + '\n');
console.log(`사전 명사 ${nouns.size}개, 받는 단어 ${valid.size}개, 새로 훑을 단어 ${todo.length}개, 묶음 ${count}개`);
