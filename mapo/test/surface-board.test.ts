import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeBoard } from '../src/data/board.ts';
import { decodeMarks, type MarksJson } from '../src/data/marks.ts';
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
  it('합정역 8번 출구 앞 교통섬은 구멍 하나로 섬 안쪽 네 점(북쪽·가운데·동쪽·남서쪽 화단)을 모두 담는다', () => {
    // 고치기 전에는 꽃잎 모양 구멍(83m²)이었다. 동쪽 변은 2021-08 서울시 차선 자료의 주정차금지선(010) 자리다(항공사진의 섬은 3~4m 더 넓다)
    const pts = [[-524, 232], [-521, 242], [-518, 243], [-530, 250]];
    const holes = surface.faces.flatMap((f) => f.holes).filter((h) => pts.some(([x, z]) => inside(h, x, z)));
    expect(holes).toHaveLength(1);
    for (const [x, z] of pts) expect(inside(holes[0], x, z), `${x},${z}`).toBe(true);
    let a = 0;
    const h = holes[0];
    for (let i = 0, j = h.length - 2; i < h.length; j = i, i += 2) a += h[j] * h[i + 1] - h[i] * h[j + 1];
    expect(Math.abs(a / 2)).toBeGreaterThan(150);
  });

  it('교차로 다섯 곳 둘레 80m 의 교통섬 구멍은 찻길에 칠한 표시(횡단보도·안전지대)와 0.5m² 넘게 겹치지 않는다', () => {
    const marks = decodeMarks(read('marks.json') as MarksJson);
    const paint = [...board.crosswalks.flatMap((c) => c.rings), ...board.crosswalkMarks, ...marks.zones.map((z) => z.ring)];
    const bad: string[] = [];
    for (const [name, cx, cz] of JUNCTIONS)
      for (const h of surface.faces.flatMap((f) => f.holes)) {
        let gx = 0;
        let gz = 0;
        for (let k = 0; k < h.length; k += 2) (gx += (h[k] * 2) / h.length), (gz += (h[k + 1] * 2) / h.length);
        if (Math.hypot(gx - cx, gz - cz) > 80) continue;
        let over = 0;
        for (let x = gx - 40; x < gx + 40; x += 0.25)
          for (let z = gz - 40; z < gz + 40; z += 0.25) if (inside(h, x, z) && paint.some((r) => inside(r, x, z))) over += 0.0625;
        if (over > 0.5) bad.push(`${name} (${gx.toFixed(0)},${gz.toFixed(0)}) ${over.toFixed(1)}m²`);
      }
    expect(bad).toEqual([]);
  });

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

  it('교차로 다섯 곳 둘레 80m 의 횡단보도 조각은 넓이의 30% 넘게 찻길(띠·교차로 면·그리기 전용 면) 밖에 있지 않다', () => {
    const rings = [...board.crosswalks.flatMap((c) => c.rings), ...board.crosswalkMarks];
    const bad: string[] = [];
    for (const [name, cx, cz] of JUNCTIONS) {
      const { quads, faces } = pieces(cx, cz, 120);
      const draws = surface.draw.filter((d) => Math.hypot(d.outer[0] - cx, d.outer[1] - cz) < 200);
      for (const r of rings) {
        let gx = 0;
        let gz = 0;
        for (let k = 0; k < r.length; k += 2) (gx += (r[k] * 2) / r.length), (gz += (r[k + 1] * 2) / r.length);
        if (Math.hypot(gx - cx, gz - cz) > 80) continue;
        let mnx = Infinity, mxx = -Infinity, mnz = Infinity, mxz = -Infinity;
        for (let k = 0; k < r.length; k += 2) (mnx = Math.min(mnx, r[k])), (mxx = Math.max(mxx, r[k])), (mnz = Math.min(mnz, r[k + 1])), (mxz = Math.max(mxz, r[k + 1]));
        let inA = 0;
        let outA = 0;
        for (let x = mnx + 0.125; x < mxx; x += 0.25)
          for (let z = mnz + 0.125; z < mxz; z += 0.25) {
            if (!inside(r, x, z)) continue;
            const on = quads.some((q) => q.some((qq) => inside(qq, x, z))) || faces.some((f) => inside(f.outer, x, z) && !f.holes.some((h) => inside(h, x, z))) || draws.some((d) => inside(d.outer, x, z));
            if (on) inA++;
            else outA++;
          }
        if (outA / (inA + outA || 1) > 0.3) bad.push(`${name} ${gx.toFixed(0)},${gz.toFixed(0)} ${((outA / (inA + outA)) * 100).toFixed(0)}%`);
      }
    }
    expect(bad).toEqual([]);
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
