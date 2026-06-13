// pick 작품 상세 허브 ★ — design-ref/source/app/detail.jsx 포팅(바닐라).
// Wave 1: rail(포스터+정보+ratebox 별점) + 줄거리 + 갈래 빈상태. 갈래/분석연출은 Wave 2.
import { el, clear } from '../ui/dom.js';
import { poster, hueFromString, chip, dot } from '../ui/poster.js';
import { starRating } from '../ui/rating.js';
import { Queries } from '../db/queries.js';
import { Tmdb } from '../db/tmdb.js';
import { excludeRated } from './branches-filter.js';
import { supabase } from '../services/supabase.js';
import { Sync } from '../db/sync.js';
import { trailAppend, trailGo, trailSetTitle, onViewTeardown } from '../app.js';

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
    country: meta.country ?? src.country ?? null,
    author: meta.author ?? null,
    translator: meta.translator ?? null,
    publisher: meta.publisher ?? null,
    poster_url: meta.poster_url ?? null,
    subtype: meta.subtype ?? src.subtype ?? null,   // 'tv' = 드라마 (library catLabel 과 동일 규칙)
    sub: src.sub ?? meta.sub ?? null,               // 알라딘 부제는 search 가 meta.sub 에 저장
  };
}

async function resolveWork(id, userId) {
  if (typeof window !== 'undefined' && window.__pickOpen && window.__pickOpen[id]) return pickMeta(window.__pickOpen[id]);
  const db = globalThis.pickDB;
  if (db && id) {
    try { const row = await db.ratings.get(id); if (row && !row.deleted_at) return pickMeta(row); } catch (e) { /* noop */ }
  }
  return null;
}

// 검색서 막 연 TMDB 작품(평가 전)은 cast/감독/제작국이 없음 — 상세 엔드포인트에서만 옴. 1회 보강.
async function enrichTmdb(id, w) {
  if (!w || w.cast || !w.external_id) return; // 이미 메타 있음(평가된 작품) → 보강 불필요
  try {
    let ext = null;
    if (id.startsWith('tmdb:movie:')) ext = await Tmdb.detailMovie(w.external_id);
    else if (id.startsWith('tmdb:tv:')) ext = await Tmdb.detailTv(w.external_id);
    if (!ext) return;
    if (ext.summary) w.summary = ext.summary;
    if (ext.runtime) w.runtime = ext.runtime;
    if (ext.director) w.director = ext.director;
    if (ext.cast && ext.cast.length) w.cast = ext.cast;
    if (ext.country) w.country = ext.country;
    if (ext.genres && ext.genres.length) w.tags = ext.genres;
  } catch (e) { /* 보강 실패 — 기본 메타로 렌더 */ }
}

export function mount({ userId, id, trail = [] } = {}) {
  const root = el('div', { class: 'detail' });
  resolveWork(id, userId).then(async (w) => {
    if (!root.isConnected) return;   // 해석 중 라우트 이탈 — 구독·렌더 생략 (떠난 뷰가 teardown 등록하는 것 방지)
    await enrichTmdb(id, w);
    if (!root.isConnected) return;
    clear(root);
    if (!w) { root.appendChild(notFound()); return; }
    trailSetTitle(id, w.title);   // 직접 URL 진입 시 제목 backfill
    if (trail.length > 1) root.appendChild(trailNav(trail));
    root.appendChild(detailBody(w, userId));
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
  // 갈래 섹션을 먼저 만들어 refresh 콜백을 ratebox 에 직접 주입 — 모듈 전역(_branchRerender) 경유 시
  // 다른 상세로 빠르게 이동한 뒤 평가하면 엉뚱한 화면의 갈래가 갱신되는 레이스가 있었음.
  const branches = branchesSection(w, userId);
  return el('div', { class: 'detail__body' }, rail(w, userId, isFilm, branches.refresh), main(w, isFilm, branches.el));
}

function inforow(k, v) {
  return el('div', { class: 'inforow' }, el('dt', { class: 'inforow__k' }, k), el('dd', { class: 'inforow__v' }, v));
}

function rail(w, userId, isFilm, onRated) {
  const aside = el('aside', { class: 'rail' });
  aside.appendChild(poster({ type: isFilm ? 'film' : 'book', title: w.title, year: w.year, hue: w.hue, w: 200, rounded: 12, label: false, src: w.poster_url }));
  const info = el('dl', { class: 'info' });
  const rows = isFilm
    ? [[w.subtype === 'tv' ? '연출' : '감독', w.director], ['출연', Array.isArray(w.cast) ? w.cast.join(', ') : w.cast], ['제작', w.country], ['극본', w.writer]]
    : [['저자', w.author], ['옮김', w.translator], ['출판', w.publisher]];
  for (const [k, v] of rows) if (v) info.appendChild(inforow(k, v));
  if (info.childNodes.length) aside.appendChild(info);
  aside.appendChild(ratebox(w, userId, onRated));
  return aside;
}

function metaForSave(w) {
  const m = {};
  for (const k of ['author', 'publisher', 'translator', 'director', 'writer', 'country', 'poster_url', 'summary', 'runtime', 'pages']) if (w[k]) m[k] = w[k];
  if (Array.isArray(w.cast) && w.cast.length) m.cast = w.cast;
  if (Array.isArray(w.tags) && w.tags.length) m.tags = w.tags;
  return m;
}

function ratebox(w, userId, onRated) {
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
      // getRatingAny: soft-deleted 행 부활 재사용 — 신규 create 는 서버 unique 키와 23505 충돌 (sync.js reconcileDup 주석).
      const ex = await Queries.getRatingAny(userId, w.media_type, w.title, w.year);
      if (ex) { await Queries.updateRating(ex.id, { rating: v, rated_at: new Date().toISOString(), deleted_at: null }); rowId = ex.id; }
      else { const c = await Queries.createRating({ owner_id: userId, media_type: w.media_type, title: w.title, year: w.year, external_id: w.external_id, rating: v, source: 'app', rated_at: new Date().toISOString(), meta: metaForSave(w) }); rowId = c.id; }
      cur = v;
    }
    draw();
    // 평가 ★3.0+ → 엔진(데몬 onRating)이 이 작품 갈래를 생성. 앱은 "분석 중" 연출만 띄움(생성은 앱이 안 함 — spec D3).
    if (v >= 3.0) { _pendingBranch.add(srcKey(w)); if (onRated) onRated(); }
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

// ── 갈래(branch) — 이 작품에서 이어지는 추천 (kind=branch, source_work=이 작품 키) ──
function srcKey(w) { return `${w.title}|${w.year ?? ''}`; }

async function readBranches(userId, key) {
  const db = globalThis.pickDB;
  if (!db || !userId) return [];
  try {
    const all = await db.recommendations.where('source_work').equals(key).toArray();
    const branches = all.filter((r) => r.owner_id === userId && r.kind === 'branch');
    // 이미 평가한 작품은 갈래에서 제외 (엔진 LLM 제외 누락·평가 후 시점 대비 결정적 안전망).
    const ratings = await db.ratings.toArray();
    return excludeRated(branches, ratings);
  } catch (e) { return []; }
}

// 갈래 클릭 = 그 작품 상세로 가지치며 이동(spec §3.2). 미평가작이라 __pickOpen 으로 메타 전달.
function openBranch(r) {
  window.__pickOpen = window.__pickOpen || {};
  window.__pickOpen[r.id] = { media_type: r.media_type, title: r.title, year: r.year, external_id: r.external_id, meta: { poster_url: r.poster_url } };
  trailAppend(r.id, r.title);   // 갈래 클릭 — 경로에 가지 추가
  location.hash = '#/w/' + encodeURIComponent(r.id);
}

// 정본: design-ref/source/app/detail.jsx:52-70 — 갈래를 타고 온 경로(가지 → A → B). path.length>1 일 때만.
function trailNav(trail) {
  const nav = el('nav', { class: 'trail' });
  trail.forEach((t, i) => {
    const seg = el('span', { class: 'trail__seg' });
    if (i > 0) seg.appendChild(el('span', { class: 'trail__sep' }, '가지 →'));
    if (i === trail.length - 1) seg.appendChild(el('span', { class: 'trail__cur' }, t.title || ''));
    else seg.appendChild(el('a', { class: 'trail__link', onClick: () => trailGo(i) }, t.title || ''));
    nav.appendChild(seg);
  });
  return nav;
}

// 정본: design-ref/source/app/detail.jsx:12-26 — 인덱스 카탈로그(01·02·03 + branch__head/kind).
function branchCard(r, index) {
  const isFilm = r.media_type === 'movie';
  return el('a', { class: 'branch', onClick: () => openBranch(r) },
    el('span', { class: 'branch__index' }, String(index).padStart(2, '0')),
    poster({ type: isFilm ? 'film' : 'book', title: r.title, year: r.year, hue: hueFromString(r.title), w: 48, rounded: 7, label: false, src: r.poster_url }),
    el('div', { class: 'branch__body' },
      el('div', { class: 'branch__head' },
        el('span', { class: 'branch__title' }, r.title),
        el('span', { class: 'branch__kind' }, isFilm ? '영화' : '책')),
      el('p', { class: 'branch__reason' }, r.reason || '')));
}

// 정본: detail.jsx:28-39.
function branchSkeleton(index) {
  return el('div', { class: 'branch branch--skel', 'aria-hidden': 'true' },
    el('span', { class: 'branch__index' }, String(index).padStart(2, '0')),
    el('div', { class: 'sk sk--poster', style: 'width:48px;height:71px;border-radius:7px' }),
    el('div', { class: 'branch__body' },
      el('div', { class: 'sk sk--line', style: 'width:38%' }),
      el('div', { class: 'sk sk--line', style: 'width:90%;margin-top:11px' })));
}

// 상세 갈래 realtime 채널은 모듈 레벨 1개(상세는 hashchange 마다 재mount → 중복 구독 방지).
let _branchChannel = null;
const _pendingBranch = new Set();   // 방금 평가해 갈래 생성 대기 중인 작품 키 — "분석 중" 연출용. 생성은 엔진(데몬/백필)이 함. 재진입 시 유지 의도라 모듈 레벨.

// 정본: detail.jsx:131-149 — branches__head 에 {N}갈래 상태(또는 pending), 본문은 branch-rail.
function branchesSection(w, userId) {
  const key = srcKey(w);
  const sec = el('section', { class: 'branches' });
  const status = el('span', { class: 'branches__status' });
  sec.appendChild(el('div', { class: 'branches__head' }, el('h2', { class: 'branches__h' }, '이 작품에서 이어지는 갈래'), status));
  const rail = el('div', { class: 'branch-rail' });
  sec.appendChild(rail);

  function setStatus(pending, count) {
    clear(status);
    if (pending) {
      status.className = 'branches__status branches__status--on';
      status.append(el('span', { class: 'pulse' }), document.createTextNode(' 평가를 반영해 다시 고르는 중…'));
    } else {
      status.className = 'branches__status';
      status.textContent = count != null ? `${count}갈래` : '';
    }
  }
  const note = (t) => el('p', { class: 'branch__reason', style: 'padding:16px 0;margin:0;color:var(--ink-4)' }, t);

  async function render() {
    if (!userId || !supabase) { clear(rail); setStatus(false, null); rail.appendChild(note('로그인하면 이 작품에서 이어지는 갈래를 골라드려요.')); return; }
    const branches = await readBranches(userId, key);
    clear(rail);
    if (branches.length) {
      _pendingBranch.delete(key);
      setStatus(false, branches.length);
      branches.forEach((r, i) => rail.appendChild(branchCard(r, i + 1)));
      return;
    }
    // 갈래 없음 — 앱은 생성하지 않는다(spec D3: 생성 로직을 앱에 두지 않음, 앱은 표시만). 생성은 엔진(데몬/백필).
    const ex = await Queries.getRating(userId, w.media_type, w.title, w.year);
    if (_pendingBranch.has(key)) {
      // 방금 평가 → 엔진이 생성 중. "분석 중" 연출(spec §4 R3). 도착하면 realtime 으로 위 분기.
      setStatus(true);
      [1, 2, 3].forEach((i) => rail.appendChild(branchSkeleton(i)));
    } else if (ex && ex.rating >= 3.0) {
      // 평가됐으나 아직 갈래 미생성 → 엔진/백필이 준비되면 채움(앱은 트리거 안 함).
      setStatus(false, null);
      rail.appendChild(note('이 작품의 갈래는 준비되면 여기 채워집니다.'));
    } else {
      setStatus(false, null);
      rail.appendChild(note('이 작품을 ★3.0 이상으로 평가하면, 여기서 이어지는 갈래를 이유와 함께 골라드려요.'));
    }
  }

  function subscribe() {
    if (!supabase || !userId) return;
    try { if (_branchChannel) supabase.removeChannel(_branchChannel); } catch (e) { /* noop */ }
    _branchChannel = supabase
      .channel('pick-branch-' + userId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pick_recommendations', filter: 'owner_id=eq.' + userId }, async () => {
        try { await Sync.pullRecommendations(userId); } catch (e) { /* noop */ }
        render();
      })
      .subscribe();
  }

  // 초기: Dexie 최신화 후 렌더 — 새 탭/기기에서 기존 갈래가 아직 동기화 전이면 누락되므로(home.js:187 패턴).
  (async () => { try { await Sync.pullRecommendations(userId); } catch (e) { /* noop */ } render(); })();
  subscribe();
  onViewTeardown(() => {
    try { if (_branchChannel) { supabase.removeChannel(_branchChannel); _branchChannel = null; } } catch (e) { /* noop */ }
  });
  return { el: sec, refresh: render };   // refresh — ratebox 가 평가 직후 "분석 중" 연출을 띄울 때 호출
}

function main(w, isFilm, branchesEl) {
  const m = el('div', { class: 'detail__main' });
  const head = el('header', { class: 'detail__head' });
  const kind = el('div', { class: 'detail__kind' }, dot(), el('span', {}, isFilm ? (w.subtype === 'tv' ? '드라마' : '영화') : '책'));
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

  m.appendChild(branchesEl);
  return m;
}
