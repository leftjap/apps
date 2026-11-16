// 찻길 가장자리를 서울시 칠한 선이 모두 들어오게 넓히기(재작업 W14).
// 찻길 면은 OSM 가운데선과 연석선·실폭도로로 읽은 가장자리(readEdges·fitToRoadArea)로, 노면 표시는 서울시 선 그대로 그려 둘이 맞지 않았다
// (차선·중앙선이 찻길 면 밖 보도 위까지 그려졌다). 서울시 선(정지선·유도선·횡단 표시 빼고)을 0.5m 마다 짚어 그 점과 나란한(25° 안) 땅 위 찻길 가운데
// 그 점을 이미 덮거나 가장 가까운 길에 맡기고, 맡은 길의 그쪽 가장자리를 그 점 + 여유(연석 쪽 선 0.25m, 그 밖 0.3m)까지 넓힌다(좁히지는 않는다).
// 한 번에 4m 넘게 넓히지 않고, 분리대를 그리는 한 방향 큰길의 왼쪽은 분리대가 덮으므로 넓히지 않는다. 건물·지하철 출구 자리에 걸친 선 점은 보지 않고
// 넓힌 가장자리도 그 앞에서 멈춘다(선 자료와 건물 외곽선이 어긋난 곳에서 보도를 찻길로 덮지 않게).
import { curbAt, type Road } from '../../src/data/board.ts';
import { cumLen } from '../../src/poly.ts';

export interface Profile {
  s: number[];
  v: number[];
}

/** 찻길을 정하는 선 종류(대분류): 정지선 4, 주행유도선 12, 자전거횡단도 13, 정차금지지대 14 는 빼고, 진행 방향과 상관없는 선(노상장애물 16)도 뺀다 */
const USE = new Set([1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 15, 17, 18]);
/** 연석 바로 안쪽에 긋는 선: 연석까지 0.25m */
const CURB = new Set([7, 9, 10, 11, 15]);
const PAR = Math.cos((25 * Math.PI) / 180);
const REACH = 15;
const MAX_GROW = 4;
const STEP = 2;

interface Seg {
  road: number;
  k: number;
  ax: number;
  az: number;
  bx: number;
  bz: number;
  s0: number;
}

/**
 * roads: 땅 위 찻길 조각(ground[i] 가 참인 것만 본다). lines: 서울시 선 [종류, 점 [x, z] 열].
 * 넓힌 조각마다 [오른쪽, 왼쪽] 가장자리 단면(가운데선에서 떨어진 거리, s 는 길을 따라간 거리)을 돌려준다
 */
export function widenEdges(
  roads: Road[],
  ground: boolean[],
  lines: { k: number; p: [number, number][] }[],
  /** 건물·지하철 출구 자리: 이 안의 선 점은 보지 않고, 넓힌 가장자리도 여기 닿기 전에 멈춘다 */
  blocked: (x: number, z: number) => boolean = () => false,
): { edges: Map<number, [Profile, Profile]>; moved: number; far: number } {
  const CELL = 16;
  const grid = new Map<number, number[]>();
  const keyOf = (cx: number, cz: number) => (cx + 2000) * 4000 + (cz + 2000);
  const segs: Seg[] = [];
  roads.forEach((r, i) => {
    if (!ground[i]) return;
    const L = cumLen(r.p);
    for (let k = 0; k + 1 < L.length; k++) {
      const sg: Seg = { road: i, k, ax: r.p[k * 3], az: r.p[k * 3 + 2], bx: r.p[k * 3 + 3], bz: r.p[k * 3 + 5], s0: L[k] };
      const id = segs.length;
      segs.push(sg);
      const x0 = Math.floor((Math.min(sg.ax, sg.bx) - REACH) / CELL);
      const x1 = Math.floor((Math.max(sg.ax, sg.bx) + REACH) / CELL);
      const z0 = Math.floor((Math.min(sg.az, sg.bz) - REACH) / CELL);
      const z1 = Math.floor((Math.max(sg.az, sg.bz) + REACH) / CELL);
      for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) (grid.get(keyOf(cx, cz)) ?? grid.set(keyOf(cx, cz), []).get(keyOf(cx, cz))!).push(id);
    }
  });
  const lens = roads.map((r) => {
    const L = cumLen(r.p);
    return L[L.length - 1];
  });
  // 조각마다 쪽마다 STEP 간격 칸의 필요한 가장자리(가운데선에서)
  const need = new Map<number, [Float32Array, Float32Array]>();
  const median = (r: Road) => r.oneway && r.gap > 0 && r.gap <= 10;
  let far = 0;
  for (const l of lines) {
    if (!USE.has(l.k)) continue;
    const margin = CURB.has(l.k) ? 0.25 : 0.3;
    for (let i = 0; i + 1 < l.p.length; i++) {
      const [ax, az] = l.p[i];
      const [bx, bz] = l.p[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 1e-3) continue;
      const ux = (bx - ax) / len;
      const uz = (bz - az) / len;
      const n = Math.max(1, Math.ceil(len / 0.5));
      for (let q = 0; q <= n; q++) {
        const x = ax + (bx - ax) * (q / n);
        const z = az + (bz - az) * (q / n);
        if (blocked(x, z)) continue;
        // 나란한 길 가운데 이 점을 덮는(바깥으로 나간 거리 0) 길, 없으면 가장 덜 나간 길
        let best = -1;
        let bestOut = Infinity;
        let bestS = 0;
        let bestLat = 0;
        for (const id of grid.get(keyOf(Math.floor(x / CELL), Math.floor(z / CELL))) ?? []) {
          const sg = segs[id];
          const dx = sg.bx - sg.ax;
          const dz = sg.bz - sg.az;
          const sl = Math.hypot(dx, dz) || 1;
          if (Math.abs((dx * ux + dz * uz) / sl) < PAR) continue;
          const t = ((x - sg.ax) * dx + (z - sg.az) * dz) / (sl * sl);
          if (t < 0 || t > 1) continue;
          const px = sg.ax + dx * t;
          const pz = sg.az + dz * t;
          // 진행 방향 오른쪽(−dz, dx) 이 +
          const lat = ((x - px) * -dz + (z - pz) * dx) / sl;
          if (Math.abs(lat) > REACH) continue;
          const r = roads[sg.road];
          const s = sg.s0 + t * sl;
          const edge = curbAt(r, s, lat >= 0 ? 1 : -1);
          const out = Math.max(0, Math.abs(lat) - edge);
          if (out < bestOut - 1e-6 || (out < bestOut + 1e-6 && Math.abs(lat) < Math.abs(bestLat))) {
            best = sg.road;
            bestOut = out;
            bestS = s;
            bestLat = lat;
          }
        }
        if (best < 0 || bestOut <= 0) continue;
        if (bestOut > MAX_GROW) {
          far++;
          continue;
        }
        const r = roads[best];
        const side = bestLat >= 0 ? 0 : 1;
        if (side === 1 && median(r)) continue;
        let nd = need.get(best);
        if (!nd) {
          const m = Math.floor(lens[best] / STEP) + 2;
          nd = [new Float32Array(m), new Float32Array(m)];
          need.set(best, nd);
        }
        const c = Math.round(bestS / STEP);
        nd[side][c] = Math.max(nd[side][c], Math.abs(bestLat) + margin);
      }
    }
  }
  /** 가장자리를 old 에서 want 까지 넓히되, 그 사이 0.25m 마다 짚은 점이 막힌 자리(건물·출구)에 닿으면 그 앞에서 멈춘다 */
  const stop = (r: Road, s: number, side: number, want: number): number => {
    const old = curbAt(r, s, side);
    if (want <= old) return old;
    const L = cumLen(r.p);
    let k = 0;
    while (k + 2 < L.length && L[k + 1] < s) k++;
    const t = Math.max(0, Math.min(1, (s - L[k]) / (L[k + 1] - L[k] || 1)));
    const [ax, az, bx, bz] = [r.p[k * 3], r.p[k * 3 + 2], r.p[k * 3 + 3], r.p[k * 3 + 5]];
    const l = Math.hypot(bx - ax, bz - az) || 1;
    const [px, pz] = [ax + (bx - ax) * t, az + (bz - az) * t];
    // 진행 방향 오른쪽(−dz, dx)
    const [nx, nz] = [(-(bz - az) / l) * side, ((bx - ax) / l) * side];
    for (let v = old + 0.25; v <= want; v += 0.25) if (blocked(px + nx * v, pz + nz * v)) return Math.max(old, v - 0.25);
    return want;
  };
  const edges = new Map<number, [Profile, Profile]>();
  let moved = 0;
  for (const [i, nd] of need) {
    const r = roads[i];
    const len = lens[i];
    const res: Profile[] = [];
    for (const side of [0, 1]) {
      const sg = side === 0 ? 1 : -1;
      const m = nd[side].length;
      const s: number[] = [];
      const v: number[] = [];
      for (let c = 0; c < m; c++) {
        const at = Math.min(len, c * STEP);
        // 앞뒤 한 칸까지 필요한 폭을 함께 본다(한 점만 튀어나오지 않게)
        let want = 0;
        for (let d = -1; d <= 1; d++) if (c + d >= 0 && c + d < m) want = Math.max(want, nd[side][c + d]);
        s.push(at);
        v.push(stop(r, at, sg, Math.max(curbAt(r, at, sg), want)));
        if (at >= len) break;
      }
      if (s[s.length - 1] < len) (s.push(len), v.push(stop(r, len, sg, Math.max(curbAt(r, len, sg), nd[side][m - 1]))));
      // 기존 가장자리 자료 자리도 넣고(그 자리 모양을 잃지 않게), 0.05m 안으로 직선 보간되는 점은 지운다
      const old = side === 0 ? r.edge?.r : r.edge?.l;
      if (old)
        for (const so of old.s) {
          if (so <= 0 || so >= len) continue;
          let k = 0;
          while (k + 1 < s.length && s[k + 1] < so) k++;
          if (Math.abs(s[k] - so) < 0.05 || Math.abs((s[k + 1] ?? -1) - so) < 0.05) continue;
          const t = (so - s[k]) / (s[k + 1] - s[k]);
          s.splice(k + 1, 0, so);
          v.splice(k + 1, 0, Math.max(curbAt(r, so, sg), v[k] + (v[k + 1] - v[k]) * t));
        }
      const S = [s[0]];
      const V = [v[0]];
      for (let k = 1; k < s.length - 1; k++) {
        const t = (s[k] - S[S.length - 1]) / (s[k + 1] - S[S.length - 1] || 1);
        const lin = V[V.length - 1] + (v[k + 1] - V[V.length - 1]) * t;
        if (Math.abs(lin - v[k]) > 0.05) (S.push(s[k]), V.push(v[k]));
      }
      S.push(s[s.length - 1]);
      V.push(v[v.length - 1]);
      res.push({ s: S, v: V });
    }
    edges.set(i, [res[0], res[1]]);
    moved++;
  }
  return { edges, moved, far };
}
