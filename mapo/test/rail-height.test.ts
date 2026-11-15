import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeBoard, type Line } from '../src/data/board.ts';
import { GRADE, PORTAL_Y, railKind, railProfile } from '../tools/lib/rail.ts';

/** 0 부터 15m 간격 꼭짓점 n 개 */
const ss = (n: number) => Array.from({ length: n }, (_, i) => i * 15);
const free = (n: number) => ({ lo: new Array(n).fill(-Infinity), hi: new Array(n).fill(Infinity) });
const maxGrade = (s: number[], y: number[]) => Math.max(...y.slice(1).map((v, i) => Math.abs(v - y[i]) / (s[i + 1] - s[i])));

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

describe('OSM 태그로 정하는 철도 높이(굽기)', () => {
  it('태그를 터널(−1)·지상(0)·다리(1)로 나눈다', () => {
    expect(railKind({ tunnel: 'yes', layer: '-2' })).toBe(-1);
    expect(railKind({ layer: '-1' })).toBe(-1);
    expect(railKind({ location: 'underground' })).toBe(-1);
    expect(railKind({ bridge: 'viaduct', layer: '3' })).toBe(1);
    expect(railKind({ bridge: 'no' })).toBe(0);
    expect(railKind({})).toBe(0);
  });

  it('다리 → 지상 → 터널: 터널 구간은 처음부터 입구 깊이보다 깊고, 지상 구간이 땅높이를 지나 내려가며, 경사는 한계 안이다', () => {
    // 0~600m 다리, 600~780m 지상, 780m~ 터널
    const s = ss(101);
    const kind = s.slice(1).map((v) => (v <= 600 ? 1 : v <= 780 ? 0 : -1));
    const { lo, hi } = free(s.length);
    const y = railProfile(s, kind, lo, hi);
    s.forEach((v, i) => {
      if (v >= 780) expect(y[i]).toBeLessThanOrEqual(PORTAL_Y);
    });
    expect(y[s.indexOf(780)]).toBeGreaterThan(PORTAL_Y - 1); // 입구에서 갑자기 꺼지지 않는다
    expect(y[0]).toBeCloseTo(12, 1);
    expect(y[s.length - 1]).toBeCloseTo(-14, 1);
    const ground = s.map((v, i) => [v, y[i]]).filter(([v]) => v > 600 && v < 780);
    expect(ground.some(([, v]) => v > 0)).toBe(true);
    expect(ground.some(([, v]) => v < 0)).toBe(true);
    expect(maxGrade(s, y)).toBeLessThanOrEqual(GRADE + 1e-9);
  });

  it('다리가 찻길 위를 지나야 하는 곳(lo)은 그 높이를 지키고, 그 경사는 다리·지상 구간 밖 터널로 번지지 않는다', () => {
    const s = ss(121);
    const kind = s.slice(1).map((v) => (v <= 1200 ? 1 : v <= 1380 ? 0 : -1));
    const { lo, hi } = free(s.length);
    // 405m 에 높이 13m 고가 차도(위로 5m 넘게), 1005m 에 땅 위 골목(위로 5m)
    lo[s.indexOf(405)] = 18;
    lo[s.indexOf(1005)] = 5;
    const y = railProfile(s, kind, lo, hi);
    expect(y[s.indexOf(405)]).toBeGreaterThanOrEqual(18 - 1e-9);
    expect(y[s.indexOf(1005)]).toBeGreaterThanOrEqual(5 - 1e-9);
    expect(y[s.indexOf(105)]).toBeCloseTo(12, 1); // 멀리는 그대로
    for (let i = 0; i < s.length; i++) if (s[i] >= 1380) expect(y[i]).toBeLessThanOrEqual(PORTAL_Y);
    expect(maxGrade(s, y)).toBeLessThanOrEqual(GRADE + 1e-9);
  });

  it('지상 철도가 땅 위 길 밑을 지나야 하는 곳(hi)은 그 아래로 내린다', () => {
    const s = ss(41);
    const kind = s.slice(1).map(() => 0);
    const { lo, hi } = free(s.length);
    hi[20] = -5;
    const y = railProfile(s, kind, lo, hi);
    expect(y[20]).toBeLessThanOrEqual(-5 + 1e-9);
    expect(maxGrade(s, y)).toBeLessThanOrEqual(GRADE + 1e-9);
  });

  it('높이 조건을 함께 지킬 수 없으면 굽기를 멈추게 오류를 낸다', () => {
    const s = ss(11);
    const kind = s.slice(1).map((v) => (v <= 75 ? 1 : -1));
    const { lo, hi } = free(s.length);
    lo[4] = 18; // 60m 에서 18m 위인데 75m 부터 터널(−6.5m 아래)
    expect(() => railProfile(s, kind, lo, hi)).toThrow();
  });

  it('지금 판에서 땅 위·고가 철도와 찻길이 엇갈리는 곳은 모두 높이가 4.5m 넘게 차이 난다', () => {
    const board = decodeBoard(JSON.parse(readFileSync(new URL('../public/data/board.json', import.meta.url), 'utf8')));
    const xs = crossings(board.lines, board.roads).filter(([yr]) => yr > -3);
    expect(xs.length).toBeGreaterThan(3);
    for (const [yr, yc] of xs) expect(Math.abs(yr - yc)).toBeGreaterThanOrEqual(4.5);
  });
});
