// ═════════════════════════════════════════════════════════════════════════
// DETAILS V14 — Thread / Word / Day / Author / Book
//   - 큰 hero 타이틀
//   - kbd 표기 제거
//   - Day timeline: vertical line 제거, dot marker 제거 — 시간+책+텍스트 단순 row
//   - 카운트 표기 일관 (NUM + label)
// ═════════════════════════════════════════════════════════════════════════

// ─── 스레드
const ScrThreadV14 = ({ bookId = 1, quoteId = 1 } = {}) => {
 const targetBookId = bookId;
 const targetQuoteId = quoteId;
 const book = bookOf(targetBookId);
 const thread = QUOTES.filter(q => q.b === targetBookId).sort((a, b) => a.t.localeCompare(b.t));
 const totalComments = thread.reduce((s, q) => s + (q.comments?.length || 0), 0);
 const pinned = thread.filter(q => q.pin).length;

 return (
  <div className="bk" style={{ width: 1440, height: 900, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
   <TopBarV14 tab="excerpt" />
   <Crumb path={[{ label: '피드', back: true }, { label: book.t, last: true }]} />

   <main style={{ flex: 1, overflow: 'auto' }}>
    <div style={{ maxWidth: 780, padding: '32px 44px 100px' }}>

     {/* Book band — slim, consistent count format */}
     <div className="book-row" onClick={() => window.go('book', { id: book.id })} style={{
      display: 'flex', alignItems: 'center', gap: 18,
      padding: '10px 12px', margin: '0 -12px 20px',
      borderRadius: 10, cursor: 'pointer',
     }}>
      <Cv b={book} scale={0.34} />
      <div style={{ flex: 1, minWidth: 0 }}>
       <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-.02em', lineHeight: 1.3 }}>{book.t}</div>
       <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 4 }}>{book.a} · {book.p}</div>
      </div>
      <div style={{ display: 'flex', gap: 22, fontSize: 12 }}>
       <Count n={thread.length} label="어구록" />
       <Count n={totalComments} label="댓글" />
       <Count n={pinned} label="핀" />
      </div>
     </div>

     {/* Thread items */}
     <div>
      {thread.map((q) => {
       const isAnchor = q.id === targetQuoteId;
       const cN = (q.comments || []).length;
       return (
        <article key={q.id} style={{
         position: 'relative',
         padding: isAnchor ? '22px 0 24px 24px' : '20px 0',
         marginLeft: isAnchor ? -24 : 0,
        }}>
         {isAnchor && (
          <>
           <div style={{ position: 'absolute', left: 0, top: 26, bottom: 26, width: 3, background: '#c2553a', borderRadius: 2 }} />
           <span style={{
            position: 'absolute', top: -2, left: 24,
            padding: '3px 10px', background: '#c2553a', color: '#fff',
            borderRadius: 99, fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 600,
            letterSpacing: '.06em', textTransform: 'uppercase',
           }}>지금 본 어구록</span>
          </>
         )}

         {q.pin ? (
          <div style={{ padding: '8px 16px 8px' }}>
           <QuoteText text={q.text} fontSize={20} lineHeight={1.7} variant="flank" serif align="center" maxW={580} style={{ margin: '0 auto' }} />
          </div>
         ) : (
          <div style={{
           fontSize: 18, lineHeight: 1.7, fontWeight: 500, letterSpacing: '-.012em',
           color: 'var(--ink-1)', fontFamily: 'var(--sans)',
          }}>
           <span style={{ fontFamily: 'var(--serif)', color: 'var(--ink-4)' }}>“</span>
           {q.text}
           <span style={{ fontFamily: 'var(--serif)', color: 'var(--ink-4)' }}>”</span>
          </div>
         )}

         <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10, fontSize: 12, color: 'var(--ink-4)', justifyContent: q.pin ? 'center' : 'flex-start' }}>
          {q.pin && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#c2553a', fontWeight: 600 }}><Ic n="pin" sz={12} st={1.8} />핀</span>}
          <span className="mono">{q.t}</span>
          {cN > 0 && <><span>·</span><span style={{ color: 'var(--ink-3)' }}>댓글 {cN}</span></>}
         </div>

         {cN > 0 && <ThreadCommentsV14 comments={q.comments} allowInput={isAnchor} />}
         {isAnchor && cN === 0 && <ThreadCommentsV14 comments={[]} allowInput />}
        </article>
       );
      })}
     </div>

     <button onClick={() => window.go('add')} style={{
      marginTop: 32, width: '100%', padding: '14px',
      background: 'transparent', border: '1px dashed var(--line)',
      borderRadius: 10, color: 'var(--ink-3)', fontSize: 14, fontWeight: 500,
      cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
     }}>
      <Ic n="plus" sz={14} />이 책에 어구록 추가
     </button>
    </div>
   </main>
  </div>
 );
};

// 댓글 (kbd 제거)
const ThreadCommentsV14 = ({ comments, allowInput }) => (
 <div style={{ marginTop: 18 }}>
  {comments.map((c, i) => {
   const me = c.who !== 'y';
   const isLast = i === comments.length - 1 && !allowInput;
   return (
    <div key={i} style={{ display: 'flex', gap: 12 }}>
     <div style={{ position: 'relative', width: 24, flexShrink: 0 }}>
      {!isLast && <div style={{ position: 'absolute', left: 11, top: 22, bottom: -8, width: 1, background: 'var(--line)' }} />}
      <div style={{
       width: 22, height: 22, borderRadius: 50,
       background: me ? 'var(--ink-1)' : '#c2553a',
       color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
       fontSize: 10, fontWeight: 700, marginTop: 1,
      }}>{me ? '나' : '소'}</div>
     </div>
     <div style={{ flex: 1, minWidth: 0, paddingBottom: i === comments.length - 1 ? 0 : 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
       <span style={{ fontSize: 12.5, fontWeight: 700, color: me ? 'var(--ink-1)' : '#c2553a' }}>{me ? '나' : '소연'}</span>
       <span className="mono" style={{ fontSize: 11, color: 'var(--ink-4)' }}>{c.t}</span>
      </div>
      <div style={{ fontSize: 14, lineHeight: 1.65, color: 'var(--ink-2)' }}>{c.text}</div>
     </div>
    </div>
   );
  })}
  {allowInput && (
   <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
    <div style={{ width: 24, flexShrink: 0 }}>
     <div style={{ width: 22, height: 22, borderRadius: 50, border: '1.5px dashed var(--line)' }} />
    </div>
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--paper)', borderRadius: 8 }}>
     <input placeholder="댓글 쓰기" onKeyDown={(e) => { if (e.key === 'Enter' && e.target.value.trim()) window.go('comment'); }} style={{ flex: 1, border: 0, outline: 0, background: 'transparent', fontSize: 14, fontFamily: 'inherit' }} />
    </div>
   </div>
  )}
 </div>
);


// ─── 단어 상세 V14 — 큰 hero
const ScrWordV14 = ({ word: w } = {}) => {
 const word = w || '시간';
 const monthly = [1, 2, 1, 3, 2, 4, 3, 5, 2, 4, 3, 2];
 const monthLabels = ['6월', '7월', '8월', '9월', '10월', '11월', '12월', '1월', '2월', '3월', '4월', '5월'];
 const monthMax = Math.max(...monthly);
 const related = [
  { w: '죽음', c: 8 }, { w: '거리', c: 7 }, { w: '사람', c: 6 },
  { w: '느림', c: 5 }, { w: '약', c: 5 }, { w: '환자', c: 4 },
  { w: '몰입', c: 3 }, { w: '기억', c: 3 }, { w: '돈', c: 3 }, { w: '걷기', c: 3 },
 ];
 const booksRanked = [
  { b: bookOf(10), c: 8 }, { b: bookOf(1), c: 6 }, { b: bookOf(9), c: 5 },
  { b: bookOf(3), c: 4 }, { b: bookOf(8), c: 4 }, { b: bookOf(13), c: 3 },
 ];
 const authorsRanked = [
  { name: '김범석', q: 8 }, { name: '카를 고틀로프 셸레', q: 6 }, { name: '모건 하우절', q: 5 },
  { name: '한강', q: 4 }, { name: '미하이 칙센트미하이', q: 4 },
 ];
 const samples = [
  { text: '우리가 환자에게 줄 수 있는 가장 큰 것은 시간이라는 것을. 약이 아니라.', book: bookOf(10), t: '2026.05.11 22:45' },
  { text: '오래 일하다 보면 알게 된다. 시간은 가장 비싼 자원이다.', book: bookOf(10), t: '2026.05.08 07:10' },
  { text: '시간을 길게 쓰는 사람은 같은 거리를 더 깊이 본다.', book: bookOf(1), t: '2026.04.24 11:25' },
  { text: '돈은 살 수 있는 시간이고, 가장 비싼 자유다.', book: bookOf(9), t: '2026.03.18 09:20' },
 ];
 const hl = (t) => {
  const parts = t.split(word);
  return parts.map((p, i) => (
   <React.Fragment key={i}>
    {p}
    {i < parts.length - 1 && <mark style={{ background: 'rgba(194,85,58,0.18)', color: 'var(--ink-1)', padding: '0 3px', borderRadius: 3, fontWeight: 700 }}>{word}</mark>}
   </React.Fragment>
  ));
 };

 return (
  <div className="bk" style={{ width: 1440, height: 900, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
   <TopBarV14 tab="stats" />
   <Crumb path={[{ label: '통계', back: true }, { label: '단어' }, { label: word }]} />
   <main style={{ flex: 1, overflow: 'auto' }}>
    <div style={{ maxWidth: 1080, padding: '40px 44px 100px' }}>
     {/* Hero — word massive */}
     <section className="word-hero" style={{ display: 'flex', gap: 64, alignItems: 'flex-start', marginBottom: 40 }}>
      <h1 style={{ margin: 0, fontSize: 140, fontWeight: 800, letterSpacing: '-.045em', lineHeight: 0.92, fontFamily: 'var(--serif)' }}>{word}</h1>
      <div style={{ paddingTop: 20, flex: 1 }}>
       <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 24, marginBottom: 28 }}>
        {[['등장', '32', '회'], ['책', '9', '권'], ['작가', '6', '명'], ['분야', '4', '개']].map(([l, n, u]) => (
         <div key={l}>
          <div style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 8 }}>{l}</div>
          <div className="mono" style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-.028em', lineHeight: 1 }}>{n}<span style={{ fontSize: 12, color: 'var(--ink-3)', fontWeight: 500, fontFamily: 'var(--sans)', marginLeft: 4 }}>{u}</span></div>
         </div>
        ))}
       </div>
       <div style={{ padding: '16px 20px', background: '#fafaf7', borderRadius: 10, border: '1px solid var(--line-2)' }}>
        <div className="upper" style={{ marginBottom: 8 }}>처음 만난 곳</div>
        <div style={{ fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.6 }}>
         <span className="mono" style={{ color: '#c2553a', fontWeight: 600 }}>2024.11.04</span>
         <span style={{ margin: '0 8px', color: 'var(--ink-4)' }}>·</span>
         <span style={{ fontWeight: 600, color: 'var(--ink-1)' }}>김범석</span>
         <span style={{ color: 'var(--ink-3)', marginLeft: 6 }}>《어떤 죽음이 삶에게 말했다》</span>
        </div>
       </div>
      </div>
     </section>

     {/* Monthly trend */}
     <section style={{ marginBottom: 44 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 18 }}>
       <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, letterSpacing: '-.015em' }}>등장 추이</h3>
       <span className="mono" style={{ fontSize: 12, color: 'var(--ink-4)', marginLeft: 10 }}>최근 12개월</span>
       <div style={{ flex: 1 }} />
       <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>총 <b className="mono" style={{ color: 'var(--ink-1)' }}>32</b>회 · 평균 <b className="mono" style={{ color: 'var(--ink-1)' }}>2.7</b>/월</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 140, padding: '4px 0' }}>
       {monthly.map((v, i) => {
        const cur = i === monthly.length - 1;
        return (
         <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
          <span className="mono" style={{ fontSize: 11, color: cur ? 'var(--ink-1)' : 'var(--ink-4)', fontWeight: cur ? 700 : 500 }}>{v}</span>
          <div style={{
           width: '100%', height: `${(v / monthMax) * 100}%`, minHeight: 2,
           background: cur ? '#c2553a' : 'var(--ink-3)',
           opacity: cur ? 1 : 0.55,
           borderRadius: '3px 3px 0 0',
          }} />
         </div>
        );
       })}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
       {monthLabels.map((m, i) => <span key={i} className="mono" style={{ flex: 1, textAlign: 'center', fontSize: 10.5, color: 'var(--ink-4)' }}>{m}</span>)}
      </div>
     </section>

     {/* Related + Authors */}
     <div className="word-cols" style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 52, marginBottom: 44 }}>
      <section>
       <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, letterSpacing: '-.015em' }}>함께 자주 등장</h3>
       <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {related.map(r => (
         <span key={r.w} onClick={() => window.go('word', { word: r.w })} className="book-row" style={{
          display: 'inline-flex', alignItems: 'baseline', gap: 6,
          padding: '8px 14px',
          background: 'var(--paper)', borderRadius: 99,
          fontSize: 13.5, fontWeight: 600, color: 'var(--ink-1)',
          cursor: 'pointer',
         }}>{r.w}<span className="mono" style={{ fontSize: 11, fontWeight: 500, color: 'var(--ink-3)' }}>{r.c}</span></span>
        ))}
       </div>
      </section>
      <section>
       <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, letterSpacing: '-.015em' }}>옮긴 작가</h3>
       {authorsRanked.map(a => (
        <div key={a.name} onClick={() => window.go('author', { name: a.name })} className="book-row" style={{
         display: 'flex', alignItems: 'baseline',
         padding: '8px 10px', margin: '0 -10px', borderRadius: 6,
         fontSize: 13.5, cursor: 'pointer',
        }}>
         <span style={{ fontWeight: 500 }}>{a.name}</span>
         <div style={{ flex: 1 }} />
         <span className="mono" style={{ fontSize: 12, color: 'var(--ink-2)', fontWeight: 600 }}>{a.q}</span>
        </div>
       ))}
      </section>
     </div>

     {/* Books */}
     <section style={{ marginBottom: 44 }}>
      <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, letterSpacing: '-.015em' }}>등장하는 책 · {booksRanked.length}</h3>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 28, paddingBottom: 6, overflowX: 'auto' }}>
       {booksRanked.map(t => (
        <div key={t.b.id} onClick={() => window.go('book', { id: t.b.id })} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, cursor: 'pointer', flexShrink: 0 }}>
         <div style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.08))' }}>
          <Cv b={t.b} scale={0.52} lift={false} />
         </div>
         <div style={{ textAlign: 'center' }}>
          <span className="mono" style={{ fontSize: 13, fontWeight: 700, color: t.c >= 5 ? '#c2553a' : 'var(--ink-1)' }}>{t.c}</span>
          <span style={{ fontSize: 11, color: 'var(--ink-3)', marginLeft: 3 }}>회</span>
         </div>
        </div>
       ))}
      </div>
     </section>

     {/* Sample quotes */}
     <section>
      <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 16 }}>
       <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, letterSpacing: '-.015em' }}>어구록</h3>
       <span className="mono" style={{ fontSize: 12, color: 'var(--ink-4)', marginLeft: 10 }}>32</span>
       <div style={{ flex: 1 }} />
       <Btn variant="ghost" size="sm" iconR="chevD">최근순</Btn>
      </div>
      <div>
       {samples.map((s, i) => (
        <div key={i} onClick={() => window.go('thread', { bookId: s.book.id })} className="book-row" style={{
         padding: '14px 12px', margin: '0 -12px', borderRadius: 10,
         display: 'flex', gap: 18, alignItems: 'flex-start', cursor: 'pointer',
        }}>
         <div style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.07))', flexShrink: 0 }}>
          <Cv b={s.book} scale={0.26} lift={false} />
         </div>
         <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, lineHeight: 1.65, fontWeight: 500 }}>
           <span style={{ color: 'var(--ink-4)', fontFamily: 'var(--serif)' }}>“</span>
           {hl(s.text)}
           <span style={{ color: 'var(--ink-4)', fontFamily: 'var(--serif)' }}>”</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, fontSize: 12, color: 'var(--ink-4)' }}>
           <span style={{ color: 'var(--ink-2)', fontWeight: 600 }}>{s.book.t}</span>
           <span>·</span>
           <span className="mono">{s.t}</span>
          </div>
         </div>
        </div>
       ))}
      </div>
     </section>
    </div>
   </main>
  </div>
 );
};


// ─── 날짜 상세 V14 — 세로선 제거, dot marker 제거
const ScrDayV14 = () => {
 const entries = [
  { h: 9, m: 15, q: QUOTES[5], book: bookOf(9) },
  { h: 14, m: 30, q: QUOTES[6], book: bookOf(9) },
  { h: 21, m: 8, q: QUOTES[4], book: bookOf(3) },
  { h: 23, m: 14, q: QUOTES[3], book: bookOf(8) },
 ];
 const weekData = [3, 2, 4, 4, 5, 1, 0];
 const weekLabels = ['월', '화', '수', '목', '금', '토', '일'];
 const todayIdx = 3;
 const weekMax = Math.max(...weekData);

 return (
  <div className="bk" style={{ width: 1440, height: 900, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
   <TopBarV14 tab="stats" />
   <Crumb path={[{ label: '캘린더', back: true }, { label: '2026년 5월' }, { label: '5월 14일' }]} />

   <main style={{ flex: 1, overflow: 'auto' }}>
    <div className="day-grid" style={{ maxWidth: 1080, padding: '40px 44px 100px', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 320px', gap: 56 }}>
     <div>
      {/* Hero — 더 큼 */}
      <section style={{ display: 'flex', alignItems: 'flex-end', gap: 36, marginBottom: 32 }}>
       <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 152, fontWeight: 700, letterSpacing: '-.045em', lineHeight: 0.85 }}>14</span>
        <div style={{ paddingBottom: 14 }}>
         <div style={{ fontFamily: 'var(--mono)', fontSize: 14, color: 'var(--ink-3)', letterSpacing: '.04em' }}>2026.05</div>
         <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-.025em', marginTop: 6 }}>목요일</div>
        </div>
       </div>
      </section>

      {/* Day insight */}
      <div style={{ padding: '18px 22px', background: '#fafaf7', borderRadius: 12, marginBottom: 36, fontSize: 14, lineHeight: 1.7, color: 'var(--ink-2)' }}>
       <div className="upper" style={{ marginBottom: 8 }}>이 날의 흐름</div>
       처음 옮긴 시간 <b className="mono" style={{ color: '#c2553a' }}>09:15</b>, 마지막 <b className="mono" style={{ color: '#c2553a' }}>23:14</b>
       <span style={{ color: 'var(--ink-3)' }}> · 14시간 사이 </span>
       <b className="mono" style={{ color: 'var(--ink-1)' }}>4</b> 개를 옮겼습니다.
       이 주 평균보다 <b style={{ color: '#c2553a' }}>+1</b>개.
      </div>

      {/* Simple timeline — no vertical line, no dot markers */}
      <section>
       <h3 style={{ margin: '0 0 18px', fontSize: 16, fontWeight: 700, letterSpacing: '-.015em' }}>어구록 4개</h3>
       <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {entries.map((e, i) => (
         <div key={i} onClick={() => window.go('thread', { bookId: e.book.id, quoteId: e.q.id })} className="book-row" style={{
          padding: '16px 18px', borderRadius: 12, cursor: 'pointer',
          background: '#fff',
          border: '1px solid var(--line-2)',
          boxShadow: '0 1px 2px rgba(20,18,14,0.03), 0 8px 24px -12px rgba(20,18,14,0.06)',
          display: 'grid', gridTemplateColumns: '64px auto 1fr', gap: 18, alignItems: 'flex-start',
         }}>
          <span className="mono" style={{ fontSize: 16, fontWeight: 700, color: '#c2553a', letterSpacing: '-.012em', paddingTop: 2 }}>{e.h.toString().padStart(2, '0')}:{e.m.toString().padStart(2, '0')}</span>
          <div style={{ filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.08))' }}>
           <Cv b={e.book} scale={0.24} lift={false} />
          </div>
          <div style={{ minWidth: 0, paddingTop: 1 }}>
           <div style={{ fontSize: 12, color: 'var(--ink-3)', fontWeight: 600, marginBottom: 6 }}>{e.book.t}</div>
           <div style={{
            fontSize: 15, lineHeight: 1.6, fontWeight: 500,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
           }}>
            <span style={{ color: 'var(--ink-4)', fontFamily: 'var(--serif)' }}>“</span>
            {e.q.text}
            <span style={{ color: 'var(--ink-4)', fontFamily: 'var(--serif)' }}>”</span>
           </div>
           {e.q.comments?.length > 0 && (
            <div style={{ marginTop: 8, fontSize: 11.5, color: 'var(--ink-3)' }}>댓글 {e.q.comments.length}</div>
           )}
          </div>
         </div>
        ))}
       </div>
      </section>
     </div>

     {/* Sidebar */}
     <aside style={{ display: 'flex', flexDirection: 'column', gap: 32, paddingTop: 26 }}>
      <section>
       <h3 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 700, letterSpacing: '-.012em' }}>이 주</h3>
       <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 90 }}>
        {weekData.map((v, i) => {
         const cur = i === todayIdx;
         return (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
           <span className="mono" style={{ fontSize: 10.5, color: cur ? 'var(--ink-1)' : 'var(--ink-4)', fontWeight: cur ? 700 : 500 }}>{v}</span>
           <div style={{
            width: '100%', height: `${(v / weekMax) * 60}%`, minHeight: 2,
            background: cur ? '#c2553a' : 'var(--ink-3)',
            opacity: cur ? 1 : 0.45,
            borderRadius: '3px 3px 0 0',
           }} />
           <span style={{ fontSize: 11.5, color: cur ? 'var(--ink-1)' : 'var(--ink-3)', fontWeight: cur ? 700 : 500 }}>{weekLabels[i]}</span>
          </div>
         );
        })}
       </div>
      </section>

      <section>
       <h3 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 700, letterSpacing: '-.012em' }}>읽은 책 · 3</h3>
       {[bookOf(9), bookOf(3), bookOf(8)].map((b, i) => (
        <div key={b.id} onClick={() => window.go('book', { id: b.id })} className="book-row" style={{
         display: 'flex', alignItems: 'center', gap: 12,
         padding: '8px 8px', margin: '0 -8px', borderRadius: 8, cursor: 'pointer',
        }}>
         <Cv b={b} scale={0.2} />
         <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: '-.012em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.t}</div>
          <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>{b.a}</div>
         </div>
         <span className="mono" style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{[2, 1, 1][i]}</span>
        </div>
       ))}
      </section>

      <section>
       <h3 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 700, letterSpacing: '-.012em' }}>인근 날</h3>
       {[
        { d: '5/13', n: 1, sub: '보통의 언어들' },
        { d: '5/14', n: 4, sub: '4개 · 3권', active: true },
        { d: '5/15', n: 3, sub: '산책하는 법' },
       ].map(d => (
        <div key={d.d} className="book-row" style={{
         display: 'flex', alignItems: 'baseline', gap: 12,
         padding: '8px 10px', margin: '0 -10px', borderRadius: 6, cursor: 'pointer',
         background: d.active ? 'rgba(194,85,58,0.06)' : 'transparent',
        }}>
         <span className="mono" style={{ fontSize: 12, color: d.active ? '#c2553a' : 'var(--ink-3)', fontWeight: d.active ? 700 : 500, width: 36 }}>{d.d}</span>
         <span style={{ fontSize: 12.5, color: 'var(--ink-2)', flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.sub}</span>
         <span className="mono" style={{ fontSize: 12.5, color: 'var(--ink-2)', fontWeight: 600 }}>{d.n}</span>
        </div>
       ))}
      </section>
     </aside>
    </div>
   </main>
  </div>
 );
};


// ─── 작가 상세 V14
const ScrAuthorV14 = ({ name } = {}) => {
 const author = name || '카를 고틀로프 셸레';
 const list = QUOTES.filter(q => bookOf(q.b).a === author);
 const books = BOOKS.filter(b => b.a === author);
 const authorWords = [
  ['걷기', 32], ['시간', 24], ['풍경', 18], ['사유', 16], ['거리', 14],
  ['느림', 12], ['속도', 10], ['공간', 9], ['길', 8], ['빛', 7],
  ['바람', 6], ['몸', 6], ['생각', 5], ['끝', 5], ['시작', 4],
  ['새벽', 4], ['도시', 3], ['숨', 3], ['손', 3], ['눈', 2],
 ];
 const monthlyByAuthor = [0, 0, 0, 0, 0, 1, 1, 2, 1, 3, 4, 3];
 const monthLabels = ['6월', '7월', '8월', '9월', '10월', '11월', '12월', '1월', '2월', '3월', '4월', '5월'];
 const monthMax = Math.max(...monthlyByAuthor, 1);

 return (
  <div className="bk" style={{ width: 1440, height: 900, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
   <TopBarV14 tab="excerpt" />
   <Crumb path={[{ label: '피드', back: true }, { label: '작가' }, { label: author }]} />
   <main style={{ flex: 1, overflow: 'auto' }}>
    <div style={{ maxWidth: 1080, padding: '40px 44px 100px' }}>
     <section style={{ marginBottom: 40 }}>
      <span className="upper">작가</span>
      <h1 style={{ margin: '12px 0 0', fontSize: 64, fontWeight: 800, letterSpacing: '-.038em', lineHeight: 1.05, fontFamily: 'var(--serif)' }}>{author}</h1>
      <div style={{ marginTop: 16, fontSize: 14, color: 'var(--ink-3)', display: 'flex', gap: 10, alignItems: 'baseline' }}>
       <span style={{ color: 'var(--ink-2)', fontWeight: 500 }}>{books[0]?.p}</span>
       <span>·</span>
       <span>{books[0]?.c}</span>
      </div>
      <div style={{ marginTop: 26, display: 'flex', gap: 40, alignItems: 'baseline' }}>
       {[
        { n: books.length, l: '권' },
        { n: list.length, l: '어구록' },
        { n: '2025.11.04', l: '첫 만남' },
        { n: '오늘', l: '가장 최근' },
       ].map((x, i) => (
        <div key={i}>
         <div style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 8 }}>{x.l}</div>
         <div style={{ fontSize: 24, fontWeight: 700, fontFamily: 'var(--mono)', letterSpacing: '-.022em', lineHeight: 1 }}>{x.n}</div>
        </div>
       ))}
      </div>
     </section>

     <section style={{ marginBottom: 44 }}>
      <h3 style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 700, letterSpacing: '-.015em' }}>이 작가를 옮긴 흐름</h3>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 90 }}>
       {monthlyByAuthor.map((v, i) => {
        const cur = i === monthlyByAuthor.length - 1;
        return (
         <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
          <span className="mono" style={{ fontSize: 10.5, color: cur ? 'var(--ink-1)' : 'var(--ink-4)', fontWeight: cur ? 700 : 500, opacity: v === 0 ? 0.4 : 1 }}>{v || ''}</span>
          <div style={{
           width: '100%', height: `${(v / monthMax) * 60}px`, minHeight: 2,
           background: cur ? '#c2553a' : 'var(--ink-3)',
           opacity: v === 0 ? 0.18 : cur ? 1 : 0.55,
           borderRadius: '3px 3px 0 0',
          }} />
         </div>
        );
       })}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
       {monthLabels.map((m, i) => <span key={i} className="mono" style={{ flex: 1, textAlign: 'center', fontSize: 10.5, color: 'var(--ink-4)' }}>{m}</span>)}
      </div>
     </section>

     <section style={{ marginBottom: 44 }}>
      <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, letterSpacing: '-.015em' }}>책 · {books.length}</h3>
      <div style={{ display: 'flex', gap: 28, alignItems: 'flex-end' }}>
       {books.map(b => (
        <div key={b.id} onClick={() => window.go('book', { id: b.id })} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
         <div style={{ filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.10))' }}>
          <Cv b={b} scale={0.95} lift={false} />
         </div>
         <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-.012em' }}>{b.t}</div>
          <div className="mono" style={{ fontSize: 11.5, color: '#c2553a', marginTop: 6, fontWeight: 600 }}>어구록 {list.filter(q => q.b === b.id).length}</div>
         </div>
        </div>
       ))}
      </div>
     </section>

     <section style={{ marginBottom: 44 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 14 }}>
       <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, letterSpacing: '-.015em' }}>이 작가의 단어</h3>
       <span className="mono" style={{ fontSize: 12, color: 'var(--ink-4)', marginLeft: 10 }}>상위 20</span>
      </div>
      <div style={{ padding: '24px 28px', background: '#fafaf7', borderRadius: 14 }}>
       <WordCloud W={960} H={200} words={authorWords} scale={0.68} />
      </div>
     </section>

     <section>
      <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 14 }}>
       <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, letterSpacing: '-.015em' }}>어구록</h3>
       <span className="mono" style={{ fontSize: 12, color: 'var(--ink-4)', marginLeft: 10 }}>{list.length}</span>
       <div style={{ flex: 1 }} />
       <Btn variant="ghost" size="sm" iconR="chevD">최근순</Btn>
      </div>
      {list.map(q => (
       <article key={q.id} onClick={() => window.go('thread', { bookId: q.b, quoteId: q.id })} className="book-row" style={{
        padding: '16px 12px', margin: '0 -12px', borderRadius: 10, cursor: 'pointer',
       }}>
        <div style={{ fontSize: 16.5, lineHeight: 1.65, fontWeight: q.pin ? 600 : 500 }}>
         <span style={{ color: 'var(--ink-4)', fontFamily: 'var(--serif)' }}>“</span>
         {q.text}
         <span style={{ color: 'var(--ink-4)', fontFamily: 'var(--serif)' }}>”</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, fontSize: 12, color: 'var(--ink-4)' }}>
         {q.pin && <span style={{ color: '#c2553a', fontWeight: 600, display: 'inline-flex', gap: 4, alignItems: 'center' }}><Ic n="pin" sz={11} st={1.8} />핀</span>}
         <span className="mono">{q.t}</span>
         {q.comments?.length > 0 && <><span>·</span><span style={{ color: 'var(--ink-3)' }}>댓글 {q.comments.length}</span></>}
        </div>
       </article>
      ))}
     </section>
    </div>
   </main>
  </div>
 );
};


// ─── 책 상세
const ScrBookV14 = ({ id = 1 } = {}) => {
 const b = bookOf(id) || bookOf(1);
 const list = QUOTES.filter(q => q.b === b.id);
 return (
  <div className="bk" style={{ width: 1440, height: 900, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
   <TopBarV14 tab="excerpt" />
   <Crumb path={[{ label: '피드', back: true }, { label: '책' }, { label: b.t }]} />
   <main style={{ flex: 1, overflow: 'auto' }}>
    <div style={{ maxWidth: 1000, padding: '40px 44px 100px' }}>
     <section style={{ display: 'flex', gap: 48, alignItems: 'flex-start', marginBottom: 40 }}>
      <div style={{ filter: 'drop-shadow(0 8px 24px rgba(0,0,0,0.14)) drop-shadow(0 2px 6px rgba(0,0,0,0.06))' }}>
       <Cv b={b} scale={1.2} lift={false} />
      </div>
      <div style={{ flex: 1, paddingTop: 8 }}>
       <div className="upper" style={{ marginBottom: 14 }}>{b.c}</div>
       <h1 style={{ margin: 0, fontSize: 40, fontWeight: 700, letterSpacing: '-.03em', lineHeight: 1.15 }}>{b.t}</h1>
       <div style={{ fontSize: 15, color: 'var(--ink-3)', marginTop: 10, fontWeight: 500 }}>{b.sub}</div>
       <div style={{ fontSize: 13.5, color: 'var(--ink-2)', marginTop: 20, display: 'flex', gap: 12 }}>
        <span style={{ fontWeight: 600 }}>{b.a}</span><span style={{ color: 'var(--ink-4)' }}>·</span>
        <span>{b.p}</span><span style={{ color: 'var(--ink-4)' }}>·</span>
        <span>{b.y}</span>
       </div>
       <div style={{ marginTop: 28, display: 'flex', gap: 40, alignItems: 'baseline' }}>
        {[[list.length, '어구록'], [3, '댓글'], [1, '핀'], ['3주', '처음']].map(([n, l]) => (
         <div key={l}>
          <span style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-.025em', lineHeight: 1, fontFamily: 'var(--mono)' }}>{n}</span>
          <span style={{ fontSize: 13, color: 'var(--ink-3)', marginLeft: 6 }}>{l}</span>
         </div>
        ))}
        <div style={{ flex: 1 }} />
        <Btn variant="pri" size="md" icon="plus" onClick={() => window.go('add')}>어구록</Btn>
       </div>
      </div>
     </section>

     <h3 style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 700, letterSpacing: '-.015em' }}>어구록 · 시간순</h3>
     {list.map(q => (
      <article key={q.id} onClick={() => window.go('thread', { bookId: q.b, quoteId: q.id })} className="book-row" style={{
       padding: '16px 12px', margin: '0 -12px', borderRadius: 10, cursor: 'pointer',
      }}>
       {q.pin && (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: '#c2553a', fontWeight: 600, marginBottom: 5 }}>
         <Ic n="pin" sz={11} st={1.8} />핀
        </div>
       )}
       <div style={{
        fontSize: 16, lineHeight: 1.65, fontWeight: q.pin ? 600 : 500,
        display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
       }}>
        <span style={{ color: 'var(--ink-4)', fontFamily: 'var(--serif)' }}>“</span>
        {q.text}
        <span style={{ color: 'var(--ink-4)', fontFamily: 'var(--serif)' }}>”</span>
       </div>
       <div style={{ marginTop: 8, fontSize: 12, color: 'var(--ink-4)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span className="mono">{q.t}</span>
        {q.comments?.length > 0 && <><span>·</span><span style={{ color: 'var(--ink-3)' }}>댓글 {q.comments.length}</span></>}
       </div>
      </article>
     ))}
    </div>
   </main>
  </div>
 );
};


Object.assign(window, { ScrThreadV14, ScrWordV14, ScrDayV14, ScrAuthorV14, ScrBookV14, ThreadCommentsV14 });
