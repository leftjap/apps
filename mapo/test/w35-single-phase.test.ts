// 현시가 하나뿐이고 보행 신호도 없는 신호 교차로는 늘 초록이다(재작업 W35).
// 합정 교차로 2(양화로 e39·e16, 합정·홍대 둘레 450m 로 자른 판의 구간 번호)는 진입로가 모두 한 무리이고 맡은 보행 신호가 없어
// 주기마다 노랑 3초·전체 빨강 2초만 있었다. 초록불 물결로 그 5초가 교차로 9 좌회전 현시와 겹쳐, e347 좌회전 차는 나갈 길(e16)이
// '곧 빨강'이라 정지선 앞 자리만 보고(자리 0) 주기마다 못 들어가 한밤에도 285초를 섰다.
import { describe, expect, it } from 'vitest';
import { CYCLE, GREEN, STRAIGHT } from '../src/sim/intersection/index.ts';
import { setup } from '../tools/measure-junction.ts';

describe('현시 하나·보행 신호 없는 신호(합정 교차로 2)', () => {
  const { inter } = setup({ seconds: 1, keep: 450, count: 300, seed: 11 }, 0);
  const S = inter.S;
  it('e39·e16 직진은 주기 내내 초록이고 초록 남은 시간은 끝이 없다', () => {
    for (const a of [39, 16]) {
      expect(S.siteOf(a)).toBeGreaterThanOrEqual(0);
      for (let t = 0; t < CYCLE; t += 0.5) expect(S.state(a, STRAIGHT, t)).toBe(GREEN);
      expect(S.greenLeft(a, STRAIGHT, 10)).toBe(Infinity);
    }
  });
  it('현시가 둘 넘는 교차로(합정 교차로 9 e182)는 그대로 빨간 때가 있다', () => {
    let red = 0;
    for (let t = 0; t < CYCLE; t += 0.5) if (S.state(182, STRAIGHT, t) !== GREEN) red++;
    expect(red).toBeGreaterThan(0);
    expect(S.greenLeft(182, STRAIGHT, 0)).toBeLessThan(CYCLE);
  });
});
