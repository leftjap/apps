// 찻길 바닥 굽기: 교차로마다 면 하나, 길 조각마다 띠를 그릴 구간.
// 교차로는 땅 위 찻길 조각이 셋 넘게 만나는 노드에서 시작한다. 노드에서 나가는 갈래마다 면이 덮어야 하는 거리(need)를
// ① 이웃 갈래와의 모퉁이 호가 끝나는 접점 ② 그 갈래를 가로지르는 횡단보도의 바깥 변(없으면 서울시 정지선)으로 정하고,
// need 가 갈래 조각보다 길면 건너편 노드를 교차로에 넣는다(다른 교차로면 둘을 합친다). 면의 외곽선은 노드 둘레를 각도 순으로 돌며
// 갈래 오른쪽 가장자리 → 모퉁이 호 → 다음 갈래 왼쪽 가장자리를 잇고, 갈래 끝에서는 자르는 단면을 건넌다(평면 그래프의 면 돌기).
// 연결로(OSM *_link)로 둘러싸인 안쪽 고리는 교통섬 구멍으로 남긴다.
import { cornerArc, roadCorners } from '../../src/data/corners.ts';
import { carriageSections, isGroundRoad, roadJoints, type Section } from '../../src/data/surface.ts';
import { curbAt, type Road } from '../../src/data/board.ts';
import { cumLen } from '../../src/poly.ts';
import { fillRings, ringArea, simplifyLoop, traceLoops, windingLoops } from './contour.ts';

/** 횡단보도: 가운데, 건너는 방향, 건너는 길이의 반, 면 외곽선들 */
export interface Cross {
  x: number;
  z: number;
  ux: number;
  uz: number;
  half: number;
  rings: ArrayLike<number>[];
}

export interface BuiltFace {
  cls: number;
  outer: number[];
  holes: number[][];
  /** 이 면의 노드 수·갈래 수 */
  nodes: number;
  arms: number;
}

export interface BuiltSurface {
  /** 길 조각마다 [s0, s1](m, dm 으로 반올림한 값. 끝까지 그리면 s1 = Infinity) */
  cut: Float32Array;
  faces: BuiltFace[];
  /** 교차로 면 안에 들어가 띠를 그리지 않는 조각 */
  internal: Uint8Array;
}

const nodeKey = (x: number, z: number) => `${Math.round(x * 10)},${Math.round(z * 10)}`;
const dm = (v: number) => Math.round(v * 10) / 10;

/** 선분 ab 와 cd 가 만나면 ab 위 비율 t, cd 위 비율 u */
function hit(ax: number, az: number, bx: number, bz: number, cx: number, cz: number, dx: number, dz: number): [number, number] | null {
  const den = (bx - ax) * (dz - cz) - (bz - az) * (dx - cx);
  if (Math.abs(den) < 1e-9) return null;
  const t = ((cx - ax) * (dz - cz) - (cz - az) * (dx - cx)) / den;
  const u = ((cx - ax) * (bz - az) - (cz - az) * (bx - ax)) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [t, u] : null;
}

/** paint: 찻길에 칠한 표시 면(안전지대, 차선 둘레 띠, 화살표 둘레). 횡단보도(crosses)와 함께 교통섬 구멍에서 뺀다 */
export function buildSurface(roads: Road[], radii: number[], crosses: Cross[], stopLines: ArrayLike<number>, link: ArrayLike<number>, paint: ArrayLike<number>[] = []): BuiltSurface {
  const ground = roads.map(isGroundRoad);
  const L = roads.map((r) => cumLen(r.p));
  const len = (r: number) => L[r][L[r].length - 1];
  // 반쪽 갈래 h = 조각 번호 × 2 + 끝(0 시작, 1 끝): 그 노드에서 조각을 따라 나가는 쪽
  const H = (h: number) => ({ r: h >> 1, e: h & 1 });
  const nodeOfH: string[] = [];
  const nodes = new Map<string, { x: number; z: number; hs: number[] }>();
  /** 노드에서 나가는 방향(첫 선분) */
  const away = new Float32Array(roads.length * 4);
  roads.forEach((r, i) => {
    if (!ground[i]) return;
    const n = r.p.length;
    for (const e of [0, 1]) {
      const [x, z, nx, nz] = e ? [r.p[n - 3], r.p[n - 1], r.p[n - 6], r.p[n - 4]] : [r.p[0], r.p[2], r.p[3], r.p[5]];
      const d = Math.hypot(nx - x, nz - z) || 1;
      away.set([(nx - x) / d, (nz - z) / d], i * 4 + e * 2);
      const k = nodeKey(x, z);
      const nd = nodes.get(k) ?? nodes.set(k, { x, z, hs: [] }).get(k)!;
      nd.hs.push(i * 2 + e);
      nodeOfH[i * 2 + e] = k;
    }
  });
  const ang = (h: number) => Math.atan2(away[h * 2 + 1], away[h * 2]);
  for (const nd of nodes.values()) nd.hs.sort((a, b) => ang(a) - ang(b));
  /** h 를 따라 노드에서 d(m) 간 자리의 조각 위 거리 */
  const sOf = (h: number, d: number) => (h & 1 ? len(h >> 1) - d : d);
  /** 갈래 h 의 (노드에서 나가는 방향 기준) 오른쪽(side=1)·왼쪽(−1) 가장자리 점, 노드에서 d 거리 */
  const secCache = new Map<string, Section>();
  const section = (h: number, d: number) => {
    const { r, e } = H(h);
    const s = Math.max(0, Math.min(len(r), sOf(h, d)));
    const k = `${r},${s.toFixed(3)}`;
    let sec = secCache.get(k);
    if (!sec) {
      const ss = carriageSections(roads[r], s, s + 1e-2 <= len(r) ? s + 1e-2 : s, undefined);
      sec = ss.length ? ss[0] : carriageSections(roads[r], s - 1e-2, s)[1];
      secCache.set(k, sec);
    }
    return sec;
  };
  const edgePt = (h: number, side: number, d: number): [number, number] => {
    const sec = section(h, d);
    // 끝(e=1)에서 나가는 방향은 조각 진행 방향의 반대라 오른쪽·왼쪽이 바뀐다
    const right = (side > 0) !== !!(h & 1);
    return right ? [sec.rx, sec.rz] : [sec.lx, sec.lz];
  };
  /** 갈래 h 의 한쪽 가장자리를 노드에서 d0 → d1 거리까지 따라간 점들(양 끝 포함) */
  const edgeRun = (h: number, side: number, d0: number, d1: number): number[] => {
    const { r } = H(h);
    const a = sOf(h, d0);
    const b = sOf(h, d1);
    const lo = Math.max(0, Math.min(a, b));
    const hi = Math.min(len(r), Math.max(a, b));
    const right = (side > 0) !== !!(h & 1);
    let secs: Section[] = hi - lo > 1e-3 ? carriageSections(roads[r], lo, hi) : [];
    if (!secs.length) {
      const [x, z] = edgePt(h, side, d0);
      return [x, z];
    }
    if (a > b) secs = secs.reverse();
    return secs.flatMap((s) => (right ? [s.rx, s.rz] : [s.lx, s.lz]));
  };

  // ── 모퉁이: 노드마다 각도 순으로 이웃한 갈래 a(오른쪽 가장자리)·b(왼쪽 가장자리) 사이 ──
  const cornerOf = new Map<string, number>();
  const corners = roadCorners(roads);
  corners.forEach((c, i) => cornerOf.set(`${c.ra * 2 + c.ea}>${c.rb * 2 + c.eb}`, i));
  interface Sector {
    a: number;
    b: number;
    /** a 쪽 접점·b 쪽 접점의 노드에서 거리 */
    da: number;
    db: number;
    /** 두 접점 사이 모퉁이 점들 [x, z, ...] */
    pts: number[];
  }
  const sectorOf = new Map<number, Sector>(); // a → 그 오른쪽 부채꼴
  const sectorInto = new Map<number, Sector>(); // b → 그 왼쪽 부채꼴
  for (const nd of nodes.values()) {
    const hs = nd.hs;
    for (let i = 0; i < hs.length; i++) {
      const a = hs[i];
      const b = hs[(i + 1) % hs.length];
      const sec: Sector = { a, b, da: 0, db: 0, pts: [] };
      const ci = cornerOf.get(`${a}>${b}`);
      if (ci !== undefined && a !== b) {
        const c = corners[ci];
        const R = radii[ci] || c.r0;
        const arc = cornerArc(c, R);
        const tb = (c.kx - nd.x) * c.bx + (c.kz - nd.z) * c.bz;
        if (arc) {
          const dt = Math.min(R / Math.tan(c.th / 2), c.cap);
          sec.da = c.t + dt;
          sec.db = tb + dt;
          sec.pts = arc;
        } else if (c.t > 0 && tb > 0) {
          sec.da = c.t;
          sec.db = tb;
          sec.pts = [c.kx, c.kz];
        }
      } else if (a !== b) {
        // 모퉁이를 깎지 않는 곳: 안쪽으로 꺾인 사이(180° 미만)는 두 가장자리가 만나는 점까지, 나머지는 노드 단면끼리 잇는다
        let th = ang(b) - ang(a);
        if (th <= 0) th += Math.PI * 2;
        if (th < Math.PI) {
          const [ax, az] = edgePt(a, 1, 0);
          const [bx, bz] = edgePt(b, -1, 0);
          const [ux, uz] = [away[a * 2], away[a * 2 + 1]];
          const [vx, vz] = [away[b * 2], away[b * 2 + 1]];
          const den = ux * vz - uz * vx;
          if (Math.abs(den) > 1e-4) {
            const t = ((bx - ax) * vz - (bz - az) * vx) / den;
            const kx = ax + ux * t;
            const kz = az + uz * t;
            const tb = (kx - nd.x) * vx + (kz - nd.z) * vz;
            if (t > 0 && tb > 0 && t < 1.5 * len(a >> 1) && tb < 1.5 * len(b >> 1)) {
              sec.da = t;
              sec.db = tb;
              sec.pts = [kx, kz];
            }
          }
        }
      }
      sectorOf.set(a, sec);
      sectorInto.set(b, sec);
    }
  }

  // ── 갈래를 가로지르는 횡단보도·정지선 ──
  /** 노드에서 갈래 h 를 따라 깔린 가운데선(이어지기만 하는 노드를 지나) reach 까지 [x, z, ...]와 누적 거리 */
  const chainOf = (h: number, reach: number) => {
    const pts: number[] = [];
    const cum: number[] = [];
    let cur = h;
    let acc = 0;
    for (let guard = 0; guard < 8 && acc < reach; guard++) {
      const { r, e } = H(cur);
      const P = roads[r].p;
      const n = P.length / 3;
      for (let i = 0; i < n; i++) {
        const k = e ? n - 1 - i : i;
        const x = P[k * 3];
        const z = P[k * 3 + 2];
        if (pts.length && i === 0) continue;
        if (pts.length) acc += Math.hypot(x - pts[pts.length - 2], z - pts[pts.length - 1]);
        pts.push(x, z);
        cum.push(acc);
      }
      const far = nodes.get(nodeOfH[cur ^ 1])!;
      if (far.hs.length !== 2) break;
      cur = far.hs[0] === (cur ^ 1) ? far.hs[1] : far.hs[0];
    }
    return { pts, cum };
  };
  const ringsAxis = crosses.map((c) => ({ ...c, r: Math.hypot(c.half, 8) }));
  /** 갈래 h 의 노드에서 d 안쪽부터 reach 까지 처음 가로지르는 횡단보도의 바깥 변 거리(없으면 정지선 너머, 둘 다 없으면 0) */
  const crossNeed = (h: number, minInner: number, reach: number): number => {
    const nd = nodes.get(nodeOfH[h])!;
    const { pts, cum } = chainOf(h, reach + 5);
    let best = Infinity;
    let need = 0;
    for (const c of ringsAxis) {
      if (Math.hypot(c.x - nd.x, c.z - nd.z) > reach + c.r + 5) continue;
      const ax = c.x - c.ux * (c.half + 2);
      const az = c.z - c.uz * (c.half + 2);
      const bx = c.x + c.ux * (c.half + 2);
      const bz = c.z + c.uz * (c.half + 2);
      for (let i = 0; i + 3 < pts.length; i += 2) {
        const t = hit(pts[i], pts[i + 1], pts[i + 2], pts[i + 3], ax, az, bx, bz);
        if (!t) continue;
        const sl = cum[i / 2 + 1] - cum[i / 2];
        const si = cum[i / 2] + sl * t[0];
        const tx = (pts[i + 2] - pts[i]) / (sl || 1);
        const tz = (pts[i + 3] - pts[i + 1]) / (sl || 1);
        if (Math.abs(tx * c.ux + tz * c.uz) > 0.75 || si > reach || si >= best) break;
        const px = pts[i] + tx * sl * t[0];
        const pz = pts[i + 1] + tz * sl * t[0];
        let lo = Infinity;
        let hi = -Infinity;
        for (const ring of c.rings)
          for (let k = 0; k < ring.length; k += 2) {
            const v = (ring[k] - px) * tx + (ring[k + 1] - pz) * tz;
            lo = Math.min(lo, v);
            hi = Math.max(hi, v);
          }
        if (si + lo < -3 || si + lo > minInner) break;
        best = si;
        need = si + hi + 0.3;
        break;
      }
    }
    if (need > 0) return need;
    let stop = Infinity;
    for (let k = 0; k + 3 < stopLines.length; k += 4) {
      const [ax, az, bx, bz] = [stopLines[k], stopLines[k + 1], stopLines[k + 2], stopLines[k + 3]];
      if (Math.hypot((ax + bx) / 2 - nd.x, (az + bz) / 2 - nd.z) > reach + 10) continue;
      for (let i = 0; i + 3 < pts.length; i += 2) {
        const t = hit(pts[i], pts[i + 1], pts[i + 2], pts[i + 3], ax, az, bx, bz);
        if (!t) continue;
        const si = cum[i / 2] + (cum[i / 2 + 1] - cum[i / 2]) * t[0];
        if (si <= reach && si <= minInner) stop = Math.min(stop, si);
        break;
      }
    }
    return stop < Infinity ? stop + 0.4 : 0;
  };

  // ── 교차로 묶기 ──
  const parent = new Map<string, string>();
  const find = (k: string): string => {
    let p = parent.get(k)!;
    while (p !== parent.get(p)) p = parent.get(p)!;
    parent.set(k, p);
    return p;
  };
  const inJn = (k: string) => parent.has(k);
  for (const [k, nd] of nodes) if (nd.hs.length >= 3) parent.set(k, k);
  const sameJn = (a: string, b: string) => inJn(a) && inJn(b) && find(a) === find(b);
  /** 교차로 노드의 상자 크기: 만나는 길 가운데 가장 넓은 쪽 반폭 */
  const boxOf = (k: string) => {
    let m = 3;
    for (const h of nodes.get(k)!.hs) {
      const sec = section(h, 0);
      m = Math.max(m, sec.er, sec.el);
    }
    return m;
  };
  /** 분리대가 있는 한 방향 큰길이 지나는 노드 */
  const median = (k: string) => nodes.get(k)!.hs.some((h) => roads[h >> 1].oneway && roads[h >> 1].gap > 0.15 && roads[h >> 1].gap <= 10);
  // 분리대를 사이에 둔 두 찻길의 교차 노드는 한 교차로다(그 사이를 건너는 횡단보도와 분리대 끝이 한 면에 든다)
  for (const [k, nd] of nodes) {
    if (!inJn(k) || !median(k)) continue;
    for (const h of nd.hs) {
      const far = nodeOfH[h ^ 1];
      if (inJn(far) && len(h >> 1) < boxOf(k) + boxOf(far) + 10) parent.set(find(far), find(k));
    }
  }
  const need = new Float32Array(roads.length * 2);
  for (let round = 0; round < 20; round++) {
    let changed = false;
    need.fill(0);
    for (const [k, nd] of nodes) {
      if (!inJn(k)) continue;
      const box = boxOf(k);
      const reach = Math.min(45, 12 + 2 * box);
      for (const h of nd.hs) {
        if (sameJn(k, nodeOfH[h ^ 1])) continue;
        const corner = Math.max(sectorOf.get(h)!.da, sectorInto.get(h)!.db);
        // 면이 덮는 거리: 모퉁이 접점, 그리고 가까운 횡단보도(안쪽 변이 상자·모퉁이에서 10m 안)
        need[h] = Math.max(corner + 0.5, crossNeed(h, Math.max(corner, box) + 10, reach));
      }
    }
    for (const [k, nd] of nodes) {
      if (!inJn(k)) continue;
      for (const h of nd.hs) {
        const far = nodeOfH[h ^ 1];
        if (sameJn(k, far)) continue;
        const l = len(h >> 1);
        const other = inJn(far) ? need[h ^ 1] : 0;
        if (need[h] + other > l - 0.3) {
          if (inJn(far)) parent.set(find(far), find(k));
          else parent.set(far, find(k));
          changed = true;
        }
      }
    }
    if (!changed) break;
  }

  // ── 띠 구간 ──
  const cut = new Float32Array(roads.length * 2);
  const internal = new Uint8Array(roads.length);
  roads.forEach((_, i) => {
    cut[i * 2] = 0;
    cut[i * 2 + 1] = Infinity; // 끝까지(꺾인 노드에서 이웃 띠와 같은 단면으로 이어지도록 조각 끝 그대로)
  });
  roads.forEach((_, i) => {
    if (!ground[i]) return;
    const a = nodeOfH[i * 2];
    const b = nodeOfH[i * 2 + 1];
    if (sameJn(a, b)) {
      internal[i] = 1;
      cut[i * 2] = cut[i * 2 + 1] = 0;
      return;
    }
    if (inJn(a)) cut[i * 2] = dm(need[i * 2]);
    if (inJn(b)) cut[i * 2 + 1] = dm(len(i) - need[i * 2 + 1]);
  });
  const isArm = (h: number) => inJn(nodeOfH[h]) && !internal[h >> 1];
  const cutD = (h: number) => (h & 1 ? len(h >> 1) - cut[(h >> 1) * 2 + 1] : cut[(h >> 1) * 2]);

  // ── 면 돌기 ──
  const visited = new Set<Sector>();
  /** 부채꼴 sec 에서 시작해 갈래 끝 단면을 건너며 처음 부채꼴로 돌아올 때까지 */
  /** 갈래 h 의 (나가는 방향 기준) 오른쪽(side 1)·왼쪽(−1)이 분리대인가 */
  const medSide = (h: number, side: number) => {
    const r = roads[h >> 1];
    if (!r.oneway || r.gap <= 0.15 || r.gap > 10) return false;
    // 한 방향 길의 분리대는 진행 방향 왼쪽: 시작에서 나가면 왼쪽, 끝에서 나가면 오른쪽
    return side > 0 ? (h & 1) === 1 : (h & 1) === 0;
  };
  const walk = (start: Sector, hole = false): { pts: number[]; arms: number; links: number } | null => {
    // 섬 둘레(hole)에서는 접점이 조각 길이 너머인 모퉁이 호를 쓰지 않는다. 길이 비스듬히 만나면 두 가장자리선이 조각 끝 너머에서 만나
    // 호가 섬 한가운데에 놓이고, 그런 호 둘이 엇갈려 섬이 꽃잎 모양이 됐다(합정역 8번 출구 앞). 노드 단면끼리 잇고 엇갈린 꼬리는 회전수로 뺀다
    const far = (s: Sector) => hole && (s.da > len(s.a >> 1) || s.db > len(s.b >> 1));
    const dA = (s: Sector) => (far(s) ? 0 : s.da);
    const dB = (s: Sector) => (far(s) ? 0 : s.db);
    const pts: number[] = [];
    let arms = 0;
    let links = 0;
    let sec = start;
    // 마지막으로 오른쪽 가장자리를 따라 들어온 갈래와 그 끝 단면 점 자리(분리대를 건너 바로 잇는 데 쓴다)
    let prev = start.a;
    let mark = 0;
    for (let guard = 0; guard < 4000; guard++) {
      visited.add(sec);
      if (!far(sec)) pts.push(...sec.pts);
      const b = sec.b;
      if (link[b >> 1]) links++;
      let next: Sector;
      if (isArm(b)) {
        arms++;
        const c = cutD(b);
        if (medSide(prev, 1) && medSide(b, -1) && prev !== b) {
          // 분리대 양쪽 찻길: 자르는 단면끼리 곧게 이어 분리대 끝까지 면에 넣는다
          pts.length = mark;
          pts.push(...edgePt(b, -1, c));
        } else pts.push(...edgeRun(b, -1, dB(sec), c));
        mark = pts.length + 2;
        pts.push(...edgeRun(b, 1, c, dA(sectorOf.get(b)!)));
        prev = b;
        next = sectorOf.get(b)!;
      } else {
        // 안쪽 조각: 왼쪽 가장자리를 따라 건너편 노드로. 거기서는 같은 가장자리가 반대쪽 갈래의 오른쪽이다
        const nx = sectorOf.get(b ^ 1)!;
        const l = len(b >> 1);
        const d1 = Math.max(dB(sec), l - dA(nx));
        pts.push(...edgeRun(b, -1, Math.min(dB(sec), d1), d1));
        next = nx;
      }
      if (next === start) return { pts, arms, links };
      if (visited.has(next)) return null;
      sec = next;
    }
    return null;
  };
  const area = (p: number[]) => {
    let s = 0;
    for (let i = 0; i < p.length; i += 2) {
      const j = (i + 2) % p.length;
      s += p[i] * p[j + 1] - p[j] * p[i + 1];
    }
    return s / 2;
  };
  /** cm 로 반올림하고, 겹친 점과 되돌아가는 뾰족점(앞뒤 변이 거의 반대 방향이고 사이 넓이가 아주 작은 점)을 지운다 */
  const clean = (p: number[]) => {
    let out: number[] = [];
    for (let i = 0; i < p.length; i += 2) {
      const x = Math.round(p[i] * 100) / 100;
      const z = Math.round(p[i + 1] * 100) / 100;
      const n = out.length;
      if (n && Math.hypot(x - out[n - 2], z - out[n - 1]) < 0.02) continue;
      out.push(x, z);
    }
    if (out.length > 4 && Math.hypot(out[0] - out[out.length - 2], out[1] - out[out.length - 1]) < 0.02) out.length -= 2;
    for (let changed = true; changed && out.length > 6; ) {
      changed = false;
      const n = out.length / 2;
      for (let i = 0; i < n; i++) {
        const a = ((i + n - 1) % n) * 2;
        const b = i * 2;
        const c = ((i + 1) % n) * 2;
        const ux = out[b] - out[a];
        const uz = out[b + 1] - out[a + 1];
        const vx = out[c] - out[b];
        const vz = out[c + 1] - out[b + 1];
        const cross = Math.abs(ux * vz - uz * vx);
        if (ux * vx + uz * vz < 0 && cross < 0.02 * Math.max(Math.hypot(ux, uz), Math.hypot(vx, vz))) {
          out = [...out.slice(0, b), ...out.slice(b + 2)];
          changed = true;
          break;
        }
      }
    }
    return out;
  };
  /** 변끼리 엇갈리는 곳이 있으면 작은 쪽 고리를 잘라 낸다(가장자리 점과 모퉁이 호가 조금 어긋난 자리) */
  const untangle = (p: number[]) => {
    for (let pass = 0; pass < 50; pass++) {
      const n = p.length / 2;
      let found = false;
      for (let i = 0; i < n && !found; i++)
        for (let j = i + 2; j < n && !found; j++) {
          if (i === 0 && j === n - 1) continue;
          const i1 = (i + 1) % n;
          const j1 = (j + 1) % n;
          const t = hit(p[i * 2], p[i * 2 + 1], p[i1 * 2], p[i1 * 2 + 1], p[j * 2], p[j * 2 + 1], p[j1 * 2], p[j1 * 2 + 1]);
          if (!t || t[0] < 1e-6 || t[0] > 1 - 1e-6 || t[1] < 1e-6 || t[1] > 1 - 1e-6) continue;
          const x = p[i * 2] + (p[i1 * 2] - p[i * 2]) * t[0];
          const z = p[i * 2 + 1] + (p[i1 * 2 + 1] - p[i * 2 + 1]) * t[0];
          // 고리 i+1..j 와 나머지 가운데 점이 적은 쪽을 버린다
          if (j - i <= n - (j - i)) p = [...p.slice(0, (i + 1) * 2), x, z, ...p.slice((j + 1) * 2)];
          else p = [x, z, ...p.slice((i + 1) * 2, (j + 1) * 2)];
          found = true;
        }
      if (!found) break;
    }
    return p;
  };
  const groups = new Map<string, string[]>();
  for (const k of nodes.keys()) if (inJn(k)) (groups.get(find(k)) ?? groups.set(find(k), []).get(find(k))!).push(k);
  const faces: BuiltFace[] = [];
  for (const ks of groups.values()) {
    const secs = ks.flatMap((k) => nodes.get(k)!.hs.map((h) => sectorOf.get(h)!));
    let outer: number[] | null = null;
    let armsN = 0;
    let cls = 9;
    for (const k of ks) for (const h of nodes.get(k)!.hs) cls = Math.min(cls, roads[h >> 1].cls);
    // 오른쪽이 분리대가 아닌 갈래에서 시작한다(분리대 건너 잇기가 고리 끝에서 끊기지 않게)
    secs.sort((p, q) => Number(medSide(p.a, 1)) - Number(medSide(q.a, 1)));
    for (const s of secs) {
      if (visited.has(s) || !isArm(s.a)) continue;
      // 갈래 a 의 오른쪽 가장자리에서 시작: 끝 단면 오른쪽 점부터 접점까지
      const w = walk(s);
      if (!w) continue;
      const ring = untangle(clean(w.pts));
      if (!outer || Math.abs(area(ring)) > Math.abs(area(outer))) outer = ring;
      armsN += w.arms;
    }
    if (!outer || outer.length < 6) continue;
    const holes: number[][] = [];
    for (const s of secs) {
      if (visited.has(s)) continue;
      const w = walk(s, true);
      if (!w || w.arms || !w.links) continue;
      // 섬 둘레 고리는 좁은 꼬리(섬 너머 멀리서 만나는 두 조각 사이)와 비스듬한 노드 앞에서 가장자리선이 엇갈린다. 점 수로는 어느 쪽이
      // 뒤집힌 꼬리인지 알 수 없으므로 회전 방향이 구멍 쪽인 칸만 남긴다
      const pts = clean(w.pts);
      let [x0, x1, z0, z1] = [Infinity, -Infinity, Infinity, -Infinity];
      for (let k = 0; k < pts.length; k += 2) (x0 = Math.min(x0, pts[k])), (x1 = Math.max(x1, pts[k])), (z0 = Math.min(z0, pts[k + 1])), (z1 = Math.max(z1, pts[k + 1]));
      const cell = Math.max(0.1, Math.max(x1 - x0, z1 - z0) / 1500);
      // 횡단보도와 paint(안전지대·차선·화살표)는 찻길에 칠한 표시라 섬이 될 수 없다. 빼고 남은 25m² 미만 조각은 버린다: 판 전체
      // 구멍을 항공사진과 대조하니 그런 조각은 모두 띠 사이 틈이 찻길 위에 남은 것이었다(동교동 (678, −802) 11m² 등, 설계 문서 34.5절)
      for (const ring of windingLoops(pts, -Math.sign(area(outer)), cell, 0.15, [...crosses.flatMap((c) => c.rings), ...paint]))
        if (ring.length >= 6 && Math.abs(area(ring)) >= 25) holes.push(ring.map((v) => Math.round(v * 100) / 100));
    }
    faces.push({ cls, outer, holes, nodes: ks.length, arms: armsN });
  }
  return { cut, faces, internal };
}

/** 바닥 면 다각형들(판 좌표 [x, z, ...]). walk 는 바깥 고리 넓이가 양수, 구멍이 음수다 */
export interface SurfacePolys {
  /** 찻길 띠: [길 조각 번호, 고리] */
  car: [number, number[]][];
  /** 분리대(한 방향 큰길 왼쪽, 반대 방향 길까지의 절반) */
  med: number[][];
  /** 교통섬(교차로 면의 구멍) */
  isl: number[][];
  /** 보도: 도로 부지·광장 − 찻길 띠 − 교차로 면 − 분리대 − 그리기 전용 찻길 면 − 건물 외곽선 */
  walk: number[][];
  /** 큰길 쪽에 보도 면이 없어 채운 넓이(m²): 실폭도로 면으로, 연석에서 건물 쪽으로 */
  filled: number;
  filledRw: number;
  /** 그리기 전용 찻길 면(crosswalkPatches) */
  draw: number[][];
}

/**
 * 보도 면은 0.5m 격자로 도로 부지(GK.ROADSIDE)·광장(GK.PLAZA)을 칠하고 찻길 띠·교차로 면·분리대를 지운 뒤 경계를 따라 다각형으로 바꾼다(0.35m 안으로 줄임).
 * areas: 바닥 면 [종류, 바깥 고리, 구멍들], kinds: 보도로 칠할 종류
 */
export function surfacePolys(
  roads: Road[],
  built: BuiltSurface,
  joints: Float32Array,
  areas: { kind: number; outer: ArrayLike<number>; holes: ArrayLike<number>[] }[],
  kinds: number[],
  boardR: number,
  draw: number[][] = [],
  /** 보도 면에서 뺄 건물 외곽선 */
  buildings: ArrayLike<number>[] = [],
  /** 큰길(등급 3 이하) 쪽마다 연석 밖 6m 안에 보도 면이 없으면 연석 0.35m 밖부터 채운다: 그 쪽에 실폭도로 면(roadArea)이 있으면 그 면이 이어지는 데까지,
   *  없으면 건물·찻길·교차로 면·분리대에 막히는 곳까지(6m 안) */
  fillSides = false,
  roadArea: { outer: ArrayLike<number>; holes: ArrayLike<number>[] }[] = [],
): SurfacePolys {
  const car: [number, number[]][] = [];
  const med: number[][] = [];
  roads.forEach((r, i) => {
    if (!isGroundRoad(r) || built.internal[i]) return;
    const secs = carriageSections(r, built.cut[i * 2], built.cut[i * 2 + 1], joints.subarray(i * 4, i * 4 + 4));
    if (secs.length < 2) return;
    car.push([i, [...secs.flatMap((s) => [s.lx, s.lz]), ...secs.reverse().flatMap((s) => [s.rx, s.rz])]]);
    secs.reverse();
    if (r.oneway && r.gap > 0.15 && r.gap <= 10 && r.cls <= 3) {
      const gw = r.gap / 2;
      const out = secs.map((s) => [s.lx + ((s.lx - s.x) / (s.el || 1)) * gw, s.lz + ((s.lz - s.z) / (s.el || 1)) * gw]);
      med.push([...secs.flatMap((s) => [s.lx, s.lz]), ...out.reverse().flat()]);
    }
  });
  const isl = built.faces.flatMap((f) => f.holes);
  // 격자
  const CELL = 0.5;
  const N = Math.ceil((2 * boardR) / CELL);
  const g = (p: ArrayLike<number>) => Array.from(p, (v) => (v + boardR) / CELL);
  const grid = new Uint8Array(N * N);
  for (const a of areas) if (kinds.includes(a.kind)) fillRings(grid, N, [g(a.outer), ...a.holes.map(g)], 1);
  for (const [, ring] of car) fillRings(grid, N, [g(ring)], 0);
  for (const f of built.faces) fillRings(grid, N, [g(f.outer), ...f.holes.map(g)], 0);
  for (const ring of med) fillRings(grid, N, [g(ring)], 0);
  for (const ring of draw) fillRings(grid, N, [g(ring)], 0);
  for (const ring of buildings) fillRings(grid, N, [g(ring)], 0);
  let filled = 0;
  let filledRw = 0;
  if (fillSides) {
    const blocked = new Uint8Array(N * N);
    for (const [, ring] of car) fillRings(blocked, N, [g(ring)], 1);
    for (const f of built.faces) fillRings(blocked, N, [g(f.outer), ...f.holes.map(g)], 1);
    for (const ring of [...med, ...draw, ...buildings]) fillRings(blocked, N, [g(ring)], 1);
    const rw = new Uint8Array(roadArea.length ? N * N : 0);
    for (const a of roadArea) fillRings(rw, N, [g(a.outer), ...a.holes.map(g)], 1);
    const at = (x: number, z: number) => {
      const i = Math.floor((x + boardR) / CELL);
      const j = Math.floor((z + boardR) / CELL);
      return i < 0 || j < 0 || i >= N || j >= N ? -1 : j * N + i;
    };
    // (x, z) 에서 바깥쪽 (nx, nz) 로 c 부터 6m 안에 보도 면이 없으면 c + 0.35m 부터 채운다
    const fillOut = (x: number, z: number, nx: number, nz: number, c: number) => {
      for (let o = c; o < c + 6; o += 0.5) {
        const q = at(x + nx * o, z + nz * o);
        if (q >= 0 && grid[q]) return;
      }
      let useRw = false;
      for (let o = c + 0.35; o < c + 6 && rw.length && !useRw; o += 0.5) {
        const q = at(x + nx * o, z + nz * o);
        if (q >= 0 && rw[q] && !blocked[q]) useRw = true;
      }
      for (let o = c + 0.35; o < c + 6; o += 0.25) {
        const q = at(x + nx * o, z + nz * o);
        if (q < 0 || blocked[q]) break;
        if (useRw && !rw[q]) {
          if (o > c + 3) break; // 실폭도로 면이 연석에서 조금(3m 안) 떨어져 시작할 수 있다
          continue;
        }
        if (!grid[q]) (grid[q] = 2), useRw ? filledRw++ : filled++;
      }
    };
    roads.forEach((r, ri) => {
      if (!isGroundRoad(r) || r.cls > 3 || built.internal[ri]) return;
      let s0 = 0;
      for (let k = 0; k + 5 < r.p.length; k += 3) {
        const [ax, az, bx, bz] = [r.p[k], r.p[k + 2], r.p[k + 3], r.p[k + 5]];
        const L = Math.hypot(bx - ax, bz - az);
        const nx = -(bz - az) / (L || 1);
        const nz = (bx - ax) / (L || 1);
        for (let t = 0.2; t < L; t += 0.4) {
          const x = ax + ((bx - ax) * t) / L;
          const z = az + ((bz - az) * t) / L;
          for (const sd of [1, -1]) fillOut(x, z, nx * sd, nz * sd, curbAt(r, s0 + t, sd));
        }
        s0 += L;
      }
    });
    // 큰길 교차로 면의 바깥 테두리도 같은 방식으로(교차로 모퉁이에 붙은 횡단보도 끝). 갈래를 자르는 단면 바깥은 찻길 띠라 바로 막힌다
    for (const f of built.faces) {
      if (f.cls > 3) continue;
      const o = f.outer;
      const sg = ringArea(o) > 0 ? 1 : -1;
      for (let k = 0; k < o.length; k += 2) {
        const [ax, az, bx, bz] = [o[k], o[k + 1], o[(k + 2) % o.length], o[(k + 3) % o.length]];
        const L = Math.hypot(bx - ax, bz - az);
        if (L < 1e-6) continue;
        // 넓이가 양수인 고리는 진행 방향 오른쪽이 바깥
        const nx = ((bz - az) / L) * sg;
        const nz = (-(bx - ax) / L) * sg;
        for (let t = 0.2; t < L; t += 0.4) fillOut(ax + ((bx - ax) * t) / L, az + ((bz - az) * t) / L, nx, nz, 0);
      }
    }
  }
  const walk: number[][] = [];
  for (const loop of traceLoops(grid, N)) {
    const s = simplifyLoop(loop, 0.35 / CELL);
    if (Math.abs(ringArea(s)) * CELL * CELL < 2 || s.length < 6) continue;
    walk.push(s.map((v) => v * CELL - boardR));
  }
  return { car, med, isl, walk, draw, filled: filled * CELL * CELL, filledRw: filledRw * CELL * CELL };
}

/**
 * 그리기 전용 찻길 면: 횡단보도 면이 찻길 띠·교차로 면 밖에 걸친 부분을 찻길로 칠한다(칠한 횡단보도 밑은 찻길이다).
 * 횡단보도마다 건너는 축을 따라 양 끝 1m 안의 서울시 연석 쪽 선(curbs)까지 늘이고, 폭 쪽으로 0.1m 씩 넓힌 사각형에서
 * 이미 덮인 곳을 뺀 나머지를 0.1m 격자로 칠해 경계를 따라간다. OSM 에 없는 진입로·회전로, 실제보다 좁게 그린 골목, 모퉁이 호가 깎은 횡단보도 끝이 여기에 든다.
 * 차는 다니지 않는다. 결과는 [등급, 고리 [x, z, ...]]
 */
export function crosswalkPatches(roads: Road[], built: BuiltSurface, crosses: Cross[], curbs: ArrayLike<number>[]): { cls: number; ring: number[] }[] {
  const joints = roadJoints(roads);
  type P = { ring: ArrayLike<number>; holes?: ArrayLike<number>[]; box: number[] };
  const grid = new Map<string, P[]>();
  const bbox = (r: ArrayLike<number>) => {
    let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
    for (let k = 0; k < r.length; k += 2) (a = Math.min(a, r[k])), (b = Math.max(b, r[k])), (c = Math.min(c, r[k + 1])), (d = Math.max(d, r[k + 1]));
    return [a, b, c, d];
  };
  const add = (p: P) => {
    for (let gx = Math.floor(p.box[0] / 25); gx <= Math.floor(p.box[1] / 25); gx++)
      for (let gz = Math.floor(p.box[2] / 25); gz <= Math.floor(p.box[3] / 25); gz++) (grid.get(`${gx},${gz}`) ?? grid.set(`${gx},${gz}`, []).get(`${gx},${gz}`)!).push(p);
  };
  const inRing = (ring: ArrayLike<number>, x: number, z: number) => {
    let c = false;
    for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2)
      if (ring[i + 1] > z !== ring[j + 1] > z && x < ring[i] + ((z - ring[i + 1]) / (ring[j + 1] - ring[i + 1])) * (ring[j] - ring[i])) c = !c;
    return c;
  };
  roads.forEach((r, i) => {
    if (!isGroundRoad(r) || built.internal[i]) return;
    const secs = carriageSections(r, built.cut[i * 2], built.cut[i * 2 + 1], joints.subarray(i * 4, i * 4 + 4));
    for (let k = 1; k < secs.length; k++) {
      const [a, b] = [secs[k - 1], secs[k]];
      const ring = [a.rx, a.rz, b.rx, b.rz, b.lx, b.lz, a.lx, a.lz];
      add({ ring, box: bbox(ring) });
    }
  });
  for (const f of built.faces) add({ ring: f.outer, holes: f.holes, box: bbox(f.outer) });
  const covered = (x: number, z: number) =>
    (grid.get(`${Math.floor(x / 25)},${Math.floor(z / 25)}`) ?? []).some(
      (p) => x >= p.box[0] && x <= p.box[1] && z >= p.box[2] && z <= p.box[3] && inRing(p.ring, x, z) && !(p.holes ?? []).some((h) => inRing(h, x, z)),
    );
  // 가장 가까운 땅 위 찻길의 등급(칠 색)
  const clsAt = (x: number, z: number) => {
    let best = 15;
    let cls = 4;
    for (const r of roads) {
      if (!isGroundRoad(r)) continue;
      for (let k = 0; k + 3 < r.p.length; k += 3) {
        const [ax, az, bx, bz] = [r.p[k], r.p[k + 2], r.p[k + 3], r.p[k + 5]];
        if (Math.min(ax, bx) > x + best || Math.max(ax, bx) < x - best || Math.min(az, bz) > z + best || Math.max(az, bz) < z - best) continue;
        const dx = bx - ax;
        const dz = bz - az;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
        const d = Math.hypot(ax + dx * t - x, az + dz * t - z);
        if (d < best) (best = d), (cls = r.cls);
      }
    }
    return cls;
  };
  const out: { cls: number; ring: number[] }[] = [];
  const CELL = 0.1;
  for (const c of crosses)
    for (const ring of c.rings) {
      // 건너는 축(u)과 그 옆(v) 좌표로 면이 차지하는 범위
      const [ux, uz] = [c.ux, c.uz];
      const [vx, vz] = [-uz, ux];
      let gx = 0;
      let gz = 0;
      for (let k = 0; k < ring.length; k += 2) (gx += (ring[k] * 2) / ring.length), (gz += (ring[k + 1] * 2) / ring.length);
      let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
      for (let k = 0; k < ring.length; k += 2) {
        const du = (ring[k] - gx) * ux + (ring[k + 1] - gz) * uz;
        const dv = (ring[k] - gx) * vx + (ring[k + 1] - gz) * vz;
        (a0 = Math.min(a0, du)), (a1 = Math.max(a1, du)), (b0 = Math.min(b0, dv)), (b1 = Math.max(b1, dv));
      }
      // 횡단보도 안에 덮이지 않은 곳이 0.2m² 넘게 있을 때만
      let open = 0;
      for (let du = a0 + 0.125; du < a1; du += 0.25)
        for (let dv = b0 + 0.125; dv < b1; dv += 0.25) {
          const x = gx + ux * du + vx * dv;
          const z = gz + uz * du + vz * dv;
          if (inRing(ring, x, z) && !covered(x, z)) open++;
        }
      if (open * 0.0625 < 0.2) continue;
      // 양 끝을 2.5m 안의 연석 쪽 선(건너는 축과 가로지르는 선)까지 늘인다
      const ext = (dir: number) => {
        const end = dir > 0 ? a1 : -a0;
        let best = Infinity;
        for (const L of curbs)
          for (let k = 0; k + 3 < L.length; k += 2) {
            const [px, pz, qx, qz] = [L[k], L[k + 1], L[k + 2], L[k + 3]];
            const t = hit(gx, gz, gx + ux * dir * (Math.max(a1, -a0) + 2.5), gz + uz * dir * (Math.max(a1, -a0) + 2.5), px, pz, qx, qz);
            if (!t) continue;
            const sl = Math.hypot(qx - px, qz - pz) || 1;
            if (Math.abs(((qx - px) * ux + (qz - pz) * uz) / sl) > 0.5) continue; // 축과 나란한 선
            const d = t[0] * (Math.max(a1, -a0) + 2.5);
            if (d > end - 0.01 && d < best) best = d; // 끝 너머 가장 가까운 연석 쪽 선
          }
        return best <= end + 1 ? best : end;
      };
      const e1 = ext(1);
      const e0 = -ext(-1);
      const [lo, hi] = [b0 - 0.1, b1 + 0.1];
      const quad = [
        [gx + ux * e0 + vx * lo, gz + uz * e0 + vz * lo],
        [gx + ux * e1 + vx * lo, gz + uz * e1 + vz * lo],
        [gx + ux * e1 + vx * hi, gz + uz * e1 + vz * hi],
        [gx + ux * e0 + vx * hi, gz + uz * e0 + vz * hi],
      ].flat();
      const [mnx, mxx, mnz, mxz] = bbox(quad);
      const nx = Math.ceil((mxx - mnx) / CELL);
      const nz = Math.ceil((mxz - mnz) / CELL);
      const n = Math.max(nx, nz) + 2;
      const g = new Uint8Array(n * n);
      for (let j = 0; j < nz; j++)
        for (let i = 0; i < nx; i++) {
          const x = mnx + (i + 0.5) * CELL;
          const z = mnz + (j + 0.5) * CELL;
          if (inRing(quad, x, z) && !covered(x, z)) g[(j + 1) * n + i + 1] = 1;
        }
      for (const loop of traceLoops(g, n)) {
        const sl = simplifyLoop(loop, 0.6);
        if (sl.length < 6 || ringArea(sl) * CELL * CELL < 0.2) continue;
        const w = sl.map((v, k) => (k % 2 ? mnz + (v - 1) * CELL : mnx + (v - 1) * CELL));
        const r2 = w.map((v) => Math.round(v * 100) / 100);
        out.push({ cls: clsAt(gx, gz), ring: r2 });
        add({ ring: r2, box: bbox(r2) });
      }
    }
  return out;
}
