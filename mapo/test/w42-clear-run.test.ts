// 보행 초록 전 다 지나기(clearRun)에서 짐으로 본 바로 앞차는 제 몫 안에 선다(재작업 W42, 설계 문서 57절).
// obs 는 짐이 모두 장애물 뒤에 붙어 섰을 때 가장 가까운 짐의 꽁무니 자리(앞 범퍼 기준)다. 그 짐의 몫은 [obs, obs + 몸 길이 + 2.5] 라서
// 짐 앞 범퍼가 볼 장애물은 꽁무니 좌표로 obs + 2.5 이고, 따라가기 규칙(정지 간격 2m)대로면 꽁무니는 obs ~ obs + 2.5 사이에 선다.
// 고치기 전에는 그 장애물을 obs + 내 몸 길이 + 2.5 로 두어 짐이 내 몸 길이만큼 더 가고, 빠져나가는 시간을 짧게 잡았다(외부 리뷰 지적).
import { describe, expect, it } from 'vitest';
import { clearRun } from '../src/sim/cars.ts';

describe('clearRun 의 짐 차는 제 몫 안에 선다', () => {
  it('짐 꽁무니가 obs ~ obs + 2.5 에 선다', () => {
    const obs = 20;
    const [t, xl] = clearRun(10, 0, obs - 2.5, obs, obs - 2, 4);
    expect(t).toBeLessThan(Infinity);
    expect(xl).toBeGreaterThanOrEqual(obs);
    expect(xl).toBeLessThanOrEqual(obs + 2.5);
  });
});
