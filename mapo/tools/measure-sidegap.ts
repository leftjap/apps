// 큰길 변에 보도 면이 있는지 잰다(브라우저 없이): node tools/measure-sidegap.ts
// 땅 위 큰길(등급 3 이하) 가운데선을 5m 마다 찍고, 쪽마다(한 방향 길은 바깥쪽만) 연석에서 6m 안에 보도 면(surface-polys walk, 교통섬 포함)이 있는지 본다.
// 교차로 면 안 자리는 빼고(모퉁이에서는 옆 쪽이 다른 길 찻길이다), 보도 면이 없는 쪽은 도로 부지(도시생태현황도 도로 부지·광장, 실폭도로) 자료가
// 그 6m 안에 있는지로 다시 나눈다. 보도 면이 건물 외곽선·찻길 띠·교차로 면과 겹치는 넓이도 잰다.
import { existsSync, readFileSync } from 'node:fs';
import { curbAt, decodeBoard, GK } from '../src/data/board.ts';
import { decodeSurface, isGroundRoad } from '../src/data/surface.ts';
import { BOARD_R, toXZ } from '../src/geo.ts';
import { bitsAt, fillBits, makeBits } from './lib/bits.ts';

const data = (f: string) => JSON.parse(readFileSync(new URL(`../public/data/${f}`, import.meta.url), 'utf8'));
const b = decodeBoard(data('board.json'));
const sf = decodeSurface(data('surface.json'));
const p = data('surface-polys.json') as { car: number[][]; walk: number[][]; isl: number[][] };
const dm = (r: number[]) => r.map((v) => v / 10);
const WALK = 1;
const FACE = 2;
const GKL = 4;
const RW = 8;
const BLDG = 16;
const CAR = 32;
const B = makeBits(-BOARD_R, -BOARD_R, BOARD_R, BOARD_R, 0.5);
fillBits(B, [...p.walk.map(dm), ...p.isl.map(dm)], WALK);
for (const f of sf.faces) fillBits(B, [f.outer, ...f.holes], FACE);
for (const a of b.groundAreas) if (a.kind === GK.ROADSIDE || a.kind === GK.PLAZA) fillBits(B, [a.outer, ...a.holes], GKL);
const rw = new URL('./raw/gis-roads.json', import.meta.url);
if (existsSync(rw)) for (const x of JSON.parse(readFileSync(rw, 'utf8')).roads as { r: [number, number][][] }[]) fillBits(B, x.r.map((ring) => ring.flatMap(([a, c]) => toXZ(a, c))), RW);
for (const q of b.buildings) fillBits(B, [q.pts], BLDG);
for (const c of p.car) fillBits(B, [dm(c.slice(1))], CAR);

let n = 0;
let miss = 0;
let noLand = 0;
const hot = new Map<string, number>();
for (const r of b.roads) {
  if (!isGroundRoad(r) || r.cls > 3) continue;
  let s = 0;
  for (let k = 0; k + 5 < r.p.length; k += 3) {
    const [ax, az, bx, bz] = [r.p[k], r.p[k + 2], r.p[k + 3], r.p[k + 5]];
    const L = Math.hypot(bx - ax, bz - az);
    const nx = -(bz - az) / (L || 1);
    const nz = (bx - ax) / (L || 1);
    for (let t = 2.5; t < L; t += 5) {
      const x = ax + ((bx - ax) * t) / L;
      const z = az + ((bz - az) * t) / L;
      if (bitsAt(B, x, z) & FACE) continue;
      for (const sd of r.oneway ? [1] : [1, -1]) {
        const c = curbAt(r, s + t, sd);
        let walk = false;
        let land = false;
        for (let o = c; o < c + 6; o += 0.5) {
          const f = bitsAt(B, x + nx * o * sd, z + nz * o * sd);
          if (f & WALK) walk = true;
          if (f & (GKL | RW) && !(f & (CAR | BLDG))) land = true;
        }
        n++;
        if (walk) continue;
        miss++;
        if (!land) noLand++;
        const key = `${Math.round(x / 100) * 100},${Math.round(z / 100) * 100}`;
        hot.set(key, (hot.get(key) ?? 0) + 1);
      }
    }
    s += L;
  }
}
let overB = 0;
let overC = 0;
for (let i = 0; i < B.v.length; i++) {
  if (!(B.v[i] & WALK)) continue;
  if (B.v[i] & BLDG) overB++;
  if (B.v[i] & (CAR | FACE)) overC++;
}
console.log(`큰길 변 ${n}곳(5m 간격, ${((n * 5) / 1000).toFixed(1)}km) 가운데 6m 안에 보도 면 없음 ${miss}곳(${((miss * 5) / 1000).toFixed(1)}km, ${((100 * miss) / n).toFixed(1)}%), 그 가운데 도로 부지 자료(도시생태현황도·실폭도로)도 없음 ${noLand}곳(${((100 * noLand) / n).toFixed(1)}%)`);
console.log(`보도 면이 건물 외곽선과 겹치는 넓이 ${(overB * 0.25).toFixed(0)}m², 찻길 띠·교차로 면과 겹치는 넓이 ${(overC * 0.25).toFixed(0)}m²(0.5m 칸)`);
console.log(`보도 면 없는 곳이 많은 100m 칸: ${[...hot].sort((x, y) => y[1] - x[1]).slice(0, 10).map(([k, v]) => `${k}:${v}`).join(' ')}`);
