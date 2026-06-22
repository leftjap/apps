import { describe, it, expect } from 'vitest';
import { tokenizeQuery, quoteMatches, bookMatches, contentTerm, snippetParts } from './search-match.js';

describe('tokenizeQuery', () => {
  it('공백으로 분리', () => { expect(tokenizeQuery('홍세화 인사')).toEqual(['홍세화', '인사']); });
  it('연속 공백·양끝 공백 정리', () => { expect(tokenizeQuery('  a   b ')).toEqual(['a', 'b']); });
  it('빈 문자열 → 빈 배열', () => { expect(tokenizeQuery('')).toEqual([]); });
});

describe('quoteMatches — 토큰별 본문/제목/저자 AND', () => {
  const book = { t: '결 : 거칢에 대하여', a: '홍세화' };
  it('저자 토큰 + 본문 토큰 결합', () => {
    expect(quoteMatches('인사를 먼저 하는 것도 낮은 자의 표시다', book, ['홍세화', '인사'])).toBe(true);
  });
  it('한 토큰이라도 어디에도 없으면 false', () => {
    expect(quoteMatches('인사를 먼저', book, ['홍세화', '없는단어'])).toBe(false);
  });
  it('단일 토큰 본문 매칭', () => {
    expect(quoteMatches('인사를 먼저', book, ['인사'])).toBe(true);
  });
  it('책 없음(null)이면 본문으로만', () => {
    expect(quoteMatches('홍세화 인사', null, ['홍세화', '인사'])).toBe(true);
    expect(quoteMatches('인사', null, ['홍세화', '인사'])).toBe(false);
  });
});

describe('bookMatches — 제목/저자/출판사 AND', () => {
  const book = { t: '결', a: '홍세화', p: '한겨레출판' };
  it('저자만', () => { expect(bookMatches(book, ['홍세화'])).toBe(true); });
  it('저자+출판사', () => { expect(bookMatches(book, ['홍세화', '한겨레'])).toBe(true); });
  it('없는 토큰', () => { expect(bookMatches(book, ['없음'])).toBe(false); });
});

describe('contentTerm — 본문에 걸린 첫 토큰', () => {
  it('본문 토큰 반환', () => { expect(contentTerm('오늘 인사를 했다', ['홍세화', '인사'])).toBe('인사'); });
  it('본문에 없으면 null(저자/제목으로만 매칭)', () => { expect(contentTerm('오늘 인사를 했다', ['홍세화'])).toBe(null); });
});

describe('snippetParts — 매치어 중심 발췌', () => {
  it('중간 매치 → 앞뒤 절단', () => {
    const plain = 'a'.repeat(100) + '인사' + 'b'.repeat(200);
    const s = snippetParts(plain, '인사', { before: 40, after: 120 });
    expect(s.match).toBe('인사');
    expect(s.pre.length).toBe(40);
    expect(s.post.length).toBe(120);
    expect(s.cutPre).toBe(true);
    expect(s.cutPost).toBe(true);
  });
  it('시작 부근 매치 → cutPre false', () => {
    const s = snippetParts('인사를 먼저 하는 것', '인사', { before: 40, after: 120 });
    expect(s.cutPre).toBe(false);
    expect(s.match).toBe('인사');
  });
  it('매치 없음 → 앞부분', () => {
    const s = snippetParts('가나다라마바사', '없음', { before: 3, after: 2 });
    expect(s.match).toBe('');
    expect(s.pre).toBe('가나다라마');
    expect(s.cutPost).toBe(true);
  });
});
