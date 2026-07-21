import { describe, it, expect } from 'vitest';
import { sentenceScore, latestPronScoreByCard } from './stats.js';

/* 2026-07-18 사용자 보고: 캘린더 상세·문장 목록에 발음 점수/복습 난이도가 전혀 반영 안 됨.
 * 실 DB 실측(카드 80장): lastResult 전부 null, lastScore 0장 → `r2s[null] || 80` 폴백으로
 * 모든 문장이 80점(통과색)으로 굳었다. 반면 발음 점수는 pronunciationLog 에 이미 쌓여 있고
 * (330건, sentenceId 포함, 94문장분, 28~98.8 편차) reviewQueue 80장 중 63장이 매칭된다.
 * → 발음 로그를 문장별로 조인해 실제 점수를 표시한다. lastResult 는 srs.js 수정으로 이후 복습부터 채워진다. */
describe('latestPronScoreByCard — 문장별 최근 발음 점수', () => {
  it('같은 문장의 여러 로그 중 최근 날짜의 overallScore 를 고른다', () => {
    const map = latestPronScoreByCard([
      { sentenceId: 'a', date: '2026-07-01', overallScore: 60 },
      { sentenceId: 'a', date: '2026-07-16', overallScore: 88 },
      { sentenceId: 'b', date: '2026-06-02', overallScore: 41 },
    ]);
    expect(map.a).toBe(88);
    expect(map.b).toBe(41);
  });

  it('sentenceId 없는 로그·점수 없는 로그는 무시한다', () => {
    const map = latestPronScoreByCard([
      { date: '2026-07-01', overallScore: 90 },
      { sentenceId: 'c', date: '2026-07-02' },
      { sentenceId: 'd', date: '2026-07-03', overallScore: 55 },
    ]);
    expect(map.c).toBeUndefined();
    expect(map.d).toBe(55);
    expect(Object.keys(map)).toEqual(['d']);
  });

  it('빈 입력·null 안전', () => {
    expect(latestPronScoreByCard([])).toEqual({});
    expect(latestPronScoreByCard(null)).toEqual({});
  });
});

describe('sentenceScore — 표시 점수 우선순위', () => {
  it('발음 점수가 있으면 그것을 반올림해 쓴다 (실제 편차 반영)', () => {
    expect(sentenceScore({ lastResult: 'O' }, 77.4)).toBe(77);
    expect(sentenceScore({ lastResult: 'O' }, 98.8)).toBe(99);
  });

  it('발음 점수 없으면 카드 lastScore', () => {
    expect(sentenceScore({ lastScore: 82, lastResult: 'X' }, undefined)).toBe(82);
  });

  it('둘 다 없으면 자기평가(lastResult) 매핑 — O/△/X', () => {
    expect(sentenceScore({ lastResult: 'O' }, undefined)).toBe(85);
    expect(sentenceScore({ lastResult: '△' }, undefined)).toBe(65);
    expect(sentenceScore({ lastResult: 'X' }, undefined)).toBe(45);
  });

  it('아무 근거도 없으면 폴백 80 (종전 동작 유지)', () => {
    expect(sentenceScore({}, undefined)).toBe(80);
    expect(sentenceScore({ lastResult: null }, undefined)).toBe(80);
  });
});
