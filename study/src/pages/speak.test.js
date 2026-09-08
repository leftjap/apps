// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mountSpeak } from './speak.js';

/* 말하기 연습 (2026-09-08 작업지시서 §5~§6) — 표현 선별은 speakPicks 가, 프롬프트는 voicePrompt 가 맡으므로
 * 여기서는 화면 계약만 고정한다: 진입 시 오늘 범위(비면 다음 범위로) → 체크로 표현 제외 → 복사. */
const flush = async () => { for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0)); };
const T = '2026-09-08';
const CARDS = [
  { id: 'n1', lang: 'en', sentence: 'It depends on what you want to do.', meaning: '네가 뭘 하고 싶은지에 따라 달라.', explanation: { key: 'it depends on = ~에 따라 다르다', situation: '결정을 미룰 때' }, promotedAt: '2026-09-08T09:00:00Z' },
  { id: 'n2', lang: 'en', sentence: "I'd love to, but I already have plans.", meaning: '정말 그러고 싶은데 이미 약속이 있어.', explanation: { key: "I'd love to, but = 그러고 싶지만", situation: '제안을 거절할 때' }, promotedAt: '2026-09-08T10:00:00Z' },
  { id: 'h1', lang: 'en', sentence: 'Sorry, could you say that again more slowly?', meaning: '미안한데 다시 천천히 말해줄래요?', explanation: { key: 'could you say that again = 다시 말해 줄래요', situation: '못 알아들었을 때' }, lastResult: 'X', promotedAt: '2026-09-03T00:00:00Z' },
];
const LOGS = [{ date: T, lang: 'en', mode: 'new', newSentenceIds: ['n1', 'n2'], sentenceIds: ['n1', 'n2'] }];
const table = (rows) => ({ where: () => ({ equals: () => ({ toArray: async () => rows }) }) });

describe('mountSpeak — 범위 선택 → 표현 체크 → 프롬프트 복사', () => {
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

  it('진입 시 오늘 범위 — 표현 2개, 프롬프트에 표현·상황·ChatGPT 안내', async () => {
    mountSpeak(host); await flush();
    expect(host.querySelector('[data-scope="today"]').classList.contains('on')).toBe(true);
    const labels = [...host.querySelectorAll('[data-role="item"] .ex')].map((n) => n.textContent);
    expect(labels).toEqual(["I'd love to, but", 'it depends on']);
    const ta = host.querySelector('textarea');
    expect(ta.value.split('\n')[0]).toContain('ChatGPT');
    expect(ta.value).toContain('it depends on');
    expect(ta.value).toContain('결정을 미룰 때');
  });

  it('체크를 풀면 프롬프트에서 빠진다', async () => {
    mountSpeak(host); await flush();
    const box = host.querySelector('[data-role="item"] input[type="checkbox"]');
    box.click(); await flush();
    expect(host.querySelector('textarea').value).not.toContain("I'd love to, but");
    expect(host.querySelector('textarea').value).toContain('it depends on');
  });

  it('최근 어려웠던 표현 범위 → X 카드', async () => {
    mountSpeak(host); await flush();
    host.querySelector('[data-scope="hard"]').click(); await flush();
    const labels = [...host.querySelectorAll('[data-role="item"] .ex')].map((n) => n.textContent);
    expect(labels).toEqual(['could you say that again']);
  });

  it('복사 버튼 → 클립보드에 프롬프트', async () => {
    mountSpeak(host); await flush();
    host.querySelector('[data-role="copy"]').click(); await flush();
    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0][0]).toBe(host.querySelector('textarea').value);
    expect(host.querySelector('[data-role="copy"]').textContent).toContain('복사됨');
  });

  it('오늘 표현이 없으면 어려웠던 표현으로 자동 전환', async () => {
    window.studyDB.sessionLogs = table([]);
    mountSpeak(host); await flush();
    expect(host.querySelector('[data-scope="hard"]').classList.contains('on')).toBe(true);
    const labels = [...host.querySelectorAll('[data-role="item"] .ex')].map((n) => n.textContent);
    expect(labels).toEqual(['could you say that again']);
  });
});
