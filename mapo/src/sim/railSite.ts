// 철도 부지(재작업 W45): 땅 위로 드러난 선로 띠. 사람·걷는 길·걷는 면이 들어가면 안 되는 곳이다.
// 터널 조각(kind −1)은 땅 밑이라 빼고, 선로 높이가 CLEAR 이상인 다리 조각은 밑으로 지나갈 수 있어 뺀다.
// 띠 반폭은 그리는 선로 띠(src/render/rails.ts, 폭 9m)와 같고, 땅 밑으로 내려간 터파기 조각은 옹벽까지(안쪽 반폭 5.2m + 옹벽 1m).
import type { Line } from '../data/board.ts';

/** 이 높이(m) 이상인 다리 밑은 사람이 지나갈 수 있다(굽기 RAIL_CLEAR 와 같은 버스 높이 + 덮개 두께) */
export const RAIL_CLEAR = 5;
export const DECK_HALF = 4.5;
export const TROUGH_HALF = 6.2;

export interface RailSite {
  /** 조각마다 [ax, az, bx, bz, 반폭] */
  segs: number[][];
  /** 띠를 다 품는 상자 [x0, z0, x1, z1] */
  box: [number, number, number, number];
  /** 띠 가운데쯤 자리 */
  mid: [number, number];
  /** (x, z) 가 띠 안인가. pad 만큼 넓혀 볼 수 있다 */
  inside(x: number, z: number, pad?: number): boolean;
}

export function railSite(lines: Pick<Line, 'p' | 'kind'>[]): RailSite {
  const segs: number[][] = [];
  for (const l of lines) {
    const n = l.p.length / 3;
    for (let i = 0; i + 1 < n; i++) {
      if (l.kind[i] === -1) continue;
      const ya = l.p[i * 3 + 1];
      const yb = l.p[i * 3 + 4];
      if (Math.min(ya, yb) >= RAIL_CLEAR) continue;
      segs.push([l.p[i * 3], l.p[i * 3 + 2], l.p[i * 3 + 3], l.p[i * 3 + 5], Math.min(ya, yb) < 0 ? TROUGH_HALF : DECK_HALF]);
    }
  }
  const box: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [ax, az, bx, bz, h] of segs) {
    box[0] = Math.min(box[0], ax - h, bx - h);
    box[1] = Math.min(box[1], az - h, bz - h);
    box[2] = Math.max(box[2], ax + h, bx + h);
    box[3] = Math.max(box[3], az + h, bz + h);
  }
  const m = segs[segs.length >> 1] ?? [0, 0, 0, 0];
  const inside = (x: number, z: number, pad = 0) => {
    if (x < box[0] - pad || x > box[2] + pad || z < box[1] - pad || z > box[3] + pad) return false;
    for (const [ax, az, bx, bz, h] of segs) {
      const dx = bx - ax;
      const dz = bz - az;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
      if (Math.hypot(ax + dx * t - x, az + dz * t - z) < h + pad) return true;
    }
    return false;
  };
  return { segs, box, mid: [(m[0] + m[2]) / 2, (m[1] + m[3]) / 2], inside };
}
