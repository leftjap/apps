import { describe, it, expect } from 'vitest';
import { judgeCoverage, judgeProduction } from './coverageJudge.js';

describe('judgeCoverage — 전사 vs 기대문 커버리지 (체이닝 통과 판정, 엔진 무관)', () => {
  it('완전 일치 → pass, missing 없음, coverage 1', () => {
    const r = judgeCoverage('I got it', 'I got it');
    expect(r.pass).toBe(true);
    expect(r.missing).toEqual([]);
    expect(r.extra).toEqual([]);
    expect(r.coverage).toBe(1);
  });

  it('단어 누락 → pass false, missing 에 해당 단어', () => {
    const r = judgeCoverage('I got', 'I got it');
    expect(r.pass).toBe(false);
    expect(r.missing).toEqual(['it']);
  });

  it('덧붙인 말(insertion)은 허용 → pass true, extra 에 실림', () => {
    const r = judgeCoverage('I got it man', 'I got it');
    expect(r.pass).toBe(true);
    expect(r.extra).toEqual(['man']);
    expect(r.missing).toEqual([]);
  });

  it('축약형 동치 처리 (양방향)', () => {
    expect(judgeCoverage("it's", 'it is').pass).toBe(true);
    expect(judgeCoverage('it is', "it's").pass).toBe(true);
    expect(judgeCoverage("I'm going", 'I am going').pass).toBe(true);
  });

  it('대소문자·구두점 무시', () => {
    const r = judgeCoverage('I GOT IT.', 'i got it');
    expect(r.pass).toBe(true);
  });

  it('다른 단어로 오인(got→hate)은 누락+추가로 잡힘 → pass false', () => {
    const r = judgeCoverage('I hate it', 'I got it');
    expect(r.pass).toBe(false);
    expect(r.missing).toEqual(['got']);
    expect(r.extra).toEqual(['hate']);
  });

  it('빈 전사 → 전부 누락, pass false', () => {
    const r = judgeCoverage('', 'I got it');
    expect(r.pass).toBe(false);
    expect(r.missing).toEqual(['i', 'got', 'it']);
    expect(r.coverage).toBe(0);
  });

  it('Azure 실패 재현 케이스: 끝 잘린 전사 → 남은 단어 누락으로 잡힘', () => {
    // 실측: "I was thinking about going to the" (beach this weekend 잘림)
    const r = judgeCoverage(
      'I was thinking about going to the',
      'I was thinking about going to the beach this weekend',
    );
    expect(r.pass).toBe(false);
    expect(r.missing).toEqual(['beach', 'this', 'weekend']);
  });

  it('기대문이 비면 pass false (판정 대상 없음)', () => {
    expect(judgeCoverage('anything', '').pass).toBe(false);
  });

  // 2026-07-12 실DB 실측: Azure Display 는 아포스트로피를 생략한다 ("Lets keep in touch.",
  // "I cant believe its been a year."). 기대문은 축약형(Let's) → 불일치 → 완주해도 false fail.
  it('Azure 아포스트로피 생략 전사 ↔ 축약형 기대문 동치 (실DB 재현)', () => {
    expect(judgeCoverage('Lets keep in touch.', "Let's keep in touch").pass).toBe(true);
    expect(judgeCoverage('I cant believe its been a year.', "I can't believe it's been a year").pass).toBe(true);
  });

  it('아포스트로피 생략 전사 ↔ 펼친 기대문 동치', () => {
    expect(judgeCoverage('dont do it', 'do not do it').pass).toBe(true);
    expect(judgeCoverage('lets go', 'let us go').pass).toBe(true);
  });
});

/* judgeProduction (2026-07-23) — 생산 연습 통과 3중 기준: 커버리지 + 문장 정확도 + 단어 하한.
 * 실측(합성음성 → Azure PA, 2026-07-23): 정확 발화는 단어 최저 91, 엉뚱 단어는 0~21 —
 * 단어 하한 40 이 "일부 단어만 엉뚱한데 문장 평균은 65+" 인 취약 창을 봉쇄한다. */
describe('judgeProduction — 커버리지 + 문장 정확도 + 단어 하한', () => {
  const EXP = "It'll just take a minute.";

  it('완전 엉뚱 발화 (실측: score 5, 누락 3) → fail', () => {
    const r = judgeProduction({
      score: 5, recognizedText: 'Just a take.',
      wordScores: [{ word: "It'll", score: 0 }, { word: 'just', score: 21 }, { word: 'a', score: 82 }, { word: 'take', score: 2 }, { word: 'a', score: 0 }, { word: 'minute', score: 0 }],
    }, EXP);
    expect(r.pass).toBe(false);
    expect(r.missing.length).toBeGreaterThan(0);
  });

  it('정확 발화 (실측: score 96, 단어 최저 91) → pass', () => {
    const r = judgeProduction({
      score: 96, recognizedText: "I'll be there in a minute.",
      wordScores: [{ word: "i'll", score: 91 }, { word: 'be', score: 100 }, { word: 'there', score: 97 }, { word: 'in', score: 100 }, { word: 'a', score: 100 }, { word: 'minute', score: 91 }],
    }, "I'll be there in a minute.");
    expect(r.pass).toBe(true);
    expect(r.badWords).toEqual([]);
  });

  it('취약 창: 커버리지 통과 + 문장 79점인데 한 단어가 10점 → 단어 하한이 차단', () => {
    const r = judgeProduction({
      score: 79, recognizedText: EXP,
      wordScores: [{ word: "it'll", score: 95 }, { word: 'just', score: 92 }, { word: 'take', score: 10 }, { word: 'a', score: 96 }, { word: 'minute', score: 94 }],
    }, EXP);
    expect(r.pass).toBe(false);
    expect(r.badWords).toEqual(['take']);
  });

  it('wordScores 없는 응답(하위호환)·문장 80 + 커버리지 통과 → pass', () => {
    const r = judgeProduction({ score: 80, recognizedText: EXP }, EXP);
    expect(r.pass).toBe(true);
  });

  it('문장 정확도 하한(기본 65) 미달 → fail', () => {
    const r = judgeProduction({ score: 40, recognizedText: EXP }, EXP);
    expect(r.pass).toBe(false);
    expect(r.accuracy).toBe(40);
  });
});
