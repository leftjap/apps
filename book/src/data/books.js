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
export const BOOKS = Object.freeze([
  { id: 1, t: '산책하는 법', sub: '걸으면서 되찾는 나에 대한 감각', a: '카를 고틀로프 셸레', p: '문항심', y: 2024, c: '인문 · 인문에세이',
    d: 'dblock', w: 130, h: 190, bg: '#3aa050', fg: '#fff',
    deco: '<svg width="48" height="62" viewBox="0 0 60 80"><path d="M18 10h24v16l-14 8 14 10v22H18v-30l14-6-14-12z" fill="#5bb8f0" opacity=".88"/><circle cx="30" cy="14" r="10" fill="#fff" opacity=".75"/></svg>' },
  { id: 2, t: '인공지능은 나의 읽기-쓰기를 어떻게 바꿀까', sub: 'AI 시대의 문해력 수업', a: '김성우', p: '유유', y: 2024, c: '인문 · 인문교양',
    d: 'dtypo', w: 127, h: 188, bg: '#1f1d1a', fg: '#f0ead9' },
  { id: 3, t: '작별하지 않는다', sub: '한강 장편소설', a: '한강', p: '문학동네', y: 2021, c: '소설 · 한국현대소설',
    d: 'dcream', w: 140, h: 210, bg: '#ece2cb', fg: '#1d1a14' },
  { id: 4, t: '시선으로부터,', sub: '정세랑 장편소설', a: '정세랑', p: '문학동네', y: 2020, c: '소설 · 한국현대소설',
    d: 'dframe', w: 140, h: 210, bg: '#d8412f', fg: '#fff' },
  { id: 5, t: '천 개의 파랑', sub: '제4회 한국과학문학상 수상작', a: '천선란', p: '허블', y: 2020, c: '소설 · SF',
    d: 'dphoto', w: 140, h: 210, bg: 'linear-gradient(155deg,#3a6e8a,#0c1830)', fg: '#fff' },
  { id: 6, t: '보통의 언어들', sub: '김이나의 단어 산문집', a: '김이나', p: '위즈덤하우스', y: 2020, c: '에세이 · 한국에세이',
    d: 'dcream', w: 130, h: 195, bg: '#f3e9d2', fg: '#28231a' },
  { id: 7, t: '우리가 빛의 속도로 갈 수 없다면', sub: '김초엽 소설집', a: '김초엽', p: '허블', y: 2019, c: '소설 · SF',
    d: 'dphoto', w: 140, h: 210, bg: 'linear-gradient(155deg,#7a4e80,#1c0a26)', fg: '#fff' },
  { id: 8, t: '몰입', sub: 'FLOW · 미하이 칙센트미하이', a: '미하이 칙센트미하이', p: '한울림', y: 2004, c: '인문 · 심리학',
    d: 'dtypo', w: 152, h: 225, bg: '#e8d9b5', fg: '#1d1a14' },
  { id: 9, t: '돈의 심리학', sub: '당신은 왜 부자가 되지 못했는가', a: '모건 하우절', p: '인플루엔셜', y: 2021, c: '경영 · 경제일반',
    d: 'dblock', w: 152, h: 225, bg: '#2a3a4d', fg: '#fff',
    deco: '<svg width="60" height="40" viewBox="0 0 74 50"><rect x="6" y="6" width="62" height="6" fill="#e8c468"/><rect x="6" y="18" width="42" height="6" fill="#e8c468" opacity=".7"/><rect x="6" y="30" width="52" height="6" fill="#e8c468" opacity=".5"/></svg>' },
  { id: 10, t: '어떤 죽음이 삶에게 말했다', sub: '의사 김범석의 단상', a: '김범석', p: '흐름출판', y: 2021, c: '에세이 · 한국에세이',
    d: 'dcream', w: 130, h: 200, bg: '#d8d2c0', fg: '#1d1a14' },
  { id: 11, t: '아무튼, 비건', sub: '아무튼 시리즈 24', a: '김한민', p: '위고', y: 2018, c: '에세이 · 한국에세이',
    d: 'dsplit', w: 115, h: 175, bg: '#fff', fg: '#1d1a14', ax: '#3a8a4f' },
  { id: 12, t: '디 에센셜: 박완서', sub: '박완서 산문선', a: '박완서', p: '문학동네', y: 2022, c: '에세이 · 한국에세이',
    d: 'dframe', w: 152, h: 225, bg: '#3a4858', fg: '#fff' },
  { id: 13, t: '잠깐 신을 만났습니다', sub: '김민철 산문집', a: '김민철', p: '한빛비즈', y: 2023, c: '에세이 · 한국에세이',
    d: 'dtypo', w: 140, h: 205, bg: '#c4b08a', fg: '#1d1a14' },
  { id: 14, t: '페스트', sub: '알베르 카뮈', a: '알베르 카뮈', p: '민음사', y: 2011, c: '소설 · 프랑스소설',
    d: 'dphoto', w: 115, h: 185, bg: 'linear-gradient(155deg,#1f3a5c,#0c1626)', fg: '#fff' },
  { id: 15, t: '트렌드 코리아 2026', sub: '서울대 소비트렌드분석센터', a: '김난도 외', p: '미래의창', y: 2025, c: '경영 · 트렌드',
    d: 'dblock', w: 152, h: 225, bg: '#c5453a', fg: '#fff',
    deco: '<svg width="48" height="48" viewBox="0 0 62 62"><polygon points="31,4 58,54 4,54" fill="#fff" opacity=".95"/><polygon points="31,16 48,48 14,48" fill="#c5453a"/></svg>' },
  { id: 16, t: '일생일문', sub: '최태성과 함께 한국사 수업', a: '최태성', p: '생각정원', y: 2023, c: '역사 · 한국사',
    d: 'dframe', w: 152, h: 225, bg: '#1d1a14', fg: '#f0ead9' },
]);

/** book_ref (문자열) 또는 numeric id 로 책 조회. */
export function bookOf(ref) {
  if (ref == null) return null;
  const s = String(ref);
  return BOOKS.find((b) => String(b.id) === s) || null;
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

export const BookData = { BOOKS, bookOf, bookRefOf, groupQuotes };

if (typeof window !== 'undefined') {
  window.bookData = BookData;
}

export default BookData;
