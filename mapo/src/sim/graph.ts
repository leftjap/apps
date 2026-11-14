// 도로 조각 → 차가 달리는 방향 그래프와 사람·고양이가 걷는 그래프.
// 구울 때 교차점마다 끊어 두었으므로 조각의 끝점끼리만 이어 주면 된다.
import { roadHalf, type Crosswalk, type Road } from '../data/board.ts';
import { BOARD_R } from '../geo.ts';
import { cumLen } from '../poly.ts';

/** 차선 자료가 없는 길의 차로 폭(m) */
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
  /** 차로 폭(m) */
  lw: number;
  /** 0번 차로 중심이 중심선에서 오른쪽으로 떨어진 거리. i번 차로는 off0 + i × lw */
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
    edges.push({ id: edges.length, p, cum, len: cum[cum.length - 1], cls: r.cls, lanes, lw: r.lw, off0, next: [], nextW: [], entry: false, name: r.name, key: edges.length, road, rev });
  };
  roads.forEach((r, road) => {
    // 골목·진입로는 버스가 지나는 곳만 차가 다닌다
    if ((r.cls > 3 && !(r.bus && r.cls <= 5)) || r.p.length < 6) return;
    if (r.oneway) {
      const lanes = Math.max(1, r.lf);
      add(r, road, r.p, lanes, (-(lanes - 1) / 2) * r.lw, false);
      twin.push(-1);
    } else {
      // 양방향 길의 가운데선은 중앙선 자리다. 방향마다 차로 수가 다를 수 있다
      const rev = new Float32Array(r.p.length);
      for (let i = 0; i < r.p.length; i += 3) rev.set(r.p.subarray(i, i + 3), r.p.length - 3 - i);
      add(r, road, r.p, Math.max(1, r.lf), r.lw / 2, false);
      add(r, road, rev, Math.max(1, r.lb), r.lw / 2, true);
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
  /** 이웃별 걷는 자리: 이웃 쪽으로 걸을 때 오른쪽 띠(중심선에서 떨어진 거리의 최소·최대) */
  lat: [number, number][][];
  /** 이웃 쪽으로 걸을 때 왼쪽 띠 */
  latL: [number, number][][];
  /** 이웃별 걸을 수 있는 쪽: +1 진행 방향 오른쪽만, −1 왼쪽만, 0 양쪽. 한 방향 큰길(중앙분리대가 있는 길의 한쪽)은 바깥쪽 보도만 쓴다 */
  dir: number[][];
  /** 가장 가까운 노드. alley 가 참이면 골목·보행로에 닿은 노드만 본다 */
  nearest(x: number, z: number, alley?: boolean): number;
  /** 좌표(데시미터 정밀도)가 같은 노드(없으면 −1) */
  nodeAt(x: number, z: number): number;
}

const HOT = /경의선|레드로드|어울마당|홍익로|와우산로|잔다리로|독막로|동교로|성미산로|양화로|월드컵로|연남로|한강|포은로|망원로|희우정로/;

/** 길 조각의 걷는 띠: [진행 방향 오른쪽, 왼쪽]. 큰길은 찻길 가장자리 밖 보도, 골목은 길 안 가장자리 */
function walkLat(r: Road): [[number, number], [number, number]] {
  if (r.cls === 6) return [[0, 2.6], [0, 2.6]];
  if (r.cls === 7) return [[0, 0.8], [0, 0.8]];
  if (r.cls >= 4) return [[0.6, 2.2], [0.6, 2.2]];
  const [hr, hl] = roadHalf(r);
  return [[hr + 0.8, hr + 2.4], [hl + 0.8, hl + 2.4]];
}

export function buildWalkGraph(roads: Road[]): WalkGraph {
  const ids = new Map<number, number>();
  const xs: number[] = [];
  const adj: number[][] = [];
  const aw: number[][] = [];
  const cls: number[][] = [];
  const lat: [number, number][][] = [];
  const latL: [number, number][][] = [];
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
      latL.push([]);
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
    const [lr, ll] = walkLat(r);
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
        lat[prev].push(lr);
        latL[prev].push(ll);
        lat[n].push(ll);
        latL[n].push(lr);
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
    latL,
    dir,
    nodeAt: (x, z) => ids.get(nodeKey(x, z)) ?? -1,
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

/** 지도 자료에서 따로 그린 보행로·보도가 차로 위에 놓인 곳: 걷는 띠 가운데가 차로 안에 30% 넘게 들면 그쪽으로는 걷지 않는다.
 *  꼭짓점마다 노드가 생겨 조각이 짧으므로 조각 전체를 2m 간격으로 보되, 갈래가 셋 넘는 노드(교차로 모퉁이) 8m 안은 보지 않는다.
 *  양쪽이 다 차로 위면 그 길 조각을 걷지 않고(인기도 0), 한쪽만이면 다른 쪽만 걷는다. 보도 없는 골목(등급 4·5)은 사람과 차가 함께 쓰므로 그대로 둔다 */
export function clearWalkFromCars(g: WalkGraph, cars: Edge[]) {
  const onLanes = laneTest(cars);
  const corner = (n: number) => g.adj[n].length >= 3;
  for (let a = 0; a < g.adj.length; a++)
    g.adj[a].forEach((b, k) => {
      if (b < a || (g.cls[a][k] >= 4 && g.cls[a][k] <= 5)) return;
      const ax = g.nx[a * 2];
      const az = g.nx[a * 2 + 1];
      const dx = g.nx[b * 2] - ax;
      const dz = g.nx[b * 2 + 1] - az;
      const L = Math.hypot(dx, dz);
      if (L < 0.5) return;
      const lo = corner(a) ? 8 : 0;
      const hi = corner(b) ? L - 8 : L;
      if (hi - lo < 1) return;
      const midR = (g.lat[a][k][0] + g.lat[a][k][1]) / 2;
      const midL = (g.latL[a][k][0] + g.latL[a][k][1]) / 2;
      const hit = [0, 0];
      let n = 0;
      for (let d = lo + Math.min(1, (hi - lo) / 2); d <= hi; d += 2, n++)
        [1, -1].forEach((sd, j) => {
          // 진행 방향(a→b) 오른쪽이 +: (−dz, dx)
          const mid = sd > 0 ? midR : midL;
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
    const lo = e.off0 - e.lw / 2;
    const hi = e.off0 + (e.lanes - 0.5) * e.lw;
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


/** 횡단보도 하나: 축 E0 → E1 과, 축이 지나는 꼭짓점 가운데 E0 쪽 끝 노드(na)·E1 쪽 끝 노드(nb).
 *  na 의 E0 쪽 보도에서 건너 nb 의 E1 쪽 보도로 나온다(반대로도). 한 길만 건너면 na = nb */
export interface CrossLink {
  /** 횡단보도 번호(board.crosswalks 순서) */
  xw: number;
  ax: number;
  az: number;
  bx: number;
  bz: number;
  na: number;
  nb: number;
  /** 큰길(등급 3 이하)을 건너는가 */
  major: boolean;
  /** 횡단보도 폭(m) */
  wid: number;
}

/** 횡단보도 축이 지나는 꼭짓점을 보행 노드에 잇는다. at[노드] = 그 노드에 닿은 횡단보도 연결 번호들 */
export function crossLinks(g: WalkGraph, xws: Crosswalk[]): { list: CrossLink[]; at: Map<number, number[]> } {
  const list: CrossLink[] = [];
  const at = new Map<number, number[]>();
  xws.forEach((c, xw) => {
    const nodes: number[] = [];
    for (let k = 0; k < c.verts.length; k += 2) {
      const n = g.nodeAt(c.verts[k], c.verts[k + 1]);
      if (n >= 0 && g.adj[n].length) nodes.push(n);
    }
    if (!nodes.length) return;
    const major = nodes.some((n) => g.cls[n].some((v) => v <= 3));
    const id = list.length;
    list.push({ xw, ax: c.x - c.ux * c.half, az: c.z - c.uz * c.half, bx: c.x + c.ux * c.half, bz: c.z + c.uz * c.half, na: nodes[0], nb: nodes[nodes.length - 1], major, wid: c.wid });
    for (const n of new Set([nodes[0], nodes[nodes.length - 1]])) (at.get(n) ?? at.set(n, []).get(n)!).push(id);
  });
  return { list, at };
}

/** 노드에서 돌아갈 수 있는 길. 길 갈래를 각도 순으로 늘어놓고, 갈래 사이 모퉁이(보도)를 따라 들어온 쪽에서 나갈 쪽까지 돌 때
 *  큰길(등급 3 이하) 갈래를 건너야 하면 안 된다(큰길은 횡단보도로만 건넌다). 골목·보행로 갈래는 건너도 된다.
 *  side: 진행 방향 오른쪽 보도 +1, 왼쪽 −1. 들어오는 쪽은 노드로 다가오는 방향, 나가는 쪽은 노드에서 멀어지는 방향 기준 */
export function turnRules(g: WalkGraph) {
  const rank: Int16Array[] = new Array(g.adj.length);
  const order: Int16Array[] = new Array(g.adj.length);
  const prep = (b: number) => {
    if (rank[b]) return;
    const nb = g.adj[b];
    const ang = nb.map((m) => Math.atan2(g.nx[m * 2 + 1] - g.nx[b * 2 + 1], g.nx[m * 2] - g.nx[b * 2]));
    const o = nb.map((_, k) => k).sort((p, q) => ang[p] - ang[q]);
    order[b] = Int16Array.from(o);
    const r = new Int16Array(nb.length);
    o.forEach((k, i) => (r[k] = i));
    rank[b] = r;
  };
  const minorRun = (b: number, from: number, to: number, step: number) => {
    const d = g.adj[b].length;
    for (let s = from; s !== to; ) {
      const arm = step > 0 ? (s + 1) % d : s;
      if (g.cls[b][order[b][arm]] <= 3) return false;
      s = (s + step + d) % d;
    }
    return true;
  };
  return {
    allowed(b: number, p: number, sIn: number, k: number, sOut: number): boolean {
      const d = g.adj[b].length;
      if (d === 1) return sOut === -sIn || g.cls[b][0] > 3; // 막다른 곳: 되돌아서며 같은 쪽 보도를 쓴다
      prep(b);
      const rp = rank[b][p];
      const rk = rank[b][k];
      const start = sIn > 0 ? (rp - 1 + d) % d : rp; // 모퉁이 j = 각도 순 갈래 j 와 j+1 사이
      const end = sOut > 0 ? rk : (rk - 1 + d) % d;
      if (start === end) return true;
      return minorRun(b, start, end, 1) || minorRun(b, start, end, -1);
    },
  };
}
