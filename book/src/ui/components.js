/**
 * 공유 UI 컴포넌트 — v14 design-ref(core/core-v9/v12/v14) 이식 (바닐라).
 * 시각은 v14 그대로. 회귀 금지: kbd·탭바·토스트·세로선·dot·sphere glow 재도입 금지.
 */
import { el } from './dom.js';
import { iconEl } from './icons.js';
import { cover } from './cover.js';

// ─── Btn — 3 size × 4 variant (core-v9 Btn) ─────────────────────────────────
const BTN_SIZES = {
  sm: { h: 28, px: 10, fs: 12, gap: 5, br: 6 },
  md: { h: 34, px: 14, fs: 13, gap: 6, br: 8 },
  lg: { h: 40, px: 18, fs: 14, gap: 7, br: 9 },
};
const BTN_VARIANTS = {
  pri: { bg: 'var(--ink-1)', col: '#fff', bd: 'var(--ink-1)', hov: '#000' },
  sec: { bg: '#fff', col: 'var(--ink-1)', bd: 'var(--line)', hov: 'var(--hover)' },
  ghost: { bg: 'transparent', col: 'var(--ink-2)', bd: 'transparent', hov: 'var(--hover)' },
  warm: { bg: '#c2553a', col: '#fff', bd: '#c2553a', hov: '#a8442d' },
};
export function btn({ label, variant = 'ghost', size = 'md', icon, iconR, onClick, active, title, style } = {}) {
  const s = BTN_SIZES[size] || BTN_SIZES.md;
  const v = BTN_VARIANTS[variant] || BTN_VARIANTS.ghost;
  const isIcon = label == null || label === '';
  const node = el('button', {
    class: 'vbtn', title,
    onClick: onClick ? (e) => { e.stopPropagation(); onClick(e); } : undefined,
    style: {
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: s.gap,
      height: s.h, width: isIcon ? s.h : 'auto', padding: isIcon ? 0 : `0 ${s.px}px`,
      fontSize: s.fs, fontWeight: 500, color: v.col,
      background: active ? v.hov : v.bg,
      border: `1px solid ${v.bd === 'transparent' ? 'transparent' : v.bd}`,
      borderRadius: s.br, cursor: 'pointer', transition: 'background .12s, border-color .12s',
      letterSpacing: '-.005em', ...(style || {}),
    },
  });
  if (icon) node.appendChild(iconEl(icon, { sz: s.fs + 2, st: 1.7 }));
  if (!isIcon) node.appendChild(document.createTextNode(label));
  if (iconR) node.appendChild(iconEl(iconR, { sz: s.fs + 1, st: 1.7 }));
  return node;
}

// ─── HoverActions (core-v12 HoverActionsV12) ────────────────────────────────
export function hoverActions({ actions = [], forceShow = false } = {}) {
  const wrap = el('div', { class: forceShow ? 'hov-actions force' : 'hov-actions', style: { display: 'inline-flex', gap: 2, flexShrink: 0 } });
  for (const a of actions) {
    const b = el('button', {
      class: 'ico-btn', title: a.label, 'aria-label': a.label,
      onClick: (e) => { e.stopPropagation(); a.onClick && a.onClick(e); },
      style: {
        width: 26, height: 26, borderRadius: 6, display: 'inline-flex', alignItems: 'center',
        justifyContent: 'center', background: 'transparent', border: 0, cursor: 'pointer',
        color: a.active ? '#c2553a' : 'var(--ink-3)',
      },
    });
    b.appendChild(iconEl(a.icon, { sz: a.icon === 'pin' ? 14 : 13 }));
    wrap.appendChild(b);
  }
  return wrap;
}

// ─── Count / CountPill (core-v14) ───────────────────────────────────────────
export function count({ n, label, mono = true } = {}) {
  return el('span', { style: { fontSize: 13, color: 'var(--ink-3)' } },
    el('b', { class: mono ? 'mono' : '', style: { color: 'var(--ink-1)', fontWeight: 700 } }, String(n)),
    label ? el('span', { style: { marginLeft: 4 } }, label) : null,
  );
}
export function countPill({ n } = {}) {
  return el('span', { class: 'mono', style: { padding: '4px 10px', borderRadius: 99, background: 'var(--paper)', color: 'var(--ink-2)', fontSize: 12, fontWeight: 600, letterSpacing: '.02em' } }, String(n));
}

// ─── 소연 marker (core.jsx SoyeonMark) ──────────────────────────────────────
export function soyeonMark({ size = 'sm' } = {}) {
  return el('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: size === 'xs' ? 10.5 : 11, color: 'var(--ink-3)', fontWeight: 500, letterSpacing: '-.005em' } },
    el('span', { style: { width: 5, height: 5, borderRadius: 50, background: '#9a9080' } }),
    '소연',
  );
}

// ─── TopBar (core-v14 TopBarV14) — 어구록/통계 탭 + 검색 + 새 어구록 ─────────
export function topBar({ tab = 'excerpt', ctx } = {}) {
  const nav = ctx?.navigate || (() => {});
  const brand = el('div', { style: { display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }, onClick: () => nav('/') },
    el('div', { style: { width: 28, height: 28, borderRadius: 8, background: 'var(--ink-1)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 15, letterSpacing: '-.04em' } }, 'b'),
    el('span', { style: { fontSize: 15.5, fontWeight: 700, letterSpacing: '-.022em' } }, 'book'),
  );
  const tabEl = (name, key, route) => el('span', {
    onClick: () => nav(route),
    style: { padding: '8px 14px', borderRadius: 7, fontSize: 14, fontWeight: tab === key ? 700 : 500, color: tab === key ? 'var(--ink-1)' : 'var(--ink-3)', cursor: 'pointer', background: tab === key ? 'var(--hover)' : 'transparent' },
  }, name);
  const navEl = el('nav', { style: { display: 'flex', gap: 4, marginLeft: 8 } }, tabEl('어구록', 'excerpt', '/'), tabEl('통계', 'stats', '/stats'));
  const search = el('div', {
    class: 'topbar-search',
    onClick: () => nav('/search'),
    style: { display: 'flex', alignItems: 'center', gap: 10, flex: 1, maxWidth: 640, marginLeft: 'auto', height: 40, padding: '0 16px', background: 'var(--paper)', borderRadius: 10, color: 'var(--ink-3)', cursor: 'text' },
  }, iconEl('search', { sz: 16 }), el('span', { style: { flex: 1, fontSize: 14 } }, '책 · 작가 · 분야 · 단어 · 어구록'));
  return el('header', {
    class: 'topbar',
    style: { padding: '16px 36px', display: 'flex', alignItems: 'center', gap: 22, background: '#fff', borderBottom: '1px solid var(--line-2)', position: 'sticky', top: 0, zIndex: 5 },
  }, brand, navEl, search, btn({ label: '새 어구록', variant: 'pri', size: 'md', icon: 'plus', onClick: () => nav('/add') }));
}

// ─── BookRow (core-v14 BookRowV14) ──────────────────────────────────────────
export function bookRow({ b, count: cnt, soyeon, meta, onClick } = {}) {
  const metaRow = el('div', { style: { fontSize: 13, color: 'var(--ink-3)', marginTop: 5, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 10 } },
    el('span', {}, b.a),
    meta ? el('span', { style: { color: 'var(--ink-4)' } }, '·') : null,
    meta ? el('span', {}, meta) : null,
    soyeon ? soyeonMark({ size: 'xs' }) : null,
  );
  return el('div', {
    class: 'book-row', onClick,
    style: { display: 'flex', alignItems: 'center', gap: 18, padding: '8px 12px', margin: '0 -12px', borderRadius: 10, cursor: onClick ? 'pointer' : 'default' },
  },
    cover(b, { scale: 0.46 }),
    el('div', { style: { flex: 1, minWidth: 0 } },
      el('div', { style: { fontSize: 16, fontWeight: 700, letterSpacing: '-.02em', lineHeight: 1.3, color: 'var(--ink-1)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' } }, b.t),
      metaRow,
    ),
    cnt != null ? countPill({ n: cnt }) : null,
  );
}

// ─── QuoteRow (core-v14 QuoteRowV14) — 3줄 clamp + 메타 + 호버 액션 ──────────
// q: { text, pinned, timeLabel, commentCount }
export function quoteRow({ q, fontSize = 16, onClick, onPin, onEdit, onMore, demoActions = false } = {}) {
  const cN = q.commentCount || 0;
  const body = el('div', {
    style: { fontSize, lineHeight: 1.65, fontWeight: q.pinned ? 600 : 500, letterSpacing: '-.012em', color: 'var(--ink-1)', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', fontFamily: 'var(--sans)' },
  },
    el('span', { style: { fontFamily: 'var(--serif)', color: 'var(--ink-4)', marginRight: '.1em' } }, '“'),
    q.text,
    el('span', { style: { fontFamily: 'var(--serif)', color: 'var(--ink-4)', marginLeft: '.04em' } }, '”'),
  );
  const meta = el('div', { style: { display: 'flex', alignItems: 'center', gap: 10, marginTop: 7 } },
    q.pinned ? el('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: '#c2553a', fontWeight: 600 } }, iconEl('pin', { sz: 11.5, st: 1.8 }), '핀') : null,
    el('span', { class: 'mono', style: { fontSize: 11.5, color: 'var(--ink-4)', letterSpacing: '.02em' } }, q.timeLabel || ''),
    cN > 0 ? el('span', { style: { color: 'var(--ink-4)' } }, '·') : null,
    cN > 0 ? el('span', { style: { fontSize: 12, color: 'var(--ink-3)' } }, `댓글 ${cN}`) : null,
    el('div', { style: { flex: 1 } }),
    hoverActions({
      forceShow: demoActions,
      actions: [
        { icon: 'pin', label: '핀', active: q.pinned, onClick: onPin },
        { icon: 'edit', label: '수정', onClick: onEdit },
        { icon: 'dots-v', label: '더보기', onClick: onMore },
      ],
    }),
  );
  return el('div', { class: 'quote-row', onClick, style: { padding: '12px 12px 14px', margin: '0 -12px', borderRadius: 8, cursor: onClick ? 'pointer' : 'default' } }, body, meta);
}

// ─── StreakCard (core-v14 StreakCardV14) — warm wash + 주간 strip ───────────
export function streakCard({ days = 0, longest = 0, dailyAvg = 0, lastEntry = '—', weekHits = [0, 0, 0, 0, 0, 0, 0], todayDow = 4 } = {}) {
  const strip = el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, marginBottom: 8 } },
    ...weekHits.map((hit, i) => el('div', { style: { height: 4, borderRadius: 99, background: hit ? '#c2553a' : 'var(--paper-2)', opacity: hit ? (i === todayDow ? 1 : 0.85) : 1 } })));
  const dows = el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 } },
    ...['월', '화', '수', '목', '금', '토', '일'].map((d, i) => el('span', { class: 'mono', style: { fontSize: 10.5, textAlign: 'center', color: i === todayDow ? 'var(--ink-1)' : 'var(--ink-3)', fontWeight: i === todayDow ? 700 : 500 } }, d)));
  const stats = el('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1.2fr', gap: 14, paddingTop: 14, borderTop: '1px solid var(--line-2)' } },
    ...[['최장', `${longest}일`], ['평균', `${dailyAvg}/일`], ['마지막', lastEntry]].map(([l, v]) => el('div', {},
      el('div', { style: { fontSize: 10, color: 'var(--ink-3)', marginBottom: 5, fontFamily: 'var(--mono)', letterSpacing: '.06em', textTransform: 'uppercase' } }, l),
      el('div', { style: { fontSize: 14, fontWeight: 600, fontFamily: 'var(--mono)' } }, v),
    )));
  return el('div', { style: { position: 'relative', background: '#fff', borderRadius: 14, padding: '24px 26px 22px', overflow: 'hidden', border: '1px solid rgba(217,119,87,0.07)', boxShadow: '0 1px 2px rgba(20,18,14,0.03), 0 8px 24px -10px rgba(20,18,14,0.08)' } },
    el('div', { style: { position: 'absolute', inset: 0, background: 'radial-gradient(circle 260px at 25% 20%, rgba(217,119,87,0.10) 0%, rgba(217,119,87,0.025) 35%, rgba(217,119,87,0) 70%)', pointerEvents: 'none' } }),
    el('div', { style: { position: 'relative' } },
      el('div', { class: 'upper', style: { marginBottom: 12, display: 'flex', alignItems: 'center', gap: 7 } }, '연속', el('span', { style: { width: 5, height: 5, borderRadius: 50, background: '#c2553a' } })),
      el('div', { style: { display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 24 } },
        el('span', { style: { fontSize: 60, fontWeight: 700, letterSpacing: '-.035em', lineHeight: 1, fontFamily: 'var(--mono)', color: 'var(--ink-1)' } }, String(days)),
        el('span', { style: { fontSize: 15, color: 'var(--ink-2)', fontWeight: 500 } }, '일째'),
      ),
      el('div', { style: { marginBottom: 22 } }, strip, dows),
      stats,
    ),
  );
}

// ─── ComparisonCard (core-v9) ───────────────────────────────────────────────
export function comparisonCard({ label = '이번 달', current = 0, prev = 0, unit = '개', topLabel = '어구록' } = {}) {
  const max = Math.max(current, prev, 1);
  const diff = current - prev;
  const barRow = (lab, val, color, valColor, mono) => [
    el('span', { style: { fontSize: 12, color: lab === label ? 'var(--ink-2)' : 'var(--ink-3)', fontWeight: lab === label ? 600 : 500 } }, lab),
    el('div', { style: { height: 18, borderRadius: 4, background: 'var(--line-2)', position: 'relative', overflow: 'hidden' } },
      el('div', { style: { position: 'absolute', left: 0, top: 0, bottom: 0, width: `${(val / max) * 100}%`, background: color } })),
    el('span', { class: 'mono', style: { fontSize: 12, fontWeight: mono ? 700 : 400, color: valColor, textAlign: 'right' } }, `${val}${unit}`),
  ];
  return el('div', {},
    el('div', { style: { display: 'flex', alignItems: 'baseline', marginBottom: 14 } },
      el('span', { class: 'upper' }, topLabel),
      el('div', { style: { flex: 1 } }),
      el('span', { style: { fontSize: 11.5, color: diff > 0 ? '#c2553a' : 'var(--ink-3)', fontFamily: 'var(--mono)', fontWeight: 600 } }, `${diff > 0 ? '+' : ''}${diff}${unit}`),
    ),
    el('div', { style: { display: 'grid', gridTemplateColumns: '36px 1fr 36px', gap: 10, alignItems: 'center', rowGap: 8 } },
      ...barRow(label, current, 'var(--ink-1)', 'var(--ink-1)', true),
      ...barRow('지난 달', prev, 'var(--ink-4)', 'var(--ink-3)', false),
    ),
  );
}

// ─── PageTitle / PanelHead (core-v14) ───────────────────────────────────────
export function pageTitle({ upper, title, right, large = false } = {}) {
  return el('div', { class: 'page-title-wrap', style: { display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 36 } },
    el('div', {},
      upper ? el('span', { class: 'upper', style: { fontSize: 11 } }, upper) : null,
      el('h1', { style: { margin: upper ? '10px 0 0' : 0, fontSize: large ? 44 : 36, fontWeight: 700, letterSpacing: '-.032em', lineHeight: 1.05 } }, title),
    ),
    right || null,
  );
}
export function panelHead({ title, sub, right } = {}) {
  return el('div', { style: { display: 'flex', alignItems: 'baseline', marginBottom: 18 } },
    el('h3', { style: { margin: 0, fontSize: 16, fontWeight: 700, letterSpacing: '-.018em' } }, title),
    sub != null ? el('span', { class: 'mono', style: { fontSize: 11.5, color: 'var(--ink-4)', marginLeft: 10 } }, String(sub)) : null,
    el('div', { style: { flex: 1 } }),
    right || null,
  );
}

// ─── Crumb (details-v12) — 브레드크럼 ───────────────────────────────────────
// path: [{ label, back, onBack }, { label }, { label }] — 마지막은 강조, back 은 ← 버튼.
export function crumb({ path = [], ctx } = {}) {
  const wrap = el('div', { style: { padding: '10px 36px', display: 'flex', alignItems: 'center', gap: 8, background: '#fff', fontSize: 12.5 } });
  path.forEach((p, i) => {
    if (i > 0) wrap.appendChild(iconEl('chev', { sz: 11, style: 'color:var(--ink-4)' }));
    if (p.back) {
      wrap.appendChild(btn({ label: p.label, variant: 'ghost', size: 'sm', icon: 'arL', onClick: p.onBack || (() => (ctx?.navigate ? ctx.navigate('/') : history.back())) }));
    } else if (i === path.length - 1) {
      wrap.appendChild(el('span', { style: { fontWeight: 600, color: 'var(--ink-1)' } }, p.label));
    } else {
      wrap.appendChild(el('span', { style: { color: 'var(--ink-3)' } }, p.label));
    }
  });
  return wrap;
}

// ─── Modal (core-v14 ModalV14) ──────────────────────────────────────────────
export function modal({ title, subtitle, onClose, children, footer, width = 620 } = {}) {
  const overlay = el('div', {
    style: { position: 'absolute', inset: 0, background: 'rgba(20,18,14,.36)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 30 },
    onClick: (e) => { if (e.target === overlay && onClose) onClose(); },
  },
    el('div', { style: { width, maxHeight: '88%', background: '#fff', borderRadius: 16, boxShadow: '0 4px 12px -2px rgba(20,18,14,.10), 0 24px 60px -16px rgba(20,18,14,.32)', display: 'flex', flexDirection: 'column', overflow: 'hidden' } },
      el('div', { style: { padding: '22px 26px 18px', display: 'flex', alignItems: 'flex-start', borderBottom: '1px solid var(--line-2)' } },
        el('div', { style: { flex: 1, minWidth: 0 } },
          el('h2', { style: { margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: '-.018em' } }, title),
          subtitle ? el('div', { style: { fontSize: 12.5, color: 'var(--ink-3)', marginTop: 5 } }, subtitle) : null,
        ),
        btn({ icon: 'close', variant: 'ghost', size: 'sm', onClick: onClose, title: '닫기', style: { color: 'var(--ink-3)' } }),
      ),
      el('div', { style: { flex: 1, overflow: 'auto' } }, ...(Array.isArray(children) ? children : [children])),
      footer ? el('div', { style: { padding: '14px 26px', borderTop: '1px solid var(--line-2)', display: 'flex', alignItems: 'center', gap: 10, background: '#fafaf7' } }, ...(Array.isArray(footer) ? footer : [footer])) : null,
    ),
  );
  return overlay;
}

// ─── screenShell — .bk > TopBar + main (각 화면 공통 셸) ─────────────────────
export function screenShell({ tab = 'excerpt', ctx, mainStyle, crumbEl, children } = {}) {
  const kids = Array.isArray(children) ? children : [children];
  const main = el('main', { style: mainStyle || {} }, ...kids);
  const parts = [topBar({ tab, ctx })];
  if (crumbEl) parts.push(crumbEl);
  parts.push(main);
  return el('div', { class: 'bk' }, ...parts);
}

export default {
  btn, hoverActions, count, countPill, soyeonMark, topBar, bookRow, quoteRow,
  streakCard, comparisonCard, pageTitle, panelHead, crumb, modal, screenShell,
};
