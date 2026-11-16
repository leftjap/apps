import { describe, expect, it } from 'vitest';
import { ALLEY, LINK, PATH, SIDEWALK, type WalkGraph } from '../src/sim/walknet.ts';
import { crosswalk, road, walkNet } from './helpers.ts';

/** 그래프 선(횡단보도 연결 빼고)을 1m 마다 찍은 점들과 그 선의 종류 */
function samples(g: WalkGraph, kinds = [SIDEWALK, ALLEY, PATH, LINK]): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (let a = 0; a < g.adj.length; a++)
    g.adj[a].forEach((b, k) => {
      if (b < a || !kinds.includes(g.kind[a][k])) return;
      const L = Math.hypot(g.nx[b * 2] - g.nx[a * 2], g.nx[b * 2 + 1] - g.nx[a * 2 + 1]);
      for (let d = 0; d <= L; d += 1) out.push([g.nx[a * 2] + ((g.nx[b * 2] - g.nx[a * 2]) * d) / (L || 1), g.nx[a * 2 + 1] + ((g.nx[b * 2 + 1] - g.nx[a * 2 + 1]) * d) / (L || 1), g.kind[a][k]]);
    });
  return out;
}
/** 노드 a 에서 b 까지 그래프(횡단보도 연결 포함)로 이어져 있는가 */
function connected(g: WalkGraph, a: number, b: number, links = true): boolean {
  const seen = new Set([a]);
  const q = [a];
  while (q.length) {
    const n = q.pop()!;
    if (n === b) return true;
    const next = [...g.adj[n], ...(links ? (g.linkAt.get(n) ?? []).map((li) => (g.links[li].na === n ? g.links[li].nb : g.links[li].na)) : [])];
    for (const m of next) if (!seen.has(m)) seen.add(m), q.push(m);
  }
  return false;
}

describe('걷는 길 그래프: 보도 면 뼈대', () => {
  // 동서 큰길(4차로, 찻길 반폭 7.1m), 양옆 보도 4m
  const g = walkNet([road([[0, 0], [200, 0]], { cls: 2, lanes: 4 })]);
  it('보도 선은 보도 면 가운데를 지나고, 걷는 띠는 보도 폭 안이다', () => {
    const pts = samples(g, [SIDEWALK]);
    expect(pts.length).toBeGreaterThan(300);
    for (const [, z] of pts) expect(Math.abs(Math.abs(z) - (7.1 + 0.35 + 2))).toBeLessThan(0.6);
    for (let a = 0; a < g.adj.length; a++)
      g.adj[a].forEach((_, k) => {
        if (g.kind[a][k] !== SIDEWALK) return;
        const [lo, hi] = g.band[a][k];
        expect(hi).toBeGreaterThan(0.6);
        expect(hi).toBeLessThan(2.1);
        expect(lo).toBeCloseTo(-hi, 5);
      });
  });
  it('횡단보도가 없으면 양쪽 보도는 이어지지 않는다', () => {
    let n = -1;
    let s = -1;
    for (let i = 0; i < g.adj.length; i++) if (g.adj[i].length) g.nx[i * 2 + 1] > 0 ? (n = i) : (s = i);
    expect(connected(g, n, s)).toBe(false);
  });
});

describe('걷는 길 그래프: 횡단보도', () => {
  const xw = crosswalk(100, 0, 0, 1, 7.1, [], true, 4);
  const g = walkNet([road([[0, 0], [200, 0]], { cls: 2, lanes: 4 })], { crosswalks: [xw] });
  it('횡단보도 양 끝 찻길 밖 기다리는 자리에서 양쪽 보도 선으로 이어지고, 큰길을 건너는 것은 이 연결뿐이다', () => {
    expect(g.links.length).toBe(1);
    const l = g.links[0];
    expect(l.major).toBe(true);
    expect(Math.abs(l.paz)).toBeGreaterThan(7.1);
    expect(Math.abs(l.pbz)).toBeGreaterThan(7.1);
    expect(Math.sign(l.paz)).not.toBe(Math.sign(l.pbz));
    expect(Math.abs(g.nx[l.na * 2 + 1])).toBeGreaterThan(7.1);
    expect(connected(g, l.na, l.nb, false)).toBe(false);
    expect(connected(g, l.na, l.nb)).toBe(true);
    for (const [, z] of samples(g)) expect(Math.abs(z)).toBeGreaterThan(7.1);
  });
});

describe('걷는 길 그래프: 골목과 보행로', () => {
  // 큰길 남쪽에 골목이 직각으로 붙는다. 골목은 큰길 가운데선 노드까지 그려져 있다
  const roads = [road([[0, 0], [100, 0]], { cls: 2, lanes: 4 }), road([[100, 0], [200, 0]], { cls: 2, lanes: 4 }), road([[100, 0], [100, 80]], { cls: 4, lanes: 1 })];
  const g = walkNet(roads);
  it('골목은 큰길 찻길에 들어서기 전에서 끊기고, 끊긴 끝은 큰길 보도로 이어진다', () => {
    for (const [, z, kind] of samples(g)) if (kind === ALLEY) expect(z).toBeGreaterThan(7.1 - 0.5); // 0.5m 칸 하나 안
    const inAlley = g.nearest(100, 60);
    const sideW = g.nearest(50, 9.5);
    const sideE = g.nearest(150, 9.5);
    expect(connected(g, inAlley, sideW, false)).toBe(true);
    expect(connected(g, inAlley, sideE, false)).toBe(true);
  });
  it('찻길 위에 그려진 보행로(OSM 보도·건널목 선)는 쓰지 않고, 도로 부지 밖 보행로는 쓴다', () => {
    const rs = [road([[0, 0], [200, 0]], { cls: 2, lanes: 4 }), road([[50, -20], [50, 20]], { cls: 7, lanes: 1 }), road([[0, 40], [200, 40]], { cls: 7, lanes: 1 })];
    const g2 = walkNet(rs);
    const pts = samples(g2, [PATH]);
    expect(pts.some(([, z]) => Math.abs(z - 40) < 0.1)).toBe(true);
    for (const [, z] of pts) expect(Math.abs(z)).toBeGreaterThan(11.4);
  });
});

describe('걷는 길 그래프: 횡단보도 면', () => {
  it('기다리는 자리와 잇는 선은 칠한 횡단보도 면 밖에 둔다(면이 보도까지 나와 있어도)', () => {
    // 칠한 면이 축 양 끝 9m 까지(찻길 반폭 7.1m 보다 1.9m 더) 나와 있다
    const g = walkNet([road([[0, 0], [200, 0]], { cls: 2, lanes: 4 })], { crosswalks: [crosswalk(100, 0, 0, 1, 9, [], true, 4)] });
    expect(g.links.length).toBe(1);
    expect(Math.min(Math.abs(g.links[0].paz), Math.abs(g.links[0].pbz))).toBeGreaterThan(9);
    for (const [x, z] of samples(g)) expect(Math.abs(x - 100) > 2 || Math.abs(z) > 9).toBe(true);
  });
});

describe('걷는 길 그래프: 건물에 막힌 횡단보도 끝', () => {
  it('축을 따라 바깥에 바로 건물이 있으면 끝 옆 빈자리에서 기다린다', () => {
    // 횡단보도 북쪽(−z) 끝 바로 밖에 건물(축 둘레 x 98~102)이 붙어 있다. 그 옆 보도는 비어 있다
    const xw = crosswalk(100, 0, 0, 1, 7.1, [], true, 4);
    const g = walkNet([road([[0, 0], [200, 0]], { cls: 2, lanes: 4 })], { crosswalks: [xw], walls: [Float32Array.from([98, -7.4, 102, -7.4, 102, -20, 98, -20])] });
    expect(g.links.length).toBe(1);
    const l = g.links[0];
    const north = l.paz < 0 ? [l.pax, l.paz] : [l.pbx, l.pbz];
    expect(Math.abs(north[0] - 100)).toBeGreaterThan(2);
    expect(north[1]).toBeLessThan(-7.1);
  });
});

describe('걷는 길 그래프: 건너는 선', () => {
  it('기다리는 자리끼리 잇는 건너는 선이 칠한 횡단보도 면 밖의 큰길 찻길을 3m 넘게 지나면 잇지 않는다', () => {
    // 칠한 면이 찻길 가운데 3m(축 반길이 1.5m)뿐이라, 양 끝 기다리는 자리까지 칠 밖 찻길이 5.6m 씩 남는다
    const g = walkNet([road([[0, 0], [200, 0]], { cls: 2, lanes: 4 })], { crosswalks: [crosswalk(100, 0, 0, 1, 1.5, [], true, 4)] });
    expect(g.links.length).toBe(0);
  });
});
