// taste 내 서재 — 포스터 그리드 + 정렬(최신/등록/별점)·별점 등급 필터.
// 카테고리(영화/드라마/책)는 상단 네비가 라우트(cat)로 전달. cat 없으면 전체.
import { el, clear } from '../ui/dom.js';
import { poster, hueFromString } from '../ui/poster.js';
import { Queries } from '../db/queries.js';

// 최신순=작품 출시 신작순(기본) · 등록순=평가한 날짜 최신(담은 순) · 별점순=내 별점 높은순.
const SORTS = [['recent', '최신순'], ['registered', '등록순'], ['rating', '별점순']];
const GRADES = [5, 4.5, 4, 3.5, 3, 2.5, 2, 1.5, 1, 0.5];
const CAT_TITLE = { movie: '영화', drama: '드라마', book: '책' };
const CMP = {
  registered: (a, b) => String(b.rated_at || '').localeCompare(String(a.rated_at || '')),
  recent: (a, b) => (b.year || 0) - (a.year || 0) || String(b.rated_at || '').localeCompare(String(a.rated_at || '')),
  rating: (a, b) => (b.rating || 0) - (a.rating || 0) || String(b.rated_at || '').localeCompare(String(a.rated_at || '')),
};

// 드라마/시리즈 = movie 타입 중 meta.subtype==='tv' (import 시 보존). 순수 영화는 그 외 movie.
const isTv = (r) => r.media_type === 'movie' && r.meta?.subtype === 'tv';
function matchCat(r, cat) {
  if (cat === 'movie') return r.media_type === 'movie' && !isTv(r);
  if (cat === 'drama') return isTv(r);
  if (cat === 'book') return r.media_type === 'book';
  return true; // 전체
}
const catLabel = (r) => (r.media_type === 'book' ? '책' : isTv(r) ? '드라마' : '영화');

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

export function mount({ userId, cat = null } = {}) {
  const root = el('div', { class: 'home lib' });
  let sort = 'recent', grade = null, all = [];

  const note = el('p', { class: 'home__note', style: 'white-space:normal' });
  const sortWrap = el('div', { class: 'lib__sort' });          // 정렬 탭 — 제목 우상단
  const chips = el('div', { class: 'gradechips' });            // 별점 등급 칩 — 별점순에서만 (그 외 :empty 숨김)
  const grid = el('section', { class: 'grid' });
  root.append(
    el('header', { class: 'lib__head' },
      el('div', { class: 'lib__titles' },
        el('h1', { class: 'home__greet', style: 'font-size:clamp(26px,3vw,36px)' }, CAT_TITLE[cat] || '내 서재'),
        note),
      sortWrap),
    chips, grid);

  const inCat = () => all.filter((r) => matchCat(r, cat));

  function render() {
    clear(sortWrap);
    sortWrap.append(segmented(SORTS, sort, (s) => { sort = s; if (s !== 'rating') grade = null; render(); }, 'seg--sm'));

    clear(chips);
    if (sort === 'rating') {
      const base = inCat();
      const counts = {};
      base.forEach((r) => { counts[r.rating] = (counts[r.rating] || 0) + 1; });
      chips.append(el('button', { class: 'gchip' + (grade == null ? ' is-on' : ''), onClick: () => { grade = null; render(); } }, `전체 ${base.length}`));
      GRADES.forEach((g) => {
        const n = counts[g];
        if (!n) return; // 작품 없는 등급 칩은 숨김
        chips.append(el('button', {
          class: 'gchip' + (g === 0.5 ? ' gchip--pan' : '') + (grade === g ? ' is-on' : ''),
          onClick: () => { grade = grade === g ? null : g; render(); },
        }, g === 0.5 ? `비추 ${n}` : `★${g.toFixed(1)} ${n}`));
      });
    }

    clear(grid);
    let rows = inCat();
    if (sort === 'rating' && grade != null) rows = rows.filter((r) => r.rating === grade);
    rows = rows.slice().sort(CMP[sort]);
    note.textContent = `${rows.length}편`;
    if (!rows.length) { grid.append(el('p', { style: 'color:var(--ink-3)' }, '아직 평가한 작품이 없어요. 검색하거나 가져오기로 평가를 시작해 보세요.')); return; }
    rows.forEach((r) => {
      grid.append(el('button', { class: 'gcard', onClick: () => { location.hash = '#/w/' + encodeURIComponent(r.id); } },
        poster({ type: r.media_type === 'book' ? 'book' : 'film', title: r.title, year: r.year, hue: hueFromString(r.title), fill: true, rounded: 10, label: false, src: r.meta?.poster_url }),
        el('div', { class: 'gcard__titlerow' },
          el('span', { class: 'gcard__title', title: r.title }, r.title),
          el('span', { class: 'gcard__type' }, catLabel(r))),
        rateEl(r.rating)));
    });
  }

  render();
  (async () => { if (!userId) return; try { all = await Queries.listRatings(userId); render(); } catch (e) { /* noop */ } })();
  return root;
}
