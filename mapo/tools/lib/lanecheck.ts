// 차로 가운데선(road.json 의 lanes) 점검(재작업 W14, 계획 세션 요청): 차는 OSM 길 조각 + 차로 가운데 옆 거리 표로 자리를 정하므로
// (1) 같은 차로가 갈림 없는 조각 이음매에서 끊기면(앞 조각 끝과 뒤 조각 시작의 옆 거리가 어긋나면) 차가 옆으로 튀고,
// (2) 차로 가운데가 칠한 황색 중앙선(서울시 차선 001)의 오른쪽이 아니면(중앙선이 차로 오른쪽 3.5m 안에 있으면) 차가 중앙선을 넘어 달린다.
import type { Road } from '../../src/data/board.ts';
import type { MarkLine } from '../../src/data/marks.ts';
import type { DirLanes, RoadLanes } from '../../src/data/road.ts';
import { cumLen } from '../../src/poly.ts';

const key = (x: number, z: number) => `${Math.round(x * 10)},${Math.round(z * 10)}`;
const PAR = Math.cos((25 * Math.PI) / 180);

/** 방향 d 의 가운데선 점열(진행 방향 순서) */
function dirLine(r: Road, d: 0 | 1): Float32Array {
  if (d === 0) return r.p;
  const rev = new Float32Array(r.p.length);
  for (let i = 0; i < r.p.length; i += 3) rev.set(r.p.subarray(i, i + 3), r.p.length - 3 - i);
  return rev;
}

/** 선 P 의 s 자리 점과 진행 방향 */
function frame(P: Float32Array, cum: Float32Array | number[], s: number): [number, number, number, number] {
  const n = cum.length;
  let k = 0;
  while (k < n - 2 && cum[k + 1] < s) k++;
  const L = cum[k + 1] - cum[k] || 1;
  const t = Math.max(0, Math.min(1, (s - cum[k]) / L));
  const [ax, az, bx, bz] = [P[k * 3], P[k * 3 + 2], P[k * 3 + 3], P[k * 3 + 5]];
  const l = Math.hypot(bx - ax, bz - az) || 1;
  return [ax + (bx - ax) * t, az + (bz - az) * t, (bx - ax) / l, (bz - az) / l];
}

/** 방향 차로 dl 의 s 자리 차로 옆 거리들(가장 가까운 구간, 단면 사이 직선 보간) */
function offsets(dl: DirLanes, s: number): number[] {
  let best = dl.runs[0];
  let gap = Infinity;
  for (const q of dl.runs) {
    const g = s < q.s0 ? q.s0 - s : s > q.s1 ? s - q.s1 : 0;
    if (g < gap) (gap = g), (best = q);
  }
  const run = best;
  const m = run.st.length;
  const sa = Math.max(run.s0, Math.min(run.s1, s));
  let k = 0;
  while (k + 2 < m && run.st[k + 1] < sa) k++;
  const t = m < 2 ? 0 : Math.max(0, Math.min(1, (sa - run.st[k]) / (run.st[k + 1] - run.st[k] || 1)));
  return Array.from({ length: run.n }, (_, l) => {
    const a = run.off[k * run.n + l];
    const b = m < 2 ? a : run.off[(k + 1) * run.n + l];
    return a + (b - a) * t;
  });
}

export interface SeamBreak {
  x: number;
  z: number;
  /** 앞 조각 마지막 차로들과 뒤 조각 첫 차로들 사이 가장 큰 어긋남(m) */
  gap: number;
  roads: [number, number];
}

/**
 * 갈림 없는 이음매(땅 위 찻길 조각 둘만 만나는 노드, 꺾임 25° 안)에서 같은 방향으로 이어지는 두 조각의 차로를 견준다.
 * 두 쪽 모두 이음매 6m 안까지 차로를 읽었고 차로 수가 같을 때만, 차로마다 옆 거리 차이의 가장 큰 값이 tol 을 넘으면 끊김으로 센다
 */
export function seamBreaks(roads: Road[], lanes: RoadLanes, tol = 0.5): SeamBreak[] {
  const at = new Map<string, [number, 0 | 1][]>(); // 노드 → [조각, 그 노드가 조각 시작(0)인가 끝(1)인가]
  roads.forEach((r, i) => {
    if (r.cls > 5 || r.p.length < 6) return;
    const n = r.p.length;
    for (const [e, x, z] of [[0, r.p[0], r.p[2]], [1, r.p[n - 3], r.p[n - 1]]] as const) (at.get(key(x, z)) ?? at.set(key(x, z), []).get(key(x, z))!).push([i, e]);
  });
  const out: SeamBreak[] = [];
  for (const ends of at.values()) {
    if (ends.length !== 2 || ends[0][0] === ends[1][0]) continue;
    for (const [[ra, ea], [rb, eb]] of [[ends[0], ends[1]], [ends[1], ends[0]]] as const) {
      // a 에서 들어와 b 로 나가는 방향: a 의 방향 da 는 노드가 끝이 되는 쪽, b 의 방향 db 는 노드가 시작이 되는 쪽
      const da: 0 | 1 = ea === 1 ? 0 : 1;
      const db: 0 | 1 = eb === 0 ? 0 : 1;
      const A = lanes[ra]?.[da];
      const B = lanes[rb]?.[db];
      if (!A || !B) continue;
      const PA = dirLine(roads[ra], da);
      const PB = dirLine(roads[rb], db);
      const cA = cumLen(PA);
      const cB = cumLen(PB);
      const lenA = cA[cA.length - 1];
      if (A.b < lenA - 6 || B.a > 6) continue;
      const [x, z, ux, uz] = frame(PA, cA, lenA);
      const [, , vx, vz] = frame(PB, cB, 0);
      if (ux * vx + uz * vz < PAR) continue;
      const oa = offsets(A, lenA);
      const ob = offsets(B, 0);
      if (oa.length !== ob.length) continue;
      const gap = Math.max(...oa.map((o, l) => Math.abs(o - ob[l])));
      if (gap > tol) out.push({ x, z, gap, roads: [ra, rb] });
    }
  }
  return out;
}

export interface CenterCross {
  x: number;
  z: number;
  road: number;
  dir: number;
  lane: number;
}

/** 차로 가운데를 4m 마다 짚어, 진행 방향과 나란한 황색 중앙선이 그 점 오른쪽 0.3~3.5m 에 있으면 중앙선을 넘은 것으로 센다 */
export function centerCrossings(roads: Road[], lanes: RoadLanes, lines: MarkLine[]): CenterCross[] {
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
  const out: CenterCross[] = [];
  roads.forEach((r, i) => {
    for (const d of [0, 1] as const) {
      const dl = lanes[i]?.[d];
      if (!dl) continue;
      const P = dirLine(r, d);
      const cum = cumLen(P);
      for (const run of dl.runs)
        for (let s = run.s0; s <= run.s1; s += 4) {
          const [x, z, ux, uz] = frame(P, cum, s);
          offsets(dl, s).forEach((o, lane) => {
            // 차로 가운데: 진행 방향 오른쪽(−uz, ux)으로 o
            const [px, pz] = [x - uz * o, z + ux * o];
            for (const id of grid.get(ck(Math.floor(px / CELL), Math.floor(pz / CELL))) ?? []) {
              const [ax, az, bx, bz] = segs.slice(id * 4, id * 4 + 4);
              const l = Math.hypot(bx - ax, bz - az) || 1;
              const [tx, tz] = [(bx - ax) / l, (bz - az) / l];
              if (Math.abs(tx * ux + tz * uz) < PAR) continue;
              const t = ((px - ax) * tx + (pz - az) * tz) / l;
              if (t < 0 || t > 1) continue;
              const [qx, qz] = [ax + (bx - ax) * t, az + (bz - az) * t];
              // 선이 차로 가운데의 오른쪽(+)이면 차로가 중앙선 왼쪽 = 반대편
              const side = (qx - px) * -uz + (qz - pz) * ux;
              if (side > 0.3 && side < 3.5) {
                out.push({ x: px, z: pz, road: i, dir: d, lane });
                return;
              }
            }
          });
        }
    }
  });
  return out;
}
