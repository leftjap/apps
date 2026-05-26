// ═════════════════════════════════════════════════════════════════════════
// STATS V14 — 타이틀 위계 강화, 패널 head 일관, 분야 디자인 유지
// ═════════════════════════════════════════════════════════════════════════

const MAY_V14 = {
 2: { books: [bookOf(5)], count: 1 },
 5: { books: [bookOf(4)], count: 1 },
 6: { books: [bookOf(11)], count: 1 },
 7: { books: [bookOf(6)], count: 1 },
 8: { books: [bookOf(10)], count: 1 },
 9: { books: [bookOf(13)], count: 1 },
 10: { books: [bookOf(7)], count: 1 },
 11: { books: [bookOf(10), bookOf(1)], count: 2 },
 12: { books: [bookOf(2)], count: 1 },
 13: { books: [bookOf(6)], count: 1 },
 14: { books: [bookOf(8), bookOf(3), bookOf(9)], count: 4 },
 15: { books: [bookOf(1)], count: 3 },
 16: { books: [bookOf(12), bookOf(7)], count: 2 },
 17: { books: [bookOf(9)], count: 2 },
 18: { books: [bookOf(8)], count: 1 },
 19: { books: [bookOf(15)], count: 1 },
 20: { books: [bookOf(2), bookOf(6), bookOf(10)], count: 3 },
 21: { books: [bookOf(1)], count: 1 },
};

const TopBooksV14 = [
 { b: bookOf(9), c: 18 }, { b: bookOf(8), c: 16 }, { b: bookOf(1), c: 14 },
 { b: bookOf(3), c: 12 }, { b: bookOf(6), c: 10 }, { b: bookOf(2), c: 8 },
];

const TopAuthorsV14 = [
 { name: '모건 하우절', books: 1, quotes: 18, mainPub: '인플루엔셜' },
 { name: '미하이 칙센트미하이', books: 1, quotes: 16, mainPub: '한울림' },
 { name: '카를 고틀로프 셸레', books: 1, quotes: 14, mainPub: '문항심' },
 { name: '한강', books: 1, quotes: 12, mainPub: '문학동네' },
 { name: '김이나', books: 1, quotes: 10, mainPub: '위즈덤하우스' },
 { name: '김초엽', books: 1, quotes: 8, mainPub: '허블' },
];

const TopPubsV14 = [
 { name: '문학동네', authors: 3, books: 4, quotes: 18 },
 { name: '인플루엔셜', authors: 1, books: 2, quotes: 18 },
 { name: '허블', authors: 2, books: 2, quotes: 14 },
 { name: '위즈덤하우스', authors: 1, books: 1, quotes: 10 },
 { name: '문항심', authors: 1, books: 1, quotes: 14 },
 { name: '유유', authors: 1, books: 1, quotes: 5 },
];

const PeriodSegV14 = ({ active = '이번 달' }) => (
 <div style={{ display: 'inline-flex', background: 'var(--paper)', borderRadius: 99, padding: 3 }}>
  {['이번 달', '올해', '전체'].map(n => (
   <button key={n} style={{
    padding: '8px 16px', borderRadius: 99,
    fontSize: 13, fontWeight: n === active ? 700 : 500,
    color: n === active ? 'var(--ink-1)' : 'var(--ink-3)',
    background: n === active ? '#fff' : 'transparent',
    boxShadow: n === active ? '0 1px 2px rgba(20,18,14,.06)' : 'none',
    border: 0, cursor: 'pointer',
   }}>{n}</button>
  ))}
 </div>
);

const Card14 = ({ children, padding = '24px 26px', style }) => (
 <div style={{
  background: '#fff', borderRadius: 14, padding,
  border: '1px solid var(--line-2)',
  boxShadow: '0 1px 2px rgba(20,18,14,0.03), 0 8px 24px -10px rgba(20,18,14,0.07)',
  ...style,
 }}>{children}</div>
);

const PanelHead14 = ({ title, sub, right }) => (
 <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 20 }}>
  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, letterSpacing: '-.015em' }}>{title}</h3>
  {sub != null && <span className="mono" style={{ fontSize: 12, color: 'var(--ink-4)', marginLeft: 10 }}>{sub}</span>}
  <div style={{ flex: 1 }} />
  {right}
 </div>
);

// ─── 분야 bar list — bar + rank + diff
const CategoryBarsV14 = () => {
 const cats = [
  { n: '에세이', v: 42, prev: 39 },
  { n: '소설', v: 38, prev: 33 },
  { n: '인문', v: 36, prev: 36 },
  { n: '경영', v: 28, prev: 26 },
  { n: '기타', v: 24, prev: 22 },
  { n: '역사', v: 16, prev: 17 },
 ];
 const max = Math.max(...cats.map(c => c.v));
 return (
  <div>
   {cats.map(c => {
    const diff = c.v - c.prev;
    return (
     <div key={c.n} className="book-row" style={{
      display: 'grid',
      gridTemplateColumns: '54px 1fr 44px 32px',
      alignItems: 'center', gap: 12,
      padding: '10px 10px', margin: '0 -10px',
      borderRadius: 6, cursor: 'pointer',
     }}>
      <span style={{ fontSize: 13.5, fontWeight: 600, letterSpacing: '-.012em' }}>{c.n}</span>
      <div style={{ position: 'relative', height: 10, background: 'var(--paper)', borderRadius: 99, overflow: 'hidden' }}>
       <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0,
        width: `${(c.v / max) * 100}%`,
        background: 'var(--ink-1)', borderRadius: 99,
       }} />
      </div>
      <span className="mono" style={{ fontSize: 13, fontWeight: 700, textAlign: 'right' }}>{c.v}</span>
      <span style={{ fontSize: 11, color: diff > 0 ? '#c2553a' : diff < 0 ? 'var(--ink-3)' : 'var(--ink-4)', textAlign: 'right', fontFamily: 'var(--mono)' }}>
       {diff > 0 ? `↑${diff}` : diff < 0 ? `↓${-diff}` : '·'}
      </span>
     </div>
    );
   })}
  </div>
 );
};

const Bookshelf14 = ({ items, scale = 0.6 }) => (
 <div style={{ display: 'flex', alignItems: 'flex-end', gap: 26 }}>
  {items.map(t => (
   <div key={t.b.id} onClick={() => window.go('book', { id: t.b.id })} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, cursor: 'pointer', flexShrink: 0 }}>
    <div style={{ filter: 'drop-shadow(0 3px 8px rgba(0,0,0,0.10))' }}>
     <Cv b={t.b} scale={scale} lift={false} />
    </div>
    <div style={{ textAlign: 'center' }}>
     <div className="mono" style={{ fontSize: 13, fontWeight: 700 }}>{t.c}</div>
     <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 3, maxWidth: 96, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.b.t}</div>
    </div>
   </div>
  ))}
 </div>
);

const AuthorRowV14 = ({ name, books = 1, quotes, mainPub, rank }) => (
 <div className="book-row" onClick={() => window.go('author', { name })} style={{
  display: 'grid', gridTemplateColumns: '24px 1fr auto auto',
  alignItems: 'baseline', gap: 12,
  padding: '11px 10px', margin: '0 -10px', borderRadius: 8, cursor: 'pointer',
 }}>
  <span className="mono" style={{ fontSize: 11, color: 'var(--ink-4)', letterSpacing: '.04em' }}>{String(rank).padStart(2, '0')}</span>
  <div>
   <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-.012em' }}>{name}</div>
   <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 3 }}>{mainPub}</div>
  </div>
  <span className="mono" style={{ fontSize: 12, color: 'var(--ink-3)' }}>{books}권</span>
  <span className="mono" style={{ fontSize: 13.5, color: 'var(--ink-1)', fontWeight: 700, minWidth: 36, textAlign: 'right' }}>{quotes}</span>
 </div>
);

const PubRowV14 = ({ name, authors, books, quotes, rank }) => (
 <div className="book-row" style={{
  display: 'grid', gridTemplateColumns: '24px 1fr auto auto auto',
  alignItems: 'baseline', gap: 10,
  padding: '11px 10px', margin: '0 -10px', borderRadius: 8, cursor: 'pointer',
 }}>
  <span className="mono" style={{ fontSize: 11, color: 'var(--ink-4)', letterSpacing: '.04em' }}>{String(rank).padStart(2, '0')}</span>
  <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-.012em' }}>{name}</span>
  <span className="mono" style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{authors}명</span>
  <span className="mono" style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{books}권</span>
  <span className="mono" style={{ fontSize: 13.5, color: 'var(--ink-1)', fontWeight: 700, minWidth: 36, textAlign: 'right' }}>{quotes}</span>
 </div>
);


// ─── SCREEN
const ScrStatsV14 = () => (
 <div className="bk" style={{ width: 1440, height: 900, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
  <TopBarV15 active="stats" />
  <main style={{ flex: 1, overflow: 'auto' }}>
   <div style={{ padding: '36px 36px 100px' }}>
    {/* Hero title — bigger */}
    <PageTitle
     upper="통계"
     title="2026년 5월"
     large
     right={<PeriodSegV14 active="이번 달" />}
    />

    {/* Row 1 · Streak + 3 numbers + comparison */}
    <div className="stats-row-1" style={{ display: 'grid', gridTemplateColumns: '360px minmax(0,1fr)', gap: 24, marginBottom: 28 }}>
     <StreakCardV14 days={12} longest={27} dailyAvg={0.9} lastEntry="오늘 14:32" weekHits={[1,1,1,1,1,0,0]} todayDow={4} />
     <Card14 padding="28px 32px">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 32, paddingBottom: 24, marginBottom: 24, borderBottom: '1px solid var(--line-2)' }}>
       {[['어구록', '28', '개'], ['책', '11', '권'], ['작가', '9', '명']].map(([l, n, u]) => (
        <div key={l}>
         <div style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 12, fontWeight: 500 }}>{l}</div>
         <div className="mono" style={{ fontSize: 44, fontWeight: 700, letterSpacing: '-.032em', lineHeight: 1 }}>
          {n}<span style={{ fontSize: 14, color: 'var(--ink-3)', fontWeight: 500, marginLeft: 6, fontFamily: 'var(--sans)' }}>{u}</span>
         </div>
        </div>
       ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40 }}>
       <Comparison topLabel="어구록" current={28} prev={22} unit="개" period="5월" />
       <Comparison topLabel="책" current={11} prev={9} unit="권" period="5월" />
      </div>
     </Card14>
    </div>

    {/* Row 2 · Calendar + Bookshelf */}
    <div className="stats-row-2" style={{ display: 'grid', gridTemplateColumns: '1.05fr 1fr', gap: 28, marginBottom: 28 }}>
     <Card14 padding="24px 26px 24px">
      <PanelHead14 title="캘린더" sub="2026년 5월" />
      <CalendarV12 year={2026} month={5} dayData={MAY_V14} cellW={94} cellH={78} onDay={(d) => window.go('day', { day: d })} />
     </Card14>
     <Card14 padding="24px 26px 24px">
      <PanelHead14
       title="책" sub="11권"
       right={<Btn variant="ghost" size="sm" iconR="ar" style={{ color: 'var(--ink-3)' }} onClick={() => window.go('allBooks')}>책 전체</Btn>}
      />
      <div style={{ overflowX: 'auto', paddingBottom: 6 }}>
       <Bookshelf14 items={TopBooksV14.slice(0, 5)} scale={0.6} />
      </div>
     </Card14>
    </div>

    {/* Row 3 · 작가 / 출판사 / 분야 */}
    <div className="stats-row-3" style={{ display: 'grid', gridTemplateColumns: '1fr 1.1fr 0.95fr', gap: 28, marginBottom: 28 }}>
     <Card14 padding="24px 26px">
      <PanelHead14 title="작가" sub="9명" right={<Btn variant="ghost" size="sm" iconR="ar" style={{ color: 'var(--ink-3)' }} onClick={() => window.go('allAuthors')}>작가 전체</Btn>} />
      {TopAuthorsV14.slice(0, 6).map((a, i) => <AuthorRowV14 key={a.name} {...a} rank={i + 1} />)}
     </Card14>
     <Card14 padding="24px 26px">
      <PanelHead14 title="출판사" sub="7곳" right={<Btn variant="ghost" size="sm" iconR="ar" style={{ color: 'var(--ink-3)' }} onClick={() => window.go('allPubs')}>출판사 전체</Btn>} />
      {TopPubsV14.slice(0, 6).map((p, i) => <PubRowV14 key={p.name} {...p} rank={i + 1} />)}
     </Card14>
     <Card14 padding="24px 26px">
      <PanelHead14 title="분야" sub="5개" />
      <CategoryBarsV14 />
     </Card14>
    </div>

    {/* Row 4 · Words */}
    <Card14 padding="24px 28px 24px">
     <PanelHead14
      title="단어" sub="상위 50"
      right={<Btn variant="ghost" size="sm" iconR="ar" style={{ color: 'var(--ink-3)' }} onClick={() => window.go('word', { word: '시간' })}>단어 전체</Btn>}
     />
     <div style={{ display: 'flex', justifyContent: 'center' }}>
      <WordCloud W={1180} H={260} scale={0.74} />
     </div>
    </Card14>
   </div>
  </main>
 </div>
);

Object.assign(window, { ScrStatsV14, Card14, PanelHead14, Bookshelf14, AuthorRowV14, PubRowV14, CategoryBarsV14, MAY_V14, TopBooksV14, TopAuthorsV14, TopPubsV14, PeriodSegV14 });
