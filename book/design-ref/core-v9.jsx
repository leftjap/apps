// ═════════════════════════════════════════════════════════════════════════
// CORE V9 — 공유 컴포넌트
// BookCardSlim · QuoteRow (hover actions) · StreakCard · CalendarMonth ·
// ComparisonCard · ActionButton · 좀 더 정련된 TopBar
// ═════════════════════════════════════════════════════════════════════════

// ─── 더 컴팩트한 BookCard. 가로 fit-content. 우상단 카운트 배지.
const BookCardSlim = ({ b, count, onClick, soyeon, action, dim, showActions = false }) => {
 const cs = 0.46;
 const cw = Math.round(b.w * cs);
 const ch = Math.round(b.h * cs);
 const lift = Math.round(ch * 0.12);
 const padL = 18 + cw + 14;

 return (
  <div className="bcard-slim" onClick={onClick} style={{
   position: 'relative',
   display: 'flex',
   alignItems: 'center',
   gap: 14,
   background: '#fff',
   border: '1px solid var(--line)',
   borderRadius: 12,
   paddingLeft: padL,
   paddingRight: 18,
   paddingTop: 12,
   paddingBottom: 12,
   minHeight: ch - lift + 18,
   maxWidth: 460,
   width: 'auto',
   cursor: onClick ? 'pointer' : 'default',
   opacity: dim ? 0.5 : 1,
   transition: 'border-color .12s, background .12s',
  }}>
   <div style={{ position: 'absolute', left: 18, top: -lift }}>
    <Cv b={b} scale={cs} />
   </div>
   <div style={{ flex: 1, minWidth: 0 }}>
    <div style={{ fontSize: 14.5, fontWeight: 700, letterSpacing: '-.02em', lineHeight: 1.3, color: 'var(--ink-1)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{b.t}</div>
    <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 4, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }}>
     <span>{b.a}</span>
     {soyeon && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--ink-3)' }}>
      <span style={{ width: 4, height: 4, borderRadius: 50, background: '#9a9080' }} />소연
     </span>}
    </div>
   </div>
   {action && <div style={{ flexShrink: 0 }}>{action}</div>}
   {count != null && (
    <div style={{
     position: 'absolute', top: -10, right: 14,
     minWidth: 24, height: 20, padding: '0 8px',
     background: '#fff', border: '1px solid var(--line)', borderRadius: 99,
     fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 600, color: 'var(--ink-2)',
     display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    }}>{count}</div>
   )}
  </div>
 );
};

// ─── HoverActions — 행/카드 우측에 떠 있는 액션. CSS hover로 노출.
const HoverActions = ({ actions, forceShow }) => (
 <div className={forceShow ? 'hov-actions force' : 'hov-actions'} style={{
  display: 'inline-flex',
  alignItems: 'center',
  gap: 2,
  flexShrink: 0,
 }}>
  {actions.map((a, i) => (
   <button key={i} className="ico-btn" title={a.label} aria-label={a.label} style={{
    width: 28, height: 28, borderRadius: 6,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    background: 'transparent', border: 0, cursor: 'pointer',
    color: a.active ? 'var(--ink-1)' : 'var(--ink-3)',
   }}>
    <Ic n={a.icon} sz={a.icon === 'pin' ? 15 : 14} />
   </button>
  ))}
 </div>
);

// ─── QuoteRow — 본문 + 메타 + 호버 액션
const QuoteRow = ({ q, last, divider = true, demoActions = false, fontSize = 16, indent = 0 }) => {
 const cN = (q.comments || []).length;
 return (
  <div className="quote-row" style={{
   position: 'relative',
   padding: '12px 0',
   borderBottom: divider && !last ? '1px solid var(--line-2)' : 0,
   marginLeft: indent,
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

// ─── StreakCard — 다크 + 오렌지 라디얼 글로우 (gym-app inspired)
//   다크모드가 아니라 단일 액센트 카드. 이 디자인의 유일한 컬러.
const StreakCard = ({ days = 12, weekHit = 5, longest = 27, todayDone = true }) => (
 <div style={{
  position: 'relative',
  background: 'radial-gradient(at 22% 25%, rgba(220,110,72,0.55), rgba(40,22,14,0.95) 55%), #1a0e08',
  borderRadius: 14,
  padding: '22px 22px 20px',
  color: '#fff',
  overflow: 'hidden',
 }}>
  <div style={{
   fontFamily: 'var(--mono)', fontSize: 10.5, letterSpacing: '.08em',
   textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)', marginBottom: 10,
   display: 'flex', alignItems: 'center', gap: 8,
  }}>
   연속
   {todayDone && <span style={{ width: 6, height: 6, borderRadius: 50, background: '#ff7a4d', boxShadow: '0 0 8px rgba(255,122,77,0.7)' }} />}
  </div>
  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
   <span style={{ fontSize: 54, fontWeight: 700, letterSpacing: '-.035em', lineHeight: 1, fontFamily: 'var(--mono)' }}>{days}</span>
   <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', fontWeight: 500 }}>일째</span>
  </div>
  <div style={{ marginTop: 22, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.1)', display: 'flex', gap: 28 }}>
   <div>
    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 6, letterSpacing: '-.005em' }}>이번 주</div>
    <div style={{ fontSize: 16, fontWeight: 600, fontFamily: 'var(--mono)' }}>
     {weekHit}<span style={{ color: 'rgba(255,255,255,0.4)' }}>/7</span>
    </div>
   </div>
   <div>
    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 6, letterSpacing: '-.005em' }}>최장</div>
    <div style={{ fontSize: 16, fontWeight: 600, fontFamily: 'var(--mono)' }}>
     {longest}<span style={{ color: 'rgba(255,255,255,0.4)',marginLeft:2 }}>일</span>
    </div>
   </div>
  </div>
 </div>
);

// ─── ComparisonCard — 이번 vs 지난 (스샷3 영감, 메뉴명만)
const ComparisonCard = ({ label = '이번 달', current = 11, prev = 8, unit = '개', topLabel = '어구록' }) => {
 const max = Math.max(current, prev, 1);
 const diff = current - prev;
 return (
  <div>
   <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 14 }}>
    <span className="upper">{topLabel}</span>
    <div style={{ flex: 1 }} />
    <span style={{ fontSize: 11.5, color: diff > 0 ? '#c2553a' : 'var(--ink-3)', fontFamily: 'var(--mono)', fontWeight: 600 }}>
     {diff > 0 ? '+' : ''}{diff}{unit}
    </span>
   </div>
   <div style={{ display: 'grid', gridTemplateColumns: '36px 1fr 36px', gap: 10, alignItems: 'center', rowGap: 8 }}>
    <span style={{ fontSize: 12, color: 'var(--ink-2)', fontWeight: 600 }}>{label}</span>
    <div style={{ height: 18, borderRadius: 4, background: 'var(--line-2)', position: 'relative', overflow: 'hidden' }}>
     <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${(current / max) * 100}%`, background: 'var(--ink-1)' }} />
    </div>
    <span className="mono" style={{ fontSize: 12, fontWeight: 700, textAlign: 'right' }}>{current}{unit}</span>

    <span style={{ fontSize: 12, color: 'var(--ink-3)', fontWeight: 500 }}>지난 달</span>
    <div style={{ height: 18, borderRadius: 4, background: 'var(--line-2)', position: 'relative', overflow: 'hidden' }}>
     <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${(prev / max) * 100}%`, background: 'var(--ink-4)' }} />
    </div>
    <span className="mono" style={{ fontSize: 12, color: 'var(--ink-3)', textAlign: 'right' }}>{prev}{unit}</span>
   </div>
  </div>
 );
};

// ─── CalendarMonth — 한 달 그리드. 어구록 있는 날에 미니 표지 + 카운트.
//   기능: 클릭 시 그 날의 어구록 모음으로 이동.
const CalendarMonth = ({ year = 2026, month = 5, dayData = {}, cellW = 100, cellH = 88, onDay }) => {
 // ISO weekday-of-1st: in 2026, May 1 = Friday → idx=5 (Sun=0)
 const firstDow = new Date(year, month - 1, 1).getDay();
 const daysInMonth = new Date(year, month, 0).getDate();
 const cells = [];
 for (let i = 0; i < firstDow; i++) cells.push(null);
 for (let d = 1; d <= daysInMonth; d++) cells.push(d);
 while (cells.length % 7) cells.push(null);

 const dows = ['일', '월', '화', '수', '목', '금', '토'];

 return (
  <div>
   {/* DOW header */}
   <div style={{ display: 'grid', gridTemplateColumns: `repeat(7, ${cellW}px)`, marginBottom: 4 }}>
    {dows.map((d, i) => (
     <div key={d} style={{
      height: 32,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 12, fontWeight: 500,
      color: i === 0 ? '#c2553a' : 'var(--ink-3)',
      letterSpacing: '-.005em',
     }}>{d}</div>
    ))}
   </div>
   {/* Cells */}
   <div style={{ display: 'grid', gridTemplateColumns: `repeat(7, ${cellW}px)`, gridAutoRows: cellH, borderTop: '1px solid var(--line-2)' }}>
    {cells.map((d, i) => {
     if (d == null) return <div key={i} style={{ borderBottom: '1px solid var(--line-2)' }} />;
     const data = dayData[d];
     const isToday = d === 22; // demo: today
     const dow = (i % 7);
     return (
      <div key={i} onClick={() => onDay?.(d)} style={{
       position: 'relative',
       borderBottom: '1px solid var(--line-2)',
       padding: '8px 8px',
       cursor: data ? 'pointer' : 'default',
       background: isToday ? 'var(--hover)' : 'transparent',
      }}>
       <div style={{
        fontSize: 11.5,
        fontFamily: 'var(--mono)',
        color: dow === 0 ? '#c2553a' : data ? 'var(--ink-2)' : 'var(--ink-4)',
        fontWeight: isToday ? 700 : 500,
        opacity: data ? 1 : 0.55,
       }}>{d}</div>
       {data && (
        <div style={{ position: 'absolute', left: '50%', top: 26, transform: 'translateX(-50%)' }}>
         <DayBookCluster books={data.books} count={data.count} />
        </div>
       )}
      </div>
     );
    })}
   </div>
  </div>
 );
};

const DayBookCluster = ({ books = [], count = 0 }) => {
 if (books.length === 0) return null;
 // Stack up to 3 mini covers with slight horizontal offset
 const visible = books.slice(0, 3);
 return (
  <div style={{ position: 'relative', width: 32, height: 48 }}>
   {visible.map((b, i) => (
    <div key={i} style={{
     position: 'absolute',
     left: i * 4 - (visible.length - 1) * 2,
     top: i * 2,
     zIndex: visible.length - i,
    }}>
     <Cv b={b} scale={0.22} />
    </div>
   ))}
   {count > books.length && (
    <span style={{
     position: 'absolute', right: -8, bottom: -2,
     fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 600,
     padding: '1px 5px', background: '#fff', border: '1px solid var(--line)', borderRadius: 99,
     color: 'var(--ink-2)',
    }}>+{count - books.length}</span>
   )}
  </div>
 );
};

// ─── Button — 정련. 4 size × 3 variant.
const Btn = ({ children, variant = 'ghost', size = 'md', icon, iconR, onClick, active, style }) => {
 const sizes = {
  sm: { h: 28, px: 10, fs: 12, gap: 5, br: 6 },
  md: { h: 34, px: 14, fs: 13, gap: 6, br: 8 },
  lg: { h: 40, px: 18, fs: 14, gap: 7, br: 9 },
 };
 const s = sizes[size];
 const variants = {
  pri:   { bg: 'var(--ink-1)', col: '#fff', bd: 'var(--ink-1)', hov: '#000' },
  sec:   { bg: '#fff',         col: 'var(--ink-1)', bd: 'var(--line)', hov: 'var(--hover)' },
  ghost: { bg: 'transparent',  col: 'var(--ink-2)', bd: 'transparent', hov: 'var(--hover)' },
  warm:  { bg: '#c2553a',      col: '#fff', bd: '#c2553a', hov: '#a8442d' },
 };
 const v = variants[variant];
 const isIcon = !children;
 return (
  <button onClick={onClick} className="vbtn" style={{
   display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
   gap: s.gap,
   height: s.h, width: isIcon ? s.h : 'auto', padding: isIcon ? 0 : `0 ${s.px}px`,
   fontSize: s.fs, fontWeight: 500,
   color: active ? v.col : v.col,
   background: active ? v.hov : v.bg,
   border: `1px solid ${v.bd === 'transparent' ? 'transparent' : v.bd}`,
   borderRadius: s.br,
   cursor: 'pointer',
   transition: 'background .12s, border-color .12s',
   letterSpacing: '-.005em',
   ...style,
  }}>
   {icon && <Ic n={icon} sz={s.fs + 2} st={1.7} />}
   {children}
   {iconR && <Ic n={iconR} sz={s.fs + 1} st={1.7} />}
  </button>
 );
};

// ─── Top bar — 정련된 검색 필드
const TopBarV9 = ({ tab = 'excerpt' }) => (
 <header style={{
  padding: '16px 32px',
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
  {/* Search — inline, not a button */}
  <div style={{
   display: 'flex', alignItems: 'center', gap: 10,
   flex: 1, maxWidth: 540, marginLeft: 'auto', marginRight: 0,
   height: 36, padding: '0 14px',
   background: 'var(--paper)', borderRadius: 10,
   color: 'var(--ink-3)',
   border: '1px solid transparent',
   cursor: 'text',
  }}>
   <Ic n="search" sz={15} />
   <span style={{ flex: 1, fontSize: 13 }}>문장 · 책 · 작가 · 분야 · 단어</span>
   <span className="kbd">⌘K</span>
  </div>
  <Btn variant="pri" size="md" icon="plus">새 어구록</Btn>
 </header>
);

// ─── Tabs — 메뉴만, "좁히기" 폐기. 6개 차원.
const TabBar = ({ active = '전체', onAdd }) => {
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

Object.assign(window, {
 BookCardSlim, HoverActions, QuoteRow,
 StreakCard, ComparisonCard, CalendarMonth, DayBookCluster,
 Btn, TopBarV9, TabBar,
});
