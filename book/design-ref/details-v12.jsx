// ═════════════════════════════════════════════════════════════════════════
// DETAILS V12 — 완전 새 디자인
//   ScrThreadV12 — 타이트, 좌측 오렌지 바 앵커, 댓글/핀 인라인
//   ScrWordV12 — 분석 뷰 (timeline + 관련 단어 + 책장 + 하이라이트 카드)
//   ScrDayV12 — 시간 타임라인 (시각별 entries)
//   ScrAuthorV12 — 프로필 (이름 + 책 + 개인 클라우드 + 인용 카드)
//   ScrBookV12 — 책 상세 (간결)
// ═════════════════════════════════════════════════════════════════════════

// ─── 공통 breadcrumb
const Crumb = ({ path }) => (
 <div style={{ padding: '10px 32px', display: 'flex', alignItems: 'center', gap: 8, background: '#fff', fontSize: 12.5 }}>
  {path.map((p, i) => (
   <React.Fragment key={i}>
    {i > 0 && <Ic n="chev" sz={11} style={{ color: 'var(--ink-4)' }} />}
    {p.back ? (
     <Btn variant="ghost" size="sm" icon="arL" onClick={() => window.back()}>{p.label}</Btn>
    ) : i === path.length - 1 ? (
     <span style={{ fontWeight: 600, color: 'var(--ink-1)' }}>{p.label}</span>
    ) : (
     <span style={{ color: 'var(--ink-3)' }}>{p.label}</span>
    )}
   </React.Fragment>
  ))}
 </div>
);


// ═════════════════════════════════════════════════════════════════════════
// THREAD V12 — 어구록 클릭 = 같은 책의 어구록 스레드
// ═════════════════════════════════════════════════════════════════════════
const ScrThreadV12 = () => {
 const targetBookId = 1;
 const targetQuoteId = 1;
 const book = bookOf(targetBookId);
 const thread = QUOTES.filter(q => q.b === targetBookId).sort((a, b) => a.t.localeCompare(b.t));
 const totalComments = thread.reduce((s, q) => s + (q.comments?.length || 0), 0);
 const pinned = thread.filter(q => q.pin).length;

 return (
  <div className="bk" style={{ width: 1440, height: 900, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
   <TopBarV12 tab="excerpt" />
   <Crumb path={[{ label: '피드', back: true }, { label: book.t, last: true }]} />

   <main style={{ flex: 1, overflow: 'auto' }}>
    <div style={{ maxWidth: 740, padding: '28px 40px 100px' }}>

     {/* Slim book band — one line, no card */}
     <div className="book-row" style={{
      display: 'flex', alignItems: 'center', gap: 16,
      padding: '10px 12px', margin: '0 -12px 8px',
      borderRadius: 10, cursor: 'pointer',
     }}>
      <Cv b={book} scale={0.32} />
      <div style={{ flex: 1, minWidth: 0 }}>
       <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-.02em', lineHeight: 1.3 }}>{book.t}</div>
       <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 4, display: 'flex', gap: 12 }}>
        <span>{book.a}</span>
        <span>·</span>
        <span>{book.p}</span>
       </div>
      </div>
      <div style={{ display: 'flex', gap: 18, fontSize: 11.5, color: 'var(--ink-3)' }}>
       <span><b className="mono" style={{ color: 'var(--ink-1)', fontWeight: 700 }}>{thread.length}</b> 어구록</span>
       <span><b className="mono" style={{ color: 'var(--ink-1)', fontWeight: 700 }}>{totalComments}</b> 댓글</span>
      </div>
     </div>

     {/* Quote thread — tight, no dividers between items */}
     <div style={{ marginTop: 14 }}>
      {thread.map((q, i) => {
       const isAnchor = q.id === targetQuoteId;
       const cN = (q.comments || []).length;
       return (
        <article key={q.id} style={{
         position: 'relative',
         padding: isAnchor ? '22px 0 22px 24px' : '18px 0',
         marginLeft: isAnchor ? -24 : 0,
        }}>
         {/* Anchor bar */}
         {isAnchor && (
          <>
           <div style={{
            position: 'absolute', left: 0, top: 26, bottom: 26,
            width: 3, background: '#c2553a', borderRadius: 2,
           }} />
           <span style={{
            position: 'absolute', top: -3, left: 24,
            padding: '2px 8px',
            background: '#c2553a', color: '#fff',
            borderRadius: 99,
            fontFamily: 'var(--mono)', fontSize: 9.5, fontWeight: 600,
            letterSpacing: '.06em', textTransform: 'uppercase',
           }}>지금 본 어구록</span>
          </>
         )}

         {/* Quote body */}
         {q.pin ? (
          <div style={{ padding: '6px 0 8px' }}>
           <QuoteText text={q.text} fontSize={20} lineHeight={1.7} variant="flank" serif align="center" maxW={580} style={{ margin: '0 auto' }} />
          </div>
         ) : (
          <div style={{
           fontSize: 17.5, lineHeight: 1.7, fontWeight: 500, letterSpacing: '-.012em',
           color: 'var(--ink-1)', fontFamily: 'var(--sans)',
          }}>
           <span style={{ fontFamily: 'var(--serif)', color: 'var(--ink-4)' }}>“</span>
           {q.text}
           <span style={{ fontFamily: 'var(--serif)', color: 'var(--ink-4)' }}>”</span>
          </div>
         )}

         {/* Meta */}
         <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, fontSize: 11.5, color: 'var(--ink-4)', justifyContent: q.pin ? 'center' : 'flex-start' }}>
          {q.pin && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#c2553a', fontWeight: 600 }}><Ic n="pin" sz={11} st={1.8} />핀</span>}
          <span className="mono">{q.t}</span>
          {cN > 0 && <><span>·</span><span style={{ color: 'var(--ink-3)' }}>댓글 {cN}</span></>}
         </div>

         {/* Comments — inline indented, visible for any quote with comments */}
         {cN > 0 && (
          <div style={{
           marginTop: 14, marginLeft: q.pin ? 80 : 14,
           paddingLeft: 14, borderLeft: '2px solid rgba(184,181,170,0.4)',
           display: 'flex', flexDirection: 'column', gap: 12,
          }}>
           {q.comments.map((c, j) => (
            <div key={j}>
             <div style={{ fontSize: 13.5, lineHeight: 1.65, color: 'var(--ink-2)', letterSpacing: '-.005em' }}>{c.text}</div>
             <div className="mono" style={{ marginTop: 3, fontSize: 10.5, color: 'var(--ink-4)' }}>{c.who === 'y' ? `소연 · ${c.t}` : c.t}</div>
            </div>
           ))}
          </div>
         )}

         {/* Comment input only on anchor */}
         {isAnchor && (
          <div style={{
           marginTop: 18, padding: '9px 12px',
           background: '#fafaf7', borderRadius: 8,
           display: 'flex', gap: 10, alignItems: 'center',
          }}>
           <input placeholder="댓글 쓰기" style={{ flex: 1, border: 0, outline: 0, background: 'transparent', fontSize: 13.5, fontFamily: 'inherit' }} />
           <span className="kbd" style={{ fontSize: 10 }}>↵</span>
          </div>
         )}
        </article>
       );
      })}
     </div>

     {/* Add */}
     <button style={{
      marginTop: 24, width: '100%', padding: '14px',
      background: 'transparent', border: '1px dashed var(--line)',
      borderRadius: 10, color: 'var(--ink-3)', fontSize: 13.5, fontWeight: 500,
      cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
     }}>
      <Ic n="plus" sz={14} />이 책에 어구록 추가
     </button>
    </div>
   </main>
  </div>
 );
};


// ═════════════════════════════════════════════════════════════════════════
// WORD V12 — 분석 뷰 (timeline + 관련 단어 + 책 + 하이라이트 카드)
// ═════════════════════════════════════════════════════════════════════════
const ScrWordV12 = () => {
 const word = '시간';
 const monthly = [1, 2, 1, 3, 2, 4, 3, 5, 2, 4, 3, 2]; // 시간 단어 등장 추이
 const monthLabels = ['6월', '7월', '8월', '9월', '10월', '11월', '12월', '1월', '2월', '3월', '4월', '5월'];
 const monthMax = Math.max(...monthly);
 const related = [
  { w: '죽음', c: 8 }, { w: '거리', c: 7 }, { w: '사람', c: 6 },
  { w: '느림', c: 5 }, { w: '약', c: 5 }, { w: '환자', c: 4 },
  { w: '몰입', c: 3 }, { w: '기억', c: 3 }, { w: '돈', c: 3 },
 ];
 const books = [
  { b: bookOf(10), c: 8 }, { b: bookOf(1), c: 6 }, { b: bookOf(9), c: 5 },
  { b: bookOf(3), c: 4 }, { b: bookOf(8), c: 4 }, { b: bookOf(13), c: 3 },
 ];
 const samples = [
  { text: '우리가 환자에게 줄 수 있는 가장 큰 것은 시간이라는 것을. 약이 아니라.', book: bookOf(10), t: '2026.05.11 22:45' },
  { text: '오래 일하다 보면 알게 된다. 시간은 가장 비싼 자원이다.', book: bookOf(10), t: '2026.05.08 07:10' },
  { text: '시간을 길게 쓰는 사람은 같은 거리를 더 깊이 본다.', book: bookOf(1), t: '2026.04.24 11:25' },
  { text: '돈은 살 수 있는 시간이고, 가장 비싼 자유다.', book: bookOf(9), t: '2026.03.18 09:20' },
  { text: '시간은 흐른다. 우리는 그 위에 떠 있을 뿐이다.', book: bookOf(3), t: '2026.02.04 22:11' },
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
   <TopBarV12 tab="stats" />
   <Crumb path={[{ label: '통계', back: true }, { label: '단어' }, { label: word }]} />

   <main style={{ flex: 1, overflow: 'auto' }}>
    <div style={{ maxWidth: 1080, padding: '40px 40px 100px' }}>

     {/* Hero — word massive + inline stats */}
     <section style={{ display: 'flex', gap: 60, alignItems: 'flex-start', marginBottom: 48 }}>
      <h1 style={{
       margin: 0, fontSize: 120, fontWeight: 800, letterSpacing: '-.045em', lineHeight: 0.95,
       fontFamily: 'var(--serif)',
      }}>{word}</h1>
      <div style={{ paddingTop: 20, flex: 1 }}>
       <div style={{ display: 'grid', gridTemplateColumns: 'auto auto auto auto', gap: '8px 36px', fontSize: 13 }}>
        <span style={{ color: 'var(--ink-3)' }}>등장</span>
        <span style={{ color: 'var(--ink-3)' }}>책</span>
        <span style={{ color: 'var(--ink-3)' }}>작가</span>
        <span style={{ color: 'var(--ink-3)' }}>기간</span>
        <span className="mono" style={{ fontSize: 26, fontWeight: 700, color: 'var(--ink-1)', letterSpacing: '-.025em', lineHeight: 1 }}>32<span style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 500, fontFamily: 'var(--sans)', marginLeft: 3 }}>회</span></span>
        <span className="mono" style={{ fontSize: 26, fontWeight: 700, color: 'var(--ink-1)', letterSpacing: '-.025em', lineHeight: 1 }}>9<span style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 500, fontFamily: 'var(--sans)', marginLeft: 3 }}>권</span></span>
        <span className="mono" style={{ fontSize: 26, fontWeight: 700, color: 'var(--ink-1)', letterSpacing: '-.025em', lineHeight: 1 }}>6<span style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 500, fontFamily: 'var(--sans)', marginLeft: 3 }}>명</span></span>
        <span className="mono" style={{ fontSize: 13, color: 'var(--ink-2)', fontWeight: 600, alignSelf: 'end', lineHeight: 1.6 }}>2024.11 ~ 오늘</span>
       </div>
      </div>
     </section>

     {/* Timeline + related words side by side */}
     <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 48, marginBottom: 48 }}>
      <section>
       <div className="upper" style={{ marginBottom: 18 }}>등장 추이 · 12개월</div>
       <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 120, padding: '4px 0' }}>
        {monthly.map((v, i) => {
         const cur = i === monthly.length - 1;
         return (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
           <span className="mono" style={{ fontSize: 10, color: cur ? 'var(--ink-1)' : 'var(--ink-4)', fontWeight: cur ? 700 : 500, opacity: v === 0 ? 0 : 1 }}>{v || ''}</span>
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
       <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
        {monthLabels.map((m, i) => <span key={i} className="mono" style={{ flex: 1, textAlign: 'center', fontSize: 10, color: 'var(--ink-4)' }}>{m}</span>)}
       </div>
      </section>

      <section>
       <div className="upper" style={{ marginBottom: 18 }}>함께 자주 등장</div>
       <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {related.map(r => (
         <span key={r.w} className="book-row" style={{
          display: 'inline-flex', alignItems: 'baseline', gap: 6,
          padding: '7px 14px',
          background: 'var(--paper)', borderRadius: 99,
          fontSize: 13.5, fontWeight: 600, color: 'var(--ink-1)',
          cursor: 'pointer',
         }}>
          {r.w}<span className="mono" style={{ fontSize: 11, fontWeight: 500, color: 'var(--ink-3)' }}>{r.c}</span>
         </span>
        ))}
       </div>
      </section>
     </div>

     {/* Books with this word */}
     <section style={{ marginBottom: 48 }}>
      <div className="upper" style={{ marginBottom: 18 }}>책 · {books.length}</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 26, paddingBottom: 6, overflowX: 'auto' }}>
       {books.map(t => (
        <div key={t.b.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, cursor: 'pointer', flexShrink: 0 }}>
         <div style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.08))' }}>
          <Cv b={t.b} scale={0.5} lift={false} />
         </div>
         <div style={{ textAlign: 'center' }}>
          <span className="mono" style={{ fontSize: 12, fontWeight: 700, color: t.c >= 5 ? '#c2553a' : 'var(--ink-1)' }}>{t.c}</span>
          <span style={{ fontSize: 11, color: 'var(--ink-3)', marginLeft: 3 }}>회</span>
         </div>
        </div>
       ))}
      </div>
     </section>

     {/* Quote cards with highlight */}
     <section>
      <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 18 }}>
       <span className="upper">어구록 · 32</span>
       <div style={{ flex: 1 }} />
       <Btn variant="ghost" size="sm" iconR="chevD">최근순</Btn>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
       {samples.map((s, i) => (
        <div key={i} className="book-row" style={{
         padding: '14px 12px', margin: '0 -12px', borderRadius: 10,
         display: 'flex', gap: 18, alignItems: 'flex-start', cursor: 'pointer',
        }}>
         <div style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.07))', flexShrink: 0 }}>
          <Cv b={s.book} scale={0.26} lift={false} />
         </div>
         <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, lineHeight: 1.65, fontWeight: 500, fontFamily: 'var(--sans)' }}>
           <span style={{ color: 'var(--ink-4)', fontFamily: 'var(--serif)' }}>“</span>
           {hl(s.text)}
           <span style={{ color: 'var(--ink-4)', fontFamily: 'var(--serif)' }}>”</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, fontSize: 11.5, color: 'var(--ink-4)' }}>
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


// ═════════════════════════════════════════════════════════════════════════
// DAY V12 — 시간 타임라인 (vertical hour rail)
// ═════════════════════════════════════════════════════════════════════════
const ScrDayV12 = () => {
 // 5월 14일 — 어구록 4개
 const entries = [
  { h: 9,  m: 15, q: QUOTES[5], book: bookOf(9) },  // 돈의 심리학 - 09:15
  { h: 14, m: 30, q: QUOTES[6], book: bookOf(9) },  // 돈의 심리학 (시간 적당히 분산)
  { h: 21, m: 8,  q: QUOTES[4], book: bookOf(3) },  // 작별하지 않는다 - 21:08
  { h: 23, m: 14, q: QUOTES[3], book: bookOf(8) },  // 몰입 - 23:14
 ];
 const hourSlots = [6, 9, 12, 15, 18, 21, 24];

 return (
  <div className="bk" style={{ width: 1440, height: 900, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
   <TopBarV12 tab="stats" />
   <Crumb path={[{ label: '캘린더', back: true }, { label: '2026년 5월' }, { label: '5월 14일' }]} />

   <main style={{ flex: 1, overflow: 'auto' }}>
    <div style={{ maxWidth: 980, padding: '40px 40px 100px' }}>

     {/* Hero — date typography composition */}
     <section style={{ display: 'flex', alignItems: 'flex-end', gap: 36, marginBottom: 44 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
       <span style={{ fontFamily: 'var(--mono)', fontSize: 140, fontWeight: 700, letterSpacing: '-.045em', lineHeight: 0.85, color: 'var(--ink-1)' }}>14</span>
       <div style={{ paddingBottom: 10 }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--ink-3)', letterSpacing: '.04em', textTransform: 'uppercase' }}>2026.05</div>
        <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-.025em', marginTop: 4 }}>목요일</div>
       </div>
      </div>
      <div style={{ flex: 1 }} />
      <div style={{ display: 'flex', gap: 36, paddingBottom: 14 }}>
       <div>
        <div style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 6 }}>어구록</div>
        <div style={{ fontSize: 26, fontWeight: 700, fontFamily: 'var(--mono)', letterSpacing: '-.025em' }}>4</div>
       </div>
       <div>
        <div style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 6 }}>책</div>
        <div style={{ fontSize: 26, fontWeight: 700, fontFamily: 'var(--mono)', letterSpacing: '-.025em' }}>3</div>
       </div>
       <div>
        <div style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 6 }}>요일 평균</div>
        <div style={{ fontSize: 18, fontWeight: 600, fontFamily: 'var(--mono)', color: 'var(--ink-3)', marginTop: 4 }}>3.2</div>
       </div>
      </div>
     </section>

     {/* Hour timeline */}
     <section style={{ position: 'relative', paddingLeft: 76 }}>
      {/* Hour rail */}
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 76 }}>
       {hourSlots.map((h, i) => {
        const top = (h - 6) / 18 * 100;
        return (
         <div key={h} style={{
          position: 'absolute',
          top: `${top}%`,
          left: 0, right: 16,
          display: 'flex', alignItems: 'center', gap: 8,
         }}>
          <span className="mono" style={{ fontSize: 11, color: 'var(--ink-4)', fontWeight: 500 }}>{h.toString().padStart(2, '0')}</span>
          <div style={{ flex: 1, height: 1, background: 'var(--line-2)' }} />
         </div>
        );
       })}
       {/* Continuous vertical line on the right */}
       <div style={{
        position: 'absolute', right: 12, top: 8, bottom: 8,
        width: 1, background: 'var(--line-2)',
       }} />
      </div>

      {/* Entries positioned by hour */}
      <div style={{ position: 'relative', minHeight: 640 }}>
       {entries.map((e, i) => {
        const top = ((e.h + e.m / 60) - 6) / 18 * 640; // 640px = total height for 6h-24h
        return (
         <div key={i} className="book-row" style={{
          position: 'absolute',
          top: `${top - 24}px`, left: 0, right: 0,
          padding: '14px 16px', borderRadius: 12,
          background: '#fff',
          border: '1px solid var(--line-2)',
          boxShadow: '0 1px 2px rgba(20,18,14,0.03), 0 8px 24px -12px rgba(20,18,14,0.08)',
          cursor: 'pointer',
         }}>
          {/* Time marker on left edge */}
          <div style={{
           position: 'absolute', left: -67, top: 20,
           width: 12, height: 12, borderRadius: 50,
           background: '#fff', border: '2px solid #c2553a',
          }} />

          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
           <Cv b={e.book} scale={0.24} />
           <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
             <span className="mono" style={{ fontSize: 13, fontWeight: 700, color: '#c2553a' }}>{e.h.toString().padStart(2, '0')}:{e.m.toString().padStart(2, '0')}</span>
             <span style={{ fontSize: 11.5, color: 'var(--ink-3)', fontWeight: 600 }}>{e.book.t}</span>
            </div>
            <div style={{
             fontSize: 15, lineHeight: 1.65, fontWeight: 500,
             display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
            }}>
             <span style={{ color: 'var(--ink-4)', fontFamily: 'var(--serif)' }}>“</span>
             {e.q.text}
             <span style={{ color: 'var(--ink-4)', fontFamily: 'var(--serif)' }}>”</span>
            </div>
            {e.q.comments?.length > 0 && (
             <div style={{ marginTop: 8, fontSize: 11, color: 'var(--ink-3)' }}>댓글 {e.q.comments.length}</div>
            )}
           </div>
          </div>
         </div>
        );
       })}
      </div>
     </section>
    </div>
   </main>
  </div>
 );
};


// ═════════════════════════════════════════════════════════════════════════
// AUTHOR V12 — 프로필 뷰 (이름 + 책 + 개인 단어 + 인용 카드)
// ═════════════════════════════════════════════════════════════════════════
const ScrAuthorV12 = () => {
 const author = '카를 고틀로프 셸레';
 const list = QUOTES.filter(q => bookOf(q.b).a === author);
 const books = BOOKS.filter(b => b.a === author);
 // 작가별 단어 (가짜 데이터)
 const authorWords = [
  ['걷기', 32], ['시간', 24], ['풍경', 18], ['사유', 16], ['거리', 14],
  ['느림', 12], ['속도', 10], ['공간', 9], ['길', 8], ['빛', 7],
  ['바람', 6], ['몸', 6], ['생각', 5], ['끝', 5], ['시작', 4],
  ['새벽', 4], ['도시', 3], ['숨', 3], ['손', 3], ['눈', 2],
 ];

 return (
  <div className="bk" style={{ width: 1440, height: 900, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
   <TopBarV12 tab="excerpt" />
   <Crumb path={[{ label: '피드', back: true }, { label: '작가' }, { label: author }]} />

   <main style={{ flex: 1, overflow: 'auto' }}>
    <div style={{ maxWidth: 1080, padding: '40px 40px 100px' }}>

     {/* Hero — name + meta */}
     <section style={{ marginBottom: 48, display: 'flex', alignItems: 'flex-end', gap: 40 }}>
      <div style={{ flex: 1 }}>
       <div className="upper" style={{ marginBottom: 12 }}>작가</div>
       <h1 style={{ margin: 0, fontSize: 56, fontWeight: 800, letterSpacing: '-.035em', lineHeight: 1.05, fontFamily: 'var(--serif)' }}>{author}</h1>
       <div style={{ marginTop: 20, fontSize: 13, color: 'var(--ink-3)', display: 'flex', gap: 12, alignItems: 'baseline' }}>
        <span style={{ color: 'var(--ink-2)', fontWeight: 500 }}>{books[0]?.p}</span>
        <span>·</span>
        <span>{books[0]?.c}</span>
       </div>
      </div>
      <div style={{ display: 'flex', gap: 36, paddingBottom: 8 }}>
       {[[books.length, '권'], [list.length, '어구록'], ['2025.11', '첫'], ['오늘', '최근']].map(([n, l]) => (
        <div key={l}>
         <div style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 6 }}>{l}</div>
         <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--mono)', letterSpacing: '-.025em', lineHeight: 1 }}>{n}</div>
        </div>
       ))}
      </div>
     </section>

     {/* Books — author's books in library */}
     <section style={{ marginBottom: 48 }}>
      <div className="upper" style={{ marginBottom: 18 }}>책 · {books.length}</div>
      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-end' }}>
       {books.map(b => (
        <div key={b.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
         <div style={{ filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.10))' }}>
          <Cv b={b} scale={0.85} lift={false} />
         </div>
         <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '-.012em' }}>{b.t}</div>
          <div className="mono" style={{ fontSize: 11, color: '#c2553a', marginTop: 4 }}>어구록 {list.filter(q => q.b === b.id).length}</div>
         </div>
        </div>
       ))}
      </div>
     </section>

     {/* Author's personal word cloud */}
     <section style={{ marginBottom: 48 }}>
      <div className="upper" style={{ marginBottom: 14 }}>이 작가의 단어</div>
      <div style={{
       padding: '24px 28px',
       background: '#fafaf7',
       borderRadius: 14,
      }}>
       <WordCloud W={960} H={200} words={authorWords} scale={0.7} />
      </div>
     </section>

     {/* Quote stream */}
     <section>
      <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 18 }}>
       <span className="upper">어구록 · {list.length}</span>
       <div style={{ flex: 1 }} />
       <Btn variant="ghost" size="sm" iconR="chevD">최근순</Btn>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
       {list.map((q, i) => (
        <article key={q.id} className="book-row" style={{
         padding: '16px 12px', margin: '0 -12px', borderRadius: 10, cursor: 'pointer',
        }}>
         <div style={{
          fontSize: 16.5, lineHeight: 1.65, fontWeight: q.pin ? 600 : 500, letterSpacing: '-.012em',
         }}>
          <span style={{ color: 'var(--ink-4)', fontFamily: 'var(--serif)' }}>“</span>
          {q.text}
          <span style={{ color: 'var(--ink-4)', fontFamily: 'var(--serif)' }}>”</span>
         </div>
         <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, fontSize: 11.5, color: 'var(--ink-4)' }}>
          {q.pin && <span style={{ color: '#c2553a', fontWeight: 600, display: 'inline-flex', gap: 4, alignItems: 'center' }}><Ic n="pin" sz={11} st={1.8} />핀</span>}
          <span className="mono">{q.t}</span>
          {q.comments?.length > 0 && <><span>·</span><span style={{ color: 'var(--ink-3)' }}>댓글 {q.comments.length}</span></>}
         </div>
        </article>
       ))}
      </div>
     </section>
    </div>
   </main>
  </div>
 );
};


// ═════════════════════════════════════════════════════════════════════════
// BOOK V12 — 간결한 책 상세 (스레드와 구분: 메타·통계 중심)
// ═════════════════════════════════════════════════════════════════════════
const ScrBookV12 = () => {
 const b = bookOf(1);
 const list = QUOTES.filter(q => q.b === b.id);
 return (
  <div className="bk" style={{ width: 1440, height: 900, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
   <TopBarV12 tab="excerpt" />
   <Crumb path={[{ label: '피드', back: true }, { label: '책' }, { label: b.t }]} />

   <main style={{ flex: 1, overflow: 'auto' }}>
    <div style={{ maxWidth: 1000, padding: '40px 40px 100px' }}>
     <section style={{ display: 'flex', gap: 44, alignItems: 'flex-start', marginBottom: 36 }}>
      <div style={{ filter: 'drop-shadow(0 8px 24px rgba(0,0,0,0.14)) drop-shadow(0 2px 6px rgba(0,0,0,0.06))' }}>
       <Cv b={b} scale={1.15} lift={false} />
      </div>
      <div style={{ flex: 1, paddingTop: 6 }}>
       <div className="upper" style={{ marginBottom: 12 }}>{b.c}</div>
       <h1 style={{ margin: 0, fontSize: 34, fontWeight: 700, letterSpacing: '-.03em', lineHeight: 1.15 }}>{b.t}</h1>
       <div style={{ fontSize: 14.5, color: 'var(--ink-3)', marginTop: 8, fontWeight: 500 }}>{b.sub}</div>
       <div style={{ fontSize: 13, color: 'var(--ink-2)', marginTop: 18, display: 'flex', gap: 12 }}>
        <span style={{ fontWeight: 600 }}>{b.a}</span><span style={{ color: 'var(--ink-4)' }}>·</span>
        <span>{b.p}</span><span style={{ color: 'var(--ink-4)' }}>·</span>
        <span>{b.y}</span>
       </div>
       <div style={{ marginTop: 24, display: 'flex', gap: 36, alignItems: 'baseline' }}>
        {[[list.length, '어구록'], [3, '댓글'], [1, '핀'], ['3주', '처음']].map(([n, l]) => (
         <div key={l}>
          <span style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-.025em', lineHeight: 1, fontFamily: 'var(--mono)' }}>{n}</span>
          <span style={{ fontSize: 12, color: 'var(--ink-3)', marginLeft: 5 }}>{l}</span>
         </div>
        ))}
        <div style={{ flex: 1 }} />
        <Btn variant="pri" size="md" icon="plus">어구록</Btn>
       </div>
      </div>
     </section>

     {/* Excerpt list — clickable, truncated rows leading to thread */}
     <div className="upper" style={{ marginBottom: 14 }}>어구록 · 시간순</div>
     <div style={{ display: 'flex', flexDirection: 'column' }}>
      {list.map(q => (
       <article key={q.id} className="book-row" style={{
        padding: '14px 12px', margin: '0 -12px', borderRadius: 10, cursor: 'pointer',
       }}>
        {q.pin && (
         <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#c2553a', fontWeight: 600, marginBottom: 5 }}>
          <Ic n="pin" sz={11} st={1.8} />핀
         </div>
        )}
        <div style={{
         fontSize: 16, lineHeight: 1.65, fontWeight: q.pin ? 600 : 500, letterSpacing: '-.012em',
         display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>
         <span style={{ color: 'var(--ink-4)', fontFamily: 'var(--serif)' }}>“</span>
         {q.text}
         <span style={{ color: 'var(--ink-4)', fontFamily: 'var(--serif)' }}>”</span>
        </div>
        <div style={{ marginTop: 7, fontSize: 11.5, color: 'var(--ink-4)', display: 'flex', alignItems: 'center', gap: 10 }}>
         <span className="mono">{q.t}</span>
         {q.comments?.length > 0 && <><span>·</span><span style={{ color: 'var(--ink-3)' }}>댓글 {q.comments.length}</span></>}
        </div>
       </article>
      ))}
     </div>
    </div>
   </main>
  </div>
 );
};


Object.assign(window, { ScrThreadV12, ScrWordV12, ScrDayV12, ScrAuthorV12, ScrBookV12, Crumb });
