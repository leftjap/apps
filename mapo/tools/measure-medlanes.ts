// 중앙버스정류장 승강장 둘레 차로 측정(브라우저 없이): node tools/measure-medlanes.ts. 시험(test/median-stops.test.ts)도 medianLaneClearance 를 쓴다
import { readFileSync } from 'node:fs';
import { decodeBoard } from '../src/data/board.ts';
import { buildCarGraph, ISLAND_BACK, ISLAND_L, ISLAND_W, laneOff, MED } from '../src/sim/graph.ts';
import { decodeLanes } from '../src/data/road.ts';
import { busStopPortals, makeBusRoutes } from '../src/sim/buses.ts';

// 구운 판의 중앙버스정류장 승강장(버스가 서는 자리에서 ISLAND_BACK 뒤가 가운데, 길이 ISLAND_L, 폭 ISLAND_W)마다
// 둘레 차로 가운데선이 승강장 테두리에서 (차 반폭 + 0.3m) 안으로 들어오는 곳을 센다.
// 일반 차로는 0.9 + 0.3m, 반대 방향 중앙버스차로는 1.25 + 0.3m. 그 승강장에 서는 방향의 중앙버스차로는 버스가 승강장 옆으로 비켜 서므로 뺀다.
const board = decodeBoard(JSON.parse(readFileSync(new URL('../public/data/board.json', import.meta.url), 'utf8')));

/** 승강장마다 [이름, 가장 깊이 들어온 차로 가운데선의 여유(m, 음수면 테두리 안), 그 차로 종류] */
export function medianLaneClearance(): [string, number, string][] {
  const edges = buildCarGraph(board.roads, decodeLanes(JSON.parse(readFileSync(new URL('../public/data/road.json', import.meta.url), 'utf8')).lanes));
  const routes = makeBusRoutes(board.buses, edges, undefined, board.crosswalks);
  const { portals } = busStopPortals(routes, edges);
  const out: [string, number, string][] = [];
  for (const p of portals) {
    if (!p.median) continue;
    const cx = p.x - Math.cos(p.yaw) * ISLAND_BACK;
    const cz = p.z - Math.sin(p.yaw) * ISLAND_BACK;
    let worst = Infinity;
    let what = '';
    for (const e of edges) {
      for (let k = 0; k + 5 < e.p.length; k += 3) {
        const [ax, az, bx, bz] = [e.p[k], e.p[k + 2], e.p[k + 3], e.p[k + 5]];
        if (Math.min(Math.hypot(ax - cx, az - cz), Math.hypot(bx - cx, bz - cz)) > ISLAND_L / 2 + 60) continue;
        const L = Math.hypot(bx - ax, bz - az);
        if (L < 1e-6) continue;
        const h = Math.atan2(bz - az, bx - ax);
        const same = Math.cos(h - p.yaw) > 0.7;
        for (let t = 0; t <= L; t += 0.5) {
          const at = e.cum[k / 3] + t;
          const all: [number, number, string][] = [];
          for (let l = 0; l < e.lanes; l++) all.push([laneOff(e, l, at), 1.2, '일반']);
          if (e.med && !same) all.push([laneOff(e, MED, at), 1.55, '반대 방향 버스']);
          for (const [off, m, kind] of all) {
            const x = ax + ((bx - ax) * t) / L - Math.sin(h) * off;
            const z = az + ((bz - az) * t) / L + Math.cos(h) * off;
            const u = (x - cx) * Math.cos(p.yaw) + (z - cz) * Math.sin(p.yaw);
            const v = -(x - cx) * Math.sin(p.yaw) + (z - cz) * Math.cos(p.yaw);
            const du = Math.max(0, Math.abs(u) - ISLAND_L / 2);
            const dv = Math.max(0, Math.abs(v) - ISLAND_W / 2);
            // 테두리 밖이면 거리, 안이면 안쪽 깊이(음수)
            const d = du > 0 || dv > 0 ? Math.hypot(du, dv) : -Math.min(ISLAND_L / 2 - Math.abs(u), ISLAND_W / 2 - Math.abs(v));
            if (d - m < worst) (worst = d - m), (what = kind);
          }
        }
      }
    }
    out.push([`${p.name}(${p.x.toFixed(0)},${p.z.toFixed(0)})`, worst, what]);
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const all = medianLaneClearance();
  const bad = all.filter(([, d]) => d < 0);
  console.log(`중앙 정류장 승강장 ${all.length}곳 가운데 차로 가운데선이 테두리에서 (차 반폭 + 0.3m) 안으로 지나는 곳 ${bad.length}곳`);
  for (const [n, d, k] of bad) console.log(`  ${n} ${k} 차로 ${d.toFixed(2)}m`);
}
