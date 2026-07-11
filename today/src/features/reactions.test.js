import { describe, it, expect } from 'vitest';
import {
  REACTION_EMOJIS,
  summarizeReactions,
  decideToggle,
  reactionBarHtml,
} from './reactions.js';

const ME = 'me-uuid';
const PARTNER = 'partner-uuid';

describe('summarizeReactions — 타겟 리액션 집계', () => {
  it('이모지별 카운트 + 내 반응 여부', () => {
    const rows = [
      { emoji: '👍', author_id: ME },
      { emoji: '👍', author_id: PARTNER },
      { emoji: '❤️', author_id: PARTNER },
    ];
    expect(summarizeReactions(rows, { currentUserId: ME })).toEqual([
      { emoji: '👍', count: 2, mine: true },
      { emoji: '❤️', count: 1, mine: false },
    ]);
  });

  it('카운트 0 이모지는 제외, REACTION_EMOJIS 순서로 정렬', () => {
    const rows = [
      { emoji: '😄', author_id: PARTNER },
      { emoji: '👍', author_id: ME },
    ];
    expect(summarizeReactions(rows, { currentUserId: ME }).map((s) => s.emoji)).toEqual(['👍', '😄']);
  });

  it('빈 입력 → 빈 배열', () => {
    expect(summarizeReactions([], { currentUserId: ME })).toEqual([]);
    expect(summarizeReactions(null, {})).toEqual([]);
  });
});

describe('decideToggle — 클릭 시 추가/제거 판정', () => {
  it('내 반응이 없으면 add', () => {
    const rows = [{ id: 'r1', emoji: '👍', author_id: PARTNER }];
    expect(decideToggle(rows, { currentUserId: ME, emoji: '👍' })).toEqual({ action: 'add' });
  });

  it('내 반응이 이미 있으면 remove (그 id)', () => {
    const rows = [
      { id: 'r1', emoji: '👍', author_id: PARTNER },
      { id: 'r2', emoji: '👍', author_id: ME },
    ];
    expect(decideToggle(rows, { currentUserId: ME, emoji: '👍' })).toEqual({ action: 'remove', id: 'r2' });
  });

  it('같은 사용자라도 이모지가 다르면 add', () => {
    const rows = [{ id: 'r2', emoji: '👍', author_id: ME }];
    expect(decideToggle(rows, { currentUserId: ME, emoji: '❤️' })).toEqual({ action: 'add' });
  });
});

describe('reactionBarHtml — 렌더', () => {
  it('카운트 있는 이모지는 칩으로, 내 반응은 is-mine', () => {
    const summary = [
      { emoji: '👍', count: 2, mine: true },
      { emoji: '❤️', count: 1, mine: false },
    ];
    const html = reactionBarHtml(summary, { targetType: 'comment', targetId: 'c1' });
    expect(html).toContain('data-target-type="comment"');
    expect(html).toContain('data-target-id="c1"');
    expect(html).toContain('data-emoji="👍"');
    expect(html).toMatch(/rx-chip is-mine[^>]*data-emoji="👍"/);
    expect(html).toContain('>2<');
    // picker 에 세 이모지 모두
    for (const e of REACTION_EMOJIS) expect(html).toContain(`data-emoji="${e}"`);
  });

  it('반응 0건이어도 추가 버튼(+picker)은 렌더', () => {
    const html = reactionBarHtml([], { targetType: 'entry', targetId: 'e1' });
    expect(html).toContain('rx-add');
    expect(html).toContain('data-target-type="entry"');
    // 칩 없음
    expect(html).not.toContain('rx-chip');
  });

  it('targetId 는 이스케이프', () => {
    const html = reactionBarHtml([], { targetType: 'entry', targetId: 'a"b<c' });
    expect(html).not.toContain('a"b<c');
    expect(html).toContain('a&quot;b&lt;c');
  });
});
