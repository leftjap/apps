/**
 * 피드 탭 — v4 FeedTab 이식 (바닐라). 저장된 어구록을 다양한 방식으로 재발견·환기.
 * 섹션(순서 고정, 데이터 없으면 숨김): 오늘의 한 줄(Hero) · 최근 · AI의 발견(메아리) · ★오래된 핀 · 같은 단어 + 푸터.
 *  - AI의 발견·같은 단어는 Claude Code Routine 주간 생성 스냅샷(data/curation.js)을 읽음(작업지시서 §4).
 *  - 오늘의 한 줄·최근·오래된 핀은 어구록 집계.
 *  - 어구록 클릭 → 공용 QuoteModal(ui/quote-modal.js).
 */
import { registerScreen } from '../app.js';
import { Queries } from '../db/queries.js';
import { Profile } from '../services/profile.js';
import { bookOf } from '../data/books.js';
import { CURATION } from '../data/curation.js';
import { el, clear } from '../ui/dom.js';
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
const srcLine = (b) => `${b ? b.t : ''} · ${b ? b.a : ''}`;

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
  const qById = new Map(all.map((q) => [q.id, q]));
  const open = (q) => openQuoteModal(q, ctx, { commentCount: commentCounts[q.id] || 0, container: root });

  const byDateDesc = [...all].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  const now = new Date();

  feedEl.appendChild(el('header', { class: 'feed-head' },
    el('div', { class: 'when' }, `${fmtShort(now)} ${DOW[now.getDay()]} · WEEK ${weekNum(now)}`),
  ));

  if (!all.length) {
    feedEl.appendChild(el('div', { style: { padding: '60px 0', color: 'var(--ink-3)', fontSize: '15px' } }, '아직 어구록이 없습니다. 새 어구록을 추가해 보세요.'));
    return;
  }

  // ── 1. 오늘의 한 줄 (Hero) ──
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
        el('div', {}, el('div', { class: 'text' }, q.text), el('div', { class: 'src' }, srcLine(b))),
        el('div', { class: 'when' }, relTime(q.created_at)),
      ));
    });
    feedEl.appendChild(block(
      anchor(newCount > 0 ? '최근 7일' : '최근', el('span', { class: 'right' }, newCount > 0 ? `${newCount} 추가` : `${recent.length}권`)),
      list,
    ));
  }

  // ── 3. AI의 발견 (메아리) — 큐레이션 스냅샷 ──
  const echoes = (CURATION?.echoes || [])
    .map((e) => ({ ...e, qa: qById.get(e.a), qb: qById.get(e.b) }))
    .filter((e) => e.qa && e.qb);
  if (echoes.length) {
    const wrap = el('div', { class: 'echoes' });
    echoes.forEach((e, i) => {
      const ba = bookOf(e.qa.book_ref);
      const bb = bookOf(e.qb.book_ref);
      wrap.appendChild(el('div', { class: 'echo' },
        el('div', { class: 'head' },
          el('span', { class: 'word' }, e.keyword),
          el('span', { class: 'ai' }, `CLAUDE · ${String(i + 1).padStart(2, '0')}`),
        ),
        e.note ? el('div', { class: 'note' }, e.note) : null,
        el('div', { class: 'echo-pair' },
          el('div', { class: 'side', onClick: () => open(e.qa) },
            el('p', { class: 'txt' }, e.qa.text),
            el('div', { class: 'src' }, srcLine(ba)),
          ),
          el('div', { class: 'between' }, el('span', { class: 'glyph' }, '≈')),
          el('div', { class: 'side', onClick: () => open(e.qb) },
            el('p', { class: 'txt' }, e.qb.text),
            el('div', { class: 'src' }, srcLine(bb)),
          ),
        ),
      ));
    });
    feedEl.appendChild(block(
      anchor('AI의 발견', el('span', {}, '서로 다른 책에서 같은 말을 찾았습니다'), el('span', { class: 'right' }, `${echoes.length} 쌍`)),
      wrap,
    ));
  }

  // ── 4. ★ 오래된 핀 — 14일+ 핀 오래된 순 최대 3 ──
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
        el('div', {}, el('div', { class: 'txt' }, q.text), el('div', { class: 'src' }, srcLine(b))),
        el('div', { class: 'when' }, relTime(q.created_at)),
      ));
    });
    feedEl.appendChild(block(
      anchor(el('span', { style: { color: 'var(--pin)' } }, '★ 오래된 핀'), el('span', { class: 'right' }, `${oldPins.length}개`)),
      list,
    ));
  }

  // ── 5. 같은 단어 (키워드 클러스터) — 큐레이션 스냅샷 ──
  const clusters = (CURATION?.clusters || [])
    .map((c) => ({ ...c, qs: c.quotes.map((id) => qById.get(id)).filter(Boolean) }))
    .filter((c) => c.qs.length);
  if (clusters.length) {
    let active = 0;
    const words = el('div', { class: 'cluster-words' });
    const panel = el('div', { class: 'cluster-quotes' });
    const renderPanel = () => {
      clear(panel);
      for (const q of clusters[active].qs) {
        const b = bookOf(q.book_ref);
        panel.appendChild(el('div', { class: 'cluster-q', onClick: () => open(q) },
          el('p', { class: 'txt' }, q.text),
          el('div', { class: 'src' }, srcLine(b)),
        ));
      }
      [...words.children].forEach((w, i) => w.classList.toggle('active', i === active));
    };
    clusters.forEach((c, i) => {
      words.appendChild(el('button', { class: 'cluster-tab', onClick: () => { active = i; renderPanel(); } },
        el('span', { class: 'word' }, c.word),
        el('span', { class: 'stat' }, `${c.count ?? c.qs.length}개 · ${c.books ?? '-'}권`),
      ));
    });
    feedEl.appendChild(block(
      anchor('같은 단어', el('span', {}, '여러 책에서 등장하는 키워드'), el('span', { class: 'right' }, `${clusters.length} 키워드`)),
      el('div', { class: 'cluster-list' }, words, panel),
    ));
    renderPanel();
  }

  // 푸터 — 루틴 설명
  feedEl.appendChild(el('footer', { class: 'feed-footer' },
    el('div', {},
      '이 피드는 ', el('strong', { style: { color: 'var(--ink-2)' } }, 'Claude'),
      '가 매주 어구록을 다시 읽어 만듭니다. ',
      el('strong', { style: { color: 'var(--ink-2)' } }, 'AI의 발견'), ' · ',
      el('strong', { style: { color: 'var(--ink-2)' } }, '같은 단어'),
      '는 저장된 어구록을 분석해 환기할 만한 연결을 찾아냅니다.',
    ),
    CURATION?.generatedAt ? el('div', { class: 'routines-inline' },
      el('span', { class: 'ri-item' }, el('span', { class: 'dot' }), el('span', { class: 'name' }, '주간 큐레이션'), el('span', { class: 'when' }, `· ${CURATION.generatedAt} 생성`)),
    ) : null,
  ));
}

registerScreen('feed', render);
export default render;
