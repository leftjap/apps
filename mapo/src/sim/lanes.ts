// 차로 정하기(길 정본의 차로, 설계 문서 51절). 굽기(tools/road.ts)가 부르고, 정본 없이 차 그래프를 만들 때(시험의 만든 길)도 같은 함수로 정한다.
// 서울시 선으로 읽은 방향별 차로(tools/road/read.ts)에서 시작해 ① 선 없는 방향 채우기(이음매 이어받기, 양방향 길은 다른 방향 가장자리 너머)
// ② 중앙버스차로 잇기와 자리 ③ 마주 오는 한 방향 찻길 떼어 놓기 ④ 정본 제약(반대 방향 차로 띠 포개짐 없음, 갈림 없는 이음매에서 차로 이어짐, 재작업 W23·W27)을 건 뒤
// 구간마다 최종 차로 표를 돌려준다(W22 까지 graph.ts 가 실행 중에 하던 손질을 굽기로 옮김). 실행 중 차 그래프(graph.ts)는 이 표를 고치지 않고 쓴다.
import { curbAt, type Crosswalk, type Road } from '../data/board.ts';
import { buildIntersections, type Intersections } from './intersection/build.ts';
import type { CanonLanes, DirLanes, RoadLanes, Run } from '../data/road.ts';
import { cumLen, headingAt, pointAt } from '../poly.ts';
import { BODY_HW, BUS_HW } from './bodies.ts';
import { carRoad, extendFrames, fixShortKinks, headingNear, laneOff, laneWidth, leftEdge, linkEdges, makeEdges, medAt, MED, sameLaneSeam, setLaneMaps, sinkTunnels, type Edge } from './graph.ts';

/** 서울시 선이 없는 방향: 지금까지처럼 OSM 가운데선에서 차로 수 × 차로 폭으로 펼친다(양방향 길은 가운데선 오른쪽, 한 방향 길은 가운데선을 가운데로) */
function plainDir(r: Road, rev: boolean, len: number): DirLanes {
  const n = Math.max(1, rev ? r.lb : r.lf);
  const left = r.oneway ? (-n * r.lw) / 2 : 0;
  const off = Array.from({ length: n }, (_, l) => left + (l + 0.5) * r.lw);
  return { read: false, a: -1, b: -1, runs: [{ s0: 0, s1: len, n, st: [0], off, med: [] }] };
}

/** 분리대 폭 gap 인 한 방향 큰길에서 일반 차로 왼쪽 가장자리부터 중앙버스차로 가운데까지(m). 서울시 선으로 읽지 못한 곳에 쓴다 */
const medOff = (gap: number) => 0.5 + Math.max(1.4, Math.min(1.75, gap / 4));

/** 정본 차로를 정한다. read: 서울시 선으로 읽은 방향별 차로(없는 방향은 찻길 폭을 고르게 나눈다).
 *  junction: 횡단보도·정지선(교차로 상자 둘레를 정본 제약에서 빼는 데 쓴다). 없으면(시험의 만든 길) 정본 제약을 걸지 않는다 */
export function resolveLanes(roads: Road[], read?: RoadLanes, junction?: { crosswalks: Crosswalk[]; stopLines: ArrayLike<number> }): CanonLanes {
  const dirs: RoadLanes = roads.map((r, i) => {
    if (!carRoad(r)) return null;
    const full = cumLen(r.p)[r.p.length / 3 - 1];
    const f = read?.[i]?.[0];
    const b = read?.[i]?.[1];
    return [f ? { ...f, read: true } : plainDir(r, false, full), r.oneway ? null : b ? { ...b, read: true } : plainDir(r, true, full)];
  });
  const edges = makeEdges(roads, dirs);
  const prev = linkEdges(edges);
  /** 서울시 선으로 직접 읽은 구간(1)과 양 끝 읽은 구간 사이를 고르게 옮겨 간 구간(2): 연석 고치기에서 뺀다 */
  const painted = new Uint8Array(edges.length);
  for (const e of edges) painted[e.id] = e.plain ? 0 : 1;
  for (const id of inheritLanes(edges, prev, roads)) painted[id] = 2;
  // 실행 중 차 그래프(buildCarGraph)와 같은 순서로 방향을 정한다(정본 제약이 차가 서는 자리로 재므로)
  fixShortKinks(edges, prev);
  sinkTunnels(edges, prev, roads);
  extendFrames(edges, prev);
  // 중앙버스정류장 자리에서는 분리대 쪽 경계가 버스전용차선이 아니라 승강장 연석이라 차선 자료로 중앙버스차로를 읽지 못한다.
  // 분리대가 있는 한 방향 큰길 조각이 같은 이름 길을 따라 앞뒤 네 조각 안에서 중앙버스차로와 이어지면 중앙버스차로로 잇는다
  const roadOf = edges.map((e) => roads[e.road]);
  const open = (e: Edge) => !e.med && roadOf[e.id].oneway && e.cls <= 3 && roadOf[e.id].gap > 1;
  // 같은 조각이 차로 수 구간으로 나뉜 구간은 한 조각으로 센다
  const reach = (e: Edge, step: (e: Edge) => number[], left: number): boolean =>
    step(e).some((k) => {
      const same = edges[k].road === e.road;
      return edges[k].name === e.name && (edges[k].med > 0 || ((left > 1 || same) && open(edges[k]) && reach(edges[k], step, same ? left : left - 1)));
    });
  // 앞뒤가 바로 중앙버스차로인 40m 미만 한 방향 조각(교차로 안 조각 등)은 이름·분리대와 상관없이 잇는다. 이은 조각이 다음 조각을 이을 수 있으므로 바뀌지 않을 때까지 되풀이한다
  const between = (e: Edge) => !e.med && roadOf[e.id].oneway && e.cls <= 3 && e.len < 40 && prev[e.id].some((k) => edges[k].med > 0) && e.next.some((k) => edges[k].med > 0);
  for (let pass = 0; pass < 4; pass++) {
    const fill = edges.filter((e) => (e.name && open(e) && reach(e, (q) => q.next, 4) && reach(e, (q) => prev[q.id], 4)) || between(e));
    if (!fill.length) break;
    for (const e of fill) e.med = 1;
  }
  // 중앙버스차로 자리: 서울시 선으로 읽은 구간은 그 자리, 아니면 분리대 폭으로 어림한다.
  // 읽은 자리가 일반 차로 왼쪽 가장자리에서 4.5m 넘게 떨어지면 건너편 찻길의 중앙버스전용차선을 읽은 것이라 버린다(양화로 −820,390 7.6m, 수색로 9.2m)
  for (const e of edges) {
    if (!e.med) continue;
    if (e.mo.length && medAt(e, e.len / 2) > 4.5) e.mo = new Float32Array(0);
    e.med = e.mo.length ? Math.max(0.5, medAt(e, e.len / 2)) : medOff(roadOf[e.id].gap);
  }
  keepApart(edges, roadOf);
  // 중앙버스차로 버스가 1차로 차와 나란히 설 때 몸통이 닿지 않게: 선으로 읽은 자리가 1차로 가운데에서 (버스 반폭 + 가장 넓은 승용차 반폭 + 0.15m) 보다 가까운 곳이 있으면
  // 읽은 자리를 버리고 그만큼 떨어진 자리에 둔다(1차로 반폭만큼은 이미 떨어져 있다)
  for (const e of edges) {
    if (!e.med) continue;
    let need = 0;
    for (const sv of e.mo.length ? [0, ...e.st, e.len] : [e.len / 2]) need = Math.max(need, Math.max(...BUS_HW) + Math.max(...BODY_HW) + 0.15 - laneWidth(e, 0, Math.min(e.len, Math.max(0, sv))) / 2);
    const close = e.mo.length ? Math.min(...[0, ...e.st, e.len].map((sv) => medAt(e, Math.min(e.len, Math.max(0, sv))))) : e.med;
    if (close < need) {
      e.mo = new Float32Array(0);
      e.med = Math.max(e.med, need);
    }
  }
  if (junction) {
    setLaneMaps(edges, prev);
    canonConstraints(edges, prev, roads, painted, buildIntersections(edges, junction.crosswalks, junction.stopLines));
  }
  return exportCanon(roads, edges, dirs);
}

/** 구간들의 최종 차로 표를 방향별 차로로 옮겨 적는다. 실행 중 차 그래프가 같은 수로 다시 만들게 구간 경계·차로 시작/끝 자리는 처음 값(src)을 그대로 쓴다 */
function exportCanon(roads: Road[], edges: Edge[], src: RoadLanes): CanonLanes {
  const dirs: RoadLanes = roads.map(() => null);
  const by = new Map<number, Edge[]>();
  for (const e of edges) (by.get(e.road * 2 + (e.rev ? 1 : 0)) ?? by.set(e.road * 2 + (e.rev ? 1 : 0), []).get(e.road * 2 + (e.rev ? 1 : 0))!).push(e);
  for (const [k, list] of by) {
    list.sort((a, b) => a.s0 - b.s0);
    const runs: Run[] = list.map((e, i) => ({
      s0: e.s0,
      s1: i + 1 < list.length ? list[i + 1].s0 : e.full,
      n: e.lanes,
      st: Array.from(e.st, (v) => v + e.s0),
      off: Array.from(e.lo),
      med: Array.from(e.mo),
      // 정본 제약이 옆 거리 표를 옮겼으면 표로 다시 잰다
      medv: e.mo.length ? Math.max(0.5, medAt(e, e.len / 2)) : e.med,
      lwv: e.lw,
    }));
    const o = src[k >> 1]?.[k & 1];
    const d: DirLanes = { read: !list[0].plain, a: o?.a ?? -1, b: o?.b ?? -1, runs };
    const r = (dirs[k >> 1] ??= [null, null]);
    r[k & 1] = d;
  }
  return { canon: true, dirs };
}

/**
 * 서울시 선이 없는 방향(plain)의 차로 자리를 이웃한 선 읽은 구간에 맞춘다. OSM 가운데선 × 차로 폭으로 펼친 자리는 칠한 차로와 1~3m 어긋나,
 * ① 같은 방향으로 갈림 없이 이어지는 이음매에서 차로 곡선이 엇갈리고(두 차로가 한 차로로 모임), ② 양방향 길의 다른 방향 차로와 포개졌다.
 * ① 차로 수가 같고 25° 안으로 이어지는 앞(뒤) 구간의 끝(시작) 자리를 이어받는다(양쪽이면 그 사이를 고르게). 이어받은 구간도 다음 구간에 넘긴다.
 * ② 그래도 남은 양방향 길의 선 없는 방향은, 같은 조각 다른 방향(중앙버스차로 없음)의 왼쪽 가장자리(실제 중앙선) 너머에 차로 폭으로 펼친다
 */
function inheritLanes(edges: Edge[], prev: number[][], roads: Road[]): Set<number> {
  /** 양 끝 읽은 구간 사이를 고르게 옮겨 간 구간 */
  const between = new Set<number>();
  const known = edges.map((e) => !e.plain);
  const offs = (e: Edge, s: number) => Array.from({ length: e.lanes }, (_, l) => laneOff(e, l, s));
  const aligned = (a: Edge, b: Edge) => {
    let t = Math.abs(headingNear(b, 0) - headingNear(a, a.len));
    if (t > Math.PI) t = 2 * Math.PI - t;
    return t < (25 * Math.PI) / 180;
  };
  const seam = () => {
    for (let changed = true, pass = 0; changed && pass < 8; pass++) {
      changed = false;
      for (const e of edges) {
        if (known[e.id]) continue;
        const p = prev[e.id].length === 1 ? edges[prev[e.id][0]] : undefined;
        const q = e.next.length === 1 ? edges[e.next[0]] : undefined;
        const from = p && known[p.id] && p.next.length === 1 && p.lanes === e.lanes && aligned(p, e) ? offs(p, p.len) : null;
        const to = q && known[q.id] && prev[q.id].length === 1 && q.lanes === e.lanes && aligned(e, q) ? offs(q, 0) : null;
        if (!from && !to) continue;
        e.st = from && to ? Float32Array.of(0, e.len) : Float32Array.of(0);
        e.lo = Float32Array.from(from && to ? [...from, ...to] : from ?? to!);
        known[e.id] = true;
        changed = true;
      }
    }
  };
  // ⓪ 선 없는 구간들이 갈림 없는 이음매로 줄지어 있고 줄 양 끝이 선을 읽은 구간이면, 줄 전체에서 앞 끝 자리부터 뒤 끝 자리까지 길이 비례로 고르게 옮겨 간다
  // (한쪽 끝만 이어받으면 다른 끝 이음매에서 차로가 몇 m 씩 끊겼다: 월드컵로 −572,−35 역방향이 북쪽 조각의 7.5m 를 받아 연석 밖을 달리고 남쪽 이음매에서 5.8m 끊김, 재작업 W23).
  // 3m 보다 짧은 조각(OSM 의 꺾인 토막)은 방향을 보지 않는다
  {
    const link = (a: Edge, b: Edge) => a.next.length === 1 && a.next[0] === b.id && prev[b.id].length === 1 && a.lanes === b.lanes && (a.len < 3 || b.len < 3 || aligned(a, b));
    for (const e of edges) {
      if (known[e.id]) continue;
      const p = prev[e.id].length === 1 ? edges[prev[e.id][0]] : undefined;
      if (!p || !known[p.id] || !link(p, e)) continue;
      const run: Edge[] = [e];
      let q = e;
      while (q.next.length === 1 && !known[q.next[0]] && link(q, edges[q.next[0]]) && run.length < 20) run.push((q = edges[q.next[0]]));
      const end = q.next.length === 1 ? edges[q.next[0]] : undefined;
      if (!end || !known[end.id] || !link(q, end)) continue;
      const A = offs(p, p.len);
      const B = offs(end, 0);
      const total = run.reduce((t, r) => t + r.len, 0) || 1;
      let at = 0;
      for (const r of run) {
        const u0 = at / total;
        const u1 = (at + r.len) / total;
        r.st = Float32Array.of(0, r.len);
        r.lo = Float32Array.from([...A.map((a, l) => a + (B[l] - a) * u0), ...A.map((a, l) => a + (B[l] - a) * u1)]);
        known[r.id] = true;
        between.add(r.id);
        at += r.len;
      }
    }
  }
  seam();
  // ② 양방향 길: 같은 조각 다른 방향 구간들의 단면마다 왼쪽 가장자리를 이 방향 거리로 옮겨 적는다
  const byRoad = new Map<number, Edge[]>();
  for (const e of edges) (byRoad.get(e.road) ?? byRoad.set(e.road, []).get(e.road)!).push(e);
  for (const e of edges) {
    if (known[e.id] || roads[e.road].oneway) continue;
    const other = (byRoad.get(e.road) ?? []).filter((o) => o.rev !== e.rev);
    if (!other.length || other.some((o) => !known[o.id] || o.med)) continue;
    const rows: [number, number][] = [];
    for (const o of other)
      for (const s of new Set([0, ...o.st, o.len])) if (s >= 0 && s <= o.len) rows.push([o.full - (o.s0 + s) - e.s0, -leftEdge(o, s)]);
    rows.sort((a, b) => a[0] - b[0]);
    const lw = roads[e.road].lw;
    e.st = Float32Array.from(rows, (r) => r[0]);
    e.lo = Float32Array.from(rows.flatMap(([, b]) => Array.from({ length: e.lanes }, (_, l) => b + (l + 0.5) * lw)));
    known[e.id] = true;
  }
  seam();
  for (const e of edges) if (known[e.id]) e.plain = false;
  return between;
}

/** 멀리서 조금 키워 그린 차 몸통의 반폭(m): 가장 넓은 승용차·버스 × 1.15 */
const CAR_HALF = Math.max(...BODY_HW) * 1.15;
const BUS_HALF = Math.max(...BUS_HW) * 1.15;

/**
 * 마주 오는 두 한 방향 찻길: 서울시 선이 없어 찻길 면 폭으로 차로를 나눈 구간(교량 위 등)은 두 찻길의 차로가 포개지거나
 * 분리대가 좁아 중앙버스차로 버스가 건너편 찻길로 넘어가는 곳이 있다(선으로 읽은 차로는 칠한 자리 그대로라 포개지지 않는다).
 * 그런 한 방향 찻길마다 왼쪽에 마주 오는 다른 길의 한 방향 찻길이 있으면, 두 찻길 왼쪽 가장자리 사이(분리대, 포개지면 음수)가 가장 좁은 곳을 재고
 * 그 가운데보다 왼쪽으로 차 몸통이 넘어가지 않게 한다: 중앙버스차로는 버스를 일반 차로 쪽으로 붙이고, 그래도 모자라면
 * 오른쪽 가장자리는 그대로 둔 채 왼쪽 가장자리를 옮겨 차로를 좁힌다(차로 폭 2.4m 까지, 더 모자라면 찻길을 오른쪽으로 옮긴다).
 * 구간 양 끝 3m(교차로·이음매에서 두 찻길이 만나는 곳)와 높이가 2.5m 넘게 다른 찻길(고가도로 위아래)은 재지 않는다
 */
function keepApart(edges: Edge[], roadOf: Road[]) {
  const one = edges.filter((e) => roadOf[e.id].oneway);
  const C = 10;
  const key = (x: number, z: number) => Math.floor(x / C) * 100003 + Math.floor(z / C);
  const grid = new Map<number, number[]>(); // 칸마다 [구간, x, z, 방향, 높이, 가운데선에서 왼쪽 가장자리까지] 6개씩
  const P = [0, 0, 0];
  for (const e of one)
    for (let d = 0; d <= e.len; d += 2) {
      const seg = pointAt(e.p, e.cum, d, P);
      const k = key(P[0], P[2]);
      (grid.get(k) ?? grid.set(k, []).get(k)!).push(e.id, P[0], P[2], headingAt(e.p, seg), P[1], -leftEdge(e, d));
    }
  const gap = new Map<number, number>();
  for (const e of one) {
    if (!e.plain && !e.med) continue;
    let G = Infinity;
    for (let d = 3; d <= e.len - 3; d += 4) {
      const seg = pointAt(e.p, e.cum, d, P);
      const h = headingAt(e.p, seg);
      const hx = Math.cos(h);
      const hz = Math.sin(h);
      const le = -leftEdge(e, d);
      for (let gx = -2; gx <= 2; gx++)
        for (let gz = -2; gz <= 2; gz++) {
          const l = grid.get(key(P[0] + gx * C, P[2] + gz * C));
          if (!l) continue;
          for (let k = 0; k < l.length; k += 6) {
            const o = edges[l[k]];
            if (o.road === e.road || Math.cos(l[k + 3] - h) > -0.85 || Math.abs(l[k + 4] - P[1]) > 2.5) continue;
            const dx = l[k + 1] - P[0];
            const dz = l[k + 2] - P[2];
            const lat = dx * hz - dz * hx; // 왼쪽이 +
            if (Math.abs(dx * hx + dz * hz) > 1.5 || lat <= 0 || lat > 25) continue;
            G = Math.min(G, lat - le - l[k + 5]);
          }
        }
    }
    if (G < Infinity) gap.set(e.id, G);
  }
  for (const [id, G] of gap) {
    const e = edges[id];
    const room = G / 2 - 0.05; // 왼쪽 가장자리 밖으로 쓸 수 있는 거리(음수면 안쪽으로 비켜야 한다)
    let need = 0;
    if (e.med) {
      const near = BUS_HALF + CAR_HALF - e.lw / 2 + 0.3; // 버스가 1차로 차 몸통과 닿지 않는 가장 가까운 자리(굽은 길에서 비스듬해지는 몫 0.3m)
      const fit = room - BUS_HALF;
      // 선으로 읽은 중앙버스차로가 그 자리를 넘으면 읽은 자리를 버리고 어림한 자리를 쓴다
      if (e.mo.length && medAt(e, e.len / 2) > Math.max(near, fit)) e.mo = new Float32Array(0);
      if (fit >= near) e.med = Math.min(e.med, fit);
      else {
        e.med = near;
        need = near - fit;
      }
    } else need = Math.max(0, CAR_HALF - e.lw / 2 - room);
    // 선으로 읽은 차로는 칠한 자리 그대로 둔다(중앙버스차로만 옮긴다)
    if (need <= 0 || !e.plain) continue;
    const n = e.lanes;
    for (let k = 0; k < e.st.length; k++) {
      const w = laneWidth(e, 0, e.st[k]);
      const le = -(e.lo[k * n] - w / 2);
      const right = e.lo[k * n + n - 1] + w / 2;
      const lw = Math.max(2.4, Math.min(w, (right + le - need) / n));
      for (let l = 0; l < n; l++) e.lo[k * n + l] = -le + need + lw / 2 + l * lw;
    }
    e.lw = n > 1 ? e.lo[1] - e.lo[0] : e.lw;
  }
}

// ── 정본 제약(재작업 W23, 설계 문서 51절) ──
/** 반대 방향 두 차로 가운데 사이를 이만큼 벌린다(m). 시험은 2.6m 아래를 포개짐으로 센다 */
export const OPP_GAP = 2.8;
/** 같은 방향 이웃 차로 가운데 사이(m) */
const LANE_GAP = 2.6;
/** 중앙버스차로 가운데와 1차로 가운데 사이(m): 버스와 가장 넓은 승용차가 나란히 서도 몸통이 0.15m 떨어진다 */
const MED_GAP = Math.max(...BUS_HW) + Math.max(...BODY_HW) + 0.15;
const STEP = 2;
/** 반대 방향 포개짐을 풀려고 가장 왼쪽 차로를 처음 자리에서 밀 수 있는 거리(m) */
const MAX_PUSH = 3;
/** 교차로 상자 가장자리에서 이 거리(m) 안은 차로를 옮기지 않는다 */
const FREEZE = 10;
/** 맨 오른쪽 차로 가운데와 연석 사이(m): 차로 반폭 */
const CURB_HALF = 1.4;
/** 이음매에서 옮겨 맞추는 가장 큰 어긋남(m) */
export const STITCH_MAX = 1.5;
/** 옆 거리가 길을 따라 바뀌는 기울기 한도(차가 한 단계에 옆으로 튀지 않게) */
const SLOPE = 0.15;

/** 구간의 차로 표를 STEP 마다 고르게 다시 적는다(중앙버스차로는 옆 거리 표로) */
function densify(e: Edge) {
  const m = Math.max(2, Math.ceil(e.len / STEP) + 1);
  const st = Float32Array.from({ length: m }, (_, k) => Math.min(e.len, (k * e.len) / (m - 1)));
  const lo = new Float32Array(m * e.lanes);
  const mo = e.med ? new Float32Array(m) : new Float32Array(0);
  for (let k = 0; k < m; k++) {
    for (let l = 0; l < e.lanes; l++) lo[k * e.lanes + l] = laneOff(e, l, st[k]);
    if (e.med) mo[k] = laneOff(e, MED, st[k]);
  }
  e.st = st;
  e.lo = lo;
  e.mo = mo;
}

/**
 * 선 읽기(tools/road/read.ts)는 옆 거리를 그 자리 OSM 가운데선 마디에 직각인 단면으로 잰다. 차(headingNear)는 옆 거리의 절반(최대 8m) 앞뒤 점으로 구한 방향에
 * 직각으로 옮기므로, 꺾인 마디 둘레에서 같은 옆 거리가 칠한 칸에서 1~2m 벗어난 자리가 된다. 읽은 자리(칠한 칸 가운데)에 차가 서도록 옆 거리를 차의 방향으로 다시 잰다
 */
function reproject(e: Edge) {
  const O = [0, 0, 0];
  const fix = (s: number, off: number) => {
    const seg = pointAt(e.p, e.cum, s, O);
    const L = e.cum[seg + 1] - e.cum[seg] || 1;
    const ux = (e.p[seg * 3 + 3] - e.p[seg * 3]) / L;
    const uz = (e.p[seg * 3 + 5] - e.p[seg * 3 + 2]) / L;
    // 읽은 자리
    const rx = -uz * off;
    const rz = ux * off;
    let o = off;
    for (let it = 0; it < 4; it++) {
      const h = headingNear(e, s, o);
      o = rx * -Math.sin(h) + rz * Math.cos(h);
    }
    return o;
  };
  const n = e.lanes;
  for (let k = 0; k < e.st.length; k++) {
    for (let l = 0; l < n; l++) e.lo[k * n + l] = fix(e.st[k], e.lo[k * n + l]);
    if (e.med) e.mo[k] = fix(e.st[k], e.mo[k]);
  }
}

/** 같은 차로가 이어지는 구간 줄: 갈림 없는 이음매(꺾임 15° 안, 차가 옆 거리로 넘어가는 이음매 — 더 꺾인 이음매는 차가 이음매 곡선으로 돈다)로 이어지고 차로 수·중앙버스차로가 같은 구간들 */
interface Chain {
  edges: number[];
  /** 단면마다 줄 위 거리와 [구간, 단면] */
  gs: number[];
  ref: [number, number][];
}
function chainsOf(edges: Edge[], prev: number[][], X: Intersections): Chain[] {
  // 교차로 묶음 안 이음매에서는 줄을 끊는다(그 둘레 차로를 옮겨 맞추지 않는다)
  const nextOf = edges.map((a) => (a.next.length === 1 && sameLaneSeam(a, edges[a.next[0]], prev) && X.jEnd[a.id] < 0 ? a.next[0] : -1));
  const hasPrev = new Uint8Array(edges.length);
  for (const n of nextOf) if (n >= 0) hasPrev[n] = 1;
  const seen = new Uint8Array(edges.length);
  const out: Chain[] = [];
  const walk = (start: number) => {
    const c: Chain = { edges: [], gs: [], ref: [] };
    let base = 0;
    for (let id = start; id >= 0 && !seen[id]; id = nextOf[id]) {
      seen[id] = 1;
      const e = edges[id];
      c.edges.push(id);
      for (let k = 0; k < e.st.length; k++) c.gs.push(base + e.st[k]), c.ref.push([id, k]);
      base += e.len;
    }
    out.push(c);
  };
  for (const e of edges) if (!hasPrev[e.id]) walk(e.id);
  for (const e of edges) if (!seen[e.id]) walk(e.id); // 고리
  return out;
}

/** 줄 위 값 v 를 앞뒤 기울기 SLOPE 안으로 퍼뜨린 가장 큰 값(밀어야 할 양이 한 자리에서 계단이 되지 않게) */
function spread(gs: number[], v: Float32Array): Float32Array {
  const out = Float32Array.from(v);
  for (let k = 1; k < gs.length; k++) out[k] = Math.max(out[k], out[k - 1] - SLOPE * (gs[k] - gs[k - 1]));
  for (let k = gs.length - 2; k >= 0; k--) out[k] = Math.max(out[k], out[k + 1] - SLOPE * (gs[k + 1] - gs[k]));
  return out;
}

/** 단면 k 의 가장 왼쪽 차로(중앙버스차로가 있으면 그것)를 c 만큼 오른쪽으로 밀고, 오른쪽 차로는 간격을 지키는 만큼만 따라 민다.
 *  맨 오른쪽 차로 띠가 연석(limit: 차로 가운데가 갈 수 있는 가장 오른쪽 옆 거리)을 넘지 않는 데까지만 민다 */
function pushRight(e: Edge, k: number, c: number, cap: number, limit: number) {
  const n = e.lanes;
  const lo = e.lo.slice(k * n, k * n + n);
  const mo = e.med ? e.mo[k] : 0;
  const after = (q: number) => {
    const out = Float32Array.from(lo);
    let m = mo;
    if (e.med) {
      m = mo + q;
      out[0] = Math.max(out[0], m + (lo[0] - mo));
    } else out[0] += q;
    for (let l = 1; l < n; l++) out[l] = Math.max(out[l], out[l - 1] + LANE_GAP);
    return { out, m };
  };
  c = Math.min(c, cap);
  if (after(c).out[n - 1] > Math.max(limit, lo[n - 1])) {
    let a = 0;
    let b = c;
    for (let it = 0; it < 10; it++) {
      const q = (a + b) / 2;
      if (after(q).out[n - 1] > Math.max(limit, lo[n - 1])) b = q;
      else a = q;
    }
    c = a;
  }
  if (c <= 0.001) return;
  const r = after(c);
  e.lo.set(r.out, k * n);
  if (e.med) e.mo[k] = r.m;
}

/** 차로 가운데 점들: [구간, 단면, 차로(MED 포함), x, y, z, 방향] */
function lanePoints(edges: Edge[]) {
  const out: number[] = [];
  const P = [0, 0, 0];
  for (const e of edges)
    for (let k = 0; k < e.st.length; k++) {
      pointAt(e.p, e.cum, e.st[k], P);
      for (const l of e.med ? [MED, ...Array.from({ length: e.lanes }, (_, q) => q)] : Array.from({ length: e.lanes }, (_, q) => q)) {
        const off = laneOff(e, l, e.st[k]);
        const h = headingNear(e, e.st[k], off);
        out.push(e.id, k, l, P[0] - Math.sin(h) * off, P[1], P[2] + Math.cos(h) * off, h);
      }
    }
  return out;
}

/**
 * 반대 방향 차로 포개짐: 높이 2.5m 안, 방향이 140° 넘게 다른 두 차로 가운데가 gap 보다 가깝다. 교차로 노드(셋 넘게 만나는 노드) 3m 안은 보지 않는다(교차로 안은 차로 경로가 맡는다).
 * 돌려주는 것: [구간 a, 단면 a, 구간 b, 단면 b, 사이, 가장 왼쪽 차로가 오른쪽으로 더 가야 할 거리(a 기준), b 의 가운데선이 a 의 가운데선 오른쪽으로 떨어진 거리] 7개씩
 */
export function oppositeClashes(edges: Edge[], prev: number[][], gap: number, skip?: (e: Edge, s: number) => boolean): number[] {
  const pts = lanePoints(edges);
  const C = 4;
  const grid = new Map<number, number[]>();
  for (let o = 0; o < pts.length; o += 7) {
    const c = Math.floor(pts[o + 3] / C) * 100003 + Math.floor(pts[o + 5] / C);
    (grid.get(c) ?? grid.set(c, []).get(c)!).push(o);
  }
  const busyEnd = (e: Edge, start: boolean) => (start ? prev[e.id].length : e.next.length) > 1;
  const nearNode = (e: Edge, k: number) => (e.st[k] < 3 && busyEnd(e, true)) || (e.st[k] > e.len - 3 && busyEnd(e, false));
  const ends = (e: Edge) => [e.p[0], e.p[2], e.p[e.p.length - 3], e.p[e.p.length - 1]];
  const meet = (a: Edge, b: Edge, x: number, z: number) => {
    const A = ends(a);
    const B = ends(b);
    for (let i = 0; i < 4; i += 2)
      for (let j = 0; j < 4; j += 2) if (Math.abs(A[i] - B[j]) < 0.05 && Math.abs(A[i + 1] - B[j + 1]) < 0.05 && Math.hypot(x - A[i], z - A[i + 1]) < 15) return true;
    return false;
  };
  const CA = [0, 0, 0];
  const CB = [0, 0, 0];
  const crossMemo = new Map<number, number[]>();
  const crossNear = (a: Edge, b: Edge, x: number, z: number) => {
    const key = Math.min(a.id, b.id) * 100003 + Math.max(a.id, b.id);
    let hits = crossMemo.get(key);
    if (!hits) {
      hits = [];
      for (let i = 0; i + 5 < a.p.length; i += 3)
        for (let j = 0; j + 5 < b.p.length; j += 3) {
          const [ax, az, bx, bz] = [a.p[i], a.p[i + 2], a.p[i + 3], a.p[i + 5]];
          const [cx, cz, dx, dz] = [b.p[j], b.p[j + 2], b.p[j + 3], b.p[j + 5]];
          const den = (bx - ax) * (dz - cz) - (bz - az) * (dx - cx);
          if (Math.abs(den) < 1e-9) continue;
          const t = ((cx - ax) * (dz - cz) - (cz - az) * (dx - cx)) / den;
          const u = ((cx - ax) * (bz - az) - (cz - az) * (bx - ax)) / den;
          if (t >= 0 && t <= 1 && u >= 0 && u <= 1) hits.push(ax + (bx - ax) * t, az + (bz - az) * t);
        }
      crossMemo.set(key, hits);
    }
    for (let k = 0; k < hits.length; k += 2) if (Math.hypot(hits[k] - x, hits[k + 1] - z) < 25) return true;
    return false;
  };
  const out: number[] = [];
  for (let o = 0; o < pts.length; o += 7) {
    const ea = edges[pts[o]];
    const ka = pts[o + 1];
    if (nearNode(ea, ka) || skip?.(ea, ea.st[ka])) continue;
    const h = pts[o + 6];
    const gx = Math.floor(pts[o + 3] / C);
    const gz = Math.floor(pts[o + 5] / C);
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++)
        for (const q of grid.get((gx + dx) * 100003 + gz + dz) ?? []) {
          if (pts[q] === pts[o] || Math.cos(pts[q + 6] - h) > -0.77 || Math.abs(pts[q + 4] - pts[o + 4]) > 2.5) continue;
          const d = Math.hypot(pts[q + 3] - pts[o + 3], pts[q + 5] - pts[o + 5]);
          if (d >= gap) continue;
          const eb = edges[pts[q]];
          if (nearNode(eb, pts[q + 1]) || skip?.(eb, eb.st[pts[q + 1]])) continue;
          // 같은 교차로 노드로 모이는 두 구간은 노드 15m 안에서 차로가 모인다(갈래 길 끝). 그 안은 교차로 경로가 맡는다
          if (meet(ea, eb, pts[o + 3], pts[o + 5])) continue;
          // 가운데선끼리 가로지르는 두 길(노드 없이 비스듬히 엇갈리는 OSM 길)은 차로도 엇갈린다. 차로를 옮겨 풀 수 없고 차는 몸통 겹침 막기로 비킨다
          if (crossNear(ea, eb, pts[o + 3], pts[o + 5])) continue;
          // b 의 차로 가운데가 a 의 가운데선에서 오른쪽으로 떨어진 거리와 a 의 가장 왼쪽 차로 옆 거리
          const offA = laneOff(ea, pts[o + 2], ea.st[ka]);
          const lat = (pts[q + 3] - pts[o + 3]) * -Math.sin(h) + (pts[q + 5] - pts[o + 5]) * Math.cos(h) + offA;
          const inner = laneOff(ea, ea.med ? MED : 0, ea.st[ka]);
          // b 의 가운데선이 a 의 가운데선에서 오른쪽으로 떨어진 거리
          pointAt(ea.p, ea.cum, ea.st[ka], CA);
          pointAt(eb.p, eb.cum, eb.st[pts[q + 1]], CB);
          const side = (CB[0] - CA[0]) * -Math.sin(h) + (CB[2] - CA[2]) * Math.cos(h);
          out.push(ea.id, ka, eb.id, pts[q + 1], d, gap - (inner - lat), side);
        }
  }
  return out;
}

/** 갈림 없이 이어지는 두 구간(a 의 다음이 b 하나, b 로 들어오는 것이 a 하나, 꺾임 15° 안 — 차가 옆 거리로 넘어가는 이음매, 차로 수·중앙버스차로가 같다)의 이음매 차로 어긋남(m, 차로마다 가장 큰 값) */
export function seamGaps(edges: Edge[], prev: number[][]): [number, number, number][] {
  const out: [number, number, number][] = [];
  const P = [0, 0, 0];
  const Q = [0, 0, 0];
  for (const a of edges) {
    if (a.next.length !== 1 || !sameLaneSeam(a, edges[a.next[0]], prev)) continue;
    const b = edges[a.next[0]];
    let worst = 0;
    for (const l of a.med ? [MED, ...Array.from({ length: a.lanes }, (_, q) => q)] : Array.from({ length: a.lanes }, (_, q) => q)) {
      lanePoint(a, l, a.len, P);
      lanePoint(b, l, 0, Q);
      worst = Math.max(worst, Math.hypot(P[0] - Q[0], P[2] - Q[2]));
    }
    out.push([a.id, b.id, worst]);
  }
  return out;
}

/**
 * 중앙선 넘김: 상자 밖 양방향 길 구간의 차로 가운데를 4m 마다 짚어(차가 서는 자리와 같은 식), 진행 방향과 나란한(25° 안) 칠한 황색 중앙선(서울시 001)이
 * 그 점 오른쪽 0.3~3.5m 에 있으면 그 차로가 중앙선 왼쪽(마주 오는 쪽)에 있다. [x, z, 구간, 차로] 4개씩
 */
export function centreCrossings(edges: Edge[], lines: { k: number; p: ArrayLike<number> }[]): number[] {
  const CELL = 10;
  const grid = new Map<number, number[]>();
  const ck = (cx: number, cz: number) => (cx + 1000) * 2000 + cz + 1000;
  const segs: number[] = [];
  for (const l of lines) {
    if (l.k !== 1) continue;
    for (let k = 0; k + 5 < l.p.length; k += 3) {
      const id = segs.length / 4;
      segs.push(l.p[k], l.p[k + 2], l.p[k + 3], l.p[k + 5]);
      for (let cx = Math.floor((Math.min(l.p[k], l.p[k + 3]) - 4) / CELL); cx <= Math.floor((Math.max(l.p[k], l.p[k + 3]) + 4) / CELL); cx++)
        for (let cz = Math.floor((Math.min(l.p[k + 2], l.p[k + 5]) - 4) / CELL); cz <= Math.floor((Math.max(l.p[k + 2], l.p[k + 5]) + 4) / CELL); cz++)
          (grid.get(ck(cx, cz)) ?? grid.set(ck(cx, cz), []).get(ck(cx, cz))!).push(id);
    }
  }
  const PAR = Math.cos((25 * Math.PI) / 180);
  const two = new Map<number, number>();
  for (const e of edges) two.set(e.road, (two.get(e.road) ?? 0) | (e.rev ? 2 : 1));
  const out: number[] = [];
  const P = [0, 0, 0];
  for (const e of edges) {
    if (two.get(e.road) !== 3) continue;
    for (let s = 2; s <= e.len - 2; s += 4)
      for (let l = 0; l < e.lanes; l++) {
        lanePoint(e, l, s, P);
        const h = headingNear(e, s, laneOff(e, l, s));
        const ux = Math.cos(h);
        const uz = Math.sin(h);
        for (const id of grid.get(ck(Math.floor(P[0] / CELL), Math.floor(P[2] / CELL))) ?? []) {
          const [ax, az, bx, bz] = [segs[id * 4], segs[id * 4 + 1], segs[id * 4 + 2], segs[id * 4 + 3]];
          const L = Math.hypot(bx - ax, bz - az) || 1;
          const tx = (bx - ax) / L;
          const tz = (bz - az) / L;
          if (Math.abs(tx * ux + tz * uz) < PAR) continue;
          const t = ((P[0] - ax) * tx + (P[2] - az) * tz) / L;
          if (t < 0 || t > 1) continue;
          const side = (ax + (bx - ax) * t - P[0]) * -uz + (az + (bz - az) * t - P[2]) * ux;
          if (side > 0.3 && side < 3.5) {
            out.push(P[0], P[2], e.id, l);
            break;
          }
        }
      }
  }
  return out;
}

/** 구간 e 의 s 자리가 교차로 상자 둘레(상자 가장자리에서 FREEZE 안, 또는 교차로 안 구간)인가: 정본 제약이 차로를 옮기지 않는 곳 */
export function junctionZone(X: Intersections, e: Edge, s: number): boolean {
  if (X.jStart[e.id] >= 0 && X.jStart[e.id] === X.jEnd[e.id]) return true;
  return (X.jStart[e.id] >= 0 && s < X.rOut[e.id] + FREEZE) || (X.jEnd[e.id] >= 0 && s > e.len - X.rIn[e.id] - FREEZE);
}

/** 구간 e 의 s 자리 l번 차로 가운데(차가 서는 자리와 같은 식) */
export function lanePoint(e: Edge, l: number, s: number, out: number[]) {
  pointAt(e.p, e.cum, s, out);
  const off = laneOff(e, l, s);
  const h = headingNear(e, s, off);
  out[0] -= Math.sin(h) * off;
  out[2] += Math.cos(h) * off;
  return out;
}

function canonConstraints(edges: Edge[], prev: number[][], roads: Road[], painted: Uint8Array, X: Intersections) {
  const log = (globalThis as { ROAD_LOG?: (m: string) => void }).ROAD_LOG;
  const curbLeft = (e: Edge, sv: number) => {
    const r = roads[e.road];
    const sr = e.rev ? e.full - (e.s0 + sv) : e.s0 + sv;
    return e.rev ? curbAt(r, sr, 1) : curbAt(r, sr, -1);
  };
  /** 구간 e 의 s 자리 진행 방향 오른쪽 연석이 가운데선에서 떨어진 거리(판의 연석선, 없으면 차로 수로 어림) */
  const curbRight = (e: Edge, sv: number) => {
    const r = roads[e.road];
    const sr = e.rev ? e.full - (e.s0 + sv) : e.s0 + sv;
    return e.rev ? curbAt(r, sr, -1) : curbAt(r, sr, 1);
  };
  for (const e of edges) densify(e);
  // 교차로 상자 둘레(상자 가장자리에서 FREEZE 안, 교차로 안 구간 전체)는 차로를 옮기지 않는다: 교차로 차로 경로·정지 자리·횡단보도 지키기가
  // 그 자리 차로 끝에서 시작한다. 둘레 밖에서는 둘레까지 거리 × 기울기 한도만큼만 옮긴다
  const cap = edges.map((e) => {
    const c = new Float32Array(e.st.length).fill(Infinity);
    const inner = X.jStart[e.id] >= 0 && X.jStart[e.id] === X.jEnd[e.id];
    for (let k = 0; k < e.st.length; k++) {
      const s0 = X.jStart[e.id] >= 0 ? e.st[k] - (X.rOut[e.id] + FREEZE) : Infinity;
      const s1 = X.jEnd[e.id] >= 0 ? e.len - X.rIn[e.id] - FREEZE - e.st[k] : Infinity;
      c[k] = inner ? 0 : Math.max(0, Math.min(s0, s1)) * SLOPE;
    }
    return c;
  });
  const orig = edges.map((e) => ({ lo: Float32Array.from(e.lo), mo: Float32Array.from(e.mo) }));
  const clampAll = () => {
    for (const e of edges) {
      const c = cap[e.id];
      const o = orig[e.id];
      for (let k = 0; k < e.st.length; k++) {
        if (c[k] === Infinity) continue;
        for (let l = 0; l < e.lanes; l++) e.lo[k * e.lanes + l] = o.lo[k * e.lanes + l] + Math.max(-c[k], Math.min(c[k], e.lo[k * e.lanes + l] - o.lo[k * e.lanes + l]));
        if (e.med) e.mo[k] = o.mo[k] + Math.max(-c[k], Math.min(c[k], e.mo[k] - o.mo[k]));
      }
    }
  };
  for (const e of edges) if (!e.plain) reproject(e);
  clampAll();
  // 차로 띠는 찻길 안(연석 안)에 있다: 칠한 선으로 읽지 않은 구간(이어받거나 고르게 나눈 차로)에서 맨 오른쪽 차로 띠가 연석을 0.5m 넘게 넘은 단면은 넘은 만큼 모든 차로를 왼쪽으로 옮긴다(이어받기로 다른 조각의 자리를 잘못 받은 곳,
  // 월드컵로 −572,−35 역방향은 7.5m 를 받아 연석 밖을 달렸다). 왼쪽은 양방향 길이면 가운데선, 한 방향 길이면 왼쪽 연석을 넘지 않는다. 교차로 둘레도 고친다(잘못된 자리라)
  // 양방향 길은 같은 조각 다른 방향을 칠한 선으로 읽었으면 그 가장 왼쪽 차로에서 OPP_GAP 안으로 옮기지 않는다: OSM 가운데선이 실제 길 가운데에서 3m 쯤 벗어난 곳(망원로 −1263,−643)은
  // 다른 방향을 칠한 선으로 읽으면 그 차로가 가운데선 이쪽에 있고, 연석 자료(가운데선 기준 어림)대로 옮기면 이 방향 차로가 중앙선을 넘어 다른 방향에 포개졌다(재작업 W27)
  const byRoad = new Map<number, Edge[]>();
  for (const e of edges) (byRoad.get(e.road) ?? byRoad.set(e.road, []).get(e.road)!).push(e);
  const oppInner = (e: Edge, sv: number) => {
    const at = e.full - (e.s0 + sv);
    const o = byRoad.get(e.road)!.find((q) => q.rev !== e.rev && at >= q.s0 - 0.01 && at <= q.s0 + q.len + 0.01);
    return o && painted[o.id] === 1 ? -laneOff(o, o.med ? MED : 0, Math.min(o.len, Math.max(0, at - o.s0))) : -Infinity;
  };
  {
    let moved = 0;
    for (const e of edges) {
      if (painted[e.id]) continue; // 칠한 선으로 읽은 차로는 그 자리가 정본(연석 자료가 더 어림이다)
      const r = roads[e.road];
      const n = e.lanes;
      const v = new Float32Array(e.st.length);
      for (let k = 0; k < e.st.length; k++) {
        const over = e.lo[k * n + n - 1] + CURB_HALF - curbRight(e, e.st[k]);
        if (over <= 0.5) continue;
        const leftMin = r.oneway ? -curbLeft(e, e.st[k]) + CURB_HALF : Math.max(CURB_HALF, oppInner(e, e.st[k]) + OPP_GAP);
        v[k] = Math.max(0, Math.min(over, (e.med ? e.mo[k] : e.lo[k * n]) - leftMin));
      }
      if (!v.some((x) => x > 0)) continue;
      const sp = spread(Array.from(e.st), v);
      for (let k = 0; k < e.st.length; k++) {
        if (sp[k] <= 0) continue;
        for (let l = 0; l < n; l++) e.lo[k * n + l] -= sp[k];
        if (e.med) e.mo[k] -= sp[k];
        orig[e.id].lo.set(e.lo.subarray(k * n, k * n + n), k * n);
        if (e.med) orig[e.id].mo[k] = e.mo[k];
      }
      moved++;
    }
    log?.(`curb: moved ${moved} edges`);
  }
  const chains = chainsOf(edges, prev, X);
  const inner0 = new Map(edges.map((e) => [e.id, Float32Array.from(e.st, (_, k) => (e.med ? e.mo[k] : e.lo[k * e.lanes]))]));
  for (let it = 0; it < 20 && stitch(edges, chains) > 0.02; it++) clampAll();
  clampAll();
  for (let round = 0; round < 16; round++) {
    // ① 반대 방향 포개짐: 둘 다 같은 종류면 반씩, 한쪽만 서울시 선으로 읽은 차로면 읽지 않은 쪽이 다 비킨다. 밀 양은 같은 차로 줄을 따라 퍼뜨린다
    const cl = oppositeClashes(edges, prev, OPP_GAP);
    const need = new Map<number, Float32Array>();
    for (let o = 0; o < cl.length; o += 7) {
      const a = edges[cl[o]];
      const b = edges[cl[o + 2]];
      const w = a.plain === b.plain ? 0.5 : a.plain ? 1 : 0;
      // b 의 가운데선이 a 의 가운데선 오른쪽에 있으면(마주 오는 찻길이 왼쪽에 있는 꼴이 아니면) 오른쪽으로 밀어도 벌어지지 않는다
      if (!w || cl[o + 6] > 0.5) continue;
      const v = need.get(a.id) ?? need.set(a.id, new Float32Array(a.st.length)).get(a.id)!;
      v[cl[o + 1]] = Math.max(v[cl[o + 1]], Math.min(4, cl[o + 5] * w + 0.05));
    }
    for (const c of chains) {
      if (!c.edges.some((id) => need.has(id))) continue;
      const v = Float32Array.from(c.ref, ([id, k]) => need.get(id)?.[k] ?? 0);
      const sp = spread(c.gs, v);
      c.ref.forEach(([id, k], j) => {
        const e = edges[id];
        // 처음 읽은 자리에서 MAX_PUSH 넘게 밀지 않고, 맨 오른쪽 차로 띠가 연석을 넘지 않게
        if (sp[j] > 0) pushRight(e, k, sp[j], inner0.get(id)![k] + MAX_PUSH - (e.med ? e.mo[k] : e.lo[k * e.lanes]), curbRight(e, e.st[k]) - CURB_HALF);
      });
    }
    clampAll();
    // ② 이음매: 같은 차로 줄 안 이음매마다 두 끝 차로 가운데를 가운데 자리로 모은다
    let worst = 0;
    for (let it = 0; it < 20; it++) {
      worst = stitch(edges, chains);
      clampAll();
      if (worst < 0.02) break;
    }
    log?.(`round ${round}: clashes ${cl.length / 7} edges pushed ${need.size} seam worst ${worst.toFixed(2)}`);
    if (!need.size && worst < 0.05) break;
  }
  for (const e of edges) simplifyTable(e);
}

/** 같은 차로 줄 안 이음매마다 두 구간 끝 차로 가운데를 가운데 자리로: 앞 구간 쪽 고친 양은 줄을 거슬러, 뒤 구간 쪽은 줄을 따라 기울기 한도로 퍼뜨린다(모두 같은 자리에서 잰 값으로 한꺼번에). 고치기 전 가장 큰 어긋남을 돌려준다 */
function stitch(edges: Edge[], chains: Chain[]): number {
  let worst = 0;
  const P = [0, 0, 0];
  const Q = [0, 0, 0];
  const O = [0, 0, 0];
  for (const c of chains) {
    if (c.edges.length < 2) continue;
    const e0 = edges[c.edges[0]];
    const lanesL = e0.med ? [MED, ...Array.from({ length: e0.lanes }, (_, q) => q)] : Array.from({ length: e0.lanes }, (_, q) => q);
    const add = lanesL.map(() => new Float32Array(c.gs.length));
    let first = 0;
    for (let i = 0; i + 1 < c.edges.length; i++) {
      const a = edges[c.edges[i]];
      const b = edges[c.edges[i + 1]];
      first += a.st.length; // b 의 첫 단면 자리
      const S = c.gs[first];
      lanesL.forEach((l, li) => {
        lanePoint(a, l, a.len, P);
        lanePoint(b, l, 0, Q);
        const g = Math.hypot(P[0] - Q[0], P[2] - Q[2]);
        // STITCH_MAX 넘게 어긋난 이음매는 차로 자리가 아니라 차로 나눔이 다른 곳(칠한 선을 다르게 읽은 두 조각)이라 옮겨 맞추지 않는다.
        // 차는 차로 잇기 표(nearMap)대로 옮겨 간다
        if (g > STITCH_MAX) return;
        worst = Math.max(worst, g);
        if (g < 0.01) return;
        // 짧은 구간 쪽이 더 많이 움직인다(길게 읽은 차로를 짧은 조각에 끌려가지 않게)
        const wa = b.len / (a.len + b.len);
        const tx = P[0] + (Q[0] - P[0]) * wa;
        const tz = P[2] + (Q[2] - P[2]) * wa;
        for (const [e, s, fwd] of [[a, a.len, false], [b, 0, true]] as const) {
          pointAt(e.p, e.cum, s, O);
          const off = laneOff(e, l, s);
          const h = headingNear(e, s, off);
          const d = (tx - O[0]) * -Math.sin(h) + (tz - O[2]) * Math.cos(h) - off;
          for (let j = fwd ? first : first - 1; fwd ? j < c.gs.length : j >= 0; j += fwd ? 1 : -1) {
            const f = 1 - (Math.abs(c.gs[j] - S) * SLOPE) / Math.max(1e-3, Math.abs(d));
            if (f <= 0) break;
            add[li][j] += d * f;
          }
        }
      });
    }
    c.ref.forEach(([id, k], j) => {
      const e = edges[id];
      lanesL.forEach((l, li) => {
        if (l === MED) e.mo[k] += add[li][j];
        else e.lo[k * e.lanes + l] += add[li][j];
      });
      for (let l = 1; l < e.lanes; l++) e.lo[k * e.lanes + l] = Math.max(e.lo[k * e.lanes + l], e.lo[k * e.lanes + l - 1] + LANE_GAP);
      if (e.med) e.mo[k] = Math.min(e.mo[k], e.lo[k * e.lanes] - MED_GAP);
    });
  }
  return worst;
}

/** 앞뒤 단면 사이 직선으로 0.03m 안에 드는 단면을 지운다(구간 끝 단면은 남긴다) */
function simplifyTable(e: Edge) {
  const m = e.st.length;
  const n = e.lanes;
  const keep = new Uint8Array(m);
  keep[0] = keep[m - 1] = 1;
  const rec = (a: number, b: number) => {
    let worst = 0;
    let at = -1;
    for (let i = a + 1; i < b; i++) {
      const u = (e.st[i] - e.st[a]) / (e.st[b] - e.st[a] || 1);
      let d = 0;
      for (let l = 0; l < n; l++) d = Math.max(d, Math.abs(e.lo[i * n + l] - (e.lo[a * n + l] + (e.lo[b * n + l] - e.lo[a * n + l]) * u)));
      if (e.mo.length) d = Math.max(d, Math.abs(e.mo[i] - (e.mo[a] + (e.mo[b] - e.mo[a]) * u)));
      if (d > worst) (worst = d), (at = i);
    }
    if (at >= 0 && worst > 0.03) {
      keep[at] = 1;
      rec(a, at);
      rec(at, b);
    }
  };
  if (m > 2) rec(0, m - 1);
  const idx = Array.from({ length: m }, (_, i) => i).filter((i) => keep[i]);
  e.st = Float32Array.from(idx, (i) => e.st[i]);
  e.lo = Float32Array.from(idx.flatMap((i) => Array.from(e.lo.subarray(i * n, i * n + n))));
  if (e.mo.length) e.mo = Float32Array.from(idx, (i) => e.mo[i]);
}
