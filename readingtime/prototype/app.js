/* ===== 리딩타임 프로토타입 v8 — 데이터·아이콘·라우터 =====
   시안 정본: design-ref/v3/mockups/mockup.html §t5 (v8 01~14)
   스펙: design-ref/v3/README.md · SCREENS.md · MOTION.md */

'use strict';

/* ---------- 샘플 데이터 (시안 v8 데모 값) ---------- */
const DATA = {
  user: { name: '지훈', initial: '지' },
  today: { label: '5.21 목', time: '14:14' },
  stats: { todayMin: 32, week: '7:26', streak: 12, libraryCount: 14, month: '5월' },
  current: { id: 'flow', total: '4:12', sessions: 8, days: 18 },
  books: {
    flow:  { title: '몰입', author: '미하이 칙센트미하이', publisher: '한울림', cover: 'flow' },
    money: { title: '돈의 심리학', author: '모건 하우절', publisher: '인플루엔셜', cover: 'money' },
    focus: { title: '도둑맞은 집중력', author: '요한 하리', publisher: '어크로스', cover: 'focus' },
  },
  recent: [
    { min: 26, book: '몰입', method: 'flip', when: '오늘 14:14' },
    { min: 48, book: '도둑맞은 집중력', method: 'millie-pc', when: '오늘' },
  ],
};

/* ---------- 아이콘 (시안 인라인 SVG 원본) ---------- */
const IC = {
  logo: (s, sw) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="#f2eedd" stroke-width="${sw}" stroke-linejoin="round"><path d="M12 5.8C9.6 4.2 6.5 3.8 3.6 4.5v14.2c2.9-.7 6-.3 8.4 1.3 2.4-1.6 5.5-2 8.4-1.3V4.5c-2.9-.7-6-.3-8.4 1.3z"/><path d="M12 5.8v14.2"/></svg>`,
  plus: (s, c, sw) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="${sw}" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>`,
  flip: (s, c, sw = 2) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"><rect x="8.5" y="4.5" width="7" height="15" rx="2"/><path d="M4.2 9.2a8 8 0 0 1 3-3.6M19.8 14.8a8 8 0 0 1-3 3.6"/><path d="M4.2 6.2v3h3M19.8 17.8v-3h-3"/></svg>`,
  tap: (s, c, sw = 1.9) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"><path d="M10 9.5V5.4a1.8 1.8 0 0 1 3.6 0v6.6"/><path d="M13.6 9a1.7 1.7 0 0 1 3.4 0v5.5a5 5 0 0 1-5 5h-1a4 4 0 0 1-2.9-1.3l-3.1-3.2a1.7 1.7 0 0 1 2.5-2.3l1.5 1.3"/></svg>`,
  play: (s, c) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="${c}"><path d="M8 5.5v13l11-6.5z"/></svg>`,
  chevR: (s, c) => `<svg width="${s}" height="${s}" viewBox="0 0 9 16" fill="none" stroke="${c}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 1l6 7-6 7"/></svg>`,
  monitor: (s, c, sw = 1.8) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8M12 17v4"/></svg>`,
  clock: (s, c, sw = 2) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="${sw}" stroke-linecap="round"><circle cx="12" cy="12" r="8"/><path d="M12 8.5v3.5l2.5 2.5"/></svg>`,
  back: (s, c) => `<svg width="${s}" height="${s}" viewBox="0 0 20 20" fill="none" stroke="${c}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4 6 10l6 6"/></svg>`,
  dots: `<svg width="5" height="18" viewBox="0 0 6 22"><circle cx="3" cy="3" r="2.4" fill="#8c8570"/><circle cx="3" cy="11" r="2.4" fill="#8c8570"/><circle cx="3" cy="19" r="2.4" fill="#8c8570"/></svg>`,
  check: (s, c, sw) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7"/></svg>`,
  google: (s) => `<svg width="${s}" height="${s}" viewBox="0 0 48 48"><path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h11.8c-.5 2.7-2 5-4.4 6.6v5.5h7.1c4.1-3.8 6.6-9.4 6.6-16.1z"/><path fill="#34A853" d="M24 46c5.9 0 10.9-2 14.5-5.3l-7.1-5.5c-2 1.3-4.5 2.1-7.4 2.1-5.7 0-10.5-3.8-12.2-9H4.4v5.7C8 41.1 15.4 46 24 46z"/><path fill="#FBBC05" d="M11.8 28.3c-.5-1.4-.7-2.8-.7-4.3s.3-3 .7-4.3v-5.7H4.4C2.9 17 2 20.4 2 24s.9 7 2.4 10l7.4-5.7z"/><path fill="#EA4335" d="M24 10.7c3.2 0 6.1 1.1 8.4 3.3l6.3-6.3C34.9 4.1 29.9 2 24 2 15.4 2 8 6.9 4.4 14l7.4 5.7c1.7-5.2 6.5-9 12.2-9z"/></svg>`,
};

/* ---------- 라우터 ---------- */
const phoneEl = document.getElementById('phone');
const screenEl = document.getElementById('screen');
const sheetEl = document.getElementById('sheet-layer');
const DARK_SCREENS = ['03', '04', '05'];

const state = {
  screen: '01',
  mode: 'flip',          // flip | tap — 홈 세그먼트
  session: null,         // { mode, status: recording|paused, elapsed, pauseCount }
  justResumed: false,
  sheet: null,           // addtime | finish | addbook | settings | sort
  addtime: { value: 35, preset: 15 },   // 시안 데모 상태
  rating: 4,                            // 09 데모: 4★
  added: { flow: true },                // 13 데모: 첫 행 추가됨
};

/* 시트 화면 해시 별칭 (직접 접근용): 07=02+addtime, 09=08+finish, 13=12+addbook */
const SHEET_ROUTES = {
  '07': { base: '02', sheet: 'addtime' },
  '09': { base: '08', sheet: 'finish' },
  '13': { base: '12', sheet: 'addbook' },
};

function nav(id) {
  if (state.sheet) { state.sheet = null; renderSheet(); }
  state.screen = id;
  render();
}

function render() {
  if (!SCREENS[state.screen]) state.screen = '02'; // 없는 화면 해시 → 홈
  phoneEl.classList.toggle('dark', DARK_SCREENS.includes(state.screen));
  screenEl.innerHTML = SCREENS[state.screen]();
  if (location.hash !== '#/' + state.screen) location.hash = '#/' + state.screen;
  stopTick();
  if (['04', '05'].includes(state.screen) && state.session && state.session.status === 'recording') startTick();
  const after = AFTER_RENDER[state.screen];
  if (after) after();
}

/* ---------- 01 로그인 ---------- */
function renderLogin() {
  return `
  <div class="s01">
    <div class="s01-hero">
      <div class="s01-logo">${IC.logo(46, 1.6)}</div>
      <h1 class="s01-title">리딩타임</h1>
      <div class="s01-underline"></div>
      <p class="s01-copy">당신의 리딩타임을 기록해 보세요.<br>독서 습관이 바뀌면 책 읽기가 더 즐거워집니다.</p>
    </div>
    <button class="s01-google" data-act="login">${IC.google(20)}<span>Google로 계속하기</span></button>
    <p class="s01-terms">계속하면 이용약관과 개인정보 처리방침에 동의합니다</p>
  </div>`;
}

/* ---------- 표지 (시안 CSS 자리표시 표지 재현) ---------- */
const COVERS = {
  flowHero: `
    <div class="cover-flow" style="width:94px;height:137px">
      <div class="cover-spine"></div>
      <div class="cover-flow-frame"></div>
      <div class="cover-flow-in">
        <div class="mono cf-author-en">MIHALY CSIKSZENTMIHALYI</div>
        <div class="cf-title">몰입</div>
        <div class="mono cf-flow">FLOW</div>
        <div style="flex:1"></div>
        <div class="cf-rule"></div>
        <div class="cf-author">미하이 칙센트미하이</div>
      </div>
    </div>`,
};

/* ---------- 02 홈 (허브) ---------- */
function renderHome() {
  const flip = state.mode === 'flip';
  return `
  <div class="s02-root">
    <div class="s02-header">
      <div class="s02-brand"><div class="s02-brand-logo">${IC.logo(19, 2)}</div><span>리딩타임</span></div>
      <div class="s02-hactions">
        <button class="s02-plus" data-act="sheet" data-sheet="addbook">${IC.plus(17, '#f2eedd', 2.4)}</button>
        <button class="s02-avatar" data-act="sheet" data-sheet="settings">${DATA.user.initial}</button>
      </div>
    </div>
    <div class="s02-body">
      <div class="s02-hero">
        <div class="s02-hero-row">
          ${COVERS.flowHero}
          <div class="s02-hero-col">
            <div class="live-chip"><span class="live-dot"></span><span>읽는 중</span></div>
            <div class="s02-hero-title">몰입</div>
            <div class="s02-hero-author">미하이 칙센트미하이</div>
            <div style="flex:1"></div>
            <div class="s02-hero-total"><span class="mono">4:12</span><span>누적 · 8회</span></div>
          </div>
        </div>
        <div class="s02-seg">
          <button class="s02-seg-item${flip ? ' active' : ''}" data-act="mode" data-mode="flip">${IC.flip(13, flip ? '#f6f3ea' : '#8c8570')}엎기</button>
          <button class="s02-seg-item${!flip ? ' active' : ''}" data-act="mode" data-mode="tap">${IC.tap(13, !flip ? '#f6f3ea' : '#8c8570')}탭</button>
        </div>
        <div class="s02-cta-wrap">
          <div class="s02-cta-ring"></div>
          <button class="s02-cta" data-act="start">${IC.play(17, '#f2eedd')}<span style="letter-spacing:-.01em">읽기 시작</span></button>
        </div>
      </div>
      <div class="s02-stats">
        <div class="s02-stat"><div class="mono s02-stat-v">32<span class="s02-stat-unit">분</span></div><div class="s02-stat-l">오늘</div></div>
        <div class="s02-stat-div"></div>
        <div class="s02-stat"><div class="mono s02-stat-v">7:26</div><div class="s02-stat-l">이번 주</div></div>
        <div class="s02-stat-div"></div>
        <div class="s02-stat"><div class="mono s02-stat-v" style="color:var(--terra)">12<span class="s02-stat-unit">일</span></div><div class="s02-stat-l">연속</div></div>
      </div>
      <div class="s02-cards">
        <button class="s02-card" data-act="nav" data-to="12">
          <div class="s02-card-head"><span>서재</span><span class="mono">14</span></div>
          <div class="s02-fan">
            <div class="s02-fan-b s02-fan-flow"><div class="s02-fan-spine"></div><div class="s02-fan-flow-t">몰입</div></div>
            <div class="s02-fan-b s02-fan-money"><div class="s02-fan-coin"></div></div>
            <div class="s02-fan-b s02-fan-focus"><div class="s02-fan-ellipse"></div></div>
          </div>
          <div class="s02-card-chev">${IC.chevR(10, '#8c8570')}</div>
        </button>
        <button class="s02-card" data-act="nav" data-to="10">
          <div class="s02-card-head"><span>기록</span><span class="mono">5월</span></div>
          <div class="s02-mini-bars">
            ${[38, 52, 30, 70, 44, 20, 55].map((h, i) => `<div style="height:${h}%${i === 3 ? ';background:#3a5c4b' : ''}"></div>`).join('')}
          </div>
          <div class="mono s02-card-cap">이번 주 7:26</div>
          <div class="s02-card-chev">${IC.chevR(10, '#8c8570')}</div>
        </button>
      </div>
      <div class="s02-recent-head"><span>최근 기록</span><button data-act="nav" data-to="10" style="font-weight:500;font-size:11.5px;color:var(--faint)">전체 보기</button></div>
      <div class="s02-recent-row" style="border-bottom:1px solid var(--hair2)">
        <div class="s02-recent-ic" style="background:var(--green-tint)">${IC.flip(14, '#2c4a3c')}</div>
        <div class="s02-recent-mid"><span class="mono">26분</span><span>몰입 · 엎기</span></div>
        <span class="mono s02-recent-when">오늘 14:14</span>
      </div>
      <div class="s02-recent-row">
        <div class="s02-recent-ic" style="background:var(--amber-tint)">${IC.monitor(14, '#b8862e')}</div>
        <div class="s02-recent-mid"><span class="mono">48분</span><span>도둑맞은 집중력 · 밀리 PC</span></div>
        <span class="mono s02-recent-when">오늘</span>
      </div>
    </div>
  </div>`;
}

/* ---------- 타이머 엔진 ---------- */
/* 데모 시드: 시안 데모 값(00:26:14 · 이 세션 26분 · 오늘 58분)과 일치시키기 위해
   세션 시작 시 26:14 경과로 시작. 이후 초는 실시간 증가. */
const DEMO_ELAPSED = 26 * 60 + 14;
let tickTimer = null;

function startSession(mode) {
  state.session = { mode, status: 'recording', elapsed: DEMO_ELAPSED, pauseCount: 0 };
}
function fmt2(n) { return String(n).padStart(2, '0'); }
function hmsParts(sec) {
  return [fmt2(Math.floor(sec / 3600)), fmt2(Math.floor(sec / 60) % 60), fmt2(sec % 60)];
}
function sessionMin() { return Math.floor((state.session ? state.session.elapsed : 0) / 60); }

function startTick() {
  stopTick();
  tickTimer = setInterval(() => {
    const s = state.session;
    if (!s || s.status !== 'recording') return;
    s.elapsed++;
    const [h, m, sec] = hmsParts(s.elapsed);
    const eh = document.getElementById('t-h'), em = document.getElementById('t-m'), es = document.getElementById('t-s');
    if (eh) { eh.textContent = h; em.textContent = m; es.textContent = sec; }
    const sm = document.getElementById('t-session-min');
    if (sm) sm.textContent = sessionMin() + '분';
  }, 1000);
}
function stopTick() { if (tickTimer) { clearInterval(tickTimer); tickTimer = null; } }

function togglePause() {
  const s = state.session;
  if (!s) return;
  if (s.status === 'recording') { s.status = 'paused'; s.pauseCount++; }
  else { s.status = 'recording'; state.justResumed = true; }
  render();
}

/* ---------- 공용 다크 요소 ---------- */
function darkBookChip() {
  return `<div class="sd-chip sd-chip-book"><div class="sd-chip-cover"><div class="sd-chip-spine"></div></div><span>몰입</span></div>`;
}
const pauseGlyph = (s, c) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="${c}"><rect x="7" y="5" width="3.4" height="14" rx="1.3"/><rect x="13.6" y="5" width="3.4" height="14" rx="1.3"/></svg>`;
const handIcon = (s, c, sw) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11.5V6a2 2 0 0 1 4 0v5"/><path d="M13 10a2 2 0 0 1 4 0v4.5a6 6 0 0 1-6 6h-.8a5 5 0 0 1-3.6-1.5l-3.3-3.4a1.9 1.9 0 0 1 2.7-2.6l1.5 1.4"/></svg>`;
const tapZoneIcon = handIcon(24, '#e2cf9e', 1.8);

function livePill() {
  return `<div class="sd-live-pill"><span class="sd-live-dot"></span><span>기록 중</span></div>`;
}
function pausedPill() {
  return `<div class="sd-paused-pill">${pauseGlyph(12, '#e8be78')}<span>일시정지됨</span></div>`;
}

/* ---------- 03 엎기 · 시작 대기 (다크) ---------- */
function renderFlipWait() {
  return `
  <div class="sd-root">
    <div class="sd-top">
      ${darkBookChip()}
      <button class="sd-pill" data-act="cancel-session"><span>취소</span></button>
    </div>
    <div class="s03-center">
      <button class="s03-stage" data-act="sim-flip" title="(프로토타입) 탭 = 엎기 시뮬레이션">
        <div class="s03-phone"><div class="s03-phone-notch"></div></div>
        <div class="s03-shadow"></div>
      </button>
      <div class="s03-title">폰을 엎어 주세요</div>
      <div class="mono s03-zero">00:00:00</div>
    </div>
    <div class="s03-bottom">
      <button class="sd-ghost-btn" data-act="switch-tap">${IC.tap(14, '#b9c4b4')}<span>탭 모드로 전환</span></button>
    </div>
  </div>`;
}

/* ---------- 04 엎기 · 일시정지/기록 (다크) ---------- */
function renderFlipTimer() {
  const s = state.session;
  const paused = !s || s.status === 'paused';
  const [h, m, sec] = hmsParts(s ? s.elapsed : 0);
  const pop = state.justResumed ? ' s04-pop' : '';
  state.justResumed = false;
  return `
  <div class="sd-root">
    ${paused ? '' : `
    <div class="s05-ripple" style="top:31%"></div>
    <div class="s05-ripple" style="top:31%;animation-delay:1.4s;border-color:rgba(226,207,158,.26)"></div>
    <div class="s05-ripple" style="top:31%;animation-delay:2.8s;border-color:rgba(226,207,158,.2)"></div>`}
    <div class="sd-top">
      ${darkBookChip()}
      ${paused ? pausedPill() : livePill()}
    </div>
    <div class="s04-center">
      <div class="s04-ring-stage">
        <svg width="150" height="150" viewBox="0 0 150 150" class="s04-ring${paused ? '' : ' still'}"><circle cx="75" cy="75" r="66" fill="none" stroke="rgba(232,190,120,.35)" stroke-width="2" stroke-dasharray="3 9" stroke-linecap="round"/></svg>
        <button class="s04-emblem${pop}" data-act="toggle-pause">
          ${paused
            ? `<svg width="30" height="30" viewBox="0 0 24 24" fill="#26413a" style="margin-left:4px"><path d="M8 5.5v13l11-6.5z"/></svg>`
            : pauseGlyph(30, '#26413a')}
        </button>
      </div>
      ${paused ? `<div class="s04-cap">탭하여 이어 읽기</div>` : ''}
      ${paused
        ? `<div class="mono s04-timer dim">${h}:${m}:${sec}</div>`
        : `<div class="mono s04-timer"><span id="t-h">${h}</span><span class="s04-colon tick">:</span><span id="t-m">${m}</span><span class="s04-colon tick">:</span><span id="t-s">${sec}</span></div>`}
      ${paused ? `
      <div class="s04-hint">
        <span class="s04-miniflip-wrap"><span class="s04-miniflip"></span></span>
        <span>다시 엎으면 이어서</span>
      </div>` : ''}
    </div>
    <div class="s04-bottom">
      <div class="s04-glass">
        <span class="s04-glass-l">이 세션</span><span class="mono s04-glass-v" id="t-session-min">${sessionMin()}분</span>
        <span class="s04-glass-div"></span>
        <span class="s04-glass-l">오늘 누적</span><span class="mono s04-glass-v">${DATA.stats.todayMin + sessionMin()}분</span>
      </div>
      <button class="s04-cta" data-act="end-session"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#26413a" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7"/></svg><span>여기까지 읽기</span></button>
    </div>
  </div>`;
}

/* ---------- 05 탭 모드 · 기록 중 (다크) ---------- */
function renderTapTimer() {
  const s = state.session;
  const paused = !s || s.status === 'paused';
  const [h, m, sec] = hmsParts(s ? s.elapsed : 0);
  return `
  <div class="sd-root">
    ${paused ? '' : `
    <div class="s05-ripple"></div>
    <div class="s05-ripple" style="animation-delay:1.4s;border-color:rgba(226,207,158,.26)"></div>
    <div class="s05-ripple" style="animation-delay:2.8s;border-color:rgba(226,207,158,.2)"></div>`}
    <div class="sd-top">
      <div class="sd-chip sd-chip-mode">${IC.tap(13, '#ddd8c2')}<span>탭 모드</span></div>
      <button class="sd-pill sd-pill-end" data-act="end-session"><span>종료</span></button>
    </div>
    <div class="s05-status">
      ${paused ? pausedPill() : livePill()}
      <div class="mono s05-timer${paused ? ' dim' : ''}"><span style="opacity:.4" id="t-h">${h}</span><span class="s05-colon1${paused ? '' : ' tick'}">:</span><span id="t-m">${m}</span><span class="s04-colon${paused ? '' : ' tick'}">:</span><span id="t-s">${sec}</span></div>
      <div class="s05-book">미하이 칙센트미하이, 《몰입》</div>
    </div>
    <button class="s05-zone${paused ? ' paused' : ''}" data-act="tap-zone">
      <div class="s05-zone-ic">${paused ? '' : '<span class="s05-zone-ring"></span>'}${tapZoneIcon}</div>
      <div class="s05-zone-label">${paused ? '탭하여 이어 읽기' : '화면을 탭하면 일시정지'}</div>
    </button>
    <div class="s05-dbl"><span class="mono">두 번 탭 = 종료</span></div>
  </div>`;
}

/* ---------- 06 세션 완료 ---------- */
function renderDone() {
  const s = state.session;
  const min = sessionMin();
  const sec = s ? s.elapsed % 60 : 0;
  const isFlip = !s || s.mode === 'flip';
  return `
  <div class="s06-root">
    <div class="s06-top">
      <div class="s06-check-stage">
        <div class="s06-check-ripple"></div>
        <div class="s06-check">
          <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="#f2eedd" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7" stroke-dasharray="30" class="s06-draw"/></svg>
        </div>
      </div>
      <div class="s06-label">기록됐어요</div>
      <div class="mono s06-time">${min}:${fmt2(sec)}</div>
      <div class="s06-chips">
        <span class="s06-chip s06-chip-method">${isFlip ? IC.flip(12, '#2c4a3c') : IC.tap(12, '#2c4a3c')}${isFlip ? '엎기 · 자동' : '탭'}</span>
        <span class="s06-chip s06-chip-book">몰입</span>
      </div>
    </div>
    <div class="s06-mid">
      <div class="s06-today-card">
        <div class="s06-today-head">
          <span>오늘의 리딩타임</span>
          <span class="mono s06-today-sum">${DATA.stats.todayMin}분 → <span class="s06-today-new">${DATA.stats.todayMin + min}분</span></span>
        </div>
        <div class="s06-bar">
          <div class="s06-bar-old"></div>
          <div class="s06-bar-new"></div>
          <div class="s06-bar-chip-wrap"><span class="mono s06-bar-chip">+${min}분</span></div>
        </div>
        <div class="s06-axis"><span class="mono">0분</span><span class="mono">1시간</span></div>
      </div>
      <div class="s06-ledger">
        <div class="s06-row"><span>시작</span><span class="mono">14:14</span></div>
        <div class="s06-row"><span>종료</span><span class="mono">14:40</span></div>
        <div class="s06-row"><span>일시정지</span><span class="mono">2회 · 3분</span></div>
      </div>
    </div>
    <div class="s06-bottom">
      <button class="s06-save" data-act="save-session"><span>저장하기</span></button>
      <button class="s06-delete" data-act="delete-session">이 기록 삭제</button>
    </div>
  </div>`;
}

/* ---------- 08 책 상세 ---------- */
const DETAIL_LOG = [
  { min: 26, method: 'flip', label: '엎기 · 14:14', when: '오늘', today: true },
  { min: 41, method: 'flip', label: '엎기 · 21:40', when: '5.20' },
  { min: 33, method: 'tap', label: '탭 · 08:32', when: '5.19' },
  { min: 28, method: 'manual', label: '직접 추가', when: '5.18' },
  { min: 19, method: 'flip', label: '엎기 · 22:05', when: '5.17' },
];

function methodTile(method) {
  if (method === 'flip') return `<div class="s08-tile" style="background:var(--green-tint)">${IC.flip(15, '#2c4a3c')}</div>`;
  if (method === 'tap') return `<div class="s08-tile" style="background:var(--seg-bg)">${handIcon(15, '#8c8570', 2)}</div>`;
  return `<div class="s08-tile" style="background:var(--seg-bg)">${IC.clock(15, '#8c8570')}</div>`;
}

function renderDetail() {
  return `
  <div class="s08-root">
    <div class="s08-header">
      <button class="s08-hbtn" data-act="nav" data-to="12">${IC.back(17, '#3f3a2d')}</button>
      <button class="s08-hbtn" data-act="sheet" data-sheet="bookmenu">${IC.dots}</button>
    </div>
    <div class="s08-body">
      <div class="s08-top">
        <div class="cover-flow s08-cover">
          <div class="cover-spine"></div>
          <div class="s08-cover-frame"></div>
          <div class="cover-flow-in" style="padding:15px 8px 11px">
            <div class="mono s08-au-en">MIHALY CSIKSZENTMIHALYI</div>
            <div class="s08-cover-t">몰입</div>
            <div class="mono s08-cover-f">FLOW</div>
            <div style="flex:1"></div>
            <div class="s08-rule"></div>
            <div class="s08-au">미하이 칙센트미하이</div>
          </div>
        </div>
        <div class="s08-info">
          <span class="live-chip s08-chip"><span class="live-dot" style="width:5px;height:5px"></span>읽는 중</span>
          <div class="s08-title">몰입</div>
          <div class="s08-meta">미하이 칙센트미하이 · 한울림</div>
          <div class="s08-total"><span class="mono">4:12</span><span class="mono">누적 · 8회 · 18일째</span></div>
        </div>
      </div>
      <div class="s08-ctas">
        <button class="s08-cta-main" data-act="continue-reading">${IC.play(16, '#f2eedd')}<span>이어서 읽기</span></button>
        <button class="s08-cta-finish" data-act="sheet" data-sheet="finish">${IC.check(15, '#2c4a3c', 2.4)}<span>완독</span></button>
      </div>
      <div class="s08-log-head"><span>기록</span><button data-act="sheet" data-sheet="addtime" class="s08-addtime">${IC.clock(12, '#8c8570')}직접 추가</button></div>
      ${DETAIL_LOG.map((r, i) => `
      <div class="s08-row${i === DETAIL_LOG.length - 1 ? ' last' : ''}">
        ${methodTile(r.method)}
        <div class="s08-row-mid"><span class="mono">${r.min}분</span><span>${r.label}</span></div>
        ${r.today ? `<span class="s08-today">오늘</span>` : `<span class="mono s08-date">${r.when}</span>`}
      </div>`).join('')}
    </div>
  </div>`;
}

/* ⋯ 메뉴 (시안 외 — 스펙 "⋯ 메뉴(책 삭제 등)", 07 시트 문법) */
function sheetBookMenu() {
  return `
  <div class="sheet sh07">
    <div class="sheet-handle"></div>
    <div class="sheet-head"><span>몰입</span>${closeBtn}</div>
    <button class="sh-logout" data-act="delete-book">책 삭제</button>
  </div>`;
}

/* ---------- 10 기록 · 주간 ---------- */
const WEEK = [
  { d: '월', date: '5.18', v: 38, h: 47 },
  { d: '화', date: '5.19', v: 52, h: 64 },
  { d: '수', date: '5.20', v: 30, h: 37 },
  { d: '목', date: '5.21', v: 68, h: 84, today: true },
  { d: '금', date: '5.22', v: 44, h: 54 },
  { d: '토', date: '5.23', v: 21, h: 26 },
  { d: '일', date: '5.24', v: 55, h: 68, sun: true },
];

function statsHeader(view) {
  return `
  <div class="s10-header">
    <div class="s10-hleft"><button class="s08-hbtn" data-act="nav" data-to="02">${IC.back(17, '#3f3a2d')}</button><span>기록</span></div>
    <div class="s10-seg">
      <button class="s10-seg-item${view === 'w' ? ' active' : ''}" data-act="nav" data-to="10">주</button>
      <button class="s10-seg-item${view === 'm' ? ' active' : ''}" data-act="nav" data-to="11">월</button>
    </div>
  </div>`;
}

function weekPopover(idx, instant) {
  const w = WEEK[idx];
  const flow = Math.round(w.v * 0.68);
  const money = w.v - flow;
  const left = ((idx + 0.5) / 7 * 100).toFixed(2);
  return `
  <div class="s10-tip" style="left:${left}%;animation-delay:${instant ? '0s' : '1.05s'}">
    <div class="s10-tip-card">
      <div class="mono s10-tip-date">${w.date} ${w.d} · ${w.v}분</div>
      <div class="s10-tip-row"><span class="s10-tip-dot" style="background:#d8c184"></span><span>몰입</span><span class="mono">${flow}분</span></div>
      <div class="s10-tip-row"><span class="s10-tip-dot" style="background:#3d5575"></span><span>돈의 심리학</span><span class="mono">${money}분</span></div>
    </div>
    <div class="s10-tip-conn"></div>
  </div>`;
}

function renderStatsWeek() {
  const sel = state.weekSel === undefined ? 3 : state.weekSel;
  return `
  <div class="s10-root">
    ${statsHeader('w')}
    <div class="s10-body">
      <div class="mono s10-period">5.15 – 5.21</div>
      <div class="s10-headline">이번 주 <span class="mono">7</span>시간 <span class="mono">26</span>분</div>
      <div class="s10-delta">
        <span class="s10-delta-chip"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#2c4a3c" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M6 11l6-6 6 6"/></svg>52분</span>
        <span class="mono s10-delta-vs">vs 지난주</span>
      </div>
      <div class="s10-chart-card">
        <div class="s10-chart" id="s10-chart">
          ${weekPopover(sel, false)}
          <div class="s10-bars">
            ${WEEK.map((w, i) => `
            <button class="s10-col" data-act="week-sel" data-i="${i}">
              <span class="mono s10-val${w.today ? ' today' : ''}">${w.v}</span>
              <div class="s10-bar${w.today ? ' today' : ''}" style="height:${w.h}px;animation-delay:${(i * .06).toFixed(2)}s"></div>
              <span class="mono s10-day${w.today ? ' today' : ''}${w.sun ? ' sun' : ''}">${w.d}</span>
            </button>`).join('')}
          </div>
        </div>
      </div>
      <div class="s10-millie">
        <div class="s10-millie-ic">${IC.monitor(15, '#b8862e')}<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#b8862e" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" class="s10-sync"><path d="M21 12a9 9 0 1 1-3-6.7M21 4v5h-5"/></svg></div>
        <div class="s10-millie-mid"><span>밀리의서재</span><span class="mono">오늘 07:00 동기화</span></div>
        <span class="mono s10-millie-r">PC 1:12 · 모바일 0:26</span>
      </div>
      <div class="s10-duo">
        <div class="s10-card">
          <div class="s10-streak-head"><span class="mono">12</span><span>일 연속</span></div>
          <div class="s10-streak-dots">
            ${['#eee7d4', '#eee7d4', '#dd9c8b', '#dd9c8b', '#d67d63', '#d67d63', '#d67d63', '#cd6647', '#cd6647', '#cd6647', '#c2553a', '#c2553a', '#c2553a'].map(c => `<span style="background:${c}"></span>`).join('')}
            <span class="last" style="background:#c2553a"></span>
          </div>
        </div>
        <div class="s10-card">
          <div class="s10-time-head">주로 밤 9–11시</div>
          <div class="s10-spectrum">
            <div class="s10-spec-soft"></div>
            <div class="s10-spec-hot"></div>
          </div>
          <div class="s10-spec-axis"><span class="mono">06</span><span class="mono">12</span><span class="mono">18</span><span class="mono">24</span></div>
        </div>
      </div>
      <div class="s10-rank-label">이번 주 많이 읽은 책</div>
      <div class="s10-rank-row">
        <div class="s10-rank-cover" style="background:linear-gradient(168deg,#eee1bc,#e3d09e)"><div class="s10-rank-spine"></div><div class="s10-rank-flow-t">몰입</div></div>
        <div class="s10-rank-mid"><div>몰입</div><div class="s10-rank-bar"><div style="width:100%;background:#d8c184;animation-delay:.2s"></div></div></div>
        <span class="mono s10-rank-v">4:12</span>
      </div>
      <div class="s10-rank-row">
        <div class="s10-rank-cover" style="background:#1f2d45"><div class="s10-rank-coin"></div></div>
        <div class="s10-rank-mid"><div>돈의 심리학</div><div class="s10-rank-bar"><div style="width:42%;background:#1f2d45;animation-delay:.35s"></div></div></div>
        <span class="mono s10-rank-v">1:36</span>
      </div>
      <div class="s10-rank-row">
        <div class="s10-rank-cover" style="background:#e4572e"><div class="s10-rank-ellipse"></div></div>
        <div class="s10-rank-mid"><div>도둑맞은 집중력 <span class="mono s10-rank-tag">밀리</span></div><div class="s10-rank-bar"><div style="width:33%;background:#e4572e;animation-delay:.5s"></div></div></div>
        <span class="mono s10-rank-v">1:38</span>
      </div>
    </div>
  </div>`;
}

/* ---------- 11 기록 · 월간 ---------- */
/* 시안 렌더 DOM에서 추출한 5월 캘린더 (표지 = 그날 가장 읽은 책) */
const CAL_COVERS = { farewell: '#e3e4da', money: '#1f2d45', flow: '#e5d5a8', focus: '#e4572e' };
const CAL = (() => {
  const cover = d =>
    d <= 6 ? 'farewell' : d === 8 ? 'money' :
    (d >= 10 && d <= 14) || (d >= 17 && d <= 21) ? 'flow' :
    d === 15 || d === 16 ? 'focus' : null;
  const cells = Array.from({ length: 4 }, () => null);
  for (let d = 1; d <= 31; d++) cells.push({ d, cover: cover(d), dot: d === 6, today: d === 21, future: d >= 22 });
  return cells;
})();

function renderStatsMonth() {
  const sundayIdx = new Set([6, 13, 20, 27, 34]);
  return `
  <div class="s10-root">
    ${statsHeader('m')}
    <div class="s11-body">
      <div class="s11-month-row">
        <h1>2026년 5월</h1>
        <div class="s11-month-nav">
          <button class="s11-mbtn">${IC.back(13, '#8c8570')}</button>
          <button class="s11-mbtn"><svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="#8c8570" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 4l6 6-6 6"/></svg></button>
        </div>
      </div>
      <div class="s11-summary">
        <span class="mono s11-total">21:08</span><span>총 시간</span>
        <span class="s11-dot"></span>
        <span><span class="mono s11-readdays">17</span> / 21일 읽음</span>
        <span class="s11-dot"></span>
        <span>밀리 포함</span>
      </div>
      <div class="s11-dow">
        ${['월', '화', '수', '목', '금', '토'].map(d => `<span class="mono">${d}</span>`).join('')}<span class="mono" style="color:var(--terra)">일</span>
      </div>
      <div class="s11-grid">
        ${CAL.map((c, i) => {
          if (!c) return '<div class="s11-cell"><span class="mono" style="font-weight:500;color:var(--faint)"></span></div>';
          const sun = sundayIdx.has(i);
          const nc = c.today ? 'var(--terra)' : c.future ? (sun ? '#e2bbac' : '#cfc7b1') : sun ? 'var(--terra)' : 'var(--muted)';
          const ring = c.today ? 'box-shadow:0 0 0 2px #c2553a, 0 2px 4px -1px rgba(58,44,28,.25)' : 'box-shadow:0 2px 4px -1px rgba(58,44,28,.25)';
          return `
          <div class="s11-cell">
            <span class="mono" style="font-weight:${c.today ? 700 : 500};color:${nc}">${c.d}</span>
            ${c.cover ? `<div class="s11-cover" style="background:${CAL_COVERS[c.cover]};${ring}"><div class="s11-spine"></div></div>` : ''}
            ${c.dot ? '<span class="s11-fin"></span>' : ''}
          </div>`;
        }).join('')}
      </div>
    </div>
  </div>`;
}

/* ---------- 12 서재 ---------- */
const FINISHED = [
  { key: 'money', title: '돈의 심리학', rating: 4 },
  { key: 'farewell', title: '작별하지 않는다', rating: 5 },
  { key: 'trend', title: '트렌드 코리아 2026', rating: 3 },
  { key: 'light', title: '우리가 빛의 속도로 갈 수 없다면', rating: 5 },
  { key: 'same', title: '불변의 법칙', rating: 4 },
  { key: 'focus', title: '도둑맞은 집중력', rating: 3 },
];

const GRID_COVERS = {
  money: `<div class="g-cover" style="background:#1f2d45"><div class="g-spine" style="background:rgba(0,0,0,.24)"></div><div class="g-in" style="align-items:center;padding:12px 8px 9px"><div class="g-money-coin"></div><div style="margin-top:9px;font-weight:800;font-size:12.5px;color:#fff">돈의 심리학</div><div class="mono" style="margin-top:4px;font-size:4.5px;letter-spacing:.16em;color:#d3b46a">THE PSYCHOLOGY OF MONEY</div><div style="flex:1"></div><div style="font-size:6.5px;font-weight:600;color:#92a3bd">모건 하우절</div></div></div>`,
  farewell: `<div class="g-cover" style="background:#e9eae2"><div class="g-spine" style="background:rgba(0,0,0,.12)"></div><div class="g-farewell-band"></div><div class="g-in" style="padding:13px 10px"><div style="font-weight:800;font-size:12.5px;color:#263832;line-height:1.35">작별하지<br>않는다</div><div style="flex:1"></div><div style="font-size:7px;font-weight:600;color:#58685f">한강 장편소설</div></div></div>`,
  trend: `<div class="g-cover" style="background:#c13a2c"><div class="g-spine" style="background:rgba(0,0,0,.2)"></div><div class="g-in" style="align-items:center;padding:12px 8px 9px"><div class="mono" style="font-weight:700;font-size:8px;letter-spacing:.08em;color:#f6e9de;line-height:1.3;text-align:center">TREND<br>KOREA</div><div class="mono" style="margin-top:7px;font-weight:700;font-size:19px;color:#fff;letter-spacing:-.02em">2026</div><div style="flex:1"></div><div style="font-size:6.5px;font-weight:600;color:#f2cdc2">김난도 외</div></div></div>`,
  light: `<div class="g-cover" style="background:linear-gradient(165deg,#463a75 0%,#191238 70%)"><div class="g-spine" style="background:rgba(0,0,0,.28)"></div><div class="g-light-stars"></div><div class="g-in" style="padding:14px 10px"><div style="font-weight:700;font-size:9.5px;color:#efeaff;line-height:1.45">우리가 빛의<br>속도로 갈 수<br>없다면</div><div style="flex:1"></div><div style="font-size:6.5px;font-weight:600;color:#a99fd6">김초엽 소설</div></div></div>`,
  same: `<div class="g-cover" style="background:#232e3a"><div class="g-spine" style="background:rgba(0,0,0,.26)"></div><div class="g-same-frame"></div><div class="g-in" style="align-items:center;padding:16px 8px 12px"><div class="mono" style="font-size:4.5px;letter-spacing:.3em;color:#8fa0b5">SAME AS EVER</div><div style="margin-top:12px;font-weight:800;font-size:13px;color:#e7ca82">불변의 법칙</div><div style="flex:1"></div><div style="font-size:6.5px;font-weight:600;color:#8fa0b5">모건 하우절</div></div></div>`,
  focus: `<div class="g-cover" style="background:#e4572e"><div class="g-spine" style="background:rgba(0,0,0,.2)"></div><div class="g-focus-ellipse"></div><div class="g-in" style="align-items:center;padding:26px 8px 10px"><div style="font-weight:900;font-size:11px;color:#1c140e;line-height:1.3;text-align:center">도둑맞은<br>집중력</div><div style="flex:1"></div><div style="font-size:6.5px;font-weight:600;color:#f6d9cb">요한 하리</div></div></div>`,
};

const SORT_LABELS = { recent: '최근순', name: '이름순', rating: '별점순' };

function sortedFinished() {
  const list = [...FINISHED];
  if (state.librarySort === 'name') list.sort((a, b) => a.title.localeCompare(b.title, 'ko'));
  else if (state.librarySort === 'rating') list.sort((a, b) => b.rating - a.rating);
  return list;
}

function renderLibrary() {
  const filter = state.libraryFilter || 'all';
  const stars = n => `<div class="g-stars"><span style="color:#c9973b">${'★'.repeat(n)}</span><span style="color:#ddd6c3">${'★'.repeat(5 - n)}</span></div>`;
  return `
  <div class="s12-root">
    <div class="s12-header">
      <div class="s10-hleft"><button class="s08-hbtn" data-act="nav" data-to="02">${IC.back(17, '#3f3a2d')}</button><span>서재</span><span class="mono s12-count">14</span></div>
      <button class="s12-add" data-act="sheet" data-sheet="addbook">${IC.plus(17, '#f2eedd', 2.6)}</button>
    </div>
    <div class="s12-body">
      <div class="s12-search">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a59d87" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/></svg>
        <span>내 책 · 저자 검색</span>
      </div>
      <div class="s12-toolbar">
        <div class="s12-filter">
          ${[['all', '전체'], ['reading', '읽는 중'], ['finished', '완독']].map(([k, l]) =>
            `<button class="s12-filter-item${filter === k ? ' active' : ''}" data-act="lib-filter" data-f="${k}">${l}</button>`).join('')}
        </div>
        <button class="s12-sort" data-act="sheet" data-sheet="sort">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#8c8570" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4v13M7 17l-3-3M7 17l3-3M17 20V7M17 7l-3 3M17 7l3 3"/></svg>
          <span>${SORT_LABELS[state.librarySort || 'recent']}</span>
        </button>
      </div>
      ${filter !== 'finished' ? `
      <div class="mono s12-sec">읽는 중</div>
      <div class="s12-reading" data-act="nav" data-to="08">
        <div class="s12-r-cover">
          <div class="s12-r-spine"></div><div class="s12-r-frame"></div>
          <div class="s12-r-in"><div>몰입</div><div class="mono">FLOW</div></div>
        </div>
        <div class="s12-r-mid">
          <div>몰입</div>
          <div>미하이 칙센트미하이</div>
          <div class="mono">4:12 · 8회 · 18일째</div>
        </div>
        <button class="s12-r-play" data-act="start">${IC.play(15, '#f2eedd')}</button>
      </div>` : ''}
      ${filter !== 'reading' ? `
      <div class="mono s12-sec" style="margin:20px 0 12px 2px">완독 <span style="color:var(--ghost)">13</span></div>
      <div class="s12-grid">
        ${sortedFinished().map((b, i) => `
        <div class="s12-g-item" style="animation-delay:${(.05 + i * .05).toFixed(2)}s">
          ${GRID_COVERS[b.key]}
          ${stars(b.rating)}
        </div>`).join('')}
      </div>` : ''}
    </div>
  </div>`;
}

/* 정렬 옵션 시트 (시안 외 스펙 — 07 시트 문법: 최근순/이름순/별점순) */
function sheetSort() {
  const cur = state.librarySort || 'recent';
  return `
  <div class="sheet sh07">
    <div class="sheet-handle"></div>
    <div class="sheet-head"><span>정렬</span>${closeBtn}</div>
    <div style="margin-top:18px">
      ${Object.entries(SORT_LABELS).map(([k, l]) => `
      <button class="s12-sort-row" data-act="lib-sort" data-s="${k}">
        <span>${l}</span>
        ${cur === k ? IC.check(15, '#2c4a3c', 2.4) : ''}
      </button>`).join('')}
    </div>
  </div>`;
}

/* ---------- 14 홈 · 빈 상태 ---------- */
function renderEmptyHome() {
  return `
  <div class="s02-root">
    <div class="s02-header">
      <div class="s02-brand"><div class="s02-brand-logo">${IC.logo(19, 2)}</div><span>리딩타임</span></div>
      <div class="s02-hactions">
        <button class="s02-avatar" data-act="sheet" data-sheet="settings">${DATA.user.initial}</button>
      </div>
    </div>
    <div class="s14-body">
      <div class="s14-hero">
        <div class="s14-hero-row">
          <div class="s14-cover-slot">${IC.plus(26, '#cfc7b0', 1.8)}</div>
          <div class="s14-hero-txt">무슨 책부터<br>시작해 볼까요?</div>
        </div>
        <div class="s02-cta-wrap">
          <div class="s02-cta-ring" style="border-radius:16px"></div>
          <button class="s02-cta" style="border-radius:16px" data-act="sheet" data-sheet="addbook">${IC.plus(17, '#f2eedd', 2.6)}<span style="font-size:15.5px">첫 책 추가하기</span></button>
        </div>
      </div>
      <div class="s02-stats s14-stats">
        <div class="s02-stat"><div class="mono s02-stat-v">0<span class="s02-stat-unit">분</span></div><div class="s02-stat-l">오늘</div></div>
        <div class="s02-stat-div"></div>
        <div class="s02-stat"><div class="mono s02-stat-v">0:00</div><div class="s02-stat-l">이번 주</div></div>
        <div class="s02-stat-div"></div>
        <div class="s02-stat"><div class="mono s02-stat-v">—</div><div class="s02-stat-l">연속</div></div>
      </div>
      <div class="s14-shelf">
        <div class="s14-shelf-books">
          <div class="s14-ghost" style="height:64px"></div>
          <div class="s14-ghost" style="height:76px"></div>
          <div class="s14-ghost" style="height:68px"></div>
        </div>
        <div class="s14-shelf-line"></div>
      </div>
    </div>
  </div>`;
}

/* ---------- 화면 테이블 ---------- */
const SCREENS = {
  '01': renderLogin,
  '02': renderHome,
  '03': renderFlipWait,
  '04': renderFlipTimer,
  '05': renderTapTimer,
  '06': renderDone,
  '08': renderDetail,
  '10': renderStatsWeek,
  '11': renderStatsMonth,
  '12': renderLibrary,
  '14': renderEmptyHome,
};
/* 팝오버 카드가 차트 밖으로 넘치지 않게 카드만 클램프 (커넥터는 바 중심 유지) */
function clampWeekTip() {
  const chart = document.getElementById('s10-chart');
  const card = chart && chart.querySelector('.s10-tip-card');
  if (!card) return;
  const tip = chart.querySelector('.s10-tip');
  const center = parseFloat(tip.style.left) / 100 * chart.clientWidth;
  const half = card.offsetWidth / 2;
  const shift = Math.max(0, half - center) - Math.max(0, center + half - chart.clientWidth);
  card.style.transform = shift ? `translateX(${shift}px)` : '';
}

const AFTER_RENDER = { '10': clampWeekTip };

/* ---------- 이벤트 위임 ---------- */
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-act]');
  if (!t) return;
  const act = t.dataset.act;
  if (act === 'login') nav('02');
  else if (act === 'nav') nav(t.dataset.to);
  else if (act === 'sheet') openSheet(t.dataset.sheet);
  else if (act === 'mode') { state.mode = t.dataset.mode; render(); }
  else if (act === 'start') {
    if (state.mode === 'flip') nav('03');
    else { startSession('tap'); nav('05'); }
  }
  else if (act === 'cancel-session') { state.session = null; nav('02'); }
  else if (act === 'sim-flip') { startSession('flip'); nav('04'); }
  else if (act === 'switch-tap') { state.mode = 'tap'; startSession('tap'); nav('05'); }
  else if (act === 'toggle-pause') togglePause();
  else if (act === 'end-session') endSession();
  else if (act === 'tap-zone') handleTapZone();
  else if (act === 'save-session' || act === 'delete-session') { state.session = null; nav('02'); }
  else if (act === 'close-sheet') closeSheet();
  else if (act === 'step') {
    state.addtime.value = Math.max(5, state.addtime.value + Number(t.dataset.d));
    state.addtime.preset = null;
    renderSheet();
  }
  else if (act === 'preset') {
    state.addtime.value += Number(t.dataset.n);
    state.addtime.preset = Number(t.dataset.n);
    renderSheet();
  }
  else if (act === 'add-time') { state.addtime = { value: 35, preset: 15 }; closeSheet(); }
  else if (act === 'rate') { state.rating = Number(t.dataset.n); renderSheet(); }
  else if (act === 'save-finished') { closeSheet(); nav('12'); }
  else if (act === 'toggle-add') {
    state.added[t.dataset.key] = !state.added[t.dataset.key];
    renderSheet();
  }
  else if (act === 'logout') { closeSheet(); nav('01'); }
  else if (act === 'continue-reading') {
    if (state.mode === 'flip') nav('03');
    else { startSession('tap'); nav('05'); }
  }
  else if (act === 'delete-book') { closeSheet(); nav('12'); }
  else if (act === 'lib-filter') { state.libraryFilter = t.dataset.f; render(); }
  else if (act === 'lib-sort') { state.librarySort = t.dataset.s; closeSheet(); render(); }
  else if (act === 'week-sel') {
    state.weekSel = Number(t.dataset.i);
    const chart = document.getElementById('s10-chart');
    const old = chart.querySelector('.s10-tip');
    if (old) old.remove();
    chart.insertAdjacentHTML('afterbegin', weekPopover(state.weekSel, true));
    clampWeekTip();
  }
});

/* ---------- 바텀시트 (07 · 09 · 13 · 설정) ---------- */
const RATING_LABELS = { 1: '아쉬웠어요', 2: '그저 그랬어요', 3: '좋았어요', 4: '아주 좋았어요', 5: '최고였어요' }; // 4★=시안 확정, 나머지 임시

function openSheet(name) {
  state.sheet = name;
  renderSheet();
}
function closeSheet() {
  state.sheet = null;
  renderSheet();
}

function renderSheet() {
  const name = state.sheet;
  sheetEl.classList.toggle('open', !!name);
  if (!name) { sheetEl.innerHTML = ''; return; }
  const dim = name === 'finish'
    ? '<div class="sheet-dim" style="background:#191510;opacity:.42" data-act="close-sheet"></div>'
    : '<div class="sheet-dim" data-act="close-sheet"></div>';
  sheetEl.innerHTML = dim + SHEETS[name]();
}

const closeBtn = `<button class="sheet-close" data-act="close-sheet"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8c8570" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>`;
const chev712 = `<svg width="7" height="12" viewBox="0 0 9 16" fill="none" stroke="#c4bca6" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 1l6 7-6 7"/></svg>`;

/* 07 시간 직접 추가 */
function sheetAddTime() {
  const { value, preset } = state.addtime;
  return `
  <div class="sheet sh07">
    <div class="sheet-handle"></div>
    <div class="sheet-head"><span>시간 직접 추가</span>${closeBtn}</div>
    <div class="sh07-book">
      <div class="sh07-book-cover"><div class="sh07-book-spine"></div><div class="sh07-book-t">몰입</div></div>
      <div class="sh07-book-mid"><div>몰입</div><div>미하이 칙센트미하이</div></div>
      ${chev712}
    </div>
    <div class="sh07-stepper">
      <button class="sh07-step sh07-minus" data-act="step" data-d="-5"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3f3a2d" stroke-width="2.4" stroke-linecap="round"><path d="M5 12h14"/></svg></button>
      <div class="sh07-value"><span class="mono" id="sh07-num">${value}</span><span class="sh07-unit">분</span></div>
      <button class="sh07-step sh07-plus" data-act="step" data-d="5">${IC.plus(16, '#f2eedd', 2.4)}</button>
    </div>
    <div class="sh07-presets">
      ${[5, 10, 15, 30].map(n => `<button class="mono sh07-preset${preset === n ? ' sel' : ''}" data-act="preset" data-n="${n}">+${n}</button>`).join('')}
    </div>
    <div class="sh07-when"><span>일시</span><span class="sh07-when-r"><span class="mono">오늘 · 14:14</span>${chev712}</span></div>
    <button class="sheet-cta" data-act="add-time"><span>${value}분 추가하기</span></button>
  </div>`;
}

/* 09 완독 · 별점 */
function sheetFinish() {
  const r = state.rating;
  const star = (filled, i) => `<button data-act="rate" data-n="${i + 1}" style="display:flex">${filled
    ? `<svg width="34" height="34" viewBox="0 0 24 24" fill="#c9973b" stroke="#b3841f" stroke-width="1" stroke-linejoin="round" class="sh09-star" style="animation-delay:${i * .08}s"><path d="M12 2.6l2.85 5.98 6.55.86-4.8 4.55 1.2 6.5L12 18.2l-5.8 3.29 1.2-6.5-4.8-4.55 6.55-.86z"/></svg>`
    : `<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#d8d2c1" stroke-width="1.6" stroke-linejoin="round"><path d="M12 2.6l2.85 5.98 6.55.86-4.8 4.55 1.2 6.5L12 18.2l-5.8 3.29 1.2-6.5-4.8-4.55 6.55-.86z"/></svg>`}</button>`;
  return `
  <div class="sheet sh09">
    <div class="sheet-handle" style="margin-bottom:20px"></div>
    <div class="sh09-top">
      <div class="sh09-cover-stage">
        <div class="sh09-ripple"></div>
        <div class="sh09-cover">
          <div class="cover-spine" style="background:linear-gradient(90deg,rgba(0,0,0,.16),transparent)"></div>
          <div class="cover-flow-frame"></div>
          <div class="sh09-cover-in"><div class="sh09-cover-t">몰입</div><div class="mono sh09-cover-f">FLOW</div></div>
        </div>
        <div class="sh09-badge"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f2eedd" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7"/></svg></div>
      </div>
      <div class="sh09-title">다 읽었어요</div>
      <div class="sh09-sub">몰입 · 미하이 칙센트미하이 · 18일 동안</div>
    </div>
    <div class="sh09-rate">
      <div class="sh09-q">이 책, 어떠셨나요?</div>
      <div class="sh09-stars">${[0, 1, 2, 3, 4].map(i => star(i < r, i)).join('')}</div>
      <div class="sh09-label">${RATING_LABELS[r]}</div>
    </div>
    <div class="sh09-tiles">
      <div class="sh09-tile"><div class="mono">4:12</div><div>총 시간</div></div>
      <div class="sh09-tile"><div class="mono">8<span>회</span></div><div>세션</div></div>
      <div class="sh09-tile"><div class="mono">18<span>일</span></div><div>함께한 기간</div></div>
    </div>
    <button class="sheet-cta" style="margin-top:16px" data-act="save-finished"><span style="font-size:15.5px">완독으로 저장</span></button>
  </div>`;
}

/* 13 책 추가 (검색 시트) */
const SEARCH_ROWS = [
  { key: 'flow', title: '몰입', meta: '미하이 칙센트미하이 · 한울림' },
  { key: 'farewell', title: '작별하지 않는다', meta: '한강 · 문학동네' },
  { key: 'money', title: '돈의 심리학', meta: '모건 하우절 · 인플루엔셜' },
  { key: 'light', title: '우리가 빛의 속도로 갈 수 없다면', meta: '김초엽 · 허블' },
  { key: 'trend', title: '트렌드 코리아 2026', meta: '김난도 외 · 미래의창' },
];
const SEARCH_COVERS = {
  flow: `<div class="sc-cover sc-flow"><div class="sc-spine"></div><div class="sc-flow-frame"></div><div class="sc-flow-in"><div>몰입</div><div class="mono">FLOW</div></div></div>`,
  farewell: `<div class="sc-cover sc-farewell"><div class="sc-spine" style="background:rgba(0,0,0,.12)"></div><div class="sc-farewell-band"></div><div class="sc-farewell-t">작별하지<br>않는다</div></div>`,
  money: `<div class="sc-cover sc-money"><div class="sc-spine" style="background:rgba(0,0,0,.24)"></div><div class="sc-money-in"><div class="sc-money-coin"></div><div>돈의 심리학</div></div></div>`,
  light: `<div class="sc-cover sc-light"><div class="sc-spine" style="background:rgba(0,0,0,.26)"></div><div class="sc-light-stars"></div><div class="sc-light-t">우리가 빛의<br>속도로 갈 수<br>없다면</div></div>`,
  trend: `<div class="sc-cover sc-trend"><div class="sc-spine" style="background:rgba(0,0,0,.2)"></div><div class="sc-trend-in"><div class="mono">TREND<br>KOREA</div><div class="mono sc-trend-y">2026</div></div></div>`,
};
function sheetAddBook() {
  return `
  <div class="sheet sh13">
    <div class="sh13-handle-wrap"><div class="sheet-handle" style="margin:0"></div></div>
    <div class="sh13-head"><span>책 추가</span>${closeBtn}</div>
    <div class="sh13-search-wrap">
      <div class="sh13-search">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8c8570" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/></svg>
        <span>몰입</span>
        <span class="sh13-caret"></span>
      </div>
      <div class="mono sh13-count">검색 결과 · 32건</div>
    </div>
    <div class="sh13-list">
      ${SEARCH_ROWS.map(rw => {
        const added = !!state.added[rw.key];
        return `
        <div class="sh13-row${added ? ' added' : ''}">
          ${SEARCH_COVERS[rw.key]}
          <div class="sh13-row-mid"><div>${rw.title}</div><div>${rw.meta}</div></div>
          <button class="sh13-btn${added ? ' on' : ''}" data-act="toggle-add" data-key="${rw.key}">
            ${added
              ? `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#f2eedd" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7"/></svg>`
              : IC.plus(15, '#8c8570', 2.6)}
          </button>
        </div>`;
      }).join('')}
    </div>
  </div>`;
}

/* 설정 (시안 외 스펙 — 07 시트 문법: 이름 수정 / 밀리 연동 / 로그아웃) */
function sheetSettings() {
  return `
  <div class="sheet sh07">
    <div class="sheet-handle"></div>
    <div class="sheet-head"><span>설정</span>${closeBtn}</div>
    <div class="sh07-when" style="margin-top:18px"><span>이름</span><span class="sh07-when-r"><span class="mono">지훈</span>${chev712}</span></div>
    <div class="sh07-when"><span>밀리의서재</span><span class="sh07-when-r"><span class="mono" style="color:var(--green)">연결됨</span>${chev712}</span></div>
    <button class="sh-logout" data-act="logout">로그아웃</button>
  </div>`;
}

const SHEETS = { addtime: sheetAddTime, finish: sheetFinish, addbook: sheetAddBook, settings: sheetSettings, bookmenu: sheetBookMenu, sort: sheetSort };

function endSession() {
  if (state.session) state.session.status = 'paused';
  nav('06');
}

/* 탭 존: 단일 탭 = 일시정지/재개, 더블 탭 = 종료 (~250ms 디바운스) */
let tapZoneTimer = null;
function handleTapZone() {
  if (tapZoneTimer) {
    clearTimeout(tapZoneTimer);
    tapZoneTimer = null;
    endSession();
    return;
  }
  tapZoneTimer = setTimeout(() => {
    tapZoneTimer = null;
    togglePause();
  }, 250);
}

/* ---------- 해시 라우팅 (직접 접근용) ---------- */
function syncFromHash() {
  const m = location.hash.match(/^#\/(\d{2})$/);
  if (m) {
    const route = SHEET_ROUTES[m[1]];
    if (route) {
      state.screen = route.base;
      render();
      openSheet(route.sheet);
      return;
    }
    state.screen = m[1];
  }
  render();
}
window.addEventListener('hashchange', syncFromHash);
syncFromHash();
