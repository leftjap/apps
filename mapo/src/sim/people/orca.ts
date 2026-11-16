// 속도 기반 상호 회피(ORCA, van den Berg 외 2011 'Reciprocal n-body collision avoidance'. RVO2 라이브러리의 선형 계획을 옮겼다).
// 사람마다 바라는 속도에서 가장 가까우면서, 이웃과 시간 tau 안에 부딪히지 않는 속도를 고른다. 이웃 하나가 반 평면 하나를 만들고(서로 반씩 비킨다),
// 벽(걷는 띠 가장자리)도 반 평면으로 넣는다. 반 평면을 다 지킬 수 없으면(빽빽할 때) 가장 덜 어기는 속도를 고른다(벽은 끝까지 지킨다).
// 반 평면 k: 점 (px, pz) 를 지나고 방향 (dx, dz) 의 왼쪽이 허용된 쪽이다(RVO2 와 같은 약속).

const EPS = 1e-5;

/** 반 평면 묶음(같은 배열을 다시 쓴다) */
export interface Lines {
  n: number;
  /** 앞에서부터 이만큼은 벽(끝까지 지킨다) */
  walls: number;
  px: Float64Array;
  pz: Float64Array;
  dx: Float64Array;
  dz: Float64Array;
}

export function makeLines(cap = 64): Lines {
  return { n: 0, walls: 0, px: new Float64Array(cap), pz: new Float64Array(cap), dx: new Float64Array(cap), dz: new Float64Array(cap) };
}

function push(L: Lines, px: number, pz: number, dx: number, dz: number) {
  if (L.n >= L.px.length) return;
  L.px[L.n] = px;
  L.pz[L.n] = pz;
  L.dx[L.n] = dx;
  L.dz[L.n] = dz;
  L.n++;
}

/** 벽: 속도 v 가 nx·vx + nz·vz ≤ c 를 지켜야 한다(n 은 길이 1). 이웃보다 먼저 넣는다 */
export function wallLine(L: Lines, nx: number, nz: number, c: number) {
  push(L, nx * c, nz * c, -nz, nx);
  L.walls = L.n;
}

/**
 * 이웃 하나의 반 평면. 상대 자리 (rx, rz) = 이웃 − 나, 상대 속도 = 내 속도 − 이웃 속도. R 은 두 몸 반지름 합, tau 는 내다보는 시간(초),
 * share 는 내가 비킬 몫(서로 움직이면 0.5, 이웃이 서 있으면 1). dt 는 한 걸음 시간(이미 겹쳤을 때 한 걸음에 벌린다)
 */
export function agentLine(L: Lines, vx: number, vz: number, rx: number, rz: number, rvx: number, rvz: number, R: number, tau: number, share: number, dt: number) {
  const d2 = rx * rx + rz * rz;
  const R2 = R * R;
  let lx: number;
  let lz: number;
  let ux: number;
  let uz: number;
  if (d2 > R2) {
    const it = 1 / tau;
    const wx = rvx - it * rx;
    const wz = rvz - it * rz;
    const wl2 = wx * wx + wz * wz;
    const dot1 = wx * rx + wz * rz;
    if (dot1 < 0 && dot1 * dot1 > R2 * wl2) {
      // 자른 원뿔의 둥근 끝에 걸린다
      const wl = Math.sqrt(wl2);
      const nx = wx / wl;
      const nz = wz / wl;
      lx = nz;
      lz = -nx;
      ux = (R * it - wl) * nx;
      uz = (R * it - wl) * nz;
    } else {
      const leg = Math.sqrt(d2 - R2);
      if (rx * wz - rz * wx > 0) {
        lx = (rx * leg - rz * R) / d2;
        lz = (rx * R + rz * leg) / d2;
      } else {
        lx = -(rx * leg + rz * R) / d2;
        lz = -(-rx * R + rz * leg) / d2;
      }
      const dot2 = rvx * lx + rvz * lz;
      ux = dot2 * lx - rvx;
      uz = dot2 * lz - rvz;
    }
  } else {
    // 이미 겹쳤다: 한 걸음 안에 떨어지게
    const it = 1 / dt;
    const wx = rvx - it * rx;
    const wz = rvz - it * rz;
    const wl = Math.hypot(wx, wz) || EPS;
    const nx = wx / wl;
    const nz = wz / wl;
    lx = nz;
    lz = -nx;
    ux = (R * it - wl) * nx;
    uz = (R * it - wl) * nz;
  }
  push(L, vx + share * ux, vz + share * uz, lx, lz);
}

const det = (ax: number, az: number, bx: number, bz: number) => ax * bz - az * bx;

/** 선 k 위에서 앞선 선들을 지키며 바라는 속도에 가장 가까운 점. 없으면 false */
function lp1(L: Lines, k: number, radius: number, ox: number, oz: number, dirOpt: boolean, out: Float64Array): boolean {
  const px = L.px[k];
  const pz = L.pz[k];
  const dx = L.dx[k];
  const dz = L.dz[k];
  const dot = px * dx + pz * dz;
  const disc = dot * dot + radius * radius - (px * px + pz * pz);
  if (disc < 0) return false;
  const sq = Math.sqrt(disc);
  let tL = -dot - sq;
  let tR = -dot + sq;
  for (let i = 0; i < k; i++) {
    const den = det(dx, dz, L.dx[i], L.dz[i]);
    const num = det(L.dx[i], L.dz[i], px - L.px[i], pz - L.pz[i]);
    if (Math.abs(den) <= EPS) {
      if (num < 0) return false;
      continue;
    }
    const t = num / den;
    if (den >= 0) tR = Math.min(tR, t);
    else tL = Math.max(tL, t);
    if (tL > tR) return false;
  }
  let t: number;
  if (dirOpt) t = ox * dx + oz * dz > 0 ? tR : tL;
  else t = Math.max(tL, Math.min(tR, dx * (ox - px) + dz * (oz - pz)));
  out[0] = px + t * dx;
  out[1] = pz + t * dz;
  return true;
}

/** 모든 선을 지키며 바라는 속도(ox, oz)에 가장 가까운 속도(|v| ≤ radius). 지키지 못한 첫 선 번호, 다 지키면 L.n */
function lp2(L: Lines, radius: number, ox: number, oz: number, dirOpt: boolean, out: Float64Array): number {
  if (dirOpt) (out[0] = ox * radius), (out[1] = oz * radius);
  else if (ox * ox + oz * oz > radius * radius) {
    const l = Math.hypot(ox, oz);
    out[0] = (ox / l) * radius;
    out[1] = (oz / l) * radius;
  } else (out[0] = ox), (out[1] = oz);
  for (let i = 0; i < L.n; i++) {
    if (det(L.dx[i], L.dz[i], L.px[i] - out[0], L.pz[i] - out[1]) > 0) {
      const sx = out[0];
      const sz = out[1];
      if (!lp1(L, i, radius, ox, oz, dirOpt, out)) {
        out[0] = sx;
        out[1] = sz;
        return i;
      }
    }
  }
  return L.n;
}

const P = makeLines(128);
/** 다 지킬 수 없을 때: 벽은 지키고 나머지 선을 가장 덜 어기는 속도 */
function lp3(L: Lines, begin: number, radius: number, out: Float64Array) {
  let dist = 0;
  for (let i = begin; i < L.n; i++) {
    if (det(L.dx[i], L.dz[i], L.px[i] - out[0], L.pz[i] - out[1]) <= dist) continue;
    P.n = 0;
    for (let j = 0; j < L.walls; j++) push(P, L.px[j], L.pz[j], L.dx[j], L.dz[j]);
    for (let j = L.walls; j < i; j++) {
      const dd = det(L.dx[i], L.dz[i], L.dx[j], L.dz[j]);
      let px: number;
      let pz: number;
      if (Math.abs(dd) <= EPS) {
        if (L.dx[i] * L.dx[j] + L.dz[i] * L.dz[j] > 0) continue;
        px = 0.5 * (L.px[i] + L.px[j]);
        pz = 0.5 * (L.pz[i] + L.pz[j]);
      } else {
        const t = det(L.dx[j], L.dz[j], L.px[i] - L.px[j], L.pz[i] - L.pz[j]) / dd;
        px = L.px[i] + t * L.dx[i];
        pz = L.pz[i] + t * L.dz[i];
      }
      let dx = L.dx[j] - L.dx[i];
      let dz = L.dz[j] - L.dz[i];
      const l = Math.hypot(dx, dz) || EPS;
      dx /= l;
      dz /= l;
      push(P, px, pz, dx, dz);
    }
    const sx = out[0];
    const sz = out[1];
    if (lp2(P, radius, -L.dz[i], L.dx[i], true, out) < P.n) (out[0] = sx), (out[1] = sz);
    dist = det(L.dx[i], L.dz[i], L.px[i] - out[0], L.pz[i] - out[1]);
  }
}

/** 반 평면 L 을 지키며 바라는 속도 (ox, oz) 에 가장 가까운 속도(빠르기 ≤ vmax)를 out 에 쓴다 */
export function solve(L: Lines, vmax: number, ox: number, oz: number, out: Float64Array) {
  const fail = lp2(L, vmax, ox, oz, false, out);
  if (fail < L.n) lp3(L, fail, vmax, out);
}
