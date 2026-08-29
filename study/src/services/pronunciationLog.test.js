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
describe('drillLogId / summarizeDrillLog — 드릴 발화 이력 (내용 주소 키)', () => {
  /* 키를 행 번호가 아니라 드릴 문장 자체로 (2026-08-29 재감사) — 인덱스 키는 근접중복 필터
   * (filterNearDupDrills)의 결과 순서에 묶여, 필터 로직·카드 문장이 바뀌면 이력이 엉뚱한 행에
   * 붙는다. 문장 텍스트는 재INSERT 금지 규약으로 동결돼 있어 안정적이다. 실 DB 에 구형 키 행 0건. */
  it('드릴 로그 id 는 카드 id 와 드릴 문장으로 만든다', () => {
    expect(drillLogId('en-core100-001', "It's more than a job.")).toBe("en-core100-001#drill#It's more than a job.");
    expect(drillLogId('en-core100-001', '  spaced  ')).toBe('en-core100-001#drill#spaced');
  });

  const rows = [
    { sentenceId: 'c1#drill#Thanks for coming.', date: '2026-08-20', overallScore: 80 },
    { sentenceId: 'c1#drill#Thanks for coming.', date: '2026-08-27', overallScore: 90 },
    { sentenceId: 'c1#drill#Thanks for waiting.', date: '2026-08-27', overallScore: 61 },
    { sentenceId: 'c1', date: '2026-08-27', overallScore: 95 },                    // 메인 카드
    { sentenceId: 'c2#drill#Thanks for coming.', date: '2026-08-27', overallScore: 70 }, // 다른 카드
    { sentenceId: 'c1#drill#Thanks for coming.', date: '2026-08-29', overallScore: 10 }, // 오늘 — 제외
  ];

  it('카드×문장 별로 횟수와 평균을 낸다', () => {
    const out = summarizeDrillLog(rows, ['c1'], '2026-08-29');
    expect(out.c1['Thanks for coming.']).toEqual({ count: 2, avg: 85 });
    expect(out.c1['Thanks for waiting.']).toEqual({ count: 1, avg: 61 });
  });

  it('오늘 기록은 빼고 센다 — 오늘 시도는 행의 점수 원이 이미 보여준다', () => {
    expect(summarizeDrillLog(rows, ['c1'], '2026-08-29').c1['Thanks for coming.'].count).toBe(2);
    expect(summarizeDrillLog(rows, ['c1'], '2026-08-27').c1['Thanks for coming.'].count).toBe(1);
  });

  it('메인 카드 행과 다른 카드 행은 섞이지 않는다', () => {
    const out = summarizeDrillLog(rows, ['c1'], '2026-08-29');
    expect(Object.keys(out)).toEqual(['c1']);
    expect(Object.keys(out.c1).sort()).toEqual(['Thanks for coming.', 'Thanks for waiting.']);
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
    { sentenceId: 'c1#drill#Give me a minute.', date: '2026-08-20', overallScore: 80, lang: 'en' },
    { sentenceId: 'c1#drill#Give me a minute.', date: '2026-08-27', overallScore: 90, lang: 'en' },
    { sentenceId: 'c1', date: '2026-08-27', overallScore: 95, lang: 'en' },       // 메인 카드
    { sentenceId: 'c3#drill#x', date: '2026-08-27', overallScore: 50, lang: 'en' }, // 이번 세션에 없는 카드
  ];
  const fakeDb = (r) => ({ pronunciationLog: { where: () => ({ equals: () => ({ toArray: async () => r }) }) } });

  it('카드별 드릴 이력을 { 카드id: { 행: {count,avg} } } 로 준다', async () => {
    expect(await loadDrillLog(fakeDb(rows), 'en', cards, '2026-08-29')).toEqual({ c1: { 'Give me a minute.': { count: 2, avg: 85 } } });
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

/* 감점제 1단계 (2026-08-29) — 억양 보정용 원천을 행에 남긴다. prosody_score 는 이미 sync 되고,
 * 단어 태그 요약(prosodyIssues)은 로컬 전용(동기화 매핑 밖)으로 보관 — 스키마 변화 0. */
describe('buildPronunciationLog — 프로소디 필드', () => {
  it('prosodyIssues 가 있으면 행에 담고, 없으면 null', () => {
    const issues = { monotoneWords: ['sorry'], unexpectedBreaks: [], missingBreaks: [] };
    const log = buildPronunciationLog({ result: { score: 90, prosodyScore: 84.2, prosodyIssues: issues }, sentenceId: 'x', lang: 'en', date: '2026-08-29' });
    expect(log.prosodyScore).toBe(84.2);
    expect(log.prosodyIssues).toEqual(issues);
    const bare = buildPronunciationLog({ result: { score: 90 }, sentenceId: 'x', lang: 'en', date: '2026-08-29' });
    expect(bare.prosodyIssues).toBe(null);
  });
});

/* 감점제 3단계 보정 원천 (2026-08-29 오후) — 단가 보정·실발화 검증에는 단어별 점수(wordScores)와
 * miscue 판정(omissions/insertions)이 필요한데 저장이 안 돼, 시뮬이 음소→단어 근사에 머물렀다
 * (전 세션 §5.5 한계 명시). prosodyIssues 와 같은 로컬 전용 패턴 — 스키마 변화 0. */
describe('buildPronunciationLog — 감점 보정 원천 필드 (로컬 전용)', () => {
  it('wordScores·omissions·insertions 를 행에 담고, 없으면 null', () => {
    const log = buildPronunciationLog({
      result: { score: 90, wordScores: [{ word: 'sorry', score: 88 }], omissions: [], insertions: ['again'] },
      sentenceId: 'x', lang: 'en', date: '2026-08-29',
    });
    expect(log.wordScores).toEqual([{ word: 'sorry', score: 88 }]);
    expect(log.omissions).toEqual([]);
    expect(log.insertions).toEqual(['again']);
    const bare = buildPronunciationLog({ result: { score: 90 }, sentenceId: 'x', lang: 'en', date: '2026-08-29' });
    expect(bare.wordScores).toBe(null);
    expect(bare.omissions).toBe(null);
    expect(bare.insertions).toBe(null);
  });
});
