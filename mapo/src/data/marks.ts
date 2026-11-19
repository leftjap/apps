// 노면 표시 자료(public/data/marks.json, tools/bake.ts 가 서울시 교통안전시설물 자료로 굽고, 차로를 가르는 선·정지선은 tools/road/marks.ts 가 길 정본에서 다시 만든다)
export interface MarksJson {
  v: 1;
  /** 땅 위 선마다 [종류 × 10 + 중분류, 점 수, 첫 점 x, z, 뒤 점마다 앞 점과의 차이 x, z](dm) */
  l: number[][];
  /** 고가 위 선: 점마다 x, y, z */
  h: number[][];
  /** 안전지대 [황색 1·백색 0, 점 수, 첫 점, 차이...] */
  z: number[][];
  /** 노면 화살표 [종류, x, z(dm), 각도(평면 좌표 동쪽에서 반시계, 도), ...] */
  a: number[];
  /** 화살표마다 놓인 차선 칸 폭(dm, 양옆 칠한 선 사이). 0 = 칸을 찾지 못함(재작업 W14) */
  aw?: number[];
  /** 땅 위 선(l)마다 점선 위상(dm): 첫 점이 이어진 줄에서 놓인 자리. 정본에서 만든 선이 이음매·자른 자리를 넘어 같은 점선 무늬를 이어 간다(재작업 W49). 없으면 0 */
  ld?: number[];
  /** 그리기용 횡단보도 면: 면마다 [횡단보도 번호(board crosswalks), 점 수, 첫 점 x, z, 뒤 점마다 차이 x, z](dm). 서울시 면을 그린 찻길 면 경계까지 늘인 것(재작업 W57, tools/road/crossings.ts). 든 횡단보도는 서울시 면 대신 이 면을 그린다 */
  x?: number[][];
}

export interface MarkLine {
  /** 서울시 차선 대분류(A058_KND_CDE) 번호: 1 중앙선, 4 정지선, 6 차선, 8 진로변경제한선, 12 주행유도선 ... */
  k: number;
  /** 중분류(A058_KND_CDE2): 실선·점선·겹선 */
  k2: number;
  /** [x, y, z, ...](m) */
  p: Float32Array;
  /** 점선 위상(m): 첫 점이 이어진 줄에서 놓인 자리(재작업 W49) */
  d?: number;
}

export interface Marks {
  lines: MarkLine[];
  zones: { yellow: boolean; ring: Float32Array }[];
  /** 화살표: 종류(A055_KND_CDE 번호), 자리, 진행 방향(판 좌표 단위 벡터), 놓인 차선 칸 폭(m, 0 = 모름) */
  arrows: { kind: number; x: number; z: number; fx: number; fz: number; w: number }[];
  /** 그리기용 횡단보도 면(횡단보도 번호 → 면들, 재작업 W57). 차·사람은 읽지 않는다 */
  crossings: Map<number, Float32Array[]>;
}

/** [점 수, 첫 점, 차이...] 를 dim 차원 점들로 */
function pts(a: number[], from: number, dim: number): number[] {
  const n = a[from];
  const out: number[] = [];
  const cur = new Array(dim).fill(0);
  for (let i = 0; i < n; i++) for (let d = 0; d < dim; d++) out.push((cur[d] += a[from + 1 + i * dim + d]) / 10);
  return out;
}

export function decodeMarks(j: MarksJson): Marks {
  const lines: MarkLine[] = [];
  j.l.forEach((l, i) => {
    const xz = pts(l, 1, 2);
    const p = new Float32Array((xz.length / 2) * 3);
    for (let i = 0; i < xz.length / 2; i++) p.set([xz[i * 2], 0, xz[i * 2 + 1]], i * 3);
    lines.push({ k: Math.floor(l[0] / 10), k2: l[0] % 10, p, d: (j.ld?.[i] ?? 0) / 10 });
  });
  for (const l of j.h) lines.push({ k: Math.floor(l[0] / 10), k2: l[0] % 10, p: Float32Array.from(pts(l, 1, 3)), d: 0 });
  const zones = j.z.map((z) => ({ yellow: z[0] === 1, ring: Float32Array.from(pts(z, 1, 2)) }));
  const arrows: Marks['arrows'] = [];
  for (let i = 0; i + 3 < j.a.length; i += 4) {
    const t = (j.a[i + 3] * Math.PI) / 180;
    // 평면 좌표(동 x, 북 y)의 각도를 판 좌표(동 x, 남 z)로
    arrows.push({ kind: j.a[i], x: j.a[i + 1] / 10, z: j.a[i + 2] / 10, fx: Math.cos(t), fz: -Math.sin(t), w: (j.aw?.[i / 4] ?? 0) / 10 });
  }
  const crossings = new Map<number, Float32Array[]>();
  for (const f of j.x ?? []) (crossings.get(f[0]) ?? crossings.set(f[0], []).get(f[0])!).push(Float32Array.from(pts(f, 1, 2)));
  return { lines, zones, arrows, crossings };
}

/** 노면 표시 정지선(4) 꺾은선을 선분 [x0, z0, x1, z1, ...]으로: 신호등 기둥 자리(render/signals.ts). 정지선은 차가 서는 자리에서 길 정본으로 굽는다(재작업 W49) */
export function stopSegments(lines: MarkLine[]): Float32Array {
  const out: number[] = [];
  for (const l of lines) {
    if (l.k !== 4) continue;
    for (let k = 3; k < l.p.length; k += 3) out.push(l.p[k - 3], l.p[k - 1], l.p[k], l.p[k + 2]);
  }
  return Float32Array.from(out);
}

/** 선 모양: 색(0 백 1 황 2 청), 한 줄 폭(m), 겹선이면 두 줄 가운데 사이의 반(m), 왼쪽·오른쪽 줄 점선(0 실선, 1 3m 칠하고 5m 띄움, 2 1m 칠하고 1m 띄움, 3 0.5m 칠하고 0.5m 띄움) */
export function lineStyle(k: number, k2: number): { color: number; w: number; sep: number; dashL: number; dashR: number } {
  const yellow = k === 1 || k === 2 || k === 9 || k === 10 || (k === 16 && k2 === 1);
  const blue = k === 5 || k === 17 || k === 18;
  const color = yellow ? 1 : blue ? 2 : 0;
  // 겹선: 중앙선 복선·실선/점선, 가변차선, 버스전용 복선, 진로변경제한선 실선/점선
  const double = (k === 1 && k2 >= 3) || k === 2 || ((k === 5 || k === 17 || k === 18) && k2 >= 3) || (k === 8 && k2 >= 2);
  const dashed = (k === 1 && k2 === 2) || (k === 2 && k2 === 2) || k === 3 || ((k === 5 || k === 17 || k === 18) && (k2 === 2 || k2 === 4)) || (k === 6 && k2 === 2);
  const fine = k === 9 || k === 11 || k === 12;
  // 자전거횡단도(013, 별표 6 의 534): 백색 0.5m 정사각형을 0.5m 간격으로 한 줄. 자료 정의서는 청색실선이라 적지만 항공사진의 칠은 흰 네모 줄이다
  const bike = k === 13;
  let dashL = dashed ? 1 : fine ? 2 : bike ? 3 : 0;
  let dashR = dashL;
  // 실선/점선 겹선: 한 줄만 점선(어느 쪽인지 자료로는 알 수 없어 중분류 순서대로 왼쪽을 앞 이름으로 둔다)
  if ((k === 1 && k2 === 4) || (k === 8 && k2 === 2)) [dashL, dashR] = [0, 1];
  if ((k === 1 && k2 === 5) || (k === 8 && k2 === 3)) [dashL, dashR] = [1, 0];
  const w = k === 4 ? 0.45 : bike ? 0.5 : k === 14 ? 0.2 : 0.15;
  return { color, w, sep: double ? 0.18 : 0, dashL, dashR };
}

/**
 * 화살표 모양(앞 +u, 왼쪽 +v, m)의 다각형들(재작업 W14: 도로교통법 시행규칙 별표 6 진행방향 표시처럼 굵기 0.3m 줄기가 둥글게 꺾여 머리로 끝난다).
 * 줄기는 꺾은선을 따라 0.3m 띠, 머리는 밑변 1.1m·길이 1.3m 삼각형. 한 화살표는 감싸는 사각형 가운데가 자료 점(차선 칸 가운데)에 오게 옮긴다
 */
const HW = 0.15;
const stroke = (path: number[][]): number[][] => {
  const out: number[][] = [];
  for (let i = 0; i + 1 < path.length; i++) {
    const [au, av] = path[i];
    const [bu, bv] = path[i + 1];
    const l = Math.hypot(bu - au, bv - av) || 1;
    // 이음매 틈이 없게 양 끝을 반폭만큼 늘인다
    const [tu, tv] = [((bu - au) / l) * HW, ((bv - av) / l) * HW];
    const [nu, nv] = [-tv, tu];
    out.push([au - tu + nu, av - tv + nv, bu + tu + nu, bv + tv + nv, bu + tu - nu, bv + tv - nv, au - tu - nu, av - tv - nv]);
  }
  return out;
};
/** (u, v)에서 (du, dv) 쪽을 가리키는 머리 */
const head = (u: number, v: number, du: number, dv: number): number[] => {
  const [pu, pv] = [-dv * 0.55, du * 0.55];
  return [u + pu, v + pv, u + du * 1.3, v + dv * 1.3, u - pu, v - pv];
};
/** 중심 (cu, cv), 반지름 r 의 호를 a0 → a1(라디안, 점 = 중심 + r(sin a, −cos a))로 */
const arc = (cu: number, cv: number, r: number, a0: number, a1: number): number[][] =>
  Array.from({ length: 9 }, (_, k) => {
    const a = a0 + ((a1 - a0) * k) / 8;
    return [cu + r * Math.sin(a), cv - r * Math.cos(a)];
  });
const mirror = (polys: number[][]) => polys.map((q) => q.map((x, i) => (i % 2 ? -x : x)));
const Q = Math.PI / 2;
const LEFT = (u0: number) => [...stroke([[u0, 0], ...arc(u0, 0.7, 0.7, 0, Q)]), head(u0 + 0.7, 0.7, 0, 1)];
const PARTS: Record<string, number[][]> = {
  straight: [...stroke([[-2.6, 0], [0.6, 0]]), head(0.6, 0, 1, 0)],
  // 좌회전: 줄기가 둥글게 왼쪽으로 꺾여 왼쪽을 가리킨다
  left: [...stroke([[-2.6, 0], [-0.2, 0]]), ...LEFT(-0.2)],
  // 직진 화살표에 붙는 갈래: 줄기 가운데쯤에서 왼쪽으로
  sideLeft: LEFT(-1.3),
  uturn: [...stroke([[-2.6, 0], [0.4, 0], ...arc(0.4, 0.6, 0.6, 0, 2 * Q), [-0.4, 1.2]]), head(-0.4, 1.2, -1, 0)],
  // 직진·좌회전과 함께 쓰는 짧은 유턴 갈래
  sideU: [...stroke([[-0.6, 0], ...arc(-0.6, 0.6, 0.6, 0, 2 * Q), [-0.9, 1.2]]), head(-0.9, 1.2, -1, 0)],
  topU: [...stroke([[0.5, 0], [1.4, 0], ...arc(1.4, 0.6, 0.6, 0, 2 * Q), [1.1, 1.2]]), head(1.1, 1.2, -1, 0)],
  shaft: stroke([[-2.6, 0], [0.5, 0]]),
  ban: [],
  yield: [[1.5, -1.0, 1.5, 1.0, -1.5, 0]],
};
PARTS.right = mirror(PARTS.left);
PARTS.sideRight = mirror(PARTS.sideLeft);
PARTS.uturnR = mirror(PARTS.uturn);
/** 방향표시 종류(A055_KND_CDE, 서울시 「교통안전시설물 테이블 정의서(방향표시)」 코드표) → 모양. 금지는 그 화살표에 X 를 겹친다. 오르막·자전거 표시는 그리지 않는다 */
const GLYPH: Record<number, string[]> = {
  1: ['right', 'ban'], 2: ['straight', 'ban'], 3: ['left', 'right', 'ban'], 4: ['uturn', 'ban'],
  5: ['left'], 6: ['right'], 7: ['straight'], 8: ['straight', 'sideLeft'], 9: ['straight', 'sideRight'], 10: ['uturn'],
  11: ['shaft', 'sideLeft', 'topU'], 12: ['left', 'ban'], 13: ['left', 'right'], 14: ['straight', 'sideLeft', 'sideRight'], 15: ['straight', 'sideU'],
  16: ['straight', 'sideU', 'ban'], 17: ['straight', 'sideRight', 'ban'], 18: ['straight', 'sideLeft', 'ban'], 20: ['uturnR'], 21: ['yield'], 24: ['shaft', 'sideLeft', 'topU', 'ban'],
};
/** 종류마다 다각형(u, v)들: 감싸는 사각형 가운데를 0 으로 옮기고, 금지면 그 가운데에 X 를 겹친다 */
const SHAPES: Record<number, number[][]> = Object.fromEntries(
  Object.entries(GLYPH).map(([k, names]) => {
    const polys = names.flatMap((n) => PARTS[n]);
    let [u0, v0, u1, v1] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const q of polys) for (let i = 0; i < q.length; i += 2) (u0 = Math.min(u0, q[i])), (u1 = Math.max(u1, q[i])), (v0 = Math.min(v0, q[i + 1])), (v1 = Math.max(v1, q[i + 1]));
    const [cu, cv] = [(u0 + u1) / 2, (v0 + v1) / 2];
    const out = polys.map((q) => q.map((x, i) => x - (i % 2 ? cv : cu)));
    if (names.includes('ban')) out.push(...stroke([[-0.9, -0.9], [0.9, 0.9]]), ...stroke([[-0.9, 0.9], [0.9, -0.9]]));
    return [Number(k), out];
  }),
);

/** 화살표 모양 한쪽 끝에서 다른 쪽 끝까지 옆 폭(m, 줄이기 전) */
export function arrowSpan(kind: number): number {
  const s = SHAPES[kind];
  if (!s) return 0;
  let v = 0;
  for (const q of s) for (let i = 1; i < q.length; i += 2) v = Math.max(v, Math.abs(q[i]));
  return 2 * v;
}

/**
 * 종류 kind 화살표의 다각형들(앞 +u, 왼쪽 +v, 가운데 0). w 는 놓인 차선 칸 폭(m): 화살표 옆 폭이 칸 폭에서 양쪽 0.3m 를 뺀 것보다 크면
 * 옆 방향만 그만큼 줄인다(재작업 W14). 그리지 않는 종류는 null
 */
export function arrowShape(kind: number, w = 0): number[][] | null {
  const s = SHAPES[kind];
  if (!s) return null;
  const span = arrowSpan(kind);
  const k = w > 0 && span > w - 0.6 ? Math.max(0.3, (w - 0.6) / span) : 1;
  return k === 1 ? s : s.map((q) => q.map((x, i) => (i % 2 ? x * k : x)));
}

/** 횡단보도 줄무늬 면(평면 [x, z, ...]) */
export type Band = ArrayLike<number>;

/**
 * 앱이 그리는 횡단보도 줄무늬 면들(render/signals.ts makeSignalMarks 와 같은 선택): 판 횡단보도마다 늘인 면(marks.crossings)이 있으면 그것,
 * 없으면 서울시 면(c.rings). 판에 없는 골목·진입로 입구 면(board.crosswalkMarks)도 더한다(재작업 W59)
 */
export function crossingBands(crosswalks: { rings: ArrayLike<number>[] }[], crossings: Map<number, Float32Array[]>, crosswalkMarks: ArrayLike<number>[] = []): Band[] {
  const out: Band[] = [];
  crosswalks.forEach((c, i) => out.push(...(crossings.get(i) ?? c.rings)));
  out.push(...crosswalkMarks);
  return out;
}

const BAND_CELL = 10;
interface BandIndex {
  boxes: Float64Array;
  cells: Map<number, number[]>;
}
const bandIndexes = new WeakMap<Band[], BandIndex>();
const cellKey = (gx: number, gz: number) => (gx + 50000) * 100000 + (gz + 50000);
/** 면 감싸는 사각형을 10m 칸에 넣은 색인(같은 면 배열이면 다시 만들지 않는다) */
function bandIndex(bands: Band[]): BandIndex {
  const hit = bandIndexes.get(bands);
  if (hit) return hit;
  const boxes = new Float64Array(bands.length * 4);
  const cells = new Map<number, number[]>();
  bands.forEach((r, b) => {
    let [x0, z0, x1, z1] = [Infinity, Infinity, -Infinity, -Infinity];
    for (let k = 0; k + 1 < r.length; k += 2) (x0 = Math.min(x0, r[k])), (x1 = Math.max(x1, r[k])), (z0 = Math.min(z0, r[k + 1])), (z1 = Math.max(z1, r[k + 1]));
    boxes.set([x0, z0, x1, z1], b * 4);
    if (!(x0 <= x1)) return;
    for (let gx = Math.floor(x0 / BAND_CELL); gx <= Math.floor(x1 / BAND_CELL); gx++)
      for (let gz = Math.floor(z0 / BAND_CELL); gz <= Math.floor(z1 / BAND_CELL); gz++) {
        const key = cellKey(gx, gz);
        (cells.get(key) ?? cells.set(key, []).get(key)!).push(b);
      }
  });
  const idx = { boxes, cells };
  bandIndexes.set(bands, idx);
  return idx;
}
/** 사각형 [x0, z0, x1, z1] 을 r m 늘인 것과 감싸는 사각형이 겹치는 면 번호들 */
function bandsNear(idx: BandIndex, x0: number, z0: number, x1: number, z1: number, r: number): number[] {
  const out = new Set<number>();
  for (let gx = Math.floor((x0 - r) / BAND_CELL); gx <= Math.floor((x1 + r) / BAND_CELL); gx++)
    for (let gz = Math.floor((z0 - r) / BAND_CELL); gz <= Math.floor((z1 + r) / BAND_CELL); gz++)
      for (const b of idx.cells.get(cellKey(gx, gz)) ?? []) {
        const o = b * 4;
        if (idx.boxes[o] <= x1 + r && idx.boxes[o + 2] >= x0 - r && idx.boxes[o + 1] <= z1 + r && idx.boxes[o + 3] >= z0 - r) out.add(b);
      }
  return [...out];
}
function inBand(r: Band, x: number, z: number): boolean {
  let c = false;
  for (let i = 0, j = r.length - 2; i + 1 < r.length; j = i, i += 2) {
    const [xi, zi, xj, zj] = [r[i], r[i + 1], r[j], r[j + 1]];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}
function segPointDist(ax: number, az: number, bx: number, bz: number, x: number, z: number): number {
  const [dx, dz] = [bx - ax, bz - az];
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(ax + dx * t - x, az + dz * t - z);
}
/** 점에서 면까지 거리(면 안이면 0) */
function bandDist(r: Band, x: number, z: number): number {
  if (inBand(r, x, z)) return 0;
  let best = Infinity;
  for (let i = 0, j = r.length - 2; i + 1 < r.length; j = i, i += 2) best = Math.min(best, segPointDist(r[j], r[j + 1], r[i], r[i + 1], x, z));
  return best;
}
/** 두 선분 사이 거리(만나면 0) */
function segSegDist(ax: number, az: number, bx: number, bz: number, cx: number, cz: number, dx: number, dz: number): number {
  const cr = (px: number, pz: number, qx: number, qz: number, rx: number, rz: number) => (qx - px) * (rz - pz) - (qz - pz) * (rx - px);
  const [d1, d2, d3, d4] = [cr(ax, az, bx, bz, cx, cz), cr(ax, az, bx, bz, dx, dz), cr(cx, cz, dx, dz, ax, az), cr(cx, cz, dx, dz, bx, bz)];
  if (d1 * d2 < 0 && d3 * d4 < 0) return 0;
  return Math.min(segPointDist(ax, az, bx, bz, cx, cz), segPointDist(ax, az, bx, bz, dx, dz), segPointDist(cx, cz, dx, dz, ax, az), segPointDist(cx, cz, dx, dz, bx, bz));
}


/** clipLines 가 센 것: 잘린 선 수, 버린 짧은 조각 수(0.5m 아래), 통째로 사라진 선 수 */
export interface ClipStats {
  cut: number;
  dropped: number;
  removed: number;
}

/**
 * 칠한 선을 횡단보도 줄무늬 면 앞에서 끊는다(재작업 W59, 그릴 때만. 실제 길의 차선·중앙선·정지선은 횡단보도 앞에서 끝난다).
 * 선 가운데가 어느 면 안이거나 gap + 반폭(겹선 사이 + 한 줄 반폭, lineStyle) 안인 부분을 지우고 그 자리에서 나눈다.
 * 정지선(4)은 gap 0(그리는 폭이 면과 겹치는 부분만), 자전거횡단도(13)는 횡단보도 옆을 따라 긋는 선이라 자르지 않는다.
 * 새 조각의 점선 위상 d 는 옛 첫 점에서 잰 거리만큼 더해 무늬가 이어진다. 0.5m 보다 짧은 조각은 버린다. 고가 위 선은 그대로 둔다
 */
export function clipLines(lines: MarkLine[], bands: Band[], gap = 0.5, stats?: ClipStats): MarkLine[] {
  const idx = bandIndex(bands);
  const out: MarkLine[] = [];
  for (const l of lines) {
    // 자전거횡단도(13)는 횡단보도 옆을 따라 긋는 선이라 자르지 않는다
    if (l.k === 13) {
      out.push(l);
      continue;
    }
    const n = l.p.length / 3;
    const st = lineStyle(l.k, l.k2);
    // 정지선(4)은 그리는 폭이 면과 겹치는 부분만 지운다(틈 0). 가깝다는 것만으로 지우지 않는다
    const lim = (l.k === 4 ? 0 : gap) + st.sep + st.w / 2;
    let [x0, z0, x1, z1] = [Infinity, Infinity, -Infinity, -Infinity];
    for (let k = 0; k < l.p.length; k += 3) (x0 = Math.min(x0, l.p[k])), (x1 = Math.max(x1, l.p[k])), (z0 = Math.min(z0, l.p[k + 2])), (z1 = Math.max(z1, l.p[k + 2]));
    // 고가 위 선(높이 0.3m 넘는 점이 있음)은 땅 위 횡단보도와 닿지 않는다
    let elevated = false;
    for (let k = 1; k < l.p.length; k += 3) if (Math.abs(l.p[k]) > 0.3) elevated = true;
    const cand = n < 2 || elevated ? [] : bandsNear(idx, x0, z0, x1, z1, lim);
    if (!cand.length) {
      out.push(l);
      continue;
    }
    // 첫 점에서 이어진 거리 s 의 점
    const cum = new Float64Array(n);
    for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + Math.hypot(l.p[i * 3] - l.p[i * 3 - 3], l.p[i * 3 + 2] - l.p[i * 3 - 1]);
    const total = cum[n - 1];
    const at = (s: number): number[] => {
      let i = 1;
      while (i < n - 1 && cum[i] < s) i++;
      const t = cum[i] > cum[i - 1] ? Math.max(0, Math.min(1, (s - cum[i - 1]) / (cum[i] - cum[i - 1]))) : 0;
      const [a, b] = [(i - 1) * 3, i * 3];
      return [l.p[a] + (l.p[b] - l.p[a]) * t, l.p[a + 1] + (l.p[b + 1] - l.p[a + 1]) * t, l.p[a + 2] + (l.p[b + 2] - l.p[a + 2]) * t];
    };
    const blocked = (s: number) => {
      const [x, , z] = at(s);
      for (const b of cand) {
        const o = b * 4;
        if (idx.boxes[o] > x + lim || idx.boxes[o + 2] < x - lim || idx.boxes[o + 1] > z + lim || idx.boxes[o + 3] < z - lim) continue;
        if (bandDist(bands[b], x, z) < lim) return true;
      }
      return false;
    };
    // 0.1m 걸음으로 막힌 곳을 찾고, 바뀌는 자리는 막힌 쪽 바깥 0.005m 안으로 좁힌다
    const edge = (a: number, b: number, aBlocked: boolean) => {
      while (b - a > 0.005) {
        const m = (a + b) / 2;
        if (blocked(m) === aBlocked) a = m;
        else b = m;
      }
      return aBlocked ? b : a;
    };
    const keep: [number, number][] = [];
    const steps = Math.max(1, Math.ceil(total / 0.1));
    let [prevS, prevB] = [0, blocked(0)];
    let start = 0;
    let any = prevB;
    for (let q = 1; q <= steps; q++) {
      const s = (total * q) / steps;
      const b = blocked(s);
      if (b !== prevB) {
        any = true;
        const e = edge(prevS, s, prevB);
        if (b) keep.push([start, e]);
        else start = e;
      }
      [prevS, prevB] = [s, b];
    }
    if (!prevB) keep.push([start, total]);
    if (!any) {
      out.push(l);
      continue;
    }
    if (stats) stats.cut++;
    let kept = 0;
    for (const [s0, s1] of keep) {
      if (s1 - s0 < 0.5) {
        if (stats) stats.dropped++;
        continue;
      }
      const p = at(s0);
      for (let i = 0; i < n; i++) if (cum[i] > s0 + 1e-6 && cum[i] < s1 - 1e-6) p.push(l.p[i * 3], l.p[i * 3 + 1], l.p[i * 3 + 2]);
      p.push(...at(s1));
      out.push({ k: l.k, k2: l.k2, p: Float32Array.from(p), d: (l.d ?? 0) + s0 });
      kept++;
    }
    if (!kept && stats) stats.removed++;
  }
  return out;
}

/**
 * 그리는 화살표 모양(arrowShape, render/marks.ts 와 같이 앞 (fx, fz), 왼쪽 (fz, −fx))이 gap m 늘인 횡단보도 줄무늬 면과 겹치는가(재작업 W59).
 * 참이면 그리지 않는다(자료는 그대로, 차 그래프는 그대로 읽는다)
 */
export function arrowOnCrossing(a: Marks['arrows'][number], bands: Band[], gap = 0.3): boolean {
  const shape = arrowShape(a.kind, a.w);
  if (!shape) return false;
  const polys = shape.map((q) => {
    const o: number[] = [];
    for (let k = 0; k < q.length; k += 2) o.push(a.x + a.fx * q[k] + a.fz * q[k + 1], a.z + a.fz * q[k] - a.fx * q[k + 1]);
    return o;
  });
  let [x0, z0, x1, z1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const q of polys) for (let k = 0; k < q.length; k += 2) (x0 = Math.min(x0, q[k])), (x1 = Math.max(x1, q[k])), (z0 = Math.min(z0, q[k + 1])), (z1 = Math.max(z1, q[k + 1]));
  const idx = bandIndex(bands);
  for (const b of bandsNear(idx, x0, z0, x1, z1, gap)) {
    const r = bands[b];
    for (const q of polys) {
      if (inBand(r, q[0], q[1]) || inBand(q, r[0], r[1])) return true;
      for (let i = 0, j = q.length - 2; i < q.length; j = i, i += 2)
        for (let m = 0, h = r.length - 2; m + 1 < r.length; h = m, m += 2) if (segSegDist(q[j], q[j + 1], q[i], q[i + 1], r[h], r[h + 1], r[m], r[m + 1]) < gap) return true;
    }
  }
  return false;
}

