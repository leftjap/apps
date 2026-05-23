import { describe, it, expect } from 'vitest';
import { decide, htmlToText, constantTimeEqual, nameFor, humanIds, toContext } from './logic.js';

const CLAUDE = 'f74a3d8a-f449-4c25-82d1-509dc70a9988';
const GIO = '7bae5645-61c6-4476-9ff2-4c30a72812ff';
const SOYOUN = 'aeafd9a7-4094-4e7c-a621-188d6b2e336d';
const SETTLE = 10 * 60 * 1000;
const ago = (min) => new Date(Date.now() - min * 60 * 1000).toISOString();
const opts = (ignoreSettle = false) => ({ claudeId: CLAUDE, settleMs: SETTLE, ignoreSettle });

describe('decide — 디바운스/대댓글/중복방지', () => {
  it('정착(settle) 후 첫 댓글 → initial', () => {
    expect(decide({ updated_at: ago(20), content: '안녕' }, [], opts())).toBe('initial');
  });
  it('정착 전(수정 직후) → null (디바운스 동작)', () => {
    expect(decide({ updated_at: ago(1), content: '안녕' }, [], opts())).toBe(null);
  });
  it('버튼(ignoreSettle) → 정착 전이라도 initial', () => {
    expect(decide({ updated_at: ago(1), content: '안녕' }, [], opts(true))).toBe('initial');
  });
  it('본문 없음/빈 HTML → null', () => {
    expect(decide({ updated_at: ago(20), content: '' }, [], opts())).toBe(null);
    expect(decide({ updated_at: ago(20), content: '<p></p>' }, [], opts())).toBe(null);
  });
  it('클로드 댓글 有 + 마지막이 사람 → reply', () => {
    const comments = [{ author_id: CLAUDE }, { author_id: GIO }];
    expect(decide({ updated_at: ago(1), content: 'x' }, comments, opts())).toBe('reply');
  });
  it('클로드 댓글 有 + 마지막이 클로드 → null (중복 방지)', () => {
    const comments = [{ author_id: GIO }, { author_id: CLAUDE }];
    expect(decide({ updated_at: ago(1), content: 'x' }, comments, opts())).toBe(null);
  });
});

describe('htmlToText', () => {
  it('태그 제거 + 엔티티 디코드', () => {
    expect(htmlToText('<p>안녕 &amp; <b>반가워</b></p>')).toBe('안녕 & 반가워');
  });
  it('br → 줄바꿈', () => {
    expect(htmlToText('a<br>b')).toBe('a\nb');
  });
});

describe('constantTimeEqual — 토큰 비교', () => {
  it('같은 문자열 true', () => expect(constantTimeEqual('s3cr3t', 's3cr3t')).toBe(true));
  it('다른 문자열 false', () => expect(constantTimeEqual('s3cr3t', 's3cr3x')).toBe(false));
  it('길이 다름 false', () => expect(constantTimeEqual('abc', 'ab')).toBe(false));
  it('null/undefined false', () => {
    expect(constantTimeEqual(null, 'abc')).toBe(false);
    expect(constantTimeEqual('abc', undefined)).toBe(false);
  });
});

describe('nameFor / humanIds', () => {
  it('claudeId→클로드, 지오/소연 매핑, 미상→알수없음', () => {
    expect(nameFor(CLAUDE, CLAUDE)).toBe('클로드');
    expect(nameFor(GIO, CLAUDE)).toBe('지오');
    expect(nameFor(SOYOUN, CLAUDE)).toBe('소연');
    expect(nameFor('xxx', CLAUDE)).toBe('알수없음');
  });
  it('humanIds 는 클로드 제외', () => {
    expect(humanIds(CLAUDE)).not.toContain(CLAUDE);
    expect(humanIds(CLAUDE)).toContain(GIO);
  });
});

describe('toContext', () => {
  it('mode/author/content(평문)/comments 매핑', () => {
    const entry = { id: 'e1', kind: 'navi', owner_id: GIO, title: 'T', content: '<p>본문</p>', updated_at: ago(20) };
    const comments = [{ author_id: SOYOUN, body: '오', created_at: '2026-01-01' }];
    const ctx = toContext(entry, comments, 'initial', CLAUDE);
    expect(ctx).toMatchObject({ entry_id: 'e1', kind: 'navi', mode: 'initial', author: '지오', title: 'T', content: '본문' });
    expect(ctx.comments[0]).toEqual({ author: '소연', body: '오', created_at: '2026-01-01' });
  });
});
