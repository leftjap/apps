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
  /** 횡단보도 [가운데 x, z, 건너는 방향 ×1000 (x, z), 반 길이, 폭, 표시, 축이 지나는 꼭짓점 x, z, ...] */
  xw?: number[][];
  /** 정지선 [x0, z0, x1, z1, ...] */
  stop?: number[];
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
  /** 계단이 내려가는 방향(라디안, atan2(z, x)). 모르면 NaN */
  yaw: number;
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
  crosswalks: Crosswalk[];
  /** 정지선 [x0, z0, x1, z1, ...] */
  stopLines: Float32Array;
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
      };
    }),
    lines: j.lines.map((l) => {
      const p = m(l.p);
      return { id: l.id, name: l.name, color: l.color, cars: l.cars, carLen: 20, p, cum: cumLen(p), stops: l.stops.map((s) => s.s), stopNames: l.stops.map((s) => s.name) };
    }),
    stations: j.stations.map((s) => ({ name: s.name, x: s.x / 10, z: s.z / 10 })),
    exits: j.exits.map((e) => ({ st: e.st, x: e.x / 10, z: e.z / 10, ref: e.ref ?? '', yaw: e.yaw === undefined ? NaN : e.yaw / 1000 })),
    crosswalks: (j.xw ?? []).map((c) => ({
      x: c[0] / 10,
      z: c[1] / 10,
      ux: c[2] / 1000,
      uz: c[3] / 1000,
      half: c[4] / 10,
      wid: c[5] / 10,
      sig: !!(c[6] & 1),
      sigUnknown: !!(c[6] & 2),
      verts: m(c, 7),
    })),
    stopLines: m(j.stop ?? []),
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
