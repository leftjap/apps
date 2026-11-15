// 지하철 출구 자리 맞추기.
// OSM 출구 점은 계단 입구 한 점뿐이고, 굽기는 방향을 가장 가까운 찻길과 나란히 어림한다. 그런데 국토교통부 GIS건물통합정보·OSM 에는
// 출구 지붕(캐노피) 자체가 17~131㎡ 의 작은 건물로 들어 있어 그 자리에 높이 4~17m 의 회색 상자가 출구 모형과 겹쳐 섰다.
//  - 출구 점에 붙은 작은 건물이 있으면 그 외곽선을 출구 지붕으로 보고, 외곽선의 가장 작은 둘레 직사각형으로 출구 가운데·방향·길이를 정한 뒤 그 건물은 지운다.
//  - 그래도 모형 자리가 찻길이나 다른 건물에 걸리면 걸리지 않는 가장 가까운 자리로 옮긴다(계단과 수직으로 10m, 계단 방향으로 6m 안).
//    홍대입구 7번처럼 큰 건물 벽에 붙은 출구는 건물 밖으로, 가좌 2번처럼 그려진 찻길이 실제보다 넓은 곳은 보도 쪽으로 나간다.
// 출구 점(e.x, e.z)은 계속 계단 입구 자리이므로 사람이 드나드는 자리도 함께 맞춰진다.
// 건물 연결형 출구(exits.ts attached: 홍대입구 5·7번, 망원 2번)는 자리를 맞춘 뒤 모형 자리를 덮는 건물(출구보다 높은 6m 넘는 것) 외곽선에
// 출구 크기만큼 홈을 내 위에서 보이게 한다(notchOut). GIS 외곽선이 출구 지붕까지 대지로 덮어 홍대입구 7번이 통째로 가려졌다.
import { curbAt, type Board, type Exit, type Road } from './board.ts';
import { exitLook, type ExitLook } from './exits.ts';

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

/** 출구 모형(길이 9m·안쪽 폭 3m 기준)이 차지하는 범위: 길이 방향은 입구 쪽 폴사인(−6.4)부터 지붕 끝(4.75)까지, 폭 방향은 지붕 반폭 2.05 */
const SPAN = { x0: -6.4, x1: 4.75, z: 2.05 };

/** 출구 모형 외곽을 0.5m 안쪽 간격으로 따라 찍은 점 [x, z]. 렌더러와 같은 배율(길이 l/9 또는 외곽선 길이/9.5, 폭 max(2, w)/3) */
export function exitOutline(e: Exit, look: ExitLook): [number, number][] {
  const { cx, cz } = exitBody(e, look.l);
  const sx = e.len ? e.len / 9.5 : look.l / 9;
  const sz = Math.max(2, look.w) / 3;
  const [ux, uz] = [Math.cos(e.yaw), Math.sin(e.yaw)];
  const at = (a: number, b: number): [number, number] => [cx + ux * a - uz * b, cz + uz * a + ux * b];
  const [a0, a1, hz] = [SPAN.x0 * sx, SPAN.x1 * sx, SPAN.z * sz];
  const out: [number, number][] = [];
  const na = Math.ceil((a1 - a0) / 0.5);
  const nb = Math.ceil((2 * hz) / 0.5);
  for (let k = 0; k <= na; k++) out.push(at(a0 + ((a1 - a0) * k) / na, -hz), at(a0 + ((a1 - a0) * k) / na, hz));
  for (let k = 1; k < nb; k++) out.push(at(a0, -hz + (2 * hz * k) / nb), at(a1, -hz + (2 * hz * k) / nb));
  return out;
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
export function onRoad(x: number, z: number, roads: Road[]) {
  for (const r of roads) {
    if (r.cls > 5 || r.bridge) continue;
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

/**
 * 외곽선 p(넓이가 양수인 방향)에서 직사각형 rect(네 꼭짓점, 사방으로 0.3m 넓힌다)를 뺀다. 외곽선이 직사각형에 한 번 들어갔다 나오는 경우만:
 * 들어간 점과 나온 점 사이의 외곽선 꼭짓점(직사각형 안)을 빼고, 외곽선 안에 드는 직사각형 꼭짓점으로 두 점을 잇는다.
 * 겹치지 않거나 여러 번 드나들면 null
 */
export function notchOut(p: Float32Array, rect: [number, number][]): Float32Array | null {
  const n = p.length / 2;
  // 사방으로 0.3m 넓힌 직사각형
  const R = rect.map(([x, z], k) => {
    const [ax, az] = [rect[(k + 1) % 4][0] - x, rect[(k + 1) % 4][1] - z];
    const [bx, bz] = [rect[(k + 3) % 4][0] - x, rect[(k + 3) % 4][1] - z];
    const [la, lb] = [Math.hypot(ax, az) || 1, Math.hypot(bx, bz) || 1];
    return [x - (ax / la + bx / lb) * 0.3, z - (az / la + bz / lb) * 0.3];
  });
  const R4 = new Float32Array(R.flat());
  const inR = (x: number, z: number) => inPoly(x, z, R4);
  const P = Array.from({ length: n }, (_, k): [number, number] => [p[k * 2], p[k * 2 + 1]]);
  const start = P.findIndex(([x, z]) => !inR(x, z));
  if (start < 0) return null;
  /** 선분 a→b 와 직사각형 변의 교점: [a→b 비율, 직사각형 변 번호, x, z] */
  const hits = (a: number[], b: number[]) => {
    const out: [number, number, number, number][] = [];
    for (let k = 0; k < 4; k++) {
      const [c, d] = [R[k], R[(k + 1) % 4]];
      const den = (b[0] - a[0]) * (d[1] - c[1]) - (b[1] - a[1]) * (d[0] - c[0]);
      if (Math.abs(den) < 1e-12) continue;
      const t = ((c[0] - a[0]) * (d[1] - c[1]) - (c[1] - a[1]) * (d[0] - c[0])) / den;
      const u = ((c[0] - a[0]) * (b[1] - a[1]) - (c[1] - a[1]) * (b[0] - a[0])) / den;
      if (t > 0 && t <= 1 && u >= 0 && u <= 1) out.push([t, k, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
    return out.sort((x, y) => x[0] - y[0]);
  };
  const keep: [number, number][] = [];
  let enter: [number, number, number] | null = null; // [변 번호, x, z]
  let exit: [number, number, number] | null = null;
  let at = -1; // keep 에서 들어간 점이 들어갈 자리
  let inside = false;
  for (let s = 0; s < n; s++) {
    const a = P[(start + s) % n];
    const b = P[(start + s + 1) % n];
    if (!inside) keep.push(a);
    for (const [, k, x, z] of hits(a, b)) {
      if (!inside) {
        if (enter) return null; // 두 번 들어간다
        enter = [k, x, z];
        at = keep.length;
      } else exit = [k, x, z];
      inside = !inside;
    }
  }
  if (!enter || !exit || inside) return null;
  // 들어간 변에서 나온 변까지 직사각형 꼭짓점을 두 방향으로 따라가 외곽선 안에 드는 쪽을 쓴다
  const path = (dir: number) => {
    const out: [number, number][] = [];
    let k = enter![0];
    while (k !== exit![0]) {
      const c = dir > 0 ? (k + 1) % 4 : k;
      out.push(R[c] as [number, number]);
      k = (k + dir + 4) % 4;
    }
    return out;
  };
  const fw = path(1);
  const bw = path(-1);
  const ok = (q: [number, number][]) => q.every(([x, z]) => inPoly(x, z, p));
  const corners = ok(fw) ? fw : ok(bw) ? bw : null;
  if (!corners) return null;
  const pts: [number, number][] = [...keep.slice(0, at), [enter[1], enter[2]], ...corners, [exit[1], exit[2]], ...keep.slice(at)];
  const out = new Float32Array(pts.flat());
  let s2 = 0;
  for (let i2 = 0, j2 = out.length - 2; i2 < out.length; j2 = i2, i2 += 2) s2 += out[j2] * out[i2 + 1] - out[i2] * out[j2 + 1];
  if (s2 <= 0) return null;
  return out;
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
    // 걸림 정도: 모형 외곽이 한 점이라도 찻길에 들면 1 을 더하고, 모형 안쪽이 건물에 든 비율을 더한다
    const clash = (ox: number, oz: number) => {
      const moved = { ...e, x: e.x + ox, z: e.z + oz };
      if (exitOutline(moved, look).some(([x, z]) => onRoad(x, z, roads))) return 1 + CLASH;
      const { cx, cz, len } = exitBody(moved, look.l);
      let n = 0;
      let hit = 0;
      for (let i = -0.4; i <= 0.41; i += 0.1)
        for (let j = -0.4; j <= 0.41; j += 0.2) {
          n++;
          const x = cx + ux * i * len - uz * j * W;
          const z = cz + uz * i * len + ux * j * W;
          if (blds.some((b) => inPoly(x, z, b.pts))) hit++;
        }
      return hit / n;
    };
    // 건물에 붙은 출구는 건물 겹침을 따지지 않고 찻길만 피한다
    const ok = look.attached ? 1 : CLASH;
    const here = clash(0, 0);
    if (here <= ok) continue;
    // 걸리지 않는 자리 가운데 가장 가까운 곳. 없으면(홍대입구 7번처럼 큰 건물과 찻길 사이 좁은 보도) 가장 덜 걸리는 곳
    let best: [number, number, number, number] = [0, 0, 0, here];
    for (let a = -6; a <= 6; a += 1.5)
      for (let p = -10; p <= 10; p += 0.5) {
        const cost = Math.abs(p) + Math.abs(a) * 1.5;
        const [ox, oz] = [ux * a - uz * p, uz * a + ux * p];
        const c = Math.max(ok, clash(ox, oz));
        if (c < best[3] || (c === best[3] && cost < best[2])) best = [ox, oz, cost, c];
      }
    e.x += best[0];
    e.z += best[1];
  }

  // 건물 연결형 출구: 모형 자리를 덮는 6m 넘는 건물에 홈을 낸다
  for (const e of board.exits) {
    if (!e.ref) continue;
    const look = exitLook(e.st, e.ref);
    if (!look.attached) continue;
    const { cx, cz } = exitBody(e, look.l);
    const sx = e.len ? e.len / 9.5 : look.l / 9;
    const hz = SPAN.z * (Math.max(2, look.w) / 3);
    const [ux, uz] = [Math.cos(e.yaw), Math.sin(e.yaw)];
    const at = (a: number, b: number): [number, number] => [cx + ux * a - uz * b, cz + uz * a + ux * b];
    const rect = [at(SPAN.x0 * sx, -hz), at(SPAN.x1 * sx, -hz), at(SPAN.x1 * sx, hz), at(SPAN.x0 * sx, hz)];
    for (const b of board.buildings) {
      if (b.h <= 6 || Math.abs(b.pts[0] - cx) > 150 || Math.abs(b.pts[1] - cz) > 150) continue;
      const p = notchOut(b.pts, rect);
      if (p) b.pts = p;
    }
  }
}
