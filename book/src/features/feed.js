/**
 * 피드 탭 — v4 FeedTab 이식 (바닐라). 저장된 어구록을 다양한 방식으로 재발견·환기.
 * 섹션(순서 고정, 데이터 없으면 숨김): 오늘의 한 줄(Hero) · 최근 · AI의 발견(ECHOES) · ★오래된 핀 · 같은 단어 + 푸터.
 *  - 현재 데이터는 과거 스냅샷이라 "최근 7일"·핀·tags·ECHOES 가 비어 일부 섹션 숨김.
 *    W4(tags→같은 단어)·W5(ECHOES/THEMES 스냅샷) 데이터가 생기면 해당 섹션이 자동 표시됨.
 *  - 어구록 클릭 → 공용 QuoteModal(ui/quote-modal.js).
 */
import { registerScreen } from '../app.js';
import { Queries } from '../db/queries.js';
import { Profile } from '../services/profile.js';
import { bookOf } from '../data/books.js';
import { el } from '../ui/dom.js';
import { iconEl } from '../ui/icons.js';
import { cover } from '../ui/cover.js';
import { topBar } from '../ui/components.js';
import { openQuoteModal, relTime } from '../ui/quote-modal.js';

function ownerIdsOf(user) {
  return [user?.id, Profile.getPartnerUserIdForEmail(user?.email)].filter(Boolean);
}
const coverAt = (b, width, opts = {}) => cover(b, { scale: width / (b?.w || 130), lift: false, ...opts });
const daysAgo = (iso) => Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
const DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
function fmtShort(d) {
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}
function weekNum(d) {
  const start = new Date(d.getFullYear(), 0, 1);
  return Math.ceil((((d - start) / 86400000) + start.getDay() + 1) / 7);
}
const anchor = (label, ...rest) => el('div', { class: 'block-anchor' }, el('span', { class: 'label' }, label), ...rest);
const block = (anchorEl, body) => el('section', { class: 'block' }, anchorEl, body);

async function render(host, params, ctx) {
  const user = ctx.user;
  const owners = ownerIdsOf(user);

  const root = el('div', { class: 'bookv4' });
  const feedEl = el('div', { class: 'feed' });
  root.appendChild(feedEl);
  host.appendChild(el('div', { class: 'bk' }, topBar({ tab: 'feed', ctx }), el('main', {}, root)));

  if (!owners.length) {
    feedEl.appendChild(el('div', { style: { padding: '60px 0', color: 'var(--ink-3)' } }, '로그인이 필요합니다.'));
    return;
  }

  let all = [];
  let commentCounts = {};
  try { all = await Queries.listAllQuotes(owners); } catch (e) { console.warn('[feed] 로드 실패', e?.message || e); }
  try { commentCounts = await Queries.countCommentsForQuotes(all.map((q) => q.id)); } catch (e) { /* noop */ }
  const open = (q) => openQuoteModal(q, ctx, { commentCount: commentCounts[q.id] || 0, container: root });

  const byDateDesc = [...all].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  const now = new Date();

  feedEl.appendChild(el('header', { class: 'feed-head' },
    el('h1', {}, '피드'),
    el('div', { class: 'when' }, `${fmtShort(now)} ${DOW[now.getDay()]} · WEEK ${weekNum(now)}`),
  ));

  if (!all.length) {
    feedEl.appendChild(el('div', { style: { padding: '60px 0', color: 'var(--ink-3)', fontSize: '15px' } }, '아직 어구록이 없습니다. 새 어구록을 추가해 보세요.'));
    return;
  }

  // ── 1. 오늘의 한 줄 (Hero) ── 핀+오래된 우선, 없으면 30일+ 오래된 것 중 랜덤
  const pinnedOld = all.filter((q) => q.pinned && daysAgo(q.created_at) > 7);
  const old30 = all.filter((q) => daysAgo(q.created_at) > 30);
  const pool = pinnedOld.length ? pinnedOld : (old30.length ? old30 : all);
  const heroQ = pool[Math.floor(Math.random() * pool.length)];
  const hb = bookOf(heroQ.book_ref);
  feedEl.appendChild(block(
    anchor('오늘의 한 줄', el('span', {}, `${all.length}개에서 · ${relTime(heroQ.created_at)} 저장`)),
    el('div', { class: 'hero', onClick: () => open(heroQ) },
      el('div', { class: 'cover-slot' }, hb ? coverAt(hb, 140, { lift: true }) : null),
      el('div', {},
        el('div', { class: 'text' }, `“${heroQ.text}”`),
        el('div', { class: 'src' },
          el('strong', {}, hb ? hb.t : ''),
          el('span', { class: 'div' }),
          el('span', { class: 'au' }, hb ? hb.a : ''),
          el('span', { class: 'when' }, fmtShort(new Date(heroQ.created_at))),
        ),
      ),
    ),
  ));

  // ── 2. 최근 (책당 1개 최대 5) ──
  const recent = [];
  const seen = new Set();
  for (const q of byDateDesc) {
    const ref = String(q.book_ref);
    if (!seen.has(ref)) { seen.add(ref); recent.push(q); if (recent.length >= 5) break; }
  }
  const newCount = all.filter((q) => daysAgo(q.created_at) <= 7).length;
  if (recent.length) {
    const list = el('div', { class: 'recent-list' });
    recent.forEach((q, i) => {
      const b = bookOf(q.book_ref);
      list.appendChild(el('div', { class: 'recent-row', onClick: () => open(q) },
        el('div', { class: 'idx' }, String(i + 1).padStart(2, '0')),
        el('div', {},
          el('div', { class: 'text' }, q.text),
          el('div', { class: 'src' }, `${b ? b.t : ''} · ${b ? b.a : ''}`),
        ),
        el('div', { class: 'when' }, relTime(q.created_at)),
      ));
    });
    feedEl.appendChild(block(
      anchor(newCount > 0 ? '최근 7일' : '최근', el('span', { class: 'right' }, newCount > 0 ? `${newCount} 추가` : `${recent.length}권`)),
      list,
    ));
  }

  // ── 3. AI의 발견 (ECHOES) — 주간 스냅샷(W5). 현재 데이터 없음 → 섹션 생략 ──
  // ── 4. 같은 단어 (tags 클러스터) — W4. 현재 tags 없음 → 섹션 생략 ──

  // ── 5. ★ 오래된 핀 — 14일+ 핀 오래된 순 최대 3 (현재 핀 0 → 자동 숨김) ──
  const oldPins = all
    .filter((q) => q.pinned && daysAgo(q.created_at) > 14)
    .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''))
    .slice(0, 3);
  if (oldPins.length) {
    const list = el('div', { class: 'pin-list' });
    oldPins.forEach((q) => {
      const b = bookOf(q.book_ref);
      list.appendChild(el('div', { class: 'pin-row', onClick: () => open(q) },
        el('div', { class: 'star' }, iconEl('star-fill', { sz: 14 })),
        el('div', {},
          el('div', { class: 'txt' }, q.text),
          el('div', { class: 'src' }, `${b ? b.t : ''} · ${b ? b.a : ''}`),
        ),
        el('div', { class: 'when' }, relTime(q.created_at)),
      ));
    });
    feedEl.appendChild(block(
      anchor(el('span', { style: { color: 'var(--pin)' } }, '★ 오래된 핀'), el('span', { class: 'right' }, `${oldPins.length}개`)),
      list,
    ));
  }

  // 푸터 — 루틴 설명
  feedEl.appendChild(el('footer', { class: 'feed-footer' },
    el('div', {},
      '이 피드는 저장된 어구록을 다양한 방식으로 다시 꺼내 보여줍니다. ',
      el('strong', { style: { color: 'var(--ink-2)' } }, 'AI의 발견'), ' · ',
      el('strong', { style: { color: 'var(--ink-2)' } }, '같은 단어'),
      ' 섹션은 주간 큐레이션이 쌓이면 활성화됩니다.',
    ),
  ));
}

registerScreen('feed', render);
export default render;
