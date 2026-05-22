// ═════════════════════════════════════════════════════════════════════════
// FEED V14 — 타이틀 위계 강화, 카운트 일관, kbd 제거
// ═════════════════════════════════════════════════════════════════════════

const LONG_Q_V14 = {
 id: 901, b: 12, who: 'me', t: '2026.05.14 22:30',
 text: '어떤 책은 그 자체로 하나의 방이 된다. 처음 문턱을 넘는 순간부터 마지막 페이지를 덮을 때까지, 우리는 그 방 안에 머문다. 그리고 책을 덮은 뒤에도 한참 동안, 그 방에서 들었던 말소리, 그 방의 공기, 그 방을 비추던 빛은 우리 안에 어딘가 남는다.',
 comments: [],
};
const FEED_V14 = [
 ...QUOTES.slice(0, 6),
 LONG_Q_V14,
 ...QUOTES.slice(6, 11),
];

const FeedGroupV14 = ({ g, showHover }) => {
 const b = bookOf(g.b);
 return (
  <section style={{ margin: '0 0 32px' }}>
   <BookRowV14 b={b} count={g.q.length} soyeon={g.who === 'y'} onClick={() => window.go('book', { id: b.id })} />
   <div className="q-indent" style={{ marginTop: 6, marginLeft: 86 }}>
    {g.q.map((q, i) => (
     <QuoteRowV14 key={q.id} q={q} demoActions={showHover && i === 0} fontSize={16} onClick={() => window.go('thread', { bookId: q.b, quoteId: q.id })} />
    ))}
   </div>
  </section>
 );
};

// 사이드 · 핀
const RailPinsV14 = () => {
 const pinned = QUOTES.filter(q => q.pin).slice(0, 3);
 return (
  <section>
   <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 14 }}>
    <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, letterSpacing: '-.012em', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
     <Ic n="pin" sz={13} st={1.8} style={{ color: '#c2553a' }} />핀
    </h3>
    <span className="mono" style={{ fontSize: 11.5, color: 'var(--ink-4)', marginLeft: 8 }}>{pinned.length}</span>
    <div style={{ flex: 1 }} />
    <Btn variant="ghost" size="sm" iconR="ar" style={{ color: 'var(--ink-3)' }} onClick={() => window.go('allPins')}>핀 전체</Btn>
   </div>
   <div>
    {pinned.map(q => {
     const b = bookOf(q.b);
     return (
      <div key={q.id} onClick={() => window.go('thread', { bookId: q.b, quoteId: q.id })} className="book-row" style={{
       padding: '10px 10px', margin: '0 -10px', borderRadius: 8, cursor: 'pointer',
       display: 'flex', gap: 12, alignItems: 'flex-start',
      }}>
       <Cv b={b} scale={0.18} style={{ marginTop: 2, flexShrink: 0 }} />
       <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
         fontSize: 13, lineHeight: 1.55, color: 'var(--ink-1)', fontWeight: 500,
         display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>{q.text}</div>
        <div className="mono" style={{ fontSize: 10.5, color: 'var(--ink-4)', marginTop: 4 }}>{b.t}</div>
       </div>
      </div>
     );
    })}
   </div>
  </section>
 );
};

const RailRetroV14 = () => {
 const q = QUOTES[11]; const b = bookOf(q.b);
 return (
  <div onClick={() => window.go('book', { id: b.id })} className="book-row" style={{
   background: '#fff', borderRadius: 12,
   padding: '20px 22px 22px',
   border: '1px solid var(--line-2)',
   boxShadow: '0 1px 2px rgba(20,18,14,0.03), 0 8px 24px -10px rgba(20,18,14,0.07)',
   cursor: 'pointer',
  }}>
   <div className="upper" style={{ marginBottom: 12 }}>3주 전</div>
   <div style={{
    fontSize: 14.5, lineHeight: 1.7, color: 'var(--ink-1)', fontFamily: 'var(--serif)',
    display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
   }}>
    <span style={{ color: 'var(--ink-4)' }}>“</span>{q.text}<span style={{ color: 'var(--ink-4)' }}>”</span>
   </div>
   <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: 'var(--ink-3)' }}>
    <Cv b={b} scale={0.16} />
    <span style={{ fontWeight: 500 }}>{b.t}</span>
   </div>
  </div>
 );
};

const RailComparisonV14 = () => (
 <div style={{
  background: '#fff', borderRadius: 12,
  padding: '20px 22px 18px',
  border: '1px solid var(--line-2)',
  boxShadow: '0 1px 2px rgba(20,18,14,0.03), 0 8px 24px -10px rgba(20,18,14,0.07)',
 }}>
  <Comparison topLabel="어구록" current={28} prev={22} unit="개" period="5월" />
  <div style={{ height: 22 }} />
  <Comparison topLabel="책" current={4} prev={3} unit="권" period="5월" />
 </div>
);


// ─── 메인 피드
const ScrFeedV14 = ({ showHover = false }) => {
 const groups = groupQuotes(FEED_V14);
 return (
  <div className="bk" style={{ width: 1440, height: 900, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
   <TopBarV14 tab="excerpt" />
   <main style={{ flex: 1, overflow: 'auto' }}>
    <div className="feed-grid" style={{
     padding: '36px 36px 100px',
     display: 'grid',
     gridTemplateColumns: 'minmax(0, 660px) 340px',
     gap: 56, maxWidth: 1160,
     justifyContent: 'start',
    }}>
     <div>
      <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 28 }}>
       <h1 style={{ margin: 0, fontSize: 32, fontWeight: 700, letterSpacing: '-.028em', lineHeight: 1 }}>어구록</h1>
       <span className="mono" style={{ fontSize: 14, color: 'var(--ink-3)', marginLeft: 12, fontWeight: 500 }}>184</span>
       <div style={{ flex: 1 }} />
       <span style={{ fontSize: 12.5, color: 'var(--ink-3)', display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
        최근순<Ic n="chevD" sz={11} />
       </span>
      </div>
      {groups.map((g, i) => <FeedGroupV14 key={i} g={g} showHover={showHover} />)}
     </div>
     <aside style={{ display: 'flex', flexDirection: 'column', gap: 32, paddingTop: 58 }}>
      <StreakCardV14 days={12} longest={27} dailyAvg={0.9} lastEntry="오늘 14:32" weekHits={[1,1,1,1,1,0,0]} todayDow={4} />
      <RailPinsV14 />
      <RailComparisonV14 />
      <RailRetroV14 />
     </aside>
    </div>
   </main>
  </div>
 );
};

Object.assign(window, { ScrFeedV14, FEED_V14, LONG_Q_V14, FeedGroupV14, RailPinsV14, RailRetroV14, RailComparisonV14 });
