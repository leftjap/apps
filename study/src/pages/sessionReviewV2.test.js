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

/* 사용자 지시(2026-07-10): 해설을 펼치면 **신규 세션과 동일하게** 해설·응용문장·체이닝이 함께 뜬다.
 * 복습 전용이던 '전체 재현 → 단계 폴백'(.vr-chain) 변형은 폐기 — 화면만 보면 '전체 · 10단어'가 뭔지 알 수 없었다. */
describe('renderSessionReviewV2 — 해설 = 신규 세션과 동일(해설·응용문장·체이닝) + 하단 평가', () => {
  const CHAIN = {
    target: "Let's just move on to the next thing. It's over anyway.",
    chunks: ["Let's just move on", 'to the next thing', "It's over anyway"],
    ko: '그냥 다음 걸로 넘어가자. 어차피 끝난 일이야.',
  };
  const DRILLS = [
    { en: 'Thank you so much for coming.', ko: '와 주셔서 감사합니다.', kr: '땡큐' },
    { en: 'Did they thank you for coming?', ko: '고맙다고 했어?', kr: '디드' },
  ];
  let lastState;
  function mountFull(size = 'desktop', demo = false) {
    document.body.innerHTML = '<div id="root"></div>';
    const host = document.getElementById('root');
    const explanation = { key: 'k', situation: '상황', chunks: CHUNKS, drills: DRILLS, chain: CHAIN };
    const s = { id: 'c1', lang: 'en', sentence: EN, ko: KO, explanation };
    const card = { id: 'c1', lang: 'en', sentence: EN, meaning: KO, interval: 1, explanation };
    lastState = { cards: [card], total: 1, step: 1, size, sentence: s, time: '00:00', recLog: {}, tried: 0, passed: 0, pronScores: [], demo };
    renderSessionReviewV2(host, lastState, {});
    return host;
  }

  it('구 복습 전용 체이닝(.vr-chain / 전체 재현)은 더 이상 렌더되지 않는다', () => {
    const host = mountFull();
    expect(host.querySelector('.vr-chain')).toBeNull();
    expect(host.querySelector('.vr-chain-full')).toBeNull();
    expect(host.textContent).not.toContain('체이닝 재시험');
  });

  it('해설 안에 해설 패널 · 응용 연습 · 체이닝 · 평가가 이 순서로 들어있다', () => {
    const host = mountFull();
    const bd = host.querySelector('.vr-fold .bd');
    expect(bd.querySelector('.vs-panel')).not.toBeNull();      // 해설 (신규와 동일 컴포넌트)
    expect(bd.textContent).toContain('응용 연습');              // 응용문장
    expect(bd.querySelector('.vs-chain')).not.toBeNull();      // 체이닝 (신규와 동일)
    expect(bd.querySelector('.judge-row')).not.toBeNull();     // 평가는 맨 아래
    const order = [...bd.querySelectorAll('.vs-panel, .vs-chain, .judge-row')].map((el) => el.className.split(' ')[0]);
    expect(order).toEqual(['vs-panel', 'vs-chain', 'judge-row']);
  });

  it('응용 연습은 근접중복(base 반복)을 걸러 진짜 변주만 보여준다', () => {
    const bd = mountFull().querySelector('.vr-fold .bd');
    expect(bd.textContent).toContain('Did they thank you for coming?');  // 진짜 변주 → 유지
    expect(bd.querySelectorAll('.vs-drow .en').length).toBeGreaterThan(0);
  });

  it('체이닝은 자막이 없다 (신규와 동일 계약)', () => {
    const bd = mountFull().querySelector('.vr-fold .bd');
    const chain = bd.querySelector('.vs-chain');
    expect(chain.textContent).not.toContain('move on to the next thing');
    expect(chain.textContent).not.toContain("It's over anyway");
  });

  it('chain 없으면 체이닝 블록만 빠지고 해설·평가는 남는다', () => {
    const host = mountCard({ interval: 1 });
    expect(host.querySelector('.vs-chain')).toBeNull();
    expect(host.querySelector('.vr-fold .bd .vs-panel')).not.toBeNull();
    expect(host.querySelector('.vr-fold .judge-row')).not.toBeNull();
  });

  it('해설 안 체이닝 발화도 오늘 발화(tried/pronScores)로 집계된다', async () => {
    const host = mountFull('desktop', false);
    host.querySelector('.vr-fold .hd').click();          // 펼침
    const rec = host.querySelector('.vs-chain .vs-drow button[aria-label="녹음"]');
    rec.click(); await tick();
    rec.click(); await tick(); await tick();             // mock: score 88, omissions []
    expect(lastState.tried).toBe(1);
    expect(lastState.pronScores).toEqual([88]);
    expect(lastState.passed).toBe(1);                    // 88 >= PASS_THRESHOLD(80)
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

  /* 사용자 지시(2026-07-10): 평가는 해설 하단에. 해설을 펼치면 정답이 나오고 거기서 평가한다. */
  it('판정 버튼은 해설(fold) 안 하단에 있다 — 별도 CTA 바가 아니다', () => {
    const host = mountCard({ interval: 1 });
    expect(host.querySelector('.vr-fold .judge-row')).not.toBeNull();
    expect(host.querySelector('.m-cta')).toBeNull();
  });

  it('해설은 기본 접힘, 클릭하면 펼쳐진다', () => {
    const host = mountCard({ interval: 1 });
    const bd = host.querySelector('.vr-fold .bd');
    expect(bd.style.display).toBe('none');
    host.querySelector('.vr-fold .hd').click();
    expect(bd.style.display).not.toBe('none');
  });

  /* 발화는 전진 조건이 아니다 — 녹음 없이 해설만 펼쳐도 정답이 나오고 평가할 수 있다. */
  it('녹음 없이 해설을 펼치면 정답 공개 + 판정 활성 (발화는 전진 조건이 아님)', () => {
    const seen = [];
    const host = mountCard({ interval: 1, handlers: { onJudge: (k) => seen.push(k) } });
    expect(host.querySelector('.vr-h1').textContent).toBe(KO);
    host.querySelector('.vr-fold .hd').click();            // 해설 펼침
    expect(host.querySelector('.vr-h1').textContent).toBe(EN);
    expect(host.querySelector('.vr-listen').disabled).toBe(false);
    host.querySelector('.judge-btn[data-kind="got"]').click();
    expect(seen).toEqual(['got']);                          // 녹음 0회여도 전진
  });

  it('발화 카운터에 3회 목표를 표시하지 않는다 (게이트가 아니므로)', () => {
    const host = mountCard({ interval: 1 });
    expect(host.querySelector('.vr-say').textContent).not.toContain('/ 3');
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

  /* micBlocked 는 데모 모드가 세우는 플래그이기도 하다(session-review.js:206).
   * 여기에 자동 공개를 걸면 데모/마이크 없는 기기에서 정답이 그냥 노출된다.
   * 해설 펼침이 공개 경로이므로 막다른 길이 아니다 → 자동 공개하지 않는다. (2026-07-10) */
  it('micBlocked 여도 정답을 미리 열지 않는다 — 해설로만 공개', () => {
    document.body.innerHTML = '<div id="root"></div>';
    const host = document.getElementById('root');
    const s = { id: 'c1', lang: 'en', sentence: EN, ko: KO, explanation: { key: 'k', chunks: CHUNKS } };
    const card = { id: 'c1', lang: 'en', sentence: EN, meaning: KO, interval: 1, explanation: s.explanation };
    // 데모 경로(session-review.js:202-206)와 동일: demo + micBlocked 동시 세팅
    renderSessionReviewV2(host, { cards: [card], total: 1, step: 1, size: 'desktop', sentence: s, time: '00:00', recLog: {}, tried: 0, demo: true, micBlocked: true }, {});
    expect(host.querySelector('.vr-h1').textContent).toBe(KO);
    expect(host.querySelector('.vr-listen').disabled).toBe(true);
    expect(host.querySelector('.judge-btn[data-kind="got"]').disabled).toBe(true);
    host.querySelector('.vr-fold .hd').click();          // 마이크 없어도 해설로 열 수 있다
    expect(host.querySelector('.vr-h1').textContent).toBe(EN);
    expect(host.querySelector('.vr-listen').disabled).toBe(false);
    expect(host.querySelector('.judge-btn[data-kind="got"]').disabled).toBe(false);
  });
});
