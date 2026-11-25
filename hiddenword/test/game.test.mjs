import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_TRIES, createGame, guess, shareText } from '../site/game.mjs';

// 단서는 유사도 95점 이상이고 뒤로 갈수록 높다. 틀릴 때마다 다음 단서가 열린다.
// scores 에는 정답과 관계가 있는 단어만 들어 있다. words 는 사전에 있는 단어 전체다.
const puzzle = {
  no: 1,
  answer: '우비',
  hints: [
    { word: '장화', score: 96 },
    { word: '우산', score: 97 },
    { word: '비옷', score: 99 },
  ],
  scores: { 장화: 96, 우산: 97, 비옷: 99, 판초: 98, 장마: 88, 소나기: 82 },
};
const words = new Set(['우비', '장화', '우산', '비옷', '판초', '장마', '소나기', '저축', '연필', '김치', '냉장고', '안경', '의자']);
const start = () => createGame(puzzle, words);

test('도전 횟수는 다섯 번이다', () => {
  assert.equal(MAX_TRIES, 5);
});

test('시작하면 첫 단서 하나만 열려 있다', () => {
  assert.deepEqual(start().hints, [{ word: '장화', score: 96 }]);
});

test('점수표에 있는 오답은 점수를 돌려주고 도전 횟수를 쓰고 다음 단서를 연다', () => {
  const g = start();
  const r = guess(g, '소나기');
  assert.equal(r.kind, 'scored');
  assert.equal(r.score, 82);
  assert.deepEqual(g.tries, [{ word: '소나기', score: 82 }]);
  assert.deepEqual(g.hints.map((h) => h.word), ['장화', '우산']);
  assert.equal(g.done, false);
});

test('사전에는 있지만 점수표에 없는 단어는 관계없는 말로 처리하고 도전 횟수를 쓰고 다음 단서를 연다', () => {
  const g = start();
  const r = guess(g, '저축');
  assert.equal(r.kind, 'far');
  assert.deepEqual(g.tries, [{ word: '저축', score: null }]);
  assert.deepEqual(g.hints.map((h) => h.word), ['장화', '우산']);
});

test('사전에도 없는 말은 도전 횟수를 쓰지 않고 단서도 열지 않는다', () => {
  const g = start();
  assert.equal(guess(g, '판초우의').kind, 'unknown');
  assert.equal(g.tries.length, 0);
  assert.equal(g.hints.length, 1);
});

test('정답을 맞히면 끝나고 맞힌 것으로 기록하며 단서를 더 열지 않는다', () => {
  const g = start();
  guess(g, '소나기');
  const r = guess(g, '우비');
  assert.equal(r.kind, 'correct');
  assert.equal(g.done, true);
  assert.equal(g.solved, true);
  assert.deepEqual(g.tries[1], { word: '우비', score: 100 });
  assert.equal(g.hints.length, 2);
});

test('앞뒤와 사이의 공백은 무시한다', () => {
  assert.equal(guess(start(), '  우 비 ').kind, 'correct');
});

test('이미 넣은 단어와 열려 있는 단서 단어는 도전 횟수를 쓰지 않는다', () => {
  const g = start();
  guess(g, '소나기');
  guess(g, '저축');
  assert.equal(guess(g, '소나기').kind, 'duplicate');
  assert.equal(guess(g, '저축').kind, 'duplicate');
  assert.equal(guess(g, '장화').kind, 'clue');
  assert.equal(guess(g, '우산').kind, 'clue');
  assert.equal(g.tries.length, 2);
});

test('아직 열리지 않은 단서 단어를 넣으면 오답으로 채점하고 그 단어는 단서로 다시 내지 않는다', () => {
  const g = start();
  const r = guess(g, '우산');
  assert.equal(r.kind, 'scored');
  assert.equal(r.score, 97);
  assert.deepEqual(g.hints.map((h) => h.word), ['장화', '비옷']);
});

test('단서가 모두 열린 뒤에는 틀려도 더 열지 않는다', () => {
  const g = start();
  for (const w of ['소나기', '연필', '장마']) guess(g, w);
  assert.deepEqual(g.hints.map((h) => h.word), ['장화', '우산', '비옷']);
  guess(g, '판초');
  assert.equal(g.hints.length, 3);
  assert.equal(g.done, false);
});

test('빈 입력은 무시한다', () => {
  const g = start();
  assert.equal(guess(g, '   ').kind, 'empty');
  assert.equal(g.tries.length, 0);
});

test('다섯 번 틀리면 끝나고 못 맞힌 것으로 기록한다', () => {
  const g = start();
  for (const w of ['연필', '김치', '냉장고', '안경']) guess(g, w);
  assert.equal(g.done, false);
  guess(g, '의자');
  assert.equal(g.done, true);
  assert.equal(g.solved, false);
  assert.equal(guess(g, '저축').kind, 'over');
  assert.equal(g.tries.length, 5);
});

test('공유 문구에는 정답과 넣은 단어와 단서가 들어가지 않고 점수만 들어간다', () => {
  const g = start();
  guess(g, '저축');
  guess(g, '소나기');
  guess(g, '우비');
  const text = shareText(g);
  assert.match(text, /히든 워드 1번/);
  assert.match(text, /3\/5/);
  assert.match(text, /30↓ → 82 → 정답/);
  for (const w of ['우비', '소나기', '저축', '장화', '우산', '비옷']) assert.ok(!text.includes(w), `${w} 가 공유 문구에 들어갔다`);
});

test('못 맞힌 판의 공유 문구는 X/5 로 적는다', () => {
  const g = start();
  for (const w of ['연필', '김치', '냉장고', '안경', '의자']) guess(g, w);
  const text = shareText(g);
  assert.match(text, /X\/5/);
  assert.ok(!text.includes('우비'));
});
