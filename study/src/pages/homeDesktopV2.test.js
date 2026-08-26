// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderHomeDesktopV2, renderHomeMobileV2 } from './homeDesktopV2.js';

function baseState(over = {}) {
  return {
    size: 'desktop', lang: 'en', resume: null,
    newCount: 5, reviewCount: 2, totalReview: 10,
    todayNewDone: 0, todayReviewDone: 0, tried: 0, passed: 0,
    weekUtter: 0, weekPass: 0, streak: 1, bestStreak: 1, speechTarget: 30,
    sessionTitle: '', pronBars: [], grass: null, cumExpr: 0, cumUtter: 0,
    cumMaster: 0, weekDoneText: '', pronAvg: 0, pronDelta: 0,
    ...over,
  };
}

describe('홈 진행중 세션 표시 — activeSession resume 반영 (stale state.phase 캐시 버그)', () => {
  it('데스크톱: 직전 fresh 렌더 후 resume="new" 설정 시 "이어서 하기" 로 갱신된다', () => {
    const state = baseState();
    renderHomeDesktopV2(state);            // 1차 렌더 (resume=null → fresh)
    state.resume = 'new';                  // loadActiveSession 스냅샷 반영 시뮬
    const el = renderHomeDesktopV2(state); // 2차 렌더 — 진행중 세션
    expect(el.textContent).toContain('이어서 하기');
  });

  it('모바일: 직전 fresh 렌더 후 resume="new" 설정 시 "이어서 하기" 로 갱신된다', () => {
    const state = baseState({ size: 'phone' });
    renderHomeMobileV2(state);
    state.resume = 'new';
    const el = renderHomeMobileV2(state);
    expect(el.textContent).toContain('이어서 하기');
  });

  it('데스크톱: resume=null + 신규 0 + 진행기록 있음 → "done" 전환 (fresh 캐시에 막히지 않음)', () => {
    const state = baseState();
    renderHomeDesktopV2(state);            // fresh 캐시
    Object.assign(state, { newCount: 0, todayNewDone: 5 }); // 오늘 신규 완료
    const el = renderHomeDesktopV2(state);
    expect(el.textContent).not.toContain('학습 시작'); // fresh CTA 아니어야
  });
});

/* 2026-08-23 — done 단계 문구가 (1) pronAvg 를 '점'으로 표기하고 (2) 비교 없이 '이번 주 최고
 * 기록이에요' 를 무조건 붙였다. pronAvg 는 실제로 이번 주 발화(수학은 문제) 수다(home.js loadStats).
 * 기록으로 동기를 만드는 앱에서 가짜 기록 문구는 나머지 숫자의 신뢰까지 깎는다. */
describe('홈 done 단계 문구 — 가짜 기록 주장 제거', () => {
  const doneState = (over = {}) => baseState({
    newCount: 0, reviewCount: 0, totalReview: 89, todayNewDone: 4, todayReviewDone: 6,
    weekUtter: 214, pronAvg: 214, streak: 12, bestStreak: null, ...over,
  });

  it('비교하지 않은 "최고 기록" 주장을 하지 않는다', () => {
    const el = renderHomeMobileV2(doneState());
    expect(el.querySelector('.vh-msg').textContent).not.toMatch(/최고 기록/);
  });

  it('발화 수를 "점"이 아니라 "회"로 표기한다', () => {
    const el = renderHomeMobileV2(doneState());
    const t = el.querySelector('.vh-msg').textContent;
    expect(t).toMatch(/214회/);
    expect(t).not.toMatch(/214점/);
  });

  it('수학은 "문제"로 표기한다', () => {
    const el = renderHomeMobileV2(doneState({ lang: 'math' }));
    const t = el.querySelector('.vh-msg').textContent;
    expect(t).toMatch(/214문제/);
    expect(t).not.toMatch(/214회/);
  });

  it('bestStreak > streak → "최고 기록까지 N일"', () => {
    const el = renderHomeMobileV2(doneState({ streak: 12, bestStreak: 18 }));
    expect(el.querySelector('.vh-streak').textContent).toMatch(/최고 기록까지 6일/);
  });

  it('현재 연속이 최고 기록과 같으면 경신 중으로 표기 (— 최고 기록까지 0일 금지)', () => {
    const el = renderHomeMobileV2(doneState({ streak: 12, bestStreak: 12 }));
    const t = el.querySelector('.vh-streak').textContent;
    expect(t).not.toMatch(/까지 0일/);
    expect(t).toMatch(/최고 기록/);
  });
});

/* bestStreak = 현재 연속을 제외한 '이전 최고'. 0 이면 주장할 기록이 없다. */
describe('홈 연속 문구 — 이전 최고 기준', () => {
  const st = (over) => baseState({
    newCount: 0, reviewCount: 0, totalReview: 89, todayNewDone: 4, todayReviewDone: 6,
    weekUtter: 10, pronAvg: 10, ...over,
  });

  it('이전 기록 없음(0) → 기록 문구를 붙이지 않는다', () => {
    const t = renderHomeMobileV2(st({ streak: 1, bestStreak: 0 })).querySelector('.vh-streak').textContent;
    expect(t).toBe('1일 연속 달성');
  });

  it('이전 최고를 넘어섬 → 경신 중', () => {
    expect(renderHomeMobileV2(st({ streak: 4, bestStreak: 3 })).querySelector('.vh-streak').textContent)
      .toMatch(/최고 기록 경신 중/);
  });

  it('이전 최고와 동률 → 타이 (경신 아님)', () => {
    const t = renderHomeMobileV2(st({ streak: 3, bestStreak: 3 })).querySelector('.vh-streak').textContent;
    expect(t).toMatch(/최고 기록 타이/);
    expect(t).not.toMatch(/경신 중/);
  });

  it('이전 최고에 못 미침 → 남은 일수', () => {
    expect(renderHomeMobileV2(st({ streak: 3, bestStreak: 5 })).querySelector('.vh-streak').textContent)
      .toMatch(/최고 기록까지 2일/);
  });
});

/* 홈 v3 — 기록/갱신 (작업지시서 §5 · QA §13 '홈'). 기록이 보여야 갱신 욕구가 생긴다는 게 설계 의도라
 * 화면이 무엇을 주장하는지(분모·기록일·오늘)를 테스트로 못박는다. */
describe('홈 v3 — 최근 4주 캘린더 · 오늘 발화 링 · CTA', () => {
  const v3 = (over = {}) => baseState({
    todayISO: '2026-08-25', // 화요일
    dayMap: { '2026-08-20': 31, '2026-08-22': 34, '2026-08-24': 12 },
    cumStudySec: 151800, // 42시간 10분
    cumUtter: 1120, cumExpr: 201, cumMaster: 98, prDays: [],
    tried: 30, ...over,
  });

  it('캘린더가 4주(28칸)이고 미학습 날은 채색이 없다', () => {
    const el = renderHomeDesktopV2(v3());
    expect(el.querySelectorAll('.vh-cell')).toHaveLength(28);
    // 8/21(금)은 학습 기록 없음 → t0 (흰 배경 + 테두리)
    expect(el.querySelectorAll('.vh-cell.t0').length).toBeGreaterThan(0);
  });

  it('오늘 칸에 today 클래스(vh-today 펄스) + 텍스트 "오늘", 미래 칸은 fut 이다', () => {
    const el = renderHomeDesktopV2(v3());
    const t = el.querySelectorAll('.vh-cell.today');
    expect(t).toHaveLength(1);
    expect(t[0].querySelector('.vv').textContent).toBe('오늘'); // 오늘 숫자는 링이 말한다 (§5.3)
    expect(el.querySelectorAll('.vh-cell.fut')).toHaveLength(5); // 8/26~8/30
  });

  it('개인기록 달성일은 코랄 칸(pr)이다', () => {
    const el = renderHomeDesktopV2(v3({ prDays: ['2026-08-22'] }));
    const pr = el.querySelectorAll('.vh-cell.pr');
    expect(pr).toHaveLength(1);
    expect(pr[0].textContent).toContain('34');
  });

  it('링 분모는 직전 학습일 발화 수 — 고정 목표가 아니다', () => {
    const el = renderHomeDesktopV2(v3({ tried: 8 }));
    expect(el.querySelector('.vh-ring2 .pv').textContent).toBe('직전 12회'); // 8/24
    expect(el.querySelector('.vh-ring2 .n').textContent).toBe('8');
    expect(el.textContent).not.toMatch(/30회/);   // 옛 고정 목표(speechTarget) 분모 금지
    expect(el.textContent).not.toMatch(/일 최고/); // 링은 갱신 축만 (§5.4)
  });

  it('직전 학습일이 없으면 분모를 지어내지 않는다', () => {
    const el = renderHomeDesktopV2(v3({ dayMap: {} }));
    expect(el.querySelector('.vh-ring2 .pv')).toBeNull();
  });

  it('직전 학습일을 넘기면 코랄 링 + 직전 N회 취소선 + 확산 펄스', () => {
    const el = renderHomeDesktopV2(v3({ tried: 41 }));
    expect(el.querySelector('.vh-ring2 .pv').classList.contains('over')).toBe(true);
    expect(el.querySelector('.vh-ring2 .pl')).not.toBeNull();
    expect(el.querySelector('.vh-ring2 .arc').getAttribute('stroke')).toContain('58%'); // coral
    expect(el.querySelector('.vh-ring2 .arc').getAttribute('stroke-dashoffset')).toBe('0');
  });

  it('날짜는 한국어 표기 (영문 날짜 금지)', () => {
    const el = renderHomeDesktopV2(v3());
    expect(el.querySelector('.vh-todayhd .d').textContent).toBe('8월 25일 화요일');
    expect(el.textContent).not.toMatch(/August|Tuesday/);
  });

  it('"학습 시작" 버튼은 화면에 하나뿐이고, 문장 모아보기 진입이 있다', () => {
    const el = renderHomeDesktopV2(v3());
    const starts = [...el.querySelectorAll('.vh-cta')].filter((b) => b.textContent.includes('학습 시작'));
    expect(starts).toHaveLength(1);
    expect(el.textContent).toContain('문장 모아보기');
  });

  it('누적 4열 — 공부 시간은 시/분으로 쪼개 표기', () => {
    const el = renderHomeDesktopV2(v3());
    const cum = el.querySelector('.vh-cum');
    expect(cum.children).toHaveLength(4);
    expect(cum.children[0].textContent).toBe('누적 공부 시간42시간 10분');
    expect(cum.children[1].textContent).toContain('1,120');
  });

  it('주 발화 4블록 — 최고 주는 코랄, 진행 중인 주는 직전 주 위치에 고스트 점', () => {
    const el = renderHomeDesktopV2(v3());
    const wks = el.querySelectorAll('.vh-wk');
    expect(wks).toHaveLength(4);
    expect(wks[3].classList.contains('now')).toBe(true);
    expect(wks[3].querySelector('.tr > b')).not.toBeNull(); // 직전 주 고스트 점
    expect(el.querySelector('.vh-wk.best .v').textContent).toContain('최고');
  });
});
