// 노면 표시를 길 정본에서 굽는다(재작업 W49, 설계 문서 59절 B1).
// 차로를 가르는 선(중앙선 1·버스전용 5·차선 6·진로변경제한선 8·중앙버스전용 17)과 정지선(4)을 서울시 칠한 선 모양 대신 정본 차로(road.json → 차 그래프)에서 만든다.
// - 차선: 같은 방향 이웃 두 차로 가운데의 가운데(중앙버스차로와 1차로 사이는 두 가장자리의 가운데). 그 자리 0.75m 안에 나란한 서울시 차선이 있는 곳에만 긋고(12m 안 틈은 잇는다),
//   종류(실선·점선·색)는 그 서울시 선의 종류다. 서울시 선을 못 읽은 방향(찻길 폭을 고르게 나눈 곳)에는 새로 긋지 않는다.
// - 중앙선: 마주 오는 두 방향 맨 왼쪽 차로 왼쪽 가장자리의 가운데 하나(한 방향 조각 둘로 그린 큰길도 7m 안에 마주 오는 조각이 있으면 그 가운데). 1.5m 안 서울시 중앙선이 근거.
// - 정지선: 차가 빨간불에 서는 자리(X.stopAt, 앞 범퍼)에서 0.3m 앞에 차로마다, 같은 진입로 이웃 차로와 0.5m 안이면 한 줄로. 신호 진입로는 모두, 신호 없는 진입로는 서울시 정지선이 그 자리에 있을 때만.
// - 차선·중앙선은 정지선에서 끝나고 횡단보도 면과 교차로 상자 안에는 긋지 않는다. 같은 줄로 이어지는 선은 점선 위상을 이어 간다(ld).
// 차가 달리는 차로 띠(가장자리 1m 여유) 밖의 서울시 선(차가 다니지 않는 골목의 중앙선·정지선)과 차로와 관계없는 표시(가장자리선·빗금·유도선·화살표 등)는 그대로 둔다.
// 그래서 이 함수를 이미 구운 marks.json 에 다시 불러도 결과가 같다. 차는 정지 자리를 board 의 서울시 정지선(stop)으로 정하므로 차 움직임은 바뀌지 않는다.
import type { Board } from '../../src/data/board.ts';
import { laneBands, bandQuad } from '../../src/data/laneGround.ts';
import type { Marks, MarkLine, MarksJson } from '../../src/data/marks.ts';
import { pointAt } from '../../src/poly.ts';
import { headingNear, laneOff, laneWidth, leftEdge, MED, type Edge } from '../../src/sim/graph.ts';
import type { Inter } from '../../src/sim/intersection/index.ts';
import { BOARD_R } from '../../src/geo.ts';
import { tileRings } from '../../src/data/surface.ts';
import { bitsAt, fillBits, makeBits, type Bits } from '../lib/bits.ts';
import { smoothLine } from '../lib/groundclip.ts';
import { fitCells } from '../lib/arrows.ts';
import { decodeMarks } from '../../src/data/marks.ts';

/** 정본에서 만드는 선 종류(서울시 대분류) */
export const LANE_KINDS = new Set([1, 4, 5, 6, 8, 17]);
const DIVIDE = new Set([5, 6, 8, 17]);
const STEP = 0.5;

interface Seg {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  k: number;
  k2: number;
}

/** 선분 격자: 점 둘레 r 안 선분 찾기 */
function segGrid(segs: Seg[], C = 8) {
  const grid = new Map<number, Seg[]>();
  const key = (i: number, j: number) => (i + 2000) * 5000 + j + 2000;
  for (const s of segs)
    for (let i = Math.floor(Math.min(s.ax, s.bx) / C); i <= Math.floor(Math.max(s.ax, s.bx) / C); i++)
      for (let j = Math.floor(Math.min(s.az, s.bz) / C); j <= Math.floor(Math.max(s.az, s.bz) / C); j++) (grid.get(key(i, j)) ?? grid.set(key(i, j), []).get(key(i, j))!).push(s);
  /** 방향 (hx, hz)와 25° 안으로 나란하고 (x, z)에서 tol 안인 가장 가까운 선분 */
  return (x: number, z: number, hx: number, hz: number, tol: number): Seg | null => {
    let best: Seg | null = null;
    let bd = tol;
    const cos = Math.cos((25 * Math.PI) / 180);
    for (let i = Math.floor((x - tol) / C); i <= Math.floor((x + tol) / C); i++)
      for (let j = Math.floor((z - tol) / C); j <= Math.floor((z + tol) / C); j++)
        for (const s of grid.get(key(i, j)) ?? []) {
          const dx = s.bx - s.ax;
          const dz = s.bz - s.az;
          const L = Math.hypot(dx, dz);
          if (L < 1e-6 || Math.abs((dx * hx + dz * hz) / L) < cos) continue;
          const t = Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / (L * L)));
          const d = Math.hypot(s.ax + dx * t - x, s.az + dz * t - z);
          if (d < bd) (bd = d), (best = s);
        }
    return best;
  };
}

/** 고리 격자: 점이 어느 고리 안인가 */
function ringTest(rings: ArrayLike<number>[], C = 20) {
  const grid = new Map<number, number[]>();
  const key = (i: number, j: number) => (i + 1000) * 3000 + j + 1000;
  rings.forEach((r, n) => {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let k = 0; k < r.length; k += 2) (x0 = Math.min(x0, r[k])), (x1 = Math.max(x1, r[k])), (z0 = Math.min(z0, r[k + 1])), (z1 = Math.max(z1, r[k + 1]));
    for (let i = Math.floor(x0 / C); i <= Math.floor(x1 / C); i++) for (let j = Math.floor(z0 / C); j <= Math.floor(z1 / C); j++) (grid.get(key(i, j)) ?? grid.set(key(i, j), []).get(key(i, j))!).push(n);
  });
  return (x: number, z: number) => {
    for (const n of grid.get(key(Math.floor(x / C), Math.floor(z / C))) ?? []) {
      const r = rings[n];
      let c = false;
      for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) if (r[i + 1] > z !== r[j + 1] > z && x < r[i] + ((z - r[i + 1]) / (r[j + 1] - r[i + 1])) * (r[j] - r[i])) c = !c;
      if (c) return true;
    }
    return false;
  };
}

/** 구운 찻길 면(찻길 띠·교차로 면·그리기 전용 면·분리대, 찻길 터널 조각 빼고)을 0.5m 칸으로(test/w48-stage2.ts 검사 ⑤ 와 같은 칸). 표시는 이 면에서 0.3m 안으로 자른다 */
export function bakedGround(board: Board, surface: { faces: { outer: ArrayLike<number>; holes: ArrayLike<number>[] }[]; draw: { outer: ArrayLike<number> }[]; ground?: number[] }, polys: { car: number[][]; med: number[][]; draw: number[][] }, cell = 0.5): Bits {
  const dm = (a: number[]) => Float32Array.from(a, (v) => v / 10);
  const B = makeBits(-BOARD_R, -BOARD_R, BOARD_R, BOARD_R, cell);
  // v2(재작업 W51): 길 정본에서 구운 찻길 면 하나(surface.json g)
  if (surface.ground?.length) {
    for (const t of tileRings(surface.ground)) fillBits(B, t.rings, 1);
    return B;
  }
  for (const c of polys.car) if (!board.roads[c[0]]?.tunnel) fillBits(B, [dm(c.slice(1))], 1);
  for (const f of surface.faces) fillBits(B, [f.outer, ...f.holes], 1);
  for (const f of surface.draw) fillBits(B, [f.outer], 1);
  for (const m of polys.med) fillBits(B, [dm(m)], 1);
  for (const q of polys.draw) fillBits(B, [dm(q)], 1);
  return B;
}

const near = (B: Bits, x: number, z: number, tol: number) => {
  if (bitsAt(B, x, z) & 1) return true;
  for (let k = 0; k < 8; k++) if (bitsAt(B, x + Math.cos((k * Math.PI) / 4) * tol, z + Math.sin((k * Math.PI) / 4) * tol) & 1) return true;
  return false;
};

/** 한 줄의 표본: 자리, 진행 방향, 그 자리 종류(서울시 대분류·중분류, 없으면 0) */
interface Sample {
  x: number;
  z: number;
  hx: number;
  hz: number;
  /** 그어도 되는 자리인가(땅 위, 횡단보도·상자 밖, 정지선 앞) */
  ok: boolean;
  /** 근거가 된 서울시 선 종류 × 10 + 중분류(0 = 근거 없음) */
  code: number;
}

/** 표본 줄 → 그을 조각들(같은 종류가 이어지는 꺾은선). 근거 사이 gap m 안 틈은 앞 종류로 메우고, 늘여 그을 수 있는 자리 끝까지 ends m 안이면 늘인다 */
function runs(S: Sample[], gap: number, ends: number): { code: number; p: number[] }[] {
  const n = S.length;
  const code = S.map((q) => (q.ok ? q.code : 0));
  // 그어도 되는 자리가 이어지는 토막마다
  for (let i = 0; i < n; ) {
    if (!S[i].ok) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < n && S[j + 1].ok) j++;
    const ev: number[] = [];
    for (let k = i; k <= j; k++) if (S[k].code) ev.push(k);
    if (ev.length) {
      for (let m = 0; m + 1 < ev.length; m++) if ((ev[m + 1] - ev[m]) * STEP <= gap) for (let k = ev[m] + 1; k < ev[m + 1]; k++) code[k] = code[ev[m]];
      if ((ev[0] - i) * STEP <= ends) for (let k = i; k < ev[0]; k++) code[k] = code[ev[0]];
      if ((j - ev[ev.length - 1]) * STEP <= ends) for (let k = ev[ev.length - 1] + 1; k <= j; k++) code[k] = code[ev[ev.length - 1]];
    }
    i = j + 1;
  }
  // 3m 보다 짧은 종류 토막은 앞(없으면 뒤) 종류로
  const MINRUN = Math.round(3 / STEP);
  for (let i = 0; i < n; ) {
    if (!code[i]) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < n && code[j + 1] === code[i]) j++;
    if (j - i + 1 < MINRUN) {
      const prev = i > 0 ? code[i - 1] : 0;
      const next = j + 1 < n ? code[j + 1] : 0;
      const to = prev || next;
      if (to) for (let k = i; k <= j; k++) code[k] = to;
    }
    i = j + 1;
  }
  const out: { code: number; p: number[] }[] = [];
  for (let i = 0; i < n; ) {
    if (!code[i]) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < n && code[j + 1] === code[i]) j++;
    // 다음 토막이 바로 이어지면(종류만 바뀜) 끝점을 함께 써서 틈이 없게 한다
    const end = j + 1 < n && code[j + 1] ? j + 1 : j;
    if ((end - i) * STEP >= 1.5) {
      const p: number[] = [];
      for (let k = i; k <= end; k++) p.push(S[k].x, S[k].z);
      out.push({ code: code[i], p });
    }
    i = j + 1;
  }
  return out;
}

/** 꺾은선 [x, z, ...]을 tol 안에서 줄인다(더글러스-포이커) */
function simplify(p: number[], tol: number): number[] {
  const n = p.length / 2;
  if (n < 3) return p;
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const stack = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, az, bx, bz] = [p[a * 2], p[a * 2 + 1], p[b * 2], p[b * 2 + 1]];
    const L = Math.hypot(bx - ax, bz - az) || 1e-9;
    let worst = -1;
    let wi = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((bx - ax) * (p[i * 2 + 1] - az) - (bz - az) * (p[i * 2] - ax)) / L;
      if (d > worst) (worst = d), (wi = i);
    }
    if (worst > tol) {
      keep[wi] = 1;
      stack.push([a, wi], [wi, b]);
    }
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(p[i * 2], p[i * 2 + 1]);
  return out;
}

const lenOf = (p: number[]) => {
  let L = 0;
  for (let k = 2; k < p.length; k += 2) L += Math.hypot(p[k] - p[k - 2], p[k + 1] - p[k - 1]);
  return L;
};

export interface LaneMarksInput {
  board: Board;
  g: Edge[];
  inter: Inter;
  /** 서울시 땅 위 선(자르기 전, tools/raw/seoul-lines-ground.json): 선 종류의 근거 */
  seoul: MarkLine[];
  /** 지금 노면 표시(서울시 선을 자른 것 또는 이 함수가 만든 것) */
  marks: MarksJson;
  /** 구운 찻길 면(bakedGround, 0.5m 칸) */
  ground: Bits;
  /** 같은 면의 0.25m 칸(test/w14-board.test.ts 와 같은 칸): 선 꼭짓점이 이 면에서도 0.6m 안이게 한다 */
  ground25: Bits;
  /** 화살표 자리(없으면 marks 의 화살표). 정본 차로가 칠한 자리에서 비켜난 곳에 새로 긋는 선은 화살표를 지나지 않게 한다(재작업 W55) */
  arrows?: Marks['arrows'];
}

/** 노면 표시 자료에서 차로를 가르는 선·정지선을 정본에서 다시 만든 marks.json 과 기록 */
export function laneMarks(inp: LaneMarksInput): { json: MarksJson; log: string; stops: number } {
  const { board, g, inter, seoul, marks, ground, ground25 } = inp;
  // 화살표 자리: 정본 차로가 칠한 자리에서 비켜난 곳에 긋는 선(먼 근거 차선·서울시 선 그대로)은 화살표 옆 1m·앞뒤 3m 안을 지나지 않는다
  const arrowGrid = new Map<number, Marks['arrows']>();
  for (const a of inp.arrows ?? decodeMarks(marks).arrows) {
    const k = (Math.floor(a.x / 8) + 1000) * 3000 + Math.floor(a.z / 8) + 1000;
    (arrowGrid.get(k) ?? arrowGrid.set(k, []).get(k)!).push(a);
  }
  const onArrow = (x: number, z: number) => {
    for (let i = Math.floor((x - 4) / 8); i <= Math.floor((x + 4) / 8); i++)
      for (let j = Math.floor((z - 4) / 8); j <= Math.floor((z + 4) / 8); j++)
        for (const a of arrowGrid.get((i + 1000) * 3000 + j + 1000) ?? []) {
          const [dx, dz] = [x - a.x, z - a.z];
          if (Math.abs(dx * a.fx + dz * a.fz) < 3 && Math.abs(dx * a.fz - dz * a.fx) < 1) return true;
        }
    return false;
  };
  const { X, S } = inter;
  const P = [0, 0, 0];
  const inXw = ringTest(board.crosswalks.flatMap((c) => c.rings));

  // ── 서울시 선: 종류 근거 ──
  const segs = (ks: Set<number>) => {
    const out: Seg[] = [];
    for (const l of seoul) {
      if (!ks.has(l.k)) continue;
      for (let k = 3; k < l.p.length; k += 3) out.push({ ax: l.p[k - 3], az: l.p[k - 1], bx: l.p[k], bz: l.p[k + 2], k: l.k, k2: l.k2 });
    }
    return out;
  };
  const divideAt = segGrid(segs(DIVIDE));
  const centreAt = segGrid(segs(new Set([1])));
  const stopAtSeoul = segGrid(
    (() => {
      const out: Seg[] = [];
      const s = board.stopLines;
      for (let k = 0; k + 3 < s.length; k += 4) out.push({ ax: s[k], az: s[k + 1], bx: s[k + 2], bz: s[k + 3], k: 4, k2: 1 });
      return out;
    })(),
  );

  // ── 차가 달리는 차로 띠(가장자리 1m 여유): 이 안의 서울시 차로 선·정지선은 정본에서 다시 긋는다 ──
  const cover = makeBits(-BOARD_R, -BOARD_R, BOARD_R, BOARD_R, 0.5);
  for (const { sec } of laneBands(g, 1)) for (let k = 0; k + 1 < sec.length / 4; k++) fillBits(cover, [bandQuad(sec, k)], 1);

  /** 구간 e 의 차로 자리 o(옆 거리)에서 s 의 땅 위 점과 그 자리 진행 방향 */
  const at = (e: Edge, s: number, o: number) => {
    pointAt(e.p, e.cum, s, P);
    const h = headingNear(e, s, o);
    return { x: P[0] - Math.sin(h) * o, z: P[2] + Math.cos(h) * o, hx: Math.cos(h), hz: Math.sin(h), y: P[1] };
  };
  const hasMed = (e: Edge) => !!(e.mo.length || e.med);
  /** 왼쪽부터 차로 목록(중앙버스차로가 있으면 맨 앞) */
  const items = (e: Edge) => (hasMed(e) ? [MED, ...Array(e.lanes).keys()] : [...Array(e.lanes).keys()]);
  /** 차로 l 의 왼쪽·오른쪽 가장자리 옆 거리 */
  const leftOf = (e: Edge, l: number, s: number) => (l === MED ? laneOff(e, MED, s) - laneWidth(e, 0, s) / 2 : l === 0 ? leftEdge(e, s) : (laneOff(e, l - 1, s) + laneOff(e, l, s)) / 2);
  const rightOf = (e: Edge, l: number, s: number) => (l === MED ? laneOff(e, MED, s) + laneWidth(e, 0, s) / 2 : l + 1 < e.lanes ? (laneOff(e, l, s) + laneOff(e, l + 1, s)) / 2 : laneOff(e, l, s) + laneWidth(e, l, s) / 2);

  // ── 정지 자리: 구간·차로마다 정지선 가운데의 s(구간 시작에서). 앞 구간에 서면 그 구간에 적는다 ──
  const prev: number[][] = g.map(() => []);
  for (const e of g) for (const k of e.next) prev[k].push(e.id);
  /** 구간마다 차로 l 의 선이 끝나는 자리(정지선 뒤 가장자리, s). 없으면 구간 끝 */
  const capOf = new Map<number, number>();
  const capKey = (e: number, l: number) => e * 8 + (l === MED ? 7 : l);
  const stopRows: { owner: number; cells: { e: Edge; l: number; s: number; y: number }[] }[] = [];
  let seoulBacked = 0;
  for (const e of g) {
    // 신호 진입로(교차로 앞, 길 중간 신호 횡단보도 앞)와 교차로 진입로
    if ((X.jEnd[e.id] < 0 && S.siteOf(e.id) < 0) || e.len < 0.5) continue;
    const signal = S.siteOf(e.id) >= 0;
    const row: { e: Edge; l: number; s: number; y: number }[] = [];
    for (const l of items(e)) {
      const back = X.stopAt(e.id, l);
      let q = e;
      let ql = l;
      let s = e.len - back + 0.3;
      if (s < 0) {
        if (prev[e.id].length !== 1) continue;
        q = g[prev[e.id][0]];
        if (l === MED ? !hasMed(q) : false) continue;
        ql = l === MED ? MED : Math.min(l, q.lanes - 1);
        s = q.len + s;
        if (s < 0) continue;
      }
      const o = l === MED ? laneOff(q, MED, s) : laneOff(q, ql, s);
      const c = at(q, s, o);
      // 신호 없는 진입로는 서울시 정지선이 그 자리에 있을 때만
      if (!signal) {
        if (!stopAtSeoul(c.x, c.z, -c.hz, c.hx, 1.5)) continue;
        seoulBacked++;
      }
      // 이 차로의 선(차선·중앙선)은 정지선 뒤 가장자리에서 끝난다
      const key = capKey(q.id, ql);
      capOf.set(key, Math.min(capOf.get(key) ?? Infinity, s - 0.225));
      row.push({ e: q, l: ql, s, y: c.y });
    }
    if (row.length) stopRows.push({ owner: e.id, cells: row });
  }
  const capAt = (e: Edge, l: number) => capOf.get(capKey(e.id, l)) ?? Infinity;

  /** 구간 e 에서 선을 그어도 되는 s 범위: 교차로 상자 밖 */
  const range = (e: Edge): [number, number] => [X.jStart[e.id] >= 0 ? X.rOut[e.id] : 0, X.jEnd[e.id] >= 0 ? e.len - X.rIn[e.id] : e.len];
  const sList = (e: Edge) => {
    const out: number[] = [];
    for (let s = 0; s < e.len; s += STEP) out.push(s);
    out.push(e.len);
    return out;
  };
  // 차로 가운데선(상자 밖, 땅 위) 0.5m 표본: 선은 차로 사이에 긋고 어느 차로 가운데선 위에도 긋지 않는다(정본 차로가 포개진 곳은 B3 에서 고친다)
  const LC = 4;
  const laneGrid = new Map<number, number[]>();
  const lgKey = (i: number, j: number) => (i + 2000) * 5000 + j + 2000;
  for (const e of g) {
    const [a, b] = range(e);
    for (const l of items(e))
      for (let s = Math.max(0, a); s <= Math.min(e.len, b); s += STEP) {
        const q = at(e, s, laneOff(e, l, s));
        if (Math.abs(q.y) > 0.3) continue;
        const k = lgKey(Math.floor(q.x / LC), Math.floor(q.z / LC));
        (laneGrid.get(k) ?? laneGrid.set(k, []).get(k)!).push(q.x, q.z, q.hx, q.hz);
      }
  }
  /** (x, z) 옆 0.45m 안을 지나는 차로 가운데선이 있는가 */
  const onLane = (x: number, z: number) => {
    for (let i = Math.floor((x - 0.7) / LC); i <= Math.floor((x + 0.7) / LC); i++)
      for (let j = Math.floor((z - 0.7) / LC); j <= Math.floor((z + 0.7) / LC); j++) {
        const c = laneGrid.get(lgKey(i, j));
        if (c)
          for (let k = 0; k < c.length; k += 4) {
            // 방향은 보지 않는다(선 조각 방향이 차로 옆 거리 변화로 제 구간 방향과 다를 수 있다). 차로 표본 사이(0.5m)를 메우게 앞뒤로는 0.5m, 옆으로는 0.45m 안
            const [dx, dz] = [x - c[k], z - c[k + 1]];
            if (Math.abs(dx * c[k + 2] + dz * c[k + 3]) <= 0.5 && Math.abs(dx * c[k + 3] - dz * c[k + 2]) < 0.45) return true;
          }
      }
    return false;
  };
  const okAt = (e: Edge, s: number, x: number, z: number, y: number, cap: number) => {
    const [a, b] = range(e);
    return s >= a - 1e-6 && s <= b + 1e-6 && s <= cap && Math.abs(y) <= 0.3 && !inXw(x, z);
  };

  // 만든 선: 종류 code, 꺾은선(줄이기 전), 이어지는 앞 선을 찾을 끝점
  const made: { code: number; p: number[] }[] = [];

  // ── 차선: 같은 방향 이웃 차로 사이 ──
  let divideLen = 0;
  for (const e of g) {
    const its = items(e);
    for (let b = 0; b + 1 < its.length; b++) {
      const [l0, l1] = [its[b], its[b + 1]];
      const cap = Math.min(capAt(e, l0), capAt(e, l1));
      const list: Sample[] = sList(e).map((s) => {
        const o = (rightOf(e, l0, s) + leftOf(e, l1, s)) / 2;
        const q = at(e, s, o);
        const ok = okAt(e, s, q.x, q.z, q.y, cap) && !onLane(q.x, q.z);
        const close = ok ? divideAt(q.x, q.z, q.hx, q.hz, 0.75) : null;
        let hit = close;
        // 정본 차로가 칠한 자리에서 비켜난 곳(58절 2.6%)은 0.75m 안에 근거 선이 없다: 이웃 차로 반폭 안 서울시 차선이 정본 차로 경계 가운데
        // 이 경계에 가장 가까우면 이 경계가 그 선이다(모양은 정본, 종류는 서울시 선. 재작업 W55). 한 서울시 선은 경계 하나만 맡는다
        if (ok && !close) {
          const far = divideAt(q.x, q.z, q.hx, q.hz, Math.min(laneWidth(e, l0 === MED ? 0 : l0, s), laneWidth(e, l1, s)) / 2);
          if (far) {
            const [dx, dz] = [far.bx - far.ax, far.bz - far.az];
            const t = Math.max(0, Math.min(1, ((q.x - far.ax) * dx + (q.z - far.az) * dz) / (dx * dx + dz * dz || 1)));
            const of = o + (far.ax + dx * t - q.x) * -q.hz + (far.az + dz * t - q.z) * q.hx;
            const others = [leftOf(e, its[0], s), rightOf(e, its[its.length - 1], s)];
            for (let c = 0; c + 1 < its.length; c++) if (c !== b) others.push((rightOf(e, its[c], s) + leftOf(e, its[c + 1], s)) / 2);
            if (others.every((v) => Math.abs(of - v) > Math.abs(of - o))) hit = far;
          }
        }
        // 화살표 옆(1m)·앞뒤(3m)는 0.75m 안 근거가 있을 때만 긋는다(틈 메우기·먼 근거로 화살표를 지나지 않게)
        return { x: q.x, z: q.z, hx: q.hx, hz: q.hz, ok: ok && (!!close || !onArrow(q.x, q.z)), code: hit ? hit.k * 10 + hit.k2 : 0 };
      });
      for (const r of runs(list, 12, 3)) {
        made.push(r);
        divideLen += lenOf(r.p);
      }
    }
  }

  // ── 중앙선: 맨 왼쪽 가장자리 표본을 마주 오는 방향과 짝지어 그 가운데 ──
  interface Edgel {
    e: number;
    i: number;
    x: number;
    z: number;
    hx: number;
    hz: number;
    /** 그 구간에서 선을 그어도 되는 자리인가(아니면 상자 안이지만 땅 위·횡단보도 밖이라 짝으로만 쓴다) */
    ok: boolean;
  }
  const lefts: (Sample & { soft: boolean })[][] = [];
  const C = 4;
  const lgrid = new Map<number, Edgel[]>();
  const lkey = (i: number, j: number) => (i + 2000) * 5000 + j + 2000;
  for (const e of g) {
    const l0 = items(e)[0];
    const cap = capAt(e, l0);
    const list = sList(e).map((s) => {
      const q = at(e, s, leftOf(e, l0, s));
      return { x: q.x, z: q.z, hx: q.hx, hz: q.hz, ok: okAt(e, s, q.x, q.z, q.y, cap), code: 0, soft: Math.abs(q.y) <= 0.3 && !inXw(q.x, q.z) };
    });
    lefts[e.id] = list;
    list.forEach((q, i) => {
      if (!q.soft) return;
      const k = lkey(Math.floor(q.x / C), Math.floor(q.z / C));
      (lgrid.get(k) ?? lgrid.set(k, []).get(k)!).push({ e: e.id, i, x: q.x, z: q.z, hx: q.hx, hz: q.hz, ok: q.ok });
    });
  }
  let centreLen = 0;
  let paired = 0;
  let single = 0;
  for (const e of g) {
    const list: Sample[] = lefts[e.id].map((q) => {
      if (!q.ok) return { ...q, ok: false };
      // 마주 오는(반대 방향) 다른 구간의 왼쪽 가장자리 표본 가운데 옆으로 7m 안, 앞뒤 0.6m 안 가장 가까운 것
      let best: Edgel | null = null;
      let bd = 7;
      for (let i = Math.floor((q.x - 7) / C); i <= Math.floor((q.x + 7) / C); i++)
        for (let j = Math.floor((q.z - 7) / C); j <= Math.floor((q.z + 7) / C); j++)
          for (const o of lgrid.get(lkey(i, j)) ?? []) {
            if (o.e === e.id || o.hx * q.hx + o.hz * q.hz > -0.85) continue;
            const vx = o.x - q.x;
            const vz = o.z - q.z;
            if (Math.abs(vx * q.hx + vz * q.hz) > 0.6) continue;
            const d = Math.abs(vx * q.hz - vz * q.hx);
            if (d < bd) (bd = d), (best = o);
          }
      if (best) {
        // 짝도 그을 수 있는 자리면 번호가 작은 쪽만 긋는다. 짝이 상자 안(나가는 길의 교차로 상자)이면 이쪽이 긋는다: 중앙선은 정지선까지 이어진다
        if (best.e < e.id && best.ok) return { ...q, ok: false };
        const x = (q.x + best.x) / 2;
        const z = (q.z + best.z) / 2;
        // 마주 오는 두 가장자리가 1m 넘게 벌어진 곳(중앙 정류장 둘레·분리된 두 방향 등)은 그 사이 어디에 칠했는지 정본이 모른다:
        // 서울시 중앙선이 그 사이(두 가장자리에서 0.2m 넘게 안쪽)를 지나면 그 선 모양 그대로 긋는다(차로와는 겹치지 않는다, 재작업 W55)
        const half = Math.hypot(best.x - q.x, best.z - q.z) / 2;
        const hit = centreAt(x, z, q.hx, q.hz, half >= 0.5 ? Math.max(1.5, half) : 1.5);
        if (hit && half >= 0.5) {
          const [dx, dz] = [hit.bx - hit.ax, hit.bz - hit.az];
          const t0 = ((x - hit.ax) * dx + (z - hit.az) * dz) / (dx * dx + dz * dz || 1);
          const t = Math.max(0, Math.min(1, t0));
          const [fx, fz] = [hit.ax + dx * t, hit.az + dz * t];
          const d = Math.hypot(fx - x, fz - z);
          // 서울시 선이 이 단면 위(조각 안, 앞뒤 0.3m 안)에서 두 가장자리 사이를 지나면 정본은 긋지 않고 서울시 선 그대로 긋기(laneFallback)에 맡긴다
          if (d <= half - 0.2 && t0 > 0 && t0 < 1 && Math.abs((fx - x) * q.hx + (fz - z) * q.hz) < 0.3) {
            return { x, z, hx: q.hx, hz: q.hz, ok: false, code: 0 };
          }
          if (d > 1.5) return { x, z, hx: q.hx, hz: q.hz, ok: !onLane(x, z), code: 0 };
        }
        if (hit) paired++;
        return { x, z, hx: q.hx, hz: q.hz, ok: !onLane(x, z), code: hit ? hit.k * 10 + hit.k2 : 0 };
      }
      // 마주 오는 방향이 없으면 제 왼쪽 가장자리에 서울시 중앙선이 붙어 있을 때만
      const hit = centreAt(q.x, q.z, q.hx, q.hz, 0.75);
      if (hit) single++;
      return { ...q, ok: !onLane(q.x, q.z), code: hit ? hit.k * 10 + hit.k2 : 0 };
    });
    for (const r of runs(list, 12, 3)) {
      made.push(r);
      centreLen += lenOf(r.p);
    }
  }

  // ── 정지선: 진입로 차로마다, 이웃 차로와 0.5m 안이면 한 줄. 땅 위가 아닌 진입로(둑길·터파기 경사)는 그 높이로 ──
  const stopLines: { owner: number; p: number[]; y: number }[] = [];
  for (const { owner, cells } of stopRows) {
    let cur: number[] = [];
    let ys: number[] = [];
    let lastS = NaN;
    const flush = () => {
      if (cur.length >= 4) stopLines.push({ owner, p: cur, y: ys.reduce((a, v) => a + v, 0) / ys.length });
      cur = [];
      ys = [];
    };
    for (const { e, l, s, y } of cells) {
      const a = at(e, s, leftOf(e, l, s));
      const b = at(e, s, rightOf(e, l, s));
      if (cur.length && Math.abs(s - lastS) <= 0.5 && Math.abs(y - ys[ys.length - 1]) < 0.3 && Math.hypot(cur[cur.length - 2] - a.x, cur[cur.length - 1] - a.z) < 0.5) {
        cur[cur.length - 2] = (cur[cur.length - 2] + a.x) / 2;
        cur[cur.length - 1] = (cur[cur.length - 1] + a.z) / 2;
        cur.push(b.x, b.z);
      } else {
        flush();
        cur = [a.x, a.z, b.x, b.z];
      }
      ys.push(y);
      lastS = s;
    }
    flush();
  }
  // 두 진입로 차로가 포개진 곳(정본 차로가 포개진 자리, B3)에서는 정지선도 포개진다: 다른 정지선에서 1m 안에 다 드는 정지선은 하나만 남긴다
  const distTo = (p: number[], x: number, z: number) => {
    let d = Infinity;
    for (let k = 2; k < p.length; k += 2) {
      const [ax, az, dx, dz] = [p[k - 2], p[k - 1], p[k] - p[k - 2], p[k + 1] - p[k - 1]];
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
      d = Math.min(d, Math.hypot(ax + dx * t - x, az + dz * t - z));
    }
    return d;
  };
  let overlapped = 0;
  for (let i = stopLines.length - 1; i >= 0; i--) {
    const a = stopLines[i];
    const covered = stopLines.some((b, j) => {
      if (j === i || b.owner === a.owner || Math.abs(b.y - a.y) > 0.5 || (lenOf(b.p) < lenOf(a.p) && j > i)) return false;
      for (let k = 0; k < a.p.length; k += 2) if (distTo(b.p, a.p[k], a.p[k + 1]) > 1) return false;
      return true;
    });
    if (covered) {
      stopLines.splice(i, 1);
      overlapped++;
    }
  }
  // 한 진입로의 정지선이 다른 신호 진입로 차로 가운데선(끝 46m)을 가로지르는 자리는 0.3m 씩 비운다: 그 차로의 차는 제 정지선에만 선다
  // (포개진 차로·짧은 상자 안을 지나는 차로. 정본 차로가 포개진 곳은 B3 에서 고친다)
  const apLanes: { owner: number; ax: number; az: number; bx: number; bz: number }[] = [];
  for (const e of g) {
    if (S.siteOf(e.id) < 0 || e.len < 2) continue;
    for (let l = 0; l < e.lanes; l++) {
      let a = at(e, Math.max(0, e.len - 46), laneOff(e, l, Math.max(0, e.len - 46)));
      for (let sv = Math.max(0, e.len - 46) + 0.5; sv <= e.len; sv += 0.5) {
        const b = at(e, sv, laneOff(e, l, sv));
        apLanes.push({ owner: e.id, ax: a.x, az: a.z, bx: b.x, bz: b.z });
        a = b;
      }
    }
  }
  const apGrid = new Map<number, number[]>();
  const AG = 8;
  const agKey = (i: number, j: number) => (i + 1000) * 3000 + j + 1000;
  apLanes.forEach((q, n) => {
    for (let i = Math.floor(Math.min(q.ax, q.bx) / AG); i <= Math.floor(Math.max(q.ax, q.bx) / AG); i++)
      for (let j = Math.floor(Math.min(q.az, q.bz) / AG); j <= Math.floor(Math.max(q.az, q.bz) / AG); j++) (apGrid.get(agKey(i, j)) ?? apGrid.set(agKey(i, j), []).get(agKey(i, j))!).push(n);
  });
  let gaps = 0;
  /** 꺾은선 p 를 다른 진입로 차로 가운데선과 만나는 자리 ±0.3m 를 비운 조각들로 */
  const gapOthers = (owner: number, p: number[]): number[][] => {
    const cuts: number[] = []; // 꺾은선 처음에서 거리
    let along = 0;
    for (let k = 2; k < p.length; k += 2) {
      const [ax, az, bx, bz] = [p[k - 2], p[k - 1], p[k], p[k + 1]];
      const L = Math.hypot(bx - ax, bz - az);
      const seen = new Set<number>();
      for (let i = Math.floor(Math.min(ax, bx) / AG); i <= Math.floor(Math.max(ax, bx) / AG); i++)
        for (let j = Math.floor(Math.min(az, bz) / AG); j <= Math.floor(Math.max(az, bz) / AG); j++)
          for (const n of apGrid.get(agKey(i, j)) ?? []) {
            const q = apLanes[n];
            if (q.owner === owner || seen.has(n)) continue;
            seen.add(n);
            const rx = bx - ax, rz = bz - az, ux = q.bx - q.ax, uz = q.bz - q.az;
            const den = rx * uz - rz * ux;
            if (Math.abs(den) < 1e-9) continue;
            const t = ((q.ax - ax) * uz - (q.az - az) * ux) / den;
            const u = ((q.ax - ax) * rz - (q.az - az) * rx) / den;
            if (t >= 0 && t <= 1 && u >= 0 && u <= 1) cuts.push(along + t * L);
          }
      along += L;
    }
    if (!cuts.length) return [p];
    gaps += cuts.length;
    const total = along;
    const keep: [number, number][] = [];
    let from = 0;
    for (const c of cuts.sort((x, y) => x - y)) {
      if (c - 0.3 > from) keep.push([from, c - 0.3]);
      from = Math.max(from, c + 0.3);
    }
    if (from < total) keep.push([from, total]);
    const pt = (d: number) => {
      let acc = 0;
      for (let k = 2; k < p.length; k += 2) {
        const L = Math.hypot(p[k] - p[k - 2], p[k + 1] - p[k - 1]);
        if (acc + L >= d || k + 2 >= p.length) {
          const t = L ? Math.min(1, Math.max(0, (d - acc) / L)) : 0;
          return [p[k - 2] + (p[k] - p[k - 2]) * t, p[k - 1] + (p[k + 1] - p[k - 1]) * t];
        }
        acc += L;
      }
      return [p[0], p[1]];
    };
    return keep
      .filter(([a, b]) => b - a >= 0.3)
      .map(([a, b]) => {
        const q = [...pt(a)];
        let acc = 0;
        for (let k = 2; k < p.length; k += 2) {
          acc += Math.hypot(p[k] - p[k - 2], p[k + 1] - p[k - 1]);
          if (acc > a && acc < b) q.push(p[k], p[k + 1]);
        }
        q.push(...pt(b));
        return q;
      });
  };

  // ── 이어지는 선의 점선 위상 ──
  // 선은 꼭짓점을 지나는 매끈한 곡선으로(서울시 선과 같은 smoothLine: 한 마디 꺾임 5° 안팎)
  const smooth = (p: number[]) => {
    const pairs: [number, number][] = [];
    for (let k = 0; k < p.length; k += 2) pairs.push([p[k], p[k + 1]]);
    return smoothLine(pairs).flat();
  };
  // 차로 옆 거리 표의 잔 꺾임(2m 단면 사이 보간)이 선에 남지 않게 앞뒤 4m 평균으로 고른 뒤(양 끝 점은 그대로) 줄인다
  const average = (p: number[]) => {
    const n = p.length / 2;
    const out = p.slice();
    const W = 8;
    for (let i = 1; i + 1 < n; i++) {
      const w = Math.min(W, i, n - 1 - i);
      let x = 0;
      let z = 0;
      for (let k = i - w; k <= i + w; k++) (x += p[k * 2]), (z += p[k * 2 + 1]);
      out[i * 2] = x / (2 * w + 1);
      out[i * 2 + 1] = z / (2 * w + 1);
    }
    return out;
  };
  const lines = made.map((m) => ({ code: m.code, p: smooth(simplify(average(m.p), 0.05)), whole: lenOf(m.p), phase: NaN }));
  {
    const E = 1;
    const sgrid = new Map<number, number[]>();
    const skey = (x: number, z: number) => (Math.floor(x / E) + 4000) * 9000 + Math.floor(z / E) + 4000;
    lines.forEach((l, i) => {
      const k = skey(l.p[0], l.p[1]);
      (sgrid.get(k) ?? sgrid.set(k, []).get(k)!).push(i);
    });
    /** 끝점이 선 i 의 시작점 0.4m 안이고 방향이 30° 안으로 이어지는 앞 선 */
    const ends = new Map<number, number>();
    lines.forEach((l, i) => {
      const n = l.p.length;
      const [ex, ez] = [l.p[n - 2], l.p[n - 1]];
      const [ux, uz] = [ex - l.p[n - 4], ez - l.p[n - 3]];
      let best = -1;
      let bd = 0.4;
      for (let a = -1; a <= 1; a++)
        for (let b = -1; b <= 1; b++)
          for (const j of sgrid.get(skey(ex + a * E, ez + b * E)) ?? []) {
            if (j === i || ends.has(j)) continue;
            const q = lines[j].p;
            const d = Math.hypot(q[0] - ex, q[1] - ez);
            const [vx, vz] = [q[2] - q[0], q[3] - q[1]];
            if (d < bd && (ux * vx + uz * vz) / ((Math.hypot(ux, uz) * Math.hypot(vx, vz)) || 1) > Math.cos(Math.PI / 6)) (bd = d), (best = j);
          }
      if (best >= 0) ends.set(best, i);
    });
    const phaseOf = (i: number, depth = 0): number => {
      const l = lines[i];
      if (!Number.isNaN(l.phase)) return l.phase;
      const p = ends.get(i);
      l.phase = 0;
      if (p !== undefined && depth < 5000) l.phase = (phaseOf(p, depth + 1) + lines[p].whole) % 8;
      return l.phase;
    };
    lines.forEach((_, i) => phaseOf(i));
  }

  // ── 구운 찻길 면 안으로 자르기(0.125m 마다 짚어 면 밖에서 끊고 자른 자리의 위상을 이어 간다). 정지선은 실행 중 차로 띠(찻길로 칠한다, 58절) 위도 남긴다 ──
  const band = makeBits(-BOARD_R, -BOARD_R, BOARD_R, BOARD_R, 0.25);
  for (const { sec } of laneBands(g, 0)) for (let k = 0; k + 1 < sec.length / 4; k++) fillBits(band, [bandQuad(sec, k)], 1);
  const out: { code: number; p: number[]; phase: number }[] = [];
  /** dm 로 반올림한 꺾은선을, 마디마다 0.5m 안팎으로 나눈 가운데 점이 모두 면에서 0.3m 안이 될 때까지 그 점 둘레 토막을 뺀다(검사 ⑤ 와 같은 짚기) */
  const settle = (p0: number[], phase0: number): { p: number[]; phase: number }[] => {
    const r = (v: number) => Math.round(v * 10) / 10;
    let pieces = [{ p: p0.map(r), phase: phase0 }];
    for (let it = 0; it < 6; it++) {
      let changed = false;
      const next: typeof pieces = [];
      for (const pc of pieces) {
        const p = pc.p;
        let cur: number[] = [p[0], p[1]];
        let a = 0;
        let start = pc.phase;
        for (let k = 2; k < p.length; k += 2) {
          const [ax, az, bx, bz] = [p[k - 2], p[k - 1], p[k], p[k + 1]];
        // 판정은 읽는 쪽과 같게 32비트 실수로 푼 자리에서(dm 자리는 0.5m 칸 경계에 자주 놓인다)
        const [fx, fz, gx, gz] = [Math.fround(ax), Math.fround(az), Math.fround(bx), Math.fround(bz)];
          const L = Math.hypot(bx - ax, bz - az);
          const n = Math.max(1, Math.round(L / 0.5));
          let from = 0;
          for (let q = 0; q < n; q++) {
            if (near(ground, fx + ((gx - fx) * (q + 0.5)) / n, fz + ((gz - fz) * (q + 0.5)) / n, 0.3)) continue;
            changed = true;
            // 이 짚은 점의 토막 [q/n, (q+1)/n] 을 뺀다
            if (q > from || cur.length > 2) {
              const t = q / n;
              if (q > from) cur.push(r(ax + (bx - ax) * t), r(az + (bz - az) * t));
              if (cur.length >= 4 && lenOf(cur) >= 0.6) next.push({ p: cur, phase: start });
            }
            const t1 = (q + 1) / n;
            cur = [r(ax + (bx - ax) * t1), r(az + (bz - az) * t1)];
            start = pc.phase + a + L * t1;
            from = q + 1;
          }
          if (from < n || cur.length > 2) cur.push(bx, bz);
          else cur = [bx, bz];
          if (from === n) start = pc.phase + a + L;
          a += L;
        }
        if (cur.length >= 4 && lenOf(cur) >= 0.6) next.push({ p: cur, phase: start });
      }
      pieces = next;
      if (!changed) break;
    }
    // 그래도 남은 마디(짚은 점이 면 밖)는 통째로 뺀다
    const done: typeof pieces = [];
    for (const pc of pieces) {
      const p = pc.p;
      let cur = [p[0], p[1]];
      let start = pc.phase;
      let a = 0;
      for (let k = 2; k < p.length; k += 2) {
        const [ax, az, bx, bz] = [p[k - 2], p[k - 1], p[k], p[k + 1]];
        // 판정은 읽는 쪽과 같게 32비트 실수로 푼 자리에서(dm 자리는 0.5m 칸 경계에 자주 놓인다)
        const [fx, fz, gx, gz] = [Math.fround(ax), Math.fround(az), Math.fround(bx), Math.fround(bz)];
        const L = Math.hypot(bx - ax, bz - az);
        const n = Math.max(1, Math.round(L / 0.5));
        let ok = true;
        for (let q = 0; q < n && ok; q++) ok = near(ground, fx + ((gx - fx) * (q + 0.5)) / n, fz + ((gz - fz) * (q + 0.5)) / n, 0.3);
        if (ok) cur.push(bx, bz);
        else {
          if (cur.length >= 4 && lenOf(cur) >= 0.6) done.push({ p: cur, phase: start });
          cur = [bx, bz];
          start = pc.phase + a + L;
        }
        a += L;
      }
      if (cur.length >= 4 && lenOf(cur) >= 0.6) done.push({ p: cur, phase: start });
    }
    return done;
  };
  const clip = (code: number, p: number[], phase: number, onBand = false, notCover = false) => {
    let cur: number[] = [];
    let curPhase = 0;
    let along = 0;
    let lx = 0;
    let lz = 0;
    const flush = () => {
      if (cur.length && (cur[cur.length - 2] !== lx || cur[cur.length - 1] !== lz)) cur.push(lx, lz);
      if (cur.length >= 4 && lenOf(cur) >= 0.6) {
        if (onBand) out.push({ code, p: cur, phase: curPhase % 8 });
        else for (const q of settle(cur, curPhase)) out.push({ code, p: q.p, phase: q.phase % 8 });
      }
      cur = [];
    };
    for (let k = 2; k < p.length; k += 2) {
      const [ax, az, bx, bz] = [p[k - 2], p[k - 1], p[k], p[k + 1]];
      const L = Math.hypot(bx - ax, bz - az);
      const n = Math.max(1, Math.ceil(L / 0.125));
      for (let q = k === 2 ? 0 : 1; q <= n; q++) {
        const x = ax + ((bx - ax) * q) / n;
        const z = az + ((bz - az) * q) / n;
        if (((near(ground, x, z, 0.3) && near(ground25, x, z, 0.45)) || (onBand && bitsAt(band, x, z) & 1)) && !(notCover && bitsAt(cover, x, z) & 1)) {
          if (!cur.length) (curPhase = phase + along + (L * q) / n), cur.push(x, z);
          // 꼭짓점과 끊는 자리만 남긴다
          else if (q === n) cur.push(x, z);
          (lx = x), (lz = z);
        } else flush();
      }
      along += L;
    }
    flush();
  };
  for (const l of lines) clip(l.code, l.p, l.phase);
  const high: number[][] = [];
  let stopsDrawn = 0;
  for (const { owner, p, y } of stopLines) {
    const before = out.length;
    if (Math.abs(y) <= 0.3) for (const q of gapOthers(owner, p)) clip(41, q, 0, true);
    else {
      // 땅 위가 아닌 진입로: 찻길 높이로 고가 선 목록에(자르지 않는다)
      const c: number[] = [];
      for (let k = 0; k < p.length; k += 2) c.push(Math.round(p[k] * 10), Math.round((y + 0.05) * 10), Math.round(p[k + 1] * 10));
      const row = [41, c.length / 3];
      for (let k = 0; k < c.length; k += 3) row.push(...(k ? [c[k] - c[k - 3], c[k + 1] - c[k - 2], c[k + 2] - c[k - 1]] : [c[k], c[k + 1], c[k + 2]]));
      high.push(row);
      stopsDrawn++;
    }
    if (out.length > before) stopsDrawn++;
  }

  // ── 정본에 자리가 없는 칠한 선(재작업 W55, 설계 문서 59.10): 서울시 차로 선 가운데 그은 같은 종류 선이 1m 안에 없는 곳은 서울시 선을 그대로 긋는다 ──
  // 정본 차로가 칠한 자리와 어긋나거나(차로 폭·자리) 차로 수가 칠한 것과 다른 곳, 넓게 벌어진 마주 오는 두 방향 사이다(B3·B4 에서 차로를 고칠 자리, 기록에 남긴다).
  // 다만 차 몸이 지나는 자리(차로 가운데선 1m 안), 고가 차로 옆, 횡단보도 위, 교차로 상자 안·정지선 너머, 화살표 둘레에는 긋지 않고, 옆에 같은 계열 선이 이미 있으면 긋지 않는다(중앙선은 한 줄).
  function laneFallback() {
    const R = 4;
    const key = (i: number, j: number) => (i + 2000) * 5000 + j + 2000;
    // 그은 선(종류마다) 격자
    const drawn = new Map<number, number[]>();
    const addDrawn = (k: number, p: number[]) => {
      for (let q = 2; q < p.length; q += 2) {
        const [ax, az, bx, bz] = [p[q - 2], p[q - 1], p[q], p[q + 1]];
        for (let i = Math.floor(Math.min(ax, bx) / R); i <= Math.floor(Math.max(ax, bx) / R); i++)
          for (let j = Math.floor(Math.min(az, bz) / R); j <= Math.floor(Math.max(az, bz) / R); j++) {
            const kk = key(i, j) * 20 + k;
            (drawn.get(kk) ?? drawn.set(kk, []).get(kk)!).push(ax, az, bx, bz);
          }
      }
    };
    for (const o of [...out, ...keptOut]) addDrawn(Math.floor(o.code / 10), o.p);
    const cos30 = Math.cos(Math.PI / 6);
    /** 종류 ks 의 그은 선이 (x, z)에서 r 안에 있는가. mode: 0 나란한 선 r 안, 1 나란한 선의 옆(선 조각 끝을 넘지 않는 자리) r 안, 2 비스듬한(30° 넘게) 선 r 안 */
    const drawnNear = (ks: number[], x: number, z: number, hx: number, hz: number, r: number, mode = 0) => {
      for (const k of ks)
        for (let i = Math.floor((x - r) / R); i <= Math.floor((x + r) / R); i++)
          for (let j = Math.floor((z - r) / R); j <= Math.floor((z + r) / R); j++) {
            const c = drawn.get(key(i, j) * 20 + k);
            if (c)
              for (let q = 0; q < c.length; q += 4) {
                const [ax, az, dx, dz] = [c[q], c[q + 1], c[q + 2] - c[q], c[q + 3] - c[q + 1]];
                const L = Math.hypot(dx, dz);
                if (L < 1e-6 || (Math.abs((dx * hx + dz * hz) / L) < cos30) !== (mode === 2)) continue;
                const t0 = ((x - ax) * dx + (z - az) * dz) / (L * L);
                if (mode === 1 && (t0 <= 0 || t0 >= 1)) continue;
                const t = Math.max(0, Math.min(1, t0));
                if (Math.hypot(ax + dx * t - x, az + dz * t - z) <= r) return true;
              }
          }
      return false;
    };
    // 차로 가운데선 표본(땅 위, 구간 전체): 선을 그어도 되는 자리(상자 밖·정지선 앞)인가
    const lanes = new Map<number, number[]>();
    for (const e of g) {
      const [a, b] = range(e);
      for (const l of items(e)) {
        const cap = capAt(e, l);
        for (let s = 0; s <= e.len; s += STEP) {
          const q = at(e, s, laneOff(e, l, s));
          const kk = key(Math.floor(q.x / R), Math.floor(q.z / R));
          // 땅 위가 아닌 차로(고가·다리)는 -2: 그 둘레 땅 위 서울시 선은 고가 찻길의 선이다(고가 위 선은 서울시 선 h 가 맡는다)
          (lanes.get(kk) ?? lanes.set(kk, []).get(kk)!).push(q.x, q.z, q.hx, q.hz, Math.abs(q.y) > 0.3 ? -2 : s >= a - 1e-6 && s <= b + 1e-6 && s <= cap ? 1 : 0);
        }
      }
    }
    /** 차 몸이 지나는 자리면 -1, 고가 차로 옆(2.5m 안)이면 -2, 가장 가까운 나란한 땅 위 차로 표본(4m 안)이 상자 안·정지선 너머면 0, 아니면 1 */
    const laneAt = (x: number, z: number, hx: number, hz: number) => {
      let bd = 4;
      let flag = 1;
      let high = false;
      for (let i = Math.floor((x - 4) / R); i <= Math.floor((x + 4) / R); i++)
        for (let j = Math.floor((z - 4) / R); j <= Math.floor((z + 4) / R); j++)
          for (let c = lanes.get(key(i, j)) ?? [], q = 0; q < c.length; q += 5) {
            if (Math.abs(c[q + 2] * hx + c[q + 3] * hz) < cos30) continue;
            const [dx, dz] = [x - c[q], z - c[q + 1]];
            const side = Math.abs(dx * c[q + 3] - dz * c[q + 2]);
            if (c[q + 4] === -2) {
              if (Math.abs(dx * c[q + 2] + dz * c[q + 3]) <= 0.5 && side < 2.5) high = true;
              continue;
            }
            if (Math.abs(dx * c[q + 2] + dz * c[q + 3]) <= 0.5 && side < 1) return -1;
            const d = Math.hypot(dx, dz);
            if (d < bd) (bd = d), (flag = c[q + 4]);
          }
      return high ? -2 : flag;
    };
    let len = 0;
    const spots = new Map<string, number>();
    const made: { code: number; p: number[]; phase: number }[] = [];
    for (const l of seoul) {
      if (!LANE_KINDS.has(l.k) || l.k === 4) continue;
      // 0.5m 표본마다 그을지
      const S: { x: number; z: number; along: number; ok: boolean }[] = [];
      let along = 0;
      for (let q = 3; q < l.p.length; q += 3) {
        const [ax, az, bx, bz] = [l.p[q - 3], l.p[q - 1], l.p[q], l.p[q + 2]];
        const L = Math.hypot(bx - ax, bz - az);
        if (L < 1e-6) continue;
        const [hx, hz] = [(bx - ax) / L, (bz - az) / L];
        const n = Math.max(1, Math.round(L / STEP));
        for (let i = q === 3 ? 0 : 1; i <= n; i++) {
          const [x, z] = [ax + ((bx - ax) * i) / n, az + ((bz - az) * i) / n];
          const ok =
            !drawnNear([l.k], x, z, hx, hz, 1) &&
            !inXw(x, z) &&
            !onArrow(x, z) &&
            // 중앙선은 비스듬한 다른 중앙선 4m 안에도 긋지 않는다(교차로 둘레에서 비스듬히 만나는 옆길 중앙선이 두 줄이 되지 않게)
            !(l.k === 1 && drawnNear([1], x, z, hx, hz, 4, 2)) &&
            laneAt(x, z, hx, hz) === 1 &&
            // 정본 선이 1~1.6m 옆에 나란히 있으면 차로가 칠한 자리에서 비켜난 곳이다(그 선이 이 선을 맡는다). 중앙선은 6m 옆 다른 중앙선. 선 끝에서 이어지는 자리는 막지 않는다
            !drawnNear(l.k === 1 ? [1] : [...DIVIDE], x, z, hx, hz, l.k === 1 ? 6 : 1.6, 1);
          S.push({ x, z, along: along + (L * i) / n, ok });
        }
        along += L;
      }
      // 이어지는 토막: 앞뒤로 한 표본(0.5m)씩 늘여 정본 선 끝과 겹치게 한다(1m 아래 틈이 남지 않게)
      for (let i = 0; i < S.length; ) {
        if (!S[i].ok) {
          i++;
          continue;
        }
        let j = i;
        while (j + 1 < S.length && S[j + 1].ok) j++;
        const [a, b] = [Math.max(0, i - 1), Math.min(S.length - 1, j + 1)];
        if (S[b].along - S[a].along >= 0.9) {
          const p: number[] = [];
          for (let k = a; k <= b; k++) p.push(S[k].x, S[k].z);
          made.push({ code: l.k * 10 + l.k2, p: smooth(simplify(average(p), 0.05)), phase: S[a].along });
          len += S[b].along - S[a].along;
          const c = `k${l.k} ${Math.round(S[i].x)},${Math.round(S[i].z)}`;
          spots.set(c, S[b].along - S[a].along);
          // 중앙선은 한 줄: 그은 것을 다음 선의 판정에 넣는다
          if (l.k === 1) addDrawn(1, p);
        }
        i = j + 1;
      }
    }
    for (const m of made) clip(m.code, m.p, m.phase);
    const top = [...spots].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([c, v]) => `${c} ${Math.round(v)}m`);
    return { len, n: made.length, top };
  }

  // ── 남기는 서울시 선: 차로를 가르는 종류·정지선은 차로 띠 밖(길이 80% 넘게)인 것만, 나머지 종류는 모두 ──
  const enc = (code: number, p: ArrayLike<number>, xz: boolean) => {
    const c: number[] = [];
    for (let k = 0; k < p.length; k += xz ? 2 : 3) c.push(Math.round(p[k] * 10), Math.round(p[k + (xz ? 1 : 2)] * 10));
    const row = [code, c.length / 2];
    for (let k = 0; k < c.length; k += 2) row.push(k ? c[k] - c[k - 2] : c[k], k ? c[k + 1] - c[k - 1] : c[k + 1]);
    return row;
  };
  let kept = 0;
  let dropped = 0;
  const keptOut: { code: number; p: number[]; phase: number }[] = [];
  for (let i = 0; i < marks.l.length; i++) {
    const row = marks.l[i];
    const k = Math.floor(row[0] / 10);
    const pts: number[] = [];
    let x = 0;
    let z = 0;
    for (let q = 0; q < row[1]; q++) pts.push((x += row[2 + q * 2] / 10), (z += row[3 + q * 2] / 10));
    if (LANE_KINDS.has(k)) {
      // 선 길이(0.5m 마다 짚어) 가운데 차로 띠 안인 몫
      let inside = 0;
      let total = 0;
      for (let q = 2; q < pts.length; q += 2) {
        const n = Math.max(1, Math.round(Math.hypot(pts[q] - pts[q - 2], pts[q + 1] - pts[q - 1]) / 0.5));
        for (let t = 0; t < n; t++, total++) if (bitsAt(cover, pts[q - 2] + ((pts[q] - pts[q - 2]) * (t + 0.5)) / n, pts[q - 1] + ((pts[q + 1] - pts[q - 1]) * (t + 0.5)) / n) & 1) inside++;
      }
      if (inside > total * 0.2) {
        dropped++;
        continue;
      }
      // 차가 다니지 않는 길의 서울시 정지선이라도 정본 정지선 1.5m 안이면 버린다(땅 위가 아닌 진입로는 차로 띠가 없다)
      if (k === 4 && stopLines.some((b) => distTo(b.p, pts[0], pts[1]) < 1.5 || distTo(b.p, pts[pts.length - 2], pts[pts.length - 1]) < 1.5)) {
        dropped++;
        continue;
      }
    }
    kept++;
    // 서울시 선도 구운 찻길 면으로 다시 자른다(굽기 15는 조금 다른 면으로 잘랐다)
    const before = out.length;
    // 차로를 가르는 종류는 차로 띠 안 부분을 잘라 낸다(그 자리는 정본 선이 맡는다)
    clip(row[0], pts, (marks.ld?.[i] ?? 0) / 10, false, LANE_KINDS.has(k));
    keptOut.push(...out.splice(before));
  }
  const fb = laneFallback();
  // 고가 위 선: 서울시 정지선 가운데 정본 정지선 3m 안(가운데끼리)이거나 끝·가운데가 정본 정지선 1.5m 안인 것은 버린다(정본 정지선이 그 자리를 맡는다. 다시 굽어도 같게)
  const mids = stopLines.map(({ p }) => [(p[0] + p[p.length - 2]) / 2, (p[1] + p[p.length - 1]) / 2]);
  const h = marks.h.filter((row) => {
    if (Math.floor(row[0] / 10) !== 4) return true;
    const [x0, z0] = [row[2] / 10, row[4] / 10];
    let [x1, z1] = [x0, z0];
    for (let q = 1; q < row[1]; q++) (x1 += row[2 + q * 3] / 10), (z1 += row[4 + q * 3] / 10);
    const [mx, mz] = [(x0 + x1) / 2, (z0 + z1) / 2];
    return !mids.some(([x, z]) => Math.hypot(x - mx, z - mz) < 3) && !stopLines.some((b) => distTo(b.p, x0, z0) < 1.5 || distTo(b.p, x1, z1) < 1.5 || distTo(b.p, mx, mz) < 1.5);
  });
  // dm 로 반올림한 선의 0.5m 보다 짧은 마디(자른 끝·이음 자리)는 반올림 때문에 크게 꺾여 보인다: 그 마디 끝 꼭짓점이 앞뒤 꼭짓점을 잇는 선에서 0.08m 안이면 뺀다(재작업 W55)
  const tidy = <T extends { code: number; p: number[] }>(o: T): T => {
    if ([4, 13, 14].includes(Math.floor(o.code / 10))) return o;
    const p = o.p.map((v) => Math.round(v * 10) / 10);
    for (let i = 1; i + 1 < p.length / 2; ) {
      const [ax, az, bx, bz, cx, cz] = [p[i * 2 - 2], p[i * 2 - 1], p[i * 2], p[i * 2 + 1], p[i * 2 + 2], p[i * 2 + 3]];
      const L = Math.hypot(cx - ax, cz - az);
      const short = Math.min(Math.hypot(bx - ax, bz - az), Math.hypot(cx - bx, cz - bz)) < 0.5;
      if (short && L > 1e-6 && Math.abs((cx - ax) * (bz - az) - (cz - az) * (bx - ax)) / L < 0.08) p.splice(i * 2, 2);
      else i++;
    }
    return { ...o, p };
  };
  const all = [...keptOut, ...out].map(tidy);
  const l = all.map((o) => enc(o.code, o.p, true));
  const ld = all.map((o) => Math.round(o.phase * 10));
  const json: MarksJson = { v: 1, l, h: [...h, ...high], z: marks.z, a: marks.a, ...(marks.aw ? { aw: marks.aw } : {}), ld };
  const km = (v: number) => (v / 1000).toFixed(1);
  const log = `정본 노면 표시: 차선 ${km(divideLen)}km, 중앙선 ${km(centreLen)}km(마주 오는 방향과 짝 ${(paired * STEP / 1000).toFixed(1)}km, 한쪽 ${(single * STEP / 1000).toFixed(1)}km), 정지선 ${stopsDrawn}줄(신호 없는 진입로 서울시 근거 차로 ${seoulBacked}), 자른 뒤 ${out.length}줄; 버린 서울시 차로 선·정지선 ${dropped}줄, 남긴 서울시 선 ${kept}줄, 다른 진입로 차로를 비운 자리 ${gaps}, 포개져 버린 정지선 ${overlapped}; 정본에 자리가 없어 서울시 선 그대로 ${(fb.len / 1000).toFixed(2)}km ${fb.n}줄(${fb.top.join(', ')})`;
  return { json, log, stops: stopsDrawn };
}

/**
 * 화살표를 새로 그은 차선 칸(양옆 칠한 선 사이) 가운데로 옮기고 칸 폭을 다시 붙인다(굽기 16 과 같은 두 번 맞추기). 차 그래프는 화살표 자리로 차로마다 갈 수 있는 쪽을
 * 정하므로, 옮긴 뒤 차로마다 갈 수 있는 쪽(turns)이 하나라도 바뀌는 구간이 있으면 그 둘레 화살표는 옛 자리로 되돌린다(차 움직임을 바꾸지 않는다, B1).
 * build: 화살표로 차 그래프를 만드는 함수. 고친 json 과 옮긴 수·되돌린 수
 */
export function refitArrows(json: MarksJson, build: (arrows: Marks['arrows']) => Edge[]): { json: MarksJson; moved: number; reverted: number } {
  const m = decodeMarks(json);
  const old = m.arrows;
  const fc1 = fitCells(old, m.lines);
  const fc2 = fitCells(fc1.out, m.lines);
  // 두 번째 맞춤이 첫 번째와 0.1m 넘게 다르거나 칸을 못 찾으면 옛 자리·옛 칸 폭 그대로
  const fit = fc1.out.map((q, i) => (q.w > 0 && fc2.out[i].w > 0 && Math.hypot(fc2.out[i].x - q.x, fc2.out[i].z - q.z) <= 0.1 ? q : null));
  const dm = (v: number) => Math.round(v * 10);
  const use = fit.map((q) => q !== null);
  const enc = () => {
    const a: number[] = [];
    const aw: number[] = [];
    old.forEach((o, i) => {
      const q = use[i] ? fit[i]! : null;
      a.push(json.a[i * 4], q ? dm(q.x) : json.a[i * 4 + 1], q ? dm(q.z) : json.a[i * 4 + 2], json.a[i * 4 + 3]);
      // 옛 자리에 둔 화살표는 새 칸 가운데에서 벗어난 만큼 칸 폭을 줄여(모양이 칸 폭에 맞춰 줄어든다, arrowShape) 양옆 선 안에 들게 한다
      const f = fc1.out[i].w > 0 ? fc1.out[i] : null;
      const off = f ? Math.abs((f.x - o.x) * o.fz - (f.z - o.z) * o.fx) : 0;
      aw.push(q ? dm(q.w) : f ? dm(Math.max(0.9, Math.min(o.w || f.w, f.w - 2 * off))) : (json.aw?.[i] ?? 0));
    });
    return { a, aw };
  };
  const turnsOf = (g: Edge[]) => g.map((e) => Array.from(e.turns).join(','));
  const base = turnsOf(build(old));
  let reverted = 0;
  for (let round = 0; round < 20; round++) {
    const { a, aw } = enc();
    const g = build(decodeMarks({ ...json, a, aw }).arrows);
    const now = turnsOf(g);
    const bad = g.filter((e, i) => now[i] !== base[i]);
    if (!bad.length) {
      const moved = use.filter(Boolean).length;
      return { json: { ...json, a, aw }, moved, reverted };
    }
    // 바뀐 구간 둘레 60m 안 옮긴 화살표를 되돌린다
    for (const e of bad)
      old.forEach((o, i) => {
        if (!use[i]) return;
        for (let k = 0; k < e.p.length; k += 3)
          if (Math.hypot(e.p[k] - o.x, e.p[k + 2] - o.z) < 60) {
            use[i] = false;
            reverted++;
            return;
          }
      });
  }
  // 그래도 바뀌면 모두 옛 자리
  return { json, moved: 0, reverted: old.length };
}
