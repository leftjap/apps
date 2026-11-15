// 지하철 출구 자리 맞추기.
// OSM 출구 점은 계단 입구 한 점뿐이고, 굽기는 방향을 가장 가까운 찻길과 나란히 어림한다. 그런데 국토교통부 GIS건물통합정보·OSM 에는
// 출구 지붕(캐노피) 자체가 17~131㎡ 의 작은 건물로 들어 있어 그 자리에 높이 4~17m 의 회색 상자가 출구 모형과 겹쳐 섰다.
//  - 출구 점에 붙은 작은 건물이 있으면 그 외곽선을 출구 지붕으로 보고, 외곽선의 가장 작은 둘레 직사각형으로 출구 가운데·방향·길이를 정한 뒤 그 건물은 지운다.
//  - 그래도 모형 자리가 찻길이나 다른 건물에 걸리면 걸리지 않는 가장 가까운 자리로 옮긴다(계단과 수직으로 10m, 계단 방향으로 6m 안).
//    홍대입구 7번처럼 큰 건물 벽에 붙은 출구는 건물 밖으로, 가좌 2번처럼 그려진 찻길이 실제보다 넓은 곳은 보도 쪽으로 나간다.
// 출구 점(e.x, e.z)은 계속 계단 입구 자리이므로 사람이 드나드는 자리도 함께 맞춰진다.
import { curbAt, type Board, type Exit, type Road } from './board.ts';
import { exitLook } from './exits.ts';

/** 출구 지붕으로 볼 건물: 넓이(㎡)와 높이(m) 한도, 출구 점에서 떨어진 거리(m) 한도 */
const CANOPY_MIN = 12;
const CANOPY_MAX = 180;
const CANOPY_H = 20;
const NEAR = 5;
/** 모형 자리의 이 비율 넘게 찻길·건물에 걸리면 옮긴다 */
const CLASH = 0.1;

/** 출구 모형 몸체: 가운데와 길이(m). 외곽선으로 맞춘 출구는 입구가 몸체 한쪽 끝, 아니면 모양별 길이로 어림한 자리 */
export function exitBody(e: Exit, l: number): { cx: number; cz: number; len: number } {
  const len = e.len ?? l;
  const back = e.len ? len / 2 : (3.5 * len) / 9;
  return { cx: e.x + Math.cos(e.yaw) * back, cz: e.z + Math.sin(e.yaw) * back, len };
}

const area = (p: Float32Array) => {
  let s = 0;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) s += p[j] * p[i + 1] - p[i] * p[j + 1];
  return Math.abs(s) / 2;
};
const inPoly = (x: number, z: number, p: Float32Array) => {
  let c = false;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    if (p[i + 1] > z !== p[j + 1] > z && x < ((p[j] - p[i]) * (z - p[i + 1])) / (p[j + 1] - p[i + 1]) + p[i]) c = !c;
  }
  return c;
};
/** 점에서 외곽선까지 거리(안이면 0) */
const polyDist = (x: number, z: number, p: Float32Array) => {
  if (inPoly(x, z, p)) return 0;
  let m = Infinity;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    const [ax, az, dx, dz] = [p[j], p[j + 1], p[i] - p[j], p[i + 1] - p[j + 1]];
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
    m = Math.min(m, Math.hypot(ax + dx * t - x, az + dz * t - z));
  }
  return m;
};

/** 외곽선을 덮는 가장 작은 직사각형: 가운데, 긴 쪽 방향 단위벡터, 긴 쪽·짧은 쪽 길이 */
function minRect(p: Float32Array) {
  let best = { cx: 0, cz: 0, ux: 1, uz: 0, l: 0, w: 0, a: Infinity };
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    const L = Math.hypot(p[i] - p[j], p[i + 1] - p[j + 1]);
    if (L < 0.3) continue;
    const [ux, uz] = [(p[i] - p[j]) / L, (p[i + 1] - p[j + 1]) / L];
    let [a0, a1, b0, b1] = [Infinity, -Infinity, Infinity, -Infinity];
    for (let k = 0; k < p.length; k += 2) {
      const a = p[k] * ux + p[k + 1] * uz;
      const b = -p[k] * uz + p[k + 1] * ux;
      [a0, a1, b0, b1] = [Math.min(a0, a), Math.max(a1, a), Math.min(b0, b), Math.max(b1, b)];
    }
    const ar = (a1 - a0) * (b1 - b0);
    if (ar < best.a) {
      const [am, bm] = [(a0 + a1) / 2, (b0 + b1) / 2];
      const [cx, cz] = [am * ux - bm * uz, am * uz + bm * ux];
      best = a1 - a0 >= b1 - b0 ? { cx, cz, ux, uz, l: a1 - a0, w: b1 - b0, a: ar } : { cx, cz, ux: -uz, uz: ux, l: b1 - b0, w: a1 - a0, a: ar };
    }
  }
  return best;
}

/** 점이 찻길(보행 전용·다리 제외) 위인가 */
function onRoad(x: number, z: number, roads: Road[]) {
  for (const r of roads) {
    const p = r.p;
    let s = 0;
    for (let k = 0; k + 3 < p.length; k += 3) {
      const [ax, az, dx, dz] = [p[k], p[k + 2], p[k + 3] - p[k], p[k + 5] - p[k + 2]];
      const L = Math.hypot(dx, dz);
      if (L > 1e-3) {
        const t = ((x - ax) * dx + (z - az) * dz) / L;
        const c = ((x - ax) * -dz + (z - az) * dx) / L;
        if (t >= 0 && t <= L && Math.abs(c) < curbAt(r, s + t, -(Math.sign(c) || 1))) return true;
      }
      s += L;
    }
  }
  return false;
}

export function fitExits(board: Board): void {
  const gone = new Set<number>();
  const areas = board.buildings.map((b) => area(b.pts));
  for (const e of board.exits) {
    if (!e.ref) continue;
    // 출구 지붕 외곽선
    let pick = -1;
    let pd = NEAR;
    board.buildings.forEach((b, i) => {
      if (gone.has(i) || areas[i] < CANOPY_MIN || areas[i] > CANOPY_MAX || b.h > CANOPY_H) return;
      if (Math.abs(b.pts[0] - e.x) > 40 || Math.abs(b.pts[1] - e.z) > 40) return;
      const d = polyDist(e.x, e.z, b.pts);
      if (d <= pd) [pick, pd] = [i, d];
    });
    if (pick < 0) continue;
    const r = minRect(board.buildings[pick].pts);
    let [ux, uz] = [r.ux, r.uz];
    // 정사각형에 가까우면 긴 쪽이 믿을 만하지 않으므로 원래 방향에 가까운 축
    if (r.l < r.w * 1.3 && Number.isFinite(e.yaw) && Math.abs(Math.cos(e.yaw) * -uz + Math.sin(e.yaw) * ux) > Math.abs(Math.cos(e.yaw) * ux + Math.sin(e.yaw) * uz)) [ux, uz] = [-uz, ux];
    const len = Math.abs(ux - r.ux) < 1e-9 ? r.l : r.w;
    // 출구 점이 있는 끝이 입구, 반대쪽이 내려가는 쪽. 점이 가운데쯤이면 원래 방향을 따른다
    const proj = (e.x - r.cx) * ux + (e.z - r.cz) * uz;
    const sign = Math.abs(proj) > 1 ? -Math.sign(proj) : Math.sign(Math.cos(e.yaw) * ux + Math.sin(e.yaw) * uz) || 1;
    [ux, uz] = [ux * sign, uz * sign];
    e.yaw = Math.atan2(uz, ux);
    e.len = len;
    e.x = r.cx - (ux * len) / 2;
    e.z = r.cz - (uz * len) / 2;
    gone.add(pick);
  }
  if (gone.size) board.buildings = board.buildings.filter((_, i) => !gone.has(i));

  // 남은 겹침 옮기기
  for (const e of board.exits) {
    if (!e.ref) continue;
    const look = exitLook(e.st, e.ref);
    // 출구에서 40m 안에 걸치는 찻길·건물(외곽 범위로 거른다)
    const near = (p: Float32Array, step: number) => {
      let [x0, z0, x1, z1] = [Infinity, Infinity, -Infinity, -Infinity];
      for (let k = 0; k < p.length; k += step) [x0, z0, x1, z1] = [Math.min(x0, p[k]), Math.min(z0, p[k + step - 1]), Math.max(x1, p[k]), Math.max(z1, p[k + step - 1])];
      return e.x > x0 - 40 && e.x < x1 + 40 && e.z > z0 - 40 && e.z < z1 + 40;
    };
    const roads = board.roads.filter((r) => r.cls <= 5 && !r.bridge && near(r.p, 3));
    const blds = board.buildings.filter((b) => near(b.pts, 2));
    const [ux, uz] = [Math.cos(e.yaw), Math.sin(e.yaw)];
    const W = Math.max(2, look.w) + 0.7;
    const clash = (ox: number, oz: number) => {
      const { cx, cz, len } = exitBody({ ...e, x: e.x + ox, z: e.z + oz }, look.l);
      let n = 0;
      let hit = 0;
      for (let i = -0.4; i <= 0.41; i += 0.1)
        for (let j = -0.4; j <= 0.41; j += 0.2) {
          n++;
          const x = cx + ux * i * len - uz * j * W;
          const z = cz + uz * i * len + ux * j * W;
          if (blds.some((b) => inPoly(x, z, b.pts)) || onRoad(x, z, roads)) hit++;
        }
      return hit / n;
    };
    const here = clash(0, 0);
    if (here <= CLASH) continue;
    // 걸리지 않는 자리 가운데 가장 가까운 곳. 없으면(홍대입구 7번처럼 큰 건물과 찻길 사이 좁은 보도) 가장 덜 걸리는 곳
    let best: [number, number, number, number] = [0, 0, 0, here];
    for (let a = -6; a <= 6; a += 1.5)
      for (let p = -10; p <= 10; p += 0.5) {
        const cost = Math.abs(p) + Math.abs(a) * 1.5;
        const [ox, oz] = [ux * a - uz * p, uz * a + ux * p];
        const c = Math.max(CLASH, clash(ox, oz));
        if (c < best[3] || (c === best[3] && cost < best[2])) best = [ox, oz, cost, c];
      }
    e.x += best[0];
    e.z += best[1];
  }
}
