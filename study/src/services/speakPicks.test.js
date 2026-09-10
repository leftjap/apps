import { describe, it, expect } from 'vitest';
import { toSpeakItem, pickToday, pickHard, pickRandom, loadSpeakItems, SPEAK_MAX } from './speakPicks.js';

const T = '2026-09-08';
const card = (id, over = {}) => ({
  id, lang: 'en', sentence: `${id} sentence.`, meaning: `${id} 뜻`,
  explanation: { key: `${id} key = 뜻`, situation: `${id} 상황` }, promotedAt: '2026-09-01T00:00:00Z', ...over,
});

describe('toSpeakItem', () => {
  it('key 의 = 앞이 표현, 없으면 문장. 미니대화·드릴은 그대로 싣고 없으면 빈 배열', () => {
    expect(toSpeakItem(card('a'))).toEqual({ id: 'a', expr: 'a key', sentence: 'a sentence.', situation: 'a 상황', ko: 'a 뜻', miniDialogue: [], drills: [] });
    expect(toSpeakItem({ id: 'b', sentence: 'Hi.', meaning: '안녕' }).expr).toBe('Hi.');
    const md = [{ speaker: 'A', en: 'Hi?' }, { speaker: 'B', en: 'a sentence.' }];
    const dr = [{ en: 'a drill.', ko: '드릴' }];
    const it2 = toSpeakItem(card('c', { explanation: { key: 'c key = 뜻', miniDialogue: md, drills: dr } }));
    expect(it2.miniDialogue).toEqual(md);
    expect(it2.drills).toEqual(dr);
  });
});

describe('pickToday — 오늘 세션 로그의 카드, 어려웠던 순 → 신규 우선 → 나중에 배운 순, 상한 5', () => {
  const cards = ['n1', 'n2', 'n3', 'r1', 'r2', 'r3', 'r4'].map((id) => card(id));
  cards[3].resultHistory = [{ date: T, result: 'X', source: 'review' }];
  cards[4].resultHistory = [{ date: T, result: '△', source: 'review' }];
  cards[5].resultHistory = [{ date: '2026-09-01', result: 'X', source: 'review' }]; // 오늘 아님 → 가중치 없음
  cards[1].promotedAt = '2026-09-08T10:00:00Z'; cards[0].promotedAt = '2026-09-08T09:00:00Z'; cards[2].promotedAt = '2026-09-08T08:00:00Z';
  const logs = [
    { date: T, lang: 'en', mode: 'new', newSentenceIds: ['n1', 'n2', 'n3'], sentenceIds: ['n1', 'n2', 'n3'] },
    { date: T, lang: 'en', mode: 'review', newSentenceIds: [], sentenceIds: ['r1', 'r2', 'r3', 'r4'] },
    { date: '2026-09-07', lang: 'en', mode: 'new', newSentenceIds: ['old'], sentenceIds: ['old'] },
  ];
  it('7장 중 5장 — X, △, 신규 3장(나중에 배운 순)', () => {
    expect(pickToday(cards, logs, T).map((i) => i.id)).toEqual(['r1', 'r2', 'n2', 'n1', 'n3']);
  });
  it('오늘 로그가 없으면 빈 배열', () => {
    expect(pickToday(cards, [logs[2]], T)).toEqual([]);
  });
  it('soft-delete·장면 카드는 뺀다', () => {
    const c = [card('n1', { explanation: { _deleted: true } }), card('n2', { explanation: { dialogue: [] } }), card('n3')];
    expect(pickToday(c, [logs[0]], T).map((i) => i.id)).toEqual(['n3']);
  });
});

describe('pickHard — 최근 14일 안에 X 판정, 최근 실패 순', () => {
  it('resultHistory 의 X 날짜 최신순, lastResult=X(날짜 없음)는 맨 뒤, 14일 밖은 제외', () => {
    const cards = [
      card('a', { resultHistory: [{ date: '2026-09-01', result: 'X' }] }),
      card('b', { resultHistory: [{ date: '2026-09-06', result: 'X' }, { date: '2026-09-07', result: 'O' }] }),
      card('c', { lastResult: 'X' }),
      card('d', { resultHistory: [{ date: '2026-08-01', result: 'X' }] }),
      card('e', { resultHistory: [{ date: '2026-09-07', result: '△' }] }),
    ];
    expect(pickHard(cards, T).map((i) => i.id)).toEqual(['b', 'a', 'c']);
  });
});

describe('pickRandom — 상한 5, 주입한 난수로 결정적', () => {
  it('6장 → 5장, 중복 없음', () => {
    const cards = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => card(id));
    const out = pickRandom(cards, () => 0);
    expect(out).toHaveLength(SPEAK_MAX);
    expect(new Set(out.map((i) => i.id)).size).toBe(SPEAK_MAX);
  });
});

describe('loadSpeakItems — Dexie 에서 매번 다시 읽는다', () => {
  const cards = [card('n1'), card('h1', { lastResult: 'X' })];
  const logs = [{ date: T, lang: 'en', mode: 'new', newSentenceIds: ['n1'], sentenceIds: ['n1'] }];
  const db = {
    reviewQueue: { where: () => ({ equals: () => ({ toArray: async () => cards }) }) },
    sessionLogs: { where: () => ({ equals: () => ({ toArray: async () => logs }) }) },
  };
  it('today / hard / random 범위별로 고른다', async () => {
    expect((await loadSpeakItems(db, 'en', 'today', T)).map((i) => i.id)).toEqual(['n1']);
    expect((await loadSpeakItems(db, 'en', 'hard', T)).map((i) => i.id)).toEqual(['h1']);
    expect((await loadSpeakItems(db, 'en', 'random', T, () => 0))).toHaveLength(2);
  });
  it('db 없으면 빈 배열', async () => {
    expect(await loadSpeakItems(null, 'en', 'today', T)).toEqual([]);
  });
});
