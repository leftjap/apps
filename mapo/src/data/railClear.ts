// 철도와 찻길이 평면으로 엇갈리는 곳의 높이 맞추기.
// 굽기는 철도 다리 높이를 OSM layer 와 상관없이 12m 로 두고 앞뒤 90m 평균으로 다듬는데, 찻길 다리는 layer·길이로 7~17m 를 쓴다.
// 그래서 당산철교 북단처럼 철도(layer 3)가 강변북로 고가(layer 1, 긴 다리라 13m) 위를 지나야 할 곳에서 둘이 같은 높이로 만나
// 차가 열차를 뚫고 지나갔다. 엇갈리는 곳마다 두 높이 차이가 모자라면:
//  - 땅에서 2m 넘게 뜬 철도(고가)는 찻길이 확실히(4.5m 넘게) 위가 아닌 한 그 자리를 찻길 위 CLEAR 로 올리고 앞뒤를 LIFT 경사로 잇는다.
//  - 땅 높이·지하 진입부 철도는 그 자리를 찻길 아래 SINK 로 내리고 앞뒤를 DROP 경사로 잇는다(마포 판의 철도에는 건널목이 없다).
// 올리면 앞뒤 경사가 지하 진입부를 얕게 만들 수 있으므로 올리기·내리기를 바뀌지 않을 때까지(최대 4번) 되풀이한다.
import type { Line, Road } from './board.ts';
import { cumLen } from '../poly.ts';

/** 철도가 찻길 위를 지날 때 높이 차이(m): 버스 높이 + 철교 두께 */
const CLEAR = 6.5;
/** 철도가 찻길 밑을 지날 때 높이 차이(m): 전동차 높이 + 덮개 */
const SINK = 5;
/** 고가로 올린 자리와 원래 높이를 잇는 경사, 지하로 내린 자리와 잇는 경사 */
const LIFT = 0.035;
const DROP = 0.045;
/** 이보다 높은 철도만 고가로 본다(m) */
const ELEVATED = 2;
/** 이 높이 차이를 넘으면 문제없다(m). 이보다 깊은 철도는 보지 않는다 */
const OK = 4.5;
const DEEP = -8;

type Need = [number, number];

export function liftRails(lines: Line[], roads: Road[]): void {
  // 찻길 조각마다 평면 범위(빠르게 거르기)
  const box = roads.map((r) => {
    let x0 = Infinity;
    let z0 = Infinity;
    let x1 = -Infinity;
    let z1 = -Infinity;
    for (let k = 0; k < r.p.length; k += 3) {
      x0 = Math.min(x0, r.p[k]);
      x1 = Math.max(x1, r.p[k]);
      z0 = Math.min(z0, r.p[k + 2]);
      z1 = Math.max(z1, r.p[k + 2]);
    }
    return [x0, z0, x1, z1];
  });
  /** 노선 L 이 찻길과 엇갈리는데 높이 차이가 모자란 곳: 올릴 곳 [노선 위 거리, 가장 낮은 높이], 내릴 곳 [거리, 가장 높은 높이] */
  function conflicts(L: Line): { up: Need[]; down: Need[] } {
    const p = L.p;
    const up: Need[] = [];
    const down: Need[] = [];
    for (let a = 0; a + 3 < p.length; a += 3) {
      const [ax, ay, az, bx, by, bz] = [p[a], p[a + 1], p[a + 2], p[a + 3], p[a + 4], p[a + 5]];
      if (Math.max(ay, by) < DEEP) continue;
      roads.forEach((r, ri) => {
        if (r.cls > 5) return;
        const [x0, z0, x1, z1] = box[ri];
        if (Math.max(ax, bx) < x0 || Math.min(ax, bx) > x1 || Math.max(az, bz) < z0 || Math.min(az, bz) > z1) return;
        const q = r.p;
        for (let k = 0; k + 3 < q.length; k += 3) {
          const [cx, cy, cz, dx, dy, dz] = [q[k], q[k + 1], q[k + 2], q[k + 3], q[k + 4], q[k + 5]];
          const den = (bx - ax) * (dz - cz) - (bz - az) * (dx - cx);
          if (Math.abs(den) < 1e-9) continue;
          const t = ((cx - ax) * (dz - cz) - (cz - az) * (dx - cx)) / den;
          const u = ((cx - ax) * (bz - az) - (cz - az) * (bx - ax)) / den;
          if (t < 0 || t > 1 || u < 0 || u > 1) continue;
          const yr = ay + (by - ay) * t;
          const yc = cy + (dy - cy) * u;
          const s = L.cum[a / 3] + (L.cum[a / 3 + 1] - L.cum[a / 3]) * t;
          if (yr >= ELEVATED && yc - yr < OK) {
            if (yr - yc < CLEAR) up.push([s, yc + CLEAR]);
          } else if (yc - yr < OK) down.push([s, yc - SINK]);
        }
      });
    }
    return { up, down };
  }
  for (const L of lines) {
    const p = L.p;
    for (let pass = 0; pass < 4; pass++) {
      const { up, down } = conflicts(L);
      if (!up.length && !down.length) break;
      for (let k = 0; k < p.length / 3; k++) {
        for (const [s, h] of up) p[k * 3 + 1] = Math.max(p[k * 3 + 1], h - LIFT * Math.abs(L.cum[k] - s));
        for (const [s, h] of down) p[k * 3 + 1] = Math.min(p[k * 3 + 1], h + DROP * Math.abs(L.cum[k] - s));
      }
      L.cum = cumLen(p);
    }
  }
}
