// 서울시 교통안전시설물 차선(선규제차선)으로 길 조각의 실제 모양을 읽는다.
// 길을 따라 6m 마다 길과 직각인 단면을 긋고, 단면과 만나는 차선 가운데 길과 나란한 것(25° 안)만 본다.
//  - 양방향 길: 가운데선에 가장 가까운 중앙선(황색)이 실제 가운데다. 거기서 바깥쪽으로 차선(백색·청색)을 차로 폭 간격으로 세어 방향별 차로 수를 얻는다.
//  - 한 방향 길: 왼쪽 경계(중앙선·중앙버스전용차선·가장자리선)에서 오른쪽으로 센다. 가운데는 왼쪽 경계 + 차로 수 × 차로 폭 / 2.
// 단면마다 읽은 값의 중앙값(가운데 자리, 차로 폭)과 최빈값(차로 수, 중앙선 종류)을 쓴다.

export interface LaneSeg {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  /** 차선코드대분류(001 중앙선, 005 버스전용차선(가로), 006 차선, 007 가장자리구역선, 017 버스전용차선(중앙) 등) */
  k: string;
  /** 차선코드중분류(중앙선이면 001 황색실선, 002 황색점선, 003 황색복선, 004·005 실선/점선) */
  k2: string;
}

export interface LaneIndex {
  segs: LaneSeg[];
  grid: Map<number, number[]>;
}

const CELL = 25;
const cellKey = (cx: number, cz: number) => (cx + 2000) * 4000 + (cz + 2000);

export function laneIndex(segs: LaneSeg[]): LaneIndex {
  const grid = new Map<number, number[]>();
  segs.forEach((s, id) => {
    const steps = Math.max(1, Math.ceil(Math.hypot(s.bx - s.ax, s.bz - s.az) / (CELL / 2)));
    const seen = new Set<number>();
    for (let k = 0; k <= steps; k++) {
      const x = s.ax + ((s.bx - s.ax) * k) / steps;
      const z = s.az + ((s.bz - s.az) * k) / steps;
      const key = cellKey(Math.floor(x / CELL), Math.floor(z / CELL));
      if (seen.has(key)) continue;
      seen.add(key);
      (grid.get(key) ?? grid.set(key, []).get(key)!).push(id);
    }
  });
  return { segs, grid };
}

export interface PieceLanes {
  /** 실제 가운데(양방향이면 중앙선, 한 방향이면 차로들의 가운데)가 지금 가운데선에서 진행 방향 오른쪽으로 떨어진 거리(m) */
  off: number;
  /** 진행 방향 차로 수 */
  lf: number;
  /** 반대 방향 차로 수(한 방향 길은 0) */
  lb: number;
  /** 차로 폭(m). 차선이 모자라 못 재면 NaN */
  lw: number;
  /** 중앙선: 0 없음, 1 황색 실선, 2 황색 점선, 3 황색 복선, 4 실선·점선 */
  ctype: number;
  /** 진행 방향 맨 오른쪽 차로가 가로변 버스전용차로 */
  busR: boolean;
  /** 반대 방향 맨 오른쪽 차로가 가로변 버스전용차로(양방향 길) */
  busL: boolean;
  /** 한 방향 길의 왼쪽 경계가 중앙버스전용차선(중앙버스차로가 붙은 길) */
  medBus: boolean;
  /** 읽은 단면 수 */
  n: number;
}

const YELLOW = new Set(['001', '002']);
const BUS_MED = new Set(['017']);
const WHITE = new Set(['006', '008', '005']);
const CURB = new Set(['007', '009', '010', '011', '015']);
const PAR = Math.sin((25 * Math.PI) / 180);
const HALF = 24;

interface Hit {
  t: number;
  k: string;
  k2: string;
}

function transect(idx: LaneIndex, x: number, z: number, ux: number, uz: number): Hit[] {
  const nx = -uz;
  const nz = ux;
  const out: Hit[] = [];
  const seen = new Set<number>();
  for (let s = -HALF; s <= HALF; s += CELL / 2) {
    const cx = Math.floor((x + nx * s) / CELL);
    const cz = Math.floor((z + nz * s) / CELL);
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++)
        for (const id of idx.grid.get(cellKey(cx + dx, cz + dz)) ?? []) {
          if (seen.has(id)) continue;
          seen.add(id);
          const g = idx.segs[id];
          const rx = g.bx - g.ax;
          const rz = g.bz - g.az;
          const rl = Math.hypot(rx, rz);
          if (rl < 1e-6 || Math.abs(rx * uz - rz * ux) / rl > PAR) continue; // 길과 나란하지 않은 선
          const den = nx * rz - nz * rx;
          if (Math.abs(den) < 1e-9) continue;
          const t = ((g.ax - x) * rz - (g.az - z) * rx) / den;
          const u = ((g.ax - x) * nz - (g.az - z) * nx) / den;
          if (t < -HALF || t > HALF || u < 0 || u > 1) continue;
          out.push({ t, k: g.k, k2: g.k2 });
        }
  }
  return out.sort((a, b) => a.t - b.t);
}

/** start 에서 dir(+1 오른쪽, −1 왼쪽)으로 차선을 세어 차로 수와, 연석선에 닿았으면 그 자리(못 닿으면 NaN)를 돌려준다.
 *  첫 차선까지의 간격은 경계선 굵기가 섞이므로 차로 폭에 넣지 않고, 중앙버스차로 옆 차로처럼 넓은 경우가 있어 6m 까지 한 차로로 본다 */
function count(hits: Hit[], start: number, dir: number, gaps: number[]): { lanes: number; last: string; edge: number } {
  const list = hits.filter((h) => (WHITE.has(h.k) || CURB.has(h.k)) && (h.t - start) * dir > 0.5).sort((a, b) => (a.t - b.t) * dir);
  let lanes = 1;
  let prev = start;
  let last = '';
  let edge = NaN;
  for (const h of list) {
    const gap = (h.t - prev) * dir;
    if (CURB.has(h.k)) {
      if (gap > 2.2) edge = h.t; // 길 가장자리
      break;
    }
    if (gap < 2.3) continue; // 겹선·잡음
    if (gap > (prev === start ? 6 : 4.6)) break;
    if (prev !== start) gaps.push(gap);
    lanes++;
    prev = h.t;
    last = h.k;
  }
  // 차로 수에 견줘 너무 넓거나 좁은 가장자리는 쓰지 않는다
  const w = (edge - start) * dir;
  if (!(w >= lanes * 2.6 && w <= lanes * 4.4 + 0.8)) edge = NaN;
  return { lanes, last, edge };
}

const median = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
};
const mode = (a: number[]) => {
  const c = new Map<number, number>();
  for (const v of a) c.set(v, (c.get(v) ?? 0) + 1);
  let best = a[0];
  for (const [v, n] of c) if (n > (c.get(best) ?? 0) || (n === c.get(best) && v > best)) best = v;
  return best;
};
const CTYPE: Record<string, number> = { '001': 1, '002': 2, '003': 3, '004': 4, '005': 4 };

/** 길 조각 pts([x,z] 목록, 진행 방향 순서)를 읽는다. 끝 15m(교차로)는 보지 않는다. 읽은 단면이 모자라면 null */
export function analysePiece(idx: LaneIndex, pts: [number, number][], oneway: boolean): PieceLanes | null {
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  const offs: number[] = [];
  const lfs: number[] = [];
  const lbs: number[] = [];
  const cts: number[] = [];
  const gaps: number[] = [];
  const perLane: number[] = []; // 연석까지 잰 차로 폭
  let busR = 0;
  let busL = 0;
  let medBus = 0;
  let samples = 0;
  let acc = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    const sl = Math.hypot(bx - ax, bz - az);
    if (sl < 1e-6) continue;
    const ux = (bx - ax) / sl;
    const uz = (bz - az) / sl;
    for (let s = (6 - (acc % 6)) % 6; s < sl; s += 6) {
      const d = acc + s;
      if (d < 15 || d > total - 15) continue;
      samples++;
      const hits = transect(idx, ax + ux * s, az + uz * s, ux, uz);
      if (!oneway) {
        let c: Hit | null = null;
        for (const h of hits) if (YELLOW.has(h.k) && Math.abs(h.t) <= 7 && (!c || Math.abs(h.t) < Math.abs(c.t))) c = h;
        if (!c) continue;
        const r = count(hits, c.t, 1, gaps);
        const l = count(hits, c.t, -1, gaps);
        offs.push(c.t);
        if (Number.isFinite(r.edge)) perLane.push((r.edge - c.t) / r.lanes);
        if (Number.isFinite(l.edge)) perLane.push((c.t - l.edge) / l.lanes);
        lfs.push(r.lanes);
        lbs.push(l.lanes);
        cts.push(CTYPE[c.k2] ?? 1);
        if (r.last === '005') busR++;
        if (l.last === '005') busL++;
      } else {
        let b: Hit | null = null;
        for (const h of hits) if ((YELLOW.has(h.k) || BUS_MED.has(h.k) || CURB.has(h.k)) && h.t < -0.5 && h.t > -16 && (!b || h.t > b.t)) b = h;
        if (!b) continue;
        const mine: number[] = [];
        const r = count(hits, b.t, 1, mine);
        gaps.push(...mine);
        const lw = mine.length ? median(mine) : 3.2;
        if (Number.isFinite(r.edge)) {
          offs.push((b.t + r.edge) / 2);
          perLane.push((r.edge - b.t) / r.lanes);
        } else offs.push(b.t + (r.lanes * lw) / 2);
        lfs.push(r.lanes);
        if (r.last === '005') busR++;
        if (BUS_MED.has(b.k)) medBus++;
      }
    }
    acc += sl;
  }
  const n = offs.length;
  if (n < 2 || n < samples * 0.3) return null;
  return {
    off: median(offs),
    lf: mode(lfs),
    lb: oneway ? 0 : mode(lbs),
    // 연석까지 잰 곳이 단면의 40% 넘으면 그 폭, 아니면 차선 사이 간격
    lw: perLane.length >= n * 0.4 ? median(perLane) : gaps.length >= 3 ? median(gaps) : NaN,
    ctype: oneway ? 0 : mode(cts),
    busR: busR > n * 0.4,
    busL: busL > n * 0.4,
    medBus: medBus > n * 0.4,
    n,
  };
}
