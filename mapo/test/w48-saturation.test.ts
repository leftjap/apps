// 포화 출발 간격과 차로당 통과량(재작업 W48, 설계 문서 59절 C 단계). 실제 도시 신호 교차로의 직진 차로는 초록 동안 줄에 선 차가 약 2초 간격으로 빠져
// 초록 시간 기준 차로당 시간당 약 1,800대가 지난다(첫 서너 대는 출발이 늦다). W37 이후 시뮬레이션은 같은 줄에서 마지막 두 간격 평균 3.5초 안까지만 요구한다
// (test/w37-platoon.test.ts). 규칙 정리(C 단계)가 끝나는 커밋에서 skip 을 it 로 바꾼다. 실행하지 않은 채 넣었다(측정 중인 다른 작업이 있어 W48 은 동적 시험을 돌리지 않았다).
import { describe, expect, it } from 'vitest';
import { GREEN, STRAIGHT } from '../src/sim/intersection/index.ts';
import { setup } from '../tools/measure-junction.ts';

/** 줄 뒤쪽(다섯째 차부터) 출발 간격 평균 상한(초): 3600 / 2.2 ≈ 1,636대/시 */
export const SAT_HEADWAY = 2.2;
/** 하나하나의 간격 상한(초) */
export const SAT_EACH = 3.0;
/** 첫 차가 초록 뒤 게이트를 넘기까지(초): 반응·출발 손실 */
export const SAT_FIRST = 3.5;

describe('초록에 선 줄이 약 2초 간격으로 빠진다(합정 교차로 9 e182 차로 3, 빈 길에 여덟 대)', () => {
  it.skip('다섯째 차부터 간격 평균 2.2초 안, 하나하나 3초 안, 첫 차 3.5초 안, 상자 안에서 서지 않는다', () => {
    const { g, sim, start, inter } = setup({ seconds: 1, keep: 450, count: 300, seed: 11 }, 0);
    const { X, S } = inter;
    const D = sim.debug();
    const c = sim.cars;
    const e = g[182];
    expect(X.laneMoves(182, 3)).toBe(STRAIGHT);
    let tod = start.tod;
    while (S.state(182, STRAIGHT, tod) === GREEN) tod += 1;
    while (S.state(182, STRAIGHT, tod) !== GREEN) tod += 1;
    const green = tod;
    tod -= 3;
    c.n = 0;
    const line = e.len - X.gate(182, 3);
    // 줄 간격 7m(차 길이 4.5m 안팎 + 서 있는 간격 2.5m)
    const N = 8;
    for (let k = 0; k < N; k++) sim.put(182, line - 3 - k * 7, 3);
    for (let k = 0; k < N; k++) D.v[k] = 0;
    const uid = Array.from({ length: N }, (_, k) => c.uid[k]);
    let now = { ...start, tod };
    const passT = new Map<number, number>();
    const prevS = new Map<number, number>();
    let boxStop = 0;
    for (let st = 0; st < 60 * 30; st++) {
      now = { ...now, tod: now.tod + 1 / 30 };
      sim.step(1 / 30, now, false);
      for (let i = 0; i < c.n; i++) {
        const u = c.uid[i];
        if (D.edge[i] === 182) {
          const gs = line - D.size[i] / 2;
          const p = prevS.get(u);
          if (p !== undefined && p < gs && D.s[i] >= gs && !passT.has(u)) passT.set(u, now.tod - green);
          prevS.set(u, D.s[i]);
        } else if (!passT.has(u) && prevS.has(u)) passT.set(u, now.tod - green);
        if (D.past[i] && D.v[i] < 0.3) boxStop++;
      }
    }
    const ts = uid.map((u) => passT.get(u) ?? Infinity);
    const hw = ts.slice(1).map((t, k) => +(t - ts[k]).toFixed(2));
    const tail = hw.slice(3);
    const mean = tail.reduce((a, b) => a + b, 0) / tail.length;
    expect({ first: ts[0] <= SAT_FIRST, mean: mean <= SAT_HEADWAY, each: tail.filter((h) => !(h <= SAT_EACH)), boxStop }, JSON.stringify({ ts, hw })).toEqual({ first: true, mean: true, each: [], boxStop: 0 });
  });
});

/** 9판(씨앗 11·12·13 × 일 14:00·토 17:00·평일 08:30)에서 잰 포화 교통량 하한(대/시·차로, 초록 시간 기준) */
export const SAT_FLOW = 1600;

describe('9판 신호 진입 차로의 포화 교통량(초록 시작 때 줄에 서 있던 차가 빠지는 간격)', () => {
  it.skip('줄에 선 차 가운데 넷째 뒤의 출발 간격 평균이 3600 / 1,600 = 2.25초 안(간격 표본 300개 넘게)', () => {
    const gaps: number[] = [];
    for (const seed of [11, 12, 13])
      for (const k of [0, 1, 2]) {
        const { g, sim, start, inter } = setup({ seconds: 300, keep: 450, count: 300, seed }, k);
        const { X, S } = inter;
        const D = sim.debug();
        const c = sim.cars;
        // 신호를 따르는 진입로의 일반 차로마다: 초록이 켜진 때 게이트 뒤 40m 안에 선(1m/s 아래) 차가 그 초록의 줄이다
        const L: { a: number; l: number; green: boolean; queued: Set<number>; order: number; last: number }[] = [];
        for (const e of g) if (X.jEnd[e.id] >= 0 && S.siteOf(e.id) >= 0) for (let l = 0; l < e.lanes; l++) L.push({ a: e.id, l, green: true, queued: new Set(), order: 0, last: -1 });
        const at = new Map(L.map((q) => [q.a * 8 + q.l, q]));
        const isGreen = (a: number, l: number, tod: number) => {
          const m = X.laneMoves(a, l);
          for (let b = 1; b <= 8; b <<= 1) if (m & b && S.state(a, b, tod) === GREEN) return true;
          return false;
        };
        const gateS = (i: number) => g[D.edge[i]].len - X.gate(D.edge[i], D.lane[i]) - D.size[i] / 2;
        const prevS = new Map<number, number>();
        let now = { ...start };
        for (let st = 0; st < 330 * 30; st++) {
          now = { ...now, tod: now.tod + 1 / 30 };
          sim.step(1 / 30, now, false);
          if (st < 30 * 30) continue;
          for (const q of L) {
            const gr = isGreen(q.a, q.l, now.tod);
            if (gr && !q.green) {
              q.queued.clear();
              q.order = 0;
              q.last = -1;
              for (let j = 0; j < c.n; j++) if (D.edge[j] === q.a && D.lane[j] === q.l && D.v[j] < 1 && D.s[j] < gateS(j) && gateS(j) - D.s[j] < 40) q.queued.add(c.uid[j]);
            }
            q.green = gr;
          }
          for (let i = 0; i < c.n; i++) {
            const u = c.uid[i];
            const p = prevS.get(u);
            prevS.set(u, D.s[i]);
            const q = at.get(D.edge[i] * 8 + D.lane[i]);
            if (!q || !q.green || p === undefined || !q.queued.has(u)) continue;
            const gs = gateS(i);
            if (!(p < gs && D.s[i] >= gs)) continue;
            q.order++;
            if (q.order > 4 && q.last >= 0) gaps.push(now.tod - q.last);
            q.last = now.tod;
          }
        }
      }
    const mean = gaps.reduce((a, b) => a + b, 0) / (gaps.length || 1);
    expect(gaps.length).toBeGreaterThan(300);
    expect(mean, `간격 ${gaps.length}개 평균 ${mean.toFixed(2)}초 = ${(3600 / mean).toFixed(0)}대/시`).toBeLessThanOrEqual(3600 / SAT_FLOW);
  });
});
