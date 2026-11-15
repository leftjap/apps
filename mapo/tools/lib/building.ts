// 건물 태그(OSM·Overture)에서 그리기에 쓰는 용도·층수·지붕 모양·아래쪽 높이를 읽고, board.json 의 숫자 하나로 묶는다.
import { USE, type BuildingInfo } from '../../src/data/board.ts';

const FLOOR = 3.2;
const ROOF: Record<string, number> = { flat: 1, gabled: 2, hipped: 3, pyramidal: 4, skillion: 5, dome: 6, round: 7, half_hipped: 3, gambrel: 2, mansard: 3 };

const USES: [RegExp, number][] = [
  [/^(house|detached|semidetached_house|bungalow|hut|cabin|farm)$/, USE.house],
  [/^(residential|dormitory|terrace)$/, USE.villa],
  [/^apartments$/, USE.apartments],
  [/^(commercial|retail|shop|supermarket|kiosk|warehouse|industrial)$/, USE.commercial],
  [/^(office|hotel)$/, USE.office],
  [/^(school|university|college|kindergarten|public|government|civic|hospital|train_station|fire_station|library|education)$/, USE.civic],
  [/^(church|chapel|cathedral|temple|religious|shrine|mosque)$/, USE.religious],
];

export function buildingInfo(tags: Record<string, string>): BuildingInfo {
  const kind = tags.building ?? tags['building:part'] ?? '';
  let use = USES.find(([re]) => re.test(kind))?.[1] ?? USE.unknown;
  if (use === USE.unknown) {
    if (tags.amenity === 'place_of_worship' || tags.religion) use = USE.religious;
    else if (/^(school|university|college|hospital|library|townhall|police|fire_station|community_centre)$/.test(tags.amenity ?? '')) use = USE.civic;
    else if (tags.shop || /빌딩|타워|플라자|센터|상가|호텔|오피스|빌$/.test(tags.name ?? '')) use = USE.commercial;
  }
  const lv = Math.round(parseFloat(tags['building:levels'] ?? ''));
  const mh = parseFloat(tags.min_height ?? '');
  const ml = parseFloat(tags['building:min_level'] ?? '');
  return {
    use,
    levels: lv > 0 ? Math.min(127, lv) : 0,
    roof: ROOF[tags['roof:shape'] ?? ''] ?? 0,
    minH: mh > 0 ? mh : ml > 0 ? Math.round(ml * FLOOR * 10) / 10 : 0,
  };
}

/** 용도(3비트) + 층수(7비트) + 지붕(3비트) + 아래 높이(dm). 풀기는 src/data/board.ts 의 unpackInfo */
export function packInfo(i: BuildingInfo): number {
  return i.use + i.levels * 8 + i.roof * 1024 + Math.round(i.minH * 10) * 8192;
}

/** 서울시 건축물대장 표제부 한 건(tools/buildings.py) */
export interface Title {
  /** 주용도코드명(단독주택, 공동주택, 제2종근린생활시설 등) */
  use: string;
  /** 기타용도내용(다가구주택, 아파트 등) */
  etc: string;
  floors: number;
  /** 높이(m). 0 = 모름 */
  height: number;
  /** 건축면적(㎡) */
  area: number;
  households: number;
  families: number;
  dong: string;
}

const TITLE_USE: [RegExp, string][] = [
  [/종교/, 'church'],
  [/업무|숙박|방송통신/, 'office'],
  [/교육|의료|노유자|문화|운수|국방|공공/, 'civic'],
  [/근린생활|판매|위락|운동|자동차|창고|공장|관광/, 'commercial'],
];

/** 표제부를 OSM 꼴 건물 태그로: 용도(building), 지상 층수, 층수에 견줘 그럴듯한(층당 2.2~6m) 높이 */
export function titleTags(t: Title): Record<string, string> {
  let building = TITLE_USE.find(([re]) => re.test(t.use))?.[1] ?? 'yes';
  if (t.use === '단독주택') building = /다가구|다중/.test(t.etc) || t.families >= 3 ? 'residential' : 'house';
  else if (t.use === '공동주택') building = /아파트/.test(t.etc) || t.floors >= 6 ? 'apartments' : 'residential';
  const out: Record<string, string> = { building };
  if (t.floors > 0) out['building:levels'] = String(t.floors);
  if (t.floors > 0 && t.height >= t.floors * 2.2 && t.height <= t.floors * 6 + 4) out.height = String(t.height);
  return out;
}

/** 한 주소의 표제부 여럿 가운데 이 건물 것: 동명이 건물 이름과 같으면 그것, 아니면 건축면적이 바닥 면적에 가장 가까운 것 */
export function pickTitle(list: Title[], footprint: number, name: string): Title {
  const byName = name ? list.find((t) => t.dong && (t.dong === name || name.endsWith(t.dong))) : undefined;
  if (byName) return byName;
  return list.reduce((a, b) => (Math.abs(b.area - footprint) < Math.abs(a.area - footprint) ? b : a));
}

/** 가운데 (cx, cz), 넓이 area, 긴 변 방향 (ux, uz), 긴 변 : 짧은 변 = aspect 인 직사각형(판 외곽선과 같은 방향, 넓이 양수) */
export function rectFootprint(cx: number, cz: number, area: number, ux: number, uz: number, aspect: number): [number, number][] {
  const b = Math.sqrt(area / (4 * aspect));
  const a = aspect * b;
  const nx = -uz;
  const nz = ux;
  return [
    [cx - ux * a - nx * b, cz - uz * a - nz * b],
    [cx + ux * a - nx * b, cz + uz * a - nz * b],
    [cx + ux * a + nx * b, cz + uz * a + nz * b],
    [cx - ux * a + nx * b, cz - uz * a + nz * b],
  ];
}

/**
 * 가게 점 [x, z, 종류]를 건물 외곽선에 붙인다: 외곽선 안이면 그 건물, 밖이면 maxDist(m) 안에서 변이 가장 가까운 건물, 더 멀면 버린다.
 * 건물 번호 → 가장 많은 종류(같으면 앞선 종류)와 붙은 가게 수
 */
export function attachShops(shops: [number, number, number][], footprints: [number, number][][], maxDist: number): Map<number, { kind: number; n: number }> {
  const CELL = 25;
  const grid = new Map<string, number[]>();
  footprints.forEach((f, i) => {
    const xs = f.map((p) => p[0]);
    const zs = f.map((p) => p[1]);
    for (let gx = Math.floor((Math.min(...xs) - maxDist) / CELL); gx <= Math.floor((Math.max(...xs) + maxDist) / CELL); gx++)
      for (let gz = Math.floor((Math.min(...zs) - maxDist) / CELL); gz <= Math.floor((Math.max(...zs) + maxDist) / CELL); gz++) {
        const k = `${gx},${gz}`;
        (grid.get(k) ?? grid.set(k, []).get(k)!).push(i);
      }
  });
  const inRing = (f: [number, number][], x: number, z: number) => {
    let c = false;
    for (let i = 0, j = f.length - 1; i < f.length; j = i++)
      if (f[i][1] > z !== f[j][1] > z && x < ((f[j][0] - f[i][0]) * (z - f[i][1])) / (f[j][1] - f[i][1]) + f[i][0]) c = !c;
    return c;
  };
  const edge = (f: [number, number][], x: number, z: number) => {
    let d = Infinity;
    for (let i = 0, j = f.length - 1; i < f.length; j = i++) {
      const dx = f[i][0] - f[j][0], dz = f[i][1] - f[j][1];
      const t = Math.max(0, Math.min(1, ((x - f[j][0]) * dx + (z - f[j][1]) * dz) / (dx * dx + dz * dz || 1e-9)));
      d = Math.min(d, Math.hypot(x - f[j][0] - t * dx, z - f[j][1] - t * dz));
    }
    return d;
  };
  const counts = new Map<number, number[]>();
  for (const [x, z, k] of shops) {
    const cand = grid.get(`${Math.floor(x / CELL)},${Math.floor(z / CELL)}`) ?? [];
    let best = cand.find((i) => inRing(footprints[i], x, z)) ?? -1;
    if (best < 0) {
      let bd = maxDist;
      for (const i of cand) {
        const d = edge(footprints[i], x, z);
        if (d <= bd) (bd = d), (best = i);
      }
    }
    if (best < 0) continue;
    const c = counts.get(best) ?? counts.set(best, [0, 0, 0, 0, 0]).get(best)!;
    c[k]++;
  }
  const out = new Map<number, { kind: number; n: number }>();
  for (const [i, c] of counts) {
    let kind = 1;
    for (let k = 2; k < c.length; k++) if (c[k] > c[kind]) kind = k;
    out.set(i, { kind, n: c.reduce((a, b) => a + b, 0) });
  }
  return out;
}
