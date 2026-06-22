import { describe, it, expect } from 'vitest';
import { tokenizeQuery, quoteMatches, bookMatches, contentTerm, snippetParts, groupByBook } from './search-match.js';

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

describe('bookMatches — 제목/저자 AND (출판사 제외)', () => {
  const book = { t: '결', a: '홍세화', p: '한겨레출판' };
  it('저자', () => { expect(bookMatches(book, ['홍세화'])).toBe(true); });
  it('제목', () => { expect(bookMatches(book, ['결'])).toBe(true); });
  it('출판사는 매칭 안 함 — 오탐 방지', () => {
    // "인사" ⊄ 제목/저자 이지만 출판사 "스몰빅인사이트"엔 있음 → false 여야 함
    expect(bookMatches({ t: '에이펙스 스피릿', a: '양은우', p: '스몰빅인사이트' }, ['인사'])).toBe(false);
    expect(bookMatches(book, ['한겨레'])).toBe(false);
  });
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

describe('groupByBook — 책 단위 그룹화', () => {
  const bookOf = (ref) => ({ A: { id: 'A', t: '책A' }, B: { id: 'B', t: '책B' }, C: { id: 'C', t: '책C' } }[ref] || null);
  it('어구를 책별로 묶고 매치 수 desc 정렬', () => {
    const mq = [{ book_ref: 'A' }, { book_ref: 'B' }, { book_ref: 'A' }];
    const g = groupByBook(mq, [], bookOf);
    expect(g.map((x) => [x.ref, x.quotes.length])).toEqual([['A', 2], ['B', 1]]);
  });
  it('제목 일치 책은 어구 없어도 포함 + 최상단', () => {
    const mq = [{ book_ref: 'A' }];
    const g = groupByBook(mq, [{ id: 'C', t: '책C' }], bookOf);
    expect(g[0].ref).toBe('C');
    expect(g[0].titleMatched).toBe(true);
    expect(g[0].quotes.length).toBe(0);
    expect(g[1].ref).toBe('A');
  });
  it('어구 매치 + 제목 매치 동시 → titleMatched true', () => {
    const g = groupByBook([{ book_ref: 'A' }], [{ id: 'A', t: '책A' }], bookOf);
    expect(g[0].ref).toBe('A');
    expect(g[0].titleMatched).toBe(true);
    expect(g[0].quotes.length).toBe(1);
  });
});
