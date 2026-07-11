import { describe, it, expect } from 'vitest';
import { selectPendingInitial, selectPendingReplies, isBlank } from './navi-pending.mjs';

const NOW = new Date('2026-06-21T19:00:00Z').getTime();
const WINDOW = 3 * 24 * 60 * 60 * 1000;
const opts = { windowMs: WINDOW, nowMs: NOW };
const base = { is_shared: true, content: '본문', deleted_at: null };
const entry = (o) => ({ ...base, ...o });

describe('selectPendingInitial — 미답 글 선별 (회귀: 첫 시도 실패 글 영구 누락)', () => {
  it('클로드 댓글 없는 공유 글을 선별한다 (소연 06.21 버그 케이스)', () => {
    const e = entry({ id: 'a', created_at: '2026-06-21T08:45:00Z' });
    expect(selectPendingInitial([e], new Set(), opts)).toEqual(['a']);
  });

  it('클로드 댓글이 이미 있는 글은 제외', () => {
    const e = entry({ id: 'b', created_at: '2026-06-21T08:45:00Z' });
    expect(selectPendingInitial([e], new Set(['b']), opts)).toEqual([]);
  });

  it('일부러 지운(soft-deleted) 클로드 댓글이 있던 글은 부활시키지 않는다', () => {
    // 호출측이 '삭제 이력 포함' commentedIds 를 넘기므로 여기선 commented 에 포함됨 → 제외
    const e = entry({ id: 'c', created_at: '2026-06-21T08:45:00Z' });
    expect(selectPendingInitial([e], new Set(['c']), opts)).toEqual([]);
  });

  it('본문이 비면 제외 (공백/태그만)', () => {
    const e1 = entry({ id: 'd', content: '   ', created_at: '2026-06-21T08:45:00Z' });
    const e2 = entry({ id: 'e', content: '<p></p>', created_at: '2026-06-21T08:45:00Z' });
    expect(selectPendingInitial([e1, e2], new Set(), opts)).toEqual([]);
  });

  it('비공유(is_shared=false) 글은 제외', () => {
    const e = entry({ id: 'f', is_shared: false, created_at: '2026-06-21T08:45:00Z' });
    expect(selectPendingInitial([e], new Set(), opts)).toEqual([]);
  });

  it('삭제된 글(deleted_at) 은 제외', () => {
    const e = entry({ id: 'g', deleted_at: '2026-06-21T09:00:00Z', created_at: '2026-06-21T08:45:00Z' });
    expect(selectPendingInitial([e], new Set(), opts)).toEqual([]);
  });

  it('윈도(3일) 밖 오래된 글은 제외', () => {
    const e = entry({ id: 'h', created_at: '2026-06-10T00:00:00Z' });
    expect(selectPendingInitial([e], new Set(), opts)).toEqual([]);
  });

  it('여러 건은 created_at 오름차순으로 반환', () => {
    const e1 = entry({ id: 'late', created_at: '2026-06-21T10:00:00Z' });
    const e2 = entry({ id: 'early', created_at: '2026-06-21T08:00:00Z' });
    expect(selectPendingInitial([e1, e2], new Set(), opts)).toEqual(['early', 'late']);
  });
});

describe('selectPendingReplies — 대댓글 대기 선별 (경로 b: 클로드 댓글 존재 + 마지막이 사람)', () => {
  const CLAUDE = 'claude-id';
  const 지오 = 'gio-id';
  const ropts = { claudeId: CLAUDE };
  // entries 는 selectPendingInitial 과 동일 shape(공유 navi 후보), commentsByEntry 는 비삭제 댓글 Map.
  const shared = (o) => ({ is_shared: true, deleted_at: null, created_at: '2026-06-21T08:00:00Z', ...o });

  it('클로드 댓글이 있고 마지막 댓글이 사람이면 대댓글 대상 (지오 07.10 케이스)', () => {
    const e = shared({ id: 'a' });
    const cmts = new Map([['a', [
      { author_id: CLAUDE, created_at: '2026-06-21T08:48:00Z' },
      { author_id: 지오, created_at: '2026-06-21T13:08:00Z' },
    ]]]);
    expect(selectPendingReplies([e], cmts, ropts)).toEqual(['a']);
  });

  it('클로드 댓글이 아예 없으면 제외 (그건 초기 댓글 몫)', () => {
    const e = shared({ id: 'b' });
    const cmts = new Map([['b', [{ author_id: 지오, created_at: '2026-06-21T13:08:00Z' }]]]);
    expect(selectPendingReplies([e], cmts, ropts)).toEqual([]);
  });

  it('마지막 댓글이 클로드면 제외 (이미 응답함)', () => {
    const e = shared({ id: 'c' });
    const cmts = new Map([['c', [
      { author_id: 지오, created_at: '2026-06-21T13:08:00Z' },
      { author_id: CLAUDE, created_at: '2026-06-21T13:20:00Z' },
    ]]]);
    expect(selectPendingReplies([e], cmts, ropts)).toEqual([]);
  });

  it('댓글이 하나도 없으면 제외', () => {
    const e = shared({ id: 'd' });
    expect(selectPendingReplies([e], new Map(), ropts)).toEqual([]);
  });

  it('비공유/삭제 글은 방어적으로 제외', () => {
    const cmts = new Map([
      ['e', [{ author_id: CLAUDE, created_at: '2026-06-21T08:48:00Z' }, { author_id: 지오, created_at: '2026-06-21T13:08:00Z' }]],
      ['f', [{ author_id: CLAUDE, created_at: '2026-06-21T08:48:00Z' }, { author_id: 지오, created_at: '2026-06-21T13:08:00Z' }]],
    ]);
    const eUnshared = shared({ id: 'e', is_shared: false });
    const eDeleted = shared({ id: 'f', deleted_at: '2026-06-21T14:00:00Z' });
    expect(selectPendingReplies([eUnshared, eDeleted], cmts, ropts)).toEqual([]);
  });

  it('입력 순서와 무관하게 마지막(사람) 댓글 시각 오름차순 — 오래 기다린 순', () => {
    const cmts = new Map([
      ['late', [{ author_id: CLAUDE, created_at: '2026-06-21T08:00:00Z' }, { author_id: 지오, created_at: '2026-06-21T15:00:00Z' }]],
      ['early', [{ author_id: CLAUDE, created_at: '2026-06-21T08:00:00Z' }, { author_id: 지오, created_at: '2026-06-21T10:00:00Z' }]],
    ]);
    const eLate = shared({ id: 'late' });
    const eEarly = shared({ id: 'early' });
    expect(selectPendingReplies([eLate, eEarly], cmts, ropts)).toEqual(['early', 'late']);
  });
});

describe('isBlank', () => {
  it('태그만/공백/빈값은 blank', () => {
    expect(isBlank('<p></p>')).toBe(true);
    expect(isBlank('   ')).toBe(true);
    expect(isBlank(null)).toBe(true);
    expect(isBlank(undefined)).toBe(true);
  });
  it('실제 텍스트는 not blank', () => {
    expect(isBlank('안녕')).toBe(false);
    expect(isBlank('<p>hi</p>')).toBe(false);
  });
});
