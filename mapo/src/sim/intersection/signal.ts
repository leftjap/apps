// 신호(재작업 W20, 설계 문서 45절). 교차로(build.ts) 하나에 신호 하나. 옛 signals.ts 를 쓰지 않는다.
// 규칙(지오): 빨간불이면 선다. 좌회전 신호가 뜨면 좌회전 차로 차만, 직진 신호면 직진 차로 차만 간다. 보행 신호는 그에 맞춰 켜진다.
//  - 진입로를 축 두 무리로 나누고 한국 표준 동시신호(직진 뒤 좌회전): 무리 0 직진 → 무리 0 좌회전 → 무리 1 직진 → 무리 1 좌회전. 현시 끝마다 노랑 3초·전체 빨강 2초.
//  - 진입로마다 좌회전·유턴 방식은 서울시 신호등(4색등 = 좌회전 화살표)·안전표지(329 비보호, 214 좌회전금지, 311 유턴, 216 유턴금지) 자료로 정한다(W18 규칙).
//  - 직진 현시는 '보행 부분'과 '회전 부분'으로 나눈다. 보행 부분에는 그 무리 축에 나란한 횡단보도를 지나지 않는 움직임만 초록이고 그 횡단보도 보행 신호가 켜진다.
//    회전 부분에는 보행 신호가 꺼지고 그 무리 직진·우회전·비보호 좌회전·양보 유턴이 초록이다.
//  - 우회전은 그 밖에도, 같은 때 초록인 움직임과 경로가 부딪지 않고 지나는 횡단보도가 보행 초록이 아닌 현시면 초록이다(그 현시 끝까지 내내 그럴 때).
//  - 보행 신호는 그 횡단보도를 지나는 차 움직임이 모두 빨간불인 때만 켜진다(위 나누기가 그렇게 만든다. 시험이 확인한다).
//  - 같은 때 초록인 두 움직임의 경로가 부딪으면 낮은 쪽(비보호 좌회전·양보 유턴 < 직진·제 무리 우회전, 다른 무리 우회전은 모두에게)이 양보한다(yields).
// 길 중간 보행 신호(교차로가 아닌 곳의 보행 신호 횡단보도): 차 초록 → 노랑 → 전체 빨강 → 보행 초록 25초 → 전체 빨강.
import type { Crosswalk } from '../../data/board.ts';
import { pointAt } from '../../poly.ts';
import { hash01 } from '../rng.ts';
import { headingNear, laneOff, MED, type Edge } from '../graph.ts';
import { LEFT, nodeKey, RIGHT, STRAIGHT, UTURN, type Intersections, type LanePath } from './build.ts';

export const GREEN = 0;
export const YELLOW = 1;
export const RED = 2;
export const CYCLE = 120;
const AMBER = 3;
const ALLRED = 2;
const MIN_GREEN = 24;
const LEFT_GREEN = [10, 13, 16];
const WALK_GREEN = 25;
/** 회전 부분 길이(초) */
const TURN_PART = 8;
const WAVE = 11;
const NEAR = 25;

/** 서울시 신호등 부착대와 표지(public/data/signals.json, tools/signals.ts 가 굽는다) */
export interface SignalLamps {
  /** [지주 x, z, 팔 끝 x, z, 종류(3 3색등, 4 4색등, 5 버스 3색등), 같은 지주 표지 비트] 6개씩 */
  lamps: number[];
  /** 신호등 지주에 달리지 않은 표지 [x, z, 표지 번호] 3개씩 */
  signs: number[];
}
export interface SurveySignalSite {
  kind: 'junction' | 'midblock';
  at: readonly [number, number];
  approaches: readonly number[];
  crossings: readonly number[];
  arms?: ReadonlyMap<number, number>;
}

export interface SignalData {
  crosswalks: Crosswalk[];
  stopLines: Float32Array;
  lamps?: SignalLamps;
  surveySites?: readonly SurveySignalSite[];
  signalKeys?: boolean;
  fixedSignals?: { reference: SignalReference; keys: readonly string[] };
}

export interface SignalReference {
  inter: { X: Intersections; S: SignalPlan };
  keys: readonly string[];
}

/** 신호 진입로 */
export interface Approach {
  /** 신호 번호 */
  c: number;
  group: number;
  /** 구간 끝에서 게이트(가운데 차로)까지(m) */
  setback: number;
  /** 좌회전: 0 하지 않음, 1 좌회전 현시(화살표), 2 비보호 */
  left: number;
  /** 유턴: 0 하지 않음, 1 좌회전 현시에, 2 양보하며 */
  uturn: number;
  arrow: boolean;
  /** 나갈 수 있는 움직임 비트 */
  moves: number;
}

/** 신호 주기 안 한 토막: 초록·노랑인 움직임(진입로 → 비트), 양보하는 움직임, 보행 초록인 횡단보도 */
interface Step {
  start: number;
  dur: number;
  green: Map<number, number>;
  amber: Map<number, number>;
  yields: Map<number, number>;
  walk: Set<number>;
}
export interface SignalSite {
  x: number;
  z: number;
  /** 교차로 번호(길 중간 보행 신호면 −1) */
  j: number;
  axis: number;
  offset: number;
  steps: Step[];
  /** 무리마다 좌회전 현시가 있으면 1 이상(신호등 그림이 4구 등을 단다), 없으면 −1 */
  turn: number[];
  walkOnly: boolean;
  surveyKey?: string;
}

const axisGap = (a: number, b: number) => {
  const d = Math.abs((((a - b) % Math.PI) + Math.PI) % Math.PI);
  return Math.min(d, Math.PI - d);
};
const bits = (m: number) => [LEFT, STRAIGHT, RIGHT, UTURN].filter((b) => m & b);
const surveyKey = (site: SurveySignalSite) => `${site.kind}:${site.at.join(',')}`;
function surveyedOffset(key: string) {
  let hash = 2166136261;
  for (const c of key) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  return (hash >>> 0) / 2 ** 32 * CYCLE;
}

export function makeSignalPlan(X: Intersections, data?: SignalData) {
  const edges = X.edges;
  const crosswalks = data?.crosswalks ?? [];
  const list: SignalSite[] = [];
  const surveyed = data?.surveySites;
  const fixed = data?.fixedSignals;
  const signalKeys = fixed || data?.signalKeys;
  const oldEdges = new Map(fixed?.reference.keys.map((key, id) => [key, id]));
  const oldApproach = (id: number) => fixed?.reference.inter.S.approach.get(oldEdges.get(fixed.keys[id]) ?? -1);
  const owners = new Map<number, number>();
  const approach = new Map<number, Approach>();
  const sigXw = crosswalks.map((c, i) => ({ c, i })).filter(({ c }) => c.sig);
  const P = [0, 0, 0];

  // ── 신호등·표지 짝 찾기(W18 규칙): 게이트 앞 −3~80m, 옆 −15~+12m 안 부착대 가운데 팔이 진행 방향 왼쪽으로 뻗은 것 ──
  const lampData = data?.lamps;
  function lampsFor(e: Edge, setback: number) {
    const out = { found: false, arrow: false, bits: 0 };
    if (!lampData) return out;
    const s = Math.max(0, e.len - setback);
    const seg = pointAt(e.p, e.cum, s, P);
    const hx = e.p[seg * 3 + 3] - e.p[seg * 3];
    const hz = e.p[seg * 3 + 5] - e.p[seg * 3 + 2];
    const hl = Math.hypot(hx, hz) || 1;
    const ux = hx / hl;
    const uz = hz / hl;
    const mid = (laneOff(e, 0, s) + laneOff(e, e.lanes - 1, s)) / 2;
    const cx = P[0] - uz * mid;
    const cz = P[2] + ux * mid;
    const L = lampData.lamps;
    for (let k = 0; k < L.length; k += 6) {
      const ex = L[k + 2] - cx;
      const ez = L[k + 3] - cz;
      const along = ex * ux + ez * uz;
      const lat = ex * -uz + ez * ux;
      if (along < -3 || along > 80 || lat < -15 || lat > 12) continue;
      const ax = L[k + 2] - L[k];
      const az = L[k + 3] - L[k + 1];
      const al = Math.hypot(ax, az) || 1;
      if ((ax * uz - az * ux) / al < 0.7) continue;
      if ((L[k] - cx) * -uz + (L[k + 1] - cz) * ux < lat) continue;
      out.found = true;
      if (L[k + 4] === 4) out.arrow = true;
      out.bits |= L[k + 5];
    }
    const S = lampData.signs;
    const BIT: Record<number, number> = { 329: 1, 311: 2, 216: 4, 214: 8 };
    for (let k = 0; k < S.length; k += 3) {
      if (!BIT[S[k + 2]]) continue;
      const ex = S[k] - cx;
      const ez = S[k + 1] - cz;
      const along = ex * ux + ez * uz;
      const lat = ex * -uz + ez * ux;
      if (along < -25 || along > 5 || lat < 2 || lat > 15) continue;
      out.bits |= BIT[S[k + 2]];
    }
    return out;
  }
  const midGate = (e: Edge) => X.gate(e.id, Math.floor(e.lanes / 2));

  // ── 신호 교차로 ──
  const junctionSite = new Int32Array(X.list.length).fill(-1);
  for (const J of X.list) {
    const measured = surveyed?.find(site => site.kind === 'junction' &&
      site.approaches.some(id => X.jEnd[id] === J.id));
    if (surveyed && !measured) continue;
    const into = J.into.filter(id => !measured || measured.approaches.includes(id)).map(id => edges[id]);
    if (into.filter((e) => e.cls >= 1 && e.cls <= 3).length < (measured?.arms ? 1 : 3)) continue;
    const pts = [...J.nodes].map((k) => k.split(',').map((v) => Number(v) / 10));
    const signalled = data ? sigXw.some(({ c }) => pts.some(([x, z]) => Math.hypot(c.x - x, c.z - z) < NEAR + c.half * 0.5)) : into.some((e) => e.cls <= 2);
    if (!measured && !signalled) continue;
    const main = [...into].sort((a, b) => a.cls - b.cls || b.vol - a.vol)[0];
    const axis = ((headingNear(main, main.len) % Math.PI) + Math.PI) % Math.PI;
    const c = list.length;
    junctionSite[J.id] = c;
    for (const i of measured?.crossings ?? []) owners.set(i, c);
    const groups = into.map(e => measured?.arms?.get(e.id) ?? (axisGap(headingNear(e, e.len), axis) < Math.PI / 4 ? 0 : 1));
    const key = measured && surveyKey(measured);
    list.push({ x: J.x, z: J.z, j: J.id, axis, ...(signalKeys && { surveyKey: key }),
      offset: fixed && key ? surveyedOffset(key) : hash01(c * 7.31 + 1) * CYCLE, steps: [], turn: [-1, -1],
      walkOnly: !measured?.arms && !groups.includes(1) });
    into.forEach((e, k) => {
      const moves = (X.exits.get(e.id) ?? []).reduce((m, x) => m | x.move, 0);
      const setback = X.stopAt(e.id, Math.floor(e.lanes / 2));
      const lp = lampsFor(e, setback);
      const laneLeft = e.turns.some((m) => (m & LEFT) !== 0);
      const laneU = e.turns.some((m) => (m & UTURN) !== 0);
      let left = 0;
      if (!(moves & LEFT) || lp.bits & 8) left = 0;
      else if (lp.arrow || !(moves & STRAIGHT)) left = 1;
      else if (lp.bits & 1) left = 2;
      else if (!lp.found) left = laneLeft ? 1 : 2;
      else left = laneLeft ? 2 : 0;
      let uturn = 0;
      if (moves & UTURN && !(lp.bits & 4) && (lp.bits & 2 || laneU)) uturn = left === 1 || (lp.arrow && left !== 2) ? 1 : 2;
      const previous = oldApproach(e.id);
      if (previous) ({ left, uturn } = previous);
      approach.set(e.id, previous ? { ...previous, c } :
        { c, group: list[c].walkOnly ? 0 : groups[k], setback, left, uturn, arrow: lp.arrow, moves });
      X.setRules(e.id, (left ? 0 : LEFT) | (uturn ? 0 : UTURN), !!(uturn && lp.bits & 2 && !laneU));
    });
  }

  // ── 길 중간 보행 신호: 보행 신호 횡단보도 꼭짓점에서 끝나는(교차로가 아닌) 구간 ──
  const crossSite = new Int32Array(crosswalks.length).fill(-1);
  const ends = new Map<string, Edge[]>();
  for (const e of edges) if (X.jEnd[e.id] < 0) (ends.get(nodeKey(e.p[e.p.length - 3], e.p[e.p.length - 1])) ?? ends.set(nodeKey(e.p[e.p.length - 3], e.p[e.p.length - 1]), []).get(nodeKey(e.p[e.p.length - 3], e.p[e.p.length - 1]))!).push(e);
  const midApproach = new Map<number, number>(); // 구간 → 길 중간 신호
  for (const site of surveyed ?? []) {
    if (site.kind !== 'midblock' || !site.approaches.length) continue;
    const c = list.length;
    const axis = ((headingNear(edges[site.approaches[0]], edges[site.approaches[0]].len) % Math.PI) + Math.PI) % Math.PI;
    const key = surveyKey(site);
    list.push({ x: site.at[0], z: site.at[1], j: -1, axis, ...(signalKeys && { surveyKey: key }),
      offset: fixed ? surveyedOffset(key) : hash01(c * 7.31 + 1) * CYCLE,
      steps: [], turn: [-1, -1], walkOnly: true });
    for (const i of site.crossings) owners.set(i, c);
    for (const id of site.approaches) {
      midApproach.set(id, c);
      approach.set(id, { c, group: 0, setback: midGate(edges[id]), left: 0, uturn: 0, arrow: false, moves: STRAIGHT });
    }
  }
  for (const [i, c] of owners) crossSite[i] = c;
  for (const { c: xw, i } of surveyed ? [] : sigXw) {
    for (let k = 0; k < xw.verts.length; k += 2) {
      const into = (ends.get(nodeKey(xw.verts[k], xw.verts[k + 1])) ?? []).filter((e) => !midApproach.has(e.id) && e.cls >= 1);
      if (!into.length) continue;
      let c = crossSite[i];
      if (c < 0) {
        c = list.length;
        list.push({ x: xw.x, z: xw.z, j: -1, axis: ((headingNear(into[0], into[0].len) % Math.PI) + Math.PI) % Math.PI, offset: hash01(c * 7.31 + 1) * CYCLE, steps: [], turn: [-1, -1], walkOnly: true });
        crossSite[i] = c;
      }
      for (const e of into) {
        midApproach.set(e.id, c);
        approach.set(e.id, { c, group: 0, setback: midGate(e), left: 0, uturn: 0, arrow: false, moves: STRAIGHT });
      }
    }
  }

  // ── 횡단보도 → 신호 교차로, 보행 무리 ──
  const walkGroup = new Int8Array(crosswalks.length);
  // 교차로 경로가 지나는 신호 횡단보도는 그 교차로 것, 아니면 노드 25m 안
  const pathXw = new Map<number, Set<number>>(); // 교차로 → 경로가 지나는 횡단보도
  const allPaths = (a: number) => {
    const out: { l: number; k: number }[] = [];
    const e = edges[a];
    const lanes = [...Array.from({ length: e.lanes }, (_, l) => l), ...(e.med ? [MED] : [])];
    (X.exits.get(a) ?? []).forEach((_, k) => lanes.forEach((l) => X.path(a, l, k) && out.push({ l, k })));
    return out;
  };
  for (const s of list) {
    if (s.j < 0) continue;
    const set = new Set<number>();
    for (const a of X.list[s.j].into) for (const { l, k } of allPaths(a)) for (const x of X.path(a, l, k)!.xw) set.add(x);
    pathXw.set(s.j, set);
  }
  for (const { c: xw, i } of surveyed ? [] : sigXw) {
    if (crossSite[i] >= 0) continue;
    let best = -1;
    let bd = Infinity;
    list.forEach((s, c) => {
      if (s.j < 0) return;
      if (pathXw.get(s.j)!.has(i)) {
        if (bd > -1) (bd = -1), (best = c);
        return;
      }
      for (const k of X.list[s.j].nodes) {
        const [x, z] = k.split(',').map((v) => Number(v) / 10);
        const d = Math.hypot(xw.x - x, xw.z - z);
        if (d < NEAR + xw.half * 0.5 && d < bd) (bd = d), (best = c);
      }
    });
    crossSite[i] = best;
  }
  crosswalks.forEach((xw, i) => {
    const c = crossSite[i];
    if (c >= 0) walkGroup[i] = list[c].j < 0 || list[c].walkOnly ? 1 : axisGap(Math.atan2(xw.uz, xw.ux), list[c].axis) < Math.PI / 4 ? 0 : 1;
  });

  // Assign both measured faces to one phase before checking which vehicle
  // movements cross that phase. Keep both face indices for the conflict test.
  for (const group of X.surveyed?.walkTogether ?? []) {
    const owner = group.find(i => crossSite[i] >= 0);
    if (owner === undefined) continue;
    for (const i of group) {
      if (crossSite[i] >= 0 && crossSite[i] !== crossSite[owner]) {
        throw Error('분리대 횡단이 서로 다른 신호 교차로에 연결됐습니다.');
      }
      crossSite[i] = crossSite[owner];
      walkGroup[i] = walkGroup[owner];
    }
  }

  // ── 현시 ──
  /** 움직임 단위(진입로, 움직임 비트)의 경로들 */
  const mvPaths = (a: number, m: number) => allPaths(a).map(({ l, k }) => X.path(a, l, k)!).filter((p) => p.move === m);
  const mvXw = (a: number, m: number) => new Set(mvPaths(a, m).flatMap((p) => p.xw));
  const mvConf = new Map<string, boolean>();
  const conflictM = (a: number, m: number, b: number, n: number) => {
    const key = a < b || (a === b && m < n) ? `${a},${m},${b},${n}` : `${b},${n},${a},${m}`;
    let c = mvConf.get(key);
    if (c === undefined) {
      c = mvPaths(a, m).some((p) => mvPaths(b, n).some((q) => X.conflict(p.id, q.id)));
      mvConf.set(key, c);
    }
    return c;
  };
  const weight = (e: Edge) => e.vol * (4 - Math.min(3, e.cls));
  list.forEach((site, c) => {
    if (site.j < 0) return;
    const into = X.list[site.j].into.filter((a) => approach.get(a)?.c === c);
    const myXw = crosswalks.map((_, i) => i).filter((i) => crossSite[i] === c);
    const xwOf = (g: number) => myXw.filter((i) => walkGroup[i] === g);
    type Phase = { kind: 'through' | 'left' | 'side' | 'walk'; g: number; green: number };
    const phases: Phase[] = [];
    const w = [0, 0];
    const leftLanes = [0, 0];
    const hasS = [false, false];
    const hasL = [false, false];
    const hasArms = surveyed?.some(s => s.arms && s.approaches.some(a => approach.get(a)?.c === c));
    for (const a of hasArms ? [] : into) {
      const ap = approach.get(a)!;
      w[ap.group] += weight(edges[a]);
      if (ap.moves & STRAIGHT) hasS[ap.group] = true;
      if (ap.left === 1 || ap.uturn === 1) {
        hasL[ap.group] = true;
        const peers = X.surveyed?.parallel?.get(a);
        const parallelLeft = peers?.filter(id => {
          const other = approach.get(id);
          return other?.c === ap.c && other.group === ap.group && (other.left === 1 || other.uturn === 1);
        }).length;
        const lanes = parallelLeft ?? edges[a].turns.filter((m) => (m & LEFT) !== 0).length;
        leftLanes[ap.group] = Math.max(leftLanes[ap.group], lanes || 1);
      }
    }
    for (const g of hasArms ? [] : [0, 1]) {
      if (!into.some((a) => approach.get(a)!.group === g)) {
        if (g === 1 && site.walkOnly && xwOf(1).length) phases.push({ kind: 'walk', g, green: WALK_GREEN });
        continue;
      }
      if (!hasS[g]) {
        phases.push({ kind: 'side', g, green: 0 });
        continue;
      }
      phases.push({ kind: 'through', g, green: 0 });
      if (hasL[g]) {
        site.turn[g] = phases.length;
        phases.push({ kind: 'left', g, green: LEFT_GREEN[Math.min(2, leftLanes[g] - 1)] });
      }
    }
    const lost = phases.length * (AMBER + ALLRED);
    const fixed = phases.filter((p) => p.green > 0).reduce((s, p) => s + p.green, 0);
    const rest = CYCLE - lost - fixed;
    const thr = phases.filter((p) => p.green === 0);
    const W = thr.reduce((s, p) => s + w[p.g], 0) || 1;
    thr.forEach((p) => (p.green = thr.length === 1 ? rest : Math.round(Math.max(MIN_GREEN, Math.min(rest - MIN_GREEN, (rest * w[p.g]) / W)))));
    if (thr.length === 2) thr[1].green = rest - thr[0].green;

    const moveList = (g: number, want: (ap: Approach, m: number) => boolean) => {
      const out: [number, number][] = [];
      for (const a of into) {
        const ap = approach.get(a)!;
        if (ap.group !== g) continue;
        for (const m of bits(ap.moves)) if (want(ap, m) && mvPaths(a, m).length) out.push([a, m]);
      }
      return out;
    };
    const steps: Step[] = [];
    let t = 0;
    const push = (dur: number, green: [number, number][], yieldsOf: [number, number][], walk: number[]) => {
      if (dur <= 0) return;
      const st: Step = { start: t, dur, green: new Map(), amber: new Map(), yields: new Map(), walk: new Set(walk) };
      for (const [a, m] of green) st.green.set(a, (st.green.get(a) ?? 0) | m);
      for (const [a, m] of yieldsOf) st.yields.set(a, (st.yields.get(a) ?? 0) | m);
      steps.push(st);
      t += dur;
    };
    /** 다른 무리 우회전 가운데, prot(보호 움직임)와 부딪지 않고 walk(보행 초록 횡단보도)를 지나지 않는 것 */
    const freeRights = (prot: [number, number][], walk: number[], have: [number, number][]) => {
      const out: [number, number][] = [];
      for (const a of into) {
        const ap = approach.get(a)!;
        if (!(ap.moves & RIGHT) || have.some(([b, m]) => b === a && m === RIGHT) || !mvPaths(a, RIGHT).length) continue;
        if (prot.some(([b, n]) => conflictM(a, RIGHT, b, n))) continue;
        const xs = mvXw(a, RIGHT);
        if (walk.some((x) => xs.has(x))) continue;
        out.push([a, RIGHT]);
      }
      return out;
    };
    const endPhase = (last: [number, number][]) => {
      const st: Step = { start: t, dur: AMBER, green: new Map(), amber: new Map(), yields: new Map(), walk: new Set() };
      for (const [a, m] of last) st.amber.set(a, (st.amber.get(a) ?? 0) | m);
      steps.push(st);
      t += AMBER;
      steps.push({ start: t, dur: ALLRED, green: new Map(), amber: new Map(), yields: new Map(), walk: new Set() });
      t += ALLRED;
    };
    if (hasArms) {
      // No measured controller timing. Give each incoming arm a protected
      // phase and separate movements within the arm if their paths conflict.
      const batches: [number, number][][] = [];
      for (const arm of new Set(into.map(a => approach.get(a)!.group))) {
        const slots: [number, number][][] = [];
        for (const [a, m] of moveList(arm, () => true)) {
          const slot = slots.find(group => group.every(([b, n]) => a === b || !conflictM(a, m, b, n)));
          if (slot) slot.push([a, m]);
          else slots.push([[a, m]]);
        }
        batches.push(...slots);
      }
      const walkTime = myXw.length ? WALK_GREEN + AMBER + ALLRED : 0;
      const available = CYCLE - walkTime - batches.length * (AMBER + ALLRED);
      batches.forEach((batch, i) => {
        push(Math.floor(available * (i + 1) / batches.length) - Math.floor(available * i / batches.length), batch, [], []);
        endPhase(batch);
      });
      if (myXw.length) {
        push(batches.length ? WALK_GREEN : CYCLE - AMBER - ALLRED, [], [], myXw);
        endPhase([]);
      }
      site.steps = steps;
      return;
    }
    for (const p of phases) {
      if (p.kind === 'walk') {
        push(p.green, [], [], xwOf(p.g));
        endPhase([]);
        continue;
      }
      if (p.kind === 'left') {
        const prot = moveList(p.g, (ap, m) => (m === LEFT && ap.left === 1) || (m === UTURN && ap.uturn === 1));
        const fr = freeRights(prot, [], prot);
        push(p.green, [...prot, ...fr], fr, []);
        endPhase([...prot, ...fr]);
        continue;
      }
      // 직진(또는 곁길) 현시: 보호 움직임과 양보 움직임
      const prot = p.kind === 'side' ? moveList(p.g, (ap, m) => m !== LEFT || ap.left > 0) : moveList(p.g, (ap, m) => m === STRAIGHT || m === RIGHT);
      const perm = p.kind === 'side' ? [] : moveList(p.g, (ap, m) => (m === LEFT && ap.left === 2) || (m === UTURN && ap.uturn === 2));
      const gx = xwOf(p.g);
      // 보행 부분: 그 무리 축 횡단보도를 지나지 않는 보호 움직임만
      const crossesG = (a: number, m: number) => {
        const xs = mvXw(a, m);
        return gx.some((x) => xs.has(x));
      };
      const walkMoves = gx.length ? prot.filter(([a, m]) => !crossesG(a, m)) : prot;
      const turnMoves = [...prot, ...perm];
      const deferred = turnMoves.length > walkMoves.length;
      let walkLen = gx.length ? (deferred ? Math.max(12, p.green - TURN_PART) : p.green) : 0;
      if (gx.length && !walkMoves.length) walkLen = Math.min(p.green - TURN_PART, Math.max(14, Math.round(p.green * 0.5)));
      walkLen = Math.min(walkLen, p.green);
      // 회전 부분까지 내내 부딪지 않는 다른 무리 우회전
      const fr = freeRights(turnMoves, walkLen > 0 ? gx : [], turnMoves);
      // 양보: 비보호 좌회전·양보 유턴은 부딪는 보호 움직임에, 다른 무리 우회전은 모두에게
      const yieldsT: [number, number][] = [...perm, ...fr];
      if (walkLen > 0) push(walkLen, [...walkMoves, ...fr], fr, gx);
      push(p.green - walkLen, [...turnMoves, ...fr], yieldsT, []);
      endPhase([...turnMoves, ...fr]);
    }
    // 반올림으로 남은 몫은 마지막 초록에
    if (t !== CYCLE && steps.length) {
      const k = steps.length - 3;
      if (k >= 0) {
        steps[k].dur += CYCLE - t;
        for (let q = k + 1; q < steps.length; q++) steps[q].start += CYCLE - t;
      }
    }
    // 현시가 하나뿐이고 보행 신호도 없는 교차로(재작업 W35): 서로 부딪는 움직임도 건널 사람도 없으니 노랑·전체 빨강 없이 늘 초록이다.
    // 노랑·빨강 5초가 초록불 물결로 이웃 교차로 좌회전 현시와 겹치면, 그 좌회전 차는 나갈 길이 곧 빨강이라 주기마다 못 들어갔다(합정 교차로 9 → 2)
    if (phases.length === 1 && phases[0].kind !== 'walk' && steps.length && !steps.some((st) => st.walk.size)) {
      const one = steps[0];
      site.steps = [{ start: 0, dur: CYCLE, green: one.green, amber: new Map(), yields: one.yields, walk: new Set() }];
      return;
    }
    site.steps = steps;
  });
  // 길 중간 보행 신호
  list.forEach((site, c) => {
    if (site.j >= 0) return;
    const into = [...midApproach].filter(([, s]) => s === c).map(([a]) => a);
    const xs = crosswalks.map((_, i) => i).filter((i) => crossSite[i] === c);
    const carG = CYCLE - WALK_GREEN - 2 * (AMBER + ALLRED);
    const green = new Map(into.map((a) => [a, STRAIGHT | LEFT | RIGHT | UTURN] as [number, number]));
    site.steps = [
      { start: 0, dur: carG, green, amber: new Map(), yields: new Map(), walk: new Set() },
      { start: carG, dur: AMBER, green: new Map(), amber: green, yields: new Map(), walk: new Set() },
      { start: carG + AMBER, dur: ALLRED, green: new Map(), amber: new Map(), yields: new Map(), walk: new Set() },
      { start: carG + AMBER + ALLRED, dur: WALK_GREEN, green: new Map(), amber: new Map(), yields: new Map(), walk: new Set(xs) },
      { start: carG + AMBER + ALLRED + WALK_GREEN, dur: AMBER + ALLRED, green: new Map(), amber: new Map(), yields: new Map(), walk: new Set() },
    ];
  });

  // ── 초록불 물결: 신호 진입로마다 600m 안 위쪽 신호와 잇고, 큰 길부터 나무로 엮어 아래 신호 직진 초록이 위 신호 직진 초록 + 거리/11m/s 에 켜지게 ──
  const prev: number[][] = edges.map(() => []);
  for (const e of edges) for (const n of e.next) prev[n].push(e.id);
  /** 신호 c 에서 진입로 a 의 직진(없으면 아무 움직임) 초록이 켜지는 주기 안 자리 */
  const startOf = (c: number, a: number) => {
    const st = list[c].steps.find((s) => (s.green.get(a) ?? 0) & STRAIGHT) ?? list[c].steps.find((s) => s.green.get(a));
    return st ? st.start : 0;
  };
  type Link = { up: number; ua: number; dn: number; da: number; d: number; w: number };
  const links: Link[] = [];
  for (const [id, ap] of fixed ? [] : approach) {
    let cur = edges[id];
    let ahead = cur.len;
    for (let k = 0; k < 20 && ahead < 600; k++) {
      const ps = prev[cur.id].map((i) => edges[i]);
      if (!ps.length) break;
      const p = ps.find((q) => q.name && q.name === cur.name) ?? ps.sort((a, b) => b.vol - a.vol)[0];
      const up = approach.get(p.id);
      if (up) {
        if (up.c !== ap.c) links.push({ up: up.c, ua: p.id, dn: ap.c, da: id, d: ahead, w: Math.min(weight(edges[id]), weight(p)) });
        break;
      }
      ahead += p.len;
      cur = p;
    }
  }
  const wrap = (t: number) => ((t % CYCLE) + CYCLE) % CYCLE;
  links.sort((a, b) => b.w - a.w || a.d - b.d);
  const root = list.map((_, i) => i);
  const findRoot = (i: number): number => (root[i] === i ? i : (root[i] = findRoot(root[i])));
  const tree: Link[][] = list.map(() => []);
  for (const l of links) {
    const a = findRoot(l.up);
    const b = findRoot(l.dn);
    if (a === b) continue;
    root[a] = b;
    tree[l.up].push(l);
    tree[l.dn].push(l);
  }
  const done = new Uint8Array(list.length);
  const rank = list.map((_, c) => c).sort((a, b) => tree[b].reduce((s, l) => s + l.w, 0) - tree[a].reduce((s, l) => s + l.w, 0));
  for (const r0 of rank) {
    if (done[r0]) continue;
    done[r0] = 1;
    const queue = [r0];
    while (queue.length) {
      const c = queue.shift()!;
      for (const l of tree[c]) {
        const o = l.up === c ? l.dn : l.up;
        if (done[o]) continue;
        done[o] = 1;
        // 위 신호 진입로 직진 초록 켜지는 시각(절대) = startOf − offset. 아래는 그보다 d/WAVE 뒤
        if (l.up === c) list[o].offset = wrap(startOf(o, l.da) - (startOf(c, l.ua) - list[c].offset) - l.d / WAVE);
        else list[o].offset = wrap(startOf(o, l.ua) - (startOf(c, l.da) - list[c].offset) + l.d / WAVE);
        queue.push(o);
      }
    }
  }

  // Keep the published phase boundaries and masks for existing approaches.
  // Check added paths against the traffic and crossings in each green step.
  if (fixed) {
    const { reference, keys } = fixed;
    const oldSites = new Map(reference.inter.S.list.map(site => [site.surveyKey, site]));
    const currentEdges = new Map(keys.map((key, id) => [key, id]));
    const pathKey = (p: LanePath, ids: readonly string[]) => JSON.stringify([p.lane, p.move, p.edges.map(id => ids[id])]);
    const oldPaths = new Set(reference.inter.X.paths.map(p => pathKey(p, reference.keys)));
    const blocked = new Set<number>();
    const remap = (moves: ReadonlyMap<number, number>) => new Map([...moves].flatMap(([a, m]) => {
      const id = currentEdges.get(reference.keys[a]);
      return id === undefined ? [] : [[id, m] as const];
    }));
    for (const [c, site] of list.entries()) {
      const base = oldSites.get(site.surveyKey);
      if (!base) continue;
      const steps = base.steps.map(step => ({ ...step, green: remap(step.green),
        amber: remap(step.amber), yields: remap(step.yields), walk: new Set(step.walk) }));
      Object.assign(site, { ...base, j: site.j, steps });
      if (site.j < 0) continue;

      const into = [...approach].filter(([, ap]) => ap.c === c);
      const movements = into.flatMap(([a]) => bits((X.exits.get(a) ?? []).reduce((mask, ex) => mask | ex.move, 0))
        .map(m => ({ a, m, paths: mvPaths(a, m) })).filter(({ paths }) => paths.length));
      const occupied = steps.map(step => movements.flatMap(({ a, m, paths }) =>
        ((step.green.get(a) ?? 0) & m) ? paths.filter(p => oldPaths.has(pathKey(p, keys))) : []));
      movements.sort((p, q) => Number(Boolean(oldApproach(q.a))) - Number(Boolean(oldApproach(p.a))));
      for (const { a, m, paths } of movements) {
        const added = paths.filter(p => !oldPaths.has(pathKey(p, keys)));
        if (!added.length) continue;
        const fits = (i: number) => added.every(p => !p.xw.some(x => steps[i].walk.has(x)) &&
          !occupied[i].some(q => X.conflict(p.id, q.id)));
        const existing = oldApproach(a);
        const slots = steps.flatMap((step, i) => existing
          ? ((step.green.get(a) ?? 0) & m ? [i] : [])
          : (base.steps[i].green.size && fits(i) ? [i] : []));
        if (!slots.length || !slots.every(fits)) {
          for (const p of added) blocked.add(p.id);
          continue;
        }
        for (const i of slots) {
          if (!existing) {
            const green = steps[i].green;
            green.set(a, (green.get(a) ?? 0) | m);
          }
          occupied[i].push(...added);
        }
      }
    }
    const path = X.path;
    X.path = (a, l, k) => {
      const candidate = path(a, l, k);
      return candidate && !blocked.has(candidate.id) ? candidate : undefined;
    };
  }

  // 신호 없는 횡단보도가 신호 횡단보도 면과 포개지면(자료에 두 번 그려짐) 그 신호를 따른다
  const inRing = (rg: ArrayLike<number>, x: number, z: number) => {
    let c = false;
    for (let a = 0, j = rg.length - 2; a < rg.length; j = a, a += 2) if (rg[a + 1] > z !== rg[j + 1] > z && x < rg[a] + ((z - rg[a + 1]) / (rg[j + 1] - rg[a + 1])) * (rg[j] - rg[a])) c = !c;
    return c;
  };
  const lightOf = Int32Array.from({ length: crosswalks.length }, (_, i) => i);
  crosswalks.forEach((c, i) => {
    if (c.sig) return;
    for (const { c: q, i: j } of sigXw) {
      if (crossSite[j] < 0 || Math.hypot(q.x - c.x, q.z - c.z) > q.half + c.half + q.wid) continue;
      for (let t = -1; t <= 1; t += 0.05)
        if (q.rings.some((r) => inRing(r, c.x + c.ux * c.half * t, c.z + c.uz * c.half * t))) {
          crossSite[i] = crossSite[j];
          walkGroup[i] = walkGroup[j];
          lightOf[i] = j;
          return;
        }
    }
  });

  // ── 시각 → 토막 ──
  const at = (c: number, tod: number) => {
    const s = list[c];
    const u = wrap(tod + s.offset);
    let k = 0;
    while (k + 1 < s.steps.length && s.steps[k + 1].start <= u) k++;
    return { k, u };
  };
  function moveState(ap: Approach, m: number, tod: number): number {
    const s = list[ap.c];
    if (!s.steps.length) return GREEN;
    const { k } = at(ap.c, tod);
    const a = edgeOf.get(ap)!;
    const st = s.steps[k];
    if ((st.green.get(a) ?? 0) & m) return GREEN;
    if ((st.amber.get(a) ?? 0) & m) return YELLOW;
    return RED;
  }
  // 진입로 객체 → 구간 번호(moveState 가 객체로 받는 옛 꼴을 지킨다)
  const edgeOf = new Map<Approach, number>();
  for (const [id, ap] of approach) edgeOf.set(ap, id);
  /** 진입로 a 의 움직임 m 신호 */
  const state = (a: number, m: number, tod: number) => {
    const ap = approach.get(a);
    return ap ? moveState(ap, m, tod) : GREEN;
  };
  /** 진입로 a 의 움직임 m 초록이 남은 시간(초, 이어지는 토막까지) */
  function greenLeft(a: number, m: number, tod: number): number {
    const ap = approach.get(a);
    if (!ap) return Infinity;
    const s = list[ap.c];
    let { k, u } = at(ap.c, tod);
    let left = 0;
    for (let n = 0; n < s.steps.length; n++) {
      const st = s.steps[k];
      if (!((st.green.get(a) ?? 0) & m)) return left;
      left += st.start + st.dur - u;
      k = (k + 1) % s.steps.length;
      u = s.steps[k].start;
    }
    // 주기 내내 초록
    return Infinity;
  }
  /** 진입로 a 의 움직임 m 이 지금 양보하며 가는 움직임인가 */
  const yields = (a: number, m: number, tod: number) => {
    const ap = approach.get(a);
    if (!ap) return false;
    const { k } = at(ap.c, tod);
    return ((list[ap.c].steps[k].yields.get(a) ?? 0) & m) !== 0;
  };
  /** 횡단보도 x 보행 신호 */
  const walkState = (x: number, tod: number) => {
    const c = crossSite[x];
    if (c < 0) return RED;
    const { k } = at(c, tod);
    const st = list[c].steps;
    if (st[k].walk.has(lightOf[x])) return GREEN;
    // 보행 초록 바로 뒤 차도 모두 빨간 토막은 보행 노랑(깜박임): 건너던 사람이 마저 건넌다
    const p = st[(k + st.length - 1) % st.length];
    return p.walk.has(lightOf[x]) && !st[k].green.size ? YELLOW : RED;
  };
  /** 횡단보도 x 보행 초록이 남은 시간(초), 초록이 켜지기까지 남은 시간(초, 초록이면 0) */
  function walkLeft(x: number, tod: number): number {
    const c = crossSite[x];
    if (c < 0) return 0;
    const s = list[c];
    let { k, u } = at(c, tod);
    let left = 0;
    for (let n = 0; n < s.steps.length && s.steps[k].walk.has(lightOf[x]); n++) {
      left += s.steps[k].start + s.steps[k].dur - u;
      k = (k + 1) % s.steps.length;
      u = s.steps[k].start;
    }
    return left;
  }
  function walkIn(x: number, tod: number): number {
    const c = crossSite[x];
    if (c < 0) return Infinity;
    const s = list[c];
    let { k, u } = at(c, tod);
    let wait = 0;
    for (let n = 0; n <= s.steps.length; n++) {
      if (s.steps[k].walk.has(lightOf[x])) return wait;
      wait += s.steps[k].start + s.steps[k].dur - u;
      k = (k + 1) % s.steps.length;
      u = s.steps[k].start;
    }
    return Infinity;
  }
  /** 횡단보도 x 보행 초록 한 번의 길이(초) */
  const walkLen = (x: number) => {
    const c = crossSite[x];
    if (c < 0) return 0;
    return list[c].steps.filter((s) => s.walk.has(lightOf[x])).reduce((t, s) => t + s.dur, 0);
  };
  /** 진입로 a 가 따르는 신호(없으면 −1) */
  const siteOf = (a: number) => approach.get(a)?.c ?? -1;
  return { list, approach, state, moveState, greenLeft, yields, walkState, walkLeft, walkIn, walkLen, crossSite, walkGroup, junctionSite, siteOf, midApproach };
}

export type SignalPlan = ReturnType<typeof makeSignalPlan>;
