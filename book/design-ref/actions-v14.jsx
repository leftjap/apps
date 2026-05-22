// ═════════════════════════════════════════════════════════════════════════
// ACTIONS V14 — kbd 표기 제거, pin 토스트 제거 (인라인 피드백)
// ═════════════════════════════════════════════════════════════════════════

const FeedBaseDimV14 = () => {
 const groups = groupQuotes(QUOTES.slice(0, 6));
 return (
  <main style={{ flex: 1, overflow: 'hidden', opacity: 0.32, pointerEvents: 'none' }}>
   <div className="feed-grid" style={{
    padding: '36px 36px 100px',
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 660px) 340px',
    gap: 56, maxWidth: 1160, justifyContent: 'start',
   }}>
    <div>
     <div style={{ marginBottom: 28, display: 'flex', alignItems: 'baseline' }}>
      <h1 style={{ margin: 0, fontSize: 32, fontWeight: 700, letterSpacing: '-.028em', lineHeight: 1 }}>어구록</h1>
      <span className="mono" style={{ fontSize: 14, color: 'var(--ink-3)', marginLeft: 12 }}>184</span>
     </div>
     {groups.map((g, i) => {
      const b = bookOf(g.b);
      return (
       <section key={i} style={{ margin: '0 0 32px' }}>
        <BookRowV14 b={b} count={g.q.length} />
        <div style={{ marginTop: 6, marginLeft: 86 }}>
         {g.q.map(q => <QuoteRowV14 key={q.id} q={q} />)}
        </div>
       </section>
      );
     })}
    </div>
    <aside style={{ paddingTop: 58 }}>
     <StreakCardV14 days={12} longest={27} dailyAvg={0.9} lastEntry="오늘 14:32" weekHits={[1,1,1,1,1,0,0]} todayDow={4} />
    </aside>
   </div>
  </main>
 );
};


// ─── 어구록 추가
const ScrAddV14 = () => (
 <div className="bk" style={{ width: 1440, height: 900, overflow: 'hidden', position: 'relative', display: 'flex', flexDirection: 'column' }}>
  <TopBarV14 tab="excerpt" />
  <FeedBaseDimV14 />
  <ModalV14
   onClose={() => window.back()}
   title="새 어구록"
   subtitle={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 5, height: 5, borderRadius: 50, background: '#c2553a' }} />붙여넣기 감지</span>}
   width={640}
   footer={<>
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
     <span style={{ width: 16, height: 16, borderRadius: 4, border: '1.5px solid var(--ink-4)', background: '#fff' }} />
     <span style={{ color: 'var(--ink-2)' }}>핀으로 두기</span>
    </label>
    <div style={{ flex: 1 }} />
    <Btn variant="ghost" size="md" onClick={() => window.back()}>취소</Btn>
    <Btn variant="pri" size="md" onClick={() => window.back()}>저장</Btn>
   </>}
  >
   <div style={{ padding: '22px 26px 26px' }}>
    <div className="upper" style={{ marginBottom: 10 }}>책</div>
    <div className="book-row" style={{
     display: 'flex', alignItems: 'center', gap: 16,
     padding: '10px 12px', margin: '0 -12px', borderRadius: 10, cursor: 'pointer',
    }}>
     <Cv b={bookOf(1)} scale={0.32} />
     <div style={{ flex: 1 }}>
      <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-.018em' }}>{bookOf(1).t}</div>
      <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 4 }}>{bookOf(1).a}</div>
     </div>
     <Btn variant="ghost" size="sm" iconR="chev" style={{ color: 'var(--ink-3)' }}>변경</Btn>
    </div>

    <div className="upper" style={{ marginTop: 24, marginBottom: 10 }}>어구록</div>
    <div style={{
     border: '1.5px solid var(--ink-1)',
     borderRadius: 12,
     padding: '18px 20px',
     minHeight: 160,
     fontSize: 16.5, lineHeight: 1.7, fontWeight: 500, letterSpacing: '-.012em',
    }}>
     <span style={{ color: 'var(--ink-4)', fontFamily: 'var(--serif)' }}>“</span>
     걷는 동안 나는 풍경에 속한다. 풍경이 나를 통과해 지나간다. 그 순간 만큼은, 풍경과 나 사이에는 아무런 거리도 없다.
     <span style={{ color: 'var(--ink-4)', fontFamily: 'var(--serif)' }}>”</span>
     <span style={{ display: 'inline-block', width: 1.5, height: '1em', background: 'var(--ink-1)', verticalAlign: 'middle', marginLeft: 2, animation: 'blink 1s infinite' }} />
    </div>
    <div style={{ marginTop: 8, fontSize: 12, color: 'var(--ink-3)' }} className="mono">74자</div>

    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 24, marginBottom: 10 }}>
     <span className="upper">첫 댓글</span>
     <span style={{ fontSize: 11.5, color: 'var(--ink-4)' }}>(선택)</span>
    </div>
    <div style={{
     padding: '14px 16px',
     background: '#fafaf7', borderRadius: 8,
     fontSize: 14, lineHeight: 1.6, color: 'var(--ink-3)',
    }}>
     이 어구록에 대한 내 생각을 함께 남겨두세요.
    </div>
   </div>
  </ModalV14>
 </div>
);


// ─── 어구록 수정
const ScrEditV14 = () => (
 <div className="bk" style={{ width: 1440, height: 900, overflow: 'hidden', position: 'relative', display: 'flex', flexDirection: 'column' }}>
  <TopBarV14 tab="excerpt" />
  <FeedBaseDimV14 />
  <ModalV14
   onClose={() => window.back()}
   title="어구록 수정"
   subtitle="마지막 수정 · 오늘 14:32"
   width={640}
   footer={<>
    <Btn variant="ghost" size="sm" icon="trash" style={{ color: '#c2553a' }} onClick={() => window.go('delete')}>삭제</Btn>
    <div style={{ flex: 1 }} />
    <Btn variant="ghost" size="md" onClick={() => window.back()}>취소</Btn>
    <Btn variant="pri" size="md" onClick={() => window.back()}>저장</Btn>
   </>}
  >
   <div style={{ padding: '22px 26px 26px' }}>
    <div className="upper" style={{ marginBottom: 10 }}>책</div>
    <div className="book-row" style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '10px 12px', margin: '0 -12px', borderRadius: 10 }}>
     <Cv b={bookOf(1)} scale={0.32} />
     <div style={{ flex: 1 }}>
      <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-.018em' }}>{bookOf(1).t}</div>
      <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 4 }}>{bookOf(1).a}</div>
     </div>
    </div>

    <div className="upper" style={{ marginTop: 24, marginBottom: 10 }}>어구록</div>
    <div style={{
     border: '1.5px solid var(--ink-1)',
     borderRadius: 12,
     padding: '18px 20px',
     minHeight: 160,
     fontSize: 16.5, lineHeight: 1.7, fontWeight: 500, letterSpacing: '-.012em',
    }}>
     <span style={{ color: 'var(--ink-4)', fontFamily: 'var(--serif)' }}>“</span>
     걷는 동안 나는 풍경에 속한다. 풍경이 나를 통과해 지나간다. 그 순간 만큼은, 풍경과 나 사이에는 아무런 거리도 없다.<span style={{ display: 'inline-block', width: 1.5, height: '1em', background: 'var(--ink-1)', verticalAlign: 'middle', marginLeft: 2, animation: 'blink 1s infinite' }} />
     <span style={{ color: 'var(--ink-4)', fontFamily: 'var(--serif)' }}>”</span>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', marginTop: 8 }}>
     <span className="mono" style={{ fontSize: 12, color: 'var(--ink-3)' }}>74자</span>
     <div style={{ flex: 1 }} />
     <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>3개의 댓글 보존</span>
    </div>
   </div>
  </ModalV14>
 </div>
);


// ─── 삭제 확인
const ScrDeleteV14 = () => (
 <div className="bk" style={{ width: 1440, height: 900, overflow: 'hidden', position: 'relative', display: 'flex', flexDirection: 'column' }}>
  <TopBarV14 tab="excerpt" />
  <FeedBaseDimV14 />
  <div style={{
   position: 'absolute', inset: 0, background: 'rgba(20,18,14,.36)',
   display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 30,
  }}>
   <div style={{
    width: 440, background: '#fff', borderRadius: 14,
    boxShadow: '0 4px 12px -2px rgba(20,18,14,.10), 0 24px 60px -16px rgba(20,18,14,.32)',
    padding: '26px 28px',
   }}>
    <div style={{
     width: 40, height: 40, borderRadius: 50,
     background: 'rgba(194,85,58,0.10)', color: '#c2553a',
     display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
     marginBottom: 18,
    }}>
     <Ic n="trash" sz={20} st={1.8} />
    </div>
    <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: '-.02em' }}>어구록을 삭제하시겠어요?</h3>
    <p style={{ margin: '8px 0 20px', fontSize: 13.5, color: 'var(--ink-3)', lineHeight: 1.65 }}>
     이 어구록과 함께 댓글 <b style={{ color: 'var(--ink-2)' }} className="mono">3</b>개도 삭제됩니다. 되돌릴 수 없습니다.
    </p>
    <div style={{ padding: '14px 16px', background: 'var(--paper)', borderRadius: 8, marginBottom: 24 }}>
     <div style={{
      fontSize: 13.5, lineHeight: 1.6, color: 'var(--ink-2)',
      display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
     }}>
      <span style={{ color: 'var(--ink-4)', fontFamily: 'var(--serif)' }}>“</span>
      걷는 동안 나는 풍경에 속한다. 풍경이 나를 통과해 지나간다.
      <span style={{ color: 'var(--ink-4)', fontFamily: 'var(--serif)' }}>”</span>
     </div>
    </div>
    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
     <Btn variant="sec" size="md" onClick={() => window.back()}>취소</Btn>
     <Btn variant="warm" size="md" onClick={() => window.goRoot('feed')}>삭제</Btn>
    </div>
   </div>
  </div>
 </div>
);


// ─── 핀 토글 — 인라인 피드백 (토스트 폐기)
// 토글 후 상태: 핀 아이콘이 채워지고 오렌지로 변함. 별도 알림 없음.
const ScrPinV14 = () => {
 const groups = groupQuotes(QUOTES.slice(0, 6));
 // simulate q.id===2 just got pinned
 return (
  <div className="bk" style={{ width: 1440, height: 900, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
   <TopBarV14 tab="excerpt" />
   <main style={{ flex: 1, overflow: 'hidden' }}>
    <div className="feed-grid" style={{
     padding: '36px 36px 100px',
     display: 'grid', gridTemplateColumns: 'minmax(0, 660px) 340px',
     gap: 56, maxWidth: 1160, justifyContent: 'start',
    }}>
     <div>
      <div style={{ marginBottom: 28, display: 'flex', alignItems: 'baseline' }}>
       <h1 style={{ margin: 0, fontSize: 32, fontWeight: 700, letterSpacing: '-.028em', lineHeight: 1 }}>어구록</h1>
       <span className="mono" style={{ fontSize: 14, color: 'var(--ink-3)', marginLeft: 12 }}>184</span>
      </div>
      {groups.map((g, i) => {
       const b = bookOf(g.b);
       return (
        <section key={i} style={{ margin: '0 0 32px' }}>
         <BookRowV14 b={b} count={g.q.length} />
         <div style={{ marginTop: 6, marginLeft: 86 }}>
          {g.q.map(q => {
           const pinned = q.id === 2 || q.pin;
           const newlyPinned = q.id === 2;
           return (
            <div key={q.id} className="quote-row" style={{
             padding: '12px 12px 14px', margin: '0 -12px', borderRadius: 8,
             cursor: 'pointer',
             // newly pinned has subtle warm tint
             background: newlyPinned ? 'rgba(194,85,58,0.045)' : 'transparent',
            }}>
             <div style={{
              fontSize: 16, lineHeight: 1.65, fontWeight: pinned ? 600 : 500, letterSpacing: '-.012em',
              display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
             }}>
              <span style={{ fontFamily: 'var(--serif)', color: 'var(--ink-4)' }}>“</span>
              {q.text}
              <span style={{ fontFamily: 'var(--serif)', color: 'var(--ink-4)' }}>”</span>
             </div>
             <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 7 }}>
              {pinned && (
               <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: '#c2553a', fontWeight: 600 }}>
                <Ic n="pin" sz={11.5} st={1.8} />핀
                {newlyPinned && <span style={{
                 marginLeft: 4,
                 padding: '1px 6px', borderRadius: 99,
                 background: '#c2553a', color: '#fff',
                 fontSize: 9.5, fontWeight: 700, letterSpacing: '.04em',
                }}>NEW</span>}
               </span>
              )}
              <span className="mono" style={{ fontSize: 11.5, color: 'var(--ink-4)' }}>{q.t.slice(0, 10)} {q.t.slice(11, 16)}</span>
              <div style={{ flex: 1 }} />
              {newlyPinned && (
               <div style={{ display: 'inline-flex', gap: 2 }}>
                <button className="ico-btn" style={{ width: 28, height: 28, borderRadius: 6, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(194,85,58,0.12)', border: 0, color: '#c2553a' }}><Ic n="pin" sz={14} st={1.8} /></button>
                <button className="ico-btn" style={{ width: 28, height: 28, borderRadius: 6, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 0, color: 'var(--ink-3)' }}><Ic n="edit" sz={13} /></button>
                <button className="ico-btn" style={{ width: 28, height: 28, borderRadius: 6, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 0, color: 'var(--ink-3)' }}><Ic n="dots-v" sz={13} /></button>
               </div>
              )}
             </div>
            </div>
           );
          })}
         </div>
        </section>
       );
      })}
     </div>
     <aside style={{ paddingTop: 58 }}>
      <StreakCardV14 days={12} longest={27} dailyAvg={0.9} lastEntry="오늘 14:32" weekHits={[1,1,1,1,1,0,0]} todayDow={4} />
     </aside>
    </div>
   </main>
  </div>
 );
};


// ─── 댓글 추가 후 (NEW 표시, no toast)
const ScrCommentPostedV14 = () => {
 const targetBookId = 1;
 const book = bookOf(targetBookId);
 const thread = QUOTES.filter(q => q.b === targetBookId).sort((a, b) => a.t.localeCompare(b.t));
 const totalComments = thread.reduce((s, q) => s + (q.comments?.length || 0), 0) + 1;
 const pinned = thread.filter(q => q.pin).length;
 const newComment = { who: 'me', t: '오늘 23:08', text: '결국 풍경이 나에게 무엇을 가르치는 게 아니라, 풍경 안에 있는 동안 무언가 사라진다는 느낌. 그게 좋다.', isNew: true };

 return (
  <div className="bk" style={{ width: 1440, height: 900, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
   <TopBarV14 tab="excerpt" />
   <Crumb path={[{ label: '피드', back: true }, { label: book.t, last: true }]} />
   <main style={{ flex: 1, overflow: 'auto' }}>
    <div style={{ maxWidth: 780, padding: '32px 44px 100px' }}>
     <div className="book-row" style={{
      display: 'flex', alignItems: 'center', gap: 18,
      padding: '10px 12px', margin: '0 -12px 20px', borderRadius: 10, cursor: 'pointer',
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

     {(() => {
      const q = QUOTES[0];
      const augmented = [...(q.comments || []), newComment];
      return (
       <article style={{ position: 'relative', padding: '22px 0 24px 24px', marginLeft: -24 }}>
        <div style={{ position: 'absolute', left: 0, top: 26, bottom: 26, width: 3, background: '#c2553a', borderRadius: 2 }} />
        <span style={{ position: 'absolute', top: -2, left: 24, padding: '3px 10px', background: '#c2553a', color: '#fff', borderRadius: 99, fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase' }}>지금 본 어구록</span>
        <div style={{ fontSize: 18, lineHeight: 1.7, fontWeight: 500, letterSpacing: '-.012em', color: 'var(--ink-1)', fontFamily: 'var(--sans)' }}>
         <span style={{ fontFamily: 'var(--serif)', color: 'var(--ink-4)' }}>“</span>
         {q.text}
         <span style={{ fontFamily: 'var(--serif)', color: 'var(--ink-4)' }}>”</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10, fontSize: 12, color: 'var(--ink-4)' }}>
         <span className="mono">{q.t}</span>
         <span>·</span>
         <span style={{ color: 'var(--ink-3)' }}>댓글 {augmented.length}</span>
        </div>

        {/* Comments with new highlighted */}
        <div style={{ marginTop: 18 }}>
         {augmented.map((c, i) => {
          const me = c.who !== 'y';
          const isLast = i === augmented.length - 1;
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
            <div style={{ flex: 1, minWidth: 0, paddingBottom: isLast ? 0 : 16 }}>
             {c.isNew ? (
              <div style={{ background: 'rgba(217,119,87,0.07)', borderRadius: 8, padding: '10px 12px', margin: '-4px -12px 0' }}>
               <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: '#c2553a' }}>{me ? '나' : '소연'}</span>
                <span className="mono" style={{ fontSize: 11, color: '#c2553a', fontWeight: 600 }}>{c.t}</span>
                <span style={{ marginLeft: 'auto', padding: '1px 7px', borderRadius: 99, background: '#c2553a', color: '#fff', fontSize: 9.5, fontWeight: 700, letterSpacing: '.04em' }}>NEW</span>
               </div>
               <div style={{ fontSize: 14, lineHeight: 1.65, color: 'var(--ink-1)' }}>{c.text}</div>
              </div>
             ) : (
              <>
               <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: me ? 'var(--ink-1)' : '#c2553a' }}>{me ? '나' : '소연'}</span>
                <span className="mono" style={{ fontSize: 11, color: 'var(--ink-4)' }}>{c.t}</span>
               </div>
               <div style={{ fontSize: 14, lineHeight: 1.65, color: 'var(--ink-2)' }}>{c.text}</div>
              </>
             )}
            </div>
           </div>
          );
         })}
         <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
          <div style={{ width: 24, flexShrink: 0 }}>
           <div style={{ width: 22, height: 22, borderRadius: 50, border: '1.5px dashed var(--line)' }} />
          </div>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--paper)', borderRadius: 8 }}>
           <input placeholder="댓글 쓰기" style={{ flex: 1, border: 0, outline: 0, background: 'transparent', fontSize: 14, fontFamily: 'inherit' }} />
          </div>
         </div>
        </div>
       </article>
      );
     })()}
    </div>
   </main>
  </div>
 );
};

Object.assign(window, { ScrAddV14, ScrEditV14, ScrDeleteV14, ScrPinV14, ScrCommentPostedV14, FeedBaseDimV14 });
