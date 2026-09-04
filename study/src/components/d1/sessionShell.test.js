// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { buildD1DrillRows, buildD1ExplainRight } from './sessionShell.js';

describe('buildD1DrillRows — 응용 행 (D1)', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('kr 음차 줄 렌더 (RealClass 발음 가이드)', () => {
    const rows = buildD1DrillRows([
      { en: "Let's make it happen.", ko: '한번 되게 만들어 보자.', kr: '렛츠 메이킷 해픈.' },
    ], [], 'en');
    rows.forEach((r) => document.body.appendChild(r));
    const kr = document.querySelector('.d1-drill .d1-drill-kr');
    expect(kr).toBeTruthy();
    expect(kr.textContent).toBe('렛츠 메이킷 해픈.');
  });

  it('kr 없음: 음차 줄 미생성 (구 시드 호환)', () => {
    const rows = buildD1DrillRows([{ en: 'Fire away.', ko: '얼마든지요.' }], [], 'en');
    rows.forEach((r) => document.body.appendChild(r));
    expect(document.querySelector('.d1-drill .d1-drill-kr')).toBeNull();
  });
});

describe('buildD1ExplainRight — 우측 해설 (D1, phone 패널과 섹션 parity)', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  const ex = {
    key: 'make X happen = X가 실현되게 만들다.',
    situation: '장면 · 브레인스토밍',
    grammar: [{ struct: 'make + 목적어 + happen', body: '~을 되게 만들다.' }],
    chunks: [['make this park', '메익 디스 파크'], ['happen', '해픈']],
    phonemes: [['/ə/', 'happen']],
    mistake: 'happen 뒤 to부정사 X.',
    similar: 'pull it off',
  };

  function labelsOf(el) {
    return [...el.querySelectorAll('.d1-panel-lab')].map((n) => n.textContent);
  }

  it('grammar → "문법 뜯어보기" 섹션 (struct + body)', () => {
    const el = buildD1ExplainRight(ex, 'en');
    document.body.appendChild(el);
    expect(labelsOf(el)).toContain('문법 뜯어보기');
    expect(el.textContent).toContain('make + 목적어 + happen');
    expect(el.textContent).toContain('~을 되게 만들다.');
  });

  it('chunks → "발음 — 청크 단위" 섹션 (en + kr 음차)', () => {
    const el = buildD1ExplainRight(ex, 'en');
    document.body.appendChild(el);
    expect(labelsOf(el)).toContain('발음 — 청크 단위');
    expect(el.textContent).toContain('메익 디스 파크');
  });

  it('phonemes → "주의 음소" 섹션 (ipa + 단어)', () => {
    const el = buildD1ExplainRight(ex, 'en');
    document.body.appendChild(el);
    expect(labelsOf(el)).toContain('주의 음소');
    expect(el.textContent).toContain('/ə/');
  });

  it('3필드 없음: 해당 섹션 hidden (구 시드 호환)', () => {
    const el = buildD1ExplainRight({ key: 'x', mistake: 'y' }, 'en');
    document.body.appendChild(el);
    const labels = labelsOf(el);
    expect(labels).not.toContain('문법 뜯어보기');
    expect(labels).not.toContain('발음 — 청크 단위');
    expect(labels).not.toContain('주의 음소');
  });
});

// ── 2026-06-10 녹음 상태·점수 안착·반복 진행 (사용자 지시) ──
import { vi } from 'vitest';
import { bumpRecLog, REC_TARGET, buildD1Practice } from './sessionShell.js';

vi.mock('../../services/sessionAnalyze.js', () => ({
  startMicRecording: vi.fn(async () => ({ controller: {} })),
  stopAndAnalyze: vi.fn(async () => ({ score: 88, weakPhonemes: [] })),
}));
vi.mock('../session/recordToast.js', () => ({
  showRecordToast: vi.fn(),
  recordErrorMessage: vi.fn(() => '에러'),
}));
vi.mock('../../services/pronunciationLog.js', () => ({ savePronunciationLog: vi.fn(async () => null) }));
vi.mock('../../services/weakPhonemes.js', () => ({ applyWeakPhonemesUpdate: vi.fn(async () => null) }));

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('recLog — 반복 진행·게이트 (순수)', () => {
  it('bumpRecLog: count 누적 + best 최대값 유지', () => {
    const state = {};
    bumpRecLog(state, 'c1', 70);
    bumpRecLog(state, 'c1', 92);
    const out = bumpRecLog(state, 'c1', 85);
    expect(out).toEqual({ count: 3, best: 92 });
    expect(state.recLog.c1).toEqual({ count: 3, best: 92 });
  });

  // canAdvance 는 2026-09-04 게이트 폐지로 삭제 — REC_TARGET 은 D1 진행 점(buildRecDots)만 쓴다.
  it('REC_TARGET 은 D1 진행 점 개수', () => {
    expect(REC_TARGET).toBe(3);
  });
});

describe('buildD1Practice — 녹음 후 버튼 상태·점수 안착·진행 점', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  function makeState() {
    return {
      sentence: { id: 'c1', sentence: 'Is that a promise?', speaker: null },
      recording: false, lastScore: null, tried: 0, passed: 0,
      pronScores: [], weakInSession: {}, recLog: {},
    };
  }

  it('녹음 1회 완료 → recLog 1회 + 진행 점 1개 on + 점수 칩 안착(score-pop) + pulse 해제', async () => {
    const state = makeState();
    const p = buildD1Practice(state, 'en', {});
    document.body.append(p.recBtn, p.scoreRow);
    expect(p.recBtn.classList.contains('d1-pulse')).toBe(true); // 클릭 유도 (녹음 전)
    p.recBtn.click(); await tick();          // 시작
    p.recBtn.click(); await tick(); await tick(); // 멈춤 + 채점
    expect(state.recLog.c1).toEqual({ count: 1, best: 88 });
    const dots = p.scoreRow.querySelectorAll('.d1-recdots i.on');
    expect(dots.length).toBe(1);
    const chip = p.scoreRow.querySelector('.d1-score');
    expect(chip.style.display).not.toBe('none');
    expect(chip.classList.contains('score-pop')).toBe(true); // 팝업 애니 후 안착
    expect(p.recBtn.classList.contains('d1-pulse')).toBe(false); // 달성 후 상태 변화
  });

  it('재진입(카드 복귀) 시 recLog 의 best 점수·진행 점 복원', () => {
    const state = makeState();
    state.recLog = { c1: { count: 2, best: 91 } };
    const p = buildD1Practice(state, 'en', {});
    document.body.append(p.recBtn, p.scoreRow);
    expect(p.scoreRow.querySelectorAll('.d1-recdots i.on').length).toBe(2);
    expect(p.scoreRow.querySelector('.d1-score .sc').textContent).toBe('91');
    expect(p.recBtn.classList.contains('d1-pulse')).toBe(false);
  });
});

describe('buildD1DrillRows — 응용 녹음 후 행 상태·점수 배지 안착', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('녹음 완료 → 행에 점수 배지(d1-chip-score) 안착 + 칩 rec-done + "다시 녹음"', async () => {
    const rows = buildD1DrillRows([{ en: 'Fill in the blanks.', ko: '빈칸을 채우세요.', kr: '필린 더 블랭크스.' }], [], 'en');
    rows.forEach((r) => document.body.appendChild(r));
    const chip = document.querySelector('.d1-drill button.d1-chip:last-of-type');
    chip.click(); await tick();          // 시작
    chip.click(); await tick(); await tick(); // 멈춤 + 채점
    const badge = document.querySelector('.d1-drill .d1-chip-score');
    expect(badge).toBeTruthy();
    expect(badge.textContent).toContain('88');
    expect(chip.classList.contains('rec-done')).toBe(true);
    expect(chip.textContent).toContain('다시 녹음');
  });
});
