// taste 홈(메인 추천 피드) — design-ref/source/app/home.jsx 포팅(바닐라).
// Wave 1: 인트로 + 세그먼트 + 추천 빈상태(엔진 Wave 2) + 최근 평가(Dexie).
import { el, clear } from '../ui/dom.js';
import { poster, hueFromString, dot } from '../ui/poster.js';
import { Queries } from '../db/queries.js';
import { openSearch } from './search.js';

const OPTS = [['all', '전체'], ['movie', '영화'], ['book', '책']];

export function mount({ userId } = {}) {
  const root = el('div', { class: 'home' });
  let filter = 'all';
  let all = [];

  const note = el('p', { class: 'home__note' });
  const intro = el('header', { class: 'home__intro' },
    el('h1', { class: 'home__greet' }, '다음에 무엇을 볼까요'),
    note,
    segmented((f) => { filter = f; renderBody(); }));
  const recoSec = el('section', {});
  const recentSec = el('section', { class: 'recent' });
  root.append(intro, recoSec, recentSec);

  function renderNote() {
    clear(note);
    if (all.length === 0) { note.textContent = '아직 평가한 작품이 없어요. 검색해서 첫 평가를 시작해 보세요.'; return; }
    note.append(document.createTextNode('지금까지 '), el('b', {}, `${all.length}편`), document.createTextNode(' 평가했어요.'));
  }

  function renderReco() {
    clear(recoSec);
    const block = el('div', { style: 'padding:calc(var(--u)*1.6) 20px;border:1px dashed var(--line);border-radius:var(--r-lg);display:flex;flex-direction:column;gap:12px;align-items:flex-start' });
    block.append(
      el('div', { class: 'feat__eyebrow' }, dot(), el('span', {}, '오늘의 추천')),
      el('p', { class: 'feat__reason', style: 'margin:0;color:var(--ink-2)' },
        all.length ? '평가를 반영한 추천을 준비하고 있어요. 곧 이 자리에 다음에 볼·읽을 작품이 이유와 함께 도착합니다.'
          : '작품을 평가하면, 다음에 볼·읽을 작품을 이유와 함께 골라드려요.'));
    if (all.length === 0) block.append(el('button', { class: 'btn btn--sm', onClick: () => openSearch({ userId }) }, '검색해 첫 평가 시작'));
    recoSec.appendChild(block);
  }

  function renderRecent() {
    clear(recentSec);
    const rows = all.filter((r) => filter === 'all' || r.media_type === filter);
    if (!rows.length) return;
    recentSec.appendChild(el('h2', { class: 'recent__h' }, '최근 평가'));
    const row = el('div', { class: 'recent__row' });
    rows.slice(0, 12).forEach((r) => {
      const isFilm = r.media_type === 'movie';
      const stars = (r.rating > 0 && r.rating <= 0.5)
        ? el('span', { class: 'recent__pan' }, '비추 0.5')
        : el('span', { class: 'recent__val' }, r.rating > 0 ? `★ ${r.rating.toFixed(1)}` : '미평가');
      row.appendChild(el('button', { class: 'recent__item', onClick: () => { location.hash = '#/w/' + encodeURIComponent(r.id); } },
        poster({ type: isFilm ? 'film' : 'book', title: r.title, year: r.year, hue: hueFromString(r.title), w: 60, rounded: 8, label: false }),
        el('span', { class: 'recent__title' }, r.title),
        el('span', { class: 'recent__stars' }, stars)));
    });
    recentSec.appendChild(row);
  }

  function renderBody() { renderReco(); renderRecent(); }

  renderNote(); renderBody();
  (async () => {
    if (!userId) return;
    try { all = await Queries.listRatings(userId); renderNote(); renderBody(); } catch (e) { /* noop */ }
  })();
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
