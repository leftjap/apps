import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeArea } from '../src/sim/people/area.ts';
import { decodeWalk, LINK, type WalkJson } from '../src/sim/walknet.ts';
import { PER_HEAD, WIDTH_UNIT } from '../tools/lib/walkwidth.ts';

// 재작업 W31 S2(설계 mapo-w31-people-design.md 4절): walk.json 의 선 면 폭(w)과 갈래 영역(j). 사람 모듈의 차로(S3)·갈래 영역 입장(S4)이 쓴다.
const json = JSON.parse(readFileSync(new URL('../public/data/walk.json', import.meta.url), 'utf8')) as WalkJson;
const W = decodeWalk(json);
const A = decodeArea(json.a)!;
const E = json.e.length / 5;
const ends = (k: number): [number, number] => [W.edgeAt[k * 2], W.adj[W.edgeAt[k * 2]][W.edgeAt[k * 2 + 1]]];
const areas: { nodes: number[]; m2: number }[] = [];
for (let k = 0; json.j && k < json.j.length; k += 2 + json.j[k]) {
  const nodes: number[] = [];
  for (let q = 0; q < json.j[k]; q++) nodes.push((nodes[q - 1] ?? 0) + json.j[k + 2 + q]);
  areas.push({ nodes, m2: json.j[k + 1] });
}

describe('W31 S2 선 면 폭', () => {
  it('선마다 면 폭이 있다', () => expect(json.w?.length).toBe(E));
  it('면 폭은 0 이상 정수', () => expect(json.w!.every((v) => Number.isInteger(v) && v >= 0)).toBe(true));
  // 걷는 선(잇는 선 빼고, 2m 넘는)은 거의 모두 폭이 있다. 면 밖 선(#55 칠한 작은 길 위 골목 선)도 4m 안 면에서 잰다.
  // 0 인 선은 세 자리 가운데 하나가 0.5m 칸 구멍이 촘촘한 면 조각에 걸린 선이다(2026-11-17 잰 값 95.6%)
  it('2m 넘는 걷는 선의 95% 넘게 면 폭이 0 보다 크다', () => {
    let n = 0;
    let pos = 0;
    for (let k = 0; k < E; k++) {
      const [a, b] = ends(k);
      if (json.e[k * 5 + 2] >> 4 === LINK) continue;
      if (Math.hypot(W.nx[b * 2] - W.nx[a * 2], W.nx[b * 2 + 1] - W.nx[a * 2 + 1]) <= 2) continue;
      n++;
      if (json.w![k] > 0) pos++;
    }
    expect(pos / n).toBeGreaterThan(0.95);
  });
  // 어울마당로 Y 갈림 칸(400~420, −440~−420)의 서쪽 가는 띠는 1~2m(설계 1-2절, mapo/tmp/w31/diag/neck.ts): 그 칸 선 가운데 1.6m 미만이 있다
  it('Y 갈림 칸에 1.6m 미만 선이 있다', () => {
    const narrow: number[] = [];
    for (let k = 0; k < E; k++) {
      const [a, b] = ends(k);
      const mx = (W.nx[a * 2] + W.nx[b * 2]) / 2;
      const mz = (W.nx[a * 2 + 1] + W.nx[b * 2 + 1]) / 2;
      if (mx >= 400 && mx < 420 && mz >= -440 && mz < -420 && json.w![k] * WIDTH_UNIT < 1.6) narrow.push(k);
    }
    expect(narrow.length).toBeGreaterThan(0);
  });
});

describe('W31 S2 갈래 영역', () => {
  it('영역이 있다', () => expect(areas.length).toBeGreaterThan(1000));
  it('영역마다 갈래 노드가 둘 이상', () => expect(areas.filter((r) => r.nodes.filter((n) => W.adj[n].length >= 3).length < 2).length).toBe(0));
  it('노드는 한 영역에만', () => {
    const all = areas.flatMap((r) => r.nodes);
    expect(new Set(all).size).toBe(all.length);
  });
  // 그물 한 칸 이웃으로 4m 안 다른 갈래 노드가 붙은 갈래 노드(설계 1-2절 52%)는 모두 영역 안
  it('4m 안 이웃 갈래 노드가 있는 갈래 노드는 모두 영역 안', () => {
    const inA = new Set(areas.flatMap((r) => r.nodes));
    const miss: number[] = [];
    for (let a = 0; a < W.adj.length; a++) {
      if (W.adj[a].length < 3) continue;
      for (const b of W.adj[a])
        if (W.adj[b].length >= 3 && Math.hypot(W.nx[b * 2] - W.nx[a * 2], W.nx[b * 2 + 1] - W.nx[a * 2 + 1]) < 4 && !inA.has(a) && miss.length < 10) miss.push(a);
    }
    expect(miss).toEqual([]);
  });
  // 넓이는 영역 노드·선 2m 안 걷는 면이고 정원 = 넓이 / 1.2m². 노드가 면 위인데 정원이 1 이 안 되는 곳은 둘레가 막힌 작은 면 조각이다(2026-11-17 잰 값 2곳).
  // 노드가 모두 면 밖(칠한 작은 길 위)인 영역은 넓이가 0 일 수 있다(136곳): 입장 게이트(S4)는 정원 0 을 막힌 곳으로 보지 말 것
  it('영역 노드가 면 위인데 정원 0 인 영역 2곳 아래', () => {
    const bad = areas.filter((r) => r.nodes.some((n) => A.at(W.nx[n * 2], W.nx[n * 2 + 1])) && Math.floor(r.m2 / PER_HEAD) < 1);
    expect(bad.length).toBeLessThanOrEqual(2);
  });
});
