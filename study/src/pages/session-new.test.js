// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { restoreCardScore } from './session-new.js';

/* 카드 이동 시 점수링 복원 — 종전엔 recLog[id].best(최고)를 썼다. 캡션이 '방금 점수' 인데 값이
 * 최고라 어긋났고, best 는 드릴·체이닝 발화까지 섞인 최댓값이라 메인 카드의 '방금'이 아니다.
 * 정본은 exLog[id].utter — 문장 카드 점수 열과 같은 배열이고 메인 녹음에서만 쌓인다 (sessionExprV2 applyScore). */
describe('session-new — restoreCardScore (카드 이동 시 점수링 복원)', () => {
  it('그 카드의 마지막 메인 점수를 돌려준다 (배열 끝)', () => {
    expect(restoreCardScore({ c1: { utter: [88, 72] } }, 'c1')).toBe(72);
  });

  it('아직 메인 녹음이 없으면 null — 링을 그리지 않는다', () => {
    expect(restoreCardScore({ c1: { drills: { 0: [90] } } }, 'c1')).toBeNull();
    expect(restoreCardScore({}, 'c1')).toBeNull();
    expect(restoreCardScore(undefined, 'c1')).toBeNull();
  });

  it('다른 카드 점수를 끌어오지 않는다', () => {
    expect(restoreCardScore({ c1: { utter: [72] } }, 'c2')).toBeNull();
  });

  it('숫자가 아닌 값은 null (구 스냅샷 방어)', () => {
    expect(restoreCardScore({ c1: { utter: [] } }, 'c1')).toBeNull();
    expect(restoreCardScore({ c1: { utter: ['72'] } }, 'c1')).toBeNull();
  });
});

/* mount 계층 — 스냅샷 복원 계약 (2026-08-29 오후 2차 감사 확증 #4). 복습 하네스(session-review.test.js)와
 * 동형 — 신규 페이지 고유 분기(replay 폴백 vs 복원 우선)와 로드 실패 봉인을 고정한다. */
vi.mock('./cardLoader.js', async (orig) => ({
  ...await orig(),
  loadNewCards: vi.fn(async () => []),
  loadReplayCards: vi.fn(async () => []),
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
vi.mock('../services/pronunciationLog.js', async (orig) => ({
  ...await orig(),
  savePronunciationLog: vi.fn(async () => null),
}));
vi.mock('../services/weakPhonemes.js', () => ({ applyWeakPhonemesUpdate: vi.fn(async () => null) }));
vi.mock('../services/sessionStats.js', () => ({
  fetchDayUtterMap: vi.fn(async () => ({})),
  prevStudyDayUtterance: vi.fn(() => 0),
  fetchPRDays: vi.fn(async () => []),
}));
vi.mock('../services/summaryData.js', () => ({ buildSummaryData: vi.fn(() => ({})), persistSummary: vi.fn() }));
vi.mock('../services/sceneProgress.js', () => ({
  getSceneShadow: vi.fn(async () => ({})), setSceneShadow: vi.fn(async () => null), clearSceneShadow: vi.fn(async () => null),
}));

import { mountSessionNew } from './session-new.js';
import { loadNewCards, loadReplayCards } from './cardLoader.js';
import { flushLiveStats } from '../services/sessionFinish.js';
import { localISODate } from '../utils/today.js';

const tick2 = () => new Promise((r) => setTimeout(r, 0));
const settle2 = async (n = 8) => { for (let i = 0; i < n; i += 1) await tick2(); };

function fakeDB2(metaInit = {}) {
  const meta = new Map(Object.entries(metaInit));
  return {
    _meta: meta,
    meta: {
      get: vi.fn(async (k) => meta.get(k)),
      put: vi.fn(async (row) => { meta.set(row.key, row); }),
      delete: vi.fn(async (k) => { meta.delete(k); }),
    },
    dailyStats: { get: vi.fn(async () => undefined) },
    todayLessons: { bulkGet: vi.fn(async (ids) => ids.map(() => undefined)) },
  };
}

const NCARD = (id, sentence, ko) => ({ id, lang: 'en', sentence, ko, pron: '', explanation: { key: `${sentence} = ${ko}` } });
const NCARDS = [NCARD('n1', 'One two.', '뜻하나'), NCARD('n2', 'Three four.', '뜻둘'), NCARD('n3', 'Five six.', '뜻셋')];
const NSNAP = (over = {}) => ({ key: 'activeSession', value: {
  mode: 'new', lang: 'en', todayISO: localISODate(), startTime: Date.now() - 60_000, activeSec: 60, base: null,
  step: 2, tried: 3, passed: 2, lastScore: 88, pronScores: [88], weakInSession: {},
  recLog: {}, exLog: { n2: { utter: [77] } }, cardIds: ['n1', 'n2', 'n3'], cards: NCARDS,
  savedAt: Date.now(), ...over,
} });

describe('session-new — mount 복원 계약', () => {
  beforeEach(() => { vi.clearAllMocks(); sessionStorage.clear(); });

  it('세션 중 목록이 비어도(sync pull 등) 스냅샷이 있으면 replay 로 빠지지 않고 복원한다', async () => {
    window.studyDB = fakeDB2({ activeSession: NSNAP() });
    loadNewCards.mockResolvedValueOnce([]);
    document.body.innerHTML = '<div id="root"></div>';
    const cleanup = mountSessionNew(document.getElementById('root'));
    await settle2();
    expect(loadReplayCards).not.toHaveBeenCalled();               // 다시 듣기 폴백 미진입
    expect(document.body.textContent).toContain('Three four.');   // 스냅샷 step 2 카드
    expect(window.studyDB._meta.has('activeSession')).toBe(true); // 파기 금지
    cleanup();
  });

  it('로드 실패 시 기존 스냅샷을 빈 스냅샷으로 덮어쓰지 않는다 — 라이브 통계도 미기록', async () => {
    window.studyDB = fakeDB2({ activeSession: NSNAP() });
    loadNewCards.mockRejectedValueOnce(new Error('DatabaseClosedError'));
    document.body.innerHTML = '<div id="root"></div>';
    const cleanup = mountSessionNew(document.getElementById('root'));
    await settle2();
    cleanup();
    await settle2(2);
    const saved = window.studyDB._meta.get('activeSession').value;
    expect(saved.step).toBe(2);
    expect(saved.cardIds).toEqual(['n1', 'n2', 'n3']);
    expect(flushLiveStats).not.toHaveBeenCalled();
  });
});

/* 재청취(다시 듣기)도 화면 상태를 저장·복원한다 (2026-08-30 사용자 결정 — "다시 듣기에서도
 * 점수가 날아가면 안 된다"). mode 'replay' 스냅샷: finalizeStaleSnapshot 은 미지 모드라 기록을
 * 남기지 않고(이중집계 0), home '이어서 하기'(new|review 한정)에도 안 뜬다. 실세션 보호
 * (finishSession·flushLiveStats 스킵)는 그대로 유지가 계약이다. */
describe('session-new — 재청취(replay) 화면 상태 저장·복원', () => {
  beforeEach(() => { vi.clearAllMocks(); sessionStorage.clear(); });
  const RCARDS = [
    NCARD('r1', 'Replay one.', '재청취 하나'),
    NCARD('r2', 'Replay two.', '재청취 둘'),
  ];

  it('재청취 녹음 → 언마운트 스냅샷이 mode replay 로 저장되고, 라이브 통계는 안 쓴다', async () => {
    window.studyDB = fakeDB2({});
    loadNewCards.mockResolvedValueOnce([]);
    loadReplayCards.mockResolvedValueOnce(RCARDS);
    document.body.innerHTML = '<div id="root"></div>';
    const cleanup = mountSessionNew(document.getElementById('root'));
    await settle2();
    document.querySelector('.vs-pill.pri').click(); await settle2(2);
    document.querySelector('.vs-pill.recing').click(); await settle2(3);
    cleanup();
    await settle2(2);
    const saved = window.studyDB._meta.get('activeSession')?.value;
    expect(saved?.mode).toBe('replay');
    expect(saved?.tried).toBe(1);
    expect(saved?.cards).toHaveLength(2);
    expect(flushLiveStats).not.toHaveBeenCalled();   // 완료 세션 이중집계 방지 계약 유지
  });

  it('재청취 재진입 시 스냅샷으로 화면이 복원된다 — 새로고침에도 점수·진행 유지', async () => {
    const snap = { key: 'activeSession', value: {
      mode: 'replay', lang: 'en', todayISO: localISODate(), startTime: Date.now() - 60_000, activeSec: 30,
      base: null, step: 2, tried: 3, passed: 2, lastScore: 88, pronScores: [88], weakInSession: {},
      recLog: { r2: { count: 1, best: 88 } }, exLog: { r2: { utter: [88] } },
      cardIds: ['r1', 'r2'], cards: RCARDS, savedAt: Date.now(),
    } };
    window.studyDB = fakeDB2({ activeSession: snap });
    loadNewCards.mockResolvedValueOnce([]);
    loadReplayCards.mockResolvedValueOnce(RCARDS);
    document.body.innerHTML = '<div id="root"></div>';
    const cleanup = mountSessionNew(document.getElementById('root'));
    await settle2();
    expect(document.body.textContent).toContain('Replay two.');            // step 2 카드 복원
    expect(window.studyDB._meta.has('activeSession')).toBe(true);          // 파기 금지
    cleanup();
  });
});
