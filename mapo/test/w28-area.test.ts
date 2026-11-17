import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { decodeBoard } from '../src/data/board.ts';
import { decodeSurface, type SurfaceJson } from '../src/data/surface.ts';
import { decodeArea, type WalkArea } from '../src/sim/people/area.ts';
import { underpasses, ZONES } from '../src/sim/people/zones.ts';
import { decodeWalk, LINK, type WalkJson } from '../src/sim/walknet.ts';
import { bitsAt, fillBits } from '../tools/lib/bits.ts';
import { majorGround } from '../tools/lib/walkfix.ts';

// 재작업 W28: 걷는 면(walk.json a). 사람은 이 면 안에서 움직이고 그물은 길 찾기에만 쓴다(설계 문서 55절).
const read = (f: string) => JSON.parse(readFileSync(new URL(`../public/data/${f}`, import.meta.url), 'utf8'));
const board = decodeBoard(read('board.json'));
const surface = decodeSurface(read('surface.json') as SurfaceJson);
const P = read('surface-polys.json') as { car: number[][]; med: number[][] };
const dm = (a: number[]) => a.map((v) => v / 10);
const json = read('walk.json') as WalkJson;
const W = decodeWalk(json);
const win = [-400, -1000, 1100, 500] as [number, number, number, number];
let A: WalkArea | null;
let G: ReturnType<typeof majorGround>;

beforeAll(() => {
  A = decodeArea(W.area);
  G = majorGround(board.roads, surface.faces, surface.draw.map((f) => f.outer), P.car.map((c) => [c[0], dm(c.slice(1))] as [number, number[]]), P.med.map(dm), win);
  for (const [tx, tz] of underpasses(board.roads, ...ZONES.mangwon)) fillBits(G, [Array.from({ length: 48 }, (_, k) => (k % 2 ? tz + Math.sin((Math.floor(k / 2) * Math.PI) / 12) * 20 : tx + Math.cos((Math.floor(k / 2) * Math.PI) / 12) * 20))], 1, true);
}, 120_000);

describe('W28 걷는 면', () => {
  it('walk.json 에 걷는 면이 있다', () => expect(A).not.toBeNull());
  it('걷는 면 칸 가운데 큰길 찻길 위는 0(홍대·연남 1.5km 네모)', () => {
    const bad: string[] = [];
    let cells = 0;
    for (let z = win[1] + 0.25; z < win[3]; z += 0.5)
      for (let x = win[0] + 0.25; x < win[2]; x += 0.5) {
        if (!A!.at(x, z)) continue;
        cells++;
        if (bitsAt(G, x, z) & 1 && bad.length < 10) bad.push(`${x},${z}`);
      }
    expect(cells).toBeGreaterThan(100_000);
    expect(bad).toEqual([]);
  });
  // 노란 선을 칠한 보도 있는 작은 길(#55) 찻길 위 골목 선 노드는 면 밖이다(사람은 옆 보도로 비켜 걷는다). 2026-11-17 잰 값 96.1%
  it('걷는 선(잇는 선 빼고) 노드의 95% 넘게 걷는 면 위', () => {
    let n = 0;
    let on = 0;
    for (let a = 0; a < W.adj.length; a++) {
      if (!W.kind[a].some((k) => k !== LINK)) continue;
      n++;
      if (A!.at(W.nx[a * 2], W.nx[a * 2 + 1])) on++;
    }
    expect(on / n).toBeGreaterThan(0.95);
  });
});
