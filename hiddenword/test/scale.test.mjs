import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toDisplay } from '../probe/scale.mjs';

// 채점 기준표의 점수(관계의 종류별 구간)를 화면에 보이는 유사도 눈금으로 바꾼다.
// 아주 가까운 말(기준표 70점 이상)이 95점 이상으로 나와야 첫 단서로 쓸 수 있다.
test('아주 가까운 말은 95점 이상이 된다', () => {
  assert.equal(toDisplay(70), 95);
  assert.equal(toDisplay(82), 97);
  assert.ok(toDisplay(92) >= 98);
});

test('함께 쓰이는 말은 80점대가 된다', () => {
  assert.equal(toDisplay(50), 80);
  assert.equal(toDisplay(52), 82);
  assert.ok(toDisplay(69) < 95);
});

test('관계없는 말은 낮게 남는다', () => {
  assert.equal(toDisplay(0), 0);
  assert.ok(toDisplay(5) <= 15);
});

test('100점은 정답에만 쓰므로 가장 높아도 99점이다', () => {
  assert.equal(toDisplay(99), 99);
  assert.equal(toDisplay(100), 99);
});

test('기준표 점수가 높으면 눈금 점수도 낮아지지 않는다', () => {
  for (let s = 1; s <= 100; s++) assert.ok(toDisplay(s) >= toDisplay(s - 1), `${s}`);
});
