// taste 앱 셸 + view-state 라우터. design-ref/source/app/main.jsx App 포팅(바닐라).
// Wave 1: 라우트 home/detail(단일 작품)/import/library + 검색 오버레이 + 계정 메뉴.
// (경로 스택·갈래 trail·분석 연출은 Wave 2.)
import { el, clear } from './ui/dom.js';
import { Auth } from './services/auth.js';
import { Queries } from './db/queries.js';
import { ensureLoginCard, hideLoadingScreen } from './ui/login.js';
import * as Home from './features/home.js';
import * as Detail from './features/detail.js';
import * as ImportView from './features/import.js';
import * as Library from './features/library.js';
import { openSearch } from './features/search.js';

let _userId = null;
let _bound = false;
let _keysBound = false;

export function setRouterUser(id) { _userId = id || null; }

function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const [seg, raw] = h.split('/');
  if (seg === 'w' && raw) return { name: 'detail', id: decodeURIComponent(raw) };
  if (seg === 'import') return { name: 'import' };
  if (seg === 'library') return { name: 'library', cat: raw || null };
  return { name: 'home' };
}

function render() {
  if (document.body.dataset.authState !== 'in') return;
  const v = parseHash();
  const host = document.getElementById('app');
  clear(host);
  host.appendChild(shell(v));
  window.scrollTo({ top: 0 });
}

function shell(v) {
  const root = el('div', { class: 'app dens-regular' });
  root.appendChild(topbar(v));
  const stage = el('main', { class: 'stage' });
  if (v.name === 'detail') stage.appendChild(Detail.mount({ userId: _userId, id: v.id }));
  else if (v.name === 'import') stage.appendChild(ImportView.mount({ userId: _userId }));
  else if (v.name === 'library') stage.appendChild(Library.mount({ userId: _userId, cat: v.cat }));
  else stage.appendChild(Home.mount({ userId: _userId }));
  root.appendChild(stage);
  return root;
}

const NAV = [['movie', '영화'], ['drama', '드라마'], ['book', '책']];
function topbar(v) {
  const brand = el('button', { class: 'brand', 'aria-label': 'taste 홈', onClick: () => { location.hash = '#/'; } },
    'taste', el('span', { class: 'brand__dot' }));
  const nav = el('nav', { class: 'topnav' }, ...NAV.map(([cat, label]) => el('button', {
    class: 'topnav__item' + (v && v.name === 'library' && v.cat === cat ? ' is-on' : ''),
    onClick: () => { location.hash = '#/library/' + cat; },
  }, label)));
  const cue = el('button', { class: 'searchcue', 'aria-label': '검색', onClick: () => openSearch({ userId: _userId }) },
    el('span', { class: 'searchcue__icon', 'aria-hidden': 'true' }, '⌕'),
    el('span', { class: 'searchcue__label' }, '검색'),
    el('kbd', { class: 'searchcue__kbd' }, '⌘K'));
  return el('header', { class: 'topbar' }, el('div', { class: 'topbar__inner' },
    el('div', { class: 'topbar__left' }, brand, nav),
    el('div', { class: 'topbar__right' }, cue, accountMenu())));
}

function accountMenu() {
  const wrap = el('div', { class: 'account' });
  const avatar = el('button', { class: 'avatar', 'aria-label': '계정 메뉴' }, '나');
  let menu = null;
  const close = () => {
    if (!menu) return;
    menu.remove(); menu = null;
    document.removeEventListener('mousedown', onDoc);
    document.removeEventListener('keydown', onKey);
  };
  const onDoc = (e) => { if (!wrap.contains(e.target)) close(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const item = (label, onClick, quiet) => el('button',
    { class: 'menu__item' + (quiet ? ' menu__item--quiet' : ''), role: 'menuitem', onClick: () => { close(); onClick(); } }, label);
  const open = () => {
    const sub = el('span', { class: 'menu__sub' }, '브랜치 탐색');
    menu = el('div', { class: 'menu', role: 'menu' },
      el('div', { class: 'menu__head' },
        el('span', { class: 'avatar avatar--sm' }, '나'),
        el('div', { class: 'menu__id' }, el('span', { class: 'menu__name' }, '내 서재'), sub)),
      el('div', { class: 'menu__sep' }),
      item('평가 가져오기', () => { location.hash = '#/import'; }),
      item('내 서재', () => { location.hash = '#/library'; }),
      el('div', { class: 'menu__sep' }),
      item('로그아웃', () => Auth.signOut(), true));
    wrap.appendChild(menu);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    if (_userId) Queries.listRatings(_userId)
      .then((rs) => { sub.textContent = `평가 ${rs.filter((r) => r.rating > 0).length} · 브랜치 탐색`; })
      .catch(() => {});
  };
  avatar.addEventListener('click', () => { menu ? close() : open(); });
  wrap.appendChild(avatar);
  return wrap;
}

export function showLogin() {
  document.body.dataset.authState = 'out';
  ensureLoginCard();
  if (!location.hash) location.hash = '#/';
  hideLoadingScreen();
}
export function showAuthenticated() {
  document.body.dataset.authState = 'in';
  if (!_bound) { window.addEventListener('hashchange', render); _bound = true; }
  bindShortcuts();
  render();
  hideLoadingScreen();
}
function bindShortcuts() {
  if (_keysBound) return; _keysBound = true;
  window.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openSearch({ userId: _userId }); }
    if (e.key === '/' && !/input|textarea/i.test(document.activeElement?.tagName || '')) { e.preventDefault(); openSearch({ userId: _userId }); }
  });
}
