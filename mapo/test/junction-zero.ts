// 교차로·횡단보도 0 기준 시험 몸통(재작업 W20·W22, W25 에서 여러 씨앗으로). 합정·홍대입구역 둘레(길은 450m, 세는 곳은 300m)에서
// 일 14:00·토 17:00·평일 08:30 을 30초 버린 뒤 300초씩 돌린다. 정의는 tools/measure-junction.ts 머리말.
// 아홉 가지(빨간불 통과·허용 안 된 차로 회전·엇갈리는 두 차·경로 이탈·보행 초록 횡단보도 위 차·횡단보도 위에 선 차·중앙선 넘기·한 단계 옆 튐·몸통 겹침)가
// 모두 0 이어야 한다. W23 까지 이 0 은 씨앗 11 에만 맞춰져 있어 씨앗 12·13 에서 교착(두 차가 서로 막아 끝까지 섬)이 났다(설계 문서 51·53절).
import { beforeAll, describe, expect, it } from 'vitest';
import { audit, CASES, type AuditResult } from '../tools/measure-junction.ts';

// 재작업 W44(설계 문서 58절)의 셋(까닭 없이 선 차·찻길 면 밖·빗금 위)은 재작업 W56(63절)부터 여기가 아니라 로컬 게이트(tools/junction-gate.ts)가
// 씨앗 11~50(세 조건 120판) 평균으로 HEAD 평균 + 표준오차와 견준다. 씨앗 셋 가운데 가장 큰 값을 판마다 상한으로 두던 꼴은 씨앗을 넓히면 HEAD 도 새 씨앗 51판 가운데 offRoad 9판·stuck 10판이 넘어, 표본 하나에만 맞춘 값이었다
export function junctionZero(seed: number) {
  describe(`교차로를 신호와 차로대로 지나고 횡단보도에 서지 않는다(씨앗 ${seed}, 합정·홍대입구역 둘레 300초 × 세 조건)`, () => {
    let results: AuditResult[] = [];
    beforeAll(() => {
      results = audit({ seconds: 300, keep: 450, count: 300, seed });
    }, 1_200_000);
    CASES.forEach(([name], k) =>
      it(`${name}: 아홉 가지가 모두 0`, () => {
        const r = results[k];
        const pick = (o: AuditResult) => ({ red: o.red, lane: o.lane, cross: o.cross, offPath: o.offPath, walk: o.walk, stopXw: o.stopXw, center: o.center, side: o.side, overlap: o.overlap });
        expect(pick(r), JSON.stringify(r.where)).toEqual({ red: 0, lane: 0, cross: 0, offPath: 0, walk: 0, stopXw: 0, center: 0, side: 0, overlap: 0 });
        expect(r.passes).toBeGreaterThan(500);
      }),
    );
  });
}
