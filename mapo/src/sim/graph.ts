// 도로 조각 → 차가 달리는 방향 그래프와 사람·고양이가 걷는 그래프.
// 구울 때 교차점마다 끊어 두었으므로 조각의 끝점끼리만 이어 주면 된다.
import type { Road } from '../data/board.ts';
import { BOARD_R } from '../geo.ts';
import { cumLen } from '../poly.ts';

export const LANE = 3.3;

/** 좌표(데시미터 정밀도)로 만든 노드 열쇠 */
const nodeKey = (x: number, z: number) => (Math.round(x * 10) + 40000) * 80001 + (Math.round(z * 10) + 40000);

export interface Edge {
  id: number;
  /** 진행 방향 순서의 중심선 [x,y,z,...] */
  p: Float32Array;
  cum: Float32Array;
  len: number;
  cls: number;
  /** 이 방향의 차로 수 */
  lanes: number;
  /** 0번 차로 중심이 중심선에서 오른쪽으로 떨어진 거리. i번 차로는 off0 + i × LANE */
  off0: number;
  next: number[];
  nextW: number[];
  /** 판 가장자리에서 시작해 새 차가 들어오는 구간 */
  entry: boolean;
  name: string;
  /** 자료 공급자에게 넘기는 구간 고유값 */
  key: number;
  /** 원래 도로 조각 번호와, 저장된 방향을 거슬러 가는가 */
  road: number;
  rev: boolean;
}

export function buildCarGraph(roads: Road[]): Edge[] {
  const edges: Edge[] = [];
  const twin: number[] = [];
  const add = (r: Road, road: number, p: Float32Array, lanes: number, off0: number, rev: boolean) => {
    const cum = cumLen(p);
    edges.push({ id: edges.length, p, cum, len: cum[cum.length - 1], cls: r.cls, lanes, off0, next: [], nextW: [], entry: false, name: r.name, key: edges.length, road, rev });
  };
  roads.forEach((r, road) => {
    // 골목·진입로는 버스가 지나는 곳만 차가 다닌다
    if ((r.cls > 3 && !(r.bus && r.cls <= 5)) || r.p.length < 6) return;
    if (r.oneway) {
      const lanes = Math.max(1, r.lanes);
      add(r, road, r.p, lanes, (-(lanes - 1) / 2) * LANE, false);
      twin.push(-1);
    } else {
      const lanes = Math.max(1, Math.ceil(r.lanes / 2));
      const rev = new Float32Array(r.p.length);
      for (let i = 0; i < r.p.length; i += 3) rev.set(r.p.subarray(i, i + 3), r.p.length - 3 - i);
      add(r, road, r.p, lanes, LANE / 2, false);
      add(r, road, rev, lanes, LANE / 2, true);
      twin.push(edges.length - 1, edges.length - 2);
    }
  });
  const starts = new Map<number, number[]>();
  for (const e of edges) {
    const k = nodeKey(e.p[0], e.p[2]);
    (starts.get(k) ?? starts.set(k, []).get(k)!).push(e.id);
  }
  const hasIn = new Set<number>();
  for (const e of edges) {
    const n = e.p.length;
    const ex = e.p[n - 3] - e.p[n - 6];
    const ez = e.p[n - 1] - e.p[n - 4];
    const el = Math.hypot(ex, ez) || 1;
    for (const j of starts.get(nodeKey(e.p[n - 3], e.p[n - 1])) ?? []) {
      if (j === twin[e.id] || j === e.id) continue;
      const o = edges[j];
      const sx = o.p[3] - o.p[0];
      const sz = o.p[5] - o.p[2];
      const straight = (ex * sx + ez * sz) / (el * (Math.hypot(sx, sz) || 1));
      e.next.push(j);
      // 직진에 가깝고, 같은 이름의 길이고, 넓을수록 많이 고른다
      e.nextW.push((((straight + 1) / 2) ** 3 + 0.02) * (e.name && e.name === o.name ? 2.5 : 1) * o.lanes);
      hasIn.add(j);
    }
  }
  // 새 차는 판 가장자리에서 시작하는 구간으로만 들어온다(판 안에서 갑자기 나타나지 않게)
  for (const e of edges) e.entry = !hasIn.has(e.id) && Math.hypot(e.p[0], e.p[2]) > BOARD_R - 40;
  return edges;
}

export interface WalkGraph {
  /** 노드 좌표 [x,z, ...] */
  nx: Float32Array;
  adj: number[][];
  /** 이웃별 인기도 */
  aw: number[][];
  /** 이웃별 도로 등급 */
  cls: number[][];
  /** 이웃별 걷는 자리: 중심선에서 떨어진 거리의 최소·최대 */
  lat: [number, number][][];
  /** 이웃별 걸을 수 있는 쪽: +1 진행 방향 오른쪽만, −1 왼쪽만, 0 양쪽. 한 방향 큰길(중앙분리대가 있는 길의 한쪽)은 바깥쪽 보도만 쓴다 */
  dir: number[][];
  /** 가장 가까운 노드. alley 가 참이면 골목·보행로에 닿은 노드만 본다 */
  nearest(x: number, z: number, alley?: boolean): number;
}

const HOT = /경의선|레드로드|어울마당|홍익로|와우산로|잔다리로|독막로|동교로|성미산로|양화로|월드컵로|연남로|한강|포은로|망원로|희우정로/;

function walkLat(r: Road): [number, number] {
  if (r.cls === 6) return [0, 2.6];
  if (r.cls === 7) return [0, 0.8];
  if (r.cls >= 4) return [0.6, 2.2];
  const half = Math.max(7, r.lanes * LANE + 1) / 2;
  return [half + 0.8, half + 2.4];
}

export function buildWalkGraph(roads: Road[]): WalkGraph {
  const ids = new Map<number, number>();
  const xs: number[] = [];
  const adj: number[][] = [];
  const aw: number[][] = [];
  const cls: number[][] = [];
  const lat: [number, number][][] = [];
  const dir: number[][] = [];
  const node = (x: number, z: number) => {
    const k = nodeKey(x, z);
    let i = ids.get(k);
    if (i === undefined) {
      i = adj.length;
      ids.set(k, i);
      xs.push(x, z);
      adj.push([]);
      aw.push([]);
      cls.push([]);
      lat.push([]);
      dir.push([]);
    }
    return i;
  };
  for (const r of roads) {
    if (r.cls === 0 || r.bridge) continue;
    let top = 0;
    for (let i = 1; i < r.p.length; i += 3) top = Math.max(top, r.p[i]);
    if (top > 1) continue;
    const w = (r.cls >= 6 ? 3 : r.cls === 5 ? 0.4 : r.cls === 4 ? 1 : 1.5) * (HOT.test(r.name) ? 3 : 1);
    const l = walkLat(r);
    let prev = -1;
    for (let i = 0; i < r.p.length; i += 3) {
      const n = node(r.p[i], r.p[i + 2]);
      if (prev >= 0 && prev !== n) {
        adj[prev].push(n);
        adj[n].push(prev);
        aw[prev].push(w);
        aw[n].push(w);
        cls[prev].push(r.cls);
        cls[n].push(r.cls);
        lat[prev].push(l);
        lat[n].push(l);
        // 한 방향 큰길: 차가 가는 방향으로 걸으면 오른쪽, 거슬러 걸으면 왼쪽이 바깥쪽 보도다
        const one = r.oneway && r.cls <= 3 ? 1 : 0;
        dir[prev].push(one);
        dir[n].push(-one);
      }
      prev = n;
    }
  }
  const nx = Float32Array.from(xs);
  // 가까운 노드를 빨리 찾기 위한 격자
  const CELL = 80;
  const cells = new Map<number, number[]>();
  const cellKey = (cx: number, cz: number) => (cx + 500) * 1000 + (cz + 500);
  for (let i = 0; i < adj.length; i++) {
    const k = cellKey(Math.floor(nx[i * 2] / CELL), Math.floor(nx[i * 2 + 1] / CELL));
    (cells.get(k) ?? cells.set(k, []).get(k)!).push(i);
  }
  const isAlley = (i: number) => cls[i].some((c) => c >= 4);
  return {
    nx,
    adj,
    aw,
    cls,
    lat,
    dir,
    nearest(x, z, alley = false) {
      const cx = Math.floor(x / CELL);
      const cz = Math.floor(z / CELL);
      let best = -1;
      let bd = Infinity;
      for (let ring = 0; ring < 60; ring++) {
        for (let i = -ring; i <= ring; i++)
          for (let j = -ring; j <= ring; j++) {
            if (Math.max(Math.abs(i), Math.abs(j)) !== ring) continue;
            for (const n of cells.get(cellKey(cx + i, cz + j)) ?? []) {
              if (alley && !isAlley(n)) continue;
              const d = Math.hypot(nx[n * 2] - x, nx[n * 2 + 1] - z);
              if (d < bd) (bd = d), (best = n);
            }
          }
        if (best >= 0 && bd <= ring * CELL) break;
      }
      return best;
    },
  };
}

/** 지도 자료에서 따로 그린 보행로·보도가 차로 위에 놓인 곳: 걷는 띠 가운데가 길 중간(양 끝 노드에서 10m 밖)의 차로 안에 30% 넘게 들면 그쪽으로는 걷지 않는다.
 *  양쪽이 다 차로 위면 그 길 조각을 걷지 않고(인기도 0), 한쪽만이면 다른 쪽만 걷는다. 보도 없는 골목(등급 4·5)은 사람과 차가 함께 쓰므로 그대로 둔다 */
export function clearWalkFromCars(g: WalkGraph, cars: Edge[]) {
  const onLanes = laneTest(cars);
  for (let a = 0; a < g.adj.length; a++)
    g.adj[a].forEach((b, k) => {
      if (b < a || (g.cls[a][k] >= 4 && g.cls[a][k] <= 5)) return;
      const ax = g.nx[a * 2];
      const az = g.nx[a * 2 + 1];
      const dx = g.nx[b * 2] - ax;
      const dz = g.nx[b * 2 + 1] - az;
      const L = Math.hypot(dx, dz);
      if (L < 22) return;
      const mid = (g.lat[a][k][0] + g.lat[a][k][1]) / 2;
      const hit = [0, 0];
      let n = 0;
      for (let d = 10; d <= L - 10; d += 4, n++)
        [1, -1].forEach((sd, j) => {
          // 진행 방향(a→b) 오른쪽이 +: (−dz, dx)
          if (onLanes(ax + (dx / L) * d - (dz / L) * mid * sd, az + (dz / L) * d + (dx / L) * mid * sd)) hit[j]++;
        });
      const right = hit[0] > n * 0.3;
      const left = hit[1] > n * 0.3;
      const kb = g.adj[b].indexOf(a);
      if (right && left) {
        g.aw[a][k] = 0;
        g.aw[b][kb] = 0;
      } else if (right || left) {
        g.dir[a][k] = right ? -1 : 1;
        g.dir[b][kb] = -g.dir[a][k];
      }
    });
}

/** 좌표가 어느 차로 위에 있는지 알려 주는 함수(차로 조각을 20m 칸 격자에 넣어 둔다). inset 만큼 차로 가장자리 안쪽만 본다 */
export function laneTest(cars: Edge[], inset = 0): (x: number, z: number) => boolean {
  // 차로 조각: [ax, az, bx, bz, 차로 안쪽 끝, 바깥쪽 끝]
  const segs: number[][] = [];
  const grid = new Map<number, number[]>();
  const key = (cx: number, cz: number) => cx * 100000 + cz;
  for (const e of cars) {
    const lo = e.off0 - LANE / 2;
    const hi = e.off0 + (e.lanes - 0.5) * LANE;
    for (let k = 0; k + 3 < e.p.length; k += 3) {
      const s = [e.p[k], e.p[k + 2], e.p[k + 3], e.p[k + 5], lo, hi];
      const id = segs.length;
      segs.push(s);
      for (let cx = Math.floor(Math.min(s[0], s[2]) / 20) - 1; cx <= Math.floor(Math.max(s[0], s[2]) / 20) + 1; cx++)
        for (let cz = Math.floor(Math.min(s[1], s[3]) / 20) - 1; cz <= Math.floor(Math.max(s[1], s[3]) / 20) + 1; cz++)
          (grid.get(key(cx, cz)) ?? grid.set(key(cx, cz), []).get(key(cx, cz))!).push(id);
    }
  }
  const onLanes = (x: number, z: number) => {
    for (const id of grid.get(key(Math.floor(x / 20), Math.floor(z / 20))) ?? []) {
      const [ax, az, bx, bz, lo, hi] = segs[id];
      const dx = bx - ax;
      const dz = bz - az;
      const L = Math.hypot(dx, dz) || 1;
      const u = ((x - ax) * dx + (z - az) * dz) / L;
      if (u < 0 || u > L) continue;
      const lat = ((x - ax) * -dz + (z - az) * dx) / L;
      if (lat > lo + inset && lat < hi - inset) return true;
    }
    return false;
  };
  return onLanes;
}

