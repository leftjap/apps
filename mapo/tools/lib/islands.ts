// 교차로 면 안의 섬: 연결로(우회전 전용로)와 본선 사이 삼각형처럼, 교차로 면 가운데 어느 찻길 띠(서울시 차선·연석선으로 읽은 폭)와
// 횡단보도 칠에도 덮이지 않고 면 바깥 테두리에 닿지 않는 곳을 섬 구멍으로 낸다. 모퉁이 호로 칠한 곳(면 테두리에 닿음)은 그대로 둔다.
import { fillRings, ringArea, simplifyLoop, traceLoops } from './contour.ts';

const CELL = 0.25;
const MIN_AREA = 6; // 이보다 작은 빈 곳은 띠 사이 틈으로 본다(m²)

/** faces 의 holes 에 섬 고리(바깥 고리와 반대 방향, m)를 더하고 더한 수를 돌려준다. cover 는 찻길 띠·횡단보도 칠 고리들 */
export function carveIslands(faces: { outer: ArrayLike<number>; holes: ArrayLike<number>[] }[], cover: ArrayLike<number>[]): number {
  const boxes = cover.map((r) => {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (let k = 0; k < r.length; k += 2) (x0 = Math.min(x0, r[k])), (x1 = Math.max(x1, r[k])), (z0 = Math.min(z0, r[k + 1])), (z1 = Math.max(z1, r[k + 1]));
    return [x0, z0, x1, z1];
  });
  let added = 0;
  for (const f of faces) {
    const o = f.outer;
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (let k = 0; k < o.length; k += 2) (x0 = Math.min(x0, o[k])), (x1 = Math.max(x1, o[k])), (z0 = Math.min(z0, o[k + 1])), (z1 = Math.max(z1, o[k + 1]));
    const ox = x0 - CELL * 2;
    const oz = z0 - CELL * 2;
    const n = Math.ceil(Math.max(x1 - x0, z1 - z0) / CELL) + 4;
    const g = (r: ArrayLike<number>) => Array.from(r, (v, k) => (k % 2 ? (v - oz) / CELL : (v - ox) / CELL));
    // 면(구멍 뺌)과, 거기서 찻길 띠·칠을 뺀 빈 곳
    const face = new Uint8Array(n * n);
    fillRings(face, n, [g(o), ...f.holes.map(g)], 1);
    const free = face.slice();
    cover.forEach((r, i) => {
      const [a, b, c, d] = boxes[i];
      if (c >= x0 && a <= x1 && d >= z0 && b <= z1) fillRings(free, n, [g(r)], 0);
    });
    // 빈 곳 덩어리마다: 면 밖과 맞닿으면(모퉁이 호 쪽) 버리고, 넓이와 두께(0.5m 깎아도 남는가)를 본다
    const seen = new Uint8Array(n * n);
    for (let start = 0; start < n * n; start++) {
      if (!free[start] || seen[start]) continue;
      const cells = [start];
      seen[start] = 1;
      let touch = false;
      for (let q = 0; q < cells.length; q++) {
        const i = cells[q];
        const x = i % n;
        const z = (i - x) / n;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const X = x + dx;
          const Z = z + dz;
          if (X < 0 || Z < 0 || X >= n || Z >= n || !face[Z * n + X]) {
            touch = true;
            continue;
          }
          const j = Z * n + X;
          if (free[j] && !seen[j]) (seen[j] = 1), cells.push(j);
        }
      }
      if (touch || cells.length * CELL * CELL < MIN_AREA) continue;
      const mine = new Uint8Array(n * n);
      for (const i of cells) mine[i] = 1;
      let core = cells;
      for (let pass = 0; pass < 2; pass++) {
        const keep = core.filter((i) => mine[i - 1] && mine[i + 1] && mine[i - n] && mine[i + n] && mine[i - n - 1] && mine[i - n + 1] && mine[i + n - 1] && mine[i + n + 1]);
        for (const i of core) mine[i] = 0;
        for (const i of keep) mine[i] = 1;
        core = keep;
      }
      if (core.length < 4) continue;
      const shape = new Uint8Array(n * n);
      for (const i of cells) shape[i] = 1;
      for (const loop of traceLoops(shape, n)) {
        if (ringArea(loop) <= 0) continue;
        const s = simplifyLoop(loop, 0.2 / CELL);
        const ring: number[] = [];
        for (let k = s.length - 2; k >= 0; k -= 2) ring.push(ox + s[k] * CELL, oz + s[k + 1] * CELL);
        f.holes.push(ring);
        added++;
      }
    }
  }
  return added;
}
