import { curbAt, type Crosswalk, type Road } from '../src/data/board.ts';
import { carriageSections, isGroundRoad, roadJoints } from '../src/data/surface.ts';
import type { DataProvider } from '../src/sim/provider.ts';
import { decodeWalk, type WalkGraph } from '../src/sim/walknet.ts';
import { buildWalkNet } from '../tools/lib/walknet.ts';

/** 시험용 도로 조각. pts 는 [x,z] 목록 */
export const road = (pts: [number, number][], o: Partial<Road> = {}): Road => {
  const lanes = o.lanes ?? 2;
  const oneway = o.oneway ?? false;
  return {
    cls: 2,
    lanes,
    oneway,
    bridge: false,
    name: '',
    lm: 0,
    p: Float32Array.from(pts.flatMap(([x, z]) => [x, 0, z])),
    lf: oneway ? Math.max(1, lanes) : Math.max(1, Math.ceil(lanes / 2)),
    lb: oneway ? 0 : Math.max(1, Math.ceil(lanes / 2)),
    lw: 3.3,
    ctype: 1,
    busR: false,
    busL: false,
    medBus: false,
    gap: 0,
    measured: false,
    ...o,
  };
};

/** 속도 비율을 고정한 자료 공급자 */
export const fixedProvider = (speed: number, pop = 20000): DataProvider => ({
  mode: 'sim',
  areas: () => [{ id: 'hongdae', name: '홍대 관광특구', level: 2, label: '약간 붐빔', pplMin: pop, pplMax: pop + 1000, crowd: pop / 30000, ages: [5, 10, 25, 20, 15, 12, 8, 5], female: 50 }],
  roadSpeed: () => speed,
  alighting: () => 300,
});

export const at = (h: number, dow = 2) => ({ tod: h * 3600, dow, doy: 317 });

/** 시험용 횡단보도. verts 는 축이 지나는 길 꼭짓점 [x,z] 목록 */
export const crosswalk = (x: number, z: number, ux: number, uz: number, half: number, verts: [number, number][], sig = true, wid = 4): Crosswalk => ({
  x,
  z,
  ux,
  uz,
  half,
  wid,
  sig,
  sigUnknown: false,
  verts: Float32Array.from(verts.flat()),
  rings: [Float32Array.from([[-1, -1], [1, -1], [1, 1], [-1, 1]].flatMap(([a, b]) => [x + ux * a * half - (uz * b * wid) / 2, z + uz * a * half + (ux * b * wid) / 2]))],
});

/**
 * 시험용 걷는 길 그래프: 굽기(tools/lib/walknet.ts)에 넣는 면을 길 조각으로 만든다.
 * 찻길 띠는 등급 5 이하 땅 위 길을 끝까지 그린 띠, 큰길(등급 3 이하)은 양옆 연석 0.35m 밖에 폭 sidewalk(기본 4m) 보도를 두고
 * 찻길 띠를 뺀다. 도로 부지는 찻길 띠와 보도, 그리고 land 로 준 도형. 분리대(med)는 큰길 찻길로 친다
 */
export function walkNet(
  roads: Road[],
  o: { walls?: Float32Array[]; land?: number[][]; crosswalks?: Crosswalk[]; sidewalk?: number; med?: number[][]; noWalk?: number[] } = {},
): WalkGraph {
  const joints = roadJoints(roads);
  const sw = o.sidewalk ?? 4;
  const ribbon = (r: Road, i: number) => {
    const s = carriageSections(r, 0, Infinity, joints.subarray(i * 4, i * 4 + 4));
    return [...s.flatMap((q) => [q.lx, q.lz]), ...s.reverse().flatMap((q) => [q.rx, q.rz])];
  };
  const hard: number[][][] = (o.med ?? []).map((m) => [m]);
  const soft: number[][][] = [];
  const car: number[][][] = [];
  const walk: number[][][] = [];
  let x0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let z1 = -Infinity;
  roads.forEach((r, i) => {
    for (let k = 0; k < r.p.length; k += 3) (x0 = Math.min(x0, r.p[k])), (x1 = Math.max(x1, r.p[k])), (z0 = Math.min(z0, r.p[k + 2])), (z1 = Math.max(z1, r.p[k + 2]));
    if (!isGroundRoad(r)) return;
    const rb = ribbon(r, i);
    car.push([rb]);
    (r.cls <= 3 ? hard : soft).push([rb]);
    if (r.cls > 3 || o.noWalk?.includes(i)) return;
    // 보도: 연석 0.35m 밖부터 폭 sw, 조각마다 사각형
    for (let k = 0; k + 3 < r.p.length; k += 3) {
      const [ax, az, bx, bz] = [r.p[k], r.p[k + 2], r.p[k + 3], r.p[k + 5]];
      const L = Math.hypot(bx - ax, bz - az) || 1;
      const nx = -(bz - az) / L;
      const nz = (bx - ax) / L;
      for (const side of [1, -1]) {
        const c = curbAt(r, 0, side) + 0.35;
        const e = c + sw;
        walk.push([[ax + nx * c * side, az + nz * c * side, bx + nx * c * side, bz + nz * c * side, bx + nx * e * side, bz + nz * e * side, ax + nx * e * side, az + nz * e * side]]);
      }
    }
  });
  const pad = 30;
  return decodeWalk(
    buildWalkNet({
      bounds: [x0 - pad, z0 - pad, x1 + pad, z1 + pad],
      walk,
      notWalk: [...car, ...hard],
      hardFaces: [],
      softAlleys: soft,
      hard,
      land: [...car, ...(o.land ?? []).map((r) => [r])],
      buildings: o.walls ?? [],
      roads,
      crosswalks: o.crosswalks ?? [],
    }),
  );
}
