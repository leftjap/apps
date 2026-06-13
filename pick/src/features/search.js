// pick 검색 오버레이(1급) — design-ref/source/app/main.jsx SearchOverlay 포팅(바닐라).
// 결과 = 로컬 평가 작품 + 알라딘 책(신규 추가). 영화 라이브 검색은 Wave 2(TMDB).
import { el, clear } from '../ui/dom.js';
import { poster, hueFromString } from '../ui/poster.js';
import { Aladin } from '../db/aladin.js';
import { Tmdb } from '../db/tmdb.js';
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
  [['all', '전체'], ['movie', '영화'], ['drama', '드라마'], ['book', '책']].forEach(([k, label]) => {
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

  function rowEl({ id, mtype, title, sub, kind, posterUrl }) {
    const isFilm = mtype === 'movie';
    return el('button', { class: 'sresult', onClick: () => pick(id) },
      poster({ type: isFilm ? 'film' : 'book', title, hue: hueFromString(title), w: 36, rounded: 6, label: false, src: posterUrl || null }),
      el('div', { class: 'sresult__text' }, el('span', { class: 'sresult__title' }, title), el('span', { class: 'sresult__sub' }, sub || '')),
      el('span', { class: 'sresult__kind' }, kind || (isFilm ? '영화' : '책')));
  }

  // 드라마 = movie 타입 중 meta.subtype==='tv' (library matchCat 과 동일 규칙) — 영화 세그에선 제외.
  const isTv = (r) => r.media_type === 'movie' && r.meta?.subtype === 'tv';
  const matchType = (r) => {
    if (type === 'all') return true;
    if (type === 'movie') return r.media_type === 'movie' && !isTv(r);
    if (type === 'drama') return isTv(r);
    return r.media_type === 'book';
  };

  async function run() {
    const q = input.value.trim();
    const ql = q.toLowerCase();
    let loc = local.filter(matchType);
    if (ql) loc = loc.filter((r) => `${r.title} ${r.meta?.author || ''} ${r.meta?.director || ''} ${Array.isArray(r.meta?.cast) ? r.meta.cast.join(' ') : r.meta?.cast || ''}`.toLowerCase().includes(ql));
    else loc = loc.slice(0, 10);

    // 라이브 외부 검색(책=알라딘, 영화·드라마=TMDB). 로컬에 이미 평가한 external_id 는 제외(중복 방지).
    // 책=전체/책, 영화=전체/영화, 드라마=전체/드라마 탭에서 도는 대칭 규칙.
    let ali = [], mov = [], tv = [];
    if (q) {
      const ratedExt = new Set(local.filter((r) => r.external_id).map((r) => String(r.external_id)));
      const [aliR, movR, tvR] = await Promise.all([
        (type === 'all' || type === 'book') ? Aladin.searchBooks(q, { max: 8 }).catch(() => []) : [],
        (type === 'all' || type === 'movie') ? Tmdb.searchMovies(q, { max: 8 }).catch(() => []) : [],
        (type === 'all' || type === 'drama') ? Tmdb.searchTv(q, { max: 8 }).catch(() => []) : [],
      ]);
      ali = aliR.filter((b) => b.isbn && !ratedExt.has(b.isbn));
      mov = movR.filter((m) => !ratedExt.has(m.tmdbId));
      tv = tvR.filter((t) => !ratedExt.has(t.tmdbId));
    }
    window.__pickOpen = window.__pickOpen || {};
    ali.forEach((b) => { window.__pickOpen['isbn:' + b.isbn] = { media_type: 'book', title: b.title, year: b.year, external_id: b.isbn, meta: { author: b.author, publisher: b.publisher, poster_url: b.coverUrl, sub: b.sub, summary: b.description } }; });
    mov.forEach((m) => { window.__pickOpen['tmdb:movie:' + m.tmdbId] = { media_type: 'movie', title: m.title, year: m.year, external_id: m.tmdbId, meta: { poster_url: m.posterUrl, summary: m.overview } }; });
    tv.forEach((t) => { window.__pickOpen['tmdb:tv:' + t.tmdbId] = { media_type: 'movie', title: t.title, year: t.year, external_id: t.tmdbId, meta: { subtype: 'tv', poster_url: t.posterUrl, summary: t.overview } }; });

    const rows = [
      ...loc.map((r) => ({ id: r.id, mtype: r.media_type, title: r.title, sub: subOf(r), kind: r.media_type === 'movie' && r.meta?.subtype === 'tv' ? '드라마' : null, posterUrl: r.meta?.poster_url })),
      ...mov.map((m) => ({ id: 'tmdb:movie:' + m.tmdbId, mtype: 'movie', title: m.title, sub: m.year ? String(m.year) : '', kind: '영화', posterUrl: m.posterUrl })),
      ...tv.map((t) => ({ id: 'tmdb:tv:' + t.tmdbId, mtype: 'movie', title: t.title, sub: t.year ? String(t.year) : '', kind: '드라마', posterUrl: t.posterUrl })),
      ...ali.map((b) => ({ id: 'isbn:' + b.isbn, mtype: 'book', title: b.title, sub: [b.author, b.publisher].filter(Boolean).join(' · '), posterUrl: b.coverUrl })),
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
