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
.li-row.cur .fo{color:var(--teal-deep)}`;

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
  const body = h('div', { class: 'li-wrap' }, h('h1', { class: 'li-h1' }, '연속 듣기'), sub, playBtn, state, listEl);
  const root = h('div', { class: 'li' },
    v2Style(CSS),
    h('div', { class: 'li-top' }, h('div', { class: 'li-top-in' },
      h('button', { class: 'li-home', type: 'button', onClick: () => { window.location.hash = '#/home'; } }, vIcon(VI.HOME, { size: 15 }), '홈으로'),
      h('span', { class: 'li-sub' }, langLabel(lang)))),
    body, audio);
  host.appendChild(root);

  let url = null; let count = 0; let starts = []; let curIdx = -1;
  /* 스크립트 — 현재 문장 한 줄만 강조하고 가운데로 스크롤. 시작 초는 합성 때 받은 bookmark(없으면 균등 분할). */
  const setCur = (i) => {
    if (i === curIdx) return;
    listEl.children[curIdx]?.classList.remove('cur');
    curIdx = i;
    const row = listEl.children[i];
    if (row) { row.classList.add('cur'); row.scrollIntoView?.({ block: 'center', behavior: 'smooth' }); }
  };
  const seek = (i) => { audio.currentTime = starts[i] ?? 0; setCur(i); if (audio.paused) doPlay(); };
  const renderScript = (pairs) => {
    curIdx = -1;
    listEl.replaceChildren(...pairs.map((p, i) => h('button', { class: 'li-row', type: 'button', 'data-i': i, onClick: () => seek(i) },
      h('span', { class: 'n' }, String(i + 1)),
      h('span', {}, h('span', { class: 'ko' }, p.koText), h('span', { class: 'fo' }, p.fo)))));
  };
  audio.addEventListener('timeupdate', () => { if (starts.length) setCur(currentIndex(starts, audio.currentTime)); });
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
    starts = []; listEl.replaceChildren(); curIdx = -1;
    let cards = [];
    try { cards = await window.studyDB.reviewQueue.where('lang').equals(lang).toArray(); } catch (e) { console.error('[listen] load', e); }
    const pairs = buildListenPairs(cards);
    if (!pairs.length) { sub.textContent = ''; body.appendChild(h('div', { class: 'li-empty' }, '아직 들을 문장이 없어요')); return; }
    sub.textContent = `${langLabel(lang)} ${pairs.length}문장`;
    state.textContent = '소리 만드는 중…';
    try {
      const synthesize = window.studyListen?.synthesize;
      const out = await buildListenAudio(pairs, {
        foVoice: VOICE_DEFAULTS[ttsLangOf(lang)]?.voice ?? null,
        onProgress: ({ done, total }) => { state.textContent = `소리 만드는 중 ${done}/${total}`; },
        ...(synthesize ? { synthesize } : {}),
      });
      release();
      url = URL.createObjectURL(out.blob); audio.src = url; count = out.count;
      starts = Array.isArray(out.starts) ? out.starts : [];
      renderScript(pairs);
      sub.textContent = listenTitle(lang, out.count, out.seconds);
      state.textContent = '준비 완료 · 재생을 누르면 잠금 중에도 이어서 나와요';
      playBtn.disabled = false; armMediaSession();
      body.insertBefore(h('button', { class: 'li-rebuild', type: 'button', 'data-role': 'rebuild', onClick: () => { doPause(); build(); } }, '다시 만들기'), listEl);
    } catch (e) {
      console.warn('[listen] build 실패', e);
      state.textContent = '';
      body.appendChild(h('div', { class: 'li-err' }, `소리를 만들지 못했어요 · ${e?.message ?? e}`));
      body.appendChild(h('button', { class: 'li-retry', type: 'button', 'data-role': 'retry', onClick: () => build() }, '다시 시도'));
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
