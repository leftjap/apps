// 측량 연석(국토지리정보원 정밀도로지도 C3 차량방호안전시설 Type 4 콘크리트연석, 2023 MMS 측량)을 찻길 면 굽기에 넘긴다(재작업 W65).
// 정밀도로지도는 신청·보안서약 뒤 받는 자료라 커밋하지 않는다: tools/raw/ngii/hd-lines.json(tmp/hdmap/extract.py 로 뽑은 판 좌표 선)이 없으면 undefined.
// 교량·고가(A3 차도구간 RoadType 3·5) 위 연석은 땅 위 찻길과 관계없어 그 면을 함께 넘겨 거르게 한다
import { existsSync, readFileSync } from 'node:fs';
import { BOARD_R, toLatLon, toXZ } from '../../src/geo.ts';
import { bitsAt, fillBits, makeBits } from '../lib/bits.ts';

export interface HdCurbs {
  /** 연석 꺾은선 [x0, z0, x1, z1, ...] */
  curbs: Float32Array[];
  /** 땅 위가 아닌 차도구간 면(교량·고가) 고리 */
  decks: Float32Array[];
  /** 찻길 쪽을 정하는 측량 노면선(B2: 중앙선·차선·버스전용·길가장자리·진로변경제한·주정차금지) 꺾은선 */
  lanes: Float32Array[];
  /** 길가장자리구역선(505)·주정차금지선(515) 꺾은선: 어긋난 서울시 연석 쪽 선을 옮길 자리 */
  edges: Float32Array[];
  /** 중앙선(501) 꺾은선: 어긋난 서울시 중앙선을 옮길 자리 */
  centers: Float32Array[];
  /** 차선(503)·진로변경제한선(506) 꺾은선: 어긋난 서울시 차선·진로변경제한선을 옮길 자리 */
  dividers: Float32Array[];
  /** 버스전용차선(504) 꺾은선: 차로 읽기에 버스전용선(k5)으로 넣는다. 차선과 묶으면 서울시 차선이 버스전용선 자리로 옮겨지고 차로 읽기도 일반 차선으로 보아
   *  중앙버스차로 경계에 버스전용선이 빠졌다(재작업 W65) */
  buses: Float32Array[];
}
const LANE_KINDS = ['501', '503', '504', '505', '506', '515'];

export function loadHdCurbs(url = new URL('../raw/ngii/hd-lines.json', import.meta.url)): HdCurbs | undefined {
  if (!existsSync(url)) return undefined;
  const hd = JSON.parse(readFileSync(url, 'utf8')) as Record<string, { a: Record<string, string>; p: number[] }[]>;
  const curbs: Float32Array[] = [];
  const decks: Float32Array[] = [];
  const lanes: Float32Array[] = [];
  const edges: Float32Array[] = [];
  const centers: Float32Array[] = [];
  const dividers: Float32Array[] = [];
  const buses: Float32Array[] = [];
  for (const [k, fs] of Object.entries(hd))
    for (const f of fs) {
      if (k.includes(':C3_') && f.a.Type === '4') curbs.push(Float32Array.from(f.p));
      if (k.includes(':A3_') && f.a.RoadType !== '1') decks.push(Float32Array.from(f.p));
      if (k.includes(':B2_') && LANE_KINDS.includes(f.a.Kind)) lanes.push(Float32Array.from(f.p));
      if (k.includes(':B2_') && (f.a.Kind === '505' || f.a.Kind === '515')) edges.push(Float32Array.from(f.p));
      if (k.includes(':B2_') && f.a.Kind === '501') centers.push(Float32Array.from(f.p));
      if (k.includes(':B2_') && ['503', '506'].includes(f.a.Kind)) dividers.push(Float32Array.from(f.p));
      if (k.includes(':B2_') && f.a.Kind === '504') buses.push(Float32Array.from(f.p));
    }
  return { curbs, decks, lanes, edges, centers, dividers, buses };
}

/** 서울시 연석 쪽 선(가장자리구역선·주정차금지 등): 차로 읽기가 여기서 멈추고(tools/road/read.ts CURB), 찻길 가장자리(bake.ts readEdges)·노면 표시가 이 선을 따른다 */
export const CURB_SIDE = ['007', '009', '010', '011', '015'];

/** 서울시 중앙선(001)·차선(006)·진로변경제한선(008): 차로 읽기가 이 선 사이를 차로로 삼는다(tools/road/read.ts) */
const LANE_SIDE = ['001', '006', '008'];

/**
 * 측량한 길에서 어느 측량 선(연석·노면선)과도 0.8m 넘게 떨어진 서울시 선 자리를 고친다(재작업 W65). 그 자리는 1m 간격으로 짚어 옮긴다.
 *  - 연석 쪽 선(CURB_SIDE): 측량 연석이 4m 안인 자리를 4m 안 가장 가까운 측량 길가장자리구역선·주정차금지선으로, 그런 선이 없으면 측량 연석으로 옮긴다.
 *  - 중앙선은 4m 안 측량 중앙선(501)으로, 차선·진로변경제한선은 2m 안 측량 차선·진로변경제한선(503·506)으로 옮긴다.
 *    같은 종류라도 방향이 25° 넘게 다른 측량 선(교차로에서 만나는 옆길 선)으로는 옮기지 않는다. 차선을 2m 까지만 보는 것은 차로 폭(약 3m)의 반을 넘으면 옆 차선으로 옮겨 가기 때문이다.
 * 서울시 선 가운데 측량과 맞는 자리(0.8m 안)와 옮길 측량 선이 없는 자리(측량하지 않은 길·교차로 안), 교량·고가 면 위, 땅 위가 아닌 선(EVE 002)은 그대로 둔다.
 * (합정 북쪽 월드컵로: 서울시 009 가 연석보다 1.4~2.3m 서쪽이라 바깥 차로가 보도 위까지 잡히고 반대쪽은 바깥 차로 한가운데에 선이 그어졌다.
 *  방울내로: 서울시 중앙선이 측량 중앙선보다 3.6m 서쪽이라 서쪽 방향 차로가 연석 너머까지 잡혔다)
 */
export function fixSeoulLines<T extends { k: string; eve: string; p: [number, number][] }>(lines: T[], hd: HdCurbs): { lines: T[]; log: string } {
  const C = 2;
  const grid = new Map<number, number[]>(); // 2m 칸 → [x, z, 방향 x, 방향 z, 종류(0 연석, 1 노면선, 2 길가장자리, 3 중앙선, 4 차선)] 반복
  const key = (gx: number, gz: number) => (gx + 2000) * 4000 + gz + 2000;
  const add = (p: ArrayLike<number>, t: number) => {
    for (let i = 2; i < p.length; i += 2) {
      const L = Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]);
      if (L < 1e-6) continue;
      for (let s = 0; s <= L; s += 0.25) {
        const x = p[i - 2] + ((p[i] - p[i - 2]) * s) / L;
        const z = p[i - 1] + ((p[i + 1] - p[i - 1]) * s) / L;
        const k = key(Math.floor(x / C), Math.floor(z / C));
        (grid.get(k) ?? grid.set(k, []).get(k)!).push(x, z, (p[i] - p[i - 2]) / L, (p[i + 1] - p[i - 1]) / L, t);
      }
    }
  };
  hd.curbs.forEach((p) => add(p, 0));
  hd.lanes.forEach((p) => add(p, 1));
  hd.edges.forEach((p) => add(p, 2));
  hd.centers.forEach((p) => add(p, 3));
  hd.dividers.forEach((p) => add(p, 4));
  const deck = makeBits(-BOARD_R - 100, -BOARD_R - 100, BOARD_R + 100, BOARD_R + 100, 0.5);
  fillBits(deck, hd.decks, 1);
  const PAR = Math.cos((25 * Math.PI) / 180);
  /** r 안에서 종류가 맞고 (ux, uz 가 있으면) 그 방향과 나란한 가장 가까운 측량 점 [거리, x, z] */
  const nearest = (x: number, z: number, ok: (t: number) => boolean, r: number, ux = 0, uz = 0): [number, number, number] => {
    let best: [number, number, number] = [Infinity, 0, 0];
    const n = Math.ceil(r / C);
    const gx = Math.floor(x / C);
    const gz = Math.floor(z / C);
    for (let i = -n; i <= n; i++)
      for (let j = -n; j <= n; j++) {
        const c = grid.get(key(gx + i, gz + j));
        if (c) for (let q = 0; q < c.length; q += 5) if (ok(c[q + 4]) && (!(ux || uz) || Math.abs(c[q + 2] * ux + c[q + 3] * uz) >= PAR)) {
          const d = Math.hypot(c[q] - x, c[q + 1] - z);
          if (d < best[0] && d <= r) best = [d, c[q], c[q + 1]];
        }
      }
    return best;
  };
  /** 옮길 자리(없으면 undefined) */
  const target = (k: string, x: number, z: number, ux: number, uz: number): [number, number] | undefined => {
    if (CURB_SIDE.includes(k)) {
      if (nearest(x, z, (t) => t === 0, 4)[0] > 4) return undefined;
      // 측량 길가장자리선이 없으면 측량 연석 자리로 옮긴다(측량한 길이라 연석은 4m 안에 있다. 주정차금지선은 연석에 붙여 칠한다)
      let e = nearest(x, z, (t) => t === 2, 4);
      if (e[0] > 4) e = nearest(x, z, (t) => t === 0, 4);
      return [e[1], e[2]];
    }
    const e = k === '001' ? nearest(x, z, (t) => t === 3, 4, ux, uz) : nearest(x, z, (t) => t === 4, 2, ux, uz);
    return e[0] === Infinity ? undefined : [e[1], e[2]];
  };
  const moved: Record<string, number> = { curb: 0, center: 0, lane: 0 };
  const out: T[] = [];
  for (const l of lines) {
    if (!(CURB_SIDE.includes(l.k) || LANE_SIDE.includes(l.k)) || l.eve !== '001') {
      out.push(l);
      continue;
    }
    const P = l.p.map(([a, b]) => toXZ(a, b));
    const pts: [number, number][] = [];
    let changed = false;
    for (let i = 0; i < P.length; i++) {
      const L = i ? Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]) : 0;
      const n = i ? Math.max(1, Math.ceil(L)) : 0;
      // 이 점이 놓인 서울시 선분의 방향(첫 점은 첫 선분)
      const [a, b] = i ? [P[i - 1], P[i]] : [P[0], P[1] ?? P[0]];
      const al = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const [ux, uz] = [(b[0] - a[0]) / al, (b[1] - a[1]) / al];
      for (let s = i ? 1 : 0; s <= n; s++) {
        const x = i ? P[i - 1][0] + ((P[i][0] - P[i - 1][0]) * s) / n : P[0][0];
        const z = i ? P[i - 1][1] + ((P[i][1] - P[i - 1][1]) * s) / n : P[0][1];
        const step = i ? L / n : 0;
        // 측량 선 0.8m 안이면 그대로 둔다. 다만 중앙선은 0.8m 안 측량 선이 중앙선이 아니고(차선 자리에 칠한 서울시 중앙선) 4m 안에 나란한 측량 중앙선이 있으면 그리로 옮긴다
        // (합정 북쪽 월드컵로: 서울시 중앙선이 측량 차선 자리에, 측량 중앙선은 3m 옆이라 서울시 중앙선 조각이 정본 중앙선과 따로 그려져 차로가 넘었다)
        // 차선·진로변경제한선은 2m 안에 나란한 측량 차선이 있으면 가까운 다른 측량 선과 상관없이 그 선으로 옮긴다: 0.3~0.6m 어긋난 서울시 차선과 측량 차선이
        // 함께 차로 읽기에 들어가 차로가 칠한 선과 다르게 나뉘었고(화살표가 칸 가운데로 옮겨지지 못함, 1372,715), 길가장자리선 0.7m 옆에 남은 서울시 차선은
        // 차로가 그 선 위를 달렸다(1104,377). 차선은 길가장자리선에서 차로 폭만큼 떨어져 있다
        const near08 = nearest(x, z, (t) => t <= 2, 0.8)[0] <= 0.8;
        const stay = near08 && !(l.k === '001' && nearest(x, z, (t) => t === 3, 0.8, ux, uz)[0] > 0.8) && !(l.k !== '001' && nearest(x, z, (t) => t === 4, 2, ux, uz)[0] <= 2);
        const e = bitsAt(deck, x, z) || stay ? undefined : target(l.k, x, z, ux, uz);
        if (!e) {
          pts.push([x, z]);
          continue;
        }
        changed = true;
        pts.push(e);
        moved[CURB_SIDE.includes(l.k) ? 'curb' : l.k === '001' ? 'center' : 'lane'] += step;
      }
    }
    if (!changed) {
      out.push(l);
      continue;
    }
    // 옮긴 점이 겹치면(같은 측량 점으로 옮김) 길이 0 선분이 생겨 그릴 때 선 폭이 0 이 되므로 0.1m 안 이웃 점은 하나로 두고,
    // 이웃 점이 2m 넘게 벌어지면(1m 로 짚었는데 다른 측량 선으로 옮겨 감) 그 자리에서 선을 끊는다
    let cur: [number, number][] = [];
    const flush = () => {
      if (cur.length >= 2) out.push({ ...l, p: cur.map(([x, z]) => toLatLon(x, z)) });
      cur = [];
    };
    for (const p of pts) {
      const q = cur[cur.length - 1];
      const d = q ? Math.hypot(p[0] - q[0], p[1] - q[1]) : 1;
      if (d < 0.1) continue;
      if (d > 2) flush();
      cur.push(p);
    }
    flush();
  }
  const m = (v: number) => Math.round(v);
  return { lines: out, log: `측량과 어긋난 서울시 선을 측량 선 자리로 옮김: 연석 쪽 선 ${m(moved.curb)}m, 중앙선 ${m(moved.center)}m, 차선·진로변경제한선 ${m(moved.lane)}m` };
}

/** 차로 읽기(tools/road/read.ts)에 서울시 선과 함께 넣는 측량 선: 측량 중앙선 → 1, 차선·버스전용·진로변경제한선 → 6, 길가장자리구역선·주정차금지선 → 10, 연석 → SURVEY_CURB.
 *  서울시 자료에 차선·연석 쪽 선이 빠진 길(와우산로 등)에서 차로를 OSM 차로 수와 기본 폭으로 채우면 바깥 차로가 연석 위에 놓여, 측량한 길에서는 측량 선으로 차로를 읽는다.
 *  서울시 선과 겹치는 측량 선(0.8m 안으로 맞춘 자리)은 차로 읽기가 2.3m 보다 좁은 사이로 보고 건너뛴다. 땅 위 선만 쓰므로 교량·고가 면 안은 뺀다(높이 0) */
export const SURVEY_CURB = 99;
export function hdLaneLines(hd: HdCurbs): { k: number; k2: number; p: Float32Array }[] {
  const deck = makeBits(-BOARD_R - 100, -BOARD_R - 100, BOARD_R + 100, BOARD_R + 100, 0.5);
  fillBits(deck, hd.decks, 1);
  const out: { k: number; k2: number; p: Float32Array }[] = [];
  for (const [k, ls] of [[1, hd.centers], [6, hd.dividers], [5, hd.buses], [10, hd.edges], [SURVEY_CURB, hd.curbs]] as const)
    for (const l of ls) {
      let run: number[] = [];
      const flush = () => (run.length >= 6 && out.push({ k, k2: 0, p: Float32Array.from(run) }), (run = []));
      for (let i = 0; i < l.length; i += 2) {
        if (bitsAt(deck, l[i], l[i + 1])) flush();
        else run.push(l[i], 0, l[i + 1]);
      }
      flush();
    }
  return out;
}

/** OSM 회전교차로 고리(junction=roundabout 닫힌 길)를 그 안에 든 측량 교통섬(닫힌 연석 고리, 고리보다 작다)에 중심을 맞춰 옮긴다(재작업 W65).
 *  OSM 고리는 손으로 그린 선이라 측량 섬보다 5.4m 어긋난 곳이 있었고(고리 차로가 섬 위를 지났다), 반지름(회전 차로 가운데)은 섬과 바깥 연석 사이와 맞아 옮기기만 한다.
 *  고리 노드를 쓰는 모든 길(드나드는 길 끝 포함)의 geometry 를 그 자리에서 고친다 */
export function fitRoundabouts(ways: { tags?: Record<string, string>; nodes?: number[]; geometry?: { lat: number; lon: number }[] }[], hd: HdCurbs): string {
  const islands = hd.curbs.filter((p) => p.length >= 8 && Math.hypot(p[0] - p[p.length - 2], p[1] - p[p.length - 1]) <= 0.5).map((p) => {
    const n = p.length / 2 - 1;
    let [cx, cz] = [0, 0];
    for (let i = 0; i < n * 2; i += 2) (cx += p[i] / n), (cz += p[i + 1] / n);
    let r = 0;
    for (let i = 0; i < n * 2; i += 2) r = Math.max(r, Math.hypot(p[i] - cx, p[i + 1] - cz));
    return { cx, cz, r };
  });
  const shift = new Map<number, [number, number]>();
  const log: string[] = [];
  for (const w of ways) {
    const N = w.nodes;
    if (w.tags?.junction !== 'roundabout' || !N || !w.geometry || N.length < 4 || N[0] !== N[N.length - 1]) continue;
    const P = w.geometry.slice(0, -1).map((g) => toXZ(g.lat, g.lon));
    const cx = P.reduce((a, q) => a + q[0], 0) / P.length;
    const cz = P.reduce((a, q) => a + q[1], 0) / P.length;
    const rs = P.map(([x, z]) => Math.hypot(x - cx, z - cz));
    const [rmin, rmax] = [Math.min(...rs), Math.max(...rs)];
    const isl = islands.filter((s) => s.r < rmin && Math.hypot(s.cx - cx, s.cz - cz) < rmax).sort((a, b) => Math.hypot(a.cx - cx, a.cz - cz) - Math.hypot(b.cx - cx, b.cz - cz))[0];
    if (!isl) continue;
    for (const n of N) shift.set(n, [isl.cx - cx, isl.cz - cz]);
    log.push(`${Math.hypot(isl.cx - cx, isl.cz - cz).toFixed(1)}m`);
  }
  if (!shift.size) return '측량 섬에 맞춘 회전교차로 0곳';
  for (const w of ways)
    w.nodes?.forEach((n, i) => {
      const d = shift.get(n);
      const g = w.geometry?.[i];
      if (!d || !g) return;
      const [x, z] = toXZ(g.lat, g.lon);
      [g.lat, g.lon] = toLatLon(x + d[0], z + d[1]);
    });
  return `측량 섬에 맞춘 회전교차로 ${log.length}곳(옮긴 거리 ${log.join('·')})`;
}
