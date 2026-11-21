// 빈 도로 지도 마무리 정적 검사(재작업 W57). 차·사람 없이 보이는 판(찻길 면·시설물·노면 표시·횡단보도)이 길 정본과 맞는지 판 전체로 센다.
// (A)(B) 세우는 시설물(차량·보행 신호 기둥, 길가 정류장 쉼터, 지하철 출구·엘리베이터, 로드뷰 기록 가로등·소품)이 그린 찻길 면 안(가장자리에서 0.3m 넘게)에 서는가
// (C) 신호 교차로·길 중간 신호 횡단보도 줄무늬가 그 횡단보도가 가로지르는 찻길 폭(연석에서 연석, 섬·분리대에서 끊기는 것은 끊김이 아님)을 덮는가
// (D) 노면 화살표가 차로 가운데에 있는가, 종류가 그 차로 허용 움직임과 맞는가, 버스전용차로 구획선이 정본 버스차로 경계와 맞는가
import { readdirSync, readFileSync } from 'node:fs';
import { decodeSurface, tileRings, type SurfaceJson, type TileRings } from '../src/data/surface.ts';
import { groundQuery, placeOff } from '../src/data/offroad.ts';
import { placedShelters, shelterFootprint } from '../src/render/busstops.ts';
import { liftFootprint, placedExit } from '../src/render/stations.ts';
import { stopSegments } from '../src/data/marks.ts';
import { exitLook } from '../src/data/exits.ts';
import { exitOutline } from '../src/data/exitFit.ts';
import { type AreaRec, xz as llToXZ } from '../src/data/streetview.ts';
import { pointAt } from '../src/poly.ts';
import { headingNear, laneOff, laneWidth, leftEdge, MED, rightEdge, type Edge } from '../src/sim/graph.ts';
import { signalPoles } from '../src/render/signals.ts';
import { bitsAt } from '../tools/lib/bits.ts';
import { deepOnCar } from '../tools/lib/treeplace.ts';
import { arrowLanes } from '../tools/road/arrows.ts';
import { makeCars } from '../src/sim/cars.ts';
import { busStopPortals, makeBusRoutes } from '../src/sim/buses.ts';
import { makePeople, underpasses, ZONES, type Portal } from '../src/sim/people/index.ts';
import { makeSimProvider } from '../src/sim/provider.ts';
import { decodeWalk, type WalkJson } from '../src/sim/walknet.ts';
import { load, type Stage2Data } from './w48-stage2.ts';
import { drawn } from './w51-surface.ts';

export interface Spot {
  kind: string;
  x: number;
  z: number;
  /** 더 적을 것(번호 등) */
  note?: string;
}

/** 시설물 바닥 자리: 종류, 가운데, 바닥을 따라 찍은 점들 */
export interface Footprint {
  kind: string;
  x: number;
  z: number;
  pts: [number, number][];
  note?: string;
}

const box = (cx: number, cz: number, yaw: number, a0: number, a1: number, b0: number, b1: number, step = 0.5): [number, number][] => {
  const [ux, uz] = [Math.cos(yaw), Math.sin(yaw)];
  const out: [number, number][] = [];
  const na = Math.max(1, Math.ceil((a1 - a0) / step));
  const nb = Math.max(1, Math.ceil((b1 - b0) / step));
  for (let i = 0; i <= na; i++)
    for (let j = 0; j <= nb; j++) {
      const a = a0 + ((a1 - a0) * i) / na;
      const b = b0 + ((b1 - b0) * j) / nb;
      out.push([cx + ux * a - uz * b, cz + uz * a + ux * b]);
    }
  return out;
};

/** 로드뷰 기록(data-src/streetview/*.json) */
export function streetviewAreas(): AreaRec[] {
  const dir = new URL('../data-src/streetview/', import.meta.url).pathname;
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(dir + f, 'utf8')) as AreaRec);
}

/** 세우는 시설물 가운데 사람·차 시뮬레이션 없이 자리가 정해지는 것(신호 기둥·출구·엘리베이터·로드뷰 소품). 길가 정류장 쉼터는 사람 그물이 정해 따로 센다 */
export function staticFacilities(d: Stage2Data): Footprint[] {
  const { board, marks, g, inter } = d;
  const out: Footprint[] = [];
  const poles = signalPoles(g, inter.S, board.crosswalks, stopSegments(marks.lines));
  for (const p of poles.car) out.push({ kind: 'carPole', x: p.x, z: p.z, pts: [[p.x, p.z]], note: `e${p.edge}` });
  for (const p of poles.ped) out.push({ kind: 'pedPole', x: p.x, z: p.z, pts: [[p.x, p.z]], note: `xw${p.xw}` });
  // 출구: 렌더러와 같은 출구 모형 외곽(exitOutline)
  for (const e of board.exits) {
    if (!Number.isFinite(e.yaw)) continue;
    const look = exitLook(e.st, e.ref);
    out.push({ kind: 'exit', x: e.x, z: e.z, pts: exitOutline(e, look), note: `${e.st}${e.ref}` });
  }
  // 엘리베이터: 2.8m 정사각형 지붕(방향은 무시하고 반지름 1.4m 둘레로 본다)
  for (let k = 0; k < board.elevators.length; k += 2) {
    const [x, z] = [board.elevators[k], board.elevators[k + 1]];
    out.push({ kind: 'lift', x, z, pts: box(x, z, 0, -1.4, 1.4, -1.4, 1.4, 0.7), note: `lift${k / 2}` });
  }
  // 로드뷰 기록 소품: 가로등 기둥, 문 기둥, 부스, 퍼걸러
  for (const a of streetviewAreas())
    for (const p of a.props) {
      if (p.kind === 'lamp') {
        const [x, z] = llToXZ(p.ll);
        out.push({ kind: 'lamp', x, z, pts: [[x, z]], note: a.area });
      } else if (p.kind === 'gate' || p.kind === 'booth' || p.kind === 'pergola') {
        const [x, z] = llToXZ(p.ll);
        out.push({ kind: p.kind, x, z, pts: [[x, z]], note: a.area });
      }
    }
  return out;
}

const pairs = (a: number[]): [number, number][] => Array.from({ length: a.length / 2 }, (_, k) => [a[k * 2], a[k * 2 + 1]]);
/** 길가 정류장 쉼터 바닥(render/busstops.ts shelterFootprint) */
export const shelterPts = (s: { x: number; z: number; yaw: number }) => pairs(shelterFootprint(s));

/** 앱이 그리는 자리(찻길 면 밖으로 옮긴 뒤)의 시설물: src/main.ts 와 같은 함수(signalPoles·placedExit·placeOff·siteOf 의 stand) */
export function placedFacilities(d: Stage2Data, tiles: TileRings[]): Footprint[] {
  const { board, marks, g, inter } = d;
  const q = groundQuery(tiles);
  const out: Footprint[] = [];
  const poles = signalPoles(g, inter.S, board.crosswalks, stopSegments(marks.lines), q);
  for (const p of poles.car) out.push({ kind: 'carPole', x: p.x, z: p.z, pts: [[p.x, p.z]], note: `e${p.edge}` });
  for (const p of poles.ped) out.push({ kind: 'pedPole', x: p.x, z: p.z, pts: [[p.x, p.z]], note: `xw${p.xw}` });
  for (const e0 of board.exits) {
    if (!Number.isFinite(e0.yaw)) continue;
    const e = placedExit(e0, e0.st, q);
    out.push({ kind: 'exit', x: e.x, z: e.z, pts: exitOutline(e, exitLook(e.st, e.ref)), note: `${e.st}${e.ref}` });
  }
  for (let k = 0; k < board.elevators.length; k += 2) {
    const r = placeOff(q, board.elevators[k], board.elevators[k + 1], liftFootprint(board.elevators[k], board.elevators[k + 1]));
    out.push({ kind: 'lift', x: r.x, z: r.z, pts: pairs(liftFootprint(r.x, r.z)), note: `lift${k / 2}` });
  }
  for (const a of streetviewAreas())
    for (const p of a.props) {
      if (p.kind !== 'lamp' && p.kind !== 'gate' && p.kind !== 'booth' && p.kind !== 'pergola') continue;
      const [x0, z0] = llToXZ(p.ll);
      const r = placeOff(q, x0, z0, [x0, z0], 0.3, 6, 0);
      out.push({ kind: p.kind, x: r.x, z: r.z, pts: [[r.x, r.z]], note: a.area });
    }
  return out;
}

/** 앱이 그리는 자리의 길가 정류장 쉼터(placedShelters) */
export function shelterSpotsPlaced(d: Stage2Data, tiles: TileRings[]): Footprint[] {
  return placedShelters(shelterSpots(d), groundQuery(tiles)).map((s) => ({ kind: 'shelter', x: s.x, z: s.z, pts: shelterPts(s) }));
}

/** 바닥 점 가운데 하나라도 그린 찻길 면 안(가장자리에서 0.3m 넘게)이면 센다 */
export function onCarriageway(d: Stage2Data, list: Footprint[]): Found {
  const { B } = drawn(d);
  const f: Found = { n: 0, of: list.length, where: [], byKind: {} };
  for (const q of list) {
    if (!q.pts.some(([x, z]) => deepOnCar(B, x, z))) continue;
    f.n++;
    f.byKind[q.kind] = (f.byKind[q.kind] ?? 0) + 1;
    f.where.push(`${q.kind} ${q.note ?? ''} ${q.x.toFixed(1)},${q.z.toFixed(1)}`);
  }
  return f;
}

export interface Found {
  n: number;
  of: number;
  where: string[];
  byKind: Record<string, number>;
}

const inRing = (r: Float32Array, x: number, z: number) => {
  let c = false;
  for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
    const [xi, zi, xj, zj] = [r[i], r[i + 1], r[j], r[j + 1]];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
};

/** 줄무늬를 이만큼(m)까지는 찻길 면 끝으로 늘인다(tools/road/crossings.ts MAX 와 같다). 더 길게 비면 찻길 면이 섬·교차로 안까지 덮은 것으로 따로 센다 */
export const XW_MAX = 8;

/**
 * (C) 신호 횡단보도(보행 신호가 있고 신호 계획에 든 횡단보도)마다 건너는 축(가운데 ± 폭의 0.3 세 줄)을 0.25m 로 짚어,
 * 줄무늬(그리는 면)가 한 점이라도 덮은 찻길 칸 줄(찻길 면 위로 이어진 칸, 섬·분리대·보도와 건너는 방향이 비낀 다른 횡단보도에서 끊긴다) 안의 줄무늬 밖 토막(0.5m 넘는 것)을 센다.
 * 토막(줄무늬와 찻길 끝 사이, 또는 두 줄무늬 사이)이 XW_MAX 안이면 '끊김'(short), 그보다 길면 찻길 면이 섬·교차로 안까지
 * 덮어 끝을 알 수 없는 것(long: 찻길 면 쪽 문제)으로 따로 센다. 세 줄 가운데 가장 많이 빈 줄의 길이를 그 횡단보도 값으로 친다
 */
export function crosswalkGaps(d: Stage2Data, ringsOf: (i: number) => Float32Array[] = (i) => d.board.crosswalks[i].rings, cell = 0.25) {
  const { board, inter } = d;
  const { B } = drawn(d);
  const f = { n: 0, of: 0, where: [] as string[], len: 0, long: 0, longLen: 0, per: [] as { i: number; gap: number; x: number; z: number }[], longs: [] as { i: number; gap: number; x: number; z: number }[] };
  /** 둘레 60m 안 다른 횡단보도의 그리는 면: 건너는 방향이 나란한(37° 안) 것과 비낀 것 */
  const others = (i: number, par: boolean) => {
    const c = board.crosswalks[i];
    return board.crosswalks.flatMap((o, j) => (j !== i && Math.abs(o.x - c.x) < 60 && Math.abs(o.z - c.z) < 60 && Math.abs(o.ux * c.ux + o.uz * c.uz) > 0.8 === par ? ringsOf(j) : []));
  };
  board.crosswalks.forEach((c, i) => {
    if (!c.sig || inter.S.crossSite[i] < 0) return;
    const rings = ringsOf(i);
    if (!rings.length) return;
    f.of++;
    const L = c.half + 30;
    const n = Math.ceil((2 * L) / cell);
    const par = others(i, true);
    const cross = others(i, false);
    let worst = 0;
    let worstLong = 0;
    for (const off of [-0.3, 0, 0.3]) {
      const ox = c.x - c.uz * off * c.wid;
      const oz = c.z + c.ux * off * c.wid;
      const car = new Uint8Array(n + 1);
      const cov = new Uint8Array(n + 1);
      /** 비낀 다른 횡단보도 면 칸 */
      const xcut = new Uint8Array(n + 2);
      for (let k = 0; k <= n; k++) {
        const t = -L + k * cell;
        const [x, z] = [ox + c.ux * t, oz + c.uz * t];
        car[k] = bitsAt(B, x, z) & 1 ? 1 : 0;
        // 줄무늬: 이 횡단보도 면이면 2, 건너는 방향이 나란한 다른 횡단보도 면이면 1. 비낀 다른 횡단보도(교차로 모서리에서 만나는 것) 면은 줄을 끊는다
        cov[k] = rings.some((r) => inRing(r, x, z)) ? 2 : par.some((r) => inRing(r, x, z)) ? 1 : 0;
        if (!cov[k] && cross.some((r) => inRing(r, x, z))) (car[k] = 0), (xcut[k] = 1);
      }
      let gap = 0;
      let long = 0;
      let k = 0;
      while (k <= n) {
        if (!car[k]) {
          k++;
          continue;
        }
        let j = k;
        let hit = false;
        while (j <= n && car[j]) (hit ||= cov[j] === 2), j++;
        if (hit) {
          // 줄 [k, j) 안 줄무늬 밖 토막
          let a = k;
          while (a < j) {
            if (cov[a]) {
              a++;
              continue;
            }
            let b = a;
            while (b < j && !cov[b]) b++;
            const len = (b - a) * cell;
            // 비낀 다른 횡단보도에 닿는 토막(교차로 모서리)은 끊김이 아니다
            const atCross = (a === k && k > 0 && xcut[k - 1]) || (b === j && xcut[j]);
            if (len > 0.5 && !atCross) {
              if (len <= XW_MAX) gap += len;
              else long += len;
            }
            a = b;
          }
        }
        k = j;
      }
      worst = Math.max(worst, gap);
      worstLong = Math.max(worstLong, long);
    }
    if (worst > 0) {
      f.n++;
      f.len += worst;
      f.per.push({ i, gap: worst, x: c.x, z: c.z });
    }
    if (worstLong > 0) {
      f.long++;
      f.longLen += worstLong;
      f.longs.push({ i, gap: worstLong, x: c.x, z: c.z });
    }
  });
  f.per.sort((a, b) => b.gap - a.gap);
  f.longs.sort((a, b) => b.gap - a.gap);
  f.where = f.per.slice(0, 20).map((p) => `xw${p.i} ${p.gap.toFixed(1)}m ${p.x.toFixed(1)},${p.z.toFixed(1)}`);
  return f;
}

const ARROW_TURNS: Record<number, number> = { 5: 1, 6: 4, 7: 2, 8: 3, 9: 6, 10: 9, 11: 9, 13: 5, 14: 7, 15: 11, 20: 12 };
const P = [0, 0, 0];

/**
 * (D) 화살표: 차로 가운데에서 0.3m 넘게 벗어난 화살표(칸 폭 반 넘게 = 선 위·옆 차로), 맞는 차로가 없는 화살표,
 * 회전 화살표(ARROW_TURNS)가 놓인 차로의 허용 움직임(X.laneMoves)과 다른 것(교차로 앞 45m 안, 화살표가 보이는 움직임 ≠ 그 차로가 할 수 있는 움직임)
 */
export function arrowCheck(d: Stage2Data) {
  const { inter } = d;
  const off = { n: 0, of: 0, where: [] as string[], byKind: {} as Record<string, number> };
  const none = { n: 0, of: 0, where: [] as string[], byKind: {} as Record<string, number> };
  const kind = { n: 0, of: 0, where: [] as string[], byKind: {} as Record<string, number> };
  const lanes = arrowLanes(d.marks.arrows, d.g);
  d.marks.arrows.forEach((a, i) => {
    const best = lanes[i];
    if (!best) {
      none.n++;
      if (none.where.length < 30) none.where.push(`k${a.kind} ${a.x.toFixed(1)},${a.z.toFixed(1)}`);
      return;
    }
    off.of++;
    const w = laneWidth(best.e, best.lane, best.s);
    if (best.off > 0.3) {
      off.n++;
      off.where.push(`k${a.kind} e${best.e.id}/${best.lane} ${best.off.toFixed(2)}m(폭 ${w.toFixed(1)}) ${a.x.toFixed(1)},${a.z.toFixed(1)}`);
    }
    const m = ARROW_TURNS[a.kind];
    const e = best.e;
    const end = e.lb >= 0 ? e.lb : e.len;
    if (!m || inter.X.jEnd[e.id] < 0 || best.s < end - 45 || best.s > end + 2) return;
    kind.of++;
    const can = inter.X.laneMoves(e.id, best.lane);
    if ((m & can) !== m) {
      kind.n++;
      kind.where.push(`k${a.kind}(${m}) 차로 ${can} e${e.id}/${best.lane} ${a.x.toFixed(1)},${a.z.toFixed(1)}`);
    }
  });
  off.where.sort((p, q) => Number(q.split(' ')[2].replace('m(폭', '')) - Number(p.split(' ')[2].replace('m(폭', '')));
  return { off, none, kind };
}

/** 선분 격자 */
function segIndex(lines: { p: Float32Array }[], cellM = 10) {
  const grid = new Map<number, number[]>();
  const segs: number[] = [];
  const key = (x: number, z: number) => Math.floor(x / cellM) * 100003 + Math.floor(z / cellM);
  for (const l of lines)
    for (let k = 3; k < l.p.length; k += 3) {
      const id = segs.length / 4;
      segs.push(l.p[k - 3], l.p[k - 1], l.p[k], l.p[k + 2]);
      const [x0, x1] = [Math.min(l.p[k - 3], l.p[k]), Math.max(l.p[k - 3], l.p[k])];
      const [z0, z1] = [Math.min(l.p[k - 1], l.p[k + 2]), Math.max(l.p[k - 1], l.p[k + 2])];
      for (let gx = Math.floor(x0 / cellM); gx <= Math.floor(x1 / cellM); gx++)
        for (let gz = Math.floor(z0 / cellM); gz <= Math.floor(z1 / cellM); gz++) (grid.get(gx * 100003 + gz) ?? grid.set(gx * 100003 + gz, []).get(gx * 100003 + gz)!).push(id);
    }
  /** (x, z) 에서 r 안 가장 가까운 선분 거리 */
  const near = (x: number, z: number, r: number) => {
    let best = Infinity;
    for (let gx = Math.floor((x - r) / cellM); gx <= Math.floor((x + r) / cellM); gx++)
      for (let gz = Math.floor((z - r) / cellM); gz <= Math.floor((z + r) / cellM); gz++)
        for (const id of grid.get(gx * 100003 + gz) ?? []) {
          const [ax, az, bx, bz] = [segs[id * 4], segs[id * 4 + 1], segs[id * 4 + 2], segs[id * 4 + 3]];
          const dx = bx - ax, dz = bz - az;
          const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
          best = Math.min(best, Math.hypot(ax + dx * t - x, az + dz * t - z));
        }
    return best;
  };
  void key;
  return near;
}

/**
 * (D) 버스전용차로 구획: 정본 버스차로 경계(가로변 버스차로 e.bus 의 왼쪽 가장자리, 중앙버스차로 MED 의 오른쪽 = 일반 차로 쪽 가장자리. MED 왼쪽은 중앙선 자리라 뺀다)를
 * 2m 마다 짚어(땅 위, 교차로 상자·횡단보도 밖) 0.5m 안에 버스전용 선(5·17)이 없는 길이(miss: 그 가운데 다른 선이 그어진 길이 other, 아무 선도 없는 길이 bare)와,
 * 그린 버스전용 선(땅 위) 표본 가운데 0.5m 안에 정본 버스차로 경계가 없는 길이(stray)
 */
export function busLaneCheck(d: Stage2Data) {
  const { marks, g, inter, board } = d;
  const ground = (l: { p: Float32Array }) => l.p.every((_, i) => i % 3 !== 1 || Math.abs(l.p[i]) <= 0.3);
  const busLines = marks.lines.filter((l) => (l.k === 5 || l.k === 17) && ground(l));
  const nearBus = segIndex(busLines);
  const nearAny = segIndex(marks.lines.filter((l) => l.k !== 4 && ground(l)));
  const bounds: { p: Float32Array }[] = [];
  const miss = { n: 0, of: 0, other: 0, bare: 0, where: [] as string[], byKind: {} as Record<string, number> };
  const missCell = new Map<string, number>();
  const xwHit = (x: number, z: number) => board.crosswalks.some((c) => Math.abs(c.x - x) < 30 && Math.abs(c.z - z) < 30 && c.rings.some((r) => inRing(r, x, z)));
  for (const e of g) {
    const sides: [string, (s: number) => number][] = [];
    if (e.bus >= 0) sides.push(['side', (s) => laneOff(e, e.bus, s) - laneWidth(e, e.bus, s) / 2]);
    if (e.mo.length || e.med) sides.push(['med', (s) => laneOff(e, MED, s) + laneWidth(e, 0, s) / 2]);
    for (const [kind, side] of sides) {
      const pts: number[] = [];
      for (let s = 1; s < e.len - 1; s += 2) {
        pointAt(e.p, e.cum, s, P);
        if (Math.abs(P[1]) > 0.3) continue;
        const h = headingNear(e, s);
        const o = side(s);
        const [x, z] = [P[0] - Math.sin(h) * o, P[2] + Math.cos(h) * o];
        pts.push(x, 0, z);
        if (s < inter.X.rOut[e.id] || s > e.len - inter.X.rIn[e.id] || xwHit(x, z)) continue;
        miss.of += 2;
        if (nearBus(x, z, 0.5) > 0.5) {
          miss.n += 2;
          if (nearAny(x, z, 0.5) <= 0.5) miss.other += 2;
          else miss.bare += 2;
          miss.byKind[kind] = (miss.byKind[kind] ?? 0) + 2;
          const c = `${Math.round(x / 50) * 50},${Math.round(z / 50) * 50} ${kind}`;
          missCell.set(c, (missCell.get(c) ?? 0) + 2);
        }
      }
      if (pts.length >= 6) bounds.push({ p: Float32Array.from(pts) });
    }
  }
  miss.where = [...missCell].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([c, v]) => `${c} ${v}m`);
  const nearBound = segIndex(bounds);
  const stray = { n: 0, of: 0, where: [] as string[], byKind: {} as Record<string, number> };
  const strayCell = new Map<string, number>();
  for (const l of busLines)
    for (let k = 3; k < l.p.length; k += 3) {
      const [ax, az, bx, bz] = [l.p[k - 3], l.p[k - 1], l.p[k], l.p[k + 2]];
      const L = Math.hypot(bx - ax, bz - az);
      for (let t = 0; t < L; t += 0.5) {
        const [x, z] = [ax + ((bx - ax) * t) / L, az + ((bz - az) * t) / L];
        const w = Math.min(0.5, L - t);
        stray.of += w;
        if (nearBound(x, z, 0.5) > 0.5) {
          stray.n += w;
          const c = `${Math.round(x / 50) * 50},${Math.round(z / 50) * 50} k${l.k}`;
          strayCell.set(c, (strayCell.get(c) ?? 0) + w);
        }
      }
    }
  stray.where = [...strayCell].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([c, v]) => `${c} ${v.toFixed(0)}m`);
  return { miss, stray };
}

export { load };
export const surfaceOf = (d: Stage2Data) => decodeSurface(JSON.parse(readFileSync(`${d.dir}/surface.json`, 'utf8')) as SurfaceJson);
export const groundTilesOf = (d: Stage2Data) => tileRings(surfaceOf(d).ground);

/** 앱(src/main.ts)과 같게 길가 정류장 쉼터 자리(사람 그물의 정류장 자리 dockPoint, 중앙 정류장 빼고)를 만든다. 차는 채우지 않는다 */
export function shelterSpots(d: Stage2Data): { x: number; z: number; yaw: number }[] {
  const { board, g, inter } = d;
  const W = decodeWalk(JSON.parse(readFileSync(`${d.dir}/walk.json`, 'utf8')) as WalkJson);
  const provider = makeSimProvider();
  const busy = new Uint32Array(board.crosswalks.length);
  const cars = makeCars(g, provider, 11, 10, makeBusRoutes(board.buses, g, undefined, board.crosswalks), inter, { list: board.crosswalks, busy });
  const stops = busStopPortals(cars.routes, g);
  const medStop = new Set(stops.portals.filter((p) => p.median).map((p) => p.key));
  const portals: Portal[] = [
    ...board.exits.map((e) => ({ kind: 'exit' as const, key: e.st, x: e.x, z: e.z })),
    ...stops.portals,
    ...underpasses(board.roads, ...ZONES.mangwon).map(([x, z]) => ({ kind: 'exit' as const, key: '망원나들목', x, z })),
    ...Array.from({ length: board.picnic.length / 2 }, (_, i) => ({ kind: 'exit' as const, key: '망원한강공원', x: board.picnic[i * 2], z: board.picnic[i * 2 + 1] })),
  ];
  const p = makePeople(W, portals, provider, 5, 10, { buildings: board.buildings, walkLeft: () => -1, busy, traffic: () => false, cars: cars.cars });
  return p.docks.flatMap((dk, k) => (dk.kind === 'stop' && !medStop.has(dk.key) ? [p.dockPoint(k)] : []));
}
