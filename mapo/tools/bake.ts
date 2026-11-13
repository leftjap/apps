// tools/raw/ 의 OSM 원자료를 모형판 자료(public/data/board.json, mask.png)로 굽는다.
// 실행: node tools/bake.ts
import { readFileSync, writeFileSync } from 'node:fs';
import { BOARD_R, toXZ } from '../src/geo.ts';
import { cumLen, nearestS } from '../src/poly.ts';
import { rampHeight } from './lib/elevate.ts';
import { estimateHeight, hash01 } from './lib/height.ts';
import { busKind, traceRuns } from './lib/bus.ts';
import { stitch } from './lib/rail.ts';
import { encodePng, fillPolygon, strokeLine } from './lib/raster.ts';

type Tags = Record<string, string>;
interface LL {
  lat: number;
  lon: number;
}
interface El {
  type: 'node' | 'way' | 'relation';
  id: number;
  tags?: Tags;
  lat?: number;
  lon?: number;
  nodes?: number[];
  geometry?: LL[];
  members?: { type: string; ref: number; role: string; geometry?: LL[]; lat?: number; lon?: number }[];
}

const raw = (name: string): El[] => JSON.parse(readFileSync(new URL(`./raw/${name}.json`, import.meta.url), 'utf8')).elements;
const xz = (g: LL[]) => g.map((p) => toXZ(p.lat, p.lon));
const dm = (v: number) => Math.round(v * 10);
const inBoard = (x: number, z: number, margin = 0) => Math.hypot(x, z) <= BOARD_R - margin;

/** 원소의 다각형 고리들(판 좌표). 관계는 outer·inner 구성 길을 그대로 고리 조각으로 쓴다(짝홀 판정에는 이어 붙일 필요가 없다). */
function ringsOf(el: El): [number, number][][] {
  if (el.type === 'way' && el.geometry) return [xz(el.geometry)];
  if (el.type === 'relation') return (el.members ?? []).filter((m) => m.geometry && m.type === 'way').map((m) => xz(m.geometry!));
  return [];
}

/** 짝홀 규칙의 점 포함 판정. 고리 조각들이 합쳐서 닫혀 있으면 된다. */
function inside(rings: [number, number][][], x: number, z: number): boolean {
  let c = false;
  for (const r of rings)
    for (let i = 0; i + 1 < r.length; i++) {
      const [ax, az] = r[i];
      const [bx, bz] = r[i + 1];
      if (az > z !== bz > z && x < ax + ((z - az) / (bz - az)) * (bx - ax)) c = !c;
    }
  return c;
}

// ───────────────────────── 랜드마크 영역 ─────────────────────────
const campus = raw('campus');
const hongikRings = campus.filter((e) => (e.tags?.name ?? '').includes('홍익대학교')).flatMap(ringsOf);

// ───────────────────────── 건물 ─────────────────────────
/** 이름으로 고르는 랜드마크 건물 번호(1 = 홍익대 캠퍼스 안, 2~5 는 역·다리가 쓴다) */
const NAMED_LM: [RegExp, number][] = [
  [/경성(중학교|고등학교)/, 6],
  [/홍익대학교사범대학부속/, 7],
  [/마포소방서/, 8],
  [/마포중앙도서관/, 9],
  [/상상마당/, 10],
  [/절두산/, 11],
  [/양화진외국인선교사묘원/, 12],
  [/메세나폴리스/, 13],
];
const buildings: number[][] = [];
/** 마스크에 바닥 그늘을 칠할 건물 외곽선 */
const footprints: [number, number][][] = [];
for (const el of raw('buildings')) {
  const tags = el.tags ?? {};
  if (tags.location === 'underground' || Number(tags.layer) < 0) continue;
  const outers =
    el.type === 'way' ? [el.geometry!] : (el.members ?? []).filter((m) => m.role === 'outer' && m.geometry).map((m) => m.geometry!);
  for (const g of outers) {
    let pts = xz(g);
    if (pts.length < 4) continue;
    const [fx, fz] = pts[0];
    const [lx, lz] = pts[pts.length - 1];
    if (Math.hypot(fx - lx, fz - lz) > 0.5) continue; // 닫히지 않은 조각
    pts = pts.slice(0, -1).filter((p, i, a) => i === 0 || Math.hypot(p[0] - a[i - 1][0], p[1] - a[i - 1][1]) > 0.3);
    if (pts.length < 3) continue;
    let area = 0;
    let cx = 0;
    let cz = 0;
    for (let i = 0; i < pts.length; i++) {
      const [ax, az] = pts[i];
      const [bx, bz] = pts[(i + 1) % pts.length];
      area += ax * bz - bx * az;
      cx += ax;
      cz += az;
    }
    area /= 2;
    cx /= pts.length;
    cz /= pts.length;
    if (Math.abs(area) < 12 || !pts.every(([x, z]) => inBoard(x, z, 4))) continue;
    if (area < 0) pts.reverse(); // 넓이가 양수가 되는 방향으로 통일
    const h = Math.max(3, Math.min(260, estimateHeight(tags, Math.abs(area), el.id)));
    const lm = inside(hongikRings, cx, cz) ? 1 : (NAMED_LM.find(([re]) => re.test(tags.name ?? ''))?.[1] ?? 0);
    buildings.push([dm(h), lm, ...pts.flatMap(([x, z]) => [dm(x), dm(z)])]);
    footprints.push(pts);
  }
}

// ───────────────────────── 도로 ─────────────────────────
const CLS: Record<string, number> = {
  motorway: 0, trunk: 0, motorway_link: 0, trunk_link: 0,
  primary: 1, primary_link: 1,
  secondary: 2, secondary_link: 2,
  tertiary: 3, tertiary_link: 3,
  unclassified: 4, residential: 4, living_street: 4,
  service: 5,
  pedestrian: 6,
  footway: 7, path: 7, cycleway: 7, steps: 7,
};
const isBridge = (t: Tags) => !!t.bridge && t.bridge !== 'no';
const hw = raw('highways').filter((e) => {
  const t = e.tags ?? {};
  if (!e.geometry || !e.nodes) return false;
  if (t.area === 'yes' || t.access === 'private' || t.access === 'no') return false;
  if (t.footway === 'sidewalk' || t.footway === 'crossing') return false;
  if (t.service === 'parking_aisle' || t.service === 'driveway') return false;
  if (t.indoor === 'yes' || (t.highway === 'steps' && !isBridge(t))) return false;
  if (t.tunnel && t.tunnel !== 'no' && CLS[t.highway] >= 6) return false; // 지하 보도
  return true;
});

// 교차점: 두 번 이상 쓰인 노드
const use = new Map<number, number>();
const groundUse = new Set<number>(); // 교량이 아닌 길이 지나는 노드
for (const w of hw)
  for (const n of w.nodes!) {
    use.set(n, (use.get(n) ?? 0) + 1);
    if (!isBridge(w.tags!)) groundUse.add(n);
  }

// 교량 높이: 이어진 교량 묶음마다 땅에 닿는 노드에서의 거리로 정한다
const nodeY = new Map<number, number>();
{
  const pos = new Map<number, [number, number]>();
  const adj = new Map<number, [number, number][]>(); // 노드 → [이웃, 거리]
  const top = new Map<number, number>(); // 노드 → 그 노드를 지나는 교량의 목표 높이
  const bridges = hw.filter((w) => isBridge(w.tags!));
  for (const w of bridges) {
    const p = xz(w.geometry!);
    const layer = Number(w.tags!.layer) || 1;
    const h = layer >= 3 ? 17 : layer === 2 ? 12 : 7;
    w.nodes!.forEach((n, i) => {
      pos.set(n, p[i]);
      top.set(n, Math.max(top.get(n) ?? 0, h));
      if (i) {
        const m = w.nodes![i - 1];
        const d = Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
        (adj.get(n) ?? adj.set(n, []).get(n)!).push([m, d]);
        (adj.get(m) ?? adj.set(m, []).get(m)!).push([n, d]);
      }
    });
  }
  // 묶음 찾기
  const comp = new Map<number, number>();
  let nc = 0;
  for (const n of pos.keys()) {
    if (comp.has(n)) continue;
    const stack = [n];
    comp.set(n, nc);
    while (stack.length) for (const [m] of adj.get(stack.pop()!) ?? []) if (!comp.has(m)) comp.set(m, nc), stack.push(m);
    nc++;
  }
  const compTop = new Array(nc).fill(0);
  const compLen = new Array(nc).fill(0);
  for (const [n, c] of comp) {
    compTop[c] = Math.max(compTop[c], top.get(n)!);
    for (const [, d] of adj.get(n) ?? []) compLen[c] += d / 2;
  }
  // 긴 묶음(한강 다리)은 더 높게
  for (let c = 0; c < nc; c++) if (compLen[c] > 900) compTop[c] = Math.max(compTop[c], 13);
  // 땅에 닿는 노드에서 퍼져 나가는 최단 거리
  const dist = new Map<number, number>();
  const queue: number[] = [];
  for (const n of pos.keys())
    if (groundUse.has(n)) {
      dist.set(n, 0);
      queue.push(n);
    }
  while (queue.length) {
    queue.sort((a, b) => dist.get(b)! - dist.get(a)!);
    const n = queue.pop()!;
    for (const [m, d] of adj.get(n) ?? []) {
      const nd = dist.get(n)! + d;
      if (nd < (dist.get(m) ?? Infinity)) {
        dist.set(m, nd);
        queue.push(m);
      }
    }
  }
  for (const [n, c] of comp) nodeY.set(n, rampHeight(dist.get(n) ?? Infinity, compTop[c]));
}

const names: string[] = [];
const nameIdx = (s?: string) => {
  if (!s) return -1;
  let i = names.indexOf(s);
  if (i < 0) i = names.push(s) - 1;
  return i;
};
/** 다리 랜드마크 번호. 서강대교는 OSM에 다리 이름이 없고 도로명(서강로)만 있다. */
const bridgeLm = (t: Tags) => (t['bridge:name'] === '양화대교' ? 5 : t.name === '서강로' || t['bridge:name'] === '서강대교' ? 4 : 0);

const roads: number[][] = [];
/** 길 id → 판 안에서 잘린 조각들. s→e 는 저장된 방향의 첫 노드와 끝 노드. 버스 노선을 조각 순서로 바꿀 때 쓴다 */
const piecesOf = new Map<number, { road: number; s: number; e: number; oneway: boolean }[]>();
for (const w of hw) {
  const t = w.tags!;
  const cls = CLS[t.highway];
  const pts = xz(w.geometry!);
  const oneway = t.oneway === 'yes' || t.oneway === '1' || t.junction === 'roundabout' || (t.highway.startsWith('motorway') && t.oneway !== 'no') ? 1 : 0;
  const rev = t.oneway === '-1';
  const lanesTag = parseInt(t.lanes ?? '');
  const lanes = lanesTag > 0 ? Math.min(8, lanesTag) : cls === 0 ? (oneway ? 3 : 6) : cls === 1 ? (oneway ? 3 : 6) : cls === 2 ? (oneway ? 2 : 4) : cls === 3 ? 2 : 1;
  const bridge = isBridge(t) ? 1 : 0;
  const lm = bridge ? bridgeLm(t) : 0;
  const head = [cls, lanes, oneway || rev ? 1 : 0, bridge, nameIdx(t.name), lm];
  // 교차점마다 끊고, 판 밖으로 나간 부분은 버린다
  let cur: number[] = [];
  let curN: number[] = [];
  const flush = () => {
    if (cur.length >= 6) {
      const list = piecesOf.get(w.id) ?? piecesOf.set(w.id, []).get(w.id)!;
      const [a, b] = [curN[0], curN[curN.length - 1]];
      list.push({ road: roads.length, s: rev ? b : a, e: rev ? a : b, oneway: !!(oneway || rev) });
      if (rev) {
        const r: number[] = [];
        for (let i = cur.length - 3; i >= 0; i -= 3) r.push(cur[i], cur[i + 1], cur[i + 2]);
        cur = r;
      }
      roads.push([...head, ...cur]);
    }
    cur = [];
    curN = [];
  };
  pts.forEach(([x, z], i) => {
    const n = w.nodes![i];
    if (!inBoard(x, z, 2)) return flush();
    cur.push(dm(x), dm(nodeY.get(n) ?? 0), dm(z));
    curN.push(n);
    if (i > 0 && i < pts.length - 1 && use.get(n)! > 1) {
      flush();
      cur.push(dm(x), dm(nodeY.get(n) ?? 0), dm(z));
      curN.push(n);
    }
  });
  flush();
}

// ───────────────────────── 버스 노선 ─────────────────────────
// 관계에 속한 길들의 조각만 따라 이어 달릴 수 있는 길을 찾는다(관계의 길 순서는 뒤섞인 경우가 많아 쓰지 않는다).
// 정류장은 노선 오른쪽 18m 안의 버스 정류장 노드로 정한다(노선마다 실제로 서는 정류장과 다를 수 있다).
const busStops = raw('busstops').filter((e) => e.type === 'node' && e.tags?.name);
const roadPts = (signed: number): number[] => {
  const r = roads[Math.abs(signed) - 1];
  const out: number[] = [];
  for (let i = 6; i < r.length; i += 3) out.push(r[i] / 10, r[i + 1] / 10, r[i + 2] / 10);
  if (signed > 0) return out;
  const back: number[] = [];
  for (let i = out.length - 3; i >= 0; i -= 3) back.push(out[i], out[i + 1], out[i + 2]);
  return back;
};
const runLine = (run: number[]) => {
  const p: number[] = [];
  for (const v of run) {
    const q = roadPts(v);
    p.push(...(p.length ? q.slice(3) : q));
  }
  return p;
};
const straight = (a: number, b: number) => {
  const p = roadPts(a);
  const q = roadPts(b);
  const n = p.length;
  const ax = p[n - 3] - p[n - 6];
  const az = p[n - 1] - p[n - 4];
  const bx = q[3] - q[0];
  const bz = q[5] - q[2];
  return (ax * bx + az * bz) / ((Math.hypot(ax, az) || 1) * (Math.hypot(bx, bz) || 1));
};
const busRels = raw('buses').filter((r) => r.type === 'relation' && r.tags?.ref && !/셔틀/.test(r.tags.name ?? ''));
const busRuns: { ref: string; kind: number; to: number; segs: number[]; stops: number[] }[] = [];
const runKeys: { ref: string; a: number[]; b: number[]; len: number }[] = [];
for (const rel of busRels) {
  const t = rel.tags!;
  const memberOf = new Map<number, number>(); // 조각 → 관계에서 그 길의 순번
  const segs = rel.members!.flatMap((m, i) => {
    if (m.type !== 'way' || /^platform/.test(m.role)) return [];
    const ps = piecesOf.get(m.ref) ?? [];
    for (const p of ps) memberOf.set(p.road, i);
    return ps;
  });
  const toName = t.to ?? t.name?.split(/→|->/)[1]?.trim() ?? '';
  for (const r of traceRuns(segs, straight)) {
    const line = runLine(r);
    const cum = cumLen(line);
    const len = cum[cum.length - 1];
    if (len < 300) continue;
    const a = [line[0], line[2]];
    const b = [line[line.length - 3], line[line.length - 1]];
    const near = (p: number[], q: number[]) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 60;
    if (runKeys.some((k) => k.ref === t.ref && near(k.a, a) && near(k.b, b) && Math.abs(k.len - len) < len * 0.15)) continue;
    runKeys.push({ ref: t.ref, a, b, len });
    // 관계에 적힌 순서대로 지나면 to 쪽, 거꾸로 지나면 from 쪽으로 간다
    const forward = memberOf.get(Math.abs(r[r.length - 1]) - 1)! >= memberOf.get(Math.abs(r[0]) - 1)!;
    const to = forward ? toName : (t.from ?? '');
    const stops: [number, number][] = [];
    for (const st of busStops) {
      const [x, z] = toXZ(st.lat!, st.lon!);
      const q = nearestS(line, cum, x, z);
      if (q.d > 18 || q.s < 20 || q.s > len - 20) continue;
      let seg = 0;
      while (seg < cum.length - 2 && cum[seg + 1] < q.s) seg++;
      const dx = line[seg * 3 + 3] - line[seg * 3];
      const dz = line[seg * 3 + 5] - line[seg * 3 + 2];
      const right = (x - line[seg * 3]) * -dz + (z - line[seg * 3 + 2]) * dx;
      if (right < 0 && q.d > 3) continue;
      if (stops.some(([s]) => Math.abs(s - q.s) < 60)) continue;
      stops.push([q.s, nameIdx(st.tags!.name)]);
    }
    stops.sort((p, q) => p[0] - q[0]);
    busRuns.push({ ref: t.ref, kind: busKind(t.ref, t.colour), to: nameIdx(to.replace(/\(.*?\)/g, '').trim()), segs: r, stops: stops.flatMap(([s, n]) => [dm(s), n]) });
  }
}
// 같은 번호에서 이미 고른 길과 조각이 60% 넘게 겹치는 갈래는 뺀다(긴 것부터 고른다). 버스가 겹쳐 두 배로 다니지 않게 한다
{
  const kept: typeof busRuns = [];
  const order = [...busRuns].sort((p, q) => q.segs.length - p.segs.length);
  for (const run of order) {
    const mine = new Set(run.segs);
    const dup = kept.some((k) => k.ref === run.ref && k.segs.filter((v) => mine.has(v)).length > run.segs.length * 0.6);
    if (!dup) kept.push(run);
  }
  busRuns.length = 0;
  busRuns.push(...kept);
}
// 버스가 지나는 골목·진입로도 차가 달릴 수 있게 표시한다(세 번째 칸의 둘째 비트)
for (const run of busRuns) for (const v of run.segs) roads[Math.abs(v) - 1][2] |= 2;

// ───────────────────────── 마스크 (빨강 = 물, 초록 = 녹지, 파랑 = 건물 그늘) ─────────────────────────
const SIZE = 2048;
const HALF = 2048; // 마스크가 덮는 범위는 ±2048m, 한 칸 2m
const px = (v: number) => (v + HALF) / ((2 * HALF) / SIZE);
const mask = new Uint8Array(SIZE * SIZE * 4);
const toPx = (r: [number, number][]) => r.flatMap(([x, z]) => [px(x), px(z)]);

for (const el of raw('water')) {
  const t = el.tags ?? {};
  if (t.tunnel || t.covered === 'yes' || t.location === 'underground') continue;
  if (t.waterway && t.waterway !== 'riverbank') {
    if (el.geometry && (t.waterway === 'stream' || t.waterway === 'canal')) strokeLine(mask, SIZE, toPx(xz(el.geometry)), 5, 0);
    continue;
  }
  const rings = ringsOf(el).map(toPx);
  if (rings.length) fillPolygon(mask, SIZE, rings, 0);
}
for (const el of raw('green')) {
  const rings = ringsOf(el).map(toPx);
  if (rings.length) fillPolygon(mask, SIZE, rings, 1);
}
for (const f of footprints) fillPolygon(mask, SIZE, [toPx([...f, f[0]])], 2);
// 건물 그늘을 번지게 한다(반지름 3칸 상자 흐림 두 번)
{
  const src = new Float32Array(SIZE * SIZE);
  for (let i = 0; i < SIZE * SIZE; i++) src[i] = mask[i * 4 + 2];
  const tmp = new Float32Array(SIZE * SIZE);
  const R = 3;
  const blur = (a: Float32Array, b: Float32Array, stepX: number, stepY: number) => {
    for (let y = 0; y < SIZE; y++)
      for (let x = 0; x < SIZE; x++) {
        let s = 0;
        let n = 0;
        for (let k = -R; k <= R; k++) {
          const xx = x + k * stepX;
          const yy = y + k * stepY;
          if (xx < 0 || yy < 0 || xx >= SIZE || yy >= SIZE) continue;
          s += a[yy * SIZE + xx];
          n++;
        }
        b[y * SIZE + x] = s / n;
      }
  };
  for (let pass = 0; pass < 2; pass++) {
    blur(src, tmp, 1, 0);
    blur(tmp, src, 0, 1);
  }
  for (let i = 0; i < SIZE * SIZE; i++) {
    mask[i * 4 + 2] = Math.round(src[i] / 17) * 17; // 16단계로 줄여 파일을 작게 한다
    mask[i * 4 + 3] = 255;
  }
}

// ───────────────────────── 나무: 녹지 칸에 고정 난수로 뿌린다 ─────────────────────────
const trees: number[] = [];
{
  let green = 0;
  for (let i = 0; i < SIZE * SIZE; i++) if (mask[i * 4 + 1] && !mask[i * 4]) green++;
  const prob = Math.min(0.03, 5200 / Math.max(1, green));
  for (let iz = 0; iz < SIZE; iz++)
    for (let ix = 0; ix < SIZE; ix++) {
      const i = iz * SIZE + ix;
      if (!mask[i * 4 + 1] || mask[i * 4] || mask[i * 4 + 2] > 40) continue;
      if (hash01(i, 5) > prob) continue;
      const x = (ix + hash01(i, 6)) * 2 - HALF;
      const z = (iz + hash01(i, 7)) * 2 - HALF;
      if (inBoard(x, z, 12)) trees.push(dm(x), dm(z));
    }
}

// ───────────────────────── 노선 ─────────────────────────
interface LineSpec {
  id: string;
  name: string;
  color: string;
  cars: number;
  /** 이 노선의 선로를 가려내는 판정 */
  match: (t: Tags) => boolean;
  /** 판 안에서 서는 역. 나란히 지나는 다른 노선의 역을 잘못 붙이지 않도록 적어 둔다 */
  stations: string[];
}
const LINES: LineSpec[] = [
  { id: '2', name: '2호선', color: '#3cb44a', cars: 10, match: (t) => /2호선/.test(t.name ?? ''), stations: ['합정', '홍대입구', '신촌'] },
  { id: '6', name: '6호선', color: '#c8732c', cars: 8, match: (t) => /6호선/.test(t.name ?? ''), stations: ['광흥창', '상수', '합정', '망원', '마포구청'] },
  { id: 'K', name: '경의중앙선', color: '#72c7a6', cars: 8, match: (t) => /용산선/.test(t.name ?? ''), stations: ['홍대입구', '서강대'] }, // 가좌 남쪽에서 지하로 들어가 홍대입구·서강대를 지나는 구간
  { id: 'A', name: '공항철도', color: '#3d99c2', cars: 6, match: (t) => /공항철도|인천국제공항/.test(t.name ?? ''), stations: ['홍대입구'] },
];
const railWays = raw('railways').filter((e) => e.geometry && !e.tags?.service);
const stationNodes = raw('stations').filter((e) => e.tags?.railway === 'station' || e.tags?.railway === 'halt');
const cleanName = (s: string) => s.replace(/\(.*\)/, '').replace(/역$/, '').trim();

const lines = LINES.map((spec) => {
  const ways = railWays.filter((w) => spec.match(w.tags ?? {}));
  const tagOf = new Map<string, Tags>();
  const pieces = ways.map((w) => {
    const pts = xz(w.geometry!);
    for (const p of pts) tagOf.set(`${Math.round(p[0] * 10)},${Math.round(p[1] * 10)}`, w.tags!);
    return { id: w.id, pts };
  });
  const chain = stitch(pieces);
  // 높이: 터널 −14m, 교량 +12m, 나머지 0. 뒤에서 150m 이동 평균으로 다듬는다
  const rawY = chain.map((p) => {
    const t = tagOf.get(`${Math.round(p[0] * 10)},${Math.round(p[1] * 10)}`) ?? {};
    if (t.bridge && t.bridge !== 'no') return 12;
    if ((t.tunnel && t.tunnel !== 'no') || Number(t.layer) < 0) return -14;
    return 0;
  });
  // 30m 간격으로 다시 찍어 고르게 만든다
  const flat = chain.flatMap(([x, z], i) => [x, rawY[i], z]);
  const cum0 = cumLen(flat);
  const total = cum0[cum0.length - 1];
  const samples: [number, number, number][] = [];
  {
    let seg = 0;
    for (let s = 0; s <= total; s += 15) {
      while (seg < cum0.length - 2 && cum0[seg + 1] < s) seg++;
      const t = (s - cum0[seg]) / Math.max(1e-6, cum0[seg + 1] - cum0[seg]);
      const a = seg * 3;
      samples.push([flat[a] + (flat[a + 3] - flat[a]) * t, flat[a + 1] + (flat[a + 4] - flat[a + 1]) * t, flat[a + 2] + (flat[a + 5] - flat[a + 2]) * t]);
    }
  }
  const W = 6; // 앞뒤 6점(90m)씩 평균
  const smoothY = samples.map((_, i) => {
    let s = 0;
    let n = 0;
    for (let k = Math.max(0, i - W); k <= Math.min(samples.length - 1, i + W); k++) (s += samples[k][1]), n++;
    return s / n;
  });
  // 판 안에 있는 가장 긴 연속 구간만 남긴다
  let best: number[] = [];
  let cur: number[] = [];
  samples.forEach(([x, , z], i) => {
    if (inBoard(x, z, 1)) cur.push(x, smoothY[i], z);
    else {
      if (cur.length > best.length) best = cur;
      cur = [];
    }
  });
  if (cur.length > best.length) best = cur;
  const cum = cumLen(best);
  // 역: 이름이 같은 역 노드 가운데 이 선에 60m 안으로 붙는 것
  const stops = new Map<string, { s: number; d: number }>();
  for (const st of stationNodes) {
    const [x, z] = toXZ(st.lat!, st.lon!);
    if (!inBoard(x, z, 30)) continue;
    const r = nearestS(best, cum, x, z);
    const name = cleanName(st.tags!.name ?? '');
    if (r.d > 60 || !spec.stations.includes(name)) continue;
    if (r.d < (stops.get(name)?.d ?? Infinity)) stops.set(name, r); // 같은 이름의 역 노드가 여럿이면 선에 가장 가까운 것
  }
  const st = [...stops].map(([name, r]) => ({ name, s: Math.round(r.s) })).sort((a, b) => a.s - b.s);
  return { id: spec.id, name: spec.name, color: spec.color, cars: spec.cars, p: best.map(dm), stops: st, _ways: ways.length, _len: Math.round(cum[cum.length - 1] ?? 0) };
});

// ───────────────────────── 역과 출구 ─────────────────────────
const stationPos = new Map<string, { x: number; z: number; n: number }>();
for (const st of stationNodes) {
  const [x, z] = toXZ(st.lat!, st.lon!);
  if (!inBoard(x, z, 30)) continue;
  const name = cleanName(st.tags!.name ?? '');
  if (!name) continue;
  const a = stationPos.get(name) ?? { x: 0, z: 0, n: 0 };
  a.x += x;
  a.z += z;
  a.n++;
  stationPos.set(name, a);
}
const stations = [...stationPos].map(([name, a]) => ({ name, x: dm(a.x / a.n), z: dm(a.z / a.n) }));
const exits: { st: string; x: number; z: number; ref: string }[] = [];
for (const e of raw('stations').filter((e) => e.tags?.railway === 'subway_entrance')) {
  const [x, z] = toXZ(e.lat!, e.lon!);
  if (!inBoard(x, z, 20)) continue;
  let bestName = '';
  let bestD = 380;
  for (const s of stations) {
    const d = Math.hypot(s.x / 10 - x, s.z / 10 - z);
    if (d < bestD) (bestD = d), (bestName = s.name);
  }
  if (bestName) exits.push({ st: bestName, x: dm(x), z: dm(z), ref: e.tags?.ref ?? '' });
}

// ───────────────────────── 랜드마크 중심 ─────────────────────────
const center = (pts: number[][]) => {
  const n = Math.max(1, pts.length);
  return { x: dm(pts.reduce((s, p) => s + p[0], 0) / n), z: dm(pts.reduce((s, p) => s + p[1], 0) / n) };
};
const roadCenter = (lm: number) => {
  const pts: number[][] = [];
  for (const r of roads) if (r[5] === lm) for (let i = 6; i < r.length; i += 3) pts.push([r[i] / 10, r[i + 2] / 10]);
  return center(pts);
};
const stationCenter = (name: string) => {
  const s = stations.find((s) => s.name === name);
  return { x: s?.x ?? 0, z: s?.z ?? 0 };
};
const landmarks = [
  { id: 'hongik', ...center(buildings.filter((b) => b[1] === 1).map((b) => [b[2] / 10, b[3] / 10])) },
  { id: 'hongik-stn', ...stationCenter('홍대입구') },
  { id: 'hapjeong-stn', ...stationCenter('합정') },
  { id: 'seogang-br', ...roadCenter(4) },
  { id: 'yanghwa-br', ...roadCenter(5) },
];

// ───────────────────────── 쓰기 ─────────────────────────
// ───────────────────────── 홍익대 캠퍼스 바닥, 한강 물길, 피크닉 자리 ─────────────────────────
// 캠퍼스: 가장 넓은 외곽 고리
const campusRing = [...hongikRings].sort((a, b) => b.length - a.length)[0] ?? [];
// 물길: 판 남쪽 한강에서 20m 간격 세로줄마다 가장 긴 물 구간의 가운데
const river: number[] = [];
{
  const cz: [number, number][] = [];
  for (let x = -1990; x <= 1990; x += 20) {
    const col = Math.round(px(x));
    let best = [0, 0];
    let run = -1;
    for (let zz = 300; zz <= 2040; zz += 2) {
      const water = mask[(Math.round(px(zz)) * SIZE + col) * 4] > 0;
      if (water && run < 0) run = zz;
      if ((!water || zz >= 2038) && run >= 0) {
        if (zz - run > best[1] - best[0]) best = [run, zz];
        run = -1;
      }
    }
    if (best[1] - best[0] > 200) cz.push([x, (best[0] + best[1]) / 2]);
  }
  cz.forEach(([x], i) => {
    let sum = 0;
    let n = 0;
    for (let k = Math.max(0, i - 4); k <= Math.min(cz.length - 1, i + 4); k++) (sum += cz[k][1]), n++;
    if (inBoard(x, sum / n, 40)) river.push(dm(x), dm(sum / n));
  });
}
// 피크닉 자리: 망원한강공원(OSM 공원 중심) 둘레 230m 안의 녹지 칸에서 12m 넘게 떨어진 자리 24곳
const picnic: number[] = [];
{
  const park = raw('green').find((e) => e.tags?.name === '망원한강공원');
  const g = park?.geometry ?? [];
  const pc = g.length ? xz(g).reduce((a, p) => [a[0] + p[0] / g.length, a[1] + p[1] / g.length], [0, 0]) : [-1573, 44];
  for (let k = 0; k < 4000 && picnic.length < 48; k++) {
    const a = hash01(k, 31) * Math.PI * 2;
    const r = Math.sqrt(hash01(k, 37)) * 230;
    const x = pc[0] + Math.cos(a) * r;
    const z = pc[1] + Math.sin(a) * r;
    const i = (Math.round(px(z)) * SIZE + Math.round(px(x))) * 4;
    if (!mask[i + 1] || mask[i] || mask[i + 2] > 40) continue; // 녹지이고 물·건물 그늘이 아닌 칸
    if (picnic.some((v, j) => j % 2 === 0 && Math.hypot(v / 10 - x, picnic[j + 1] / 10 - z) < 12)) continue;
    picnic.push(dm(x), dm(z));
  }
}

const out = {
  v: 1,
  names,
  b: buildings,
  r: roads,
  lines: lines.map(({ _ways, _len, ...l }) => l),
  stations,
  exits,
  landmarks,
  trees,
  buses: busRuns,
  campus: campusRing.flatMap(([x, z]) => [dm(x), dm(z)]),
  river,
  picnic,
};
const json = JSON.stringify(out);
writeFileSync(new URL('../public/data/board.json', import.meta.url), json);
writeFileSync(new URL('../public/data/mask.png', import.meta.url), encodePng(mask, SIZE));

const waterPx = mask.reduce((s, v, i) => s + (i % 4 === 0 && v ? 1 : 0), 0);
console.log(`건물 ${buildings.length}동 (홍익대 ${buildings.filter((b) => b[1] === 1).length}동)`);
console.log(`도로 ${roads.length}조각, 교량 조각 ${roads.filter((r) => r[3]).length}, 가장 높은 지점 ${Math.max(...roads.flatMap((r) => r.filter((_, i) => i >= 6 && i % 3 === 1))) / 10}m`);
console.log(`물 ${((waterPx * 4) / 1e6).toFixed(2)}㎢, 나무 ${trees.length / 2}그루, 출구 ${exits.length}곳, 역 ${stations.map((s) => s.name).join('·')}`);
for (const l of lines) console.log(`${l.name}: 선로 조각 ${l._ways}개 → ${l._len}m, 역 ${l.stops.map((s) => `${s.name}(${s.s})`).join(' ')}`);
console.log(`버스 노선 ${busRuns.length}개(${[...new Set(busRuns.map((b) => b.ref))].length}개 번호), 정류장 ${busRuns.reduce((n, b) => n + b.stops.length / 2, 0)}곳(노선별 합), 버스가 지나는 조각 ${roads.filter((r) => r[2] & 2).length}개`);
console.log(`이름 랜드마크 건물 ${NAMED_LM.map(([re, n]) => `${re.source.slice(0, 6)}:${buildings.filter((b) => b[1] === n).length}`).join(' ')}, 캠퍼스 고리 ${campusRing.length}점, 물길 ${river.length / 2}점, 피크닉 ${picnic.length / 2}곳`);
console.log(`랜드마크 ${landmarks.map((l) => `${l.id}(${l.x / 10},${l.z / 10})`).join(' ')}`);
console.log(`board.json ${(json.length / 1e6).toFixed(2)}MB`);
