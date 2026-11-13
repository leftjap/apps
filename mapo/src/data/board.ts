// 구운 모형판 자료의 형식과 로더. 파일에는 길이가 데시미터 정수로 들어 있다.
import { cumLen } from '../poly.ts';

export interface BoardJson {
  v: 1;
  names: string[];
  /** 건물: [높이, 랜드마크 번호, x0,z0, x1,z1, ...] */
  b: number[][];
  /** 도로 조각: [등급, 차로 수, 일방통행, 교량, 이름 번호, 랜드마크 번호, x,y,z, ...] */
  r: number[][];
  lines: { id: string; name: string; color: string; cars: number; p: number[]; stops: { name: string; s: number }[] }[];
  stations: { name: string; x: number; z: number }[];
  exits: { st: string; x: number; z: number; ref?: string }[];
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
}

export interface Building {
  h: number;
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
  /** 중심선 [x,y,z, ...]. 일방통행이면 진행 방향 순서 */
  p: Float32Array;
}

export interface Line {
  id: string;
  name: string;
  color: string;
  cars: number;
  carLen: number;
  p: Float32Array;
  cum: Float32Array;
  stops: number[];
  stopNames: string[];
}

export interface Exit {
  st: string;
  x: number;
  z: number;
  /** 출구 번호 */
  ref: string;
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
}

const m = (a: number[], from = 0) => Float32Array.from(a.slice(from), (v) => v / 10);

export function decodeBoard(j: BoardJson): Board {
  const river = Float32Array.from((j.river ?? []).flatMap((v, i, a) => (i % 2 === 0 ? [v / 10, 0, a[i + 1] / 10] : [])));
  return {
    campus: m(j.campus ?? []),
    schools: (j.schools ?? []).map((s) => ({ name: s.name.replace(/,\s*/g, ' · '), ring: m(s.ring) })),
    river,
    riverCum: cumLen(river),
    picnic: m(j.picnic ?? []),
    buildings: j.b.map((b) => ({ h: b[0] / 10, lm: b[1], pts: m(b, 2) })),
    roads: j.r.map((r) => ({ cls: r[0], lanes: r[1], oneway: !!(r[2] & 1), bus: !!(r[2] & 2), bridge: !!r[3], name: j.names[r[4]] ?? '', lm: r[5], p: m(r, 6) })),
    lines: j.lines.map((l) => {
      const p = m(l.p);
      return { id: l.id, name: l.name, color: l.color, cars: l.cars, carLen: 20, p, cum: cumLen(p), stops: l.stops.map((s) => s.s), stopNames: l.stops.map((s) => s.name) };
    }),
    stations: j.stations.map((s) => ({ name: s.name, x: s.x / 10, z: s.z / 10 })),
    exits: j.exits.map((e) => ({ st: e.st, x: e.x / 10, z: e.z / 10, ref: e.ref ?? '' })),
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

export async function loadBoard(base: string): Promise<Board> {
  const res = await fetch(`${base}data/board.json`);
  return decodeBoard(await res.json());
}
