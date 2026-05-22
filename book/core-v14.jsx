// ═════════════════════════════════════════════════════════════════════════
// CORE V14 — 타입 위계 강화, kbd 폐기, StreakCard 주간 strip 완화
// ═════════════════════════════════════════════════════════════════════════

// 타입 스케일 — 일관 적용
//   display: 64-80
//   h1 page: 36-44
//   h2 section: 22-26
//   h3 panel: 16-18
//   body: 15
//   meta: 12-13
//   caption: 11
//   upper: 10.5

// ─── Count format helper — "NUM label" 통일
const Count = ({ n, label, mono = true }) => (
 <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>
  <b className={mono ? 'mono' : ''} style={{ color: 'var(--ink-1)', fontWeight: 700 }}>{n}</b>
  {label && <span style={{ marginLeft: 4 }}>{label}</span>}
 </span>
);

// ─── Pill — 단독 카운트 (BookRow 등)
const CountPill = ({ n }) => (
 <span className="mono" style={{
  padding: '4px 10px',
  borderRadius: 99,
  background: 'var(--paper)',
  color: 'var(--ink-2)',
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: '.02em',
 }}>{n}</span>
);

// ─── TopBar V14 — kbd 표기 제거, 검색은 단순 indicator
const TopBarV14 = ({ tab = 'excerpt' }) => (
 <header className="topbar" style={{
  padding: '16px 36px',
  display: 'flex', alignItems: 'center', gap: 22,
  background: '#fff',
  borderBottom: '1px solid var(--line-2)',
  position: 'sticky', top: 0, zIndex: 5,
 }}>
  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
   <div style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--ink-1)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 15, letterSpacing: '-.04em' }}>b</div>
   <span style={{ fontSize: 15.5, fontWeight: 700, letterSpacing: '-.022em' }}>book</span>
  </div>
  <nav style={{ display: 'flex', gap: 4, marginLeft: 8 }}>
   {[['어구록', 'excerpt'], ['통계', 'stats']].map(([n, k]) => (
    <span key={k} onClick={() => window.go(k === 'stats' ? 'stats' : 'feed')} style={{
     padding: '8px 14px', borderRadius: 7,
     fontSize: 14, fontWeight: tab === k ? 700 : 500,
     color: tab === k ? 'var(--ink-1)' : 'var(--ink-3)',
     cursor: 'pointer',
     background: tab === k ? 'var(--hover)' : 'transparent',
    }}>{n}</span>
   ))}
  </nav>
  <div className="topbar-search" style={{
   display: 'flex', alignItems: 'center', gap: 10,
   flex: 1, maxWidth: 640, marginLeft: 'auto',
   height: 40, padding: '0 16px',
   background: 'var(--paper)',
   borderRadius: 10,
   color: 'var(--ink-3)',
   cursor: 'text',
  }}>
   <Ic n="search" sz={16} />
   <span style={{ flex: 1, fontSize: 14 }}>책 · 작가 · 분야 · 단어 · 어구록</span>
  </div>
  <Btn variant="pri" size="md" icon="plus" onClick={() => window.go('add')}>새 어구록</Btn>
 </header>
);


// ─── StreakCardV14 — 주간 strip 완화 (얇은 바)
const StreakCardV14 = ({
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
  border: '1px solid rgba(217,119,87,0.07)',
  boxShadow: '0 1px 2px rgba(20,18,14,0.03), 0 8px 24px -10px rgba(20,18,14,0.08)',
 }}>
  {/* Subtle warm wash */}
  <div style={{
   position: 'absolute', inset: 0,
   background: 'radial-gradient(circle 260px at 25% 20%, rgba(217,119,87,0.10) 0%, rgba(217,119,87,0.025) 35%, rgba(217,119,87,0) 70%)',
   pointerEvents: 'none',
  }} />
  <div style={{ position: 'relative' }}>
   <div className="upper" style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 7 }}>
    연속
    <span style={{ width: 5, height: 5, borderRadius: 50, background: '#c2553a' }} />
   </div>
   <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 24 }}>
    <span style={{ fontSize: 60, fontWeight: 700, letterSpacing: '-.035em', lineHeight: 1, fontFamily: 'var(--mono)', color: 'var(--ink-1)' }}>{days}</span>
    <span style={{ fontSize: 15, color: 'var(--ink-2)', fontWeight: 500 }}>일째</span>
   </div>

   {/* 주간 strip — 얇은 바 + 작은 라벨, 완화된 톤 */}
   <div style={{ marginBottom: 22 }}>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, marginBottom: 8 }}>
     {weekHits.map((hit, i) => (
      <div key={i} style={{
       height: 4,
       borderRadius: 99,
       background: hit ? '#c2553a' : 'var(--paper-2)',
       opacity: hit ? (i === todayDow ? 1 : 0.85) : 1,
      }} />
     ))}
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
     {['월', '화', '수', '목', '금', '토', '일'].map((d, i) => (
      <span key={d} style={{
       fontSize: 10.5, textAlign: 'center',
       color: i === todayDow ? 'var(--ink-1)' : 'var(--ink-3)',
       fontWeight: i === todayDow ? 700 : 500,
       fontFamily: 'var(--mono)',
      }}>{d}</span>
     ))}
    </div>
   </div>

   <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.2fr', gap: 14, paddingTop: 14, borderTop: '1px solid var(--line-2)' }}>
    {[['최장', `${longest}일`], ['평균', `${dailyAvg}/일`], ['마지막', lastEntry]].map(([l, v]) => (
     <div key={l}>
      <div style={{ fontSize: 10, color: 'var(--ink-3)', marginBottom: 5, fontFamily: 'var(--mono)', letterSpacing: '.06em', textTransform: 'uppercase' }}>{l}</div>
      <div style={{ fontSize: 14, fontWeight: 600, fontFamily: 'var(--mono)' }}>{v}</div>
     </div>
    ))}
   </div>
  </div>
 </div>
);


// ─── BookRowV14 — 카운트 위치/스타일 일관화
const BookRowV14 = ({ b, count, soyeon, onClick, meta }) => (
 <div onClick={onClick} className="book-row" style={{
  display: 'flex', alignItems: 'center', gap: 18,
  padding: '8px 12px', margin: '0 -12px', borderRadius: 10,
  cursor: onClick ? 'pointer' : 'default',
 }}>
  <Cv b={b} scale={0.46} />
  <div style={{ flex: 1, minWidth: 0 }}>
   <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-.02em', lineHeight: 1.3, color: 'var(--ink-1)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{b.t}</div>
   <div style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 5, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 10 }}>
    <span>{b.a}</span>
    {meta && <><span style={{ color: 'var(--ink-4)' }}>·</span><span>{meta}</span></>}
    {soyeon && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--ink-3)' }}>
     <span style={{ width: 4, height: 4, borderRadius: 50, background: '#9a9080' }} />소연
    </span>}
   </div>
  </div>
  {count != null && <CountPill n={count} />}
 </div>
);


// ─── QuoteRowV14 — 3줄 line-clamp, kbd 없음
const QuoteRowV14 = ({ q, fontSize = 16, demoActions = false, onClick }) => {
 const cN = (q.comments || []).length;
 return (
  <div className="quote-row" onClick={onClick} style={{
   padding: '12px 12px 14px',
   margin: '0 -12px',
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
   <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 7 }}>
    {q.pin && (
     <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: '#c2553a', fontWeight: 600 }}>
      <Ic n="pin" sz={11.5} st={1.8} />핀
     </span>
    )}
    <span className="mono" style={{ fontSize: 11.5, color: 'var(--ink-4)', letterSpacing: '.02em' }}>{q.t.slice(0, 10)} {q.t.slice(11, 16)}</span>
    {cN > 0 && <><span style={{ color: 'var(--ink-4)' }}>·</span><span style={{ fontSize: 12, color: 'var(--ink-3)' }}>댓글 {cN}</span></>}
    <div style={{ flex: 1 }} />
    <HoverActionsV12 forceShow={demoActions} actions={[
     { icon: 'pin', label: '핀', active: q.pin, onClick: () => window.go('pin') },
     { icon: 'edit', label: '수정', onClick: () => window.go('edit') },
     { icon: 'dots-v', label: '더보기' },
    ]} />
   </div>
  </div>
 );
};


// ─── PanelHead V14 — 위계 강화
const PanelHeadV14 = ({ title, sub, right }) => (
 <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 18 }}>
  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, letterSpacing: '-.018em' }}>{title}</h3>
  {sub != null && <Count n={sub} label="" mono style={{ marginLeft: 10 }} />}
  {sub != null && <span className="mono" style={{ fontSize: 11.5, color: 'var(--ink-4)', marginLeft: 10 }}>{sub}</span>}
  <div style={{ flex: 1 }} />
  {right}
 </div>
);

// ─── PageTitle — 페이지 hero 타이틀 (큼)
const PageTitle = ({ upper, title, right, large = false }) => (
 <div className="page-title-wrap" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 36 }}>
  <div>
   {upper && <span className="upper" style={{ fontSize: 11 }}>{upper}</span>}
   <h1 style={{
    margin: upper ? '10px 0 0' : 0,
    fontSize: large ? 44 : 36,
    fontWeight: 700, letterSpacing: '-.032em', lineHeight: 1.05,
   }}>{title}</h1>
  </div>
  {right}
 </div>
);

// ─── Modal V14 — kbd 표기 제거
const ModalV14 = ({ title, subtitle, onClose, children, footer, width = 620 }) => (
 <div style={{
  position: 'absolute', inset: 0,
  background: 'rgba(20,18,14,.36)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  zIndex: 30,
 }}>
  <div style={{
   width,
   maxHeight: '88%',
   background: '#fff',
   borderRadius: 16,
   boxShadow: '0 4px 12px -2px rgba(20,18,14,.10), 0 24px 60px -16px rgba(20,18,14,.32)',
   display: 'flex', flexDirection: 'column',
   overflow: 'hidden',
  }}>
   <div style={{ padding: '22px 26px 18px', display: 'flex', alignItems: 'flex-start', borderBottom: '1px solid var(--line-2)' }}>
    <div style={{ flex: 1, minWidth: 0 }}>
     <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: '-.018em' }}>{title}</h2>
     {subtitle && <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 5 }}>{subtitle}</div>}
    </div>
    <button onClick={onClose} className="ico-btn" style={{ width: 30, height: 30, borderRadius: 7, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 0, cursor: 'pointer', color: 'var(--ink-3)' }}>
     <Ic n="close" sz={17} />
    </button>
   </div>
   <div style={{ flex: 1, overflow: 'auto' }}>{children}</div>
   {footer && (
    <div style={{ padding: '14px 26px', borderTop: '1px solid var(--line-2)', display: 'flex', alignItems: 'center', gap: 10, background: '#fafaf7' }}>
     {footer}
    </div>
   )}
  </div>
 </div>
);


Object.assign(window, {
 Count, CountPill,
 TopBarV14, StreakCardV14, BookRowV14, QuoteRowV14, PanelHeadV14, PageTitle, ModalV14,
});
