// 사람(보행자) 시뮬레이션(재작업 W21, 설계 문서 45절). 옛 walkers.ts 를 고쳐 쓰지 않고 처음부터 다시 썼다.
// 지오 지시를 규칙으로 둔다:
//  - 사람은 역 출구·버스 승하차 자리·건물 문(과 망원한강공원 피크닉 자리·나들목)에서만 나타나고 사라진다. 화면을 채울 때도 그 자리에서만 낸다.
//  - 사람은 몸(반지름 BODY_R)이 있어 다른 사람·차 몸통과 겹치지 않는다: 움직이기 전에 새 자리가 비었는지 보고, 비었을 때만 옮긴다.
//  - 사람은 걷는 면(walk.json a, W28: 보도·골목·광장 가운데 큰길 찻길에서 몸 반지름 + 여유, 건물 벽에서 0.2m 떨어진 칸)과 그물의 노드 원·
//    횡단보도 기다리는 자리·횡단보도 통로 안에만 있다. 그물은 길 찾기(어느 선을 따라갈지)에만 쓰고, 걸음은 면 안 어디로든 비켜 간다.
//  - 큰길은 횡단보도로만, 보행 신호를 지켜 건넌다.
//  - 한자리를 오가며 맴돌지 않는다(W26): 문·노드에 닿는 것은 점이 아니라 영역이고, 돌아다니는 사람은 막다른 가지에 들어가지 않으며,
//    온 길은 다른 길이 없을 때만 고르고(W36), 막혀 돌아서기는 마지막으로 돌아선 자리에서 TURN_GAP 넘게 떨어졌을 때만 한다.
//  - 자리는 매 단계 걸음만큼만 바뀐다(순간이동 없음). 선을 갈아탈 때도 자리는 그대로 두고 따라가는 선만 바꾼다.
import type { Now } from '../clock.ts';
import { BODY_HW, BODY_LEN, bodyType } from '../bodies.ts';
import { ISLAND_BACK, ISLAND_L, ISLAND_W } from '../graph.ts';
import type { DataProvider } from '../provider.ts';
import { PLACES, placeMask } from '../places.ts';
import { hash01, mix3, pick, rng } from '../rng.ts';
import { LINK, type WalkGraph } from '../walknet.ts';
import { decodeArea } from './area.ts';
import { ENTER_D, EXIT_S, gateOpen, makeJunctions } from './junction.ts';
import { agentLine, makeLines, solve } from './orca.ts';
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
/** 미리 돌리기(W24): 길게 불러도 끝 WARM_SECS 초만 돌린다(0.1초 걸음 그대로 150초와 300초는 인원·분포가 같았다). 앞부분은 한 사람을 WARM_TICK 초에 한 번씩 움직이고, 끝 WARM_FINE 초는 모두 SUB 마다 움직인다 */
const WARM_SECS = 150;
const WARM_TICK = 2;
const WARM_FINE = 10;
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
const REV_T = 20;
const TAU = 2;
const TURN_RATE = 7;
const PULL = 4;
const GATHER = 3;
const CROSS_COST = 12;
const MAX_WAIT_BUS = 300;
const HURRY = 2.2;
/** 문·출구 폭(W26): 문턱(출구 자리) 이만큼(m) 안에 든 사람은 들어간다. 한 점에 닿아야 들어가면 앞사람이 그 점을 막을 때 뒷사람이 둘레를 맴돈다 */
const DOOR_R = 0.8;
/** 돌아서기 간격(m, W26): 마지막으로 돌아선 자리에서 이만큼 떨어지기 전에는 다시 돌아서지 않는다(30초에 10m 원 안을 오가려면 두 번 돌아서야 한다) */
const TURN_GAP = 20;
/** 막혀 돌아선 선을 다시 고르지 않는 시간(초) */
const AVOID_T = 60;
/** 돌아다니는 사람이 기억하는 최근 지난 노드 수(W26: 넷이면 노드 다섯 개짜리 작은 고리를 계속 돌았다) */
const SEEN = 16;
/** 돌아다니는 사람이 향하는 먼 자리까지 거리(m, W28) */
const WANDER = 200;
/** 걷는 면 위 겨누는 거리(m): 선을 따라 이만큼 앞 자리를 겨눈다(W28) */
const LOOK = 2.5;
/** 선 끝에서 이 거리 안이면 모퉁이를 질러 다음 선 위 자리를 겨눈다(m) */
const CUT = 6;
/** 노드 둘레 이 거리 안이면 노드에 닿은 것으로 친다(m) */
const SWITCH_R = 1.2;
/** 횡단보도 앞 노드 이 거리 안이면 기다리기 시작한다(m) */
const XW_R = 3;

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
  /** 사람 i 만의 난수(W41): 걷는 중 고르기(돌아다닐 길·갈 쪽·머물기)는 씨앗·사람 번호·그 사람 차례로 정한다. 공유 난수로 고르면 차 흐름이 바뀌어
   *  어느 사람이 난수를 먼저 쓰는지가 바뀔 때 차와 먼 사람까지 판 전체의 걸음이 통째로 바뀌었다(사람 시험 값이 차 고침만으로 씨앗 운만큼 흔들렸다) */
  const prand = (i: number) => hash01(Math.imul(seed | 0, 0x27d4eb2d) ^ Math.imul(w.id[i], 0x165667b1) ^ rc[i]++);
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
  /** W46: 고유 번호 = 위 21비트 나온 단계(popNo) + 아래 10비트 나온 자리 열쇠(문 열쇠·그 문에서 나온 수)의 해시. 나온 차례(1, 2, 3…)로 매기면 판 어디서든 한 명이
   *  더 나오면 뒤에 나온 사람 번호가 모두 밀려, 번호로 정하는 사람별 난수(prand)·정류장 뽑기·성긴 차례가 판 전체에서 바뀌었다. 위 비트를 나온 단계로 두어
   *  먼저 나온 사람이 번호가 작다는 옛 뜻은 지킨다(마주 선 두 사람 가운데 번호가 작은 쪽이 돌아선다). 한 단계에 나오는 사람은 300명 아래다.
   *  나온 단계는 2^21 단계(1/30초 걸음으로 약 19시간)마다 처음으로 돌아간다 */
  const liveIds = new Set<number>();
  const newId = (a: number, b: number, lo = mix3(seed | 0, a, b)) => {
    const hi = (popNo & 0x1fffff) << 10;
    lo &= 0x3ff;
    while (liveIds.has(hi | lo || 1)) lo = (lo + 1) & 0x3ff;
    return hi | lo || 1;
  };

  // ── 그물 ──
  /** 걷는 면(W28). 자료가 없으면(옛 walk.json) 선 띠만 쓴다 */
  const area = decodeArea(g.area);
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
  /** 중앙 승강장 노드(W28: 돌아다니는 사람은 승강장으로 건너가지 않는다. 승강장 끝은 막다른 길이라 들어가면 승강장 위를 오갔다) */
  const island = new Set<number>();
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
      island.add(I);
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
  /** 갈래 영역(W36, junction.ts) */
  const J = makeJunctions(g.junc, hes, out, NX);
  // ── (선을 다 더한 뒤: 중앙 승강장 선 포함) 좁은 길(두 사람이 엇갈려 지날 수 없는 띠: 가운데가 설 수 있는 폭이 2 × BODY_R 보다 좁다)의 차지: 방향 있는 선마다 지금 그 선을 걷는 사람 수 ──
  const narrow = new Uint8Array(hes.length);
  // 걷는 면이 있으면 선 가운데·네 귀퉁이 쪽 세 자리의 면 폭(양옆 남은 거리 합) 가운데 가장 좁은 것으로 본다(W28)
  const areaWidth = (k: number) => {
    const e = hes[k];
    let m = Infinity;
    for (const f of [0.25, 0.5, 0.75]) {
      const x = NX[e.a * 2] + e.ux * e.L * f;
      const z = NX[e.a * 2 + 1] + e.uz * e.L * f;
      m = Math.min(m, area!.room(x, z, -e.uz, e.ux, 2) + area!.room(x, z, e.uz, -e.ux, 2));
    }
    return m;
  };
  for (let k = 0; k < hes.length; k++) narrow[k] = hes[k].x < 0 && hes[k].hi - hes[k].lo < 2 * BODY_R && (!area || areaWidth(k) < 2 * BODY_R) ? 1 : 0;
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

  /** 막다른 가지(W26): 그물에서 끝 노드를 거듭 떼어 내면 사라지는 나무 가지. intoDead[k] 는 방향 있는 선 k 가 그 가지 안쪽(더 막다른 쪽)으로 들어가는가.
   *  돌아다니는 사람은 다른 길이 있으면 이런 가지에 들어가지 않는다(들어가면 끝에서 되돌아 나와야 한다) */
  const intoDead = new Uint8Array(hes.length);
  {
    const deg = new Int32Array(out.length);
    for (let n = 0; n < out.length; n++) for (const k of out[n]) if (hes[k].b !== n) deg[n]++;
    const ord = new Int32Array(out.length).fill(-1);
    const q: number[] = [];
    for (let n = 0; n < out.length; n++) if (deg[n] <= 1) q.push(n);
    let t = 0;
    for (let qi = 0; qi < q.length; qi++) {
      const n = q[qi];
      if (ord[n] >= 0) continue;
      ord[n] = t++;
      for (const k of out[n]) {
        const b = hes[k].b;
        if (b !== n && ord[b] < 0 && --deg[b] <= 1) q.push(b);
      }
    }
    for (let k = 0; k < hes.length; k++) if (ord[hes[k].b] >= 0 && (ord[hes[k].a] < 0 || ord[hes[k].a] > ord[hes[k].b])) intoDead[k] = 1;
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
  const wgX = new Float32Array(max).fill(NaN); // 돌아다닐 때 향하는 먼 자리(W28, 없으면 NaN)
  const wgZ = new Float32Array(max);
  const avoidHe = new Int32Array(max).fill(-1); // 막혀 돌아선 선(잠시 고르지 않는다)
  const avoidT = new Float32Array(max);
  const viaNode = new Uint8Array(max); // 모퉁이에서 노드를 거쳐 갈아탄다 // 건너기 길에서 다음 점 번호
  const xLat = new Float32Array(max); // 건너는 통로에서 옆자리
  const xSpd = new Float32Array(max);
  const waitT = new Float32Array(max);
  const stuckT = new Float32Array(max);
  const seenN = new Int32Array(max * SEEN).fill(-1); // 최근 지난 노드 SEEN 개
  const lastX = new Int32Array(max).fill(-1); // 마지막으로 건넌 횡단보도
  const lastXT = new Float32Array(max);
  const turnX = new Float32Array(max); // 마지막으로 돌아선 자리(W26, 아직 없으면 NaN)
  const turnZ = new Float32Array(max);
  const jr = new Int32Array(max).fill(-1); // 지나는 중인 갈래 영역(W36, −1 없음)
  const jx = new Int32Array(max).fill(-1); // 갈래 영역에서 나갈 선(들어가기 전에 고른다)
  const jd = new Int32Array(max).fill(-1); // 갈래 영역 안 선에 붙은 갈 문·출구(있으면 나가지 않고 거기로)
  const gateT = new Float32Array(max); // 게이트 앞에서 기다린 시간
  const jOutT = new Float32Array(max).fill(-1e9); // 갈래 영역을 나온 시각
  const gateR = new Int32Array(max); // 기다리는 게이트의 영역
  const queued = new Uint8Array(max); // 게이트 앞 줄에 선 사람
  const fresh = new Uint8Array(max); // 갓 목적지를 받아 다음 길 고르기에서 온 길도 고를 수 있다(W41)
  const rc = new Uint32Array(max); // 사람마다 따로 쓰는 난수의 차례(W41)
  const gateWhy = new Uint8Array(max); // 측정용: 게이트가 막힌 까닭(junction.ts gateOpen)
  // 성기게 움직이기(W19): 자세히 볼 필요 없는 사람(setDetail 이 거짓)은 밀린 시간이 SUB 에 닿을 때만 한 번에 움직인다
  const lag = new Float32Array(max);
  const all = [lag, vX, vZ, headW, wgX, wgZ, avoidHe, avoidT, viaNode, w.x, w.z, w.yaw, w.phase, w.fade, w.tint, w.id, w.photo, w.moving, w.age, w.female, mode, he, nk, prv, lane, spd, head, life, goal, dockOf, home, holdT, snap, faceX, faceZ, tx, tz, xLeg, xLat, xSpd, waitT, stuckT, lastX, lastXT, turnX, turnZ, jr, jx, jd, gateT, jOutT, gateR, queued, fresh, rc];

  const dead = new Uint8Array(max);
  /** 사라질 사람 표시(단계 안에서는 배열 자리를 바꾸지 않는다: 격자가 옛 자리 번호를 쥐고 있다) */
  function remove(i: number) {
    dead[i] = 1;
  }
  /** W46: 배열 차례(= 한 단계 안에서 움직이는 차례)는 고유 번호 순이다. 빈 자리를 끝 사람으로 채우면 판 어디서든 사람이 빠질 때 서로 붙어 걷는 사람끼리
   *  계산 차례가 바뀌어, 먼저 움직인 사람 자리를 보고 비키는 걸음이 판 전체에서 달라졌다. 나온 차례대로 두면(빼기만 차례를 지키면) 갓 나온 사람이 늘 먼저
   *  움직여 걸음이 한쪽으로 치우쳤다(홍대 토21 씨앗 열둘 10초 흐름 +2.0%p·20초 정체 −1.0%p, 사람 한 걸음 +15%). 고유 번호는 해시라 이 차례는 섞여 있다.
   *  새로 나온 사람(끝에 붙는다)은 다음 단계 처음에 제자리로 옮긴다(단계 안·사이에는 자리 번호를 바꾸지 않는다: 격자가 자리 번호를 쥐고 있다) */
  let sortedN = 0;
  function settle() {
    for (let k = sortedN; k < w.n; k++) {
      const id = w.id[k];
      let lo = 0;
      let hi = k;
      while (lo < hi) {
        const m = (lo + hi) >> 1;
        if (w.id[m] < id) lo = m + 1;
        else hi = m;
      }
      if (lo === k) continue;
      for (const a of all) {
        const v = a[k];
        a.copyWithin(lo + 1, lo, k);
        a[lo] = v;
      }
      seenT.set(seenN.subarray(k * SEEN, k * SEEN + SEEN));
      seenN.copyWithin((lo + 1) * SEEN, lo * SEEN, k * SEEN);
      seenN.set(seenT, lo * SEEN);
    }
    sortedN = w.n;
  }
  const seenT = new Int32Array(SEEN);
  /** 사라진 사람을 뺀다(남은 사람의 차례는 그대로) */
  function compact() {
    const n = w.n;
    let j = 0;
    while (j < n && !dead[j]) j++;
    let i = j;
    while (i < n) {
      while (i < n && dead[i]) (dead[i] = 0), liveIds.delete(w.id[i]), i++;
      let e = i;
      while (e < n && !dead[e]) e++;
      if (e > i) {
        for (const a of all) a.copyWithin(j, i, e);
        seenN.copyWithin(j * SEEN, i * SEEN, e * SEEN);
        j += e - i;
      }
      i = e;
    }
    w.n = j;
    sortedN = j;
  }

  // ── 몸 겹침 ──
  const GH = 1 << 16;
  const GC = 1.4;
  const gridHead = new Int32Array(GH).fill(-1);
  const gridNext = new Int32Array(max);
  // 단계 안에서 칸을 옮긴 사람(W33): 격자는 단계 처음 자리로 짜므로, 한 걸음이 긴 미리 돌리기(WARM_TICK 2초)에서는 먼저 옮긴 사람이 찾는 칸 밖에 있어
  // 몸이 겹친 채 시작했다(클럽거리 토 21시 씨앗 12). 칸을 옮긴 사람은 이 격자에도 넣는다(겹침 확인 crowded 가 둘 다 본다)
  const moveHead = new Int32Array(GH).fill(-1);
  const moveNext = new Int32Array(max);
  const cellOf = new Int32Array(max);
  /** 이 단계에 칸을 옮긴 사람 수(0 이면 moveHead 가 비어 있다) */
  let nMoved = 0;
  const cellKey = (cx: number, cz: number) => ((Math.imul(cx, 73856093) ^ Math.imul(cz, 19349663)) >>> 0) & (GH - 1);
  /** (x, z)에 i 의 몸이 놓이면 다른 사람과 가운데 사이가 lim 보다 가까워지는가(이미 그보다 가까운 사이는 더 다가가지만 않으면 된다) */
  function crowded(i: number, x: number, z: number, lim = PASS_D): boolean {
    const D2 = lim * lim;
    const cx = Math.floor(x / GC);
    const cz = Math.floor(z / GC);
    const me = i < w.n && !dead[i];
    for (let ax = -1; ax <= 1; ax++)
      for (let az = -1; az <= 1; az++) {
        const key = cellKey(cx + ax, cz + az);
        for (let j = gridHead[key]; j >= 0; j = gridNext[j]) if (near(i, j, x, z, D2, me)) return true;
        // 칸을 옮긴 사람이 없으면 둘째 격자는 비어 있다(W43: 늘 둘을 돌면 사람 계산이 늘었다)
        if (nMoved) for (let j = moveHead[key]; j >= 0; j = moveNext[j]) if (near(i, j, x, z, D2, me)) return true;
      }
    return false;
  }
  /** crowded 의 한 사람 확인: j 가 (x, z)에서 D2 안이고, 이미 겹쳐 있던 사이(me)라면 더 다가가는 자리인가 */
  function near(i: number, j: number, x: number, z: number, D2: number, me: boolean): boolean {
    if (j === i || j >= w.n || dead[j]) return false;
    const dx = w.x[j] - x;
    const dz = w.z[j] - z;
    const d2 = dx * dx + dz * dz;
    if (d2 >= D2) return false;
    // 이미 겹쳐 있던 사이라면 멀어지는 걸음은 된다(겹침을 새로 만들거나 키우지만 않는다)
    if (me) {
      const ox = w.x[j] - w.x[i];
      const oz = w.z[j] - w.z[i];
      if (d2 > ox * ox + oz * oz + 1e-9) return false;
    }
    return true;
  }
  /** 노드 n 둘레 2.5m 안 사람 수 / 넓이(명/m²): 갈래 길 둘레 붐빔 */
  function nodeDens(n: number, ux = 0, uz = 0): number {
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
          if (dx * dx + dz * dz < 6.25 && Math.cos(head[j]) * ux + Math.sin(head[j]) * uz < 0.5) c++;
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
    if (area && area.at(x, z)) return true;
    if (inHe(he[i], x, z)) return true;
    if (nk[i] >= 0 && inHe(nk[i], x, z)) return true;
    if (prv[i] >= 0 && inHe(prv[i], x, z)) return true;
    // 갈래 영역 안 선 띠(영역 안이거나, 지금 선이 영역에서 나오거나 영역으로 든다: 영역을 가로질러 선 자리가 그 띠 안일 수 있다)
    const r0 = jr[i];
    const r1 = J.of[hes[he[i]].a];
    const r2 = J.of[hes[he[i]].b];
    if (r0 >= 0 && inRegion(r0, x, z)) return true;
    if (r1 >= 0 && r1 !== r0 && inRegion(r1, x, z)) return true;
    if (r2 >= 0 && r2 !== r0 && r2 !== r1 && inRegion(r2, x, z)) return true;
    // W50: 갈래 영역에서 막 나온 사람(앞 선이 영역에 닿는다)은 그 영역도 걸을 수 있다(영역 안 걷는 면 밖 자리에서 나가면 어느 걸음도 걷는 길 안이 아니라 60초 서 있었다)
    if (prv[i] >= 0) {
      const r3 = J.of[hes[prv[i]].b] >= 0 ? J.of[hes[prv[i]].b] : J.of[hes[prv[i]].a];
      if (r3 >= 0 && r3 !== r0 && r3 !== r1 && r3 !== r2 && inRegion(r3, x, z)) return true;
    }
    return false;
  }
  // ── 갈래 영역 r 안 선들의 띠·노드 가운데 하나에 (x, z)가 드는가(W43: 안쪽 선마다 inHe 로 두 끝 노드를 다시 보던 것을, 노드는 한 번씩만 보고
  //    영역 전체를 품는 상자 밖이면 바로 거짓. 결과는 같다) ──
  const jNodes: number[][] = J.inner.map((ks) => [...new Set(ks.flatMap((k) => [hes[k].a, hes[k].b]))]);
  const jBox = new Float64Array(J.inner.length * 4);
  for (let r = 0; r < J.inner.length; r++) {
    let x0 = Infinity;
    let z0 = Infinity;
    let x1 = -Infinity;
    let z1 = -Infinity;
    const add = (x: number, z: number, m: number) => {
      x0 = Math.min(x0, x - m);
      z0 = Math.min(z0, z - m);
      x1 = Math.max(x1, x + m);
      z1 = Math.max(z1, z + m);
    };
    for (const k of J.inner[r]) {
      const e = hes[k];
      if (e.x >= 0) {
        const c = crosses[e.x];
        for (let q = 0; q < c.pts.length; q += 2) add(c.pts[q], c.pts[q + 1], c.hw + 0.02);
      } else if (e.L >= 1e-3)
        for (const sv of [-EDGE_EXT, e.L + EDGE_EXT])
          for (const uv of [e.lo - 0.02, e.hi + 0.02]) add(NX[e.a * 2] + e.ux * sv - e.uz * uv, NX[e.a * 2 + 1] + e.uz * sv + e.ux * uv, 0);
    }
    for (const n of jNodes[r]) {
      add(NX[n * 2], NX[n * 2 + 1], Math.sqrt(RAD[n] * RAD[n] + 1e-4));
      for (const q of nodeRects[n]) {
        const t = rects[q];
        for (const uv of [t.u0, t.u1]) for (const vv of [t.v0 - 0.02, t.v1 + 0.02]) add(t.ox + t.ux * uv - t.uz * vv, t.oz + t.uz * uv + t.ux * vv, 0);
      }
    }
    // 반올림 여유
    jBox.set([x0 - 0.05, z0 - 0.05, x1 + 0.05, z1 + 0.05], r * 4);
  }
  function inRegion(r: number, x: number, z: number): boolean {
    const b = r * 4;
    if (x < jBox[b] || z < jBox[b + 1] || x > jBox[b + 2] || z > jBox[b + 3]) return false;
    for (const k of J.inner[r]) if (inBand(k, x, z)) return true;
    for (const n of jNodes[r]) if (inNode(n, x, z)) return true;
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
    w.phase[i] += d * 4.6;
    return true;
  }

  // ── 고르기 ──
  const remember = (i: number, n: number) => {
    const b = i * SEEN;
    seenN.copyWithin(b + 1, b, b + SEEN - 1);
    seenN[b] = n;
  };
  const wasAt = (i: number, n: number) => {
    const b = i * SEEN;
    for (let k = 0; k < SEEN; k++) if (seenN[b + k] === n) return true;
    return false;
  };
  /** 돌아서도 되는가(W26): 마지막으로 돌아선 자리에서 TURN_GAP 넘게 떨어졌을 때만 */
  const canTurn = (i: number) => Number.isNaN(turnX[i]) || Math.hypot(w.x[i] - turnX[i], w.z[i] - turnZ[i]) >= TURN_GAP;
  const markTurn = (i: number) => {
    turnX[i] = w.x[i];
    turnZ[i] = w.z[i];
    // 돌아섰으면 향하던 먼 자리도 새로 정한다(돌아선 쪽으로)
    wgX[i] = NaN;
    headW[i] += Math.PI + (prand(i) - 0.5);
  };
  const tmpW: number[] = [];
  const tmpK: number[] = [];
  /** 갈래 영역 나갈 선 k 가 선 h 로 들어온 쪽으로 되돌아 나가는가(나갈 선을 따라 EXIT_LOOK 간 자리가 h 방향 뒤쪽) */
  function backOut(h: number, k: number): boolean {
    if (k === hes[h].rev) return true;
    const e0 = hes[h];
    const b = e0.b;
    const [q, st] = hes[k].x >= 0 ? [k, hes[k].L] : along(k, EXIT_LOOK);
    const [px, pz] = onHe(q, Math.min(st, hes[q].L), 0);
    const dx = px - NX[b * 2];
    const dz = pz - NX[b * 2 + 1];
    return dx * e0.ux + dz * e0.uz < -0.5 * Math.hypot(dx, dz);
  }
  /** 노드 hes[h].b 에서 갈 다음 선 */
  function plan(i: number, h: number, now: number, opts0 = out[hes[h].b], junc = false): number {
    const b = hes[h].b;
    const back = hes[h].rev;
    const opts = avoidT[i] > now && opts0.length > 1 ? opts0.filter((k) => k !== avoidHe[i]) : opts0;
    if (goal[i] >= 0) {
      const Dg = D[goal[i]];
      let best = -1;
      let bv = Infinity;
      for (const k of opts) {
        if (k === back && opts.length > 1 && !fresh[i]) continue;
        const e = hes[k];
        // 이 선에 닿을 정류장·문이 있으면 그 거리
        // 붐빔은 넣지 않는다: 집에 가는 길은 거리 장을 따라 내려가기만 해야 붐빔이 바뀔 때마다 길을 바꾸며 오가지 않는다
        let v = e.L + (e.x >= 0 ? CROSS_COST : 0) + Dg[e.b] + (e.a !== b ? Math.hypot(NX[e.a * 2] - NX[b * 2], NX[e.a * 2 + 1] - NX[b * 2 + 1]) : 0);
        for (const dk of dockAtHe.get(k) ?? []) {
          const d = docks[dk];
          if ((goal[i] === 1) !== (d.kind === 'stop')) continue;
          const t = d.he === k ? d.t : e.L - d.t;
          if (t < v) v = t;
        }
        if (v < bv) (bv = v), (best = k);
      }
      fresh[i] = 0;
      return best;
    }
    tmpW.length = 0;
    tmpK.length = 0;
    const e0 = hes[h];
    // 돌아다니는 사람은 갈 쪽(headW)으로 WANDER m 떨어진 먼 자리를 향해 간다(W28: 선마다 갈 쪽 무게만 두면 촘촘한 선 그물·광장에서 제자리를 돌았다).
    // 25m 안에 닿으면 갈 쪽을 조금 틀어 다음 먼 자리를 정한다
    const bx = NX[b * 2];
    const bz = NX[b * 2 + 1];
    if (Number.isNaN(wgX[i]) || Math.hypot(wgX[i] - bx, wgZ[i] - bz) < 25) {
      if (!Number.isNaN(wgX[i])) headW[i] += (prand(i) - 0.5) * 2;
      wgX[i] = bx + Math.cos(headW[i]) * WANDER;
      wgZ[i] = bz + Math.sin(headW[i]) * WANDER;
    }
    const dB = Math.hypot(wgX[i] - bx, wgZ[i] - bz);
    // 고를 수 있는 가장 앞 등급에서만 고른다(W26): 0 앞으로 난 길(돌아설 수 있으면 온 길도 무게 0.02 로), 1 막혀 돌아섰던 선, 2 막다른 가지·중앙 승강장으로 건너는 길(W28), 3 온 길.
    // 막혀 돌아섰던 선을 목록에서 빼면 막다른 길과 그 선 사이에 갇혀 오갔다.
    // W36: 갈래 영역을 나온 뒤 JUNC_KEEP 초 안에는 온 길을 다른 길이 없을 때만 고른다(나간 갈래 길 앞에 맞은편 기다리는 줄이 서면 그 선이 붐빈다고 돌아서 갈래 길로 되돌아왔다).
    // 늘 막으면 붐비는 곳을 피해 돌아서는 길이 없어져 10초 흐름이 77 → 68% 로 떨어졌다(홍대 토21 씨앗 11)
    const free = canTurn(i) && clockS - jOutT[i] > JUNC_KEEP;
    const avoid = avoidT[i] > now ? avoidHe[i] : -1;
    // 갈래 영역에서 온 쪽으로 되돌아 나가는 선(나갈 선을 따라 EXIT_LOOK 간 자리가 들어온 선 방향 뒤쪽)도 온 길로 본다(W38: 영역 안 다른 노드에서 나가는 선이라
    // 온 길로 치지 않아, 건넌 횡단보도 옆 선이나 영역 둘레 짧은 선으로 곧장 되돌아가 고리를 돌았다)
    const backLike = (k: number) => k === back || (junc && backOut(h, k));
    // W50: 피할 선은 온 길 같은 선이어도 1등급 아래로(게이트 앞에서 GATE_T 넘게 못 들어가 피할 선으로 정해도, 온 쪽으로 나가는 선이면 0등급으로 남아 같은 선을 다시 골랐다)
    const tierOf = (k: number) => {
      const t = backLike(k) ? (free ? 0 : 3) : intoDead[k] || island.has(hes[k].b) || (junc && J.loop[k]) ? 2 : 0;
      return k === avoid ? Math.max(1, t) : t;
    };
    let tier = 3;
    for (const k of opts0) tier = Math.min(tier, tierOf(k));
    for (const k of opts0) {
      if (tierOf(k) !== tier) continue;
      const e = hes[k];
      let wt = e.x >= 0 ? 0.5 : Math.max(0.05, e.w);
      if (wasAt(i, e.b)) wt *= 0.05;
      if (e.x >= 0 && crosses[e.x].xw === lastX[i] && now - lastXT[i] < 120) wt *= 0.01;
      if (backLike(k)) wt *= 0.02;
      // 먼 자리로 다가가는 선을 좋아한다(선 길이당 다가가는 거리 −1~1)
      // 갈래 영역에서는 나갈 선을 따라 EXIT_LOOK 간 자리까지 걷는 길이당 다가가는 거리(나갈 선 길이가 0.7~71m 로 제각각이라 선 끝으로 재면 짧은 선이 늘 −1·1 에 붙는다)
      let pr: number;
      if (junc && e.x < 0) {
        const [q, st] = along(k, EXIT_LOOK);
        const [px, pz] = onHe(q, st, 0);
        pr = (dB - Math.hypot(wgX[i] - px, wgZ[i] - pz)) / (Math.hypot(NX[e.a * 2] - bx, NX[e.a * 2 + 1] - bz) + EXIT_LOOK);
      } else pr = Math.max(-1, Math.min(1, (dB - Math.hypot(wgX[i] - NX[e.b * 2], wgZ[i] - NX[e.b * 2 + 1])) / Math.max(1, e.L)));
      wt *= Math.exp(4 * pr) * (0.6 + 0.4 * Math.max(0, e0.ux * e.ux + e0.uz * e.uz));
      wt *= 1 + PULL * nodePull[e.b];
      // 붐비는 선은 덜 고른다. W36: 같은 쪽으로 걷는 사람은 붐빔으로 세지 않는다(앞서 같은 쪽으로 걷는 무리를 붐빔으로 보면 무리 뒤쪽 사람이 돌아서 갈래 길을 지나가지 못했다)
      if (e.x < 0 && !junc) wt *= Math.exp(-CROWD_PICK * Math.max(occ[e.rev] / bandA[k], NODE_W * nodeDens(e.b, e.ux, e.uz)));
      tmpW.push(wt);
      tmpK.push(k);
    }
    if (!tmpK.length) return -1;
    // 갈래 영역에서는 가장 무거운 나갈 선(제비를 뽑으면 맞은편 대신 옆길로 빠져 되돌아왔다)
    if (junc) return tmpK[tmpW.indexOf(Math.max(...tmpW))];
    return tmpK[pick(tmpW, prand(i))];
  }

  // ── 내보내기 ──
  const looks = Array.from({ length: PLACE_Z + 1 }, () => ({ ages: [0.05, 0.4, 0.85, 1], female: 0.5 }));
  function born(i: number, zone: number, id: number, r: () => number = () => prand(i)) {
    // W46: 옷·나이·성별·빠르기·띠 자리·수명·처음 방향은 그 사람만의 난수로(공유 난수로 뽑으면 판 어디서든 한 명이 더 나오면 뒤에 나온 사람의 옷차림·빠르기가 모두 바뀌었다)
    w.id[i] = id;
    liveIds.add(id);
    rc[i] = 0;
    w.tint[i] = r();
    w.photo[i] = 0;
    w.moving[i] = 1;
    w.fade[i] = 0;
    w.phase[i] = r() * 6.28;
    const u = r();
    const lk = looks[zone] ?? looks[OUT_Z];
    w.age[i] = u < lk.ages[0] ? 0 : u < lk.ages[1] ? 1 : u < lk.ages[2] ? 2 : 3;
    w.female[i] = r() < lk.female ? 1 : 0;
    spd[i] = (w.age[i] === 3 ? 1.0 : w.age[i] === 0 ? 1.05 : 1.25) + r() * 0.3;
    lane[i] = r();
    life[i] = 120 + r() * 480;
    goal[i] = -1;
    vX[i] = 0;
    vZ[i] = 0;
    holdT[i] = 0;
    waitT[i] = 0;
    stuckT[i] = 0;
    lastX[i] = -1;
    turnX[i] = NaN;
    turnZ[i] = NaN;
    seenN.fill(-1, i * SEEN, i * SEEN + SEEN);
    home[i] = zone;
    nk[i] = -1;
    viaNode[i] = 0;
    prv[i] = -1;
    viaNode[i] = 0;
    headW[i] = r() * Math.PI * 2;
    wgX[i] = NaN;
    avoidHe[i] = -1;
    avoidT[i] = 0;
    lag[i] = 0;
    jr[i] = -1;
    jx[i] = -1;
    jd[i] = -1;
    gateT[i] = 0;
    jOutT[i] = -1e9;
    queued[i] = 0;
    fresh[i] = 0;
  }
  /** 문·출구·정류장 k 에서 한 명을 낸다(자리가 비어 있을 때만). 낸 사람 번호, 못 내면 −1 */
  function spawnAt(k: number, near?: [number, number]): number {
    if (w.n >= max) return -1;
    const d = docks[k];
    let [x, z] = d.door ?? dockPos(k);
    if (near) [x, z] = near;
    const i = w.n;
    const id = newId(dockKey[k], dockSpawns[k]);
    // 방향은 아무 쪽이나(막다른 가지 안이면 바깥쪽으로)
    const r0 = hes[d.he].rev;
    const h = intoDead[d.he] && !intoDead[r0] ? r0 : intoDead[r0] && !intoDead[d.he] ? d.he : hash01(id ^ 0x5bd1e995) < 0.5 ? d.he : r0;
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
    dockSpawns[k]++;
    born(i, d.zone, id);
    const [px, pz] = dockPos(k);
    head[i] = mode[i] === OUTDOOR ? Math.atan2(pz - z, px - x) : Math.atan2(hes[h].uz, hes[h].ux);
    w.yaw[i] = head[i];
    // 그리드에 바로 넣어 같은 단계에 낸 사람끼리 겹치지 않게
    const key = cellKey(Math.floor(x / GC), Math.floor(z / GC));
    gridNext[i] = gridHead[key];
    gridHead[key] = i;
    cellOf[i] = key;
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
  /** 우측통행 옆자리(W28): 선 h 위 거리 s 에서 진행 방향 오른쪽으로 걷는 면(없으면 띠)이 남는 만큼 안에서, 사람마다 다른 자리(lane 0~1).
   *  마주 오는 사람은 그 사람의 오른쪽을 걸으므로 면이 몸 두 개보다 넓으면 마주쳐 막히지 않는다. 오른쪽에 자리가 없으면 선 위(0) */
  const sideU = (i: number, h: number, s: number) => {
    const e = hes[h];
    const [cx, cz] = onHe(h, Math.max(0, Math.min(e.L, s)), 0);
    const R = Math.max(Math.max(0, e.hi), area ? area.room(cx, cz, -e.uz, e.ux, 3) : 0);
    return Math.max(0, Math.min(R - 0.25, 0.45 + lane[i] * 1.6));
  };
  /** 선 h 옆 자리 (x, z)가 걷는 면 밖이면(중앙선 칠한 작은 길 위 골목 선, #55) 옆으로 가장 가까운 면 자리(오른쪽 먼저, 4m 안). 없으면 그대로 */
  const toArea = (h: number, x: number, z: number): [number, number] => {
    if (!area || area.at(x, z)) return [x, z];
    const e = hes[h];
    for (let d = 0.5; d <= 4; d += 0.5)
      for (const sg of [1, -1]) {
        const px = x - e.uz * d * sg;
        const pz = z + e.ux * d * sg;
        if (area.at(px, pz)) return [px, pz];
      }
    return [x, z];
  };
  /** i 가 (ax, az)에서 (bx, bz)까지 곧게 걸을 수 있는가(0.4m 마다 걷는 길 안) */
  const pathOk = (i: number, ax: number, az: number, bx: number, bz: number) => {
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.4));
    for (let k = 1; k <= n; k++) if (!valid(i, ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n)) return false;
    return true;
  };
  /** 오래 서 있는 사람(신호·줄·머묾·들어감): 이웃이 혼자 다 비켜야 한다 */
  const standing = (j: number) => vX[j] * vX[j] + vZ[j] * vZ[j] < 0.01 && (mode[j] === WAITX || mode[j] === QUEUE || mode[j] === LEAVE || holdT[j] > 0 || jr[j] >= 0 || gateT[j] > 0);
  const LN = makeLines(64);
  const VO = new Float64Array(2);
  /** 앞사람(측정·돌아서기용): 가려는 방향으로 몸 앞 3m 안 가장 가까운 사람 */
  let aheadJ = -1;
  // 회전 후보(라디안): 상호 회피로 고른 속도가 걷는 길 밖으로 나가거나 하한을 어기면 차례로 돌려 본다
  const TURNS = [0, 0.35, -0.35, 0.7, -0.7, 1.1, -1.1, 1.57, -1.57];
  // 회전 후보의 cos·sin(W43: 걸음마다 다시 구했다)과 반 걸음 차례
  const TURN_C = TURNS.map(Math.cos);
  const TURN_S = TURNS.map(Math.sin);
  const HALVES = [1, 0.5];
  /**
   * i 를 목표 (gx, gz) 쪽으로 빠르기 v(m/s)로 dt 동안 옮긴다(속도 기반 상호 회피, 재작업 W21b). 바라는 속도는 목표 쪽 v(닿기 직전엔 줄인다),
   * 마주 오는 사람이 앞에 있으면 조금 오른쪽으로 꺾는다(우측통행). 이웃(NEAR 안)과 벽으로 ORCA 반 평면을 만들어 바라는 속도에 가장 가까운 안전한 속도를 고르고,
   * 그 걸음이 걷는 길 밖·사람 하한(PASS_D)·차 몸통에 걸리면 반 걸음, 돌린 방향, 선 가운데(fallX, fallZ) 쪽 순으로 해 본다. 목표 쪽으로 나아간 거리를 돌려준다
   */
  function walkTo(i: number, gx: number, gz: number, v: number, dt: number, fallX?: number, fallZ?: number, fwd = false): number {
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
    solve(LN, v, px, pz, VO);
    const sx = VO[0];
    const sz = VO[1];
    // 고른 속도를 걸음으로 옮긴다(안 되면 반 걸음, 돌린 방향)
    for (const half of HALVES)
      for (let t = 0; t < TURNS.length; t++) {
        const a = TURNS[t];
        const c = TURN_C[t];
        const sn = TURN_S[t];
        const qx = (sx * c - sz * sn) * half;
        const qz = (sx * sn + sz * c) * half;
        if (qx * qx + qz * qz < 1e-6) continue;
        // 돌린 방향은 목표에서 멀어지지 않을 때만(고른 속도 그대로는 물러서는 것도 된다: 상호 회피가 엇갈림을 푸는 길이다)
        // 갈래 영역 안(fwd)은 고른 속도도 앞으로만(W36)
        if ((a !== 0 || fwd) && qx * ux + qz * uz < 0) continue;
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
  // ── 갈래 영역(W36, junction.ts): 들어가기 전에 나갈 선을 고르고, 정원과 나갈 자리를 확인한 뒤에만 들어가 나갈 선 위 자리로 앞으로만 걷는다 ──
  /** 영역 앞에서 이만큼(초) 못 들어가면 다른 나갈 선을 고른다 */
  const GATE_T = 10;
  /** 영역을 나온 뒤 이만큼(초)은 온 길로 돌아서지 않는다 */
  const JUNC_KEEP = 10;
  /** 영역 안에서 이만큼(초) 못 나아가면 나갈 선 걷기로 돌아간다 */
  const JUNC_STUCK = 8;
  /** (x, z) 둘레 lim 안에 i 말고, (ux, uz) 쪽으로 0.3m/s 넘게 걸어 나가고 있지 않은 걷는 사람이 있는가(나가는 사람은 곧 비킨다: 붐비는 곳에서 빈자리만 기다리면 게이트가 거의 열리지 않았다).
   *  게이트 앞에서 기다리는 사람과 횡단보도·줄·문으로 가는 사람은 세지 않는다(들어갈 차례를 기다릴 뿐 나갈 자리를 막고 선 것이 아니다: 세면 마주 선 두 무리, 이웃한 두 영역의 줄이 서로의 나갈 자리를 막아 함께 기다렸다) */
  function someone(i: number, x: number, z: number, lim: number, ux: number, uz: number, r: number): boolean {
    const cx = Math.floor(x / GC);
    const cz = Math.floor(z / GC);
    for (let ax = -1; ax <= 1; ax++)
      for (let az = -1; az <= 1; az++)
        for (let j = gridHead[cellKey(cx + ax, cz + az)]; j >= 0; j = gridNext[j]) {
          if (j === i || j >= w.n || dead[j] || mode[j] !== WALK || (gateT[j] > 0 && jr[j] < 0)) continue;
          if ((w.x[j] - x) ** 2 + (w.z[j] - z) ** 2 < lim * lim && vX[j] * ux + vZ[j] * uz < 0.3) return true;
        }
    return false;
  }
  /** 선 h 끝 영역에서 나갈 선(jx)을 고른다. 갈 문·출구가 영역 안 선에 있으면 그곳(jd) */
  function pickExit(i: number, h: number) {
    const r = J.of[hes[h].b];
    jd[i] = -1;
    if (goal[i] >= 0) {
      let bd = Infinity;
      for (const k of J.inner[r])
        for (const dk of dockAtHe.get(k) ?? []) {
          if ((goal[i] === 1) !== (docks[dk].kind === 'stop')) continue;
          const [px, pz] = dockPos(dk);
          const d = Math.hypot(px - w.x[i], pz - w.z[i]);
          if (d < bd) (bd = d), (jd[i] = dk);
        }
      if (jd[i] >= 0) return void (jx[i] = -1);
    }
    // 붐빔은 고르기에 넣지 않는다: 게이트가 들어가는 수를 맞춘다(붐빔을 피해 고르면 Y 갈림에서 맞은편 대신 옆길로 돌아갔다)
    jx[i] = plan(i, h, clockS, J.exits[r], true);
    if (jx[i] < 0) jx[i] = hes[h].rev;
  }
  /** 게이트: 영역 r 에 들어가 선 k 로 나가도 되는가(정원 아래, 나갈 선 첫머리 오른쪽에 빈 옆자리) */
  function gateOk(i: number, r: number, k: number): boolean {
    if (hes[k].x >= 0) return (gateWhy[i] = J.inside[r] < J.cap[r] ? 0 : 1) === 0;
    const G = gateSpots(k);
    gateWhy[i] = gateOpen(J, r, G.lanes, (u) => {
      const q = G.lanes.indexOf(u);
      return !someone(i, G.pts[q * 2], G.pts[q * 2 + 1], 2 * BODY_R, G.ux, G.uz, r);
    });
    return gateWhy[i] === 0;
  }
  /** 나갈 선 k 첫머리 옆자리(선 기준 옆 거리)와 그 바닥 자리, 선 방향. 그물과 걷는 면만으로 정해지므로 선마다 한 번 구해 둔다(W43) */
  const gateCache = new Map<number, { lanes: number[]; pts: number[]; ux: number; uz: number }>();
  function gateSpots(k: number) {
    let G = gateCache.get(k);
    if (G) return G;
    const [q, st] = along(k, EXIT_S);
    const e = hes[q];
    const [cx, cz] = onHe(q, st, 0);
    const onA = !!area && area.at(cx, cz);
    const R = onA ? area!.room(cx, cz, -e.uz, e.ux, 4) : Math.max(0, e.hi);
    const Lf = onA ? area!.room(cx, cz, e.uz, -e.ux, 4) : Math.max(0, -e.lo);
    const c = (R - Lf) / 2;
    const half = (R + Lf) / 2;
    const lanes: number[] = [];
    if (half < 0.7) lanes.push(c);
    else for (let u = c + 0.45; u <= c + half - 0.25 + 1e-6 && lanes.length < 3; u += 0.8) lanes.push(u);
    const pts = lanes.flatMap((u) => toArea(q, ...onHe(q, st, u)));
    gateCache.set(k, (G = { lanes, pts, ux: e.ux, uz: e.uz }));
    return G;
  }
  /** 갈래 영역 둘레의 우측통행 옆자리: 선 h 위 거리 s 에서 걷는 바닥(없으면 띠) 가운데보다 오른쪽 반 안에서 사람마다 다른 자리(선 기준 옆 거리).
   *  선이 바닥 한쪽 가장자리를 지나면 선 기준 오른쪽(sideU)은 바닥 전체가 되어 맞은편에서 나가는 사람 자리까지 기다리는 줄이 퍼졌다.
   *  바닥 폭이 몸 둘 남짓보다 좁으면 가운데 한 줄 */
  function rightLane(i: number, h: number, s: number): number {
    const e = hes[h];
    const sc = Math.max(0, Math.min(e.L, s));
    // 같은 선 같은 자리의 바닥 폭은 늘 같다(W43: 나갈 선 앞 EXIT_LOOK·게이트 자리처럼 같은 자리를 걸음마다 다시 쟀다)
    let RL = laneRoom.get(h);
    if (!RL || RL[0] !== sc) {
      const [cx, cz] = onHe(h, sc, 0);
      const R0 = area && area.at(cx, cz) ? area.room(cx, cz, -e.uz, e.ux, 4) : Math.max(0, e.hi);
      const L0 = area && area.at(cx, cz) ? area.room(cx, cz, e.uz, -e.ux, 4) : Math.max(0, -e.lo);
      laneRoom.set(h, (RL = [sc, R0, L0]));
    }
    const R = RL[1];
    const Lf = RL[2];
    const c = (R - Lf) / 2;
    const half = (R + Lf) / 2;
    // 선에서 2.2m 넘게는 비키지 않는다(넓은 바닥 너머 다른 바닥 조각으로 겨누지 않게, 영역에서 나간 것으로 보는 옆 거리 2.5m 안)
    if (half < 0.7) return Math.max(-2.2, Math.min(2.2, c));
    return Math.max(-2.2, Math.min(2.2, c + Math.min(half - 0.25, 0.45 + lane[i] * Math.max(0, half - 0.7))));
  }
  /** rightLane 이 마지막으로 잰 선마다 [자리 s, 오른쪽 바닥 폭, 왼쪽 바닥 폭] */
  const laneRoom = new Map<number, [number, number, number]>();
  /** 선 k 시작에서 갈래 없이 이어지는 선들을 따라 d(m) 간 자리: [선, 그 선 위 거리](0.7m 처럼 짧은 나갈 선 끝은 맞은편에서 기다리는 줄 바로 옆이다) */
  function along(k: number, d: number): [number, number] {
    for (let q = 0; q < 20 && d > hes[k].L; q++) {
      const b = hes[k].b;
      if (out[b].length !== 2 || J.of[b] >= 0) break;
      const nx = out[b][0] === hes[k].rev ? out[b][1] : out[b][0];
      if (hes[nx].x >= 0) break;
      d -= hes[k].L;
      k = nx;
    }
    return [k, Math.min(d, hes[k].L)];
  }
  /** 영역 안에서 겨눌 자리: 갈 문·출구, 횡단보도 앞 노드, 또는 나갈 선(과 이어진 선)을 따라 EXIT_LOOK 앞 우측통행 옆자리 */
  const EXIT_LOOK = 4;
  function exitAim(i: number): [number, number] {
    const k = jx[i];
    if (jd[i] >= 0) return dockPos(jd[i]);
    if (hes[k].x >= 0) return [NX[hes[k].a * 2], NX[hes[k].a * 2 + 1]];
    const [q, st] = along(k, EXIT_LOOK);
    const p0 = onHe(q, st, rightLane(i, q, st));
    const pa = toArea(q, ...p0);
    // 옆으로 1m 넘게 옮겨야 바닥이면 다른 바닥 조각이다: 선 가운데로
    return Math.hypot(pa[0] - p0[0], pa[1] - p0[1]) > 1 ? onHe(q, st, 0) : pa;
  }
  /** 영역 r 안 선을 따라 (x, z)에서 가장 가까운 영역 노드부터 노드 goal(없으면 alt)까지 가는 노드 목록(너비 우선, 영역 노드는 많아야 수십 개) */
  const routePrev = new Map<number, number>();
  function innerRoute(r: number, x: number, z: number, goal: number, alt: number): number[] {
    const want = goal >= 0 ? goal : alt;
    if (want < 0) return [];
    let s0 = -1;
    let bd = Infinity;
    for (const k of J.inner[r]) {
      const a = hes[k].a;
      const d = Math.hypot(NX[a * 2] - x, NX[a * 2 + 1] - z);
      if (d < bd) (bd = d), (s0 = a);
    }
    if (s0 < 0) return [want];
    // 길은 영역 안 선(그물)만으로 정해진다: 시작·끝 노드마다 한 번 구해 둔다(W43). 받는 쪽은 읽기만 한다
    const key = s0 * NN + want;
    const hit = routeCache.get(key);
    if (hit) return hit;
    const path = bfsRoute(r, s0, want);
    routeCache.set(key, path);
    return path;
  }
  const routeCache = new Map<number, number[]>();
  function bfsRoute(r: number, s0: number, want: number): number[] {
    routePrev.clear();
    routePrev.set(s0, -1);
    const q = [s0];
    for (let qi = 0; qi < q.length && !routePrev.has(want); qi++)
      for (const k of out[q[qi]]) {
        const b = hes[k].b;
        if (J.of[b] !== r || routePrev.has(b)) continue;
        routePrev.set(b, q[qi]);
        q.push(b);
      }
    if (!routePrev.has(want)) return [want];
    const path: number[] = [];
    for (let n = want; n >= 0; n = routePrev.get(n)!) path.push(n);
    return path.reverse();
  }
  /** 갈래 영역 안 걸음 */
  function juncStep(i: number, dt: number) {
    const x0 = w.x[i];
    const z0 = w.z[i];
    const k = jx[i];
    const aim = exitAim(i);
    let [gx, gz] = aim;
    // 곧게 갈 수 없으면(영역 바닥이 휘었다) 나갈 선 가운데 자리, 그것도 안 되면 영역 안 선을 따라 나갈 선 시작 노드까지 가는 길에서 곧게 보이는 가장 먼 노드
    if (Math.hypot(gx - x0, gz - z0) > 0.5 && !pathOk(i, x0, z0, gx, gz)) {
      const [cx, cz] = jd[i] < 0 && hes[k].x < 0 ? onHe(...along(k, EXIT_LOOK), 0) : [gx, gz];
      if (pathOk(i, x0, z0, cx, cz)) [gx, gz] = [cx, cz];
      else {
        const goalN = jd[i] >= 0 ? -1 : hes[k].a;
        const route = innerRoute(jr[i], x0, z0, goalN, jd[i] >= 0 ? hes[docks[jd[i]].he].a : -1);
        let pick = route.length ? route[0] : goalN;
        for (const n of route) if (pathOk(i, x0, z0, NX[n * 2], NX[n * 2 + 1])) pick = n;
        if (pick >= 0) [gx, gz] = [NX[pick * 2], NX[pick * 2 + 1]];
      }
    }
    tx[i] = gx;
    tz[i] = gz;
    const moved = walkTo(i, gx, gz, spd[i], dt, undefined, undefined, true);
    // 나갈 자리 2m 앞에서 3초 넘게 막힌 사람은 비비지 않고 선다
    if (stuckT[i] > 3 && moved <= 0.1 * spd[i] * dt && Math.hypot(gx - x0, gz - z0) < 2 && (w.x[i] !== x0 || w.z[i] !== z0)) {
      w.phase[i] -= Math.hypot(w.x[i] - x0, w.z[i] - z0) * 4.6;
      w.x[i] = x0;
      w.z[i] = z0;
      vX[i] = 0;
      vZ[i] = 0;
    }
    w.moving[i] = w.x[i] !== x0 || w.z[i] !== z0 ? 1 : 0;
    if (moved > 0.1 * spd[i] * dt) stuckT[i] = Math.max(0, stuckT[i] - 2 * dt);
    else stuckT[i] += dt;
    // 겨눌 자리는 나갈 선·갈 곳·옆자리 몫(lane)으로만 정해져 걸은 뒤에도 같다(W43: 두 번 구했다)
    const [ax, az] = aim;
    const left = Math.hypot(ax - w.x[i], az - w.z[i]);
    if (jd[i] >= 0) {
      if (left < 0.6) (jr[i] = -1), arrive(i, jd[i]);
      return;
    }
    const e = hes[k];
    const out2 = (n: number) => {
      prv[i] = he[i];
      // 짧은 나갈 선을 지나 이어진 선 위에 와 있으면 그 선을 따라간다(지나온 노드로 되돌아가지 않게)
      let q = k;
      for (let c = 0; c < 20 && hes[q].x < 0 && proj(q, w.x[i], w.z[i])[0] > hes[q].L; c++) {
        const b = hes[q].b;
        if (out[b].length !== 2 || J.of[b] >= 0) break;
        const nx2 = out[b][0] === hes[q].rev ? out[b][1] : out[b][0];
        if (hes[nx2].x >= 0) break;
        prv[i] = q;
        q = nx2;
      }
      he[i] = q;
      nk[i] = -1;
      viaNode[i] = 0;
      waitT[i] = 0;
      jr[i] = -1;
      jx[i] = -1;
      jOutT[i] = clockS;
      remember(i, n);
    };
    if (e.x >= 0) {
      // 횡단보도로 나간다: 기다리는 자리로
      if (left < XW_R) {
        out2(e.a);
        mode[i] = WAITX;
        [tx[i], tz[i]] = waitSpot(i, e.a, crosses[e.x]);
      }
      return;
    }
    const [sk, uk] = proj(k, w.x[i], w.z[i]);
    // 나갈 선에 올라섰으면 나간다. 영역 안에서 JUNC_STUCK 초 넘게 못 나아가면(벽에 끼었다) 나갈 선을 따라 걷기로 돌아간다
    if ((sk >= Math.min(EXIT_S, e.L * 0.6) && Math.abs(uk) < 2.5) || left < 0.5 || stuckT[i] > JUNC_STUCK) (stuckT[i] = 0), out2(e.a);
  }

  /** 걷는 사람 하나를 한 걸음(dt) 옮긴다 */
  function walkStep(i: number, dt: number, tod: number) {
    if (jr[i] >= 0) return juncStep(i, dt);
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
    // ── 갈래 영역 앞(W36) ──
    // 지금 선이 영역으로 들어가거나, 다음 선이 영역으로 들어가는 짧은 선이고 그 영역 노드가 ENTER_D 안이면 게이트를 본다
    let jb = e.x < 0 ? J.of[e.b] : -1;
    let ent = h;
    const nq = nk[i];
    if (jb < 0 && nq >= 0 && hes[nq].x < 0 && J.of[hes[nq].b] >= 0 && J.of[hes[nq].a] !== J.of[hes[nq].b] && Math.hypot(w.x[i] - NX[hes[nq].b * 2], w.z[i] - NX[hes[nq].b * 2 + 1]) < ENTER_D)
      (jb = J.of[hes[nq].b]), (ent = nq);
    if (jb >= 0) {
      const toEnd0 = ent === h ? e.L - Math.max(0, s) : 0;
      const inner = ent === h && J.of[e.a] === jb;
      if (inner || toEnd0 < 8) {
        if (jd[i] < 0 && (jx[i] < 0 || J.of[hes[jx[i]].a] !== jb)) pickExit(i, ent);
        // W50: 들어온 선을 되짚어 나갈 선(들어온 선의 반대)을 골랐으면 영역에 들어가지 않고 이 자리에서 돌아선다(게이트를 지나 되짚어 나가려면 나갈 자리가
        // 제가 선 줄 앞이라, 붐비면 게이트가 열리지 않고 GATE_T 마다 같은 선을 다시 골라 그 뒤 줄 전체가 서 있었다: 어울마당로 Y 갈림)
        if (!inner && jd[i] < 0 && jx[i] === hes[ent].rev) {
          turnX[i] = w.x[i];
          turnZ[i] = w.z[i];
          stuckT[i] = 0;
          gateT[i] = 0;
          jx[i] = -1;
          prv[i] = h;
          he[i] = e.rev;
          nk[i] = -1;
          viaNode[i] = 0;
          waitT[i] = 0;
          return;
        }
        // 영역 안 선 위(놓였거나 나왔다)면 게이트 없이 들어간다. 영역 노드 ENTER_D 안에서 게이트를 본다
        const eb = hes[ent].b;
        // (옆자리로 비켜 걸어 노드까지 곧은 거리가 ENTER_D 보다 멀어도 선을 따라 게이트 자리를 지났으면)
        const atGate = Math.hypot(w.x[i] - NX[eb * 2], w.z[i] - NX[eb * 2 + 1]) < ENTER_D || (ent === h && s >= e.L - ENTER_D + 0.5);
        if (inner || (atGate && (jd[i] >= 0 || gateOk(i, jb, jx[i])))) {
          if (ent !== h) (prv[i] = h), (he[i] = ent);
          jr[i] = jb;
          nk[i] = jx[i];
          gateT[i] = 0;
          J.inside[jb]++;
          return juncStep(i, dt);
        }
        if (atGate) {
          // 게이트 앞에서 선다. 오래 못 들어가면 다른 나갈 선을 고른다
          w.moving[i] = 0;
          vX[i] = 0;
          vZ[i] = 0;
          gateT[i] += dt;
          gateR[i] = jb;
          if (gateT[i] > GATE_T) (avoidHe[i] = jx[i]), (avoidT[i] = clockS + 30), pickExit(i, ent), (gateT[i] = 1e-3);
          return;
        }
        // 게이트 자리(영역 앞 ENTER_D)까지 우측통행 옆자리로 걷는다
        const sg = Math.min(e.L - ENTER_D + 0.8, Math.max(0, s) + LOOK);
        const x0 = w.x[i];
        const z0 = w.z[i];
        let [gx, gz] = toArea(h, ...onHe(h, Math.max(0, sg), rightLane(i, h, sg)));
        if (!pathOk(i, x0, z0, gx, gz)) [gx, gz] = onHe(h, Math.max(0, sg), 0);
        tx[i] = gx;
        tz[i] = gz;
        const mv = walkTo(i, gx, gz, spd[i], dt, ...onHe(h, Math.max(0, Math.min(e.L, Math.max(0, s) + 0.5)), 0));
        // 게이트 앞 줄 뒤에서 막히면 비비지 않고 선다(W38: 앞사람마다 다른 옆자리를 겨눠 줄 뒤 무리가 4m 안을 30초 넘게 비비며 돌아 맴돌기로 잡혔다)
        const j = aheadJ;
        queued[i] = !shoved && mv <= 0.1 * spd[i] * dt && j >= 0 && (gateT[j] > 0 || queued[j]) ? 1 : 0;
        if (queued[i]) {
          w.phase[i] -= Math.hypot(w.x[i] - x0, w.z[i] - z0) * 4.6;
          w.x[i] = x0;
          w.z[i] = z0;
          vX[i] = 0;
          vZ[i] = 0;
        }
        w.moving[i] = w.x[i] !== x0 || w.z[i] !== z0 ? 1 : 0;
        if (mv > 0.1 * spd[i] * dt) stuckT[i] = Math.max(0, stuckT[i] - 2 * dt);
        else if (!queued[i]) stuckT[i] += dt;
        return;
      }
    } else (gateT[i] = 0), (jd[i] = -1);
    if (jb < 0 && nk[i] < 0 && e.L - s < 8) {
      nk[i] = plan(i, h, clockS);
      if (nk[i] < 0) nk[i] = e.rev;
    }
    // ── 겨눌 자리(W28): 걷는 면 위에서 선을 따라 LOOK 앞, 우측통행 옆자리. 다음 선이 정해졌고 곧게 갈 수 있으면 모퉁이를 질러 다음 선 위 자리를 겨눈다 ──
    const nx = nk[i];
    const nxWalk = nx >= 0 && hes[nx].x < 0;
    const toEnd = e.L - Math.max(0, s);
    const bx = NX[e.b * 2];
    const bz = NX[e.b * 2 + 1];
    const x0 = w.x[i];
    const z0 = w.z[i];
    let gx: number;
    let gz: number;
    let onNext = false;
    if (nxWalk && narrow[nx] && !narrow[h] && toEnd < 1.2 && opposed(nx)) {
      // 좁은 길 건너편에서 사람이 오고 있으면 길 어귀에서 비켜 기다린다(좁은 길에서 마주쳐 막히지 않게). 오래 기다리면 다른 길로
      w.moving[i] = 0;
      waitT[i] += dt;
      if (waitT[i] > 12) (waitT[i] = 0), (avoidHe[i] = nx), (avoidT[i] = clockS + 30), (nk[i] = plan(i, h, clockS)), (viaNode[i] = 0);
      return;
    }
    if (nxWalk && nx !== e.rev && toEnd < CUT) {
      const n2 = hes[nx];
      const d2 = Math.min(n2.L, Math.max(0.5, LOOK - toEnd));
      [gx, gz] = toArea(nx, ...onHe(nx, d2, sideU(i, nx, d2)));
      // 한 번 노드로 가기로 했으면 노드에 닿을 때까지 노드로 간다(번갈아 바꾸며 비비지 않게)
      if (viaNode[i] === 2 || !pathOk(i, x0, z0, gx, gz)) {
        viaNode[i] = 2;
        [gx, gz] = [bx, bz];
      } else onNext = true;
    } else if (toEnd > LOOK) {
      const s2 = Math.max(0, s) + LOOK;
      [gx, gz] = toArea(h, ...onHe(h, s2, sideU(i, h, s2)));
      if (!pathOk(i, x0, z0, gx, gz)) [gx, gz] = onHe(h, s2, 0);
    } else [gx, gz] = [bx, bz]; // 횡단보도 앞, 되돌아설 때(막다른 길), 다음 선을 아직 안 정했을 때: 선 끝 노드까지
    // 막히면 선 가운데 쪽으로(선은 늘 걷는 길 안이다)
    const [fx, fz] = toEnd > 0.5 ? onHe(h, Math.max(0, s) + 0.5, 0) : [bx, bz];
    tx[i] = gx;
    tz[i] = gz;
    const moved = walkTo(i, gx, gz, spd[i], dt, fx, fz);
    // 0.5초 넘게 막힌 사람은 앞으로 나아가지 못하는 걸음(옆·뒤로 비비기)을 하지 않고 선다(W28: 막힌 채 옆으로 비비며 제자리를 오갔다)
    if (stuckT[i] > 0.5 && moved <= 0.1 * spd[i] * dt && (w.x[i] !== x0 || w.z[i] !== z0)) {
      w.phase[i] -= Math.hypot(w.x[i] - x0, w.z[i] - z0) * 4.6;
      w.x[i] = x0;
      w.z[i] = z0;
      vX[i] = 0;
      vZ[i] = 0;
    }
    if (moved > 0.1 * spd[i] * dt) stuckT[i] = Math.max(0, stuckT[i] - 2 * dt);
    else {
      // 막힌 까닭이 같은 쪽으로 걸어가는 앞사람이면 줄을 선 것이다(돌아서지 않는다). 마주 오는 사람이나 서 버린 앞사람에게 막혔을 때 센다
      const j = aheadJ;
      const hx = Math.cos(head[i]);
      const hz = Math.sin(head[i]);
      // 마주 선 두 사람 가운데 번호가 작은 쪽만 돌아선다(둘 다 돌아서며 오가지 않게)
      const facing = j >= 0 && mode[j] === WALK && Math.cos(head[j]) * hx + Math.sin(head[j]) * hz < -0.3 && w.id[i] < w.id[j];
      // W36: 같은 쪽을 보고 선 앞사람이 게이트 앞에서 기다리거나 그 뒤에 줄 선 사람이면 이 사람도 줄을 선 것이다(세면 20초 뒤 돌아서 온 길로 갔다)
      queued[i] = !shoved && j >= 0 && !facing && (gateT[j] > 0 || queued[j]) ? 1 : 0;
      if (queued[i]) stuckT[i] = 0;
      else if (j < 0 || facing) stuckT[i] += dt;
      else if (!w.moving[j]) stuckT[i] += dt;
      else stuckT[i] = 0;
      // 줄 선 사람은 옆으로 비비지 않고 제자리에 선다(W39: 앞으로 못 나아간 채 옆으로 미끄러졌다)
      if (queued[i] && (w.x[i] !== x0 || w.z[i] !== z0)) {
        w.phase[i] -= Math.hypot(w.x[i] - x0, w.z[i] - z0) * 4.6;
        w.x[i] = x0;
        w.z[i] = z0;
        vX[i] = 0;
        vZ[i] = 0;
      }
    }
    w.moving[i] = w.x[i] !== x0 || w.z[i] !== z0 ? 1 : 0;
    // 다음 선으로 갈아타기(자리는 그대로): 그물은 길 찾기에만 쓰므로 노드 둘레(SWITCH_R 또는 노드 원)에 들거나 다음 선 위 자리를 겨누며 지금 선 끝 가까이 오면 갈아탄다.
    // 되돌아가기·횡단보도는 노드 둘레에 들어야 한다
    if (nx >= 0) {
      const [s2] = proj(h, w.x[i], w.z[i]);
      const dB = Math.hypot(w.x[i] - bx, w.z[i] - bz);
      // 노드가 걷는 면 밖(칠한 작은 길 위)이면 옆 면에서 노드 옆을 지나면 닿은 것이다
      const atB = dB < SWITCH_R || inNode(e.b, w.x[i], w.z[i]) || (!!area && !area.at(bx, bz) && e.L - s2 < 0.3 && dB < 5);
      const turn = nx === e.rev;
      // 횡단보도 앞은 노드 XW_R 안이면 기다리는 자리로 간다(W28: 기다리는 사람이 둘러싼 노드에 닿으려고 둘레를 돌았다. 자리가 없으면 그 자리에서 기다린다)
      // W50: 다음 선 위 겨눈 자리(옆자리 몫만큼 비킨 자리)에 닿았으면 지금 선 끝까지 1m 넘게 남아도 갈아탄다(짧은 다음 선 옆 2m 자리가 지금 선 위로는
      // 끝 1.02m 앞이라 닿은 채 60초 서 있었다)
      if (turn ? atB || e.L - s2 < 0.3 : nxWalk ? atB || (onNext && (e.L - s2 < 1 || Math.hypot(gx - w.x[i], gz - w.z[i]) < 0.3)) || e.L - s2 < 0 : atB || dB < XW_R) {
        remember(i, e.b);
        if (turn) markTurn(i);
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
        waitT[i] = 0;
        h = nx;
      }
    }
    // 아주 오래(REV_T) 막혀 있으면 돌아선다. 마지막으로 돌아선 자리에서 TURN_GAP 안이면 돌아서지 않고 기다린다(W26: 붐비는 곳에서 3초마다 앞뒤로 돌아서며 오갔다.
    // W28: 걷는 면에서는 옆으로 비켜 지나갈 수 있어 3초 만에 돌아서던 것이 맴돌기의 큰 몫이었다. 막히면 서서 기다리고, 20초 넘게 막힐 때만 돌아선다)
    // 집(문·출구)이 10m 안인 사람도 돌아서지 않고 기다린다(문 앞에서 서로 비켜 주다 오가지 않게).
    // W36: 갈래 영역 게이트를 넣은 뒤에도 지우면 선 위에서 막힌 사람(벽·마주 선 사람)이 풀리지 않아 10초 흐름이 64.7 → 57.8% 로 떨어졌다(선 구간 걷기는 S3 몫)
    if (stuckT[i] > REV_T && !canTurn(i)) stuckT[i] = 0;
    if (stuckT[i] > REV_T && !(goal[i] >= 0 && D[goal[i]][hes[he[i]].b] < 10)) {
      // 마주 오는 사람과 막혀 오래 서 있으면 돌아서고, 그 선은 AVOID_T 초 동안 되도록 고르지 않는다
      stuckT[i] = 0;
      markTurn(i);
      avoidHe[i] = he[i];
      avoidT[i] = clockS + AVOID_T;
      prv[i] = he[i];
      he[i] = hes[he[i]].rev;
      viaNode[i] = 0;
      nk[i] = -1;
    }
    // 머무는 명소: 노드를 지날 때 가끔 멈춰 둘러본다
    if (goal[i] < 0 && nodeMask[e.b] & STAY && e.L - s < 0.3 && prand(i) < 0.02 * nodePull[e.b]) {
      holdT[i] = 5 + prand(i) * 25;
      snap[i] = 0;
      const a = prand(i) * Math.PI * 2;
      faceX[i] = w.x[i] + Math.cos(a);
      faceZ[i] = w.z[i] + Math.sin(a);
    }
    void tod;
  }
  /** 돌아다니던 사람에게 집으로 갈 곳(0 문·출구, 1 정류장)을 준다.
   *  W41: 갈 곳이 지금 선 뒤쪽이면(온 쪽 노드를 거치는 길이 더 짧으면) 그 자리에서 돌아선다. 길 고르기(plan)는 온 길을 빼고 골라,
   *  돌아서지 않으면 갈래 없는 선 사슬을 따라 계속 멀어졌다(W40: 747 (209, −371) 29.4m → 52.8m). 선 위에서 돌아설 수 없으면(갈래 영역 안·건너는 길)
   *  다음 노드에서 온 길도 고르게 한다 */
  function seek(i: number, g: number) {
    goal[i] = g;
    viaNode[i] = 0;
    const h = he[i];
    const e = hes[h];
    // W50: 갈래 영역 안이면 갈 곳에 맞춰 나갈 선을 다시 고르고, 영역 앞이면 고른 나갈 선을 지운다(돌아다닐 때 고른 나갈 선으로 그대로 나가 갈 곳에서 멀어졌다:
    // 클럽거리 씨앗 16 82582 는 갈 곳이 영역 노드에서 2.3m 인데 6m 떨어진 나갈 선으로 나가 남은 길이 15.7m 가 됐다)
    if (jr[i] >= 0) {
      fresh[i] = 1;
      pickExit(i, h);
      nk[i] = jx[i];
      return;
    }
    nk[i] = -1;
    jx[i] = -1;
    if (jr[i] < 0 && e.x < 0 && mode[i] === WALK) {
      const s = Math.max(0, Math.min(e.L, proj(h, w.x[i], w.z[i])[0]));
      if (s + D[g][e.a] < e.L - s + D[g][e.b] - 1) {
        prv[i] = h;
        he[i] = e.rev;
        fresh[i] = 0;
        return;
      }
    }
    fresh[i] = 1;
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
    // 건너편 노드 원·기다리는 자리·승강장 네모 안에 들면 다 건넌 것이다(W28: 붐비는 승강장 끝 한 점에 닿으려다 횡단보도 위를 맴돌았다)
    if (Math.hypot(gx - w.x[i], gz - w.z[i]) < 0.3 || (L - ((w.x[i] - ax) * ux + (w.z[i] - az) * uz) < 0.3 && !last) || (last && inNode(hes[h].b, w.x[i], w.z[i]))) {
      if (last) {
        // 건너편 노드에서 다시 걷는다
        mode[i] = WALK;
        prv[i] = h;
        const n = hes[h].b;
        remember(i, n);
        const opts = out[n].filter((q) => hes[q].x < 0);
        // 돌아다니는 사람도 향하는 먼 자리로 고른다(W28: 아무 선이나 고르면 건너온 쪽으로 돌아가 작은 고리를 돌았다)
        const pickH = opts.length ? plan(i, h, clockS) : hes[h].rev;
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
  // W46: 문·출구·정류장마다 자리로 정한 열쇠(종류·자리 cm, 같은 자리가 겹치면 몇 번째인지). 문 번호(docks 차례)로 매기면 그물 한쪽에서 문이 빠질 때
  // 뒤 문 번호가 모두 밀렸다. dockSpawns 는 그 자리에서 나온 사람 수(고유 번호를 정한다)
  const dockKey = new Uint32Array(docks.length);
  const dockSpawns = new Uint32Array(docks.length);
  {
    const seen = new Map<number, number>();
    docks.forEach((d, k) => {
      const base = mix3(d.kind === 'door' ? 1 : d.kind === 'exit' ? 2 : 3, Math.round(d.x * 100), Math.round(d.z * 100));
      const dup = seen.get(base) ?? 0;
      seen.set(base, dup + 1);
      dockKey[k] = mix3(base, dup, 0x3c6ef372);
    });
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
    // 갈래 영역 게이트 앞에서 기다리거나 그 뒤에 줄 선 사람은 붐빔으로 세지 않는다(W36: 세면 줄 끝에 온 사람이 앞길이 붐빈다고 돌아서 갈래 길을 지나가지 못했다)
    for (let i = 0; i < w.n; i++) if (mode[i] === WALK && !(gateT[i] > 0) && !queued[i]) occ[he[i]]++;
    J.inside.fill(0);
    for (let i = 0; i < w.n; i++) if (jr[i] >= 0 && !dead[i]) J.inside[jr[i]]++;
    gridHead.fill(-1);
    if (nMoved) moveHead.fill(-1);
    nMoved = 0;
    for (let i = 0; i < w.n; i++) {
      const key = cellKey(Math.floor(w.x[i] / GC), Math.floor(w.z[i] / GC));
      gridNext[i] = gridHead[key];
      gridHead[key] = i;
      cellOf[i] = key;
    }
  }
  function populate(dt: number, now: Now) {
    popNo++;
    let anyOver = false;
    overI.fill(0);
    overO.fill(0);
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
        // W46: 어느 문에서 낼지는 문마다 따로 뽑는다(문 열쇠·단계·시도 차례로 정한 지수 난수 / 몫 가운데 가장 작은 문, 몫에 비례해 뽑는 것과 같다).
        // 한 줄 위 몫을 이어 붙여 공유 난수 하나로 뽑으면, 한 문의 몫이 바뀌거나(붐빔) 문 하나가 빠질 때 같은 구역 다른 문이 모두 다른 사람을 냈다
        let best = -1;
        let bs = Infinity;
        for (let q = 0; q < docksIn[z].length; q++) {
          const k = docksIn[z][q];
          if (!(dockInF[k] === (inside ? 1 : 0) || !focus)) continue;
          const wq = dockWNow[z][q] * Math.max(0, 1 - dens(docks[k].he) / DENSE_MAX);
          if (!(wq > 0)) continue;
          const sc = -Math.log(1 - hash01(mix3(dockKey[k], popNo, tries * 8 + z) ^ seedMix)) / wq;
          if (sc < bs) (bs = sc), (best = k);
        }
        if (best < 0) break;
        const i = spawnAt(best);
        if (i < 0) continue;
        (inside ? haveIn : haveOut)[z]++;
        budget[z]--;
      }
      // 넘치면 몇 명을 일찍 집으로 보낸다(가장 가까운 출구·문으로 걸어 들어간다)
      overI[z] = haveIn[z] - wantIn[z] * 1.1 - 3 > 0 ? 1 : 0;
      overO[z] = haveOut[z] - wantOut[z] * 1.1 - 3 > 0 ? 1 : 0;
      anyOver ||= overI[z] + overO[z] > 0;
    }
    // W46: 넘치는 칸에서는 한 단계에 사람마다 4/n 의 몫으로(옛 방식: 배열 자리 4곳을 공유 난수로 뽑기와 같은 몫) 그 사람 번호·단계로 정한 난수가 몫 안이면 집으로 보낸다.
    // 배열 자리로 뽑으면 판 어디서든 사람이 빠지고 들어올 때 자리 차례가 바뀌어 다른 사람이 뽑혔다
    if (anyOver) {
      const pk = 4 / w.n;
      for (let i = 0; i < w.n; i++) {
        const z = home[i];
        if (mode[i] !== WALK || goal[i] >= 0 || !(inFocus(w.x[i], w.z[i]) ? overI[z] : overO[z])) continue;
        if (hash01(mix3(w.id[i], popNo, 0x7f4a7c15) ^ seedMix) < pk) life[i] = 0;
      }
    }
  }
  const overI = new Uint8Array(PLACE_Z + 1);
  const overO = new Uint8Array(PLACE_Z + 1);
  const seedMix = Math.imul(seed | 0, 0x27d4eb2d);
  /** 문·출구에서 내보낸 단계 수(W46: 문 고르기 난수의 열쇠) */
  let popNo = 0;

  // ── 한 단계 ──
  function step(dt: number, now: Now, ambient = true, coarse = SUB) {
    if (o.busy) {
      for (const k of marked) o.busy[k] = 0;
      marked.length = 0;
    }
    carGrid();
    settle();
    // 미리 돌릴 때(coarse > SUB)는 dt 를 나누지 않고, 사람마다 coarse 초에 한 번 밀린 만큼 움직인다(차례는 고유 번호로 나눈다)
    const warmC = coarse > SUB;
    const n = warmC ? 1 : Math.max(1, Math.ceil(dt / SUB - 1e-6));
    const sd = dt / n;
    // 성기게 움직일 사람은 K 단계에 한 번(K × sd ≤ SUB), 고유 번호로 차례를 나눠 같은 프레임에 몰리지 않게 한다
    const K = warmC ? Math.max(1, Math.round(coarse / sd)) : Math.max(1, Math.min(8, Math.floor(SUB / sd + 1e-6)));
    for (let q = 0; q < n; q++) {
      clockS += sd;
      stepNo++;
      rebuildGrid();
      for (let i = w.n - 1; i >= 0; i--) {
        if (dead[i]) continue;
        let td = sd;
        if (detail || warmC) {
          // 자세히 볼 사람은 매 단계, 나머지는 제 차례(K 단계에 한 번)나 밀린 시간이 SUB(미리 돌릴 때는 coarse)에 닿을 때 밀린 만큼 한 번에
          lag[i] += sd;
          if (lag[i] < (warmC ? coarse : SUB) - 1e-6 && (stepNo + w.id[i]) % K !== 0 && (warmC || !detail!(w.x[i], w.z[i]))) continue;
          td = lag[i];
          lag[i] = 0;
        }
        const x0 = w.x[i];
        const z0 = w.z[i];
        tick(i, td, now);
        if (!dead[i] && (w.x[i] !== x0 || w.z[i] !== z0)) {
          const key = cellKey(Math.floor(w.x[i] / GC), Math.floor(w.z[i] / GC));
          if (key !== cellOf[i]) (moveNext[i] = moveHead[key]), (moveHead[key] = i), (cellOf[i] = key), nMoved++;
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
    // 줄 선 표시는 이 단계 걸음이 정한다(게이트 앞 줄 뒤에서 서 있을 때만 1). W39: 일반 걷기는 막혔을 때만 정하고 다시 걸을 때 지우지 않아 걷는 사람에게 남았다
    queued[i] = 0;
    if (m === LEAVE) {
      w.fade[i] -= dt * 1.6;
      w.moving[i] = 0;
      if (w.fade[i] <= 0) remove(i);
      return;
    }
    w.fade[i] = Math.min(1, w.fade[i] + dt * 2.2);
    shoved = escapeCar(i, dt);
    if (m === OUTDOOR || m === INDOOR || m === BOARD || (m === QUEUE && Math.hypot(tx[i] - w.x[i], tz[i] - w.z[i]) > 0.05)) {
      // 문으로 들어갈 때는 걷는 선 위 문 자리(dockPos)까지 먼저 걷고 거기서 문턱으로 간다(문턱으로 곧게 가면 띠 밖이라 띠를 따라 미끄러지며 오간다)
      // 걷는 면 위에서 문턱까지 곧게 갈 수 있으면 바로 문턱으로(W28)
      if (m === INDOOR && docks[dockOf[i]].door && !xLeg[i] && pathOk(i, w.x[i], w.z[i], tx[i], tz[i])) xLeg[i] = 1;
      const viaDock = m === INDOOR && docks[dockOf[i]].door && !xLeg[i];
      const [px, pz] = m === OUTDOOR || viaDock ? dockPos(dockOf[i]) : [tx[i], tz[i]];
      const mv = walkTo(i, px, pz, Math.max(1.1, spd[i]), dt);
      w.moving[i] = mv > 0 ? 1 : 0;
      const left = Math.hypot(px - w.x[i], pz - w.z[i]);
      // 나오는 사람은 걷는 띠에 들면 걷기 시작한다(W26: 띠 가운데 문 자리 한 점까지 가려다 막히면 문 둘레를 맴돌았다)
      if (m === OUTDOOR && (left < 0.15 || inHe(he[i], w.x[i], w.z[i]) || area?.at(w.x[i], w.z[i]))) {
        mode[i] = WALK;
        const h = he[i];
        const d = docks[dockOf[i]];
        // 선 위 문 자리에서 나온다(방향 있는 선이 반대면 그대로 둔다)
        void d;
        void h;
      } else if (viaDock && segDist(w.x[i], w.z[i], docks[dockOf[i]].door![0], docks[dockOf[i]].door![1], px, pz) < 0.3) xLeg[i] = 1;
      // 문턱·출구 자리 DOOR_R 안이면 들어간다(문은 폭이 있다)
      else if (m === INDOOR && !viaDock && left < DOOR_R) mode[i] = LEAVE;
      // 문턱 길에서 밀려 벗어났으면 문 자리부터 다시(띠 안에서 문턱으로 곧게 가면 띠 가장자리를 따라 미끄러지며 맴돈다)
      else if (m === INDOOR && xLeg[i] && docks[dockOf[i]].door && segDist(w.x[i], w.z[i], tx[i], tz[i], ...dockPos(dockOf[i])) > 0.4 && !pathOk(i, w.x[i], w.z[i], tx[i], tz[i])) xLeg[i] = 0;
      else if (m === BOARD && left < DOOR_R) mode[i] = LEAVE;
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
      // SEEK 초 안에 못 만나면 가장 가까운 문·출구로 간다.
      // W41: 열에 하나는 씨앗과 사람 번호로 정한다(공유 난수로 뽑으면 차 흐름이 바뀌어 사람 쪽 난수 쓰는 차례가 바뀔 때 판 전체에서 누가 정류장으로 가는지가 섞였다)
      if ((was > 0 && life[i] <= 0 && hash01(Math.imul(seed | 0, 0x27d4eb2d) ^ w.id[i]) < 0.1 && Number.isFinite(D[1][hes[he[i]].b])) || life[i] < -SEEK) seek(i, was > 0 && life[i] <= 0 ? 1 : 0);
    }
    walkStep(i, dt, now.tod);
  }
  /** 이 단계에 차 몸통에서 비켜났다(W41: 비켜난 사람은 줄에 서 있는 것이 아니다. 걸음이 줄 선 표시를 정한 뒤 자리를 비켜난 자리로 되돌려 표시가 남았다) */
  let shoved = false;
  /** 차 몸통이 다가와 몸에 닿으면(둘레 여유 안) 덜 닿는 쪽으로 비켜난다(1초에 2.5m 까지). 비켜났으면 참 */
  function escapeCar(i: number, dt: number): boolean {
    if (!o.cars || !carCount) return false;
    const d0 = carDepth(w.x[i], w.z[i], CAR_PAD + 0.5);
    if (d0 <= 0) return false;
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
      w.x[i] = bx;
      w.z[i] = bz;
    }
    return bd < d0;
  }

  // ── 바깥에서 부르는 것 ──
  const docksOf = (kind: Dock['kind'], key: string) => docks.map((d, k) => (d.kind === kind && d.key === key ? k : -1)).filter((k) => k >= 0);
  const bursts = new Map<string, number>();
  /** 열차가 역에 섰다: 출구에서 count 명이 나온다(출구 자리가 빌 때마다) */
  function burst(station: string, count: number) {
    const ds = docksOf('exit', station);
    if (!ds.length) return;
    // W46: 출구는 역·그 역 열차 차례·사람 차례로 정한 난수로(공유 난수로 뽑으면 판 다른 곳 사람이 난수를 먼저 쓴 만큼 다른 출구로 나왔다)
    const nb = bursts.get(station) ?? 0;
    bursts.set(station, nb + 1);
    const sk = mix3(dockKey[ds[0]], nb, 0x1b873593);
    for (let k = 0; k < count && pending.length < 200; k++) pending.push(ds[Math.floor(hash01(mix3(sk, k, seedMix)) * ds.length)]);
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
          life[i] = 60 + prand(i) * 300;
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
  /** 미리 돌리기: secs 초(WARM_SECS 까지)를 0.5초씩 돌린다(그동안 문·출구에서 빨리 낸다). 시각도 함께 흘린다.
   *  W24: 0.1초 걸음으로 300초를 다 돌면 첫 화면이 16초 늦었다. 끝 WARM_FINE 초 앞까지는 한 사람을 WARM_TICK 초에 한 번 움직인다(걸음이 길 뿐 같은 규칙: 걷는 길·몸 겹침·차 몸통은 걸음마다 본다) */
  function warm(secs: number, at: Now) {
    secs = Math.min(secs, WARM_SECS);
    rush = 6;
    const N = Math.round(secs / 0.5);
    const fine = Math.round(Math.min(secs, WARM_FINE) / 0.5);
    for (let k = 0; k < N; k++) step(0.5, { ...at, tod: (at.tod - secs + k * 0.5 + 86400) % 86400 }, true, k < N - fine ? WARM_TICK : SUB);
    lag.fill(0);
    rush = 1;
  }
  /** 측정·시험용: 사람 i 의 상태 */
  const stateOf = (i: number) => ({ mode: mode[i], he: he[i], goal: goal[i], hold: holdT[i] > 0, gate: gateT[i] > 0 && jr[i] < 0, queued: queued[i] > 0, cross: hes[he[i]]?.x >= 0 ? crosses[hes[he[i]].x] : null });
  /** 측정용: 사람 i 가 따라가는 선과 다음 선 */
  const debugOf = (i: number) => {
    const e = hes[he[i]];
    const [s, u] = proj(he[i], w.x[i], w.z[i]);
    // 남은 길(W41): 지금 선 끝까지 + 선 끝에서 목적지까지. 지금 선 위 앞쪽에 갈 문·정류장이 있으면 그 자리까지(길 고르기도 그렇게 잰다)
    let left = goal[i] >= 0 ? Math.max(0, e.L - s) + D[goal[i]][e.b] : -1;
    if (goal[i] >= 0)
      for (const dk of dockAtHe.get(he[i]) ?? []) {
        const d = docks[dk];
        if ((goal[i] === 1) !== (d.kind === 'stop')) continue;
        const t = d.he === he[i] ? d.t : e.L - d.t;
        if (t > s - 0.6) left = Math.min(left, Math.max(0, t - s));
      }
    return { mode: mode[i], he: he[i], a: e.a, b: e.b, L: e.L, s, u, lo: e.lo, hi: e.hi, nk: nk[i], nkL: nk[i] >= 0 ? hes[nk[i]].L : -1, stuck: stuckT[i], goal: goal[i], D: goal[i] >= 0 ? D[goal[i]][e.b] : -1, left, radB: RAD[e.b], tx: tx[i], tz: tz[i], via: viaNode[i], why, ahead: aheadJ, dens: dens(he[i]), waitT: waitT[i], narrow: narrow[he[i]], nkNarrow: nk[i] >= 0 ? narrow[nk[i]] : -1, j: jr[i] >= 0 || gateT[i] > 0 ? { r: jr[i], jx: jx[i], ex: jx[i] >= 0 ? [hes[jx[i]].a, hes[jx[i]].b] : null, gateT: +gateT[i].toFixed(1), why: gateWhy[i], inside: jr[i] >= 0 ? J.inside[jr[i]] : -1 } : null };
  };
  /** 측정용: 칸마다 보는 곳 안·밖 목표와 지금 인원, 보는 곳 원 */
  const popStats = () => ({ wantIn: Array.from(wantIn), haveIn: Array.from(haveIn), wantOut: Array.from(wantOut), haveOut: Array.from(haveOut), focus, kIn, kOut, n: w.n, pending: pending.length });
  /** 시험용: 사람이 지금 있어도 되는 자리인가 */
  const validAt = (i: number) => valid(i, w.x[i], w.z[i]);
  let puts = 0;
  const putRand = rng(seed);
  /** 시험용(W31 Y 갈림 시험): (x, z)에 걷는 사람 한 명을 놓고 (gx, gz) 쪽으로 걷게 한다(돌아다니는 사람의 먼 자리를 그곳으로 고정, 수명 없음). 고유 번호, 못 놓으면 −1 */
  function put(x: number, z: number, gx: number, gz: number): number {
    const at = attach(x, z);
    const i = w.n;
    if (!at || i >= max || crowded(i, x, z, 2 * BODY_R)) return -1;
    const h0 = hes[at[0]];
    he[i] = h0.ux * (gx - x) + h0.uz * (gz - z) >= 0 ? at[0] : h0.rev;
    mode[i] = WALK;
    dockOf[i] = -1;
    nk[i] = -1;
    prv[i] = -1;
    jr[i] = -1;
    // 걷는 길 밖에는 놓지 않는다(W36: 그 자리에서는 어느 걸음도 걷는 길 안이 아니라 처음부터 끝까지 서 있었다)
    if (!valid(i, x, z)) return -1;
    w.n++;
    w.x[i] = x;
    w.z[i] = z;
    // 시험용으로 놓은 사람은 놓은 차례로 번호를 매기고(같은 단계 안에서 먼저 놓은 사람이 번호가 작다), 옷·빠르기 같은 속성은 놓은 차례대로 씨앗 난수에서 받는다
    // (put 만 쓰는 시험 판은 W46 전과 같은 사람이 된다. 판 돌리기에서는 쓰지 않는다)
    born(i, OUT_Z, newId(0, 0, puts++), putRand);
    w.fade[i] = 1;
    life[i] = Infinity;
    wgX[i] = gx;
    wgZ[i] = gz;
    head[i] = w.yaw[i] = headW[i] = Math.atan2(gz - z, gx - x);
    const key = cellKey(Math.floor(x / GC), Math.floor(z / GC));
    gridNext[i] = gridHead[key];
    gridHead[key] = i;
    cellOf[i] = key;
    return w.id[i];
  }
  /** 시험용(W41): 고유 번호 id 인 돌아다니는 사람에게 수명이 다한 것처럼 갈 곳(0 문·출구, 1 정류장)을 준다 */
  function goHome(id: number, g: number) {
    for (let i = 0; i < w.n; i++) if (w.id[i] === id) return seek(i, g);
  }
  return { w, popStats, debugOf, step, warm, burst, alight, board, waitingAt, hold, docks, dockPoint, dockPos, setRain, zoneCounts, setFocus, setDetail, scale, expected, stateOf, validAt, put, goHome, crosses, rects, MODES: { WALK, WAITX, CROSS, QUEUE, BOARD, LEAVE, OUTDOOR, INDOOR } };
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
