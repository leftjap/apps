import { describe, it, expect } from 'vitest';
import { withTombstone, splitTargets, verifyCounts } from './reset-en-track.mjs';

/* 영어 트랙 리셋 (2026-09-13 사용자 지시). review 는 행 삭제가 아니라 tombstone(explanation._deleted) — 2026-07-22 규약. */
describe('reset-en-track — 순수 헬퍼', () => {
  it('withTombstone: explanation 에 _deleted=true 를 합치고 나머지는 보존한다 (null 도 처리)', () => {
    expect(withTombstone({ key: 'k', drills: [] })).toEqual({ key: 'k', drills: [], _deleted: true });
    expect(withTombstone(null)).toEqual({ _deleted: true });
  });
  it('splitTargets: 해당 lang 행만 고르고 이미 tombstone 된 행은 뺀다', () => {
    const rows = [
      { id: 'en-1', lang: 'en', explanation: {} },
      { id: 'en-2', lang: 'en', explanation: { _deleted: true } },
      { id: 'ja-1', lang: 'ja', explanation: {} },
    ];
    expect(splitTargets(rows, 'en').map((r) => r.id)).toEqual(['en-1']);
  });
  it('verifyCounts: lessons·활성 review 개수를 센다', () => {
    const left = [{ id: 'l-1' }, { id: 'l-2' }];
    const leftRv = [
      { id: 'en-1', lang: 'en', explanation: {} },
      { id: 'en-2', lang: 'en', explanation: { _deleted: true } },
      { id: 'ja-1', lang: 'ja', explanation: {} },
    ];
    expect(verifyCounts(left, leftRv, 'en')).toEqual({ lessons: 2, activeReviews: 1 });
  });
  it('verifyCounts: 배열이 아니면 던진다 (확인 조회 실패를 성공으로 오인 방지)', () => {
    expect(() => verifyCounts({ message: 'error' }, [], 'en')).toThrow();
    expect(() => verifyCounts([], { message: 'error' }, 'en')).toThrow();
  });
});
