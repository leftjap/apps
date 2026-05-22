// ═════════════════════════════════════════════════════════════════════════
// LIST V14 — 모두 보기 페이지들 (큰 타이틀, 일관 카운트)
// ═════════════════════════════════════════════════════════════════════════

const ScrAllBooksV14 = () => {
 const items = BOOKS.map(b => ({ b, c: QUOTES.filter(q => q.b === b.id).length }))
  .sort((a, b) => b.c - a.c);
 return (
  <div className="bk" style={{ width: 1440, height: 900, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
   <TopBarV14 tab="stats" />
   <Crumb path={[{ label: '통계', back: true }, { label: '책', last: true }]} />
   <main style={{ flex: 1, overflow: 'auto' }}>
    <div style={{ padding: '40px 44px 100px' }}>
     <PageTitle
      upper="책"
      title={`${BOOKS.length}권`}
      large
      right={
       <div style={{ display: 'inline-flex', background: 'var(--paper)', borderRadius: 99, padding: 3 }}>
        {['어구록 많은 순', '최근', '가나다순'].map((n, i) => (
         <button key={n} style={{
          padding: '8px 14px', borderRadius: 99,
          fontSize: 12.5, fontWeight: i === 0 ? 700 : 500,
          color: i === 0 ? 'var(--ink-1)' : 'var(--ink-3)',
          background: i === 0 ? '#fff' : 'transparent',
          boxShadow: i === 0 ? '0 1px 2px rgba(20,18,14,.06)' : 'none',
          border: 0, cursor: 'pointer',
         }}>{n}</button>
        ))}
       </div>
      }
     />
     <div className="allbooks-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '36px 28px' }}>
      {items.map(it => (
       <div key={it.b.id} onClick={() => window.go('book', { id: it.b.id })} className="book-row" style={{
        padding: '10px 10px', borderRadius: 10, cursor: 'pointer',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
       }}>
        <div style={{ filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.10))' }}>
         <Cv b={it.b} scale={0.72} lift={false} />
        </div>
        <div style={{ textAlign: 'center', width: '100%' }}>
         <div style={{
          fontSize: 13.5, fontWeight: 700, letterSpacing: '-.012em', lineHeight: 1.3,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
         }}>{it.b.t}</div>
         <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 5 }}>{it.b.a}</div>
         <div className="mono" style={{
          fontSize: 11.5, marginTop: 8,
          color: it.c > 0 ? '#c2553a' : 'var(--ink-4)',
          fontWeight: 600,
         }}>{it.c > 0 ? `${it.c} 어구록` : '없음'}</div>
        </div>
       </div>
      ))}
     </div>
    </div>
   </main>
  </div>
 );
};


const ScrAllAuthorsV14 = () => {
 const seen = new Set();
 const authors = BOOKS.filter(b => !seen.has(b.a) && (seen.add(b.a), true)).map(b => {
  const books = BOOKS.filter(x => x.a === b.a);
  const quotes = QUOTES.filter(q => books.some(bk => bk.id === q.b)).length;
  return { name: b.a, books: books.length, quotes, mainPub: b.p, repBook: books[0]?.t };
 }).sort((a, b) => b.quotes - a.quotes);

 return (
  <div className="bk" style={{ width: 1440, height: 900, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
   <TopBarV14 tab="stats" />
   <Crumb path={[{ label: '통계', back: true }, { label: '작가', last: true }]} />
   <main style={{ flex: 1, overflow: 'auto' }}>
    <div style={{ padding: '40px 44px 100px', maxWidth: 1080 }}>
     <PageTitle
      upper="작가"
      title={`${authors.length}명`}
      large
      right={
       <div style={{ display: 'inline-flex', background: 'var(--paper)', borderRadius: 99, padding: 3 }}>
        {['어구록 많은 순', '책 많은 순', '가나다순'].map((n, i) => (
         <button key={n} style={{
          padding: '8px 14px', borderRadius: 99,
          fontSize: 12.5, fontWeight: i === 0 ? 700 : 500,
          color: i === 0 ? 'var(--ink-1)' : 'var(--ink-3)',
          background: i === 0 ? '#fff' : 'transparent',
          boxShadow: i === 0 ? '0 1px 2px rgba(20,18,14,.06)' : 'none',
          border: 0, cursor: 'pointer',
         }}>{n}</button>
        ))}
       </div>
      }
     />
     <div style={{
      display: 'grid', gridTemplateColumns: '32px minmax(0, 1.6fr) 1fr 100px 100px',
      gap: 14, padding: '0 14px 10px',
      fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--mono)', letterSpacing: '.04em',
     }}>
      <span></span>
      <span>이름</span>
      <span>대표 출판사</span>
      <span style={{ textAlign: 'right' }}>책</span>
      <span style={{ textAlign: 'right' }}>어구록</span>
     </div>
     {authors.map((a, i) => (
      <div key={a.name} onClick={() => window.go('author', { name: a.name })} className="book-row" style={{
       display: 'grid', gridTemplateColumns: '32px minmax(0, 1.6fr) 1fr 100px 100px',
       gap: 14, alignItems: 'baseline',
       padding: '14px 14px', cursor: 'pointer',
       opacity: a.quotes === 0 ? 0.55 : 1,
      }}>
       <span className="mono" style={{ fontSize: 11.5, color: 'var(--ink-4)', letterSpacing: '.04em' }}>{String(i + 1).padStart(2, '0')}</span>
       <div>
        <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-.018em' }}>{a.name}</div>
        <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 4 }}>{a.repBook}</div>
       </div>
       <span style={{ fontSize: 13.5, color: 'var(--ink-2)' }}>{a.mainPub}</span>
       <span className="mono" style={{ fontSize: 13.5, color: 'var(--ink-2)', textAlign: 'right' }}>{a.books}<span style={{ fontSize: 10.5, color: 'var(--ink-3)', marginLeft: 3, fontFamily: 'var(--sans)' }}>권</span></span>
       <span className="mono" style={{ fontSize: 14, color: a.quotes > 0 ? 'var(--ink-1)' : 'var(--ink-4)', fontWeight: 700, textAlign: 'right' }}>{a.quotes || '—'}</span>
      </div>
     ))}
    </div>
   </main>
  </div>
 );
};


const ScrAllPubsV14 = () => {
 const seen = new Set();
 const pubs = BOOKS.filter(b => !seen.has(b.p) && (seen.add(b.p), true)).map(b => {
  const books = BOOKS.filter(x => x.p === b.p);
  const authors = new Set(books.map(x => x.a)).size;
  const quotes = QUOTES.filter(q => books.some(bk => bk.id === q.b)).length;
  return { name: b.p, books: books.length, authors, quotes };
 }).sort((a, b) => b.quotes - a.quotes);

 return (
  <div className="bk" style={{ width: 1440, height: 900, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
   <TopBarV14 tab="stats" />
   <Crumb path={[{ label: '통계', back: true }, { label: '출판사', last: true }]} />
   <main style={{ flex: 1, overflow: 'auto' }}>
    <div style={{ padding: '40px 44px 100px', maxWidth: 1000 }}>
     <PageTitle upper="출판사" title={`${pubs.length}곳`} large />
     <div style={{
      display: 'grid', gridTemplateColumns: '32px minmax(0, 1.4fr) 80px 80px 100px',
      gap: 14, padding: '0 14px 10px',
      fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--mono)', letterSpacing: '.04em',
     }}>
      <span></span>
      <span>이름</span>
      <span style={{ textAlign: 'right' }}>작가</span>
      <span style={{ textAlign: 'right' }}>책</span>
      <span style={{ textAlign: 'right' }}>어구록</span>
     </div>
     {pubs.map((p, i) => (
      <div key={p.name} className="book-row" style={{
       display: 'grid', gridTemplateColumns: '32px minmax(0, 1.4fr) 80px 80px 100px',
       gap: 14, alignItems: 'baseline',
       padding: '14px 14px', cursor: 'pointer',
       opacity: p.quotes === 0 ? 0.55 : 1,
      }}>
       <span className="mono" style={{ fontSize: 11.5, color: 'var(--ink-4)', letterSpacing: '.04em' }}>{String(i + 1).padStart(2, '0')}</span>
       <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-.018em' }}>{p.name}</span>
       <span className="mono" style={{ fontSize: 13.5, color: 'var(--ink-2)', textAlign: 'right' }}>{p.authors}<span style={{ fontSize: 10.5, color: 'var(--ink-3)', marginLeft: 3, fontFamily: 'var(--sans)' }}>명</span></span>
       <span className="mono" style={{ fontSize: 13.5, color: 'var(--ink-2)', textAlign: 'right' }}>{p.books}<span style={{ fontSize: 10.5, color: 'var(--ink-3)', marginLeft: 3, fontFamily: 'var(--sans)' }}>권</span></span>
       <span className="mono" style={{ fontSize: 14, color: p.quotes > 0 ? 'var(--ink-1)' : 'var(--ink-4)', fontWeight: 700, textAlign: 'right' }}>{p.quotes || '—'}</span>
      </div>
     ))}
    </div>
   </main>
  </div>
 );
};


const ScrAllPinsV14 = () => {
 const pinned = QUOTES.filter(q => q.pin);
 const groups = groupQuotes(pinned);
 return (
  <div className="bk" style={{ width: 1440, height: 900, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
   <TopBarV14 tab="excerpt" />
   <Crumb path={[{ label: '피드', back: true }, { label: '핀', last: true }]} />
   <main style={{ flex: 1, overflow: 'auto' }}>
    <div style={{ maxWidth: 780, padding: '40px 44px 100px' }}>
     <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 36 }}>
      <Ic n="pin" sz={22} st={1.8} style={{ color: '#c2553a' }} />
      <h1 style={{ margin: '0 0 0 12px', fontSize: 32, fontWeight: 700, letterSpacing: '-.028em' }}>핀</h1>
      <span className="mono" style={{ fontSize: 14, color: 'var(--ink-3)', marginLeft: 12 }}>{pinned.length}</span>
     </div>
     {groups.map((g, i) => {
      const b = bookOf(g.b);
      return (
       <section key={i} style={{ margin: '0 0 36px' }}>
        <BookRowV14 b={b} count={g.q.length} onClick={() => window.go('book', { id: b.id })} />
        {g.q.map(q => (
         <div key={q.id} onClick={() => window.go('thread', { bookId: q.b, quoteId: q.id })} className="book-row" style={{
          padding: '16px 12px', margin: '12px -12px 0 74px', borderRadius: 10, cursor: 'pointer',
         }}>
          <QuoteText text={q.text} fontSize={18} lineHeight={1.7} variant="inline" serif />
          <div className="mono" style={{ fontSize: 11.5, color: 'var(--ink-4)', marginTop: 10 }}>{q.t}</div>
         </div>
        ))}
       </section>
      );
     })}
    </div>
   </main>
  </div>
 );
};


Object.assign(window, { ScrAllBooksV14, ScrAllAuthorsV14, ScrAllPubsV14, ScrAllPinsV14 });
