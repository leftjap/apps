// taste 내 서재 — 포스터 그리드 + 필터(전체/영화/책)·정렬(등록/최신/별점)·별점 등급 필터. 상세 연결.
import { el, clear } from '../ui/dom.js';
import { poster, hueFromString } from '../ui/poster.js';
import { Queries } from '../db/queries.js';

const FILTERS = [['all', '전체'], ['movie', '영화'], ['book', '책']];
// 등록순=평가한 날짜 최신(담은 순) · 최신순=작품 출시 신작순 · 별점순=내 별점 높은순.
const SORTS = [['registered', '등록순'], ['recent', '최신순'], ['rating', '별점순']];
const GRADES = [5, 4.5, 4, 3.5, 3, 2.5, 2, 1.5, 1, 0.5];
const CMP = {
  registered: (a, b) => String(b.rated_at || '').localeCompare(String(a.rated_at || '')),
  recent: (a, b) => (b.year || 0) - (a.year || 0) || String(b.rated_at || '').localeCompare(String(a.rated_at || '')),
  rating: (a, b) => (b.rating || 0) - (a.rating || 0) || String(b.rated_at || '').localeCompare(String(a.rated_at || '')),
};

function segmented(opts, cur, onChange, extra = '') {
  const seg = el('div', { class: 'seg' + (extra ? ' ' + extra : ''), role: 'tablist' });
  opts.forEach(([k, label]) => {
    seg.appendChild(el('button', {
      class: 'seg__btn' + (k === cur ? ' is-on' : ''), role: 'tab', 'aria-selected': k === cur ? 'true' : 'false',
      onClick: () => onChange(k),
    }, label));
  });
  return seg;
}

function rateEl(rating) {
  if (rating > 0 && rating <= 0.5) return el('span', { class: 'gcard__rate gcard__rate--pan' }, '비추 0.5');
  return el('span', { class: 'gcard__rate' }, rating > 0 ? `★ ${rating.toFixed(1)}` : '미평가');
}

export function mount({ userId } = {}) {
  const root = el('div', { class: 'home' });
  let filter = 'all', sort = 'registered', grade = null, all = [];

  const note = el('p', { class: 'home__note', style: 'white-space:normal' });
  const ctl = el('div', { class: 'libctl' });
  const grid = el('section', { class: 'grid' });
  root.append(
    el('header', { class: 'home__intro', style: 'align-items:flex-start;text-align:left' },
      el('h1', { class: 'home__greet', style: 'font-size:clamp(26px,3vw,36px)' }, '내 서재'),
      note),
    ctl, grid);

  const inFilter = () => all.filter((r) => filter === 'all' || r.media_type === filter);

  function render() {
    clear(ctl);
    ctl.append(segmented(FILTERS, filter, (f) => { filter = f; grade = null; render(); }));
    ctl.append(segmented(SORTS, sort, (s) => { sort = s; if (s !== 'rating') grade = null; render(); }, 'seg--sm'));
    if (sort === 'rating') {
      const base = inFilter();
      const counts = {};
      base.forEach((r) => { counts[r.rating] = (counts[r.rating] || 0) + 1; });
      const chips = el('div', { class: 'gradechips' });
      chips.append(el('button', { class: 'gchip' + (grade == null ? ' is-on' : ''), onClick: () => { grade = null; render(); } }, `전체 ${base.length}`));
      GRADES.forEach((g) => {
        const n = counts[g];
        if (!n) return; // 작품 없는 등급 칩은 숨김
        chips.append(el('button', {
          class: 'gchip' + (g === 0.5 ? ' gchip--pan' : '') + (grade === g ? ' is-on' : ''),
          onClick: () => { grade = grade === g ? null : g; render(); },
        }, g === 0.5 ? `비추 ${n}` : `★${g.toFixed(1)} ${n}`));
      });
      ctl.append(chips);
    }

    clear(grid);
    let rows = inFilter();
    if (sort === 'rating' && grade != null) rows = rows.filter((r) => r.rating === grade);
    rows = rows.slice().sort(CMP[sort]);
    note.textContent = `${rows.length}편`;
    if (!rows.length) { grid.append(el('p', { style: 'color:var(--ink-3)' }, '아직 평가한 작품이 없어요. 검색하거나 가져오기로 평가를 시작해 보세요.')); return; }
    rows.forEach((r) => {
      const isFilm = r.media_type === 'movie';
      grid.append(el('button', { class: 'gcard', onClick: () => { location.hash = '#/w/' + encodeURIComponent(r.id); } },
        poster({ type: isFilm ? 'film' : 'book', title: r.title, year: r.year, hue: hueFromString(r.title), fill: true, rounded: 10, label: false, src: r.meta?.poster_url }),
        el('div', { class: 'gcard__titlerow' },
          el('span', { class: 'gcard__title', title: r.title }, r.title),
          el('span', { class: 'gcard__type' }, isFilm ? '영화' : '책')),
        rateEl(r.rating)));
    });
  }

  render();
  (async () => { if (!userId) return; try { all = await Queries.listRatings(userId); render(); } catch (e) { /* noop */ } })();
  return root;
}
