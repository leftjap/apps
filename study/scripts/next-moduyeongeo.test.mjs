import { describe, it, expect } from 'vitest';
import { parseEpFromId, computeNextEp, buildDatedPayload, usedEpsFromRows, decideNext } from './next-moduyeongeo.mjs';

describe('parseEpFromId', () => {
  it('en-moduyeongeo-ep1-01-slug → 1', () => {
    expect(parseEpFromId('en-moduyeongeo-ep1-01-no-appetite')).toBe(1);
  });
  it('두 자리 편 번호', () => {
    expect(parseEpFromId('en-moduyeongeo-ep105-03-bottom-line')).toBe(105);
  });
  it('다른 트랙 id → null (오염 방지)', () => {
    expect(parseEpFromId('en-parks-s1e1-test-a')).toBeNull();
    expect(parseEpFromId('en-office-s1e2-how-are-things')).toBeNull();
  });
});

describe('computeNextEp', () => {
  it('아무것도 안 됨 → 1', () => {
    expect(computeNextEp([])).toBe(1);
  });
  it('1~3 시드됨 → 4', () => {
    expect(computeNextEp([1, 2, 3])).toBe(4);
  });
  it('중간 구멍 우선 채움 (1,2,4 → 3)', () => {
    expect(computeNextEp([1, 2, 4])).toBe(3);
  });
  it('순서 무관 (3,1,2 → 4)', () => {
    expect(computeNextEp([3, 1, 2])).toBe(4);
  });
  it('전부 소진 → null (Parks/Office 폴백 신호)', () => {
    expect(computeNextEp(Array.from({ length: 105 }, (_, i) => i + 1))).toBeNull();
  });
  it('비정수/중복 방어', () => {
    expect(computeNextEp([1, 1, 2, NaN, undefined, 2])).toBe(3);
  });
});

describe('usedEpsFromRows', () => {
  it('id 배열 → 고유 편 번호(다른 트랙 제외)', () => {
    const rows = [
      { id: 'en-moduyeongeo-ep2-01-a' }, { id: 'en-moduyeongeo-ep2-02-b' },
      { id: 'en-moduyeongeo-ep5-01-c' }, { id: 'en-parks-s1e1-x' },
    ];
    expect(usedEpsFromRows(rows).sort((a, b) => a - b)).toEqual([2, 5]);
  });
});

describe('decideNext — 완료-후-진행 정책', () => {
  it('아무것도 없음 → create ep1', () => {
    expect(decideNext([])).toEqual({ action: 'create', ep: 1 });
  });
  it('ep1 미완료 있음 → wait ep1 (새 편 생성 금지)', () => {
    const rows = [
      { id: 'en-moduyeongeo-ep1-01-a', completed: true },
      { id: 'en-moduyeongeo-ep1-02-b', completed: false },
    ];
    expect(decideNext(rows)).toEqual({ action: 'wait', ep: 1 });
  });
  it('ep1 전부 완료 → create ep2', () => {
    const rows = [
      { id: 'en-moduyeongeo-ep1-01-a', completed: true },
      { id: 'en-moduyeongeo-ep1-02-b', completed: true },
    ];
    expect(decideNext(rows)).toEqual({ action: 'create', ep: 2 });
  });
  it('ep1완료·ep2미완료 → wait ep2 (가장 낮은 미완료)', () => {
    const rows = [
      { id: 'en-moduyeongeo-ep1-01-a', completed: true },
      { id: 'en-moduyeongeo-ep2-01-b', completed: false },
    ];
    expect(decideNext(rows)).toEqual({ action: 'wait', ep: 2 });
  });
  it('다른 트랙(parks) 행은 무시', () => {
    const rows = [
      { id: 'en-parks-s1e1-x', completed: false },
      { id: 'en-moduyeongeo-ep1-01-a', completed: true },
    ];
    expect(decideNext(rows)).toEqual({ action: 'create', ep: 2 });
  });
  it('전 편 완료·소진 → done', () => {
    const rows = Array.from({ length: 105 }, (_, i) => ({ id: `en-moduyeongeo-ep${i + 1}-01-x`, completed: true }));
    expect(decideNext(rows)).toEqual({ action: 'done', ep: null });
  });
});

describe('buildDatedPayload', () => {
  it('date 부착 + track 유지(게이트 예외 조건)', () => {
    const ep = { lang: 'en', track: 'moduyeongeo', ep: 1, cards: [{ id: 'x' }] };
    const out = buildDatedPayload(ep, '2026-07-08');
    expect(out.date).toBe('2026-07-08');
    expect(out.track).toBe('moduyeongeo');
    expect(out.lang).toBe('en');
    expect(out.cards).toBe(ep.cards);
  });
});
