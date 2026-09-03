// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { localISODate } from '../utils/today.js';

/* 문장 모아보기 v12 (2026-09-03 작업지시서 §10) — 한글 프롬프트를 보고 떠올려 말하고(녹음 = 본 시도),
 * 힌트 3단(어순 · 첫 글자 · 빈칸)을 거쳐 정답을 확인하고, 쉬움·보통·어려움으로 판정한다.
 * 채점·저장은 복습 세션과 같은 파이프라인이라 여기서는 모두 mock 으로 대체하고 호출 계약만 고정한다. */
const M = vi.hoisted(() => ({
  startMicRecording: vi.fn(),
  stopAndAnalyze: vi.fn(),
  savePronunciationLog: vi.fn(async () => {}),
  judgeRecording: vi.fn(() => ({ record: true })),
  scoreForDisplay: vi.fn((r) => ({ ...r, score: 84 })),
  computeDeductionScore: vi.fn(() => ({ score: 84, deductions: [
    { axis: 'intonation', label: '억양·리듬 결손', points: 9.9 },
    { axis: 'words', label: '소리가 어긋난 단어가 있어요 (slowly 71점)', points: 5.8 },
    { axis: 'fluency', label: '끊기지 않고 이어 말하기', points: 1 },
  ] })),
  applyWeakPhonemesUpdate: vi.fn(async () => {}),
  showRecordToast: vi.fn(),
  recordErrorMessage: vi.fn((r) => `err:${r}`),
  recordGateMessage: vi.fn((r) => `gate:${r}`),
  speakWithFeedback: vi.fn(),
}));
vi.mock('../services/sessionAnalyze.js', () => ({ startMicRecording: M.startMicRecording, stopAndAnalyze: M.stopAndAnalyze }));
vi.mock('../services/pronunciationLog.js', () => ({ savePronunciationLog: M.savePronunciationLog }));
vi.mock('../services/coverageJudge.js', () => ({ judgeRecording: M.judgeRecording }));
vi.mock('../services/deductionScore.js', () => ({ scoreForDisplay: M.scoreForDisplay, computeDeductionScore: M.computeDeductionScore }));
vi.mock('../services/weakPhonemes.js', () => ({ applyWeakPhonemesUpdate: M.applyWeakPhonemesUpdate }));
vi.mock('../components/session/recordToast.js', () => ({ showRecordToast: M.showRecordToast, recordErrorMessage: M.recordErrorMessage }));
vi.mock('./sessionExprV2.js', () => ({ recordGateMessage: M.recordGateMessage }));
vi.mock('../components/session/atoms.js', () => ({ speakWithFeedback: M.speakWithFeedback }));

import { buildSentenceRows, compareSentenceRows, mountSentences, wordMask, keyPartsOf, keyMaskOf, recallStats } from './sentences.js';

const TODAY = localISODate();
const flush = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); };

/* 시드 1·2번 (seeds/en-core100-2026-08-26.json) — 2번은 조각 뜻·anchor 가 없는 카드로 둔다. */
const CARD1 = {
  id: 'en-core100-001-say-again-slowly', lang: 'en', order_index: 1,
  sentence: 'Sorry, could you say that again more slowly?', meaning: '미안한데, 그 말을 좀 더 천천히 다시 해줄래요?',
  phonetic_kr: '쏘리 쿠쥬 쎄이 댓 어겐 모어r 슬로울리', lastResult: 'O', lastResultAt: '2026-08-30',
  resultHistory: [
    { date: '2026-08-27', result: '△', source: 'review' }, { date: '2026-08-28', result: 'O', source: 'review' },
    { date: '2026-08-29', result: '△', source: 'sentences' }, { date: '2026-08-30', result: 'X', source: 'review' },
  ],
  explanation: {
    key: 'could you say that again = 다시 말해 줄래요. 못 알아들었을 때 대화를 살리는 1순위 문장.', anchor: '다시 해줄래요',
    chunks: [['Sorry,', '쏘리', '미안한데,'], ['could you say', '쿠쥬 쎄이', '말해 줄래요'], ['that again', '댓 어겐', '그 말을 다시'], ['more slowly?', '모어r 슬로울리', '좀 더 천천히?']],
    grammar: [{ struct: 'Could you + 동사원형 + again?', body: '' }],
  },
};
const CARD2 = {
  id: 'en-core100-002-what-do-you-mean', lang: 'en', order_index: 2,
  sentence: 'What do you mean by that exactly?', meaning: '그 말이 정확히 무슨 뜻이야?', phonetic_kr: '왓 두 유 미인 바이 댓 이그잭틀리',
  explanation: {
    key: 'What do you mean = 무슨 뜻이야. 의도를 확인할 때.',
    chunks: [['What do you mean', '왓 두 유 미인'], ['by that', '바이 댓'], ['exactly?', '이그잭틀리']],
    grammar: [{ struct: 'What do you mean by [X]?' }],
  },
};
const PRON = [
  { sentenceId: CARD1.id, lang: 'en', overallScore: 72, date: '2026-08-20', createdAt: '2026-08-20T10:00:00.000Z' },
  { sentenceId: CARD1.id, lang: 'en', overallScore: 81, date: '2026-08-30', createdAt: '2026-08-30T10:00:00.000Z' },
  { sentenceId: `${CARD1.id}#drill#Give me a minute.`, lang: 'en', overallScore: 99, date: '2026-09-01', createdAt: '2026-09-01T10:00:00.000Z' },
];

function fakeDb({ cards = [CARD1, CARD2], pron = PRON } = {}) {
  const update = vi.fn(async () => {});
  window.studyDB = {
    reviewQueue: { where: () => ({ equals: () => ({ toArray: async () => cards.map((c) => JSON.parse(JSON.stringify(c))) }) }), update },
    sessionLogs: { where: () => ({ equals: () => ({ toArray: async () => [] }) }) },
    pronunciationLog: { where: () => ({ equals: () => ({ toArray: async () => pron }) }) },
  };
  return { update };
}
async function mountWith(opts) {
  const db = fakeDb(opts);
  document.body.innerHTML = '<div id="root"></div>';
  const host = document.getElementById('root');
  mountSentences(host);
  await flush();
  return { host, db, row: (id) => host.querySelector(`.vl-row[data-key="${id}"]`) };
}
const texts = (root, sel) => [...root.querySelectorAll(sel)].map((n) => n.textContent.trim());

beforeEach(() => {
  window.location.hash = '';
  sessionStorage.clear();
  localStorage.clear();
  for (const fn of Object.values(M)) fn.mockClear();
  M.judgeRecording.mockImplementation(() => ({ record: true }));
  M.startMicRecording.mockImplementation(async (opts) => { M.startMicRecording.lastOpts = opts; return { controller: { stop() {} } }; });
  M.stopAndAnalyze.mockImplementation(async () => ({ score: 80, omissions: ['slowly'], weakPhonemes: [] }));
});
afterEach(() => { document.body.innerHTML = ''; });

describe('마스크·핵심 표현 도출 (작업지시서 §3.2·§12)', () => {
  it('wordMask — 첫 글자 + 밑줄(길이-1), 구두점 유지, 매치 안 되면 원문', () => {
    expect(wordMask('could')).toBe('c____');
    expect(wordMask('again?')).toBe('a____?');
    expect(wordMask("I'm")).toBe('I__');
    expect(wordMask('—')).toBe('—');
  });
  it('keyPartsOf — 좌변 자리표시자(~·단독 대문자) 제거, 우변은 = 와 첫 . 사이', () => {
    expect(keyPartsOf({ explanation: { key: 'Let me see if ~ = ~인지 확인해 볼게. 설명.' } })).toMatchObject({ left: 'Let me see if', ko: '~인지 확인해 볼게' });
    expect(keyPartsOf({ explanation: { key: 'What do you mean by X = 무슨 뜻이야.' } }).left).toBe('What do you mean by');
    expect(keyPartsOf({})).toMatchObject({ left: '', ko: '' });
  });
  it('keyMaskOf — 문장에서 실제 매치된 구간을 단어별 마스크 ("could you say that again" → "c____ y__ s__ t___ a____")', () => {
    const km = keyMaskOf('Sorry, could you say that again more slowly?', 'could you say that again');
    expect(km.mask).toBe('c____ y__ s__ t___ a____');
    expect(km.pre).toBe('Sorry, ');
    expect(km.post).toBe(' more slowly?');
    expect(keyMaskOf('Let me see if I understood you correctly.', 'Let me see if').mask).toBe('L__ m_ s__ i_');
    expect(keyMaskOf('Nothing here.', 'absent phrase')).toBeNull();
  });
  it('recallStats — 분자 = O·△ 개수, 분모 = 전체', () => {
    expect(recallStats([{ result: '△' }, { result: 'O' }, { result: '△' }, { result: 'X' }])).toMatchObject({ recalled: 3, total: 4 });
    expect(recallStats(undefined)).toMatchObject({ recalled: 0, total: 0 });
  });
});

describe('buildSentenceRows — 목록 구성·정렬 (현행 계약 유지)', () => {
  const cards = [
    { id: 'a', sentence: 'I called you.', meaning: '너한테 전화했었어.' },
    { id: 'b', sentence: 'Are you hungry?', meaning: '배고파?' },
    { id: 'c', sentence: 'No meaning field.', ko: '뜻 필드가 ko 인 경우' },
  ];
  const logs = [{ date: '2026-07-10', newSentenceIds: ['a'] }, { date: '2026-07-19', newSentenceIds: ['b'] }];

  it('난이도 평가가 없으면 학습일 최신순', () => {
    expect(buildSentenceRows(cards, logs).map((r) => r.id)).toEqual(['b', 'a', 'c']);
  });
  it('난이도 평가 순 — 어려움이 맨 위, 쉬움이 맨 아래, 같은 난이도 안에서는 최신순', () => {
    const rated = [{ ...cards[0], lastResult: 'O' }, { ...cards[1], lastResult: 'X' }, { ...cards[2], lastResult: '△' }];
    expect(buildSentenceRows(rated, logs).map((r) => r.id)).toEqual(['b', 'c', 'a']);
  });
  it('오늘 평가한 문장은 난이도 불문 하단으로 (오늘-완료 그룹)', () => {
    const rated = [{ ...cards[0], lastResult: 'O' }, { ...cards[1], lastResult: 'X', lastResultAt: '2026-07-28' }];
    expect(buildSentenceRows(rated, logs, [], '2026-07-28').map((r) => r.id)).toEqual(['a', 'b']);
  });
  it('같은 난이도 안에서 최근 발음 점수가 낮은 문장이 위로, 점수 없는 문장은 뒤로', () => {
    const pron = [{ sentenceId: 'a', overallScore: 90, date: '2026-07-20' }, { sentenceId: 'b', overallScore: 60, date: '2026-07-20' }];
    expect(buildSentenceRows(cards, logs, pron).map((r) => r.id)).toEqual(['b', 'a', 'c']);
    expect(compareSentenceRows({ score: 60 }, { score: 90 })).toBeLessThan(0);
  });
  it('행에 v12 필드를 싣는다 — 번호·조각(뜻 포함 여부)·anchor·핵심 표현·문형·판정 이력·최신 점수(드릴 제외, createdAt 최신)', () => {
    const rows = buildSentenceRows([CARD1, CARD2], [], PRON, TODAY);
    const r1 = rows.find((r) => r.id === CARD1.id);
    const r2 = rows.find((r) => r.id === CARD2.id);
    expect(r1).toMatchObject({ num: 1, anchor: '다시 해줄래요', hasKoc: true, struct: 'Could you + 동사원형 + again?', lastScore: 81 });
    expect(r1.key).toMatchObject({ left: 'could you say that again', ko: '다시 말해 줄래요' });
    expect(r1.history).toHaveLength(4);
    expect(r2).toMatchObject({ num: 2, anchor: '', hasKoc: false, lastScore: null });
    expect(r2.history).toEqual([]);
  });
  it('phonetic_kr 이 없는 복습 큐 행(서버 컬럼 부재로 pull 에서 유실)은 chunks 음차를 이어붙여 쓴다 — 게이트가 둘의 동일성을 보장', () => {
    const c = { ...CARD2, phonetic_kr: undefined };
    expect(buildSentenceRows([c], [], [], TODAY)[0].pron).toBe('왓 두 유 미인 바이 댓 이그잭틀리');
    expect(buildSentenceRows([{ ...CARD2 }], [], [], TODAY)[0].pron).toBe(CARD2.phonetic_kr); // 있으면 원문 그대로
  });
  it('빈 입력 안전', () => { expect(buildSentenceRows()).toEqual([]); });
});

describe('행 렌더 (§10-1)', () => {
  it('번호·프롬프트·anchor 밑줄·힌트 3버튼·이력·녹음 원·정답 버튼 — 정답 공개 전엔 재생·복습이 없다', async () => {
    const { host, row } = await mountWith();
    expect(host.querySelectorAll('.vl-row')).toHaveLength(2);
    const r1 = row(CARD1.id);
    expect(r1.querySelector('.vl-num').textContent).toBe('1');
    expect(r1.querySelector('.vl-ko').textContent).toBe(CARD1.meaning);
    expect(r1.querySelector('.vl-ko .vl-anchor').textContent).toBe('다시 해줄래요');
    expect(texts(r1, '.vl-seg button')).toEqual(['어순', '첫 글자', '빈칸']);
    expect(r1.querySelector('.vl-hist')).toBeTruthy();
    expect(r1.querySelector('.vl-reveal').textContent).toBe('정답');
    expect(r1.querySelector('.vl-acts [aria-label="녹음"]')).toBeTruthy();
    expect(r1.querySelector('[aria-label="재생"]')).toBeNull();
    expect(r1.querySelector('.vl-go')).toBeNull();
    expect(r1.querySelector('.vl-panel')).toBeNull();
    // 조각 뜻·anchor 가 없는 카드 — 밑줄 없음, 어순 버튼 비활성
    const r2 = row(CARD2.id);
    expect(r2.querySelector('.vl-anchor')).toBeNull();
    expect(r2.querySelector('.vl-seg button').classList.contains('off')).toBe(false); // 조각 뜻이 없어도 어순은 단어 윤곽 폴백으로 살아 있다
  });
  it('헤더 — 제목·문장 수·집계 4열(쉬움·보통·어려움·발화)', async () => {
    const { host } = await mountWith();
    expect(host.querySelector('.vl-h1').textContent).toBe('문장 모아보기');
    expect(host.querySelector('.vl-hd .vl-cnt').textContent).toBe('2문장'); // 상단 바의 과목명(.vl-cnt)과 구분
    expect(texts(host, '.vl-stat span')).toEqual(['쉬움', '보통', '어려움', '발화']);
    expect(texts(host, '.vl-stat b')).toEqual(['0', '0', '0', '0']);
    expect(host.querySelector('.vl-top .vl-home')).toBeTruthy();
  });
  it('문장이 없으면 빈 상태를 안내한다', async () => {
    const { host } = await mountWith({ cards: [] });
    expect(host.querySelector('.vl-empty').textContent).toBe('아직 공부한 문장이 없어요');
    expect(host.querySelector('.vl-list')).toBeNull();
  });
});

describe('힌트 3단 (§10-2)', () => {
  it('클릭 순서대로 1→2→3, 같은 버튼 재클릭으로 한 단계 내림', async () => {
    const { row } = await mountWith();
    const r1 = row(CARD1.id);
    const btn = (i) => r1.querySelectorAll('.vl-seg button')[i];
    btn(0).click();
    expect(btn(0).classList.contains('cur')).toBe(true);
    expect(r1.querySelector('.vl-hbox')).toBeTruthy();
    btn(1).click();
    expect(btn(1).classList.contains('cur')).toBe(true);
    expect(btn(0).classList.contains('lit')).toBe(true);
    btn(2).click();
    expect(r1.querySelector('.vl-frame')).toBeTruthy();
    btn(2).click(); // 같은 단계 재클릭 = 내림
    expect(r1.querySelector('.vl-frame')).toBeNull();
    expect(btn(1).classList.contains('cur')).toBe(true);
    btn(1).click(); btn(0).click();
    expect(r1.querySelector('.vl-hbox')).toBeNull(); // rung 0
  });
  it('1단 어순 — 조각 뜻 칩만, 영어 단어 노출 없음 (문형 struct 포함)', async () => {
    const { row } = await mountWith();
    const r1 = row(CARD1.id);
    r1.querySelectorAll('.vl-seg button')[0].click();
    const box = r1.querySelector('.vl-hbox');
    expect(texts(box, '.vl-chip')).toEqual(['1미안한데,', '2말해 줄래요', '3그 말을 다시', '4좀 더 천천히?']);
    expect(box.textContent).not.toMatch(/[A-Za-z]{2,}/);
  });
  it('2단 첫 글자 — 핵심 표현 마스크 "c____ y__ s__ t___ a____" + 뜻', async () => {
    const { row } = await mountWith();
    const r1 = row(CARD1.id);
    r1.querySelectorAll('.vl-seg button')[1].click();
    expect(r1.querySelector('.vl-first .vl-mask').textContent).toBe('c____ y__ s__ t___ a____');
    expect(r1.querySelector('.vl-first .ko').textContent).toBe('다시 말해 줄래요');
    expect(r1.querySelector('.vl-hbox .vl-chip')).toBeTruthy(); // 누적: 어순 칩은 그대로
    expect(r1.querySelector('.vl-frame')).toBeNull();
  });
  it('3단 빈칸 — 문장을 보이되 핵심 표현만 마스크 (첫 글자 줄 대신)', async () => {
    const { row } = await mountWith();
    const r1 = row(CARD1.id);
    const b = r1.querySelectorAll('.vl-seg button');
    b[2].click();
    const frame = r1.querySelector('.vl-frame');
    expect(frame.textContent).toBe('Sorry, c____ y__ s__ t___ a____ more slowly?');
    expect(frame.querySelector('.vl-mask').textContent).toBe('c____ y__ s__ t___ a____');
    expect(r1.querySelector('.vl-first')).toBeNull();
  });
  it('조각 뜻이 없는 카드의 어순은 조각별 단어 윤곽(글자 수만) 칩 — 영어 글자 노출 없음 (실계정 113장 중 0장 보유, 2026-09-03 사용자 보고)', async () => {
    const { row } = await mountWith();
    const r2 = row(CARD2.id);
    const b = (i) => r2.querySelectorAll('.vl-seg button')[i]; // 세그먼트는 탭마다 다시 그려지므로 재조회
    b(0).click();
    expect(b(0).classList.contains('cur')).toBe(true);
    const box = r2.querySelector('.vl-hbox');
    expect(texts(box, '.vl-chip')).toEqual(['1____ __ ___ ____', '2__ ____', '3_______?']);
    expect(box.textContent).not.toMatch(/[A-Za-z]/);
    b(1).click();
    expect(r2.querySelector('.vl-first .vl-mask').textContent).toBe('W___ d_ y__ m___');
    expect(texts(r2, '.vl-chip')).toEqual(['1____ __ ___ ____', '2__ ____', '3_______?']); // 누적 유지
    // 정답 패널의 조각 아래 뜻 줄은 없음 (뜻이 없으므로)
    r2.querySelector('.vl-reveal').click();
    expect(r2.querySelectorAll('.vl-pair .ko')).toHaveLength(0);
  });
  it('정답이 열리거나 판정되면 잠긴다 — 클릭 무시, "힌트 N단계" 표시', async () => {
    const { row } = await mountWith();
    const r1 = row(CARD1.id);
    r1.querySelectorAll('.vl-seg button')[1].click();
    r1.querySelector('.vl-reveal').click(); // 정답 열림 → 잠김
    expect(r1.querySelector('.vl-seg').classList.contains('locked')).toBe(true);
    expect(r1.querySelector('.vl-hbox')).toBeNull();
    expect(r1.querySelector('.vl-hused').textContent).toBe('힌트 2단계');
    r1.querySelectorAll('.vl-seg button')[2].click();
    expect(r1.querySelector('.vl-hused').textContent).toBe('힌트 2단계'); // 무시됨
  });
});

describe('정답 토글 (§10-3)', () => {
  it('정답 → 패널(조각 정렬·음차 원문·핵심 표현·문형·재생·녹음·복습), 가리기 → 닫힘', async () => {
    const { row } = await mountWith();
    const r1 = row(CARD1.id);
    const reveal = r1.querySelector('.vl-reveal');
    reveal.click();
    expect(reveal.textContent).toBe('가리기');
    expect(reveal.classList.contains('on')).toBe(true);
    const panel = r1.querySelector('.vl-panel');
    expect(panel).toBeTruthy();
    expect(texts(panel, '.vl-pair .en')).toEqual(['Sorry,', 'could you say', 'that again', 'more slowly?']);
    expect(texts(panel, '.vl-pair .ko')).toEqual(['미안한데,', '말해 줄래요', '그 말을 다시', '좀 더 천천히?']);
    expect([...panel.querySelectorAll('.vl-pair .en')].map((n) => n.classList.contains('key'))).toEqual([false, true, true, false]);
    expect(panel.querySelector('.vl-pron').textContent).toBe(CARD1.phonetic_kr); // 원문 한 줄 그대로
    expect(panel.querySelector('.vl-meta .k').textContent).toBe('could you say that again · 다시 말해 줄래요');
    expect(panel.querySelector('.vl-meta .st').textContent).toBe('Could you + 동사원형 + again?');
    expect(panel.querySelector('[aria-label="재생"]')).toBeTruthy();
    expect(panel.querySelector('[aria-label="녹음"]')).toBeTruthy();
    expect(r1.querySelector('.vl-acts [aria-label="녹음"]')).toBeNull(); // 열린 뒤엔 우측 열 녹음 원 없음
    expect(texts(panel, '.vl-lv')).toEqual(['쉬움', '보통', '어려움']);
    expect(panel.querySelector('.vl-go').textContent).toBe('복습');
    expect(panel.lastElementChild.lastElementChild.classList.contains('vl-go')).toBe(true); // 복습은 마지막 요소
    reveal.click();
    expect(reveal.textContent).toBe('정답');
    expect(r1.querySelector('.vl-panel')).toBeNull();
    expect(r1.querySelector('.vl-acts [aria-label="녹음"]')).toBeTruthy();
  });
  it('재생은 문장 단위 TTS, 복습은 그 문장을 큐에 넣고 복습 세션으로 이동', async () => {
    const { row } = await mountWith();
    const r1 = row(CARD1.id);
    r1.querySelector('.vl-reveal').click();
    r1.querySelector('[aria-label="재생"]').click();
    expect(M.speakWithFeedback).toHaveBeenCalledWith(expect.anything(), CARD1.sentence, expect.objectContaining({ lang: 'en-US' }));
    r1.querySelector('.vl-go').click();
    expect(JSON.parse(sessionStorage.getItem('studyReviewQueue')).map((q) => q.id)).toEqual([CARD1.id]);
    expect(sessionStorage.getItem('studyReturnTo')).toBe('sentences');
    expect(window.location.hash).toBe('#/session-review?lang=en');
  });
});

describe('판정 (§10-4)', () => {
  it('lastResult·lastResultAt(KST 오늘)·resultHistory append 만 저장 — SRS 필드 미변경, 행 이동 없음', async () => {
    const { host, db, row } = await mountWith();
    const before = [...host.querySelectorAll('.vl-row')].map((n) => n.dataset.key);
    const r1 = row(CARD1.id);
    r1.querySelector('.vl-reveal').click();
    r1.querySelector('.vl-lv[data-level="X"]').click();
    await flush();
    expect(db.update).toHaveBeenCalledTimes(1);
    const [id, patch] = db.update.mock.calls[0];
    expect(id).toBe(CARD1.id);
    expect(patch).toEqual({ lastResult: 'X', lastResultAt: TODAY, resultHistory: [...CARD1.resultHistory, { date: TODAY, result: 'X', source: 'sentences' }] });
    expect('interval' in patch || 'nextReview' in patch).toBe(false);
    expect([...host.querySelectorAll('.vl-row')].map((n) => n.dataset.key).slice(0, 2)).toEqual(before);
    expect(r1.querySelector('.vl-jchip').textContent).toBe('어려움');
    expect(r1.querySelector('.vl-jchip').classList.contains('X')).toBe(true);
    expect(r1.querySelector('.vl-levels')).toBeNull();
    expect(host.querySelector('.vl-stat b.x').textContent).toBe('1');
    // 패널이 열린 채로 판정 → 흐림은 가린 뒤에만
    expect(r1.classList.contains('dim')).toBe(false);
    r1.querySelector('.vl-reveal').click();
    expect(r1.classList.contains('dim')).toBe(true);
    expect(r1.querySelector('.vl-jchip')).toBeNull(); // 닫힘
    r1.querySelector('.vl-reveal').click(); // 판정 후에도 다시 열 수 있다
    expect(r1.querySelector('.vl-jchip').textContent).toBe('어려움');
  });
  it('어려움 → "다시 떠올리기" 묶음 + 재시도 행, 재시도 행의 어려움은 재추가 없음', async () => {
    const { host, row } = await mountWith();
    const r1 = row(CARD1.id);
    r1.querySelector('.vl-reveal').click();
    r1.querySelector('.vl-lv[data-level="X"]').click();
    await flush();
    const again = host.querySelector('.vl-again');
    expect(again.querySelector('.t').textContent).toBe('다시 떠올리기');
    expect(again.querySelector('.n').textContent).toBe('1');
    expect(again.querySelector('.vl-go').textContent).toBe('복습 · 1문장');
    const retry = row(`${CARD1.id}-2`);
    expect(retry).toBeTruthy();
    expect(host.querySelectorAll('.vl-row')).toHaveLength(3);
    expect(retry.querySelector('.vl-panel')).toBeNull(); // 별도 상태
    expect(retry.querySelector('.vl-seg.locked')).toBeNull();
    retry.querySelector('.vl-reveal').click();
    retry.querySelector('.vl-lv[data-level="X"]').click();
    await flush();
    expect(host.querySelectorAll('.vl-row')).toHaveLength(3);
    expect(again.querySelector('.n').textContent).toBe('1');
    again.querySelector('.vl-go').click();
    expect(JSON.parse(sessionStorage.getItem('studyReviewQueue')).map((q) => q.id)).toEqual([CARD1.id]);
  });
  it('쉬움·보통은 묶음을 만들지 않고, 같은 행 재판정은 무시된다', async () => {
    const { host, db, row } = await mountWith();
    const r2 = row(CARD2.id);
    r2.querySelector('.vl-reveal').click();
    r2.querySelector('.vl-lv[data-level="△"]').click();
    await flush();
    expect(host.querySelector('.vl-again')).toBeNull();
    expect(host.querySelector('.vl-stat b.m').textContent).toBe('1');
    expect(db.update.mock.calls[0][1]).toMatchObject({ lastResult: '△', resultHistory: [{ date: TODAY, result: '△', source: 'sentences' }] });
  });
});

describe('이력 (§10-5)', () => {
  it("로그 ['△','O','△','X'] → 분수 3/4 · 막대 4칸(틸 3·코랄 1) · 최신 점수 81(드릴 제외); 오늘 판정 후 4/5 + 오늘 칸 팝", async () => {
    const { row } = await mountWith();
    const r1 = row(CARD1.id);
    expect(r1.querySelector('.vl-frac b').textContent).toBe('3/4');
    expect(r1.querySelector('.vl-frac b').classList.contains('hi')).toBe(true); // .75 ≥ .7
    expect(r1.querySelector('.vl-frac span').textContent).toBe('떠올림');
    const bars = r1.querySelectorAll('.vl-bars i');
    expect(bars).toHaveLength(4);
    expect([...bars].map((b) => b.classList.contains('x'))).toEqual([false, false, false, true]);
    expect(bars[3].title).toBe('못 떠올림 · 어려움');
    expect(bars[0].title).toBe('떠올림 · 보통');
    expect(r1.querySelector('.vl-last .v-dot').textContent).toBe('81');
    expect(r1.querySelector('.vl-last .v-dot').classList.contains('fresh')).toBe(false);
    r1.querySelector('.vl-reveal').click();
    r1.querySelector('.vl-lv[data-level="O"]').click();
    await flush();
    expect(r1.querySelector('.vl-frac b').textContent).toBe('4/5');
    const after = r1.querySelectorAll('.vl-bars i');
    expect(after).toHaveLength(5);
    expect(after[4].classList.contains('pop')).toBe(true);
    expect(after[4].classList.contains('x')).toBe(false);
  });
  it('이력 0건 → "첫 복습" + 회색 칸 1개, 발화 없음', async () => {
    const { row } = await mountWith();
    const r2 = row(CARD2.id);
    expect(r2.querySelector('.vl-frac b.first').textContent).toBe('첫 복습');
    expect(r2.querySelector('.vl-frac span')).toBeNull();
    expect(r2.querySelectorAll('.vl-bars i')).toHaveLength(1);
    expect(r2.querySelector('.vl-bars i').classList.contains('none')).toBe(true);
    expect(r2.querySelector('.vl-nolast').textContent).toBe('발화 없음');
  });
  it('재시도 행은 원본 카드 이력을 공유하고, 재시도 행의 판정도 이력에 붙는다', async () => {
    const { db, row } = await mountWith();
    const r1 = row(CARD1.id);
    r1.querySelector('.vl-reveal').click();
    r1.querySelector('.vl-lv[data-level="X"]').click();
    await flush();
    const retry = row(`${CARD1.id}-2`);
    expect(retry.querySelector('.vl-frac b').textContent).toBe('3/5');
    retry.querySelector('.vl-reveal').click();
    retry.querySelector('.vl-lv[data-level="O"]').click();
    await flush();
    expect(retry.querySelector('.vl-frac b').textContent).toBe('4/6');
    expect(r1.querySelector('.vl-frac b').textContent).toBe('4/6');
    expect(db.update.mock.calls[1][1].resultHistory).toHaveLength(6);
  });
});

describe('발화 (§10-6)', () => {
  it('녹음은 복습 세션과 같은 옵션으로 시작하고, 녹음 중 표시가 뜬다', async () => {
    const { row } = await mountWith();
    const r1 = row(CARD1.id);
    r1.querySelector('.vl-acts [aria-label="녹음"]').click();
    await flush();
    expect(M.startMicRecording).toHaveBeenCalledTimes(1);
    expect(M.startMicRecording.lastOpts).toMatchObject({ autoStopSilenceMs: 1400, speculate: { expected: CARD1.sentence } });
    expect(M.startMicRecording.lastOpts.speculate.card.id).toBe(CARD1.id);
    expect(typeof M.startMicRecording.lastOpts.onAutoStop).toBe('function');
    expect(r1.querySelector('.vl-acts [aria-label="녹음"]').classList.contains('rec')).toBe(true);
    expect(r1.querySelector('.vl-acts .vl-rectext').textContent).toBe('녹음 중');
    expect(r1.querySelector('.vl-acts [aria-label="녹음"]').title).toBe('녹음 멈추기');
  });
  it('게이트 실패 → 토스트만, 저장 없음, 정답은 닫힌 채', async () => {
    M.judgeRecording.mockImplementation(() => ({ record: false, reason: 'off_script' }));
    const { row } = await mountWith();
    const r1 = row(CARD1.id);
    r1.querySelector('.vl-acts [aria-label="녹음"]').click();
    await flush();
    M.startMicRecording.lastOpts.onAutoStop();
    await flush();
    expect(M.stopAndAnalyze).toHaveBeenCalledWith(expect.anything(), CARD1.sentence, expect.objectContaining({ id: CARD1.id }), { enableMiscue: true });
    expect(M.showRecordToast).toHaveBeenCalledWith('gate:off_script');
    expect(M.savePronunciationLog).not.toHaveBeenCalled();
    expect(r1.querySelector('.vl-panel')).toBeNull();
    expect(r1.querySelector('.vl-acts [aria-label="녹음"]').classList.contains('rec')).toBe(false);
    expect(r1.querySelector('.vl-acts .vl-rectext')).toBeNull();
  });
  it('채점 성공 → 정답 자동 공개, 점수 원 + 감점 2개, 최신 점수 갱신, 빠뜨린 단어 조각 코랄, 발음 기록 저장', async () => {
    const { host, row } = await mountWith();
    const r1 = row(CARD1.id);
    r1.querySelector('.vl-acts [aria-label="녹음"]').click();
    await flush();
    M.startMicRecording.lastOpts.onAutoStop();
    await flush();
    const panel = r1.querySelector('.vl-panel');
    expect(panel).toBeTruthy();
    expect(r1.querySelector('.vl-reveal').textContent).toBe('가리기');
    const dot = panel.querySelector('.vl-pbot .v-dot');
    expect(dot.textContent).toBe('84');
    expect(dot.classList.contains('fresh')).toBe(true);
    expect(texts(panel, '.vl-ded')).toEqual(['억양·리듬 결손 −9.9', '소리가 어긋난 단어가 있어요 (slowly 71점) −5.8']);
    expect([...panel.querySelectorAll('.vl-pair .en')].map((n) => n.classList.contains('miss'))).toEqual([false, false, false, true]);
    expect(r1.querySelector('.vl-last .v-dot').textContent).toBe('84');
    expect(r1.querySelector('.vl-last .v-dot').classList.contains('fresh')).toBe(true);
    expect(M.scoreForDisplay).toHaveBeenCalledWith(expect.anything(), CARD1.sentence, 'en');
    expect(M.savePronunciationLog).toHaveBeenCalledWith(window.studyDB, expect.objectContaining({ sentenceId: CARD1.id, lang: 'en', date: TODAY, result: expect.objectContaining({ score: 84 }) }));
    expect(M.applyWeakPhonemesUpdate).toHaveBeenCalled();
    expect(host.querySelector('.vl-stat b.s').textContent).toBe('1');
    expect(panel.querySelector('.vl-levels')).toBeTruthy(); // 판정은 아직
    expect(panel.querySelector('[aria-label="녹음"]').title).toBe('다시 녹음');
  });
  it('녹음 중에 녹음 원을 다시 누르면 멈추고 채점한다 (복습 세션과 동일)', async () => {
    const { row } = await mountWith();
    const r1 = row(CARD1.id);
    const mic = () => r1.querySelector('[aria-label="녹음"]');
    mic().click();
    await flush();
    mic().click();
    await flush();
    expect(M.stopAndAnalyze).toHaveBeenCalledTimes(1);
    M.startMicRecording.lastOpts.onAutoStop(); // 늦게 온 자동종료 통보는 무시
    await flush();
    expect(M.stopAndAnalyze).toHaveBeenCalledTimes(1);
    expect(r1.querySelector('.vl-panel')).toBeTruthy();
  });
  it('마이크 불가 → 토스트, 상태 복귀', async () => {
    M.startMicRecording.mockImplementation(async () => ({ error: 'permission_denied' }));
    const { row } = await mountWith();
    const r1 = row(CARD1.id);
    r1.querySelector('.vl-acts [aria-label="녹음"]').click();
    await flush();
    expect(M.showRecordToast).toHaveBeenCalledWith('err:permission_denied');
    expect(r1.querySelector('.vl-acts [aria-label="녹음"]').classList.contains('rec')).toBe(false);
  });
});

describe('제거 확인 (§10-7)', () => {
  it('라운드 스트립·studySentRound 접근·정답 자동 재가림이 없다', async () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem');
    const { host, row } = await mountWith();
    expect(host.querySelector('.vl-round')).toBeNull();
    expect(host.querySelector('.en.masked')).toBeNull();
    expect(getItem.mock.calls.some(([k]) => String(k).startsWith('studySentRound'))).toBe(false);
    const r1 = row(CARD1.id);
    r1.querySelector('.vl-reveal').click();
    r1.querySelector('.vl-lv[data-level="O"]').click();
    await new Promise((r) => setTimeout(r, 700));
    expect(r1.querySelector('.vl-panel')).toBeTruthy();
    expect(r1.querySelector('.vl-jchip').textContent).toBe('쉬움');
    expect(host.querySelector('.vl-wrap').textContent).not.toMatch(/→/); // 화면 문구 기준 (style 텍스트 제외)
    getItem.mockRestore();
  });
});
