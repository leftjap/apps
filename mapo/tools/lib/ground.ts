// 바닥 면 굽기에 쓰는 순수 함수: OSM 태그·서울 비오톱 속성 → 바닥 종류, 고리 잇기·구멍 가르기·단순화, board.json 형식으로 담기.
import { GK } from '../../src/data/board.ts';
import type { Rect } from './crosswalk.ts';

type Tags = Record<string, string>;
type Pt = [number, number];

const SPORT: Record<string, number> = { soccer: 1, futsal: 1, tennis: 2, basketball: 3, baseball: 4, softball: 4, badminton: 5, volleyball: 5 };
const DIRT = /^(ground|dirt|earth|sand|unpaved|compacted|gravel|fine_gravel|clay)$/;
const TURF = /^(artificial_turf|grass)$/;

/** OSM 면 태그 → 바닥 종류(0 이면 그리지 않는다)와 경기 종목 */
export function osmKind(t: Tags): { kind: number; sport: number } {
  const none = { kind: 0, sport: 0 };
  // 지붕 위·건물 안·땅 밑 시설은 바닥이 아니다
  if (t.location === 'roof' || t.location === 'rooftop' || t.location === 'underground' || t.indoor === 'yes' || t.covered === 'yes') return none;
  if (t.level && t.level !== '0') return none;
  const sport = SPORT[(t.sport ?? '').split(';')[0]] ?? 0;
  const k = (kind: number) => ({ kind, sport });
  if (t.leisure === 'pitch') {
    const s = t.surface ?? '';
    if (TURF.test(s)) return k(GK.PITCH_TURF);
    if (DIRT.test(s)) return k(GK.PITCH_DIRT);
    if (sport === 2 || sport === 3 || sport === 5 || /^(multi|fitness|croquet|table_tennis|gateball)$/.test(t.sport ?? '')) return k(GK.COURT);
    return k(GK.PITCH_DIRT);
  }
  if (t.leisure === 'track') return k(GK.TRACK);
  if (t.leisure === 'playground') return k(GK.PLAYGROUND);
  if (t.leisure === 'bleachers') return k(GK.BLEACHERS);
  if (t.leisure === 'swimming_pool' || t.amenity === 'fountain') return k(GK.POOL);
  if (t.amenity === 'parking' || t.amenity === 'parking_space' || t.amenity === 'motorcycle_parking' || t.amenity === 'bicycle_parking')
    return /^(underground|multi-storey|rooftop)$/.test(t.parking ?? '') ? none : k(GK.PARKING);
  if (t['area:highway'] === 'traffic_island') return k(GK.ISLAND);
  if ((t.highway && t.area === 'yes') || t.place === 'square' || /^(pedestrian|footway)$/.test(t['area:highway'] ?? '') || t.amenity === 'marketplace')
    return t.highway && !/^(pedestrian|footway|platform)$/.test(t.highway) ? none : k(GK.PLAZA);
  if (t.man_made === 'pier') return k(GK.PIER);
  const paved = /^(paving_stones|concrete|asphalt|paved|sett|bricks)$/.test(t.surface ?? '');
  if (/^(park|garden|common|dog_park|recreation_ground)$/.test(t.leisure ?? '') || /^(grass|village_green|recreation_ground|meadow|greenfield)$/.test(t.landuse ?? '') || /^(grassland|heath)$/.test(t.natural ?? ''))
    return k(paved ? GK.PLAZA : GK.PARK);
  if (t.natural === 'wood' || t.landuse === 'forest' || t.natural === 'scrub') return k(GK.WOOD);
  if (/^(construction|brownfield)$/.test(t.landuse ?? '') || /^(sand|bare_rock|scree|shingle|beach)$/.test(t.natural ?? '')) return k(GK.BARE);
  if (t.landuse === 'railway') return k(GK.RAILWAY);
  return none;
}

/**
 * 서울 생태현황도(개별비오톱) 면 속성 → 바닥 종류. 하천 수면(J1)은 마스크의 물이 맡으므로 0.
 * 둔치(J2)는 식생과 포장 비율(imp 불투수, perm 투수, %)로 가른다: 반 넘게 불투수 포장이면 산책로·자전거길, 투수 포장이 반 넘으면 흙 바닥
 */
export function biotopeKind(a: { lu: string; use: string; veg: string; imp?: number; perm?: number }): number {
  const lu = a.lu.toUpperCase();
  if (lu === 'J1') return 0;
  if (lu.startsWith('J')) {
    if (a.veg === '도로' || (a.imp ?? 0) >= 50) return GK.RIVER_PAVED;
    if ((a.perm ?? 0) >= 50) return GK.BARE;
    return a.veg === '호안블럭' ? GK.REVETMENT : a.veg === '시가화지역' ? GK.RIVER_PAVED : GK.RIVER_GREEN;
  }
  if (lu === 'E2') return GK.ROADSIDE;
  if (lu.startsWith('E')) return GK.RAIL;
  if (lu === 'A1') return GK.HOUSE;
  if (lu.startsWith('A') && lu !== 'AB') return GK.APT;
  if (lu === 'AB') return GK.MIXED;
  if (lu.startsWith('B')) return GK.COMMERCE;
  if (lu.startsWith('D')) return GK.PUBLIC;
  if (lu.startsWith('G')) return GK.BARE;
  if (lu.startsWith('I')) {
    if (a.veg === '경작지') return GK.FARM;
    if (a.veg === '시가화지역') return GK.PUBLIC;
    if (/림$|산림/.test(a.veg)) return GK.FOREST;
    return GK.GREEN;
  }
  return GK.UTILITY;
}

/** 넓이(부호 있음) */
export function ringArea(r: Pt[]): number {
  let s = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += r[j][0] * r[i][1] - r[i][0] * r[j][1];
  return s / 2;
}

function inRing(r: Pt[], x: number, z: number): boolean {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [ax, az] = r[j];
    const [bx, bz] = r[i];
    if (az > z !== bz > z && x < ax + ((z - az) / (bz - az)) * (bx - ax)) c = !c;
  }
  return c;
}

/** 고리들을 바깥 고리와 그 안의 구멍으로 나눈다. 다른 고리 안에 든 고리(짝수 겹)는 구멍, 그 밖은 바깥 고리 */
export function groupRings(rings: Pt[][]): { outer: Pt[]; holes: Pt[][] }[] {
  const rs = rings.filter((r) => r.length >= 4).sort((a, b) => Math.abs(ringArea(b)) - Math.abs(ringArea(a)));
  const depth = rs.map((r, i) => rs.slice(0, i).filter((o) => inRing(o, r[0][0], r[0][1])).length);
  const out: { outer: Pt[]; holes: Pt[][] }[] = [];
  const owner: number[] = [];
  rs.forEach((r, i) => {
    if (depth[i] % 2 === 0) {
      owner[i] = out.length;
      out.push({ outer: r, holes: [] });
      return;
    }
    // 이 구멍을 담은 가장 작은 바깥 고리
    for (let j = i - 1; j >= 0; j--)
      if (depth[j] % 2 === 0 && inRing(rs[j], r[0][0], r[0][1])) {
        out[owner[j]].holes.push(r);
        return;
      }
  });
  return out;
}

const same = (a: Pt, b: Pt) => Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6;

/** OSM 관계의 구성 길(열린 조각)을 끝점끼리 이어 닫힌 고리로 만든다. 닫히지 않은 조각은 버린다 */
export function assembleRings(ways: Pt[][]): Pt[][] {
  const left = ways.filter((w) => w.length >= 2).map((w) => [...w]);
  const out: Pt[][] = [];
  while (left.length) {
    const ring = left.shift()!;
    for (let grew = true; grew && !same(ring[0], ring[ring.length - 1]); ) {
      grew = false;
      for (let i = 0; i < left.length; i++) {
        const w = left[i];
        const end = ring[ring.length - 1];
        if (same(w[0], end)) ring.push(...w.slice(1));
        else if (same(w[w.length - 1], end)) ring.push(...w.slice(0, -1).reverse());
        else continue;
        left.splice(i, 1);
        grew = true;
        break;
      }
    }
    if (ring.length >= 4 && same(ring[0], ring[ring.length - 1])) out.push(ring);
  }
  return out;
}

/** 닫힌 고리를 tol(m) 안에서 줄인다(더글러스·포이커). 닫는 점은 남긴다 */
export function simplifyRing(r: Pt[], tol: number): Pt[] {
  const closed = r.length > 1 && same(r[0], r[r.length - 1]);
  const pts = closed ? r.slice(0, -1) : r;
  if (pts.length < 4) return r;
  // 첫 점에서 가장 먼 점으로 둘로 나눠 각각 줄인다
  let far = 1;
  for (let i = 1; i < pts.length; i++) if (Math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]) > Math.hypot(pts[far][0] - pts[0][0], pts[far][1] - pts[0][1])) far = i;
  const keep = new Uint8Array(pts.length + 1);
  keep[0] = keep[far] = keep[pts.length] = 1;
  const P = (i: number) => pts[i % pts.length];
  const stack: [number, number][] = [
    [0, far],
    [far, pts.length],
  ];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, az] = P(a);
    const [bx, bz] = P(b);
    const L = Math.hypot(bx - ax, bz - az) || 1e-9;
    let best = -1;
    let bi = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((bx - ax) * (az - P(i)[1]) - (ax - P(i)[0]) * (bz - az)) / L;
      if (d > best) (best = d), (bi = i);
    }
    if (best > tol) {
      keep[bi] = 1;
      stack.push([a, bi], [bi, b]);
    }
  }
  const out: Pt[] = [];
  for (let i = 0; i < pts.length; i++) if (keep[i]) out.push(pts[i]);
  out.push(out[0]);
  return out;
}

const dm = (v: number) => Math.round(v * 10);
const flat = (r: Pt[]) => {
  const pts = r.length > 1 && same(r[0], r[r.length - 1]) ? r.slice(0, -1) : r;
  return pts.flatMap(([x, z]) => [dm(x), dm(z)]);
};

/** board.json 의 ga 한 줄: [종류, 값, 직사각형, 바깥 고리, 구멍...] */
export function encodeArea(kind: number, param: number, rect: Rect | null, outer: Pt[], holes: Pt[][]): (number | number[])[] {
  const r = rect ? [dm(rect.cx), dm(rect.cz), Math.round(rect.ux * 1000), Math.round(rect.uz * 1000), dm(rect.len / 2), dm(rect.wid / 2)] : [];
  return [kind, param, r, flat(outer), ...holes.map(flat)];
}
