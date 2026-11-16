// 노면 화살표를 차선 칸 가운데로 맞추기(재작업 W14).
// 서울시 방향표시 점(OA-15536)은 차선 칸 가운데에서 1~5m 비켜 찍힌 것이 많아(한 방향 길에서 가장자리선 밖에 걸친 화살표) 그대로 그리면 선과 맞지 않았다.
// 화살표마다 진행 방향이 45° 안으로 나란한 차가 다니는 길 방향(lanes.json, 차가 쓰는 차로 가운데선)을 20m 안에서 찾아, 화살표 점에서 가장 가까운 차로 가운데
// (3.6m 안)로 옮기고 방향도 그 자리 길 방향으로 바로잡는다. 차로를 읽지 못한 길(서울시 선이 없는 골목 등)은 그린 찻길 폭(가장자리)을
// 그 방향 차로 수로 고르게 나눈 칸 가운데로 옮긴다(그 길에는 칠한 차선이 없어 선과 어긋날 일이 없다).
import { curbAt, type Road } from '../../src/data/board.ts';
import type { RoadLanes, Run } from '../../src/data/lanes.ts';
import { cumLen } from '../../src/poly.ts';

const PAR = Math.cos((45 * Math.PI) / 180);
const REACH = 20;
const SNAP = 3.6;

/** 구간 run 의 s 자리 차로 가운데 옆 거리들(단면 사이는 직선 보간) */
function offsetsAt(run: Run, s: number): number[] {
  const m = run.st.length;
  let k = 0;
  while (k + 2 < m && run.st[k + 1] < s) k++;
  const t = m < 2 ? 0 : Math.max(0, Math.min(1, (s - run.st[k]) / (run.st[k + 1] - run.st[k] || 1)));
  const out: number[] = [];
  for (let l = 0; l < run.n; l++) {
    const a = run.off[k * run.n + l];
    const b = m < 2 ? a : run.off[(k + 1) * run.n + l];
    out.push(a + (b - a) * t);
  }
  return out;
}

export interface ArrowIn {
  kind: number;
  x: number;
  z: number;
  /** 진행 방향(판 좌표 단위 벡터) */
  fx: number;
  fz: number;
}

/** 화살표들을 차로 가운데로 옮긴다. 옮긴 수와, 옮기기 전 차로 가운데까지 옆 거리 목록(옮긴 것만)을 함께 돌려준다 */
export function snapArrows(roads: Road[], lanes: RoadLanes, arrows: ArrowIn[]): { out: ArrowIn[]; moved: number; dist: number[] } {
  const CELL = 20;
  const grid = new Map<number, number[]>();
  const keyOf = (cx: number, cz: number) => (cx + 2000) * 4000 + (cz + 2000);
  const cums = roads.map((r) => cumLen(r.p));
  const segs: [number, number][] = []; // [길, 조각 안 번호]
  roads.forEach((r, i) => {
    if (r.cls > 5) return;
    for (let k = 0; k + 5 < r.p.length; k += 3) {
      const id = segs.length;
      segs.push([i, k / 3]);
      const x0 = Math.floor((Math.min(r.p[k], r.p[k + 3]) - REACH) / CELL);
      const x1 = Math.floor((Math.max(r.p[k], r.p[k + 3]) + REACH) / CELL);
      const z0 = Math.floor((Math.min(r.p[k + 2], r.p[k + 5]) - REACH) / CELL);
      const z1 = Math.floor((Math.max(r.p[k + 2], r.p[k + 5]) + REACH) / CELL);
      for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) (grid.get(keyOf(cx, cz)) ?? grid.set(keyOf(cx, cz), []).get(keyOf(cx, cz))!).push(id);
    }
  });
  let moved = 0;
  const dist: number[] = [];
  const out = arrows.map((a) => {
    let best: ArrowIn | null = null;
    let bestD = SNAP;
    for (const id of grid.get(keyOf(Math.floor(a.x / CELL), Math.floor(a.z / CELL))) ?? []) {
      const [i, k] = segs[id];
      const r = roads[i];
      const P = r.p;
      const [ax, az, bx, bz] = [P[k * 3], P[k * 3 + 2], P[k * 3 + 3], P[k * 3 + 5]];
      const sl = Math.hypot(bx - ax, bz - az);
      if (sl < 1e-3) continue;
      const tx = (bx - ax) / sl;
      const tz = (bz - az) / sl;
      const t = ((a.x - ax) * tx + (a.z - az) * tz) / sl;
      if (t < 0 || t > 1) continue;
      const cx = ax + (bx - ax) * t;
      const cz = az + (bz - az) * t;
      if (Math.hypot(a.x - cx, a.z - cz) > REACH) continue;
      const len = cums[i][cums[i].length - 1];
      const s = cums[i][k] + t * sl;
      for (const d of [0, 1] as const) {
        if (d === 1 && r.oneway) continue;
        const dl = lanes[i]?.[d] ?? null;
        const sg = d === 0 ? 1 : -1;
        const [ux, uz] = [tx * sg, tz * sg];
        if (ux * a.fx + uz * a.fz < PAR) continue;
        const sd = d === 0 ? s : len - s;
        let offs: number[] = [];
        if (dl) {
          // 그 자리를 덮는 구간, 없으면 30m 안 가장 가까운 구간(교차로 앞 차선이 먼저 끝난 자리)
          let run: Run | null = null;
          let gap = 30;
          for (const q of dl.runs) {
            const g = sd < q.s0 ? q.s0 - sd : sd > q.s1 ? sd - q.s1 : 0;
            if (g <= gap) (gap = g), (run = q);
          }
          if (run) offs = offsetsAt(run, Math.max(run.s0, Math.min(run.s1, sd)));
        } else {
          // 차로를 읽지 못한 방향: 그린 찻길 가장자리 사이(양방향은 가운데선에서 그쪽 가장자리까지)를 차로 수로 나눈다
          const er = curbAt(r, s, 1);
          const el = curbAt(r, s, -1);
          const [lo, hi, n] = r.oneway ? [-el, er, Math.max(1, r.lf)] : d === 0 ? [0, er, Math.max(1, r.lf)] : [0, el, Math.max(1, r.lb)];
          for (let l = 0; l < n; l++) offs.push(lo + ((hi - lo) * (l + 0.5)) / n);
        }
        // 진행 방향 오른쪽(−uz, ux) 이 +
        const lat = (a.x - cx) * -uz + (a.z - cz) * ux;
        for (const off of offs) {
          const dd = Math.abs(off - lat);
          if (dd < bestD) {
            bestD = dd;
            best = { kind: a.kind, x: cx - uz * off, z: cz + ux * off, fx: ux, fz: uz };
          }
        }
      }
    }
    if (!best) return a;
    moved++;
    dist.push(bestD);
    return best;
  });
  return { out, moved, dist };
}

/** 칸을 가르는 칠한 선: 중앙선 1, 버스전용(가로) 5, 차선 6, 가장자리 7, 진로변경제한 8, 주차금지 9, 주정차금지 10, 중앙버스전용 17 */
const CELL_LINES = new Set([1, 5, 6, 7, 8, 9, 10, 17]);

/**
 * 화살표마다 놓인 차선 칸(양옆 칠한 선 사이)을 찾아 칸 가운데로 옮기고 칸 폭을 붙인다(재작업 W14).
 * 화살표 가운데와 앞뒤 len/2 자리에서 진행 방향에 직각으로 그은 단면이 만나는 나란한(25° 안) 칠한 선 가운데 왼쪽·오른쪽으로 가장 가까운 것(4.5m 안)을 칸 경계로 본다.
 * 가운데 단면의 양쪽 선 사이 가운데로 옮기고, 세 단면에서 양쪽 선까지 가장 짧은 거리의 두 배를 칸 폭으로 삼는다. 한쪽이라도 선이 없으면 칸 폭 0
 */
export function fitCells(arrows: ArrowIn[], lines: { k: number; p: ArrayLike<number> }[], len = 4.6): { out: (ArrowIn & { w: number })[]; found: number } {
  const CELL = 10;
  const grid = new Map<number, number[]>();
  const ck = (cx: number, cz: number) => (cx + 1000) * 2000 + cz + 1000;
  const segs: number[] = [];
  for (const l of lines) {
    if (!CELL_LINES.has(l.k)) continue;
    for (let k = 0; k + 5 < l.p.length; k += 3) {
      if (l.p[k + 1] !== 0 || l.p[k + 4] !== 0) continue; // 땅 위 선만
      const id = segs.length / 4;
      segs.push(l.p[k], l.p[k + 2], l.p[k + 3], l.p[k + 5]);
      for (let cx = Math.floor((Math.min(l.p[k], l.p[k + 3]) - 5) / CELL); cx <= Math.floor((Math.max(l.p[k], l.p[k + 3]) + 5) / CELL); cx++)
        for (let cz = Math.floor((Math.min(l.p[k + 2], l.p[k + 5]) - 5) / CELL); cz <= Math.floor((Math.max(l.p[k + 2], l.p[k + 5]) + 5) / CELL); cz++)
          (grid.get(ck(cx, cz)) ?? grid.set(ck(cx, cz), []).get(ck(cx, cz))!).push(id);
    }
  }
  /** (x, z)에서 진행 방향 (ux, uz) 와 직각인 단면: 왼쪽·오른쪽으로 가장 가까운 나란한 선까지 거리(없으면 Infinity) */
  const sides = (x: number, z: number, ux: number, uz: number): [number, number] => {
    let left = Infinity;
    let right = Infinity;
    for (const id of grid.get(ck(Math.floor(x / CELL), Math.floor(z / CELL))) ?? []) {
      const [ax, az, bx, bz] = [segs[id * 4], segs[id * 4 + 1], segs[id * 4 + 2], segs[id * 4 + 3]];
      const dx = bx - ax;
      const dz = bz - az;
      const l = Math.hypot(dx, dz) || 1;
      if (Math.abs((dx * ux + dz * uz) / l) < PAR_CELL) continue;
      // 단면 선(점 + 왼쪽 (uz, −ux) × v)과 선분의 교점
      const [nx, nz] = [uz, -ux];
      const den = dx * nz - dz * nx;
      if (Math.abs(den) < 1e-9) continue;
      const t = ((x - ax) * nz - (z - az) * nx) / den;
      if (t < 0 || t > 1) continue;
      const v = (ax + dx * t - x) * nx + (az + dz * t - z) * nz;
      if (v > 0.05 && v < 4.5) left = Math.min(left, v);
      if (v < -0.05 && v > -4.5) right = Math.min(right, -v);
    }
    return [left, right];
  };
  let found = 0;
  const out = arrows.map((a) => {
    const [l0, r0] = sides(a.x, a.z, a.fx, a.fz);
    // 칸 폭 2.2m 아래는 차선 칸이 아니다(겹선 사이·안전지대 테두리 등)
    if (!Number.isFinite(l0) || !Number.isFinite(r0) || l0 + r0 < 2.2) return { ...a, w: 0 };
    // 칸 가운데로(왼쪽 (fz, −fx))
    const sh = (l0 - r0) / 2;
    const x = a.x + a.fz * sh;
    const z = a.z - a.fx * sh;
    let half = (l0 + r0) / 2;
    for (const u of [-len / 2, len / 2]) {
      const [l, r] = sides(x + a.fx * u, z + a.fz * u, a.fx, a.fz);
      half = Math.min(half, l, r);
    }
    if (2 * half < 1.8) return { ...a, w: 0 };
    found++;
    return { ...a, x, z, w: 2 * half };
  });
  return { out, found };
}
const PAR_CELL = Math.cos((25 * Math.PI) / 180);
