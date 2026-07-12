import { describe, it, expect } from 'vitest';
import { judgeCoverage } from './coverageJudge.js';

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
