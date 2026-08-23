import { describe, it, expect } from 'vitest';
import { countNewExpressions, isSceneCard, longestStreak } from './home.js';

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
