// taste 작품 상세 허브 ★ — design-ref/source/app/detail.jsx 포팅(바닐라).
// Wave 1: rail(포스터+정보+ratebox 별점) + 줄거리 + 갈래 빈상태. 갈래/분석연출은 Wave 2.
import { el, clear } from '../ui/dom.js';
import { poster, hueFromString, chip, dot } from '../ui/poster.js';
import { starRating } from '../ui/rating.js';
import { Queries } from '../db/queries.js';

// 검색서 막 연 신규 작품(평가 전) / Dexie 평가 row → 공통 정규화.
function pickMeta(src) {
  const meta = src.meta || {};
  return {
    media_type: src.media_type || (src.type === 'film' ? 'movie' : src.type) || 'movie',
    title: src.title || '',
    year: src.year ?? meta.year ?? null,
    external_id: src.external_id ?? src.isbn ?? null,
    hue: src.hue ?? hueFromString(src.title || ''),
    runtime: meta.runtime ?? src.runtime ?? null,
    pages: meta.pages ?? src.pages ?? null,
    summary: meta.summary ?? src.summary ?? '',
    tags: meta.tags ?? src.tags ?? [],
    director: meta.director ?? null,
    cast: meta.cast ?? null,
    writer: meta.writer ?? null,
    author: meta.author ?? null,
    translator: meta.translator ?? null,
    publisher: meta.publisher ?? null,
    poster_url: meta.poster_url ?? null,
    sub: src.sub ?? null,
  };
}

async function resolveWork(id, userId) {
  if (typeof window !== 'undefined' && window.__tasteOpen && window.__tasteOpen[id]) return pickMeta(window.__tasteOpen[id]);
  const db = globalThis.tasteDB;
  if (db && id) {
    try { const row = await db.ratings.get(id); if (row && !row.deleted_at) return pickMeta(row); } catch (e) { /* noop */ }
  }
  return null;
}

export function mount({ userId, id } = {}) {
  const root = el('div', { class: 'detail' });
  resolveWork(id, userId).then((w) => {
    clear(root);
    root.appendChild(w ? detailBody(w, userId) : notFound());
  });
  return root;
}

function notFound() {
  return el('div', { class: 'detail__main' },
    el('p', { class: 'detail__sub' }, '작품을 찾을 수 없습니다.'),
    el('a', { class: 'trail__link', href: '#/' }, '홈으로'));
}

function detailBody(w, userId) {
  const isFilm = w.media_type === 'movie';
  return el('div', { class: 'detail__body' }, rail(w, userId, isFilm), main(w, isFilm));
}

function inforow(k, v) {
  return el('div', { class: 'inforow' }, el('dt', { class: 'inforow__k' }, k), el('dd', { class: 'inforow__v' }, v));
}

function rail(w, userId, isFilm) {
  const aside = el('aside', { class: 'rail' });
  aside.appendChild(poster({ type: isFilm ? 'film' : 'book', title: w.title, year: w.year, hue: w.hue, w: 200, rounded: 12, label: false }));
  const info = el('dl', { class: 'info' });
  const rows = isFilm
    ? [['감독', w.director], ['출연', Array.isArray(w.cast) ? w.cast.join(', ') : w.cast], ['극본', w.writer]]
    : [['저자', w.author], ['옮김', w.translator], ['출판', w.publisher]];
  for (const [k, v] of rows) if (v) info.appendChild(inforow(k, v));
  if (info.childNodes.length) aside.appendChild(info);
  aside.appendChild(ratebox(w, userId));
  return aside;
}

function metaForSave(w) {
  const m = {};
  for (const k of ['author', 'publisher', 'translator', 'director', 'writer', 'poster_url', 'summary', 'runtime', 'pages']) if (w[k]) m[k] = w[k];
  if (Array.isArray(w.cast) && w.cast.length) m.cast = w.cast;
  if (Array.isArray(w.tags) && w.tags.length) m.tags = w.tags;
  return m;
}

function ratebox(w, userId) {
  const box = el('div', { class: 'ratebox' });
  let cur = 0, rowId = null;
  const draw = () => {
    clear(box);
    box.appendChild(el('div', { class: 'ratebox__label' }, '내 평가'));
    box.appendChild(starRating({
      value: cur, editable: true, size: 28,
      onChange: (v) => persist(v === cur ? 0 : v), // 같은 값 재클릭 = 해제 (design)
    }));
    if (cur > 0) box.appendChild(el('button', { class: 'ratebox__clear', onClick: () => persist(0) }, '평가 지우기'));
  };
  const persist = async (v) => {
    if (!userId) return;
    if (v === 0) {
      if (rowId) { await Queries.softDeleteRating(rowId); rowId = null; }
      cur = 0;
    } else {
      const ex = await Queries.getRating(userId, w.media_type, w.title, w.year);
      if (ex) { await Queries.updateRating(ex.id, { rating: v, rated_at: new Date().toISOString() }); rowId = ex.id; }
      else { const c = await Queries.createRating({ owner_id: userId, media_type: w.media_type, title: w.title, year: w.year, external_id: w.external_id, rating: v, source: 'app', rated_at: new Date().toISOString(), meta: metaForSave(w) }); rowId = c.id; }
      cur = v;
    }
    draw();
  };
  (async () => {
    if (!userId) return;
    const ex = await Queries.getRating(userId, w.media_type, w.title, w.year);
    if (ex) { cur = ex.rating; rowId = ex.id; draw(); }
  })();
  draw();
  return box;
}

function buildSub(w, isFilm) {
  return (isFilm ? [w.director, w.year] : [w.author, w.publisher]).filter(Boolean).join(' · ');
}

function main(w, isFilm) {
  const m = el('div', { class: 'detail__main' });
  const head = el('header', { class: 'detail__head' });
  const kind = el('div', { class: 'detail__kind' }, dot(), el('span', {}, isFilm ? '영화' : '책'));
  const measure = isFilm ? (w.runtime ? `${w.runtime}분` : null) : (w.pages ? `${w.pages}쪽` : null);
  if (measure) kind.appendChild(el('span', { class: 'detail__measure' }, measure));
  head.appendChild(kind);
  head.appendChild(el('h1', { class: 'detail__title' }, w.title));
  const sub = w.sub || buildSub(w, isFilm);
  if (sub) head.appendChild(el('p', { class: 'detail__sub' }, sub));
  if (Array.isArray(w.tags) && w.tags.length) {
    const tags = el('div', { class: 'detail__tags' });
    w.tags.forEach((t) => tags.appendChild(chip(t)));
    head.appendChild(tags);
  }
  m.appendChild(head);

  if (w.summary) {
    m.appendChild(el('section', { class: 'reading' },
      el('h2', { class: 'reading__h' }, '줄거리'),
      el('p', { class: 'reading__body' }, w.summary)));
  }

  m.appendChild(el('section', { class: 'branches' },
    el('div', { class: 'branches__head' },
      el('h2', { class: 'branches__h' }, '이 작품에서 이어지는 갈래')),
    el('p', { class: 'branch__reason', style: 'color:var(--ink-4);padding:16px 0;margin:0' },
      '평가가 쌓이면 이 작품에서 이어지는 갈래를 이유와 함께 골라드려요.')));
  return m;
}
