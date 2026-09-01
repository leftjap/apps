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

/* 실사용 보고 (2026-09-01): 어제 하다 만 신규 세션을 오늘 '이어서 하기'로 열면 총 0회·녹음 0/N —
 * 자정 경계(2026-08-29)가 스냅샷을 마감·폐기한 뒤의 fresh 진입에 수화가 없었다(재청취 분기 한정).
 * 복습 페이지와 같은 계약: 표시용 exLog 만 수화, recLog(진행 게이트·버튼 라벨)는 오늘 발화 전용. */
describe('session-new — 미완료 세션 fresh 진입 수화', () => {
  beforeEach(() => { vi.clearAllMocks(); sessionStorage.clear(); });

  it('빈 exLog 스냅샷을 복원해도 이력이 보인다 — 수화 병합 (실보고 2차: 배포 전 스냅샷이 0 을 고정)', async () => {
    /* 2026-09-01 2차 보고: fresh 분기 수화 배포 후에도 0 — 배포 전 진입이 만든 '빈 exLog' 오늘자
     * 스냅샷이 TTL(1시간) 안의 재진입마다 복원 분기로 살아나, fresh 분기의 수화가 영영 안 돌았다.
     * 복원 시에도 전체 이력을 카드 단위로 병합한다 (스냅샷 exLog 는 영속분의 부분집합). */
    const CARDS = [
      { ...NCARD('n1', 'One two.', '뜻하나'), explanation: { key: 'k', drills: [{ en: 'Drill one.', kr: '', ko: '드릴 하나' }] } },
      NCARD('n2', 'Three four.', '뜻둘'),
    ];
    window.studyDB = fakeDB2({ activeSession: { key: 'activeSession', value: {
      mode: 'new', lang: 'en', todayISO: localISODate(), startTime: Date.now() - 60_000, activeSec: 30, base: null,
      step: 1, tried: 0, passed: 0, lastScore: null, pronScores: [], weakInSession: {},
      recLog: {}, exLog: {}, cardIds: ['n1', 'n2'], cards: CARDS, savedAt: Date.now(),
    } } });
    window.studyDB.pronunciationLog = { where: () => ({ equals: () => ({ toArray: async () => [
      { sentenceId: 'n1', lang: 'en', date: '2026-08-31', overallScore: 73, createdAt: '2026-08-31T01:00:00Z' },
      { sentenceId: 'n1', lang: 'en', date: '2026-08-31', overallScore: 75, createdAt: '2026-08-31T01:01:00Z' },
      { sentenceId: 'n1#drill#Drill one.', lang: 'en', date: '2026-08-31', overallScore: 77, createdAt: '2026-08-31T01:02:00Z' },
    ] }) }) };
    loadNewCards.mockResolvedValueOnce(CARDS);
    document.body.innerHTML = '<div id="root"></div>';
    const cleanup = mountSessionNew(document.getElementById('root'));
    await settle2();
    expect(document.body.textContent).toContain('총 2회');
    expect(document.body.textContent).toContain('녹음 1 / 1');
    expect(document.querySelector('.vs-ring .cn')?.textContent).toBe('75');
    expect(document.querySelector('.vs-cap')?.textContent).toBe('지난 점수'); // 수화된 값 — '방금'이 아니다
    cleanup();
  });

  it('스냅샷 없이 진입해도 pronunciationLog 이력이 보인다 — exLog 만, recLog 미수화', async () => {
    const CARDS = [
      { ...NCARD('n1', 'One two.', '뜻하나'), explanation: { key: 'k', drills: [{ en: 'Drill one.', kr: '', ko: '드릴 하나' }] } },
      NCARD('n2', 'Three four.', '뜻둘'),
    ];
    window.studyDB = fakeDB2({});
    window.studyDB.pronunciationLog = { where: () => ({ equals: () => ({ toArray: async () => [
      { sentenceId: 'n1', lang: 'en', date: '2026-08-31', overallScore: 73, createdAt: '2026-08-31T01:00:00Z' },
      { sentenceId: 'n1', lang: 'en', date: '2026-08-31', overallScore: 75, createdAt: '2026-08-31T01:01:00Z' },
      { sentenceId: 'n1#drill#Drill one.', lang: 'en', date: '2026-08-31', overallScore: 77, createdAt: '2026-08-31T01:02:00Z' },
    ] }) }) };
    loadNewCards.mockResolvedValueOnce(CARDS);
    document.body.innerHTML = '<div id="root"></div>';
    const cleanup = mountSessionNew(document.getElementById('root'));
    await settle2();
    expect(document.body.textContent).toContain('총 2회');                  // 어제 메인 발화 2회
    expect(document.body.textContent).toContain('녹음 1 / 1');              // 어제 드릴 녹음 이력
    expect(document.body.textContent).toContain('77');                     // 드릴 행 점수 원
    expect(document.querySelector('.vs-ring .cn')?.textContent).toBe('75'); // 링 = 이 카드 최신 메인 점수
    expect(document.querySelector('.vs-cap')?.textContent).toBe('지난 점수'); // 수화된 값 — '방금'이 아니다
    // recLog 미수화 — 버튼 라벨·진행 게이트는 오늘 발화 전용 (복습 페이지와 같은 계약)
    expect(document.body.textContent).toContain('따라 말하기');
    expect(document.body.textContent).not.toContain('다시 말하기');
    cleanup();
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

  it('과거 발화 점수 이력이 다시 듣기 첫 진입에 보인다 — pronunciationLog 전체 이력 수화', async () => {
    // 실사용 보고(2026-08-31): 신규 세션 완료 → 다시 듣기 진입 시 총 0회·점수 원 없음.
    const today = localISODate();
    const RD = [
      { ...NCARD('r1', 'Replay one.', '재청취 하나'), explanation: { key: 'k', drills: [{ en: 'Drill one.', kr: '', ko: '드릴 하나' }] } },
      NCARD('r2', 'Replay two.', '재청취 둘'),
    ];
    window.studyDB = fakeDB2({});
    window.studyDB.pronunciationLog = { where: () => ({ equals: () => ({ toArray: async () => [
      { sentenceId: 'r1', lang: 'en', date: today, overallScore: 88, createdAt: '2026-08-31T01:00:00Z' },
      { sentenceId: 'r1', lang: 'en', date: today, overallScore: 92, createdAt: '2026-08-31T01:01:00Z' },
      { sentenceId: 'r1#drill#Drill one.', lang: 'en', date: today, overallScore: 77, createdAt: '2026-08-31T01:02:00Z' },
      { sentenceId: 'r1', lang: 'en', date: '2026-01-01', overallScore: 55, createdAt: '2026-01-01T01:00:00Z' },
    ] }) }) };
    loadNewCards.mockResolvedValueOnce([]);
    loadReplayCards.mockResolvedValueOnce(RD);
    document.body.innerHTML = '<div id="root"></div>';
    const cleanup = mountSessionNew(document.getElementById('root'));
    await settle2();
    expect(document.body.textContent).toContain('총 3회');                 // 과거(55)+오늘(88·92) 전체 이력
    expect(document.querySelector('.vs-ring .cn')?.textContent).toBe('92'); // 링 = 최신 점수
    expect(document.body.textContent).toContain('55');                     // 과거 발화 점수 원도 표시
    expect(document.body.textContent).toContain('77');                     // 드릴 행 점수 원
    cleanup();
  });

  it('빈 exLog 재청취 스냅샷을 복원해도 이력이 보인다 — 분기 공통 수화 (고착 루프 차단)', async () => {
    /* 신규 세션의 3연속 재발(재청취 fresh → 신규 fresh → 신규 restore)과 같은 계열의 잔여 구멍:
     * 재청취 restore 분기도 수화 없이 스냅샷만 살렸다. 수화가 한 번 실패해 빈 스냅샷이 남으면
     * TTL 안의 재진입마다 0 이 고착된다 — 분기 공통 수화가 매 진입 재시도로 자기 치유한다. */
    const RD = [
      { ...NCARD('r1', 'Replay one.', '재청취 하나'), explanation: { key: 'k', drills: [{ en: 'Drill one.', kr: '', ko: '드릴 하나' }] } },
      NCARD('r2', 'Replay two.', '재청취 둘'),
    ];
    window.studyDB = fakeDB2({ activeSession: { key: 'activeSession', value: {
      mode: 'replay', lang: 'en', todayISO: localISODate(), startTime: Date.now() - 60_000, activeSec: 30,
      base: null, step: 1, tried: 0, passed: 0, lastScore: null, pronScores: [], weakInSession: {},
      recLog: {}, exLog: {}, cardIds: ['r1', 'r2'], cards: RD, savedAt: Date.now(),
    } } });
    window.studyDB.pronunciationLog = { where: () => ({ equals: () => ({ toArray: async () => [
      { sentenceId: 'r1', lang: 'en', date: '2026-08-31', overallScore: 88, createdAt: '2026-08-31T01:00:00Z' },
      { sentenceId: 'r1', lang: 'en', date: '2026-08-31', overallScore: 92, createdAt: '2026-08-31T01:01:00Z' },
    ] }) }) };
    loadNewCards.mockResolvedValueOnce([]);
    loadReplayCards.mockResolvedValueOnce(RD);
    document.body.innerHTML = '<div id="root"></div>';
    const cleanup = mountSessionNew(document.getElementById('root'));
    await settle2();
    expect(document.body.textContent).toContain('총 2회');
    expect(document.querySelector('.vs-ring .cn')?.textContent).toBe('92');
    cleanup();
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
