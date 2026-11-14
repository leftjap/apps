// 횡단보도 면(서울시 교통안전시설물) → 건너는 축. 긴 변이 건너는 방향, 짧은 변이 횡단보도 폭이다.

export interface Rect {
  cx: number;
  cz: number;
  /** 건너는 방향(단위 벡터) */
  ux: number;
  uz: number;
  /** 건너는 길이(m) */
  len: number;
  /** 횡단보도 폭(m) */
  wid: number;
}

/** 외곽선 [x,z] 목록을 감싸는 가장 작은 직사각형(변 방향 중에서 고른다) */
export function minRect(ring: [number, number][]): Rect {
  const pts = ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? ring.slice(0, -1) : ring;
  let best: Rect | null = null;
  let bestArea = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[(i + 1) % pts.length];
    const L = Math.hypot(bx - ax, bz - az);
    if (L < 1e-6) continue;
    const ux = (bx - ax) / L;
    const uz = (bz - az) / L;
    let u0 = Infinity;
    let u1 = -Infinity;
    let v0 = Infinity;
    let v1 = -Infinity;
    for (const [x, z] of pts) {
      const u = x * ux + z * uz;
      const v = -x * uz + z * ux;
      u0 = Math.min(u0, u);
      u1 = Math.max(u1, u);
      v0 = Math.min(v0, v);
      v1 = Math.max(v1, v);
    }
    const area = (u1 - u0) * (v1 - v0);
    if (area >= bestArea) continue;
    bestArea = area;
    const um = (u0 + u1) / 2;
    const vm = (v0 + v1) / 2;
    const cx = um * ux - vm * uz;
    const cz = um * uz + vm * ux;
    const du = u1 - u0;
    const dv = v1 - v0;
    best = du >= dv ? { cx, cz, ux, uz, len: du, wid: dv } : { cx, cz, ux: -uz, uz: ux, len: dv, wid: du };
  }
  return best ?? { cx: pts[0]?.[0] ?? 0, cz: pts[0]?.[1] ?? 0, ux: 1, uz: 0, len: 0, wid: 0 };
}

/** 중앙섬을 사이에 두고 나뉜 두 단 횡단보도를 하나로 잇는다: 같은 축(12° 안, 옆으로 2.5m 안)에 있고 끝끼리 12m 안이면 합친다.
 *  parts 는 합쳐진 원래 면의 번호들 */
export function mergeStages(list: Rect[]): (Rect & { parts: number[] })[] {
  const out = list.map((r, i) => ({ ...r, parts: [i] }));
  for (let changed = true; changed; ) {
    changed = false;
    for (let i = 0; i < out.length && !changed; i++)
      for (let j = i + 1; j < out.length && !changed; j++) {
        const a = out[i];
        const b = out[j];
        if (Math.abs(a.ux * b.ux + a.uz * b.uz) < Math.cos((12 * Math.PI) / 180)) continue;
        const dx = b.cx - a.cx;
        const dz = b.cz - a.cz;
        if (Math.abs(-dx * a.uz + dz * a.ux) > 2.5) continue;
        const along = dx * a.ux + dz * a.uz;
        const gap = Math.abs(along) - a.len / 2 - b.len / 2;
        if (gap > 12 || gap < -1) continue;
        // a 의 축 위에서 두 면의 양 끝을 모두 덮는 구간
        const lo = Math.min(-a.len / 2, along - b.len / 2);
        const hi = Math.max(a.len / 2, along + b.len / 2);
        const mid = (lo + hi) / 2;
        out[i] = { cx: a.cx + a.ux * mid, cz: a.cz + a.uz * mid, ux: a.ux, uz: a.uz, len: hi - lo, wid: (a.wid + b.wid) / 2, parts: [...a.parts, ...b.parts] };
        out.splice(j, 1);
        changed = true;
      }
  }
  return out;
}

/** 정사각형에 가까운 조각(긴 변이 짧은 변의 1.6배 미만)은 변 길이로는 건너는 방향을 알 수 없으므로,
 *  두 변 방향 가운데 길 방향(rx, rz)과 더 직각인 쪽을 건너는 방향으로 잡는다. 긴 조각은 그대로 둔다(비스듬한 횡단보도) */
export function alignToRoad(r: Rect, rx: number, rz: number): Rect {
  if (r.len >= r.wid * 1.6) return r;
  const along = Math.abs(r.ux * rx + r.uz * rz);
  const across = Math.abs(-r.uz * rx + r.ux * rz);
  return along <= across ? r : { cx: r.cx, cz: r.cz, ux: -r.uz, uz: r.ux, len: r.wid, wid: r.len };
}

/** 점에서 선분까지의 거리 */
export const segDist = (x: number, z: number, ax: number, az: number, bx: number, bz: number) => {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
  return Math.hypot(ax + dx * t - x, az + dz * t - z);
};

/** 점에서 닫힌 외곽선까지의 거리(안이면 0) */
export function ringDist(x: number, z: number, ring: [number, number][]): number {
  let inside = false;
  let d = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const [ax, az] = ring[i];
    const [bx, bz] = ring[(i + 1) % ring.length];
    if (az > z !== bz > z && x < ax + ((z - az) * (bx - ax)) / (bz - az)) inside = !inside;
    d = Math.min(d, segDist(x, z, ax, az, bx, bz));
  }
  return inside ? 0 : d;
}

/** 2021 면이 지금도 있는가. 2026 자치구 점과 관리번호가 이어지면 있다. 이어지지 않은 면은 대부분 그사이 지워졌으므로
 *  (사진 대조 13곳 중 9곳), 면 없는 2026 점이 5m 안에 있거나(번호만 바뀐 것) OSM 횡단보도 선이 가운데에서 6m 안에 지날 때만 남긴다 */
export function isCurrent(ring: [number, number][], matched: boolean, points: [number, number][], osm: [number, number][][]): boolean {
  if (matched) return true;
  if (points.some(([x, z]) => ringDist(x, z, ring) <= 5)) return true;
  const pts = ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? ring.slice(0, -1) : ring;
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const cz = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  return osm.some((l) => l.some((p, k) => k > 0 && segDist(cx, cz, l[k - 1][0], l[k - 1][1], p[0], p[1]) < 6));
}
