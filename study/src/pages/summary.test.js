// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mountSummary } from './summary.js';

const HOST_HTML = `
  <div id="root">
    <div id="timeVal"></div>
    <div id="newN"></div>
    <div id="gotN"></div>
    <div id="hmmN"></div>
    <div id="noN"></div>
    <div id="tryN"></div>
    <div id="passN"></div>
    <div id="pronAvg"></div>
    <div class="pron-line"></div>
    <button id="btnDone">확인 · 홈으로</button>
    <button id="btnStats">이번 달 통계 보기</button>
  </div>
`;

function setSummary(data) {
  sessionStorage.setItem('studySummary', JSON.stringify(data));
}

describe('mountSummary — btnDone 라벨 returnTo 분기', () => {
  beforeEach(() => {
    // 이 스위트는 모바일 summary(mock 채우기 경로 · #btnDone)를 검증한다.
    // jsdom 기본 innerWidth=1024 는 데스크탑 D1 분기를 타므로 모바일 폭으로 고정.
    window.innerWidth = 375;
    document.body.innerHTML = HOST_HTML;
    sessionStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it('returnTo=stats 시 "확인 · 캘린더로"', () => {
    setSummary({ mode: 'review', returnTo: 'stats', total: 5, durationSec: 60, judged: { got: 3, hmm: 1, no: 1 }, tryCount: 5, passCount: 3 });
    mountSummary(document.getElementById('root'));
    expect(document.getElementById('btnDone').textContent).toBe('확인 · 캘린더로');
  });

  it('returnTo=sentList 시 "확인 · 문장 목록으로"', () => {
    setSummary({ mode: 'review', returnTo: 'sentList', total: 1, durationSec: 30, judged: { got: 1, hmm: 0, no: 0 }, tryCount: 1, passCount: 1 });
    mountSummary(document.getElementById('root'));
    expect(document.getElementById('btnDone').textContent).toBe('확인 · 문장 목록으로');
  });

  it('returnTo=home 시 mock default "확인 · 홈으로" 유지', () => {
    setSummary({ mode: 'review', returnTo: 'home', total: 5, durationSec: 60, judged: { got: 3, hmm: 1, no: 1 }, tryCount: 5, passCount: 3 });
    mountSummary(document.getElementById('root'));
    expect(document.getElementById('btnDone').textContent).toBe('확인 · 홈으로');
  });

  it('returnTo 미설정 시 home 폴백 ("확인 · 홈으로")', () => {
    setSummary({ mode: 'review', total: 5, durationSec: 60, judged: { got: 3, hmm: 1, no: 1 }, tryCount: 5, passCount: 3 });
    mountSummary(document.getElementById('root'));
    expect(document.getElementById('btnDone').textContent).toBe('확인 · 홈으로');
  });
});

describe('mountSummary — btnDone 클릭 라우팅', () => {
  beforeEach(() => {
    window.innerWidth = 375; // 모바일 경로 검증 (위 스위트 주석 참조)
    document.body.innerHTML = HOST_HTML;
    sessionStorage.clear();
    window.location.hash = '';
  });

  it('returnTo=stats 클릭 → #/stats', () => {
    setSummary({ mode: 'review', returnTo: 'stats', total: 5, durationSec: 60, judged: { got: 3, hmm: 1, no: 1 }, tryCount: 5, passCount: 3 });
    mountSummary(document.getElementById('root'));
    document.getElementById('btnDone').click();
    expect(window.location.hash).toBe('#/stats');
  });

  it('returnTo=sentList 클릭 → #/stats?tab=sent', () => {
    setSummary({ mode: 'review', returnTo: 'sentList', total: 1, durationSec: 30, judged: { got: 1, hmm: 0, no: 0 }, tryCount: 1, passCount: 1 });
    mountSummary(document.getElementById('root'));
    document.getElementById('btnDone').click();
    expect(window.location.hash).toBe('#/stats?tab=sent');
  });

  it('returnTo=home 클릭 → #/home', () => {
    setSummary({ mode: 'review', returnTo: 'home', total: 5, durationSec: 60, judged: { got: 3, hmm: 1, no: 1 }, tryCount: 5, passCount: 3 });
    mountSummary(document.getElementById('root'));
    document.getElementById('btnDone').click();
    expect(window.location.hash).toBe('#/home');
  });

  it('returnTo 미설정 클릭 → #/home', () => {
    setSummary({ mode: 'review', total: 5, durationSec: 60, judged: { got: 3, hmm: 1, no: 1 }, tryCount: 5, passCount: 3 });
    mountSummary(document.getElementById('root'));
    document.getElementById('btnDone').click();
    expect(window.location.hash).toBe('#/home');
  });
});
