import { describe, it, expect } from 'vitest';
import { toSpeakItem, listSessions, pickHard, pickRandom, loadSpeakItems, loadSpeakSessions, SPEAK_MAX } from './speakPicks.js';

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

describe('listSessions — 세션 로그 한 건이 세션 하나, 최신순, 문장은 로그에 적힌 순서(배운 순서)', () => {
  const log = (id, date, ids, createdAt = `${date}T09:00:00Z`) => ({ id, date, lang: 'en', mode: 'new', newSentenceIds: ids, sentenceIds: ids, createdAt });
  const cards = ['a1', 'a2', 'a3', 'a4', 'b1', 'b2', 'b3', 'b4', 'c1'].map((id) => card(id));

  it('날짜 → 기록 시각 순으로 최신이 먼저, 세션 안 문장은 로그 순서 그대로', () => {
    const out = listSessions(cards, [
      log('L-a', '2026-09-05', ['a2', 'a1', 'a3', 'a4']),
      log('L-c', T, ['c1'], `${T}T08:00:00Z`),
      log('L-b', T, ['b1', 'b2', 'b3', 'b4'], `${T}T10:00:00Z`),
    ]);
    expect(out.map((s) => s.key)).toEqual(['L-b', 'L-c', 'L-a']);
    expect(out[2]).toMatchObject({ key: 'L-a', date: '2026-09-05' });
    expect(out[2].items.map((i) => i.id)).toEqual(['a2', 'a1', 'a3', 'a4']);
  });

  it('다른 로그에 문장이 모두 들어 있는 로그는 뺀다 — 중간에 끊긴 뒤 다시 한 세션. 문장이 같으면 최신 한 건만', () => {
    const out = listSessions(cards, [
      log('part', '2026-09-13', ['a1', 'a2', 'a3']),
      log('full', '2026-09-14', ['a1', 'a2', 'a3', 'a4']),
      log('again-old', '2026-09-15', ['b1', 'b2', 'b3', 'b4'], '2026-09-15T08:00:00Z'),
      log('again-new', '2026-09-15', ['b1', 'b2', 'b3', 'b4'], '2026-09-15T09:00:00Z'),
    ]);
    expect(out.map((s) => s.key)).toEqual(['again-new', 'full']);
  });

  it('삭제 표시·장면 카드는 빼고, 남은 문장이 없는 세션과 빈 로그는 목록에 없다', () => {
    const c = [card('a1', { explanation: { _deleted: true } }), card('a2'), card('b1', { explanation: { _deleted: true } }), card('b2', { explanation: { dialogue: [] } })];
    const out = listSessions(c, [log('A', '2026-09-20', ['a1', 'a2']), log('B', '2026-09-25', ['b1', 'b2']), log('E', '2026-09-26', [])]);
    expect(out.map((s) => s.key)).toEqual(['A']);
    expect(out[0].items.map((i) => i.id)).toEqual(['a2']);
  });

  it('상한 5 — 문장이 더 많은 세션은 앞의 5개', () => {
    const ids = ['a1', 'a2', 'a3', 'a4', 'b1', 'b2'];
    expect(listSessions(cards, [log('L', T, ids)])[0].items.map((i) => i.id)).toEqual(ids.slice(0, SPEAK_MAX));
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

describe('loadSpeakItems·loadSpeakSessions — Dexie 에서 매번 다시 읽는다', () => {
  const cards = [card('n1'), card('h1', { lastResult: 'X' }), card('j1', { lang: 'ja' })];
  const logs = [
    { id: 'L1', date: T, lang: 'en', mode: 'new', newSentenceIds: ['n1'], sentenceIds: ['n1'], createdAt: `${T}T09:00:00Z` },
    { id: 'L0', date: '2026-09-01', lang: 'en', mode: 'new', newSentenceIds: ['h1'], sentenceIds: ['h1'], createdAt: '2026-09-01T09:00:00Z' },
    { id: 'J1', date: T, lang: 'ja', mode: 'new', newSentenceIds: ['j1'], sentenceIds: ['j1'], createdAt: `${T}T10:00:00Z` },
  ];
  // where(필드).equals(값) 을 실제로 거르는 가짜 — 세션 목록을 날짜가 아니라 언어로 읽는지 확인한다.
  const table = (rows) => ({ where: (f) => ({ equals: (v) => ({ toArray: async () => rows.filter((r) => r[f] === v) }) }) });
  const db = { reviewQueue: table(cards), sessionLogs: table(logs) };
  it('hard / random 범위별로 고른다', async () => {
    expect((await loadSpeakItems(db, 'en', 'hard', T)).map((i) => i.id)).toEqual(['h1']);
    expect((await loadSpeakItems(db, 'en', 'random', T, () => 0))).toHaveLength(2);
  });
  it('세션 목록은 날짜와 상관없이 그 언어의 로그 전부로 만든다', async () => {
    expect((await loadSpeakSessions(db, 'en')).map((s) => s.key)).toEqual(['L1', 'L0']);
  });
  it('db 없으면 빈 배열', async () => {
    expect(await loadSpeakItems(null, 'en', 'hard', T)).toEqual([]);
    expect(await loadSpeakSessions(null, 'en')).toEqual([]);
  });
});
