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
