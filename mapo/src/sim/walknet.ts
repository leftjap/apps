// 걷는 길 그래프(public/data/walk.json, tools/lib/walknet.ts 가 굽는다).
// 큰길 보도는 보도 면(도로 부지 − 찻길 − 교차로 면 − 분리대) 안을 지나는 선이고, 보도 없는 골목은 골목 가운데선(폭 전체를 차와 함께 쓴다),
// 공원 길·숲길은 도로 부지 밖 보행로 가운데선이다. 선마다 걷는 띠 [lo, hi](선에서 진행 방향 오른쪽 +)를 함께 둔다.
// 큰길은 횡단보도 연결로만 건넌다: 그래프의 어떤 선도 큰길 찻길을 지나지 않는다.

/** 길 종류: 0 큰길 보도, 1 골목(차와 함께), 2 도로 부지 밖 보행로, 3 잇는 선(골목 어귀·끊긴 보도 끝) */
export const SIDEWALK = 0;
export const ALLEY = 1;
export const PATH = 2;
export const LINK = 3;
/** walk.json 의 횡단보도 연결 하나가 차지하는 수의 개수 */
export const LINK_N = 17;

export interface WalkJson {
  v: 2 | 3;
  /** 노드 [x, z, ...](dm), 첫 점 뒤는 앞 점과의 차이 */
  n: number[];
  /** 선마다 [a − 앞 선의 a, b − a, 종류 × 16 + 등급 × 2 + 붐비는 길, lo, hi](lo·hi 는 dm, a→b 로 걸을 때) */
  e: number[];
  /** 횡단보도 연결마다 [횡단보도 번호, na, nb, ax, az, bx, bz, pax, paz, pbx, pbz, 폭, 큰길, aLo, aHi, bLo, bHi](좌표·폭은 dm) */
  x: number[];
  /** (v3) 노드마다 사람이 설 수 있는 원 반지름(dm): 이 원 안은 큰길 찻길·건물에서 몸 반지름 + 여유만큼 떨어져 있다 */
  r?: number[];
  /** (v3) 건물 문마다 [건물 번호, 선 번호(e 순서), 선 a 에서 거리, 문턱 x, z](거리·좌표 dm) */
  d?: number[];
}

/** 횡단보도 하나: 축 E0(ax, az) → E1(bx, bz). 보도 쪽 기다리는 자리 pa(E0 쪽)·pb(E1 쪽)와, 거기서 그래프로 이어지는 노드 na·nb */
export interface CrossLink {
  /** 횡단보도 번호(board.crosswalks 순서) */
  xw: number;
  ax: number;
  az: number;
  bx: number;
  bz: number;
  pax: number;
  paz: number;
  pbx: number;
  pbz: number;
  na: number;
  nb: number;
  /** 큰길(등급 3 이하)을 건너는가 */
  major: boolean;
  /** 횡단보도 폭(m) */
  wid: number;
  /** E0·E1 쪽 끝에서 사람이 비켜 설 수 있는 범위: 축에서 E0→E1 오른쪽으로 떨어진 거리의 [최소, 최대](m).
   *  그 안에서는 기다리는 자리 뒤 1.5m 까지 큰길 찻길·건물·칠이 아니다 */
  aLo: number;
  aHi: number;
  bLo: number;
  bHi: number;
}

export interface WalkGraph {
  /** 노드 좌표 [x,z, ...] */
  nx: Float32Array;
  adj: number[][];
  /** 이웃별 인기도 */
  aw: number[][];
  /** 이웃별 도로 등급(보도는 옆 찻길의 등급) */
  cls: number[][];
  /** 이웃별 길 종류(SIDEWALK·ALLEY·PATH·LINK) */
  kind: number[][];
  /** 이웃 쪽으로 걸을 때 걷는 띠: 선에서 진행 방향 오른쪽으로 떨어진 거리의 [최소, 최대](왼쪽은 음수) */
  band: [number, number][][];
  links: CrossLink[];
  /** 노드마다 닿은 횡단보도 연결 번호들 */
  linkAt: Map<number, number[]>;
  /** 노드마다 사람이 설 수 있는 원 반지름(m, v3 자료). 없으면 이웃 선 띠 반폭 가운데 작은 값 */
  rad: Float32Array;
  /** 선 번호(e 순서) → [노드 a, a 의 이웃 번호] */
  edgeAt: Int32Array;
  /** 건물 문(v3 자료): 건물 번호, 선(노드 a, 이웃 번호 k), a 에서 거리 t, 문턱 */
  doors: { b: number; a: number; k: number; t: number; x: number; z: number }[];
  /** 가장 가까운 노드. alley 가 참이면 골목·보행로에 닿은 노드만 본다 */
  nearest(x: number, z: number, alley?: boolean): number;
  /** 가장 가까운 선(잇는 선 빼고, 200m 안): [노드 a, 이웃 번호 k, a 에서 선을 따라간 거리, 떨어진 거리]. 없으면 null.
   *  ok 를 주면 그 노드에서 나가는 선만 본다 */
  nearestEdge(x: number, z: number, ok?: (a: number) => boolean): [number, number, number, number] | null;
}

const HOT_W = (kind: number, cls: number) => (kind === PATH || cls >= 6 ? 3 : cls === 5 ? 0.4 : cls === 4 ? 1 : 1.5);

export function decodeWalk(j: WalkJson): WalkGraph {
  const N = j.n.length / 2;
  const nx = new Float32Array(j.n.length);
  let x = 0;
  let z = 0;
  for (let i = 0; i < N; i++) {
    x += j.n[i * 2];
    z += j.n[i * 2 + 1];
    nx[i * 2] = x / 10;
    nx[i * 2 + 1] = z / 10;
  }
  const adj: number[][] = Array.from({ length: N }, () => []);
  const aw: number[][] = Array.from({ length: N }, () => []);
  const cls: number[][] = Array.from({ length: N }, () => []);
  const kind: number[][] = Array.from({ length: N }, () => []);
  const band: [number, number][][] = Array.from({ length: N }, () => []);
  let a = 0;
  const edgeAt = new Int32Array((j.e.length / 5) * 2);
  for (let k = 0; k < j.e.length; k += 5) {
    a += j.e[k];
    const b = a + j.e[k + 1];
    edgeAt[(k / 5) * 2] = a;
    edgeAt[(k / 5) * 2 + 1] = adj[a].length;
    const code = j.e[k + 2];
    const kd = code >> 4;
    const c = (code >> 1) & 7;
    const w = HOT_W(kd, c) * (code & 1 ? 3 : 1);
    const lo = j.e[k + 3] / 10;
    const hi = j.e[k + 4] / 10;
    adj[a].push(b);
    adj[b].push(a);
    aw[a].push(w);
    aw[b].push(w);
    cls[a].push(c);
    cls[b].push(c);
    kind[a].push(kd);
    kind[b].push(kd);
    band[a].push([lo, hi]);
    band[b].push([-hi, -lo]);
  }
  // 노드마다 목록을 길이에 맞춰 다시 담는다(push 로 늘린 배열은 칸을 넉넉히 잡아 노드 11만 개 × 다섯 목록에 약 100MB 를 더 쓴다, W19)
  for (let i = 0; i < N; i++) {
    adj[i] = adj[i].slice();
    aw[i] = aw[i].slice();
    cls[i] = cls[i].slice();
    kind[i] = kind[i].slice();
    band[i] = band[i].slice();
  }
  const links: CrossLink[] = [];
  const linkAt = new Map<number, number[]>();
  for (let k = 0; k < j.x.length; k += LINK_N) {
    const v = j.x;
    const l: CrossLink = {
      xw: v[k],
      na: v[k + 1],
      nb: v[k + 2],
      ax: v[k + 3] / 10,
      az: v[k + 4] / 10,
      bx: v[k + 5] / 10,
      bz: v[k + 6] / 10,
      pax: v[k + 7] / 10,
      paz: v[k + 8] / 10,
      pbx: v[k + 9] / 10,
      pbz: v[k + 10] / 10,
      wid: v[k + 11] / 10,
      major: v[k + 12] === 1,
      aLo: v[k + 13] / 10,
      aHi: v[k + 14] / 10,
      bLo: v[k + 15] / 10,
      bHi: v[k + 16] / 10,
    };
    for (const n of new Set([l.na, l.nb])) (linkAt.get(n) ?? linkAt.set(n, []).get(n)!).push(links.length);
    links.push(l);
  }
  const rad = new Float32Array(N);
  for (let i = 0; i < N; i++)
    rad[i] = j.r ? j.r[i] / 10 : band[i].reduce((m, [lo, hi]) => Math.min(m, Math.max(0, -lo), Math.max(0, hi)), band[i].length ? 8 : 0);
  const doors: WalkGraph['doors'] = [];
  for (let k = 0; j.d && k < j.d.length; k += 5) {
    const e = j.d[k + 1];
    doors.push({ b: j.d[k], a: edgeAt[e * 2], k: edgeAt[e * 2 + 1], t: j.d[k + 2] / 10, x: j.d[k + 3] / 10, z: j.d[k + 4] / 10 });
  }
  // 가까운 노드를 빨리 찾기 위한 격자
  const CELL = 80;
  const cells = new Map<number, number[]>();
  const cellKey = (cx: number, cz: number) => (cx + 500) * 1000 + (cz + 500);
  for (let i = 0; i < N; i++) {
    const key = cellKey(Math.floor(nx[i * 2] / CELL), Math.floor(nx[i * 2 + 1] / CELL));
    (cells.get(key) ?? cells.set(key, []).get(key)!).push(i);
  }
  const isAlley = (i: number) => cls[i].some((c) => c >= 4);
  // 선을 20m 칸에 넣어 둔다(처음 쓸 때)
  let edgeCells: Map<number, number[]> | null = null;
  const EC = 20;
  const edgeGrid = () => {
    if (edgeCells) return edgeCells;
    edgeCells = new Map();
    for (let p = 0; p < N; p++)
      adj[p].forEach((q, k) => {
        if (q < p || kind[p][k] === LINK) return;
        for (let cx = Math.floor(Math.min(nx[p * 2], nx[q * 2]) / EC); cx <= Math.floor(Math.max(nx[p * 2], nx[q * 2]) / EC); cx++)
          for (let cz = Math.floor(Math.min(nx[p * 2 + 1], nx[q * 2 + 1]) / EC); cz <= Math.floor(Math.max(nx[p * 2 + 1], nx[q * 2 + 1]) / EC); cz++) {
            const key = cellKey(cx, cz);
            (edgeCells!.get(key) ?? edgeCells!.set(key, []).get(key)!).push(p, k);
          }
      });
    return edgeCells;
  };
  return {
    nx,
    adj,
    aw,
    cls,
    kind,
    band,
    links,
    linkAt,
    rad,
    edgeAt,
    doors,
    nearest(px, pz, alley = false) {
      const cx = Math.floor(px / CELL);
      const cz = Math.floor(pz / CELL);
      let best = -1;
      let bd = Infinity;
      for (let ring = 0; ring < 60; ring++) {
        for (let i = -ring; i <= ring; i++)
          for (let q = -ring; q <= ring; q++) {
            if (Math.max(Math.abs(i), Math.abs(q)) !== ring) continue;
            for (const n of cells.get(cellKey(cx + i, cz + q)) ?? []) {
              if (!adj[n].length || (alley && !isAlley(n))) continue;
              const d = Math.hypot(nx[n * 2] - px, nx[n * 2 + 1] - pz);
              if (d < bd) (bd = d), (best = n);
            }
          }
        if (best >= 0 && bd <= ring * CELL) break;
      }
      return best;
    },
    nearestEdge(px, pz, ok) {
      const cells2 = edgeGrid();
      const cx = Math.floor(px / EC);
      const cz = Math.floor(pz / EC);
      let best: [number, number, number, number] | null = null;
      for (let ring = 0; ring <= 10; ring++) {
        for (let i = -ring; i <= ring; i++)
          for (let q = -ring; q <= ring; q++) {
            if (Math.max(Math.abs(i), Math.abs(q)) !== ring) continue;
            const list = cells2.get(cellKey(cx + i, cz + q)) ?? [];
            for (let m = 0; m < list.length; m += 2) {
              const p = list[m];
              const k = list[m + 1];
              if (ok && !ok(p)) continue;
              const b = adj[p][k];
              const dx = nx[b * 2] - nx[p * 2];
              const dz = nx[b * 2 + 1] - nx[p * 2 + 1];
              const L = Math.hypot(dx, dz) || 1;
              const t = Math.max(0, Math.min(L, ((px - nx[p * 2]) * dx + (pz - nx[p * 2 + 1]) * dz) / L));
              const d = Math.hypot(nx[p * 2] + (dx / L) * t - px, nx[p * 2 + 1] + (dz / L) * t - pz);
              if (!best || d < best[3]) best = [p, k, t, d];
            }
          }
        if (best && best[3] <= ring * EC) break;
      }
      return best;
    },
  };
}
