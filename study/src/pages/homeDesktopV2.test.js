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
