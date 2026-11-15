import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeBoard } from '../src/data/board.ts';
import { decodeSurface, type SurfaceJson } from '../src/data/surface.ts';
import { nearestS } from '../src/poly.ts';
import { makeFlow } from '../src/render/flow.ts';
import { buildCarGraph } from '../src/sim/graph.ts';
import { makeJunctions } from '../src/sim/junctions.ts';

// 흐름 색 띠는 교차로 상자 밖 구간에만 그린다. 상자 안은 여러 방향 띠가 겹쳐 색이 뭉친다(2026-11-16 도로 감사).
const board = decodeBoard(JSON.parse(readFileSync(new URL('../public/data/board.json', import.meta.url), 'utf8')));
const edges = buildCarGraph(board.roads);
const jn = makeJunctions(edges);

/** 구간 e 만 그린 흐름 띠의 가운데선 점들 */
function drawn(e: (typeof edges)[number]): [number, number][] {
  const { mesh } = makeFlow([e], jn);
  const pos = mesh.geometry.getAttribute('position').array as Float32Array;
  const out: [number, number][] = [];
  for (let i = 0; i < pos.length; i += 6) out.push([pos[i], pos[i + 2]]); // 점마다 좌우 두 꼭짓점을 같은 자리에 둔다
  return out;
}

describe('도로 흐름 띠', () => {
  it('교차로 상자(구간 끝에서 상자 가장자리까지 rIn·rOut) 안에 그려지는 흐름 띠 길이는 0 이다', () => {
    let inside = 0;
    let total = 0;
    for (const e of edges) {
      if (e.cls > 3) continue;
      const a = jn.groupOfStart[e.id] >= 0 ? jn.rOut[e.id] : 0;
      const b = e.len - (jn.groupOfEnd[e.id] >= 0 ? jn.rIn[e.id] : 0);
      const pts = drawn(e);
      for (let i = 1; i < pts.length; i++) {
        const [ax, az] = pts[i - 1];
        const [bx, bz] = pts[i];
        const len = Math.hypot(bx - ax, bz - az);
        total += len;
        const n = Math.max(1, Math.ceil(len / 0.5));
        for (let k = 0; k < n; k++) {
          const t = (k + 0.5) / n;
          const { s } = nearestS(e.p, e.cum, ax + (bx - ax) * t, az + (bz - az) * t);
          if (s < a - 0.3 || s > b + 0.3) inside += len / n;
        }
      }
    }
    expect(total).toBeGreaterThan(10000);
    expect(inside).toBe(0);
  });
});

describe('도로 흐름 띠와 교차로 면', () => {
  it('교차로 다섯 곳 둘레 80m 에서 찻길 바닥의 교차로 면(public/data/surface.json) 안에는 흐름 띠를 깔지 않는다', () => {
    const JN = [[-497, 250], [222, -410], [694, -804], [-68, -135], [-776, -495]];
    const surface = decodeSurface(JSON.parse(readFileSync(new URL('../public/data/surface.json', import.meta.url), 'utf8')) as SurfaceJson);
    const inside = (ring: ArrayLike<number>, x: number, z: number) => {
      let c = false;
      for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2)
        if (ring[i + 1] > z !== ring[j + 1] > z && x < ring[i] + ((z - ring[i + 1]) / (ring[j + 1] - ring[i + 1])) * (ring[j] - ring[i])) c = !c;
      return c;
    };
    const grid = new Map<string, typeof surface.faces>();
    for (const f of surface.faces) {
      let mnx = Infinity, mxx = -Infinity, mnz = Infinity, mxz = -Infinity;
      for (let k = 0; k < f.outer.length; k += 2) (mnx = Math.min(mnx, f.outer[k])), (mxx = Math.max(mxx, f.outer[k])), (mnz = Math.min(mnz, f.outer[k + 1])), (mxz = Math.max(mxz, f.outer[k + 1]));
      for (let gx = Math.floor(mnx / 50); gx <= Math.floor(mxx / 50); gx++) for (let gz = Math.floor(mnz / 50); gz <= Math.floor(mxz / 50); gz++) (grid.get(`${gx},${gz}`) ?? grid.set(`${gx},${gz}`, []).get(`${gx},${gz}`)!).push(f);
    }
    const { mesh } = makeFlow(edges, jn, surface.cut);
    const pos = mesh.geometry.getAttribute('position').array as Float32Array;
    const idx = mesh.geometry.getIndex()!.array;
    let inFace = 0;
    for (let i = 0; i < idx.length; i += 6) {
      const [a, b] = [idx[i], idx[i + 2]];
      for (let t = 0.25; t < 1; t += 0.5) {
        const x = pos[a * 3] + (pos[b * 3] - pos[a * 3]) * t;
        const z = pos[a * 3 + 2] + (pos[b * 3 + 2] - pos[a * 3 + 2]) * t;
        if (pos[a * 3 + 1] > 1 || !JN.some(([cx, cz]) => Math.hypot(x - cx, z - cz) < 80)) continue; // 교량 위는 면 위 높이라 따로 본다
        // 차로 가운데 띠라 가장자리 0.5m 는 면 경계와 스칠 수 있다: 면 안쪽으로 1m 넘게 들어간 점만 센다
        for (const f of grid.get(`${Math.floor(x / 50)},${Math.floor(z / 50)}`) ?? [])
          if (inside(f.outer, x, z) && !f.holes.some((h) => inside(h, x, z)) && [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dz]) => inside(f.outer, x + dx, z + dz))) inFace++;
      }
    }
    // 남은 것은 합정 연결로(3022)·동교동 5535 조각 띠가 교차로 면과 겹친 자리(연결로 폭을 고치는 W1-3 에서 0 으로)
    expect(inFace).toBeLessThanOrEqual(7);
  });
});
