/**
 * 표지 렌더러 — v14 design-ref/core.jsx 의 Cv 이식.
 * 실제 책 mm 치수(b.w/b.h) × scale(px per mm) 로 상대 크기 렌더. 6개 디자인 변형.
 *  - scale=0.55 → ~63-83px, 0.75 → ~85-114, 1.1 → ~125-167.
 * 텍스트(b.t/b.sub/b.a)는 textNode 로 자동 이스케이프. deco 만 html 주입(상수 SVG).
 */
import { el } from './dom.js';

const box = (style, ...children) => el('div', { style }, ...children);

export function cover(b, { scale = 0.75, lift = true, style: extra } = {}) {
  const w = Math.round(b.w * scale);
  const h = Math.round(b.h * scale);
  const padScale = scale / 0.75;
  const ts = Math.max(7, Math.round(13 * padScale));
  const ss = Math.max(5.5, Math.round(8.5 * padScale));
  const as = Math.max(6, Math.round(8 * padScale));
  const showSub = padScale >= 0.7;

  const baseStyle = {
    width: w, height: h, background: b.bg, color: b.fg,
    borderRadius: Math.max(3, 5 * padScale),
    padding: Math.round(10 * padScale),
    position: 'relative', overflow: 'hidden',
    boxShadow: lift
      ? '0 1px 2px rgba(20,18,14,.10), 0 6px 14px -6px rgba(20,18,14,.18), 0 14px 26px -16px rgba(20,18,14,.22)'
      : '0 1px 2px rgba(20,18,14,.08)',
    display: 'flex', flexDirection: 'column',
    fontFamily: 'var(--sans)', flexShrink: 0,
    ...(extra || {}),
  };
  if (b.ax) baseStyle['--ax'] = b.ax;

  const outer = box(baseStyle);

  const children = [];
  if (b.d === 'dframe') {
    children.push(box({
      position: 'absolute', inset: Math.round(8 * padScale), background: '#fff', borderRadius: 3,
      display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
      textAlign: 'center', padding: Math.round(10 * padScale), color: '#1d1a14',
    },
      box({ fontWeight: 700, fontSize: ts, letterSpacing: '-.022em', lineHeight: 1.18, color: '#1d1a14' }, b.t),
      showSub ? box({ fontWeight: 500, fontSize: ss, marginTop: 4, color: '#605c52', opacity: 0.85 }, b.sub) : null,
      box({ marginTop: Math.round(10 * padScale), fontFamily: 'var(--mono)', fontSize: Math.max(6, Math.round(7 * padScale)), color: '#9a9789', letterSpacing: '.05em', fontWeight: 500 }, b.a),
    ));
  } else if (b.d === 'dsplit') {
    const svgSz = Math.round(28 * padScale);
    children.push(
      box({ position: 'absolute', inset: 0, background: 'var(--ax)', clipPath: 'polygon(0 42%,100% 36%,100% 100%,0 100%)' }),
      el('div', {
        style: { position: 'absolute', left: 0, right: 0, top: 0, height: '42%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ax)' },
        html: `<svg width="${svgSz}" height="${svgSz}" viewBox="0 0 40 40" fill="currentColor" style="opacity:.85"><circle cx="20" cy="20" r="14"/><circle cx="20" cy="20" r="9" fill="#fff"/><circle cx="20" cy="20" r="5"/></svg>`,
      }),
      box({ position: 'absolute', left: Math.round(10 * padScale), right: Math.round(10 * padScale), bottom: Math.round(10 * padScale), color: '#fff', zIndex: 2 },
        box({ fontWeight: 700, fontSize: ts, lineHeight: 1.18 }, b.t),
        showSub ? box({ fontWeight: 500, fontSize: ss, marginTop: 2, opacity: 0.85 }, b.sub) : null,
        box({ fontWeight: 400, fontSize: as, marginTop: 4, opacity: 0.7 }, b.a),
      ),
    );
  } else if (b.d === 'dtypo') {
    children.push(
      box({ fontWeight: 700, fontSize: Math.round(ts * 1.05), letterSpacing: '-.018em', opacity: 0.95, lineHeight: 1.15 }, b.a),
      box({ position: 'absolute', left: Math.round(10 * padScale), right: Math.round(10 * padScale), top: '42%', height: 1, background: 'currentColor', opacity: 0.3 }),
      box({ marginTop: 'auto', fontSize: Math.max(7, Math.round(ts * 0.78)), fontWeight: 600, opacity: 0.92 }, b.t),
    );
  } else if (b.d === 'dcream') {
    children.push(
      box({ position: 'absolute', left: Math.round(10 * padScale), top: Math.round(10 * padScale), fontFamily: 'var(--mono)', fontSize: Math.max(5.5, Math.round(7 * padScale)), fontWeight: 500, opacity: 0.55, letterSpacing: '.05em' }, b.a),
      box({ marginTop: 'auto' },
        box({ fontWeight: 700, fontSize: ts, letterSpacing: '-.022em', lineHeight: 1.18 }, b.t),
        showSub ? box({ fontWeight: 500, fontSize: ss, marginTop: 3, opacity: 0.6 }, b.sub) : null,
      ),
    );
  } else if (b.d === 'dphoto') {
    children.push(
      box({ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,transparent 50%,rgba(0,0,0,.4))' }),
      box({ marginTop: 'auto', position: 'relative', zIndex: 1 },
        box({ fontWeight: 700, fontSize: ts, letterSpacing: '-.022em', lineHeight: 1.18, textShadow: '0 1px 6px rgba(0,0,0,.4)' }, b.t),
        showSub ? box({ fontWeight: 500, fontSize: ss, marginTop: 3, opacity: 0.9 }, b.sub) : null,
        box({ fontWeight: 400, fontSize: as, marginTop: 4, opacity: 0.75 }, b.a),
      ),
    );
  } else {
    // dblock
    children.push(box({ fontWeight: 700, fontSize: ts, letterSpacing: '-.022em', lineHeight: 1.18 }, b.t));
    if (showSub) children.push(box({ fontWeight: 500, fontSize: ss, marginTop: 3, opacity: 0.85 }, b.sub));
    if (b.deco) children.push(el('div', { style: { position: 'absolute', left: '50%', top: '55%', transform: 'translate(-50%,-50%)' }, html: b.deco }));
    children.push(box({ marginTop: 'auto', fontWeight: 400, fontSize: as, opacity: 0.7 }, b.a));
  }

  for (const c of children) if (c) outer.appendChild(c);

  // gloss + spine
  outer.appendChild(box({ position: 'absolute', inset: 0, background: 'linear-gradient(150deg,rgba(255,255,255,.05),rgba(0,0,0,.10))', pointerEvents: 'none', borderRadius: 'inherit' }));
  outer.appendChild(box({ position: 'absolute', right: 0, top: 0, bottom: 0, width: 1, background: 'rgba(0,0,0,.18)' }));

  return outer;
}

export default { cover };
