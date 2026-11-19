// 노면 표시·횡단보도 마무리 정적 검사(재작업 W59, 1·2단계). 차·사람 없이 그리는 횡단보도 줄무늬 면(늘인 면 marks.json x, 없으면 서울시 면)을
// 정지선·노면 화살표·세우는 시설물·그린 찻길 면 경계와 판 전체로 잰다. 차·사람 모듈(makeCars·makePeople)은 쓰지 않는다.
// (1) 칠한 선(중앙선·차선·버스전용선·가장자리선·정지선, 그리는 폭 lineStyle)·화살표(arrowShape)가 줄무늬 면과 겹치거나 0.3m 안으로 붙는다.
//     정지선은 그리는 폭이 면과 겹칠 때만 센다(여유 없음). 자전거횡단도(13)는 횡단보도 옆을 따라 긋는 선이라 보지 않는다
//     실제 길의 차선·중앙선은 횡단보도 앞에서 끝난다(재작업 W59, 화면: 홍대입구역 양화로 길 중간 횡단보도에서 황색 복선이 줄무늬 밑까지 이어진다)
// (2) 세우는 시설물(차량·보행 신호 기둥, 길가 정류장 쉼터, 지하철 출구·엘리베이터) 바닥이 횡단보도 면을 긴 두 변(줄무늬가 놓인 변) 쪽으로만 0.2m 늘인 띠와
//     겹치거나 그 안이다. 횡단보도 끝 너머 보도에 선 보행 신호 기둥은 맞는 자리라 세지 않는다. 환기구는 아직 판에 세우지 않는다(로드뷰 기록의 vent 는 옥상 소품뿐)
// (3) 신호 횡단보도 줄무늬 끝이 연석(그린 찻길 면 끝)·섬·분리대 가장자리에서 건너는 방향으로 0.3m 넘게 떨어진다
import { readFileSync } from 'node:fs';
import { exitOutline } from '../src/data/exitFit.ts';
import { exitLook } from '../src/data/exits.ts';
import { arrowOnCrossing, arrowShape, clipLines, crossingBands, lineStyle, stopSegments, type Band, type ClipStats } from '../src/data/marks.ts';
import { groundQuery, placeOff, type GroundQuery } from '../src/data/offroad.ts';
import { decodeSurface, tileRings, type SurfaceJson } from '../src/data/surface.ts';
import { placedShelters, shelterFootprint } from '../src/render/busstops.ts';
import { signalPoles } from '../src/render/signals.ts';
import { liftFootprint, placedExit } from '../src/render/stations.ts';
import { busStopPortals, makeBusRoutes } from '../src/sim/buses.ts';
import { decodeWalk, LINK, type WalkJson } from '../src/sim/walknet.ts';
import { load as loadStage2, type Stage2Data } from './w48-stage2.ts';

/** 앱(src/main.ts)과 같이 그리는 노면 표시: 칠한 선은 횡단보도 줄무늬 면 앞에서 끊고(clipLines), 줄무늬에 걸리는 화살표는 그리지 않는다(arrowOnCrossing). 재작업 W59 */
export interface Stage12Data extends Stage2Data {
  bands: Band[];
  clip: ClipStats;
}
const cache = new Map<string, Stage12Data>();
export function load(dir?: string): Stage12Data {
  const base = loadStage2(dir);
  const hit = cache.get(base.dir);
  if (hit) return hit;
  const bands = crossingBands(base.board.crosswalks, base.marks.crossings, base.board.crosswalkMarks);
  const clip: ClipStats = { cut: 0, dropped: 0, removed: 0 };
  const d = { ...base, marks: { ...base.marks, lines: clipLines(base.marks.lines, bands, undefined, clip) }, bands, clip };
  cache.set(base.dir, d);
  return d;
}

type Rings = ArrayLike<number>[];
type Box = [number, number, number, number];
export interface Spot {
  x: number;
  z: number;
  /** 결함 크기(겹친 넓이 m², 침범 m, 틈 m) */
  v: number;
  note: string;
}
export interface Found {
  /** 결함 수, 본 것 수, 결함 크기 합 */
  n: number;
  of: number;
  total: number;
  /** 큰 차례 */
  spots: Spot[];
  byKind: Record<string, number>;
}
const found = (spots: Spot[], of: number): Found => {
  spots.sort((a, b) => b.v - a.v);
  const byKind: Record<string, number> = {};
  for (const s of spots) byKind[s.note.split(' ')[0]] = (byKind[s.note.split(' ')[0]] ?? 0) + 1;
  return { n: spots.length, of, total: spots.reduce((a, s) => a + s.v, 0), spots, byKind };
};
/** 큰 차례 10곳 */
export const worst = (f: Found, unit: string) => f.spots.slice(0, 10).map((s) => `${s.note} ${s.v.toFixed(2)}${unit} @ ${s.x.toFixed(1)},${s.z.toFixed(1)}`);

const inRing = (r: ArrayLike<number>, x: number, z: number) => {
  let c = false;
  for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
    const [xi, zi, xj, zj] = [r[i], r[i + 1], r[j], r[j + 1]];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
};
const inAny = (rings: Rings, x: number, z: number) => rings.some((r) => inRing(r, x, z));
/** 점에서 고리 외곽선까지 거리 */
const edgeDist = (r: ArrayLike<number>, x: number, z: number) => {
  let best = Infinity;
  for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
    const [ax, az, dx, dz] = [r[j], r[j + 1], r[i] - r[j], r[i + 1] - r[j + 1]];
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
    best = Math.min(best, Math.hypot(ax + dx * t - x, az + dz * t - z));
  }
  return best;
};
/** 고리들(합친 면)까지 거리: 밖이면 양수, 안이면 음수(든 고리 외곽선까지 거리) */
const signedDist = (rings: Rings, x: number, z: number) => {
  let out = Infinity;
  let inn = 0;
  for (const r of rings) {
    const e = edgeDist(r, x, z);
    if (inRing(r, x, z)) inn = Math.max(inn, e);
    else out = Math.min(out, e);
  }
  return inn > 0 ? -inn : out;
};
const bbox = (rings: Rings): Box => {
  let [x0, z0, x1, z1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const r of rings) for (let k = 0; k < r.length; k += 2) (x0 = Math.min(x0, r[k])), (x1 = Math.max(x1, r[k])), (z0 = Math.min(z0, r[k + 1])), (z1 = Math.max(z1, r[k + 1]));
  return [x0, z0, x1, z1];
};

/** 그리는 횡단보도 면(render/signals.ts makeSignalMarks 와 같이 늘인 면이 있으면 그것, 없으면 서울시 면, 판에 없는 골목 입구 면은 번호 −1−k)·건너는 방향과 20m 칸 찾기 */
interface Xw {
  i: number;
  rings: Rings;
  box: Box;
  ux: number;
  uz: number;
}
function crosswalkFaces(d: Stage2Data) {
  const list: Xw[] = d.board.crosswalks.map((c, i) => {
    const rings = d.marks.crossings.get(i) ?? c.rings;
    return { i, rings, box: bbox(rings), ux: c.ux, uz: c.uz };
  });
  // 골목 입구 면: 가장 긴 변을 건너는 방향으로 본다(render/signals.ts 와 같다)
  d.board.crosswalkMarks.forEach((r, k) => {
    let [best, ux, uz] = [0, 1, 0];
    for (let q = 0; q < r.length; q += 2) {
      const [dx, dz] = [r[(q + 2) % r.length] - r[q], r[(q + 3) % r.length] - r[q + 1]];
      const l = Math.hypot(dx, dz);
      if (l > best) (best = l), (ux = dx / l), (uz = dz / l);
    }
    list.push({ i: -1 - k, rings: [r], box: bbox([r]), ux, uz });
  });
  const G = 20;
  const grid = new Map<number, Xw[]>();
  for (const w of list)
    for (let gx = Math.floor(w.box[0] / G); gx <= Math.floor(w.box[2] / G); gx++)
      for (let gz = Math.floor(w.box[1] / G); gz <= Math.floor(w.box[3] / G); gz++) (grid.get(gx * 1000 + gz) ?? grid.set(gx * 1000 + gz, []).get(gx * 1000 + gz)!).push(w);
  /** 감싸는 사각형(r m 늘인 것)이 겹치는 횡단보도들 */
  const near = ([x0, z0, x1, z1]: Box, r = 0) => {
    const out = new Set<Xw>();
    for (let gx = Math.floor((x0 - r) / G); gx <= Math.floor((x1 + r) / G); gx++)
      for (let gz = Math.floor((z0 - r) / G); gz <= Math.floor((z1 + r) / G); gz++)
        for (const w of grid.get(gx * 1000 + gz) ?? []) if (w.box[0] <= x1 + r && w.box[2] >= x0 - r && w.box[1] <= z1 + r && w.box[3] >= z0 - r) out.add(w);
    return out;
  };
  return { list, near };
}

const surfaceOf = (d: Stage2Data) => decodeSurface(JSON.parse(readFileSync(`${d.dir}/surface.json`, 'utf8')) as SurfaceJson);
const groundOf = (d: Stage2Data): GroundQuery => groundQuery(tileRings(surfaceOf(d).ground));

/** (1) 에서 보는 칠한 선 종류(서울시 대분류) → 이름: 횡단보도 앞에서 끝나야 하는 선. 주차금지(9~11)·유도선(12)·자전거횡단도(13) 등은 보지 않는다 */
export const XW_LINE_KINDS: Record<number, string> = { 1: '중앙선', 2: '가변차선', 4: '정지선', 5: '버스전용선', 6: '차선', 7: '가장자리선', 8: '진로변경제한선', 17: '중앙버스전용선' };

/** 그리는 땅 위 칠한 선(XW_LINE_KINDS, 반폭 = 겹선 사이 + 한 줄 반폭, 점선 틈도 칠로 본다)과 노면 화살표(arrowShape) 모양 위 0.1m 간격 점들 */
function markShapes(d: Stage2Data) {
  const marks: { note: string; pts: number[]; stop?: boolean }[] = [];
  d.marks.lines.forEach((l, j) => {
    if (!XW_LINE_KINDS[l.k] || l.p.some((v, k) => k % 3 === 1 && Math.abs(v) > 0.3)) return;
    const st = lineStyle(l.k, l.k2);
    const hw = st.sep + st.w / 2;
    const pts: number[] = [];
    for (let k = 3; k < l.p.length; k += 3) {
      const [ax, az, bx, bz] = [l.p[k - 3], l.p[k - 1], l.p[k], l.p[k + 2]];
      const L = Math.hypot(bx - ax, bz - az) || 1;
      const [nx, nz] = [(-(bz - az) / L) * hw, ((bx - ax) / L) * hw];
      const n = Math.ceil(L / 0.1);
      for (let q = 0; q <= n; q++) for (const o of [-1, 0, 1]) pts.push(ax + ((bx - ax) * q) / n + nx * o, az + ((bz - az) * q) / n + nz * o);
    }
    marks.push({ note: `${XW_LINE_KINDS[l.k]} l${j}(${l.k}/${l.k2})`, pts, stop: l.k === 4 });
  });
  // 화살표: render/marks.ts 와 같이 앞 (fx, fz), 왼쪽 (fz, −fx). 다각형 외곽선 위 점
  // 줄무늬에 걸려 앱이 그리지 않는 화살표(arrowOnCrossing)는 보지 않는다
  const bands = 'bands' in d ? (d as Stage12Data).bands : crossingBands(d.board.crosswalks, d.marks.crossings, d.board.crosswalkMarks);
  d.marks.arrows.forEach((a, j) => {
    const shape = arrowShape(a.kind, a.w);
    if (!shape || arrowOnCrossing(a, bands)) return;
    const pts: number[] = [];
    for (const q of shape)
      for (let k = 0; k < q.length; k += 2) {
        const [u0, v0, u1, v1] = [q[k], q[k + 1], q[(k + 2) % q.length], q[(k + 3) % q.length]];
        const n = Math.ceil(Math.hypot(u1 - u0, v1 - v0) / 0.1);
        for (let s = 0; s < n; s++) {
          const [u, v] = [u0 + ((u1 - u0) * s) / n, v0 + ((v1 - v0) * s) / n];
          pts.push(a.x + a.fx * u + a.fz * v, a.z + a.fz * u - a.fx * v);
        }
      }
    marks.push({ note: `화살표 a${j}(k${a.kind})`, pts });
  });
  return marks;
}

/** 표시 점들과 면 사이 틈(m): 면 밖 가장 가까운 점까지 거리, 면 안에 든 점이 있으면 가장 깊은 깊이에 − (box 에서 lim m 넘게 떨어진 점은 건너뛴다) */
function shapeGap(pts: number[], rings: Rings, [x0, z0, x1, z1]: Box, lim: number) {
  let gap = Infinity;
  for (let k = 0; k < pts.length; k += 2) {
    const [x, z] = [pts[k], pts[k + 1]];
    if (x < x0 - lim || x > x1 + lim || z < z0 - lim || z > z1 + lim) continue;
    gap = Math.min(gap, signedDist(rings, x, z));
  }
  return gap;
}

/** 횡단보도 i 의 그리는 면과 r m 안 칠한 선·화살표 사이 가장 짧은 틈(m, 겹치면 0 아래): 가까운 차례 */
export function markClearance(d: Stage2Data, i: number, r = 15) {
  const rings = d.marks.crossings.get(i) ?? d.board.crosswalks[i].rings;
  const box = bbox(rings);
  return markShapes(d)
    .map((m) => ({ note: m.note, gap: shapeGap(m.pts, rings, box, r) }))
    .filter((m) => m.gap < r)
    .sort((a, b) => a.gap - b.gap);
}

/**
 * (1) 칠한 선·화살표가 그리는 횡단보도 면(서울시 면·늘인 면 x·골목 입구 면)과 겹치거나 clear m 안으로 붙은 곳: 표시와 횡단보도 짝마다 틈을 재고
 * 결함 크기는 clear − 틈(m, 면 안으로 깊이 들어갈수록 크다)
 */
export function markOverlap(d: Stage2Data, clear = 0.3): Found {
  const { near } = crosswalkFaces(d);
  const spots: Spot[] = [];
  let of = 0;
  for (const m of markShapes(d)) {
    // 정지선은 그리는 폭(반폭 0.225m)이 면과 겹칠 때만 센다(여유 없음, clipLines 와 같은 기준). 0.001m 는 Float32 반올림
    const lim = m.stop ? -0.001 : clear;
    for (const w of near(bbox([m.pts]), clear)) {
      of++;
      const gap = shapeGap(m.pts, w.rings, w.box, clear + 0.1);
      if (gap >= lim) continue;
      // 자리: 면에 가장 가까운(깊은) 점
      let at = 0;
      for (let k = 0, b = Infinity; k < m.pts.length; k += 2) {
        const s = signedDist(w.rings, m.pts[k], m.pts[k + 1]);
        if (s < b) (b = s), (at = k);
      }
      spots.push({ x: m.pts[at], z: m.pts[at + 1], v: lim - gap, note: `${m.note} xw${w.i} ${gap < 0 ? `면안${(-gap).toFixed(2)}m` : `틈${gap.toFixed(2)}m`}` });
    }
  }
  return found(spots, of);
}

/** 앱(src/main.ts)과 같은 길가 정류장 쉼터 자리: 사람 모듈의 정류장 자리(attach)와 dockPoint(그 걷는 선 띠 가장자리)를 걷는 그물에서 바로 구한다 */
function shelterSpots(d: Stage2Data) {
  const W = decodeWalk(JSON.parse(readFileSync(`${d.dir}/walk.json`, 'utf8')) as WalkJson);
  const routes = makeBusRoutes(d.board.buses, d.g, undefined, d.board.crosswalks);
  // 사람 모듈은 횡단보도 잇는 선 양 끝 노드에 건너기 선(잇는 선 아님)을 더 단다
  const linked = new Set(W.links.flatMap((l) => [l.na, l.nb]));
  const ok = (a: number) => linked.has(a) || W.kind[a].some((k) => k !== LINK);
  return busStopPortals(routes, d.g).portals.flatMap((p) => {
    if (p.median) return [];
    const hit = W.nearestEdge(p.x, p.z, ok);
    if (!hit || hit[3] > 25) return [];
    const [a, k, t] = hit;
    const b = W.adj[a][k];
    const [ax, az] = [W.nx[a * 2], W.nx[a * 2 + 1]];
    const L = Math.hypot(W.nx[b * 2] - ax, W.nx[b * 2 + 1] - az) || 1;
    const [ux, uz] = [(W.nx[b * 2] - ax) / L, (W.nx[b * 2 + 1] - az) / L];
    const [lo, hi] = W.band[a][k];
    const u = (p.x - ax) * -uz + (p.z - az) * ux >= 0 ? hi : lo;
    return [{ x: ax + ux * t - uz * u, z: az + uz * t + ux * u, yaw: Math.atan2(uz, ux) }];
  });
}

/**
 * (2) 앱이 그리는 자리(찻길 면 밖으로 옮긴 뒤, placeOff·signalPoles·placedExit·placedShelters)의 시설물 바닥이 그리는 횡단보도 면을 폭 방향(긴 두 변 쪽)으로만
 * grow m 늘인 띠와 겹치거나 그 안이다. 건너는 방향 끝은 늘이지 않는다(끝 너머 보도의 보행 신호 기둥은 맞는 자리). 기둥은 밑동 반지름만큼 둥근 바닥.
 * 결함 크기: 면 안이면 grow + 깊이, 늘인 띠에만 들면 grow − 폭 방향으로 옮겨야 면에 닿는 거리
 */
export function furnitureOnCrosswalk(d: Stage2Data, grow = 0.2): Found {
  const { board, marks, g, inter } = d;
  const q = groundOf(d);
  const list: { note: string; x: number; z: number; pts: number[]; r: number }[] = [];
  const poles = signalPoles(g, inter.S, board.crosswalks, stopSegments(marks.lines), q);
  for (const p of poles.car) list.push({ note: `carPole e${p.edge}`, x: p.x, z: p.z, pts: [p.x, p.z], r: 0.14 });
  for (const p of poles.ped) list.push({ note: `pedPole xw${p.xw}`, x: p.x, z: p.z, pts: [p.x, p.z], r: 0.07 });
  for (const e0 of board.exits) {
    if (!Number.isFinite(e0.yaw)) continue;
    const e = placedExit(e0, e0.st, q);
    list.push({ note: `exit ${e.st}${e.ref}`, x: e.x, z: e.z, pts: exitOutline(e, exitLook(e.st, e.ref)).flat(), r: 0 });
  }
  for (let k = 0; k < board.elevators.length; k += 2) {
    const r = placeOff(q, board.elevators[k], board.elevators[k + 1], liftFootprint(board.elevators[k], board.elevators[k + 1]));
    list.push({ note: `lift ${k / 2}`, x: r.x, z: r.z, pts: liftFootprint(r.x, r.z), r: 0 });
  }
  placedShelters(shelterSpots(d), q).forEach((s, k) => list.push({ note: `shelter ${k}`, x: s.x, z: s.z, pts: shelterFootprint(s), r: 0 }));
  const { near } = crosswalkFaces(d);
  const spots: Spot[] = [];
  for (const f of list) {
    // 바닥 점: 기둥은 밑동 둘레 8점과 가운데, 다각형은 변 위 0.05m 간격
    const pts: number[] = [];
    if (f.r > 0) {
      pts.push(f.x, f.z);
      for (let k = 0; k < 8; k++) pts.push(f.x + Math.cos((k * Math.PI) / 4) * f.r, f.z + Math.sin((k * Math.PI) / 4) * f.r);
    } else
      for (let k = 0; k < f.pts.length; k += 2) {
        const [ax, az, bx, bz] = [f.pts[k], f.pts[k + 1], f.pts[(k + 2) % f.pts.length], f.pts[(k + 3) % f.pts.length]];
        const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.05));
        for (let s = 0; s < n; s++) pts.push(ax + ((bx - ax) * s) / n, az + ((bz - az) * s) / n);
      }
    let best = -Infinity;
    let at = -1;
    for (const w of near(bbox([f.pts]), grow + f.r + 0.1)) {
      // 폭 방향(긴 변에 수직, 줄무늬가 놓인 변 쪽) 단위 벡터
      const [vx, vz] = [-w.uz, w.ux];
      for (let k = 0; k < pts.length; k += 2) {
        const s = signedDist(w.rings, pts[k], pts[k + 1]);
        // 면 안이면 깊이 + grow, 아니면 폭 방향으로 grow 안에서 옮겨 면에 드는 가장 짧은 거리 t 에 대해 grow − t
        let v = s < 0 ? grow - s : -Infinity;
        for (let t = 0.02; v === -Infinity && t <= grow + 1e-9; t += 0.02)
          if ([1, -1].some((sg) => inAny(w.rings, pts[k] + vx * t * sg, pts[k + 1] + vz * t * sg))) v = grow - t;
        if (v > best) (best = v), (at = w.i);
      }
      // 다각형 바닥이 면 꼭짓점을 감싸는 경우(바닥 점은 면 밖): 면 꼭짓점을 폭 방향으로 옮겨 바닥 안에 드는가
      if (f.r === 0)
        for (const r of w.rings)
          for (let k = 0; k < r.length; k += 2)
            for (let t = -grow; t <= grow + 1e-9; t += 0.02) if (inRing(f.pts, r[k] + vx * t, r[k + 1] + vz * t) && grow - Math.abs(t) > best) (best = grow - Math.abs(t)), (at = w.i);
    }
    if (best >= 0) spots.push({ x: f.x, z: f.z, v: best, note: `${f.note} xw${at} ${best > grow ? `면안${(best - grow).toFixed(2)}m` : `띠${grow}m안 폭방향${(grow - best).toFixed(2)}m`}` });
  }
  return found(spots, list.length);
}

/**
 * (3) 신호 횡단보도(보행 신호가 있고 신호 계획에 든 것)의 그리는 면마다, 폭 방향 20·50·80% 세 줄에서 줄무늬 양 끝부터 건너는 방향 바깥으로
 * 찻길이 끝나는 자리(그린 찻길 면 밖 = 연석, 분리대 녹지 surface.json m, 교통섬 surface-polys.json isl, 같은 횡단보도의 다른 단 면)까지의 틈(m).
 * 0.25m 걸음 뒤 0.01m 안으로 좁히고 max m 에서 멈춘다. 세 줄 가운데 큰 값이 그 끝의 틈. 줄무늬 끝이 이미 찻길 밖이면 틈 0
 */
export function crosswalkEndGaps(d: Stage2Data, minGap = 0.3, max = 10): Found {
  const sf = surfaceOf(d);
  const car = groundQuery(tileRings(sf.ground));
  const med = groundQuery(tileRings(sf.median));
  const isl = (JSON.parse(readFileSync(`${d.dir}/surface-polys.json`, 'utf8')) as { isl: number[][] }).isl.map((r) => Float32Array.from(r, (v) => v / 10));
  const spots: Spot[] = [];
  let of = 0;
  d.board.crosswalks.forEach((c, i) => {
    if (!c.sig || d.inter.S.crossSite[i] < 0) return;
    const rings = d.marks.crossings.get(i) ?? c.rings;
    rings.forEach((r, ri) => {
      const other = rings.filter((_, k) => k !== ri);
      const open = (x: number, z: number) => car.onCar(x, z) && !med.onCar(x, z) && !isl.some((p) => inRing(p, x, z)) && !other.some((p) => inRing(p, x, z));
      // (u, v) 틀: u 건너는 방향, v 폭 방향
      const uv: number[] = [];
      for (let k = 0; k < r.length; k += 2) uv.push((r[k] - c.x) * c.ux + (r[k + 1] - c.z) * c.uz, -(r[k] - c.x) * c.uz + (r[k + 1] - c.z) * c.ux);
      const vs = uv.filter((_, k) => k % 2);
      const [v0, v1] = [Math.min(...vs), Math.max(...vs)];
      const gap = [0, 0];
      const where: [number, number][] = [[0, 0], [0, 0]];
      for (const f of [0.2, 0.5, 0.8]) {
        const v = v0 + (v1 - v0) * f;
        let [lo, hi] = [Infinity, -Infinity];
        for (let a = 0, b = uv.length - 2; a < uv.length; b = a, a += 2) {
          if (uv[a + 1] > v === uv[b + 1] > v) continue;
          const u = uv[a] + ((v - uv[a + 1]) / (uv[b + 1] - uv[a + 1])) * (uv[b] - uv[a]);
          (lo = Math.min(lo, u)), (hi = Math.max(hi, u));
        }
        if (!(lo < hi)) continue;
        const P = (u: number): [number, number] => [c.x + u * c.ux - v * c.uz, c.z + u * c.uz + v * c.ux];
        const on = (u: number) => open(...P(u));
        [hi, lo].forEach((end, s) => {
          const dir = s ? -1 : 1;
          if (!on(end - dir * 0.05)) return;
          let t = 0;
          while (t < max && on(end + dir * t)) t += 0.25;
          if (t < max)
            for (let a = Math.max(0, t - 0.25); t - a > 0.01; ) {
              const m = (a + t) / 2;
              if (on(end + dir * m)) a = m;
              else t = m;
            }
          t = Math.min(t, max);
          if (t > gap[s]) (gap[s] = t), (where[s] = P(end + (dir * t) / 2));
        });
      }
      for (const s of [0, 1]) {
        of++;
        if (gap[s] > minGap) spots.push({ x: where[s][0], z: where[s][1], v: gap[s], note: `xw${i}${rings.length > 1 ? `/${ri}` : ''} ${s ? '−' : '+'}끝${gap[s] >= max ? `(${max}m이상)` : ''}` });
      }
    });
  });
  return found(spots, of);
}
