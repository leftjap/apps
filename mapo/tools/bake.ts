// tools/raw/ 의 OSM 원자료를 모형판 자료(public/data/board.json, mask.png)로 굽는다.
// 실행: node tools/bake.ts
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { BOARD_R, toXZ } from '../src/geo.ts';
import { cumLen, nearestS, pointAt } from '../src/poly.ts';
import { rampHeight } from './lib/elevate.ts';
import { attachShops, buildingInfo, gableGuess, packInfo, pickTitle, rectFootprint, titleTags, type Title } from './lib/building.ts';
import { estimateHeight, hash01 } from './lib/height.ts';
import { busKind, traceRuns } from './lib/bus.ts';
import { alignToRoad, isCurrent, mergeStages, minRect, ringDist, segDist, type Rect } from './lib/crosswalk.ts';
import { analyseLink, analysePiece, centerLink, cornerRadius, linkSections, fitToRoadArea, laneIndex, readEdges, type LaneSeg, type PieceLanes, type Profile } from './lib/lanes.ts';
import { railKind, railProfile, stitch } from './lib/rail.ts';
import { buildSurface, crosswalkPatches, surfacePolys, type Cross as SurfaceCross } from './lib/surface.ts';
import { ringArea as loopArea } from './lib/contour.ts';
import { boardWalkNet } from './lib/walknet.ts';
import { bakeWalk } from './lib/walkfix.ts';
import { doorWanted } from '../src/sim/people/zones.ts';
import { carriageSections, isGroundRoad, roadJoints, tunnelDepth, tunnelReach } from '../src/data/surface.ts';
import { encodePng, fillPolygon, fillPolygonAA, strokeLineAA } from './lib/raster.ts';
import { assembleRings, biotopeKind, encodeArea, groupRings, osmKind, ringArea, simplifyRing } from './lib/ground.ts';
import { curbAt, decodeBoard, GK, roadHalf, type BoardJson } from '../src/data/board.ts';
import { roadCorners } from '../src/data/corners.ts';
import { decodeMarks, type MarksJson } from '../src/data/marks.ts';
import { bakeLanes } from './lib/carlanes.ts';
import { roadLevels } from './lib/levels.ts';
import { carSurface, pushTreesOffRoad } from './lib/treeplace.ts';
import { clipLine, drawnGround, dropOverlaps, onGround, smoothLine } from './lib/groundclip.ts';
import { widenEdges } from './lib/laneedges.ts';
import { fitCells, snapArrows } from './lib/arrows.ts';
import { decodeLanes, type LanesJson } from '../src/data/lanes.ts';
import { bitsAt, fillBits, makeBits, type Bits } from './lib/bits.ts';
import { simplifyLoop, traceLoops } from './lib/contour.ts';
import { exitBody, exitOutline, notchOut } from '../src/data/exitFit.ts';
import { exitLook } from '../src/data/exits.ts';
import { findPortals } from '../src/render/rails.ts';

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
/** 건물마다 용도·층수·지붕·아래 높이(packInfo) */
const binfo: number[] = [];
/** 마스크에 바닥 그늘을 칠할 건물 외곽선 */
const footprints: [number, number][][] = [];
/** 닫힌 외곽선을 판 좌표로 고르고 넓이가 양수인 방향으로 맞춘다. 쓸 수 없으면 null */
function cleanRing(g: LL[]): { pts: [number, number][]; area: number; cx: number; cz: number } | null {
  let pts = xz(g);
  if (pts.length < 4) return null;
  const [fx, fz] = pts[0];
  const [lx, lz] = pts[pts.length - 1];
  if (Math.hypot(fx - lx, fz - lz) > 0.5) return null; // 닫히지 않은 조각
  pts = pts.slice(0, -1).filter((p, i, a) => i === 0 || Math.hypot(p[0] - a[i - 1][0], p[1] - a[i - 1][1]) > 0.3);
  if (pts.length < 3) return null;
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
  if (Math.abs(area) < 12 || !pts.every(([x, z]) => inBoard(x, z, 4))) return null;
  if (area < 0) pts.reverse();
  return { pts, area: Math.abs(area), cx, cz };
}
// 건물 부분(building:part, tools/fetch-parts.ts 로 받는다): 층이 나뉜 건물의 덩어리. 부분이 바닥의 절반 넘게 덮는 건물은 외곽선 대신 부분들을 세운다
const parts = (existsSync(new URL('./raw/parts.json', import.meta.url)) ? raw('parts') : [])
  .filter((e) => e.type === 'way' && e.geometry && Number(e.tags?.layer ?? 0) >= 0)
  .flatMap((e) => {
    const r = cleanRing(e.geometry!);
    return r ? [{ ...r, tags: e.tags ?? {}, id: e.id, used: false }] : [];
  });
const pushBuilding = (h: number, lm: number, pts: [number, number][], info: ReturnType<typeof buildingInfo>) => {
  buildings.push([dm(h), lm, ...pts.flatMap(([x, z]) => [dm(x), dm(z)])]);
  binfo.push(packInfo(info));
  footprints.push(pts);
};
// 서울시 건물 자료(tools/buildings.py 로 받는다): 건축물대장 표제부(2026)는 OSM 도로명주소로 잇고, 수치지도 건물 점(2018)은 외곽선 안에 든 것의 층수를 쓴다
const titleFile = new URL('./raw/seoul-bldg-titles.json', import.meta.url);
const titleIdx = new Map<string, Title[]>();
if (existsSync(titleFile))
  for (const r of JSON.parse(readFileSync(titleFile, 'utf8')).titles as Record<string, string>[]) {
    if (r['주부속구분코드명'] !== '주건축물' || !r['새주소도로코드명']) continue;
    const key = `${r['새주소도로코드명']}|${+r['새주소주지번'] || 0}|${+r['새주소부지번'] || 0}`;
    const t: Title = { use: r['주용도코드명'], etc: r['기타용도내용'], floors: +r['지상층수'] || 0, height: +r['높이'] || 0, area: +r['건축면적'] || 0, households: +r['세대수'] || 0, families: +r['가구수'] || 0, dong: r['동명'] };
    (titleIdx.get(key) ?? titleIdx.set(key, []).get(key)!).push(t);
  }
const titleOf = (tags: Record<string, string>, area: number): Title | null => {
  const hn = (tags['addr:housenumber'] ?? '').split('-').map(Number);
  if (!tags['addr:street'] || !(hn[0] > 0)) return null;
  const list = titleIdx.get(`${tags['addr:street']}|${hn[0]}|${hn[1] || 0}`);
  return list ? pickTitle(list, area, tags.name ?? '') : null;
};
const pointFile = new URL('./raw/seoul-bldg-points.json', import.meta.url);
/** 수치지도 건물 점 [x, z, 층수, 바닥 면적, 이 점이 든 판 건물이 있는가] */
const bldgPoints: { x: number; z: number; floors: number; area: number; used: boolean }[] = existsSync(pointFile)
  ? (JSON.parse(readFileSync(pointFile, 'utf8')).points as [number, number, number, number, string][]).map(([lat, lon, floors, area]) => {
      const [x, z] = toXZ(lat, lon);
      return { x, z, floors, area, used: false };
    })
  : [];
const PCELL = 25;
const pointGrid = new Map<string, number[]>();
bldgPoints.forEach((p, i) => {
  const k = `${Math.floor(p.x / PCELL)},${Math.floor(p.z / PCELL)}`;
  (pointGrid.get(k) ?? pointGrid.set(k, []).get(k)!).push(i);
});
/** 외곽선 pts 안에 든 수치지도 점 가운데 바닥이 가장 넓은 것의 층수(없으면 0). 든 점은 쓴 것으로 표시한다 */
const pointFloors = (pts: [number, number][]): number => {
  const xs = pts.map((p) => p[0]);
  const zs = pts.map((p) => p[1]);
  const ring = [[...pts, pts[0]]];
  let best = -1;
  for (let gx = Math.floor(Math.min(...xs) / PCELL); gx <= Math.floor(Math.max(...xs) / PCELL); gx++)
    for (let gz = Math.floor(Math.min(...zs) / PCELL); gz <= Math.floor(Math.max(...zs) / PCELL); gz++)
      for (const i of pointGrid.get(`${gx},${gz}`) ?? []) {
        const p = bldgPoints[i];
        if (!inside(ring, p.x, p.z)) continue;
        p.used = true;
        if (p.floors > 0 && (best < 0 || p.area > bldgPoints[best].area)) best = i;
      }
  return best < 0 ? 0 : bldgPoints[best].floors;
};
// 국토교통부 GIS건물통합정보(브이월드, tools/public.py 로 뽑는다): 건축물대장과 이은 건물 외곽선(2026)·지상 층수·높이·주용도.
// 외곽선은 꼭짓점을 0.4m 허용 오차로 줄인다. OSM 건물의 층수·용도는 표제부를 주소로 잇지 못했을 때 이 자료에서 가져오고(외곽선이 중심을 품고 넓이가 0.5~2배인 것),
// OSM·Overture 에 없는 건물은 아래(외곽선 자료에 없는 건물)에서 이 외곽선으로 세운다. 파일이 없으면 건너뛴다.
const gisFile = new URL('./raw/gis-buildings.json', import.meta.url);
type Gis = { pts: [number, number][]; area: number; cx: number; cz: number; t: Title; year: number; used: boolean };
const gisList: Gis[] = [];
if (existsSync(gisFile))
  for (const b of JSON.parse(readFileSync(gisFile, 'utf8')).buildings as { f: number; h: number; use: string; dong: string; date: string; r: [number, number][][] }[]) {
    const ring = cleanRing(b.r[0].map(([lat, lon]) => ({ lat, lon })));
    if (!ring) continue;
    const pts = simplifyRing([...ring.pts, ring.pts[0]], 0.4).slice(0, -1) as [number, number][];
    if (pts.length < 3) continue;
    let area = 0;
    for (let i = 0; i < pts.length; i++) area += pts[i][0] * pts[(i + 1) % pts.length][1] - pts[(i + 1) % pts.length][0] * pts[i][1];
    if (area / 2 < 12) continue;
    // 단독주택 가운데 3층 넘는 것은 대개 다가구주택이다(GIS 자료에는 기타용도가 없다)
    const t: Title = { use: b.use, etc: b.use === '단독주택' && b.f >= 3 ? '다가구주택' : '', floors: b.f, height: b.h, area: area / 2, households: 0, families: 0, dong: b.dong };
    gisList.push({ pts, area: area / 2, cx: ring.cx, cz: ring.cz, t, year: parseInt((b.date ?? '').slice(0, 4)) || 0, used: false });
  }
const GCELL = 40;
const gisGrid = new Map<string, number[]>();
gisList.forEach((g, i) => {
  const xs = g.pts.map((p) => p[0]);
  const zs = g.pts.map((p) => p[1]);
  for (let gx = Math.floor(Math.min(...xs) / GCELL); gx <= Math.floor(Math.max(...xs) / GCELL); gx++)
    for (let gz = Math.floor(Math.min(...zs) / GCELL); gz <= Math.floor(Math.max(...zs) / GCELL); gz++) {
      const k = `${gx},${gz}`;
      (gisGrid.get(k) ?? gisGrid.set(k, []).get(k)!).push(i);
    }
});
/** (x, z)를 품는 GIS 건물 가운데 넓이가 area 의 0.5~2배이고 가장 가까운 것 */
const gisAt = (x: number, z: number, area: number): Gis | null => {
  let best: Gis | null = null;
  for (const i of gisGrid.get(`${Math.floor(x / GCELL)},${Math.floor(z / GCELL)}`) ?? []) {
    const g = gisList[i];
    if (g.area < area * 0.5 || g.area > area * 2 || !inside([[...g.pts, g.pts[0]]], x, z)) continue;
    if (!best || Math.abs(g.area - area) < Math.abs(best.area - area)) best = g;
  }
  return best;
};
const bsrc = { title: 0, gis: 0, tag: 0, point: 0, guess: 0 };
/** 높이 자료 고르기: 표제부(2026) → OSM 높이·층수 태그 → GIS건물통합정보(외곽선으로 이음) → 수치지도 점 층수(2018) → 추정. 표제부·GIS 용도가 있으면 그것을 쓴다.
 *  GIS 는 위치로 잇기 때문에 주상복합처럼 저층부와 탑이 따로 그려진 곳에서 엉뚱한 동과 이어질 수 있어 OSM 태그 뒤에 둔다(메세나폴리스 102동이 4층 저층부 값을 받았다) */
/** 지붕 태그가 없는 오래된 저층 단독주택 일부에 박공(GIS 사용승인일, tools/lib/building.ts gableGuess) */
const withSources = (tags: Record<string, string>, pts: [number, number][], area: number): Record<string, string> => {
  const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length;
  const cz = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  return gableGuess(withSources0(tags, pts, area), gisAt(cx, cz, area)?.year ?? 0, Math.round(cx * 10) * 65536 + Math.round(cz * 10));
};
const withSources0 = (tags: Record<string, string>, pts: [number, number][], area: number): Record<string, string> => {
  const t0 = titleOf(tags, area);
  const fl = pointFloors(pts);
  const g = gisAt(pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length, area);
  if (g) g.used = true;
  const tagged = parseFloat(tags.height ?? '') > 0 || parseFloat(tags['building:levels'] ?? '') > 0;
  const t = t0 && t0.floors > 0 ? t0 : !tagged && g && g.t.floors > 0 ? g.t : null;
  if (t && t.floors > 0) {
    if (t === t0) bsrc.title++;
    else bsrc.gis++;
    const tt = titleTags(t);
    const out = { ...tags, ...tt };
    if (tt.building === 'yes') out.building = tags.building ?? 'yes';
    if (!tt.height) delete out.height;
    return out;
  }
  if (parseFloat(tags.height ?? '') > 0 || parseFloat(tags['building:levels'] ?? '') > 0) {
    bsrc.tag++;
    return tags;
  }
  if (fl > 0) {
    bsrc.point++;
    return { ...tags, 'building:levels': String(fl) };
  }
  bsrc.guess++;
  return tags;
};
for (const el of raw('buildings')) {
  const tags0 = el.tags ?? {};
  const outers =
    el.type === 'way' ? [el.geometry!] : (el.members ?? []).filter((m) => m.role === 'outer' && m.geometry).map((m) => m.geometry!);
  if (tags0.location === 'underground' || Number(tags0.layer) < 0) continue;
  for (const g of outers) {
    const ring = cleanRing(g);
    if (!ring) continue;
    const { pts, area, cx, cz } = ring;
    const tags = withSources(tags0, pts, Math.abs(area));
    const h = Math.max(3, Math.min(260, estimateHeight(tags, Math.abs(area), el.id)));
    const isSchool = schoolSites.some((sc) => inside([sc.ring], cx, cz)) || tags0.building === 'school' || /(초등|중|고등)학교/.test(tags.name ?? '');
    const lm = inside(hongikRings, cx, cz) ? 1 : isSchool ? 6 : (NAMED_LM.find(([re]) => re.test(tags.name ?? ''))?.[1] ?? 0);
    // 부지 자료가 없는 학교(이름이 붙은 학교 건물): 건물 외곽선을 부지로 삼는다
    if (/(초등|중|고등)학교$/.test(tags.name ?? '') && !schoolSites.some((sc) => inside([sc.ring], cx, cz)))
      schoolSites.push({ name: tags.name!.replace(/^홍익대학교사범대학부속/, '홍익대 사범대 부속 '), ring: [...pts, pts[0]] });
    const info = buildingInfo(tags);
    const mine = parts.filter((p) => !p.used && inside([[...pts, pts[0]]], p.cx, p.cz));
    if (mine.reduce((a, p) => a + p.area, 0) > Math.abs(area) * 0.5) {
      for (const p of mine) {
        p.used = true;
        const pi = buildingInfo(p.tags);
        if (!pi.use) pi.use = info.use;
        const ph = Math.max(pi.minH + 2, Math.min(260, estimateHeight(p.tags, p.area, p.id)));
        pushBuilding(ph, lm, p.pts, pi);
      }
      continue;
    }
    pushBuilding(h, lm, pts, info);
  }
}
// 감싸는 건물 없이 떨어진 부분(감싸는 건물이 부분보다 작게 그려진 곳 등)도 세운다
for (const p of parts.filter((p) => !p.used)) {
  const pi = buildingInfo(p.tags);
  pushBuilding(Math.max(pi.minH + 2, Math.min(260, estimateHeight(p.tags, p.area, p.id))), inside(hongikRings, p.cx, p.cz) ? 1 : 0, p.pts, pi);
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
      const r = JSON.parse(line) as { id: string; height: number | null; floors: number | null; class?: string | null; roof_shape?: string; src: string[] | null; g: { type: string; coordinates: number[][][] | number[][][][] } };
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
      const g = gisAt(cx, cz, Math.abs(area));
      if (g) g.used = true;
      if (!(r.height && r.height > 0) && !(r.floors && r.floors > 0) && g && g.t.floors > 0) (r.floors = g.t.floors), bsrc.gis++;
      else if (!(r.height && r.height > 0) && !(r.floors && r.floors > 0)) {
        const fl = pointFloors(pts);
        if (fl > 0) (r.floors = fl), bsrc.point++;
        else bsrc.guess++;
      } else bsrc.tag++;
      const h = r.height && r.height > 0 ? r.height : r.floors && r.floors > 0 ? r.floors * 3.2 + 1 : estimateHeight({ building: 'residential' }, Math.abs(area), id);
      const isSchool = schoolSites.some((sc) => inside([sc.ring], cx, cz));
      const tags: Record<string, string> = { building: r.class ?? '' };
      if (r.floors) tags['building:levels'] = String(r.floors);
      if (r.roof_shape) tags['roof:shape'] = r.roof_shape;
      pushBuilding(Math.max(3, Math.min(260, h)), isSchool ? 6 : 0, pts, buildingInfo(tags));
    }
  }
}

// ───────────────────────── 건물: GIS건물통합정보 외곽선으로 빈 곳 채우기 ─────────────────────────
// OSM·Overture 건물과 겹치지 않는 GIS 건물을 그 외곽선 그대로 세운다. 겹침: 가운데나 꼭짓점을 가운데 쪽으로 30% 당긴 점이 이미 있는 건물 안에 들거나, 이미 있는 건물의 가운데를 품는 것.
// 층수가 없으면 수치지도 점 층수 → 추정(바닥 60㎡ 미만은 1층) 순으로 정한다.
let gisBuildings = 0;
{
  const CELL = 40;
  const grid = new Map<string, { f: [number, number][]; cx: number; cz: number }[]>();
  const add = (f: [number, number][]) => {
    const xs = f.map((p) => p[0]);
    const zs = f.map((p) => p[1]);
    const e = { f, cx: xs.reduce((a, v) => a + v, 0) / f.length, cz: zs.reduce((a, v) => a + v, 0) / f.length };
    for (let gx = Math.floor(Math.min(...xs) / CELL); gx <= Math.floor(Math.max(...xs) / CELL); gx++)
      for (let gz = Math.floor(Math.min(...zs) / CELL); gz <= Math.floor(Math.max(...zs) / CELL); gz++) {
        const k = `${gx},${gz}`;
        (grid.get(k) ?? grid.set(k, []).get(k)!).push(e);
      }
  };
  footprints.forEach(add);
  const near = (x: number, z: number) => grid.get(`${Math.floor(x / CELL)},${Math.floor(z / CELL)}`) ?? [];
  for (const g of gisList) {
    if (g.used || !g.pts.every(([x, z]) => inBoard(x, z, 4))) continue;
    const ring = [[...g.pts, g.pts[0]]];
    const probe: [number, number][] = [[g.cx, g.cz], ...g.pts.map(([x, z]): [number, number] => [x + (g.cx - x) * 0.3, z + (g.cz - z) * 0.3])];
    if (probe.some(([x, z]) => near(x, z).some((e) => inside([[...e.f, e.f[0]]], x, z)))) continue;
    const xs = g.pts.map((p) => p[0]);
    const zs = g.pts.map((p) => p[1]);
    let hit = false;
    for (let gx = Math.floor(Math.min(...xs) / CELL); gx <= Math.floor(Math.max(...xs) / CELL) && !hit; gx++)
      for (let gz = Math.floor(Math.min(...zs) / CELL); gz <= Math.floor(Math.max(...zs) / CELL) && !hit; gz++)
        hit = (grid.get(`${gx},${gz}`) ?? []).some((e) => inside(ring, e.cx, e.cz));
    if (hit) continue;
    const fl = g.t.floors > 0 ? g.t.floors : pointFloors(g.pts);
    bsrc[g.t.floors > 0 ? 'gis' : fl > 0 ? 'point' : 'guess']++;
    const id = Math.round(g.cx * 10) * 65536 + Math.round(g.cz * 10);
    const tags = gableGuess({ ...titleTags(g.t), ...(fl > 0 ? { 'building:levels': String(fl) } : {}) }, g.year, id);
    const h = fl > 0 ? estimateHeight(tags, g.area, id) : g.area < 60 ? 4.2 : estimateHeight({ ...tags, building: tags.building === 'yes' ? 'residential' : tags.building }, g.area, id);
    const isSchool = schoolSites.some((sc) => inside([sc.ring], g.cx, g.cz));
    pushBuilding(Math.max(3, Math.min(260, h)), isSchool ? 6 : 0, g.pts, buildingInfo(tags));
    add(g.pts);
    gisBuildings++;
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
/** 연결로(OSM *_link) 조각과, 그 가운데 경계선을 못 읽어 한 차로로 둔 조각 */
const linkRoad = new Set<number>();
for (const w of hw) if (/_link$/.test(w.tags!.highway)) for (const p of piecesOf.get(w.id) ?? []) linkRoad.add(p.road);
const linkGuess = new Set<number>();
let linkMoved = 0;
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
    if (linkRoad.has(i)) {
      // 연결로: 가운데선이 경계선 사이 가운데에서 1.5m 넘게 어긋나면 모양 점(양 끝 노드는 그대로)을 그 가운데로 옮기고,
      // 본선 차선을 세거나 같은 길 다른 조각 값을 빌리지 않고 양쪽 경계선(7.5m 안) 사이 폭으로 읽는다(못 읽으면 한 차로)
      const moved = centerLink(ptsOf(r), linkSections(idx, ptsOf(r), 12));
      if (moved) {
        moved.forEach(([x, z], k) => ((r[6 + k * 3] = dm(x)), (r[8 + k * 3] = dm(z))));
        linkMoved++;
      }
      const L = analyseLink(idx, ptsOf(r), !!(r[2] & 1));
      if (L) roadLanes[i] = { ...L, off: Math.max(-2, Math.min(2, L.off)) };
      else {
        roadLanes[i] = { off: 0, lf: 1, lb: r[2] & 1 ? 0 : 1, lw: 3.5, ctype: 0, busR: false, busL: false, medBus: false, n: 0 };
        linkGuess.add(i);
      }
      return;
    }
    roadLanes[i] = analysePiece(idx, ptsOf(r), !!(r[2] & 1));
  });
}
/** 못 읽은 조각(교차로 사이 짧은 조각 등)은 같은 길의 가장 길게 읽은 조각 값을 쓴다. 가운데 자리는 노드 쪽 계산에 맡긴다 */
const laneFilled = new Set<number>(linkGuess);
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
  console.log(`차선으로 읽은 조각 ${roadLanes.filter(Boolean).length - laneFilled.size}개(+같은 길에서 채운 ${laneFilled.size - linkGuess.size}개), 연결로 ${linkRoad.size}개(경계선으로 읽은 것 ${linkRoad.size - linkGuess.size}, 한 차로로 둔 것 ${linkGuess.size}, 가운데선을 옮긴 것 ${linkMoved}), 옮긴 노드 ${moved.size}개`);
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
  /** 조각마다의 실제 면 외곽선(m). 두 단 횡단보도는 조각이 여럿이다 */
  rings: [number, number][][];
}
const crossings: Cross[] = [];
/** 외곽선 여럿 → [점 개수, x, z, ...(데시미터), 점 개수, ...]. 닫는 점은 뺀다 */
const ringsOut = (rings: [number, number][][]) =>
  rings.flatMap((r) => {
    const pts = r.length > 1 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1] ? r.slice(0, -1) : r;
    return [pts.length, ...pts.flatMap(([x, z]) => [dm(x), dm(z)])];
  });
/** 축이 걸어 다니는 길을 지나지 않아 건너는 데 쓰지 못하는 횡단보도 면(그리기만 한다) */
const drawOnlyRings: [number, number][][] = [];
{
  const file = new URL('./raw/seoul-crosswalks.json', import.meta.url);
  const src = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { areas: [], points: [] };
  // 면 없는 2026 점(되돌린 자리)과 OSM 횡단보도 선: 2021 면 가운데 지금도 있는 것을 가리는 데 쓴다
  const newPts = (src.points as { lat: number; lon: number; sig: boolean }[]).map((p) => {
    const [x, z] = toXZ(p.lat, p.lon);
    return { x: x + 0.81, z: z - 5.31, sig: p.sig };
  });
  const osmCross = raw('highways')
    .filter((e) => e.geometry && (e.tags?.footway === 'crossing' || e.tags?.highway === 'crossing'))
    .map((e) => e.geometry!.map((g) => toXZ(g.lat, g.lon)));
  let stale = 0;
  const rects: (Rect & { sig: boolean | null; ring: [number, number][] })[] = [];
  for (const a of src.areas as { ring: [number, number][]; sig: boolean | null }[]) {
    const ring = a.ring.map(([la, lo]) => toXZ(la, lo));
    const r = minRect(ring);
    if (r.len <= 1.5 || r.wid <= 0.8 || !inBoard(r.cx, r.cz, 4)) continue;
    if (!isCurrent(ring, a.sig !== null, newPts.map((p) => [p.x, p.z]), osmCross)) {
      stale++;
      continue;
    }
    // 관리번호만 바뀐 면은 가까운 2026 점의 보행등 유무를 쓴다
    const sig = a.sig ?? newPts.find((p) => ringDist(p.x, p.z, ring) <= 5)?.sig ?? null;
    rects.push({ ...r, sig, ring });
  }
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
  /** (x, z)에서 가장 가까운 찻길(등급 maxCls 이하, r m 안) 선분 */
  const nearestRoad = (x: number, z: number, r: number, maxCls: number) => {
    let best: { d: number; x: number; z: number; dx: number; dz: number; i: number } | null = null;
    for (const [i, k] of segsNear(x, z, r)) {
      if (roads[i][0] > maxCls) continue;
      const P = ptsOf(roads[i]);
      const [ax, az] = P[k];
      const [bx, bz] = P[k + 1];
      const dx = bx - ax;
      const dz = bz - az;
      const l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
      const d = Math.hypot(ax + dx * t - x, az + dz * t - z);
      if (d < r && (!best || d < best.d)) best = { d, x: ax + dx * t, z: az + dz * t, dx: dx / Math.sqrt(l2), dz: dz / Math.sqrt(l2), i };
    }
    return best;
  };
  // 정사각형에 가까운 조각은 가장 가까운 길과 직각인 쪽을 건너는 방향으로
  rects.forEach((r, i) => {
    const near = nearestRoad(r.cx, r.cz, 15, 5);
    if (near) rects[i] = { ...alignToRoad(r, near.dx, near.dz), sig: r.sig, ring: r.ring };
  });
  // 면이 없는 새 횡단보도 점: 가까운 찻길(15m 안)에 직각으로, 폭 4m
  for (const p of newPts) {
    const { x, z } = p;
    if (!inBoard(x, z, 4) || rects.some((r) => Math.hypot(r.cx - x, r.cz - z) < 8 || ringDist(x, z, r.ring) <= 5)) continue;
    const best = nearestRoad(x, z, 15, 4);
    if (!best) continue;
    const ux = -best.dz;
    const uz = best.dx;
    const h = (carriageway(best.i) + 1) / 2;
    const ring: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [best.x + ux * a * h - uz * b * 2, best.z + uz * a * h + ux * b * 2]);
    rects.push({ cx: best.x, cz: best.z, ux, uz, len: h * 2, wid: 4, sig: p.sig, ring });
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
    const rings = m.parts.map((p) => rects[p].ring);
    if (!verts[c].length) {
      // 판에 없는 골목·진입로 입구의 횡단보도: 걸어 다니는 길 15m 안이면 그리기만 한다(다리 위 3m 안은 높이가 달라 뺀다).
      // 꼭짓점을 넣은 뒤라 선분 격자 번호가 밀려 있으므로 길을 직접 훑는다
      for (const ring of rings) {
        const r = minRect(ring);
        const within = (d: number, pick: (rd: number[]) => boolean) =>
          roads.some((rd) => pick(rd) && ptsOf(rd).some((p, k, P) => k > 0 && segDist(r.cx, r.cz, P[k - 1][0], P[k - 1][1], p[0], p[1]) < d));
        if (within(15, (rd) => rd[0] <= 5 && !rd[3]) && !within(3, (rd) => !!rd[3])) drawOnlyRings.push(ring);
      }
      return;
    }
    const parts = m.parts.map((p) => rects[p].sig);
    const sig = parts.includes(true) ? true : parts.includes(false) ? false : null;
    const vs = verts[c].sort((a, b) => a.u - b.u).filter((v, k, a) => k === 0 || v.x !== a[k - 1].x || v.z !== a[k - 1].z);
    crossings.push({ ...m, sig, stage: m.parts.length > 1, verts: vs.map((v) => [v.x, v.z]), rings });
  });
  console.log(`횡단보도 면: 2026 자료에 없어 뺀 것 ${stale}개, 건너는 길이 없어 그리기만 하는 것 ${drawOnlyRings.length}개`);
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

// ───────────────────────── 찻길 가장자리 ─────────────────────────
// 차로 수 × 차로 폭으로 어림한 찻길 가장자리를 서울시 차선 자료의 연석 쪽 가장자리선(009·010·011)으로 고친다(tools/lib/lanes.ts readEdges).
// 버스 정차 자리·주차 자리처럼 폭이 바뀌는 곳을 따라가고, 선이 없는 곳은 어림값을 쓴다. 차가 달리는 차로는 그대로 두고 그리는 찻길 바닥과 보도 자리만 바뀐다.
// 한 방향 큰길의 분리대 쪽(왼쪽)은 분리대 폭으로 그리므로 읽지 않는다.
const nearHalf = (i: number): [number, number] => {
  const r = roads[i];
  const L = roadLanes[i];
  if (L) {
    const lw = laneWidth(i);
    return r[2] & 1 ? [(L.lf * lw) / 2 + 0.5, (L.lf * lw) / 2 + 0.5] : [L.lf * lw + 0.5, L.lb * lw + 0.5];
  }
  const h = carriageway(i) / 2;
  return [h, h];
};
const roadEdges: ({ right: Profile; left: Profile } | null)[] = roads.map(() => null);
{
  const segs: LaneSeg[] = [];
  for (const l of tgis) {
    const P = l.p.map(([a, b]) => toXZ(a, b));
    for (let i = 0; i + 1 < P.length; i++) segs.push({ ax: P[i][0], az: P[i][1], bx: P[i + 1][0], bz: P[i + 1][1], k: l.k, k2: l.k2 });
  }
  const idx = laneIndex(segs);
  let changed = 0;
  roads.forEach((r, i) => {
    if (r[0] > 4 || r[3] || r.some((v, k) => k >= 6 && k % 3 === 1 && v > 3)) return;
    const near = nearHalf(i);
    const e = readEdges(idx, ptsOf(r), near);
    if (r[2] & 1 && medianGap[i] > 0.15 && medianGap[i] <= 10) e.left = { s: [0, e.left.s[e.left.s.length - 1]], v: [near[1], near[1]] };
    if (![...e.right.v.map((v) => v - near[0]), ...e.left.v.map((v) => v - near[1])].some((d) => Math.abs(d) > 0.3)) return;
    roadEdges[i] = e;
    changed++;
  });
  console.log(`찻길 가장자리를 연석선으로 고친 조각 ${changed}개`);
}
// 행정안전부 도로명주소 전자지도 실폭도로(tools/public.py 로 뽑는다, 건물 앞까지의 도로 부지)로 찻길 가장자리를 한 번 더 고친다(tools/lib/lanes.ts fitToRoadArea).
// 연석선이 없는 골목은 도로 면 경계를 가장자리로 삼고, 연석선으로 읽은 쪽은 도로 면 밖으로 나간 곳만 줄인다. 파일이 없으면 건너뛴다.
{
  const file = new URL('./raw/gis-roads.json', import.meta.url);
  if (existsSync(file)) {
    const segs: LaneSeg[] = [];
    for (const x of JSON.parse(readFileSync(file, 'utf8')).roads as { r: [number, number][][] }[])
      for (const ring of x.r) {
        const P = ring.map(([a, b]) => toXZ(a, b));
        for (let i = 0; i + 1 < P.length; i++) segs.push({ ax: P[i][0], az: P[i][1], bx: P[i + 1][0], bz: P[i + 1][1], k: 'RW', k2: '' });
      }
    const idx = laneIndex(segs);
    let fitted = 0;
    roads.forEach((r, i) => {
      if (r[0] > 4 || r[3] || r.some((v, k) => k >= 6 && k % 3 === 1 && v > 3)) return;
      const near = nearHalf(i);
      const P = ptsOf(r);
      const len = P.reduce((a, p, k) => (k ? a + Math.hypot(p[0] - P[k - 1][0], p[1] - P[k - 1][1]) : 0), 0);
      const cur = roadEdges[i] ?? { right: { s: [0, len], v: [near[0], near[0]] }, left: { s: [0, len], v: [near[1], near[1]] } };
      const e = fitToRoadArea(idx, P, cur, roadEdges[i] ? [true, true] : [false, false]);
      const moved = (a: Profile, b: Profile) => b.s.some((s, k) => {
        let j = 0;
        while (j + 2 < a.s.length && a.s[j + 1] < s) j++;
        const t = Math.max(0, Math.min(1, (s - a.s[j]) / (a.s[j + 1] - a.s[j] || 1)));
        return Math.abs(a.v[j] + (a.v[j + 1] - a.v[j]) * t - b.v[k]) > 0.3;
      });
      if (!moved(cur.right, e.right) && !moved(cur.left, e.left)) return;
      roadEdges[i] = e;
      fitted++;
    });
    console.log(`찻길 가장자리를 실폭도로 경계로 고친 조각 ${fitted}개`);
  }
}
/** 조각 i 의 s 자리 찻길 가장자리(side 1 오른쪽, −1 왼쪽) */
const edgeAt = (i: number, s: number, side: number) => {
  const e = roadEdges[i];
  if (!e) return nearHalf(i)[side > 0 ? 0 : 1];
  const p = side > 0 ? e.right : e.left;
  let k = 0;
  while (k + 2 < p.s.length && p.s[k + 1] < s) k++;
  const t = Math.max(0, Math.min(1, (s - p.s[k]) / (p.s[k + 1] - p.s[k] || 1)));
  return p.v[k] + (p.v[k + 1] - p.v[k]) * t;
};

// ───────────────────────── 건물: 외곽선 자료에 없는 건물 ─────────────────────────
// 수치지도 건물 점(2018) 가운데 어느 판 건물에도 들지 않은 것(바닥 30㎡ 이상)은 OSM·Overture 에 외곽선이 없는 건물이다(망원동 서쪽에 많다).
// 그 자리에 바닥 면적만큼의 직사각형(긴 변 : 짧은 변 = 1.25)을 가장 가까운 길(40m 안)과 나란히 세운다. 이미 있는 건물과 겹치면 70·50·35%로 줄여 보고(15㎡ 아래로는 줄이지 않는다), 그래도 겹치면 세우지 않는다.
// 점이 찻길 안에 떨어지면(점 위치 오차) 세우지 않는다. 외곽선은 실제 모양이 아니라 어림이다(설계 23절).
// GIS건물통합정보(2026)가 있으면 이 단계를 건너뛴다: 그 자료에 없는 2018 점은 대부분 재개발로 헐린 건물이다(신촌·망원 재개발 구역에서 확인).
let pointBuildings = 0;
{
  const CELL = 40;
  const fgrid = new Map<string, [number, number][][]>();
  const addF = (f: [number, number][]) => {
    const xs = f.map((p) => p[0]);
    const zs = f.map((p) => p[1]);
    for (let gx = Math.floor(Math.min(...xs) / CELL); gx <= Math.floor(Math.max(...xs) / CELL); gx++)
      for (let gz = Math.floor(Math.min(...zs) / CELL); gz <= Math.floor(Math.max(...zs) / CELL); gz++) {
        const k = `${gx},${gz}`;
        (fgrid.get(k) ?? fgrid.set(k, []).get(k)!).push(f);
      }
  };
  footprints.forEach(addF);
  const near = (x: number, z: number) => fgrid.get(`${Math.floor(x / CELL)},${Math.floor(z / CELL)}`) ?? [];
  const overlaps = (r: [number, number][]) => {
    const ring = [[...r, r[0]]];
    const probe: [number, number][] = [...r, [(r[0][0] + r[2][0]) / 2, (r[0][1] + r[2][1]) / 2]];
    for (let k = 0; k < 4; k++) probe.push([(r[k][0] + r[(k + 1) % 4][0]) / 2, (r[k][1] + r[(k + 1) % 4][1]) / 2]);
    for (const [x, z] of probe) for (const f of near(x, z)) if (inside([[...f, f[0]]], x, z)) return true;
    for (const [x, z] of probe) for (const f of near(x, z)) if (f.some(([fx, fz]) => inside(ring, fx, fz))) return true;
    return false;
  };
  const RC = 40;
  /** 길 조각 꼭짓점 사이 [ax, az, bx, bz, 조각 번호, 시작 s] */
  const rgrid = new Map<string, [number, number, number, number, number, number][]>();
  roads.forEach((r, i) => {
    if (r[3]) return;
    const P = ptsOf(r);
    let s0 = 0;
    for (let k = 0; k + 1 < P.length; k++) {
      const key = `${Math.floor((P[k][0] + P[k + 1][0]) / 2 / RC)},${Math.floor((P[k][1] + P[k + 1][1]) / 2 / RC)}`;
      (rgrid.get(key) ?? rgrid.set(key, []).get(key)!).push([P[k][0], P[k][1], P[k + 1][0], P[k + 1][1], i, s0]);
      s0 += Math.hypot(P[k + 1][0] - P[k][0], P[k + 1][1] - P[k][1]);
    }
  });
  /** 가장 가까운 길(40m 안) 방향과, 점이 그 길(등급 5 이하, 땅 위)의 찻길 안에 드는가 */
  const roadDir = (x: number, z: number): { dir: [number, number]; onRoad: boolean } => {
    let best = 40;
    let dir: [number, number] = [1, 0];
    let onRoad = false;
    for (let gx = -1; gx <= 1; gx++)
      for (let gz = -1; gz <= 1; gz++)
        for (const [ax, az, bx, bz, i, s0] of rgrid.get(`${Math.floor(x / RC) + gx},${Math.floor(z / RC) + gz}`) ?? []) {
          const d = segDist(x, z, ax, az, bx, bz);
          const L = Math.hypot(bx - ax, bz - az);
          if (L < 1) continue;
          if (d < best) (best = d), (dir = [(bx - ax) / L, (bz - az) / L]);
          if (roads[i][0] > 5 || roads[i].some((v, k) => k >= 6 && k % 3 === 1 && v > 3)) continue;
          const t = ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / (L * L);
          if (t < 0 || t > 1) continue;
          const side = Math.sign((x - ax) * -(bz - az) + (z - az) * (bx - ax)) || 1;
          if (d < edgeAt(i, s0 + t * L, side)) onRoad = true;
        }
    return { dir, onRoad };
  };
  for (const p of gisList.length ? [] : bldgPoints) {
    if (p.used || p.area < 30 || !inBoard(p.x, p.z, 6)) continue;
    if (near(p.x, p.z).some((f) => inside([[...f, f[0]]], p.x, p.z))) continue;
    const { dir: [ux, uz], onRoad } = roadDir(p.x, p.z);
    if (onRoad) continue;
    let r: [number, number][] | null = null;
    for (const k of [1, 0.7, 0.5, 0.35]) {
      if (p.area * k < 15) break;
      const c = rectFootprint(p.x, p.z, p.area * k, ux, uz, 1.25);
      if (!overlaps(c)) {
        r = c;
        break;
      }
    }
    if (!r || !r.every(([x, z]) => inBoard(x, z, 4))) continue;
    const id = Math.round(p.x * 10) * 65536 + Math.round(p.z * 10);
    const tags: Record<string, string> = { building: 'yes' };
    if (p.floors > 0) tags['building:levels'] = String(p.floors);
    // 층수를 모르는 작은 바닥(60㎡ 미만)은 창고·부속 건물이 많아 1층으로 둔다
    const h = p.floors > 0 ? p.floors * 3.2 + 1 : p.area < 60 ? 4.2 : estimateHeight({ building: 'residential' }, p.area, id);
    const isSchool = schoolSites.some((sc) => inside([sc.ring], p.x, p.z));
    pushBuilding(Math.max(3, Math.min(260, h)), isSchool ? 6 : 0, r, buildingInfo(tags));
    addF(r);
    pointBuildings++;
  }
  console.log(`건물 높이 자료: 표제부 ${bsrc.title}, GIS건물통합정보 ${bsrc.gis}, 높이·층수 태그 ${bsrc.tag}, 수치지도 점 ${bsrc.point}, 추정 ${bsrc.guess}. 외곽선 자료에 없어 수치지도 점 자리에 세운 건물 ${pointBuildings}동`);
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

// 서울 생태현황도(개별비오톱, tools/ground.py 가 받는다). 없으면 OSM 만 쓴다
interface Biotope {
  lu: string;
  use: string;
  veg: string;
  /** 녹지율·불투수 포장율·투수 포장율(%) */
  green: number;
  imp: number;
  perm: number;
  r: [number, number][][];
}
const bioFile = new URL('./raw/seoul-biotope.json', import.meta.url);
const biotopes: Biotope[] = existsSync(bioFile) ? JSON.parse(readFileSync(bioFile, 'utf8')).areas : [];
const bioRings = (b: Biotope) => b.r.map((r) => r.map(([lat, lon]) => toXZ(lat, lon)));
// 물과 녹지는 칸마다 덮인 비율로 칠해 경계를 매끈하게 한다(셰이더가 선형 보간 값에 문턱을 준다)
for (const el of raw('water')) {
  const t = el.tags ?? {};
  if (t.tunnel || t.covered === 'yes' || t.location === 'underground') continue;
  if (t.waterway && t.waterway !== 'riverbank') {
    // 개울(경의선숲길 실개천 등)은 폭 3m
    if (el.geometry && (t.waterway === 'stream' || t.waterway === 'canal')) strokeLineAA(mask, SIZE, toPx(xz(el.geometry)), 1.5, 0);
    continue;
  }
  const rings = ringsOf(el).map(toPx);
  if (rings.length) fillPolygonAA(mask, SIZE, rings, 0);
}
for (const b of biotopes) if (b.lu.toUpperCase() === 'J1' && b.veg === '수면') fillPolygonAA(mask, SIZE, bioRings(b).map(toPx), 0);
// 녹지: 경기장·놀이터는 녹지에서 뺀다(바닥 면이 흙·코트·고무 바닥으로 칠하고, 나무도 심지 않는다)
for (const el of raw('green')) {
  if (el.tags?.leisure === 'pitch' || el.tags?.leisure === 'playground') continue;
  const rings = ringsOf(el).map(toPx);
  if (rings.length) fillPolygonAA(mask, SIZE, rings, 1);
}
for (const b of biotopes) {
  const k = biotopeKind(b);
  if (k === GK.FOREST || k === GK.GREEN || k === GK.RIVER_GREEN) fillPolygonAA(mask, SIZE, bioRings(b).map(toPx), 1);
}
{
  // 경기장·놀이터 자리는 비오톱 녹지에 들었어도 비운다
  const pitch = new Uint8Array(SIZE * SIZE * 4);
  for (const el of raw('green')) if (el.tags?.leisure === 'pitch' || el.tags?.leisure === 'playground') fillPolygon(pitch, SIZE, ringsOf(el).map(toPx), 1);
  for (let i = 1; i < pitch.length; i += 4) if (pitch[i]) mask[i] = 0;
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
  // 마스크는 덮인 비율이라 반 넘게 덮인 칸만 녹지·물로 본다
  const isGreen = (i: number) => mask[i * 4 + 1] >= 128 && mask[i * 4] < 128;
  let green = 0;
  for (let i = 0; i < SIZE * SIZE; i++) if (isGreen(i)) green++;
  const prob = Math.min(0.03, 5200 / Math.max(1, green));
  for (let iz = 0; iz < SIZE; iz++)
    for (let ix = 0; ix < SIZE; ix++) {
      const i = iz * SIZE + ix;
      if (!isGreen(i) || mask[i * 4 + 2] > 40) continue;
      if (hash01(i, 5) > prob) continue;
      const x = (ix + hash01(i, 6)) * 2 - HALF;
      const z = (iz + hash01(i, 7)) * 2 - HALF;
      if (inBoard(x, z, 12)) trees.push(dm(x), dm(z));
    }
  console.log(`녹지 ${((green * 4) / 1e6).toFixed(2)}㎢, 녹지에 뿌린 나무 ${trees.length / 2}그루`);
}
// 가로수: 서울시 가로수 위치정보(tools/ground.py 가 받는다). 건물 한가운데·물 위에 찍힌 점은 뺀다
const streetTreeFile = new URL('./raw/seoul-trees.json', import.meta.url);
/** 가로수가 시작하는 자리(trees 의 앞은 녹지에 뿌린 나무) */
const streetTree0 = trees.length;
if (existsSync(streetTreeFile)) {
  let n = 0;
  for (const [lat, lon] of JSON.parse(readFileSync(streetTreeFile, 'utf8')).trees as [number, number][]) {
    const [x, z] = toXZ(lat, lon);
    if (!inBoard(x, z, 12)) continue;
    const i = (Math.floor(px(z)) * SIZE + Math.floor(px(x))) * 4;
    if (mask[i] >= 128 || mask[i + 2] > 200) continue;
    trees.push(dm(x), dm(z));
    n++;
  }
  console.log(`가로수 ${n}그루 더함`);
}

// ───────────────────────── 바닥 면: 서울 비오톱(땅 쓰임새·보도·둔치) 위에 OSM 면(공원·광장·주차장·운동장·놀이터 등) ─────────────────────────
// 그리는 순서대로 늘어놓는다: 비오톱 면(서로 겹치지 않는다) → OSM 면(종류 순, 같은 종류는 넓은 것 먼저)
const groundAreas: (number | number[])[][] = [];
{
  type Pt = [number, number];
  const RECT_KINDS = new Set<number>([GK.PITCH_DIRT, GK.PITCH_TURF, GK.COURT, GK.TRACK, GK.PARKING]);
  const nearBoard = (r: Pt[]) => r.some(([x, z]) => inBoard(x, z, -20));
  const items: { kind: number; param: number; outer: Pt[]; holes: Pt[][]; area: number }[] = [];
  const add = (kind: number, param: number, rings: Pt[][], tol: number) => {
    for (const p of groupRings(rings.map((r) => simplifyRing(r, tol)))) {
      const area = Math.abs(ringArea(p.outer)) - p.holes.reduce((s, h) => s + Math.abs(ringArea(h)), 0);
      if (area < 2 || !nearBoard(p.outer)) continue;
      items.push({ kind, param, outer: p.outer, holes: p.holes, area });
    }
  };
  for (const b of biotopes) {
    const k = biotopeKind(b);
    if (k) add(k, b.green, bioRings(b), 0.3);
  }
  const areaFile = new URL('./raw/areas.json', import.meta.url);
  const osm: El[] = existsSync(areaFile) ? JSON.parse(readFileSync(areaFile, 'utf8')).elements : [];
  for (const el of osm) {
    const { kind, sport } = osmKind(el.tags ?? {});
    if (!kind) continue;
    let rings: Pt[][] = [];
    if (el.type === 'way' && el.geometry && el.geometry.length >= 4) {
      const r = xz(el.geometry);
      if (r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1]) rings = [r];
    } else if (el.type === 'relation') rings = assembleRings((el.members ?? []).filter((m) => m.type === 'way' && m.geometry).map((m) => xz(m.geometry!)));
    if (rings.length) add(kind, sport, rings, 0.15);
  }
  items.sort((a, b) => (a.kind < 20 && b.kind < 20 ? 0 : a.kind - b.kind || b.area - a.area));
  for (const it of items) groundAreas.push(encodeArea(it.kind, it.param, RECT_KINDS.has(it.kind) ? minRect(it.outer) : null, it.outer, it.holes));
  const count = new Map<number, number>();
  for (const it of items) count.set(it.kind, (count.get(it.kind) ?? 0) + 1);
  const name = Object.fromEntries(Object.entries(GK).map(([k, v]) => [v, k]));
  console.log(`바닥 면 ${items.length}개(비오톱 ${items.filter((i) => i.kind < 20).length}, OSM ${items.filter((i) => i.kind >= 20).length}): ${[...count].sort((a, b) => a[0] - b[0]).map(([k, n]) => `${name[k]} ${n}`).join(', ')}, ${(JSON.stringify(groundAreas).length / 1e6).toFixed(2)}MB`);
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

/** 찻길 조각 번호 → OSM layer(없으면 다리 1, 아니면 0). 철도와 엇갈리는 곳에서 어느 쪽이 위인지 정한다 */
const roadLayer = new Map<number, number>();
for (const w of hw) for (const p of piecesOf.get(w.id) ?? []) roadLayer.set(p.road, Number(w.tags!.layer) || (isBridge(w.tags!) ? 1 : 0));
/** 철도가 찻길 위로 지날 때 찻길보다 높게, 밑으로 지날 때 낮게 두는 높이(m): 버스 높이 3.5m + 철교·덮개 두께 */
const RAIL_CLEAR = 5;

const lines = LINES.map((spec) => {
  const ways = railWays.filter((w) => spec.match(w.tags ?? {}));
  const pk = (p: number[]) => `${Math.round(p[0] * 10)},${Math.round(p[1] * 10)}`;
  const segTags = new Map<string, Tags>(); // 이웃한 두 점 → 그 조각이 속한 선로의 태그
  const pieces = ways.map((w) => {
    const pts = xz(w.geometry!);
    for (let i = 1; i < pts.length; i++) segTags.set(`${pk(pts[i - 1])}|${pk(pts[i])}`, w.tags!).set(`${pk(pts[i])}|${pk(pts[i - 1])}`, w.tags!);
    return { id: w.id, pts };
  });
  const chain = stitch(pieces);
  const chainTags = chain.slice(1).map((p, i) => segTags.get(`${pk(chain[i])}|${pk(p)}`) ?? {});
  // 터널·지상·다리 구간마다 15m 안 간격으로 다시 찍는다. 구간 경계는 꼭짓점으로 남긴다
  const c2 = [0];
  for (let i = 1; i < chain.length; i++) c2.push(c2[i - 1] + Math.hypot(chain[i][0] - chain[i - 1][0], chain[i][1] - chain[i - 1][1]));
  const at = (s: number): [number, number] => {
    let i = 1;
    while (i < c2.length - 1 && c2[i] < s) i++;
    const t = Math.min(1, Math.max(0, (s - c2[i - 1]) / Math.max(1e-6, c2[i] - c2[i - 1])));
    return [chain[i - 1][0] + (chain[i][0] - chain[i - 1][0]) * t, chain[i - 1][1] + (chain[i][1] - chain[i - 1][1]) * t];
  };
  const sS: number[] = [0];
  const sKind: number[] = [];
  const sLayer: number[] = [];
  for (let i = 0; i < chainTags.length; ) {
    const k = railKind(chainTags[i]);
    const layer = Number(chainTags[i].layer) || k;
    let j = i + 1;
    while (j < chainTags.length && railKind(chainTags[j]) === k && (Number(chainTags[j].layer) || k) === layer) j++;
    const [a, b] = [c2[i], c2[j]];
    const m = Math.max(1, Math.ceil((b - a) / 15));
    for (let q = 1; q <= m; q++) sS.push(a + ((b - a) * q) / m), sKind.push(k), sLayer.push(layer);
    i = j;
  }
  const sXZ = sS.map(at);
  // 찻길(등급 5 이하)과 엇갈리는 조각: 철도 layer 가 높으면 찻길 위로, 아니면 밑으로(마포 판의 철도에는 건널목이 없다)
  const lo = sS.map(() => -Infinity);
  const hi = sS.map(() => Infinity);
  let crossN = 0;
  roads.forEach((r, ri) => {
    if (r[0] > 5) return;
    for (let k = 6; k + 5 < r.length; k += 3) {
      const [cx, cy, cz, dx, dy, dz] = [r[k] / 10, r[k + 1] / 10, r[k + 2] / 10, r[k + 3] / 10, r[k + 4] / 10, r[k + 5] / 10];
      for (let i = 0; i + 1 < sXZ.length; i++) {
        const [[ax, az], [bx, bz]] = [sXZ[i], sXZ[i + 1]];
        const den = (bx - ax) * (dz - cz) - (bz - az) * (dx - cx);
        if (Math.abs(den) < 1e-9) continue;
        const t = ((cx - ax) * (dz - cz) - (cz - az) * (dx - cx)) / den;
        const u = ((cx - ax) * (bz - az) - (cz - az) * (bx - ax)) / den;
        if (t < 0 || t > 1 || u < 0 || u > 1) continue;
        const yc = cy + (dy - cy) * u;
        crossN++;
        for (const v of [i, i + 1])
          if (sLayer[i] > (roadLayer.get(ri) ?? 0)) lo[v] = Math.max(lo[v], yc + RAIL_CLEAR);
          else hi[v] = Math.min(hi[v], yc - RAIL_CLEAR);
      }
    }
  });
  const sY = railProfile(sS, sKind, lo, hi);
  // 판 안에 있는 가장 긴 연속 구간만 남긴다
  let from = 0;
  let span: [number, number] = [0, 0];
  for (let i = 0; i <= sS.length; i++) {
    if (i < sS.length && inBoard(sXZ[i][0], sXZ[i][1], 1)) continue;
    if (i - from > span[1] - span[0]) span = [from, i];
    from = i + 1;
  }
  const keep = Array.from({ length: span[1] - span[0] }, (_, q) => span[0] + q);
  const best = keep.flatMap((i) => [sXZ[i][0], sY[i], sXZ[i][1]]);
  const kinds = keep.slice(0, -1).map((i) => sKind[i]);
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
  return { id: spec.id, name: spec.name, color: spec.color, cars: spec.cars, p: best.map(dm), k: kinds, stops: st, _ways: ways.length, _len: Math.round(cum[cum.length - 1] ?? 0), _cross: crossN };
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
  let best: { d: number; i: number; ux: number; uz: number; px: number; pz: number; side: number; half: number } | null = null;
  roads.forEach((r, i) => {
    if (r[0] > 4 || r[3]) return;
    const P = ptsOf(r);
    let s0 = 0;
    for (let k = 0; k + 1 < P.length; k++) {
      const [ax, az] = P[k];
      const [bx, bz] = P[k + 1];
      const dx = bx - ax;
      const dz = bz - az;
      const L = Math.hypot(dx, dz);
      s0 += L;
      if (L < 1) continue;
      const t = Math.max(0, Math.min(L, ((x - ax) * dx + (z - az) * dz) / L));
      const px = ax + (dx / L) * t;
      const pz = az + (dz / L) * t;
      const side = Math.sign((x - ax) * -dz + (z - az) * dx) || 1;
      const half = edgeAt(i, s0 - L + t, side);
      const d = Math.hypot(px - x, pz - z) - half; // 찻길 가장자리에서 떨어진 거리
      if (d < 30 && (!best || d < best.d)) best = { d, i, ux: dx / L, uz: dz / L, px, pz, side, half };
    }
  });
  const st = stations.find((s) => s.name === e.st)!;
  if (!best) {
    exitYaw.push(Math.round(Math.atan2(st.z / 10 - z, st.x / 10 - x) * 1000));
    continue;
  }
  const b = best as { d: number; i: number; ux: number; uz: number; px: number; pz: number; side: number; half: number };
  const toward = Math.sign((st.x / 10 - x) * b.ux + (st.z / 10 - z) * b.uz) || 1;
  exitYaw.push(Math.round(Math.atan2(b.uz * toward, b.ux * toward) * 1000));
  if (b.d < 1.6) {
    // 출구(폭 약 3m) 가운데를 찻길 가장자리에서 2.2m 밖으로
    const want = b.half + 2.2;
    e.x = dm(b.px - b.uz * b.side * want);
    e.z = dm(b.pz + b.ux * b.side * want);
    exitsPushed++;
  }
}

// 용도를 모르는 건물: 큰길(집산도로 이상, 등급 3 이하)의 찻길 가장자리에서 12m 안에 꼭짓점이 있으면 상가로 본다(서울 큰길가는 1층이 가게인 근린생활시설이 대부분)
{
  const CELL = 40;
  const segs = new Map<string, [number, number, number, number, number][]>();
  roads.forEach((r, i) => {
    if (r[0] > 3 || r[3]) return;
    const P = ptsOf(r);
    const half = carriageway(i) / 2;
    for (let k = 0; k + 1 < P.length; k++) {
      const [ax, az] = P[k];
      const [bx, bz] = P[k + 1];
      for (let gx = Math.floor(Math.min(ax, bx) / CELL) - 1; gx <= Math.floor(Math.max(ax, bx) / CELL) + 1; gx++)
        for (let gz = Math.floor(Math.min(az, bz) / CELL) - 1; gz <= Math.floor(Math.max(az, bz) / CELL) + 1; gz++) {
          const key = `${gx},${gz}`;
          (segs.get(key) ?? segs.set(key, []).get(key)!).push([ax, az, bx, bz, half]);
        }
    }
  });
  let n = 0;
  buildings.forEach((b, i) => {
    if (binfo[i] % 8 !== 0) return;
    for (let k = 2; k < b.length; k += 2) {
      const x = b[k] / 10;
      const z = b[k + 1] / 10;
      for (const [ax, az, bx, bz, half] of segs.get(`${Math.floor(x / CELL)},${Math.floor(z / CELL)}`) ?? []) {
        const dx = bx - ax;
        const dz = bz - az;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
        if (Math.hypot(ax + dx * t - x, az + dz * t - z) - half < 12) {
          binfo[i] += 4; // USE.commercial
          n++;
          return;
        }
      }
    }
  });
  console.log(`큰길가라 상가로 본 건물 ${n}동`);
}

// 역 엘리베이터: 지하층(level 에 음수)과 이어지는 OSM 엘리베이터 노드 가운데 역에서 250m 안(tools/fetch-parts.ts 로 받는다)
const elevators = (existsSync(new URL('./raw/elevators.json', import.meta.url)) ? raw('elevators') : []).flatMap((e) => {
  const [x, z] = toXZ(e.lat!, e.lon!);
  if (!inBoard(x, z, 20) || !/(^|;)-\d/.test(e.tags?.level ?? '')) return [];
  return stations.some((s) => Math.hypot(s.x / 10 - x, s.z / 10 - z) < 250) ? [dm(x), dm(z)] : [];
});

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

// 가게(tools/shops.py, 소상공인시장진흥공단 상가(상권)정보): 외곽선 안이거나 12m 안 가장 가까운 건물에 붙인다. 화면은 이 건물에만 실제 층(지하·1층·2층·3층 위)에 맞춰 가게 유리·간판을 그리고 업종별로 불을 끈다
const shopList: number[] = [];
{
  const file = new URL('./raw/seoul-shops.json', import.meta.url);
  if (existsSync(file)) {
    const pts = (JSON.parse(readFileSync(file, 'utf8')).shops as [number, number, number, number][]).map(([lat, lon, k, f]): [number, number, number, number] => [...toXZ(lat, lon), k, f]);
    const got = attachShops(pts, footprints, 12);
    for (const [i, v] of [...got].sort((a, b) => a[0] - b[0])) shopList.push(i, v.kind, v.up, v.mask, v.n);
    const by = [0, 0, 0, 0, 0, 0, 0];
    for (const { kind } of got.values()) by[kind]++;
    console.log(`가게 ${pts.length}곳을 건물 ${got.size}동에 붙임(1층 카페 ${by[1]}·음식점 ${by[2]}·주점 ${by[3]}·편의점 ${by[4]}·병원약국 ${by[5]}·소매생활 ${by[6]}동, 위층 가게만 ${by[0]}동), 못 붙인 가게 ${pts.length - [...got.values()].reduce((a, v) => a + v.n, 0)}곳`);
  }
}
const out = {
  v: 1,
  names,
  b: buildings,
  bi: binfo,
  sh: shopList,
  ev: elevators,
  r: roads,
  lines: lines.map(({ _ways, _len, _cross, ...l }) => l),
  stations,
  exits: exits.map((e, i) => ({ ...e, yaw: exitYaw[i] })),
  landmarks,
  // 조각마다 [진행 방향 차로, 반대 방향 차로, 차로 폭(cm), 중앙선 종류, 표시(1 오른쪽 버스차로, 2 반대쪽 버스차로, 4 중앙버스차로), 분리대 폭(dm)]. 0 = 차선 자료 없음
  rl: roads.map((_, i) => {
    const L = roadLanes[i];
    if (L) return [L.lf, L.lb, Math.round(laneWidth(i) * 100), L.ctype, (L.busR ? 1 : 0) | (L.busL ? 2 : 0) | (L.medBus ? 4 : 0), dm(medianGap[i])];
    return medianGap[i] > 0 ? [0, 0, 0, 0, 0, dm(medianGap[i])] : 0;
  }),
  // 찻길 가장자리: 조각마다 [[오른쪽 s, 거리, s, 거리, ...], [왼쪽 ...]] (dm). 0 = 차로로 어림한 값(src/data/board.ts roadHalf)
  re: roadEdges.map((e) => (e ? [e.right, e.left].map((p) => p.s.flatMap((s, k) => [dm(s), dm(p.v[k])])) : 0)),
  // 횡단보도: [가운데 x, z, 건너는 방향 ×1000 (x, z), 반 길이, 폭, 표시(1 보행 신호, 2 신호 모름, 4 두 단), 축이 지나는 꼭짓점 x, z, ...]
  xw: crossings.map((c) => [dm(c.cx), dm(c.cz), Math.round(c.ux * 1000), Math.round(c.uz * 1000), dm(c.len / 2), dm(c.wid), (c.sig ? 1 : 0) | (c.sig === null ? 2 : 0) | (c.stage ? 4 : 0), ...c.verts.flat()]),
  xwp: crossings.map((c) => ringsOut(c.rings)),
  xwd: ringsOut(drawOnlyRings),
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
  // 바닥 면 [종류, 값, 직사각형, 바깥 고리, 구멍...] (src/data/board.ts 의 GK)
  ga: groundAreas,
};
// 높이 다른 찻길(찻길 바닥·노면 표시를 굽기 전에 정한다. 올린 둑길은 땅 찻길이 아니고, 그 위 노면 표시는 데크 높이로 올린다. 재작업 W14): 찻길 터널 조각 표시, 다른 찻길을 노드 없이 넘는 다리 올리기(tools/lib/levels.ts, tools/levels.ts 와 같은 함수)
{
  const lv = roadLevels(out.r, raw('highways'));
  console.log(`찻길 터널 조각 ${lv.tunnels}, 올린 다리 넘는 자리 ${lv.raised.length}, 다리가 아니라 못 올린 곳 ${lv.skipped.length}`);
}
// 찻길 가장자리를 서울시 칠한 선이 모두 들어오게 넓힌다(tools/lib/laneedges.ts, 재작업 W14). 모퉁이·교차로 면·보도 면은 넓힌 가장자리로 굽는다
{
  const b0 = decodeBoard(out as unknown as BoardJson);
  // 건물 외곽선과 지하철 출구 모형 자리(0.5m 칸): 찻길을 여기까지 넓히지 않는다
  const blk = makeBits(-BOARD_R, -BOARD_R, BOARD_R, BOARD_R, 0.5);
  for (const bl of b0.buildings) fillBits(blk, [bl.pts], 1);
  for (const e of b0.exits) {
    const o = exitOutline(e, exitLook(e.st, e.ref ?? ''));
    const [ux, uz] = [Math.cos(e.yaw), Math.sin(e.yaw)];
    const { cx, cz } = exitBody(e, exitLook(e.st, e.ref ?? '').l);
    let [a0, a1, h] = [Infinity, -Infinity, 0];
    for (const [x, z] of o) {
      const a = (x - cx) * ux + (z - cz) * uz;
      (a0 = Math.min(a0, a)), (a1 = Math.max(a1, a)), (h = Math.max(h, Math.abs((x - cx) * -uz + (z - cz) * ux)));
    }
    const at = (a: number, c: number) => [cx + ux * a - uz * c, cz + uz * a + ux * c];
    // 출구 자리 맞추기(src/data/exitFit.ts)가 찻길에 10% 넘게 걸린 출구를 옮기므로 1m 더 비워 둔다
    fillBits(blk, [[...at(a0 - 1, -h - 1), ...at(a1 + 1, -h - 1), ...at(a1 + 1, h + 1), ...at(a0 - 1, h + 1)]], 1);
  }
  const w = widenEdges(b0.roads, b0.roads.map(isGroundRoad), tgis.map((l) => ({ k: Number(l.k), p: l.p.map(([a, c]) => toXZ(a, c)) })), (x, z) => !!(bitsAt(blk, x, z) & 1));
  for (const [i, pr] of w.edges) out.re[i] = pr.map((p) => p.s.flatMap((s, k) => [dm(s), dm(p.v[k])]));
  console.log(`찻길 가장자리를 칠한 선까지 넓힌 조각 ${w.moved}개(가장자리에서 4m 넘게 떨어져 맡기지 않은 선 점 ${w.far}개)`);
}
// 길 모퉁이 반지름: 구운 길로 모퉁이 목록(src/data/corners.ts)을 만들고, 가장자리선이 모퉁이를 돌아가는 곳은 그 반지름(2~25m)을 잰다
{
  const segs: LaneSeg[] = [];
  for (const l of tgis) {
    const P = l.p.map(([a, b]) => toXZ(a, b));
    for (let i = 0; i + 1 < P.length; i++) segs.push({ ax: P[i][0], az: P[i][1], bx: P[i + 1][0], bz: P[i + 1][1], k: l.k, k2: l.k2 });
  }
  const idx = laneIndex(segs);
  const corners = roadCorners(decodeBoard(out as unknown as BoardJson).roads);
  const rc = corners.map((c) => {
    const R = cornerRadius(idx, c);
    return R >= 2 && R <= 25 ? dm(R) : 0;
  });
  (out as Record<string, unknown>).rc = rc;
  const got = rc.filter((v) => v > 0).map((v) => v / 10).sort((a, b) => a - b);
  console.log(`길 모퉁이 ${corners.length}곳 가운데 가장자리선으로 반지름을 잰 곳 ${got.length}곳(중앙값 ${got[got.length >> 1]?.toFixed(1)}m)`);
}
// 찻길 바닥: 교차로마다 면 하나와 길 조각마다 띠를 그릴 구간(tools/lib/surface.ts). 렌더러가 public/data/surface.json 을 읽는다
let surfaceJson = '';
let surfacePolysJson = '';
let walkJson = '';
/** 그린 찻길 면(찻길 띠·교차로 면·분리대·그리기 전용 면, 찻길 터널 속은 뺀다): 노면 표시를 이 안으로 자른다(재작업 W14) */
let groundBits: Bits | null = null;
let curbsJson = '';
/** 터널 속을 따라가는 선의 점인가(재작업 W14) */
let underTunnel: ((x: number, z: number, ux: number, uz: number) => boolean) | undefined;
{
  const b = decodeBoard(out as unknown as BoardJson);
  const link = roads.map(() => 0);
  for (const w of hw) if (/_link$/.test(w.tags!.highway)) for (const p of piecesOf.get(w.id) ?? []) link[p.road] = 1;
  const crosses: SurfaceCross[] = b.crosswalks.map((c) => ({ x: c.x, z: c.z, ux: c.ux, uz: c.uz, half: c.half, rings: c.rings }));
  // 그리기만 하는 횡단보도 면: 가장 긴 변을 건너는 방향으로 본다(src/render/signals.ts 와 같다)
  for (const r of b.crosswalkMarks) {
    let best = 0;
    let ux = 1;
    let uz = 0;
    let cx = 0;
    let cz = 0;
    for (let k = 0; k < r.length; k += 2) {
      cx += (r[k] * 2) / r.length;
      cz += (r[k + 1] * 2) / r.length;
      const dx = r[(k + 2) % r.length] - r[k];
      const dz = r[(k + 3) % r.length] - r[k + 1];
      const l = Math.hypot(dx, dz);
      if (l > best) (best = l), (ux = dx / l), (uz = dz / l);
    }
    crosses.push({ x: cx, z: cz, ux, uz, half: best / 2, rings: [r] });
  }
  // 찻길에 칠한 표시는 교통섬이 될 수 없다(교통섬 구멍에서 뺀다): 안전지대 면(서울시 OA-15533), 연석 쪽 선(007·009·010·011·015·016·018)을
  // 뺀 차선 자료 선 둘레 0.75m, 노면 화살표(OA-15536) 둘레 2m. 모두 땅 위(001)만
  const zoneRaw = new URL('./raw/seoul-safety.json', import.meta.url);
  const paint: number[][] = (existsSync(zoneRaw) ? (JSON.parse(readFileSync(zoneRaw, 'utf8')).zones as { eve: string; ring: [number, number][] }[]) : [])
    .filter((zn) => zn.eve === '001')
    .map((zn) => zn.ring.flatMap(([a, c]) => toXZ(a, c)));
  const band = (ax: number, az: number, bx: number, bz: number, r: number) => {
    const l = Math.hypot(bx - ax, bz - az) || 1;
    const [ux, uz] = [((bx - ax) / l) * r, ((bz - az) / l) * r];
    return [ax - ux - uz, az - uz + ux, bx + ux - uz, bz + uz + ux, bx + ux + uz, bz + uz - ux, ax - ux + uz, az - uz - ux];
  };
  for (const l of tgis) {
    if (['007', '009', '010', '011', '015', '016', '018'].includes(l.k)) continue;
    const P = l.p.map(([a, c]) => toXZ(a, c));
    for (let i = 0; i + 1 < P.length; i++) paint.push(band(P[i][0], P[i][1], P[i + 1][0], P[i + 1][1], 0.75));
  }
  const arrowRaw = new URL('./raw/seoul-arrows.json', import.meta.url);
  for (const a of existsSync(arrowRaw) ? (JSON.parse(readFileSync(arrowRaw, 'utf8')).arrows as { eve: string; lat: number; lon: number }[]) : []) {
    if (a.eve !== '001') continue;
    const [x, z] = toXZ(a.lat, a.lon);
    paint.push([x - 2, z - 2, x + 2, z - 2, x + 2, z + 2, x - 2, z + 2]);
  }
  const sf = buildSurface(b.roads, b.cornerR, crosses, b.stopLines, link, paint);
  // 찻길 터널 속(입구에서 깊이 3m 넘게 들어간 곳)의 교차로 면은 땅 밑이라 그리지 않는다(재작업 W14)
  const reach = tunnelReach(b.roads);
  const underground = (x: number, z: number) =>
    b.roads.some((r, i) => {
      const rc = reach[i];
      if (!rc) return false;
      const L = cumLen(r.p);
      for (let k = 0; k + 1 < L.length; k++) {
        const [ax, az, bx, bz] = [r.p[k * 3], r.p[k * 3 + 2], r.p[k * 3 + 3], r.p[k * 3 + 5]];
        const dx = bx - ax;
        const dz = bz - az;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
        if (Math.hypot(ax + dx * t - x, az + dz * t - z) < 8 && tunnelDepth(rc, L[k] + t * (L[k + 1] - L[k]), L[L.length - 1]) > 3) return true;
      }
      return false;
    });
  const nFaces = sf.faces.length;
  sf.faces = sf.faces.filter((f) => {
    let cx = 0;
    let cz = 0;
    for (let k = 0; k < f.outer.length; k += 2) (cx += (f.outer[k] * 2) / f.outer.length), (cz += (f.outer[k + 1] * 2) / f.outer.length);
    return !underground(cx, cz);
  });
  console.log(`찻길 터널 속 교차로 면 ${nFaces - sf.faces.length}개 뺌`);
  // 횡단보도가 OSM 길 밖에 걸친 자리는 그리기 전용 찻길 면으로 채운다(서울시 연석 쪽 선까지)
  const curbLines = tgis.filter((l) => ['007', '009', '010', '011', '015'].includes(l.k)).map((l) => l.p.flatMap(([a, c]) => toXZ(a, c)));
  // 0.1m 칸으로 따라간 면이라 가장자리가 계단 모양이다: 0.25m 안에서 곧게 줄인다(재작업 W14, 계단 가장자리 검사 test/w14-board.test.ts)
  const patches = crosswalkPatches(b.roads, sf, crosses, curbLines).map((p) => ({ ...p, ring: simplifyLoop(p.ring, 0.25) })).filter((p) => p.ring.length >= 6);
  // 보도 면: 도시생태현황도 도로 부지·광장 − 찻길 면 − 건물 외곽선. 큰길 쪽 연석 밖 6m 안에 보도 면이 없으면 실폭도로 면(행정안전부, tools/public.py)이
  // 이어지는 데까지, 실폭도로 면도 없으면 연석에서 건물·찻길에 막히는 곳까지(6m 안) 채운다
  const rwFile = new URL('./raw/gis-roads.json', import.meta.url);
  const rwAreas = existsSync(rwFile)
    ? (JSON.parse(readFileSync(rwFile, 'utf8')).roads as { r: [number, number][][] }[]).map((x) => ({ kind: GK.ROADSIDE, outer: x.r[0].flatMap(([a, c]) => toXZ(a, c)), holes: x.r.slice(1).map((h) => h.flatMap(([a, c]) => toXZ(a, c))) }))
    : [];
  const polys = surfacePolys(b.roads, sf, roadJoints(b.roads), b.groundAreas, [GK.ROADSIDE, GK.PLAZA], BOARD_R, patches.map((p) => p.ring), b.buildings.map((q) => q.pts), true, rwAreas);
  console.log(`보도 면: 도로 부지 자료(도시생태현황도 ${b.groundAreas.filter((a) => a.kind === GK.ROADSIDE || a.kind === GK.PLAZA).length}개 + 실폭도로 ${rwAreas.length}개), 보도 면 없는 큰길 쪽 채움: 실폭도로 ${polys.filledRw.toFixed(0)}m², 연석에서 건물 쪽 ${polys.filled.toFixed(0)}m²`);
  // 교차로 면 안의 섬: 연결로로 둘러싸인 교통섬(buildSurface)만 낸다. W14 전에는 띠 사이 빈 곳을 0.25m 칸으로 찾아 섬을 더 냈는데(tools/lib/islands.ts carveIslands),
  // 가장자리가 계단 모양이고 대부분 찻길 띠가 칠한 선보다 좁아 남은 틈이었다(양화로 중앙버스정류장 승강장 끝에서 횡단보도까지 찻길 한가운데 보도 블록 면).
  // 찻길 가장자리를 칠한 선까지 넓힌 뒤로는 내지 않는다. 분리대와 중앙 승강장(render/busstops.ts)은 그대로다
  polys.isl = sf.faces.flatMap((f) => f.holes);
  console.log(`교차로 면 교통섬 ${polys.isl.length}개`);
  // 터널 속(깊이 1.5m 넘게 내려간 곳)을 따라가는 선: 터널 조각 가운데선에서 그 가장자리 + 0.5m 안이고 터널과 25° 안으로 나란하면 뺀다
  {
    const segs: number[][] = [];
    b.roads.forEach((r, i) => {
      const rc = reach[i];
      if (!rc) return;
      const L = cumLen(r.p);
      for (let k = 0; k + 1 < L.length; k++) {
        const n = Math.max(1, Math.ceil((L[k + 1] - L[k]) / 2));
        for (let q = 0; q < n; q++) {
          const s0 = L[k] + ((L[k + 1] - L[k]) * q) / n;
          const s1 = L[k] + ((L[k + 1] - L[k]) * (q + 1)) / n;
          if (tunnelDepth(rc, (s0 + s1) / 2, L[L.length - 1]) < 1.5) continue;
          const t0 = (s0 - L[k]) / (L[k + 1] - L[k] || 1);
          const t1 = (s1 - L[k]) / (L[k + 1] - L[k] || 1);
          const [ax, az, bx, bz] = [r.p[k * 3], r.p[k * 3 + 2], r.p[k * 3 + 3], r.p[k * 3 + 5]];
          segs.push([ax + (bx - ax) * t0, az + (bz - az) * t0, ax + (bx - ax) * t1, az + (bz - az) * t1, Math.max(curbAt(r, s0, 1), curbAt(r, s0, -1)) + 0.5]);
        }
      }
    });
    const cell = new Map<number, number[][]>();
    const ck = (x: number, z: number) => (Math.floor(x / 20) + 500) * 1000 + Math.floor(z / 20) + 500;
    for (const g of segs)
      for (let cx = Math.floor((Math.min(g[0], g[2]) - g[4]) / 20); cx <= Math.floor((Math.max(g[0], g[2]) + g[4]) / 20); cx++)
        for (let cz = Math.floor((Math.min(g[1], g[3]) - g[4]) / 20); cz <= Math.floor((Math.max(g[1], g[3]) + g[4]) / 20); cz++) {
          const k = (cx + 500) * 1000 + cz + 500;
          (cell.get(k) ?? cell.set(k, []).get(k)!).push(g);
        }
    underTunnel = (x, z, ux, uz) =>
      (cell.get(ck(x, z)) ?? []).some(([ax, az, bx, bz, h]) => {
        const dx = bx - ax;
        const dz = bz - az;
        const l = Math.hypot(dx, dz) || 1;
        if (Math.abs((dx * ux + dz * uz) / l) < 0.9) return false;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (l * l)));
        return Math.hypot(ax + dx * t - x, az + dz * t - z) < h;
      });
  }
  // 노면 표시를 자를 찻길 면: 찻길 터널 조각의 띠는 뺀다(입구 경사는 땅 밑으로 내려가 그 위에 칠할 곳이 없다)
  groundBits = drawnGround([
    ...polys.car.filter(([i]) => !reach[i]).map(([, c]) => [c]),
    ...sf.faces.map((f) => [f.outer, ...f.holes]),
    ...polys.med.map((m) => [m]),
    ...patches.map((p) => [p.ring]),
  ]);
  // 횡단보도를 덮은 건물 외곽선은 건물 쪽이 틀린 것으로 본다(재작업 W14): 횡단보도 축 사각형(길이 + 폭)을 외곽선에서 깎아 낸다(src/data/exitFit.ts notchOut, 한 번 드나드는 경우만)
  {
    let cut = 0;
    const touched: number[] = [];
    const inP = (r: ArrayLike<number>, x: number, z: number) => {
      let c = false;
      for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) if (r[i + 1] > z !== r[j + 1] > z && x < r[i] + ((z - r[i + 1]) / (r[j + 1] - r[i + 1])) * (r[j] - r[i])) c = !c;
      return c;
    };
    for (const c of b.crosswalks) {
      const [px, pz] = [-c.uz * (c.wid / 2), c.ux * (c.wid / 2)];
      const [fx, fz] = [c.ux * c.half, c.uz * c.half];
      const rect: [number, number][] = [
        [c.x - fx - px, c.z - fz - pz],
        [c.x + fx - px, c.z + fz - pz],
        [c.x + fx + px, c.z + fz + pz],
        [c.x - fx + px, c.z - fz + pz],
      ];
      const R = Math.hypot(c.half, c.wid / 2) + 1;
      buildings.forEach((bl, bi) => {
        if (Math.abs(bl[2] / 10 - c.x) > 300 || Math.abs(bl[3] / 10 - c.z) > 300) return;
        const pts = Float32Array.from(bl.slice(2), (v) => v / 10);
        let near = false;
        for (let k = 0; k < pts.length && !near; k += 2) near = Math.hypot(pts[k] - c.x, pts[k + 1] - c.z) < R + 40;
        if (!near || !rect.some(([x, z]) => inP(pts, x, z)) && ![...Array(pts.length / 2).keys()].some((k) => inP(rect.flat(), pts[k * 2], pts[k * 2 + 1]))) return;
        const flip = loopArea(Array.from(pts)) < 0;
        const P = flip ? Float32Array.from(Array.from({ length: pts.length / 2 }, (_, k) => [pts[pts.length - 2 - k * 2], pts[pts.length - 1 - k * 2]]).flat()) : pts;
        const q = notchOut(P, rect);
        if (!q || Math.abs(loopArea(Array.from(q))) < 4) return;
        bl.length = 2;
        for (const v of q) bl.push(dm(v));
        cut++;
        touched.push(bi);
      });
    }
    console.log(`횡단보도를 덮은 건물 외곽선 ${cut}번 깎음(건물 ${[...new Set(touched)].slice(0, 60).join(',')})`);
  }
  // 철도 터파기(2호선 합정 → 당산철교, 양화로 가운데에서 땅 위로 올라온다): 옹벽 바깥까지 찻길 면에서 뺀다. 그 위 노면 표시는 남기지 않는다(재작업 W14)
  for (const l of b.lines) {
    const cum = cumLen(l.p);
    for (const { s0, sP } of findPortals({ p: l.p, cum, kind: l.kind })) {
      const n = Math.max(2, Math.ceil(Math.abs(sP - s0) / 2));
      const L: number[] = [];
      const R: number[] = [];
      const tmp = [0, 0, 0];
      for (let i = 0; i <= n; i++) {
        const s = s0 + ((sP - s0) * i) / n;
        const seg = pointAt(l.p, cum, s, tmp);
        const [dx, dz] = [l.p[seg * 3 + 3] - l.p[seg * 3], l.p[seg * 3 + 5] - l.p[seg * 3 + 2]];
        const d = Math.hypot(dx, dz) || 1;
        const H = 6.2; // 터파기 안쪽 반폭 5.2m(src/render/rails.ts TROUGH_W) + 옹벽 + 0.5m
        L.push(tmp[0] + (dz / d) * H, tmp[2] - (dx / d) * H);
        R.push(tmp[0] - (dz / d) * H, tmp[2] + (dx / d) * H);
      }
      const ring = [...L];
      for (let i = R.length - 2; i >= 0; i -= 2) ring.push(R[i], R[i + 1]);
      fillBits(groundBits!, [ring], 1, true);
    }
  }
  // 연석 선: 그린 찻길 면(찻길 띠·교차로 면·분리대·그리기 전용 면을 합친 것)의 경계. 띠끼리 포개진 곳 안쪽에는 선이 생기지 않는다(재작업 W14)
  const curbLoops: number[][] = [];
  {
    const G = groundBits!;
    for (const loop of traceLoops(G.v, G.w)) {
      if (Math.abs(loopArea(loop)) * G.cell * G.cell < 2) continue;
      // 칸 경계 계단을 0.3m 안에서 줄이고 차이킨 깎기 두 번으로 매끈하게(연석 띠가 톱니로 보이지 않게)
      let q = simplifyLoop(loop, 0.3 / G.cell).map((v, k) => (k % 2 ? G.z0 : G.x0) + v * G.cell);
      for (let it = 0; it < 2; it++) {
        const o: number[] = [];
        const n = q.length / 2;
        for (let k = 0; k < n; k++) {
          const [ax, az, bx, bz] = [q[k * 2], q[k * 2 + 1], q[((k + 1) % n) * 2], q[((k + 1) % n) * 2 + 1]];
          o.push(ax * 0.75 + bx * 0.25, az * 0.75 + bz * 0.25, ax * 0.25 + bx * 0.75, az * 0.25 + bz * 0.75);
        }
        q = o;
      }
      // 판 가장자리(잘린 길 끝)는 연석이 아니다: 가장자리 3m 안 점에서 끊는다
      let cur: number[] = [];
      for (let k = 0; k <= q.length; k += 2) {
        const [x, z] = [q[k % q.length], q[(k + 1) % q.length]];
        if (Math.hypot(x, z) > BOARD_R - 3) {
          if (cur.length >= 4) curbLoops.push(cur);
          cur = [];
        } else cur.push(x, z);
      }
      if (cur.length >= 4) curbLoops.push(cur);
    }
  }
  // 고리마다 첫 점은 cm, 그 뒤는 앞 점과의 차이(cm)
  const enc = (r: number[]) => {
    const c = r.map((v) => Math.round(v * 100));
    return [r.length / 2, ...c.map((v, i) => (i < 2 ? v : v - c[i - 2]))];
  };
  const jn = sf.faces.map((f) => [f.cls, ...enc(f.outer), f.holes.length, ...f.holes.flatMap(enc)]);
  const dr = patches.map((p) => [p.cls, ...enc(p.ring), 0]);
  // 보도 면 등 다각형(W2 가 걷는 자리를 만든다. 앱은 읽지 않는다): dm
  const dmR = (r: number[]) => r.map((v) => Math.round(v * 10));
  surfacePolysJson = JSON.stringify({ v: 1, car: polys.car.map(([i, r]) => [i, ...dmR(r)]), med: polys.med.map(dmR), isl: polys.isl.map(dmR), walk: polys.walk.map(dmR), draw: polys.draw.map(dmR) });
  // 찻길 면 위에 찍힌 가로수를 보도로 옮긴다(tools/lib/treeplace.ts, tools/treeplace.ts 와 같은 함수)
  {
    // 교량·올린 둑길 밑에도 나무를 두지 않는다(데크를 뚫고 솟는다, 재작업 W14)
    const decks = b.roads.flatMap((r) => {
      if (r.cls > 5 || isGroundRoad(r)) return [];
      const q = carriageSections(r, 0, Infinity);
      return q.length < 2 ? [] : [[...q.flatMap((t) => [t.lx, t.lz]), ...q.reverse().flatMap((t) => [t.rx, t.rz])]];
    });
    const tp = pushTreesOffRoad(trees, carSurface([...polys.car.map(([, c]) => c), ...decks, ...polys.med, ...patches.map((p) => p.ring)], sf.faces));
    console.log(`찻길 위 나무 ${tp.moved}그루 보도로 옮김, 못 옮김 ${tp.left}그루`);
    // 가로수 줄 맞추기(재작업 W14): 찻길에서 4m 안 가로수는 가장 가까운 연석에서 보도 쪽 1.2m(식재대 가운데)로 옮긴다
    const onCarT = carSurface([...polys.car.map(([, c]) => c), ...decks, ...polys.med, ...patches.map((p) => p.ring)], sf.faces);
    let lined = 0;
    for (let i = streetTree0; i < trees.length; i += 2) {
      const [x, z] = [trees[i] / 10, trees[i + 1] / 10];
      if (onCarT(x, z)) continue;
      let best = Infinity;
      let bu = 0;
      let bv = 0;
      for (let k = 0; k < 24; k++) {
        const [u, v] = [Math.cos((k * Math.PI) / 12), Math.sin((k * Math.PI) / 12)];
        for (let d = 0.1; d < Math.min(best, 4); d += 0.1)
          if (onCarT(x + u * d, z + v * d)) {
            if (d < best) (best = d), (bu = u), (bv = v);
            break;
          }
      }
      if (best >= 4 || Math.abs(best - 1.2) < 0.15) continue;
      const nx = x + bu * (best - 1.2);
      const nz = z + bv * (best - 1.2);
      if (onCarT(nx, nz)) continue;
      trees[i] = dm(nx);
      trees[i + 1] = dm(nz);
      lined++;
    }
    console.log(`가로수 ${lined}그루를 연석에서 1.2m 식재대로 맞춤`);
  }
  console.log(`보도 면 고리 ${polys.walk.length}개(구멍 ${polys.walk.filter((r) => loopArea(r) < 0).length}), 넓이 ${(polys.walk.reduce((a, r) => a + loopArea(r), 0) / 1e4).toFixed(1)}ha, 찻길 띠 ${polys.car.length}개, 분리대 ${polys.med.length}개`);
  // 연석 선은 따로 public/data/curbs.json 에: 줄마다 [점 수, 첫 점 x, z, 뒤 점마다 차이](dm)
  // 횡단보도 양 끝 점자블록(점형, 노랑): 축을 따라 바깥으로 짚어 그린 찻길 면이 끝나는 자리(연석)에서 보도 쪽 0.1~0.7m, 횡단보도 폭만큼.
  // [가운데 x, z, 바깥 방향 ×1000 (x, z), 폭](dm) — 서울시 보도공사 설계·시공 매뉴얼(2021 ver2.0) 횡단보도 진입부 점자블록
  const tactile: number[] = [];
  for (const c of b.crosswalks)
    for (const sg of [-1, 1]) {
      const [ux, uz] = [c.ux * sg, c.uz * sg];
      let d = c.half - 1;
      while (d < c.half + 6 && onGround(groundBits!, c.x + ux * d, c.z + uz * d, 0)) d += 0.1;
      if (d >= c.half + 6) continue;
      tactile.push(dm(c.x + ux * (d + 0.4)), dm(c.z + uz * (d + 0.4)), Math.round(ux * 1000), Math.round(uz * 1000), dm(c.wid));
    }
  curbsJson = JSON.stringify({
    v: 1,
    c: curbLoops.map((r) => {
      const c = r.map((v) => Math.round(v * 10));
      return [r.length / 2, ...c.map((v, i) => (i < 2 ? v : v - c[i - 2]))];
    }),
    t: tactile,
  });
  const cb = curbLoops;
  surfaceJson = JSON.stringify({ v: 1, cut: Array.from(sf.cut, (v) => (v === Infinity ? -1 : Math.round(v * 10))), jn, dr });
  console.log(`연석 선 ${cb.length}줄, ${(curbLoops.reduce((a, r) => a + r.reduce((b, _, k) => (k >= 2 && k % 2 === 0 ? b + Math.hypot(r[k] - r[k - 2], r[k + 1] - r[k - 1]) : b), 0), 0) / 1000).toFixed(0)}km`);
  // 걷는 길 그래프(src/sim/walknet.ts): 보도 면 뼈대 선·보도 없는 골목·도로 부지 밖 보행로와 횡단보도 연결
  // 그린 찻길 면 기준으로 선을 옮기고 자르고, 횡단보도를 다시 잇고, 한 덩어리만 남긴다(tools/lib/walkfix.ts, 재작업 W21)
  const walk = bakeWalk(b, boardWalkNet(b, sf.faces, patches.map((p) => p.ring), polys), sf.faces, patches.map((p) => p.ring), polys, [-BOARD_R, -BOARD_R, BOARD_R, BOARD_R], (i, x, z) => doorWanted(x, z) && Math.abs(loopArea(b.buildings[i].pts)) > 40, (s) => console.log(s));
  walkJson = JSON.stringify(walk);
  const kinds = [0, 0, 0, 0];
  for (let k = 0; k < walk.e.length; k += 5) kinds[walk.e[k + 2] >> 4]++;
  console.log(`걷는 길: 노드 ${walk.n.length / 2}, 선 ${walk.e.length / 5}(보도 ${kinds[0]}, 골목 ${kinds[1]}, 보행로 ${kinds[2]}, 잇는 선 ${kinds[3]}), 횡단보도 연결 ${walk.x.length / 17}/${b.crosswalks.length}`);
  const multi = sf.faces.filter((f) => f.nodes > 1).length;
  console.log(`교차로 면 ${sf.faces.length}개(노드 둘 넘게 묶은 것 ${multi}, 교통섬 ${sf.faces.reduce((n, f) => n + f.holes.length, 0)}), 면 안에 들어가 띠를 그리지 않는 조각 ${sf.internal.reduce((n, v) => n + v, 0)}개, 연결로 조각 ${link.reduce((n, v) => n + v, 0)}개, 횡단보도 밑 그리기 전용 찻길 면 ${patches.length}개(${(patches.reduce((a, p) => a + Math.abs(loopArea(p.ring)), 0)).toFixed(0)}m²)`);
}
// 노면 표시: 서울시 차선 선(OA-15537)·안전지대(OA-15533)·노면 화살표(OA-15536)를 자료 그대로 public/data/marks.json 에 둔다(src/render/marks.ts)
let marksJson = '';
let marksWholeJson = '';
{
  const raw = existsSync(laneFile) ? (JSON.parse(readFileSync(laneFile, 'utf8')).lanes as { k: string; k2: string; eve: string; p: [number, number][] }[]) : [];
  /** 점 수, 첫 점, 뒤 점마다 앞 점과의 차이(dm) */
  const encPts = (P: number[][]) => {
    const c = P.map((p) => p.map((v) => Math.round(v * 10)));
    return [P.length, ...c.flatMap((p, i) => (i ? p.map((v, j) => v - c[i - 1][j]) : p))];
  };
  // 선 높이: 땅 찻길 위면 0, 땅 찻길 밖인데 교량 띠 위면 그 교량 높이 + 0.25m(교량 띠 높이). 고가(EVE 002) 선은 12m 안 가장 가까운 교량
  const bd = decodeBoard(out as unknown as BoardJson);
  const segIdx = new Map<number, number[][]>(); // 20m 칸 → [ax, ay, az, bx, by, bz, 반폭, 교량이면 1]
  const cellKey = (x: number, z: number) => Math.floor(x / 20) * 100000 + Math.floor(z / 20);
  for (const r of bd.roads) {
    if (r.cls > 5) continue;
    const half = Math.max(...roadHalf(r)) + 0.5;
    // 다리 앞뒤로 올린 둑길(levels.ts, 교량 아님)도 데크처럼: 그 위 선은 둑길 높이로 올린다
    let top = 0;
    for (let k = 1; k < r.p.length; k += 3) top = Math.max(top, r.p[k]);
    const deck = r.bridge || top >= 0.3 ? 1 : 0;
    for (let k = 0; k + 5 < r.p.length; k += 3) {
      const sg = [r.p[k], r.p[k + 1], r.p[k + 2], r.p[k + 3], r.p[k + 4], r.p[k + 5], half, deck];
      for (let cx = Math.floor((Math.min(sg[0], sg[3]) - half) / 20); cx <= Math.floor((Math.max(sg[0], sg[3]) + half) / 20); cx++)
        for (let cz = Math.floor((Math.min(sg[2], sg[5]) - half) / 20); cz <= Math.floor((Math.max(sg[2], sg[5]) + half) / 20); cz++) {
          const kk = cx * 100000 + cz;
          (segIdx.get(kk) ?? segIdx.set(kk, []).get(kk)!).push(sg);
        }
    }
  }
  /** 점 (x, z)를 덮는 찻길: 땅 찻길이 있으면 0, 교량만 있으면 그 높이. reach 를 주면 그 안 가장 가까운 교량 높이 */
  const heightAt = (x: number, z: number, reach = 0): number | null => {
    let onGround = false;
    let deckBest = Infinity;
    let deckY: number | null = null;
    const R = Math.max(1, Math.ceil(reach / 20));
    for (let ox = -R; ox <= R; ox++)
      for (let oz = -R; oz <= R; oz++)
        for (const [ax, ay, az, bx, by, bz, half, deck] of segIdx.get(cellKey(x + ox * 20, z + oz * 20)) ?? []) {
          const dx = bx - ax;
          const dz = bz - az;
          const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
          const d = Math.hypot(ax + dx * t - x, az + dz * t - z);
          const y = ay + (by - ay) * t;
          if (deck && y > 1 && d < Math.max(half, reach) && d < deckBest) (deckBest = d), (deckY = y + 0.25);
          if (!deck && y < 1 && d < half) onGround = true;
        }
    return reach ? deckY : onGround ? 0 : deckY;
  };
  const lines: number[][] = [];
  const high: number[][] = [];
  /** 자르기 전 땅 위 선: 차로 가운데선 굽기(carlanes)는 자르기 전 선을 읽는다 */
  const whole: number[][] = [];
  let skipped = 0;
  let lifted = 0;
  let cutAway = 0;
  /** 자른 땅 위 선 조각: 중앙선은 겹친 것을 정리한 뒤 넣는다 */
  const centerPieces: [number, [number, number][]][] = [];
  const otherPieces: [number, [number, number][]][] = [];
  for (const l of raw) {
    if (l.eve === '003') continue; // 지하
    const P = l.p.map(([a, b]) => toXZ(a, b)).filter(([x, z]) => inBoard(x, z, 2));
    if (P.length < 2) continue;
    const code = Number(l.k) * 10 + (Number(l.k2) || 1);
    /** 물(마스크 빨강) 위인가 */
    const water = (x: number, z: number) => mask[(Math.round(px(z)) * SIZE + Math.round(px(x))) * 4] > 128;
    const Y = P.map(([x, z]) => (l.eve === '002' ? heightAt(x, z, 12) : (heightAt(x, z) ?? (water(x, z) ? null : 0))));
    // 고가 표시인데 교량을 못 찾았거나, 땅 표시인데 어느 찻길에도 없고 물 위인 선(교량 옆으로 어긋난 선)은 뺀다
    if (Y.some((y) => y === null)) {
      skipped++;
      continue;
    }
    if (Y.every((y) => y === 0)) {
      whole.push([code, ...encPts(P)]);
      // 굽은 선은 꼭짓점을 지나는 매끈한 곡선으로(한 마디 꺾임 5° 안팎, 45° 넘는 모서리는 그대로). 정지선·자전거횡단도·정차금지지대는 곧은 선이라 그대로.
      // 그다음 그린 찻길 면 밖(0.3m 넘게)으로 나간 부분은 잘라 낸다(재작업 W14)
      const S = [4, 13, 14].includes(Number(l.k)) ? (P as [number, number][]) : smoothLine(P as [number, number][]);
      const parts = groundBits ? clipLine(groundBits, S, 0.6, 0.3, underTunnel) : [S];
      const before = P.reduce((a, p, i) => (i ? a + Math.hypot(p[0] - P[i - 1][0], p[1] - P[i - 1][1]) : 0), 0);
      const after = parts.reduce((a, q) => a + q.reduce((b, p, i) => (i ? b + Math.hypot(p[0] - q[i - 1][0], p[1] - q[i - 1][1]) : 0), 0), 0);
      cutAway += before - after;
      for (const q of parts) (Math.floor(code / 10) === 1 ? centerPieces : otherPieces).push([code, q as [number, number][]]);
    } else {
      if (l.eve !== '002') lifted++;
      high.push([code, ...encPts(P.map(([x, z], i) => [x, Y[i]!, z]))]);
    }
  }
  // 같은 자리에 비스듬히 겹친 중앙선은 긴 것 하나만 남긴다(tools/lib/groundclip.ts dropOverlaps, 재작업 W14)
  {
    const d = dropOverlaps(centerPieces.map(([, q]) => q));
    // 남은 조각의 종류: 원래 조각 가운데 첫 점이 가장 가까운 것
    for (const q of d.kept) {
      let best = centerPieces[0][0];
      let bd = Infinity;
      for (const [code, P] of centerPieces)
        for (const p of P) {
          const dd = Math.hypot(p[0] - q[0][0], p[1] - q[0][1]);
          if (dd < bd) (bd = dd), (best = code);
        }
      lines.push([best, ...encPts(q)]);
    }
    for (const [code, q] of otherPieces) lines.push([code, ...encPts(q)]);
    console.log(`겹친 중앙선 정리: 0.5m 점 ${d.dropped}개 버림`);
  }
  // 안전지대: 중앙선(001) 옆이면 황색(1), 아니면 백색(0)
  const centers = raw.filter((l) => l.k === '001' && l.eve === '001').map((l) => l.p.map(([a, b]) => toXZ(a, b)));
  const zoneFile = new URL('./raw/seoul-safety.json', import.meta.url);
  const zones: number[][] = [];
  for (const zn of existsSync(zoneFile) ? (JSON.parse(readFileSync(zoneFile, 'utf8')).zones as { eve: string; ring: [number, number][] }[]) : []) {
    if (zn.eve !== '001') continue;
    const R = zn.ring.map(([a, b]) => toXZ(a, b));
    if (!R.every(([x, z]) => inBoard(x, z, 2))) continue;
    if (R.some(([x, z]) => (heightAt(x, z) ?? 0) > 0)) continue; // 교량 위(땅에 칠하면 물 위에 뜬다)
    // 그린 찻길 면 밖으로 반 넘게 나간 안전지대는 뺀다(재작업 W14)
    if (groundBits && R.filter(([x, z]) => onGround(groundBits!, x, z, 0.5)).length < R.length * 0.5) continue;
    const yellow = centers.some((c) => c.some(([cx, cz]) => R.some(([x, z]) => Math.hypot(cx - x, cz - z) < 1.2)));
    zones.push([yellow ? 1 : 0, ...encPts(R.slice(0, -1))]);
  }
  // 노면 화살표: [종류, x, z(dm), 각도(평면 좌표 동쪽에서 반시계, 도)]. 한 방향 길의 직진 화살표 92% 가 길 진행 방향과 맞는 기준이다
  const arrowFile = new URL('./raw/seoul-arrows.json', import.meta.url);
  const arrows: number[] = [];
  for (const a of existsSync(arrowFile) ? (JSON.parse(readFileSync(arrowFile, 'utf8')).arrows as { kind: string; drn: number; eve: string; lat: number; lon: number }[]) : []) {
    if (a.eve !== '001') continue;
    const [x, z] = toXZ(a.lat, a.lon);
    if (!inBoard(x, z, 3) || (heightAt(x, z) ?? 0) !== 0) continue;
    arrows.push(Number(a.kind), dm(x), dm(z), a.drn);
  }
  marksJson = JSON.stringify({ v: 1, l: lines, h: high, z: zones, a: arrows });
  marksWholeJson = JSON.stringify({ v: 1, l: whole, h: high, z: [], a: [] });
  console.log(`노면 표시 자르기: 그린 찻길 면 밖이라 잘라 낸 선 ${cutAway.toFixed(0)}m`);
  const by = new Map<number, number>();
  for (const l of lines) by.set(Math.floor(l[0] / 10), (by.get(Math.floor(l[0] / 10)) ?? 0) + 1);
  console.log(`노면 표시: 선 ${lines.length}줄(정지선 ${by.get(4) ?? 0}, 차선 ${by.get(6) ?? 0}, 중앙선 ${by.get(1) ?? 0}, 진로변경제한선 ${by.get(8) ?? 0}, 유도선 ${by.get(12) ?? 0}, 자전거횡단 ${by.get(13) ?? 0}), 교량 위 ${high.length}줄(땅 표시인데 교량 위라 올린 것 ${lifted}, 교량을 못 찾거나 물 위라 뺀 것 ${skipped}), 안전지대 ${zones.length}개(황색 ${zones.filter((z) => z[0]).length}), 화살표 ${arrows.length / 4}개`);
}
const json = JSON.stringify(out);
writeFileSync(new URL('../public/data/board.json', import.meta.url), json);
writeFileSync(new URL('../public/data/surface.json', import.meta.url), surfaceJson);
writeFileSync(new URL('../public/data/curbs.json', import.meta.url), curbsJson);
writeFileSync(new URL('../public/data/surface-polys.json', import.meta.url), surfacePolysJson);
// 차로 가운데선: 차가 다니는 조각마다 서울시 차선으로 방향별 차로를 읽는다(tools/lib/carlanes.ts, tools/lanes.ts 와 같은 함수)
{
  const bd = decodeBoard(out as unknown as BoardJson);
  const baked = bakeLanes(bd.roads, decodeMarks(JSON.parse(marksWholeJson) as MarksJson).lines);
  writeFileSync(new URL('../public/data/lanes.json', import.meta.url), baked.json);
  console.log(baked.log);
  // 노면 화살표를 그 화살표가 놓인 차선 칸 가운데로, 길 방향에 맞춰 옮긴다(tools/lib/arrows.ts, 재작업 W14). 옮긴 뒤 찻길 면 밖이면 뺀다
  const mj = JSON.parse(marksJson) as MarksJson;
  const ar = decodeMarks(mj).arrows;
  const sn = snapArrows(bd.roads, decodeLanes(JSON.parse(baked.json) as LanesJson), ar);
  // 놓인 차선 칸(양옆 칠한 선 사이) 가운데로 옮기고 칸 폭을 붙인다. 화살표 옆 폭은 그리는 쪽이 칸 폭에서 양쪽 0.3m 를 뺀 만큼으로 줄인다(src/data/marks.ts arrowShape)
  const drawnLines = decodeMarks(mj).lines;
  // 두 번 맞춘다: 처음 옮긴 자리에서 다시 보면 다른 칸 경계가 잡히는 곳이 있어, 두 번째 결과가 첫 번째와 0.1m 넘게 다르면 칸을 모르는 것으로 둔다
  const fc1 = fitCells(sn.out, drawnLines);
  const fc2 = fitCells(fc1.out, drawnLines);
  const fc = { out: fc1.out.map((q, i) => (q.w > 0 && (fc2.out[i].w === 0 || Math.hypot(fc2.out[i].x - q.x, fc2.out[i].z - q.z) > 0.1) ? { ...sn.out[i], w: 0 } : q)) };
  const a: number[] = [];
  const aw: number[] = [];
  for (const q of fc.out) {
    if (groundBits && !onGround(groundBits, q.x, q.z, 0.3)) continue;
    if (underTunnel?.(q.x, q.z, q.fx, q.fz)) continue;
    a.push(q.kind, dm(q.x), dm(q.z), Math.round((Math.atan2(-q.fz, q.fx) * 180) / Math.PI));
    aw.push(dm(q.w));
  }
  mj.a = a;
  mj.aw = aw;
  console.log(`노면 화살표 칸: 양옆 칠한 선을 찾은 것 ${aw.filter((v) => v > 0).length}개, 못 찾은 것 ${aw.filter((v) => v === 0).length}개`);
  marksJson = JSON.stringify(mj);
  const d = sn.dist.sort((x, y) => x - y);
  console.log(`노면 화살표 ${ar.length}개 가운데 차로 가운데로 옮긴 것 ${sn.moved}개(옮긴 거리 중앙값 ${d[d.length >> 1]?.toFixed(2)}m, 90% ${d[Math.floor(d.length * 0.9)]?.toFixed(2)}m), 옮긴 뒤 찻길 면 밖이라 뺀 것 ${ar.length - a.length / 4}개`);
}
writeFileSync(new URL('../public/data/marks.json', import.meta.url), marksJson);
writeFileSync(new URL('../public/data/walk.json', import.meta.url), walkJson);
writeFileSync(new URL('../public/data/mask.png', import.meta.url), encodePng(mask, SIZE));

const waterPx = mask.reduce((s, v, i) => s + (i % 4 === 0 && v ? 1 : 0), 0);
console.log(`Overture(OSM 밖) 건물 ${buildings.length - osmBuildings - pointBuildings - gisBuildings}동, GIS건물통합정보 외곽선 건물 ${gisBuildings}동 더함`);
console.log(`건물 ${buildings.length}동 (홍익대 ${buildings.filter((b) => b[1] === 1).length}동)`);
console.log(`도로 ${roads.length}조각, 교량 조각 ${roads.filter((r) => r[3]).length}, 가장 높은 지점 ${Math.max(...roads.flatMap((r) => r.filter((_, i) => i >= 6 && i % 3 === 1))) / 10}m`);
console.log(`물 ${((waterPx * 4) / 1e6).toFixed(2)}㎢, 나무 ${trees.length / 2}그루, 출구 ${exits.length}곳, 역 ${stations.map((s) => s.name).join('·')}`);
for (const l of lines) console.log(`${l.name}: 선로 조각 ${l._ways}개 → ${l._len}m, 찻길과 엇갈림 ${l._cross}곳, 터널 아닌 조각 ${l.k.filter((k) => k !== -1).length}개, 역 ${l.stops.map((s) => `${s.name}(${s.s})`).join(' ')}`);
console.log(`버스 노선 ${busRuns.length}개(${[...new Set(busRuns.map((b) => b.ref))].length}개 번호), 정류장 ${busRuns.reduce((n, b) => n + b.stops.length / 2, 0)}곳(노선별 합), 버스가 지나는 조각 ${roads.filter((r) => r[2] & 2).length}개`);
console.log(`학교 ${schoolSites.length}곳(${schoolSites.map((s) => s.name).join(', ')}), 학교 건물 ${buildings.filter((b) => b[1] === 6).length}동`);
console.log(`이름 랜드마크 건물 ${NAMED_LM.map(([re, n]) => `${re.source.slice(0, 6)}:${buildings.filter((b) => b[1] === n).length}`).join(' ')}, 캠퍼스 고리 ${campusRing.length}점, 물길 ${river.length / 2}점, 피크닉 ${picnic.length / 2}곳`);
console.log(`건물 부분 ${parts.filter((p) => p.used).length}/${parts.length}개를 감싸는 건물 대신 세움, 역 엘리베이터 ${elevators.length / 2}곳, 용도 ${[0, 1, 2, 3, 4, 5, 6, 7].map((u) => binfo.filter((v) => v % 8 === u).length).join('/')}`);
console.log(`출구 ${exits.length}곳 가운데 찻길 위에 있어 보도로 밀어낸 곳 ${exitsPushed}곳`);
console.log(`랜드마크 ${landmarks.map((l) => `${l.id}(${l.x / 10},${l.z / 10})`).join(' ')}`);
console.log(`board.json ${(json.length / 1e6).toFixed(2)}MB, surface.json ${(surfaceJson.length / 1e6).toFixed(2)}MB, surface-polys.json ${(surfacePolysJson.length / 1e6).toFixed(2)}MB, marks.json ${(marksJson.length / 1e6).toFixed(2)}MB, walk.json ${(walkJson.length / 1e6).toFixed(2)}MB`);
