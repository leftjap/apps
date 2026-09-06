// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/* 연속 듣기 (spec §9-8) — 합성은 listenAudio 가 맡으므로 mock 으로 대체하고 화면 계약만 고정한다:
 * 진입 시 만들기(자동 재생 없음) → 재생/일시정지 토글 + Media Session → 실패 시 안내·다시 시도(폴백 없음) → 정리. */
const M = vi.hoisted(() => ({ buildListenAudio: vi.fn() }));
vi.mock('../services/listenAudio.js', async (orig) => ({ ...(await orig()), buildListenAudio: M.buildListenAudio }));

import { buildListenPairs, listenTitle, mountListen } from './listen.js';

const flush = async () => { for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0)); };
const CARDS = [
  { id: 'b', lang: 'en', sentence: 'Is there a problem?', meaning: '(무슨) 문제가 있나요?', order_index: 2 },
  { id: 'a', lang: 'en', sentence: 'I have no appetite.', meaning: '식욕(입맛)이 없어요.', order_index: 1 },
  { id: 'c', lang: 'en', sentence: '', meaning: '빈 문장' },
];

describe('buildListenPairs / listenTitle', () => {
  it('order_index 오름차순으로, 괄호 힌트를 지우고, 빈 문장은 뺀다', () => {
    expect(buildListenPairs(CARDS)).toEqual([
      { ko: '식욕이 없어요.', fo: 'I have no appetite.' },
      { ko: '문제가 있나요?', fo: 'Is there a problem?' },
    ]);
  });
  it('order_index 가 없는 카드는 뒤로, 그 안에서는 생성일 순', () => {
    const cards = [
      { id: 'z', sentence: 'Z.', meaning: '지', createdAt: '2026-09-02T00:00:00Z' },
      { id: 'y', sentence: 'Y.', meaning: '와이', createdAt: '2026-09-01T00:00:00Z' },
      { id: 'x', sentence: 'X.', meaning: '엑스', order_index: 5 },
    ];
    expect(buildListenPairs(cards).map((p) => p.fo)).toEqual(['X.', 'Y.', 'Z.']);
  });
  it('제목 — 언어·문장 수·한 바퀴 분', () => {
    expect(listenTitle('en', 119, 733)).toBe('영어 119문장 · 한 바퀴 약 12분');
    expect(listenTitle('ja', 26, 20)).toBe('일본어 26문장 · 한 바퀴 약 1분');
  });
});

describe('mountListen — 만들기 → 재생/일시정지 → 정리', () => {
  let host, play, pause, handlers;
  beforeEach(() => {
    host = document.createElement('div'); document.body.appendChild(host);
    sessionStorage.setItem('studyLang', 'en');
    window.studyDB = { reviewQueue: { where: () => ({ equals: () => ({ toArray: async () => CARDS }) }) } };
    play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function () { Object.defineProperty(this, 'paused', { value: false, configurable: true }); return Promise.resolve(); });
    pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function () { Object.defineProperty(this, 'paused', { value: true, configurable: true }); });
    global.URL.createObjectURL = vi.fn(() => 'blob:fake'); global.URL.revokeObjectURL = vi.fn();
    handlers = {};
    Object.defineProperty(navigator, 'mediaSession', { configurable: true, value: { metadata: null, playbackState: 'none', setActionHandler: (k, f) => { handlers[k] = f; } } });
    global.MediaMetadata = class { constructor(o) { Object.assign(this, o); } };
    M.buildListenAudio.mockReset();
  });
  afterEach(() => { host.remove(); vi.restoreAllMocks(); });

  it('진입 시 소리를 만들고, 제목과 재생 버튼을 보여준다 (자동 재생 없음)', async () => {
    M.buildListenAudio.mockImplementation(async (pairs, { onProgress }) => { onProgress({ done: 1, total: 1 }); return { blob: new Blob(['x'], { type: 'audio/wav' }), seconds: 12.4, count: pairs.length }; });
    mountListen(host); await flush();
    expect(M.buildListenAudio).toHaveBeenCalledTimes(1);
    expect(M.buildListenAudio.mock.calls[0][0]).toHaveLength(2);
    expect(M.buildListenAudio.mock.calls[0][1].foVoice).toBe('en-US-AriaNeural');
    expect(host.textContent).toContain('영어 2문장 · 한 바퀴 약 1분');
    expect(play).not.toHaveBeenCalled();
    const audio = host.querySelector('audio');
    expect(audio.loop).toBe(true); expect(audio.getAttribute('src')).toBe('blob:fake');
  });
  it('재생 버튼 → play + Media Session 제목, 다시 누르면 pause', async () => {
    M.buildListenAudio.mockResolvedValue({ blob: new Blob(['x'], { type: 'audio/wav' }), seconds: 60, count: 2 });
    mountListen(host); await flush();
    host.querySelector('[data-role="play"]').click(); await flush();
    expect(play).toHaveBeenCalledTimes(1);
    expect(navigator.mediaSession.metadata.title).toBe('연속 듣기 · 영어 2문장');
    expect(typeof handlers.play).toBe('function'); expect(typeof handlers.pause).toBe('function');
    host.querySelector('[data-role="play"]').click(); await flush();
    expect(pause).toHaveBeenCalledTimes(1);
  });
  it('합성 실패 → 안내 + 다시 시도 (Web Speech 폴백 없음)', async () => {
    M.buildListenAudio.mockRejectedValueOnce(new Error('token')).mockResolvedValueOnce({ blob: new Blob(['x']), seconds: 5, count: 2 });
    mountListen(host); await flush();
    expect(host.textContent).toContain('소리를 만들지 못했어요');
    expect(window.speechSynthesis?.speak).toBeUndefined();
    host.querySelector('[data-role="retry"]').click(); await flush();
    expect(M.buildListenAudio).toHaveBeenCalledTimes(2);
    expect(host.querySelector('[data-role="play"]').disabled).toBe(false);
  });
  it('문장이 없으면 안내만', async () => {
    window.studyDB.reviewQueue.where = () => ({ equals: () => ({ toArray: async () => [] }) });
    mountListen(host); await flush();
    expect(host.textContent).toContain('아직 들을 문장이 없어요');
    expect(M.buildListenAudio).not.toHaveBeenCalled();
  });
  it('정리 함수는 pause + revokeObjectURL', async () => {
    M.buildListenAudio.mockResolvedValue({ blob: new Blob(['x']), seconds: 5, count: 2 });
    const cleanup = mountListen(host); await flush();
    host.querySelector('[data-role="play"]').click(); await flush();
    cleanup();
    expect(pause).toHaveBeenCalled(); expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fake');
    expect(host.innerHTML).toBe('');
  });
});

describe('mountListen — 요소 이벤트로 상태 동기화 (OS 가 멈추거나 되살릴 때)', () => {
  it("audio 'pause' 이벤트 → 일시정지 표시, 'play' 이벤트 → 재생 중 표시", async () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    sessionStorage.setItem('studyLang', 'en');
    window.studyDB = { reviewQueue: { where: () => ({ equals: () => ({ toArray: async () => CARDS }) }) } };
    global.URL.createObjectURL = vi.fn(() => 'blob:fake'); global.URL.revokeObjectURL = vi.fn();
    M.buildListenAudio.mockResolvedValue({ blob: new Blob(['x']), seconds: 5, count: 2 });
    mountListen(host); await flush();
    const audio = host.querySelector('audio');
    audio.dispatchEvent(new Event('play'));
    expect(host.querySelector('[data-role="play"]').getAttribute('aria-label')).toBe('일시정지');
    expect(host.textContent).toContain('재생 중');
    audio.dispatchEvent(new Event('pause'));
    expect(host.querySelector('[data-role="play"]').getAttribute('aria-label')).toBe('재생');
    expect(host.textContent).toContain('일시정지');
    host.remove();
  });
});
