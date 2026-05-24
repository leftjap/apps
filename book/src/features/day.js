/**
 * 날짜 상세 — v14 ScrDayV14 (details-v14.jsx:335-474) 이식, 실데이터.
 *  - hero 152px + 이 날의 흐름(인사이트 박스) + 타임라인(세로선·dot 없음)
 *  - aside: 이 주(주간 막대) · 읽은 책 · 인근 날
 */
import { registerScreen } from '../app.js';
import { Queries } from '../db/queries.js';
import { Profile } from '../services/profile.js';
import { bookOf } from '../data/books.js';
import { el } from '../ui/dom.js';
import { cover } from '../ui/cover.js';
import { screenShell, crumb } from '../ui/components.js';
import { barChart } from '../ui/charts.js';

const owners = (u) => [u?.id, Profile.getPartnerUserIdForEmail(u?.email)].filter(Boolean);
const DOW = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
const dayKey = (iso) => (iso || '').slice(0, 10);

async function render(host, params, ctx) {
  const d = params.d || '';
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) {
    host.appendChild(screenShell({ tab: 'stats', ctx, children: el('div', { style: { padding: 40, color: 'var(--ink-3)' } }, `잘못된 날짜: ${d}`) }));
    return;
  }
  const [, y, mo, da] = m;
  let all = [];
  try { all = await Queries.listAllQuotes(owners(ctx.user)); } catch (e) { console.warn('[day] 로드 실패', e?.message || e); }
  const list = all.filter((q) => dayKey(q.created_at) === d).sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
  const dateObj = new Date(`${d}T00:00:00Z`);
  const weekday = DOW[dateObj.getUTCDay()];
  const hhmm = (iso) => { const t = new Date(iso); return `${String(t.getUTCHours()).padStart(2, '0')}:${String(t.getUTCMinutes()).padStart(2, '0')}`; };

  // 이 주 (월~일) 카운트
  const dow = (dateObj.getUTCDay() + 6) % 7; // Mon=0..Sun=6
  const monday = new Date(dateObj); monday.setUTCDate(dateObj.getUTCDate() - dow);
  const weekDays = Array.from({ length: 7 }, (_, i) => { const dd = new Date(monday); dd.setUTCDate(monday.getUTCDate() + i); return dd.toISOString().slice(0, 10); });
  const weekCounts = weekDays.map((k) => all.filter((q) => dayKey(q.created_at) === k).length);
  const weekTotal = weekCounts.reduce((a, b) => a + b, 0);
  const weekActiveDays = weekCounts.filter((v) => v > 0).length;
  const weekAvg = weekActiveDays ? weekTotal / weekActiveDays : 0;
  const vsAvg = Math.round((list.length - weekAvg) * 10) / 10;
  const spanMs = list.length > 1 ? (new Date(list[list.length - 1].created_at) - new Date(list[0].created_at)) : 0;
  const spanHours = Math.max(0, Math.round(spanMs / 3600000));

  // 그 날 읽은 책 (distinct + count)
  const byBook = new Map(); for (const q of list) byBook.set(String(q.book_ref), (byBook.get(String(q.book_ref)) || 0) + 1);

  // 인근 날 (전/당/익일)
  const shift = (k, delta) => { const dd = new Date(`${k}T00:00:00Z`); dd.setUTCDate(dd.getUTCDate() + delta); return dd.toISOString().slice(0, 10); };
  const nearDay = (k, active) => {
    const qs = all.filter((q) => dayKey(q.created_at) === k);
    const books = new Set(qs.map((q) => q.book_ref));
    const firstBook = qs[0] ? bookOf(qs[0].book_ref) : null;
    const mm = Number(k.slice(5, 7)); const dd = Number(k.slice(8, 10));
    return { k, label: `${mm}/${dd}`, n: qs.length, sub: active ? `${qs.length}개 · ${books.size}권` : (firstBook?.t || '—'), active };
  };
  const near = [nearDay(shift(d, -1), false), nearDay(d, true), nearDay(shift(d, 1), false)];

  // ── hero (152px)
  const hero = el('section', { style: { display: 'flex', alignItems: 'flex-end', gap: 36, marginBottom: 32 } },
    el('div', { style: { display: 'flex', alignItems: 'baseline', gap: 14 } },
      el('span', { style: { fontFamily: 'var(--mono)', fontSize: 152, fontWeight: 700, letterSpacing: '-.045em', lineHeight: 0.85 } }, String(Number(da))),
      el('div', { style: { paddingBottom: 14 } },
        el('div', { style: { fontFamily: 'var(--mono)', fontSize: 14, color: 'var(--ink-3)', letterSpacing: '.04em' } }, `${y}.${mo}`),
        el('div', { style: { fontSize: 24, fontWeight: 700, letterSpacing: '-.025em', marginTop: 6 } }, weekday))));

  // ── 이 날의 흐름
  const flow = list.length ? el('div', { style: { padding: '18px 22px', background: '#fafaf7', borderRadius: 12, marginBottom: 36, fontSize: 14, lineHeight: 1.7, color: 'var(--ink-2)' } },
    el('div', { class: 'upper', style: { marginBottom: 8 } }, '이 날의 흐름'),
    '처음 옮긴 시간 ', el('b', { class: 'mono', style: { color: '#c2553a' } }, hhmm(list[0].created_at)),
    ', 마지막 ', el('b', { class: 'mono', style: { color: '#c2553a' } }, hhmm(list[list.length - 1].created_at)),
    el('span', { style: { color: 'var(--ink-3)' } }, ` · ${spanHours}시간 사이 `), el('b', { class: 'mono', style: { color: 'var(--ink-1)' } }, String(list.length)), ' 개를 옮겼습니다. ',
    '이 주 평균보다 ', el('b', { style: { color: '#c2553a' } }, `${vsAvg >= 0 ? '+' : ''}${vsAvg}`), '개.') : null;

  // ── 타임라인
  const timeline = el('section', {},
    el('h3', { style: { margin: '0 0 18px', fontSize: 16, fontWeight: 700, letterSpacing: '-.015em' } }, `어구록 ${list.length}개`),
    el('div', { style: { display: 'flex', flexDirection: 'column', gap: 12 } },
      ...list.map((q) => {
        const b = bookOf(q.book_ref);
        return el('div', { class: 'book-row', onClick: () => ctx.navigate(`/thread/${q.book_ref}/${q.id}`), style: { padding: '16px 18px', borderRadius: 12, cursor: 'pointer', background: '#fff', border: '1px solid var(--line-2)', boxShadow: '0 1px 2px rgba(20,18,14,0.03), 0 8px 24px -12px rgba(20,18,14,0.06)', display: 'grid', gridTemplateColumns: '64px auto 1fr', gap: 18, alignItems: 'flex-start' } },
          el('span', { class: 'mono', style: { fontSize: 16, fontWeight: 700, color: '#c2553a', paddingTop: 2 } }, hhmm(q.created_at)),
          b ? el('div', { style: { filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.08))' } }, cover(b, { scale: 0.24, lift: false })) : el('div', {}),
          el('div', { style: { minWidth: 0, paddingTop: 1 } },
            el('div', { style: { fontSize: 12, color: 'var(--ink-3)', fontWeight: 600, marginBottom: 6 } }, b?.t || q.book_ref),
            el('div', { style: { fontSize: 15, lineHeight: 1.6, fontWeight: 500, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' } },
              el('span', { style: { color: 'var(--ink-4)', fontFamily: 'var(--serif)' } }, '“'), q.text, el('span', { style: { color: 'var(--ink-4)', fontFamily: 'var(--serif)' } }, '”'))));
      })));

  // ── aside: 이 주 · 읽은 책 · 인근 날
  const weekSec = el('section', {},
    el('h3', { style: { margin: '0 0 14px', fontSize: 14, fontWeight: 700, letterSpacing: '-.012em' } }, '이 주'),
    barChart({ data: weekCounts, labels: ['월', '화', '수', '목', '금', '토', '일'], height: 60, highlightIndex: dow, gap: 8 }));

  const readSec = el('section', {},
    el('h3', { style: { margin: '0 0 14px', fontSize: 14, fontWeight: 700, letterSpacing: '-.012em' } }, `읽은 책 · ${byBook.size}`),
    ...[...byBook.entries()].map(([ref, c]) => { const b = bookOf(ref); if (!b) return null; return el('div', { class: 'book-row', onClick: () => ctx.navigate(`/book/${ref}`), style: { display: 'flex', alignItems: 'center', gap: 12, padding: '8px 8px', margin: '0 -8px', borderRadius: 8, cursor: 'pointer' } },
      cover(b, { scale: 0.2 }),
      el('div', { style: { flex: 1, minWidth: 0 } }, el('div', { style: { fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, b.t), el('div', { style: { fontSize: 11, color: 'var(--ink-3)', marginTop: 2 } }, b.a)),
      el('span', { class: 'mono', style: { fontSize: 11.5, color: 'var(--ink-3)' } }, String(c))); }).filter(Boolean));

  const nearSec = el('section', {},
    el('h3', { style: { margin: '0 0 14px', fontSize: 14, fontWeight: 700, letterSpacing: '-.012em' } }, '인근 날'),
    ...near.map((nd) => el('div', { class: 'book-row', onClick: nd.n ? () => ctx.navigate(`/day/${nd.k}`) : undefined, style: { display: 'flex', alignItems: 'baseline', gap: 12, padding: '8px 10px', margin: '0 -10px', borderRadius: 6, cursor: nd.n ? 'pointer' : 'default', background: nd.active ? 'rgba(194,85,58,0.06)' : 'transparent' } },
      el('span', { class: 'mono', style: { fontSize: 12, color: nd.active ? '#c2553a' : 'var(--ink-3)', fontWeight: nd.active ? 700 : 500, width: 36 } }, nd.label),
      el('span', { style: { fontSize: 12.5, color: 'var(--ink-2)', flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, nd.sub),
      el('span', { class: 'mono', style: { fontSize: 12.5, color: 'var(--ink-2)', fontWeight: 600 } }, String(nd.n)))));

  const aside = el('aside', { style: { display: 'flex', flexDirection: 'column', gap: 32, paddingTop: 26 } }, weekSec, readSec, nearSec);

  const grid = el('div', { class: 'day-grid page', style: { maxWidth: 1080, padding: '40px 44px 100px', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 320px', gap: 56 } },
    el('div', {}, hero, flow, list.length ? timeline : el('div', { style: { color: 'var(--ink-3)' } }, '이 날의 어구록이 없습니다.')), aside);
  const crumbEl = crumb({ ctx, path: [{ label: '캘린더', back: true, onBack: () => ctx.navigate('/stats') }, { label: `${y}년 ${Number(mo)}월` }, { label: `${Number(mo)}월 ${Number(da)}일`, last: true }] });
  host.appendChild(screenShell({ tab: 'stats', ctx, crumbEl, children: grid }));
}

registerScreen('day', render);
export default render;
