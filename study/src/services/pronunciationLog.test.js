import { describe, it, expect } from 'vitest';
import { buildPronunciationLog, drillLogId, summarizeDrillLog, loadDrillLog } from './pronunciationLog.js';

describe('buildPronunciationLog', () => {
  const baseResult = {
    score: 88,
    phonemeScores: [{ symbol: 'k', word: 'coffee', score: 95 }, { symbol: 'ɛ', word: 'use', score: 55 }],
    weakPhonemes: ['ɛ'],
    recognizedText: 'I could use a coffee',
  };

  it('정상 결과 → 모든 필드 매핑', () => {
    const log = buildPronunciationLog({ result: baseResult, sentenceId: 'card_1', lang: 'en', date: '2026-05-08' });
    expect(log).toMatchObject({
      lang: 'en', date: '2026-05-08', sentenceId: 'card_1',
      overallScore: 88,
      phonemeScores: baseResult.phonemeScores,
      weakPhonemes: ['ɛ'],
      recognizedText: 'I could use a coffee',
    });
    expect(typeof log.id).toBe('string');
    expect(log.id.length).toBeGreaterThan(0);
    expect(typeof log.createdAt).toBe('string');
  });

  it('하위점수 + 캡처레벨 저장 (진단용 — Wave A.18.1)', () => {
    const result = {
      score: 92, accuracyScore: 92, pronScore: 65.4, fluencyScore: 45,
      completenessScore: 80, prosodyScore: 60, captureRms: 0.0032,
      phonemeScores: [], weakPhonemes: [],
    };
    const log = buildPronunciationLog({ result, sentenceId: 'c', lang: 'en', date: '2026-06-19' });
    expect(log).toMatchObject({
      overallScore: 92,
      pronScore: 65.4,
      fluencyScore: 45,
      completenessScore: 80,
      prosodyScore: 60,
      captureRms: 0.0032,
    });
  });

  it('하위점수 누락 → null 폴백 (회귀 보호)', () => {
    const log = buildPronunciationLog({ result: baseResult, sentenceId: 'c', lang: 'en', date: '2026-05-08' });
    expect(log.pronScore).toBeNull();
    expect(log.fluencyScore).toBeNull();
    expect(log.captureRms).toBeNull();
  });

  it('mockFallback 결과 → null (저장 스킵)', () => {
    const mock = { score: 75, mockFallback: true, fallbackReason: 'no_recorder', phonemeScores: [], weakPhonemes: [] };
    expect(buildPronunciationLog({ result: mock, sentenceId: 'x', lang: 'en', date: '2026-05-08' })).toBeNull();
  });

  it('result null → null', () => {
    expect(buildPronunciationLog({ result: null, sentenceId: 'x', lang: 'en', date: '2026-05-08' })).toBeNull();
  });

  it('phonemeScores/weakPhonemes 누락 → 빈 배열 폴백', () => {
    const log = buildPronunciationLog({ result: { score: 70 }, sentenceId: 'x', lang: 'en', date: '2026-05-08' });
    expect(log.phonemeScores).toEqual([]);
    expect(log.weakPhonemes).toEqual([]);
    expect(log.recognizedText).toBeNull();
  });

  it('sentenceId 누락 → null', () => {
    const log = buildPronunciationLog({ result: baseResult, lang: 'en', date: '2026-05-08' });
    expect(log.sentenceId).toBeNull();
  });
});

/* 응용 드릴 발화 이력 (2026-08-29 사용자 요구: "복습의 응용연습 문장에 몇 번 발화했고 보통 몇 점인지").
 * 종전엔 드릴 점수가 세션 스냅샷(exLog.drills)에만 살아 세션이 끝나면 사라졌다 — 원천 자체가 없었다.
 * 같은 pronunciationLog 에 `<카드id>#drill<i>` 로 구분해 적재한다. 기존 집계는 전부 카드 id 로
 * 조회하므로(loadSentenceLog·latestPronScoreByCard·buildSentenceRows) 이 행들은 그냥 지나친다. */
describe('drillLogId / summarizeDrillLog — 드릴 발화 이력', () => {
  it('드릴 로그 id 는 카드 id 와 행 번호로 만든다', () => {
    expect(drillLogId('en-core100-001', 0)).toBe('en-core100-001#drill0');
    expect(drillLogId('en-core100-001', 3)).toBe('en-core100-001#drill3');
  });

  const rows = [
    { sentenceId: 'c1#drill0', date: '2026-08-20', overallScore: 80 },
    { sentenceId: 'c1#drill0', date: '2026-08-27', overallScore: 90 },
    { sentenceId: 'c1#drill2', date: '2026-08-27', overallScore: 61 },
    { sentenceId: 'c1', date: '2026-08-27', overallScore: 95 },        // 메인 카드 — 드릴 아님
    { sentenceId: 'c2#drill0', date: '2026-08-27', overallScore: 70 }, // 다른 카드
    { sentenceId: 'c1#drill0', date: '2026-08-29', overallScore: 10 }, // 오늘 — 제외
  ];

  it('카드×행 별로 횟수와 평균을 낸다', () => {
    const out = summarizeDrillLog(rows, ['c1'], '2026-08-29');
    expect(out.c1[0]).toEqual({ count: 2, avg: 85 });
    expect(out.c1[2]).toEqual({ count: 1, avg: 61 });
  });

  it('오늘 기록은 빼고 센다 — 오늘 시도는 행의 점수 원이 이미 보여준다', () => {
    expect(summarizeDrillLog(rows, ['c1'], '2026-08-29').c1[0].count).toBe(2);
    expect(summarizeDrillLog(rows, ['c1'], '2026-08-27').c1[0].count).toBe(1); // 8-20 만
  });

  it('메인 카드 행과 다른 카드 행은 섞이지 않는다', () => {
    const out = summarizeDrillLog(rows, ['c1'], '2026-08-29');
    expect(Object.keys(out)).toEqual(['c1']);
    expect(Object.keys(out.c1).sort()).toEqual(['0', '2']);
  });

  it('기록이 없으면 빈 객체', () => {
    expect(summarizeDrillLog([], ['c1'], '2026-08-29')).toEqual({});
    expect(summarizeDrillLog(null, ['c1'], '2026-08-29')).toEqual({});
  });
});

/* Dexie 읽기 배선 — 순수 집계(summarizeDrillLog) 위에 얹는 얇은 층. 복습 진입 시 state.drillLog 를 채운다. */
describe('loadDrillLog', () => {
  const cards = [{ id: 'c1' }, { id: 'c2' }];
  const rows = [
    { sentenceId: 'c1#drill0', date: '2026-08-20', overallScore: 80, lang: 'en' },
    { sentenceId: 'c1#drill0', date: '2026-08-27', overallScore: 90, lang: 'en' },
    { sentenceId: 'c1', date: '2026-08-27', overallScore: 95, lang: 'en' },       // 메인 카드
    { sentenceId: 'c3#drill0', date: '2026-08-27', overallScore: 50, lang: 'en' }, // 이번 세션에 없는 카드
  ];
  const fakeDb = (r) => ({ pronunciationLog: { where: () => ({ equals: () => ({ toArray: async () => r }) }) } });

  it('카드별 드릴 이력을 { 카드id: { 행: {count,avg} } } 로 준다', async () => {
    expect(await loadDrillLog(fakeDb(rows), 'en', cards, '2026-08-29')).toEqual({ c1: { 0: { count: 2, avg: 85 } } });
  });

  it('db·카드가 없으면 빈 객체 — 화면은 이력 없이 그대로 그려진다', async () => {
    expect(await loadDrillLog(null, 'en', cards, '2026-08-29')).toEqual({});
    expect(await loadDrillLog(fakeDb(rows), 'en', [], '2026-08-29')).toEqual({});
  });

  it('읽기가 실패해도 화면을 막지 않는다', async () => {
    const broken = { pronunciationLog: { where: () => { throw new Error('boom'); } } };
    expect(await loadDrillLog(broken, 'en', cards, '2026-08-29')).toEqual({});
  });
});
