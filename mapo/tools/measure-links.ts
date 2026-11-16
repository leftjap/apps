// 횡단보도가 걷는 길에 이어졌는지 원인별로 센다(브라우저 없이): node tools/measure-links.ts
// public/data 의 판·바닥 면으로 걷는 길을 다시 굽되 파일은 쓰지 않는다. 안 이어진 끝은 축 끝 바깥 3m 자리로 까닭을 나누고,
// '큰길 찻길'은 그 자리를 덮은 면(교차로 면·찻길 띠·분리대)으로 다시 나눈다. 다섯 교차로 60m 안은 하나씩 적는다.
import { readFileSync } from 'node:fs';
import { decodeBoard } from '../src/data/board.ts';
import { carriageSections, decodeSurface, isGroundRoad, roadJoints } from '../src/data/surface.ts';
import { boardWalkNet } from './lib/walknet.ts';

const data = (f: string) => JSON.parse(readFileSync(new URL(`../public/data/${f}`, import.meta.url), 'utf8'));
const b = decodeBoard(data('board.json'));
const sf = decodeSurface(data('surface.json'));
const p = data('surface-polys.json');
const dm = (r: number[]) => r.map((v) => v / 10);
const result = new Map<number, string | null>();
boardWalkNet(b, sf.faces, sf.draw.map((f) => f.outer), { car: p.car.map((c: number[]) => [c[0], dm(c.slice(1))]), med: p.med.map(dm), isl: p.isl.map(dm), walk: p.walk.map(dm) }, (xw, why) => result.set(xw, why));

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
const count = new Map<string, number>();
let linked = 0;
for (const [xw] of result) {
  const w = why(xw);
  if (!w) {
    linked++;
    continue;
  }
  for (const part of w.split(/ (?=[ab]:)/)) {
    const k = part.replace(/^[ab]:/, '');
    count.set(k, (count.get(k) ?? 0) + 1);
  }
}
console.log(`횡단보도 ${b.crosswalks.length}개 가운데 이어진 것 ${linked}개(${((100 * linked) / b.crosswalks.length).toFixed(1)}%)`);
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
