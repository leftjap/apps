// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { pickCardFields, loadNewCards, loadReviewCards, loadFreeReviewCards, loadReplayCards, loadQueueFromSession, clearSessionQueue, getSessionReturnTo, advanceCard } from './cardLoader.js';

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
    /* 2026-08-28: 한 세션 = 한 날짜 묶음. 가장 오래된 미완료 날짜(2026-05-07)의 d 만 열리고,
     * b·a(2026-05-08)는 d 를 끝낸 다음 세션에서 나온다. c 는 completed, e 는 lang 다름. */
    expect(out.map((r) => r.id)).toEqual(['d']);
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

  it('③ prefix 부분완료(scene 먼저 완료) → 그룹 scene 복원 + 잔여 꼬리 — 다음 scene 직전 컷', async () => {
    // finishSession 은 세션 카드를 prefix 로 완료 마킹 → scene(선두)부터 완료되는 게 일반형.
    // 완료된 scene 을 빼고 표현 꼬리만 내보내면 다이얼로그 없는 세션이 됨 (2026-06-12 버그) → scene 재노출.
    const done = { 's1-scene': true, 's1-e1': true, 's1-e2': true, 's1-e3': true };
    const db = createMockDB({ todayLessons: [...g1(done), ...g2] });
    const out = await loadNewCards(db, 'en', '2026-06-10');
    expect(out.map((r) => r.id)).toEqual(['s1-scene', 's1-e4', 's1-e5', 's1-bottom']);
  });

  it('③-b 실측 미러: scene 만 완료 + 표현 전부 잔존 + 다음 그룹 적층 → scene 복원, 다음 그룹 혼입 금지', async () => {
    const done = { 's1-scene': true };
    const db = createMockDB({ todayLessons: [...g1(done), ...g2] });
    const out = await loadNewCards(db, 'en', '2026-06-10');
    expect(out.map((r) => r.id)).toEqual(['s1-scene', 's1-e1', 's1-e2', 's1-e3', 's1-e4', 's1-e5', 's1-bottom']);
  });

  /* 2026-08-28: '전체 반환' 폐기 — scene 이 없는 트랙(ja 콩트·코어100)은 날짜 묶음으로 자른다.
   * 안 그러면 밀린 날이 쌓여 한 세션이 무한정 커진다. */
  it('④ ja(scene 카드 없음) → 가장 오래된 날짜 묶음만', async () => {
    const ja = (id, date, oi) => ({ id, lang: 'ja', date, completed: false, order_index: oi, explanation: { key: 'k' } });
    const db = createMockDB({ todayLessons: [ja('j1', '2026-06-09', 0), ja('j2', '2026-06-09', 1), ja('j3', '2026-06-10', 0)] });
    const out = await loadNewCards(db, 'ja', '2026-06-10');
    expect(out.map((r) => r.id)).toEqual(['j1', 'j2']);
  });

  it('⑤ scene 없는 en(구 콘텐츠) → 가장 오래된 날짜 묶음만', async () => {
    const db = createMockDB({ todayLessons: [expr('e1', '2026-05-20', 0), expr('e2', '2026-05-20', 1), expr('e3', '2026-05-21', 0)] });
    const out = await loadNewCards(db, 'en', '2026-06-10');
    expect(out.map((r) => r.id)).toEqual(['e1', 'e2']);
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

describe('loadReplayCards — 완료 세션 다시 듣기 (최신 완료 그룹)', () => {
  const scene = (id, date) => ({ id, lang: 'en', date, order_index: 0, completed: true, explanation: { dialogue: [{}] } });
  const expr = (id, date, oi) => ({ id, lang: 'en', date, order_index: oi, completed: true, explanation: { key: 'k' } });

  it('가장 최근 완료 date 의 그룹만 order_index 순으로 반환', async () => {
    const db = createMockDB({ todayLessons: [
      expr('old-1', '2026-06-24', 1), scene('old-s', '2026-06-24'),
      expr('new-2', '2026-07-01', 2), scene('new-s', '2026-07-01'), expr('new-1', '2026-07-01', 1),
    ] });
    const out = await loadReplayCards(db, 'en', '2026-07-01');
    expect(out.map((c) => c.id)).toEqual(['new-s', 'new-1', 'new-2']);
  });

  it('미완료 카드는 제외 (완료분만 replay)', async () => {
    const db = createMockDB({ todayLessons: [
      scene('s', '2026-07-01'), expr('done', '2026-07-01', 1),
      { id: 'undone', lang: 'en', date: '2026-07-01', order_index: 2, completed: false, explanation: { key: 'k' } },
    ] });
    const out = await loadReplayCards(db, 'en', '2026-07-01');
    expect(out.map((c) => c.id)).toEqual(['s', 'done']);
  });

  it('완료 카드 없으면 빈 배열', async () => {
    const db = createMockDB({ todayLessons: [{ id: 'x', lang: 'en', date: '2026-07-01', order_index: 0, completed: false, explanation: { dialogue: [] } }] });
    expect(await loadReplayCards(db, 'en', '2026-07-01')).toEqual([]);
  });

  it('db/lang 누락 안전', async () => {
    expect(await loadReplayCards(null, 'en')).toEqual([]);
    expect(await loadReplayCards(createMockDB(), null)).toEqual([]);
  });
});

describe('pickCardFields — pron 파생 (review_queue 동기화 갭 보완)', () => {
  it('phonetic_kr 없으면 explanation.chunks kr 이어붙임으로 파생', () => {
    const out = pickCardFields({
      id: 'c', sentence: 'My house is really close by.',
      explanation: { chunks: [['My', '마이'], ['house', '하우스'], ['is', '이즈'], ['really', '리얼리'], ['close', '클로우스'], ['by', '바이']] },
    });
    expect(out.pron).toBe('마이 하우스 이즈 리얼리 클로우스 바이');
  });

  it('phonetic_kr 있으면 그대로 (chunks 파생 안 함)', () => {
    const out = pickCardFields({ id: 'c', sentence: 'X', phonetic_kr: '직접 발음', explanation: { chunks: [['a', 'b']] } });
    expect(out.pron).toBe('직접 발음');
  });

  it('phonetic_kr·chunks 둘 다 없으면 빈 문자열', () => {
    expect(pickCardFields({ id: 'c', sentence: 'X' }).pron).toBe('');
  });
});


/* 미래 날짜 시딩 사고 (2026-08-28) — ja 코어100 17세션(100장)을 미리 넣었더니 날짜 필터가 없어
 * 신규 세션 하나에 100장이 통째로 들어갔다("1/100"). scene 그룹 컷은 scene 카드가 있을 때만
 * 동작하는데 코어100 은 scene 이 없다 → 날짜 게이트로 오늘까지만 연다. */
describe('loadNewCards — 미래 날짜 카드는 그날이 와야 열린다', () => {
  const rows = [
    { id: 'past', lang: 'ja', date: '2026-08-27', completed: false, order_index: 1 },
    { id: 'today1', lang: 'ja', date: '2026-08-28', completed: false, order_index: 1 },
    { id: 'today2', lang: 'ja', date: '2026-08-28', completed: false, order_index: 2 },
    { id: 'tomorrow', lang: 'ja', date: '2026-08-29', completed: false, order_index: 1 },
    { id: 'later', lang: 'ja', date: '2026-09-13', completed: false, order_index: 1 },
  ];

  it('오늘까지의 카드만 연다 (내일·다음달 카드 제외)', async () => {
    const db = createMockDB({ todayLessons: rows });
    const out = await loadNewCards(db, 'ja', '2026-08-28');
    // 날짜 컷까지 걸려 가장 오래된 날짜(08-27)만. 미래 카드가 안 섞이는 게 이 테스트의 요지.
    expect(out.map((r) => r.id)).toEqual(['past']);
  });

  it('앞 날짜를 끝내면 그다음 날짜가 열린다', async () => {
    const db = createMockDB({ todayLessons: rows });
    const out = await loadNewCards(db, 'ja', '2026-08-29');
    expect(out.map((r) => r.id)).toEqual(['past']);
  });

  it('carry-forward 유지 — 지난 날짜 미완료는 계속 나온다', async () => {
    const db = createMockDB({ todayLessons: rows });
    const out = await loadNewCards(db, 'ja', '2026-09-13');
    expect(out.map((r) => r.id)).toEqual(['past']);
  });

  it('date 없는 행은 막지 않는다 (구 데이터 보호)', async () => {
    const db = createMockDB({ todayLessons: [{ id: 'nodate', lang: 'ja', completed: false, order_index: 1 }] });
    const out = await loadNewCards(db, 'ja', '2026-08-28');
    expect(out.map((r) => r.id)).toEqual(['nodate']);
  });

  it('todayISO 미지정이면 날짜로 막지 않는다 (호출부 회귀 방지)', async () => {
    const db = createMockDB({ todayLessons: rows });
    const out = await loadNewCards(db, 'ja');
    expect(out.map((r) => r.id)).toEqual(['past']); // 날짜 컷은 여전히 적용
  });
});


/* 세션 크기 상한 (2026-08-28) — 날짜 게이트만으로는 밀린 날이 쌓이면 다시 한 세션에 수십 장이
 * 들어간다(미리 시딩한 17세션 기준 방치 시 100장). 시드 한 묶음 = 하루치이므로
 * '가장 오래된 미완료 날짜' 하나만 연다. 나머지는 다음 세션에서 이어서 나온다. */
describe('loadNewCards — 1세션 = 1날짜 묶음', () => {
  const rows = [
    { id: 'd1a', lang: 'ja', date: '2026-08-28', completed: false, order_index: 1 },
    { id: 'd1b', lang: 'ja', date: '2026-08-28', completed: false, order_index: 2 },
    { id: 'd2a', lang: 'ja', date: '2026-08-29', completed: false, order_index: 1 },
    { id: 'd3a', lang: 'ja', date: '2026-08-30', completed: false, order_index: 1 },
  ];

  it('여러 날짜가 밀려 있어도 가장 오래된 날짜 하나만 연다', async () => {
    const db = createMockDB({ todayLessons: rows });
    const out = await loadNewCards(db, 'ja', '2026-08-30');
    expect(out.map((r) => r.id)).toEqual(['d1a', 'd1b']);
  });

  it('그 날짜를 끝내면 다음 날짜가 열린다', async () => {
    const db = createMockDB({
      todayLessons: rows.map((r) => (r.date === '2026-08-28' ? { ...r, completed: true } : r)),
    });
    const out = await loadNewCards(db, 'ja', '2026-08-30');
    expect(out.map((r) => r.id)).toEqual(['d2a']);
  });

  it('date 없는 행끼리는 한 묶음으로 (구 데이터 보호)', async () => {
    const db = createMockDB({
      todayLessons: [
        { id: 'n1', lang: 'ja', completed: false, order_index: 1 },
        { id: 'n2', lang: 'ja', completed: false, order_index: 2 },
      ],
    });
    const out = await loadNewCards(db, 'ja', '2026-08-30');
    expect(out.map((r) => r.id)).toEqual(['n1', 'n2']);
  });
});


/* 완료 시 다음 묶음 당김 (2026-09-03) — 코어100 을 날짜를 붙여 일괄 적재하면 오늘 묶음을 끝낸 뒤
 * 다음 묶음은 내일에야 열렸다. 폐기한 전진 데몬이 하던 "끝내면 다음"을 로더가 맡는다:
 * 오늘까지의 미완료가 하나도 없을 때만 다음 날짜 묶음 하나를 당겨 연다. 날짜 컷은 그대로다. */
describe('loadNewCards — 오늘까지의 묶음을 다 끝내면 다음 날짜 묶음 하나를 당겨 연다', () => {
  const rows = [
    { id: 'today1', lang: 'en', date: '2026-09-04', completed: true, order_index: 1 },
    { id: 'today2', lang: 'en', date: '2026-09-04', completed: true, order_index: 2 },
    { id: 'next1', lang: 'en', date: '2026-09-05', completed: false, order_index: 1 },
    { id: 'next2', lang: 'en', date: '2026-09-05', completed: false, order_index: 2 },
    { id: 'later', lang: 'en', date: '2026-09-06', completed: false, order_index: 1 },
  ];

  it('오늘 묶음을 전부 끝냈으면 다음 날짜 묶음만 연다 (그다음 날짜는 안 섞임)', async () => {
    const db = createMockDB({ todayLessons: rows });
    const out = await loadNewCards(db, 'en', '2026-09-04');
    expect(out.map((r) => r.id)).toEqual(['next1', 'next2']);
  });

  it('오늘까지의 미완료가 남아 있으면 당기지 않는다', async () => {
    const left = { id: 'left', lang: 'en', date: '2026-09-03', completed: false, order_index: 1 };
    const db = createMockDB({ todayLessons: [...rows, left] });
    const out = await loadNewCards(db, 'en', '2026-09-04');
    expect(out.map((r) => r.id)).toEqual(['left']);
  });

  it('미완료가 전혀 없으면 빈 배열', async () => {
    const db = createMockDB({ todayLessons: rows.map((r) => ({ ...r, completed: true })) });
    const out = await loadNewCards(db, 'en', '2026-09-04');
    expect(out).toEqual([]);
  });
});
