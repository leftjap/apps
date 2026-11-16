import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeBoard } from '../src/data/board.ts';
import { decodeSurface, type SurfaceJson } from '../src/data/surface.ts';
import { BOARD_R } from '../src/geo.ts';
import { decodeWalk, type WalkJson } from '../src/sim/walknet.ts';
import { BODY_R, EDGE_EXT, hitDisc, majorGround } from '../tools/lib/walkfix.ts';
import { fillBits } from '../tools/lib/bits.ts';
import { underpasses, ZONES } from '../src/sim/people/zones.ts';

// 재작업 W21, 지금 판(public/data): 걷는 길 그물의 선·걷는 띠·노드 원은 큰길 찻길에서 사람 몸 반지름 넘게 떨어져 있고,
// 그물은 한 덩어리이며, 그물에 든 횡단보도는 양 끝이 모두 그물에 닿는다
const read = (f: string) => JSON.parse(readFileSync(new URL(`../public/data/${f}`, import.meta.url), 'utf8'));
const board = decodeBoard(read('board.json'));
const surface = decodeSurface(read('surface.json') as SurfaceJson);
const P = read('surface-polys.json') as { car: number[][]; med: number[][] };
const dm = (a: number[]) => a.map((v) => v / 10);
const W = decodeWalk(read('walk.json') as WalkJson);
const G = majorGround(
  board.roads,
  surface.faces,
  surface.draw.map((f) => f.outer),
  P.car.map((c) => [c[0], dm(c.slice(1))] as [number, number[]]),
  P.med.map(dm),
  [-BOARD_R, -BOARD_R, BOARD_R, BOARD_R],
);
// 한강공원 나들목 둘레 20m 는 보행로가 자동차 전용도로 밑을 지난다(찻길로 치지 않는다)
for (const [tx, tz] of underpasses(board.roads, ...ZONES.mangwon)) fillBits(G, [Array.from({ length: 48 }, (_, k) => (k % 2 ? tz + Math.sin((Math.floor(k / 2) * Math.PI) / 12) * 20 : tx + Math.cos((Math.floor(k / 2) * Math.PI) / 12) * 20))], 1, true);
const N = W.nx.length / 2;

describe('W21 걷는 길 그물', () => {
  it('선과 걷는 띠 가장자리에 선 사람 몸이 큰길 찻길에 닿는 길이 0', () => {
    let bad = 0;
    const where: string[] = [];
    for (let a = 0; a < N; a++)
      W.adj[a].forEach((b, k) => {
        if (b < a) return;
        const [ax, az, bx, bz] = [W.nx[a * 2], W.nx[a * 2 + 1], W.nx[b * 2], W.nx[b * 2 + 1]];
        const L = Math.hypot(bx - ax, bz - az);
        if (L < 1e-6) return;
        const [ux, uz] = [(bx - ax) / L, (bz - az) / L];
        const n = Math.max(1, Math.ceil(L / 0.5));
        // 사람은 띠를 선 양 끝 너머 EDGE_EXT 까지 쓴다
        for (let q = -1; q <= n + 1; q++)
          for (const u of new Set([0, W.band[a][k][0], W.band[a][k][1]])) {
            const t = q < 0 ? -EDGE_EXT : q > n ? L + EDGE_EXT : (L * q) / n;
            const x = ax + ux * t - uz * u;
            const z = az + uz * t + ux * u;
            if (hitDisc(G, x, z, BODY_R, 1)) {
              bad += L / (n + 1);
              if (where.length < 10) where.push(`${x.toFixed(1)},${z.toFixed(1)}`);
            }
          }
      });
    expect(where).toEqual([]);
    expect(bad).toBe(0);
  });
  it('노드 원 가장자리에 선 사람 몸이 큰길 찻길에 닿지 않는다', () => {
    const where: string[] = [];
    for (let n = 0; n < N; n++) {
      if (!W.adj[n].length) continue;
      for (let k = 0; k < 8; k++) {
        const x = W.nx[n * 2] + Math.cos((k * Math.PI) / 4) * W.rad[n];
        const z = W.nx[n * 2 + 1] + Math.sin((k * Math.PI) / 4) * W.rad[n];
        if (hitDisc(G, x, z, BODY_R, 1)) where.push(`${x.toFixed(1)},${z.toFixed(1)}`);
      }
    }
    expect(where.slice(0, 10)).toEqual([]);
  });
  it('그물은 한 덩어리이고 그물에 든 횡단보도는 양 끝이 모두 그물에 닿는다(막다른 횡단보도 0)', () => {
    const root = Int32Array.from({ length: N }, (_, i) => i);
    const f = (i: number): number => {
      while (root[i] !== i) (root[i] = root[root[i]]), (i = root[i]);
      return i;
    };
    for (let a = 0; a < N; a++) for (const b of W.adj[a]) root[f(a)] = f(b);
    for (const l of W.links) root[f(l.na)] = f(l.nb);
    const comps = new Set<number>();
    for (let n = 0; n < N; n++) if (W.adj[n].length) comps.add(f(n));
    expect(comps.size).toBe(1);
    const dead = W.links.filter((l) => !W.adj[l.na].length || !W.adj[l.nb].length);
    expect(dead.length).toBe(0);
  });
  // 끝이 찻길 한가운데(W14 에서 지운 교통섬 자리)이거나 연석과 건물 사이가 몸이 지나갈 수 없을 만큼 좁은 횡단보도는 잇지 못한다.
  // 2026-11-17 판 889개 가운데 47개(메모 mapo-w21-people.md). 늘지 않는지만 본다
  it('그물에 잇지 못한 횡단보도가 늘지 않는다', () => {
    const linked = new Set(W.links.map((l) => l.xw));
    expect(board.crosswalks.length - linked.size).toBeLessThanOrEqual(47);
  });
});
