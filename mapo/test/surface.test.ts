import { describe, expect, it } from 'vitest';
import { carriageSections, roadJoints, type Section } from '../src/data/surface.ts';
import { buildSurface, type Cross } from '../tools/lib/surface.ts';
import { road } from './helpers.ts';

/** 점이 고리 안에 있는가(짝홀) */
function inside(ring: ArrayLike<number>, x: number, z: number) {
  let c = false;
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2)
    if (ring[i + 1] > z !== ring[j + 1] > z && x < ring[i] + ((z - ring[i + 1]) / (ring[j + 1] - ring[i + 1])) * (ring[j] - ring[i])) c = !c;
  return c;
}
/** 띠(단면들)가 점을 덮는가 */
function onRibbon(secs: Section[], x: number, z: number) {
  for (let i = 1; i < secs.length; i++) {
    const a = secs[i - 1];
    const b = secs[i];
    if (inside([a.rx, a.rz, b.rx, b.rz, b.lx, b.lz, a.lx, a.lz], x, z)) return true;
  }
  return false;
}
/** 고리의 변끼리 엇갈리지 않는가 */
function simple(ring: ArrayLike<number>) {
  const n = ring.length / 2;
  for (let i = 0; i < n; i++)
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const [ax, az, bx, bz] = [ring[i * 2], ring[i * 2 + 1], ring[((i + 1) % n) * 2], ring[((i + 1) % n) * 2 + 1]];
      const [cx, cz, dx, dz] = [ring[j * 2], ring[j * 2 + 1], ring[((j + 1) % n) * 2], ring[((j + 1) % n) * 2 + 1]];
      const den = (bx - ax) * (dz - cz) - (bz - az) * (dx - cx);
      if (Math.abs(den) < 1e-9) continue;
      const t = ((cx - ax) * (dz - cz) - (cz - az) * (dx - cx)) / den;
      const u = ((cx - ax) * (bz - az) - (cz - az) * (bx - ax)) / den;
      if (t > 1e-6 && t < 1 - 1e-6 && u > 1e-6 && u < 1 - 1e-6) return false;
    }
  return true;
}

// 가운데 (0, 0) 에서 만나는 네 갈래 큰길(폭 14m, 양방향 2차로씩). 동쪽 갈래 20m 에 횡단보도(폭 4m)
const arms = () => [
  road([[0, 0], [120, 0]], { cls: 2, lanes: 4 }),
  road([[0, 0], [-120, 0]], { cls: 2, lanes: 4 }),
  road([[0, 0], [0, 120]], { cls: 2, lanes: 4 }),
  road([[0, -120], [0, 0]], { cls: 2, lanes: 4 }),
];
const ring = (cx: number, cz: number, ux: number, uz: number, half: number, wid: number) => {
  const [vx, vz] = [-uz, ux];
  return Float32Array.from([
    cx - ux * half - vx * wid / 2, cz - uz * half - vz * wid / 2,
    cx + ux * half - vx * wid / 2, cz + uz * half - vz * wid / 2,
    cx + ux * half + vx * wid / 2, cz + uz * half + vz * wid / 2,
    cx - ux * half + vx * wid / 2, cz - uz * half + vz * wid / 2,
  ]);
};
const east: Cross = { x: 20, z: 0, ux: 0, uz: 1, half: 8, rings: [ring(20, 0, 0, 1, 8, 4)] };

describe('교차로 면', () => {
  it('네 갈래가 만나는 노드에 면 하나를 만들고, 갈래 띠는 면 앞에서 끝난다(가운데와 모퉁이는 면만 덮는다)', () => {
    const roads = arms();
    const s = buildSurface(roads, [], [], [], [0, 0, 0, 0]);
    expect(s.faces).toHaveLength(1);
    const f = s.faces[0];
    expect(simple(f.outer)).toBe(true);
    expect(inside(f.outer, 0, 0)).toBe(true);
    expect(inside(f.outer, 6, 6)).toBe(true); // 모퉁이 호 안쪽(찻길)
    expect(inside(f.outer, 9.5, 9.5)).toBe(false); // 보도 모서리
    roads.forEach((r, i) => {
      const secs = carriageSections(r, s.cut[i * 2], s.cut[i * 2 + 1]);
      expect(i === 3 ? 120 - s.cut[7] : s.cut[i * 2]).toBeGreaterThan(5); // 노드 쪽 끝은 모퉁이 호가 끝나는 곳 너머
      expect(onRibbon(secs, 0, 0)).toBe(false);
    });
    // 면과 띠는 겹치지 않고 사이가 벌어지지 않는다: 동쪽 갈래 띠 시작 단면 양쪽 점이 면의 꼭짓점이다
    const e0 = carriageSections(roads[0], s.cut[0], s.cut[1])[0];
    const has = (x: number, z: number) => {
      for (let k = 0; k < f.outer.length; k += 2) if (Math.hypot(f.outer[k] - x, f.outer[k + 1] - z) < 1e-3) return true;
      return false;
    };
    expect(has(e0.rx, e0.rz)).toBe(true);
    expect(has(e0.lx, e0.lz)).toBe(true);
    for (let x = -30; x <= 30; x += 0.7)
      for (let z = -30; z <= 30; z += 0.7) {
        const n = (inside(f.outer, x, z) ? 1 : 0) + roads.filter((r, i) => onRibbon(carriageSections(r, s.cut[i * 2], s.cut[i * 2 + 1]), x, z)).length;
        expect(n, `${x},${z}`).toBeLessThanOrEqual(1);
      }
  });

  it('갈래를 가로지르는 횡단보도가 있으면 면이 그 바깥 변까지 덮는다', () => {
    const roads = arms();
    const s = buildSurface(roads, [], [east], [], [0, 0, 0, 0]);
    expect(s.cut[0]).toBeGreaterThanOrEqual(22);
    expect(s.cut[0]).toBeLessThan(23);
    const f = s.faces[0];
    for (const [x, z] of [[18.2, -6.5], [21.8, 6.5], [20, 0]]) expect(inside(f.outer, x, z), `${x},${z}`).toBe(true);
    expect(s.cut[2]).toBeLessThan(15); // 다른 갈래는 모퉁이까지만
  });

  it('갈래가 짧아 면이 건너편 노드까지 덮어야 하면 두 교차로를 한 면으로 합친다', () => {
    // 가운데 갈래(동쪽 8m)가 짧은 두 T 자 교차로
    const roads = [
      road([[-120, 0], [0, 0]], { cls: 2, lanes: 4 }),
      road([[0, 0], [8, 0]], { cls: 2, lanes: 4 }),
      road([[8, 0], [130, 0]], { cls: 2, lanes: 4 }),
      road([[0, 0], [0, 120]], { cls: 2, lanes: 4 }),
      road([[8, -120], [8, 0]], { cls: 2, lanes: 4 }),
    ];
    const s = buildSurface(roads, [], [], [], [0, 0, 0, 0, 0]);
    expect(s.faces).toHaveLength(1);
    expect(s.internal[1]).toBe(1);
    expect(simple(s.faces[0].outer)).toBe(true);
    expect(inside(s.faces[0].outer, 4, 0)).toBe(true);
  });

  it('조각 둘만 만나는 꺾인 노드는 면 없이 두 띠를 같은 단면에서 잇는다', () => {
    const roads = [road([[-100, 0], [0, 0]], { cls: 2, lanes: 4 }), road([[0, 0], [70, 70]], { cls: 2, lanes: 4 })];
    const j = roadJoints(roads);
    const s = buildSurface(roads, [], [], [], [0, 0]);
    expect(s.faces).toHaveLength(0);
    const a = carriageSections(roads[0], 0, 100, j.subarray(0, 4));
    const b = carriageSections(roads[1], 0, 99, j.subarray(4, 8));
    const ea = a[a.length - 1];
    const sb = b[0];
    expect(Math.hypot(ea.rx - sb.rx, ea.rz - sb.rz)).toBeLessThan(1e-4);
    expect(Math.hypot(ea.lx - sb.lx, ea.lz - sb.lz)).toBeLessThan(1e-4);
  });
});

describe('격자 경계 고리', () => {
  it('구멍 난 칸 덩어리는 바깥 고리(넓이 +)와 구멍(넓이 −) 둘이 되고, 계단은 줄여도 넓이가 같다', async () => {
    const { fillRings, traceLoops, ringArea, simplifyLoop } = await import('../tools/lib/contour.ts');
    const n = 20;
    const g = new Uint8Array(n * n);
    fillRings(g, n, [[2, 2, 12, 2, 12, 12, 2, 12]], 1);
    fillRings(g, n, [[5, 5, 8, 5, 8, 8, 5, 8]], 0);
    const loops = traceLoops(g, n);
    expect(loops).toHaveLength(2);
    const areas = loops.map(ringArea).sort((a, b) => b - a);
    expect(areas[0]).toBe(100);
    expect(areas[1]).toBe(-9);
    for (const l of loops) expect(Math.abs(ringArea(simplifyLoop(l, 0.7)))).toBe(Math.abs(ringArea(l)));
  });
});
