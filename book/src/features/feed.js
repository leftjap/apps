/**
 * 피드 화면 — v14 ScrFeedV14 이식.
 *  - 메인: "어구록" 헤더 + (본인+파트너) 어구록을 (who,book) 그룹핑 → BookRow + 들여쓴 QuoteRow.
 *  - 사이드: StreakCard(실집계) · Pins(listPinned) · Comparison(월 비교 실집계) · Retro(가장 오래된 어구록).
 *  - 데이터: Dexie listFeed/listPinned (로컬 우선). 통계는 시드/실데이터에서 실제 계산.
 */
import { registerScreen } from '../app.js';
import { Queries } from '../db/queries.js';
import { Profile } from '../services/profile.js';
import { bookOf, groupQuotes, bookRefOf } from '../data/books.js';
import { el, clear } from '../ui/dom.js';
import { iconEl } from '../ui/icons.js';
import { cover } from '../ui/cover.js';
import { screenShell, bookRow, quoteRow, streakCard, comparisonCard, btn } from '../ui/components.js';
import { fmtDateTime } from '../ui/format.js';

function ownerIdsOf(user) {
  const me = user?.id;
  const partner = Profile.getPartnerUserIdForEmail(user?.email);
  return [me, partner].filter(Boolean);
}

/** quote row → 화면 view-model (who/book_ref/timeLabel/commentCount 주입). */
function toView(q, meId, commentCounts) {
  return {
    ...q,
    who: q.owner_id === meId ? 'me' : 'y',
    book_ref: String(q.book_ref),
    timeLabel: fmtDateTime(q.created_at || q.updated_at),
    commentCount: commentCounts[q.id] || 0,
  };
}

const dayKey = (iso) => (iso || '').slice(0, 10);

/** 시드/실데이터에서 streak·평균·주간 strip 실제 계산 (가장 최근 어구록 기준). */
function computeStats(quotes) {
  const total = quotes.length;
  if (!total) return { total: 0, days: 0, longest: 0, dailyAvg: 0, lastEntry: '—', weekHits: [0, 0, 0, 0, 0, 0, 0], todayDow: 4 };
  const days = [...new Set(quotes.map((q) => dayKey(q.created_at || q.updated_at)).filter(Boolean))].sort().reverse();
  const activeDays = days.length;
  const dayMs = 86400000;
  const diffDays = (a, b) => Math.round((new Date(a + 'T00:00:00Z') - new Date(b + 'T00:00:00Z')) / dayMs);
  // 현재 run: 최신 날짜에서 연속으로 이어진 일수
  let current = 1;
  for (let i = 1; i < days.length; i++) { if (diffDays(days[i - 1], days[i]) === 1) current++; else break; }
  // 최장 run
  let longest = 1, run = 1;
  for (let i = 1; i < days.length; i++) { if (diffDays(days[i - 1], days[i]) === 1) { run++; longest = Math.max(longest, run); } else run = 1; }
  const latestIso = quotes.map((q) => q.created_at || q.updated_at).filter(Boolean).sort().reverse()[0];
  const latest = new Date(latestIso);
  // 최신 어구록이 속한 주(월~일) 의 일별 작성 여부
  const dow = (latest.getUTCDay() + 6) % 7; // Mon=0..Sun=6
  const monday = new Date(latest); monday.setUTCDate(latest.getUTCDate() - dow);
  const weekHits = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday); d.setUTCDate(monday.getUTCDate() + i);
    return days.includes(d.toISOString().slice(0, 10)) ? 1 : 0;
  });
  return {
    total, days: current, longest,
    dailyAvg: Math.round((total / activeDays) * 10) / 10,
    lastEntry: fmtDateTime(latestIso),
    weekHits, todayDow: dow,
  };
}

function monthKey(iso) { return (iso || '').slice(0, 7); }

// ─── 사이드 rails ───────────────────────────────────────────────────────────
function railPins(pinned, ctx) {
  const head = el('div', { style: { display: 'flex', alignItems: 'baseline', marginBottom: 14 } },
    el('h3', { style: { margin: 0, fontSize: 14, fontWeight: 700, letterSpacing: '-.012em', display: 'inline-flex', alignItems: 'center', gap: 6 } },
      iconEl('pin', { sz: 13, st: 1.8, cls: '' }), '핀'),
    el('span', { class: 'mono', style: { fontSize: 11.5, color: 'var(--ink-4)', marginLeft: 8 } }, String(pinned.length)),
    el('div', { style: { flex: 1 } }),
    btn({ label: '핀 전체', variant: 'ghost', size: 'sm', iconR: 'ar', onClick: () => ctx.navigate('/all/pins'), style: { color: 'var(--ink-3)' } }),
  );
  const list = el('div', {}, ...pinned.slice(0, 3).map((q) => {
    const b = bookOf(q.book_ref);
    if (!b) return null;
    return el('div', {
      class: 'book-row', onClick: () => ctx.navigate(`/thread/${q.book_ref}/${q.id}`),
      style: { padding: '10px 10px', margin: '0 -10px', borderRadius: 8, cursor: 'pointer', display: 'flex', gap: 12, alignItems: 'flex-start' },
    },
      cover(b, { scale: 0.18, style: { marginTop: 2 } }),
      el('div', { style: { flex: 1, minWidth: 0 } },
        el('div', { style: { fontSize: 13, lineHeight: 1.55, color: 'var(--ink-1)', fontWeight: 500, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' } }, q.text),
        el('div', { class: 'mono', style: { fontSize: 10.5, color: 'var(--ink-4)', marginTop: 4 } }, b.t),
      ),
    );
  }).filter(Boolean));
  return el('section', {}, head, list);
}

function railComparison(quotes) {
  const months = [...new Set(quotes.map((q) => monthKey(q.created_at || q.updated_at)).filter(Boolean))].sort().reverse();
  const cur = months[0];
  const prev = months[1];
  const curN = quotes.filter((q) => monthKey(q.created_at || q.updated_at) === cur).length;
  const prevN = prev ? quotes.filter((q) => monthKey(q.created_at || q.updated_at) === prev).length : 0;
  const curBooks = new Set(quotes.filter((q) => monthKey(q.created_at || q.updated_at) === cur).map((q) => q.book_ref)).size;
  const prevBooks = prev ? new Set(quotes.filter((q) => monthKey(q.created_at || q.updated_at) === prev).map((q) => q.book_ref)).size : 0;
  return el('div', { style: { background: '#fff', borderRadius: 12, padding: '20px 22px 18px', border: '1px solid var(--line-2)', boxShadow: '0 1px 2px rgba(20,18,14,0.03), 0 8px 24px -10px rgba(20,18,14,0.07)' } },
    comparisonCard({ topLabel: '어구록', current: curN, prev: prevN, unit: '개' }),
    el('div', { style: { height: 22 } }),
    comparisonCard({ topLabel: '책', current: curBooks, prev: prevBooks, unit: '권' }),
  );
}

function railRetro(quotes, ctx) {
  // 가장 오래된 어구록 (resurfaced).
  const oldest = [...quotes].sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''))[0];
  if (!oldest) return null;
  const b = bookOf(oldest.book_ref);
  if (!b) return null;
  const weeksAgo = Math.max(1, Math.round((Date.now() - new Date(oldest.created_at).getTime()) / (7 * 86400000)));
  return el('div', {
    class: 'book-row', onClick: () => ctx.navigate(`/book/${oldest.book_ref}`),
    style: { background: '#fff', borderRadius: 12, padding: '20px 22px 22px', border: '1px solid var(--line-2)', boxShadow: '0 1px 2px rgba(20,18,14,0.03), 0 8px 24px -10px rgba(20,18,14,0.07)', cursor: 'pointer' },
  },
    el('div', { class: 'upper', style: { marginBottom: 12 } }, `${weeksAgo}주 전`),
    el('div', { style: { fontSize: 14.5, lineHeight: 1.7, color: 'var(--ink-1)', fontFamily: 'var(--serif)', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' } },
      el('span', { style: { color: 'var(--ink-4)' } }, '“'), oldest.text, el('span', { style: { color: 'var(--ink-4)' } }, '”')),
    el('div', { style: { marginTop: 14, display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: 'var(--ink-3)' } },
      cover(b, { scale: 0.16 }), el('span', { style: { fontWeight: 500 } }, b.t)),
  );
}

// ─── 메인 렌더 ───────────────────────────────────────────────────────────────
async function render(host, params, ctx) {
  const user = ctx.user;
  const owners = ownerIdsOf(user);
  const meId = user?.id;

  // 셸 먼저 (TopBar + 로딩 main)
  const mainInner = el('div', {});
  const shell = screenShell({ tab: 'excerpt', ctx, children: mainInner });
  host.appendChild(shell);

  if (!owners.length) {
    mainInner.appendChild(el('div', { style: { padding: 40, color: 'var(--ink-3)' } }, '로그인이 필요합니다.'));
    return;
  }

  let quotes = [];
  let pinned = [];
  try {
    quotes = await Queries.listFeed(owners);
    pinned = await Queries.listPinned(owners);
  } catch (e) {
    console.warn('[feed] 로드 실패', e?.message || e);
  }
  const commentCounts = await Queries.countCommentsForQuotes(quotes.map((q) => q.id));
  const views = quotes.map((q) => toView(q, meId, commentCounts));
  const stats = computeStats(quotes);
  const groups = groupQuotes(views);

  clear(mainInner);
  const grid = el('div', {
    class: 'feed-grid',
    style: { padding: '36px 36px 100px', display: 'grid', gridTemplateColumns: 'minmax(0, 660px) 340px', gap: 56, maxWidth: 1160, justifyContent: 'start' },
  });

  // 메인 컬럼
  const mainCol = el('div', {});
  const header = el('div', { style: { display: 'flex', alignItems: 'baseline', marginBottom: 28 } },
    el('h1', { style: { margin: 0, fontSize: 32, fontWeight: 700, letterSpacing: '-.028em', lineHeight: 1 } }, '어구록'),
    el('span', { class: 'mono', style: { fontSize: 14, color: 'var(--ink-3)', marginLeft: 12, fontWeight: 500 } }, String(stats.total)),
    el('div', { style: { flex: 1 } }),
    el('span', { style: { fontSize: 12.5, color: 'var(--ink-3)', display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer' } }, '최근순', iconEl('chevD', { sz: 11 })),
  );
  mainCol.appendChild(header);

  if (!groups.length) {
    mainCol.appendChild(el('div', { style: { padding: '60px 0', color: 'var(--ink-3)', fontSize: 15 } }, '아직 어구록이 없습니다. 새 어구록을 추가해 보세요.'));
  }
  for (const g of groups) {
    const b = bookOf(g.book_ref);
    if (!b) continue;
    const section = el('section', { style: { margin: '0 0 32px' } });
    section.appendChild(bookRow({ b, count: g.q.length, soyeon: g.who === 'y', onClick: () => ctx.navigate(`/book/${bookRefOf(b)}`) }));
    const indent = el('div', { class: 'q-indent', style: { marginTop: 6, marginLeft: 86 } });
    for (const q of g.q) {
      indent.appendChild(quoteRow({
        q,
        onClick: () => ctx.navigate(`/thread/${q.book_ref}/${q.id}`),
        onPin: () => ctx.navigate(`/thread/${q.book_ref}/${q.id}`),
        onEdit: () => ctx.navigate(`/edit/${q.id}`),
      }));
    }
    section.appendChild(indent);
    mainCol.appendChild(section);
  }

  // 사이드
  const aside = el('aside', { style: { display: 'flex', flexDirection: 'column', gap: 32, paddingTop: 58 } },
    streakCard(stats),
    railPins(pinned, ctx),
    railComparison(quotes),
    railRetro(quotes, ctx),
  );

  grid.appendChild(mainCol);
  grid.appendChild(aside);
  mainInner.appendChild(grid);
}

registerScreen('feed', render);

export default render;
