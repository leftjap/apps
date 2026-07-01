import { describe, it, expect } from 'vitest';
import { staleIncompleteIds } from './expire-stale-lessons.mjs';

describe('staleIncompleteIds — 방치된 미완료 카드 정리 (hold 데드락 방지)', () => {
  const rows = [
    { id: 'old-undone', date: '2026-06-08', completed: false }, // 23일 전, 미완료 → stale
    { id: 'old-done', date: '2026-06-08', completed: true }, // 오래됐지만 완료 → 유지
    { id: 'recent-undone', date: '2026-06-28', completed: false }, // 3일 전 → 유지
    { id: 'today-undone', date: '2026-07-01', completed: false }, // 오늘 → 유지
  ];

  it('14일+ 지난 미완료만 stale 로 반환 (기본 14일)', () => {
    expect(staleIncompleteIds(rows, '2026-07-01')).toEqual(['old-undone']);
  });

  it('완료 카드는 오래돼도 제외', () => {
    expect(staleIncompleteIds(rows, '2026-07-01')).not.toContain('old-done');
  });

  it('임계일(maxDays) 조정 가능', () => {
    // 2일 임계 → recent-undone(3일 전)도 stale
    expect(staleIncompleteIds(rows, '2026-07-01', 2)).toEqual(expect.arrayContaining(['old-undone', 'recent-undone']));
    expect(staleIncompleteIds(rows, '2026-07-01', 2)).not.toContain('today-undone');
  });

  it('빈/비배열 입력 안전', () => {
    expect(staleIncompleteIds(null, '2026-07-01')).toEqual([]);
    expect(staleIncompleteIds([], '2026-07-01')).toEqual([]);
  });
});
