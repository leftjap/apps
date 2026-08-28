import { describe, it, expect } from 'vitest';
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
