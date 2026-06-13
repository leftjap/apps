/**
 * 알라딘 OpenAPI 클라이언트.
 *  - dev: Vite proxy(/api/aladin)가 ttbkey 주입 (vite.config.js). 배포(정적): 별도 프록시 필요.
 *  - 알라딘은 CORS·JSONP 미지원(실측) → 반드시 프록시 경유. 키는 서버측에만.
 *  - searchBooks(query): ItemSearch → 정규화 책 배열
 *  - lookupByIsbn(isbn13): ItemLookUp → 정규화 책 1건
 *  정규화: { isbn, title, sub, author, publisher, year, category, coverUrl }
 */

const SUPA = (import.meta.env && import.meta.env.VITE_SUPABASE_URL) || '';
// dev: vite proxy(/api/aladin)가 ttbkey 주입. prod(정적 배포): Supabase Edge Function(aladin) 경유.
const BASE = (import.meta.env && import.meta.env.DEV) ? '/api/aladin' : `${SUPA}/functions/v1/aladin`;
const COMMON = 'output=js&Version=20131101&Cover=Big';

// "한강 (지은이)", "정세랑 (지은이), 김보희 (그림)" → 대표 저자명
function cleanAuthor(a) {
  if (!a) return '';
  return a.split(',')[0].replace(/\s*\([^)]*\)\s*/g, '').trim();
}
function yearOf(pubDate) {
  const m = (pubDate || '').match(/(\d{4})/);
  return m ? Number(m[1]) : null;
}
function normalize(item) {
  if (!item) return null;
  const isbn = item.isbn13 || item.isbn || String(item.itemId || '');
  if (!isbn) return null;
  return {
    isbn,
    title: item.title || '',
    sub: (item.subInfo && item.subInfo.subTitle) || '',
    author: cleanAuthor(item.author),
    publisher: item.publisher || '',
    year: yearOf(item.pubDate),
    category: item.categoryName || '',
    coverUrl: item.cover || '',
    description: item.description || '',   // 줄거리(출판사 제공 요약). ItemSearch·ItemLookUp 공통 반환.
  };
}

async function call(path, params) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${BASE}/${path}?${qs}&${COMMON}`);
  if (!res.ok) throw new Error(`알라딘 API 응답 ${res.status} (배포 환경이면 프록시 미설정일 수 있음)`);
  const data = await res.json();
  if (data && data.errorCode) throw new Error(`알라딘 오류: ${data.errorMessage || data.errorCode}`);
  return data;
}

/** 키워드 검색 → 정규화 책 배열. */
export async function searchBooks(query, { max = 10 } = {}) {
  const q = (query || '').trim();
  if (!q) return [];
  const data = await call('ItemSearch.aspx', { Query: q, QueryType: 'Keyword', MaxResults: String(max), start: '1', SearchTarget: 'Book' });
  return (data.item || []).map(normalize).filter(Boolean);
}

/** ISBN13 상세조회 → 정규화 책 1건(없으면 null). */
export async function lookupByIsbn(isbn13) {
  if (!isbn13) return null;
  const data = await call('ItemLookUp.aspx', { ItemId: isbn13, ItemIdType: 'ISBN13' });
  return (data.item || []).map(normalize)[0] || null;
}

/** 정규화 결과 → 앱 book 형태(이미지 표지). book_ref = ISBN. */
export function toAppBook(n) {
  if (!n || !n.isbn) return null;
  return { id: n.isbn, t: n.title, sub: n.sub || '', a: n.author, p: n.publisher, y: n.year, c: n.category, coverUrl: n.coverUrl, w: 130, h: 195 };
}

export const Aladin = { searchBooks, lookupByIsbn, toAppBook };
if (typeof window !== 'undefined') window.bookAladin = Aladin;
export default Aladin;
