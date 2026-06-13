// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mountSummary } from './summary.js';

// renderSummaryV2 는 host.innerHTML='' 후 .vy-pri/.vy-ghost 버튼을 렌더한다(구 #btnDone id 폐기).
// 데이터 source: sessionStorage 'studySummary'.

function setSummary(data) {
  sessionStorage.setItem('studySummary', JSON.stringify(data));
}

function mount() {
  document.body.innerHTML = '<div id="root"></div>';
  mountSummary(document.getElementById('root'));
}

const REVIEW_BASE = { mode: 'review', total: 5, durationSec: 60, judged: { got: 3, hmm: 1, no: 1 }, tryCount: 5, passCount: 3 };

describe('mountSummary(V2) — 복습 완료 CTA(.vy-pri) returnTo 라벨', () => {
  beforeEach(() => {
    window.innerWidth = 375; // pickSize → phone (모바일 분기)
    sessionStorage.clear();
    window.location.hash = '';
  });
  afterEach(() => sessionStorage.clear());

  it('returnTo=stats → "확인 · 캘린더로"', () => {
    setSummary({ ...REVIEW_BASE, returnTo: 'stats' });
    mount();
    expect(document.querySelector('.vy-pri').textContent.trim()).toBe('확인 · 캘린더로');
  });

  it('returnTo=sentList → "확인 · 문장 목록으로"', () => {
    setSummary({ ...REVIEW_BASE, returnTo: 'sentList' });
    mount();
    expect(document.querySelector('.vy-pri').textContent.trim()).toBe('확인 · 문장 목록으로');
  });

  it('returnTo=home → "확인"', () => {
    setSummary({ ...REVIEW_BASE, returnTo: 'home' });
    mount();
    expect(document.querySelector('.vy-pri').textContent.trim()).toBe('확인');
  });

  it('returnTo 미설정 → "확인" (home 폴백)', () => {
    setSummary({ ...REVIEW_BASE });
    mount();
    expect(document.querySelector('.vy-pri').textContent.trim()).toBe('확인');
  });
});

describe('mountSummary(V2) — 복습 완료 .vy-pri 클릭 라우팅', () => {
  beforeEach(() => {
    window.innerWidth = 375;
    sessionStorage.clear();
    window.location.hash = '';
  });
  afterEach(() => sessionStorage.clear());

  it('returnTo=stats 클릭 → #/stats', () => {
    setSummary({ ...REVIEW_BASE, returnTo: 'stats' });
    mount();
    document.querySelector('.vy-pri').click();
    expect(window.location.hash).toBe('#/stats');
  });

  it('returnTo=sentList 클릭 → #/stats?tab=sent', () => {
    setSummary({ ...REVIEW_BASE, returnTo: 'sentList' });
    mount();
    document.querySelector('.vy-pri').click();
    expect(window.location.hash).toBe('#/stats?tab=sent');
  });

  it('returnTo=home 클릭 → #/home', () => {
    setSummary({ ...REVIEW_BASE, returnTo: 'home' });
    mount();
    document.querySelector('.vy-pri').click();
    expect(window.location.hash).toBe('#/home');
  });
});

describe('mountSummary(V2) — 신규 학습 완료 CTA(2버튼)', () => {
  beforeEach(() => {
    window.innerWidth = 375;
    sessionStorage.clear();
    window.location.hash = '';
  });
  afterEach(() => sessionStorage.clear());

  it('신규(normal) 모드 → .vy-pri "복습 이어서 하기" + .vy-ghost "홈으로"', () => {
    setSummary({ mode: 'normal', returnTo: 'home', total: 8, durationSec: 1080, judged: { got: 6, hmm: 1, no: 1 }, tryCount: 15, passCount: 11, newCount: 3 });
    mount();
    expect(document.querySelector('.vy-pri').textContent).toContain('복습 이어서 하기');
    expect(document.querySelector('.vy-ghost').textContent.trim()).toBe('홈으로');
  });

  it('신규 .vy-pri 클릭 → #/session-review', () => {
    setSummary({ mode: 'normal', returnTo: 'home', total: 8, durationSec: 1080, judged: { got: 6, hmm: 1, no: 1 }, tryCount: 15, passCount: 11, newCount: 3 });
    mount();
    document.querySelector('.vy-pri').click();
    expect(window.location.hash).toBe('#/session-review');
  });
});
