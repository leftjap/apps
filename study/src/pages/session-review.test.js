// @vitest-environment jsdom
// 복습 페이지 mount 계층 — 스냅샷 복원 계약 (2026-08-29 오후 2차 감사 확증 #4: 순수 함수 테스트만으론
// 페이지 배선 8곳을 되돌려도 전 스위트가 초록이었다). activeSession 은 실물, 협력 모듈은 mock.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./cardLoader.js', async (orig) => ({
  ...await orig(),
  loadReviewCards: vi.fn(async () => []),
  loadFreeReviewCards: vi.fn(async () => []),
  loadQueueFromSession: vi.fn(async () => null),
}));
vi.mock('../services/sessionFinish.js', async (orig) => ({
  ...await orig(),
  finishSession: vi.fn(async () => ({})),
  flushLiveStats: vi.fn(async () => null),
}));
vi.mock('../services/sessionAnalyze.js', () => ({
  startMicRecording: vi.fn(async () => ({ controller: { stop() {} } })),
  stopAndAnalyze: vi.fn(async () => ({ score: 90 })),
}));
vi.mock('../services/srs.js', async (orig) => ({ ...await orig(), applySrsUpdate: vi.fn(async () => null) }));
vi.mock('../services/pronunciationLog.js', async (orig) => ({
  ...await orig(),
  savePronunciationLog: vi.fn(async () => null),
  loadDrillLog: vi.fn(async () => ({})),
}));
vi.mock('../services/weakPhonemes.js', () => ({ applyWeakPhonemesUpdate: vi.fn(async () => null) }));
vi.mock('../services/sessionStats.js', () => ({
  fetchDayUtterMap: vi.fn(async () => ({})),
  prevStudyDayUtterance: vi.fn(() => 0),
  fetchPRDays: vi.fn(async () => []),
}));
vi.mock('../services/summaryData.js', () => ({ buildSummaryData: vi.fn(() => ({})), persistSummary: vi.fn() }));

import { mountSessionReview } from './session-review.js';
import { loadReviewCards } from './cardLoader.js';
import { finishSession, flushLiveStats } from '../services/sessionFinish.js';
import { localISODate } from '../utils/today.js';

const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async (n = 8) => { for (let i = 0; i < n; i += 1) await tick(); };

const TODAY = localISODate();
const YESTERDAY = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return localISODate(d); })();

function fakeDB(metaInit = {}) {
  const meta = new Map(Object.entries(metaInit));
  return {
    _meta: meta,
    meta: {
      get: vi.fn(async (k) => meta.get(k)),
      put: vi.fn(async (row) => { meta.set(row.key, row); }),
      delete: vi.fn(async (k) => { meta.delete(k); }),
    },
    pronunciationLog: { where: () => ({ equals: () => ({ toArray: async () => [] }) }) },
    dailyStats: { get: vi.fn(async () => undefined) },
    todayLessons: { bulkGet: vi.fn(async (ids) => ids.map(() => undefined)) },
  };
}

const CARD = (id, sentence, meaning) => ({
  id, lang: 'en', sentence, meaning, interval: 3, explanation: { key: `${sentence} = ${meaning}` },
});
const CARDS3 = [CARD('c1', 'One two.', '뜻하나'), CARD('c2', 'Three four.', '뜻둘'), CARD('c3', 'Five six.', '뜻셋')];

const SNAP = (over = {}) => ({ key: 'activeSession', value: {
  mode: 'review', lang: 'en', todayISO: TODAY, startTime: Date.now() - 60_000, activeSec: 60, base: null,
  step: 2, tried: 3, passed: 2, lastScore: 88, pronScores: [88], weakInSession: {},
  recLog: { c1: { count: 2, best: 88 } }, exLog: { c1: { utter: [80, 88] } },
  judged: { got: 1, hmm: 0, no: 0 }, cardIds: ['c1', 'c2', 'c3'], cards: CARDS3,
  savedAt: Date.now(), ...over,
} });

function mount() {
  document.body.innerHTML = '<div id="root"></div>';
  const host = document.getElementById('root');
  const cleanup = mountSessionReview(host);
  return { host, cleanup };
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  delete window.studyRoute;
});

describe('session-review — 새로고침 복원 (스냅샷 cards 정본)', () => {
  it('판정으로 로더 목록이 줄어도 스냅샷 목록·진행으로 복원된다 — 스냅샷 미삭제', async () => {
    // 복습의 결정론적 소실 시나리오: c1 판정 → 새로고침 → due 필터가 c1 을 뺀 [c2,c3]만 준다.
    window.studyDB = fakeDB({ activeSession: SNAP() });
    loadReviewCards.mockResolvedValueOnce([CARDS3[1], CARDS3[2]]);
    const { host, cleanup } = mount();
    await settle();
    // step 2 = 스냅샷 목록의 c2(뜻둘). 배선이 로더 목록을 쓰면 c3(뜻셋)이 뜬다.
    expect(host.querySelector('.vr-h1').textContent).toBe('뜻둘');
    expect(window.studyDB._meta.has('activeSession')).toBe(true);   // 파기 금지
    cleanup();
  });

  it('언마운트 스냅샷에 cards 실물과 recLog 가 담긴다', async () => {
    window.studyDB = fakeDB({ activeSession: SNAP() });
    loadReviewCards.mockResolvedValueOnce([CARDS3[1], CARDS3[2]]);
    const { cleanup } = mount();
    await settle();
    cleanup();
    await settle(2);
    const saved = window.studyDB._meta.get('activeSession').value;
    expect(saved.cards).toHaveLength(3);
    expect(saved.cards.map((c) => c.id)).toEqual(['c1', 'c2', 'c3']);
    expect(saved.recLog).toEqual({ c1: { count: 2, best: 88 } });
  });

  it('자정을 넘긴 스냅샷은 복원하지 않고 어제 날짜로 정식 마감 후 새 세션 — 오늘 학습이 어제 행에 계상되지 않는다', async () => {
    window.studyDB = fakeDB({ activeSession: SNAP({ todayISO: YESTERDAY, base: { date: YESTERDAY, lang: 'en' } }) });
    loadReviewCards.mockResolvedValueOnce(CARDS3);
    const { host, cleanup } = mount();
    await settle();
    expect(finishSession).toHaveBeenCalledTimes(1);
    expect(finishSession.mock.calls[0][1]).toMatchObject({ mode: 'review', date: YESTERDAY });
    expect(host.querySelector('.vr-h1').textContent).toBe('뜻하나');   // 새 세션 1번 카드
    cleanup();
    await settle(2);
    // 언마운트 스냅샷은 '오늘' 새 세션분이다 — 어제 base 를 승계하지 않는다.
    expect(window.studyDB._meta.get('activeSession').value.todayISO).toBe(TODAY);
  });

  it('과거 발화 점수 이력이 복습 진입에 보인다 — pronunciationLog 수화 (표시용 exLog 만, recLog 미수화)', async () => {
    // 2026-08-31 사용자 결정 — "복습에서도 과거 점수 기록이 학습에 도움". 게이트(recLog)는 오염 금지.
    const CARD_D = { ...CARD('c1', 'One two.', '뜻하나'), explanation: { key: 'k', drills: [{ en: 'Drill one.', kr: '', ko: '드릴' }] } };
    window.studyDB = fakeDB({});
    window.studyDB.pronunciationLog = { where: () => ({ equals: () => ({ toArray: async () => [
      { sentenceId: 'c1', lang: 'en', date: '2026-08-29', overallScore: 81, createdAt: '2026-08-29T01:00:00Z' },
      { sentenceId: 'c1', lang: 'en', date: '2026-08-30', overallScore: 87, createdAt: '2026-08-30T01:00:00Z' },
      { sentenceId: 'c1#drill#Drill one.', lang: 'en', date: '2026-08-30', overallScore: 77, createdAt: '2026-08-30T01:01:00Z' },
    ] }) }) };
    loadReviewCards.mockResolvedValueOnce([CARD_D]);
    const { host, cleanup } = mount();
    await settle();
    const dots = [...host.querySelectorAll('.vr-meta .v-dot')].filter((d) => !d.classList.contains('empty'));
    expect(dots.map((d) => d.textContent)).toEqual(['81', '87']);   // 메인 과거 점수 원
    expect(host.querySelector('.vs-gscore')?.textContent).toContain('77'); // 드릴 행 과거 점수 원
    cleanup();
  });

  it('빈 exLog 스냅샷을 복원해도 이력이 보인다 — 분기 공통 수화 (고착 루프 차단)', async () => {
    /* 신규 페이지 3연속 재발과 같은 계열: 복원 분기가 '스냅샷에 수화분이 이미 있다'는 전제로
     * 수화를 건너뛰었는데, 수화가 한 번 실패한 스냅샷이 남으면 TTL 안에서 0 이 고착된다. */
    const CARD_D = { ...CARD('c1', 'One two.', '뜻하나'), explanation: { key: 'k', drills: [{ en: 'Drill one.', kr: '', ko: '드릴' }] } };
    window.studyDB = fakeDB({ activeSession: SNAP({ step: 1, exLog: {}, recLog: {}, lastScore: null, cardIds: ['c1'], cards: [CARD_D] }) });
    window.studyDB.pronunciationLog = { where: () => ({ equals: () => ({ toArray: async () => [
      { sentenceId: 'c1', lang: 'en', date: '2026-08-30', overallScore: 87, createdAt: '2026-08-30T01:00:00Z' },
      { sentenceId: 'c1#drill#Drill one.', lang: 'en', date: '2026-08-30', overallScore: 77, createdAt: '2026-08-30T01:01:00Z' },
    ] }) }) };
    loadReviewCards.mockResolvedValueOnce([CARD_D]);
    const { host, cleanup } = mount();
    await settle();
    // 드릴 행 점수 원은 exLog 에서만 나온다 (메인 점수 원은 sentLog 라 분기 무관 — 관찰 지점 아님)
    expect(host.querySelector('.vs-gscore')?.textContent).toContain('77');
    cleanup();
  });

  it('로드 실패 시 기존 스냅샷을 빈 스냅샷으로 덮어쓰지 않는다 (§2-I) — 라이브 통계도 미기록', async () => {
    window.studyDB = fakeDB({ activeSession: SNAP() });
    loadReviewCards.mockRejectedValueOnce(new Error('DatabaseClosedError'));
    const { cleanup } = mount();
    await settle();
    cleanup();
    await settle(2);
    const saved = window.studyDB._meta.get('activeSession').value;
    expect(saved.step).toBe(2);                    // 진행 보존 — 빈 스냅샷(step1·cards0)이 아니다
    expect(saved.cardIds).toEqual(['c1', 'c2', 'c3']);
    expect(flushLiveStats).not.toHaveBeenCalled(); // base 미확보 상태의 dailyStats 덮어쓰기 금지
  });
});

/* 복습도 같은 결함 (2026-09-03) — 이력 수화가 카드 항목을 통째로 갈아끼워 스냅샷의 체이닝 진행(chain.cur)이
 * 재진입 때 사라졌다. 신규 페이지(session-new)와 같은 필드 단위 병합. 체이닝 단계 행 점수 원(#chain# 이력)도
 * 복습 진입에 보여야 한다. */
describe('session-review — 수화 병합이 체이닝 진행을 지우지 않고, 체이닝 점수 원이 보인다', () => {
  it('스냅샷 chain.cur 보존 + #chain# 이력이 단계 행에 원으로', async () => {
    const CHAIN = { target: 'It is a promise', chunks: ['It is', 'a promise'], ko: '약속이야' };
    const CARD_C = { ...CARD('c1', 'One two.', '뜻하나'), explanation: { key: 'k', chain: CHAIN, drills: [{ en: 'Drill one.', kr: '', ko: '드릴' }] } };
    window.studyDB = fakeDB({ activeSession: SNAP({ step: 1, exLog: { c1: { chain: { cur: 1 } } }, recLog: {}, lastScore: null, cardIds: ['c1'], cards: [CARD_C] }) });
    window.studyDB.pronunciationLog = { where: () => ({ equals: () => ({ toArray: async () => [
      { sentenceId: 'c1', lang: 'en', date: '2026-08-30', overallScore: 87, createdAt: '2026-08-30T01:00:00Z' },
      { sentenceId: 'c1#chain#It is', lang: 'en', date: '2026-08-30', overallScore: 88, createdAt: '2026-08-30T01:02:00Z' },
    ] }) }) };
    loadReviewCards.mockResolvedValueOnce([CARD_C]);
    const { host, cleanup } = mount();
    await settle();
    expect(host.querySelector('.vs-chain .ct')?.textContent).toContain('통과 1 / 2');                 // 진행 보존
    expect([...host.querySelectorAll('.vs-chain .vs-drow')][0].querySelector('.vs-gdots')?.textContent).toContain('88'); // 이력 원
    cleanup();
  });
});
