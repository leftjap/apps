// 교차로·횡단보도 0 기준 시험 몸통(재작업 W20·W22, W25 에서 여러 씨앗으로). 합정·홍대입구역 둘레(길은 450m, 세는 곳은 300m)에서
// 일 14:00·토 17:00·평일 08:30 을 30초 버린 뒤 300초씩 돌린다. 정의는 tools/measure-junction.ts 머리말.
// 아홉 가지(빨간불 통과·허용 안 된 차로 회전·엇갈리는 두 차·경로 이탈·보행 초록 횡단보도 위 차·횡단보도 위에 선 차·중앙선 넘기·한 단계 옆 튐·몸통 겹침)가
// 모두 0 이어야 한다. W23 까지 이 0 은 씨앗 11 에만 맞춰져 있어 씨앗 12·13 에서 교착(두 차가 서로 막아 끝까지 섬)이 났다(설계 문서 51·53절).
import { beforeAll, describe, expect, it } from 'vitest';
import { audit, CASES, type AuditResult } from '../tools/measure-junction.ts';

// 재작업 W44(설계 문서 58절): 까닭 없이 10초 넘게 선 차(stuck, 사건), 차 몸이 그린 찻길 면 밖(offRoad, 차·초), 빗금(안전지대) 위(onGore, 차·초).
// 목표는 셋 다 0 이다. 지금 남은 원인(옆 구간 차로가 차 한 대 폭으로 붙은 합류부의 몸통 막기, 빗금을 가로지르는 차로 자료)을 고치기 전까지는
// 조건마다 세 씨앗 가운데 가장 큰 측정값을 상한으로 두고 낮추기만 한다. offRoad 는 길 정본 차로 띠를 찻길로 칠하기 전(HEAD 6dcdec5c 이후) 일 3,343~4,522·토 4,862~6,332·평일 6,647~7,547 이었다
export const W44_LIMIT: Record<'stuck' | 'offRoad' | 'onGore', [number, number, number]> = {
  stuck: [11, 29, 119],
  offRoad: [638, 844, 806],
  onGore: [2414, 2368, 5400],
};

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
    CASES.forEach(([name], k) =>
      it(`${name}: 까닭 없이 선 차·찻길 면 밖·빗금 위 차가 상한(낮추기만 한다) 안`, () => {
        const r = results[k];
        const got = { stuck: r.stuck, offRoad: r.offRoad, onGore: r.onGore };
        for (const key of ['stuck', 'offRoad', 'onGore'] as const) expect(got[key], `${key} ${JSON.stringify(r.where[key])}`).toBeLessThanOrEqual(W44_LIMIT[key][k]);
      }),
    );
  });
}
