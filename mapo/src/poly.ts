// 꺾은선 도구. 꺾은선은 [x,y,z, x,y,z, ...] 평면 배열이다.
type Line = ArrayLike<number>;

export function cumLen(p: Line): Float32Array {
  const n = p.length / 3;
  const cum = new Float32Array(n);
  for (let i = 1; i < n; i++) {
    const a = i * 3;
    cum[i] = cum[i - 1] + Math.hypot(p[a] - p[a - 3], p[a + 1] - p[a - 2], p[a + 2] - p[a - 1]);
  }
  return cum;
}

/** s(m) 지점을 out[0..2]에 쓰고 그 지점이 속한 구간 번호를 돌려준다. */
export function pointAt(p: Line, cum: ArrayLike<number>, s: number, out: number[] | Float32Array): number {
  const n = cum.length;
  let lo = 0;
  let hi = n - 1;
  if (s <= 0) hi = 1;
  else if (s >= cum[n - 1]) lo = n - 2;
  else
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] <= s) lo = mid;
      else hi = mid;
    }
  hi = lo + 1;
  const span = cum[hi] - cum[lo];
  const t = span > 0 ? Math.min(1, Math.max(0, (s - cum[lo]) / span)) : 0;
  const a = lo * 3;
  out[0] = p[a] + (p[a + 3] - p[a]) * t;
  out[1] = p[a + 1] + (p[a + 4] - p[a + 1]) * t;
  out[2] = p[a + 2] + (p[a + 5] - p[a + 2]) * t;
  return lo;
}

/** 구간의 진행 방향. 동쪽 0, 남쪽 π/2. */
export function headingAt(p: Line, seg: number): number {
  const a = seg * 3;
  return Math.atan2(p[a + 5] - p[a + 2], p[a + 3] - p[a]);
}

/** (x,z)에서 가장 가까운 선 위 지점의 거리 값 s와 떨어진 거리 d. 높이는 무시한다. */
export function nearestS(p: Line, cum: ArrayLike<number>, x: number, z: number): { s: number; d: number } {
  let best = Infinity;
  let bestS = 0;
  for (let i = 0; i < cum.length - 1; i++) {
    const a = i * 3;
    const dx = p[a + 3] - p[a];
    const dz = p[a + 5] - p[a + 2];
    const len2 = dx * dx + dz * dz;
    const t = len2 > 0 ? Math.min(1, Math.max(0, ((x - p[a]) * dx + (z - p[a + 2]) * dz) / len2)) : 0;
    const d = Math.hypot(x - (p[a] + dx * t), z - (p[a + 2] + dz * t));
    if (d < best) {
      best = d;
      bestS = cum[i] + (cum[i + 1] - cum[i]) * t;
    }
  }
  return { s: bestS, d: best };
}
