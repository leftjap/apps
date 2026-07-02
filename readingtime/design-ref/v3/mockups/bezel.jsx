// bezel.jsx — 리딩타임 notched-iPhone frame (warm paper aesthetic)
// Exports window.RTBezel({ children, variant, time, battery })
// variant: 'paper' (default warm) | 'plain' (white) | 'dark'

function RTBezel({ children, variant = 'paper', time = '9:41', battery = 82 }) {
  const dark = variant === 'dark';
  const W = 390, H = 844;
  const fg = dark ? '#ffffff' : '#141413';
  const screenBg = dark ? '#17140f' : (variant === 'plain' ? '#ffffff' : '#faf9f5');
  const fillW = 18 * Math.max(0, Math.min(1, battery / 100));
  const grain = "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.08 0 0 0 0 0.08 0 0 0 0 0.07 0 0 0 0.02 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>\")";

  return (
    <div style={{
      width: W, height: H, position: 'relative', flex: 'none',
      borderRadius: 56, padding: 12, boxSizing: 'border-box',
      background: 'linear-gradient(150deg,#2a2620,#0f0d0a 55%,#1c1813)',
      boxShadow: '0 2px 3px rgba(0,0,0,.4), 0 1px 0 1.5px rgba(255,255,255,.05) inset, 0 40px 70px -28px rgba(60,45,30,.5), 0 0 0 1px rgba(0,0,0,.5)',
    }}>
      <div style={{ position: 'absolute', left: -2, top: 168, width: 3, height: 30, borderRadius: 3, background: '#211d18' }} />
      <div style={{ position: 'absolute', left: -2, top: 214, width: 3, height: 54, borderRadius: 3, background: '#211d18' }} />
      <div style={{ position: 'absolute', left: -2, top: 282, width: 3, height: 54, borderRadius: 3, background: '#211d18' }} />
      <div style={{ position: 'absolute', right: -2, top: 236, width: 3, height: 78, borderRadius: 3, background: '#211d18' }} />

      <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: 45, overflow: 'hidden', background: screenBg }}>
        {/* notch */}
        <div style={{
          position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
          width: 162, height: 29, background: '#000', borderRadius: '0 0 20px 20px', zIndex: 50,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24,
        }}>
          <div style={{ width: 36, height: 5, borderRadius: 4, background: '#17191b' }} />
          <div style={{ position: 'absolute', right: 40, top: 9, width: 9, height: 9, borderRadius: '50%', background: '#0a1512', boxShadow: 'inset 0 0 2px 1px rgba(60,90,80,.4)' }} />
        </div>

        {/* status bar */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 47, zIndex: 40,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 32px', color: fg,
        }}>
          <div style={{ fontFamily: "'Poppins',system-ui,sans-serif", fontSize: 15, fontWeight: 600, letterSpacing: 0.2, paddingTop: 7 }}>{time}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6.5, paddingTop: 7 }}>
            <svg width="17" height="11" viewBox="0 0 17 11" fill={fg}><rect x="0" y="7" width="3" height="4" rx="1"/><rect x="4.6" y="5" width="3" height="6" rx="1"/><rect x="9.2" y="2.5" width="3" height="8.5" rx="1"/><rect x="13.8" y="0" width="3" height="11" rx="1"/></svg>
            <svg width="16" height="11" viewBox="0 0 16 11" fill={fg}><path d="M8 2.15c2.4 0 4.6.92 6.25 2.5l1.35-1.42C13.6 1.22 10.94 0 8 0 5.06 0 2.4 1.22.4 3.23L1.75 4.65C3.4 3.07 5.6 2.15 8 2.15z"/><path d="M8 5.5c1.4 0 2.68.55 3.66 1.46l1.35-1.44C11.66 4.28 9.9 3.6 8 3.6s-3.66.68-5.01 1.92l1.35 1.44A5.32 5.32 0 0 1 8 5.5z"/><circle cx="8" cy="9.1" r="1.65"/></svg>
            <svg width="26" height="12" viewBox="0 0 26 12"><rect x="0.5" y="0.5" width="21" height="11" rx="3" fill="none" stroke={fg} strokeOpacity="0.4"/><rect x="2" y="2" width={fillW} height="8" rx="1.6" fill={fg}/><path d="M23.5 4v4c.9-.35 1.5-1.1 1.5-2s-.6-1.65-1.5-2z" fill={fg} fillOpacity="0.5"/></svg>
          </div>
        </div>

        {/* content */}
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>{children}</div>

        {/* paper grain */}
        {!dark && <div style={{ position: 'absolute', inset: 0, zIndex: 55, pointerEvents: 'none', opacity: 0.5, mixBlendMode: 'multiply', backgroundImage: grain }} />}

        {/* home indicator */}
        <div style={{
          position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)',
          width: 134, height: 5, borderRadius: 3, zIndex: 60, pointerEvents: 'none',
          background: dark ? 'rgba(255,255,255,.85)' : 'rgba(20,20,19,.28)',
        }} />
      </div>
    </div>
  );
}
window.RTBezel = RTBezel;
