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

/** 길을 따라간 거리 s(m)마다의 값 v. 렌더러가 선형 보간한다 */
export interface Profile {
  s: number[];
  v: number[];
}

const EDGE = new Set(['009', '010', '011']);
/** 칠한 가장자리선에서 연석까지(m) */
const PAINT_TO_CURB = 0.25;

/**
 * 길 조각 pts 를 따라 step(m)마다 단면을 긋고, 연석 쪽 가장자리선(009 길가장자리구역선, 010·011 주정차 금지선)으로
 * 진행 방향 오른쪽·왼쪽 찻길 가장자리까지의 거리(가운데선 기준, m)를 읽는다.
 * near: 차로 수 × 차로 폭으로 어림한 [오른쪽, 왼쪽] 가장자리. 그 절반 ~ 6m 바깥에서 가장 안쪽 선을 쓴다(어림값은 차로를 잘못 세거나 가운데선이 치우쳐 몇 m 틀릴 수 있고, 옆길 선은 버린다).
 * 끝 skip(m)은 교차로라 다른 길의 선이 걸리므로 읽지 않는다. 못 읽은 단면은 앞뒤로 40m 안에 읽은 값이 있으면 이어 채우고, 없으면 near 를 쓴다.
 * 결과는 0.2m 안으로 직선 보간되는 단면을 지워 줄인다.
 */
export function readEdges(idx: LaneIndex, pts: [number, number][], near: [number, number], step = 4, skip = 8): { right: Profile; left: Profile } {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = cum[cum.length - 1];
  const n = Math.max(2, Math.round(total / step) + 1);
  const S: number[] = [];
  const raw: [number, number][] = [];
  let seg = 0;
  for (let k = 0; k < n; k++) {
    const s = (total * k) / (n - 1);
    S.push(s);
    if (s < skip || s > total - skip || total < 1e-6) {
      raw.push([NaN, NaN]);
      continue;
    }
    while (seg + 1 < pts.length - 1 && cum[seg + 1] < s) seg++;
    const [ax, az] = pts[seg];
    const [bx, bz] = pts[seg + 1];
    const sl = cum[seg + 1] - cum[seg] || 1;
    const ux = (bx - ax) / sl;
    const uz = (bz - az) / sl;
    const f = (s - cum[seg]) / sl;
    const hits = transect(idx, ax + (bx - ax) * f, az + (bz - az) * f, ux, uz).filter((h) => EDGE.has(h.k));
    const pick = (dir: number, nearV: number) => {
      let best = NaN;
      for (const h of hits) {
        const d = h.t * dir;
        if (d < Math.max(0.3, nearV * 0.5) || d > nearV + 6) continue;
        if (Number.isNaN(best) || d < best) best = d;
      }
      return Number.isNaN(best) ? NaN : best + PAINT_TO_CURB;
    };
    raw.push([pick(1, near[0]), pick(-1, near[1])]);
  }
  const side = (j: 0 | 1): Profile => {
    const v = raw.map((r) => r[j]);
    // 하나만 튀는 값(옆 선·끊긴 선)은 앞뒤 셋의 중앙값으로
    const m = v.map((x, i) => {
      const w = [v[i - 1], x, v[i + 1]].filter((y) => y !== undefined && Number.isFinite(y)) as number[];
      return w.length === 3 ? [...w].sort((a, b) => a - b)[1] : x;
    });
    const filled = m.map((x, i) => {
      if (Number.isFinite(x)) return x;
      let a = i - 1;
      while (a >= 0 && !Number.isFinite(m[a])) a--;
      let b = i + 1;
      while (b < m.length && !Number.isFinite(m[b])) b++;
      const okA = a >= 0 && S[i] - S[a] <= 40;
      const okB = b < m.length && S[b] - S[i] <= 40;
      if (okA && okB) return m[a] + ((m[b] - m[a]) * (S[i] - S[a])) / (S[b] - S[a]);
      if (okA) return m[a];
      if (okB) return m[b];
      return near[j];
    });
    return thin(S, filled);
  };
  return { right: side(0), left: side(1) };
}

/** 직선 보간으로 0.2m 안에 드는 단면 지우기 */
function thin(S: number[], v: number[]): Profile {
  const keep = [0];
  for (let i = 1; i < v.length - 1; i++) {
    const a = keep[keep.length - 1];
    let ok = true;
    for (let q = a + 1; q <= i + 1 && ok; q++) {
      const t = (S[q] - S[a]) / (S[i + 1] - S[a]);
      if (Math.abs(v[a] + (v[i + 1] - v[a]) * t - v[q]) > 0.2) ok = false;
    }
    if (!ok) keep.push(i);
  }
  keep.push(v.length - 1);
  return { s: keep.map((i) => S[i]), v: keep.map((i) => v[i]) };
}

const valueAt = (p: Profile, s: number) => {
  let k = 0;
  while (k + 2 < p.s.length && p.s[k + 1] < s) k++;
  const t = Math.max(0, Math.min(1, (s - p.s[k]) / (p.s[k + 1] - p.s[k] || 1)));
  return p.v[k] + (p.v[k + 1] - p.v[k]) * t;
};

/**
 * 실폭도로(도로명주소 전자지도 도로 면, 선 종류 'RW') 경계로 찻길 가장자리를 고친다. 실폭도로는 건물 앞까지의 도로 부지라 보도가 있는 길에서는 보도 바깥 끝이다.
 * 단면마다 가운데선에서 0.3m ~ (지금 가장자리 + 1.5m) 사이 가장 안쪽 경계 d 를 찾는다(끝 skip m 는 교차로라 보지 않는다).
 *  - 연석선으로 읽은 쪽(curb): d 가 0.3m 넘게 안쪽일 때만 d 로 줄인다(찻길이 도로 부지 밖으로 나간 곳).
 *  - 어림값 쪽: d 로 바꾼다. 1.5m 넘게 바깥 경계는 보도가 있는 것으로 보고 그대로 둔다.
 * 하나만 튀는 단면은 앞뒤 셋의 중앙값으로 고르고, 0.2m 안으로 직선 보간되는 단면은 지운다.
 */
export function fitToRoadArea(idx: LaneIndex, pts: [number, number][], cur: { right: Profile; left: Profile }, curb: [boolean, boolean], step = 4, skip = 8): { right: Profile; left: Profile } {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = cum[cum.length - 1];
  const n = Math.max(2, Math.round(total / step) + 1);
  const S: number[] = [];
  const V: [number[], number[]] = [[], []];
  const prof = [cur.right, cur.left];
  let seg = 0;
  for (let k = 0; k < n; k++) {
    const s = (total * k) / (n - 1);
    S.push(s);
    const now = [valueAt(prof[0], s), valueAt(prof[1], s)];
    if (s < skip || s > total - skip || total < 1e-6) {
      V[0].push(now[0]);
      V[1].push(now[1]);
      continue;
    }
    while (seg + 1 < pts.length - 1 && cum[seg + 1] < s) seg++;
    const [ax, az] = pts[seg];
    const [bx, bz] = pts[seg + 1];
    const sl = cum[seg + 1] - cum[seg] || 1;
    const ux = (bx - ax) / sl;
    const uz = (bz - az) / sl;
    const f = (s - cum[seg]) / sl;
    const hits = transect(idx, ax + (bx - ax) * f, az + (bz - az) * f, ux, uz).filter((h) => h.k === 'RW');
    for (const j of [0, 1] as const) {
      const dir = j === 0 ? 1 : -1;
      let d = NaN;
      for (const h of hits) {
        const t = h.t * dir;
        if (t >= 0.3 && t <= now[j] + 1.5 && !(t >= d)) d = t;
      }
      V[j].push(Number.isNaN(d) ? now[j] : curb[j] ? (d < now[j] - 0.3 ? d : now[j]) : d);
    }
  }
  const side = (v: number[]) => thin(S, v.map((x, i) => (i > 0 && i < v.length - 1 ? [v[i - 1], x, v[i + 1]].sort((a, b) => a - b)[1] : x)));
  return { right: side(V[0]), left: side(V[1]) };
}

/**
 * 길 모퉁이 c(src/data/corners.ts)의 보도 모서리에서 두 갈래 사이 가운데 방향으로 나아가 처음 만나는 연석 쪽 가장자리선까지 거리 d 로
 * 모퉁이 반지름을 잰다: 두 가장자리에 접하는 반지름 R 의 호까지 거리는 R(1/sin(θ/2) − 1). 15m 안에 선이 없으면 NaN.
 */
export function cornerRadius(idx: LaneIndex, c: { kx: number; kz: number; ax: number; az: number; bx: number; bz: number; th: number }): number {
  let ux = c.ax + c.bx;
  let uz = c.az + c.bz;
  const L = Math.hypot(ux, uz);
  if (L < 1e-6) return NaN;
  ux /= L;
  uz /= L;
  const MAX = 15;
  let best = Infinity;
  const seen = new Set<number>();
  for (let s = 0; s <= MAX + CELL / 2; s += CELL / 2) {
    const cx = Math.floor((c.kx + ux * s) / CELL);
    const cz = Math.floor((c.kz + uz * s) / CELL);
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++)
        for (const id of idx.grid.get(cellKey(cx + dx, cz + dz)) ?? []) {
          if (seen.has(id)) continue;
          seen.add(id);
          const g = idx.segs[id];
          if (!EDGE.has(g.k)) continue;
          const rx = g.bx - g.ax;
          const rz = g.bz - g.az;
          const den = ux * rz - uz * rx;
          if (Math.abs(den) < 1e-9) continue;
          const t = ((g.ax - c.kx) * rz - (g.az - c.kz) * rx) / den;
          const u = ((g.ax - c.kx) * uz - (g.az - c.kz) * ux) / den;
          if (t > 0.05 && t <= MAX && u >= 0 && u <= 1) best = Math.min(best, t);
        }
  }
  if (!Number.isFinite(best)) return NaN;
  return best / (1 / Math.sin(c.th / 2) - 1);
}

/** 연결로 양쪽 경계로 보는 선: 연석 쪽 선·가장자리구역선, 중앙선, 중앙버스전용차선, 진로변경제한선(본선과 나뉘는 실선) */
const LINK_EDGE = new Set([...CURB, ...YELLOW, ...BUS_MED, '008']);
const LINK_LANE = new Set(['006', '005']);

/** 연결로 단면들: 4m 마다 [노선 거리 s, 경계선 사이 폭, 차로 수, 경계선 사이 가운데의 옆 거리(진행 방향 오른쪽 +)]. reach 는 경계선을 찾는 거리(m) */
export function linkSections(idx: LaneIndex, pts: [number, number][], reach = 7.5): { s: number; w: number; lanes: number; mid: number }[] {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = cum[cum.length - 1];
  const at = (s: number) => {
    let i = 1;
    while (i < pts.length - 1 && cum[i] < s) i++;
    const t = (s - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
    const [a, b] = [pts[i - 1], pts[i]];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, ux: (b[0] - a[0]) / L, uz: (b[1] - a[1]) / L };
  };
  const ss = total < 12 ? [total / 2] : Array.from({ length: Math.floor((total - 8) / 4) + 1 }, (_, k) => 4 + k * 4);
  const rows: { s: number; w: number; lanes: number; mid: number }[] = [];
  for (const s of ss) {
    const p = at(s);
    const hits = transect(idx, p.x, p.z, p.ux, p.uz);
    const right = hits.filter((h) => LINK_EDGE.has(h.k) && h.t > 0.6 && h.t <= reach).map((h) => h.t);
    const left = hits.filter((h) => LINK_EDGE.has(h.k) && h.t < -0.6 && h.t >= -reach).map((h) => h.t);
    if (!right.length || !left.length) continue;
    const r = Math.min(...right);
    const l = Math.max(...left);
    let lanes = 1;
    let prev = l;
    for (const h of hits.filter((h) => LINK_LANE.has(h.k) && h.t > l + 1.5 && h.t < r - 1.5).sort((a, b) => a.t - b.t))
      if (h.t - prev >= 2.3) (lanes++, (prev = h.t));
    rows.push({ s, w: r - l, lanes, mid: (r + l) / 2 });
  }
  return rows;
}

/**
 * 연결로 가운데선이 경계선 사이 가운데에서 1.5m 넘게(단면 가운데값, 단면 셋 넘게 모두 같은 쪽으로 1m 넘게) 어긋나면 모양 점을 그 가운데로 옮긴 점들.
 * 양 끝 노드는 그대로 둔다(이웃 조각과 이어진 자리).
 * 옮길 일이 없으면 null
 */
export function centerLink(pts: [number, number][], rows: { s: number; mid: number }[]): [number, number][] | null {
  // 단면 셋 넘게, 모두 같은 쪽으로 1m 넘게, 가운데값이 1.5m 넘게 어긋날 때만(단면 몇 개의 잡음으로 옮기지 않는다)
  if (rows.length < 3 || pts.length < 3 || Math.abs(median(rows.map((r) => r.mid))) <= 1.5) return null;
  const side = Math.sign(rows[0].mid);
  if (!rows.every((r) => Math.sign(r.mid) === side && Math.abs(r.mid) > 1)) return null;
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const midAt = (s: number) => {
    if (s <= rows[0].s) return rows[0].mid;
    for (let k = 1; k < rows.length; k++) if (s <= rows[k].s) return rows[k - 1].mid + ((rows[k].mid - rows[k - 1].mid) * (s - rows[k - 1].s)) / (rows[k].s - rows[k - 1].s || 1);
    return rows[rows.length - 1].mid;
  };
  return pts.map((p, i) => {
    if (i === 0 || i === pts.length - 1) return p;
    const [a, b] = [pts[i - 1], pts[i + 1]];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const m = midAt(cum[i]);
    // 진행 방향 오른쪽 (−dz, dx)
    return [p[0] - ((b[1] - a[1]) / L) * m, p[1] + ((b[0] - a[0]) / L) * m];
  });
}

/**
 * 연결로(OSM *_link) 조각: 4m 마다 단면에서 가운데선 양쪽으로 가장 가까운 경계선(reach 안)을 찾아 그 사이를 찻길로 본다.
 * 사이에 있는 차선으로 차로 수를 세고(차선 없이 넓으면 4.2m 마다 한 차로), 본선과 같은 단면에 걸려도 교통섬·실선 너머의 본선 차선은 세지 않는다. 읽은 단면이 둘 미만이면 null
 */
export function analyseLink(idx: LaneIndex, pts: [number, number][], oneway: boolean, reach = 7.5): PieceLanes | null {
  const rows = linkSections(idx, pts, reach);
  if (rows.length < 2) return null;
  const counted = mode(rows.map((r) => r.lanes));
  const pick = rows.filter((r) => r.lanes === counted);
  const w = median(pick.map((r) => r.w));
  // 차선 없이 넓은 연결로(차로 폭이 4m 를 크게 넘는 것)는 4.2m 마다 한 차로로 본다
  const lanes = Math.max(counted, Math.round((w - 1) / 4.2));
  const lw = (w - 1) / lanes;
  const lf = oneway ? lanes : Math.max(1, Math.ceil(lanes / 2));
  const lb = oneway ? 0 : Math.max(1, lanes - lf);
  return { off: median(pick.map((r) => r.mid)), lf, lb, lw: oneway ? lw : (w - 1) / (lf + lb), ctype: 0, busR: false, busL: false, medBus: false, n: rows.length };
}
