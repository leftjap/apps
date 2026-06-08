// taste 검색 오버레이(1급) — design-ref/source/app/main.jsx SearchOverlay 포팅(바닐라).
// 결과 = 로컬 평가 작품 + 알라딘 책(신규 추가). 영화 라이브 검색은 Wave 2(TMDB).
import { el, clear } from '../ui/dom.js';
import { poster, hueFromString } from '../ui/poster.js';
import { Aladin } from '../db/aladin.js';
import { Queries } from '../db/queries.js';
import { trailReset } from '../app.js';

let _open = false;

export function openSearch({ userId } = {}) {
  if (_open) return;
  _open = true;
  let type = 'all';
  let local = [];
  let timer = null;

  const input = el('input', { class: 'search__input', placeholder: '제목 · 감독 · 저자 · 출연으로 검색해 평가하기',
    onKeyDown: (e) => { if (e.key === 'Escape') close(); } });
  const countEl = el('span', { class: 'search__count' }, '');
  const results = el('div', { class: 'search__results' });

  const seg = el('div', { class: 'seg seg--sm' });
  const segBtns = {};
  [['all', '전체'], ['movie', '영화'], ['book', '책']].forEach(([k, label]) => {
    segBtns[k] = el('button', { class: 'seg__btn' + (k === 'all' ? ' is-on' : ''),
      onClick: () => { type = k; Object.entries(segBtns).forEach(([kk, bb]) => { bb.className = 'seg__btn' + (kk === k ? ' is-on' : ''); }); run(); } }, label);
    seg.appendChild(segBtns[k]);
  });

  const modal = el('div', { class: 'search', onMousedown: (e) => e.stopPropagation() },
    el('div', { class: 'search__bar' }, el('span', { class: 'search__icon', 'aria-hidden': 'true' }, '⌕'), input),
    el('div', { class: 'search__filter' }, seg, countEl),
    results);
  const scrim = el('div', { class: 'search-scrim', onMousedown: () => close() }, modal);

  const onKey = (e) => { if (e.key === 'Escape') close(); };
  function close() {
    if (!_open) return;
    _open = false;
    scrim.remove();
    document.removeEventListener('keydown', onKey);
  }

  const pick = (id) => { close(); trailReset(id); location.hash = '#/w/' + encodeURIComponent(id); };
  const subOf = (r) => (r.media_type === 'movie'
    ? [r.meta?.director, r.year].filter(Boolean).join(' · ')
    : [r.meta?.author, r.meta?.publisher].filter(Boolean).join(' · '));

  function rowEl({ id, mtype, title, sub }) {
    const isFilm = mtype === 'movie';
    return el('button', { class: 'sresult', onClick: () => pick(id) },
      poster({ type: isFilm ? 'film' : 'book', title, hue: hueFromString(title), w: 36, rounded: 6, label: false }),
      el('div', { class: 'sresult__text' }, el('span', { class: 'sresult__title' }, title), el('span', { class: 'sresult__sub' }, sub || '')),
      el('span', { class: 'sresult__kind' }, isFilm ? '영화' : '책'));
  }

  async function run() {
    const q = input.value.trim();
    const ql = q.toLowerCase();
    let loc = local.filter((r) => type === 'all' || r.media_type === type);
    if (ql) loc = loc.filter((r) => `${r.title} ${r.meta?.author || ''} ${r.meta?.director || ''}`.toLowerCase().includes(ql));
    else loc = loc.slice(0, 10);

    let ali = [];
    if (q && (type === 'all' || type === 'book')) {
      try {
        const ratedIsbn = new Set(local.filter((r) => r.external_id).map((r) => r.external_id));
        ali = (await Aladin.searchBooks(q, { max: 8 })).filter((b) => b.isbn && !ratedIsbn.has(b.isbn));
      } catch (e) { /* 알라딘 실패 무시 */ }
    }
    window.__tasteOpen = window.__tasteOpen || {};
    ali.forEach((b) => { window.__tasteOpen['isbn:' + b.isbn] = { media_type: 'book', title: b.title, year: b.year, external_id: b.isbn, meta: { author: b.author, publisher: b.publisher, poster_url: b.coverUrl, sub: b.sub } }; });

    const rows = [
      ...loc.map((r) => ({ id: r.id, mtype: r.media_type, title: r.title, sub: subOf(r) })),
      ...ali.map((b) => ({ id: 'isbn:' + b.isbn, mtype: 'book', title: b.title, sub: [b.author, b.publisher].filter(Boolean).join(' · ') })),
    ];
    clear(results);
    countEl.textContent = `${rows.length}건`;
    if (!rows.length) { results.appendChild(el('div', { class: 'search__empty' }, q ? '검색 결과가 없습니다.' : '평가할 작품을 검색하세요.')); return; }
    rows.forEach((x) => results.appendChild(rowEl(x)));
  }

  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 300); });
  document.body.appendChild(scrim);
  document.addEventListener('keydown', onKey);
  input.focus();
  (async () => { if (userId) { try { local = await Queries.listRatings(userId); } catch (e) { /* noop */ } } run(); })();
}
