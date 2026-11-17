// 길 정본 굽기 1단계(설계 문서 51절): 차가 달릴 차로 가운데선을 서울시 차선(자르기 전 땅 위 선)에서 읽는다. 이 읽기는 방향마다 따로이고,
// 선 없는 방향 채우기·반대 방향 포개짐·이음매 맞추기는 src/sim/lanes.ts resolveLanes 가 판 전체에 건다.
// 길 조각의 방향마다 2m 간격으로 길과 직각인 단면을 긋고, 단면과 만나는 선 가운데 길과 나란한 것(25° 안)을 본다.
//  - 왼쪽 경계: 양방향 길은 가운데선에 가장 가까운 중앙선(황색), 한 방향 길은 가운데선 왼쪽에서 가장 가까운 경계선(중앙선·중앙버스전용차선·가장자리선).
//  - 거기서 오른쪽으로 선을 차례로 짚어, 이웃한 두 선 사이가 2.3~4.8m 면 그 가운데를 차로 가운데로 삼는다(2.3m 보다 좁은 사이는 겹선·잡음,
//    4.8m 넘는 사이는 자료에서 차선이 빠진 곳이 많아 2.9m 마다 한 차로로 채운다. 중앙버스전용차선 바로 오른쪽 사이는 중앙 정류장 승강장 자리라 비운다). 연석 쪽 가장자리선에서 멈춘다.
//    왼쪽 경계에서 연석 쪽 경계까지 차선이 하나도 없는 단면은 그 폭을 자료의 차로 수(맞지 않으면 3.3m 마다)로 고르게 나눈다.
//  - 중앙버스차로가 붙은 한 방향 길은 왼쪽 경계(중앙버스전용차선) 왼쪽의 다음 선까지 사이 가운데를 버스차로 가운데로 삼는다.
// 단면마다 읽은 차로 수를 길을 따라 고르게 다듬어(앞뒤 6m 최빈값, 24m 보다 짧은 구간은 이웃에 합침. 양쪽보다 차로가 적은 구간은 8m 만 넘으면 남김) 차로 수가 같은 구간(run)으로 나누고,
// 구간마다 차로 가운데의 옆 거리를 단면 자리(s)마다 적는다. 처음·마지막으로 읽은 단면(a·b)은 차로 선이 시작하고 끝나는 자리다(교차로 앞뒤).
import type { MarkLine } from '../../src/data/marks.ts';
import { cumLen } from '../../src/poly.ts';
import type { Road } from '../../src/data/board.ts';
import type { DirLanes, RoadLanes, Run } from '../../src/data/road.ts';
import { carRoad } from '../../src/sim/graph.ts';

/** 차로를 가르는 선(측정과 같은 종류): 1 중앙선, 5 버스전용차선(가로), 6 차선, 7 가장자리구역선, 8 진로변경제한선, 9 주차금지, 10 주정차금지, 17 중앙버스전용차선 */
const USE = new Set([1, 5, 6, 7, 8, 9, 10, 17]);
const CURB = new Set([7, 9, 10]);
const BOUND = new Set([1, 17, 7, 9, 10]);
const PAR = Math.sin((25 * Math.PI) / 180);
const REACH = 16;
const CELL = 20;
const key = (cx: number, cz: number) => (cx + 4000) * 8000 + (cz + 4000);

export interface LineIndex {
  /** 선분마다 [ax, ay, az, bx, by, bz, 종류] */
  seg: Float32Array;
  grid: Map<number, number[]>;
}

export function lineIndex(lines: MarkLine[]): LineIndex {
  const out: number[] = [];
  const grid = new Map<number, number[]>();
  for (const l of lines) {
    if (!USE.has(l.k)) continue;
    for (let k = 0; k + 5 < l.p.length; k += 3) {
      const id = out.length / 7;
      out.push(l.p[k], l.p[k + 1], l.p[k + 2], l.p[k + 3], l.p[k + 4], l.p[k + 5], l.k);
      const seen = new Set<number>();
      const L = Math.hypot(l.p[k + 3] - l.p[k], l.p[k + 5] - l.p[k + 2]);
      const n = Math.max(1, Math.ceil(L / (CELL / 2)));
      for (let i = 0; i <= n; i++) {
        const x = l.p[k] + ((l.p[k + 3] - l.p[k]) * i) / n;
        const z = l.p[k + 2] + ((l.p[k + 5] - l.p[k + 2]) * i) / n;
        const c = key(Math.floor(x / CELL), Math.floor(z / CELL));
        if (seen.has(c)) continue;
        seen.add(c);
        (grid.get(c) ?? grid.set(c, []).get(c)!).push(id);
      }
    }
  }
  return { seg: Float32Array.from(out), grid };
}

/** 점 (x, y, z)에서 진행 방향 (ux, uz)와 직각인 단면이 만나는 나란한 선: [옆 거리(오른쪽 +), 종류] 를 옆 거리 순으로 */
export function transect(idx: LineIndex, x: number, y: number, z: number, ux: number, uz: number, reach = REACH): [number, number][] {
  const nx = -uz;
  const nz = ux;
  const out: [number, number][] = [];
  const seen = new Set<number>();
  for (let s = -reach; s <= reach + 1e-6; s += CELL / 2) {
    const cx = Math.floor((x + nx * s) / CELL);
    const cz = Math.floor((z + nz * s) / CELL);
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++)
        for (const id of idx.grid.get(key(cx + dx, cz + dz)) ?? []) {
          if (seen.has(id)) continue;
          seen.add(id);
          const g = idx.seg;
          const o = id * 7;
          const rx = g[o + 3] - g[o];
          const rz = g[o + 5] - g[o + 2];
          const rl = Math.hypot(rx, rz);
          if (rl < 1e-6 || Math.abs(rx * uz - rz * ux) / rl > PAR) continue;
          const den = nx * rz - nz * rx;
          if (Math.abs(den) < 1e-9) continue;
          const t = ((g[o] - x) * rz - (g[o + 2] - z) * rx) / den;
          const u = ((g[o] - x) * nz - (g[o + 2] - z) * nx) / den;
          if (u < 0 || u > 1 || Math.abs(t) > reach) continue;
          if (Math.abs(g[o + 1] + (g[o + 4] - g[o + 1]) * u - y) > 2) continue; // 높이가 다른 선(고가 위아래)
          out.push([t, g[o + 6]]);
        }
  }
  return out.sort((a, b) => a[0] - b[0]);
}

/** 단면 하나에서 이 방향 차로 가운데들(왼쪽부터), 중앙버스차로 가운데(없으면 NaN), 연석 쪽 경계선까지 닿았는가(못 닿았으면 오른쪽 차로 선이 끊긴 단면일 수 있다).
 *  왼쪽 경계나 차로를 못 찾으면 null */
export function readSection(hits: [number, number][], twoWay: boolean, medBus: boolean, hint = 0): { lanes: number[]; med: number; closed: boolean; filled: boolean } | null {
  let b = -1;
  if (twoWay) {
    for (let i = 0; i < hits.length; i++) if (hits[i][1] === 1 && Math.abs(hits[i][0]) <= 3.5 && (b < 0 || Math.abs(hits[i][0]) < Math.abs(hits[b][0]))) b = i;
    // 중앙선이 자료에 없는 곳: 가운데선 양쪽 가장 가까운 두 선(6m 안) 사이가 4.8m 넘게 비어 있으면 그 오른쪽 선부터 이 방향 차로를 센다
    if (b < 0) {
      const r = hits.findIndex(([t]) => t >= 0);
      if (r > 0 && hits[r][0] <= 6 && hits[r - 1][0] >= -6 && hits[r][0] - hits[r - 1][0] > 4.8) b = r;
    }
  } else for (let i = 0; i < hits.length; i++) if (BOUND.has(hits[i][1]) && hits[i][0] < -0.5 && hits[i][0] > -REACH) b = i;
  if (b < 0) return null;
  const lanes: number[] = [];
  let prev = hits[b][0];
  let closed = false;
  let filled = false;
  for (let i = b + 1; i < hits.length; i++) {
    const [t, k] = hits[i];
    const gap = t - prev;
    if (gap < 2.3) {
      if (CURB.has(k) && lanes.length) {
        closed = true;
        break;
      }
      continue;
    }
    // 한 방향 길에서 차로를 찾기 전 만난 가장자리구역선은 찻길 왼쪽 가장자리다(그 왼쪽은 중앙 정류장·분리대 자리라 차로로 채우지 않는다)
    if (!twoWay && !lanes.length && k === 7 && gap > 4.8) {
      prev = t;
      continue;
    }
    if (gap <= 4.8) lanes.push((prev + t) / 2);
    else if (!lanes.length && BOUND.has(k)) {
      // 왼쪽 경계에서 연석 쪽 경계까지 차선이 하나도 칠해지지 않은 찻길: 차로 수(자료 어림값이 한 차로 2.6~4.6m(한 차로면 7m)에 맞으면 그 수, 아니면 3.3m 마다)로 고르게 나눈다
      const n = hint > 0 && gap / hint >= 2.6 && gap / hint <= (hint === 1 ? 7 : 4.6) ? hint : Math.max(1, Math.round(gap / 3.3));
      for (let l = 0; l < n; l++) lanes.push(prev + ((l + 0.5) * gap) / n);
      filled = true;
    } else if (!(prev === hits[b][0] && hits[b][1] === 17)) {
      // 4.8m 넘는 사이: 차선 한 줄이 자료에서 빠진 곳이 많다(강변북로 등). 2.9m 마다 한 차로로 채운다.
      // 중앙버스전용차선 바로 오른쪽 사이는 중앙 정류장 승강장 자리라 비워 둔다
      const n = Math.max(1, Math.floor(gap / 2.9));
      for (let l = 0; l < n; l++) lanes.push(prev + ((l + 0.5) * gap) / n);
      filled = true;
    }
    prev = t;
    if (CURB.has(k) || (k === 1 && twoWay)) {
      closed = true;
      break;
    }
  }
  let med = NaN;
  if (medBus && !twoWay && hits[b][1] === 17)
    for (let i = b - 1; i >= 0; i--) {
      const gap = hits[b][0] - hits[i][0];
      if (gap < 2.3) continue;
      if (gap <= 4.8) med = (hits[b][0] + hits[i][0]) / 2;
      break;
    }
  return lanes.length ? { lanes, med, closed, filled } : null;
}

const STEP = 2;
/** 차로 가운데 옆 거리가 길을 따라 바뀌는 기울기 한도 */
const SLOPE = 0.15;

/**
 * 길 조각 한 방향(p: 그 방향 순서의 [x,y,z,...], cum: 누적 길이)의 차로를 읽는다. 읽은 단면이 모자라면 null.
 * minRun: 이보다 짧은 차로 수 구간은 이웃에 합친다
 */
export function readDirection(
  idx: LineIndex,
  p: ArrayLike<number>,
  cum: ArrayLike<number>,
  twoWay: boolean,
  medBus: boolean,
  hint = 0,
  minRun = 24,
): DirLanes | null {
  const len = cum[cum.length - 1];
  if (len < 4) return null;
  const S: number[] = [];
  const raw: ReturnType<typeof readSection>[] = [];
  let seg = 0;
  for (let s = 1; s <= len - 1 + 1e-6; s += STEP) {
    while (seg < cum.length - 2 && cum[seg + 1] < s) seg++;
    const L = cum[seg + 1] - cum[seg] || 1;
    const t = (s - cum[seg]) / L;
    const o = seg * 3;
    const x = p[o] + (p[o + 3] - p[o]) * t;
    const y = p[o + 1] + (p[o + 4] - p[o + 1]) * t;
    const z = p[o + 2] + (p[o + 5] - p[o + 2]) * t;
    const ux = (p[o + 3] - p[o]) / L;
    const uz = (p[o + 5] - p[o + 2]) / L;
    S.push(s);
    let r = readSection(transect(idx, x, y, z, ux, uz), twoWay, medBus, hint);
    // 자료 차로 수보다 둘 넘게 많이 읽으면(나란히 붙은 본선과 합류하는 진입로·연결로가 본선 차선까지 읽은 것) 가운데선에 가장 가까운 이웃 차로 (자료 차로 수 + 1)개만 남긴다
    if (r && hint > 0 && r.lanes.length > hint + 1) {
      const keep = hint + 1;
      const want = twoWay ? (keep * 3.3) / 2 : 0;
      let best = 0;
      for (let k = 1; k + keep <= r.lanes.length; k++) if (Math.abs((r.lanes[k] + r.lanes[k + keep - 1]) / 2 - want) < Math.abs((r.lanes[best] + r.lanes[best + keep - 1]) / 2 - want)) best = k;
      r = { ...r, lanes: r.lanes.slice(best, best + keep), closed: r.closed && best + keep === r.lanes.length };
    }
    raw.push(r);
  }
  const N = S.length;
  // 차로 선이 시작·끝나는 자리: 연달아 셋 넘게 읽힌 첫·마지막 단면
  let first = -1;
  let last = -1;
  for (let i = 0; i + 2 < N; i++) if (raw[i] && raw[i + 1] && raw[i + 2]) (first < 0 ? (first = i) : 0), (last = i + 2);
  const read = raw.filter(Boolean).length;
  if (first < 0 || read < Math.max(3, N * 0.3)) return null;
  // 단면마다 차로 수. 연석 쪽 경계선까지 닿지 못한 단면(오른쪽 차로 선이 먼저 끝난 교차로 앞뒤 등)은 30m 안 가장 가까운 닿은 단면(빈 사이를 채우지 않은 것)의 차로 수보다 적게 세지 않는다.
  // 못 읽은 단면은 가까운 읽은 단면 값. 앞뒤 3단면 최빈값으로 고르게
  const closedAt: number[] = [];
  raw.forEach((r, i) => r?.closed && !r.filled && closedAt.push(i));
  const nOf = raw.map((r, i) => {
    if (!r) return 0;
    if (r.closed) return r.lanes.length;
    let best = -1;
    for (const j of closedAt) if (Math.abs(j - i) * STEP <= 30 && (best < 0 || Math.abs(j - i) < Math.abs(best - i))) best = j;
    return best < 0 ? r.lanes.length : Math.max(r.lanes.length, raw[best]!.lanes.length);
  });
  const near = (i: number) => {
    for (let d = 0; d < N; d++) {
      if (i - d >= first && nOf[i - d]) return i - d;
      if (i + d <= last && nOf[i + d]) return i + d;
    }
    return first;
  };
  const filled = nOf.map((n, i) => (i >= first && i <= last && n ? n : nOf[near(i)]));
  const smooth = filled.map((_, i) => {
    const c = new Map<number, number>();
    for (let k = Math.max(0, i - 3); k <= Math.min(N - 1, i + 3); k++) c.set(filled[k], (c.get(filled[k]) ?? 0) + 1);
    let best = filled[i];
    for (const [v, n] of c) if (n > (c.get(best) ?? 0)) best = v;
    return best;
  });
  // 차로 수가 같은 연속 단면 묶음. 짧은 묶음은 더 긴 이웃에 합친다(되풀이)
  type G = { i0: number; i1: number; n: number };
  let groups: G[] = [];
  for (let i = 0; i < N; i++) {
    const g = groups[groups.length - 1];
    if (g && g.n === smooth[i]) g.i1 = i;
    else groups.push({ i0: i, i1: i, n: smooth[i] });
  }
  for (let guard = 0; guard < 50 && groups.length > 1; guard++) {
    let worst = -1;
    for (let k = 0; k < groups.length; k++) {
      const g = groups[k];
      const l = (g.i1 - g.i0 + 1) * STEP;
      // 양쪽 이웃보다 차로가 적은 구간(중앙 정류장 승강장 옆처럼 차로가 줄어드는 곳)은 8m 만 넘으면 남긴다
      const dip = k > 0 && k < groups.length - 1 && g.n < groups[k - 1].n && g.n < groups[k + 1].n;
      if (l < (dip ? 8 : minRun) && (worst < 0 || l < (groups[worst].i1 - groups[worst].i0 + 1) * STEP)) worst = k;
    }
    if (worst < 0) break;
    const g = groups[worst];
    const A = groups[worst - 1];
    const B = groups[worst + 1];
    const into = !A ? B : !B ? A : A.i1 - A.i0 >= B.i1 - B.i0 ? A : B;
    into.i0 = Math.min(into.i0, g.i0);
    into.i1 = Math.max(into.i1, g.i1);
    groups.splice(worst, 1);
    const merged: G[] = [];
    for (const q of groups) {
      const m = merged[merged.length - 1];
      if (m && m.n === q.n) m.i1 = q.i1;
      else merged.push(q);
    }
    groups = merged;
  }
  // 묶음마다 단면별 옆 거리. 차로 l 은 그 차로 수로 읽었거나, 연석까지 닿지 못해 왼쪽 차로만 읽은 단면에서 읽는다(앞뒤 셋의 중앙값).
  // 못 읽은 단면은 앞뒤 읽은 단면 사이를 잇거나 끝 값을 그대로 쓴다
  const runs: Run[] = groups.map((g, k) => {
    const n = g.n;
    const fits = (i: number, l: number) => !!raw[i] && raw[i]!.lanes.length > l && (raw[i]!.lanes.length === n || (!raw[i]!.closed && raw[i]!.lanes.length < n));
    // 차로마다 앞뒤 4단면 안의 읽기 중앙값에서 0.8m 넘게 튄 읽기(선이 끝나는 자리에서 다른 선을 짚은 단면)는 버린다
    const goodOf: number[][] = [];
    for (let l = 0; l < n; l++) {
      const cand: number[] = [];
      for (let i = g.i0; i <= g.i1; i++) if (fits(i, l)) cand.push(i);
      goodOf.push(
        cand.filter((i) => {
          const near = cand.filter((j) => Math.abs(j - i) <= 4).map((j) => raw[j]!.lanes[l]).sort((a, b) => a - b);
          return near.length < 3 || Math.abs(raw[i]!.lanes[l] - near[near.length >> 1]) <= 0.8;
        }),
      );
    }
    const ok = (i: number, l: number) => goodOf[l].includes(i);
    const good = goodOf[0];
    const st: number[] = [];
    const off: number[] = [];
    const med: number[] = [];
    const hasMed = medBus && good.some((i) => Number.isFinite(raw[i]!.med));
    const medGood = good.filter((i) => Number.isFinite(raw[i]!.med));
    const interp = (list: number[], i: number, f: (j: number) => number) => {
      if (!list.length) return NaN;
      let lo = -1;
      let hi = -1;
      for (const j of list) {
        if (j <= i) lo = j;
        if (j >= i && hi < 0) hi = j;
      }
      if (lo < 0) return f(hi);
      if (hi < 0 || hi === lo) return f(lo);
      return f(lo) + ((f(hi) - f(lo)) * (i - lo)) / (hi - lo);
    };
    for (let i = g.i0; i <= g.i1; i++) {
      st.push(S[i]);
      for (let l = 0; l < n; l++) {
        const vals = [i - 1, i, i + 1].filter((j) => j >= g.i0 && j <= g.i1 && ok(j, l)).map((j) => raw[j]!.lanes[l]);
        vals.sort((a, b) => a - b);
        // 이 차로를 어디서도 읽지 못했으면(차로 수를 이웃 단면에서 빌린 구간) 왼쪽 차로에서 3.2m 씩
        off.push(vals.length === 3 ? vals[1] : goodOf[l].length ? interp(goodOf[l], i, (j) => raw[j]!.lanes[l]) : off[off.length - 1] + 3.2);
      }
      if (hasMed) med.push(interp(medGood, i, (j) => raw[j]!.med));
    }
    const s0 = k === 0 ? 0 : (S[g.i0 - 1] + S[g.i0]) / 2;
    const s1 = k === groups.length - 1 ? len : (S[g.i1] + S[g.i1 + 1]) / 2;
    // 이웃 단면 사이 옆 거리 기울기를 0.15(약 8.5°) 안으로 누른다: 선이 끝나거나 다른 선을 짚은 자리의 계단을 완만한 비탈로 바꿔, 차가 한 단계에 옆으로 튀지 않게
    const limit = (get: (k: number) => number, set: (k: number, v: number) => void) => {
      const m = st.length;
      const f = new Array<number>(m);
      const b = new Array<number>(m);
      for (let k = 0; k < m; k++) f[k] = k ? Math.max(f[k - 1] - SLOPE * (st[k] - st[k - 1]), Math.min(f[k - 1] + SLOPE * (st[k] - st[k - 1]), get(k))) : get(k);
      for (let k = m - 1; k >= 0; k--) b[k] = k < m - 1 ? Math.max(b[k + 1] - SLOPE * (st[k + 1] - st[k]), Math.min(b[k + 1] + SLOPE * (st[k + 1] - st[k]), get(k))) : get(k);
      for (let k = 0; k < m; k++) set(k, (f[k] + b[k]) / 2);
    };
    for (let l = 0; l < n; l++) limit((k) => off[k * n + l], (k, v) => (off[k * n + l] = v));
    if (med.length) limit((k) => med[k], (k, v) => (med[k] = v));
    // 이웃 차로 가운데 사이는 2.6m 넘게(따로 이은 두 차로가 붙거나 엇갈리지 않게, 오른쪽 차로를 민다)
    for (let k = 0; k < st.length; k++) for (let l = 1; l < n; l++) off[k * n + l] = Math.max(off[k * n + l], off[k * n + l - 1] + 2.6);
    return simplify({ s0, s1, n, st, off, med });
  });
  return { a: S[first], b: S[last], runs };
}

/** 앞뒤 단면 사이 직선으로 0.08m 안에 들어오는 단면을 지운다(구간 끝 단면은 남긴다) */
function simplify(r: Run): Run {
  const n = r.n;
  const m = r.st.length;
  const keep = new Uint8Array(m);
  keep[0] = keep[m - 1] = 1;
  const rec = (a: number, b: number) => {
    let worst = 0;
    let at = -1;
    for (let i = a + 1; i < b; i++) {
      const u = (r.st[i] - r.st[a]) / (r.st[b] - r.st[a]);
      let d = 0;
      for (let l = 0; l < n; l++) d = Math.max(d, Math.abs(r.off[i * n + l] - (r.off[a * n + l] + (r.off[b * n + l] - r.off[a * n + l]) * u)));
      if (r.med.length) d = Math.max(d, Math.abs(r.med[i] - (r.med[a] + (r.med[b] - r.med[a]) * u)));
      if (d > worst) (worst = d), (at = i);
    }
    if (at >= 0 && worst > 0.08) {
      keep[at] = 1;
      rec(a, at);
      rec(at, b);
    }
  };
  if (m > 2) rec(0, m - 1);
  const out: Run = { s0: r.s0, s1: r.s1, n, st: [], off: [], med: [] };
  for (let i = 0; i < m; i++) {
    if (!keep[i]) continue;
    out.st.push(r.st[i]);
    for (let l = 0; l < n; l++) out.off.push(r.off[i * n + l]);
    if (r.med.length) out.med.push(r.med[i]);
  }
  return out;
}

/** 차가 다니는 도로 조각마다 [진행 방향, 반대 방향] 을 서울시 선으로 읽는다(못 읽은 방향은 null) */
export function readLanes(roads: Road[], lines: MarkLine[]): { lanes: RoadLanes; dirs: number; read: number } {
  const idx = lineIndex(lines);
  let dirs = 0;
  let read = 0;
  const lanes: RoadLanes = roads.map((r) => {
    if (!carRoad(r)) return null;
    const rev = new Float32Array(r.p.length);
    for (let i = 0; i < r.p.length; i += 3) rev.set(r.p.subarray(i, i + 3), r.p.length - 3 - i);
    const res: [DirLanes | null, DirLanes | null] = [readDirection(idx, r.p, cumLen(r.p), !r.oneway, r.medBus, r.lf), r.oneway ? null : readDirection(idx, rev, cumLen(rev), true, false, r.lb)];
    dirs += r.oneway ? 1 : 2;
    read += res.filter(Boolean).length;
    return res[0] || res[1] ? res : null;
  });
  return { lanes, dirs, read };
}
