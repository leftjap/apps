// tools/raw/ 의 OSM 원자료를 모형판 자료(public/data/board.json, mask.png)로 굽는다.
// 실행: node tools/bake.ts
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { BOARD_R, toXZ } from '../src/geo.ts';
import { cumLen, nearestS, pointAt } from '../src/poly.ts';
import { rampHeight } from './lib/elevate.ts';
import { estimateHeight, hash01 } from './lib/height.ts';
import { busKind, traceRuns } from './lib/bus.ts';
import { mergeStages, minRect, type Rect } from './lib/crosswalk.ts';
import { analysePiece, laneIndex, type LaneSeg, type PieceLanes } from './lib/lanes.ts';
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

// ───────────────────────── 학교 부지 ─────────────────────────
// OSM 학교 부지(amenity=school). 판 안에 들어오는 부지만 쓰고, 부지 안 건물은 학교 건물(6)로 칠한다
const schoolSites = raw('schools')
  .filter((e) => e.type === 'way' && e.geometry && e.tags?.name)
  .map((e) => ({ name: e.tags!.name.replace(/\s+/g, ' ').trim(), ring: xz(e.geometry!) }))
  .filter((s) => s.ring.every(([x, z]) => inBoard(x, z, 4)));

// ───────────────────────── 건물 ─────────────────────────
/** 이름으로 고르는 랜드마크 건물 번호(1 = 홍익대 캠퍼스 안, 2~5 는 역·다리, 6 은 학교가 쓴다) */
const NAMED_LM: [RegExp, number][] = [
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
    const isSchool = schoolSites.some((sc) => inside([sc.ring], cx, cz)) || tags.building === 'school' || /(초등|중|고등)학교/.test(tags.name ?? '');
    const lm = inside(hongikRings, cx, cz) ? 1 : isSchool ? 6 : (NAMED_LM.find(([re]) => re.test(tags.name ?? ''))?.[1] ?? 0);
    // 부지 자료가 없는 학교(이름이 붙은 학교 건물): 건물 외곽선을 부지로 삼는다
    if (/(초등|중|고등)학교$/.test(tags.name ?? '') && !schoolSites.some((sc) => inside([sc.ring], cx, cz)))
      schoolSites.push({ name: tags.name!.replace(/^홍익대학교사범대학부속/, '홍익대 사범대 부속 '), ring: [...pts, pts[0]] });
    buildings.push([dm(h), lm, ...pts.flatMap(([x, z]) => [dm(x), dm(z)])]);
    footprints.push(pts);
  }
}
const osmBuildings = buildings.length;

// ───────────────────────── 건물: OSM 이 비어 있는 곳 채우기 ─────────────────────────
// Overture Maps 건물 자료(tools/overture.py 로 받는다) 가운데 OSM 이 아닌 출처만 쓴다. 한국은 대부분
// Qian Shi 외(2023) 동아시아 건물 자료(CC BY 4.0)다. OSM 건물과 겹치는 것(중심이 OSM 건물 안이거나 OSM 건물의 첫 점을 품는 것)은 뺀다.
// 높이·층수가 없으면 다세대 주택 기준으로 추정한다. 파일이 없으면 건너뛴다.
{
  const file = new URL('./raw/overture.jsonl', import.meta.url);
  if (existsSync(file)) {
    const CELL = 50;
    const grid = new Map<string, [number, number][][]>();
    const ck = (x: number, z: number) => `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
    for (const f of footprints) {
      const xs = f.map((p) => p[0]);
      const zs = f.map((p) => p[1]);
      for (let gx = Math.floor(Math.min(...xs) / CELL); gx <= Math.floor(Math.max(...xs) / CELL); gx++)
        for (let gz = Math.floor(Math.min(...zs) / CELL); gz <= Math.floor(Math.max(...zs) / CELL); gz++) {
          const k = `${gx},${gz}`;
          (grid.get(k) ?? grid.set(k, []).get(k)!).push(f);
        }
    }
    const strHash = (str: string) => {
      let h = 2166136261;
      for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
      return h >>> 0;
    };
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      if (!line) continue;
      const r = JSON.parse(line) as { id: string; height: number | null; floors: number | null; src: string[] | null; g: { type: string; coordinates: number[][][] | number[][][][] } };
      if ((r.src ?? []).includes('OpenStreetMap')) continue;
      const outer = (r.g.type === 'Polygon' ? r.g.coordinates[0] : (r.g.coordinates as number[][][][])[0][0]) as number[][];
      let pts = outer.map(([lon, lat]) => toXZ(lat, lon));
      if (pts.length > 1 && Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 0.5) pts = pts.slice(0, -1);
      pts = pts.filter((p, i, a) => i === 0 || Math.hypot(p[0] - a[i - 1][0], p[1] - a[i - 1][1]) > 0.3);
      if (pts.length < 3 || !pts.every(([x, z]) => inBoard(x, z, 4))) continue;
      let area = 0;
      let cx = 0;
      let cz = 0;
      for (let i = 0; i < pts.length; i++) {
        const [ax, az] = pts[i];
        const [bx, bz] = pts[(i + 1) % pts.length];
        area += ax * bz - bx * az;
        cx += ax / pts.length;
        cz += az / pts.length;
      }
      area /= 2;
      if (Math.abs(area) < 12) continue;
      const near = grid.get(ck(cx, cz)) ?? [];
      const ring = [...pts, pts[0]];
      if (near.some((f) => inside([[...f, f[0]]], cx, cz) || inside([ring], f[0][0], f[0][1]))) continue;
      if (area < 0) pts.reverse();
      const id = strHash(r.id);
      const h = r.height && r.height > 0 ? r.height : r.floors && r.floors > 0 ? r.floors * 3.2 + 1 : estimateHeight({ building: 'residential' }, Math.abs(area), id);
      const isSchool = schoolSites.some((sc) => inside([sc.ring], cx, cz));
      buildings.push([dm(Math.max(3, Math.min(260, h))), isSchool ? 6 : 0, ...pts.flatMap(([x, z]) => [dm(x), dm(z)])]);
      footprints.push(pts);
    }
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
/** 조각마다 저장된 순서의 노드 번호(굽는 동안만 쓴다). 횡단보도 자리에 새로 넣은 꼭짓점은 음수 */
const roadNodes: number[][] = [];
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
      roadNodes.push(rev ? [...curN].reverse() : curN);
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

// ───────────────────────── 차선으로 길 모양 고치기 ─────────────────────────
// 서울시 교통안전시설물 차선(tools/seoul.py 로 받는다)으로 조각마다 실제 가운데 자리·방향별 차로 수·차로 폭·중앙선 종류를 읽는다(tools/lib/lanes.ts).
// 가운데선은 읽은 자리로 옮기되, 여러 조각이 만나는 노드는 조각마다의 '옆으로 옮길 거리' 조건을 함께 만족하는 자리(최소제곱)로 옮겨 길이 끊기지 않게 한다.
const ptsOf = (r: number[]): [number, number][] => {
  const out: [number, number][] = [];
  for (let i = 6; i < r.length; i += 3) out.push([r[i] / 10, r[i + 2] / 10]);
  return out;
};
const roadLanes: (PieceLanes | null)[] = roads.map(() => null);
const laneFile = new URL('./raw/seoul-lanes.json', import.meta.url);
const tgis = existsSync(laneFile)
  ? (JSON.parse(readFileSync(laneFile, 'utf8')).lanes as { k: string; k2: string; eve: string; p: [number, number][] }[]).filter((l) => l.eve === '001')
  : [];
{
  const segs: LaneSeg[] = [];
  for (const l of tgis) {
    const P = l.p.map(([a, b]) => toXZ(a, b));
    for (let i = 0; i + 1 < P.length; i++) segs.push({ ax: P[i][0], az: P[i][1], bx: P[i + 1][0], bz: P[i + 1][1], k: l.k, k2: l.k2 });
  }
  const idx = laneIndex(segs);
  roads.forEach((r, i) => {
    if (r[0] > 4 || r[3]) return; // 골목보다 작은 길과 교량은 읽지 않는다
    roadLanes[i] = analysePiece(idx, ptsOf(r), !!(r[2] & 1));
  });
}
/** 못 읽은 조각(교차로 사이 짧은 조각 등)은 같은 길의 가장 길게 읽은 조각 값을 쓴다. 가운데 자리는 노드 쪽 계산에 맡긴다 */
const laneFilled = new Set<number>();
for (const list of piecesOf.values()) {
  const done = list.filter((p) => roadLanes[p.road]).sort((a, b) => roadLanes[b.road]!.n - roadLanes[a.road]!.n);
  if (!done.length) continue;
  for (const p of list)
    if (!roadLanes[p.road] && roads[p.road][0] <= 4 && !roads[p.road][3]) {
      roadLanes[p.road] = { ...roadLanes[done[0].road]!, off: 0 };
      laneFilled.add(p.road);
    }
}
// 차로 수 칸은 차선에서 센 값으로 바꾼다(한 방향 길은 그 방향 차로 수, 양방향 길은 두 방향의 합)
roads.forEach((r, i) => {
  const L = roadLanes[i];
  if (L) r[1] = r[2] & 1 ? L.lf : L.lf + L.lb;
});
{
  // 노드마다 Σ (d·n − o)² + λ|d|² 를 가장 작게 하는 옮김 d. 고치지 않는 길도 끝 노드에서는 '옆으로 0' 조건을 낸다
  const acc = new Map<number, number[]>(); // 노드 → [a11, a12, a22, b1, b2]
  const add = (node: number, nx: number, nz: number, o: number) => {
    const a = acc.get(node) ?? acc.set(node, [0, 0, 0, 0, 0]).get(node)!;
    a[0] += nx * nx;
    a[1] += nx * nz;
    a[2] += nz * nz;
    a[3] += o * nx;
    a[4] += o * nz;
  };
  const normal = (P: [number, number][], k: number): [number, number] => {
    const a = P[Math.max(0, k - 1)];
    const b = P[Math.min(P.length - 1, k + 1)];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [-(b[1] - a[1]) / L, (b[0] - a[0]) / L]; // 진행 방향 오른쪽
  };
  roads.forEach((r, i) => {
    const P = ptsOf(r);
    const L = roadLanes[i];
    if (L && !laneFilled.has(i)) {
      const o = Math.max(-7, Math.min(7, L.off));
      P.forEach((_, k) => add(roadNodes[i][k], ...normal(P, k), o));
    } else if (r[0] <= 5) for (const k of [0, P.length - 1]) add(roadNodes[i][k], ...normal(P, k), 0);
  });
  const LAMBDA = 0.02;
  const moved = new Map<number, [number, number]>();
  for (const [node, [a11, a12, a22, b1, b2]] of acc) {
    const p = a11 + LAMBDA;
    const q = a22 + LAMBDA;
    const det = p * q - a12 * a12;
    let dx = (q * b1 - a12 * b2) / det;
    let dz = (p * b2 - a12 * b1) / det;
    const len = Math.hypot(dx, dz);
    if (len > 7) (dx *= 7 / len), (dz *= 7 / len);
    if (len > 0.05) moved.set(node, [dx, dz]);
  }
  roads.forEach((r, i) =>
    roadNodes[i].forEach((node, k) => {
      const d = moved.get(node);
      if (!d) return;
      r[6 + k * 3] += dm(d[0]);
      r[8 + k * 3] += dm(d[1]);
    }),
  );
  console.log(`차선으로 읽은 조각 ${roadLanes.filter(Boolean).length - laneFilled.size}개(+같은 길에서 채운 ${laneFilled.size}개), 옮긴 노드 ${moved.size}개`);
}
const laneWidth = (i: number) => {
  const L = roadLanes[i];
  return L && Number.isFinite(L.lw) ? Math.max(2.8, Math.min(4, L.lw)) : 3.3;
};
/** 조각의 찻길 폭(m): 차로 수 × 차로 폭 + 양쪽 0.5m */
const carriageway = (i: number) => {
  const r = roads[i];
  const L = roadLanes[i];
  if (L) return (L.lf + L.lb) * laneWidth(i) + 1;
  return r[0] <= 3 ? Math.max(7, r[1] * 3.3 + 1) : r[0] === 4 ? 5.6 : 3.6;
};

// ───────────────────────── 중앙분리대 ─────────────────────────
// 한 방향 큰길 조각마다 왼쪽에 나란히 반대로 가는 조각이 있으면 그 사이(분리대·중앙버스차로) 폭을 잰다
const medianGap = roads.map(() => 0);
{
  const oneways = roads.map((_, i) => i).filter((i) => roads[i][0] <= 3 && roads[i][2] & 1 && !roads[i][3]);
  const mids = oneways.map((i) => {
    const P = ptsOf(roads[i]);
    const cum = cumLen(Float32Array.from(P.flatMap(([x, z]) => [x, 0, z])));
    const tmp = [0, 0, 0];
    const seg = pointAt(Float32Array.from(P.flatMap(([x, z]) => [x, 0, z])), cum, cum[cum.length - 1] / 2, tmp);
    const [a, b] = [P[seg], P[seg + 1]];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return { i, x: tmp[0], z: tmp[2], ux: (b[0] - a[0]) / L, uz: (b[1] - a[1]) / L, P };
  });
  for (const m of mids) {
    let best = Infinity;
    let other = -1;
    for (const o of mids) {
      if (o.i === m.i || Math.hypot(o.x - m.x, o.z - m.z) > 120) continue;
      for (let k = 0; k + 1 < o.P.length; k++) {
        const [ax, az] = o.P[k];
        const [bx, bz] = o.P[k + 1];
        const dx = bx - ax;
        const dz = bz - az;
        const l2 = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((m.x - ax) * dx + (m.z - az) * dz) / l2));
        const qx = ax + dx * t - m.x;
        const qz = az + dz * t - m.z;
        const left = qx * m.uz - qz * m.ux; // 진행 방향 왼쪽이 +
        const along = Math.abs(qx * m.ux + qz * m.uz);
        const cos = (dx * m.ux + dz * m.uz) / Math.sqrt(l2);
        if (cos > -0.85 || along > 8 || left < 2 || left > 45) continue;
        if (left < best) (best = left), (other = o.i);
      }
    }
    if (other >= 0) medianGap[m.i] = Math.max(0, best - carriageway(m.i) / 2 - carriageway(other) / 2);
  }
}

// ───────────────────────── 횡단보도 ─────────────────────────
// 서울시 교통안전시설물 횡단보도 면(2021-08)의 축을 쓰고, 그 뒤 생긴 횡단보도(자치구 횡단보도 점, 2026-03)는 가까운 길에 직각으로 놓는다.
// 자치구 점 좌표는 면 자료보다 남쪽으로 약 5.3m, 서쪽으로 0.8m 밀려 있어(같은 관리번호 992개의 중앙값) 그만큼 되돌린다.
// 횡단보도 축이 길 조각을 지나는 자리에 꼭짓점을 넣어 사람이 그 자리에서 길을 건너게 하고,
// 교차로에서 25m 넘게 떨어진 신호 횡단보도는 그 자리에서 조각을 끊어 차가 그 앞에 서게 한다.
interface Cross extends Rect {
  sig: boolean | null;
  stage: boolean;
  /** 축이 지나는 꼭짓점(데시미터 좌표), 축 방향 순서 */
  verts: [number, number][];
}
const crossings: Cross[] = [];
{
  const file = new URL('./raw/seoul-crosswalks.json', import.meta.url);
  const src = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { areas: [], points: [] };
  const rects: (Rect & { sig: boolean | null })[] = (src.areas as { ring: [number, number][]; sig: boolean | null }[])
    .map((a) => ({ ...minRect(a.ring.map(([la, lo]) => toXZ(la, lo))), sig: a.sig }))
    .filter((r) => r.len > 1.5 && r.wid > 0.8 && inBoard(r.cx, r.cz, 4));
  // 조각 선분 격자
  const CELL = 20;
  const grid = new Map<string, [number, number][]>();
  const gk = (x: number, z: number) => `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
  const walkable = (i: number) => roads[i][0] <= 5 && !roads[i][3];
  roads.forEach((r, i) => {
    if (!walkable(i)) return;
    const P = ptsOf(r);
    for (let k = 0; k + 1 < P.length; k++) {
      const n = Math.ceil(Math.hypot(P[k + 1][0] - P[k][0], P[k + 1][1] - P[k][1]) / (CELL / 2)) + 1;
      const keys = new Set<string>();
      for (let s = 0; s <= n; s++) keys.add(gk(P[k][0] + ((P[k + 1][0] - P[k][0]) * s) / n, P[k][1] + ((P[k + 1][1] - P[k][1]) * s) / n));
      for (const key of keys) (grid.get(key) ?? grid.set(key, []).get(key)!).push([i, k]);
    }
  });
  const segsNear = (x: number, z: number, r: number) => {
    const out = new Set<string>();
    const res: [number, number][] = [];
    for (let gx = Math.floor((x - r) / CELL); gx <= Math.floor((x + r) / CELL); gx++)
      for (let gz = Math.floor((z - r) / CELL); gz <= Math.floor((z + r) / CELL); gz++)
        for (const s of grid.get(`${gx},${gz}`) ?? []) {
          const key = `${s[0]},${s[1]}`;
          if (!out.has(key)) out.add(key), res.push(s);
        }
    return res;
  };
  // 면이 없는 새 횡단보도 점: 가까운 찻길(15m 안)에 직각으로, 폭 4m
  for (const p of src.points as { lat: number; lon: number; sig: boolean }[]) {
    let [x, z] = toXZ(p.lat, p.lon);
    x += 0.81;
    z -= 5.31;
    if (!inBoard(x, z, 4) || rects.some((r) => Math.hypot(r.cx - x, r.cz - z) < 8)) continue;
    let best: { d: number; x: number; z: number; ux: number; uz: number; i: number } | null = null;
    for (const [i, k] of segsNear(x, z, 15)) {
      if (roads[i][0] > 4) continue;
      const P = ptsOf(roads[i]);
      const [ax, az] = P[k];
      const [bx, bz] = P[k + 1];
      const dx = bx - ax;
      const dz = bz - az;
      const l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
      const d = Math.hypot(ax + dx * t - x, az + dz * t - z);
      if (d < 15 && (!best || d < best.d)) best = { d, x: ax + dx * t, z: az + dz * t, ux: -dz / Math.sqrt(l2), uz: dx / Math.sqrt(l2), i };
    }
    if (best) rects.push({ cx: best.x, cz: best.z, ux: best.ux, uz: best.uz, len: carriageway(best.i) + 1, wid: 4, sig: p.sig });
  }
  const merged = mergeStages(rects);
  // 축이 지나는 조각 자리를 모은 뒤, 조각마다 뒤쪽 선분부터 꼭짓점을 넣는다(앞쪽 번호가 밀리지 않게)
  const inserts = new Map<number, { k: number; t: number; x: number; z: number; c: number }[]>();
  merged.forEach((m, c) => {
    const ext = m.len / 2 + 1.5;
    const ax = m.cx - m.ux * ext;
    const az = m.cz - m.uz * ext;
    const bx = m.cx + m.ux * ext;
    const bz = m.cz + m.uz * ext;
    for (const [i, k] of segsNear(m.cx, m.cz, ext + 2)) {
      const P = ptsOf(roads[i]);
      const [px, pz] = P[k];
      const [qx, qz] = P[k + 1];
      const rx = qx - px;
      const rz = qz - pz;
      const sx = bx - ax;
      const sz = bz - az;
      const den = rx * sz - rz * sx;
      if (Math.abs(den) < 1e-9) continue;
      const t = ((ax - px) * sz - (az - pz) * sx) / den;
      const u = ((ax - px) * rz - (az - pz) * rx) / den;
      if (t < 0 || t > 1 || u < 0 || u > 1) continue;
      (inserts.get(i) ?? inserts.set(i, []).get(i)!).push({ k, t, x: px + rx * t, z: pz + rz * t, c });
    }
  });
  const verts: { u: number; x: number; z: number }[][] = merged.map(() => []);
  let synth = -1;
  for (const [i, list] of inserts) {
    list.sort((a, b) => b.k - a.k || b.t - a.t);
    const r = roads[i];
    for (const it of list) {
      const P = ptsOf(r);
      let at = -1;
      for (const v of [it.k, it.k + 1]) if (Math.hypot(P[v][0] - it.x, P[v][1] - it.z) < 0.4) at = v;
      if (at < 0) {
        const y = Math.round((r[7 + it.k * 3] + r[10 + it.k * 3]) / 2);
        r.splice(9 + it.k * 3, 0, dm(it.x), y, dm(it.z));
        roadNodes[i].splice(it.k + 1, 0, synth--);
        at = it.k + 1;
      }
      const m = merged[it.c];
      const vx = r[6 + at * 3];
      const vz = r[8 + at * 3];
      verts[it.c].push({ u: (vx / 10 - m.cx) * m.ux + (vz / 10 - m.cz) * m.uz, x: vx, z: vz });
    }
  }
  merged.forEach((m, c) => {
    if (!verts[c].length) return;
    const parts = m.parts.map((p) => rects[p].sig);
    const sig = parts.includes(true) ? true : parts.includes(false) ? false : null;
    const vs = verts[c].sort((a, b) => a.u - b.u).filter((v, k, a) => k === 0 || v.x !== a[k - 1].x || v.z !== a[k - 1].z);
    crossings.push({ ...m, sig, stage: m.parts.length > 1, verts: vs.map((v) => [v.x, v.z]) });
  });
}
// 길 중간 신호 횡단보도에서 조각을 끊는다: 큰길(등급 3 이하) 조각이고, 큰길 교차 노드(큰길 조각 끝이 셋 넘게 모인 노드)에서 25m 넘게,
// 조각 양 끝에서 10m 넘게 떨어진 꼭짓점
{
  const ends = new Map<number, number>();
  roads.forEach((r, i) => {
    if (r[0] > 3) return;
    for (const n of [roadNodes[i][0], roadNodes[i][roadNodes[i].length - 1]]) ends.set(n, (ends.get(n) ?? 0) + 1);
  });
  const junctionXZ: [number, number][] = [];
  roads.forEach((r, i) => {
    if (r[0] > 3) return;
    const P = ptsOf(r);
    for (const k of [0, P.length - 1]) if ((ends.get(roadNodes[i][k]) ?? 0) >= 3) junctionXZ.push(P[k]);
  });
  const wayOf = new Map<number, number>();
  for (const [w, list] of piecesOf) for (const p of list) wayOf.set(p.road, w);
  let splits = 0;
  for (const c of crossings) {
    if (c.sig !== true) continue;
    for (const [vx, vz] of c.verts) {
      const x = vx / 10;
      const z = vz / 10;
      if (junctionXZ.some(([jx, jz]) => Math.hypot(jx - x, jz - z) < 25)) continue;
      for (let i = 0; i < roads.length; i++) {
        const r = roads[i];
        if (r[0] > 3 || r[3]) continue;
        let at = -1;
        for (let k = 1; k < (r.length - 6) / 3 - 1; k++) if (r[6 + k * 3] === vx && r[8 + k * 3] === vz) at = k;
        if (at < 0) continue;
        const P = ptsOf(r);
        const cum = cumLen(Float32Array.from(P.flatMap(([px, pz]) => [px, 0, pz])));
        if (cum[at] < 10 || cum[cum.length - 1] - cum[at] < 10) continue;
        const head = r.slice(0, 6);
        const tail = [...head, ...r.slice(6 + at * 3)];
        roads[i] = r.slice(0, 9 + at * 3);
        roads.push(tail);
        const nodes = roadNodes[i];
        roadNodes[i] = nodes.slice(0, at + 1);
        roadNodes.push(nodes.slice(at));
        roadLanes.push(roadLanes[i]);
        medianGap.push(medianGap[i]);
        const w = wayOf.get(i);
        const list = w === undefined ? undefined : piecesOf.get(w);
        const entry = list?.find((p) => p.road === i);
        if (list && entry) {
          const j = roads.length - 1;
          const v = nodes[at];
          list.splice(list.indexOf(entry) + 1, 0, { road: j, s: v, e: entry.e, oneway: entry.oneway });
          entry.e = v;
          wayOf.set(j, w!);
        }
        splits++;
      }
    }
  }
  console.log(`횡단보도 ${crossings.length}곳(보행 신호 ${crossings.filter((c) => c.sig).length}, 두 단 ${crossings.filter((c) => c.stage).length}), 길 중간 신호 자리에서 끊은 조각 ${splits}개`);
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
// 출구 방향: 서울 지하철 출구는 보도에 길과 나란히 놓인 계단이고, 대개 역 쪽으로 내려간다(열린 쪽이 역에서 먼 쪽).
// 가장 가까운 찻길(30m 안)과 나란히 두고 역 쪽을 내려가는 방향으로 삼는다. 출구 자리가 찻길 위면 보도로 밀어낸다
const exitYaw: number[] = [];
let exitsPushed = 0;
for (const e of exits) {
  const x = e.x / 10;
  const z = e.z / 10;
  let best: { d: number; i: number; ux: number; uz: number; px: number; pz: number; side: number } | null = null;
  roads.forEach((r, i) => {
    if (r[0] > 4 || r[3]) return;
    const P = ptsOf(r);
    for (let k = 0; k + 1 < P.length; k++) {
      const [ax, az] = P[k];
      const [bx, bz] = P[k + 1];
      const dx = bx - ax;
      const dz = bz - az;
      const L = Math.hypot(dx, dz);
      if (L < 1) continue;
      const t = Math.max(0, Math.min(L, ((x - ax) * dx + (z - az) * dz) / L));
      const px = ax + (dx / L) * t;
      const pz = az + (dz / L) * t;
      const d = Math.hypot(px - x, pz - z) - carriageway(i) / 2; // 찻길 가장자리에서 떨어진 거리
      if (d < 30 && (!best || d < best.d)) best = { d, i, ux: dx / L, uz: dz / L, px, pz, side: Math.sign((x - ax) * -dz + (z - az) * dx) || 1 };
    }
  });
  const st = stations.find((s) => s.name === e.st)!;
  if (!best) {
    exitYaw.push(Math.round(Math.atan2(st.z / 10 - z, st.x / 10 - x) * 1000));
    continue;
  }
  const b = best as { d: number; i: number; ux: number; uz: number; px: number; pz: number; side: number };
  const toward = Math.sign((st.x / 10 - x) * b.ux + (st.z / 10 - z) * b.uz) || 1;
  exitYaw.push(Math.round(Math.atan2(b.uz * toward, b.ux * toward) * 1000));
  if (b.d < 1.6) {
    // 출구(폭 약 3m) 가운데를 찻길 가장자리에서 2.2m 밖으로
    const want = carriageway(b.i) / 2 + 2.2;
    e.x = dm(b.px - b.uz * b.side * want);
    e.z = dm(b.pz + b.ux * b.side * want);
    exitsPushed++;
  }
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
  exits: exits.map((e, i) => ({ ...e, yaw: exitYaw[i] })),
  landmarks,
  // 조각마다 [진행 방향 차로, 반대 방향 차로, 차로 폭(cm), 중앙선 종류, 표시(1 오른쪽 버스차로, 2 반대쪽 버스차로, 4 중앙버스차로), 분리대 폭(dm)]. 0 = 차선 자료 없음
  rl: roads.map((_, i) => {
    const L = roadLanes[i];
    if (L) return [L.lf, L.lb, Math.round(laneWidth(i) * 100), L.ctype, (L.busR ? 1 : 0) | (L.busL ? 2 : 0) | (L.medBus ? 4 : 0), dm(medianGap[i])];
    return medianGap[i] > 0 ? [0, 0, 0, 0, 0, dm(medianGap[i])] : 0;
  }),
  // 횡단보도: [가운데 x, z, 건너는 방향 ×1000 (x, z), 반 길이, 폭, 표시(1 보행 신호, 2 신호 모름, 4 두 단), 축이 지나는 꼭짓점 x, z, ...]
  xw: crossings.map((c) => [dm(c.cx), dm(c.cz), Math.round(c.ux * 1000), Math.round(c.uz * 1000), dm(c.len / 2), dm(c.wid), (c.sig ? 1 : 0) | (c.sig === null ? 2 : 0) | (c.stage ? 4 : 0), ...c.verts.flat()]),
  // 정지선(서울시 차선 자료의 일시정지선) [x0, z0, x1, z1, ...]
  stop: tgis
    .filter((l) => l.k === '004')
    .flatMap((l) => {
      const P = l.p.map(([a, b]) => toXZ(a, b));
      if (!P.every(([x, z]) => inBoard(x, z, 2))) return [];
      return P.slice(0, -1).flatMap(([x, z], k) => [dm(x), dm(z), dm(P[k + 1][0]), dm(P[k + 1][1])]);
    }),
  trees,
  buses: busRuns,
  campus: campusRing.flatMap(([x, z]) => [dm(x), dm(z)]),
  schools: schoolSites.map((sc) => ({ name: sc.name, ring: sc.ring.flatMap(([x, z]) => [dm(x), dm(z)]) })),
  river,
  picnic,
};
const json = JSON.stringify(out);
writeFileSync(new URL('../public/data/board.json', import.meta.url), json);
writeFileSync(new URL('../public/data/mask.png', import.meta.url), encodePng(mask, SIZE));

const waterPx = mask.reduce((s, v, i) => s + (i % 4 === 0 && v ? 1 : 0), 0);
console.log(`Overture(OSM 밖) 건물 ${buildings.length - osmBuildings}동 더함`);
console.log(`건물 ${buildings.length}동 (홍익대 ${buildings.filter((b) => b[1] === 1).length}동)`);
console.log(`도로 ${roads.length}조각, 교량 조각 ${roads.filter((r) => r[3]).length}, 가장 높은 지점 ${Math.max(...roads.flatMap((r) => r.filter((_, i) => i >= 6 && i % 3 === 1))) / 10}m`);
console.log(`물 ${((waterPx * 4) / 1e6).toFixed(2)}㎢, 나무 ${trees.length / 2}그루, 출구 ${exits.length}곳, 역 ${stations.map((s) => s.name).join('·')}`);
for (const l of lines) console.log(`${l.name}: 선로 조각 ${l._ways}개 → ${l._len}m, 역 ${l.stops.map((s) => `${s.name}(${s.s})`).join(' ')}`);
console.log(`버스 노선 ${busRuns.length}개(${[...new Set(busRuns.map((b) => b.ref))].length}개 번호), 정류장 ${busRuns.reduce((n, b) => n + b.stops.length / 2, 0)}곳(노선별 합), 버스가 지나는 조각 ${roads.filter((r) => r[2] & 2).length}개`);
console.log(`학교 ${schoolSites.length}곳(${schoolSites.map((s) => s.name).join(', ')}), 학교 건물 ${buildings.filter((b) => b[1] === 6).length}동`);
console.log(`이름 랜드마크 건물 ${NAMED_LM.map(([re, n]) => `${re.source.slice(0, 6)}:${buildings.filter((b) => b[1] === n).length}`).join(' ')}, 캠퍼스 고리 ${campusRing.length}점, 물길 ${river.length / 2}점, 피크닉 ${picnic.length / 2}곳`);
console.log(`출구 ${exits.length}곳 가운데 찻길 위에 있어 보도로 밀어낸 곳 ${exitsPushed}곳`);
console.log(`랜드마크 ${landmarks.map((l) => `${l.id}(${l.x / 10},${l.z / 10})`).join(' ')}`);
console.log(`board.json ${(json.length / 1e6).toFixed(2)}MB`);
