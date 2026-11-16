// 횡단보도가 걷는 길에 이어졌는지 원인별로 센다(브라우저 없이): node tools/measure-links.ts
// public/data 의 판·바닥 면으로 걷는 길을 다시 굽되 파일은 쓰지 않는다. 안 이어진 끝은 축 끝 바깥 3m 자리로 까닭을 나누고,
// '큰길 찻길'은 그 자리를 덮은 면(교차로 면·찻길 띠·분리대)으로 다시 나눈다. 다섯 교차로 60m 안은 하나씩 적는다.
// 이을 필요 없는 것은 따로 센다: 골목을 건너는 횡단보도 가운데 골목 선이 칠 위를 지나는 것(골목 선의 걷는 띠가 길 폭을 덮어 이미 건넌다),
// 항공사진(카카오 스카이뷰)에 칠이 없는 옛 자료(OLD, 자리로 적는다).
import { readFileSync } from 'node:fs';
import { decodeBoard } from '../src/data/board.ts';
import { carriageSections, decodeSurface, isGroundRoad, roadJoints } from '../src/data/surface.ts';
import { boardWalkNet } from './lib/walknet.ts';
import { ALLEY, decodeWalk } from '../src/sim/walknet.ts';

/** 항공사진에 칠이 없는 횡단보도 자리(m, 2026-11-16 확인) */
const OLD: [number, number][] = [[-29, -162]];

const data = (f: string) => JSON.parse(readFileSync(new URL(`../public/data/${f}`, import.meta.url), 'utf8'));
const b = decodeBoard(data('board.json'));
const sf = decodeSurface(data('surface.json'));
const p = data('surface-polys.json');
const dm = (r: number[]) => r.map((v) => v / 10);
const result = new Map<number, string | null>();
const net = boardWalkNet(b, sf.faces, sf.draw.map((f) => f.outer), { car: p.car.map((c: number[]) => [c[0], dm(c.slice(1))]), med: p.med.map(dm), isl: p.isl.map(dm), walk: p.walk.map(dm) }, (xw, why) => result.set(xw, why));

const inR = (r: ArrayLike<number>, x: number, z: number) => {
  let c = false;
  for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) if (r[i + 1] > z !== r[j + 1] > z && x < r[i] + ((z - r[i + 1]) / (r[j + 1] - r[i + 1])) * (r[j] - r[i])) c = !c;
  return c;
};
const joints = roadJoints(b.roads);
const ribbons = b.roads.map((r, i) => {
  if (!isGroundRoad(r) || r.cls > 3) return null;
  const s = carriageSections(r, 0, Infinity, joints.subarray(i * 4, i * 4 + 4));
  return [...s.flatMap((q) => [q.lx, q.lz]), ...s.reverse().flatMap((q) => [q.rx, q.rz])];
});
/** 큰길 찻길 끝을 덮은 면: 교차로 면(등급 3 이하), 찻길 띠, 분리대 */
const hardWhat = (xw: number, sg: number) => {
  const c = b.crosswalks[xw];
  const x = c.x + c.ux * (c.half + 3) * sg;
  const z = c.z + c.uz * (c.half + 3) * sg;
  if (sf.faces.some((f) => f.cls <= 3 && inR(f.outer, x, z) && !f.holes.some((h) => inR(h, x, z)))) return '교차로 면';
  if (p.med.some((m: number[]) => inR(dm(m), x, z))) return '분리대';
  if (ribbons.some((r) => r && inR(r, x, z))) return '찻길 띠';
  return '그 밖';
};
const why = (xw: number) => {
  const w = result.get(xw);
  if (!w) return w;
  return w.replace(/(a|b):큰길 찻길/g, (_, e) => `${e}:큰길 찻길(${hardWhat(xw, e === 'a' ? -1 : 1)})`);
};
const g = decodeWalk(net);
/** 골목 선이 횡단보도 칠(축 ± 폭/2 사각형) 위를 지나는가 */
const alleyOver = (xw: number) => {
  const c = b.crosswalks[xw];
  for (let a = 0; a < g.adj.length; a++)
    for (let k = 0; k < g.adj[a].length; k++) {
      const n = g.adj[a][k];
      if (n < a || g.kind[a][k] !== ALLEY) continue;
      const [ax, az, bx, bz] = [g.nx[a * 2], g.nx[a * 2 + 1], g.nx[n * 2], g.nx[n * 2 + 1]];
      const L = Math.hypot(bx - ax, bz - az);
      for (let d = 0; d <= L; d += 0.25) {
        const x = ax + ((bx - ax) * d) / (L || 1) - c.x;
        const z = az + ((bz - az) * d) / (L || 1) - c.z;
        if (Math.abs(x * c.ux + z * c.uz) <= c.half && Math.abs(x * c.uz - z * c.ux) <= c.wid / 2) return true;
      }
    }
  return false;
};
const count = new Map<string, number>();
const skip = new Map<string, number[]>();
let linked = 0;
for (const [xw] of result) {
  const w = why(xw);
  if (!w) {
    linked++;
    continue;
  }
  const c = b.crosswalks[xw];
  const k = OLD.some(([x, z]) => Math.hypot(c.x - x, c.z - z) < 2) ? '항공사진에 칠 없음' : w.startsWith('골목 위') && alleyOver(xw) ? '골목 위(골목 선의 걷는 띠가 덮음)' : '';
  if (k) {
    skip.set(k, [...(skip.get(k) ?? []), xw]);
    continue;
  }
  for (const part of w.split(/ (?=[ab]:)/)) {
    const k = part.replace(/^골목 위 /, '').replace(/^[ab]:/, '');
    count.set(k, (count.get(k) ?? 0) + 1);
  }
}
console.log(`횡단보도 ${b.crosswalks.length}개 가운데 이어진 것 ${linked}개(${((100 * linked) / b.crosswalks.length).toFixed(1)}%)`);
const nSkip = [...skip.values()].reduce((a, v) => a + v.length, 0);
console.log(`이을 필요 없음 ${nSkip}개(${[...skip].map(([k, v]) => `${k} ${v.length}`).join(', ')}) → 이어진 것 ÷ (전체 − 이을 필요 없음) = ${((100 * linked) / (b.crosswalks.length - nSkip)).toFixed(1)}%`);
console.log(`안 이어진 끝의 까닭: ${[...count].sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k} ${v}`).join(', ')}`);
const SITES: [string, number, number][] = [
  ['합정', -497, 250],
  ['홍대입구역', 222, -410],
  ['동교동삼거리', 694, -804],
  ['서교동사거리', -68, -135],
  ['망원역', -776, -495],
];
for (const [name, x, z] of SITES) {
  const near = b.crosswalks.map((c, i) => [c, i] as const).filter(([c]) => Math.hypot(c.x - x, c.z - z) < 60);
  const bad = near.filter(([, i]) => why(i));
  console.log(`${name} 60m: ${near.length}개 가운데 이어진 것 ${near.length - bad.length}개${bad.length ? ' — ' + bad.map(([c, i]) => `${i}(${c.x.toFixed(0)},${c.z.toFixed(0)}) ${why(i)}`).join('; ') : ''}`);
}
