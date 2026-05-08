import { describe, it, expect } from 'vitest';
import { pickCardFields, loadNewCards, loadReviewCards, loadFreeReviewCards, advanceCard } from './cardLoader.js';

function createMockDB({ todayLessons = [], reviewQueue = [] } = {}) {
  const where = (rows) => (key) => ({
    equals: (val) => ({ async toArray() { return rows.filter((r) => r[key] === val); } }),
  });
  return {
    todayLessons: { where: where(todayLessons) },
    reviewQueue: { where: where(reviewQueue) },
  };
}

describe('pickCardFields', () => {
  it('en card 의 sentence/phonetic_kr/meaning 매핑', () => {
    const out = pickCardFields({
      id: 'c1', lang: 'en', sentence: 'I could use a coffee.',
      phonetic_kr: '아이 쿠 쥬즈 어 커피', meaning: '커피 한잔 마시고 싶다.',
      reading: null, order_index: 1,
    });
    expect(out).toEqual({
      id: 'c1', sentence: 'I could use a coffee.', pron: '아이 쿠 쥬즈 어 커피',
      ko: '커피 한잔 마시고 싶다.', reading: null, lang: 'en', explanation: null,
    });
  });

  it('explanation 객체 보존 (en schema.md 형식)', () => {
    const expl = { key: 'k', situation: 's', grammar: [{ struct: 'a', body: 'b' }],
      chunks: [['x', 'y']], phonemes: [['/p/', 'pop']], mistake: 'm', similar: 's' };
    const out = pickCardFields({ id: 'x', lang: 'en', sentence: 'S', explanation: expl });
    expect(out.explanation).toBe(expl);
  });

  it('ja card 의 reading 보존', () => {
    const out = pickCardFields({
      id: 'j1', lang: 'ja', sentence: '行ってきます',
      phonetic_kr: '잇떼 키마스', meaning: '다녀오겠습니다',
      reading: 'いってきます',
    });
    expect(out.reading).toBe('いってきます');
  });

  it('null/undefined 안전', () => {
    expect(pickCardFields(null)).toBeNull();
    expect(pickCardFields({})).toEqual({
      id: undefined, sentence: '', pron: '', ko: '', reading: null, lang: null, explanation: null,
    });
  });
});

describe('loadNewCards', () => {
  it('lang/date 매칭 + completed 제외 + order_index 오름차순', async () => {
    const db = createMockDB({
      todayLessons: [
        { id: 'a', lang: 'en', date: '2026-05-08', completed: false, order_index: 2 },
        { id: 'b', lang: 'en', date: '2026-05-08', completed: false, order_index: 1 },
        { id: 'c', lang: 'en', date: '2026-05-08', completed: true,  order_index: 0 },
        { id: 'd', lang: 'en', date: '2026-05-07', completed: false, order_index: 0 },
        { id: 'e', lang: 'ja', date: '2026-05-08', completed: false, order_index: 0 },
      ],
    });
    const out = await loadNewCards(db, 'en', '2026-05-08');
    expect(out.map((r) => r.id)).toEqual(['b', 'a']);
  });

  it('인자 누락 시 빈 배열', async () => {
    expect(await loadNewCards(null, 'en', '2026-05-08')).toEqual([]);
    expect(await loadNewCards({}, '', '2026-05-08')).toEqual([]);
  });
});

describe('advanceCard', () => {
  const cards = [
    { id: 'a', sentence: 'A', phonetic_kr: 'a', meaning: 'aa' },
    { id: 'b', sentence: 'B', phonetic_kr: 'b', meaning: 'bb' },
    { id: 'c', sentence: 'C', phonetic_kr: 'c', meaning: 'cc' },
  ];

  it('1 → 2: 두 번째 카드로 전환', () => {
    const out = advanceCard(cards, 1);
    expect(out.done).toBe(false);
    expect(out.step).toBe(2);
    expect(out.sentence.sentence).toBe('B');
  });

  it('마지막 카드 (step=3, length=3) 에서 done', () => {
    expect(advanceCard(cards, 3)).toEqual({ done: true });
  });

  it('빈 배열 안전', () => {
    expect(advanceCard([], 1)).toEqual({ done: true });
    expect(advanceCard(null, 1)).toEqual({ done: true });
  });

  it('1장 카드 → 다음에 done', () => {
    expect(advanceCard([cards[0]], 1)).toEqual({ done: true });
  });
});

describe('loadReviewCards', () => {
  it('due (nextReview <= today) + nextReview 미정도 due + lang 매칭', async () => {
    const db = createMockDB({
      reviewQueue: [
        { id: 'r1', lang: 'en', nextReview: '2026-05-07' }, // due (overdue)
        { id: 'r2', lang: 'en', nextReview: '2026-05-08' }, // due (today)
        { id: 'r3', lang: 'en', nextReview: '2026-05-09' }, // not due
        { id: 'r4', lang: 'en' },                           // 미정 → due
        { id: 'r5', lang: 'ja', nextReview: '2026-05-01' }, // 다른 lang
      ],
    });
    const out = await loadReviewCards(db, 'en', '2026-05-08');
    expect(out.map((r) => r.id)).toEqual(['r4', 'r1', 'r2']);
  });
});

describe('loadFreeReviewCards', () => {
  it('reviewQueue 전체 (due 무관) + lang 매칭 + overdue 우선 + limit 적용', async () => {
    const db = createMockDB({
      reviewQueue: [
        { id: 'r1', lang: 'en', nextReview: '2026-05-07' }, // overdue
        { id: 'r2', lang: 'en', nextReview: '2026-05-08' }, // today
        { id: 'r3', lang: 'en', nextReview: '2026-05-09' }, // future (자유 복습은 포함)
        { id: 'r4', lang: 'en' },                           // 미정 → 가장 우선
        { id: 'r5', lang: 'ja', nextReview: '2026-05-01' }, // 다른 lang
      ],
    });
    const out = await loadFreeReviewCards(db, 'en', 20);
    expect(out.map((r) => r.id)).toEqual(['r4', 'r1', 'r2', 'r3']);
  });

  it('limit 적용 (상위 N장만)', async () => {
    const db = createMockDB({
      reviewQueue: [
        { id: 'r1', lang: 'en', nextReview: '2026-05-01' },
        { id: 'r2', lang: 'en', nextReview: '2026-05-02' },
        { id: 'r3', lang: 'en', nextReview: '2026-05-03' },
      ],
    });
    const out = await loadFreeReviewCards(db, 'en', 2);
    expect(out.map((r) => r.id)).toEqual(['r1', 'r2']);
  });

  it('빈 큐 / 잘못된 인자 안전', async () => {
    const db = createMockDB({ reviewQueue: [] });
    expect(await loadFreeReviewCards(db, 'en', 20)).toEqual([]);
    expect(await loadFreeReviewCards(null, 'en')).toEqual([]);
    expect(await loadFreeReviewCards(db, '')).toEqual([]);
  });
});
