// 횡단보도 줄무늬를 그린 찻길 면 경계까지 잇는다(재작업 W57, 설계 문서 59.2 '모양은 정본, 종류·자리는 서울시').
// 서울시 횡단보도 면(board.json 의 crosswalks rings, 2026 자료에 없는 2021 면은 뺀 것)이 정하는 것은 자리·방향·폭이고, 건너는 길이는 그린 찻길 면(surface.json g)이 정한다.
// 면마다 폭 방향으로 0.25m 간격 줄을 그어 그 줄이 면을 지나는 구간을 구하고, 면 끝이 찻길 면 위에서 끝나면 찻길 면이 끝나는 자리(연석·섬·분리대 가장자리)까지
// 건너는 방향으로 늘인다(한쪽 MAX m 까지, 끝은 0.05m 안으로 찾는다). 늘인 곳이 없는 면은 서울시 모양 그대로 둔다.
// 결과는 그리기 전용이다: 차·사람 시뮬레이션은 board.json 의 서울시 면을 그대로 읽는다(정지 자리·횡단보도 판정·걷는 그물). marks.json 의 x 에 넣는다.
import type { Board } from '../../src/data/board.ts';
import { groundQuery } from '../../src/data/offroad.ts';
import { tileRings } from '../../src/data/surface.ts';

/** 한쪽으로 늘이는 가장 긴 길이(m): 이보다 길게 찻길이 이어지면(교차로 안·길을 따라 이어지는 찻길) 늘이지 않는다 */
const MAX = 8;
const STEP = 0.25;

/** 꺾은 고리를 (u, v) 틀로: u 건너는 방향, v 폭 방향 */
function toUV(r: Float32Array, cx: number, cz: number, ux: number, uz: number): number[] {
  const out: number[] = [];
  for (let k = 0; k < r.length; k += 2) {
    const [dx, dz] = [r[k] - cx, r[k + 1] - cz];
    out.push(dx * ux + dz * uz, -dx * uz + dz * ux);
  }
  return out;
}

/** v = c 줄이 고리를 지나는 u 구간 [가장 작은 u, 가장 큰 u](없으면 null) */
function spanAt(uv: number[], c: number): [number, number] | null {
  let lo = Infinity;
  let hi = -Infinity;
  for (let a = 0, b = uv.length - 2; a < uv.length; b = a, a += 2) {
    const [ua, va, ub, vb] = [uv[a], uv[a + 1], uv[b], uv[b + 1]];
    if (va > c === vb > c) continue;
    const u = ua + ((c - va) / (vb - va)) * (ub - ua);
    lo = Math.min(lo, u);
    hi = Math.max(hi, u);
  }
  return lo < hi ? [lo, hi] : null;
}

export interface CrossingFaces {
  /** marks.json x: 면마다 [횡단보도 번호, 점 수, 첫 점 x, z, 뒤 점마다 차이 x, z](dm) */
  x: number[][];
  /** 늘인 면 수, 늘인 길이 합(m) */
  grown: number;
  added: number;
  log: string;
}

/** 서울시 횡단보도 면을 그린 찻길 면(g 칸 층) 경계까지 늘인 그리기용 면 */
export function crossingFaces(board: Board, ground: ArrayLike<number>): CrossingFaces {
  const q = groundQuery(tileRings(ground));
  const dm = (v: number) => Math.round(v * 10);
  const x: number[][] = [];
  let grown = 0;
  let added = 0;
  // 다른 횡단보도 면(같은 횡단보도의 다른 단 포함) 안으로는 늘이지 않는다: 겹쳐 그리면 반투명 줄무늬가 진해진다
  const G = 20;
  const grid = new Map<number, Float32Array[]>();
  for (const c of board.crosswalks)
    for (const r of c.rings) {
      let [x0, z0, x1, z1] = [Infinity, Infinity, -Infinity, -Infinity];
      for (let k = 0; k < r.length; k += 2) (x0 = Math.min(x0, r[k])), (x1 = Math.max(x1, r[k])), (z0 = Math.min(z0, r[k + 1])), (z1 = Math.max(z1, r[k + 1]));
      for (let gx = Math.floor(x0 / G); gx <= Math.floor(x1 / G); gx++)
        for (let gz = Math.floor(z0 / G); gz <= Math.floor(z1 / G); gz++) (grid.get(gx * 100003 + gz) ?? grid.set(gx * 100003 + gz, []).get(gx * 100003 + gz)!).push(r);
    }
  const inRing = (r: Float32Array, px: number, pz: number) => {
    let c = false;
    for (let a = 0, b = r.length - 2; a < r.length; b = a, a += 2) if (r[a + 1] > pz !== r[b + 1] > pz && px < ((r[b] - r[a]) * (pz - r[a + 1])) / (r[b + 1] - r[a + 1]) + r[a]) c = !c;
    return c;
  };
  /** 면마다 차례(두 면 사이 빈 찻길은 차례가 앞선 면만 늘여 채운다: 둘 다 늘이면 겹쳐 그린 줄무늬가 진해진다) */
  const order = new Map<Float32Array, number>();
  /** 면이 속한 횡단보도의 건너는 방향 */
  const axis = new Map<Float32Array, [number, number]>();
  for (const c of board.crosswalks) for (const r of c.rings) order.set(r, order.size), axis.set(r, [c.ux, c.uz]);
  /** (px, pz)를 덮는 다른 면의 차례(없으면 −1). 건너는 방향이 나란하지 않은(37° 넘게 비낀) 면이면 −3: 교차로 모서리에서 만나는 다른 횡단보도라 그쪽으로는 늘이지 않는다 */
  const otherAt = (own: Float32Array, px: number, pz: number) => {
    const [ux, uz] = axis.get(own)!;
    for (const r of grid.get(Math.floor(px / G) * 100003 + Math.floor(pz / G)) ?? []) {
      if (r === own || !inRing(r, px, pz)) continue;
      const [vx, vz] = axis.get(r)!;
      return Math.abs(ux * vx + uz * vz) > 0.8 ? order.get(r)! : -3;
    }
    return -1;
  };
  board.crosswalks.forEach((c, i) => {
    const faces: number[][][] = [];
    let any = false;
    for (const r of c.rings) {
      const uv = toUV(r, c.x, c.z, c.ux, c.uz);
      let v0 = Infinity;
      let v1 = -Infinity;
      for (let k = 1; k < uv.length; k += 2) (v0 = Math.min(v0, uv[k])), (v1 = Math.max(v1, uv[k]));
      const at = (u: number, v: number): [number, number] => [c.x + c.ux * u - c.uz * v, c.z + c.uz * u + c.ux * v];
      const mine = order.get(r)!;
      /** 찻길이면 −2, 찻길 밖이면 −1, 비낀 다른 횡단보도 면이면 −3, 나란한 다른 면 안이면 그 면 차례 */
      const what = (u: number, v: number) => {
        const [px, pz] = at(u, v);
        if (!q.onCar(px, pz)) return -1;
        const o = otherAt(r, px, pz);
        return o === -1 ? -2 : o;
      };
      const car = (u: number, v: number) => what(u, v) === -2;
      /**
       * 면 끝 u0 에서 dir 쪽으로 찻길 면이 끝나는 자리(연석·섬·분리대, 또는 건너는 방향이 나란하고 차례가 뒤인 다른 횡단보도 면까지, MAX 안).
       * 끝 바로 밖이 찻길이 아니거나 MAX 안에서 끝나지 않으면 u0
       */
      const reach = (u0: number, v: number, dir: number): number => {
        if (!car(u0 + dir * 0.1, v)) return u0;
        let t = u0;
        while (Math.abs(t - u0) < MAX && car(t + dir * STEP, v)) t += dir * STEP;
        const end = what(t + dir * STEP, v);
        if (end === -2 || end === -3 || (end >= 0 && end < mine)) return u0;
        // t 는 찻길, t + STEP 는 찻길 밖: 0.05m 안으로 좁힌다
        let [a, b] = [t, t + dir * STEP];
        while (Math.abs(b - a) > 0.05) {
          const m = (a + b) / 2;
          if (car(m, v)) a = m;
          else b = m;
        }
        return a;
      };
      const n = Math.max(2, Math.ceil((v1 - v0) / STEP) + 1);
      const lo: [number, number][] = [];
      const hi: [number, number][] = [];
      const span: [number, number][] = [];
      for (let k = 0; k < n; k++) {
        // 양 끝 줄은 고리 안쪽 1cm 에서 잰다
        const v = k === 0 ? v0 + 0.01 : k === n - 1 ? v1 - 0.01 : v0 + ((v1 - v0) * k) / (n - 1);
        const s = spanAt(uv, v);
        if (!s) continue;
        span.push(s);
        lo.push([reach(s[0], v, -1), v]);
        hi.push([reach(s[1], v, 1), v]);
      }
      // 한쪽 끝에서 늘인 줄의 폭 합이 1m 가 안 되면 그 끝은 늘이지 않는다(폭 일부만 늘이면 가는 띠가 된다).
      // 폭의 반으로 정했을 때는 측량 연석에 맞춰 비스듬해진 찻길 가장자리에서 줄무늬 끝 옆 찻길이 0.5~1.5m 비었다(재작업 W65)
      const row = (v1 - v0) / Math.max(1, n - 1);
      for (const [end, side] of [[lo, 0], [hi, 1]] as const) {
        const grew = end.filter((q, k) => Math.abs(q[0] - span[k][side]) > 0.05).length;
        if (grew && grew * row < 1) end.forEach((q, k) => (q[0] = span[k][side]));
      }
      let longer = 0;
      for (let k = 0; k < span.length; k++) longer += span[k][0] - lo[k][0] + (hi[k][0] - span[k][1]);
      if (longer < 0.05 * n || lo.length < 2) {
        faces.push(Array.from({ length: r.length / 2 }, (_, k) => [r[k * 2], r[k * 2 + 1]]));
        continue;
      }
      any = true;
      grown++;
      added += longer / n;
      // 고리: 아래쪽(lo) 줄 끝을 v 오름차순, 위쪽(hi) 줄 끝을 v 내림차순. 0.02m 안 일직선 점은 뺀다
      const pts = [...lo, ...hi.reverse()].map(([u, v]) => at(u, v));
      const keep: [number, number][] = [];
      for (let k = 0; k < pts.length; k++) {
        const p = pts[(k + pts.length - 1) % pts.length];
        const m = pts[k];
        const nx = pts[(k + 1) % pts.length];
        const [ex, ez] = [nx[0] - p[0], nx[1] - p[1]];
        const L = Math.hypot(ex, ez) || 1;
        if (Math.abs((m[0] - p[0]) * ez - (m[1] - p[1]) * ex) / L > 0.02) keep.push(m);
      }
      faces.push(keep);
    }
    // 늘인 면이 하나라도 있는 횡단보도는 면을 모두 적는다(앱은 x 에 든 횡단보도는 x 의 면만, 나머지는 서울시 면을 그린다)
    if (!any) return;
    for (const f of faces) {
      const out = [i, f.length];
      let [px, pz] = [0, 0];
      for (const [fx, fz] of f) {
        const [ix, iz] = [dm(fx), dm(fz)];
        out.push(ix - px, iz - pz);
        [px, pz] = [ix, iz];
      }
      x.push(out);
    }
  });
  return { x, grown, added, log: `횡단보도 면 찻길 면 경계까지 늘임: ${grown}면(늘인 길이 평균 합 ${added.toFixed(0)}m)` };
}
