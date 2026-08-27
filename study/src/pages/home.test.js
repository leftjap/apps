import { describe, it, expect } from 'vitest';
import { countNewExpressions, isSceneCard, longestStreak, streakStats, masteredCount } from './home.js';

// 홈 hero '오늘의 새 표현 N개' 는 표현(expression) 수여야 한다. scene(전체 대화 듣기) 카드는
// 표현이 아니므로 제외 — todayNewDone(=newSentenceIds, scene 미포함) 단위와 정합해 진행 dots·done 게이트도 일치.
// 배경: 07-02(scene + 표현 2) 가 홈에 '표현 3개'로 뜨던 과대카운트 (2026-07-01 재검토 항목7).
describe('home — 신규 표현 카운트 (scene 제외)', () => {
  const scene = (completed = false) => ({ id: 's', completed, order_index: 0, explanation: { dialogue: [{ speaker: 'Jim', en: 'x', ko: 'y' }] } });
  const expr = (id, completed = false) => ({ id, completed, explanation: { key: 'k = v' } });

  it('isSceneCard: dialogue 배열 보유 = scene', () => {
    expect(isSceneCard(scene())).toBe(true);
    expect(isSceneCard(expr('a'))).toBe(false);
  });

  it('scene + 미완료 표현 2개 → 2 (scene 제외 — 07-02 재현)', () => {
    expect(countNewExpressions([scene(), expr('a'), expr('b')])).toBe(2);
  });

  it('그룹 전체 완료 → 0 (done 게이트 정합)', () => {
    expect(countNewExpressions([scene(true), expr('a', true), expr('b', true)])).toBe(0);
  });

  it('완료/미완료 혼재 → 미완료 표현만 카운트', () => {
    expect(countNewExpressions([scene(), expr('a', true), expr('b'), expr('c')])).toBe(2);
  });

  it('ja(콩트 — dialogue 없음) 카드는 전부 표현으로 카운트 (scene 개념 없음)', () => {
    const ja = (id, completed = false) => ({ id, completed, explanation: { whenToUse: 'w' } });
    expect(countNewExpressions([ja('a'), ja('b'), ja('c')])).toBe(3);
  });
});

/* 2026-08-23 — bestStreak 이 PR meta(일 발화 최대치·학습시간 초)를 읽어 연속 '일'수와 빼고 있었다.
 * PR 이 한 번도 저장되지 않아 그동안 null 로 가려져 있었는데, 같은 날 PR 저장을 붙이면서
 * "최고 기록까지 35일"(35 = 발화 횟수) 같은 헛값이 뜨게 됐다. 실제 최장 연속 학습일로 대체한다. */
describe('home — 최장 연속 학습일(longestStreak)', () => {
  it('연속 구간 중 가장 긴 것을 센다', () => {
    // 08-01~03(3일), 08-10~14(5일), 08-20(1일)
    const dates = ['2026-08-20', '2026-08-14', '2026-08-13', '2026-08-12', '2026-08-11', '2026-08-10',
      '2026-08-03', '2026-08-02', '2026-08-01'];
    expect(longestStreak(dates)).toBe(5);
  });

  it('정렬 순서와 무관하다 (오름차순 입력도 동일)', () => {
    expect(longestStreak(['2026-08-01', '2026-08-02', '2026-08-03'])).toBe(3);
  });

  it('중복 날짜는 하루로 센다 (하루에 여러 세션)', () => {
    expect(longestStreak(['2026-08-01', '2026-08-01', '2026-08-02'])).toBe(2);
  });

  it('월 경계를 넘어도 이어진다', () => {
    expect(longestStreak(['2026-07-31', '2026-08-01'])).toBe(2);
  });

  it('빈 배열 → 0, 하루 → 1', () => {
    expect(longestStreak([])).toBe(0);
    expect(longestStreak(['2026-08-01'])).toBe(1);
    expect(longestStreak(null)).toBe(0);
  });
});

/* 2026-08-24 — 브라우저 실행 검증에서 "학습 첫날 → 최고 기록 경신 중" 이 뜨는 걸 발견.
 * 1 >= 1 이라 기술적으론 참이지만 넘어설 이전 기록이 없다. bestStreak 을 '현재 연속을 제외한
 * 이전 최고'로 정의해 첫 기록에서는 아무 주장도 하지 않게 한다.
 * 겸사겸사 loadStats/loadMathStats 에 복제돼 있던 streak 루프를 여기로 뺀다(테스트 가능해짐). */
describe('home — streakStats (현재 연속 + 이전 최고)', () => {
  it('과거 5일 연속 + 현재 3일 연속 → streak 3, previousBest 5', () => {
    expect(streakStats(
      ['2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14',
        '2026-08-22', '2026-08-23', '2026-08-24'], '2026-08-24',
    )).toEqual({ streak: 3, previousBest: 5 });
  });

  it('학습 첫날 → previousBest 0 (주장할 이전 기록 없음)', () => {
    expect(streakStats(['2026-08-24'], '2026-08-24')).toEqual({ streak: 1, previousBest: 0 });
  });

  it('현재가 과거를 넘어섰을 때 → streak 4, previousBest 3', () => {
    expect(streakStats(
      ['2026-08-01', '2026-08-02', '2026-08-03',
        '2026-08-21', '2026-08-22', '2026-08-23', '2026-08-24'], '2026-08-24',
    )).toEqual({ streak: 4, previousBest: 3 });
  });

  it('오늘 아직 안 했으면 어제까지의 연속을 센다', () => {
    expect(streakStats(['2026-08-22', '2026-08-23'], '2026-08-24'))
      .toEqual({ streak: 2, previousBest: 0 });
  });

  it('이틀 이상 쉬었으면 현재 연속 0, 과거는 이전 최고로', () => {
    expect(streakStats(['2026-08-10', '2026-08-11'], '2026-08-24'))
      .toEqual({ streak: 0, previousBest: 2 });
  });

  it('기록 없음 → 0/0', () => {
    expect(streakStats([], '2026-08-24')).toEqual({ streak: 0, previousBest: 0 });
  });
});

/* 2026-08-27 — 홈 누적 '마스터한 문장' 이 reviewQueue 전체 행 수였다. 그건 재고지 성취가 아니라
 * 옆칸 '배운 표현'(newSentenceIds 합)과 같은 층위의 숫자가 됐다.
 * 기준은 앱이 이미 가진 consecutivePass ≥ 2 (userMeta.js PASS_THRESHOLD, spec §4 익힘 처리).
 * interval>=30 은 폐기 — SRS_INTERVALS 가 [1,3,7,21,60] 뿐이라 사실상 60 하나만 걸리는 임의값이고,
 * 졸업 카드는 applySrsUpdate 가 reviewQueue.delete 로 지워 애초에 셀 수 없다. */
describe('home — masteredCount (연속 통과 2회 이상)', () => {
  it('consecutivePass 2 이상만 센다', () => {
    expect(masteredCount([
      { consecutivePass: 0 }, { consecutivePass: 1 },
      { consecutivePass: 2 }, { consecutivePass: 3 },
    ])).toBe(2);
  });

  it('필드 없는 레거시 행은 0으로 본다 (감사 기록대로 도입 직후 값이 낮게 나온다 — 정직한 값)', () => {
    expect(masteredCount([{}, { consecutivePass: 2 }])).toBe(1);
  });

  it('숫자가 아닌 값도 0으로 (동기화 왕복 잔재 방어)', () => {
    expect(masteredCount([{ consecutivePass: null }, { consecutivePass: '2' }])).toBe(1);
  });

  it('빈 배열·비배열 → 0', () => {
    expect(masteredCount([])).toBe(0);
    expect(masteredCount(null)).toBe(0);
  });
});
