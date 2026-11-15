import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeBoard, type Line } from '../src/data/board.ts';
import { liftRails } from '../src/data/railClear.ts';
import { cumLen } from '../src/poly.ts';
import { road } from './helpers.ts';

/** 15m 간격으로 찍은 동서 방향 노선, 높이 y(x) */
const line = (y: (x: number) => number): Line => {
  const pts: number[] = [];
  for (let x = -600; x <= 600; x += 15) pts.push(x, y(x), 0);
  const p = Float32Array.from(pts);
  return { id: 't', name: '시험선', color: '#000', cars: 6, carLen: 20, p, cum: cumLen(p), stops: [], stopNames: [] };
};
/** 노선 위 x 자리의 높이 */
const yAt = (l: Line, x: number) => {
  for (let k = 0; k + 3 < l.p.length; k += 3) if (l.p[k] <= x && l.p[k + 3] >= x) return l.p[k + 1] + ((l.p[k + 4] - l.p[k + 1]) * (x - l.p[k])) / (l.p[k + 3] - l.p[k]);
  return NaN;
};
/** 철도와 찻길이 평면으로 엇갈리는 곳마다 [철도 높이, 찻길 높이] */
function crossings(lines: Line[], roads: ReturnType<typeof decodeBoard>['roads']) {
  const out: [number, number][] = [];
  for (const L of lines)
    for (let a = 0; a + 3 < L.p.length; a += 3)
      for (const r of roads) {
        if (r.cls > 5) continue;
        for (let k = 0; k + 3 < r.p.length; k += 3) {
          const [ax, az, bx, bz] = [L.p[a], L.p[a + 2], L.p[a + 3], L.p[a + 5]];
          const [cx, cz, dx, dz] = [r.p[k], r.p[k + 2], r.p[k + 3], r.p[k + 5]];
          const den = (bx - ax) * (dz - cz) - (bz - az) * (dx - cx);
          if (Math.abs(den) < 1e-9) continue;
          const t = ((cx - ax) * (dz - cz) - (cz - az) * (dx - cx)) / den;
          const u = ((cx - ax) * (bz - az) - (cz - az) * (bx - ax)) / den;
          if (t >= 0 && t <= 1 && u >= 0 && u <= 1) out.push([L.p[a + 1] + (L.p[a + 4] - L.p[a + 1]) * t, r.p[k + 1] + (r.p[k + 4] - r.p[k + 1]) * u]);
        }
      }
  return out;
}

describe('철도와 찻길 높이', () => {
  it('고가 철도가 비슷한 높이의 고가 차도와 엇갈리면 그 자리를 차도보다 높이 올리고, 멀리는 그대로 두며 경사는 4% 안이다', () => {
    const l = line(() => 12);
    const deck = road([[0, -60], [0, 60]], { cls: 0, bridge: true });
    deck.p = Float32Array.from([0, 13, -60, 0, 13, 60]);
    liftRails([l], [deck]);
    expect(yAt(l, 0)).toBeGreaterThanOrEqual(13 + 4.5);
    expect(yAt(l, -500)).toBeCloseTo(12, 5);
    expect(yAt(l, 500)).toBeCloseTo(12, 5);
    for (let k = 0; k + 3 < l.p.length; k += 3) expect(Math.abs(l.p[k + 4] - l.p[k + 1]) / 15).toBeLessThanOrEqual(0.04);
    expect(l.cum[l.cum.length - 1]).toBeGreaterThan(1200); // 높이를 바꾼 만큼 길이를 다시 잰다
  });

  it('지하로 들어가는 철도가 땅 위 길 밑을 얕게 지나면 그 자리를 길보다 4.5m 넘게 내린다', () => {
    const l = line((x) => Math.max(-14, Math.min(12, -x * 0.03))); // 서쪽 고가 12m 에서 동쪽 지하 −14m 로 내려간다
    const street = road([[40, -60], [40, 60]], { cls: 3 }); // 철도 높이 −1.2m 자리를 지나는 땅 위 길
    liftRails([l], [street]);
    expect(yAt(l, 40)).toBeLessThanOrEqual(-4.5);
    for (let k = 0; k + 3 < l.p.length; k += 3) expect(Math.abs(l.p[k + 4] - l.p[k + 1]) / 15).toBeLessThanOrEqual(0.05);
  });

  it('땅 높이 철도가 땅 위 길과 만나면 길 밑으로 내리고(마포 판에는 건널목이 없다), 차도가 철도보다 충분히 높은 곳은 건드리지 않는다', () => {
    const ground = line(() => 0);
    const low = road([[0, -60], [0, 60]], { cls: 3 });
    liftRails([ground], [low]);
    expect(yAt(ground, 0)).toBeLessThanOrEqual(-4.5);
    const under = line(() => 7);
    const high = road([[0, -60], [0, 60]], { cls: 0, bridge: true });
    high.p = Float32Array.from([0, 17, -60, 0, 17, 60]);
    liftRails([under], [high]);
    expect(yAt(under, 0)).toBe(7);
  });

  it('지금 판에서 땅 위·고가 철도와 찻길이 엇갈리는 곳은 모두 높이가 4.5m 넘게 차이 난다', () => {
    const board = decodeBoard(JSON.parse(readFileSync(new URL('../public/data/board.json', import.meta.url), 'utf8')));
    const xs = crossings(board.lines, board.roads).filter(([yr]) => yr > -3);
    expect(xs.length).toBeGreaterThan(3);
    for (const [yr, yc] of xs) expect(Math.abs(yr - yc)).toBeGreaterThanOrEqual(4.5);
  });
});
