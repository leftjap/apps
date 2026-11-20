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

/**
 * 그릴 노면 표시(재작업 W60 순서 3): 땅 위 선은 빗금(안전지대) 테두리에서 잘라 빗금 안(테두리에서 GORE_IN 넘게 안쪽) 조각을 빼고, 빗금 안 화살표는 그리지 않는다.
 * 차로 정본은 빗금 위를 지나는 자리가 있어(읽은 단면 없이 이은 차로 등) 정본에서 만든 차선·정지선·화살표가 빗금 안에 놓이기도 한다. 차로를 빼면 찻길 면·교차로·정지선이
 * 함께 바뀌어 정본은 그대로 두고 그릴 때만 지운다(2026-11-20 지오 결정). 차·사람이 읽는 자료(화살표의 차로 회전 등)는 바꾸지 않는다
 */
const GORE_IN = 0.3;
export function drawnMarks(m: Marks): Marks {
  const zones = m.zones.map(({ ring: r }) => {
    let [x0, x1, z0, z1] = [Infinity, -Infinity, Infinity, -Infinity];
    for (let k = 0; k < r.length; k += 2) (x0 = Math.min(x0, r[k])), (x1 = Math.max(x1, r[k])), (z0 = Math.min(z0, r[k + 1])), (z1 = Math.max(z1, r[k + 1]));
    return { r, x0, x1, z0, z1 };
  });
  type Z = (typeof zones)[number];
  const inZ = (q: Z, x: number, z: number) => {
    if (x < q.x0 || x > q.x1 || z < q.z0 || z > q.z1) return false;
    const r = q.r;
    let inside = false;
    for (let a = 0, b = r.length - 2; a < r.length; b = a, a += 2) if (r[a + 1] > z !== r[b + 1] > z && x < r[a] + ((z - r[a + 1]) / (r[b + 1] - r[a + 1])) * (r[b] - r[a])) inside = !inside;
    return inside;
  };
  const edgeDist = (q: Z, x: number, z: number) => {
    const r = q.r;
    let d = Infinity;
    for (let a = 0, b = r.length - 2; a < r.length; b = a, a += 2) {
      const dx = r[a] - r[b];
      const dz = r[a + 1] - r[b + 1];
      const t = Math.max(0, Math.min(1, ((x - r[b]) * dx + (z - r[b + 1]) * dz) / (dx * dx + dz * dz || 1)));
      d = Math.min(d, Math.hypot(r[b] + dx * t - x, r[b + 1] + dz * t - z));
    }
    return d;
  };
  const deep = (near: Z[], x: number, z: number) => near.some((q) => inZ(q, x, z) && edgeDist(q, x, z) > GORE_IN);
  const lines: MarkLine[] = [];
  for (const ln of m.lines) {
    const p = ln.p;
    const n = p.length / 3;
    let [x0, x1, z0, z1] = [Infinity, -Infinity, Infinity, -Infinity];
    let ground = true;
    for (let i = 0; i < n; i++) {
      (x0 = Math.min(x0, p[i * 3])), (x1 = Math.max(x1, p[i * 3])), (z0 = Math.min(z0, p[i * 3 + 2])), (z1 = Math.max(z1, p[i * 3 + 2]));
      if (Math.abs(p[i * 3 + 1]) > 0.5) ground = false;
    }
    const near = ground ? zones.filter((q) => q.x0 <= x1 && q.x1 >= x0 && q.z0 <= z1 && q.z1 >= z0) : [];
    if (!near.length) {
      lines.push(ln);
      continue;
    }
    // 선분마다 빗금 테두리와 만나는 자리에서 나누고, 조각 가운데가 빗금 안이면 그 조각을 뺀다. 남은 조각은 이어 붙이고 점선 위상은 그 자리까지 간 거리만큼 옮긴다
    // 양쪽이 빗금에서 잘린 1m 보다 짧은 토막(빗금 테두리를 스치는 자리)은 그리지 않는다
    let cur: number[] = [];
    let start = ln.d ?? 0;
    let along = ln.d ?? 0;
    let cutBefore = false;
    const flush = (cutAfter: boolean) => {
      let len = 0;
      for (let k = 3; k < cur.length; k += 3) len += Math.hypot(cur[k] - cur[k - 3], cur[k + 2] - cur[k - 1]);
      if (cur.length >= 6 && !(cutBefore && cutAfter && len < 1)) lines.push({ k: ln.k, k2: ln.k2, p: Float32Array.from(cur), d: start });
      cur = [];
      cutBefore = true;
    };
    for (let i = 1; i < n; i++) {
      const [ax, ay, az, bx, by, bz] = [p[i * 3 - 3], p[i * 3 - 2], p[i * 3 - 1], p[i * 3], p[i * 3 + 1], p[i * 3 + 2]];
      const ts = [0, 1];
      for (const q of near) {
        const r = q.r;
        for (let a = 0, b = r.length - 2; a < r.length; b = a, a += 2) {
          const ex = r[a] - r[b];
          const ez = r[a + 1] - r[b + 1];
          const den = (bx - ax) * ez - (bz - az) * ex;
          if (Math.abs(den) < 1e-12) continue;
          const t = ((r[b] - ax) * ez - (r[b + 1] - az) * ex) / den;
          const u = ((r[b] - ax) * (bz - az) - (r[b + 1] - az) * (bx - ax)) / den;
          if (t > 0 && t < 1 && u >= 0 && u <= 1) ts.push(t);
        }
      }
      ts.sort((u, v) => u - v);
      const L = Math.hypot(bx - ax, bz - az);
      // 테두리를 따라 비스듬히 들어가는 선도 자르게 0.25m 보다 긴 조각은 더 잘게 보고, 조각 양 끝·가운데 가운데 하나라도 빗금 안이면 뺀다.
      // 잘게 본 자리는 점으로 남기지 않는다(남긴 조각이 끝나는 자리만 점으로 넣는다. 같은 점이 이어지면 그리는 선 폭이 0 이 된다)
      const fine = [ts[0]];
      for (let j = 1; j < ts.length; j++) {
        const k = Math.ceil(((ts[j] - ts[j - 1]) * L) / 0.25);
        for (let q = 1; q <= k; q++) fine.push(ts[j - 1] + ((ts[j] - ts[j - 1]) * q) / k);
      }
      const at = (t: number) => [ax + (bx - ax) * t, ay + (by - ay) * t, az + (bz - az) * t];
      let end = -1;
      for (let j = 1; j < fine.length; j++) {
        const [t0, t1] = [fine[j - 1], fine[j]];
        if (t1 - t0 < 1e-9) continue;
        const keep = [t0, (t0 + t1) / 2, t1].every((t) => !deep(near, ax + (bx - ax) * t, az + (bz - az) * t));
        if (keep) {
          if (!cur.length) {
            cur.push(...at(t0));
            start = along + L * t0;
          }
          end = t1;
        } else {
          if (end >= 0) cur.push(...at(end));
          end = -1;
          flush(true);
        }
      }
      if (end >= 0) cur.push(...at(end));
      along += L;
    }
    flush(false);
  }
  const arrows = m.arrows.filter((a) => !zones.some((q) => inZ(q, a.x, a.z)));
  return { ...m, lines, arrows };
}
