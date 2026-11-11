import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  seoulDateKey, dayIndex, pickDay, emojiRow, shareText,
  updateStreak, formatKoreanDate, pinScore, tier,
} from '../src/logic.js';

test('seoulDateKey: UTC 15:00 이후는 서울 기준 다음 날', () => {
  assert.equal(seoulDateKey(new Date('2026-11-11T14:59:00Z')), '2026-11-11');
  assert.equal(seoulDateKey(new Date('2026-11-11T15:00:00Z')), '2026-11-12');
});

test('dayIndex: 기준일부터 센 날짜 차이', () => {
  assert.equal(dayIndex('2026-11-12', '2026-11-12'), 0);
  assert.equal(dayIndex('2026-11-13', '2026-11-12'), 1);
  assert.equal(dayIndex('2026-12-01', '2026-11-12'), 19);
  assert.equal(dayIndex('2026-11-11', '2026-11-12'), -1);
});

test('pickDay: 날짜마다 days 를 순환하고 기준일 이전도 음수 나머지로 처리', () => {
  const days = [['a'], ['b'], ['c']];
  assert.deepEqual(pickDay(days, '2026-11-12', '2026-11-12'), ['a']);
  assert.deepEqual(pickDay(days, '2026-11-14', '2026-11-12'), ['c']);
  assert.deepEqual(pickDay(days, '2026-11-15', '2026-11-12'), ['a']);
  assert.deepEqual(pickDay(days, '2026-11-11', '2026-11-12'), ['c']);
});

const CASE = {
  suspects: [
    { key: 'a', liar: false },
    { key: 'b', liar: true, tell: { x: 0.5, y: 0.6, r: 0.06 } },
    { key: 'c', liar: false },
  ],
};

test('pinScore: 다른 사람을 지목하면 0점', () => {
  assert.equal(pinScore(CASE, { key: 'a', x: 0.5, y: 0.6 }), 0);
  assert.equal(pinScore(CASE, null), 0);
});

test('pinScore: 거짓말한 사람을 고르면 50점부터, 단서에 가까울수록 100점까지', () => {
  assert.equal(pinScore(CASE, { key: 'b', x: 0.5, y: 0.6 }), 100);
  assert.equal(pinScore(CASE, { key: 'b', x: 0.56, y: 0.6 }), 100); // 반경 안
  assert.equal(pinScore(CASE, { key: 'b', x: 0.5, y: 0.1 }), 50); // 아주 먼 곳
  // 반경(0.06)과 0점 거리(0.30)의 한가운데(0.18)면 75점
  assert.equal(pinScore(CASE, { key: 'b', x: 0.5, y: 0.78 }), 75);
});

test('tier 와 emojiRow: 80점 이상 초록, 40점 이상 노랑, 그 아래 빨강', () => {
  assert.equal(tier(100), 'good');
  assert.equal(tier(80), 'good');
  assert.equal(tier(79), 'mid');
  assert.equal(tier(50), 'mid');
  assert.equal(tier(0), 'bad');
  assert.equal(emojiRow([100, 62, 0]), '🟢🟡🔴');
});

test('shareText: 날짜, 동그라미, 총점', () => {
  assert.equal(
    shareText('2026-11-12', [94, 62, 0, 100, 81]),
    '라이투미 · 11월 12일\n🟢🟡🔴🟢🟢 337/500',
  );
});

test('formatKoreanDate', () => {
  assert.equal(formatKoreanDate('2026-01-05'), '1월 5일');
});

test('updateStreak: 어제 했으면 이어지고, 하루 이상 비면 1로, 같은 날 두 번은 그대로', () => {
  const empty = updateStreak(null, '2026-11-12');
  assert.deepEqual(empty, { lastDate: '2026-11-12', streak: 1, best: 1 });
  const next = updateStreak(empty, '2026-11-13');
  assert.deepEqual(next, { lastDate: '2026-11-13', streak: 2, best: 2 });
  assert.deepEqual(updateStreak(next, '2026-11-13'), next);
  assert.deepEqual(updateStreak(next, '2026-11-15'), { lastDate: '2026-11-15', streak: 1, best: 2 });
  assert.deepEqual(
    updateStreak({ lastDate: '2026-11-30', streak: 4, best: 6 }, '2026-12-01'),
    { lastDate: '2026-12-01', streak: 5, best: 6 },
  );
});
