// 카메라 하한(재작업 W5-⑨): 가까이 당기면 사람 눈높이까지 내려가되 땅 밑·건물 속으로는 들어가지 않는다.
// 예전 값(거리 70m 아래·기울기 80도 위·높이 25m 아래 금지)으로는 1층 가게·거리 소품·시장 통로 안을 볼 수 없었다.
import { inPoly } from './buildings.ts';

export const CAM = {
  /** 가장 가까운 보는 거리(m) */
  minDist: 18,
  /** 카메라가 땅 위로 지키는 높이(m), 사람 눈높이 조금 위 */
  eye: 2,
  /** 건물 벽·지붕에서 띄우는 거리(m) */
  gap: 1,
};

const FAR_TILT = (80 * Math.PI) / 180;
const NEAR_TILT = (87 * Math.PI) / 180;
/** 이 거리(m) 안에서는 NEAR_TILT 까지, FAR_D 부터는 예전처럼 FAR_TILT 까지 눕힌다 */
const NEAR_D = 40;
const FAR_D = 200;

/** 보는 거리 d 에서 수직으로부터 기울 수 있는 가장 큰 각(라디안) */
export function maxPolar(d: number): number {
  const t = Math.min(1, Math.max(0, (d - NEAR_D) / (FAR_D - NEAR_D)));
  return NEAR_TILT + (FAR_TILT - NEAR_TILT) * t;
}

/** 보는 거리 d 에서 수직으로부터 기울어야 하는 가장 작은 각(라디안). 휠로 25m 안까지 당기면 74도 넘게 눕혀 눈높이(5m 아래)가 되고, 60m 밖(고양이 따라가기 거리 60m 포함)에서는 내려다보기를 막지 않는다 */
export function minPolar(d: number): number {
  const t = Math.min(1, Math.max(0, (60 - d) / (60 - 25)));
  return ((74 * Math.PI) / 180) * t;
}

/** 보는 거리에 맞춘 가까운 면·먼 면. 멀리서는 예전 값(20m·40km)이고, 가까이서는 발밑 보도까지 그린다 */
export function clipPlanes(d: number): { near: number; far: number } {
  return { near: Math.min(20, Math.max(0.3, d * 0.015)), far: 40000 };
}

type Solid = { h: number; minH?: number; pts: Float32Array; hidden?: boolean };
const CELL = 32;

/** 건물 덩어리를 32m 칸에 나눠 둔다. inside 는 점이 든 건물 번호(벽·지붕에서 gap 만큼 넓혀서), 없으면 -1 */
export function makeSolids(list: Solid[]) {
  const cells = new Map<number, number[]>();
  const key = (cx: number, cz: number) => (cx + 2048) * 4096 + (cz + 2048);
  list.forEach((b, i) => {
    if (b.hidden || b.h <= 0) return;
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (let k = 0; k < b.pts.length; k += 2) {
      x0 = Math.min(x0, b.pts[k]), x1 = Math.max(x1, b.pts[k]);
      z0 = Math.min(z0, b.pts[k + 1]), z1 = Math.max(z1, b.pts[k + 1]);
    }
    for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++)
      for (let cz = Math.floor(z0 / CELL); cz <= Math.floor(z1 / CELL); cz++) {
        const c = cells.get(key(cx, cz));
        if (c) c.push(i);
        else cells.set(key(cx, cz), [i]);
      }
  });
  const inside = (x: number, y: number, z: number): number => {
    for (const i of cells.get(key(Math.floor(x / CELL), Math.floor(z / CELL))) ?? []) {
      const b = list[i];
      if (y < (b.minH ?? 0) - CAM.gap || y > b.h + CAM.gap) continue;
      if (inPoly(b.pts, x, z)) return i;
    }
    return -1;
  };
  return { list, inside };
}
export type Solids = ReturnType<typeof makeSolids>;

/** 이 보는 거리(m) 안에서는 보는 지점과 카메라 사이를 가린 건물 앞으로 카메라를 당긴다 */
export const OCCLUDE_D = 150;

/** 카메라 자리 p 를 땅 위·건물 밖으로 옮긴다. (tx, tz) 는 땅 위 보는 지점 */
export function keepOut(s: Solids, tx: number, tz: number, p: { x: number; y: number; z: number }): void {
  if (p.y < CAM.eye) p.y = CAM.eye;
  // 지붕 위를 보고 있다: 카메라가 건물 속이면 지붕 위로 올린다
  const under = s.inside(tx, 0, tz);
  if (under >= 0) {
    for (let round = 0; round < 4; round++) {
      const i = s.inside(p.x, p.y, p.z);
      if (i < 0) return;
      p.y = s.list[i].h + CAM.gap + 0.5;
    }
    return;
  }
  const dx = p.x - tx, dy = p.y, dz = p.z - tz;
  const L = Math.hypot(dx, dy, dz);
  // 멀리서 볼 때는 카메라가 건물 속일 때만 고친다(가린 건물 때문에 당기면 넓게 볼 때 화면이 튄다)
  if (L > OCCLUDE_D && s.inside(p.x, p.y, p.z) < 0) return;
  // 보는 지점에서 카메라 쪽으로 0.5m 씩 가며 처음 건물에 닿는 자리 gap 앞에 둔다
  const n = Math.ceil(L / 0.5);
  for (let k = 1; k <= n; k++) {
    const t = k / n;
    if (s.inside(tx + dx * t, dy * t, tz + dz * t) < 0) continue;
    const u = Math.max(0, t - CAM.gap / L);
    p.x = tx + dx * u, p.z = tz + dz * u, p.y = Math.max(CAM.eye, dy * u);
    return;
  }
}
