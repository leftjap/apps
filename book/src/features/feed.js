/**
 * 피드 탭 — 홈 v4 '독서 타임라인' (시안 feed3.js 이식, SCREEN 01).
 * 섹션(순서 고정, 데이터 없으면 숨김): 최근 한 줄(hero=가장 최근 기록·랜덤 아님) ·
 *   지금 읽는 책(최근 활동 5권, 첫 권 진행중 펄스) · 최근 기록(시간순 타임라인 5) ·
 *   연결(주간 큐레이션 echoes 중 첫 1쌍).
 *  - 통계와 중복되던 수치·차트·안내 카피 없음 (혼자 쓰는 앱) — 시안 SCREEN 01 결정.
 *  - 연결은 Claude Code Routine 주간 스냅샷(data/curation.js)을 읽음 (작업지시서 §4).
 *  - 어구록 클릭 → 공용 QuoteModal(ui/quote-modal.js). 표지 클릭 → 책 상세.
 */
import { registerScreen } from '../app.js';
import { Queries } from '../db/queries.js';
import { bookOf } from '../data/books.js';
import { CURATION } from '../data/curation.js';
import { el } from '../ui/dom.js';
import { iconEl } from '../ui/icons.js';
import { cover } from '../ui/cover.js';
import { topBar } from '../ui/components.js';
import { openQuoteModal } from '../ui/quote-modal.js';
import { quotePreview } from '../ui/quote-md.js';

function ownerIdsOf(user) {
  return [user?.id].filter(Boolean);
}
const coverAt = (b, width, opts = {}) => cover(b, { scale: width / (b?.w || 130), lift: false, ...opts });
const KDOW = ['일', '월', '화', '수', '목', '금', '토'];
const kDate = (d) => `${d.getMonth() + 1}월 ${d.getDate()}일 ${KDOW[d.getDay()]}요일`;
const srcLine = (b) => `${b ? b.t : ''} · ${b ? b.a : ''}`;

async function render(host, params, ctx) {
  const owners = ownerIdsOf(ctx.user);

  const root = el('div', { class: 'bookv4' });
  const wrap = el('div', { class: 'h4-wrap' });
  root.appendChild(wrap);
  host.appendChild(el('div', { class: 'bk' }, topBar({ tab: 'feed', ctx }), el('main', {}, root)));

  if (!owners.length) {
    wrap.appendChild(el('div', { class: 'empty' }, '로그인이 필요합니다.'));
    return;
  }

  let all = [];
  let commentCounts = {};
  try { all = await Queries.listAllQuotes(owners); } catch (e) { console.warn('[feed] 로드 실패', e?.message || e); }
  try { commentCounts = await Queries.countCommentsForQuotes(all.map((q) => q.id)); } catch (e) { /* noop */ }
  const qById = new Map(all.map((q) => [q.id, q]));
  const open = (q) => openQuoteModal(q, ctx, { commentCount: commentCounts[q.id] || 0, container: root });

  if (!all.length) {
    wrap.appendChild(el('div', { class: 'empty' }, '아직 어구록이 없습니다. 새 어구록을 추가해 보세요.'));
    return;
  }

  const recent = [...all].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));

  // ── 1. 최근 한 줄 — 가장 최근 기록. 잔잔한 hero ──
  const hero = recent[0];
  const hb = bookOf(hero.book_ref);
  wrap.appendChild(el('header', { class: 'h4-hero', onClick: () => open(hero) },
    el('div', { class: 'date' }, kDate(new Date())),
    el('blockquote', {}, quotePreview(hero.text)),
    el('div', { class: 'src' },
      el('strong', {}, hb ? hb.t : ''),
      el('span', { class: 'au' }, hb ? hb.a : '')),
  ));

  // ── 2. 지금 읽는 책 — 최근 활동순 5권, 첫 권에 진행중 펄스 ──
  const byBook = new Map(); // ref → { n, last }
  for (const q of all) {
    const ref = String(q.book_ref);
    const g = byBook.get(ref) || { n: 0, last: '' };
    g.n++;
    const t = q.created_at || '';
    if (t > g.last) g.last = t;
    byBook.set(ref, g);
  }
  const strip = el('div', { class: 'h4-shelf' });
  [...byBook.entries()]
    .sort((a, b) => b[1].last.localeCompare(a[1].last))
    .slice(0, 5)
    .forEach(([ref, g], i) => {
      const b = bookOf(ref);
      if (!b) return;
      strip.appendChild(el('button', { class: 'h4-book', onClick: () => ctx.navigate(`/book/${ref}`) },
        el('div', { class: 'cv' }, coverAt(b, 64, { lift: true }), i === 0 ? el('span', { class: 'live' }) : null),
        el('div', { class: 'n' }, iconEl('quote', { sz: 11 }), String(g.n)),
      ));
    });
  if (strip.childElementCount) {
    wrap.appendChild(el('section', { class: 'h4-sec' },
      el('div', { class: 'h4-lab' }, '지금 읽는 책'), strip));
  }

  // ── 3. 최근 기록 — 책 넘나드는 시간순 타임라인 (hero 다음 5개) ──
  const tlQs = recent.slice(1, 6);
  if (tlQs.length) {
    const tl = el('div', { class: 'h4-timeline' });
    for (const q of tlQs) {
      const b = bookOf(q.book_ref);
      tl.appendChild(el('button', { class: 'h4-item', onClick: () => open(q) },
        el('div', { class: 'rail' }, el('span', { class: q.pinned ? 'dot pin' : 'dot' })),
        el('div', { class: 'body' },
          el('p', { class: 'q' }, quotePreview(q.text)),
          el('div', { class: 'src' },
            el('strong', {}, b ? b.t : ''),
            el('span', { class: 'dot' }),
            el('span', { class: 'au' }, b ? b.a : ''))),
      ));
    }
    wrap.appendChild(el('section', { class: 'h4-sec' },
      el('div', { class: 'h4-lab' }, '최근 기록'), tl));
  }

  // ── 4. 연결 — 서로 다른 책이 같은 말을 할 때. 큐레이션 스냅샷에서 첫 1쌍만 ──
  const echo = (CURATION?.echoes || [])
    .map((e) => ({ ...e, qa: qById.get(e.a), qb: qById.get(e.b) }))
    .find((e) => e.qa && e.qb);
  if (echo) {
    const side = (q) => el('div', { class: 'side', onClick: () => open(q) },
      el('p', {}, quotePreview(q.text)),
      el('div', { class: 'src' }, srcLine(bookOf(q.book_ref))));
    wrap.appendChild(el('section', { class: 'h4-sec' },
      el('div', { class: 'h4-lab' }, '연결', el('span', { class: 'by' }, 'CLAUDE')),
      el('div', { class: 'h4-echo' },
        el('div', { class: 'kw' }, echo.keyword),
        echo.note ? el('p', { class: 'note' }, echo.note) : null,
        el('div', { class: 'pair' },
          side(echo.qa),
          el('div', { class: 'tie' }, '≈'),
          side(echo.qb))),
    ));
  }
}

registerScreen('feed', render);
export default render;
