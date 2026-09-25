// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mountSpeak } from './speak.js';

/* 말하기 연습 (2026-09-08 작업지시서 §5~§6, 2026-09-25 지난 세션 선택) — 표현 선별은 speakPicks 가, 프롬프트는 voicePrompt 가
 * 맡으므로 여기서는 화면 계약만 고정한다: 진입 시 가장 최근 세션(없으면 다음 범위로) → 지난 세션 고르기 → 체크로 표현 제외 → 복사. */
const flush = async () => { for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0)); };
const T = '2026-09-08';
const CARDS = [
  { id: 'n1', lang: 'en', sentence: 'It depends on what you want to do.', meaning: '네가 뭘 하고 싶은지에 따라 달라.', explanation: { key: 'it depends on = ~에 따라 다르다', situation: '결정을 미룰 때' }, promotedAt: '2026-09-08T10:00:00Z' },
  { id: 'n2', lang: 'en', sentence: "I'd love to, but I already have plans.", meaning: '정말 그러고 싶은데 이미 약속이 있어.', explanation: { key: "I'd love to, but = 그러고 싶지만", situation: '제안을 거절할 때' }, promotedAt: '2026-09-08T10:00:00Z' },
  { id: 'p1', lang: 'en', sentence: "I'm on my way.", meaning: '가는 중이야.', explanation: { key: 'on my way = 가는 중', situation: '늦어서 연락할 때' }, promotedAt: '2026-09-05T10:00:00Z' },
  { id: 'h1', lang: 'en', sentence: 'Sorry, could you say that again more slowly?', meaning: '미안한데 다시 천천히 말해줄래요?', explanation: { key: 'could you say that again = 다시 말해 줄래요', situation: '못 알아들었을 때' }, lastResult: 'X', promotedAt: '2026-09-03T00:00:00Z' },
];
const LOGS = [
  { id: 'L-today', date: T, lang: 'en', mode: 'new', newSentenceIds: ['n1', 'n2'], sentenceIds: ['n1', 'n2'], createdAt: `${T}T10:00:00Z` },
  { id: 'L-past', date: '2026-09-05', lang: 'en', mode: 'new', newSentenceIds: ['p1'], sentenceIds: ['p1'], createdAt: '2026-09-05T10:00:00Z' },
];
const table = (rows) => ({ where: (f) => ({ equals: (v) => ({ toArray: async () => rows.filter((r) => r[f] === v) }) }) });
const labels = (host) => [...host.querySelectorAll('[data-role="item"] .ex')].map((n) => n.textContent);
const pick = async (host, key) => {
  const sel = host.querySelector('[data-role="session"]');
  sel.value = key; sel.dispatchEvent(new Event('change')); await flush();
};

describe('mountSpeak — 세션 고르기 → 표현 체크 → 프롬프트 복사', () => {
  let host, write;
  beforeEach(() => {
    host = document.createElement('div'); document.body.appendChild(host);
    sessionStorage.setItem('studyLang', 'en');
    window.studyDay = { TODAY_ISO: T };
    window.studyDB = { reviewQueue: table(CARDS), sessionLogs: table(LOGS) };
    write = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: write } });
  });
  afterEach(() => { host.remove(); delete window.studyDay; vi.restoreAllMocks(); });

  it('진입 시 가장 최근 세션 — 세션 목록은 최신순, 문장은 배운 순서로 전부 체크, 프롬프트에 표현·상황·ChatGPT 안내', async () => {
    mountSpeak(host); await flush();
    expect(host.querySelector('[data-scope="session"]').classList.contains('on')).toBe(true);
    const sel = host.querySelector('[data-role="session"]');
    expect(sel.hidden).toBe(false);
    expect([...sel.options].map((o) => o.textContent)).toEqual(['9월 8일 · It depends on what you want to do. 외 1', "9월 5일 · I'm on my way."]);
    expect(labels(host)).toEqual(['it depends on', "I'd love to, but"]);
    expect([...host.querySelectorAll('[data-role="item"] input')].every((b) => b.checked)).toBe(true);
    const ta = host.querySelector('textarea');
    expect(ta.value.split('\n')[0]).toContain('ChatGPT');
    expect(ta.value).toContain('it depends on');
    expect(ta.value).toContain('결정을 미룰 때');
  });

  it('지난 세션을 고르면 목록과 프롬프트가 그 세션 문장으로 바뀐다', async () => {
    mountSpeak(host); await flush();
    await pick(host, 'L-past');
    expect(labels(host)).toEqual(['on my way']);
    const ta = host.querySelector('textarea');
    expect(ta.value).toContain("I'm on my way.");
    expect(ta.value).toContain('늦어서 연락할 때');
    expect(ta.value).not.toContain('It depends on what you want to do.');
  });

  it('오늘 공부하지 않은 날에도 어려웠던 표현으로 넘어가지 않고 직전 세션을 연다', async () => {
    window.studyDay = { TODAY_ISO: '2026-09-10' };
    mountSpeak(host); await flush();
    expect(host.querySelector('[data-scope="session"]').classList.contains('on')).toBe(true);
    expect(labels(host)).toEqual(['it depends on', "I'd love to, but"]);
  });

  it('체크를 풀면 프롬프트에서 빠진다', async () => {
    mountSpeak(host); await flush();
    host.querySelector('[data-role="item"] input[type="checkbox"]').click(); await flush();
    expect(host.querySelector('textarea').value).not.toContain('It depends on what you want to do.');
    expect(host.querySelector('textarea').value).toContain("I'd love to, but");
  });

  it('최근 어려웠던 표현 범위 → X 카드, 세션 목록은 숨긴다', async () => {
    mountSpeak(host); await flush();
    host.querySelector('[data-scope="hard"]').click(); await flush();
    expect(labels(host)).toEqual(['could you say that again']);
    expect(host.querySelector('[data-role="session"]').hidden).toBe(true);
  });

  it('다른 범위를 봤다가 세션으로 돌아오면 고른 세션이 그대로다', async () => {
    mountSpeak(host); await flush();
    await pick(host, 'L-past');
    host.querySelector('[data-scope="hard"]').click(); await flush();
    host.querySelector('[data-scope="session"]').click(); await flush();
    expect(host.querySelector('[data-role="session"]').value).toBe('L-past');
    expect(labels(host)).toEqual(['on my way']);
  });

  it('복사 버튼 → 클립보드에 프롬프트', async () => {
    mountSpeak(host); await flush();
    host.querySelector('[data-role="copy"]').click(); await flush();
    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0][0]).toBe(host.querySelector('textarea').value);
    expect(host.querySelector('[data-role="copy"]').textContent).toContain('복사됨');
  });

  it('세션이 하나도 없으면 어려웠던 표현으로 자동 전환', async () => {
    window.studyDB.sessionLogs = table([]);
    mountSpeak(host); await flush();
    expect(host.querySelector('[data-scope="hard"]').classList.contains('on')).toBe(true);
    expect(labels(host)).toEqual(['could you say that again']);
    expect(host.querySelector('[data-role="session"]').hidden).toBe(true);
  });
});
