// 높이 다른 찻길(재작업 W15). 굽기는 찻길 터널을 땅 높이(0m)에 두고, 다리는 땅에 닿는 노드에서 80m 에 걸쳐 오르게 해서,
// ① 지하차도·강변북로 지하 구간이 그 위 찻길과 같은 높이에 놓이고 ② 다리가 오르막 끝에서 다른 찻길을 넘는 곳은 높이 차가 2.5m 아래였다.
// 그래서 두 길의 차가 화면에서 같은 높이로 겹쳐 보였다(설계 문서 39절 W11).
// ① OSM 찻길 터널(tunnel, layer < 0)을 따라 놓인 조각에 표시를 단다(구운 조각 머리의 다리 칸 = 2). 차 그래프가 그 조각을 땅 밑으로 내려 차를 숨긴다(src/sim/graph.ts).
// ② 다리 조각이 노드 없이 다른 땅 위 찻길을 넘는 자리(OSM layer 가 높은 쪽이 다리)에서, 다리를 그 길보다 CLEAR m 위로 올린다.
//    넘는 자리에서 길을 따라간 거리 d 의 꼭짓점마다 (넘는 길 높이 + CLEAR − SLOPE × d) 보다 낮지 않게 한다. 다리 앞뒤로 갈림 없이 이어지는 찻길도 함께 올리고, 갈림이 있는 노드는 그대로 둔다
import { toXZ } from '../../src/geo.ts';

type Way = { geometry?: { lat: number; lon: number }[]; tags?: Record<string, string> };
/** 다리가 넘는 길보다 높아야 하는 높이(m)와, 넘는 자리에서 멀어질 때 낮아질 수 있는 경사 */
const CLEAR = 6;
const SLOPE = 0.08;

const isTunnel = (t: Record<string, string>) => (!!t.tunnel && t.tunnel !== 'no') || (Number(t.layer) < 0 && !(t.bridge && t.bridge !== 'no'));
const levelOf = (t: Record<string, string>) => (t.layer !== undefined && !Number.isNaN(Number(t.layer)) ? Number(t.layer) : t.bridge && t.bridge !== 'no' ? 1 : isTunnel(t) ? -1 : 0);

/** r: 구운 판의 도로 조각 [등급, 차로, 표시, 다리, 이름, 랜드마크, x, y, z(dm), ...]. 고친 조각 수를 돌려준다(r 을 그 자리에서 고친다) */
export function roadLevels(r: number[][], ways: Way[]): { tunnels: number; raised: string[]; skipped: string[] } {
  const car = ways.filter((w) => w.geometry && w.tags?.highway && !/^(footway|path|cycleway|steps|pedestrian|corridor|platform)$/.test(w.tags.highway));
  const C = 20;
  const grid = new Map<number, [Way, number, number, number, number][]>();
  for (const w of car) {
    const p = w.geometry!.map((g) => toXZ(g.lat, g.lon));
    for (let i = 0; i + 1 < p.length; i++)
      for (let x = Math.floor(Math.min(p[i][0], p[i + 1][0]) / C); x <= Math.floor(Math.max(p[i][0], p[i + 1][0]) / C); x++)
        for (let z = Math.floor(Math.min(p[i][1], p[i + 1][1]) / C); z <= Math.floor(Math.max(p[i][1], p[i + 1][1]) / C); z++)
          (grid.get(x * 4096 + z) ?? grid.set(x * 4096 + z, []).get(x * 4096 + z)!).push([w, p[i][0], p[i][1], p[i + 1][0], p[i + 1][1]]);
  }
  /** 점 (x,z) 에서 방향 (hx,hz) 로 지나는 OSM 찻길(3m 안, 18° 안. 구운 가운데선은 차선 자리로 옮겨져 OSM 과 2m 남짓 떨어진 곳이 있다) 가운데 가장 가까운 것의 태그 */
  const tagsAt = (x: number, z: number, hx: number, hz: number) => {
    const hl = Math.hypot(hx, hz) || 1;
    let best = Infinity;
    let tags: Record<string, string> | null = null;
    for (let gx = -1; gx <= 1; gx++)
      for (let gz = -1; gz <= 1; gz++)
        for (const [w, ax, az, bx, bz] of grid.get((Math.floor(x / C) + gx) * 4096 + Math.floor(z / C) + gz) ?? []) {
          const dx = bx - ax;
          const dz = bz - az;
          const L = Math.hypot(dx, dz) || 1;
          if (Math.abs((dx * hx + dz * hz) / (L * hl)) < 0.95) continue;
          const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (L * L)));
          const d = Math.hypot(ax + t * dx - x, az + t * dz - z);
          if (d < 3 && d < best) (best = d), (tags = w.tags!);
        }
    return tags;
  };
  const P = (q: number[], k: number) => [q[6 + k * 3] / 10, q[7 + k * 3] / 10, q[8 + k * 3] / 10];
  const nv = (q: number[]) => (q.length - 6) / 3;
  const carPiece = (q: number[]) => q[0] <= 5 && nv(q) >= 2;

  // ① 터널: 조각을 따라 5m 마다(양 끝 3m 빼고) 짚은 점의 60% 넘게가 OSM 터널 위
  let tunnels = 0;
  for (const q of r) {
    if (!carPiece(q) || q[3] === 1) continue;
    let n = 0;
    let t = 0;
    for (let k = 0; k + 1 < nv(q); k++) {
      const [ax, , az] = P(q, k);
      const [bx, , bz] = P(q, k + 1);
      const L = Math.hypot(bx - ax, bz - az);
      for (let s = 2.5; s < L; s += 5) {
        const x = ax + ((bx - ax) * s) / L;
        const z = az + ((bz - az) * s) / L;
        const tg = tagsAt(x, z, bx - ax, bz - az);
        n++;
        if (tg && isTunnel(tg)) t++;
      }
    }
    const was = q[3];
    q[3] = n && t / n > 0.6 ? 2 : 0;
    if (q[3] === 2) tunnels++;
    if (was !== q[3] && was !== 0 && was !== 2) throw new Error('다리 칸이 바뀌면 안 된다');
  }

  // ② 다리가 노드 없이 넘는 땅 위 찻길
  const raised: string[] = [];
  const skipped: string[] = [];
  const vk = (x: number, z: number) => `${Math.round(x * 10)},${Math.round(z * 10)}`;
  const ends = new Map<string, number[]>(); // 끝점 → 조각들
  r.forEach((q, i) => {
    if (!carPiece(q)) return;
    for (const k of [0, nv(q) - 1]) {
      const [x, , z] = P(q, k);
      (ends.get(vk(x, z)) ?? ends.set(vk(x, z), []).get(vk(x, z))!).push(i);
    }
  });
  const sg = new Map<number, [number, number][]>();
  r.forEach((q, i) => {
    if (!carPiece(q)) return;
    for (let k = 0; k + 1 < nv(q); k++) {
      const [ax, , az] = P(q, k);
      const [bx, , bz] = P(q, k + 1);
      for (let x = Math.floor(Math.min(ax, bx) / C); x <= Math.floor(Math.max(ax, bx) / C); x++)
        for (let z = Math.floor(Math.min(az, bz) / C); z <= Math.floor(Math.max(az, bz) / C); z++) (sg.get(x * 4096 + z) ?? sg.set(x * 4096 + z, []).get(x * 4096 + z)!).push([i, k]);
    }
  });
  const seen = new Set<string>();
  const cross: { b: number; x: number; z: number; need: number }[] = [];
  for (const l of sg.values())
    for (let a = 0; a < l.length; a++)
      for (let b = a + 1; b < l.length; b++) {
        const [ra, ia] = l[a];
        const [rb, ib] = l[b];
        if (ra === rb) continue;
        const A0 = P(r[ra], ia), A1 = P(r[ra], ia + 1), B0 = P(r[rb], ib), B1 = P(r[rb], ib + 1);
        const d1x = A1[0] - A0[0], d1z = A1[2] - A0[2], d2x = B1[0] - B0[0], d2z = B1[2] - B0[2];
        const den = d1x * d2z - d1z * d2x;
        if (Math.abs(den) < 1e-9) continue;
        const u = ((B0[0] - A0[0]) * d2z - (B0[2] - A0[2]) * d2x) / den;
        const v = ((B0[0] - A0[0]) * d1z - (B0[2] - A0[2]) * d1x) / den;
        if (u < 0 || u > 1 || v < 0 || v > 1) continue;
        const x = A0[0] + u * d1x;
        const z = A0[2] + u * d1z;
        // 두 조각이 함께 쓰는 끝점에서 만나는 것은 가로지름이 아니다
        if ((ends.get(vk(x, z)) ?? []).includes(ra) && (ends.get(vk(x, z)) ?? []).includes(rb)) continue;
        const near = (q: number[], k: number) => [0, nv(q) - 1].some((e) => Math.hypot(P(q, e)[0] - x, P(q, e)[2] - z) < 0.5) && k >= 0;
        if (near(r[ra], ia) && near(r[rb], ib)) continue;
        const key = `${Math.min(ra, rb)},${Math.max(ra, rb)}@${Math.round(x)},${Math.round(z)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const ya = A0[1] + u * (A1[1] - A0[1]);
        const yb = B0[1] + v * (B1[1] - B0[1]);
        if (Math.abs(ya - yb) >= CLEAR - 0.5) continue;
        if (r[ra][3] === 2 || r[rb][3] === 2) continue; // 터널은 차 그래프가 땅 밑으로 내린다
        const ta = tagsAt(x, z, d1x, d1z);
        const tb = tagsAt(x, z, d2x, d2z);
        if (!ta || !tb || levelOf(ta) === levelOf(tb)) continue;
        const [hi, lo, ylo] = levelOf(ta) > levelOf(tb) ? [ra, rb, yb] : [rb, ra, ya];
        if (r[hi][3] !== 1) {
          skipped.push(`${Math.round(x)},${Math.round(z)}`);
          continue;
        }
        if (r[lo][3] === 1) continue; // 다리끼리는 굽기의 layer 높이(7·12·17m)를 따른다
        cross.push({ b: hi, x, z, need: ylo + CLEAR });
      }
  // 넘는 자리에 다리 조각의 꼭짓점을 넣는다(꼭짓점이 두 끝뿐인 짧은 다리 조각도 올릴 수 있게. 곧은 선 위라 길이·차로 자료는 그대로다)
  for (const c of cross) {
    const q = r[c.b];
    for (let k = 0; k + 1 < nv(q); k++) {
      const a = P(q, k), b = P(q, k + 1);
      const L = Math.hypot(b[0] - a[0], b[2] - a[2]) || 1;
      const t = ((c.x - a[0]) * (b[0] - a[0]) + (c.z - a[2]) * (b[2] - a[2])) / (L * L);
      if (t < 0 || t > 1 || Math.hypot(a[0] + t * (b[0] - a[0]) - c.x, a[2] + t * (b[2] - a[2]) - c.z) > 0.5) continue;
      if (t * L > 0.5 && (1 - t) * L > 0.5) q.splice(6 + (k + 1) * 3, 0, Math.round(c.x * 10), Math.round((a[1] + t * (b[1] - a[1])) * 10), Math.round(c.z * 10));
      break;
    }
  }
  // 올릴 수 있는 조각의 꼭짓점 그래프: 다리 조각과, 갈림 없이 이어지는 땅 위 찻길(OSM 은 다리 앞 둑길을 다리로 적지 않아 다리 끝이 땅에 닿는다).
  // 갈림이 있는 노드(조각 셋 이상이 만나는 끝점)는 고정한다. 그래서 넘는 자리가 다리 끝 가까이여도 앞 둑길까지 경사 SLOPE 로 오르내린다
  const bridge = r.map((q) => carPiece(q) && q[3] !== 2);
  const fixed = new Set<string>();
  for (const [k, list] of ends) if (list.filter((i) => bridge[i]).length !== 2) fixed.add(k);
  const adj = new Map<string, [string, number][]>();
  r.forEach((q, i) => {
    if (!bridge[i]) return;
    for (let k = 0; k + 1 < nv(q); k++) {
      const a = P(q, k), b = P(q, k + 1);
      const ka = vk(a[0], a[2]), kb = vk(b[0], b[2]);
      const d = Math.hypot(b[0] - a[0], b[2] - a[2]);
      (adj.get(ka) ?? adj.set(ka, []).get(ka)!).push([kb, d]);
      (adj.get(kb) ?? adj.set(kb, []).get(kb)!).push([ka, d]);
    }
  });
  const want = new Map<string, number>(); // 꼭짓점 → 낮아질 수 없는 높이
  for (const c of cross) {
    // 넘는 점에서 그 조각의 두 이웃 꼭짓점까지 거리로 시작해 다리를 따라 퍼진다
    const q = r[c.b];
    const dist = new Map<string, number>();
    const queue: [string, number][] = [];
    for (let k = 0; k + 1 < nv(q); k++) {
      const a = P(q, k), b = P(q, k + 1);
      const L = Math.hypot(b[0] - a[0], b[2] - a[2]) || 1;
      const t = ((c.x - a[0]) * (b[0] - a[0]) + (c.z - a[2]) * (b[2] - a[2])) / (L * L);
      if (t < -0.01 || t > 1.01 || Math.hypot(a[0] + t * (b[0] - a[0]) - c.x, a[2] + t * (b[2] - a[2]) - c.z) > 0.5) continue;
      queue.push([vk(a[0], a[2]), t * L], [vk(b[0], b[2]), (1 - t) * L]);
      break;
    }
    for (const [k, d] of queue) dist.set(k, Math.min(d, dist.get(k) ?? Infinity));
    while (queue.length) {
      queue.sort((x, y) => y[1] - x[1]);
      const [k, d] = queue.pop()!;
      if (d > (dist.get(k) ?? Infinity) || fixed.has(k)) continue;
      for (const [m, w] of adj.get(k) ?? []) if (d + w < (dist.get(m) ?? Infinity)) dist.set(m, d + w), queue.push([m, d + w]);
    }
    for (const [k, d] of dist) if (!fixed.has(k)) want.set(k, Math.max(want.get(k) ?? -Infinity, c.need - SLOPE * d));
    raised.push(`${Math.round(c.x)},${Math.round(c.z)}`);
  }
  r.forEach((q, i) => {
    if (!bridge[i]) return;
    for (let k = 0; k < nv(q); k++) {
      const [x, y, z] = P(q, k);
      const w = want.get(vk(x, z));
      if (w !== undefined && w > y) q[7 + k * 3] = Math.round(w * 10);
    }
  });
  return { tunnels, raised, skipped };
}
