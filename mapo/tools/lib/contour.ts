// 격자(0/1)의 채운 칸 경계를 칸 변 그대로 고리로 따라가고, 계단을 더글러스-포이커로 줄인다.
// 바깥 고리는 넓이(ringArea)가 양수, 구멍은 음수다.

/** 짝홀 규칙으로 고리들(격자 좌표 [x, z, ...])을 칸 가운데 기준으로 칠한다 */
export function fillRings(grid: Uint8Array, n: number, rings: ArrayLike<number>[], value: number): void {
  let z0 = Infinity;
  let z1 = -Infinity;
  for (const r of rings)
    for (let k = 1; k < r.length; k += 2) {
      z0 = Math.min(z0, r[k]);
      z1 = Math.max(z1, r[k]);
    }
  const xs: number[] = [];
  for (let j = Math.max(0, Math.floor(z0)); j <= Math.min(n - 1, Math.ceil(z1)); j++) {
    const zc = j + 0.5;
    xs.length = 0;
    for (const r of rings)
      for (let i = 0, m = r.length - 2; i < r.length; m = i, i += 2) {
        const az = r[m + 1];
        const bz = r[i + 1];
        if (az <= zc === bz <= zc) continue;
        xs.push(r[m] + ((zc - az) / (bz - az)) * (r[i] - r[m]));
      }
    xs.sort((a, b) => a - b);
    for (let q = 0; q + 1 < xs.length; q += 2) {
      const a = Math.max(0, Math.ceil(xs[q] - 0.5));
      const b = Math.min(n - 1, Math.floor(xs[q + 1] - 0.5));
      if (b >= a) grid.fill(value, j * n + a, j * n + b + 1);
    }
  }
}

/** 채운 칸(값 ≠ 0) 경계 고리들. 격자 꼭짓점 좌표 [x, z, ...] */
export function traceLoops(grid: Uint8Array, n: number): number[][] {
  const at = (i: number, j: number) => i >= 0 && j >= 0 && i < n && j < n && grid[j * n + i] !== 0;
  const V = n + 1;
  // 꼭짓점마다 나가는 변(방향 0 동 1 남 2 서 3 북) 비트
  const out = new Uint8Array(V * V);
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      if (!grid[j * n + i]) continue;
      // 채운 칸이 왼쪽에 오도록: 위 변은 서쪽으로, 오른쪽 변은 북쪽으로, 아래 변은 동쪽으로, 왼쪽 변은 남쪽으로
      if (!at(i, j - 1)) out[j * V + i + 1] |= 4; // (i+1, j) → (i, j) 서
      if (!at(i + 1, j)) out[(j + 1) * V + i + 1] |= 8; // (i+1, j+1) → (i+1, j) 북
      if (!at(i, j + 1)) out[(j + 1) * V + i] |= 1; // (i, j+1) → (i+1, j+1) 동
      if (!at(i - 1, j)) out[j * V + i] |= 2; // (i, j) → (i, j+1) 남
    }
  const DX = [1, 0, -1, 0];
  const DZ = [0, 1, 0, -1];
  const loops: number[][] = [];
  for (let v0 = 0; v0 < out.length; v0++) {
    while (out[v0]) {
      const loop: number[] = [];
      let v = v0;
      let dir = Math.log2(out[v0] & -out[v0]);
      for (let guard = 0; guard < 4e7; guard++) {
        const x = v % V;
        const z = (v - x) / V;
        loop.push(x, z);
        out[v] &= ~(1 << dir);
        const nv = v + DX[dir] + DZ[dir] * V;
        if (nv === v0 && !out[nv]) break;
        // 갈림(대각으로 맞닿은 칸)에서는 왼쪽으로 먼저 꺾는다
        const opts = [(dir + 3) % 4, dir, (dir + 1) % 4];
        const next = opts.find((d) => out[nv] & (1 << d));
        v = nv;
        if (next === undefined) break;
        dir = next;
      }
      // 바깥 고리 넓이가 양수가 되도록 뒤집는다
      const rev: number[] = [];
      for (let k = loop.length - 2; k >= 0; k -= 2) rev.push(loop[k], loop[k + 1]);
      loops.push(rev);
    }
  }
  return loops;
}

/** 닫힌 고리 [x, z, ...]를 허용 오차 tol 안에서 줄인다(더글러스-포이커, 고리를 두 점에서 갈라 둘 다 줄인다) */
export function simplifyLoop(p: number[], tol: number): number[] {
  const n = p.length / 2;
  if (n <= 4) return p;
  // 첫 점에서 가장 먼 점으로 나눈다
  let far = 0;
  let best = -1;
  for (let i = 1; i < n; i++) {
    const d = Math.hypot(p[i * 2] - p[0], p[i * 2 + 1] - p[1]);
    if (d > best) (best = d), (far = i);
  }
  const keep = new Uint8Array(n);
  keep[0] = keep[far] = 1;
  const dp = (a: number, b: number) => {
    const stack: [number, number][] = [[a, b]];
    while (stack.length) {
      const [s, e] = stack.pop()!;
      const ax = p[(s % n) * 2];
      const az = p[(s % n) * 2 + 1];
      const bx = p[(e % n) * 2];
      const bz = p[(e % n) * 2 + 1];
      const L = Math.hypot(bx - ax, bz - az) || 1;
      let m = -1;
      let md = tol;
      for (let i = s + 1; i < e; i++) {
        const x = p[(i % n) * 2];
        const z = p[(i % n) * 2 + 1];
        const d = Math.abs((bx - ax) * (az - z) - (ax - x) * (bz - az)) / L;
        if (d > md) (md = d), (m = i);
      }
      if (m >= 0) {
        keep[m % n] = 1;
        stack.push([s, m], [m, e]);
      }
    }
  };
  dp(0, far);
  dp(far, n);
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(p[i * 2], p[i * 2 + 1]);
  return out;
}

export function ringArea(p: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0, m = p.length - 2; i < p.length; m = i, i += 2) s += p[m] * p[i + 1] - p[i] * p[m + 1];
  return s / 2;
}
