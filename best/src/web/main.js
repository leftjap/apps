import './styles.css'
import { isConfigured } from './supabase.js'
import { getSession, signInWithGoogle, signOut, onAuthChange, isAllowed } from './auth.js'
import { fetchLatestRun, fetchPosts, fetchSiteCounts, searchPosts, fetchUserState, upsertState, fetchSaved } from './api.js'
import { COMMUNITIES, bySite, boardLabel, rankSort, searchPlan, suggestKeywords } from './logic.js'
import { formatCount, formatRelTime } from './format.js'

const app = document.getElementById('app')
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

const ICONS = {
  home: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 10.5 12 3l9 7.5V21H3z"/></svg>',
  search: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4-4"/></svg>',
  bookmark: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 3h12v18l-6-4.5L6 21z"/></svg>',
  bookmarkFill: '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M6 3h12v18l-6-4.5L6 21z"/></svg>',
  ext: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14 21 3"/></svg>',
  eye: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>',
  cmt: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
  google: '<svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.3 13.4 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"/><path fill="#FBBC05" d="M10.4 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.8-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8z"/><path fill="#34A853" d="M24 48c6.2 0 11.5-2 15.3-5.6l-7.5-5.8c-2 1.4-4.7 2.2-7.8 2.2-6.3 0-11.7-3.9-13.6-9.4l-7.8 6C6.5 42.6 14.6 48 24 48z"/></svg>',
}

const state = {
  session: null,
  authError: null,
  view: 'home', // home | search | saved
  period: 'day',
  latest: null, // 최신 수집일 YYYY-MM-DD
  latestRunAt: null, // 수집 시각 ISO
  sites: new Set(COMMUNITIES.map((c) => c.site)),
  unreadOnly: false,
  posts: [], total: 0,
  counts: {},
  ustate: new Map(), // post_id → {saved, saved_at, read_at}
  savedSort: 'recent',
  savedRows: null,
  searchQ: '', searchRows: null, searching: false,
  loading: false, error: null,
}

const PERIODS = [['day', '일간'], ['week', '주간'], ['month', '월간'], ['year', '연간']]
const SAVED_SORTS = [['recent', '최신순'], ['popular', '인기순'], ['oldest', '오래된순']]

/* ── 렌더 ── */

function render() {
  if (!state.session || !isAllowed(state.session)) return renderGate()
  app.innerHTML = `
    <div class="layout">
      ${sidebarHtml()}
      <div class="main"><div class="content">${state.view === 'home' ? homeHtml() : state.view === 'search' ? searchHtml() : savedHtml()}</div></div>
    </div>`
  if (state.view === 'search') document.getElementById('search-input')?.focus()
}

function renderGate() {
  app.innerHTML = `
    <div class="gate">
      <div class="brand">best<em>.</em></div>
      <div class="tagline">한국 커뮤니티 인기글을 한곳에서</div>
      <button class="google-btn" data-act="signin">${ICONS.google} Google로 계속하기</button>
      <div class="hint">로그인하면 저장·읽음 기록이 계정에 동기화됩니다</div>
      ${state.authError ? `<div class="error">${esc(state.authError)}</div>` : ''}
    </div>`
}

function sidebarHtml() {
  const savedCount = [...state.ustate.values()].filter((s) => s.saved).length
  const allOn = COMMUNITIES.every((c) => state.sites.has(c.site))
  const collectedAt = footerWhen()
  return `
  <aside class="sidebar">
    <div class="side-head">
      <div class="side-brand">best.</div>
      <div class="side-sub">한국 커뮤니티 인기글</div>
    </div>
    <nav class="side-nav">
      <button class="nav-item ${state.view === 'home' ? 'active' : ''}" data-act="view" data-view="home">${ICONS.home} 홈</button>
      <button class="nav-item ${state.view === 'search' ? 'active' : ''}" data-act="view" data-view="search">${ICONS.search} 검색</button>
      <button class="nav-item ${state.view === 'saved' ? 'active' : ''}" data-act="view" data-view="saved">${ICONS.bookmark} 저장됨 ${savedCount ? `<span class="nav-badge">${savedCount}</span>` : ''}</button>
    </nav>
    <div class="side-section"><span class="side-label">커뮤니티</span><button class="side-toggle-all" data-act="toggle-all">${allOn ? '전체 해제' : '전체 선택'}</button></div>
    <div class="comm-list">
      ${COMMUNITIES.map((c) => `
        <button class="comm-item ${state.sites.has(c.site) ? '' : 'off'}" data-act="comm" data-site="${c.site}">
          <span class="comm-dot" style="background:${c.color}"></span>${c.name}
          <span class="comm-count">${state.counts[c.site] ?? 0}</span>
        </button>`).join('')}
    </div>
    <div class="side-foot">
      <div class="when">${collectedAt}</div>
      <div class="desc">9개 커뮤니티 · 하루 1회 갱신</div>
      <button class="signout" data-act="signout">로그아웃</button>
    </div>
  </aside>`
}

function footerWhen() {
  if (!state.latestRunAt) return '수집 정보 없음'
  const d = new Date(state.latestRunAt)
  const kstToday = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10)
  const hm = d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul' })
  return state.latest === kstToday ? `오늘 ${hm} 수집` : `${state.latest?.slice(5).replace('-', '.')} ${hm} 수집`
}

function homeHtml() {
  const visible = visiblePosts()
  return `
    <div class="home-head">
      <div class="tabs">${PERIODS.map(([k, l]) => `<button class="tab ${state.period === k ? 'active' : ''}" data-act="period" data-period="${k}">${l}</button>`).join('')}</div>
      <span class="result-count">${state.total.toLocaleString('ko-KR')}건</span>
      <div class="head-right">
        <label class="switch-label" data-act="unread">안 읽은 글만 <span class="switch ${state.unreadOnly ? 'on' : ''}"></span></label>
      </div>
    </div>
    ${stateHtml() ?? rowsHtml(visible) + (state.posts.length < state.total ? '<button class="load-more" data-act="more">더보기</button>' : '')}`
}

function searchHtml() {
  return `
    <div class="view-title"><h1>검색</h1></div>
    <div class="search-box">${ICONS.search}<input id="search-input" type="search" placeholder="제목 · 커뮤니티 · 게시판에서 검색" value="${esc(state.searchQ)}" /></div>
    <div id="search-results">${searchResultsHtml()}</div>`
}

// 검색 결과만 갱신한다 — 전체 재렌더 시 input 이 교체돼 한글 IME 조합이 끊긴다 (2026-07-11 실측)
function searchResultsHtml() {
  const rows = state.searchRows
  if (rows == null) {
    const kw = suggestKeywords(state.posts.map((p) => p.title), 8)
    return kw.length
      ? `<div class="chips-label">추천 검색어</div><div class="chips">${kw.map((k) => `<button class="chip" data-act="chip" data-q="${esc(k)}">${ICONS.search} ${esc(k)}</button>`).join('')}</div>`
      : ''
  }
  if (state.searching) return '<div class="state">검색 중…</div>'
  if (rows.length === 0) return '<div class="state">검색 결과가 없습니다</div>'
  return rowsHtml(rows, { ranked: false })
}

function renderSearchResults() {
  const el = document.getElementById('search-results')
  if (el) el.innerHTML = searchResultsHtml()
}

function savedHtml() {
  const rows = sortedSaved()
  return `
    <div class="view-title">
      <h1>저장됨</h1><span class="result-count">${rows?.length ?? 0}개</span>
      <div class="sort-tabs">${SAVED_SORTS.map(([k, l]) => `<button class="tab ${state.savedSort === k ? 'active' : ''}" data-act="saved-sort" data-sort="${k}">${l}</button>`).join('')}</div>
    </div>
    ${rows == null ? '<div class="state">불러오는 중…</div>' : rows.length === 0 ? '<div class="state">저장한 글이 없습니다</div>' : rowsHtml(rows, { ranked: false })}`
}

function stateHtml() {
  if (state.loading) return '<div class="state">불러오는 중…</div>'
  if (state.error) return `<div class="state error">불러오지 못했습니다 — ${esc(state.error)}</div>`
  if (!visiblePosts().length) return '<div class="state">표시할 글이 없습니다</div>'
  return null
}

function visiblePosts() {
  let rows = state.posts.filter((p) => state.sites.has(p.site))
  if (state.unreadOnly) rows = rows.filter((p) => !state.ustate.get(p.id)?.read_at)
  return rows
}

function rowsHtml(rows, { ranked = true } = {}) {
  return `<div class="rows">${rows.map((p, i) => rowHtml(p, ranked ? i + 1 : null)).join('')}</div>`
}

function rowHtml(p, rank) {
  const c = bySite[p.site]
  const st = state.ustate.get(p.id)
  const board = boardLabel(p)
  const rel = formatRelTime(p.posted_at)
  return `
  <div class="row" data-id="${p.id}">
    ${rank != null ? `<span class="rank ${rank <= 3 ? 'top' : ''}">${rank}</span>` : ''}
    <span class="comm" style="color:${c?.color ?? 'inherit'}">${c?.short ?? esc(p.site)}</span>
    <a class="title ${st?.read_at ? 'read' : ''}" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer" data-act="open">${esc(p.title)}</a>
    <span class="ext">${ICONS.ext}</span>
    <span class="meta">
      ${board ? `<span class="board">${esc(board)}</span>` : ''}
      ${p.views != null ? `<span class="m">${ICONS.eye} ${formatCount(p.views)}</span>` : ''}
      ${p.comments != null ? `<span class="m">${ICONS.cmt} ${formatCount(p.comments)}</span>` : ''}
      <span class="time">${rel}</span>
    </span>
    <button class="save ${st?.saved ? 'on' : ''}" data-act="save" title="${st?.saved ? '저장 해제' : '저장'}">${st?.saved ? ICONS.bookmarkFill : ICONS.bookmark}</button>
  </div>`
}

function sortedSaved() {
  if (state.savedRows == null) return null
  const rows = [...state.savedRows]
  if (state.savedSort === 'recent') rows.sort((a, b) => (b.saved_at ?? '').localeCompare(a.saved_at ?? ''))
  if (state.savedSort === 'oldest') rows.sort((a, b) => (a.saved_at ?? '').localeCompare(b.saved_at ?? ''))
  if (state.savedSort === 'popular') return rankSort(rows)
  return rows
}

/* ── 데이터 로드 ── */

async function loadHome({ append = false } = {}) {
  const sites = COMMUNITIES.map((c) => c.site).filter((s) => state.sites.has(s))
  if (!sites.length) { state.posts = []; state.total = 0; state.loading = false; render(); return }
  state.loading = !append
  state.error = null
  render()
  try {
    const offset = append ? state.posts.length : 0
    const { rows, total } = await fetchPosts({ period: state.period, latest: state.latest, sites, offset })
    state.posts = append ? [...state.posts, ...rows] : rows
    state.total = total
  } catch (e) {
    state.error = e.message
  }
  state.loading = false
  render()
}

async function refreshCounts() {
  try {
    state.counts = await fetchSiteCounts({
      period: state.period,
      latest: state.latest,
      sites: COMMUNITIES.map((c) => c.site),
    })
    render()
  } catch { /* 카운트는 비필수 — 실패해도 목록은 유지 */ }
}

async function runSearch(q, { fromChip = false } = {}) {
  state.searchQ = q
  const plan = searchPlan(q)
  if (!plan) { state.searchRows = null; state.searching = false; renderSearchResults(); return }
  state.searchRows = []
  state.searching = true
  if (fromChip) render()
  else renderSearchResults()
  try {
    state.searchRows = await searchPosts({ plan })
  } catch (e) {
    state.error = e.message
  }
  state.searching = false
  renderSearchResults()
}

async function boot() {
  state.loading = true
  render()
  try {
    const run = await fetchLatestRun()
    state.latest = run?.run_on ?? new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10)
    state.latestRunAt = run?.created_at ?? null
    state.ustate = await fetchUserState()
    await loadHome()
    refreshCounts()
  } catch (e) {
    state.loading = false
    state.error = e.message
    render()
  }
}

/* ── 이벤트 ── */

let searchTimer = null
let composing = false
app.addEventListener('compositionstart', (e) => { if (e.target.id === 'search-input') composing = true })
app.addEventListener('compositionend', (e) => {
  if (e.target.id !== 'search-input') return
  composing = false
  e.target.dispatchEvent(new Event('input', { bubbles: true }))
})
app.addEventListener('input', (e) => {
  if (e.target.id !== 'search-input' || composing) return // 한글 조합 중엔 중간 자모로 검색하지 않는다
  clearTimeout(searchTimer)
  const q = e.target.value
  searchTimer = setTimeout(() => runSearch(q), 300)
})

app.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-act]')
  if (!el) return
  const act = el.dataset.act

  if (act === 'signin') { await signInWithGoogle(); return }
  if (act === 'signout') { await signOut(); location.reload(); return }

  if (act === 'view') {
    state.view = el.dataset.view
    if (state.view === 'saved') { state.savedRows = null; render(); state.savedRows = await fetchSaved(); render(); return }
    render(); return
  }
  if (act === 'period') {
    state.period = el.dataset.period
    await loadHome()
    refreshCounts()
    return
  }
  if (act === 'unread') { state.unreadOnly = !state.unreadOnly; render(); return }
  if (act === 'more') { await loadHome({ append: true }); return }
  if (act === 'toggle-all') {
    const allOn = COMMUNITIES.every((c) => state.sites.has(c.site))
    state.sites = new Set(allOn ? [] : COMMUNITIES.map((c) => c.site))
    await loadHome()
    return
  }
  if (act === 'comm') {
    const s = el.dataset.site
    state.sites.has(s) ? state.sites.delete(s) : state.sites.add(s)
    await loadHome()
    return
  }
  if (act === 'saved-sort') { state.savedSort = el.dataset.sort; render(); return }
  if (act === 'chip') { runSearch(el.dataset.q, { fromChip: true }); return }

  if (act === 'open') {
    // 새 탭은 브라우저 기본 동작 — 여기선 읽음 처리만
    const id = Number(el.closest('.row').dataset.id)
    const prev = state.ustate.get(id) ?? {}
    if (!prev.read_at) {
      const read_at = new Date().toISOString()
      state.ustate.set(id, { ...prev, read_at })
      upsertState(state.session.user.id, id, { read_at }).catch(() => {})
      setTimeout(render, 100) // 새 탭 열림을 방해하지 않게 지연 렌더
    }
    return
  }
  if (act === 'save') {
    const id = Number(el.closest('.row').dataset.id)
    const prev = state.ustate.get(id) ?? {}
    const saved = !prev.saved
    const saved_at = saved ? new Date().toISOString() : prev.saved_at
    state.ustate.set(id, { ...prev, saved, saved_at })
    if (state.savedRows && !saved) state.savedRows = state.savedRows.filter((r) => r.id !== id)
    render()
    upsertState(state.session.user.id, id, { saved, saved_at }).catch(() => {})
    return
  }
})

/* ── 시작 ── */

async function init() {
  if (!isConfigured) {
    app.innerHTML = '<div class="gate"><div class="tagline">환경변수(VITE_SUPABASE_URL·VITE_SUPABASE_ANON_KEY)가 없습니다</div></div>'
    return
  }
  state.session = await getSession()
  if (state.session && !isAllowed(state.session)) {
    state.authError = `허용되지 않은 계정입니다: ${state.session.user?.email ?? ''}`
    await signOut()
    state.session = null
  }
  onAuthChange((event, session) => {
    if (event === 'SIGNED_IN' && !state.session) {
      state.session = session
      if (!isAllowed(session)) {
        state.authError = `허용되지 않은 계정입니다: ${session.user?.email ?? ''}`
        signOut()
        state.session = null
        render()
        return
      }
      boot()
    }
  })
  if (state.session) boot()
  else render()
}

init()
