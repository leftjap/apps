// tools/raw/ 의 OSM 원자료를 모형판 자료(public/data/board.json, mask.png)로 굽는다.
// 실행: node tools/bake.ts
import { readFileSync, writeFileSync } from 'node:fs';
import { BOARD_R, toXZ } from '../src/geo.ts';
import { cumLen, nearestS } from '../src/poly.ts';
import { rampHeight } from './lib/elevate.ts';
import { estimateHeight, hash01 } from './lib/height.ts';
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
  members?: { type: string; ref: number; role: string; geometry?: LL[] }[];
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
    const lm = inside(hongikRings, cx, cz) ? 1 : 0;
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
  const flush = () => {
    if (cur.length >= 6) {
      if (rev) {
        const r: number[] = [];
        for (let i = cur.length - 3; i >= 0; i -= 3) r.push(cur[i], cur[i + 1], cur[i + 2]);
        cur = r;
      }
      roads.push([...head, ...cur]);
    }
    cur = [];
  };
  pts.forEach(([x, z], i) => {
    const n = w.nodes![i];
    if (!inBoard(x, z, 2)) return flush();
    cur.push(dm(x), dm(nodeY.get(n) ?? 0), dm(z));
    if (i > 0 && i < pts.length - 1 && use.get(n)! > 1) {
      flush();
      cur.push(dm(x), dm(nodeY.get(n) ?? 0), dm(z));
    }
  });
  flush();
}

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
const exits: { st: string; x: number; z: number }[] = [];
for (const e of raw('stations').filter((e) => e.tags?.railway === 'subway_entrance')) {
  const [x, z] = toXZ(e.lat!, e.lon!);
  if (!inBoard(x, z, 20)) continue;
  let bestName = '';
  let bestD = 380;
  for (const s of stations) {
    const d = Math.hypot(s.x / 10 - x, s.z / 10 - z);
    if (d < bestD) (bestD = d), (bestName = s.name);
  }
  if (bestName) exits.push({ st: bestName, x: dm(x), z: dm(z) });
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
};
const json = JSON.stringify(out);
writeFileSync(new URL('../public/data/board.json', import.meta.url), json);
writeFileSync(new URL('../public/data/mask.png', import.meta.url), encodePng(mask, SIZE));

const waterPx = mask.reduce((s, v, i) => s + (i % 4 === 0 && v ? 1 : 0), 0);
console.log(`건물 ${buildings.length}동 (홍익대 ${buildings.filter((b) => b[1] === 1).length}동)`);
console.log(`도로 ${roads.length}조각, 교량 조각 ${roads.filter((r) => r[3]).length}, 가장 높은 지점 ${Math.max(...roads.flatMap((r) => r.filter((_, i) => i >= 6 && i % 3 === 1))) / 10}m`);
console.log(`물 ${((waterPx * 4) / 1e6).toFixed(2)}㎢, 나무 ${trees.length / 2}그루, 출구 ${exits.length}곳, 역 ${stations.map((s) => s.name).join('·')}`);
for (const l of lines) console.log(`${l.name}: 선로 조각 ${l._ways}개 → ${l._len}m, 역 ${l.stops.map((s) => `${s.name}(${s.s})`).join(' ')}`);
console.log(`랜드마크 ${landmarks.map((l) => `${l.id}(${l.x / 10},${l.z / 10})`).join(' ')}`);
console.log(`board.json ${(json.length / 1e6).toFixed(2)}MB`);
