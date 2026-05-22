// ═════════════════════════════════════════════════════════════════════════
// CORE V12 — 미묘한 글로우 + 정렬된 캘린더 + 검색 주도 헤더
// ═════════════════════════════════════════════════════════════════════════

// ─── TopBarV12 — 탭바 없음. 검색이 유일한 진입.
const TopBarV12 = ({ tab = 'excerpt', searchOpen }) => (
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
   flex: 1, maxWidth: 620, marginLeft: 'auto',
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

// ─── StreakCardV12 — 미묘한 warm wash. 강한 sphere 폐기.
const StreakCardV12 = ({
 days = 12, longest = 27, dailyAvg = 0.9, lastEntry = '오늘 14:32',
 weekHits = [1, 1, 1, 1, 1, 0, 0],
 todayDow = 4,
}) => (
 <div style={{
  position: 'relative',
  background: '#fff',
  borderRadius: 14,
  padding: '24px 26px 22px',
  overflow: 'hidden',
  border: '1px solid rgba(217,119,87,0.06)',
  boxShadow: '0 1px 2px rgba(20,18,14,0.03), 0 8px 24px -10px rgba(20,18,14,0.08)',
 }}>
  {/* Subtle warm wash — gentle gradient, not strong sphere */}
  <div style={{
   position: 'absolute', inset: 0,
   background: 'radial-gradient(circle 240px at 25% 18%, rgba(217,119,87,0.10) 0%, rgba(217,119,87,0.025) 35%, rgba(217,119,87,0) 70%)',
   pointerEvents: 'none',
  }} />
  <div style={{ position: 'relative' }}>
   <div className="upper" style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 7 }}>
    연속
    <span style={{ width: 5, height: 5, borderRadius: 50, background: '#c2553a' }} />
   </div>
   <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 22 }}>
    <span style={{ fontSize: 54, fontWeight: 700, letterSpacing: '-.035em', lineHeight: 1, fontFamily: 'var(--mono)', color: 'var(--ink-1)' }}>{days}</span>
    <span style={{ fontSize: 14, color: 'var(--ink-2)', fontWeight: 500 }}>일째</span>
   </div>
   <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 5, marginBottom: 18 }}>
    {['월', '화', '수', '목', '금', '토', '일'].map((d, i) => {
     const done = !!weekHits[i];
     const isToday = i === todayDow;
     return (
      <div key={d} style={{
       height: 30, borderRadius: 6,
       display: 'flex', alignItems: 'center', justifyContent: 'center',
       background: done ? 'var(--ink-1)' : 'rgba(0,0,0,0.04)',
       color: done ? '#fff' : 'var(--ink-3)',
       fontSize: 10.5, fontWeight: 600, fontFamily: 'var(--mono)',
       border: isToday ? '1.5px solid #c2553a' : '1.5px solid transparent',
       boxSizing: 'border-box',
      }}>{d}</div>
     );
    })}
   </div>
   <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.2fr', gap: 14, paddingTop: 14, borderTop: '1px solid var(--line-2)' }}>
    {[['최장', `${longest}일`], ['평균', `${dailyAvg}/일`], ['마지막', lastEntry]].map(([l, v]) => (
     <div key={l}>
      <div style={{ fontSize: 10, color: 'var(--ink-3)', marginBottom: 5, fontFamily: 'var(--mono)', letterSpacing: '.06em', textTransform: 'uppercase' }}>{l}</div>
      <div style={{ fontSize: 13.5, fontWeight: 600, fontFamily: 'var(--mono)' }}>{v}</div>
     </div>
    ))}
   </div>
  </div>
 </div>
);

// ─── CalendarV12 — 정렬된 셀, 책 사이즈 셀에 맞춤.
//   기본 cellW=94 cellH=78 (V2 압축형) / 큰 모드 cellW=120 cellH=96
const CalendarV12 = ({
 year = 2026, month = 5, dayData = {},
 cellW = 94, cellH = 78, bookScale, onDay,
}) => {
 // 자동 책 스케일 — 셀 폭에 비례
 const scale = bookScale ?? Math.max(0.16, Math.min(0.28, cellW / 460));
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
   <div style={{ display: 'grid', gridTemplateColumns: `repeat(7, ${cellW}px)`, marginBottom: 4 }}>
    {dows.map((d, i) => (
     <div key={d} style={{
      height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 11, fontWeight: 600, color: i === 0 ? '#c2553a' : 'var(--ink-3)',
     }}>{d}</div>
    ))}
   </div>
   <div style={{ display: 'grid', gridTemplateColumns: `repeat(7, ${cellW}px)`, gridAutoRows: `${cellH}px` }}>
    {cells.map((d, i) => {
     if (d == null) return <div key={i} />;
     const data = dayData[d];
     const isToday = d === today;
     const dow = i % 7;
     return (
      <div
       key={i}
       onClick={() => data && onDay?.(d)}
       className={data ? 'cal-cell-active' : ''}
       style={{
        position: 'relative',
        cursor: data ? 'pointer' : 'default',
        background: isToday ? 'rgba(194,85,58,0.04)' : 'transparent',
        borderRadius: 8,
        transition: 'background .12s',
       }}>
       {/* date label */}
       <div style={{
        position: 'absolute', top: 6, left: 8,
        fontSize: 10.5, fontFamily: 'var(--mono)',
        color: dow === 0 ? '#c2553a' : data ? 'var(--ink-2)' : 'var(--ink-4)',
        fontWeight: isToday ? 700 : 500,
        opacity: data ? 1 : 0.55,
        zIndex: 5,
       }}>{d}</div>
       {/* count badge */}
       {data && data.count > 1 && (
        <div style={{
         position: 'absolute', top: 5, right: 6,
         minWidth: 16, height: 16, padding: '0 5px',
         background: '#fff', border: '1px solid var(--line)', borderRadius: 99,
         fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 600, color: 'var(--ink-2)',
         display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
         zIndex: 6,
        }}>{data.count}</div>
       )}
       {/* book stack — centered in lower portion */}
       {data && (
        <div style={{
         position: 'absolute',
         left: '50%',
         bottom: 8,
         transform: 'translateX(-50%)',
        }}>
         <BookStackV12 books={data.books} scale={scale} />
        </div>
       )}
      </div>
     );
    })}
   </div>
  </div>
 );
};

const BookStackV12 = ({ books, scale = 0.20, offset = [6, 3] }) => {
 const arr = books.slice(0, 3);
 if (arr.length === 0) return null;
 const [ox, oy] = offset;
 const sample = arr[0];
 const baseW = Math.round(sample.w * scale);
 const baseH = Math.round(sample.h * scale);
 const stackW = baseW + (arr.length - 1) * ox;
 const stackH = baseH + (arr.length - 1) * oy;
 return (
  <div style={{ position: 'relative', width: stackW, height: stackH }}>
   {arr.slice().reverse().map((b, idx) => {
    const i = arr.length - 1 - idx;
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

// ─── 호버 액션 (재정의 — 더 작고 깨끗)
const HoverActionsV12 = ({ forceShow, actions }) => (
 <div className={forceShow ? 'hov-actions force' : 'hov-actions'} style={{
  display: 'inline-flex', gap: 2, flexShrink: 0,
 }}>
  {actions.map((a, i) => (
   <button key={i} className="ico-btn" title={a.label} aria-label={a.label}
    onClick={(e) => { e.stopPropagation(); a.onClick && a.onClick(); }} style={{
    width: 26, height: 26, borderRadius: 6,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    background: 'transparent', border: 0, cursor: 'pointer',
    color: a.active ? '#c2553a' : 'var(--ink-3)',
   }}>
    <Ic n={a.icon} sz={a.icon === 'pin' ? 14 : 13} />
   </button>
  ))}
 </div>
);

// ─── Feed Quote Row v12 — 3줄 line-clamp, 호버 액션
const QuoteRowV12 = ({ q, fontSize = 16, demoActions = false, onClick }) => {
 const cN = (q.comments || []).length;
 return (
  <div className="quote-row" onClick={onClick} style={{
   padding: '11px 10px 13px',
   margin: '0 -10px',
   borderRadius: 8,
   cursor: 'pointer',
  }}>
   <div style={{
    fontSize, lineHeight: 1.65,
    fontWeight: q.pin ? 600 : 500,
    letterSpacing: '-.012em',
    color: 'var(--ink-1)',
    display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
    fontFamily: 'var(--sans)',
   }}>
    <span style={{ fontFamily: 'var(--serif)', color: 'var(--ink-4)', marginRight: '.1em' }}>“</span>
    {q.text}
    <span style={{ fontFamily: 'var(--serif)', color: 'var(--ink-4)', marginLeft: '.04em' }}>”</span>
   </div>
   <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
    {q.pin && (
     <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#c2553a', fontWeight: 600 }}>
      <Ic n="pin" sz={11} st={1.8} />핀
     </span>
    )}
    <span className="mono" style={{ fontSize: 11, color: 'var(--ink-4)' }}>{q.t.slice(0, 10)} {q.t.slice(11, 16)}</span>
    {cN > 0 && <><span style={{ color: 'var(--ink-4)' }}>·</span><span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>댓글 {cN}</span></>}
    <div style={{ flex: 1 }} />
    <HoverActionsV12 forceShow={demoActions} actions={[
     { icon: 'pin', label: '핀', active: q.pin },
     { icon: 'edit', label: '수정' },
     { icon: 'dots-v', label: '더보기' },
    ]} />
   </div>
  </div>
 );
};


Object.assign(window, { TopBarV12, StreakCardV12, CalendarV12, BookStackV12, QuoteRowV12, HoverActionsV12 });
