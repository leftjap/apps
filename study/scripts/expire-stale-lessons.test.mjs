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


/* 미래 날짜 배치 시딩 사고 (2026-08-28) — seed-supabase 가 payload.date 를 '오늘'로 넘기면
 * 앞당겨 시딩할수록 컷오프가 미래로 밀려 방금 넣은 카드까지 지운다. 기준일 선택 규칙을 못박는다.
 * (2026-09-03: seed-supabase 의 자동 방치 삭제는 폐지. 이 규칙은 수동 CLI 실행 시 기준일 선택에만 남는다.) */
describe('stale 기준일 — 미래 날짜 시딩에서 소급 삭제 방지', () => {
  const rows = [
    { id: 'seeded-today', date: '2026-08-28', completed: false },
    { id: 'seeded-tomorrow', date: '2026-08-29', completed: false },
  ];

  it('payload.date 를 그대로 기준일로 쓰면 최근 카드가 stale 로 잡힌다 (사고 재현)', () => {
    // 09-13 로 시딩 → 컷오프 08-30 → 08-28·29 가 삭제 대상이 된다
    expect(staleIncompleteIds(rows, '2026-09-13', 14)).toEqual(['seeded-today', 'seeded-tomorrow']);
  });

  it('기준일을 실제 오늘로 두면 아무것도 지우지 않는다 (수정 후 동작)', () => {
    expect(staleIncompleteIds(rows, '2026-08-28', 14)).toEqual([]);
  });
});
