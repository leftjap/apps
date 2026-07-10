// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';

// 체이닝 실경로(비-demo) 검증용 — 데모 경로 테스트들은 services 를 타지 않으므로 영향 없음.
vi.mock('../services/sessionAnalyze.js', () => ({
  startMicRecording: vi.fn(async () => ({ controller: { stop() {} } })),
  stopAndAnalyze: vi.fn(async () => ({ score: 88, omissions: [] })),
}));
vi.mock('../components/session/recordToast.js', () => ({ showRecordToast: vi.fn(), recordErrorMessage: vi.fn(() => '에러') }));

import { renderSessionReviewV2, isRecallMode } from './sessionReviewV2.js';

const tick = () => new Promise((r) => setTimeout(r, 0));

function renderEmpty(size) {
  document.body.innerHTML = '<div id="root"></div>';
  const host = document.getElementById('root');
  renderSessionReviewV2(host, { cards: [], total: 0, step: 1, size }, {});
  return host;
}

describe('renderSessionReviewV2 — 빈 상태(total=0) 반응형', () => {
  it('모바일(phone) 빈 상태는 데스크톱 레일(.vr-rail) 대신 모바일 셸(.m-topb)을 렌더한다', () => {
    const host = renderEmpty('phone');
    expect(host.querySelector('.vr-rail')).toBeNull();        // 데스크톱 88px 레일 없어야
    expect(host.querySelector('.vr-main')).toBeNull();        // width:760px 본문 없어야 (375 팽창 원인)
    expect(host.querySelector('.m-topb')).not.toBeNull();     // 모바일 상단바 있어야
    expect(host.textContent).toContain('복습할 문장이 없어요'); // 메시지 유지
  });

  it('데스크톱(desktop) 빈 상태는 기존 레일(.vr-rail)을 그대로 유지한다', () => {
    const host = renderEmpty('desktop');
    expect(host.querySelector('.vr-rail')).not.toBeNull();
    expect(host.textContent).toContain('복습할 문장이 없어요');
  });
});

const EN = 'Thank you so much for coming.';
const KO = '와 주셔서 정말 감사합니다.';
const CHUNKS = [['Thank you', '땡큐'], ['so much', '쏘 머치'], ['for coming', '포 커밍']];

function mountCard({ interval, lang = 'en', sentence = EN, ko = KO, chunks = CHUNKS, size = 'desktop', demo = false, handlers = {} }) {
  document.body.innerHTML = '<div id="root"></div>';
  const host = document.getElementById('root');
  const explanation = { key: `${sentence} = ${ko}`, chunks };
  const s = { id: 'c1', lang, sentence, ko, explanation };
  const card = { id: 'c1', lang, sentence, meaning: ko, interval, explanation };
  const state = { cards: [card], total: 1, step: 1, size, sentence: s, time: '00:00', recLog: {}, tried: 0, demo, micBlocked: false };
  renderSessionReviewV2(host, state, handlers);
  return host;
}

/* 2026-07-10 사용자 결정 — 복습 단계(rung 1/2/3)를 폐기하고 단일 모드로.
 * 근거: (a) interval≥21 이라야 닿는 3단계가 사실상 안 쓰였고 (오늘 due 15장 전부 interval 1),
 *       (b) 1단계는 영어를 보여준 채 "떠올려 보세요"라 인출이 아니라 낭독이었으며,
 *       (c) 그 낭독 발음 점수가 SRS 간격을 정하고 있었다.
 * 힌트는 두지 않는다 — 미리 주는 단서는 인출을 쉽게 만들어 이득의 근거가 없다
 * (Pyc & Rawson 2009 / Smith et al. 2016). 실패는 그대로 두고 정답을 공개한다 (Kornell et al. 2009). */
describe('isRecallMode — 영어는 항상 한글→영어 회상, 일본어는 현행 유지', () => {
  it('영어는 회상 모드 (interval 무관)', () => {
    expect(isRecallMode('en')).toBe(true);
  });
  it('일본어·미정은 회상 모드 아님 (문장을 그대로 보여줌)', () => {
    expect(isRecallMode('ja')).toBe(false);
    expect(isRecallMode(undefined)).toBe(false);
    expect(isRecallMode(null)).toBe(false);
  });
});

describe('renderSessionReviewV2 — 회상 프롬프트 (한글만, 영어 숨김)', () => {
  it('영어는 interval 과 무관하게 한글 뜻 + 단어 수를 보여주고 영어를 숨긴다', () => {
    for (const interval of [1, 3, 7, 21, 60]) {
      const host = mountCard({ interval });
      expect(host.querySelector('.vr-h1').textContent).toBe(KO);
      expect(host.querySelector('.vr-card').textContent).not.toContain('Thank you');
      expect(host.querySelector('.vr-card').textContent).toContain('6단어'); // 정답 범위를 좁혀줌
    }
  });

  it('일본어는 문장을 그대로 표시 (일본어 경로 불변 — 회귀 방지)', () => {
    const host = mountCard({ interval: 60, lang: 'ja', sentence: 'ありがとうございます。', ko: '감사합니다.', chunks: [['ありがとう', '아리가또'], ['ございます', '고자이마스']] });
    expect(host.querySelector('.vr-h1').textContent).toBe('ありがとうございます。');
    expect(host.querySelector('.vr-listen').disabled).toBe(false); // 숨김이 없으니 듣기도 즉시 가능
  });

  it('공개 전에는 듣기 버튼이 잠긴다 (정답 오디오 유출 방지)', () => {
    expect(mountCard({ interval: 1 }).querySelector('.vr-listen').disabled).toBe(true);
  });

  it('힌트 사다리를 두지 않는다 — 안내문만', () => {
    const host = mountCard({ interval: 1 });
    expect(host.querySelector('.vr-hint').textContent).toContain('떠올려');
    expect(host.textContent).not.toContain('힌트');
  });
});

/* 체이닝 재시험 — 자막 없이 '한 번 듣고 전체 재현', 실패 시 단계 폴백 (2026-07-09). */
describe('renderSessionReviewV2 — 체이닝 재시험 렌더', () => {
  const CHAIN = {
    target: "Let's just move on to the next thing. It's over anyway.",
    chunks: ["Let's just move on", 'to the next thing', "It's over anyway"],
    ko: '그냥 다음 걸로 넘어가자. 어차피 끝난 일이야.',
  };
  function mountWithChain(size, chain = CHAIN, demo = false) {
    document.body.innerHTML = '<div id="root"></div>';
    const host = document.getElementById('root');
    const explanation = { key: 'k', chunks: CHUNKS, chain };
    const s = { id: 'c1', lang: 'en', sentence: EN, ko: KO, explanation };
    const card = { id: 'c1', lang: 'en', sentence: EN, meaning: KO, interval: 1, explanation };
    const state = { cards: [card], total: 1, step: 1, size, sentence: s, time: '00:00', recLog: {}, tried: 0, demo };
    renderSessionReviewV2(host, state, {});
    return host;
  }

  it('데스크톱: 전체 재현 행을 렌더하고, 영어 원문은 화면에 노출되지 않는다(자막 없음)', () => {
    const host = mountWithChain('desktop');
    const chain = host.querySelector('.vr-chain');
    expect(chain).not.toBeNull();
    expect(chain.textContent).toContain('체이닝 재시험');
    expect(host.querySelector('.vr-chain-full')).not.toBeNull();
    expect(host.textContent).not.toContain('move on to the next thing');
    expect(host.textContent).not.toContain("It's over anyway");
  });

  it('단계 폴백은 처음엔 숨겨져 있다 (전체 재현이 먼저)', () => {
    const host = mountWithChain('desktop');
    expect(host.querySelectorAll('.vr-chain-step').length).toBe(3); // 청크 수만큼 준비는 됨
    expect(host.querySelector('.vr-chain-steps').style.display).toBe('none'); // 감춰짐
  });

  it('모바일 셸에도 렌더된다', () => {
    expect(mountWithChain('phone').querySelector('.vr-chain')).not.toBeNull();
  });

  /* chain.target 은 기본문장을 통째로 품는다 (실측 21/22 카드, 19개는 첫머리부터).
   * 영어를 숨긴 채 체이닝 '듣기'를 누르면 정답을 들려주는 셈 → 공개 전에는 감춘다. */
  it('정답 공개 전에는 체이닝 블록이 감춰진다 (chain 오디오가 기본문장을 포함)', () => {
    const host = mountWithChain('desktop');
    expect(host.querySelector('.vr-chain').style.display).toBe('none');
  });

  it('정답 공개 후 체이닝 블록이 열린다', () => {
    vi.useFakeTimers();
    try {
      const host = mountWithChain('desktop', CHAIN, true);
      host.querySelector('.vr-pill.pri').click();   // 회상 시도(데모)
      vi.advanceTimersByTime(1100);
      expect(host.querySelector('.vr-chain').style.display).not.toBe('none');
    } finally { vi.useRealTimers(); }
  });

  it('일본어는 체이닝을 즉시 노출 (숨김 모드가 아니므로)', () => {
    document.body.innerHTML = '<div id="root"></div>';
    const host = document.getElementById('root');
    const explanation = { key: 'k', chunks: CHUNKS, chain: CHAIN };
    const s = { id: 'c1', lang: 'ja', sentence: 'x', ko: 'ㅇ', explanation };
    const card = { id: 'c1', lang: 'ja', sentence: 'x', meaning: 'ㅇ', interval: 1, explanation };
    renderSessionReviewV2(host, { cards: [card], total: 1, step: 1, size: 'desktop', sentence: s, time: '00:00', recLog: {}, tried: 0 }, {});
    expect(host.querySelector('.vr-chain').style.display).not.toBe('none');
  });

  it('chain 없으면(또는 청크 1개) 체이닝 블록은 렌더되지 않는다', () => {
    expect(mountCard({ interval: 1 }).querySelector('.vr-chain')).toBeNull();
    expect(mountWithChain('desktop', { target: 'x', chunks: ['x'], ko: 'ㅇ' }).querySelector('.vr-chain')).toBeNull();
  });

  it('데모: 전체 재현 녹음 통과 → 완료 표시', () => {
    vi.useFakeTimers();
    try {
      const host = mountWithChain('desktop', CHAIN, true);
      host.querySelector('.vr-chain-full button[aria-label="녹음"]').click();
      vi.advanceTimersByTime(700);
      expect(host.querySelector('.vr-chain').textContent).toContain('체이닝 완료');
    } finally { vi.useRealTimers(); }
  });

  // 체이닝 발화는 '오늘 발화'로 세지만, 복습의 관문은 '떠올려 말하기'이므로 회상 게이트에는 안 넣는다.
  it('체이닝 발화 → tried/pronScores 집계, 회상 게이트(recLog)는 미반영', async () => {
    document.body.innerHTML = '<div id="root"></div>';
    const host = document.getElementById('root');
    const explanation = { key: 'k', chunks: CHUNKS, chain: CHAIN };
    const s = { id: 'c1', lang: 'en', sentence: EN, ko: KO, explanation };
    const card = { id: 'c1', lang: 'en', sentence: EN, meaning: KO, interval: 1, explanation };
    const state = { cards: [card], total: 1, step: 1, size: 'desktop', sentence: s, time: '00:00', recLog: {}, tried: 0, passed: 0, pronScores: [] };
    renderSessionReviewV2(host, state, {});

    const rec = host.querySelector('.vr-chain-full button[aria-label="녹음"]');
    rec.click(); await tick();                     // 녹음 시작
    rec.click(); await tick(); await tick();       // 멈춤 + 채점 (mock: score 88, omissions [])

    expect(state.tried).toBe(1);
    expect(state.pronScores).toEqual([88]);
    expect(state.passed).toBe(1);                  // 88 >= 80
    expect(state.recLog.c1).toBeUndefined();       // 회상 게이트엔 미포함
  });
});

/* 회상 시도 → 정답 공개 → 자기평가. 발음 점수는 SRS 에 관여하지 않는다(약점 음소 수집용). */
describe('renderSessionReviewV2 — 시도 후 정답 공개 + 자기평가 판정', () => {
  const recall = (host) => host.querySelector('.vr-pill.pri').click();

  it('녹음(데모) 후 숨겼던 영어 정답이 공개된다', () => {
    vi.useFakeTimers();
    try {
      const host = mountCard({ interval: 1, demo: true });
      expect(host.querySelector('.vr-h1').textContent).toBe(KO);
      recall(host);
      vi.advanceTimersByTime(1100);
      expect(host.querySelector('.vr-h1').textContent).toBe(EN);
      expect(host.querySelector('.vr-listen').disabled).toBe(false); // 듣기 해제
    } finally { vi.useRealTimers(); }
  });

  it('판정 버튼 3개(다시/애매/완료)를 렌더하고, 공개 전에는 비활성', () => {
    const host = mountCard({ interval: 1 });
    const btns = [...host.querySelectorAll('.judge-btn')];
    expect(btns.map((b) => b.dataset.kind)).toEqual(['no', 'hmm', 'got']);
    btns.forEach((b) => expect(b.disabled).toBe(true));
  });

  it('공개 후 판정 클릭 → onJudge(kind) 를 그대로 전달', () => {
    vi.useFakeTimers();
    const seen = [];
    try {
      const host = mountCard({ interval: 1, demo: true, handlers: { onJudge: (k) => seen.push(k) } });
      recall(host);
      vi.advanceTimersByTime(1100);
      host.querySelector('.judge-btn[data-kind="hmm"]').click();
      expect(seen).toEqual(['hmm']);
    } finally { vi.useRealTimers(); }
  });

  it('발음 점수만으로는 SRS 를 채점하지 않는다 (자기평가가 유일한 경로)', () => {
    vi.useFakeTimers();
    const seen = [];
    try {
      const host = mountCard({ interval: 1, demo: true, handlers: { onJudge: (k) => seen.push(k) } });
      recall(host);
      vi.advanceTimersByTime(1100);
      expect(host.querySelector('.vr-h1').textContent).toBe(EN); // 채점(84점)은 났지만
      expect(seen).toEqual([]);                                  // onJudge 는 호출되지 않음
    } finally { vi.useRealTimers(); }
  });

  it('마이크 불가(micBlocked)면 즉시 공개 + 판정 가능 (막다른 길 방지)', () => {
    document.body.innerHTML = '<div id="root"></div>';
    const host = document.getElementById('root');
    const s = { id: 'c1', lang: 'en', sentence: EN, ko: KO, explanation: { key: 'k', chunks: CHUNKS } };
    const card = { id: 'c1', lang: 'en', sentence: EN, meaning: KO, interval: 1, explanation: s.explanation };
    renderSessionReviewV2(host, { cards: [card], total: 1, step: 1, size: 'desktop', sentence: s, time: '00:00', recLog: {}, tried: 0, micBlocked: true }, {});
    expect(host.querySelector('.vr-h1').textContent).toBe(EN);
    expect(host.querySelector('.judge-btn[data-kind="got"]').disabled).toBe(false);
  });
});
