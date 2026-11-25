// fastText 한국어 벡터(cc.ko.300.vec.gz)에서 우리가 받는 단어의 벡터만 뽑아 data-raw/fasttext/ 에 둔다.
// 원본은 https://fasttext.cc/docs/en/crawl-vectors.html (CC BY-SA 3.0) 이고 커밋하지 않는다.
import { createReadStream, readFileSync, writeFileSync } from 'node:fs';
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';

const at = (p) => new URL(p, import.meta.url);
const DIM = 300;
const byLength = JSON.parse(readFileSync(at('../site/data/words.json'), 'utf8'));
const wanted = new Set();
for (const [len, joined] of Object.entries(byLength)) {
  for (let i = 0; i < joined.length; i += Number(len)) wanted.add(joined.slice(i, i + Number(len)));
}

const words = [];
const chunks = [];
const lines = createInterface({ input: createReadStream(at('../data-raw/fasttext/cc.ko.300.vec.gz')).pipe(createGunzip()), crlfDelay: Infinity });
let n = 0;
for await (const line of lines) {
  if (n++ === 0) continue; // 첫 줄은 단어 수와 차원
  const sp = line.indexOf(' ');
  const word = line.slice(0, sp).normalize('NFC');
  if (!wanted.has(word)) continue;
  wanted.delete(word); // 같은 단어가 다시 나오면 처음 것만 쓴다
  const vec = Float32Array.from(line.slice(sp + 1).trim().split(' '), Number);
  if (vec.length !== DIM) continue;
  words.push(word);
  chunks.push(Buffer.from(vec.buffer));
}
writeFileSync(at('../data-raw/fasttext/vectors.bin'), Buffer.concat(chunks));
writeFileSync(at('../data-raw/fasttext/vectors-words.json'), JSON.stringify(words));
console.log(`벡터 파일 ${n - 1}줄에서 ${words.length}개를 찾았다. 벡터가 없는 단어 ${wanted.size}개: ${[...wanted].slice(0, 40).join(' ')}`);
