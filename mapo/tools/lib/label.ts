// 바닥 글씨 자리 정하기: 동 이름은 동 안에서 가장 넓게 빈 자리에, 길·공원 이름은 그 길이 뻗은 방향으로 쓴다.

/**
 * box([x0, z0, x1, z1]) 를 step(m) 칸으로 나눠 ok 인 칸 가운데, ok 가 아닌 칸(또는 box 밖)까지 가장 먼 칸을 고른다.
 * r 은 그 거리(m). 들어갈 칸이 없으면 null.
 */
export function roomiest(box: [number, number, number, number], step: number, ok: (x: number, z: number) => boolean): { x: number; z: number; r: number } | null {
  const [x0, z0, x1, z1] = box;
  const nx = Math.max(1, Math.ceil((x1 - x0) / step));
  const nz = Math.max(1, Math.ceil((z1 - z0) / step));
  const d = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) d[j * nx + i] = ok(x0 + (i + 0.5) * step, z0 + (j + 0.5) * step) ? 1e9 : 0;
  // 두 번 훑는 거리 변환(가로·세로 1, 대각선 √2). box 밖은 0 으로 본다
  const at = (i: number, j: number) => (i < 0 || j < 0 || i >= nx || j >= nz ? 0 : d[j * nx + i]);
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      if (d[k]) d[k] = Math.min(d[k], at(i - 1, j) + 1, at(i, j - 1) + 1, at(i - 1, j - 1) + Math.SQRT2, at(i + 1, j - 1) + Math.SQRT2);
    }
  let best = -1;
  for (let j = nz - 1; j >= 0; j--)
    for (let i = nx - 1; i >= 0; i--) {
      const k = j * nx + i;
      if (d[k]) d[k] = Math.min(d[k], at(i + 1, j) + 1, at(i, j + 1) + 1, at(i + 1, j + 1) + Math.SQRT2, at(i - 1, j + 1) + Math.SQRT2);
      if (d[k] && (best < 0 || d[k] > d[best])) best = k;
    }
  if (best < 0) return null;
  return { x: x0 + ((best % nx) + 0.5) * step, z: z0 + (Math.floor(best / nx) + 0.5) * step, r: (d[best] - 0.5) * step };
}

/**
 * 점들이 늘어선 방향(주성분)과 그 방향으로 양 끝의 한가운데, 길이.
 * turn 은 글줄 방향(라디안, 동쪽 0, 남쪽 +)으로, 왼쪽에서 오른쪽으로 읽히도록 ±90° 안으로 맞춘다.
 */
export function axis(pts: [number, number][]): { x: number; z: number; turn: number; len: number } {
  let mx = 0;
  let mz = 0;
  for (const [x, z] of pts) (mx += x), (mz += z);
  mx /= pts.length;
  mz /= pts.length;
  let sxx = 0;
  let sxz = 0;
  let szz = 0;
  for (const [x, z] of pts) (sxx += (x - mx) ** 2), (sxz += (x - mx) * (z - mz)), (szz += (z - mz) ** 2);
  let t = 0.5 * Math.atan2(2 * sxz, sxx - szz);
  if (t > Math.PI / 2) t -= Math.PI;
  if (t <= -Math.PI / 2) t += Math.PI;
  const c = Math.cos(t);
  const s = Math.sin(t);
  let lo = Infinity;
  let hi = -Infinity;
  for (const [x, z] of pts) {
    const u = (x - mx) * c + (z - mz) * s;
    lo = Math.min(lo, u);
    hi = Math.max(hi, u);
  }
  const mid = (lo + hi) / 2;
  return { x: mx + c * mid, z: mz + s * mid, turn: t, len: hi - lo };
}
