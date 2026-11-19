import { beforeAll, describe, expect, it } from 'vitest';
import type { CanonLanes, DirLanes } from '../src/data/road.ts';
import { setup } from '../tools/measure-junction.ts';

// 재작업 W56: 한 자리를 바꿔도 먼 차는 그대로여야 한다(차 국소성, 사람은 w46-local).
// 고치기 전에는 차 쪽 고르기(길 고르기·차로 자리·빠르기·차종·놓기·빼기·배차·정류장 머물기·처음 채우기)가 공유 난수 하나를 차례로 썼고,
// 고유 번호가 놓인 차례였고, 빠진 자리를 끝 차로 채워 계산 차례가 바뀌었다. 그래서 한 곳에서 차 한 대가 한 번 더 고르기만 해도 판 전체 차가 다른 표본이 됐다
// (W46: 보는 곳 가운데 차 한 대를 세우면 10초 뒤 800m 밖 차 57대가 달라짐. W54: xw726 둘레 90m 차로가 같은데 100m 넘게 떨어진 차로를 고치자 xw726 에서 횡단보도 위 정차 1,247).
// 시험과 같은 판(합정·홍대입구역 둘레 450m, 차 5,000대 한도, 씨앗 11, 일 14:00)을 두 벌 만들어 한쪽만 바꾼다.
//  (가) 20초 돌린 뒤 홍대입구역 둘레 차 한 대 앞 구간에 10초 동안 1m/s 서행(돌발 서행)을 건다.
//  (나) 합정역 사거리 100m 안에서 시작하는 모든 길 방향의 차로 옆 거리를 0.4m 옮긴 차로 정본으로 처음부터 돌린다(교차로 상자·경로도 바뀐다).
// 바꾼 자리에서 300m 넘게 떨어진 차는 1/30초 걸음마다 두 판에서 같은 차(고유 번호)가 같은 자리에 있어야 한다.
// 차는 길을 따라 초당 22m 까지 달리므로, 바꾼 자리의 영향이 300m 를 넘어 퍼지지 않는 12초(가)·10초(나) 동안만 견준다.
// 차 수를 맞추는 규칙(보는 곳 안·밖 목표 대수, 90초 넘게 선 보이지 않는 차 빼기)은 보는 곳(반지름 1,200m) 전체에 걸친다: 서행 뒤 줄에서 차 한 대가 빠지면
// 목표 대수를 채우러 다른 곳에 한 대가 놓인다(사람 쪽 W46 의 인원 규칙과 같은 성질). 그래서 0 은 견주는 동안 놓기·빼기를 끈 판(step 의 spawn = false)에 요구하고,
// 놓기·빼기를 켠 판은 300m 밖에서 달라진 차를 세어 이 규칙 몫만 남았는지(몇 대) 본다
const DT = 1 / 30;
const FAR = 300;
/** 놓기·빼기를 켠 두 판에서 300m 밖에 달라진 차 수 상한(차 수 규칙 몫, 측정값: 재작업 W56 (가) 0·(나) 2대, 고치기 전 HEAD 32·444대) */
const LIMIT_N = 2;
type Sim = ReturnType<typeof setup>;
const run = (A: Sim, B: Sim, t0: number, steps: number, far: (x: number, z: number) => boolean, spawn: boolean, act?: (f: number) => void) => {
  const res = { far: 0, near: 0, nearDiff: 0, bad: [] as string[], badN: 0 };
  const badIds = new Set<number>();
  let now = { ...A.start, tod: A.start.tod + t0 };
  for (let f = 0; f < steps; f++) {
    act?.(f);
    now = { ...now, tod: now.tod + DT };
    A.sim.step(DT, now, spawn);
    B.sim.step(DT, now, spawn);
    const a = A.sim.cars;
    const b = B.sim.cars;
    const at = new Map<number, number>();
    for (let j = 0; j < b.n; j++) at.set(b.uid[j], j);
    for (let i = 0; i < a.n; i++) {
      const j = at.get(a.uid[i]);
      const same = j !== undefined && b.x[j] === a.x[i] && b.z[j] === a.z[i] && b.yaw[j] === a.yaw[i];
      if (!far(a.x[i], a.z[i])) {
        res.near++;
        if (!same) res.nearDiff++;
        continue;
      }
      res.far++;
      if (same) continue;
      badIds.add(a.uid[i]);
      if (res.bad.length < 12) res.bad.push(`f${f} ${a.uid[i]}@${a.x[i].toFixed(1)},${a.z[i].toFixed(1)} ${j === undefined ? '없음' : `${Math.hypot(b.x[j] - a.x[i], b.z[j] - a.z[i]).toFixed(2)}m`}`);
    }
  }
  res.badN = badIds.size;
  return res;
};

/** (가) 20초 돌린 두 판과 서행 걸 자리 */
function slowPair() {
  const o = { seconds: 0, keep: 450, seed: 11 };
  const A = setup(o, 0);
  const B = setup(o, 0);
  let now = { ...A.start };
  for (let f = 0; f < 20 / DT; f++) {
    now = { ...now, tod: now.tod + DT };
    A.sim.step(DT, now);
    B.sim.step(DT, now);
  }
  const c = B.sim.cars;
  const D = B.sim.debug();
  let hi = -1;
  for (let i = 0; i < c.n; i++) if (D.v[i] > 3 && (hi < 0 || Math.hypot(c.x[i] - 222, c.z[i] + 410) < Math.hypot(c.x[hi] - 222, c.z[hi] + 410))) hi = i;
  const [px, pz] = [c.x[hi], c.z[hi]];
  const e = B.g[D.edge[hi]];
  const at = Math.min(e.len, D.s[hi] + 15);
  const act = (f: number) => {
    if (f === 0) B.sim.setIncidents({ blocks: [], close: [], slow: [{ edge: e.id, at, v: 1 }] });
    if (f === Math.round(10 / DT)) B.sim.setIncidents({ blocks: [], close: [], slow: [] });
  };
  return { A, B, act, far: (x: number, z: number) => Math.hypot(x - px, z - pz) > FAR };
}
/** (나) 합정역 사거리(−491,254) 100m 안에서 시작하는 모든 길 방향의 차로 옆 거리를 0.4m 옮긴 판과 그대로인 판 */
function shiftPair() {
  const o = { seconds: 0, keep: 450, seed: 11 };
  const A = setup(o, 0);
  const keys = new Set<string>();
  for (const e of A.g) if (Math.hypot(e.p[0] - -491, e.p[2] - 254) < 100) keys.add(`${e.road},${e.rev ? 1 : 0}`);
  const roads = [...keys].map((k) => A.board.roads[Number(k.split(',')[0])]);
  const B = setup(
    {
      ...o,
      lanes: (l: CanonLanes): CanonLanes => {
        const dirs = l.dirs.slice();
        for (const k of keys) {
          const [r, d] = k.split(',').map(Number);
          const pair = dirs[r]!.slice() as [DirLanes | null, DirLanes | null];
          const dl = pair[d]!;
          pair[d] = { ...dl, runs: dl.runs.map((run) => ({ ...run, off: run.off.map((v) => v + 0.4) })) };
          dirs[r] = pair;
        }
        return { ...l, dirs };
      },
    },
    0,
  );
  const far = (x: number, z: number) => {
    for (const road of roads) for (let k = 0; k < road.p.length; k += 3) if (Math.hypot(road.p[k] - x, road.p[k + 2] - z) <= FAR) return false;
    return true;
  };
  return { A, B, far };
}

describe('W56 한 자리를 바꿔도 먼 차는 그대로다', () => {
  let slow: ReturnType<typeof run>;
  let shift: ReturnType<typeof run>;
  let slowN: ReturnType<typeof run>;
  let shiftN: ReturnType<typeof run>;
  beforeAll(() => {
    for (const spawn of [false, true]) {
      const p = slowPair();
      const r = run(p.A, p.B, 20, 12 / DT, p.far, spawn, p.act);
      if (spawn) slowN = r;
      else slow = r;
      const q = shiftPair();
      const t = run(q.A, q.B, 0, 10 / DT, q.far, spawn);
      if (spawn) shiftN = t;
      else shift = t;
    }
  }, 900_000);
  it('(가) 서행 둘레(300m 안)는 실제로 달라진다', () => expect(slow.nearDiff).toBeGreaterThan(0));
  it('(가) 서행에서 300m 밖 차는 걸음마다 두 판에서 같은 자리에 있다', () => {
    expect(slow.far).toBeGreaterThan(50_000);
    expect(slow.bad, `300m 밖에서 달라진 차 ${slow.badN}대`).toEqual([]);
  });
  it('(나) 옮긴 길 둘레(300m 안)는 실제로 달라진다', () => expect(shift.nearDiff).toBeGreaterThan(0));
  it('(나) 옮긴 길에서 300m 밖 차는 걸음마다 두 판에서 같은 자리에 있다', () => {
    expect(shift.far).toBeGreaterThan(50_000);
    expect(shift.bad, `300m 밖에서 달라진 차 ${shift.badN}대`).toEqual([]);
  });
  it('놓기·빼기를 켜도 300m 밖에서 달라지는 차는 차 수 규칙 몫(몇 대)뿐이다', () => {
    expect(slowN.badN + shiftN.badN, `${slowN.bad.join(' / ')} | ${shiftN.bad.join(' / ')}`).toBeLessThanOrEqual(LIMIT_N);
  });
});
