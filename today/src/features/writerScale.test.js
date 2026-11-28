/**
 * writerScale.js 단위 테스트 — 그날 매수 → 도달 작가 · 다음 작가 · 남은 매수.
 */
import { describe, it, expect } from 'vitest';
import { WRITERS, SCALE_MAX, writerProgress, scaleLabel } from './writerScale.js';

describe('WRITERS — 작가 눈금', () => {
  it('여덟 명, 매수 오름차순', () => {
    expect(WRITERS.map((w) => `${w.sheets}:${w.name}`)).toEqual([
      '3:김중혁', '5:김연수', '6:헤밍웨이', '8:성석제',
      '10:이기호', '15:장강명', '20:무라카미 하루키', '25:스티븐 킹',
    ]);
    expect(SCALE_MAX).toBe(25);
  });
});

describe('writerProgress', () => {
  it('2.9매: 도달 없음, 김중혁까지 0.1매', () => {
    const p = writerProgress(2.9);
    expect(p.reached).toBeNull();
    expect(p.next.name).toBe('김중혁');
    expect(p.remaining).toBe(0.1);
  });
  it('6매: 헤밍웨이, 성석제까지 2매', () => {
    const p = writerProgress(6);
    expect(p.reached.name).toBe('헤밍웨이');
    expect(p.next.name).toBe('성석제');
    expect(p.remaining).toBe(2);
  });
  it('25매: 스티븐 킹, 다음 없음', () => {
    const p = writerProgress(25);
    expect(p.reached.name).toBe('스티븐 킹');
    expect(p.next).toBeNull();
    expect(p.remaining).toBeNull();
  });
});

describe('scaleLabel — 띠 문구의 작가 부분', () => {
  it('6.2매: 「헤밍웨이 · 성석제까지 1.8매」', () => {
    expect(scaleLabel(6.2)).toBe('헤밍웨이 · 성석제까지 1.8매');
  });
  it('3매 미만은 작가 이름 없이 「김중혁까지 ○매」', () => {
    expect(scaleLabel(0)).toBe('김중혁까지 3매');
  });
  it('25매 이상은 「스티븐 킹」만', () => {
    expect(scaleLabel(31.4)).toBe('스티븐 킹');
  });
});
