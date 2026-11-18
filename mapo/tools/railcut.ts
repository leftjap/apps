// W45 자료 옮기기: 지금 walk.json 그물(ccdc24b1)에 굽기와 같은 철도 부지 막힘(walkfix blockMap 의 rails, 몸 여유 CLEAR)을 적용한다.
// HEAD 코드로 그물을 처음부터 다시 구우면 철도와 무관한 곳까지 노드 865개가 달라져(판·찻길 면 자료가 그물보다 새것) 사람 판 전체가 바뀌므로,
// 철도 부지에 닿는 선만 잘라 내고(남는 조각 ≥ 0.25m 는 새 끝 노드로 남김) 걷는 띠·노드 원을 철도 부지 앞까지 줄인 뒤 걷는 면·면 폭·갈래 영역을 다시 굽는다.
// 선 차례와 노드 번호는 그대로 두고, 잘린 선 자리에 조각을 넣으며, 이웃이 없어진 노드는 그대로 둔다(walknet nearest 가 이웃 없는 노드를 건너뛴다).
import { readFileSync, writeFileSync } from 'node:fs';
import { decodeBoard } from '../src/data/board.ts';
import { railSite } from '../src/sim/railSite.ts';
import { blockMap, CLEAR } from './lib/walkfix.ts';
import { bitsAt } from './lib/bits.ts';
import { decodeSurface } from '../src/data/surface.ts';
import { BOARD_R } from '../src/geo.ts';
import { underpasses, ZONES } from '../src/sim/people/zones.ts';
const file = new URL('../public/data/walk.json', import.meta.url);
const j = JSON.parse(readFileSync(file, 'utf8'));
const board = decodeBoard(JSON.parse(readFileSync(new URL('../public/data/board.json', import.meta.url), 'utf8')));
const site = railSite(board.lines);
const bad = (x: number, z: number) => site.inside(x, z, CLEAR);
// 노드(dm 정수)
const nodes: number[] = [];
{
  let x = 0;
  let z = 0;
  for (let i = 0; i < j.n.length; i += 2) (x += j.n[i]), (z += j.n[i + 1]), nodes.push(x, z);
}
const N0 = nodes.length / 2;
const X = (n: number) => nodes[n * 2] / 10;
const Z = (n: number) => nodes[n * 2 + 1] / 10;
const r: number[] = j.r.slice();
const node = (x: number, z: number) => (nodes.push(Math.round(x * 10), Math.round(z * 10)), r.push(0), nodes.length / 2 - 1);
type E = { a: number; b: number; code: number; lo: number; hi: number; from: number; s0: number };
const src: E[] = [];
{
  let a = 0;
  for (let k = 0; k < j.e.length; k += 5) {
    a += j.e[k];
    src.push({ a, b: a + j.e[k + 1], code: j.e[k + 2], lo: j.e[k + 3], hi: j.e[k + 4], from: k / 5, s0: 0 });
  }
}
/** (x, z)에서 (nx, nz) 쪽으로 철도 부지(+CLEAR)에 닿기 전까지 거리(lim 까지, 0.05m 단위) */
const room = (x: number, z: number, nx: number, nz: number, lim: number) => {
  let d = 0;
  while (d + 0.05 <= lim && !bad(x + nx * (d + 0.05), z + nz * (d + 0.05))) d += 0.05;
  return d;
};
const near = (x: number, z: number, R: number) => site.inside(x, z, CLEAR + R);
const out: E[] = [];
let cutLen = 0;
let bandN = 0;
for (const e of src) {
  const [ax, az, bx, bz] = [X(e.a), Z(e.a), X(e.b), Z(e.b)];
  const L = Math.hypot(bx - ax, bz - az);
  const reach = Math.max(-e.lo, e.hi) / 10;
  if (!near(ax, az, L + reach) && !near(bx, bz, L + reach)) {
    out.push(e);
    continue;
  }
  const n = Math.max(1, Math.ceil(L / 0.25));
  const ok: boolean[] = [];
  for (let q = 0; q <= n; q++) ok.push(!bad(ax + ((bx - ax) * q) / n, az + ((bz - az) * q) / n));
  const ux = L > 1e-6 ? (bx - ax) / L : 1;
  const uz = L > 1e-6 ? (bz - az) / L : 0;
  for (let q = 0; q <= n; ) {
    if (!ok[q]) {
      cutLen += L / (n + 1);
      q++;
      continue;
    }
    let p = q;
    while (p + 1 <= n && ok[p + 1]) p++;
    const s0 = (q / n) * L;
    const s1 = (p / n) * L;
    if (s1 - s0 >= 0.25 || (q === 0 && p === n)) {
      const na = q === 0 ? e.a : node(ax + ux * s0, az + uz * s0);
      const nb = p === n ? e.b : node(ax + ux * s1, az + uz * s1);
      // 걷는 띠를 철도 부지 앞까지 줄인다(굽기의 room 과 같이 0.1m 여유)
      let lo = -e.lo / 10;
      let hi = e.hi / 10;
      for (let s = s0; s <= s1 + 1e-6; s += Math.min(0.2, Math.max(0.05, s1 - s0))) {
        const x = ax + ux * s;
        const z = az + uz * s;
        if (hi > 0) hi = Math.min(hi, room(x, z, -uz, ux, hi + 0.1) - 0.1);
        if (lo > 0) lo = Math.min(lo, room(x, z, uz, -ux, lo + 0.1) - 0.1);
      }
      const nlo = Math.ceil(-Math.max(0, lo) * 10 - 1e-6);
      const nhi = Math.floor(Math.max(0, hi) * 10 + 1e-6);
      if (nlo !== e.lo || nhi !== e.hi || na !== e.a || nb !== e.b) bandN++;
      out.push({ ...e, a: na, b: nb, lo: Math.max(e.lo, nlo), hi: Math.min(e.hi, nhi), s0 });
    }
    q = p + 1;
  }
}
// 새로 생긴 노드와 이웃이 남은 노드의 원 반지름: 철도 부지 앞까지(16 방향)
const deg = new Uint8Array(nodes.length / 2);
for (const e of out) deg[e.a] = deg[e.b] = 1;
let radN = 0;
for (let k = 0; k < nodes.length / 2; k++) {
  if (!deg[k]) continue;
  let R = r[k] / 10;
  if (k >= N0) {
    // 새 끝 노드: 붙은 선 띠 가운데 가장 넓은 반폭(최대 3m, 0.6 이상)에서 시작
    R = 0.6;
    for (const e of out) if (e.a === k || e.b === k) R = Math.max(R, -e.lo / 10, e.hi / 10);
    R = Math.min(3, R);
  } else if (!near(X(k), Z(k), R)) continue;
  for (let q = 0; q < 16 && R > 0; q++) R = Math.min(R, room(X(k), Z(k), Math.cos((q * Math.PI) / 8), Math.sin((q * Math.PI) / 8), R));
  const v = k >= N0 ? Math.max(0, Math.floor(R * 10) - 1) : Math.min(r[k], Math.max(0, Math.floor(R * 10) - 1));
  if (v !== r[k]) radN++;
  r[k] = v;
}
// 한 덩어리 확인
const adj: number[][] = Array.from({ length: nodes.length / 2 }, () => []);
for (const e of out) adj[e.a].push(e.b), adj[e.b].push(e.a);
for (let k = 0; k < j.x.length; k += 17) adj[j.x[k + 1]].push(j.x[k + 2]), adj[j.x[k + 2]].push(j.x[k + 1]); // 횡단보도 연결
const comp = new Int32Array(nodes.length / 2).fill(-1);
const sizes: number[] = [];
for (let s = 0; s < comp.length; s++) {
  if (comp[s] >= 0 || !adj[s].length) continue;
  const c = sizes.length;
  let m = 0;
  const st = [s];
  comp[s] = c;
  while (st.length) {
    const p = st.pop()!;
    m++;
    for (const q of adj[p]) if (comp[q] < 0) (comp[q] = c), st.push(q);
  }
  sizes.push(m);
}
const main = sizes.indexOf(Math.max(...sizes));
const dropped = out.filter((e) => comp[e.a] !== main);
const kept = out.filter((e) => comp[e.a] === main);
// 문: 원래 선 번호 + a 에서 거리 → 남은 조각
const doors: number[] = [];
let doorDrop = 0;
let reattached = 0;
const res5 = new Map<number, number[]>();
const lost: number[] = [];
const byFrom = new Map<number, number[]>();
kept.forEach((e, i) => (byFrom.get(e.from) ?? byFrom.set(e.from, []).get(e.from)!).push(i));
for (let k = 0; k < j.d.length; k += 5) {
  const from = j.d[k + 1];
  const t = j.d[k + 2] / 10;
  let put = false;
  const pieces = byFrom.get(from) ?? [];
  for (const i of pieces) {
    const e = kept[i];
    const L = Math.hypot(X(e.b) - X(e.a), Z(e.b) - Z(e.a));
    // 잘리지 않은 선은 그대로, 잘린 선은 문이 놓인 조각으로(dm 반올림 여유 0.15m)
    if (pieces.length === 1 && e.s0 === 0 && e.a === src[from].a && e.b === src[from].b) (res5.set(k, [j.d[k], i, j.d[k + 2], j.d[k + 3], j.d[k + 4]]), (put = true));
    else if (t >= e.s0 - 0.15 && t <= e.s0 + L + 0.15) (res5.set(k, [j.d[k], i, Math.round(Math.max(0, Math.min(L, t - e.s0)) * 10), j.d[k + 3], j.d[k + 4]]), (put = true));
    if (put) break;
  }
  if (!put) lost.push(k);
}
// 잘린 선에 붙어 있던 문은 굽기(⑤ 건물 문)와 같은 조건으로 25m 안 남은 선에 다시 붙인다: 문턱 → 선 위 점이 큰길 찻길·다른 건물·철도 부지를 지나지 않는다
if (lost.length) {
  const surface = decodeSurface(JSON.parse(readFileSync(new URL('../public/data/surface.json', import.meta.url), 'utf8')));
  const P = JSON.parse(readFileSync(new URL('../public/data/surface-polys.json', import.meta.url), 'utf8'));
  const dm = (a: number[]) => a.map((v) => v / 10);
  const { B, roadNear } = blockMap({
    bounds: [-BOARD_R, -BOARD_R, BOARD_R, BOARD_R],
    roads: board.roads,
    faces: surface.faces,
    draw: surface.draw.map((f) => f.outer),
    car: P.car.map((c: number[]) => [c[0], dm(c.slice(1))] as [number, number[]]),
    med: P.med.map(dm),
    buildings: board.buildings.map((q) => q.pts),
    crosswalks: board.crosswalks,
    underpasses: underpasses(board.roads, ...ZONES.mangwon),
    rails: board.lines,
  });
  for (const k of lost) {
    const [ox, oz] = [j.d[k + 3] / 10, j.d[k + 4] / 10];
    const cand: [number, number, number][] = [];
    kept.forEach((e, i) => {
      if ((e.code >> 4) === 3) return;
      const [ax, az, bx, bz] = [X(e.a), Z(e.a), X(e.b), Z(e.b)];
      const L = Math.hypot(bx - ax, bz - az) || 1e-6;
      const t = Math.max(0, Math.min(L, ((ox - ax) * (bx - ax) + (oz - az) * (bz - az)) / L));
      const d = Math.hypot(ax + ((bx - ax) * t) / L - ox, az + ((bz - az) * t) / L - oz);
      if (d < 25) cand.push([i, t, d]);
    });
    cand.sort((p, q) => p[2] - q[2]);
    let put = false;
    for (const [i, t, d] of cand.slice(0, 4)) {
      const e = kept[i];
      const L = Math.hypot(X(e.b) - X(e.a), Z(e.b) - Z(e.a)) || 1e-6;
      const sx = X(e.a) + ((X(e.b) - X(e.a)) * t) / L;
      const sz = Z(e.a) + ((Z(e.b) - Z(e.a)) * t) / L;
      const n = Math.ceil(d / 0.125);
      let ok = true;
      for (let q = 0; q <= n && ok; q++) {
        const x = ox + ((sx - ox) * q) / n;
        const z = oz + ((sz - oz) * q) / n;
        if (roadNear(x, z) || bad(x, z) || (q > 4 && bitsAt(B, x, z) & 2)) ok = false;
      }
      if (!ok) continue;
      res5.set(k, [j.d[k], i, Math.round(t * 10), j.d[k + 3], j.d[k + 4]]);
      reattached++;
      put = true;
      break;
    }
    if (!put) doorDrop++;
  }
}
// 문은 원래 차례(건물 차례) 그대로
for (let k = 0; k < j.d.length; k += 5) if (res5.has(k)) doors.push(...res5.get(k)!);
// 쓰기(노드 차례 그대로, 새 노드는 끝에)
const n: number[] = [];
for (let k = 0; k < nodes.length / 2; k++) n.push(k ? nodes[k * 2] - nodes[k * 2 - 2] : nodes[0], k ? nodes[k * 2 + 1] - nodes[k * 2 - 1] : nodes[1]);
const e: number[] = [];
let pa = 0;
for (const q of kept) e.push(q.a - pa, q.b - q.a, q.code, q.lo, q.hi), (pa = q.a);
const res = { ...j, n, e, r, d: doors };
delete res.a;
delete res.w;
delete res.j;
writeFileSync(file, JSON.stringify(res));
console.log(
  `철도 부지 자르기: 선 ${src.length} → ${kept.length}, 잘라 낸 길이 ${cutLen.toFixed(1)}m, 새 노드 ${nodes.length / 2 - N0}, 띠·끝을 바꾼 선 ${bandN}, 원 줄인 노드 ${radN}, 덩어리 ${sizes.length}개 [${sizes.sort((a, b) => b - a).slice(0, 5)}](버린 선 ${dropped.length}), 문 ${j.d.length / 5} → ${doors.length / 5}(다시 붙임 ${reattached}, 버림 ${doorDrop})`,
);
await import('./walk-area.ts');
