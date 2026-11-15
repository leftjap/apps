import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeBoard } from '../src/data/board.ts';
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
