// taste 내 서재 — 전체 평점 목록(영화/책 필터) → 상세 연결. 계정 메뉴 진입. 디자인 외 유틸(토큰 재사용).
import { el, clear } from '../ui/dom.js';
import { poster, hueFromString } from '../ui/poster.js';
import { starRating } from '../ui/rating.js';
import { Queries } from '../db/queries.js';

const OPTS = [['all', '전체'], ['movie', '영화'], ['book', '책']];

export function mount({ userId } = {}) {
  const root = el('div', { class: 'home' });
  let filter = 'all', all = [];
  const note = el('p', { class: 'home__note', style: 'white-space:normal' });
  root.append(
    el('header', { class: 'home__intro', style: 'align-items:flex-start;text-align:left' },
      el('h1', { class: 'home__greet', style: 'font-size:clamp(26px,3vw,36px)' }, '내 서재'),
      note,
      segmented((f) => { filter = f; renderList(); })),
    el('section', { class: 'recent', style: 'border-top:none;padding-top:0' }));
  const listSec = root.querySelector('.recent');

  const subOf = (r) => (r.media_type === 'movie'
    ? [r.meta?.director, r.year].filter(Boolean).join(' · ')
    : [r.meta?.author, r.meta?.publisher].filter(Boolean).join(' · '));

  function renderList() {
    clear(listSec);
    const rows = all.filter((r) => filter === 'all' || r.media_type === filter);
    note.textContent = `${rows.length}편`;
    if (!rows.length) { listSec.appendChild(el('p', { style: 'color:var(--ink-3)' }, '아직 평가한 작품이 없어요. 검색하거나 가져오기로 평가를 시작해 보세요.')); return; }
    const list = el('div', { class: 'track__list' });
    rows.forEach((r) => {
      const isFilm = r.media_type === 'movie';
      list.appendChild(el('article', { class: 'rec', onClick: () => { location.hash = '#/w/' + encodeURIComponent(r.id); } },
        poster({ type: isFilm ? 'film' : 'book', title: r.title, year: r.year, hue: hueFromString(r.title), w: 56, rounded: 8, label: false, src: r.meta?.poster_url }),
        el('div', { class: 'rec__text' },
          el('h3', { class: 'rec__title' }, r.title),
          el('p', { class: 'detail__sub', style: 'margin:0' }, subOf(r)),
          starRating({ value: r.rating, editable: false, size: 18 }))));
    });
    listSec.appendChild(list);
  }

  renderList();
  (async () => { if (!userId) return; try { all = await Queries.listRatings(userId); renderList(); } catch (e) { /* noop */ } })();
  return root;
}

function segmented(onChange) {
  const seg = el('div', { class: 'seg', role: 'tablist' });
  const btns = {};
  OPTS.forEach(([k, label]) => {
    btns[k] = el('button', { class: 'seg__btn' + (k === 'all' ? ' is-on' : ''), role: 'tab',
      onClick: () => { Object.entries(btns).forEach(([kk, bb]) => { bb.className = 'seg__btn' + (kk === k ? ' is-on' : ''); }); onChange(k); } }, label);
    seg.appendChild(btns[k]);
  });
  return seg;
}
