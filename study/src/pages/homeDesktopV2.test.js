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
