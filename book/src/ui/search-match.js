/**
 * 검색 매칭·스니펫 순수 로직.
 *  - 멀티 토큰 결합: 각 토큰이 (본문/책제목/저자) 중 하나에 걸리면 충족, 전체 AND.
 *  - KWIC 스니펫: 매치어 중심 발췌(앞 before / 매치 / 뒤 after, 양끝 절단 플래그).
 */

/** 공백 분리 토큰. 빈 토큰 제거. (대소문자 비교는 매칭 함수가 처리) */
export function tokenizeQuery(raw) {
  return String(raw == null ? '' : raw).trim().split(/\s+/).filter(Boolean);
}

const lc = (s) => String(s == null ? '' : s).toLowerCase();

/** 어구 매칭 — 각 토큰이 본문 OR 책제목 OR 저자 포함, 전체 AND. book: {t,a} | null */
export function quoteMatches(quoteText, book, tokens) {
  if (!tokens || !tokens.length) return false;
  const hay = [lc(quoteText), lc(book && book.t), lc(book && book.a)];
  return tokens.every((t) => { const tl = lc(t); return hay.some((h) => h.includes(tl)); });
}

/** 책 매칭 — 각 토큰이 제목 OR 저자 포함, 전체 AND. 출판사는 제외(인사→"인사이트" 류 오탐 방지). */
export function bookMatches(book, tokens) {
  if (!tokens || !tokens.length) return false;
  const hay = [lc(book && book.t), lc(book && book.a)];
  return tokens.every((t) => { const tl = lc(t); return hay.some((h) => h.includes(tl)); });
}

/** 본문에 실제로 걸린 첫 토큰(스니펫 중심어). 본문에 없으면(저자/제목으로만 매칭) null. */
export function contentTerm(plain, tokens) {
  const pl = lc(plain);
  for (const t of (tokens || [])) { if (pl.includes(lc(t))) return t; }
  return null;
}

/**
 * 매치어 중심 스니펫. term 이 없거나 본문에 없으면 앞부분.
 * 반환: { pre, match, post, cutPre, cutPost }
 */
export function snippetParts(plain, term, { before = 40, after = 120 } = {}) {
  const text = String(plain == null ? '' : plain);
  const t = term ? String(term) : '';
  const i = t ? text.toLowerCase().indexOf(t.toLowerCase()) : -1;
  if (i < 0) {
    const end = before + after;
    return { pre: text.slice(0, end), match: '', post: '', cutPre: false, cutPost: text.length > end };
  }
  const start = Math.max(0, i - before);
  const endPost = Math.min(text.length, i + t.length + after);
  return {
    pre: text.slice(start, i),
    match: text.slice(i, i + t.length),
    post: text.slice(i + t.length, endPost),
    cutPre: start > 0,
    cutPost: endPost < text.length,
  };
}

export default { tokenizeQuery, quoteMatches, bookMatches, contentTerm, snippetParts };
