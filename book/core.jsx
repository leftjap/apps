// ─── Icons ─────────────────────────────────────────────────────────────
const I = {
 search:<><circle cx="11" cy="11" r="6"/><path d="M20 20l-4-4"/></>,
 plus:<path d="M12 5v14M5 12h14"/>,
 quote:<><path d="M7 7h4v4c0 3-1.5 5-4 6"/><path d="M14 7h4v4c0 3-1.5 5-4 6"/></>,
 chart:<><path d="M4 19V5"/><path d="M4 19h16"/><path d="M8 14v4"/><path d="M12 9v9"/><path d="M16 12v6"/></>,
 dots:<><circle cx="6" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="18" cy="12" r="1.2"/></>,
 'dots-v':<><circle cx="12" cy="6" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="12" cy="18" r="1.2"/></>,
 ar:<path d="M5 12h14M13 6l6 6-6 6"/>,
 arL:<path d="M19 12H5M11 6L5 12l6 6"/>,
 chev:<path d="M9 6l6 6-6 6"/>,
 chevL:<path d="M15 6l-6 6 6 6"/>,
 chevD:<path d="M6 9l6 6 6-6"/>,
 close:<path d="M6 6l12 12M18 6l-12 12"/>,
 pin:<path d="M12 3l3 5 5 1-4 4 1 6-5-3-5 3 1-6-4-4 5-1z"/>,
 hash:<path d="M5 9h14M5 15h14M10 4l-2 16M16 4l-2 16"/>,
 sparkle:<path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"/>,
 sliders:<><path d="M4 6h10M4 12h6M4 18h14"/><circle cx="17" cy="6" r="2.2"/><circle cx="13" cy="12" r="2.2"/><circle cx="20" cy="18" r="0" /></>,
 book:<><path d="M4 4h7v16H4z"/><path d="M11 4h9v16h-9"/><path d="M4 4c0 0 3.5-1 7-1s7 1 7 1"/></>,
 user:<><circle cx="12" cy="8" r="3.5"/><path d="M5 20c1-4 4-6 7-6s6 2 7 6"/></>,
 layer:<><path d="M12 4l9 5-9 5-9-5z"/><path d="M3 14l9 5 9-5"/></>,
 cal:<><rect x="4" y="6" width="16" height="14" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/></>,
 clock:<><circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/></>,
 enter:<path d="M9 10V6h11v12H4l5-5-5-5"/>,
 filter:<><path d="M4 5h16l-6 8v6l-4-2v-4z"/></>,
 edit:<><path d="M4 20h4l10-10-4-4L4 16z"/><path d="M14 6l4 4"/></>,
 comment:<><path d="M4 5h16v10H10l-4 4V5z"/></>,
 share:<><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.2 11l7.6-4.2M8.2 13l7.6 4.2"/></>,
 trash:<><path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13"/></>,
 check:<path d="M5 12l5 5 9-11"/>,
};
const Ic = ({n, sz=18, st=1.5, style, className=''}) => (
 <svg className={`i ${className}`} width={sz} height={sz} viewBox="0 0 24 24" strokeWidth={st} style={style}>{I[n]}</svg>
);

// ─── Cover renderer — uses real mm dimensions, scaled by `scale` (px per mm)
// scale=0.55 → cover widths ~63-83px; scale=0.75 → ~85-114; scale=1.1 → ~125-167
const Cv = ({ b, scale=0.75, style, lift=true }) => {
 const w = Math.round(b.w * scale);
 const h = Math.round(b.h * scale);
 const padScale = scale / 0.75;
 const baseStyle = {
  width: w,
  height: h,
  background: b.bg,
  color: b.fg,
  '--ax': b.ax,
  borderRadius: Math.max(3, 5 * padScale),
  padding: Math.round(10 * padScale),
  position: 'relative',
  overflow: 'hidden',
  boxShadow: lift
   ? '0 1px 2px rgba(20,18,14,.10), 0 6px 14px -6px rgba(20,18,14,.18), 0 14px 26px -16px rgba(20,18,14,.22)'
   : '0 1px 2px rgba(20,18,14,.08)',
  display: 'flex',
  flexDirection: 'column',
  fontFamily: 'var(--sans)',
  flexShrink: 0,
  ...style,
 };
 const ts = Math.max(7, Math.round(13 * padScale));   // title
 const ss = Math.max(5.5, Math.round(8.5 * padScale)); // sub
 const as = Math.max(6, Math.round(8 * padScale));    // author

 const inner = (() => {
  if (b.d === 'dframe') {
   return (
    <div style={{position:'absolute',inset:Math.round(8*padScale),background:'#fff',borderRadius:3,display:'flex',flexDirection:'column',justifyContent:'center',alignItems:'center',textAlign:'center',padding:Math.round(10*padScale),color:'#1d1a14'}}>
     <div style={{fontWeight:700,fontSize:ts,letterSpacing:'-.022em',lineHeight:1.18,color:'#1d1a14'}}>{b.t}</div>
     {padScale>=0.7 && <div style={{fontWeight:500,fontSize:ss,marginTop:4,color:'#605c52',opacity:.85}}>{b.sub}</div>}
     <div style={{marginTop:Math.round(10*padScale),fontFamily:'var(--mono)',fontSize:Math.max(6,Math.round(7*padScale)),color:'#9a9789',letterSpacing:'.05em',fontWeight:500}}>{b.a}</div>
    </div>
   );
  }
  if (b.d === 'dsplit') {
   return (
    <>
     <div style={{position:'absolute',inset:0,background:'var(--ax)',clipPath:'polygon(0 42%,100% 36%,100% 100%,0 100%)'}}/>
     <div style={{position:'absolute',left:0,right:0,top:0,height:'42%',display:'flex',alignItems:'center',justifyContent:'center',color:'var(--ax)'}}>
      <svg width={Math.round(28*padScale)} height={Math.round(28*padScale)} viewBox="0 0 40 40" fill="currentColor" style={{opacity:.85}}>
       <circle cx="20" cy="20" r="14"/><circle cx="20" cy="20" r="9" fill="#fff"/><circle cx="20" cy="20" r="5"/>
      </svg>
     </div>
     <div style={{position:'absolute',left:Math.round(10*padScale),right:Math.round(10*padScale),bottom:Math.round(10*padScale),color:'#fff',zIndex:2}}>
      <div style={{fontWeight:700,fontSize:ts,lineHeight:1.18}}>{b.t}</div>
      {padScale>=0.7 && <div style={{fontWeight:500,fontSize:ss,marginTop:2,opacity:.85}}>{b.sub}</div>}
      <div style={{fontWeight:400,fontSize:as,marginTop:4,opacity:.7}}>{b.a}</div>
     </div>
    </>
   );
  }
  if (b.d === 'dtypo') {
   return (
    <>
     <div style={{fontWeight:700,fontSize:Math.round(ts*1.05),letterSpacing:'-.018em',opacity:.95,lineHeight:1.15}}>{b.a}</div>
     <div style={{position:'absolute',left:Math.round(10*padScale),right:Math.round(10*padScale),top:'42%',height:1,background:'currentColor',opacity:.3}}/>
     <div style={{marginTop:'auto',fontSize:Math.max(7,Math.round(ts*0.78)),fontWeight:600,opacity:.92}}>{b.t}</div>
    </>
   );
  }
  if (b.d === 'dcream') {
   return (
    <>
     <div style={{position:'absolute',left:Math.round(10*padScale),top:Math.round(10*padScale),fontFamily:'var(--mono)',fontSize:Math.max(5.5,Math.round(7*padScale)),fontWeight:500,opacity:.55,letterSpacing:'.05em'}}>{b.a}</div>
     <div style={{marginTop:'auto'}}>
      <div style={{fontWeight:700,fontSize:ts,letterSpacing:'-.022em',lineHeight:1.18}}>{b.t}</div>
      {padScale>=0.7 && <div style={{fontWeight:500,fontSize:ss,marginTop:3,opacity:.6}}>{b.sub}</div>}
     </div>
    </>
   );
  }
  if (b.d === 'dphoto') {
   return (
    <>
     <div style={{position:'absolute',inset:0,background:'linear-gradient(180deg,transparent 50%,rgba(0,0,0,.4))'}}/>
     <div style={{marginTop:'auto',position:'relative',zIndex:1}}>
      <div style={{fontWeight:700,fontSize:ts,letterSpacing:'-.022em',lineHeight:1.18,textShadow:'0 1px 6px rgba(0,0,0,.4)'}}>{b.t}</div>
      {padScale>=0.7 && <div style={{fontWeight:500,fontSize:ss,marginTop:3,opacity:.9}}>{b.sub}</div>}
      <div style={{fontWeight:400,fontSize:as,marginTop:4,opacity:.75}}>{b.a}</div>
     </div>
    </>
   );
  }
  // dblock
  return (
   <>
    <div style={{fontWeight:700,fontSize:ts,letterSpacing:'-.022em',lineHeight:1.18}}>{b.t}</div>
    {padScale>=0.7 && <div style={{fontWeight:500,fontSize:ss,marginTop:3,opacity:.85}}>{b.sub}</div>}
    {b.deco && <div style={{position:'absolute',left:'50%',top:'55%',transform:'translate(-50%,-50%)'}}>{b.deco}</div>}
    <div style={{marginTop:'auto',fontWeight:400,fontSize:as,opacity:.7}}>{b.a}</div>
   </>
  );
 })();

 return (
  <div style={baseStyle}>
   {inner}
   <div style={{position:'absolute',inset:0,background:'linear-gradient(150deg,rgba(255,255,255,.05),rgba(0,0,0,.10))',pointerEvents:'none',borderRadius:'inherit'}}/>
   {/* spine / right edge sliver */}
   <div style={{position:'absolute',right:0,top:0,bottom:0,width:1,background:'rgba(0,0,0,.18)'}}/>
  </div>
 );
};

// ─── Curly quote primitives (real " " marks)
const QOpen  = ({sz=42, color='var(--ink-4)', style}) =>
 <span style={{fontFamily:'"Noto Serif KR","Pretendard",serif',fontSize:sz,lineHeight:1,color,fontWeight:400,...style}}>“</span>;
const QClose = ({sz=42, color='var(--ink-4)', style}) =>
 <span style={{fontFamily:'"Noto Serif KR","Pretendard",serif',fontSize:sz,lineHeight:1,color,fontWeight:400,...style}}>”</span>;

// ─── Quote text rendering with curly quotes
//   variant: 'inline'  → " before, " after the body in light gray, inline
//           'flank'   → big mark top-left + bottom-right, body centered
//           'plain'   → no marks, just text (when context already implies a quote)
const QuoteText = ({ text, fontSize=18, lineHeight=1.7, weight=500, variant='inline', serif=false, align='left', maxW, style }) => {
 const ff = serif ? '"Noto Serif KR","Pretendard",serif' : 'var(--sans)';
 const baseStyle = {fontSize,lineHeight,fontWeight:weight,letterSpacing:'-.012em',fontFamily:ff,color:'var(--ink-1)',textAlign:align,maxWidth:maxW,...style};
 if (variant === 'plain') return <div style={baseStyle}>{text}</div>;
 if (variant === 'flank') {
  const ms = Math.round(fontSize * 1.9);
  return (
   <div style={{position:'relative',...baseStyle, paddingTop:Math.round(ms*0.25), paddingBottom:Math.round(ms*0.4)}}>
    <span style={{position:'absolute',left:-Math.round(ms*0.05),top:-Math.round(ms*0.2),fontSize:ms,fontFamily:'"Noto Serif KR","Pretendard",serif',color:'var(--ink-4)',lineHeight:1,opacity:.5,fontWeight:400}}>“</span>
    <span style={{position:'relative',zIndex:1}}>{text}</span>
    <span style={{position:'absolute',right:-Math.round(ms*0.05),bottom:-Math.round(ms*0.55),fontSize:ms,fontFamily:'"Noto Serif KR","Pretendard",serif',color:'var(--ink-4)',lineHeight:1,opacity:.5,fontWeight:400}}>”</span>
   </div>
  );
 }
 // inline
 return (
  <div style={baseStyle}>
   <span style={{fontFamily:'"Noto Serif KR","Pretendard",serif',color:'var(--ink-4)',marginRight:'.1em'}}>“</span>
   {text}
   <span style={{fontFamily:'"Noto Serif KR","Pretendard",serif',color:'var(--ink-4)',marginLeft:'.04em'}}>”</span>
  </div>
 );
};

// ─── BookCard — ss3 pattern. Rounded outer card with subtle border.
// Cover lifts above the top edge. Count badge top-right with thin connector.
// Bottom of card has padding (taller than the cover).
const BookCard = ({ b, count, coverScale = 0.62, padR = 24, padV = 18, soyeon, right, dim, onClick, style }) => {
 const coverW = Math.round(b.w * coverScale);
 const coverH = Math.round(b.h * coverScale);
 const lift = Math.round(coverH * 0.12);
 const innerH = coverH - lift;
 const minH = innerH + padV * 2;

 return (
  <div onClick={onClick} style={{
   position: 'relative',
   background: '#fff',
   border: '1px solid var(--line)',
   borderRadius: 14,
   paddingLeft: 24 + coverW + 22,
   paddingRight: padR,
   paddingTop: padV,
   paddingBottom: padV,
   minHeight: minH,
   display: 'flex',
   alignItems: 'center',
   gap: 14,
   cursor: onClick ? 'pointer' : 'default',
   opacity: dim ? 0.55 : 1,
   transition: 'border-color .12s, box-shadow .12s, background .12s',
   ...style,
  }}>
   {/* Cover — absolute, sticks above */}
   <div style={{ position: 'absolute', left: 24, top: -lift }}>
    <Cv b={b} scale={coverScale} />
   </div>
   {/* Title + author */}
   <div style={{ flex: 1, minWidth: 0 }}>
    <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-.022em', lineHeight: 1.3, color: 'var(--ink-1)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{b.t}</div>
    <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 5, fontWeight: 500 }}>{b.a}</div>
   </div>
   {/* Right slot */}
   {right && <div style={{ flexShrink: 0 }}>{right}</div>}
   {soyeon && <SoyeonMark/>}
   {/* Count badge — top-right, sits on the border */}
   {count != null && (
    <div style={{
     position: 'absolute',
     top: -11,
     right: 16,
     minWidth: 28,
     height: 22,
     padding: '0 9px',
     background: '#fff',
     border: '1px solid var(--line)',
     borderRadius: 99,
     fontFamily: 'var(--mono)',
     fontSize: 11.5,
     fontWeight: 600,
     color: 'var(--ink-2)',
     display: 'inline-flex',
     alignItems: 'center',
     justifyContent: 'center',
     letterSpacing: '.02em',
    }}>{count}</div>
   )}
  </div>
 );
};

// ─── BookCardCompact — smaller variant (no count, no right slot)
const BookCardCompact = ({ b, coverScale = 0.5, onClick, dim }) => {
 const coverW = Math.round(b.w * coverScale);
 const coverH = Math.round(b.h * coverScale);
 const lift = Math.round(coverH * 0.12);
 const minH = (coverH - lift) + 28;

 return (
  <div onClick={onClick} style={{
   position: 'relative',
   background: '#fff',
   border: '1px solid var(--line)',
   borderRadius: 12,
   paddingLeft: 18 + coverW + 16,
   paddingRight: 18,
   paddingTop: 14,
   paddingBottom: 14,
   minHeight: minH,
   display: 'flex',
   alignItems: 'center',
   cursor: onClick ? 'pointer' : 'default',
   opacity: dim ? 0.55 : 1,
  }}>
   <div style={{ position: 'absolute', left: 18, top: -lift }}>
    <Cv b={b} scale={coverScale} />
   </div>
   <div style={{ flex: 1, minWidth: 0 }}>
    <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '-.018em', lineHeight: 1.3, color: 'var(--ink-1)', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{b.t}</div>
    <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 3, fontWeight: 500 }}>{b.a}</div>
   </div>
  </div>
 );
};

// ─── 소연 marker
const SoyeonMark = ({sz='sm'}) => (
 <span style={{display:'inline-flex',alignItems:'center',gap:5,fontSize:sz==='xs'?10.5:11,color:'var(--ink-3)',fontWeight:500,letterSpacing:'-.005em'}}>
  <span style={{width:5,height:5,borderRadius:50,background:'#9a9080'}}/>소연
 </span>
);

// ─── Top header — left aligned for ALL screens (consistent)
const TopBar = ({tab='excerpt'}) => (
 <header style={{padding:'18px 40px',display:'flex',alignItems:'center',gap:24,background:'#fff',borderBottom:'1px solid var(--line-2)',position:'sticky',top:0,zIndex:5}}>
  <div style={{display:'flex',alignItems:'center',gap:9}}>
   <div style={{width:24,height:24,borderRadius:6,background:'var(--ink-1)',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700,fontSize:13,letterSpacing:'-.04em'}}>b</div>
   <span style={{fontSize:14.5,fontWeight:700,letterSpacing:'-.022em'}}>book</span>
  </div>
  <nav style={{display:'flex',gap:4}}>
   {[['어구록','excerpt'],['통계','stats']].map(([n,k]) => (
    <span key={k} style={{padding:'6px 12px',borderRadius:6,fontSize:13,fontWeight:tab===k?700:500,color:tab===k?'var(--ink-1)':'var(--ink-3)',cursor:'pointer'}}>{n}</span>
   ))}
  </nav>
  <div style={{flex:1}}/>
  <div style={{display:'flex',alignItems:'center',gap:8,color:'var(--ink-3)',fontSize:13}}>
   <Ic n="search" sz={16}/>
   <span>검색</span>
   <span className="kbd" style={{marginLeft:2}}>⌘K</span>
  </div>
  <button className="btn pri"><Ic n="plus" sz={15} st={2}/>새 어구록</button>
 </header>
);

Object.assign(window, { I, Ic, Cv, QOpen, QClose, QuoteText, SoyeonMark, TopBar, BookCard, BookCardCompact });
