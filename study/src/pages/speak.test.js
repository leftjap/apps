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

describe('mountSpeak — PC 세션 목록 · 줄 복사 · 카드 머리 (2026-09-30 시안 design-ref/design_handoff_pc_listen_speak)', () => {
  let host, write;
  const row = (key) => host.querySelector(`[data-role="session-list"] [data-role="session-row"][data-key="${key}"]`);
  const text = (sel) => host.querySelector(sel).textContent;
  beforeEach(() => {
    host = document.createElement('div'); document.body.appendChild(host);
    sessionStorage.setItem('studyLang', 'en');
    window.studyDay = { TODAY_ISO: T };
    window.studyDB = { reviewQueue: table(CARDS), sessionLogs: table(LOGS) };
    write = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: write } });
  });
  afterEach(() => { host.remove(); delete window.studyDay; vi.restoreAllMocks(); });

  it('세션 목록 — 최신순 줄마다 날짜 · 표현 수와 첫 문장, 개수, 고른 세션 표시', async () => {
    mountSpeak(host); await flush();
    const rows = [...host.querySelectorAll('[data-role="session-list"] [data-role="session-row"]')];
    expect(rows.map((r) => r.dataset.key)).toEqual(['L-today', 'L-past']);
    expect(rows[0].querySelector('.meta').textContent).toBe('9월 8일 · 표현 2개');
    expect(rows[0].querySelector('.first').textContent).toBe('It depends on what you want to do.');
    expect(rows[1].querySelector('.meta').textContent).toBe('9월 5일 · 표현 1개');
    expect(text('[data-role="session-list"] .cnt')).toBe('2개');
    expect(rows[0].classList.contains('on')).toBe(true);
    expect(rows[0].querySelector('button').getAttribute('aria-current')).toBe('true');
    expect(rows[1].classList.contains('on')).toBe(false);
    expect(rows[1].querySelector('button').hasAttribute('aria-current')).toBe(false);
    expect(rows[1].querySelector('[data-role="session-copy"]').getAttribute('aria-label')).toBe('9월 5일 세션 프롬프트 복사');
    expect(host.querySelectorAll('[data-role="copy"]')).toHaveLength(1);
  });

  it('세션 줄을 누르면 select 값·표현·프롬프트·카드 제목이 그 세션으로 바뀌고 표시가 옮겨간다', async () => {
    mountSpeak(host); await flush();
    row('L-past').querySelector('button').click(); await flush();
    expect(host.querySelector('[data-role="session"]').value).toBe('L-past');
    expect(labels(host)).toEqual(['on my way']);
    expect(host.querySelector('textarea').value).toContain("I'm on my way.");
    expect(host.querySelector('textarea').value).not.toContain('It depends on what you want to do.');
    expect(text('.sp-ctitle')).toBe('9월 5일 · 표현 1개');
    expect(row('L-past').classList.contains('on')).toBe(true);
    expect(row('L-past').querySelector('button').getAttribute('aria-current')).toBe('true');
    expect(row('L-today').classList.contains('on')).toBe(false);
    expect(row('L-today').querySelector('button').hasAttribute('aria-current')).toBe(false);
  });

  it('모바일 select 로 고르면 세션 목록 표시도 따라간다', async () => {
    mountSpeak(host); await flush();
    await pick(host, 'L-past');
    expect(row('L-past').classList.contains('on')).toBe(true);
    expect(row('L-today').classList.contains('on')).toBe(false);
  });

  it('다른 범위를 봤다가 세션으로 돌아오면 목록 선택이 그대로고, 다른 범위에서는 목록을 숨긴다', async () => {
    mountSpeak(host); await flush();
    row('L-past').querySelector('button').click(); await flush();
    host.querySelector('[data-scope="hard"]').click(); await flush();
    expect(host.querySelector('[data-role="session-list"]').hidden).toBe(true);
    host.querySelector('[data-scope="session"]').click(); await flush();
    expect(host.querySelector('[data-role="session-list"]').hidden).toBe(false);
    expect(row('L-past').classList.contains('on')).toBe(true);
    expect(row('L-today').classList.contains('on')).toBe(false);
  });

  it('다른 세션 줄 복사 → 그 세션 표현 전부로 만든 프롬프트, 고른 세션은 그대로, 1.5초 복사됨', async () => {
    mountSpeak(host); await flush();
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    try {
      const btn = row('L-past').querySelector('[data-role="session-copy"]');
      btn.click(); await vi.advanceTimersByTimeAsync(0);
      expect(write).toHaveBeenCalledTimes(1);
      const copied = write.mock.calls[0][0];
      expect(copied).toContain("I'm on my way.");
      expect(copied).toContain('늦어서 연락할 때');
      expect(copied).not.toContain('It depends on what you want to do.');
      expect(host.querySelector('[data-role="session"]').value).toBe('L-today');
      expect(labels(host)).toEqual(['it depends on', "I'd love to, but"]);
      expect(row('L-today').classList.contains('on')).toBe(true);
      expect(btn.textContent).toBe('복사됨');
      await vi.advanceTimersByTimeAsync(1499);
      expect(btn.textContent).toBe('복사됨');
      await vi.advanceTimersByTimeAsync(1);
      expect(btn.textContent).toBe('복사');
    } finally { vi.useRealTimers(); }
  });

  it('고른 세션 줄 복사 → 체크 해제가 반영된 textarea 값 그대로', async () => {
    mountSpeak(host); await flush();
    host.querySelector('[data-role="item"] input').click(); await flush();
    row('L-today').querySelector('[data-role="session-copy"]').click(); await flush();
    const copied = write.mock.calls[0][0];
    expect(copied).toBe(host.querySelector('textarea').value);
    expect(copied).not.toContain('It depends on what you want to do.');
    expect(copied).toContain("I'd love to, but I already have plans.");
  });

  it('클립보드가 막히면 그 줄의 프롬프트를 execCommand 로 복사한다(고른 세션 textarea 가 아니라)', async () => {
    write.mockRejectedValue(new Error('denied'));
    let selected = '';
    document.execCommand = vi.fn(() => { selected = document.activeElement?.value ?? ''; return true; });
    mountSpeak(host); await flush();
    row('L-past').querySelector('[data-role="session-copy"]').click(); await flush();
    expect(document.execCommand).toHaveBeenCalledWith('copy');
    expect(selected).toContain("I'm on my way.");
    expect(selected).not.toContain('It depends on what you want to do.');
    expect(document.querySelectorAll('textarea')).toHaveLength(1);
    delete document.execCommand;
  });

  it('프롬프트 설명은 고른 표현 수를 따르고, 모두 풀면 큰 복사 버튼이 막힌다', async () => {
    mountSpeak(host); await flush();
    expect(text('.sp-pdesc')).toBe('고른 표현 2개로 만든 프롬프트 · ChatGPT 새 대화에 붙여 넣기');
    host.querySelector('[data-role="item"] input').click(); await flush();
    expect(text('.sp-pdesc')).toBe('고른 표현 1개로 만든 프롬프트 · ChatGPT 새 대화에 붙여 넣기');
    host.querySelectorAll('[data-role="item"] input')[1].click(); await flush();
    expect(text('.sp-pdesc')).toBe('표현을 하나 이상 고르세요');
    expect(host.querySelector('[data-role="copy"]').disabled).toBe(true);
  });

  it('카드 머리 — 세션이면 고른 세션, 다른 범위면 범위 이름·보이는 표현 수·범위 설명', async () => {
    mountSpeak(host); await flush();
    expect(text('.sp-chead .sp-lab')).toBe('고른 세션');
    expect(text('.sp-ctitle')).toBe('9월 8일 · 표현 2개');
    expect(text('.sp-csit')).toBe('결정을 미룰 때 제안을 거절할 때');
    expect(host.querySelector('.sp-note').hidden).toBe(true);
    host.querySelector('[data-scope="hard"]').click(); await flush();
    expect(text('.sp-chead .sp-lab')).toBe('최근 어려웠던 표현');
    expect(text('.sp-ctitle')).toBe('표현 1개');
    expect(text('.sp-csit')).toBe('못 알아들었을 때');
    expect(host.querySelector('.sp-note').hidden).toBe(false);
    expect(text('.sp-note')).toBe('최근 14일 안에 어려움으로 판정했거나 마지막 판정이 어려움인 표현을, 최근 순으로 최대 5개 모읍니다.');
    host.querySelector('[data-scope="random"]').click(); await flush();
    expect(text('.sp-chead .sp-lab')).toBe('랜덤 복습');
    expect(text('.sp-ctitle')).toBe('표현 4개');
    expect(text('.sp-note')).toBe('복습 카드에서 무작위로 최대 5개를 뽑습니다. 탭을 다시 누르면 새로 뽑습니다.');
    host.querySelector('[data-scope="session"]').click(); await flush();
    expect(host.querySelector('.sp-note').hidden).toBe(true);
  });

  it('표현 항목 — 문장·뜻 줄을 두되 표현과 같은 문장(끝 문장부호만 다른 것 포함)은 빼고, 상황은 중복 없이 머리에 한 번', async () => {
    const same = [
      { id: 's1', lang: 'en', sentence: "I'm finishing up.", meaning: '마무리하는 중이야.', explanation: { key: "I'm finishing up = 마무리 중이야", situation: '저녁 6시.' }, promotedAt: `${T}T10:00:00Z` },
      { id: 's2', lang: 'en', sentence: "I can't wait to eat.", meaning: '빨리 먹고 싶다.', explanation: { key: "I can't wait to ~ = 빨리 ~하고 싶다", situation: '저녁 6시.' }, promotedAt: `${T}T10:00:00Z` },
      { id: 's3', lang: 'en', sentence: 'Thank you.', meaning: '고마워.', explanation: { key: 'Thank you. = 고마워' }, promotedAt: `${T}T10:00:00Z` },
    ];
    window.studyDB = { reviewQueue: table(same), sessionLogs: table([{ id: 'L1', date: T, lang: 'en', mode: 'new', newSentenceIds: ['s1', 's2', 's3'], sentenceIds: ['s1', 's2', 's3'], createdAt: `${T}T10:00:00Z` }]) };
    mountSpeak(host); await flush();
    const items = [...host.querySelectorAll('[data-role="item"]')];
    expect(items[0].querySelector('.se')).toBeNull();
    expect(items[1].querySelector('.se').textContent).toBe("I can't wait to eat.");
    expect(items[2].querySelector('.se')).toBeNull();
    expect(items.map((it) => it.querySelector('.ko').textContent)).toEqual(['마무리하는 중이야.', '빨리 먹고 싶다.', '고마워.']);
    expect(text('.sp-csit')).toBe('저녁 6시.');
  });

  it('빈 범위 — 머리 제목·상황을 숨기고 빈 문구만', async () => {
    window.studyDB = { reviewQueue: table([]), sessionLogs: table([]) };
    mountSpeak(host); await flush();
    expect(host.querySelector('[data-scope="random"]').classList.contains('on')).toBe(true);
    expect(text('.sp-chead .sp-lab')).toBe('랜덤 복습');
    expect(host.querySelector('.sp-ctitle').hidden).toBe(true);
    expect(host.querySelector('.sp-csit').hidden).toBe(true);
    expect(text('.sp-empty')).toBe('복습 카드가 없어요 · 다른 범위를 골라 보세요');
    expect(host.querySelector('[data-role="session-list"]').hidden).toBe(true);
  });
});
