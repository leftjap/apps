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

/**
 * 변끼리 엇갈린 고리 p(세계 좌표 [x, z, ...])에서 회전수 부호가 sign 인 칸(cell m)만 칠해 그 경계 고리들을 돌려준다.
 * 가장자리선을 안쪽으로 밀어 만든 고리는 좁은 곳에서 변이 엇갈려 뒤집힌 꼬리가 생기는데, 그 꼬리는 회전수 부호가 반대라 빠진다.
 * clear 고리들(세계 좌표) 안 칸은 비운다(덩어리 안에 통째로 든 빈 곳은 고리 하나로 나타낼 수 없어 채운 채 둔다). 고리 넓이 부호는 sign 과 같고, tol(m) 안에서 계단을 줄인다.
 */
export function windingLoops(p: ArrayLike<number>, sign: number, cell: number, tol: number, clear: ArrayLike<number>[] = []): number[][] {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let k = 0; k < p.length; k += 2) (x0 = Math.min(x0, p[k])), (x1 = Math.max(x1, p[k])), (z0 = Math.min(z0, p[k + 1])), (z1 = Math.max(z1, p[k + 1]));
  const nx = Math.ceil((x1 - x0) / cell);
  const nz = Math.ceil((z1 - z0) / cell);
  const n = Math.max(nx, nz) + 2;
  const g = new Uint8Array(n * n);
  const xs: [number, number][] = [];
  for (let j = 0; j < nz; j++) {
    const zc = z0 + (j + 0.5) * cell;
    xs.length = 0;
    for (let i = 0, m = p.length - 2; i < p.length; m = i, i += 2) {
      const az = p[m + 1];
      const bz = p[i + 1];
      if (az <= zc === bz <= zc) continue;
      xs.push([p[m] + ((zc - az) / (bz - az)) * (p[i] - p[m]), bz > az ? 1 : -1]);
    }
    xs.sort((a, b) => a[0] - b[0]);
    // 왼쪽에서 오른쪽으로 건너며: 아래로 가는 변을 건너면 회전수 +1, 위로 가는 변이면 −1 (넓이 + 고리 안이 +1)
    let w = 0;
    for (let q = 0; q + 1 < xs.length; q++) {
      w -= xs[q][1];
      if (w * sign <= 0) continue;
      const a = Math.max(0, Math.ceil((xs[q][0] - x0) / cell - 0.5));
      const b = Math.min(nx - 1, Math.floor((xs[q + 1][0] - x0) / cell - 0.5));
      if (b >= a) g.fill(1, (j + 1) * n + a + 1, (j + 1) * n + b + 2);
    }
  }
  for (const r of clear) {
    let inBox = false;
    for (let k = 0; k < r.length && !inBox; k += 2) inBox = r[k] >= x0 - 50 && r[k] <= x1 + 50 && r[k + 1] >= z0 - 50 && r[k + 1] <= z1 + 50;
    if (inBox) fillRings(g, n, [Array.from(r, (v, k) => (v - (k % 2 ? z0 : x0)) / cell + 1)], 0);
  }
  const out: number[][] = [];
  for (const loop of traceLoops(g, n)) {
    if (ringArea(loop) <= 0) continue; // 칠한 덩어리 안의 빈 곳은 버린다
    const s = simplifyLoop(loop, tol / cell).map((v, k) => (k % 2 ? z0 : x0) + (v - 1) * cell);
    if (sign < 0) {
      const r: number[] = [];
      for (let k = s.length - 2; k >= 0; k -= 2) r.push(s[k], s[k + 1]);
      out.push(r);
    } else out.push(s);
  }
  return out;
}
