// 칠한 선이 화면에서 빠지지 않는다(재작업 W55, 설계 문서 59.10). 검사 함수는 test/w55-marks-missing.ts.
// 서울시가 칠한 차로를 가르는 선(중앙선·버스전용·차선·진로변경제한선·중앙버스전용) 가운데 구운 찻길 면 안인데 그린 노면 표시에서 1m 안에 같은 종류 선이 없는 길이.
// 남은 것은 정본 차로가 칠한 자리·차로 수와 달라 차로를 고쳐야(B3·B4) 그을 수 있는 자리와 그리지 않는 것이 맞는 자리뿐이어야 한다(그 밖 0).
// 서울시 원자료(tools/raw/seoul-lines-ground.json)는 커밋하지 않으므로 없으면 건너뛴다.
import { describe, expect, it } from 'vitest';
import { load } from './w48-stage2.ts';
import { explainMissing, hasSeoulGround, missingPaint, seoulGround } from './w55-marks-missing.ts';

describe.skipIf(!hasSeoulGround())('칠한 선이 빠지지 않는다(판 전체, 정적)', () => {
  const run = () => {
    const d = load();
    const m = missingPaint(d, seoulGround());
    return { m, why: explainMissing(d, m) };
  };
  // 남은 7.5m 는 0.5m 표본 하나·둘씩 떨어진 15자리다(서울시 선 그대로 긋기와 이 시험의 상자·정지선·차로 판정이 경계에서 갈리는 곳, 자른 끝). 측정값 상한
  it('차로 탓·고가·정지선 너머·횡단보도·화살표가 아닌데 빠진 칠한 선(측정값 상한 7.5m)', () => {
    const { why } = run();
    const n = Object.values(why.by.other ?? {}).reduce((a, v) => a + v, 0);
    expect(n, why.otherAt.join(' ')).toBeLessThanOrEqual(7.5);
  });
  // 고치기 전(HEAD 91fc528f marks.json): 중앙선 3,483m · 버스전용 130 · 차선 12,396 · 진로변경제한 2,212 · 중앙버스전용 1,327(선 높이 무관).
  // W55 뒤 1,578 · 48 · 5,028 · 1,064 · 772. 남은 것은 차로를 고칠 자리(B3·B4)와 위 까닭(설계 문서 59.10)
  it.fails('빠진 칠한 선이 없다', () => {
    const { m } = run();
    expect(Object.values(m.kinds).reduce((a, v) => a + v.n, 0), m.top.join(' ')).toBe(0);
  });
  it('빠진 칠한 선 길이 상한(측정값, 종류마다)', () => {
    const { m } = run();
    const cap: Record<number, number> = { 1: 1578, 5: 48, 6: 5028, 8: 1064, 17: 772 };
    for (const [k, v] of Object.entries(m.kinds)) expect(Math.round(v.n), `k${k} ${m.top.join(' ')}`).toBeLessThanOrEqual(cap[Number(k)]);
  });
});
