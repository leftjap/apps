// 단어 목록을 합쳐 채점 묶음으로 나눈다. 모든 묶음에 같은 기준 단어를 넣어 묶음 사이의 점수 차이를 잴 수 있게 한다.
import { readFileSync, writeFileSync } from 'node:fs';
import { ANSWERS, ANCHORS, BATCHES } from './config.mjs';

const dir = new URL('.', import.meta.url);
const read = (name) =>
  readFileSync(new URL(name, dir), 'utf8')
    .split('\n')
    .map((w) => w.normalize('NFC').replace(/\s+/g, ''))
    .filter(Boolean);

const answers = new Set(ANSWERS.map((a) => a.word));
const raw = [...read('words-common.txt'), ...ANSWERS.flatMap((a) => read(`related-${a.word}.txt`))];
const valid = (w) => /^[가-힣]{2,6}$/.test(w) && !answers.has(w);
const dropped = [...new Set(raw.filter((w) => !valid(w)))];
const words = [...new Set(raw.filter(valid))].filter((w) => !ANCHORS.includes(w));

// 가나다순으로 두면 비슷한 말이 한 묶음에 몰리므로, 실행할 때마다 같은 결과가 나오는 방식으로 섞는다
const hash = (w) => [...w].reduce((h, c) => Math.imul(h ^ c.codePointAt(0), 16777619) >>> 0, 2166136261);
words.sort((a, b) => hash(a) - hash(b) || a.localeCompare(b));

const size = Math.ceil(words.length / BATCHES);
for (let i = 0; i < BATCHES; i++) {
  const batch = [...ANCHORS, ...words.slice(i * size, (i + 1) * size)];
  writeFileSync(new URL(`batch-${i + 1}.txt`, dir), batch.join('\n') + '\n');
}
// 한 글자 명사처럼 나중에 더한 단어는 앞의 묶음을 다시 채점하지 않도록 따로 한 묶음으로 둔다
const extra = [...new Set(read('words-extra.txt'))].filter(
  (w) => /^[가-힣]{1,6}$/.test(w) && !answers.has(w) && !ANCHORS.includes(w) && !words.includes(w),
);
writeFileSync(new URL(`batch-${BATCHES + 1}.txt`, dir), [...ANCHORS, ...extra].join('\n') + '\n');
words.push(...extra);
writeFileSync(new URL('words-all.txt', dir), [...ANCHORS, ...words].join('\n') + '\n');
console.log(`입력 ${raw.length}개, 제외 ${dropped.length}개(${dropped.slice(0, 20).join(', ')}), 더한 단어 ${extra.length}개, 채점 대상 ${words.length + ANCHORS.length}개, 묶음 ${BATCHES}개 × 약 ${size + ANCHORS.length}개와 더한 단어 묶음 1개`);
