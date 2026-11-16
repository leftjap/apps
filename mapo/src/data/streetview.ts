// 로드뷰 기록(data-src/streetview/<구역>.json). 카카오 로드뷰·스카이뷰를 보고 적은 값만 있고, 사진·상호는 없다.
// 건물 기록은 GIS건물통합정보 id 와 외곽선 안의 점(ll, 경위도)으로 판 건물에 잇는다. 형식은 docs/design.md 31절.
// 기록 파일은 board.json 에 넣지 않고 구역마다 따로 불러온다(재작업 계획 원칙 4).
import { toXZ } from '../geo.ts';
import type { Building } from './board.ts';

export const UNKNOWN = '미확인';
export type Unknown = typeof UNKNOWN;
type LL = [number, number];

export type Mat = 'paint' | 'brick' | 'stone' | 'tile' | 'glass' | 'metal' | 'concrete';
export type Ground = 'shop' | 'piloti' | 'lobby' | 'house' | 'ramp';
/** 면 방향(바깥을 보는 쪽, 8방위) */
export type Face = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';
export type Conf = 'yes' | 'part' | 'sky' | 'no';

/** 옥상 소품: 사각뿔 지붕 옥탑(hipRoom), 상자(box), 환기구(vent) */
export interface RoofItem {
  kind: 'hipRoom' | 'box' | 'vent';
  ll: LL;
  /** 긴 축 방향 너비·깊이·벽 높이(m), 사각뿔 높이 */
  w: number;
  d: number;
  h: number;
  roofH?: number;
  color: string;
  roofColor?: string;
  conf: Conf;
  note?: string;
}

/** 한 건물을 더 자세히 그릴 때 쓰는 값(지금은 서교대아아파트) */
export interface Detail {
  /** 층마다 내민 발코니 바닥과 난간. from: 몇 번째 층(0 = 1층)부터, slab: 칸마다 번갈아 쓰는 바닥 끝 색 */
  balconies?: {
    faces: Face[];
    from: number;
    depth: number;
    rail: string;
    slab: string[];
    rails: 'bars' | 'solid';
    ac: number;
    conf: Conf;
    /** 이 면들은 칸을 번갈아(짝수 칸) 푸른 유리로 막은 발코니로: 유리 색, 바닥 끝 띠 색, 실외기 비율 */
    glassBays?: { faces: Face[]; glass: string; band: string; ac: number };
  };
  /** 꼭대기 층 들임: 이 면들을 위 floors 개 층만큼 depth(m) 들이고, 들인 자리 앞에 난간을 둔다 */
  setback?: { faces: Face[]; depth: number; floors: number; rail: 'glass' | 'bars'; conf: Conf; note?: string };
  /** 발코니 창 대신 작은 창을 내는 면 */
  smallWindows?: Face[];
  /** 원통 계단실: 가운데 ll, 반지름, 지붕 위로 나온 높이, 층마다 아래·위 띠 색 */
  stair?: { kind: 'round'; ll: LL; r: number; top: number; bands: [string, string]; conf: Conf; note?: string };
  /** 벽에 붙인 세로 띠(이름 띠 등). at: 면의 어디쯤(0~1) */
  band?: { face: Face; at: number; w: number; y0: number; y1: number; color: string; conf: Conf; note?: string };
  roofItems?: RoofItem[];
  /** 벽에 낸 어두운 입구(주차장 진입로 등) */
  opening?: { face: Face; w: number; h: number; conf: Conf; note?: string };
  /** 지붕 끝 처마 띠 */
  eave?: { faces: Face[]; depth: number; drop: number; color: string; conf: Conf; note?: string };
}

export interface BuildingRec {
  key: string;
  gis: string | null;
  /** 외곽선 안의 점 */
  ll: LL;
  levels: number | Unknown;
  /** 실제 높이를 알면(m) */
  h?: number;
  /** 외벽 색 1~2개(둘째는 1층 외벽) */
  wall: string[] | Unknown;
  mat: Mat | Unknown;
  glass?: string;
  roof: 'flat' | 'gable' | 'hip' | Unknown;
  roofColor: string | Unknown;
  ground: Ground | Unknown;
  /** null = 차양 없음 */
  awning: { color: string } | null | Unknown;
  balcony: 'none' | 'flush' | 'projecting' | 'enclosed' | Unknown;
  windows: 'punched' | 'band' | 'curtain' | 'none' | Unknown;
  /** yes 로드뷰로 확인, part 일부만 보임, sky 항공사진으로 지붕만 */
  conf: Conf;
  /** [파노라마 id, 보는 방향(도)] */
  pano: [number, number] | null;
  seen: string;
  note?: string;
  detail?: Detail;
}

export interface StreetRec {
  key: string;
  name: string;
  line: LL[];
  trees: { species: string; height: string } | null;
  lamps: string;
  props: string[];
  conf: Conf;
  pano: number[];
  seen: string;
  note?: string;
}

interface PropBase {
  conf: Conf;
  seen: string;
  pano?: [number, number];
  note?: string;
}
export type PropRec = PropBase &
  (
    | { kind: 'tree'; ll: LL; species: string; height: '5-' | '5-10' | '10+' }
    | { kind: 'fence'; line: LL[]; base: 'concrete' | 'brick'; baseColor: string; baseH: number; fence: 'iron' | 'none'; fenceColor: string; fenceH: number }
    | { kind: 'gate'; ll: LL; w: number; d: number; h: number; color: string; top: 'arch' | 'flat' }
    | { kind: 'paving'; ll: LL; w: number; d: number; yaw: number; surface: 'asphalt' | 'concrete' | 'planting' | 'block' }
    | { kind: 'parking'; ll: LL; yaw: number; n: number; w: number; d: number; orient: 'perp' | 'parallel' }
    | { kind: 'pergola'; ll: LL; w: number; d: number; h: number; yaw: number; color: string }
    | { kind: 'lamp'; ll: LL; type: 'pole' | 'globe'; h: number }
  );

export interface AreaRec {
  area: string;
  title: string;
  center: LL;
  radius: number;
  seen: string;
  source: string;
  /** 완료 기준을 대조하는 시점: 로드뷰(pano·pan·tilt)와 배포본(?view=) */
  views: { name: string; pano: number; pan: number; tilt: number; board: string }[];
  buildings: BuildingRec[];
  streets: StreetRec[];
  props: PropRec[];
}

export const xz = (ll: LL): [number, number] => toXZ(ll[0], ll[1]);

const FACES: Face[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
/** 바깥 법선(판 좌표 x 동쪽, z 남쪽) → 면 방향(8방위) */
export function faceOf(nx: number, nz: number): Face {
  const deg = ((Math.atan2(nx, -nz) * 180) / Math.PI + 360) % 360;
  return FACES[Math.round(deg / 45) % 8];
}

/** 기록한 수종 → 나무 모형 번호(render/trees.ts: 0 은행 1 양버즘 2 느티 3 벚 4 소나무류 5 그 밖 활엽) */
export function treeKind(species: string): number {
  const k = ['은행', '양버즘', '느티', '벚', '소나무'].findIndex((n) => species.includes(n));
  return k < 0 ? 5 : k;
}

const inPoly = (p: ArrayLike<number>, x: number, z: number) => {
  let c = false;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    if (p[i + 1] > z !== p[j + 1] > z && x < ((p[j] - p[i]) * (z - p[i + 1])) / (p[j + 1] - p[i + 1]) + p[i]) c = !c;
  }
  return c;
};
const area2 = (p: ArrayLike<number>) => {
  let a = 0;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) a += p[j] * p[i + 1] - p[i] * p[j + 1];
  return Math.abs(a / 2);
};

/** 기록마다 점이 든 외곽선 가운데 가장 작은 건물을 찾는다(큰 외곽선 안의 작은 부분 건물을 고르려고) */
export function matchBuildings(list: Building[], areas: AreaRec[]): { byIndex: Map<number, BuildingRec>; missing: BuildingRec[] } {
  const byIndex = new Map<number, BuildingRec>();
  const missing: BuildingRec[] = [];
  for (const a of areas)
    for (const r of a.buildings) {
      const [x, z] = xz(r.ll);
      let best = -1;
      let bestA = Infinity;
      list.forEach((b, i) => {
        const p = b.pts;
        // 빠르게 거른다: 외곽선 첫 점에서 300m 넘게 떨어진 건물은 보지 않는다
        if (Math.abs(p[0] - x) > 300 || Math.abs(p[1] - z) > 300 || !inPoly(p, x, z)) return;
        const s = area2(p);
        if (s < bestA) (bestA = s), (best = i);
      });
      if (best < 0) missing.push(r);
      else byIndex.set(best, r);
    }
  return { byIndex, missing };
}

const hex = (c: string): [number, number, number] => [parseInt(c.slice(1, 3), 16) / 255, parseInt(c.slice(3, 5), 16) / 255, parseInt(c.slice(5, 7), 16) / 255];
const known = <T>(v: T | Unknown | undefined): v is T => v !== undefined && v !== UNKNOWN;

/** 그리기 쪽이 쓰는 기록 값(색은 0~1). 미확인은 비워 두어 난수 값을 쓴다 */
export interface RecLook {
  wall?: [number, number, number];
  wall2?: [number, number, number];
  roof?: [number, number, number];
  glass?: [number, number, number];
  /** 0 미확인 1 도장 2 벽돌 3 석재 4 타일 5 유리 6 금속 7 노출 콘크리트 */
  mat: number;
  ground?: Ground;
  /** null = 차양 없음, undefined = 미확인 */
  awning?: [number, number, number] | null;
  /** 창을 내지 않는 벽(주차장 진입로 구조물 등) */
  noWin: boolean;
  detail?: Detail;
}

const MATS: Mat[] = ['paint', 'brick', 'stone', 'tile', 'glass', 'metal', 'concrete'];

export function recLook(r: BuildingRec): RecLook {
  const wall = known(r.wall) ? r.wall : [];
  return {
    wall: wall[0] ? hex(wall[0]) : undefined,
    wall2: wall[1] ? hex(wall[1]) : undefined,
    roof: known(r.roofColor) ? hex(r.roofColor) : undefined,
    glass: r.glass ? hex(r.glass) : undefined,
    mat: known(r.mat) ? MATS.indexOf(r.mat) + 1 : 0,
    ground: known(r.ground) ? r.ground : undefined,
    awning: r.awning === null ? null : known(r.awning) ? hex(r.awning.color) : undefined,
    noWin: r.windows === 'none',
    detail: r.detail,
  };
}

/** 층 높이 어림(m): 아파트 2.8, 그 밖 3.1 */
const storey = (b: Building) => (b.use === 3 ? 2.8 : 3.1);
const ROOF = { flat: 1, gable: 2, hip: 3 } as const;

/** 기록을 판 건물에 덮어쓴다: 층수(다르면 높이도), 높이, 지붕 모양, 가게 자료가 없는 가게 1층. 외곽선은 바꾸지 않는다 */
export function applyRec(b: Building, r: BuildingRec): Building & { rec: RecLook } {
  const o: Building & { rec: RecLook } = { ...b, rec: recLook(r) };
  if (known(r.levels)) {
    if (r.h === undefined && r.levels !== b.levels) {
      const old = b.levels ? b.levels : Math.max(1, Math.round((b.h - 1) / storey(b)));
      if (old !== r.levels) o.h = Math.round((r.levels * storey(b) + 1) * 10) / 10;
    }
    o.levels = r.levels;
  }
  if (r.h !== undefined) o.h = r.h;
  if (known(r.roof)) o.roof = ROOF[r.roof];
  if (r.ground === 'shop' && !b.shop) {
    o.shop = 6;
    o.shopMask = (b.shopMask ?? 0) | 2;
  }
  return o;
}

/** 기록 파일을 모두 불러온다(빌드에서는 파일마다 따로 내보낸 주소를 받는다) */
export async function loadStreetview(): Promise<AreaRec[]> {
  const urls = import.meta.glob<string>('../../data-src/streetview/*.json', { query: '?url', import: 'default', eager: true });
  return Promise.all(Object.values(urls).map((u) => fetch(u).then((r) => r.json() as Promise<AreaRec>)));
}
