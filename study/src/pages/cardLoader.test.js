// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { pickCardFields, loadNewCards, loadReviewCards, loadFreeReviewCards, loadQueueFromSession, clearSessionQueue, getSessionReturnTo, advanceCard } from './cardLoader.js';

function createMockDB({ todayLessons = [], reviewQueue = [] } = {}) {
  const where = (rows) => (key) => ({
    equals: (val) => ({ async toArray() { return rows.filter((r) => r[key] === val); } }),
  });
  const tMap = new Map(todayLessons.map((c) => [c.id, c]));
  const rMap = new Map(reviewQueue.map((c) => [c.id, c]));
  return {
    todayLessons: { where: where(todayLessons), async bulkGet(ids) { return ids.map((id) => tMap.get(id)); } },
    reviewQueue:  { where: where(reviewQueue),  async bulkGet(ids) { return ids.map((id) => rMap.get(id)); } },
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
      ko: '커피 한잔 마시고 싶다.', reading: null, lang: 'en', explanation: null, speaker: null,
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
      id: undefined, sentence: '', pron: '', ko: '', reading: null, lang: null, explanation: null, speaker: null,
    });
  });

  it('speaker 필드 보존 (라쿤·빅맨 매핑용)', () => {
    expect(pickCardFields({ id: 'r1', sentence: 'X', speaker: '라쿤' }).speaker).toBe('라쿤');
    expect(pickCardFields({ id: 'b1', sentence: 'Y', speaker: '빅맨' }).speaker).toBe('빅맨');
  });
});

describe('loadNewCards', () => {
  it('carry-forward: lang 매칭 + completed 제외 + 오래된 date 먼저 (FIFO) + order_index', async () => {
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
    // d (2026-05-07) → b (2026-05-08, oi 1) → a (2026-05-08, oi 2). c 는 completed, e 는 lang 다름.
    expect(out.map((r) => r.id)).toEqual(['d', 'b', 'a']);
  });

  it('인자 누락 시 빈 배열', async () => {
    expect(await loadNewCards(null, 'en', '2026-05-08')).toEqual([]);
    expect(await loadNewCards({}, '', '2026-05-08')).toEqual([]);
  });
});

describe('loadNewCards — 장면 그룹 스코프 (1세션 = 1장면)', () => {
  // scene 카드 = explanation.dialogue 배열 보유 (finishSession isSceneCard 와 동일 판정)
  const scene = (id, date, completed = false) => ({
    id, lang: 'en', date, completed, order_index: 0,
    explanation: { sceneTitle: 'T', dialogue: [{ speaker: 'A', en: 'Hi.', ko: '안녕.' }] },
  });
  const expr = (id, date, oi, completed = false) => ({
    id, lang: 'en', date, completed, order_index: oi,
    explanation: { key: 'k' },
  });
  // 실 데이터 미러: s1e1 토론회 7장 (scene+표현5+bottom-line) + 6/10 위원회 6장 (scene+표현5)
  const g1 = (overrides = {}) => [
    scene('s1-scene', '2026-06-04', overrides['s1-scene']),
    expr('s1-e1', '2026-06-04', 1, overrides['s1-e1']),
    expr('s1-e2', '2026-06-04', 2, overrides['s1-e2']),
    expr('s1-e3', '2026-06-04', 3, overrides['s1-e3']),
    expr('s1-e4', '2026-06-04', 4, overrides['s1-e4']),
    expr('s1-e5', '2026-06-04', 5, overrides['s1-e5']),
    expr('s1-bottom', '2026-06-04', 6, overrides['s1-bottom']),
  ];
  const g2 = [
    scene('s2-scene', '2026-06-10'),
    expr('s2-e1', '2026-06-10', 1), expr('s2-e2', '2026-06-10', 2),
    expr('s2-e3', '2026-06-10', 3), expr('s2-e4', '2026-06-10', 4), expr('s2-e5', '2026-06-10', 5),
  ];

  it('① 2세션 적층(13장) → 첫 그룹 7장만 반환', async () => {
    const db = createMockDB({ todayLessons: [...g2, ...g1()] }); // 입력 순서 무관 (정렬 검증 겸)
    const out = await loadNewCards(db, 'en', '2026-06-10');
    expect(out.map((r) => r.id)).toEqual(['s1-scene', 's1-e1', 's1-e2', 's1-e3', 's1-e4', 's1-e5', 's1-bottom']);
  });

  it('② 부분완료(표현 5장 완료) → 첫 그룹 잔여(scene·bottom-line)만 — 다음 그룹 혼입 금지', async () => {
    const done = { 's1-e1': true, 's1-e2': true, 's1-e3': true, 's1-e4': true, 's1-e5': true };
    const db = createMockDB({ todayLessons: [...g1(done), ...g2] });
    const out = await loadNewCards(db, 'en', '2026-06-10');
    expect(out.map((r) => r.id)).toEqual(['s1-scene', 's1-bottom']);
  });

  it('③ prefix 부분완료(scene 먼저 완료) → scene 없는 잔여 꼬리만 — 다음 scene 직전 컷', async () => {
    // finishSession 은 세션 카드를 prefix 로 완료 마킹 → scene(선두)부터 완료되는 게 일반형
    const done = { 's1-scene': true, 's1-e1': true, 's1-e2': true, 's1-e3': true };
    const db = createMockDB({ todayLessons: [...g1(done), ...g2] });
    const out = await loadNewCards(db, 'en', '2026-06-10');
    expect(out.map((r) => r.id)).toEqual(['s1-e4', 's1-e5', 's1-bottom']);
  });

  it('④ ja(scene 카드 없음) → 전체 반환 (기존 동작 유지)', async () => {
    const ja = (id, date, oi) => ({ id, lang: 'ja', date, completed: false, order_index: oi, explanation: { key: 'k' } });
    const db = createMockDB({ todayLessons: [ja('j1', '2026-06-09', 0), ja('j2', '2026-06-09', 1), ja('j3', '2026-06-10', 0)] });
    const out = await loadNewCards(db, 'ja', '2026-06-10');
    expect(out.map((r) => r.id)).toEqual(['j1', 'j2', 'j3']);
  });

  it('⑤ scene 없는 en(구 콘텐츠) → 전체 반환', async () => {
    const db = createMockDB({ todayLessons: [expr('e1', '2026-05-20', 0), expr('e2', '2026-05-20', 1), expr('e3', '2026-05-21', 0)] });
    const out = await loadNewCards(db, 'en', '2026-06-10');
    expect(out.map((r) => r.id)).toEqual(['e1', 'e2', 'e3']);
  });

  it('⑥ 단일 그룹(scene 1장)만 있으면 전체 반환', async () => {
    const db = createMockDB({ todayLessons: g1() });
    const out = await loadNewCards(db, 'en', '2026-06-10');
    expect(out).toHaveLength(7);
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

describe('loadQueueFromSession', () => {
  beforeEach(() => { sessionStorage.clear(); });

  it('studyReviewQueue 미설정 시 null', async () => {
    const db = createMockDB();
    expect(await loadQueueFromSession(db, 'en')).toBeNull();
  });

  it('빈 배열 / 빈 ID 면 null', async () => {
    const db = createMockDB();
    sessionStorage.setItem('studyReviewQueue', JSON.stringify([]));
    expect(await loadQueueFromSession(db, 'en')).toBeNull();
    sessionStorage.setItem('studyReviewQueue', JSON.stringify([{}, { id: '' }]));
    expect(await loadQueueFromSession(db, 'en')).toBeNull();
  });

  it('JSON 파싱 실패 시 null', async () => {
    const db = createMockDB();
    sessionStorage.setItem('studyReviewQueue', '{not json');
    expect(await loadQueueFromSession(db, 'en')).toBeNull();
  });

  it('todayLessons + reviewQueue 양쪽 bulkGet, ID 순서 유지', async () => {
    const db = createMockDB({
      todayLessons: [{ id: 'te1', sentence: 'A' }],
      reviewQueue: [{ id: 're1', sentence: 'B' }, { id: 're2', sentence: 'C' }],
    });
    // 순서: re2, te1, re1 — todayLessons 가 먼저 (te1) 면 todayLessons 우선, 아니면 reviewQueue
    sessionStorage.setItem('studyReviewQueue', JSON.stringify([
      { id: 're2' }, { id: 'te1' }, { id: 're1' },
    ]));
    const out = await loadQueueFromSession(db, 'en');
    expect(out.map((c) => c.id)).toEqual(['re2', 'te1', 're1']);
  });

  it('매칭 실패 ID 는 제외 (filter Boolean)', async () => {
    const db = createMockDB({ reviewQueue: [{ id: 'r1', sentence: 'A' }] });
    sessionStorage.setItem('studyReviewQueue', JSON.stringify([
      { id: 'r1' }, { id: 'ghost' },
    ]));
    const out = await loadQueueFromSession(db, 'en');
    expect(out.map((c) => c.id)).toEqual(['r1']);
  });

  it('db 없으면 null (early return, sessionStorage 미접근)', async () => {
    expect(await loadQueueFromSession(null, 'en')).toBeNull();
  });
});

describe('clearSessionQueue', () => {
  beforeEach(() => { sessionStorage.clear(); });

  it('studyReviewQueue + studyReturnTo 양쪽 삭제', () => {
    sessionStorage.setItem('studyReviewQueue', '[{"id":"x"}]');
    sessionStorage.setItem('studyReturnTo', 'sentList');
    clearSessionQueue();
    expect(sessionStorage.getItem('studyReviewQueue')).toBeNull();
    expect(sessionStorage.getItem('studyReturnTo')).toBeNull();
  });

  it('빈 상태에서도 안전 (throw X)', () => {
    expect(() => clearSessionQueue()).not.toThrow();
  });
});

describe('getSessionReturnTo', () => {
  beforeEach(() => { sessionStorage.clear(); });

  it('미설정 시 home', () => {
    expect(getSessionReturnTo()).toBe('home');
  });

  it("'sentList' / 'stats' 그대로 반환, 그 외는 home", () => {
    sessionStorage.setItem('studyReturnTo', 'sentList');
    expect(getSessionReturnTo()).toBe('sentList');
    sessionStorage.setItem('studyReturnTo', 'stats');
    expect(getSessionReturnTo()).toBe('stats');
    sessionStorage.setItem('studyReturnTo', 'malicious');
    expect(getSessionReturnTo()).toBe('home');
  });
});
