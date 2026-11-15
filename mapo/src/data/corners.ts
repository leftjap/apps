// 길 모퉁이: 땅 위 길 조각이 둘 넘게 만나는 노드에서 각도 순으로 이웃한 두 갈래의 찻길 가장자리 선이 만나는 점(보도 모서리)을 호로 깎는다.
// 굽기(tools/bake.ts)는 서울시 가장자리선으로 모퉁이마다 반지름을 재서 이 목록 순서대로 board.json 의 rc 에 넣고, 렌더러는 그 반지름으로 호를 그린다.
import { curbAt, type Road } from './board.ts';
import { cumLen } from '../poly.ts';

export interface Corner {
  /** 두 가장자리 선이 만나는 점(보도 모서리) */
  kx: number;
  kz: number;
  /** 노드에서 멀어지는 두 갈래 방향(a 의 오른쪽 가장자리와 b 의 왼쪽 가장자리가 모퉁이를 이룬다) */
  ax: number;
  az: number;
  bx: number;
  bz: number;
  /** 모서리가 노드에서 갈래 a 방향으로 떨어진 거리(음수면 노드 뒤) */
  t: number;
  /** 두 갈래 사이 각(라디안) */
  th: number;
  /** 접점이 노드에서 갈 수 있는 거리 상한(짧은 갈래의 45%) */
  cap: number;
  /** 두 갈래 가운데 큰 쪽 등급(작은 숫자) */
  cls: number;
  /** 등급으로 정한 기본 반지름(m): 큰길끼리 6, 큰길과 골목 4, 골목끼리 2.5 */
  r0: number;
  /** 갈래 a·b 의 길 조각 번호와 노드 쪽 끝(0 시작, 1 끝) */
  ra: number;
  ea: number;
  rb: number;
  eb: number;
}

const nodeKey = (x: number, z: number) => `${Math.round(x * 10)},${Math.round(z * 10)}`;

/** 땅 위 길 조각(등급 5 이하)의 모퉁이 목록. 같은 길 목록이면 늘 같은 순서로 낸다. 분리대 쪽 모서리는 깎지 않는다 */
export function roadCorners(roads: Road[]): Corner[] {
  interface Arm {
    ux: number;
    uz: number;
    /** 노드에서 멀어지는 방향 기준 오른쪽·왼쪽 찻길 가장자리 */
    hr: number;
    hl: number;
    cls: number;
    len: number;
    /** 왼쪽·오른쪽이 분리대인가 */
    medL: boolean;
    medR: boolean;
    ri: number;
    end: number;
  }
  const arms = new Map<string, { x: number; z: number; list: Arm[] }>();
  roads.forEach((r, ri) => {
    if (r.cls > 5 || r.p.length < 6) return;
    for (let i = 1; i < r.p.length; i += 3) if (r.p[i] > 0.3) return;
    const L = cumLen(r.p);
    const len = L[L.length - 1];
    const med = r.oneway && r.gap > 0.15 && r.gap <= 10;
    for (const end of [0, 1]) {
      const hr = curbAt(r, end ? len : 0, 1);
      const hl = curbAt(r, end ? len : 0, -1);
      const n = r.p.length;
      const [x, z, nx, nz] = end ? [r.p[n - 3], r.p[n - 1], r.p[n - 6], r.p[n - 4]] : [r.p[0], r.p[2], r.p[3], r.p[5]];
      const d = Math.hypot(nx - x, nz - z) || 1;
      const k = nodeKey(x, z);
      const a = arms.get(k) ?? arms.set(k, { x, z, list: [] }).get(k)!;
      // 끝 노드에서 멀어지는 방향은 길 진행 방향의 반대라 오른쪽·왼쪽이 바뀐다
      a.list.push({ ux: (nx - x) / d, uz: (nz - z) / d, hr: end ? hl : hr, hl: end ? hr : hl, cls: r.cls, len, medL: med && !end, medR: med && !!end, ri, end });
    }
  });
  const out: Corner[] = [];
  for (const { x, z, list } of arms.values()) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => Math.atan2(a.uz, a.ux) - Math.atan2(b.uz, b.ux));
    for (let k = 0; k < sorted.length; k++) {
      const a = sorted[k];
      const b = sorted[(k + 1) % sorted.length];
      let th = Math.atan2(b.uz, b.ux) - Math.atan2(a.uz, a.ux);
      if (th <= 0) th += Math.PI * 2;
      if (th > Math.PI - 0.25 || th < 0.35 || a.medR || b.medL) continue;
      // a 의 오른쪽 가장자리(+ 각도 쪽)와 b 의 왼쪽 가장자리
      const ax = x - a.uz * a.hr;
      const az = z + a.ux * a.hr;
      const bx = x + b.uz * b.hl;
      const bz = z - b.ux * b.hl;
      const den = a.ux * b.uz - a.uz * b.ux;
      if (Math.abs(den) < 1e-3) continue;
      const t = ((bx - ax) * b.uz - (bz - az) * b.ux) / den;
      const cap = Math.min(a.len, b.len) * 0.45;
      out.push({
        t,
        kx: ax + a.ux * t,
        kz: az + a.uz * t,
        ax: a.ux,
        az: a.uz,
        bx: b.ux,
        bz: b.uz,
        th,
        cap,
        cls: Math.min(a.cls, b.cls),
        r0: a.cls <= 3 && b.cls <= 3 ? 6 : a.cls <= 3 || b.cls <= 3 ? 4 : 2.5,
        ra: a.ri,
        ea: a.end,
        rb: b.ri,
        eb: b.end,
      });
    }
  }
  return out;
}

/** 모퉁이 c 를 반지름 R 로 깎는 호: 보도 모서리 점과 호 위 점들 [x, z, ...](steps+1 개). 깎을 수 없으면 null */
export function cornerArc(c: Corner, R: number, steps = 8): number[] | null {
  const dt = Math.min(R / Math.tan(c.th / 2), c.cap);
  if (dt < 0.3 || c.t + dt < 0) return null;
  const r = dt * Math.tan(c.th / 2);
  const t1x = c.kx + c.ax * dt;
  const t1z = c.kz + c.az * dt;
  const t2x = c.kx + c.bx * dt;
  const t2z = c.kz + c.bz * dt;
  // 호의 가운데: 첫 접점에서 가장자리에 직각으로 r 만큼 보도 쪽
  const cx = t1x - c.az * r;
  const cz = t1z + c.ax * r;
  const a0 = Math.atan2(t1z - cz, t1x - cx);
  let a1 = Math.atan2(t2z - cz, t2x - cx);
  while (a1 - a0 > Math.PI) a1 -= Math.PI * 2;
  while (a0 - a1 > Math.PI) a1 += Math.PI * 2;
  const out: number[] = [];
  for (let s = 0; s <= steps; s++) {
    const ang = a0 + ((a1 - a0) * s) / steps;
    out.push(cx + Math.cos(ang) * r, cz + Math.sin(ang) * r);
  }
  return out;
}
