import { describe, it, expect } from 'vitest';
import { countNewExpressions, isSceneCard } from './home.js';

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
