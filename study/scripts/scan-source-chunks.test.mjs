import { describe, it, expect } from 'vitest';
import { extractBasicVerbChunks, verbCoverage, headVerbLemma } from './scan-source-chunks.mjs';

describe('extractBasicVerbChunks — 소스 라인에서 기본동사 청크 후보만 surface', () => {
  it('기본동사 + 전치사/particle 구동사', () => {
    expect(extractBasicVerbChunks("I'd go with the rows.")).toContain('go with');
    expect(extractBasicVerbChunks('Hold on a second.')).toContain('hold on');
  });

  it('기본동사 + 목적대명사 + particle (구동사 lemma 로 정규화)', () => {
    expect(extractBasicVerbChunks('Can you help me out?')).toContain('help out');
    expect(extractBasicVerbChunks("I'll call you back.")).toContain('call back');
  });

  it('기본동사 + a/the + 명사 콜로케이션', () => {
    expect(extractBasicVerbChunks("Let's take a break.")).toContain('take a break');
  });

  it('비기본동사 머리 구동사("wrap it up")는 surface 안 함', () => {
    expect(extractBasicVerbChunks('Please wrap it up now.')).toEqual([]);
  });

  it('빈/비문자 입력 안전', () => {
    expect(extractBasicVerbChunks('')).toEqual([]);
    expect(extractBasicVerbChunks(null)).toEqual([]);
    expect(extractBasicVerbChunks('What? Hello?')).toEqual([]);
  });
});

describe('headVerbLemma — 청크 머리동사를 lemma 로 정규화', () => {
  it('규칙/불규칙 머리동사', () => {
    expect(headVerbLemma('take a break')).toBe('take');
    expect(headVerbLemma('gave him a hand')).toBe('give');
    expect(headVerbLemma('call back')).toBe('call');
    expect(headVerbLemma('has a point')).toBe('have');
  });
  it('빈/누락 안전', () => {
    expect(headVerbLemma('')).toBe('');
    expect(headVerbLemma(null)).toBe('');
  });
});

describe('verbCoverage — 기존 en 시드에서 동사별 학습 이력 집계', () => {
  const seeds = [
    { cards: [
      { order_index: 0, explanation: { dialogue: [] } },                          // scene 카드 무시
      { order_index: 1, explanation: { key: 'give me a call = 전화 줘. 라이트버브.' } },
      { order_index: 2, explanation: { key: 'need to = ~해야 해요.' } },
    ] },
    { cards: [
      { order_index: 1, explanation: { key: 'gave him a hand = 도와줬다.' } },       // give lemma 합산
    ] },
  ];
  it('머리동사만 lemma 로 합산하고 scene 카드는 제외', () => {
    const cov = verbCoverage(seeds);
    expect(cov.get('give')).toBe(2);       // give me a call + gave him a hand
    expect(cov.get('need')).toBe(1);
    expect(cov.has('call')).toBe(false);   // 'call' 은 목적어 명사 — 머리동사 아님, 미집계
    expect(cov.has('be')).toBe(false);
  });
  it('한 카드는 머리동사 1회만', () => {
    const cov = verbCoverage([{ cards: [{ order_index: 1, explanation: { key: 'take a break = 쉬다.' } }] }]);
    expect(cov.get('take')).toBe(1);
  });
  it('빈/누락 안전', () => {
    expect(verbCoverage([]).size).toBe(0);
    expect(verbCoverage([{ cards: [{ order_index: 1, explanation: {} }] }]).size).toBe(0);
  });
});
