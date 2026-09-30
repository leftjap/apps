/* 연속 듣기 — 배운 기본 문장 전체를 "한글 → 외국어" 순으로 소리 파일 하나로 만들어 무한 반복 (spec §9-8, 2026-09-06).
 * 반복은 <audio loop> 가 맡는다. 잠금 상태에서 JS 가 깨어날 필요가 없어야 하므로 문장별 이어 재생을 쓰지 않는다.
 * 검증: ~/apps/lessons/ios-simulator-web-audio-lock-verification.md (iOS 26.5 시뮬 · Safari 탭/홈 화면 앱 모두 잠금 중 유지).
 * 데모 주입: window.studyListen?.synthesize 가 있으면 합성기로 쓴다 (mocks/listen.html?demo=1, studySpeech 데모 규약과 동일). */
import { h } from '../components/d1/dom.js';
import { V_VARS, VI, vIcon, v2Style, ensureV2Fonts } from '../components/v2/atoms.js';
import { buildListenAudio, stripParenHints, currentIndex } from '../services/listenAudio.js';
import { VOICE_DEFAULTS } from '../services/speech.js';

function getLang() { try { const v = sessionStorage.getItem('studyLang'); return v === 'ja' ? 'ja' : 'en'; } catch { return 'en'; } }
const ttsLangOf = (l) => (l === 'ja' ? 'ja-JP' : 'en-US');
const langLabel = (l) => (l === 'ja' ? '일본어' : '영어');

/** 커리큘럼 순서(order_index 오름차순, 없으면 생성일·id)로, 괄호 힌트를 지운 한글(ko, 읽기용)·원문(koText, 표시용)·외국어 문장 쌍. 한쪽이 비면 뺀다.
 * 문장 모아보기의 정렬(compareSentenceRows)은 학습 우선순위라 듣기 순서로는 쓰지 않는다. */
export function buildListenPairs(cards) {
  const num = (c) => { const n = Number(c?.order_index); return Number.isFinite(n) ? n : Infinity; };
  const str = (v) => String(v ?? '');
  return [...(cards ?? [])]
    .sort((a, b) => (num(a) - num(b)) || str(a.createdAt).localeCompare(str(b.createdAt)) || str(a.id).localeCompare(str(b.id)))
    .map((c) => ({ ko: stripParenHints(c.meaning || c.ko || ''), koText: str(c.meaning || c.ko).trim(), fo: str(c.sentence).trim() }))
    .filter((p) => p.ko && p.fo);
}

export function listenTitle(lang, count, seconds) {
  const min = Math.max(1, Math.round(seconds / 60));
  return `${langLabel(lang)} ${count}문장 · 한 바퀴 약 ${min}분`;
}

const CSS = `
.li{width:100%;min-height:100vh;min-height:100dvh;background:var(--bg);color:var(--ink);font-family:Pretendard,sans-serif;word-break:keep-all;${V_VARS}}
.li *{box-sizing:border-box;margin:0}
.li button{font-family:inherit;cursor:pointer}
.li-top{height:60px;border-bottom:1px solid var(--line);display:flex;align-items:center}
.li-top-in{width:100%;max-width:560px;margin:0 auto;padding:0 20px;display:flex;align-items:center;justify-content:space-between}
.li-home{display:inline-flex;align-items:center;gap:8px;font-size:13px;font-weight:600;color:var(--mut);background:none;border:0}
.li-wrap{width:100%;max-width:560px;margin:0 auto;padding:36px 20px 56px;display:flex;flex-direction:column;align-items:center;gap:18px;text-align:center}
.li-h1{font-family:Outfit,Pretendard,sans-serif;font-size:26px;font-weight:700;letter-spacing:-0.02em}
.li-sub{font-size:14px;color:var(--mut)}
.li-play{width:120px;height:120px;border-radius:999px;border:0;background:var(--teal);color:var(--card);display:inline-flex;align-items:center;justify-content:center;margin-top:18px;transition:background .15s}
.li-play:disabled{opacity:.45;cursor:default}
.li-play.on{background:var(--coral)}
.li-state{font-size:13px;color:var(--faint);min-height:18px}
.li-err{font-size:14px;color:var(--coral-deep)}
.li-retry,.li-rebuild{font-size:13px;font-weight:700;padding:10px 16px;border-radius:999px;border:1.5px solid var(--line);background:transparent;color:var(--ink)}
.li-empty{font-size:15px;color:var(--mut);padding:40px 0}
.li-list{width:100%;margin-top:10px;display:flex;flex-direction:column;gap:2px;text-align:left}
.li-row{display:grid;grid-template-columns:26px 1fr;gap:10px;padding:10px 12px;border-radius:12px;border:0;background:transparent;font:inherit;text-align:left;color:inherit;transition:background .15s}
.li-row .n{font-family:Outfit,Pretendard,sans-serif;font-size:12px;font-weight:700;color:var(--faint);text-align:right;padding-top:4px;font-variant-numeric:tabular-nums}
.li-row .ko{display:block;font-size:12.5px;color:var(--mut)}
.li-row .fo{display:block;font-size:16px;font-weight:700;margin-top:2px;line-height:1.35}
.li-row.cur{background:var(--teal-soft)}
.li-row.cur .fo{color:var(--teal-deep)}
.li-row:disabled{cursor:default}
/* PC(1024~) 배치 — 시안 design-ref/design_handoff_pc_listen_speak §1. 1023 이하에서는 묶음 상자를 없애(display:contents)
 * 자식들이 현행처럼 .li-wrap 의 한 줄 흐름에 놓이게 하고, PC 에만 있는 요소는 숨긴다. */
.li-head,.li-main,.li-rail,.li-card{display:contents}
.li-lab,.li-prog,.li-div,.li-now{display:none}
@media (min-width:1024px){
.li-top-in{max-width:1064px}
.li-wrap{max-width:1064px;padding:26px 20px 56px;align-items:stretch;gap:22px;text-align:left}
.li-head{display:flex;align-items:baseline;gap:14px}
.li-main{display:grid;grid-template-columns:minmax(0,1fr) 356px;grid-template-areas:"list rail";gap:26px;align-items:start}
.li-card,.li-rail{background:var(--card);border:1px solid var(--line);box-shadow:0 1px 0 rgba(25,35,32,.02),0 10px 22px -18px rgba(25,35,32,.12)}
.li-card{grid-area:list;display:block;border-radius:20px;padding:8px 16px}
.li-empty{grid-area:list}
.li-main:has(.li-empty) .li-rail,.li-main:has(.li-empty) .li-card{display:none}
.li-rail{grid-area:rail;display:flex;flex-direction:column;align-items:center;gap:14px;text-align:center;border-radius:22px;padding:22px 28px 26px;position:sticky;top:24px}
.li-lab{display:block;align-self:flex-start;font-family:Outfit,sans-serif;font-size:10.5px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:var(--faint)}
.li-play{margin-top:6px}
.li-state{color:var(--mut)}
.li-prog{display:flex;width:100%;flex-direction:column;gap:8px;margin-top:4px}
.li-track{position:relative;height:6px;border-radius:999px;background:#ece8da;overflow:hidden}
.li-fill{position:absolute;left:0;top:0;bottom:0;border-radius:999px;background:var(--teal)}
.li-meta{display:flex;justify-content:space-between;align-items:baseline}
.li-pos{font-family:Outfit,sans-serif;font-size:13px;font-weight:700;color:var(--mut);font-variant-numeric:tabular-nums}
.li-time{font-family:Outfit,sans-serif;font-size:12px;font-weight:600;color:var(--faint);font-variant-numeric:tabular-nums}
.li-div{display:block;width:100%;height:1px;background:var(--line);margin-top:2px}
.li-now{display:flex;width:100%;flex-direction:column;gap:6px;align-items:flex-start;text-align:left;min-height:84px}
.li-now .ko{font-size:13px;color:var(--mut)}
.li-now .fo{font-size:18px;font-weight:700;line-height:1.4;color:var(--teal-deep);text-wrap:pretty}
.li-rebuild{margin-top:4px;height:40px;padding:0 16px}
.li-list{margin-top:0}
.li-row{grid-template-columns:28px minmax(0,1fr) minmax(0,1.15fr);gap:0 18px;align-items:baseline;padding:13px 14px}
.li-row .tx{display:contents}
.li-row .n{padding-top:0}
.li-row .ko{font-size:14px;line-height:1.4}
.li-row .fo{margin-top:0}
.li-row.cur .n{color:var(--teal-deep)}
.li-row.cur .ko{color:var(--ink)}
.li-row:not(.cur):not(:disabled):hover{background:#f8f6ee}
}`;

export function mountListen(host) {
  ensureV2Fonts();
  host.innerHTML = '';
  const lang = getLang();
  const audio = document.createElement('audio');
  audio.loop = true; audio.preload = 'auto';

  const sub = h('div', { class: 'li-sub' }, '');
  const state = h('div', { class: 'li-state' }, '');
  const icon = h('span', {}, vIcon(VI.PLAY, { size: 44, fill: true }));
  const playBtn = h('button', { class: 'li-play', type: 'button', 'data-role': 'play', 'aria-label': '재생', disabled: true }, icon);
  const listEl = h('div', { class: 'li-list', 'data-role': 'script' });
  /* 재생 카드 — PC 에서만 보이는 라벨·진행 막대·n / N·시간·지금 나오는 문장을 품는다. 재생 버튼이 목록보다 DOM 앞에 있어야 하므로
   * (listen.test.js) 카드를 앞에 두고 PC 에서는 grid-template-areas 로 목록을 왼쪽에 놓는다. */
  const fill = h('span', { class: 'li-fill' });
  const posEl = h('span', { class: 'li-pos' });
  const timeEl = h('span', { class: 'li-time' });
  const nowKo = h('span', { class: 'ko' });
  const nowFo = h('span', { class: 'fo' });
  const rail = h('div', { class: 'li-rail' },
    h('span', { class: 'li-lab' }, `한글 뒤 ${langLabel(lang)} · 무한 반복`),
    playBtn, state,
    h('div', { class: 'li-prog' }, h('div', { class: 'li-track', 'aria-hidden': 'true' }, fill), h('div', { class: 'li-meta' }, posEl, timeEl)),
    h('div', { class: 'li-div' }),
    h('div', { class: 'li-now' }, h('span', { class: 'li-lab' }, '지금 나오는 문장'), nowKo, nowFo));
  const main = h('div', { class: 'li-main' }, rail, h('div', { class: 'li-card' }, listEl));
  const body = h('div', { class: 'li-wrap' }, h('div', { class: 'li-head' }, h('h1', { class: 'li-h1' }, '연속 듣기'), sub), main);
  const root = h('div', { class: 'li' },
    v2Style(CSS),
    h('div', { class: 'li-top' }, h('div', { class: 'li-top-in' },
      h('button', { class: 'li-home', type: 'button', onClick: () => { window.location.hash = '#/home'; } }, vIcon(VI.HOME, { size: 15 }), '홈으로'),
      h('span', { class: 'li-sub' }, langLabel(lang)))),
    body, audio);
  host.appendChild(root);

  let url = null; let count = 0; let starts = []; let curIdx = -1; let pairs = []; let seconds = 0;
  const mmss = (t) => { const s = Math.floor(t); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  /* 재생 카드 — n / N·지금 나오는 문장은 현재 문장을, 막대·시간은 재생 위치를 따른다. 한 바퀴 길이(seconds)를 모르는 동안(만드는 중)은 시간을 비운다. */
  const paintNow = () => {
    const p = pairs[curIdx];
    posEl.textContent = `${p ? curIdx + 1 : '–'} / ${pairs.length}`;
    nowKo.textContent = p ? p.koText : '';
    nowFo.textContent = p ? p.fo : '재생을 누르면 첫 문장부터';
  };
  const paintTime = () => {
    const t = audio.currentTime || 0;
    fill.style.width = `${seconds ? (t / seconds) * 100 : 0}%`;
    timeEl.textContent = seconds ? `${mmss(t)} / ${mmss(seconds)}` : '';
  };
  /* 스크립트 — 현재 문장 한 줄만 강조하고 가운데로 스크롤. 시작 초는 합성 때 받은 bookmark(없으면 균등 분할). */
  const setCur = (i) => {
    if (i === curIdx) return;
    listEl.children[curIdx]?.classList.remove('cur');
    curIdx = i;
    const row = listEl.children[i];
    if (row) { row.classList.add('cur'); row.scrollIntoView?.({ block: 'center', behavior: 'smooth' }); }
    paintNow();
  };
  const seek = (i) => { audio.currentTime = starts[i] ?? 0; setCur(i); if (audio.paused) doPlay(); };
  /* 줄은 소리가 준비될 때까지 막아 둔다(build 가 합성 전에 그리고, 성공하면 푼다). */
  const renderScript = () => {
    curIdx = -1;
    listEl.replaceChildren(...pairs.map((p, i) => h('button', { class: 'li-row', type: 'button', 'data-i': i, disabled: true, onClick: () => seek(i) },
      h('span', { class: 'n' }, String(i + 1)),
      h('span', { class: 'tx' }, h('span', { class: 'ko' }, p.koText), h('span', { class: 'fo' }, p.fo)))));
  };
  audio.addEventListener('timeupdate', () => { if (starts.length) setCur(currentIndex(starts, audio.currentTime)); paintTime(); });
  const setIcon = (playing) => { icon.replaceChildren(vIcon(playing ? VI.PAUSE : VI.PLAY, { size: 44, fill: true })); playBtn.classList.toggle('on', playing); playBtn.setAttribute('aria-label', playing ? '일시정지' : '재생'); };
  const setMS = (st) => { try { if (navigator.mediaSession) navigator.mediaSession.playbackState = st; } catch (_) { /* noop */ } };
  const doPlay = () => audio.play().then(() => { setIcon(true); setMS('playing'); state.textContent = '재생 중 · 화면을 잠가도 계속 나와요'; }).catch((e) => { state.textContent = `재생 실패: ${e?.message ?? e}`; });
  const doPause = () => { audio.pause(); setIcon(false); setMS('paused'); state.textContent = '일시정지'; };
  playBtn.addEventListener('click', () => { if (audio.paused) doPlay(); else doPause(); });
  /* OS 가 재생을 멈추거나 되살려도(전화·잠금화면 조작) 화면 상태가 요소의 실제 상태를 따르도록 이벤트로 동기화한다. */
  audio.addEventListener('pause', () => { setIcon(false); setMS('paused'); if (state.textContent.startsWith('재생 중')) state.textContent = '일시정지'; });
  audio.addEventListener('play', () => { setIcon(true); setMS('playing'); state.textContent = '재생 중 · 화면을 잠가도 계속 나와요'; });

  function armMediaSession() {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({ title: `연속 듣기 · ${langLabel(lang)} ${count}문장`, artist: 'Study' });
      navigator.mediaSession.setActionHandler('play', doPlay);
      navigator.mediaSession.setActionHandler('pause', doPause);
    } catch (_) { /* noop */ }
  }
  function release() { if (url) { try { URL.revokeObjectURL(url); } catch (_) { /* noop */ } url = null; } }

  async function build() {
    playBtn.disabled = true; setIcon(false);
    body.querySelectorAll('.li-err, .li-retry, .li-rebuild, .li-empty').forEach((n) => n.remove());
    starts = []; seconds = 0; listEl.replaceChildren(); curIdx = -1;
    let cards = [];
    try { cards = await window.studyDB.reviewQueue.where('lang').equals(lang).toArray(); } catch (e) { console.error('[listen] load', e); }
    pairs = buildListenPairs(cards);
    if (!pairs.length) { sub.textContent = ''; main.appendChild(h('div', { class: 'li-empty' }, '아직 들을 문장이 없어요')); return; }
    sub.textContent = `${langLabel(lang)} ${pairs.length}문장`;
    /* 목록은 합성 전에 그린다 — PC 에서 합성하는 동안 왼쪽이 비지 않게(모바일도 같은 경로라 목록이 먼저 보인다). */
    renderScript(); paintNow(); paintTime();
    state.textContent = '소리 만드는 중…';
    try {
      const synthesize = window.studyListen?.synthesize;
      const out = await buildListenAudio(pairs, {
        foVoice: VOICE_DEFAULTS[ttsLangOf(lang)]?.voice ?? null,
        onProgress: ({ done, total }) => { state.textContent = `소리 만드는 중 ${done}/${total}`; },
        ...(synthesize ? { synthesize } : {}),
      });
      release();
      url = URL.createObjectURL(out.blob); audio.src = url; count = out.count; seconds = out.seconds;
      starts = Array.isArray(out.starts) ? out.starts : [];
      listEl.querySelectorAll('.li-row').forEach((b) => { b.disabled = false; });
      sub.textContent = listenTitle(lang, out.count, out.seconds);
      state.textContent = '준비 완료 · 재생을 누르면 잠금 중에도 이어서 나와요';
      playBtn.disabled = false; armMediaSession(); paintTime();
      rail.appendChild(h('button', { class: 'li-rebuild', type: 'button', 'data-role': 'rebuild', onClick: () => { doPause(); build(); } }, '다시 만들기'));
    } catch (e) {
      console.warn('[listen] build 실패', e);
      state.textContent = '';
      /* 실패 안내는 재생 카드 안 상태 문구 바로 아래 — 목록이 먼저 그려지므로 본문 끝에 붙이면 목록 아래로 밀린다. */
      state.after(h('div', { class: 'li-err' }, `소리를 만들지 못했어요 · ${e?.message ?? e}`),
        h('button', { class: 'li-retry', type: 'button', 'data-role': 'retry', onClick: () => build() }, '다시 시도'));
    }
  }
  build();

  return () => {
    try { audio.pause(); } catch (_) { /* noop */ }
    try { if (navigator.mediaSession) { navigator.mediaSession.setActionHandler('play', null); navigator.mediaSession.setActionHandler('pause', null); } } catch (_) { /* noop */ }
    audio.removeAttribute('src'); release();
    host.innerHTML = '';
  };
}
