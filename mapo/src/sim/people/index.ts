// 사람(보행자) 시뮬레이션(재작업 W21, 설계 문서 45절). 옛 walkers.ts 를 고쳐 쓰지 않고 처음부터 다시 썼다.
// 지오 지시를 규칙으로 둔다:
//  - 사람은 역 출구·버스 승하차 자리·건물 문(과 망원한강공원 피크닉 자리·나들목)에서만 나타나고 사라진다. 화면을 채울 때도 그 자리에서만 낸다.
//  - 사람은 몸(반지름 BODY_R)이 있어 다른 사람·차 몸통과 겹치지 않는다: 움직이기 전에 새 자리가 비었는지 보고, 비었을 때만 옮긴다.
//  - 사람은 걷는 길 그물(walk.json)의 걷는 띠·노드 원·횡단보도 기다리는 자리·횡단보도 통로 안에만 있다. 그물은 굽기에서 큰길 찻길과
//    몸 반지름 + 여유만큼 떨어지게 잘랐으므로(tools/lib/walkfix.ts), 이 안에 있으면 찻길 위에 서지 않는다.
//  - 큰길은 횡단보도로만, 보행 신호를 지켜 건넌다. 같은 자리를 오가며 갇히면 가장 가까운 출구·문으로 돌아간다.
//  - 자리는 매 단계 걸음만큼만 바뀐다(순간이동 없음). 선을 갈아탈 때도 자리는 그대로 두고 따라가는 선만 바꾼다.
import type { Now } from '../clock.ts';
import { BODY_HW, BODY_LEN, bodyType } from '../bodies.ts';
import { ISLAND_BACK, ISLAND_L, ISLAND_W } from '../graph.ts';
import type { DataProvider } from '../provider.ts';
import { PLACES, placeMask } from '../places.ts';
import { pick, rng } from '../rng.ts';
import { LINK, type WalkGraph } from '../walknet.ts';
import { agentLine, makeLines, solve, wallLine } from './orca.ts';
import { outside, PLACE_Z, OUT_Z, placeNow, ZONE_IDS, zoneOf } from './zones.ts';

export { doorWanted, OUT_BASE, outside, underpasses, walkerScale, walkerTarget, zoneTargets, ZONE_IDS, ZONES } from './zones.ts';

/** 그리기(render/walkers.ts)와 고양이(catReact.ts)가 읽는 사람 자리 */
export interface Walkers {
  n: number;
  x: Float32Array;
  z: Float32Array;
  yaw: Float32Array;
  /** 걸음 위상(라디안). 걸은 거리에 비례해 늘어난다 */
  phase: Float32Array;
  /** 나타날 때 0→1, 사라질 때 1→0 */
  fade: Float32Array;
  /** 캐릭터마다 다른 0~1 값(색) */
  tint: Float32Array;
  /** 고유 번호(배열 자리가 바뀌어도 그대로) */
  id: Int32Array;
  /** 휴대폰을 든 정도 0~1(멈춰 서서 고양이를 찍는 중) */
  photo: Float32Array;
  /** 걷는 중이면 1, 서 있으면 0 (걸음 흔들림에 쓴다) */
  moving: Float32Array;
  /** 나이대: 0 아이(0~9세), 1 10·20대, 2 30~50대, 3 60대 이상 */
  age: Uint8Array;
  /** 여성이면 1 */
  female: Uint8Array;
}

/** 사람이 들고 나는 곳. 역 출구는 key 가 역 이름, 정류장은 정류장 열쇠. 건물 문은 걷는 길 자료(walk.json d)에서 온다 */
export interface Portal {
  kind: 'exit' | 'stop';
  key: string;
  x: number;
  z: number;
  /** 중앙버스정류장: (x, z)는 버스가 서는 자리(승강장 가운데에서 버스 진행 방향으로 ISLAND_BACK 앞), yaw 는 버스 진행 방향 */
  median?: boolean;
  yaw?: number;
}

/** 차 몸통(시뮬레이션 cars.ts 의 Cars 가운데 사람이 보는 칸) */
export interface CarBodies {
  n: number;
  x: Float32Array;
  y: Float32Array;
  z: Float32Array;
  yaw: Float32Array;
  kind: Uint8Array;
  tint: Float32Array;
}

/** 사람 몸 반지름(m). 1.5배로 키운 그림(머리 반지름 0.27 × 1.5)과 같다. 두 사람 가운데는 2 × BODY_R 보다 가깝지 않다 */
export const BODY_R = 0.4;
/** 두 사람 가운데 사이 가장 가까운 거리(m): 몸통(반지름 0.2 × 1.5 = 0.3)끼리는 절대 닿지 않는다(걸음마다 확인하는 하한).
 *  상호 회피(orca.ts)는 머리(0.4)까지 띄운 2 × BODY_R 를 지키려 하고, 빽빽해 다 지킬 수 없을 때만 이 거리까지 다가간다 */
export const PASS_D = 0.6;
/** 사람 그림 배율(지오 지시 2026-11-17 '사람 크기 1.5배 안팎', render/walkers.ts) */
export const BODY_SCALE = 1.5;
/** 보는 곳 사람 과장 배수: 보는 곳 안은 실제 인원의 이 배수까지 그린다(화면 배율 표시가 그만큼을 알린다) */
export const EXAG = 2;
/** 걷는 띠를 선 양 끝 너머로 쓰는 거리(m). 굽기(tools/lib/walkfix.ts)가 이만큼 넓힌 띠를 확인한다 */
const EDGE_EXT = 0.02;
/** 차 몸통 둘레 여유(m) */
const CAR_PAD = 0.1;
/** 한 번에 움직이는 가장 긴 시간(초): 이보다 긴 단계는 나눠 돈다(가장 빠른 걸음 2.2m/s 로 0.22m) */
const SUB = 0.1;
/** 상호 회피: 이웃을 보는 거리(m), 내다보는 시간(초), 벽(걷는 띠 가장자리)에 다가가는 시간(초) */
const NEAR = 2.6;
/** 수명이 다한 사람이 가던 길 앞의 문·출구를 찾아 걷는 가장 긴 시간(초) */
const SEEK = 60;
/** 붐빔(명/m²)을 길 고르기에 넣는 무게: 돌아다니는 사람은 고를 무게에 exp(−CROWD_PICK × 붐빔). 붐빔은 선 위 사람 수 / 띠 넓이와 끝 노드 둘레 2.5m 안 밀도 × NODE_W 가운데 큰 값 */
const CROWD_PICK = 30;
const NODE_W = 3;
/** 이보다 붐비는 선에 붙은 문·출구에서는 사람을 내지 않는다(명/m²) */
const DENSE_MAX = 0.35;
/** 앞이 막혀(마주 오는 사람, 또는 서 있는 앞사람) 이만큼(초) 못 나아가면 돌아선다 */
const REV_T = 3;
const TAU = 2;
const TAU_W = 0.3;
const TURN_RATE = 7;
const PULL = 4;
const GATHER = 3;
const CROSS_COST = 12;
const MAX_WAIT_BUS = 300;
const HURRY = 2.2;
/** 같은 자리 오가기 감지: 5초마다 자리를 적고 30초 창에서 본다 */
const SAMPLE = 5;
const RING = 7;

const WALK = 0;
const WAITX = 1; // 횡단보도 앞 기다림
const CROSS = 2; // 건너는 중
const QUEUE = 3; // 정류장 줄에서 버스를 기다림
const BOARD = 4; // 버스 문 앞 자리로 걸어가 탄다
const LEAVE = 5; // 들어가며 흐려짐(출구·문턱·버스)
const OUTDOOR = 6; // 문턱에서 걷는 선으로 나옴
const INDOOR = 7; // 걷는 선에서 문턱으로 들어감

/** 방향 있는 선(그물 선의 한쪽 방향, 또는 횡단보도 건너기) */
interface HE {
  a: number;
  b: number;
  L: number;
  ux: number;
  uz: number;
  lo: number;
  hi: number;
  w: number;
  rev: number;
  /** 횡단보도 건너기 번호(−1 이면 그물 선) */
  x: number;
  kind: number;
}
/** 횡단보도 건너기: 기다리는 자리 → 칠 끝 → (건너편 칠 끝 또는 승강장) → 건너편 기다리는 자리 */
interface Cross {
  xw: number;
  pts: number[];
  cum: number[];
  /** 통로 반폭(m) */
  hw: number;
  major: boolean;
  /** 축 시작점과 방향(바쁜 칸 표시용, 횡단보도 E0 → E1) */
  ex: number;
  ez: number;
  vx: number;
  vz: number;
}
/** 기울어진 네모 자리(기다리는 자리·승강장): 원점 o, 방향 U, 옆 V = (−Uz, Ux), 범위 [u0, u1] × [v0, v1] */
interface Rect {
  ox: number;
  oz: number;
  ux: number;
  uz: number;
  u0: number;
  u1: number;
  v0: number;
  v1: number;
}
interface Dock {
  kind: 'exit' | 'stop' | 'door';
  key: string;
  x: number;
  z: number;
  /** 붙은 방향 있는 선과 그 위 거리, 옆 거리 */
  he: number;
  t: number;
  lat: number;
  /** 건물 문턱 */
  door?: [number, number];
  zone: number;
  mask: number;
  weight: number;
}

export function makePeople(
  g: WalkGraph,
  portals: Portal[],
  provider: DataProvider,
  seed = 1,
  max = 1500,
  o: {
    /** 판 건물(문의 몫 = 바닥 넓이 × 층수) */
    buildings?: { pts: ArrayLike<number>; h: number }[];
    /** 횡단보도 xw 의 보행 신호: 초록불 남은 초(초록불이 아니면 0), 신호가 없으면 −1 */
    walkLeft?: (xw: number, tod: number) => number;
    /** 횡단보도마다 지금 사람이 건너는 자리(축 2m 칸 비트): 차가 보고 선다 */
    busy?: Uint32Array;
    /** 신호 없는 횡단보도로 차가 다가오는가 */
    traffic?: (xw: number) => boolean;
    /** 차 몸통 */
    cars?: CarBodies;
    /** 처음에 문·출구에서 나오는 빠르기를 키울 시간(초): 미리 돌리기 */
  } = {},
) {
  const rand = rng(seed);
  const w: Walkers = {
    n: 0,
    x: new Float32Array(max),
    z: new Float32Array(max),
    yaw: new Float32Array(max),
    phase: new Float32Array(max),
    fade: new Float32Array(max),
    tint: new Float32Array(max),
    id: new Int32Array(max),
    photo: new Float32Array(max),
    moving: new Float32Array(max),
    age: new Uint8Array(max),
    female: new Uint8Array(max),
  };
  let nextId = 1;

  // ── 그물 ──
  const NX: number[] = Array.from(g.nx);
  const RAD: number[] = Array.from(g.rad);
  const out: number[][] = g.adj.map(() => []);
  const hes: HE[] = [];
  const crosses: Cross[] = [];
  const rects: Rect[] = [];
  const nodeRects: number[][] = g.adj.map(() => []);
  const addNode = (x: number, z: number, r: number) => {
    NX.push(x, z);
    RAD.push(r);
    out.push([]);
    nodeRects.push([]);
    return RAD.length - 1;
  };
  const addPair = (a: number, b: number, lo: number, hi: number, wgt: number, kind: number, x = -1, L?: number) => {
    const dx = NX[b * 2] - NX[a * 2];
    const dz = NX[b * 2 + 1] - NX[a * 2 + 1];
    const len = L ?? Math.hypot(dx, dz);
    const d = Math.hypot(dx, dz) || 1;
    const i = hes.length;
    hes.push({ a, b, L: len, ux: dx / d, uz: dz / d, lo, hi, w: wgt, rev: i + 1, x, kind });
    hes.push({ a: b, b: a, L: len, ux: -dx / d, uz: -dz / d, lo: -hi, hi: -lo, w: wgt, rev: i, x: x < 0 ? -1 : x + 1, kind });
    out[a].push(i);
    out[b].push(i + 1);
    return i;
  };
  /** 그물 선 (a, 이웃 k) → 방향 있는 선 번호 */
  const heOf = new Map<number, number>();
  for (let a = 0; a < g.adj.length; a++)
    g.adj[a].forEach((b, k) => {
      if (b < a) return;
      const [lo, hi] = g.band[a][k];
      const i = addPair(a, b, lo, hi, g.aw[a][k], g.kind[a][k]);
      heOf.set(a * 64 + k, i);
      const kb = g.adj[b].findIndex((q, kk) => q === a && g.band[b][kk][0] === -hi && g.band[b][kk][1] === -lo);
      if (kb >= 0) heOf.set(b * 64 + kb, i + 1);
    });
  /** 건너기 길 [x, z, ...] 둘을 짝(가는 쪽, 오는 쪽)으로 더한다 */
  const addCross = (xw: number, pts: number[], hw: number, major: boolean, ex: number, ez: number, vx: number, vz: number) => {
    const mk = (p: number[]): Cross => {
      const cum = [0];
      for (let k = 2; k < p.length; k += 2) cum.push(cum[cum.length - 1] + Math.hypot(p[k] - p[k - 2], p[k + 1] - p[k - 1]));
      return { xw, pts: p, cum, hw, major, ex, ez, vx, vz };
    };
    const rp: number[] = [];
    for (let k = pts.length - 2; k >= 0; k -= 2) rp.push(pts[k], pts[k + 1]);
    crosses.push(mk(pts), mk(rp));
    return crosses.length - 2;
  };
  const crossOfLink: number[] = [];
  g.links.forEach((l) => {
    const L = Math.hypot(l.bx - l.ax, l.bz - l.az) || 1;
    const vx = (l.bx - l.ax) / L;
    const vz = (l.bz - l.az) / L;
    const hw = Math.max(0.2, l.wid / 2 - 0.3);
    const c = addCross(l.xw, [l.pax, l.paz, l.ax, l.az, l.bx, l.bz, l.pbx, l.pbz], hw, l.major, l.ax, l.az, vx, vz);
    crossOfLink.push(c);
    addPair(l.na, l.nb, -hw, hw, 1, -1, c, crosses[c].cum[crosses[c].cum.length - 1]);
    // 양 끝 기다리는 자리
    const ua = (l.pax - l.ax) * vx + (l.paz - l.az) * vz;
    const ub = (l.pbx - l.ax) * vx + (l.pbz - l.az) * vz;
    rects.push({ ox: l.ax, oz: l.az, ux: vx, uz: vz, u0: ua - 0.75, u1: ua + 0.05, v0: Math.min(l.aLo, 0), v1: Math.max(l.aHi, 0) });
    nodeRects[l.na].push(rects.length - 1);
    rects.push({ ox: l.ax, oz: l.az, ux: vx, uz: vz, u0: ub - 0.05, u1: ub + 0.75, v0: Math.min(l.bLo, 0), v1: Math.max(l.bHi, 0) });
    nodeRects[l.nb].push(rects.length - 1);
  });

  // ── 출구·정류장·문 ──
  const docks: Dock[] = [];
  const dockAtHe = new Map<number, number[]>();
  const pushDock = (d: Dock) => {
    docks.push(d);
    (dockAtHe.get(d.he) ?? dockAtHe.set(d.he, []).get(d.he)!).push(docks.length - 1);
    const r = hes[d.he].rev;
    (dockAtHe.get(r) ?? dockAtHe.set(r, []).get(r)!).push(docks.length - 1);
  };
  const attach = (x: number, z: number): [number, number, number] | null => {
    const hit = g.nearestEdge(x, z, (a) => out[a].some((h) => hes[h].kind !== LINK));
    if (!hit || hit[3] > 25) return null;
    const he = heOf.get(hit[0] * 64 + hit[1]);
    if (he === undefined) return null;
    const h = hes[he];
    const lat = (x - NX[h.a * 2]) * -h.uz + (z - NX[h.a * 2 + 1]) * h.ux;
    return [he, hit[2], Math.max(h.lo, Math.min(h.hi, lat)) * 0.85];
  };
  for (const p of portals) {
    if (p.median) {
      // 중앙버스정류장: 승강장 가운데선과 축이 53° 넘게 기울어 만나는 횡단보도 가운데 가장 가까운 것을 반으로 나눠 승강장 자리(I)에 잇고,
      // 승강장을 따라 버스가 서는 자리(Q)까지 선을 둔다. Q 가 정류장이다
      const ux = Math.cos(p.yaw ?? 0);
      const uz = Math.sin(p.yaw ?? 0);
      const cx = p.x - ux * ISLAND_BACK;
      const cz = p.z - uz * ISLAND_BACK;
      let best = -1;
      let bs = 0;
      g.links.forEach((l, li) => {
        const la = Math.hypot(l.bx - l.ax, l.bz - l.az) || 1;
        const vx = (l.bx - l.ax) / la;
        const vz = (l.bz - l.az) / la;
        const den = ux * vz - uz * vx;
        if (Math.abs(den) < 0.8) return;
        const wx = l.ax - cx;
        const wz = l.az - cz;
        const s = (wx * vz - wz * vx) / den;
        const t = (wx * uz - wz * ux) / den;
        if (t < 1 || t > la - 1 || Math.abs(s) > ISLAND_L / 2 + 20) return;
        if (best < 0 || Math.abs(s) < Math.abs(bs)) (best = li), (bs = s);
      });
      if (best < 0) continue;
      const l = g.links[best];
      const half = ISLAND_L / 2 - 1;
      const sI = Math.max(-half, Math.min(half, bs));
      const ix = cx + ux * sI;
      const iz = cz + uz * sI;
      const pw = ISLAND_W / 2 - BODY_R - 0.05;
      const I = addNode(ix, iz, pw);
      const sQ = Math.max(-half, Math.min(half, Math.abs(sI) < 3 ? sI + (sI > 0 ? -4 : 4) : 0));
      const Q = addNode(cx + ux * sQ, cz + uz * sQ, pw);
      rects.push({ ox: cx, oz: cz, ux, uz, u0: -half, u1: half, v0: -pw, v1: pw });
      nodeRects[I].push(rects.length - 1);
      nodeRects[Q].push(rects.length - 1);
      const he = addPair(I, Q, -pw, pw, 1, 0);
      const L = Math.hypot(l.bx - l.ax, l.bz - l.az) || 1;
      const vx = (l.bx - l.ax) / L;
      const vz = (l.bz - l.az) / L;
      const hw = Math.max(0.2, l.wid / 2 - 0.3);
      const ca = addCross(l.xw, [l.pax, l.paz, l.ax, l.az, ix, iz], hw, l.major, l.ax, l.az, vx, vz);
      addPair(l.na, I, -hw, hw, 1, -1, ca, crosses[ca].cum[crosses[ca].cum.length - 1]);
      const cb = addCross(l.xw, [ix, iz, l.bx, l.bz, l.pbx, l.pbz], hw, l.major, l.ax, l.az, vx, vz);
      addPair(I, l.nb, -hw, hw, 1, -1, cb, crosses[cb].cum[crosses[cb].cum.length - 1]);
      pushDock({ kind: 'stop', key: p.key, x: p.x, z: p.z, he, t: hes[he].L, lat: 0, zone: zoneOf(ix, iz), mask: placeMask(ix, iz, 20), weight: 1 });
      continue;
    }
    const at = attach(p.x, p.z);
    if (!at) continue;
    const [he, t, lat] = at;
    const zone = zoneOf(p.x, p.z);
    pushDock({ kind: p.kind, key: p.key, x: p.x, z: p.z, he, t, lat, zone, mask: placeMask(p.x, p.z, 20), weight: 1 });
  }
  for (const d of g.doors) {
    const he = heOf.get(d.a * 64 + d.k);
    if (he === undefined) continue;
    const b = o.buildings?.[d.b];
    let area = 100;
    if (b) {
      area = 0;
      for (let i = 0, j = b.pts.length - 2; i < b.pts.length; j = i, i += 2) area += b.pts[j] * b.pts[i + 1] - b.pts[i] * b.pts[j + 1];
      area = Math.abs(area) / 2;
    }
    let zone = zoneOf(d.x, d.z);
    const mask = placeMask(d.x, d.z, 20);
    if (zone === OUT_Z && mask) zone = PLACE_Z;
    pushDock({ kind: 'door', key: '', x: d.x, z: d.z, he, t: d.t, lat: 0, door: [d.x, d.z], zone, mask, weight: area * Math.max(1, (b?.h ?? 6) / 3) });
  }
  // 노드마다 목록을 길이에 맞춰 다시 담는다(push 로 늘린 배열은 칸을 넉넉히 잡아 노드 11만 개에 수십 MB 를 더 쓴다, W19)
  for (let n = 0; n < out.length; n++) (out[n] = out[n].slice()), (nodeRects[n] = nodeRects[n].slice());
  // ── (선을 다 더한 뒤: 중앙 승강장 선 포함) 좁은 길(두 사람이 엇갈려 지날 수 없는 띠: 가운데가 설 수 있는 폭이 2 × BODY_R 보다 좁다)의 차지: 방향 있는 선마다 지금 그 선을 걷는 사람 수 ──
  const narrow = new Uint8Array(hes.length);
  for (let k = 0; k < hes.length; k++) narrow[k] = hes[k].x < 0 && hes[k].hi - hes[k].lo < 2 * BODY_R ? 1 : 0;
  /** 방향 있는 선마다 지금 그 선을 걷는 사람 수 */
  const occ = new Int32Array(hes.length);
  /** 걷는 띠 넓이(m², 몸 반지름만큼 양옆을 더한 실제 바닥, 짧은 선도 6m² 로 친다) */
  const bandA = new Float32Array(hes.length);
  for (let k = 0; k < hes.length; k++) bandA[k] = Math.max(6, hes[k].L * (hes[k].hi - hes[k].lo + 2 * BODY_R));
  /** 선 k 의 붐빔(양 방향 사람 수 / 띠 넓이, 명/m²) */
  const dens = (k: number) => (occ[k] + occ[hes[k].rev]) / bandA[k];
  /** 좁은 선 k 로 들어서면 마주 오는 사람이 있는가: k 와 그 뒤로 갈래 없이 이어진 좁은 선들(25m)에 반대 방향으로 걷는 사람이 있다 */
  function opposed(k: number): boolean {
    let len = 0;
    for (let q = 0; q < 40 && k >= 0 && narrow[k] && len < 25; q++) {
      if (occ[hes[k].rev] > 0) return true;
      len += hes[k].L;
      const b = hes[k].b;
      if (out[b].length !== 2) break;
      const nxt = out[b][0] === hes[k].rev ? out[b][1] : out[b][0];
      k = nxt;
    }
    return false;
  }

  const dockPos = (k: number): [number, number] => {
    const d = docks[k];
    const h = hes[d.he];
    return [NX[h.a * 2] + h.ux * d.t - h.uz * d.lat, NX[h.a * 2 + 1] + h.uz * d.t + h.ux * d.lat];
  };

  // ── 집으로 가는 길: 출구·문까지(D0)와 정류장까지(D1) 걸을 거리 ──
  const NN = RAD.length;
  const dField = (want: (d: Dock) => boolean) => {
    const D = new Float64Array(NN).fill(Infinity);
    const hk: number[] = [];
    const hv: number[] = [];
    const push = (k: number, v: number) => {
      hk.push(k), hv.push(v);
      let i = hk.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (hk[p] <= hk[i]) break;
        [hk[p], hk[i]] = [hk[i], hk[p]];
        [hv[p], hv[i]] = [hv[i], hv[p]];
        i = p;
      }
    };
    const pop = () => {
      const v = hv[0];
      const lk = hk.pop()!;
      const lv = hv.pop()!;
      if (hk.length) {
        hk[0] = lk;
        hv[0] = lv;
        let i = 0;
        for (;;) {
          const l = i * 2 + 1;
          let m = i;
          if (l < hk.length && hk[l] < hk[m]) m = l;
          if (l + 1 < hk.length && hk[l + 1] < hk[m]) m = l + 1;
          if (m === i) break;
          [hk[m], hk[i]] = [hk[i], hk[m]];
          [hv[m], hv[i]] = [hv[i], hv[m]];
          i = m;
        }
      }
      return v;
    };
    docks.forEach((d) => {
      if (!want(d)) return;
      const h = hes[d.he];
      if (d.t < D[h.a]) (D[h.a] = d.t), push(d.t, h.a);
      if (h.L - d.t < D[h.b]) (D[h.b] = h.L - d.t), push(h.L - d.t, h.b);
    });
    while (hk.length) {
      const d0 = hk[0];
      const n = pop();
      if (d0 > D[n]) continue;
      for (const k of out[n]) {
        const h = hes[k];
        const nd = d0 + h.L + (h.x >= 0 ? CROSS_COST : 0);
        if (nd < D[h.b]) (D[h.b] = nd), push(nd, h.b);
      }
    }
    return D;
  };
  const D = [dField((d) => d.kind !== 'stop'), dField((d) => d.kind === 'stop')];

  // ── 명소 ──
  const nodeMask = new Uint16Array(NN);
  for (let n = 0; n < NN; n++) nodeMask[n] = placeMask(NX[n * 2], NX[n * 2 + 1]);
  const nodePull = new Float32Array(NN);
  const lv = new Float32Array(PLACES.length);
  const pullOf = (mask: number) => {
    let v = 0;
    for (let k = 0; k < PLACES.length; k++) if (mask & (1 << k)) v = Math.max(v, lv[k]);
    return v;
  };
  const STAY = PLACES.reduce((m, p, k) => (p.stay ? m | (1 << k) : m), 0);

  // ── 사람마다 ──
  const mode = new Uint8Array(max);
  const he = new Int32Array(max); // 지금 따라가는 방향 있는 선(건너는 중이면 건너기 선)
  const nk = new Int32Array(max).fill(-1); // 다음 선(−1 아직 안 정함)
  const prv = new Int32Array(max).fill(-1); // 바로 앞에 걸어온 선
  const lane = new Float32Array(max); // 걷는 띠 안 옆자리 −1~1(오른쪽 +)
  const vX = new Float32Array(max); // 지난 걸음 속도(m/s): 이웃이 상호 회피에 쓴다
  const vZ = new Float32Array(max);
  const spd = new Float32Array(max);
  const head = new Float32Array(max);
  const life = new Float32Array(max);
  const goal = new Int8Array(max).fill(-1); // −1 돌아다님, 0 출구·문으로, 1 정류장으로
  const dockOf = new Int32Array(max).fill(-1);
  const home = new Uint8Array(max);
  const holdT = new Float32Array(max);
  const snap = new Uint8Array(max);
  const faceX = new Float32Array(max);
  const faceZ = new Float32Array(max);
  const tx = new Float32Array(max); // 걸어갈 자리(문턱·줄 자리·기다리는 자리·버스 문 앞)
  const tz = new Float32Array(max);
  const xLeg = new Uint8Array(max);
  const headW = new Float32Array(max); // 돌아다닐 때 갈 쪽(라디안)
  const avoidHe = new Int32Array(max).fill(-1); // 막혀 돌아선 선(잠시 고르지 않는다)
  const avoidT = new Float32Array(max);
  const viaNode = new Uint8Array(max); // 모퉁이에서 노드를 거쳐 갈아탄다 // 건너기 길에서 다음 점 번호
  const xLat = new Float32Array(max); // 건너는 통로에서 옆자리
  const xSpd = new Float32Array(max);
  const waitT = new Float32Array(max);
  const stuckT = new Float32Array(max);
  const walked = new Float32Array(max);
  const sampT = new Float32Array(max);
  const ring = new Float32Array(max * RING * 3); // 5초마다 [x, z, 걸은 거리]
  const ringN = new Uint8Array(max);
  const seenN = new Int32Array(max * 4).fill(-1); // 최근 지난 노드 넷
  const lastX = new Int32Array(max).fill(-1); // 마지막으로 건넌 횡단보도
  const lastXT = new Float32Array(max);
  // 성기게 움직이기(W19): 자세히 볼 필요 없는 사람(setDetail 이 거짓)은 밀린 시간이 SUB 에 닿을 때만 한 번에 움직인다
  const lag = new Float32Array(max);
  const all = [lag, vX, vZ, headW, avoidHe, avoidT, viaNode, w.x, w.z, w.yaw, w.phase, w.fade, w.tint, w.id, w.photo, w.moving, w.age, w.female, mode, he, nk, prv, lane, spd, head, life, goal, dockOf, home, holdT, snap, faceX, faceZ, tx, tz, xLeg, xLat, xSpd, waitT, stuckT, walked, sampT, ringN, lastX, lastXT];

  const dead = new Uint8Array(max);
  /** 사라질 사람 표시(단계 안에서는 배열 자리를 바꾸지 않는다: 격자가 옛 자리 번호를 쥐고 있다) */
  function remove(i: number) {
    dead[i] = 1;
  }
  function compact() {
    for (let i = w.n - 1; i >= 0; i--) if (dead[i]) dead[i] = 0, removeNow(i);
  }
  function removeNow(i: number) {
    const j = --w.n;
    if (i !== j) {
      for (const a of all) a[i] = a[j];
      dead[i] = dead[j];
      dead[j] = 0;
      ring.copyWithin(i * RING * 3, j * RING * 3, (j + 1) * RING * 3);
      seenN.copyWithin(i * 4, j * 4, j * 4 + 4);
    }
  }

  // ── 몸 겹침 ──
  const GH = 1 << 16;
  const GC = 1.4;
  const gridHead = new Int32Array(GH).fill(-1);
  const gridNext = new Int32Array(max);
  const cellKey = (cx: number, cz: number) => ((Math.imul(cx, 73856093) ^ Math.imul(cz, 19349663)) >>> 0) & (GH - 1);
  /** (x, z)에 i 의 몸이 놓이면 다른 사람과 가운데 사이가 lim 보다 가까워지는가(이미 그보다 가까운 사이는 더 다가가지만 않으면 된다) */
  function crowded(i: number, x: number, z: number, lim = PASS_D): boolean {
    const D2 = lim * lim;
    const cx = Math.floor(x / GC);
    const cz = Math.floor(z / GC);
    for (let ax = -1; ax <= 1; ax++)
      for (let az = -1; az <= 1; az++)
        for (let j = gridHead[cellKey(cx + ax, cz + az)]; j >= 0; j = gridNext[j]) {
          if (j === i || j >= w.n || dead[j]) continue;
          const dx = w.x[j] - x;
          const dz = w.z[j] - z;
          const d2 = dx * dx + dz * dz;
          if (d2 >= D2) continue;
          // 이미 겹쳐 있던 사이라면 멀어지는 걸음은 된다(겹침을 새로 만들거나 키우지만 않는다)
          if (i < w.n && !dead[i]) {
            const ox = w.x[j] - w.x[i];
            const oz = w.z[j] - w.z[i];
            if (d2 > ox * ox + oz * oz + 1e-9) continue;
          }
          return true;
        }
    return false;
  }
  /** 노드 n 둘레 2.5m 안 사람 수 / 넓이(명/m²): 갈래 길 둘레 붐빔 */
  function nodeDens(n: number): number {
    const x = NX[n * 2];
    const z = NX[n * 2 + 1];
    const cx = Math.floor(x / GC);
    const cz = Math.floor(z / GC);
    let c = 0;
    for (let ax = -2; ax <= 2; ax++)
      for (let az = -2; az <= 2; az++)
        for (let j = gridHead[cellKey(cx + ax, cz + az)]; j >= 0; j = gridNext[j]) {
          if (j >= w.n) continue;
          const dx = w.x[j] - x;
          const dz = w.z[j] - z;
          if (dx * dx + dz * dz < 6.25) c++;
        }
    return c / 19.6;
  }
  // 차 몸통 격자(8m 칸): 칸 열쇠마다 연결 목록(carCH → carCN), 차 방향의 cos·sin 은 격자를 만들 때 한 번만 구한다(W19)
  const CG = 8;
  const carCH = new Int32Array(GH).fill(-1);
  const carCN = new Int32Array(8192);
  let carCount = 0;
  const carL = new Float32Array(8192);
  const carW = new Float32Array(8192);
  const carC = new Float64Array(8192);
  const carS = new Float64Array(8192);
  function carGrid() {
    if (carCount) carCH.fill(-1);
    carCount = 0;
    const c = o.cars;
    if (!c) return;
    for (let k = 0; k < c.n && k < carL.length; k++) {
      if (Math.abs(c.y[k]) > 0.6) continue; // 지하차도·고가·둑길·터널 입구 경사 위 차는 사람과 같은 높이가 아니다(망원나들목은 강변북로 밑을 지난다)
      carL[k] = (c.kind[k] === 1 ? 12 : BODY_LEN[c.kind[k] === 2 ? 0 : bodyType(c.tint[k])]) / 2;
      carW[k] = c.kind[k] === 1 ? 1.25 : BODY_HW[c.kind[k] === 2 ? 0 : bodyType(c.tint[k])];
      carC[k] = Math.cos(c.yaw[k]);
      carS[k] = Math.sin(c.yaw[k]);
      const key = cellKey(Math.floor(c.x[k] / CG), Math.floor(c.z[k] / CG));
      carCN[k] = carCH[key];
      carCH[key] = k;
      carCount++;
    }
  }
  /** (x, z)에 몸이 놓이면 차 몸통(둘레 pad)에 얼마나 깊이 들어가는가(0 이면 안 겹침) */
  function carDepth(x: number, z: number, pad = CAR_PAD): number {
    const c = o.cars;
    if (!c || !carCount) return 0;
    const cx = Math.floor(x / CG);
    const cz = Math.floor(z / CG);
    let m = 0;
    for (let ax = -1; ax <= 1; ax++)
      for (let az = -1; az <= 1; az++)
        for (let k = carCH[cellKey(cx + ax, cz + az)]; k >= 0; k = carCN[k]) {
          const dx = x - c.x[k];
          const dz = z - c.z[k];
          const cs = carC[k];
          const sn = carS[k];
          const a = carL[k] + BODY_R + pad - Math.abs(dx * cs + dz * sn);
          const b = carW[k] + BODY_R + pad - Math.abs(-dx * sn + dz * cs);
          if (a > 0 && b > 0) m = Math.max(m, Math.min(a, b));
        }
    return m;
  }
  /** (x, z)에 몸이 놓이면 차 몸통(둘레 pad)과 겹치는가 */
  function carAt(x: number, z: number, pad = CAR_PAD): boolean {
    const c = o.cars;
    if (!c || !carCount) return false;
    const cx = Math.floor(x / CG);
    const cz = Math.floor(z / CG);
    for (let ax = -1; ax <= 1; ax++)
      for (let az = -1; az <= 1; az++)
        for (let k = carCH[cellKey(cx + ax, cz + az)]; k >= 0; k = carCN[k]) {
          const dx = x - c.x[k];
          const dz = z - c.z[k];
          const cs = carC[k];
          const sn = carS[k];
          if (Math.abs(dx * cs + dz * sn) < carL[k] + BODY_R + pad && Math.abs(-dx * sn + dz * cs) < carW[k] + BODY_R + pad) return true;
        }
    return false;
  }

  // ── 있을 수 있는 자리 ──
  const inRect = (r: Rect, x: number, z: number) => {
    const dx = x - r.ox;
    const dz = z - r.oz;
    const u = dx * r.ux + dz * r.uz;
    const v = -dx * r.uz + dz * r.ux;
    return u >= r.u0 && u <= r.u1 && v >= r.v0 - 0.02 && v <= r.v1 + 0.02;
  };
  const inNode = (n: number, x: number, z: number) => {
    const dx = x - NX[n * 2];
    const dz = z - NX[n * 2 + 1];
    if (dx * dx + dz * dz <= RAD[n] * RAD[n] + 1e-4) return true;
    for (const r of nodeRects[n]) if (inRect(rects[r], x, z)) return true;
    return false;
  };
  /** 방향 있는 선 h 의 걷는 띠 안 */
  const inBand = (h: number, x: number, z: number) => {
    const e = hes[h];
    if (e.x >= 0) {
      const c = crosses[e.x];
      return polyDist(c.pts, x, z) <= c.hw + 0.02;
    }
    // 길이 0 인 선(같은 자리 두 노드를 잇는 잇는 선)은 방향이 없어 아래 식이 어디서나 참이 된다: 띠가 없다(노드 원만 쓴다)
    if (e.L < 1e-3) return false;
    const dx = x - NX[e.a * 2];
    const dz = z - NX[e.a * 2 + 1];
    const s = dx * e.ux + dz * e.uz;
    const u = -dx * e.uz + dz * e.ux;
    return s >= -EDGE_EXT && s <= e.L + EDGE_EXT && u >= e.lo - 0.02 && u <= e.hi + 0.02;
  };
  const inHe = (h: number, x: number, z: number) => inBand(h, x, z) || inNode(hes[h].a, x, z) || inNode(hes[h].b, x, z);
  /** i 가 (x, z)에 있어도 되는가(걷는 길 안) */
  function valid(i: number, x: number, z: number): boolean {
    const m = mode[i];
    if (m === OUTDOOR || m === INDOOR) {
      const d = docks[dockOf[i]];
      const [px, pz] = dockPos(dockOf[i]);
      if (d.door && segDist(x, z, d.door[0], d.door[1], px, pz) <= 0.35) return true;
    }
    if (m === BOARD || m === QUEUE) {
      const d = dockOf[i] >= 0 ? docks[dockOf[i]] : null;
      if (d && (inHe(d.he, x, z) || inHe(hes[d.he].rev, x, z))) return true;
    }
    if (inHe(he[i], x, z)) return true;
    if (nk[i] >= 0 && inHe(nk[i], x, z)) return true;
    if (prv[i] >= 0 && inHe(prv[i], x, z)) return true;
    return false;
  }
  /** 옮길 수 없는 까닭: 0 옮김, 1 걷는 길 밖, 2 사람, 3 차 */
  let why = 0;
  function tryMove(i: number, x: number, z: number): boolean {
    why = 1;
    if (!valid(i, x, z)) return false;
    why = 2;
    if (crowded(i, x, z)) return false;
    why = 3;
    const cd = carDepth(x, z);
    if (cd > 0 && cd >= carDepth(w.x[i], w.z[i]) - 1e-4) return false;
    why = 0;
    const d = Math.hypot(x - w.x[i], z - w.z[i]);
    w.x[i] = x;
    w.z[i] = z;
    walked[i] += d;
    w.phase[i] += d * 4.6;
    return true;
  }

  // ── 고르기 ──
  const remember = (i: number, n: number) => {
    const b = i * 4;
    seenN[b + 3] = seenN[b + 2];
    seenN[b + 2] = seenN[b + 1];
    seenN[b + 1] = seenN[b];
    seenN[b] = n;
  };
  const wasAt = (i: number, n: number) => {
    const b = i * 4;
    return seenN[b] === n || seenN[b + 1] === n || seenN[b + 2] === n || seenN[b + 3] === n;
  };
  const tmpW: number[] = [];
  const tmpK: number[] = [];
  /** 노드 hes[h].b 에서 갈 다음 선 */
  function plan(i: number, h: number, now: number): number {
    const b = hes[h].b;
    const back = hes[h].rev;
    const opts0 = out[b];
    const opts = avoidT[i] > now && opts0.length > 1 ? opts0.filter((k) => k !== avoidHe[i]) : opts0;
    headW[i] += (rand() - 0.5) * 0.3;
    if (goal[i] >= 0) {
      const Dg = D[goal[i]];
      let best = -1;
      let bv = Infinity;
      for (const k of opts) {
        if (k === back && opts.length > 1) continue;
        const e = hes[k];
        // 이 선에 닿을 정류장·문이 있으면 그 거리
        // 붐빔은 넣지 않는다: 집에 가는 길은 거리 장을 따라 내려가기만 해야 붐빔이 바뀔 때마다 길을 바꾸며 오가지 않는다
        let v = e.L + (e.x >= 0 ? CROSS_COST : 0) + Dg[e.b];
        for (const dk of dockAtHe.get(k) ?? []) {
          const d = docks[dk];
          if ((goal[i] === 1) !== (d.kind === 'stop')) continue;
          const t = d.he === k ? d.t : e.L - d.t;
          if (t < v) v = t;
        }
        if (v < bv) (bv = v), (best = k);
      }
      return best;
    }
    tmpW.length = 0;
    tmpK.length = 0;
    const e0 = hes[h];
    for (const k of opts) {
      const e = hes[k];
      let wt = e.x >= 0 ? 0.5 : Math.max(0.05, e.w);
      if (k === back) wt *= 0.02;
      if (wasAt(i, e.b)) wt *= 0.05;
      if (e.x >= 0 && crosses[e.x].xw === lastX[i] && now - lastXT[i] < 120) wt *= 0.01;
      // 사람마다 정한 갈 쪽(천천히 바뀐다)으로 난 선을 좋아한다: 넓은 광장·촘촘한 선에서 제자리를 맴돌지 않게
      const dot = Math.cos(headW[i]) * e.ux + Math.sin(headW[i]) * e.uz;
      wt *= Math.exp(2.5 * dot) * (0.6 + 0.4 * Math.max(0, e0.ux * e.ux + e0.uz * e.uz));
      wt *= 1 + PULL * nodePull[e.b];
      // 붐비는 선은 덜 고른다
      if (e.x < 0) wt *= Math.exp(-CROWD_PICK * Math.max(dens(k), NODE_W * nodeDens(e.b)));
      tmpW.push(wt);
      tmpK.push(k);
    }
    if (!tmpK.length) return -1;
    return tmpK[pick(tmpW, rand())];
  }

  // ── 내보내기 ──
  const looks = Array.from({ length: PLACE_Z + 1 }, () => ({ ages: [0.05, 0.4, 0.85, 1], female: 0.5 }));
  function born(i: number, zone: number) {
    w.tint[i] = rand();
    w.id[i] = nextId++;
    w.photo[i] = 0;
    w.moving[i] = 1;
    w.fade[i] = 0;
    w.phase[i] = rand() * 6.28;
    const u = rand();
    const lk = looks[zone] ?? looks[OUT_Z];
    w.age[i] = u < lk.ages[0] ? 0 : u < lk.ages[1] ? 1 : u < lk.ages[2] ? 2 : 3;
    w.female[i] = rand() < lk.female ? 1 : 0;
    spd[i] = (w.age[i] === 3 ? 1.0 : w.age[i] === 0 ? 1.05 : 1.25) + rand() * 0.3;
    lane[i] = rand();
    life[i] = 120 + rand() * 480;
    goal[i] = -1;
    vX[i] = 0;
    vZ[i] = 0;
    holdT[i] = 0;
    waitT[i] = 0;
    stuckT[i] = 0;
    walked[i] = 0;
    sampT[i] = rand() * SAMPLE;
    ringN[i] = 0;
    lastX[i] = -1;
    seenN.fill(-1, i * 4, i * 4 + 4);
    home[i] = zone;
    nk[i] = -1;
    viaNode[i] = 0;
    prv[i] = -1;
    viaNode[i] = 0;
    headW[i] = rand() * Math.PI * 2;
    avoidHe[i] = -1;
    avoidT[i] = 0;
    lag[i] = 0;
  }
  /** 문·출구·정류장 k 에서 한 명을 낸다(자리가 비어 있을 때만). 낸 사람 번호, 못 내면 −1 */
  function spawnAt(k: number, near?: [number, number]): number {
    if (w.n >= max) return -1;
    const d = docks[k];
    let [x, z] = d.door ?? dockPos(k);
    if (near) [x, z] = near;
    const i = w.n;
    // 방향은 아무 쪽이나
    const h = rand() < 0.5 ? d.he : hes[d.he].rev;
    he[i] = h;
    nk[i] = -1;
    viaNode[i] = 0;
    prv[i] = -1;
    mode[i] = d.door && !near ? OUTDOOR : WALK;
    dockOf[i] = k;
    if (crowded(i, x, z, 2 * BODY_R) || carAt(x, z)) return -1;
    w.n++;
    w.x[i] = x;
    w.z[i] = z;
    born(i, d.zone);
    const [px, pz] = dockPos(k);
    head[i] = mode[i] === OUTDOOR ? Math.atan2(pz - z, px - x) : Math.atan2(hes[h].uz, hes[h].ux);
    w.yaw[i] = head[i];
    // 그리드에 바로 넣어 같은 단계에 낸 사람끼리 겹치지 않게
    const key = cellKey(Math.floor(x / GC), Math.floor(z / GC));
    gridNext[i] = gridHead[key];
    gridHead[key] = i;
    return i;
  }

  // ── 신호 ──
  /** 건너기 c 를 지금 시작해도 되는가: 걸음(m/s), 안 되면 0 */
  function startSpeed(i: number, c: Cross, tod: number): number {
    const span = c.cum[c.cum.length - 1];
    const left = o.walkLeft ? o.walkLeft(c.xw, tod) : -1;
    if (left >= 0) {
      if (left - 1 >= span / spd[i]) return spd[i];
      if (left > 3 && span / (left - 1) <= HURRY) return span / (left - 1);
      return 0;
    }
    return c.major && o.traffic?.(c.xw) ? 0 : spd[i];
  }
  /** 건너는 길 앞 4m 에 차 몸통이 있는가 */
  function carAhead(c: Cross, s0: number): boolean {
    for (let s = s0; s < s0 + 4 && s <= c.cum[c.cum.length - 1]; s += 0.5) {
      const [x, z] = polyAt(c, s);
      if (carAt(x, z, 0.6)) return true;
    }
    return false;
  }
  const marked: number[] = [];
  function markBusy(c: Cross, x: number, z: number) {
    if (!o.busy) return;
    const bin = Math.floor(((x - c.ex) * c.vx + (z - c.ez) * c.vz) / 2);
    if (!o.busy[c.xw]) marked.push(c.xw);
    for (let k = Math.max(0, bin - 1); k <= Math.min(31, bin + 1); k++) o.busy[c.xw] |= 1 << k;
  }

  // ── 줄 자리 ──
  function queueSpot(i: number, k: number): [number, number] | null {
    const d = docks[k];
    const h = hes[d.he];
    const side = d.kind === 'stop' && !d.door ? Math.sign((d.x - NX[h.a * 2]) * -h.uz + (d.z - NX[h.a * 2 + 1]) * h.ux) || 1 : 0;
    const lat = side > 0 ? h.hi * 0.8 : side < 0 ? h.lo * 0.8 : 0;
    for (let q = 0; q < 14; q++) {
      const s = d.t + (q % 2 ? -1 : 1) * Math.ceil(q / 2) * 0.9;
      if (s < 0 || s > h.L) continue;
      for (const l of [lat, lat * 0.4]) {
        const x = NX[h.a * 2] + h.ux * s - h.uz * l;
        const z = NX[h.a * 2 + 1] + h.uz * s + h.ux * l;
        if (!crowded(i, x, z, 2 * BODY_R)) return [x, z];
      }
    }
    return null;
  }
  /** 횡단보도 앞 기다릴 빈자리: 기다리는 자리 네모 안에서 축에 가까운 것부터 */
  function waitSpot(i: number, n: number, c: Cross): [number, number] {
    const [sx, sz] = [c.pts[0], c.pts[1]];
    for (const r of nodeRects[n]) {
      const R = rects[r];
      if (!inRect(R, sx, sz)) continue;
      const ux = sx - R.ox;
      const uz = sz - R.oz;
      const u0 = ux * R.ux + uz * R.uz;
      const v0 = -ux * R.uz + uz * R.ux;
      // 건너는 방향 오른쪽부터 0.85m 간격, 그다음 한 줄 뒤
      const dirU = (c.pts[2] - sx) * R.ux + (c.pts[3] - sz) * R.uz >= 0 ? 1 : -1;
      for (const row of [0, 0.85]) {
        const u = Math.max(R.u0, Math.min(R.u1, u0 - dirU * row));
        for (const dv of [0, 0.85, -0.85, 1.7, -1.7, 2.55, -2.55]) {
          const v = v0 + dv * -dirU;
          if (v < R.v0 || v > R.v1) continue;
          const x = R.ox + R.ux * u - R.uz * v;
          const z = R.oz + R.uz * u + R.ux * v;
          if (!crowded(i, x, z, 2 * BODY_R)) return [x, z];
        }
      }
    }
    return [w.x[i], w.z[i]];
  }

  // ── 걷기 ──
  /** 선 h 위 거리 s, 옆 u 자리 */
  const onHe = (h: number, s: number, u: number): [number, number] => {
    const e = hes[h];
    return [NX[e.a * 2] + e.ux * s - e.uz * u, NX[e.a * 2 + 1] + e.uz * s + e.ux * u];
  };
  const laneU = (i: number, h: number) => {
    const e = hes[h];
    // 우측통행: 띠 오른쪽 가장자리에서 몸 반지름 안쪽부터, 띠 오른쪽 절반 안에서 사람마다 다른 자리(lane 0~1).
    // 마주 오는 사람은 그 사람의 오른쪽(이 띠의 왼쪽)을 걸으므로, 띠가 몸 두 개보다 넓으면 마주쳐 막히지 않는다
    // 마주 오는 두 줄 사이가 몸 하나(0.85m) 넘게 비도록 띠 폭에 따라 안쪽으로 들어가는 한도를 둔다. 1.7m 보다 좁은 띠는 마주 오는 두 사람 가운데가
    // 2 × BODY_R 떨어지도록 가장자리 쪽으로 붙는다
    const W = e.hi - e.lo;
    const fmax = W > 1.7 ? Math.max(0, 1 - 0.85 / (W - 0.84)) : 0;
    const edge = Math.max(0, Math.min(0.42, (W - 2 * BODY_R) / 2));
    const u = e.hi - edge - lane[i] * fmax * Math.max(0, W / 2 - 0.42);
    return Math.max(e.lo, Math.min(e.hi, u));
  };
  /** 오래 서 있는 사람(신호·줄·머묾·들어감): 이웃이 혼자 다 비켜야 한다 */
  const standing = (j: number) => vX[j] * vX[j] + vZ[j] * vZ[j] < 0.01 && (mode[j] === WAITX || mode[j] === QUEUE || mode[j] === LEAVE || holdT[j] > 0);
  const LN = makeLines(64);
  const VO = new Float64Array(2);
  /** 걷는 띠 가장자리를 벽으로: 걷는 사람이 지금 선 띠 안(양 끝 노드 원 밖)에 있으면 옆으로 띠를 벗어나는 속도를 막는다.
   *  문으로 드나드는 사람·줄 서는 사람·기다리는 사람은 띠 밖 자리로 가야 하므로 벽을 두지 않는다(걸음마다 걷는 길 안인지는 따로 본다) */
  function walls(i: number) {
    const h = he[i];
    const e = hes[h];
    if (e.x >= 0 || mode[i] !== WALK) return;
    const x = w.x[i];
    const z = w.z[i];
    const dx = x - NX[e.a * 2];
    const dz = z - NX[e.a * 2 + 1];
    const s = dx * e.ux + dz * e.uz;
    const u = -dx * e.uz + dz * e.ux;
    if (s < 0 || s > e.L || u < e.lo - 0.02 || u > e.hi + 0.02 || inNode(e.a, x, z) || inNode(e.b, x, z)) return;
    wallLine(LN, -e.uz, e.ux, Math.max(0, e.hi - u) / TAU_W);
    // 우측통행 가운데 벽: 걷는 사람은 띠 가운데에서 몸 반지름(BODY_R)만큼 오른쪽까지만 들어온다(띠가 2 × BODY_R 보다 좁으면 오른쪽 끝). 마주 오는 두 줄 사이가 늘 2 × BODY_R 이므로
    // 붐벼도 마주 오는 사람끼리 엉키지 않는다. 띠 왼쪽에 있으면(노드에서 막 들어섰을 때) 더 왼쪽으로만 못 가게 하고, 바라는 속도가 오른쪽으로 옮긴다
    // (벽은 끝까지 지키는 선이라 지금 자리를 어기는 벽을 두면 이웃 피하기를 버린다)
    const lim = Math.min(e.hi, (e.hi + e.lo) / 2 + BODY_R);
    wallLine(LN, e.uz, -e.ux, Math.max(0, u - lim) / TAU_W);
    wrongSide = Math.max(0, lim - u);
  }
  /** 지금 선 띠에서 우측통행 자리보다 왼쪽으로 들어온 거리(m, walls 가 정한다) */
  let wrongSide = 0;
  /** 앞사람(측정·돌아서기용): 가려는 방향으로 몸 앞 3m 안 가장 가까운 사람 */
  let aheadJ = -1;
  // 회전 후보(라디안): 상호 회피로 고른 속도가 걷는 길 밖으로 나가거나 하한을 어기면 차례로 돌려 본다
  const TURNS = [0, 0.35, -0.35, 0.7, -0.7, 1.1, -1.1, 1.57, -1.57];
  /**
   * i 를 목표 (gx, gz) 쪽으로 빠르기 v(m/s)로 dt 동안 옮긴다(속도 기반 상호 회피, 재작업 W21b). 바라는 속도는 목표 쪽 v(닿기 직전엔 줄인다),
   * 마주 오는 사람이 앞에 있으면 조금 오른쪽으로 꺾는다(우측통행). 이웃(NEAR 안)과 벽으로 ORCA 반 평면을 만들어 바라는 속도에 가장 가까운 안전한 속도를 고르고,
   * 그 걸음이 걷는 길 밖·사람 하한(PASS_D)·차 몸통에 걸리면 반 걸음, 돌린 방향, 선 가운데(fallX, fallZ) 쪽 순으로 해 본다. 목표 쪽으로 나아간 거리를 돌려준다
   */
  function walkTo(i: number, gx: number, gz: number, v: number, dt: number, fallX?: number, fallZ?: number): number {
    const x0 = w.x[i];
    const z0 = w.z[i];
    let ux = gx - x0;
    let uz = gz - z0;
    const dd = Math.hypot(ux, uz);
    aheadJ = -1;
    if (dd < 1e-4) return (vX[i] = 0), (vZ[i] = 0), 0;
    ux /= dd;
    uz /= dd;
    const vp = Math.min(v, dd / dt);
    LN.n = 0;
    LN.walls = 0;
    wrongSide = 0;
    walls(i);
    const cx = Math.floor(x0 / GC);
    const cz = Math.floor(z0 / GC);
    let best = 3;
    let onc = 0;
    for (let ax = -2; ax <= 2; ax++)
      for (let az = -2; az <= 2; az++)
        for (let j = gridHead[cellKey(cx + ax, cz + az)]; j >= 0; j = gridNext[j]) {
          if (j === i || j >= w.n || dead[j]) continue;
          const rx = w.x[j] - x0;
          const rz = w.z[j] - z0;
          const d2 = rx * rx + rz * rz;
          if (d2 > NEAR * NEAR) continue;
          const f = rx * ux + rz * uz;
          const side = -rx * uz + rz * ux;
          if (f > 0 && Math.abs(side) < 2 * BODY_R + 0.15) {
            const gap = f - Math.sqrt(Math.max(0, 4 * BODY_R * BODY_R - side * side));
            if (gap < best) (best = gap), (aheadJ = j);
            // 마주 오는 사람이 거의 정면(내 오른쪽으로 0.4m 안, 또는 왼쪽)에 있다
            if (Math.cos(head[j]) * ux + Math.sin(head[j]) * uz < -0.5 && side < 0.4 && f < 4 && w.moving[j]) onc = 1;
          }
          const d = Math.sqrt(d2);
          // 반지름 합은 2 × BODY_R, 이미 그보다 가까우면 지금 사이(더 다가가지 않음)이되 하한 PASS_D 위로: 하한 바로 위에서 하한 아래로 다가가는 속도를 허락하면 하한 확인이 그 걸음을 버려 굳는다
          const R = Math.max(PASS_D + 0.02, Math.min(2 * BODY_R, d - 0.005));
          agentLine(LN, vX[i], vZ[i], rx, rz, vX[i] - vX[j], vZ[i] - vZ[j], R, TAU, standing(j) ? 1 : 0.5, dt);
        }
    let px = ux * vp;
    let pz = uz * vp;
    if (onc) {
      // 오른쪽(진행 방향 (ux, uz) 의 오른쪽 (−uz, ux))으로 20° 남짓
      const k = 0.36;
      const nx = ux - uz * k;
      const nz = uz + ux * k;
      const l = Math.hypot(nx, nz);
      px = (nx / l) * vp;
      pz = (nz / l) * vp;
    }
    if (wrongSide > 0) {
      // 우측통행 자리로: 오른쪽(지금 선의 오른쪽)으로 비켜 들어간다
      const e = hes[he[i]];
      const k = Math.min(1, wrongSide / 0.5) * 0.7 * vp;
      px += -e.uz * k;
      pz += e.ux * k;
    }
    solve(LN, v, px, pz, VO);
    const sx = VO[0];
    const sz = VO[1];
    // 고른 속도를 걸음으로 옮긴다(안 되면 반 걸음, 돌린 방향)
    for (const half of [1, 0.5])
      for (const a of TURNS) {
        const c = Math.cos(a);
        const sn = Math.sin(a);
        const qx = (sx * c - sz * sn) * half;
        const qz = (sx * sn + sz * c) * half;
        if (qx * qx + qz * qz < 1e-6) continue;
        // 돌린 방향은 목표에서 멀어지지 않을 때만(고른 속도 그대로는 물러서는 것도 된다: 상호 회피가 엇갈림을 푸는 길이다)
        if (a !== 0 && qx * ux + qz * uz < 0) continue;
        if (tryMove(i, x0 + qx * dt, z0 + qz * dt)) {
          vX[i] = qx;
          vZ[i] = qz;
          return Math.max(0, qx * ux + qz * uz) * dt;
        }
      }
    // 걷는 길 밖으로 나가는 걸음뿐이면 선 가운데 쪽으로(띠는 늘 가운데선을 품는다)
    if (fallX !== undefined && fallZ !== undefined) {
      const fx = fallX - x0;
      const fz = fallZ - z0;
      const fd = Math.hypot(fx, fz);
      const s2 = Math.min(fd, v * 0.5 * dt);
      if (fd > 1e-3 && tryMove(i, x0 + (fx / fd) * s2, z0 + (fz / fd) * s2)) {
        vX[i] = (fx / fd) * (s2 / dt);
        vZ[i] = (fz / fd) * (s2 / dt);
        return s2 * Math.max(0, (fx * ux + fz * uz) / fd);
      }
    }
    vX[i] = 0;
    vZ[i] = 0;
    return 0;
  }

  /** 지금 선 위 (s, u) */
  const proj = (h: number, x: number, z: number): [number, number] => {
    const e = hes[h];
    const dx = x - NX[e.a * 2];
    const dz = z - NX[e.a * 2 + 1];
    return [dx * e.ux + dz * e.uz, -dx * e.uz + dz * e.ux];
  };

  let clockS = 0;
  /** 걷는 사람 하나를 한 걸음(dt) 옮긴다 */
  function walkStep(i: number, dt: number, tod: number) {
    let h = he[i];
    const e = hes[h];
    const [s, u] = proj(h, w.x[i], w.z[i]);
    // 집에 갈 사람: 이 선 위 문·출구·정류장에 닿았는가
    let goalDk = -1;
    let goalT = 0;
    if (goal[i] >= 0 || life[i] <= 0) {
      for (const dk of dockAtHe.get(h) ?? []) {
        const d = docks[dk];
        if ((goal[i] === 1) !== (d.kind === 'stop')) continue;
        const t = d.he === h ? d.t : e.L - d.t;
        if (Math.abs(t - s) < 0.6) return arrive(i, dk);
        // 이 선 위 앞쪽에 갈 곳이 있으면 거기로 곧장 간다(모퉁이에서 먼저 갈아타 지나치지 않게)
        if (t > s && (goalDk < 0 || t < goalT)) (goalDk = dk), (goalT = t);
      }
    }
    if (goalDk >= 0) {
      const [gx2, gz2] = onHe(h, goalT, Math.max(e.lo, Math.min(e.hi, u)));
      const x0 = w.x[i];
      const z0 = w.z[i];
      const mv = walkTo(i, gx2, gz2, spd[i], dt, ...onHe(h, Math.min(e.L, Math.max(0, s) + 0.5), 0));
      w.moving[i] = w.x[i] !== x0 || w.z[i] !== z0 ? 1 : 0;
      if (mv <= 0.1 * spd[i] * dt) stuckT[i] += dt * 0.5;
      if (stuckT[i] > 20) (stuckT[i] = 0), (mode[i] = INDOOR), (dockOf[i] = goalDk), (xLeg[i] = 0), ([tx[i], tz[i]] = docks[goalDk].door ?? dockPos(goalDk));
      return;
    }
    if (nk[i] < 0 && e.L - s < 8) {
      nk[i] = plan(i, h, clockS);
      if (nk[i] < 0) nk[i] = e.rev;
    }
    const look = 1.6;
    let gx: number;
    let gz: number;
    const nx = nk[i];
    const nxWalk = nx >= 0 && hes[nx].x < 0;
    // 선 시작 앞(노드 원 안)에 있어도 선 위에 있는 것으로 친다(앞뒤를 오가며 목표가 바뀌지 않게)
    const toEnd = e.L - Math.max(0, s);
    const bx = NX[e.b * 2];
    const bz = NX[e.b * 2 + 1];
    // 한 번 선 끝 쪽(다음 선)을 겨누기 시작하면 갈아탈 때까지 그대로 겨눈다(viaNode 1: 다음 선, 2: 노드)
    if (toEnd > look && !viaNode[i]) [gx, gz] = onHe(h, Math.max(0, s) + look, laneU(i, h));
    else if (nxWalk && narrow[nx] && !narrow[h] && toEnd < 1.2 && opposed(nx)) {
      // 좁은 길 건너편에서 사람이 오고 있으면 노드 앞에서 비켜 기다린다(좁은 길에서 마주쳐 막히지 않게). 오래 기다리면 다른 길로
      w.moving[i] = 0;
      waitT[i] += dt;
      if (waitT[i] > 12) (waitT[i] = 0), (avoidHe[i] = nx), (avoidT[i] = clockS + 30), (nk[i] = plan(i, h, clockS)), (viaNode[i] = 0);
      return;
    } else if (nxWalk && nx !== e.rev) {
      if (!viaNode[i]) viaNode[i] = 1;
      // 다음 선 위 자리로 곧장 가되, 가는 길이 걷는 길 밖으로 나가면 노드로 먼저 간다(노드는 두 띠에 다 든다)
      const n2 = hes[nx];
      [gx, gz] = onHe(nx, Math.min(n2.L, Math.max(0.3, look - toEnd)), laneU(i, nx));
      const mx = (w.x[i] + gx) / 2;
      const mz = (w.z[i] + gz) / 2;
      // 한 번 노드로 가기로 했으면 노드에 닿거나 다음 띠에 들 때까지 노드로 간다(번갈아 바꾸며 비비지 않게)
      if (viaNode[i] === 2 || !valid(i, mx, mz) || !valid(i, (w.x[i] + mx) / 2, (w.z[i] + mz) / 2)) {
        viaNode[i] = 2;
        [gx, gz] = [bx, bz];
      }
    } else [gx, gz] = [bx, bz]; // 횡단보도 앞, 또는 되돌아설 때(막다른 길): 선 끝 노드까지 간다
    // 막히면 선 가운데 쪽으로(띠는 늘 가운데선을 품는다)
    const [fx, fz] = toEnd > 0.5 ? onHe(h, s + 0.5, 0) : [bx, bz];
    const x0 = w.x[i];
    const z0 = w.z[i];
    tx[i] = gx;
    tz[i] = gz;
    const moved = walkTo(i, gx, gz, spd[i], dt, fx, fz);
    if (moved > 0.1 * spd[i] * dt) stuckT[i] = Math.max(0, stuckT[i] - 2 * dt);
    else {
      // 막힌 까닭이 같은 쪽으로 걸어가는 앞사람이면 줄을 선 것이다(돌아서지 않는다). 마주 오는 사람이나 서 버린 앞사람에게 막혔을 때 센다(W21b: 막힌 줄 뒤에서 기다리기만 하면 굳은 곳이 풀리지 않는다)
      const j = aheadJ;
      const hx = Math.cos(head[i]);
      const hz = Math.sin(head[i]);
      // 마주 선 두 사람 가운데 번호가 작은 쪽만 돌아선다(둘 다 돌아서며 오가지 않게)
      const facing = j >= 0 && mode[j] === WALK && Math.cos(head[j]) * hx + Math.sin(head[j]) * hz < -0.3 && w.id[i] < w.id[j];
      if (j < 0 || facing) stuckT[i] += dt;
      else if (!w.moving[j]) stuckT[i] += dt;
      else stuckT[i] = 0;
    }
    w.moving[i] = w.x[i] !== x0 || w.z[i] !== z0 ? 1 : 0;
    // 다음 선으로 갈아타기(자리는 그대로): 다음 선 띠나 노드 원 안에 들었거나(노드 원은 두 선 모두의 걷는 길이다), 횡단보도면 노드 0.4m 안
    if (nx >= 0) {
      const [s2] = proj(h, w.x[i], w.z[i]);
      const dB = Math.hypot(w.x[i] - bx, w.z[i] - bz);
      // 되돌아가는 선(nx 가 지금 선의 반대)은 선 끝(노드 0.4m 안)에 닿아야 갈아탄다(그 전에 갈아타면 매 걸음 앞뒤로 뒤집힌다)
      const turn = nx === e.rev;
      // 다음 선 위 겨눈 자리에 닿았으면(겨눈 자리는 다음 선 띠 안이다) 바로 갈아탄다: 안 그러면 지금 선 위 거리에 따라 겨눈 자리가 앞뒤로 바뀌며 제자리에서 떤다
      const atAim = viaNode[i] === 1 && Math.hypot(gx - w.x[i], gz - w.z[i]) < 0.05;
      if (turn ? dB < 0.4 || e.L - s2 < 0.3 : nxWalk ? (e.L - s2 < look + 0.5 && (atAim || inBand(nx, w.x[i], w.z[i]) || inNode(e.b, w.x[i], w.z[i]))) || dB < 0.05 : dB < 0.4) {
        remember(i, e.b);
        if (!nxWalk) {
          // 횡단보도: 기다리는 자리로
          mode[i] = WAITX;
          prv[i] = h;
          he[i] = nx;
          nk[i] = -1;
          viaNode[i] = 0;
          const c = crosses[hes[nx].x];
          [tx[i], tz[i]] = waitSpot(i, e.b, c);
          waitT[i] = 0;
          return;
        }
        prv[i] = h;
        he[i] = nx;
        nk[i] = -1;
        viaNode[i] = 0;
        viaNode[i] = 0;
        waitT[i] = 0;
        h = nx;
      }
    }
    // 오래 막혀 있으면 돌아선다
    // 집(문·출구)이 10m 안인 사람은 돌아서지 않고 기다린다(문 앞에서 서로 비켜 주다 오가지 않게)
    if (stuckT[i] > REV_T && !(goal[i] >= 0 && D[goal[i]][hes[he[i]].b] < 10)) {
      // 마주 오는 사람과 막혀 오래 서 있으면 돌아서고, 그 선은 30초 동안 다시 고르지 않는다
      stuckT[i] = 0;
      avoidHe[i] = he[i];
      avoidT[i] = clockS + 30;
      prv[i] = he[i];
      he[i] = hes[he[i]].rev;
      viaNode[i] = 0;
      nk[i] = -1;
      viaNode[i] = 0;
    }
    // 머무는 명소: 노드를 지날 때 가끔 멈춰 둘러본다
    if (goal[i] < 0 && nodeMask[e.b] & STAY && e.L - s < 0.3 && rand() < 0.02 * nodePull[e.b]) {
      holdT[i] = 5 + rand() * 25;
      snap[i] = 0;
      const a = rand() * Math.PI * 2;
      faceX[i] = w.x[i] + Math.cos(a);
      faceZ[i] = w.z[i] + Math.sin(a);
    }
    void tod;
  }
  function arrive(i: number, k: number) {
    const d = docks[k];
    dockOf[i] = k;
    if (d.kind === 'stop') {
      const q = queueSpot(i, k);
      mode[i] = QUEUE;
      waitT[i] = 0;
      [tx[i], tz[i]] = q ?? [w.x[i], w.z[i]];
      return;
    }
    mode[i] = INDOOR;
    xLeg[i] = 0;
    // 문턱이나 출구 자리까지 걸어가서 들어간다
    [tx[i], tz[i]] = d.door ?? dockPos(k);
  }
  /** 건너는 사람 */
  function crossStep(i: number, dt: number, tod: number) {
    const h = he[i];
    const c = crosses[hes[h].x];
    if (mode[i] === WAITX) {
      const dd = Math.hypot(tx[i] - w.x[i], tz[i] - w.z[i]);
      if (dd > 0.05) {
        const m = walkTo(i, tx[i], tz[i], spd[i], dt);
        w.moving[i] = m > 0 ? 1 : 0;
        if (m === 0) waitT[i] += dt;
        if (waitT[i] > 3) [tx[i], tz[i]] = [w.x[i], w.z[i]]; // 자리에 못 가면 지금 자리에서 기다린다
        return;
      }
      w.moving[i] = 0;
      waitT[i] += dt;
      head[i] = Math.atan2(c.pts[3] - c.pts[1], c.pts[2] - c.pts[0]);
      const v = startSpeed(i, c, tod);
      if (v > 0 && !carAhead(c, 0)) {
        mode[i] = CROSS;
        xSpd[i] = v;
        xLeg[i] = 1;
        // 건너는 방향 오른쪽으로 통로 폭 안에서 사람마다 다르게 비켜 건넌다
        xLat[i] = Math.abs(lane[i]) * c.hw * 0.9;
        lastX[i] = c.xw;
        lastXT[i] = clockS;
      } else if (waitT[i] > 180) {
        // 아주 오래 기다리면 다른 길로 간다
        mode[i] = WALK;
        he[i] = prv[i] >= 0 ? hes[prv[i]].rev : hes[h].rev;
        viaNode[i] = 0;
        nk[i] = -1;
        viaNode[i] = 0;
      }
      return;
    }
    // CROSS
    const k = xLeg[i];
    const ax = c.pts[k * 2 - 2];
    const az = c.pts[k * 2 - 1];
    const bx = c.pts[k * 2];
    const bz = c.pts[k * 2 + 1];
    const L = Math.hypot(bx - ax, bz - az) || 1;
    const ux = (bx - ax) / L;
    const uz = (bz - az) / L;
    const last = k * 2 + 2 >= c.pts.length;
    // 옆자리는 이 구간 방향 오른쪽. 끝 구간은 건너편 기다리는 자리 쪽으로 좁힌다
    const lat = last ? xLat[i] * 0.3 : xLat[i];
    const gx = bx - uz * lat;
    const gz = bz + ux * lat;
    markBusy(c, w.x[i], w.z[i]);
    // 건너는 동안에는 차가 앞을 막을 때만 선다
    const s = (w.x[i] - ax) * ux + (w.z[i] - az) * uz;
    if (!last && carAhead(c, c.cum[k - 1] + s)) {
      w.moving[i] = 0;
      return;
    }
    const left = o.walkLeft ? o.walkLeft(c.xw, tod) : -1;
    const rest = c.cum[c.cum.length - 1] - c.cum[k - 1] - s;
    const v = left > 1 ? Math.min(HURRY, Math.max(xSpd[i], rest / (left - 0.5))) : left === 0 ? HURRY : xSpd[i];
    const m = walkTo(i, gx, gz, v, dt, bx, bz);
    w.moving[i] = m > 0 ? 1 : 0;
    if (Math.hypot(gx - w.x[i], gz - w.z[i]) < 0.3 || (L - ((w.x[i] - ax) * ux + (w.z[i] - az) * uz) < 0.3 && !last)) {
      if (last) {
        // 건너편 노드에서 다시 걷는다
        mode[i] = WALK;
        prv[i] = h;
        const n = hes[h].b;
        remember(i, n);
        const opts = out[n].filter((q) => hes[q].x < 0);
        const pickH = opts.length ? (goal[i] >= 0 ? plan(i, h, clockS) : opts[Math.floor(rand() * opts.length)]) : hes[h].rev;
        he[i] = pickH >= 0 && hes[pickH].x < 0 ? pickH : opts[0] ?? hes[h].rev;
        viaNode[i] = 0;
        nk[i] = -1;
        viaNode[i] = 0;
        if (hes[he[i]].x >= 0) {
          // 건너편에 이어진 선이 없다: 되돌아 건넌다
          mode[i] = WAITX;
          [tx[i], tz[i]] = waitSpot(i, n, crosses[hes[he[i]].x]);
          waitT[i] = 0;
        }
      } else xLeg[i]++;
    }
  }

  // ── 같은 자리 오가기 감지 ──
  function watch(i: number, dt: number) {
    sampT[i] += dt;
    if (sampT[i] < SAMPLE) return;
    sampT[i] = 0;
    const b = i * RING * 3;
    ring.copyWithin(b + 3, b, b + (RING - 1) * 3);
    ring[b] = w.x[i];
    ring[b + 1] = w.z[i];
    ring[b + 2] = walked[i];
    if (ringN[i] < RING) ringN[i]++;
    if (ringN[i] < 6 || mode[i] !== WALK) return;
    // 25초 창: 다섯 표본 사이가 모두 10m 원 안인데 12m 넘게 걸었으면 오가며 갇힌 것
    let far = 0;
    for (let q = 1; q < 6; q++) far = Math.max(far, Math.hypot(ring[b + q * 3] - ring[b], ring[b + q * 3 + 1] - ring[b + 1]));
    if (far < 9 && walked[i] - ring[b + 5 * 3 + 2] > 12) {
      // 가장 가까운 출구·문으로 돌아간다(거리 장은 내려가기만 하므로 다시 오가지 않는다)
      goal[i] = 0;
      life[i] = 0;
      nk[i] = -1;
      viaNode[i] = 0;
      ringN[i] = 0;
    }
  }

  // ── 보는 곳 먼저 채우기(W17 의 방식, 과장 배수 EXAG): 칸마다 실제 인원이 걷는 선에 퍼진다고 보고 보는 곳 안 몫을 정한다 ──
  const eHe: number[] = [];
  for (let k = 0; k < hes.length; k += 2) if (hes[k].x < 0 && hes[k].kind !== LINK) eHe.push(k);
  const NE = eHe.length;
  const eX = new Float32Array(NE);
  const eZ = new Float32Array(NE);
  const eLenW = new Float32Array(NE);
  const eW = new Float32Array(NE);
  const eCell = new Uint8Array(NE);
  const ePlace = new Uint8Array(NE);
  for (let q = 0; q < NE; q++) {
    const e = hes[eHe[q]];
    eX[q] = (NX[e.a * 2] + NX[e.b * 2]) / 2;
    eZ[q] = (NX[e.a * 2 + 1] + NX[e.b * 2 + 1]) / 2;
    eLenW[q] = e.L * e.w;
    eCell[q] = zoneOf(eX[q], eZ[q]);
    ePlace[q] = eCell[q] === OUT_Z && placeMask(eX[q], eZ[q], 20) ? 1 : 0;
  }
  const totW = new Float64Array(PLACE_Z + 1);
  const inW = new Float64Array(PLACE_Z + 1);
  function weigh() {
    totW.fill(0);
    for (let q = 0; q < NE; q++) {
      const e = hes[eHe[q]];
      eW[q] = eLenW[q] * (1 + PULL * Math.max(nodePull[e.a], nodePull[e.b]));
      totW[eCell[q]] += eW[q];
      if (ePlace[q]) totW[PLACE_Z] += eW[q];
    }
  }
  // 칸마다 내보낼 문·출구(정류장은 버스에서 내린다)
  const docksIn: number[][] = Array.from({ length: PLACE_Z + 1 }, () => []);
  const dockW: number[][] = Array.from({ length: PLACE_Z + 1 }, () => []);
  for (let z = 0; z <= PLACE_Z; z++) {
    const exits = docks.map((d, k) => (d.zone === z && d.kind === 'exit' ? k : -1)).filter((k) => k >= 0);
    const doors = docks.map((d, k) => (d.zone === z && d.kind === 'door' ? k : -1)).filter((k) => k >= 0);
    const doorSum = doors.reduce((s, k) => s + docks[k].weight, 0);
    for (const k of doors) docksIn[z].push(k), dockW[z].push(docks[k].weight);
    for (const k of exits) docksIn[z].push(k), dockW[z].push(doors.length ? (doorSum * 0.3) / 0.7 / exits.length : 1);
  }
  const dockWNow = dockW.map((ws) => ws.slice());
  let lvAt = -Infinity;
  function refreshPlaces(now: Now) {
    const at = now.dow * 86400 + now.tod;
    if (Math.abs(at - lvAt) < 30) return;
    lvAt = at;
    PLACES.forEach((p, k) => (lv[k] = p.w * placeNow(k, now)));
    for (let n = 0; n < NN; n++) if (nodeMask[n]) nodePull[n] = pullOf(nodeMask[n]);
    for (let z = 0; z <= PLACE_Z; z++)
      docksIn[z].forEach((k, q) => {
        const pl = pullOf(docks[k].mask);
        dockWNow[z][q] = dockW[z][q] * (z === PLACE_Z ? Math.max(0.01, pl) : 1 + GATHER * pl);
      });
    weigh();
    dirty = true;
  }
  let asked: { x: number; z: number; r: number } | null = null;
  let focus: { x: number; z: number; r: number } | null = null;
  let dirty = true;
  const inFocus = (x: number, z: number) => !!focus && (x - focus.x) ** 2 + (z - focus.z) ** 2 < focus.r ** 2;
  const dockInF = new Uint8Array(docks.length);
  const wantIn = new Float64Array(PLACE_Z + 1);
  const wantOut = new Float64Array(PLACE_Z + 1);
  const haveIn = new Float64Array(PLACE_Z + 1);
  const haveOut = new Float64Array(PLACE_Z + 1);
  let kIn = 1;
  let kOut = 1;
  /** 사람을 먼저 채울 원: 정한 반지름의 1·1.4배 가운데 과장해 채워도 상한의 85% 를 넘지 않는 가장 넓은 것(W21b: 2·2.8배까지 넓히면 화면 밖에 사람이 퍼져 화면 안이 비었다) */
  function refocus(real: number[]) {
    dirty = false;
    focus = null;
    if (asked) {
      const { x, z, r } = asked;
      const R = [1, Math.SQRT2].map((k) => Math.max(r, Math.min(2200, r * k)));
      const part = R.map(() => new Float64Array(PLACE_Z + 1));
      for (let q = 0; q < NE; q++) {
        const d = Math.hypot(eX[q] - x, eZ[q] - z);
        for (let j = 0; j < R.length; j++)
          if (d < R[j]) {
            part[j][eCell[q]] += eW[q];
            if (ePlace[q]) part[j][PLACE_Z] += eW[q];
          }
      }
      let j = R.length - 1;
      while (j > 0 && EXAG * real.reduce((a, v, c) => a + (totW[c] > 0 ? (v * part[j][c]) / totW[c] : 0), 0) > 0.85 * max) j--;
      focus = { x, z, r: R[j] };
    }
    inW.fill(0);
    if (focus) for (let q = 0; q < NE; q++) if (inFocus(eX[q], eZ[q])) for (const c of ePlace[q] ? [eCell[q], PLACE_Z] : [eCell[q]]) inW[c] += eW[q];
    docks.forEach((d, k) => (dockInF[k] = inFocus(d.x, d.z) ? 1 : 0));
  }
  /** 칸마다 실제 인원을 보는 곳 안(과장 EXAG 배)·밖 화면 인원으로 나눈다 */
  function allot(real: number[]) {
    let F = 0;
    let O = 0;
    for (let c = 0; c <= PLACE_Z; c++) {
      wantIn[c] = focus && totW[c] > 0 ? (real[c] * inW[c]) / totW[c] : 0;
      F += wantIn[c];
      O += real[c] - wantIn[c];
    }
    // 밖에는 같은 배율로 줄였을 때의 몫을 남기되 상한의 15% 를 넘지 않는다. 안은 실제의 EXAG 배까지(상한 안에서)
    const room = 0.92 * max;
    const nIn = Math.min(F * EXAG, room - Math.min(0.15 * room, (O * room) / Math.max(room, F + O)));
    kIn = nIn > 0 ? F / nIn : 1;
    const nOut = Math.min(O / Math.max(1, kIn), room - nIn);
    kOut = nOut > 0 ? O / nOut : kIn;
    if (!(nIn > 0)) kIn = kOut;
    for (let c = 0; c <= PLACE_Z; c++) {
      wantOut[c] = (real[c] - wantIn[c]) / kOut;
      wantIn[c] /= kIn;
    }
  }
  const budget = new Float32Array(PLACE_Z + 1).fill(1);
  const pending: number[] = []; // 열차가 막 도착한 출구(나올 차례를 기다린다)
  let rain = 0;
  /** 미리 돌릴 때는 문·출구에서 나오는 빠르기를 키운다 */
  let rush = 1;

  function rebuildGrid() {
    occ.fill(0);
    for (let i = 0; i < w.n; i++) if (mode[i] === WALK) occ[he[i]]++;
    gridHead.fill(-1);
    for (let i = 0; i < w.n; i++) {
      const key = cellKey(Math.floor(w.x[i] / GC), Math.floor(w.z[i] / GC));
      gridNext[i] = gridHead[key];
      gridHead[key] = i;
    }
  }
  function populate(dt: number, now: Now) {
    rebuildGrid();
    refreshPlaces(now);
    const real = outside(provider, now, rain);
    if (dirty) refocus(real);
    allot(real);
    // 나이대·성별
    const areas = provider.areas(now);
    ZONE_IDS.forEach((id, z) => {
      const a = areas.find((q) => q.id === id);
      if (!a) return;
      const g4 = [a.ages[0], a.ages[1] + a.ages[2], a.ages[3] + a.ages[4] + a.ages[5], a.ages[6] + a.ages[7]];
      const sum = g4.reduce((x, y) => x + y, 0) || 1;
      let c = 0;
      looks[z] = { ages: g4.map((v) => (c += v / sum)), female: a.female / 100 };
    });
    haveIn.fill(0);
    haveOut.fill(0);
    for (let i = 0; i < w.n; i++) if (mode[i] !== LEAVE && goal[i] < 0) (inFocus(w.x[i], w.z[i]) ? haveIn : haveOut)[home[i]]++;
    // 열차에서 내린 사람
    for (let k = 0; k < 6 && pending.length; k++) {
      const dk = pending[pending.length - 1];
      if (spawnAt(dk) >= 0) pending.pop();
      else break;
    }
    for (let z = 0; z <= PLACE_Z; z++) {
      if (!docksIn[z].length) continue;
      const want = wantIn[z] + wantOut[z];
      const lackIn = wantIn[z] - haveIn[z];
      const lackOut = wantOut[z] - haveOut[z];
      // 모자란 만큼 빨리(1초에 모자란 인원의 1/8, 적어도 2명) 문·출구에서 낸다
      budget[z] = Math.min(40 * rush, budget[z] + dt * rush * Math.max(2, Math.max(0, lackIn) / 8 + Math.max(0, lackOut) / 30, want / 60));
      let tries = 0;
      while (budget[z] >= 1 && w.n < max && tries++ < 40) {
        const inside = lackIn > 0 && haveIn[z] < wantIn[z];
        const outside2 = haveOut[z] < wantOut[z];
        if (!inside && !outside2) break;
        // 붐비는 선(DENSE_MAX 명/m² 넘게)에 붙은 문·출구에서는 내지 않는다
        const ws = docksIn[z].map((k, q) => (dockInF[k] === (inside ? 1 : 0) || !focus ? dockWNow[z][q] * Math.max(0, 1 - dens(docks[k].he) / DENSE_MAX) : 0));
        if (!ws.some((v) => v > 0)) break;
        const i = spawnAt(docksIn[z][pick(ws, rand())]);
        if (i < 0) continue;
        (inside ? haveIn : haveOut)[z]++;
        budget[z]--;
      }
      // 넘치면 몇 명을 일찍 집으로 보낸다(가장 가까운 출구·문으로 걸어 들어간다)
      const overIn = haveIn[z] - wantIn[z] * 1.1 - 3;
      const overOut = haveOut[z] - wantOut[z] * 1.1 - 3;
      if (overIn > 0 || overOut > 0)
        for (let k = 0; k < 4; k++) {
          const i = Math.floor(rand() * w.n);
          if (i >= w.n || home[i] !== z || mode[i] !== WALK || goal[i] >= 0) continue;
          if (inFocus(w.x[i], w.z[i]) ? overIn > 0 : overOut > 0) life[i] = 0;
        }
    }
  }

  // ── 한 단계 ──
  function step(dt: number, now: Now, ambient = true) {
    if (o.busy) {
      for (const k of marked) o.busy[k] = 0;
      marked.length = 0;
    }
    carGrid();
    const n = Math.max(1, Math.ceil(dt / SUB - 1e-6));
    const sd = dt / n;
    // 성기게 움직일 사람은 K 단계에 한 번(K × sd ≤ SUB), 고유 번호로 차례를 나눠 같은 프레임에 몰리지 않게 한다
    const K = Math.max(1, Math.min(8, Math.floor(SUB / sd + 1e-6)));
    for (let q = 0; q < n; q++) {
      clockS += sd;
      stepNo++;
      rebuildGrid();
      for (let i = w.n - 1; i >= 0; i--) {
        if (dead[i]) continue;
        let td = sd;
        if (detail) {
          // 자세히 볼 사람은 매 단계, 나머지는 제 차례(K 단계에 한 번)나 밀린 시간이 SUB 에 닿을 때 밀린 만큼 한 번에
          lag[i] += sd;
          if (lag[i] < SUB - 1e-6 && (stepNo + w.id[i]) % K !== 0 && !detail(w.x[i], w.z[i])) continue;
          td = lag[i];
          lag[i] = 0;
        }
        const x0 = w.x[i];
        const z0 = w.z[i];
        tick(i, td, now);
        if (!dead[i] && (w.x[i] !== x0 || w.z[i] !== z0)) {
          const a = Math.atan2(w.z[i] - z0, w.x[i] - x0);
          if (mode[i] !== QUEUE && mode[i] !== WAITX) head[i] = a;
        }
        if (!dead[i]) {
          // 몸 방향은 1초에 TURN_RATE 라디안까지만 돈다
          let d = head[i] - w.yaw[i];
          d = Math.atan2(Math.sin(d), Math.cos(d));
          w.yaw[i] += Math.max(-TURN_RATE * td, Math.min(TURN_RATE * td, d));
        }
      }
      compact();
    }
    if (ambient && docks.length) populate(dt, now);
  }

  function tick(i: number, dt: number, now: Now) {
    const m = mode[i];
    if (m === LEAVE) {
      w.fade[i] -= dt * 1.6;
      w.moving[i] = 0;
      if (w.fade[i] <= 0) remove(i);
      return;
    }
    w.fade[i] = Math.min(1, w.fade[i] + dt * 2.2);
    escapeCar(i, dt);
    if (m === OUTDOOR || m === INDOOR || m === BOARD || (m === QUEUE && Math.hypot(tx[i] - w.x[i], tz[i] - w.z[i]) > 0.05)) {
      // 문으로 들어갈 때는 걷는 선 위 문 자리(dockPos)까지 먼저 걷고 거기서 문턱으로 간다(문턱으로 곧게 가면 띠 밖이라 띠를 따라 미끄러지며 오간다)
      const viaDock = m === INDOOR && docks[dockOf[i]].door && !xLeg[i];
      const [px, pz] = m === OUTDOOR || viaDock ? dockPos(dockOf[i]) : [tx[i], tz[i]];
      const mv = walkTo(i, px, pz, Math.max(1.1, spd[i]), dt);
      w.moving[i] = mv > 0 ? 1 : 0;
      const left = Math.hypot(px - w.x[i], pz - w.z[i]);
      if (m === OUTDOOR && left < 0.15) {
        mode[i] = WALK;
        const h = he[i];
        const d = docks[dockOf[i]];
        // 선 위 문 자리에서 나온다(방향 있는 선이 반대면 그대로 둔다)
        void d;
        void h;
      } else if (viaDock && left < 0.3) xLeg[i] = 1;
      else if (m === INDOOR && left < 0.15) mode[i] = LEAVE;
      else if (m === BOARD && left < 0.4) mode[i] = LEAVE;
      else if (m === QUEUE && left < 0.05) w.moving[i] = 0;
      else if (mv === 0) {
        waitT[i] += dt;
        // 문턱·줄 자리가 막혀 오래 못 가면 그 자리에서 마친다(문턱은 들어간 셈, 줄은 지금 자리에서 기다린다)
        // 문턱·출구 자리 1m 안에서 막히면 거기서 들어간다
        if (waitT[i] > 3 && m === INDOOR && !viaDock && left < 0.9) mode[i] = LEAVE;
        if (waitT[i] > 6 && m === QUEUE) [tx[i], tz[i]] = [w.x[i], w.z[i]];
        if (waitT[i] > 6 && m === BOARD) mode[i] = QUEUE;
        if (waitT[i] > 10 && m === OUTDOOR) mode[i] = WALK;
      }
      return;
    }
    if (m === QUEUE) {
      w.moving[i] = 0;
      waitT[i] += dt;
      const d = docks[dockOf[i]];
      head[i] = Math.atan2(d.z - w.z[i], d.x - w.x[i]);
      if (waitT[i] > MAX_WAIT_BUS) {
        // 너무 오래 기다리면 걸어서 간다
        mode[i] = WALK;
        goal[i] = 0;
        nk[i] = -1;
        viaNode[i] = 0;
      }
      return;
    }
    if (holdT[i] > 0) {
      holdT[i] -= dt;
      w.photo[i] = snap[i] ? Math.min(1, w.photo[i] + dt * 2) : Math.max(0, w.photo[i] - dt * 2);
      head[i] = Math.atan2(faceZ[i] - w.z[i], faceX[i] - w.x[i]);
      w.moving[i] = 0;
      return;
    }
    w.photo[i] = Math.max(0, w.photo[i] - dt * 2);
    if (m === WAITX || m === CROSS) return crossStep(i, dt, now.tod);
    // 돌아다님 → 수명이 다하면 집으로(열에 하나는 버스를 타러)
    if (goal[i] < 0) {
      const was = life[i];
      life[i] -= dt / (1 + nodePull[hes[he[i]].b]);
      // 수명이 다하면 열에 하나는 정류장으로, 나머지는 가던 길 앞에 나오는 문·출구로 들어간다(가장 가까운 문으로 되돌아가며 오가지 않게).
      // SEEK 초 안에 못 만나면 가장 가까운 문·출구로 간다
      if ((was > 0 && life[i] <= 0 && rand() < 0.1 && Number.isFinite(D[1][hes[he[i]].b])) || life[i] < -SEEK) {
        goal[i] = was > 0 && life[i] <= 0 ? 1 : 0;
        nk[i] = -1;
        viaNode[i] = 0;
      }
    }
    walkStep(i, dt, now.tod);
    if (!dead[i]) watch(i, dt);
  }
  /** 차 몸통이 다가와 몸에 닿으면(둘레 여유 안) 덜 닿는 쪽으로 비켜난다(1초에 2.5m 까지) */
  function escapeCar(i: number, dt: number) {
    if (!o.cars || !carCount) return;
    const d0 = carDepth(w.x[i], w.z[i], CAR_PAD + 0.5);
    if (d0 <= 0) return;
    const v = 3 * dt;
    let bx = 0;
    let bz = 0;
    let bd = d0;
    for (let k = 0; k < 12; k++) {
      const a = (k * Math.PI) / 6;
      const x = w.x[i] + Math.cos(a) * v;
      const z = w.z[i] + Math.sin(a) * v;
      if (!valid(i, x, z) || crowded(i, x, z)) continue;
      const d = carDepth(x, z, CAR_PAD + 0.5);
      if (d < bd - 1e-4) (bd = d), (bx = x), (bz = z);
    }
    if (bd < d0) {
      walked[i] += 0;
      w.x[i] = bx;
      w.z[i] = bz;
    }
  }

  // ── 바깥에서 부르는 것 ──
  const docksOf = (kind: Dock['kind'], key: string) => docks.map((d, k) => (d.kind === kind && d.key === key ? k : -1)).filter((k) => k >= 0);
  /** 열차가 역에 섰다: 출구에서 count 명이 나온다(출구 자리가 빌 때마다) */
  function burst(station: string, count: number) {
    const ds = docksOf('exit', station);
    if (!ds.length) return;
    for (let k = 0; k < count && pending.length < 200; k++) pending.push(ds[Math.floor(rand() * ds.length)]);
  }
  /** 버스 문이 (doorX, doorZ)인 버스가 정류장에 섰다: count 명이 문 앞 보도 자리에 내린다 */
  function alight(key: string, count: number, doorX: number, doorZ: number) {
    const ds = docksOf('stop', key);
    if (!ds.length) return;
    const k = ds[0];
    const d = docks[k];
    const h = hes[d.he];
    const [s0] = proj(d.he, doorX, doorZ);
    for (let q = 0; q < count; q++) {
      // 문 앞 걷는 띠 자리부터 0.9m 씩 옆으로
      let done = false;
      for (let r = 0; r < 6 && !done; r++) {
        const s = Math.max(0, Math.min(h.L, d.t - 5.5, Math.max(d.t - 5.5, Math.min(d.t + 5.5, Math.max(d.t - 4, Math.min(d.t + 4, s0)) + (r % 2 ? -1 : 1) * Math.ceil(r / 2) * 0.9))));
        const lat = d.lat || (h.hi > -h.lo ? h.hi * 0.7 : h.lo * 0.7);
        const i = spawnAt(k, onHe(d.he, s, Math.max(h.lo, Math.min(h.hi, lat))));
        if (i >= 0) {
          done = true;
          life[i] = 60 + rand() * 300;
        }
      }
    }
  }
  /** 버스가 섰다: 그 정류장 줄에 선 사람이 문 앞 보도 자리로 걸어가 탄다 */
  function board(key: string, doorX: number, doorZ: number) {
    const ds = new Set(docksOf('stop', key));
    for (let i = 0; i < w.n; i++) {
      if (mode[i] !== QUEUE || !ds.has(dockOf[i])) continue;
      const d = docks[dockOf[i]];
      const h = hes[d.he];
      const [s] = proj(d.he, doorX, doorZ);
      [tx[i], tz[i]] = onHe(d.he, Math.max(0, Math.min(h.L, s)), d.lat || (h.hi > -h.lo ? h.hi * 0.9 : h.lo * 0.9));
      mode[i] = BOARD;
      waitT[i] = 0;
    }
  }
  /** 정류장에서 기다리는 사람 수 */
  const waitingAt = (key: string) => {
    const ds = new Set(docksOf('stop', key));
    let c = 0;
    for (let i = 0; i < w.n; i++) if (mode[i] === QUEUE && ds.has(dockOf[i])) c++;
    return c;
  };
  /** 고양이를 본 사람을 secs 초 세워 (fx, fz)를 보며 휴대폰을 들게 한다 */
  function hold(id: number, secs: number, fx: number, fz: number) {
    for (let i = 0; i < w.n; i++)
      if (w.id[i] === id) {
        if (mode[i] !== WALK) return;
        holdT[i] = secs;
        snap[i] = 1;
        faceX[i] = fx;
        faceZ[i] = fz;
        return;
      }
  }
  /** 정류장 쉼터 자리(정류장이 붙은 걷는 띠 가장자리)와 선 방향 */
  function dockPoint(k: number): { x: number; z: number; yaw: number } {
    const d = docks[k];
    const h = hes[d.he];
    const side = Math.sign((d.x - NX[h.a * 2]) * -h.uz + (d.z - NX[h.a * 2 + 1]) * h.ux) || 1;
    const [x, z] = onHe(d.he, d.t, side > 0 ? h.hi : h.lo);
    return { x, z, yaw: Math.atan2(h.uz, h.ux) };
  }
  const setRain = (r: number) => {
    rain = r;
  };
  const zoneCounts = () => {
    const have = new Array<number>(PLACE_Z + 1).fill(0);
    for (let i = 0; i < w.n; i++) if (mode[i] !== LEAVE) have[home[i]]++;
    return have;
  };
  /** 보는 곳: 가운데 (x, z), 반지름 r(m). visible 은 옛 방식과 맞춘 자리(쓰지 않는다: 사람은 화면 밖에서도 문·출구로만 드나든다) */
  const setFocus = (x: number, z: number, r: number, visible?: (x: number, z: number) => boolean) => {
    void visible;
    asked = { x, z, r };
    dirty = true;
  };
  /** 성기게 움직이기(W19, 앱만 쓴다): fine(x, z) 가 거짓인 사람(화면 밖·작게 보이는 사람)은 SUB 초에 한 번만 움직인다. null 이면 모두 매 단계 */
  let detail: ((x: number, z: number) => boolean) | null = null;
  let stepNo = 0;
  const setDetail = (fine: ((x: number, z: number) => boolean) | null) => {
    detail = fine;
  };
  /** 화면 1명이 실제 몇 명인가: [보는 곳 안, 밖]. 1 보다 작으면 실제보다 많이 그린 것 */
  const scale = (): [number, number] => [kIn, kOut];
  /** 실제 추정 인원: test 가 참인 자리의 걷는 선에 퍼진 몫 */
  const expected = (test: (x: number, z: number) => boolean, now: Now) => {
    refreshPlaces(now);
    const real = outside(provider, now, rain);
    const part = new Float64Array(PLACE_Z + 1);
    for (let q = 0; q < NE; q++)
      if (test(eX[q], eZ[q])) {
        part[eCell[q]] += eW[q];
        if (ePlace[q]) part[PLACE_Z] += eW[q];
      }
    return real.reduce((a, v, c) => a + (totW[c] > 0 ? (v * part[c]) / totW[c] : 0), 0);
  };
  /** 미리 돌리기: secs 초를 0.5초씩 돌린다(그동안 문·출구에서 빨리 낸다). 시각도 함께 흘린다 */
  function warm(secs: number, at: Now) {
    rush = 6;
    const N = Math.round(secs / 0.5);
    for (let k = 0; k < N; k++) step(0.5, { ...at, tod: (at.tod - secs + k * 0.5 + 86400) % 86400 });
    rush = 1;
  }
  /** 측정·시험용: 사람 i 의 상태 */
  const stateOf = (i: number) => ({ mode: mode[i], he: he[i], goal: goal[i], hold: holdT[i] > 0, cross: hes[he[i]]?.x >= 0 ? crosses[hes[he[i]].x] : null });
  /** 측정용: 사람 i 가 따라가는 선과 다음 선 */
  const debugOf = (i: number) => {
    const e = hes[he[i]];
    const [s, u] = proj(he[i], w.x[i], w.z[i]);
    return { mode: mode[i], he: he[i], a: e.a, b: e.b, L: e.L, s, u, lo: e.lo, hi: e.hi, nk: nk[i], nkL: nk[i] >= 0 ? hes[nk[i]].L : -1, stuck: stuckT[i], goal: goal[i], D: goal[i] >= 0 ? D[goal[i]][e.b] : -1, radB: RAD[e.b], tx: tx[i], tz: tz[i], via: viaNode[i], why, ahead: aheadJ, dens: dens(he[i]), waitT: waitT[i], narrow: narrow[he[i]], nkNarrow: nk[i] >= 0 ? narrow[nk[i]] : -1 };
  };
  /** 측정용: 칸마다 보는 곳 안·밖 목표와 지금 인원, 보는 곳 원 */
  const popStats = () => ({ wantIn: Array.from(wantIn), haveIn: Array.from(haveIn), wantOut: Array.from(wantOut), haveOut: Array.from(haveOut), focus, kIn, kOut, n: w.n, pending: pending.length });
  /** 시험용: 사람이 지금 있어도 되는 자리인가 */
  const validAt = (i: number) => valid(i, w.x[i], w.z[i]);
  return { w, popStats, debugOf, step, warm, burst, alight, board, waitingAt, hold, docks, dockPoint, dockPos, setRain, zoneCounts, setFocus, setDetail, scale, expected, stateOf, validAt, crosses, rects, MODES: { WALK, WAITX, CROSS, QUEUE, BOARD, LEAVE, OUTDOOR, INDOOR } };
}
export type People = ReturnType<typeof makePeople>;

/** 점과 꺾은선 사이 거리 */
function polyDist(p: number[], x: number, z: number): number {
  let best = Infinity;
  for (let k = 2; k < p.length; k += 2) best = Math.min(best, segDist(x, z, p[k - 2], p[k - 1], p[k], p[k + 1]));
  return best;
}
function segDist(x: number, z: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz;
  const t = l2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
  return Math.hypot(ax + dx * t - x, az + dz * t - z);
}
/** 건너기 길 위 거리 s 자리 */
function polyAt(c: Cross, s: number): [number, number] {
  let k = 1;
  while (k < c.cum.length - 1 && c.cum[k] < s) k++;
  const L = c.cum[k] - c.cum[k - 1] || 1;
  const t = Math.max(0, Math.min(1, (s - c.cum[k - 1]) / L));
  return [c.pts[k * 2 - 2] + (c.pts[k * 2] - c.pts[k * 2 - 2]) * t, c.pts[k * 2 - 1] + (c.pts[k * 2 + 1] - c.pts[k * 2 - 1]) * t];
}
