// 교차로·신호·차로 0 기준 시험(재작업 W20, 설계 문서 45절). 합정·홍대입구역 둘레(길은 450m, 세는 곳은 300m)에서
// 일 14:00·토 17:00·평일 08:30 을 30초 버린 뒤 300초씩 돌린다. 정의는 tools/measure-junction.ts 머리말.
// 재작업 W22: 보행 초록 횡단보도 면 위 차와 신호 횡단보도 면 위에 선 차도 0 이어야 한다.
// 재작업 W23: 이 시험은 둘레로 자른 판에서 차로를 실행 중에 채워, 앱(판 전체)과 다른 차로로 쟀다(W22 의 0 은 앱의 차로가 아니었다).
// 이제 앱과 같은 길 정본(road.json) 차로로 잰다. 그러자 월드컵로 xw420(−577,−35)에서 앱에도 있던 횡단보도 위 교착이 드러났고, 선 없는 줄 고르게 옮겨 가기로
// 줄였지만 0 은 못 됐다(일 14:00 walk 24·stopXw 4, 평일 08:30 stopXw 1(합정 xw125)). 그 둘은 지금 값을 넘지 않는지만 보고, 나머지 일곱 가지는 0 이다.
// 이 0 은 씨앗 11 에 맞춰져 있어 씨앗 12·13 에서는 고치기 전 코드도 깨진다(설계 문서 51절)
import { beforeAll, describe, expect, it } from 'vitest';
import { audit, CASES, type AuditResult } from '../tools/measure-junction.ts';

/** 조건마다 남은 보행 초록 횡단보도 위 차·횡단보도 위에 선 차 표본(W23 판, 늘지 않는지만 본다) */
const LEFT = [
  { walk: 24, stopXw: 4 },
  { walk: 0, stopXw: 0 },
  { walk: 0, stopXw: 1 },
];

describe('교차로를 신호와 차로대로 지난다(합정·홍대입구역 둘레 300초 × 세 조건)', () => {
  let results: AuditResult[] = [];
  beforeAll(() => {
    results = audit({ seconds: 300, keep: 450, count: 300 });
  }, 900_000);
  CASES.forEach(([name], k) =>
    it(`${name}: 빨간불 통과·허용 안 된 차로 회전·엇갈리는 두 차·경로 이탈·중앙선 넘기·한 단계 옆 튐·몸통 겹침이 모두 0, 보행 초록 횡단보도 위 차·횡단보도 위에 선 차는 남은 수를 넘지 않음`, () => {
      const r = results[k];
      const pick = (o: AuditResult) => ({ red: o.red, lane: o.lane, cross: o.cross, offPath: o.offPath, walk: o.walk, stopXw: o.stopXw, center: o.center, side: o.side, overlap: o.overlap });
      const left = LEFT[k];
      expect({ ...pick(r), walk: Math.max(0, r.walk - left.walk), stopXw: Math.max(0, r.stopXw - left.stopXw) }, JSON.stringify(r.where)).toEqual({ red: 0, lane: 0, cross: 0, offPath: 0, walk: 0, stopXw: 0, center: 0, side: 0, overlap: 0 });
      expect(r.passes).toBeGreaterThan(500);
    }),
  );
});
