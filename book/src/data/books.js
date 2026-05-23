import { LIBRARY } from './library.js';
/**
 * 책 카탈로그 = 클라이언트 상수 (D1=b). DB 에 책 메타 없음 — 어구록/댓글만 DB.
 *
 * v14 design-ref/data.jsx 의 BOOKS(16) 그대로 이식.
 *  - w/h: 실제 책 mm 치수 (표지 상대 크기 렌더). 보존 필수.
 *  - d: 표지 디자인 종류 (dblock/dtypo/dcream/dframe/dphoto/dsplit) — ui/cover.js 분기.
 *  - bg/fg/ax: 배경/전경/액센트 색.
 *  - deco: dblock 장식 SVG (JSX → 문자열, cover.js 가 innerHTML 주입).
 *
 * book_ref (quotes 외래 참조) = String(book.id). 어구록은 book_ref 로 책에 연결.
 */
export const BOOKS = Object.freeze(LIBRARY);

// 등록 책(알라딘) 런타임 레지스트리 — bookOf 동기 조회용. 부팅 시 Dexie books 에서 로드.
const REGISTRY = new Map();
export function registerBookInMemory(b) { if (b && b.id != null) REGISTRY.set(String(b.id), b); }
export function loadBooksIntoRegistry(list) { for (const b of (list || [])) registerBookInMemory(b); }

/** book_ref (문자열/numeric id, 또는 등록책 ISBN) 로 책 조회. 상수 16권 → 등록 레지스트리 순. */
export function bookOf(ref) {
  if (ref == null) return null;
  const s = String(ref);
  return BOOKS.find((b) => String(b.id) === s) || REGISTRY.get(s) || null;
}

/** 책의 book_ref 문자열. */
export function bookRefOf(book) {
  return book ? String(book.id) : '';
}

/**
 * 연속 어구록을 (who, book_ref) 로 그룹핑 (v14 groupQuotes 의미 보존).
 * 입력 quote 는 who('me'|'y') + book_ref 필드를 가져야 함 (feed.js 가 주입).
 * 반환: [{ who, book_ref, q: [quotes...] }, ...]
 */
export function groupQuotes(list) {
  const groups = [];
  let cur = null;
  for (const q of list) {
    const ref = q.book_ref != null ? String(q.book_ref) : '';
    if (cur && cur.who === q.who && cur.book_ref === ref) {
      cur.q.push(q);
      continue;
    }
    cur = { who: q.who, book_ref: ref, q: [q] };
    groups.push(cur);
  }
  return groups;
}

export const BookData = { BOOKS, bookOf, bookRefOf, groupQuotes, registerBookInMemory, loadBooksIntoRegistry };

if (typeof window !== 'undefined') {
  window.bookData = BookData;
}

export default BookData;
