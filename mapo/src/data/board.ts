// 구운 모형판 자료의 형식과 로더. 파일에는 길이가 데시미터 정수로 들어 있다.
import { cumLen } from '../poly.ts';
import { fitExits } from './exitFit.ts';

export interface BoardJson {
  v: 1;
  names: string[];
  /** 건물: [높이, 랜드마크 번호, x0,z0, x1,z1, ...] */
  b: number[][];
  /** 건물마다 용도·층수·지붕·아래 높이를 묶은 숫자(tools/lib/building.ts packInfo). 0 = 모름 */
  bi?: number[];
  /** 가게가 붙은 건물 [건물 번호, 1층·지하 가게 종류, 2층 위 가게 종류, 층 표시, 가게 수, ...] (소상공인 상가(상권)정보). 종류 0 없음 1 카페 2 음식점 3 주점 4 편의점 5 병원·약국 6 소매·생활, 층 표시 1 지하 2 1층 4 2층 8 3층 위 */
  sh?: number[];
  /** 역 둘레의 지하↔지상 엘리베이터 [x,z, ...] */
  ev?: number[];
  /** 도로 조각: [등급, 차로 수, 일방통행, 교량, 이름 번호, 랜드마크 번호, x,y,z, ...] */
  r: number[][];
  /** k: 꼭짓점 i 와 i+1 사이 조각의 종류(−1 터널, 0 지상, 1 다리, OSM 태그로 굽는다) */
  lines: { id: string; name: string; color: string; cars: number; p: number[]; k: number[]; stops: { name: string; s: number }[] }[];
  stations: { name: string; x: number; z: number }[];
  exits: { st: string; x: number; z: number; ref?: string; yaw?: number }[];
  landmarks: { id: string; x: number; z: number }[];
  trees: number[];
  /** 버스 노선: 부호 있는 도로 조각 번호 열, 정류장 [거리(dm), 이름 번호, ...] */
  buses?: { ref: string; kind: number; to: number; segs: number[]; stops: number[] }[];
  /** 홍익대 캠퍼스 외곽선 [x,z, ...] */
  campus?: number[];
  /** 학교 부지: 이름과 외곽선 [x,z, ...] */
  schools?: { name: string; ring: number[] }[];
  /** 한강 물길 가운데 [x,z, ...](서쪽 → 동쪽) */
  river?: number[];
  /** 망원한강공원 피크닉 자리 [x,z, ...] */
  picnic?: number[];
  /** 도로 조각마다 차선 자료에서 읽은 [진행 방향 차로, 반대 방향 차로, 차로 폭(cm), 중앙선 종류, 표시, 분리대 폭(dm)]. 0 = 없음 */
  rl?: (number[] | 0)[];
  /** 도로 조각마다 연석선으로 읽은 찻길 가장자리 [[오른쪽 s, 거리, ...], [왼쪽 s, 거리, ...]](dm). 0 = 없음 */
  re?: (number[][] | 0)[];
  /** 길 모퉁이(src/data/corners.ts roadCorners 순서)마다 가장자리선으로 잰 반지름(dm). 0 = 등급 기본값 */
  rc?: number[];
  /** 횡단보도 [가운데 x, z, 건너는 방향 ×1000 (x, z), 반 길이, 폭, 표시, 축이 지나는 꼭짓점 x, z, ...] */
  xw?: number[][];
  /** 횡단보도마다 조각 면 외곽선 [점 개수, x, z, ..., 점 개수, ...] */
  xwp?: number[][];
  /** 사람이 건너는 데 쓰지 않고 그리기만 하는 횡단보도 면(판에 없는 골목·진입로 입구) [점 개수, x, z, ...] */
  xwd?: number[];
  /** 정지선 [x0, z0, x1, z1, ...] */
  stop?: number[];
  /** 바닥 면: [종류(GK), 값, [가운데 x, z, 긴 변 방향 ×1000 (x, z), 반 길이, 반 폭] 또는 [], [바깥 고리 x,z, ...], [구멍 x,z, ...], ...] */
  ga?: (number | number[])[][];
}

/** 건물 용도(구울 때 태그로 정한다. 모르면 0, 그리기에서 자리와 높이로 어림한다) */
export const USE = { unknown: 0, house: 1, villa: 2, apartments: 3, commercial: 4, office: 5, civic: 6, religious: 7 } as const;

export interface BuildingInfo {
  use: number;
  /** 지상 층수(태그가 없으면 0) */
  levels: number;
  /** 0 모름 1 평지붕 2 맞배 3 모임 4 피라미드 5 외쪽 6 돔 7 둥근 */
  roof: number;
  /** 건물 부분이 시작하는 높이(m). 아래가 비어 있는 덩어리(building:part) */
  minH: number;
}

export function unpackInfo(v: number): BuildingInfo {
  return { use: v % 8, levels: Math.floor(v / 8) % 128, roof: Math.floor(v / 1024) % 8, minH: Math.floor(v / 8192) / 10 };
}

/** 용도·층수·지붕·아래 높이는 구운 자료에 없으면 비어 있다 */
export interface Building extends Partial<BuildingInfo> {
  h: number;
  /** 1층·지하 가게의 가장 많은 종류(0·없음 = 가게 없음, 1 카페 2 음식점 3 주점 4 편의점 5 병원·약국 6 소매·생활), 2층 위 가게 종류, 층 표시(1 지하 2 1층 4 2층 8 3층 위), 가게 수 */
  shop?: number;
  shopUp?: number;
  shopMask?: number;
  shops?: number;
  /** 0 = 일반, 1 = 홍익대 */
  lm: number;
  /** 외곽선 [x,z, ...]. 넓이가 양수인 방향 */
  pts: Float32Array;
}

/** 도로 등급: 0 간선(고속) 1 주간선 2 보조간선 3 집산 4 골목 5 진입로 6 보행 전용 7 보행로·자전거길 */
export interface Road {
  cls: number;
  lanes: number;
  oneway: boolean;
  bridge: boolean;
  name: string;
  /** 0 = 일반, 4 = 서강대교, 5 = 양화대교 */
  lm: number;
  /** 버스 노선이 지나는 조각(골목이어도 차가 다닌다) */
  bus?: boolean;
  /** 진행 방향(p 순서) 차로 수 */
  lf: number;
  /** 반대 방향 차로 수(한 방향 길은 0) */
  lb: number;
  /** 차로 폭(m) */
  lw: number;
  /** 중앙선: 0 없음, 1 황색 실선, 2 황색 점선, 3 황색 복선, 4 실선·점선 */
  ctype: number;
  /** 진행 방향·반대 방향 맨 오른쪽 차로가 가로변 버스전용차로 */
  busR: boolean;
  busL: boolean;
  /** 한 방향 길 왼쪽에 중앙버스전용차로가 붙어 있다 */
  medBus: boolean;
  /** 한 방향 길 왼쪽 분리대(반대 방향 길까지) 폭(m) */
  gap: number;
  /** 차선 자료로 읽은 길인가(아니면 차로 수를 등급으로 어림한 값) */
  measured: boolean;
  /** 중심선 [x,y,z, ...]. 일방통행이면 진행 방향 순서. 양방향 길이면 중앙선 자리 */
  p: Float32Array;
  /** 연석선으로 읽은 진행 방향 오른쪽·왼쪽 찻길 가장자리(길을 따라간 거리 s 마다 가운데선에서 떨어진 거리). 없으면 roadHalf */
  edge?: { r: EdgeProfile; l: EdgeProfile };
}

export interface EdgeProfile {
  s: Float32Array;
  v: Float32Array;
}

/** 길 가운데선에서 진행 방향 오른쪽·왼쪽 찻길 가장자리까지(m). 차로가 있는 길은 차로 수 × 차로 폭 + 0.5m */
export function roadHalf(r: Road): [number, number] {
  if (r.cls <= 3 || r.measured) {
    if (r.oneway) return [(r.lf * r.lw) / 2 + 0.5, (r.lf * r.lw) / 2 + 0.5];
    return [r.lf * r.lw + 0.5, r.lb * r.lw + 0.5];
  }
  const w = r.cls === 4 ? 5.6 : r.cls === 5 ? 3.6 : r.cls === 6 ? 6.5 : 2.6;
  return [w / 2, w / 2];
}

/** 길을 따라 s(m) 자리의 찻길 가장자리가 가운데선에서 떨어진 거리. side 1 = 진행 방향 오른쪽, −1 = 왼쪽 */
export function curbAt(r: Road, s: number, side: number): number {
  const p = side > 0 ? r.edge?.r : r.edge?.l;
  if (!p) return roadHalf(r)[side > 0 ? 0 : 1];
  let k = 0;
  while (k + 2 < p.s.length && p.s[k + 1] < s) k++;
  const t = Math.max(0, Math.min(1, (s - p.s[k]) / (p.s[k + 1] - p.s[k] || 1)));
  return p.v[k] + (p.v[k + 1] - p.v[k]) * t;
}

export interface Crosswalk {
  x: number;
  z: number;
  /** 건너는 방향(단위 벡터) */
  ux: number;
  uz: number;
  /** 건너는 길이의 반(m) */
  half: number;
  /** 횡단보도 폭(m) */
  wid: number;
  /** 보행 신호등이 있다(자치구 횡단보도 정보, 2026-03) */
  sig: boolean;
  /** 신호 유무를 모른다(2021 면 자료에만 있다) */
  sigUnknown: boolean;
  /** 축이 지나는 길 조각 꼭짓점 [x,z, ...], 축 방향 순서 */
  verts: Float32Array;
  /** 서울시 횡단보도 면 외곽선 [x,z, ...]. 두 단 횡단보도는 조각마다 하나 */
  rings: Float32Array[];
}

export interface Line {
  id: string;
  name: string;
  color: string;
  cars: number;
  carLen: number;
  p: Float32Array;
  cum: Float32Array;
  /** 꼭짓점 i 와 i+1 사이 조각의 종류: −1 터널, 0 지상(태그 없음), 1 다리 */
  kind: Int8Array;
  stops: number[];
  stopNames: string[];
}

export interface Exit {
  st: string;
  x: number;
  z: number;
  /** 출구 번호 */
  ref: string;
  /** 계단이 내려가는 방향(라디안, atan2(z, x)). 모르면 NaN */
  yaw: number;
  /** 출구 지붕 외곽선으로 잰 지상 구조물 길이(m). 맞추지 못했으면 없음(exitFit.ts) */
  len?: number;
}

export interface BusRun {
  ref: string;
  /** 0 간선 1 지선 2 광역 3 마을 */
  kind: number;
  /** 가는 방향(모르면 빈 문자열) */
  to: string;
  /** 부호 있는 도로 조각 번호: (번호 + 1) × (저장된 방향이면 +1, 거꾸로면 −1) */
  segs: number[];
  /** 정류장의 노선 거리(m) */
  stops: number[];
  stopNames: string[];
}

export interface Board {
  buildings: Building[];
  roads: Road[];
  /** 길 모퉁이 반지름(m, src/data/corners.ts 순서). 0 = 등급 기본값 */
  cornerR: number[];
  lines: Line[];
  stations: { name: string; x: number; z: number }[];
  exits: Exit[];
  landmarks: { id: string; x: number; z: number }[];
  /** [x,z, ...] */
  trees: Float32Array;
  buses: BusRun[];
  campus: Float32Array;
  schools: { name: string; ring: Float32Array }[];
  /** [x,0,z, ...] */
  river: Float32Array;
  riverCum: Float32Array;
  picnic: Float32Array;
  crosswalks: Crosswalk[];
  /** 그리기만 하는 횡단보도 면 외곽선 [x,z, ...] */
  crosswalkMarks: Float32Array[];
  /** 정지선 [x0, z0, x1, z1, ...] */
  stopLines: Float32Array;
  /** 바닥 면(땅 쓰임새·보도·광장·주차장·운동장·놀이터·물가 등). 그리는 순서대로 */
  groundAreas: GroundArea[];
  /** 역 엘리베이터 [x,z, ...] */
  elevators: Float32Array;
}

const m = (a: number[], from = 0) => Float32Array.from(a.slice(from), (v) => v / 10);
const profile = (a: number[]): EdgeProfile => ({ s: Float32Array.from(a.filter((_, i) => i % 2 === 0), (v) => v / 10), v: Float32Array.from(a.filter((_, i) => i % 2 === 1), (v) => v / 10) });
/** [점 개수, x, z, ..., 점 개수, ...](데시미터) → 외곽선마다 [x,z, ...](m) */
const rings = (a: number[]) => {
  const out: Float32Array[] = [];
  for (let i = 0; i < a.length; i += 1 + a[i] * 2) out.push(m(a.slice(i + 1, i + 1 + a[i] * 2)));
  return out;
};

export function decodeBoard(j: BoardJson): Board {
  const board = decodeRaw(j);
  // 출구 지붕이 작은 건물로 들어 있으면 그 외곽선으로 출구 자리를 맞추고 지운다. 찻길·건물에 걸린 출구는 옮긴다(exitFit.ts)
  fitExits(board);
  return board;
}

function shopsOn(list: Building[], sh: number[]): Building[] {
  for (let i = 0; i + 4 < sh.length; i += 5) Object.assign(list[sh[i]], { shop: sh[i + 1], shopUp: sh[i + 2], shopMask: sh[i + 3], shops: sh[i + 4] });
  return list;
}

function decodeRaw(j: BoardJson): Board {
  const river = Float32Array.from((j.river ?? []).flatMap((v, i, a) => (i % 2 === 0 ? [v / 10, 0, a[i + 1] / 10] : [])));
  return {
    campus: m(j.campus ?? []),
    schools: (j.schools ?? []).map((s) => ({ name: s.name.replace(/,\s*/g, ' · '), ring: m(s.ring) })),
    river,
    riverCum: cumLen(river),
    picnic: m(j.picnic ?? []),
    buildings: shopsOn(j.b.map((b, i) => ({ h: b[0] / 10, lm: b[1], pts: m(b, 2), ...unpackInfo(j.bi?.[i] ?? 0) })), j.sh ?? []),
    elevators: m(j.ev ?? []),
    cornerR: (j.rc ?? []).map((v) => v / 10),
    roads: j.r.map((r, i) => {
      const oneway = !!(r[2] & 1);
      const rl = j.rl?.[i] || null;
      const measured = !!rl && rl[0] > 0;
      const lanes = r[1];
      const lf = measured ? rl![0] : oneway ? Math.max(1, lanes) : Math.max(1, Math.ceil(lanes / 2));
      const lb = measured ? rl![1] : oneway ? 0 : Math.max(1, Math.ceil(lanes / 2));
      return {
        cls: r[0],
        lanes,
        oneway,
        bus: !!(r[2] & 2),
        bridge: !!r[3],
        name: j.names[r[4]] ?? '',
        lm: r[5],
        p: m(r, 6),
        lf,
        lb,
        lw: measured ? rl![2] / 100 : 3.3,
        ctype: measured ? rl![3] : r[0] <= 3 && !oneway ? 1 : 0,
        busR: measured && !!(rl![4] & 1),
        busL: measured && !!(rl![4] & 2),
        medBus: measured && !!(rl![4] & 4),
        gap: rl ? rl[5] / 10 : 0,
        measured,
        ...(j.re?.[i] ? { edge: { r: profile((j.re[i] as number[][])[0]), l: profile((j.re[i] as number[][])[1]) } } : {}),
      };
    }),
    lines: j.lines.map((l) => {
      const p = m(l.p);
      return { id: l.id, name: l.name, color: l.color, cars: l.cars, carLen: 20, p, cum: cumLen(p), kind: Int8Array.from(l.k), stops: l.stops.map((s) => s.s), stopNames: l.stops.map((s) => s.name) };
    }),
    stations: j.stations.map((s) => ({ name: s.name, x: s.x / 10, z: s.z / 10 })),
    exits: j.exits.map((e) => ({ st: e.st, x: e.x / 10, z: e.z / 10, ref: e.ref ?? '', yaw: e.yaw === undefined ? NaN : e.yaw / 1000 })),
    crosswalks: (j.xw ?? []).map((c, i) => ({
      x: c[0] / 10,
      z: c[1] / 10,
      ux: c[2] / 1000,
      uz: c[3] / 1000,
      half: c[4] / 10,
      wid: c[5] / 10,
      sig: !!(c[6] & 1),
      sigUnknown: !!(c[6] & 2),
      verts: m(c, 7),
      rings: rings(j.xwp?.[i] ?? []),
    })),
    crosswalkMarks: rings(j.xwd ?? []),
    stopLines: m(j.stop ?? []),
    groundAreas: decodeGroundAreas(j.ga ?? []),
    landmarks: j.landmarks.map((l) => ({ id: l.id, x: l.x / 10, z: l.z / 10 })),
    trees: m(j.trees),
    buses: (j.buses ?? []).map((b) => ({
      ref: b.ref,
      kind: b.kind,
      to: j.names[b.to] ?? '',
      segs: b.segs,
      stops: b.stops.filter((_, i) => i % 2 === 0).map((v) => v / 10),
      stopNames: b.stops.filter((_, i) => i % 2 === 1).map((n) => j.names[n] ?? ''),
    })),
  };
}

/**
 * 바닥 면 종류. 1~19 는 서울 생태현황도(개별비오톱) 면, 20 이상은 OSM 면이다. 굽기는 이 순서(작은 값 먼저)로 늘어놓아 뒤의 면이 앞의 면을 덮는다.
 */
export const GK = {
  /** 단독주택지 */
  HOUSE: 1,
  /** 공동주택(아파트 단지) */
  APT: 2,
  /** 주거·상업 혼합지 */
  MIXED: 3,
  /** 상업·업무지 */
  COMMERCE: 4,
  /** 공공용도지(학교·관공서) */
  PUBLIC: 5,
  /** 철도·역 부지 */
  RAIL: 6,
  /** 도로 부지: 찻길 띠가 덮지 않은 부분이 보도로 남는다 */
  ROADSIDE: 7,
  /** 공업·기반시설·특수 지역 */
  UTILITY: 8,
  /** 나지(맨땅), 공사장 */
  BARE: 9,
  /** 산림 */
  FOREST: 10,
  /** 조경 녹지·풀밭 */
  GREEN: 11,
  /** 경작지 */
  FARM: 12,
  /** 한강 둔치 녹지 */
  RIVER_GREEN: 13,
  /** 한강 둔치 포장(산책로·자전거길·시설) */
  RIVER_PAVED: 14,
  /** 호안 블록(물가 돌 쌓기) */
  REVETMENT: 15,
  /** 공원 잔디 */
  PARK: 20,
  /** 숲 */
  WOOD: 21,
  /** 철도 선로 부지 */
  RAILWAY: 22,
  /** 보행 광장·보행자 길 면 */
  PLAZA: 23,
  /** 지상 주차장 */
  PARKING: 24,
  /** 흙 운동장 */
  PITCH_DIRT: 25,
  /** 잔디(인조 잔디) 운동장 */
  PITCH_TURF: 26,
  /** 테니스·농구·배드민턴 등 포장 코트 */
  COURT: 27,
  /** 육상 트랙 */
  TRACK: 28,
  /** 놀이터 */
  PLAYGROUND: 29,
  /** 관람석·계단식 스탠드 */
  BLEACHERS: 30,
  /** 교통섬 */
  ISLAND: 31,
  /** 부두·데크 */
  PIER: 32,
  /** 수영장·분수 */
  POOL: 33,
} as const;

export interface GroundArea {
  kind: number;
  /** 종류마다 쓰는 값: 경기장은 종목(1 축구, 2 테니스, 3 농구, 4 야구, 5 배드민턴·배구), 비오톱 면은 녹지율(%) */
  param: number;
  /** 감싸는 직사각형(경기장 선·주차 칸을 긋는 데 쓴다). hl·hw 는 긴 변·짧은 변의 반(m) */
  rect: { cx: number; cz: number; ux: number; uz: number; hl: number; hw: number } | null;
  /** 바깥 고리 [x,z, ...](닫는 점 없이) */
  outer: Float32Array;
  holes: Float32Array[];
}

export function decodeGroundAreas(ga: (number | number[])[][]): GroundArea[] {
  return ga.map((a) => {
    const r = a[2] as number[];
    return {
      kind: a[0] as number,
      param: a[1] as number,
      rect: r.length ? { cx: r[0] / 10, cz: r[1] / 10, ux: r[2] / 1000, uz: r[3] / 1000, hl: r[4] / 10, hw: r[5] / 10 } : null,
      outer: m(a[3] as number[]),
      holes: (a.slice(4) as number[][]).map((h) => m(h)),
    };
  });
}

export async function loadBoard(base: string): Promise<Board> {
  const res = await fetch(`${base}data/board.json`);
  return decodeBoard(await res.json());
}
