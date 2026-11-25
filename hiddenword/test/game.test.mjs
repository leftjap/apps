import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_TRIES, createGame, guess, shareText } from '../site/game.mjs';

const puzzle = {
  no: 1,
  answer: '우비',
  clue: { word: '우산', score: 82 },
  scores: { 우산: 82, 비옷: 97, 장화: 70, 연필: 3 },
};

test('도전 횟수는 다섯 번이다', () => {
  assert.equal(MAX_TRIES, 5);
});

test('목록에 있는 오답은 점수를 돌려주고 도전 횟수를 쓴다', () => {
  const g = createGame(puzzle);
  const r = guess(g, '장화');
  assert.equal(r.kind, 'scored');
  assert.equal(r.score, 70);
  assert.equal(g.tries.length, 1);
  assert.deepEqual(g.tries[0], { word: '장화', score: 70 });
  assert.equal(g.done, false);
});

test('정답을 맞히면 끝나고 맞힌 것으로 기록한다', () => {
  const g = createGame(puzzle);
  guess(g, '장화');
  const r = guess(g, '우비');
  assert.equal(r.kind, 'correct');
  assert.equal(g.done, true);
  assert.equal(g.solved, true);
  assert.equal(g.tries.length, 2);
  assert.deepEqual(g.tries[1], { word: '우비', score: 100 });
});

test('앞뒤와 사이의 공백은 무시한다', () => {
  const g = createGame(puzzle);
  assert.equal(guess(g, '  우 비 ').kind, 'correct');
});

test('목록에 없는 단어는 도전 횟수를 쓰지 않는다', () => {
  const g = createGame(puzzle);
  const r = guess(g, '판초우의');
  assert.equal(r.kind, 'unknown');
  assert.equal(g.tries.length, 0);
});

test('이미 넣은 단어와 단서 단어는 도전 횟수를 쓰지 않는다', () => {
  const g = createGame(puzzle);
  guess(g, '장화');
  assert.equal(guess(g, '장화').kind, 'duplicate');
  assert.equal(guess(g, '우산').kind, 'clue');
  assert.equal(g.tries.length, 1);
});

test('빈 입력은 무시한다', () => {
  const g = createGame(puzzle);
  assert.equal(guess(g, '   ').kind, 'empty');
  assert.equal(g.tries.length, 0);
});

test('다섯 번 틀리면 끝나고 못 맞힌 것으로 기록한다', () => {
  const p = { ...puzzle, scores: { 가: 1, 나: 2, 다: 3, 라: 4, 마: 5, 바: 6 } };
  const g = createGame(p);
  for (const w of ['가', '나', '다', '라']) guess(g, w);
  assert.equal(g.done, false);
  guess(g, '마');
  assert.equal(g.done, true);
  assert.equal(g.solved, false);
  assert.equal(guess(g, '바').kind, 'over');
  assert.equal(g.tries.length, 5);
});

test('공유 문구에는 정답과 넣은 단어가 들어가지 않고 점수만 들어간다', () => {
  const g = createGame(puzzle);
  guess(g, '장화');
  guess(g, '비옷');
  guess(g, '우비');
  const text = shareText(g);
  assert.match(text, /히든 워드 1번/);
  assert.match(text, /3\/5/);
  assert.match(text, /70 → 97 → 정답/);
  for (const w of ['우비', '장화', '비옷']) assert.ok(!text.includes(w), `${w} 가 공유 문구에 들어갔다`);
});

test('못 맞힌 판의 공유 문구는 X/5 로 적는다', () => {
  const p = { ...puzzle, scores: { 가: 1, 나: 2, 다: 3, 라: 4, 마: 5 } };
  const g = createGame(p);
  for (const w of ['가', '나', '다', '라', '마']) guess(g, w);
  const text = shareText(g);
  assert.match(text, /X\/5/);
  assert.ok(!text.includes('우비'));
});
