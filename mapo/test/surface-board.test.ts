import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeBoard } from '../src/data/board.ts';
import { carriageSections, decodeSurface, isGroundRoad, roadJoints, type SurfaceJson } from '../src/data/surface.ts';

// 지금 판의 찻길 바닥(public/data/surface.json): 교차로 다섯 곳(서울시 교차로 자료 A008_P 의 자리)에서 띠와 교차로 면이 겹치지 않는다
const read = (f: string) => JSON.parse(readFileSync(new URL(`../public/data/${f}`, import.meta.url), 'utf8'));
const board = decodeBoard(read('board.json'));
const surface = decodeSurface(read('surface.json') as SurfaceJson);
const joints = roadJoints(board.roads);
const JUNCTIONS: [string, number, number][] = [
  ['합정역', -497, 250],
  ['홍대입구역', 222, -410],
  ['동교동삼거리', 694, -804],
  ['서교동사거리', -68, -135],
  ['망원역', -776, -495],
];
const inside = (ring: ArrayLike<number>, x: number, z: number) => {
  let c = false;
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2)
    if (ring[i + 1] > z !== ring[j + 1] > z && x < ring[i] + ((z - ring[i + 1]) / (ring[j + 1] - ring[i + 1])) * (ring[j] - ring[i])) c = !c;
  return c;
};
/** 판 좌표 둘레 r 안의 찻길 조각 띠(사각형들)와 교차로 면 */
function pieces(cx: number, cz: number, r: number) {
  const quads: number[][][] = [];
  board.roads.forEach((road, i) => {
    if (!isGroundRoad(road)) return;
    let near = false;
    for (let k = 0; k < road.p.length; k += 3) if (Math.hypot(road.p[k] - cx, road.p[k + 2] - cz) < r + 80) near = true;
    if (!near) return;
    const secs = carriageSections(road, surface.cut[i * 2], surface.cut[i * 2 + 1], joints.subarray(i * 4, i * 4 + 4));
    const q: number[][] = [];
    for (let k = 1; k < secs.length; k++) {
      const [a, b] = [secs[k - 1], secs[k]];
      q.push([a.rx, a.rz, b.rx, b.rz, b.lx, b.lz, a.lx, a.lz]);
    }
    if (q.length) quads.push(q);
  });
  const faces = surface.faces.filter((f) => Math.hypot(f.outer[0] - cx, f.outer[1] - cz) < r + 150);
  return { quads, faces };
}

describe('찻길 바닥(교차로 면과 띠)', () => {
  for (const [name, cx, cz] of JUNCTIONS)
    it(`${name}: 가운데 40m 안에서 띠·교차로 면이 두 겹 이상 덮는 넓이가 0 이다`, () => {
      const { quads, faces } = pieces(cx, cz, 40);
      let two = 0;
      let all = 0;
      for (let x = cx - 40; x <= cx + 40; x += 0.5)
        for (let z = cz - 40; z <= cz + 40; z += 0.5) {
          if (Math.hypot(x - cx, z - cz) > 40) continue;
          all++;
          let n = 0;
          for (const q of quads) if (q.some((r) => inside(r, x, z))) n++;
          for (const f of faces) if (inside(f.outer, x, z) && !f.holes.some((h) => inside(h, x, z))) n++;
          if (n >= 2) two++;
        }
      // 고치기 전 합정 48.6%·홍대입구 15.1%·동교동 26.3%·서교동 7.7%·망원 16.5%
      expect(two).toBe(0);
    });

  it('교차로 면의 외곽선은 스스로 엇갈리지 않는다', () => {
    let bad = 0;
    for (const f of surface.faces) {
      const r = f.outer;
      const n = r.length / 2;
      for (let i = 0; i < n && !bad; i++)
        for (let j = i + 2; j < n; j++) {
          if (i === 0 && j === n - 1) continue;
          const [ax, az, bx, bz] = [r[i * 2], r[i * 2 + 1], r[((i + 1) % n) * 2], r[((i + 1) % n) * 2 + 1]];
          const [cx, cz, dx, dz] = [r[j * 2], r[j * 2 + 1], r[((j + 1) % n) * 2], r[((j + 1) % n) * 2 + 1]];
          const den = (bx - ax) * (dz - cz) - (bz - az) * (dx - cx);
          if (Math.abs(den) < 1e-9) continue;
          const t = ((cx - ax) * (dz - cz) - (cz - az) * (dx - cx)) / den;
          const u = ((cx - ax) * (bz - az) - (cz - az) * (bx - ax)) / den;
          if (t > 1e-4 && t < 1 - 1e-4 && u > 1e-4 && u < 1 - 1e-4) {
            bad++;
            break;
          }
        }
    }
    expect(surface.faces.length).toBeGreaterThan(1000);
    expect(bad).toBe(0);
  });
});
