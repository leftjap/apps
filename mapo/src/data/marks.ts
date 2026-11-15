// 노면 표시 자료(public/data/marks.json, tools/bake.ts 가 서울시 교통안전시설물 자료로 굽는다)
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
}

export interface MarkLine {
  /** 서울시 차선 대분류(A058_KND_CDE) 번호: 1 중앙선, 4 정지선, 6 차선, 8 진로변경제한선, 12 주행유도선 ... */
  k: number;
  /** 중분류(A058_KND_CDE2): 실선·점선·겹선 */
  k2: number;
  /** [x, y, z, ...](m) */
  p: Float32Array;
}

export interface Marks {
  lines: MarkLine[];
  zones: { yellow: boolean; ring: Float32Array }[];
  /** 화살표: 종류(A055_KND_CDE 번호), 자리, 진행 방향(판 좌표 단위 벡터) */
  arrows: { kind: number; x: number; z: number; fx: number; fz: number }[];
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
  for (const l of j.l) {
    const xz = pts(l, 1, 2);
    const p = new Float32Array((xz.length / 2) * 3);
    for (let i = 0; i < xz.length / 2; i++) p.set([xz[i * 2], 0, xz[i * 2 + 1]], i * 3);
    lines.push({ k: Math.floor(l[0] / 10), k2: l[0] % 10, p });
  }
  for (const l of j.h) lines.push({ k: Math.floor(l[0] / 10), k2: l[0] % 10, p: Float32Array.from(pts(l, 1, 3)) });
  const zones = j.z.map((z) => ({ yellow: z[0] === 1, ring: Float32Array.from(pts(z, 1, 2)) }));
  const arrows: Marks['arrows'] = [];
  for (let i = 0; i + 3 < j.a.length; i += 4) {
    const t = (j.a[i + 3] * Math.PI) / 180;
    // 평면 좌표(동 x, 북 y)의 각도를 판 좌표(동 x, 남 z)로
    arrows.push({ kind: j.a[i], x: j.a[i + 1] / 10, z: j.a[i + 2] / 10, fx: Math.cos(t), fz: -Math.sin(t) });
  }
  return { lines, zones, arrows };
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
