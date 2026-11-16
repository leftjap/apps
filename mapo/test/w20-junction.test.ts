// 교차로·신호·차로 0 기준 시험(재작업 W20, 설계 문서 45절). 합정·홍대입구역 둘레(길은 450m, 세는 곳은 300m)에서
// 일 14:00·토 17:00·평일 08:30 을 30초 버린 뒤 300초씩 돌린다. 정의는 tools/measure-junction.ts 머리말.
import { beforeAll, describe, expect, it } from 'vitest';
import { audit, CASES, type AuditResult } from '../tools/measure-junction.ts';

describe('교차로를 신호와 차로대로 지난다(합정·홍대입구역 둘레 300초 × 세 조건)', () => {
  let results: AuditResult[] = [];
  beforeAll(() => {
    results = audit({ seconds: 300, keep: 450, count: 300 });
  }, 900_000);
  CASES.forEach(([name], k) =>
    it(`${name}: 빨간불 통과·허용 안 된 차로 회전·엇갈리는 두 차·경로 이탈·중앙선 넘기·한 단계 옆 튐·몸통 겹침이 모두 0`, () => {
      const r = results[k];
      const pick = (o: AuditResult) => ({ red: o.red, lane: o.lane, cross: o.cross, offPath: o.offPath, center: o.center, side: o.side, overlap: o.overlap });
      expect(pick(r), JSON.stringify(r.where)).toEqual({ red: 0, lane: 0, cross: 0, offPath: 0, center: 0, side: 0, overlap: 0 });
      expect(r.passes).toBeGreaterThan(500);
    }),
  );
});
