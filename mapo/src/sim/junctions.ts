// 교차로. 노드마다 둘레에 상자를 두고, 상자 안에서 차는 들어온 차로와 나갈 차로를 잇는 곡선을 따라간다.
// 중앙분리대가 있는 큰길은 한 교차로가 노드 여러 개로 나뉘므로, 상자가 서로 2m 안으로 붙는 노드들을 한 교차로로 묶는다.
// 차는 교차로에 들어오는 구간(진입 구간)에 올라서면 교차로를 빠져나갈 때까지의 경로를 미리 정하고(cars.ts),
// 경로끼리 곡선이 2.2m 안으로 다가오거나, 같은 진입 구간에서 다른 쪽으로 나가거나, 같은 구간을 함께 쓰면 '부딪는 경로'로 본다.
// 차는 부딪는 경로로 교차로에 들어간 차가 있으면 진입 구간 끝의 상자 앞에서 기다린다.
import { pointAt } from '../poly.ts';
import { LANE, type Edge } from './graph.ts';

const nodeKey = (x: number, z: number) => `${Math.round(x * 10)},${Math.round(z * 10)}`;

/** 길 가운데선에서 길 가장자리까지(m) */
const halfWidth = (e: Edge) => (e.off0 > 0 ? e.lanes * LANE : (e.lanes * LANE) / 2);

export interface Junctions {
  /** 구간 id → 그 구간 끝 노드가 속한 교차로 번호(갈림이 없는 노드면 −1) */
  groupOfEnd: Int32Array;
  /** 구간 id → 그 구간 시작 노드가 속한 교차로 번호 */
  groupOfStart: Int32Array;
  /** 구간 id → 끝 쪽 상자 가장자리까지 거리(m). 정지선은 이 앞이다 */
  rIn: Float32Array;
  /** 구간 id → 시작 쪽 상자 가장자리까지 거리(m) */
  rOut: Float32Array;
  count: number;
  /** 구간 열(진입 구간부터 나가는 구간까지)을 경로 번호로 바꾼다 */
  pathId(path: ArrayLike<number>, n: number): number;
  /** 두 경로가 부딪는가 */
  conflict(p1: number, p2: number): boolean;
  /** 상자 안 곡선 위의 점. a 의 la 차로에서 b 의 lb 차로로, 상자에 들어선 뒤 d(m) 간 자리를 out = [x, y, z, 방향]에 쓴다 */
  curve(a: Edge, b: Edge, la: number, lb: number, d: number, out: number[]): void;
}

export function makeJunctions(edges: Edge[]): Junctions {
  // 노드: 구간 끝점과 시작점
  const nodeIx = new Map<string, number>();
  const nodeXZ: number[][] = [];
  const nodeOf = (x: number, z: number) => {
    const k = nodeKey(x, z);
    let n = nodeIx.get(k);
    if (n === undefined) {
      n = nodeXZ.length;
      nodeIx.set(k, n);
      nodeXZ.push([x, z]);
    }
    return n;
  };
  const P0 = [0, 0, 0];
  const endNode = edges.map((e) => nodeOf(e.p[e.p.length - 3], e.p[e.p.length - 1]));
  const startNode = edges.map((e) => nodeOf(e.p[0], e.p[2]));
  const N = nodeXZ.length;
  const ins: number[][] = Array.from({ length: N }, () => []);
  const outs: number[][] = Array.from({ length: N }, () => []);
  edges.forEach((e) => {
    ins[endNode[e.id]].push(e.id);
    outs[startNode[e.id]].push(e.id);
  });
  // 노드마다 상자 크기: 만나는 길 가운데 가장 넓은 길의 절반 폭 + 1m.
  // 비스듬히 만나는 길은 노드에서 한참 떨어진 곳부터 차로가 겹치므로, 노드에서 거꾸로 짚어 가며
  // 다른 길과 차로가 겹치는 거리를 재서 그 구간의 상자를 늘린다(30m까지). 짧은 구간은 양 끝 상자가 겹치지 않게 줄인다
  const r = new Float32Array(N);
  for (let n = 0; n < N; n++) r[n] = Math.max(2, ...[...ins[n], ...outs[n]].map((i) => halfWidth(edges[i]))) + 1;
  const reach = new Float32Array(edges.length * 2); // [끝 쪽, 시작 쪽]
  /** 노드에서 구간 쪽으로 향하는 방향(끝 쪽이면 거슬러, 시작 쪽이면 따라) */
  const away = (e: Edge, end: number) => {
    const n = e.p.length;
    return end ? Math.atan2(e.p[n - 4] - e.p[n - 1], e.p[n - 6] - e.p[n - 3]) : Math.atan2(e.p[5] - e.p[2], e.p[3] - e.p[0]);
  };
  /** 들어오는 구간과 나가는 구간이 15° 안으로 나란하다: 중앙분리대 양쪽 찻길이라 서로 부딪지 않는다 */
  const alongside = (a: Edge, ea: number, b: Edge, eb: number) => Math.cos(away(a, ea) - away(b, eb)) > Math.cos(Math.PI / 12);
  const Q = [0, 0, 0];
  for (let n = 0; n < N; n++) {
    const list = [...ins[n].map((id) => ({ id, end: 1 })), ...outs[n].map((id) => ({ id, end: 0 }))];
    for (let a = 0; a < list.length; a++)
      for (let b = a + 1; b < list.length; b++) {
        const ea = edges[list[a].id];
        const eb = edges[list[b].id];
        if (ea.road === eb.road || (list[a].end !== list[b].end && alongside(ea, list[a].end, eb, list[b].end))) continue;
        const w = halfWidth(ea) + halfWidth(eb);
        let over = 0;
        for (let d = 1; d <= 30; d++) {
          pointAt(ea.p, ea.cum, list[a].end ? ea.len - d : d, P0);
          pointAt(eb.p, eb.cum, list[b].end ? eb.len - d : d, Q);
          if (Math.hypot(P0[0] - Q[0], P0[2] - Q[2]) < w - 0.5) over = d;
        }
        if (!over) continue;
        const ka = list[a].id * 2 + (list[a].end ? 0 : 1);
        const kb = list[b].id * 2 + (list[b].end ? 0 : 1);
        reach[ka] = Math.max(reach[ka], over + 1);
        reach[kb] = Math.max(reach[kb], over + 1);
      }
  }
  const rIn = new Float32Array(edges.length);
  const rOut = new Float32Array(edges.length);
  for (const e of edges) {
    rIn[e.id] = Math.min(Math.max(r[endNode[e.id]], reach[e.id * 2]), e.len * 0.45);
    rOut[e.id] = Math.min(Math.max(r[startNode[e.id]], reach[e.id * 2 + 1]), e.len * 0.45);
  }

  // 교차로 묶기: 갈림이 있는 노드(들어오는 구간이나 나가는 구간이 둘 이상)끼리 상자가 2m 안으로 붙으면 하나로
  const fork = (n: number) => ins[n].length >= 2 || outs[n].length >= 2;
  const parent = Array.from({ length: N }, (_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const cell = new Map<string, number[]>();
  for (let n = 0; n < N; n++) {
    if (!fork(n)) continue;
    const k = `${Math.floor(nodeXZ[n][0] / 30)},${Math.floor(nodeXZ[n][1] / 30)}`;
    (cell.get(k) ?? cell.set(k, []).get(k)!).push(n);
  }
  for (const [k, list] of cell) {
    const [cx, cz] = k.split(',').map(Number);
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++)
        for (const b of cell.get(`${cx + dx},${cz + dz}`) ?? [])
          for (const a of list)
            if (a < b && Math.hypot(nodeXZ[a][0] - nodeXZ[b][0], nodeXZ[a][1] - nodeXZ[b][1]) < r[a] + r[b] + 2) parent[find(a)] = find(b);
  }
  const groupIx = new Map<number, number>();
  const groupOfNode = new Int32Array(N).fill(-1);
  for (let n = 0; n < N; n++) {
    if (!fork(n)) continue;
    const root = find(n);
    let g = groupIx.get(root);
    if (g === undefined) groupIx.set(root, (g = groupIx.size));
    groupOfNode[n] = g;
  }
  // 갈림이 없는 노드라도 교차로 노드 상자 곁(2m 안)에 있으면 그 교차로에 넣는다. 아주 짧은 구간이 교차로 안 구간이 된다
  for (let n = 0; n < N; n++) {
    if (fork(n)) continue;
    const [cx, cz] = [Math.floor(nodeXZ[n][0] / 30), Math.floor(nodeXZ[n][1] / 30)];
    let best = -1;
    let bd = Infinity;
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++)
        for (const b of cell.get(`${cx + dx},${cz + dz}`) ?? []) {
          const d = Math.hypot(nodeXZ[n][0] - nodeXZ[b][0], nodeXZ[n][1] - nodeXZ[b][1]);
          if (d < r[n] + r[b] + 2 && d < bd) {
            bd = d;
            best = b;
          }
        }
    if (best >= 0) groupOfNode[n] = groupOfNode[best];
  }
  const groupOfEnd = Int32Array.from(endNode, (n) => groupOfNode[n]);
  const groupOfStart = Int32Array.from(startNode, (n) => groupOfNode[n]);
  // 노드 여러 개로 묶인 교차로: 진입 구간에서 기다리는 자리와 빠져나간 뒤 자리가 이웃 노드의 길과 겹치지 않을 때까지 상자를 늘린다
  const members = new Map<number, { e: Edge; end: number }[]>();
  for (const e of edges) {
    const gs = groupOfStart[e.id];
    const ge = groupOfEnd[e.id];
    if (ge >= 0) (members.get(ge) ?? members.set(ge, []).get(ge)!).push({ e, end: 1 });
    if (gs >= 0 && gs !== ge) (members.get(gs) ?? members.set(gs, []).get(gs)!).push({ e, end: 0 });
  }
  for (const list of members.values()) {
    if (new Set(list.map((m) => (m.end ? endNode[m.e.id] : startNode[m.e.id]))).size < 2) continue;
    for (const m of list) {
      const e = m.e;
      if (groupOfStart[e.id] === groupOfEnd[e.id]) continue; // 교차로 안 구간
      for (let d = Math.ceil(m.end ? rIn[e.id] : rOut[e.id]); d <= 30 && d < e.len * 0.45; d++) {
        pointAt(e.p, e.cum, m.end ? e.len - d : d, P0);
        let hit = false;
        for (const o of list) {
          if (o.e === e || o.e.road === e.road || (o.end !== m.end && alongside(e, m.end, o.e, o.end))) continue;
          const w = halfWidth(e) + halfWidth(o.e) - 0.5;
          for (let k = 0; !hit && k <= Math.min(o.e.len, 40); k += 1) {
            pointAt(o.e.p, o.e.cum, o.end ? o.e.len - k : k, Q);
            if (Math.hypot(P0[0] - Q[0], P0[2] - Q[2]) < w) hit = true;
          }
          if (hit) break;
        }
        if (!hit) break;
        if (m.end) rIn[e.id] = Math.min(d + 1, e.len * 0.45);
        else rOut[e.id] = Math.min(d + 1, e.len * 0.45);
      }
    }
  }

  const P = [0, 0, 0];
  /** 구간 e 의 s 지점에서 차로 중심(가운데선 오른쪽 off)으로 옮긴 점과 방향 */
  const lanePoint = (e: Edge, s: number, off: number) => {
    const seg = pointAt(e.p, e.cum, s, P);
    const a = seg * 3;
    const h = Math.atan2(e.p[a + 5] - e.p[a + 2], e.p[a + 3] - e.p[a]);
    return { x: P[0] - Math.sin(h) * off, y: P[1], z: P[2] + Math.cos(h) * off, h };
  };
  function curve(a: Edge, b: Edge, la: number, lb: number, d: number, out: number[]) {
    const p = lanePoint(a, a.len - rIn[a.id], a.off0 + la * LANE);
    const q = lanePoint(b, rOut[b.id], b.off0 + lb * LANE);
    // 3차 곡선: 들어온 방향으로 나가 나갈 방향으로 들어간다. 조절점을 두 끝 사이 거리의 1/3 만큼만 뻗으므로
    // 거의 나란히 합쳐지는 길에서도 곡선이 나갈 자리 너머로 튀어나가지 않는다
    const span = Math.hypot(q.x - p.x, q.z - p.z) / 3;
    const k1x = p.x + Math.cos(p.h) * span;
    const k1z = p.z + Math.sin(p.h) * span;
    const k2x = q.x - Math.cos(q.h) * span;
    const k2z = q.z - Math.sin(q.h) * span;
    const u = Math.max(0, Math.min(1, d / Math.max(0.1, rIn[a.id] + rOut[b.id])));
    const m = 1 - u;
    out[0] = m * m * m * p.x + 3 * m * m * u * k1x + 3 * m * u * u * k2x + u * u * u * q.x;
    out[1] = p.y + (q.y - p.y) * u;
    out[2] = m * m * m * p.z + 3 * m * m * u * k1z + 3 * m * u * u * k2z + u * u * u * q.z;
    const dx = 3 * m * m * (k1x - p.x) + 6 * m * u * (k2x - k1x) + 3 * u * u * (q.x - k2x);
    const dz = 3 * m * m * (k1z - p.z) + 6 * m * u * (k2z - k1z) + 3 * u * u * (q.z - k2z);
    out[3] = dx * dx + dz * dz > 1e-6 ? Math.atan2(dz, dx) : p.h;
  }

  // 경로: 진입 구간의 상자 앞부터 나가는 구간의 상자 끝까지 1m 간격으로 찍은 점(안쪽·바깥쪽 차로 두 벌)
  const paths: number[][] = [];
  const pathIx = new Map<string, number>();
  const pts: Float32Array[] = [];
  const box: number[][] = [];
  const pt = [0, 0, 0, 0];
  function sample(path: number[]) {
    const out: number[] = [];
    const first = edges[path[0]];
    for (const l0 of new Set([0, first.lanes - 1])) {
      let la = l0;
      for (let k = 0; k + 1 < path.length; k++) {
        const a = edges[path[k]];
        const b = edges[path[k + 1]];
        const lb = Math.min(la, b.lanes - 1);
        const len = rIn[a.id] + rOut[b.id];
        for (let d = 0; d <= len; d += 1) {
          curve(a, b, la, lb, d, pt);
          out.push(pt[0], pt[2]);
        }
        // 묶인 교차로 안의 구간: 두 상자 사이의 곧은 부분
        if (k + 2 < path.length)
          for (let s = rOut[b.id]; s < b.len - rIn[b.id]; s += 1) {
            const q = lanePoint(b, s, b.off0 + lb * LANE);
            out.push(q.x, q.z);
          }
        la = lb;
      }
    }
    return Float32Array.from(out);
  }
  function pathId(path: ArrayLike<number>, n: number) {
    const list = Array.from({ length: n }, (_, k) => path[k]);
    const key = list.join(',');
    let id = pathIx.get(key);
    if (id === undefined) {
      id = paths.length;
      pathIx.set(key, id);
      paths.push(list);
      const p = sample(list);
      pts.push(p);
      let x0 = Infinity;
      let z0 = Infinity;
      let x1 = -Infinity;
      let z1 = -Infinity;
      for (let k = 0; k < p.length; k += 2) {
        x0 = Math.min(x0, p[k]);
        x1 = Math.max(x1, p[k]);
        z0 = Math.min(z0, p[k + 1]);
        z1 = Math.max(z1, p[k + 1]);
      }
      box.push([x0, z0, x1, z1]);
    }
    return id;
  }
  const cache = new Map<number, boolean>();
  function conflict(p1: number, p2: number): boolean {
    if (p1 === p2) return false;
    const key = p1 < p2 ? p1 * 1e6 + p2 : p2 * 1e6 + p1;
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    const a = paths[p1];
    const b = paths[p2];
    let c = a[0] === b[0] || a[a.length - 1] === b[b.length - 1] || a.slice(1).some((e) => b.slice(1).includes(e));
    if (!c) {
      const A = box[p1];
      const B = box[p2];
      if (A[0] - 2.2 <= B[2] && B[0] - 2.2 <= A[2] && A[1] - 2.2 <= B[3] && B[1] - 2.2 <= A[3]) {
        const pa = pts[p1];
        const pb = pts[p2];
        for (let i = 0; !c && i < pa.length; i += 2)
          for (let k = 0; k < pb.length; k += 2)
            if (Math.abs(pa[i] - pb[k]) < 2.2 && Math.hypot(pa[i] - pb[k], pa[i + 1] - pb[k + 1]) < 2.2) {
              c = true;
              break;
            }
      }
    }
    cache.set(key, c);
    return c;
  }

  return { groupOfEnd, groupOfStart, rIn, rOut, count: groupIx.size, pathId, conflict, curve };
}
