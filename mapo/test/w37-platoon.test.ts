// 같은 차로·같은 경로로 교차로를 지나는 앞차 뒤 차는 앞차를 따라 바로 들어간다(재작업 W37, 설계 문서 57절).
// 합정 교차로 9 진입로 e182(합정·홍대 둘레 450m 로 자른 판의 구간 번호) 차로 3 은 직진만 하고, 게이트에서 건너편 횡단보도 끝까지 약 55m 다.
// 고치기 전에는 들어갈 자리를 '앞차 꽁무니 = 서 있는 장애물'로 재어, 빈 길에서도 뒤차가 앞차가 상자와 건너편 횡단보도를 다 지날 때까지
// 게이트에서 기다렸다(초록 동안 약 12초에 한 대, 시간당 차로당 약 300대. 실제 포화 교통량은 약 1,800대).
import { describe, expect, it } from 'vitest';
import { GREEN, STRAIGHT } from '../src/sim/intersection/index.ts';
import { setup } from '../tools/measure-junction.ts';

describe('초록에 줄이 이어서 빠진다(합정 교차로 9 e182 차로 3, 빈 길에 네 대)', () => {
  const { g, sim, start, inter } = setup({ seconds: 1, keep: 450, count: 300, seed: 11 }, 0);
  const { X, S } = inter;
  const D = sim.debug();
  const c = sim.cars;
  it('잇단 두 차가 게이트를 넘는 간격이 5초 안이고 마지막 두 간격 평균은 3.5초 안이며, 상자 안에서 서지 않는다', () => {
    const e = g[182];
    expect(X.laneMoves(182, 3)).toBe(STRAIGHT);
    let tod = start.tod;
    while (S.state(182, STRAIGHT, tod) === GREEN) tod += 1;
    while (S.state(182, STRAIGHT, tod) !== GREEN) tod += 1;
    tod -= 3;
    c.n = 0;
    const line = e.len - X.gate(182, 3);
    for (let k = 0; k < 4; k++) sim.put(182, line - 3 - k * 6, 3);
    for (let k = 0; k < 4; k++) D.v[k] = 0;
    const uid = Array.from({ length: 4 }, (_, k) => c.uid[k]);
    expect(new Set(Array.from({ length: 4 }, (_, k) => D.jp[k])).size).toBe(1);
    let now = { ...start, tod };
    const passT = new Map<number, number>();
    const prevS = new Map<number, number>();
    let T = 0;
    let boxStop = 0;
    for (let st = 0; st < 45 * 30; st++) {
      now = { ...now, tod: now.tod + 1 / 30 };
      T += 1 / 30;
      sim.step(1 / 30, now, false);
      for (let i = 0; i < c.n; i++) {
        const u = c.uid[i];
        if (D.edge[i] === 182) {
          const gs = line - D.size[i] / 2;
          const p = prevS.get(u);
          if (p !== undefined && p < gs && D.s[i] >= gs && !passT.has(u)) passT.set(u, T);
          prevS.set(u, D.s[i]);
        } else if (!passT.has(u) && prevS.has(u)) passT.set(u, T);
        if (D.past[i] && D.v[i] < 0.3) boxStop++;
      }
    }
    const ts = uid.map((u) => passT.get(u) ?? Infinity);
    const hw = ts.slice(1).map((t, k) => +(t - ts[k]).toFixed(1));
    // 선 줄에서 첫 두세 대는 출발이 늦어 간격이 길다(실측 포화 차두 간격도 첫 차 3.8초 안팎에서 2초 안팎으로 줄어든다)
    expect({ slow: hw.filter((h) => !(h <= 5)), tail: (hw[1] + hw[2]) / 2 <= 3.5, boxStop }, JSON.stringify(hw)).toEqual({ slow: [], tail: true, boxStop: 0 });
  });
});
