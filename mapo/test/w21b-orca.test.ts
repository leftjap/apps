import { describe, expect, it } from 'vitest';
import { agentLine, makeLines, solve, wallLine } from '../src/sim/people/orca.ts';

// 재작업 W21b: 속도 기반 상호 회피(ORCA)만 따로 잰다. 몸 반지름 0.4, 1.3m/s, 1/30초 걸음
const R = 0.4;
const DT = 1 / 30;
type A = { x: number; z: number; vx: number; vz: number; gx: number; gz: number };
function run(as: A[], secs: number, wall?: (a: A, L: ReturnType<typeof makeLines>) => void) {
  const L = makeLines();
  const out = new Float64Array(2);
  let minD = Infinity;
  for (let f = 0; f < secs / DT; f++) {
    for (const a of as) {
      L.n = 0;
      L.walls = 0;
      wall?.(a, L);
      for (const b of as) if (b !== a) agentLine(L, a.vx, a.vz, b.x - a.x, b.z - a.z, a.vx - b.vx, a.vz - b.vz, 2 * R, 2, 0.5, DT);
      const dx = a.gx - a.x;
      const dz = a.gz - a.z;
      const d = Math.hypot(dx, dz) || 1;
      const v = Math.min(1.3, d / DT);
      solve(L, 1.3, (dx / d) * v, (dz / d) * v, out);
      a.vx = out[0];
      a.vz = out[1];
    }
    for (const a of as) (a.x += a.vx * DT), (a.z += a.vz * DT);
    for (let i = 0; i < as.length; i++) for (let j = i + 1; j < as.length; j++) minD = Math.min(minD, Math.hypot(as[i].x - as[j].x, as[i].z - as[j].z));
  }
  return minD;
}

describe('W21b 상호 회피(ORCA)', () => {
  it('마주 오는 두 사람이 비켜 지나간다(가운데 사이 0.8m 아래로 다가가지 않는다)', () => {
    const as = [
      { x: 0, z: 0, vx: 0, vz: 0, gx: 10, gz: 0.01 },
      { x: 10, z: 0, vx: 0, vz: 0, gx: 0, gz: 0 },
    ];
    const minD = run(as, 12);
    expect(minD).toBeGreaterThan(0.79);
    expect(Math.hypot(as[0].x - 10, as[0].z)).toBeLessThan(0.2);
    expect(Math.hypot(as[1].x, as[1].z)).toBeLessThan(0.2);
  });
  it('네 방향에서 가운데를 지나는 여덟 사람이 겹치지 않고 모두 닿는다', () => {
    const as: A[] = [];
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4;
      as.push({ x: Math.cos(a) * 6, z: Math.sin(a) * 6, vx: 0, vz: 0, gx: -Math.cos(a) * 6, gz: -Math.sin(a) * 6 });
    }
    const minD = run(as, 25);
    expect(minD).toBeGreaterThan(0.75);
    for (const a of as) expect(Math.hypot(a.x - a.gx, a.z - a.gz)).toBeLessThan(0.3);
  });
  it('2m 띠(벽 z = ±1) 안에서 마주 오는 두 사람이 벽 밖으로 나가지 않고 엇갈린다', () => {
    const as = [
      { x: 0, z: 0.3, vx: 0, vz: 0, gx: 12, gz: 0.3 },
      { x: 12, z: 0.2, vx: 0, vz: 0, gx: 0, gz: 0.2 },
    ];
    let out = 0;
    const minD = run(as, 15, (a, L) => {
      // 가운데 자리 z 는 [−0.6, 0.6] 안(벽에서 몸 반지름만큼 안쪽)
      wallLine(L, 0, 1, (0.6 - a.z) / 0.3);
      wallLine(L, 0, -1, (a.z + 0.6) / 0.3);
      if (Math.abs(a.z) > 0.61) out++;
    });
    expect(out).toBe(0);
    expect(minD).toBeGreaterThan(0.79);
    expect(as[0].x).toBeGreaterThan(11.7);
    expect(as[1].x).toBeLessThan(0.3);
  });
});
