// 차로 정하기(길 정본의 차로, 설계 문서 51절). 굽기(tools/road.ts)가 부르고, 정본 없이 차 그래프를 만들 때(시험의 만든 길)도 같은 함수로 정한다.
// 서울시 선으로 읽은 방향별 차로(tools/road/read.ts)에서 시작해 ① 선 없는 방향 채우기(이음매 이어받기, 양방향 길은 다른 방향 가장자리 너머)
// ② 중앙버스차로 잇기와 자리 ③ 마주 오는 한 방향 찻길 떼어 놓기를 한 뒤 구간마다 최종 차로 표를 돌려준다(W22 까지 graph.ts 가 실행 중에 하던 손질을 굽기로 옮김).
// 실행 중 차 그래프(graph.ts)는 이 표를 고치지 않고 쓴다.
import type { Road } from '../data/board.ts';
import type { CanonLanes, DirLanes, RoadLanes, Run } from '../data/road.ts';
import { cumLen, headingAt, pointAt } from '../poly.ts';
import { BODY_HW, BUS_HW } from './bodies.ts';
import { carRoad, headingNear, laneOff, laneWidth, leftEdge, linkEdges, makeEdges, medAt, sinkTunnels, type Edge } from './graph.ts';

/** 서울시 선이 없는 방향: 지금까지처럼 OSM 가운데선에서 차로 수 × 차로 폭으로 펼친다(양방향 길은 가운데선 오른쪽, 한 방향 길은 가운데선을 가운데로) */
function plainDir(r: Road, rev: boolean, len: number): DirLanes {
  const n = Math.max(1, rev ? r.lb : r.lf);
  const left = r.oneway ? (-n * r.lw) / 2 : 0;
  const off = Array.from({ length: n }, (_, l) => left + (l + 0.5) * r.lw);
  return { read: false, a: -1, b: -1, runs: [{ s0: 0, s1: len, n, st: [0], off, med: [] }] };
}

/** 분리대 폭 gap 인 한 방향 큰길에서 일반 차로 왼쪽 가장자리부터 중앙버스차로 가운데까지(m). 서울시 선으로 읽지 못한 곳에 쓴다 */
const medOff = (gap: number) => 0.5 + Math.max(1.4, Math.min(1.75, gap / 4));

/** 정본 차로를 정한다. read: 서울시 선으로 읽은 방향별 차로(없는 방향은 찻길 폭을 고르게 나눈다) */
export function resolveLanes(roads: Road[], read?: RoadLanes): CanonLanes {
  const dirs: RoadLanes = roads.map((r, i) => {
    if (!carRoad(r)) return null;
    const full = cumLen(r.p)[r.p.length / 3 - 1];
    const f = read?.[i]?.[0];
    const b = read?.[i]?.[1];
    return [f ? { ...f, read: true } : plainDir(r, false, full), r.oneway ? null : b ? { ...b, read: true } : plainDir(r, true, full)];
  });
  const edges = makeEdges(roads, dirs);
  const prev = linkEdges(edges);
  inheritLanes(edges, prev, roads);
  sinkTunnels(edges, prev, roads);
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
      medv: e.med,
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
function inheritLanes(edges: Edge[], prev: number[][], roads: Road[]) {
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
