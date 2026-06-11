/**
 * 하이라이트(드래그 형광펜) 순수 로직 — 시안 library3 이식 (SCREEN 02 잔여분).
 * marks: [{ s, e, c }] — 텍스트 오프셋 [s,e), c='y'|'p'|'g'|'b'. 정렬·비겹침 불변식.
 */
import { describe, it, expect } from 'vitest';
import { segmentText, applyMark, removeRange, coveredColor } from './highlight.js';

describe('segmentText — 본문을 mark 세그먼트로 분할', () => {
  it('마크 없음 → 통짜 세그먼트', () => {
    expect(segmentText('가나다', [])).toEqual([{ text: '가나다', c: null }]);
  });
  it('중간 마크 → 앞/마크/뒤 3분할', () => {
    expect(segmentText('가나다라마', [{ s: 1, e: 3, c: 'y' }])).toEqual([
      { text: '가', c: null }, { text: '나다', c: 'y' }, { text: '라마', c: null },
    ]);
  });
  it('연속 두 마크 + 경계', () => {
    expect(segmentText('abcdef', [{ s: 0, e: 2, c: 'p' }, { s: 4, e: 6, c: 'b' }])).toEqual([
      { text: 'ab', c: 'p' }, { text: 'cd', c: null }, { text: 'ef', c: 'b' },
    ]);
  });
  it('범위 초과 마크는 본문 길이로 클램프', () => {
    expect(segmentText('abc', [{ s: 1, e: 99, c: 'g' }])).toEqual([
      { text: 'a', c: null }, { text: 'bc', c: 'g' },
    ]);
  });
});

describe('applyMark — 겹침 잘라내고 삽입, 같은 색 인접 병합', () => {
  it('빈 배열에 삽입', () => {
    expect(applyMark([], { s: 2, e: 5, c: 'y' })).toEqual([{ s: 2, e: 5, c: 'y' }]);
  });
  it('다른 색 겹침 — 기존 마크 양쪽 조각 보존', () => {
    expect(applyMark([{ s: 0, e: 10, c: 'y' }], { s: 3, e: 6, c: 'p' })).toEqual([
      { s: 0, e: 3, c: 'y' }, { s: 3, e: 6, c: 'p' }, { s: 6, e: 10, c: 'y' },
    ]);
  });
  it('같은 색 인접/겹침 — 하나로 병합', () => {
    expect(applyMark([{ s: 0, e: 4, c: 'y' }], { s: 4, e: 8, c: 'y' })).toEqual([{ s: 0, e: 8, c: 'y' }]);
    expect(applyMark([{ s: 0, e: 5, c: 'y' }], { s: 3, e: 8, c: 'y' })).toEqual([{ s: 0, e: 8, c: 'y' }]);
  });
  it('역전/빈 구간 무시', () => {
    expect(applyMark([{ s: 0, e: 2, c: 'y' }], { s: 5, e: 5, c: 'p' })).toEqual([{ s: 0, e: 2, c: 'y' }]);
  });
  it('정렬 유지', () => {
    const out = applyMark([{ s: 6, e: 9, c: 'b' }], { s: 0, e: 3, c: 'g' });
    expect(out).toEqual([{ s: 0, e: 3, c: 'g' }, { s: 6, e: 9, c: 'b' }]);
  });
});

describe('coveredColor — 선택 구간이 단일 색으로 연속 커버되면 그 색', () => {
  it('완전 커버 → 색 반환', () => {
    expect(coveredColor([{ s: 0, e: 10, c: 'y' }], 2, 8)).toBe('y');
    expect(coveredColor([{ s: 0, e: 5, c: 'p' }, { s: 5, e: 10, c: 'p' }], 3, 8)).toBe('p');
  });
  it('부분 커버/혼합 색 → null', () => {
    expect(coveredColor([{ s: 0, e: 4, c: 'y' }], 2, 8)).toBe(null);
    expect(coveredColor([{ s: 0, e: 5, c: 'y' }, { s: 5, e: 10, c: 'b' }], 3, 8)).toBe(null);
    expect(coveredColor([], 0, 3)).toBe(null);
  });
});

describe('removeRange — 구간 지우기(양쪽 조각 보존)', () => {
  it('마크 중앙 제거 → 두 조각', () => {
    expect(removeRange([{ s: 0, e: 10, c: 'y' }], { s: 4, e: 6 })).toEqual([
      { s: 0, e: 4, c: 'y' }, { s: 6, e: 10, c: 'y' },
    ]);
  });
  it('전체 덮으면 삭제', () => {
    expect(removeRange([{ s: 2, e: 5, c: 'p' }], { s: 0, e: 9 })).toEqual([]);
  });
  it('무관 구간은 그대로', () => {
    expect(removeRange([{ s: 0, e: 3, c: 'g' }], { s: 5, e: 8 })).toEqual([{ s: 0, e: 3, c: 'g' }]);
  });
});
