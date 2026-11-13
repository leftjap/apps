// 버스 노선 관계(OSM relation)를 모형판 도로 조각의 순서로 바꾸는 도구.
// 부호 있는 조각 번호: (조각 번호 + 1) × (저장된 방향으로 지나면 +1, 거꾸로 지나면 −1)

/** 0 간선 1 지선 2 광역 3 마을 */
export type BusKind = 0 | 1 | 2 | 3;

export function busKind(ref: string, colour = ''): BusKind {
  if (/^[가-힣]+\d+$/.test(ref)) return 3;
  if (/^[MG]\d+/.test(ref) || /^[19]\d{3}$/.test(ref)) return 2;
  if (/^N\d+$/.test(ref) || /^\d{3}[A-Z]?$/.test(ref)) return 0;
  if (/^[2-8]\d{3}[A-Z]?$/.test(ref)) return 1;
  const c = colour.toLowerCase();
  if (['#3d5bab', '#0085ca'].includes(c)) return 0;
  if (['#f72f08', '#ee2737', '#e60012', '#000000'].includes(c)) return 2;
  return 1;
}

/** 노선에 속한 도로 조각. s→e 는 저장된 방향의 첫 노드와 끝 노드 */
export interface Seg {
  road: number;
  s: number;
  e: number;
  oneway: boolean;
}

/**
 * 노선에 속한 조각들만 따라 이어 달릴 수 있는 길들을 찾는다.
 * 들어오는 조각이 없는 곳(판 가장자리, 종점, 자료가 끊긴 곳)에서 출발해, 갈림길에서는 가장 곧은 쪽으로 간다.
 * straight(a, b): 부호 있는 조각 a 끝에서 b 로 들어갈 때의 곧음(cos 값)
 */
export function traceRuns(segs: Seg[], straight: (a: number, b: number) => number): number[][] {
  const arcs: { v: number; from: number; to: number }[] = [];
  for (const g of segs) {
    arcs.push({ v: g.road + 1, from: g.s, to: g.e });
    if (!g.oneway) arcs.push({ v: -(g.road + 1), from: g.e, to: g.s });
  }
  const out = new Map<number, typeof arcs>();
  for (const a of arcs) (out.get(a.from) ?? out.set(a.from, []).get(a.from)!).push(a);
  const ending = new Map<number, number[]>();
  for (const a of arcs) (ending.get(a.to) ?? ending.set(a.to, []).get(a.to)!).push(a.v);
  const runs: number[][] = [];
  for (const a0 of arcs) {
    if ((ending.get(a0.from) ?? []).some((v) => v !== -a0.v)) continue;
    const run = [a0.v];
    const seen = new Set([Math.abs(a0.v)]);
    let cur = a0;
    for (;;) {
      const opts = (out.get(cur.to) ?? []).filter((a) => !seen.has(Math.abs(a.v)));
      if (!opts.length) break;
      let best = opts[0];
      for (const o of opts) if (straight(cur.v, o.v) > straight(cur.v, best.v)) best = o;
      run.push(best.v);
      seen.add(Math.abs(best.v));
      cur = best;
    }
    runs.push(run);
  }
  // 다른 길에 통째로 들어 있는 길은 뺀다
  const key = (r: number[]) => `,${r.join(',')},`;
  return runs.filter((r, i) => !runs.some((o, j) => j !== i && o.length > r.length && key(o).includes(key(r))));
}
