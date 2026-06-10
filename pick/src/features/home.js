// pick 홈(메인 추천 피드) — Featured 추천(pick_recommendations) 트랙 + 최근 평가(Dexie).
// §7 연출: '다시 추천' 버튼 → pick_reco_requests insert → 로컬 데몬이 claude 재생성 → realtime 새 batch 도착 시 교체.
import { el, clear } from '../ui/dom.js';
import { poster, hueFromString, dot } from '../ui/poster.js';
import { Queries } from '../db/queries.js';
import { openSearch } from './search.js';
import { supabase } from '../services/supabase.js';
import { Sync } from '../db/sync.js';
import { trailReset, onViewTeardown } from '../app.js';

async function readRecos(userId) {
  const db = globalThis.pickDB;
  if (!db || !userId) return [];
  try {
    const all = await db.recommendations.where('owner_id').equals(userId).toArray();
    return all.filter((r) => (r.kind ?? 'home') === 'home');   // 홈 피드는 kind=home 만 — 갈래(branch)는 상세에서만(홈 누수 방지)
  } catch (e) { return []; }
}

// 추천 ↔ 평가 매칭 키 (media_type|title|year). 이미 평가한 작품을 추천에서 제외하는 데 사용.
function ratedKeyOf(media_type, title, year) {
  return `${media_type}|${String(title || '').trim().toLowerCase()}|${year ?? ''}`;
}

// 추천작은 미평가작 → 상세에서 바로 평가할 수 있게 __pickOpen 으로 전달 후 이동.
function openReco(r) {
  window.__pickOpen = window.__pickOpen || {};
  window.__pickOpen[r.id] = { media_type: r.media_type, title: r.title, year: r.year, external_id: r.external_id, meta: { poster_url: r.poster_url } };
  trailReset(r.id, r.title);   // 신규 열기 — 갈래 경로 리셋
  location.hash = '#/w/' + encodeURIComponent(r.id);
}

function recoRow(r) {
  const isFilm = r.media_type === 'movie';
  return el('article', { class: 'rec', onClick: () => openReco(r) },
    poster({ type: isFilm ? 'film' : 'book', title: r.title, year: r.year, hue: hueFromString(r.title), w: 56, rounded: 8, label: false, src: r.poster_url }),
    el('div', { class: 'rec__text' },
      el('h3', { class: 'rec__title' }, r.title),
      el('p', { class: 'rec__reason' }, r.reason || '')));
}

function track(title, items) {
  return el('div', { class: 'track' },
    el('div', { class: 'track__head' }, el('h2', { class: 'track__h' }, title), el('span', { class: 'track__count' }, String(items.length))),
    el('div', { class: 'track__list' }, ...items.map(recoRow)));
}

// 분석 중 스켈레톤 (가짜 타이머 아님 — 실제 재생성 대기 상태. realtime 도착 시 해제).
function analyzingBlock() {
  const list = el('div', { class: 'track__list' });
  for (let i = 0; i < 4; i++) {
    list.append(el('article', { class: 'rec' },
      el('div', { class: 'sk sk--poster' }),
      el('div', { class: 'rec__text', style: 'flex:1' },
        el('div', { class: 'sk sk--line', style: 'width:55%' }),
        el('div', { class: 'sk sk--line', style: 'width:88%' }))));
  }
  return el('section', {},
    el('div', { class: 'feat__eyebrow', style: 'margin-bottom:14px' },
      el('span', { class: 'pulse' }), el('span', {}, '평가를 반영해 다시 고르는 중…')),
    list);
}

// realtime 채널은 모듈 레벨로 1개만(home 은 hashchange 마다 재mount → 중복 구독 방지).
let _recoChannel = null;

export function mount({ userId } = {}) {
  const root = el('div', { class: 'home' });
  let filter = 'all';
  let all = [];
  let recos = [];
  let analyzing = false;

  const note = el('p', { class: 'home__note' });
  const intro = el('header', { class: 'home__intro' },
    el('h1', { class: 'home__greet' }, '다음에 무엇을 볼까요'),
    note);
  const recoSec = el('section', {});
  const recentSec = el('section', { class: 'recent' });
  root.append(intro, recoSec, recentSec);
  let fallbackTimer = null;   // requestReco 5분 폴백 — 라우트 이탈 시 teardown 에서 취소

  function renderNote() {
    clear(note);
    if (all.length === 0) { note.textContent = '아직 평가한 작품이 없어요. 검색해서 첫 평가를 시작해 보세요.'; return; }
    note.append(document.createTextNode('지금까지 '), el('b', {}, `${all.length}편`), document.createTextNode(' 평가했어요.'));
  }

  // '다시 추천' 버튼 — pick_reco_requests 에 요청 1줄 insert(로컬 데몬 트리거). 평가가 있을 때만 노출.
  function regenButton() {
    if (!all.length || !supabase) return null;
    return el('button', { class: 'btn btn--sm', disabled: analyzing ? '' : null, onClick: requestReco },
      analyzing ? '추천 준비 중…' : '다시 추천');
  }

  async function requestReco() {
    if (!supabase || !userId || analyzing) return;
    analyzing = true; renderReco();
    try {
      // 로컬 데몬이 realtime 으로 이 행을 즉시 감지 → claude 가 재생성 → pick_recommendations 변경 realtime 도착 시 해제.
      const { error } = await supabase.from('pick_reco_requests').insert({ owner_id: userId, source: 'button' });
      if (error) throw error;
      // 생성은 수십 초~수 분 걸릴 수 있음. 정상 해제는 realtime(onRecoChange). 폴백 재pull 은 5분 후 1회.
      fallbackTimer = setTimeout(() => { if (analyzing) onRecoChange(); }, 300000);
    } catch (e) {
      analyzing = false; renderReco();
      flash('추천 재생성 요청을 보내지 못했어요. 잠시 후 다시 시도해 주세요.');
    }
  }

  function flash(msg) {
    const m = el('p', { class: 'home__note', style: 'margin-top:10px;color:var(--ink-3)' }, msg);
    recoSec.appendChild(m);
    setTimeout(() => { try { m.remove(); } catch (e) {} }, 4000);
  }

  function renderReco() {
    clear(recoSec);
    if (analyzing) { recoSec.appendChild(analyzingBlock()); return; }
    // 이미 평가한(=본) 작품은 추천에서 숨김.
    const ratedSet = new Set(all.map((r) => ratedKeyOf(r.media_type, r.title, r.year)));
    const visible = recos.filter((r) => !ratedSet.has(ratedKeyOf(r.media_type, r.title, r.year)));
    if (!visible.length) {
      const block = el('div', { style: 'padding:calc(var(--u)*1.6) 20px;border:1px dashed var(--line);border-radius:var(--r-lg);display:flex;flex-direction:column;gap:12px;align-items:flex-start' });
      block.append(
        el('div', { class: 'feat__eyebrow' }, dot(), el('span', {}, '오늘의 추천')),
        el('p', { class: 'feat__reason', style: 'margin:0;color:var(--ink-2)' },
          all.length ? '평가를 반영한 추천을 준비하고 있어요. 곧 이 자리에 다음에 볼·읽을 작품이 이유와 함께 도착합니다.'
            : '작품을 평가하면, 다음에 볼·읽을 작품을 이유와 함께 골라드려요.'));
      if (all.length === 0) block.append(el('button', { class: 'btn btn--sm', onClick: () => openSearch({ userId }) }, '검색해 첫 평가 시작'));
      else { const b = regenButton(); if (b) block.append(b); }
      recoSec.appendChild(block);
      return;
    }
    const films = visible.filter((r) => r.media_type === 'movie');
    const books = visible.filter((r) => r.media_type === 'book');
    const tracks = [];
    if (filter !== 'book' && films.length) tracks.push(track('다음에 볼 작품', films));
    if (filter !== 'movie' && books.length) tracks.push(track('다음에 읽을 책', books));
    const b = regenButton();
    const tracksEl = el('div', { class: 'tracks' }, ...tracks);
    if (b) recoSec.append(el('div', { class: 'feat__eyebrow', style: 'margin-bottom:14px;justify-content:flex-end' }, b), tracksEl);
    else recoSec.append(tracksEl);
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
      row.appendChild(el('button', { class: 'recent__item', onClick: () => { trailReset(r.id, r.title); location.hash = '#/w/' + encodeURIComponent(r.id); } },
        poster({ type: isFilm ? 'film' : 'book', title: r.title, year: r.year, hue: hueFromString(r.title), w: 60, rounded: 8, label: false, src: r.meta?.poster_url }),
        el('span', { class: 'recent__title' }, r.title),
        el('span', { class: 'recent__stars' }, stars)));
    });
    recentSec.appendChild(row);
  }

  function renderBody() { renderReco(); renderRecent(); }

  // realtime: 추천 변경(새 batch) 도착 → 재pull + 분석중 해제 + 재렌더 (§7 실 비동기).
  async function onRecoChange() {
    if (fallbackTimer) { clearTimeout(fallbackTimer); fallbackTimer = null; }
    try { await Sync.pullAll(globalThis.pickDB, userId); } catch (e) { /* noop */ }
    recos = await readRecos(userId);
    analyzing = false;
    renderReco();
  }
  function subscribeRecos() {
    if (!supabase || !userId) return;
    try { if (_recoChannel) supabase.removeChannel(_recoChannel); } catch (e) { /* noop */ }
    _recoChannel = supabase
      .channel('pick-recos-' + userId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pick_recommendations', filter: 'owner_id=eq.' + userId }, onRecoChange)
      .subscribe();
  }

  renderNote(); renderBody();
  (async () => {
    if (!userId) return;
    try {
      all = await Queries.listRatings(userId); recos = await readRecos(userId); renderNote(); renderBody();
      // 로그인 sync 가 끝나기 전 첫 렌더면 추천이 비어 보임 → 추천 테이블을 직접 당겨 보장 후 재렌더.
      if (!analyzing) { await Sync.pullRecommendations(userId); recos = await readRecos(userId); if (!analyzing) renderReco(); }
    } catch (e) { /* noop */ }
  })();
  subscribeRecos();
  onViewTeardown(() => {
    if (fallbackTimer) { clearTimeout(fallbackTimer); fallbackTimer = null; }
    try { if (_recoChannel) { supabase.removeChannel(_recoChannel); _recoChannel = null; } } catch (e) { /* noop */ }
  });
  return root;
}
