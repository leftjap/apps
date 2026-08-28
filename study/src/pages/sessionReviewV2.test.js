// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

// 체이닝 실경로(비-demo) 검증용 — 데모 경로 테스트들은 services 를 타지 않으므로 영향 없음.
vi.mock('../services/sessionAnalyze.js', () => ({
  startMicRecording: vi.fn(async () => ({ controller: { stop() {} } })),
  stopAndAnalyze: vi.fn(async () => ({ score: 88, omissions: [] })),
}));
vi.mock('../components/session/recordToast.js', () => ({ showRecordToast: vi.fn(), recordErrorMessage: vi.fn(() => '에러') }));

import { localISODate } from '../utils/today.js';
import { renderSessionReviewV2, isRecallMode, recallHint } from './sessionReviewV2.js';
import { stopAndAnalyze } from '../services/sessionAnalyze.js';
import { showRecordToast } from '../components/session/recordToast.js';

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

function mountCard({ interval, lang = 'en', sentence = EN, ko = KO, chunks = CHUNKS, size = 'desktop', demo = false, handlers = {}, state: over = {} }) {
  document.body.innerHTML = '<div id="root"></div>';
  const host = document.getElementById('root');
  const explanation = { key: `${sentence} = ${ko}`, chunks };
  const s = { id: 'c1', lang, sentence, ko, explanation };
  const card = { id: 'c1', lang, sentence, meaning: ko, interval, explanation };
  const state = { cards: [card], total: 1, step: 1, size, sentence: s, time: '00:00', recLog: {}, tried: 0, demo, micBlocked: false, ...over };
  renderSessionReviewV2(host, state, handlers);
  return host;
}

/* 2026-07-10 사용자 결정 — 복습 단계(rung 1/2/3)를 폐기하고 단일 모드로.
 * 근거: (a) interval≥21 이라야 닿는 3단계가 사실상 안 쓰였고 (오늘 due 15장 전부 interval 1),
 *       (b) 1단계는 영어를 보여준 채 "떠올려 보세요"라 인출이 아니라 낭독이었으며,
 *       (c) 그 낭독 발음 점수가 SRS 간격을 정하고 있었다.
 * 힌트는 두지 않는다 — 미리 주는 단서는 인출을 쉽게 만들어 이득의 근거가 없다
 * (Pyc & Rawson 2009 / Smith et al. 2016). 실패는 그대로 두고 정답을 공개한다 (Kornell et al. 2009). */
describe('isRecallMode — 영어는 항상 회상, 일본어는 익은 뒤부터 회상', () => {
  it('영어는 회상 모드 (interval 무관)', () => {
    expect(isRecallMode('en')).toBe(true);
    expect(isRecallMode('en', 1)).toBe(true);
  });
  /* ja 2단계 (2026-08-28): 학습자가 히라가나만 읽고 한자를 거의 못 읽어, 처음부터 문장을 숨기면
   * 문자 장벽 때문에 회상이 아니라 좌절이 된다. interval < 3 (첫 두 번)은 일본어·가나·음차를
   * 띄워 따라 읽게 하고, 익은 뒤에만 숨겨 한글→일본어 회상으로 올린다. */
  it('일본어는 interval < 3 이면 문장 노출 (따라 읽기)', () => {
    expect(isRecallMode('ja', 0)).toBe(false);
    expect(isRecallMode('ja', 1)).toBe(false);
    expect(isRecallMode('ja', 2)).toBe(false);
  });
  it('일본어도 interval >= 3 이면 회상 모드', () => {
    expect(isRecallMode('ja', 3)).toBe(true);
    expect(isRecallMode('ja', 21)).toBe(true);
  });
  it('일본어 interval 미정은 노출 (신규 직후 보호)', () => {
    expect(isRecallMode('ja')).toBe(false);
    expect(isRecallMode('ja', null)).toBe(false);
  });
  it('언어 미정은 회상 모드 아님', () => {
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

  /* ja 2단계 (2026-08-28 사용자 지시로 '항상 노출' 폐기) — 문자 장벽 때문에 초반은 노출,
   * 익은 뒤(interval >= JA_RECALL_MIN)에만 숨겨 한글→일본어 회상으로 올린다. */
  it('일본어도 익기 전(interval < 3)에는 문장을 그대로 표시', () => {
    const host = mountCard({ interval: 1, lang: 'ja', sentence: 'ありがとうございます。', ko: '감사합니다.', chunks: [['ありがとう', '아리가또'], ['ございます', '고자이마스']] });
    expect(host.querySelector('.vr-h1').textContent).toBe('ありがとうございます。');
    expect(host.querySelector('.vr-listen').disabled).toBe(false); // 숨김이 없으니 듣기도 즉시 가능
  });

  it('일본어는 익은 뒤(interval >= 3)에는 한글만 보여주고 일본어를 숨긴다', () => {
    const host = mountCard({ interval: 60, lang: 'ja', sentence: 'ありがとうございます。', ko: '감사합니다.', chunks: [['ありがとう', '아리가또'], ['ございます', '고자이마스']] });
    expect(host.querySelector('.vr-h1').textContent).toBe('감사합니다.');
    expect(host.querySelector('.vr-ko').textContent).toContain('일본어로 떠올려 말해 보세요');
    expect(host.querySelector('.vr-listen').disabled).toBe(true); // 정답 오디오는 공개 후에만
  });

  it('공개 전에는 듣기 버튼이 잠긴다 (정답 오디오 유출 방지)', () => {
    expect(mountCard({ interval: 1 }).querySelector('.vr-listen').disabled).toBe(true);
  });

  it('회상 안내 문장을 두지 않는다 — 지시는 카드 부제 한 줄뿐 (§7.1)', () => {
    const host = mountCard({ interval: 1 });
    expect(host.querySelector('.vr-hint')).toBeNull();
    expect(host.textContent).not.toContain('힌트');
    expect(host.textContent).not.toContain('기억이 더 단단해져요');
    expect(host.querySelector('.vr-ko').textContent).toContain('떠올려'); // 부제는 유지
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

  /* 데스크톱이 기준 — 신규 세션과 같은 3칼럼:
   *   main(760px) = 카드 · 응용 연습 · 체이닝   /   side(324px) = 오늘 발화 · 표현 해설(+평가)
   * 해설을 메인에 넣으면 데스크톱이 모바일 단일 칼럼처럼 보인다 (2026-07-10 사용자 지적). */
  it('데스크톱: 응용·체이닝은 메인 칼럼, 해설·평가는 사이드바 (신규와 동일 3칼럼)', () => {
    const host = mountFull('desktop');
    expect(host.querySelector('.vr-main .vr-drills')).not.toBeNull();
    expect(host.querySelector('.vr-main .vs-chain')).not.toBeNull();
    expect(host.querySelector('.vr-side .vr-fold .judge-row')).not.toBeNull();
    expect(host.querySelector('.vr-main .vr-fold')).toBeNull();   // 해설이 메인에 오면 단일 칼럼처럼 보인다
    expect(host.querySelector('.vr-side .vs-chain')).toBeNull();  // 체이닝이 324px 에 끼면 줄바꿈 투성이
  });

  it('해설 안에는 해설 패널과 평가만 (응용·체이닝은 바깥)', () => {
    const bd = mountFull('desktop').querySelector('.vr-fold .bd');
    expect(bd.querySelector('.vs-panel')).not.toBeNull();
    expect(bd.querySelector('.judge-row')).not.toBeNull();
    expect(bd.querySelector('.vs-chain')).toBeNull();
  });

  it('공개 전에는 응용·체이닝이 감춰진다 (둘 다 정답을 품는다)', () => {
    const host = mountFull('desktop');
    expect(host.querySelector('.vr-drills').style.display).toBe('none');
    expect(host.querySelector('.vs-chain').style.display).toBe('none');
  });

  it('해설을 펼치면 응용·체이닝이 함께 나타난다', () => {
    const host = mountFull('desktop');
    host.querySelector('.vr-fold .hd').click();
    expect(host.querySelector('.vr-drills').style.display).not.toBe('none');
    expect(host.querySelector('.vs-chain').style.display).not.toBe('none');
  });

  it('모바일: 단일 칼럼에 카드 → 응용 → 체이닝 → 해설(평가) 순', () => {
    const pad = mountFull('phone').querySelector('.m-pad');
    const order = [...pad.children].map((el) => el.className.split(' ')[0])
      .filter((c) => ['vr-card', 'vr-drills', 'vs-chain', 'vr-fold'].includes(c));
    expect(order).toEqual(['vr-card', 'vr-drills', 'vs-chain', 'vr-fold']);
  });

  it('응용 연습은 근접중복(base 반복)을 걸러 진짜 변주만 보여준다', () => {
    const drills = mountFull('desktop').querySelector('.vr-drills');
    expect(drills.textContent).toContain('Did they thank you for coming?');  // 진짜 변주 → 유지
    expect(drills.querySelectorAll('.vs-drow .en').length).toBeGreaterThan(0);
  });

  it('체이닝은 자막이 없다 (신규와 동일 계약)', () => {
    const chain = mountFull('desktop').querySelector('.vs-chain');
    expect(chain.textContent).not.toContain('move on to the next thing');
    expect(chain.textContent).not.toContain("It's over anyway");
  });

  it('chain 없으면 체이닝 블록만 빠지고 해설·평가는 남는다', () => {
    const host = mountCard({ interval: 1 });
    expect(host.querySelector('.vs-chain')).toBeNull();
    expect(host.querySelector('.vr-fold .bd .vs-panel')).not.toBeNull();
    expect(host.querySelector('.vr-fold .judge-row')).not.toBeNull();
  });

  it('체이닝 발화도 오늘 발화(tried/pronScores)로 집계된다', async () => {
    const host = mountFull('desktop', false);
    host.querySelector('.vr-fold .hd').click();          // 해설 펼침 → 응용·체이닝 노출
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

  /* 2026-07-17 사용자 보고: 녹음하면 응용연습은 펼쳐지는데 해설은 접힌 채라 평가가 안 보인다.
   * 평가(judge-row)는 해설 fold 안 하단에 있으므로(위 '판정 버튼은 해설 안 하단에' 참조),
   * 정답이 공개되는 순간 해설도 함께 열려야 평가에 닿는다. */
  it('녹음(데모) 후 해설 fold 도 함께 펼쳐져 평가가 보인다', () => {
    vi.useFakeTimers();
    try {
      const host = mountCard({ interval: 1, demo: true });
      const fold = host.querySelector('.vr-fold');
      const bd = host.querySelector('.vr-fold .bd');
      expect(bd.style.display).toBe('none');       // 기본 접힘
      recall(host);
      vi.advanceTimersByTime(1100);
      expect(bd.style.display).not.toBe('none');   // 해설 본문 노출
      expect(fold.classList.contains('open')).toBe(true); // chev 회전 상태도 일치
      const judge = host.querySelector('.vr-fold .judge-row');
      expect(judge).not.toBeNull();
      expect([...host.querySelectorAll('.judge-btn')].every((b) => !b.disabled)).toBe(true);
    } finally { vi.useRealTimers(); }
  });

  it('해설을 이미 펼친 뒤 녹음해도 접히지 않는다 (멱등)', () => {
    vi.useFakeTimers();
    try {
      const host = mountCard({ interval: 1, demo: true });
      host.querySelector('.vr-fold .hd').click();  // 사용자가 먼저 펼침
      const fold = host.querySelector('.vr-fold');
      const bd = host.querySelector('.vr-fold .bd');
      expect(fold.classList.contains('open')).toBe(true);
      recall(host);
      vi.advanceTimersByTime(1100);
      expect(bd.style.display).not.toBe('none');
      expect(fold.classList.contains('open')).toBe(true); // 여전히 열림
    } finally { vi.useRealTimers(); }
  });

  /* 2026-07-22 사용자 지시: 판정 라벨을 쉬움/보통/어려움으로 통일하고 그 순서로 배치
   * (문장 모아보기 페이지의 난이도 칩과 같은 표기·순서). kind 값(got/hmm/no)은 SRS 계약이라 유지. */
  it('판정 버튼 3개를 쉬움/보통/어려움 순서로 렌더하고, 공개 전에는 비활성', () => {
    const host = mountCard({ interval: 1 });
    const btns = [...host.querySelectorAll('.judge-btn')];
    expect(btns.map((b) => b.dataset.kind)).toEqual(['got', 'hmm', 'no']);
    expect(btns.map((b) => b.textContent.trim())).toEqual(['쉬움', '보통', '어려움']);
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

/* '오늘 발화' 링 — 분모는 직전 학습일 발화 수 (작업지시서 §1-1 · §7.4①).
 * 복습 링은 캡션 문장 없이 갱신 상태(칩·+N·넘김)만 말한다. */
describe('sessionReviewV2 — 오늘 발화 링 (직전 학습일 분모)', () => {
  it('직전 학습일이 없으면 비교 숫자를 지어내지 않는다', () => {
    const host = mountCard({ interval: 3, state: { tried: 4 } });
    const rec = host.querySelector('.vs-rec');
    expect(rec.querySelector('.vs-uring .pv').textContent).toBe('');
    expect(rec.querySelector('.vs-uring .n').textContent).toBe('4');
    expect(rec.querySelector('.msg')).toBeNull(); // 복습 링엔 캡션 문장이 없다
  });

  it('state.prevDayUtter 가 있으면 그 값이 분모, 넘기면 갱신 칩 + 초과분', () => {
    const host = mountCard({ interval: 3, state: { tried: 41, prevDayUtter: 34 } });
    const rec = host.querySelector('.vs-rec');
    expect(rec.querySelector('.vs-newrec').style.display).toBe('');
    expect(rec.querySelector('.vs-uring .n').textContent).toBe('41+7');
    expect(rec.querySelector('.vs-uring .pv').textContent).toBe('직전 34 넘김');
  });
});

/* 복습 세션 v3 — 기록/갱신 (작업지시서 §7 · QA §13 '복습 세션').
 * 이 문장의 회차별 기록과 직전 복습 시도 수가 오늘의 분모가 된다. */
describe('sessionReviewV2 v3 — 점수 원 · 문장별 캘린더 · 자기평가 날짜 줄', () => {
  const SENT_LOG = { c1: { '2026-08-10': [72, 78], '2026-08-18': [81, 84, 88, 90, 91] } };

  it('점수 열 — 오늘 시도 원 + 직전 복습 시도 수까지의 빈 슬롯, 라벨은 숫자뿐', () => {
    const host = mountCard({ interval: 3, state: { sentLog: SENT_LOG } });
    // 오늘 기록이 없으면 점수 원 0개 + 직전 연습일(8/18) 5회만큼 빈 슬롯
    const dots = host.querySelectorAll('.vr-meta .v-dot');
    expect(dots.length).toBeGreaterThan(0);
    expect([...dots].every((d) => d.classList.contains('empty'))).toBe(true);
    expect(host.querySelector('.vr-say').textContent).toBe('0 / 5'); // 직전 = 8/18 의 5회
    expect(host.textContent).not.toContain('직전 5');                 // '직전' 라벨을 붙이지 않는다
  });

  it('직전 복습 기록이 없으면 빈 슬롯을 그리지 않는다 (횟수를 추정하지 않음)', () => {
    const host = mountCard({ interval: 3 });
    expect(host.querySelectorAll('.vr-meta .v-dot')).toHaveLength(0);
    expect(host.querySelector('.vr-say').textContent).toBe('0회');
  });

  it('녹음하면 점수 원이 붙고 빈 슬롯이 하나 줄어든다', () => {
    vi.useFakeTimers();
    try {
      const host = mountCard({ interval: 3, demo: true, state: { sentLog: SENT_LOG } });
      expect(host.querySelectorAll('.vr-meta .v-dot.empty')).toHaveLength(5);
      host.querySelector('.vr-pill.pri').click();
      vi.advanceTimersByTime(1100);
      expect(host.querySelectorAll('.vr-meta .v-dot')).toHaveLength(5);
      expect(host.querySelectorAll('.vr-meta .v-dot.empty')).toHaveLength(4);
      expect(host.querySelector('.vr-say').textContent).toBe('1 / 5');
    } finally { vi.useRealTimers(); }
  });

  /* 취소선은 "오늘 점수가 이를 대체했다"는 뜻이다 — 오늘 첫 점수 전에 붙이면 아직 일어나지 않은
   * 교대를 주장하는 셈이다 (클로드디자인 2026-08-27 지적). 기준은 revealed 가 아니라 오늘 점수 유무:
   * 카드 복귀·재렌더에서 revealed 는 false 로 초기화되지만 오늘 시도는 sentLog 에 남아 있다. */
  const mountWithLastScore = (over = {}) => {
    document.body.innerHTML = '<div id="root"></div>';
    const host = document.getElementById('root');
    const explanation = { key: `${EN} = ${KO}`, chunks: CHUNKS };
    const card = { id: 'c1', lang: 'en', sentence: EN, meaning: KO, interval: 3, lastScore: 81, reviewCount: 2, explanation };
    renderSessionReviewV2(host, {
      cards: [card], total: 1, step: 1, size: 'desktop', recLog: {}, tried: 0,
      sentence: { id: 'c1', lang: 'en', sentence: EN, ko: KO, explanation }, ...over,
    }, {});
    return host;
  };

  it('오늘 점수가 아직 없으면 지난 점수는 평범하게 둔다 (취소선 없음)', () => {
    const host = mountWithLastScore();
    const b = [...host.querySelectorAll('.vr-srs b')].pop(); // 마지막 b = 지난 점수 (앞은 회차)
    expect(b.textContent).toBe('81');
    expect(b.classList.contains('old')).toBe(false);
    expect(host.querySelector('.vr-srs').textContent).toContain('3번째');
    expect(host.textContent).not.toContain('통과 시 다음 복습'); // 날짜 줄로 이동 (§4.3)
  });

  /* 링·캡션도 취소선과 같은 지표(오늘 점수 유무)를 쓴다. 종전엔 card.lastScore(지난 점수)로 갈라
   * 오늘 아무것도 안 했는데 링은 '—', 캡션은 '방금 점수' 였다 — 방금 받은 점수가 없는데.
   * §7.3 의 「'첫 복습' 분기 유지」 지시는 폐기 (클로드디자인 2026-08-27): N번째 복습이 메타에 있어
   * 중복이고, 캡션이 '방금 점수' 로 바뀐 뒤엔 축이 어긋난다. */
  it('오늘 점수가 없으면 링·캡션을 그리지 않는다 (지난 점수가 있어도)', () => {
    const host = mountWithLastScore();
    expect(host.querySelector('.vr-ring')).toBeNull();
    expect(host.querySelector('.vr-cap')).toBeNull();
    expect(host.textContent).not.toContain('첫 복습');
  });

  it('녹음하면 링이 그 점수로 등장하고 캡션은 `방금 점수` 다', () => {
    vi.useFakeTimers();
    try {
      const host = mountWithLastScore({ demo: true });
      host.querySelector('.vr-pill.pri').click();
      vi.advanceTimersByTime(1100);
      expect(host.querySelector('.vr-cap').textContent).toBe('방금 점수');
      expect(host.querySelector('.vr-ring .cn').textContent).not.toBe('—');
    } finally { vi.useRealTimers(); }
  });

  /* Q8 — 재방문·공개 전이어도 오늘 점수가 있으면 링은 보인다. state.lastScore 는 카드 이동에서
   * null 로 리셋되므로(session-review.js:181) 링 값은 sentLog 의 오늘 마지막 점수에서 온다. */
  it('오늘 연습한 카드로 돌아오면 첫 렌더부터 링이 오늘 마지막 점수를 보인다', () => {
    const today = localISODate();
    const host = mountWithLastScore({ sentLog: { c1: { [today]: [72, 88] } } });
    expect(host.querySelector('.vr-ring .cn').textContent).toBe('88');
    expect(host.querySelector('.vr-cap').textContent).toBe('방금 점수');
  });

  /* 신규 세션에서 응용·체이닝 점수가 문장 카드 점수 열에 섞이던 버그(436e447)의 복습판 회귀 방지.
   * 복습은 dayScores(sentLog)를 applyScore 에서만 밀어 넣어 원래 올바르지만, onAppliedScore 가
   * refreshDots 를 부르므로 실수로 push 가 끼어들기 쉬운 자리다 — 테스트로 못박는다. */
  it('응용 녹음은 문장 점수 열에 섞이지 않는다', () => {
    vi.useFakeTimers();
    try {
      document.body.innerHTML = '<div id="root"></div>';
      const host = document.getElementById('root');
      const explanation = {
        key: `${EN} = ${KO}`, chunks: CHUNKS,
        drills: [{ en: 'Can you keep an eye on my bag?', ko: '제 가방 좀 봐줄래요?', kr: '캐뉴 키핀 아이 온 마이 백' }],
      };
      const card = { id: 'c1', lang: 'en', sentence: EN, meaning: KO, interval: 3, explanation };
      const state = {
        cards: [card], total: 1, step: 1, size: 'desktop', recLog: {}, tried: 0, demo: true,
        sentence: { id: 'c1', lang: 'en', sentence: EN, ko: KO, explanation }, sentLog: {},
      };
      renderSessionReviewV2(host, state, {});
      host.querySelector('.vr-fold .hd').click();            // 공개 → 응용 노출
      host.querySelector('.vr-pill.pri').click();            // 메인 1회
      vi.advanceTimersByTime(1100);
      const afterMain = [...host.querySelectorAll('.vr-meta .v-dot')].map((n) => n.textContent);
      expect(afterMain).toHaveLength(1);
      host.querySelector('.vr-drills .vs-drow button[aria-label="녹음"]').click(); // 응용 1회
      vi.advanceTimersByTime(900);
      expect([...host.querySelectorAll('.vr-meta .v-dot')].map((n) => n.textContent)).toEqual(afterMain);
      expect(Object.values(state.sentLog.c1 || {}).flat()).toHaveLength(1); // 메인 것만 기록
    } finally { vi.useRealTimers(); }
  });

  it('모바일 컨트롤 줄도 링 자리를 미리 예약한다 (min-height)', () => {
    const host = mountCard({ interval: 3, size: 'phone' });
    const css = [...host.querySelectorAll('style')].map((n) => n.textContent).join('');
    const blocks = [...css.matchAll(/\.vr-ctrl\{[^}]*\}/g)].map((m) => m[0]);
    expect(blocks.length).toBeGreaterThan(0);
    expect(blocks.every((b) => b.includes('min-height'))).toBe(true);
  });

  it('녹음해 오늘 점수가 생기면 그때 취소선이 붙는다', () => {
    vi.useFakeTimers();
    try {
      const host = mountWithLastScore({ demo: true });
      expect(host.querySelector('.vr-srs b.old')).toBeNull();
      host.querySelector('.vr-pill.pri').click();
      vi.advanceTimersByTime(1100);
      expect(host.querySelector('.vr-srs b.old').textContent).toBe('81');
    } finally { vi.useRealTimers(); }
  });

  it('오늘 이미 연습한 카드로 돌아오면 첫 렌더부터 취소선이다', () => {
    const today = localISODate();
    const host = mountWithLastScore({ sentLog: { c1: { [today]: [88] } } });
    expect(host.querySelector('.vr-srs b.old').textContent).toBe('81');
  });

  it('문장별 캘린더 — 셰브론 월 이동, 다음 달 비활성, 셀 안 숫자·회차 요약 없음', () => {
    const host = mountCard({ interval: 3, state: { sentLog: SENT_LOG } });
    const cal = host.querySelector('.vr-scal');
    expect(cal.querySelector('.lb').textContent).toBe('이 문장 연습 이력');
    const [prev, next] = cal.querySelectorAll('.mh button');
    expect(next.disabled).toBe(true);   // 미래 월 금지
    expect(prev.disabled).toBe(false);
    const label = cal.querySelector('.ml').textContent;
    prev.click();
    expect(cal.querySelector('.ml').textContent).not.toBe(label);
    expect(next.disabled).toBe(false);
    for (const c of cal.querySelectorAll('.v-cal .cd')) expect(c.textContent).toMatch(/^\d{1,2}$/);
    expect(host.textContent).not.toContain('←'); // 텍스트 화살표 금지
  });

  it('한글 발음은 공개 후에만 붙는다 (정답 유출 방지)', () => {
    document.body.innerHTML = '<div id="root"></div>';
    const host = document.getElementById('root');
    const explanation = { key: `${EN} = ${KO}`, chunks: CHUNKS };
    renderSessionReviewV2(host, {
      cards: [{ id: 'c1', lang: 'en', sentence: EN, meaning: KO, interval: 1, explanation }],
      total: 1, step: 1, size: 'desktop', recLog: {}, tried: 0, demo: true,
      sentence: { id: 'c1', lang: 'en', sentence: EN, ko: KO, pron: '땡큐 쏘 머치', explanation },
    }, {});
    expect(host.querySelector('.vr-pron').style.display).toBe('none');
    host.querySelector('.vr-fold .hd').click(); // 해설 펼침 = 정답 공개
    expect(host.querySelector('.vr-pron').style.display).not.toBe('none');
    expect(host.querySelector('.vr-pron').textContent).toBe('땡큐 쏘 머치');
  });

  it('자기평가 아래 다음 복습일 3개 — 버튼 순서와 1:1', () => {
    const host = mountCard({ interval: 3 });
    const days = [...host.querySelectorAll('.vr-nextdays span')].map((n) => n.textContent);
    expect(days).toHaveLength(3);
    const kinds = [...host.querySelectorAll('.judge-btn')].map((b) => b.dataset.kind);
    expect(kinds).toEqual(['got', 'hmm', 'no']);
    expect(days[2]).toBe('내일');    // 어려움 → interval 1
    expect(days[1]).toBe('5일 뒤');  // 보통 → ceil((3+7)/2)
    expect(days[0]).toBe('7일 뒤');  // 쉬움 → 다음 간격 7
  });

  it('사이드바는 링 / 문장 이력 / 해설(평가) 3카드', () => {
    const host = mountCard({ interval: 3 });
    expect([...host.querySelector('.vr-side').children].map((n) => n.className.split(' ')[0]))
      .toEqual(['vs-rec', 'vr-scal', 'vr-fold']);
  });
});

/* 듣기(좌)/녹음(우) 순서는 신규 세션과 같아야 한다 (§6.4-4 · §7.2 · QA §13).
 * 2026-08-26 — 복습만 녹음이 먼저였다. 같은 손동작이 화면마다 달라지면 근육기억이 깨진다. */
describe('sessionReviewV2 — 듣기/녹음 버튼 순서', () => {
  it('컨트롤 줄의 첫 버튼이 듣기, 다음이 녹음이다', () => {
    const host = mountCard({ interval: 3 });
    const btns = [...host.querySelectorAll('.vr-ctrl button')];
    expect(btns[0].classList.contains('vr-listen')).toBe(true);
    expect(btns[1].classList.contains('pri')).toBe(true);
    expect(btns[1].textContent).toContain('떠올려 말하기');
  });
});

/* §11 — 녹음 버튼의 이퀄라이저는 재생 어휘다. 복습 알약도 마이크를 유지해야 한다. */
describe('sessionReviewV2 — 녹음 중 아이콘', () => {
  it('녹음 중에도 마이크를 유지한다 (이퀄라이저 금지)', () => {
    vi.useFakeTimers();
    try {
      const host = mountCard({ interval: 3, demo: true });
      host.querySelector('.vr-pill.pri').click();
      const pill = host.querySelector('.vr-pill.recing');
      expect(pill.textContent).toContain('녹음 멈추기');
      expect(pill.querySelector('.v-eq')).toBeNull();
      vi.advanceTimersByTime(1100);
    } finally { vi.useRealTimers(); }
  });
});

/* 시안 4b 줄 대조(2026-08-27) — 오늘 시도 점수 원이 재렌더 후 사라졌다.
 * 렌더 지역 배열에만 쌓아서, 카드 이동·재마운트하면 빈 슬롯만 남았다. */
describe('sessionReviewV2 — 오늘 시도 점수 원 지속', () => {
  it('녹음한 점수가 state.sentLog 에 남아 재렌더 후에도 원이 유지된다', () => {
    vi.useFakeTimers();
    try {
      document.body.innerHTML = '<div id="root"></div>';
      const host = document.getElementById('root');
      const explanation = { key: `${EN} = ${KO}`, chunks: CHUNKS };
      const state = {
        cards: [{ id: 'c1', lang: 'en', sentence: EN, meaning: KO, interval: 3, explanation }],
        total: 1, step: 1, size: 'desktop', recLog: {}, tried: 0, demo: true,
        sentence: { id: 'c1', lang: 'en', sentence: EN, ko: KO, explanation },
        sentLog: { c1: { '2020-01-02': [70, 72] } }, // 직전 연습일 2회 → 빈 슬롯 2개
      };
      renderSessionReviewV2(host, state, {});
      expect(host.querySelectorAll('.vr-meta .v-dot.empty')).toHaveLength(2);
      host.querySelector('.vr-pill.pri').click();
      vi.advanceTimersByTime(1100);
      expect(host.querySelectorAll('.vr-meta .v-dot').length).toBeGreaterThan(0);
      const shown = [...host.querySelectorAll('.vr-meta .v-dot')].filter((d) => !d.classList.contains('empty'));
      expect(shown).toHaveLength(1);

      // 재렌더 — 같은 state 로 다시 그려도 점수 원이 남아야 한다
      document.body.innerHTML = '<div id="root2"></div>';
      const host2 = document.getElementById('root2');
      renderSessionReviewV2(host2, state, {});
      const again = [...host2.querySelectorAll('.vr-meta .v-dot')].filter((d) => !d.classList.contains('empty'));
      expect(again).toHaveLength(1);
      expect(again[0].textContent).toBe(shown[0].textContent);
    } finally { vi.useRealTimers(); }
  });
});


/* 회상 안내문 — ja 는 띄어쓰기가 없어 단어 수가 무의미하다 (2026-08-28). */
describe('recallHint — 언어별 안내문', () => {
  it('영어는 단어 수로 알린다', () => {
    expect(recallHint('en', 'What do you mean?')).toBe('영어로 떠올려 말해 보세요 · 4단어');
  });
  it('일본어는 글자 수로 알리고, 구두점은 세지 않는다', () => {
    expect(recallHint('ja', 'そうなんだ。')).toBe('일본어로 떠올려 말해 보세요 · 5글자');
    expect(recallHint('ja', 'そうなの？')).toBe('일본어로 떠올려 말해 보세요 · 4글자');
  });
});

/* 오발화 게이트 (2026-08-29) — 복습 카드도 신규 카드와 같은 계약.
 * 복습은 문장을 숨기므로(회상) 다른 문장을 말하기가 오히려 더 쉽다. 근거·임계값은
 * services/coverageJudge.js judgeMisread 주석 (라이브 Azure 실측 2026-08-29). */
describe('sessionReviewV2 — 오발화 게이트', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  async function recOnce(host) {
    host.querySelector('.vr-pill.pri').click(); await tick();
    host.querySelector('.vr-pill.recing').click(); await tick(); await tick();
  }

  it('복습 녹음도 enableMiscue:true 로 채점을 요청한다 (레퍼런스 에코 차단)', async () => {
    const host = mountCard({ interval: 3 });
    await recOnce(host);
    expect(stopAndAnalyze.mock.calls[0][3]).toEqual({ enableMiscue: true });
  });

  it('다른 문장을 말하면 점수 원도 시도 수도 붙지 않고 안내가 뜬다', async () => {
    stopAndAnalyze.mockResolvedValueOnce({ score: 18, recognizedText: 'It to it it.' });
    const state = {};
    const host = mountCard({ interval: 3, state });
    await recOnce(host);
    const shown = [...host.querySelectorAll('.vr-meta .v-dot')].filter((d) => !d.classList.contains('empty'));
    expect(shown).toHaveLength(0);
    expect(host.querySelector('.vr-ring')).toBeNull();
    expect(showRecordToast).toHaveBeenCalledTimes(1);
  });

  it('단어는 다 말했고 발음만 나쁜 22점은 그대로 기록된다', async () => {
    stopAndAnalyze.mockResolvedValueOnce({ score: 22, recognizedText: EN });
    const host = mountCard({ interval: 3 });
    await recOnce(host);
    const shown = [...host.querySelectorAll('.vr-meta .v-dot')].filter((d) => !d.classList.contains('empty'));
    expect(shown).toHaveLength(1);
    expect(shown[0].textContent).toBe('22');
  });
});
