// ═════════════════════════════════════════════════════════════════════════
// CORE V10
//   BookRow (flat, no card)
//   StreakCardLight (white bg + orange radial)
//   CalendarV2 (bigger cells, dramatic book stack)
//   ElevatedPanel (subtle float)
//   AuthorRow / PublisherRow (rich meta)
// ═════════════════════════════════════════════════════════════════════════

// ─── BookRow — 카드 프레임 없음. 그냥 표지 + 제목 + 저자 + 카운트 인라인.
const BookRow = ({ b, count, soyeon, onClick, size = 'md', meta }) => {
 const scales = { sm: 0.32, md: 0.46, lg: 0.55 };
 const fontSize = { sm: 13, md: 15.5, lg: 18 };
 const cs = scales[size];
 const fs = fontSize[size];
 return (
  <div onClick={onClick} className="book-row" style={{
   display: 'flex', alignItems: 'center', gap: 16,
   padding: '6px 10px',
   margin: '0 -10px',
   borderRadius: 10,
   cursor: onClick ? 'pointer' : 'default',
   transition: 'background .12s',
  }}>
   <Cv b={b} scale={cs} />
   <div style={{ flex: 1, minWidth: 0 }}>
    <div style={{ fontSize: fs, fontWeight: 700, letterSpacing: '-.02em', lineHeight: 1.3, color: 'var(--ink-1)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{b.t}</div>
    <div style={{ fontSize: fs - 3, color: 'var(--ink-3)', marginTop: 4, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 10 }}>
     <span>{b.a}</span>
     {meta && <><span style={{ color: 'var(--ink-4)' }}>·</span><span>{meta}</span></>}
     {soyeon && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--ink-3)' }}>
      <span style={{ width: 4, height: 4, borderRadius: 50, background: '#9a9080' }} />소연
     </span>}
    </div>
   </div>
   {count != null && (
    <span className="mono" style={{
     padding: '4px 9px', borderRadius: 99,
     background: 'var(--paper)', color: 'var(--ink-2)',
     fontSize: 11.5, fontWeight: 600, letterSpacing: '.02em',
    }}>{count}</span>
   )}
  </div>
 );
};

// ─── ElevatedPanel — 부드러운 떠 있는 느낌. 박스 그림자.
const ElevatedPanel = ({ children, padding = '24px 26px', style }) => (
 <div style={{
  background: '#fff',
  borderRadius: 14,
  padding,
  boxShadow: '0 1px 2px rgba(20,18,14,0.04), 0 8px 24px -8px rgba(20,18,14,0.08)',
  border: '1px solid rgba(20,18,14,0.04)',
  ...style,
 }}>{children}</div>
);

// ─── PanelHeader
const PanelHeader = ({ title, sub, right }) => (
 <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 18 }}>
  <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, letterSpacing: '-.012em' }}>{title}</h3>
  {sub && <span className="mono" style={{ fontSize: 11, color: 'var(--ink-4)', marginLeft: 10 }}>{sub}</span>}
  <div style={{ flex: 1 }} />
  {right}
 </div>
);

// ─── StreakCardLight — 흰색 + 오렌지 라디얼 글로우 + 풍부한 지표
const StreakCardLight = ({
 days = 12, longest = 27, dailyAvg = 0.9, lastEntry = '오늘 14:32',
 weekHits = [1, 1, 1, 1, 1, 0, 0],  // 월화수목금토일 (1=완료, 0=공)
 todayDow = 4,                       // 0=월 ... 6=일. 4=금
}) => (
 <ElevatedPanel padding="22px 24px 22px" style={{ position: 'relative', overflow: 'hidden' }}>
  {/* Orange radial glow */}
  <div style={{
   position: 'absolute', inset: 0,
   background: 'radial-gradient(circle at 88% 0%, rgba(220,110,72,0.18), rgba(220,110,72,0) 55%)',
   pointerEvents: 'none',
  }} />
  <div style={{ position: 'relative' }}>
   <div className="upper" style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 7 }}>
    연속
    <span style={{ width: 5, height: 5, borderRadius: 50, background: '#c2553a', boxShadow: '0 0 8px rgba(194,85,58,0.5)' }} />
   </div>
   <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 22 }}>
    <span style={{ fontSize: 48, fontWeight: 700, letterSpacing: '-.035em', lineHeight: 1, fontFamily: 'var(--mono)', color: '#c2553a' }}>{days}</span>
    <span style={{ fontSize: 13, color: 'var(--ink-3)', fontWeight: 500 }}>일째</span>
   </div>
   {/* Week dot row */}
   <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 5, marginBottom: 18 }}>
    {['월', '화', '수', '목', '금', '토', '일'].map((d, i) => {
     const done = !!weekHits[i];
     const isToday = i === todayDow;
     return (
      <div key={d} style={{
       height: 32, borderRadius: 6,
       display: 'flex', alignItems: 'center', justifyContent: 'center',
       background: done ? 'var(--ink-1)' : 'var(--paper)',
       color: done ? '#fff' : 'var(--ink-3)',
       fontSize: 10.5, fontWeight: 600, fontFamily: 'var(--mono)',
       border: isToday ? '1.5px solid #c2553a' : '1.5px solid transparent',
       boxSizing: 'border-box',
       letterSpacing: '.02em',
      }}>{d}</div>
     );
    })}
   </div>
   {/* Metrics grid */}
   <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.2fr', gap: 14, paddingTop: 14, borderTop: '1px solid var(--line-2)' }}>
    {[['최장', `${longest}일`], ['평균', `${dailyAvg}/일`], ['마지막', lastEntry]].map(([l, v]) => (
     <div key={l}>
      <div style={{ fontSize: 10, color: 'var(--ink-3)', marginBottom: 5, fontFamily: 'var(--mono)', letterSpacing: '.06em', textTransform: 'uppercase' }}>{l}</div>
      <div style={{ fontSize: 13.5, fontWeight: 600, fontFamily: 'var(--mono)', letterSpacing: '-.005em' }}>{v}</div>
     </div>
    ))}
   </div>
  </div>
 </ElevatedPanel>
);

// ─── BookStack — 캘린더 셀 내 책 겹침. 1~3권 시각화.
const BookStack = ({ books, scale = 0.30, offset = [9, 5] }) => {
 const arr = books.slice(0, 3);
 if (arr.length === 0) return null;
 const [ox, oy] = offset;
 const sample = arr[0];
 const baseW = sample.w * scale;
 const baseH = sample.h * scale;
 const stackW = baseW + (arr.length - 1) * ox;
 const stackH = baseH + (arr.length - 1) * oy;
 return (
  <div style={{ position: 'relative', width: stackW, height: stackH }}>
   {/* Render BACK to FRONT so front sits on top via DOM order + z-index */}
   {arr.slice().reverse().map((b, idx) => {
    const i = arr.length - 1 - idx; // 0=front, 2=back
    return (
     <div key={i} style={{
      position: 'absolute',
      left: i * ox,
      top: i * oy,
      zIndex: arr.length - i,
     }}>
      <Cv b={b} scale={scale} />
     </div>
    );
   })}
  </div>
 );
};

// ─── CalendarV2 — 큰 셀 + 드라마틱 책 겹침
const CalendarV2 = ({ year = 2026, month = 5, dayData = {}, cellW = 130, cellH = 130, onDay }) => {
 const firstDow = new Date(year, month - 1, 1).getDay();
 const daysInMonth = new Date(year, month, 0).getDate();
 const cells = [];
 for (let i = 0; i < firstDow; i++) cells.push(null);
 for (let d = 1; d <= daysInMonth; d++) cells.push(d);
 while (cells.length % 7) cells.push(null);
 const dows = ['일', '월', '화', '수', '목', '금', '토'];
 const today = 22;

 return (
  <div>
   <div style={{ display: 'grid', gridTemplateColumns: `repeat(7, ${cellW}px)`, marginBottom: 6 }}>
    {dows.map((d, i) => (
     <div key={d} style={{
      height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 11, fontWeight: 600, color: i === 0 ? '#c2553a' : 'var(--ink-3)',
      letterSpacing: '-.005em',
     }}>{d}</div>
    ))}
   </div>
   <div style={{ display: 'grid', gridTemplateColumns: `repeat(7, ${cellW}px)`, gridAutoRows: cellH }}>
    {cells.map((d, i) => {
     if (d == null) return <div key={i} />;
     const data = dayData[d];
     const isToday = d === today;
     const dow = i % 7;
     return (
      <div key={i} onClick={() => data && onDay?.(d)} className={data ? 'cal-cell-active' : ''} style={{
       position: 'relative',
       padding: '8px 10px',
       cursor: data ? 'pointer' : 'default',
       background: isToday ? 'rgba(194,85,58,0.05)' : 'transparent',
       borderRadius: 8,
       transition: 'background .12s',
      }}>
       <div style={{
        position: 'absolute', top: 7, left: 10,
        fontSize: 11.5, fontFamily: 'var(--mono)',
        color: dow === 0 ? '#c2553a' : data ? 'var(--ink-2)' : 'var(--ink-4)',
        fontWeight: isToday ? 700 : 500,
        opacity: data ? 1 : 0.5,
        zIndex: 5,
       }}>{d}</div>
       {data && data.count > 1 && (
        <div style={{
         position: 'absolute', top: 5, right: 6,
         minWidth: 18, height: 18, padding: '0 6px',
         background: '#fff', border: '1px solid var(--line)', borderRadius: 99,
         fontFamily: 'var(--mono)', fontSize: 10.5, fontWeight: 600, color: 'var(--ink-2)',
         display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
         zIndex: 6,
        }}>{data.count}</div>
       )}
       {data && (
        <div style={{
         position: 'absolute', left: '50%', top: '52%',
         transform: 'translate(-50%, -50%)',
        }}>
         <BookStack books={data.books} scale={0.32} offset={[10, 6]} />
        </div>
       )}
      </div>
     );
    })}
   </div>
  </div>
 );
};


// ─── AuthorRow / PublisherRow — 풍부한 메타
const AuthorRow = ({ name, books = 1, quotes, mainPub, rank }) => (
 <div className="book-row" style={{
  display: 'grid',
  gridTemplateColumns: rank ? '24px 1fr auto auto' : '1fr auto auto',
  alignItems: 'baseline',
  gap: 14,
  padding: '10px 10px',
  margin: '0 -10px',
  borderRadius: 8,
  cursor: 'pointer',
 }}>
  {rank && <span className="mono" style={{ fontSize: 10.5, color: 'var(--ink-4)', letterSpacing: '.05em' }}>{String(rank).padStart(2, '0')}</span>}
  <div>
   <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-.012em', color: 'var(--ink-1)' }}>{name}</div>
   {mainPub && <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 3 }}>{mainPub}</div>}
  </div>
  <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}><b className="mono" style={{ color: 'var(--ink-2)', fontWeight: 600 }}>{books}</b>권</span>
  <span style={{ fontSize: 11.5, color: 'var(--ink-3)', minWidth: 60, textAlign: 'right' }}>어구록 <b className="mono" style={{ color: 'var(--ink-1)', fontWeight: 700 }}>{quotes}</b></span>
 </div>
);

const PublisherRow = ({ name, authors = 1, books, quotes, rank }) => (
 <div className="book-row" style={{
  display: 'grid',
  gridTemplateColumns: rank ? '24px 1fr auto auto auto' : '1fr auto auto auto',
  alignItems: 'baseline',
  gap: 12,
  padding: '10px 10px',
  margin: '0 -10px',
  borderRadius: 8,
  cursor: 'pointer',
 }}>
  {rank && <span className="mono" style={{ fontSize: 10.5, color: 'var(--ink-4)', letterSpacing: '.05em' }}>{String(rank).padStart(2, '0')}</span>}
  <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-.012em', color: 'var(--ink-1)' }}>{name}</span>
  <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}><b className="mono" style={{ color: 'var(--ink-2)', fontWeight: 600 }}>{authors}</b>작가</span>
  <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}><b className="mono" style={{ color: 'var(--ink-2)', fontWeight: 600 }}>{books}</b>권</span>
  <span style={{ fontSize: 11.5, color: 'var(--ink-3)', minWidth: 60, textAlign: 'right' }}>어구록 <b className="mono" style={{ color: 'var(--ink-1)', fontWeight: 700 }}>{quotes}</b></span>
 </div>
);

// ─── Bookshelf v2 — 표지 모두 동일 스케일 (책 자체 비율만 살림)
const BookshelfUniform = ({ items, scale = 0.6 }) => (
 <div style={{ display: 'flex', alignItems: 'flex-end', gap: 22, paddingBottom: 6 }}>
  {items.map((t) => (
   <div key={t.b.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, cursor: 'pointer', flexShrink: 0 }}>
    <Cv b={t.b} scale={scale} />
    <div style={{ textAlign: 'center', minWidth: 0 }}>
     <div className="mono" style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-1)' }}>{t.c}</div>
     <div style={{ fontSize: 10.5, color: 'var(--ink-3)', marginTop: 2, maxWidth: 80, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.b.t}</div>
    </div>
   </div>
  ))}
 </div>
);


// ─── Comparison V2 — 더 컴팩트
const Comparison = ({ topLabel = '이번 달', current = 11, prev = 8, unit = '개', period = '5월' }) => {
 const max = Math.max(current, prev, 1);
 const diff = current - prev;
 return (
  <div>
   <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 12 }}>
    <span className="upper">{topLabel}</span>
    <span className="mono" style={{ fontSize: 10.5, color: 'var(--ink-4)', marginLeft: 8, letterSpacing: '.04em' }}>{period}</span>
    <div style={{ flex: 1 }} />
    <span style={{ fontSize: 11, color: diff > 0 ? '#c2553a' : 'var(--ink-3)', fontFamily: 'var(--mono)', fontWeight: 600 }}>
     {diff > 0 ? '↑' : diff < 0 ? '↓' : ''}{Math.abs(diff)}{unit}
    </span>
   </div>
   <div style={{ display: 'grid', gridTemplateColumns: '40px 1fr 40px', gap: 10, alignItems: 'center', rowGap: 8 }}>
    <span style={{ fontSize: 11.5, color: 'var(--ink-2)', fontWeight: 600 }}>이번</span>
    <div style={{ height: 14, borderRadius: 4, background: 'var(--paper)', position: 'relative', overflow: 'hidden' }}>
     <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${(current / max) * 100}%`, background: 'var(--ink-1)' }} />
    </div>
    <span className="mono" style={{ fontSize: 12, fontWeight: 700, textAlign: 'right' }}>{current}<span style={{ color: 'var(--ink-3)', fontWeight: 500 }}>{unit}</span></span>

    <span style={{ fontSize: 11.5, color: 'var(--ink-3)', fontWeight: 500 }}>지난</span>
    <div style={{ height: 14, borderRadius: 4, background: 'var(--paper)', position: 'relative', overflow: 'hidden' }}>
     <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${(prev / max) * 100}%`, background: 'var(--ink-4)' }} />
    </div>
    <span className="mono" style={{ fontSize: 12, color: 'var(--ink-3)', textAlign: 'right' }}>{prev}<span style={{ fontWeight: 500 }}>{unit}</span></span>
   </div>
  </div>
 );
};

// ─── 검색 헤더 (검색 주도 필터) — 항상 노출
const TopBarV10 = ({ tab = 'excerpt', searchOpen }) => (
 <header style={{
  padding: '14px 32px',
  display: 'flex', alignItems: 'center', gap: 18,
  background: '#fff',
  borderBottom: '1px solid var(--line-2)',
  position: 'sticky', top: 0, zIndex: 5,
 }}>
  <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
   <div style={{ width: 26, height: 26, borderRadius: 7, background: 'var(--ink-1)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, letterSpacing: '-.04em' }}>b</div>
   <span style={{ fontSize: 14.5, fontWeight: 700, letterSpacing: '-.022em' }}>book</span>
  </div>
  <nav style={{ display: 'flex', gap: 4, marginLeft: 8 }}>
   {[['어구록', 'excerpt'], ['통계', 'stats']].map(([n, k]) => (
    <span key={k} style={{
     padding: '7px 13px', borderRadius: 7,
     fontSize: 13, fontWeight: tab === k ? 700 : 500,
     color: tab === k ? 'var(--ink-1)' : 'var(--ink-3)',
     cursor: 'pointer',
     background: tab === k ? 'var(--hover)' : 'transparent',
    }}>{n}</span>
   ))}
  </nav>
  <div style={{
   display: 'flex', alignItems: 'center', gap: 10,
   flex: 1, maxWidth: 600, marginLeft: 'auto',
   height: 38, padding: '0 14px',
   background: searchOpen ? '#fff' : 'var(--paper)',
   border: '1px solid ' + (searchOpen ? 'var(--ink-4)' : 'transparent'),
   borderRadius: 10,
   color: 'var(--ink-3)',
   cursor: 'text',
   boxShadow: searchOpen ? '0 1px 2px rgba(20,18,14,0.06)' : 'none',
  }}>
   <Ic n="search" sz={15} />
   <span style={{ flex: 1, fontSize: 13 }}>책 · 작가 · 분야 · 단어 · 어구록</span>
   <span className="kbd">⌘K</span>
  </div>
  <Btn variant="pri" size="md" icon="plus">새 어구록</Btn>
 </header>
);

// 메뉴만 (필터 없음). 6 차원.
const TabBarV10 = ({ active = '전체' }) => {
 const tabs = [['전체', 184], ['책', 16], ['작가', 14], ['분야', 8], ['출판사', 9], ['핀', 3]];
 return (
  <div style={{ padding: '10px 32px', display: 'flex', alignItems: 'center', gap: 0, background: '#fff', borderBottom: '1px solid var(--line-2)' }}>
   {tabs.map(([n, c]) => {
    const on = n === active;
    return (
     <span key={n} style={{
      display: 'inline-flex', alignItems: 'baseline', gap: 5,
      padding: '7px 12px',
      cursor: 'pointer',
      fontSize: 13, fontWeight: on ? 700 : 500,
      color: on ? 'var(--ink-1)' : 'var(--ink-3)',
      borderBottom: on ? '2px solid var(--ink-1)' : '2px solid transparent',
      marginBottom: -1,
     }}>
      {n}<span className="mono" style={{ fontSize: 10.5, color: on ? 'var(--ink-3)' : 'var(--ink-4)', fontWeight: 500 }}>{c}</span>
     </span>
    );
   })}
   <div style={{ flex: 1 }} />
   <span style={{ fontSize: 12, color: 'var(--ink-3)', display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer', padding: '6px 8px' }}>
    최근순<Ic n="chevD" sz={11} />
   </span>
  </div>
 );
};

// ─── QuoteRowV10 — 호버 액션, 라이트 호버
const QuoteRowV10 = ({ q, last, demoActions = false, fontSize = 16 }) => {
 const cN = (q.comments || []).length;
 return (
  <div className="quote-row" style={{
   padding: '12px 10px',
   margin: '0 -10px',
   borderRadius: 8,
   borderBottom: last ? 0 : '1px solid var(--line-2)',
  }}>
   <QuoteText text={q.text} fontSize={fontSize} lineHeight={1.65} weight={q.pin ? 600 : 500} variant="inline" />
   <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
    {q.pin && (
     <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#c2553a', fontWeight: 600 }}>
      <Ic n="pin" sz={11} st={1.8} />핀
     </span>
    )}
    <span className="mono" style={{ fontSize: 11, color: 'var(--ink-4)', letterSpacing: '.02em' }}>{q.t.slice(0, 10)} {q.t.slice(11, 16)}</span>
    {cN > 0 && <><span style={{ color: 'var(--ink-4)' }}>·</span><span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>댓글 {cN}</span></>}
    <div style={{ flex: 1 }} />
    <HoverActions forceShow={demoActions} actions={[
     { icon: 'pin', label: '핀', active: q.pin },
     { icon: 'edit', label: '수정' },
     { icon: 'dots-v', label: '더보기' },
    ]} />
   </div>
  </div>
 );
};

Object.assign(window, {
 BookRow, ElevatedPanel, PanelHeader,
 StreakCardLight, BookStack, CalendarV2,
 AuthorRow, PublisherRow, BookshelfUniform, Comparison,
 TopBarV10, TabBarV10, QuoteRowV10,
});
