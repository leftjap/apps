// 보이는 곳 사람 수 측정(브라우저 없이 사람만 돌린다): node tools/measure-crowd.ts [초] [씨앗,...]
// 가까이 보는 세 시점(토 21:00 클럽거리, 토 18:00 걷고싶은거리, 일 14:00 연트럴파크)과 판 전체(토 21:00)를 앱과 같은 카메라(화각 32°, 1440×900)로 두고,
// 화면 안(투영 좌표 ±1) 사람 수를 실제 추정 인원과 견준다. 실제 추정은 구역 인구 × 밖에 나온 몫 × 명소 가중치를 걷는 선에 퍼뜨린 것(walkers.expected)이다.
// 사람 모형 정점 수도 앱과 같은 그리기 단계(walkerLod)로 센다. 재작업 W21 부터 사람은 src/sim/people(보는 곳 과장 EXAG 배, 문은 walk.json 에 구운 문턱).
// main.ts 와 같은 출입구(역 출구·정류장·나들목·한강공원·건물 문)를 쓰고, 차는 돌리지 않는다(정류장에 버스가 서지 않는다).
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { decodeBoard } from '../src/data/board.ts';
import { decodeWalk } from '../src/sim/walknet.ts';
import { buildCarGraph } from '../src/sim/graph.ts';
import { makeIntersections } from '../src/sim/intersection/index.ts';
import { busStopPortals, makeBusRoutes } from '../src/sim/buses.ts';
import { makeSimProvider } from '../src/sim/provider.ts';
import { arrivals } from '../src/sim/trains.ts';
import { makePeople, underpasses, ZONES } from '../src/sim/people/index.ts';
import { FAR_VERTS, NEAR_VERTS, walkerLod } from '../src/render/walkers.ts';
import { BOARD_R } from '../src/geo.ts';

const SECS = Number(process.argv[2] ?? 90);
const SEEDS = (process.argv[3] ?? '5,9').split(',').map(Number);
// [이름, 요일, 시각(시), 보는 지점 x, z, 거리(0 이면 판 전체에 맞춤), 기울기, 돌림] (앱 주소의 view 와 같은 값)
const CASES: [string, number, number, number, number, number, number, number][] = [
  ['토 21:00 클럽거리', 6, 21, 290, 40, 130, 25, 0],
  ['토 18:00 걷고싶은거리', 6, 18, 330, -350, 150, 25, 0],
  ['일 14:00 연트럴파크', 0, 14, 380, -1110, 150, 25, 0],
  ['토 21:00 판 전체', 6, 21, 0, 120, 0, 55, -14],
];
const W = 1440;
const H = 900;
const FOV = 32;

const data = (f: string) => JSON.parse(readFileSync(new URL(`../public/data/${f}`, import.meta.url), 'utf8'));
const board = decodeBoard(data('board.json'));
const graph = decodeWalk(data('walk.json'));
const carGraph = buildCarGraph(board.roads);
const stops = busStopPortals(makeBusRoutes(board.buses, carGraph, undefined, board.crosswalks), carGraph);
const portals = [
  ...board.exits.map((e) => ({ kind: 'exit' as const, key: e.st, x: e.x, z: e.z })),
  ...stops.portals,
  ...underpasses(board.roads, ...ZONES.mangwon).map(([x, z]) => ({ kind: 'exit' as const, key: '망원나들목', x, z })),
  ...Array.from({ length: board.picnic.length / 2 }, (_, i) => ({ kind: 'exit' as const, key: '망원한강공원', x: board.picnic[i * 2], z: board.picnic[i * 2 + 1] })),
];

function camera(tx: number, tz: number, dist: number, tiltDeg: number, turnDeg: number) {
  const cam = new THREE.PerspectiveCamera(FOV, W / H, 20, 40000);
  const half = Math.atan(Math.tan((FOV * Math.PI) / 360) * cam.aspect);
  const d = dist || Math.min(15000, (BOARD_R * 1.12) / Math.tan(half)); // render/scene.ts 의 fitDist
  const tilt = (tiltDeg * Math.PI) / 180;
  const turn = (turnDeg * Math.PI) / 180;
  cam.position.set(tx + d * Math.sin(tilt) * Math.sin(turn), d * Math.cos(tilt), tz + d * Math.sin(tilt) * Math.cos(turn));
  cam.lookAt(tx, 0, tz);
  cam.updateMatrixWorld();
  const e = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse).elements;
  const p = new THREE.Vector3();
  const inside = (m: number) => (x: number, z: number) => {
    p.set(x, 0, z).project(cam);
    return p.z < 1 && Math.abs(p.x) < m && Math.abs(p.y) < m;
  };
  return { e, d, onScreen: inside(1.15), screen: inside(1) };
}

const projK = H / (2 * Math.tan((FOV * Math.PI) / 360));
const rows: string[] = [];
for (const [name, dow, h, tx, tz, dist, tilt, turn] of CASES) {
  const acc = { have: 0, real: 0, n: 0, near: 0, verts: 0, kIn: 0, kOut: 0, samples: 0 };
  for (const seed of SEEDS) {
    const provider = makeSimProvider();
    const signals = makeIntersections(carGraph, { crosswalks: board.crosswalks, stopLines: board.stopLines }).S;
    const sim = makePeople(graph, portals, provider, seed, 8000, { buildings: board.buildings, walkLeft: (xw, tod) => (signals.crossSite[xw] < 0 ? -1 : signals.walkLeft(xw, tod)), busy: new Uint32Array(board.crosswalks.length) });
    const cam = camera(tx, tz, dist, tilt, turn);
    // main.ts 의 사람 보는 곳: 반지름 = 보는 거리 × 1.2, 150~2,200m
    sim.setFocus(tx, tz, Math.min(2200, Math.max(150, cam.d * 1.2)));
    const start = { tod: h * 3600, dow, doy: 320 };
    sim.warm(300, start);
    let now = { ...start };
    let prev = now.tod;
    for (let s = 0; s < SECS * 10; s++) {
      now = { ...now, tod: (now.tod + 0.1) % 86400 };
      for (const a of arrivals(board.lines, prev, now.tod).slice(0, 12)) sim.burst(a.name, Math.max(1, Math.min(14, Math.round(provider.alighting(now, a.name) / 150))));
      prev = now.tod;
      sim.step(0.1, now);
      if (s % 10) continue;
      const w = sim.w;
      acc.samples++;
      acc.n += w.n;
      for (let i = 0; i < w.n; i++) {
        if (cam.screen(w.x[i], w.z[i])) acc.have++;
        const lod = walkerLod(cam.e, projK, w.x[i], w.z[i]);
        if (lod === 1) (acc.near++, (acc.verts += NEAR_VERTS));
        else if (lod === 2) acc.verts += FAR_VERTS;
      }
      const [kIn, kOut] = sim.scale();
      acc.kIn += kIn;
      acc.kOut += kOut;
      if (s % 100 === 0) acc.real += sim.expected(cam.screen, now) * 10;
    }
  }
  const S = acc.samples;
  const f = (v: number, d = 0) => (v / S).toFixed(d);
  rows.push(`| ${name} | ${f(acc.have)} | ${f(acc.real)} | ${((acc.have / acc.real) * 100).toFixed(0)}% | ${f(acc.n)} | ${f(acc.kIn, 2)} / ${f(acc.kOut, 2)} | ${f(acc.near)} | ${(acc.verts / S / 1e6).toFixed(2)}M |`);
  console.log(rows[rows.length - 1]);
}
console.log(`\n보는 곳 먼저(과장), 씨앗 ${SEEDS.join('·')}, 미리 300초 뒤 ${SECS}초 동안 1초마다`);
console.log('| 시점 | 화면 안 사람 | 실제 추정(화면 안) | 비율 | 판 전체 사람 | 배율 안/밖 | 자세한 모형 | 사람 정점 |');
console.log('|---|---|---|---|---|---|---|---|');
for (const r of rows) console.log(r);
