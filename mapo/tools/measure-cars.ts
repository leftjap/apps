// 차 움직임 측정(브라우저 없이 시뮬레이션만 돌린다): node tools/measure-cars.ts [잴 초] [씨앗,...] [조건 번호] [사람 0|1]
// main.ts 와 같은 순서로 차·신호·버스(사람을 켜면 사람도)를 만들고, 1/60초 단계로 60초를 버린 뒤 [잴 초](기본 300) 동안 잰다.
// 조건은 일 14:00·토 17:00·평일(화) 08:30, 씨앗 기본 11,23. 사람을 켜면(기본) 사람은 measure-walk 처럼 0.5초씩 600번 미리 돌리고 1/30초마다 한 번 돈다.
// 재는 값(모두 막 나타난 차(fade < 1)·사라진 차는 뺀다):
//  1. 교차로 상자 안(boxed)에서 5초 넘게 멈춘(0.3m/s 아래) 차: 5초가 되는 순간 따라가던 앞 대상의 까닭으로 나누고, 교차로별로 센다.
//  2. 그린 몸통(차종별 길이 × 폭, 배율 1 과 1.15. 길이는 render/cars.ts 처럼 room 안에서만 늘인다)이 겹친 쌍: 0.1초마다 회전 상자로 견준다.
//     같은 차로 앞뒤(같은 구간·같은 차로, 또는 앞 대상 관계), 옆 차로(같은 구간 다른 차로 또는 같은 방향 나란히), 교차로 안(둘 중 하나가 상자 안), 그 밖으로 나눈다.
//  3. 한 단계에 옆으로 0.3m 넘게 움직인 일, 진행 방향이 15° 넘게 꺾인 일: 그 단계에 구간이 바뀌었는지(교차로 드나듦·차로 수 이음매·같은 차로 수 구간 전환)와
//     상자 안·밖이 바뀌었는지로 나눈다.
//  4. 땅 위 찻길(등급 5 이하, 교량 아님)을 달리는 차 가운데가 찻길 면(surface-polys 의 car + 교차로 면 − 교통섬) 밖인 시간 비율과 그 자리(10m 칸, 위 15곳).
//  5. 멈춘 차(0.3m/s 아래)가 차를 따라갈 때 그 차와의 범퍼 사이(그린 길이, 배율 1): 중앙값, 5% 지점, 1m 미만 비율.
//  6. 판 전체 차 평균 속도와 대수(1초마다).
// 합정 교차로(−497,250)와 홍대입구역 교차로(222,−410) 둘레 60m 는 1~5 를 따로 적는다.
// 판 폴더는 MAPO_DATA 로 바꿀 수 있다(고치기 전·후를 같은 판으로 견줄 때). 사례 출력: SHOW=n(옆 튐·꺾임), SHOWOFF=n(찻길 밖), SHOWOV=n(겹침)은 표준 오류로 나간다.
import { readFileSync } from 'node:fs';
import { decodeBoard } from '../src/data/board.ts';
import { decodeSurface, isGroundRoad } from '../src/data/surface.ts';
import { decodeWalk } from '../src/sim/walknet.ts';
import { buildCarGraph, MED } from '../src/sim/graph.ts';
import { makeSignals } from '../src/sim/signals.ts';
import { makeCars } from '../src/sim/cars.ts';
import { busStopPortals, makeBusRoutes } from '../src/sim/buses.ts';
import { makeSimProvider } from '../src/sim/provider.ts';
import { makeWalkers, underpasses, ZONES } from '../src/sim/walkers.ts';
import { BOARD_R } from '../src/geo.ts';
import { bitsAt, fillBits, makeBits } from './lib/bits.ts';

const MEAS = Number(process.argv[2] ?? 300);
const SEEDS = (process.argv[3] ?? '11,23').split(',').map(Number);
const ONLY = process.argv[4] === undefined || process.argv[4] === '-' ? -1 : Number(process.argv[4]);
const WALK = (process.argv[5] ?? '1') === '1';
const DATA = process.env.MAPO_DATA ?? new URL('../public/data/', import.meta.url).pathname;
const CASES: [string, number, number][] = [
  ['일 14:00', 0, 14 * 3600],
  ['토 17:00', 6, 17 * 3600],
  ['평일 08:30', 2, 8.5 * 3600],
];
const SPOTS: [string, number, number][] = [
  ['합정', -497, 250],
  ['홍대입구역', 222, -410],
];
const data = (f: string) => JSON.parse(readFileSync(`${DATA}/${f}`, 'utf8'));
const board = decodeBoard(data('board.json'));
const surface = decodeSurface(data('surface.json'));
const polys = data('surface-polys.json') as { car: number[][]; isl: number[][] };
const walkNet = data('walk.json');
const dm = (r: number[]) => r.map((v) => v / 10);

// 찻길 면 격자(0.5m)
const CAR = 1;
const B = makeBits(-BOARD_R, -BOARD_R, BOARD_R, BOARD_R, 0.5);
for (const c of polys.car) fillBits(B, [dm(c.slice(1))], CAR);
for (const f of surface.faces) fillBits(B, [f.outer, ...f.holes], CAR);

// 그린 크기: render/cars.ts 의 차종별 반길이·반폭과 bodyType(같은 식을 옮겨 둔다)
const CAR_MIX = [0.4, 0.38, 0.1, 0.12];
const bodyType = (t: number) => {
  let u = (t * 7919) % 1;
  for (let k = 0; k < CAR_MIX.length - 1; k++) {
    if (u < CAR_MIX[k]) return k;
    u -= CAR_MIX[k];
  }
  return CAR_MIX.length - 1;
};
const CAR_HL = [2.47, 2.37, 1.82, 2.61];
const CAR_HW = [0.93, 0.95, 0.8, 1.0];
const BUS_HL = [5.74, 5.74, 6.04, 3.72]; // 노선 종류(tint) 0·1 시내, 2 광역, 3 마을
const BUS_HW = [1.245, 1.245, 1.245, 1.1];

const pct = (a: number[], q: number) => (a.length ? [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(q * a.length))] : NaN);
const inc = (o: Record<string, number>, k: string, n = 1) => (o[k] = (o[k] ?? 0) + n);
const WHY = ['없음', '같은 차로 앞차', '다음 구간 앞차', '차로 합침', '다른 구간 차', '신호', '다음 구간 신호', '횡단보도 사람', '교차로 진입 대기', '돌발 서행', '정류장'];

function run(dow: number, tod: number, seed: number) {
  const provider = makeSimProvider();
  const start = { tod, dow, doy: 320 };
  const carGraph = buildCarGraph(board.roads);
  const signals = makeSignals(carGraph, { crosswalks: board.crosswalks, stopLines: board.stopLines });
  const crossBusy = new Uint32Array(board.crosswalks.length);
  const sim = makeCars(carGraph, provider, seed, 5000, makeBusRoutes(board.buses, carGraph, undefined, board.crosswalks), signals, { list: board.crosswalks, busy: crossBusy });
  sim.setFocus(0, 0, 2200, () => false);
  sim.fill(sim.target(start));
  sim.fillBuses(start);
  const c = sim.cars;
  const D = sim.debug();
  const jn = D.junctions;
  const stops = busStopPortals(sim.routes, carGraph);
  let walkers: ReturnType<typeof makeWalkers> | null = null;
  if (WALK) {
    const portals = [
      ...board.exits.map((e) => ({ kind: 'exit' as const, key: e.st, x: e.x, z: e.z })),
      ...stops.portals,
      ...underpasses(board.roads, ...ZONES.mangwon).map(([x, z]) => ({ kind: 'exit' as const, key: '망원나들목', x, z })),
      ...Array.from({ length: board.picnic.length / 2 }, (_, i) => ({ kind: 'exit' as const, key: '망원한강공원', x: board.picnic[i * 2], z: board.picnic[i * 2 + 1] })),
      ...board.buildings.flatMap((b) => {
        let x = 0;
        let z = 0;
        for (let k = 0; k < b.pts.length; k += 2) (x += b.pts[k]), (z += b.pts[k + 1]);
        x /= b.pts.length / 2;
        z /= b.pts.length / 2;
        let a = 0;
        for (let i = 0, j = b.pts.length - 2; i < b.pts.length; j = i, i += 2) a += b.pts[j] * b.pts[i + 1] - b.pts[i] * b.pts[j + 1];
        const inZone = Object.entries(ZONES).some(([id, [cx, cz, r]]) => id !== 'mangwon' && Math.hypot(x - cx, z - cz) < r);
        return inZone && Math.abs(a) / 2 > 40 ? [{ kind: 'door' as const, key: '', x, z, poly: b.pts, h: b.h }] : [];
      }),
    ];
    walkers = makeWalkers(decodeWalk(walkNet), portals, provider, seed, 8000, undefined, signals, { busy: crossBusy, traffic: (l) => sim.approaching(l.xw) });
    for (let i = 0; i < 600; i++) walkers.step(0.5, { ...start, tod: (start.tod - 300 + i * 0.5 + 86400) % 86400 });
  }
  const ground = (i: number) => isGroundRoad(board.roads[carGraph[D.edge[i]].road]);
  const hl = (i: number) => (c.kind[i] === 1 ? BUS_HL[c.tint[i]] ?? 5.74 : CAR_HL[bodyType(c.tint[i])]);
  const hw = (i: number) => (c.kind[i] === 1 ? BUS_HW[c.tint[i]] ?? 1.245 : CAR_HW[bodyType(c.tint[i])]);
  const spotOf = (x: number, z: number) => SPOTS.findIndex(([, sx, sz]) => Math.hypot(x - sx, z - sz) < 60);
  const jnOf = (i: number) => {
    const e = D.edge[i];
    return D.s[i] > carGraph[e].len / 2 ? jn.groupOfEnd[e] : jn.groupOfStart[e];
  };

  // 결과 묶음: 판 전체(0)와 장소별(1, 2)
  const mk = () => ({
    stuck: {} as Record<string, number>,
    stuckJn: {} as Record<string, number>,
    ov: [{}, {}] as Record<string, number>[], // 배율 1, 1.15: 까닭별 쌍·표본(0.1초) 수
    ovPairs: [new Set<string>(), new Set<string>()],
    ovWhere: {} as Record<string, number>,
    side: {} as Record<string, number>,
    turn: {} as Record<string, number>,
    sideWhere: {} as Record<string, number>,
    offN: 0,
    offPart: {} as Record<string, number>,
    onN: 0,
    offWhere: {} as Record<string, number>,
    gaps: [] as number[],
    gapWhy: {} as Record<string, number>,
  });
  const R = [mk(), mk(), mk()];
  const speeds: number[] = [];
  const counts: number[] = [];

  const DT = 1 / 60;
  let now = { ...start };
  const prev = new Map<number, { x: number; z: number; yaw: number; e: number; boxed: number; fade: number }>();
  const stopBox = new Map<number, number>();
  const steps = Math.round((60 + MEAS) / DT);
  let shown = 0;
  let offShown = 0;
  let ovShown = 0;
  const cell = 8;
  for (let st = 0; st < steps; st++) {
    now = { ...now, tod: (now.tod + DT) % 86400 };
    sim.step(DT, now);
    if (walkers && st % 2 === 1) {
      for (const [r, k, i] of sim.dwells) {
        const key = stops.keyOf(r, k);
        const [dx, dz] = sim.door(i);
        walkers.board(key, dx, dz);
      }
      walkers.step(2 * DT, now);
    }
    const on = st * DT >= 60;
    const seenNow = new Set<number>();
    for (let i = 0; i < c.n; i++) {
      const u = c.uid[i];
      seenNow.add(u);
      const p = prev.get(u);
      const x = c.x[i];
      const z = c.z[i];
      const yaw = c.yaw[i];
      const e = D.edge[i];
      const sp = spotOf(x, z);
      const sets = sp >= 0 ? [R[0], R[sp + 1]] : [R[0]];
      if (on && p && p.fade >= 1) {
        // 3. 옆으로 튐·방향 꺾임
        const dx = x - p.x;
        const dz = z - p.z;
        const lat = Math.abs(-dx * Math.sin(p.yaw) + dz * Math.cos(p.yaw));
        let dy = yaw - p.yaw;
        while (dy > Math.PI) dy -= 2 * Math.PI;
        while (dy < -Math.PI) dy += 2 * Math.PI;
        if (lat > 0.3 || Math.abs(dy) > (15 * Math.PI) / 180) {
          const a = carGraph[p.e];
          const b = carGraph[e];
          const kind =
            Math.hypot(dx, dz) > 5
              ? '순간이동(5m 넘게)'
              : p.e !== e
              ? jn.groupOfEnd[p.e] >= 0
                ? '교차로 드나듦(구간 바뀜)'
                : a.lanes !== b.lanes
                  ? '차로 수 이음매'
                  : '구간 전환(차로 수 같음)'
              : p.boxed !== D.boxed[i]
                ? '교차로 드나듦(상자 경계)'
                : '같은 구간 안';
          const tag = `${kind}${c.kind[i] === 1 ? ' (버스)' : ''}`;
          if (process.env.SHOW && shown++ < Number(process.env.SHOW))
            console.error(JSON.stringify({ tag, lat: +lat.toFixed(2), dy: +((dy * 180) / Math.PI).toFixed(1), x: +x.toFixed(1), z: +z.toFixed(1), pe: p.e, e, s: +D.s[i].toFixed(2), len: +carGraph[e].len.toFixed(1), lanes: [a.lanes, b.lanes], lane: D.lane[i], v: +D.v[i].toFixed(1), boxed: [p.boxed, D.boxed[i]], rIn: +jn.rIn[e].toFixed(1), rOut: +jn.rOut[e].toFixed(1), gEnd: jn.groupOfEnd[e], gStart: jn.groupOfStart[e], nextE: D.nextE[i], bus: c.kind[i] === 1 }));
          for (const Rr of sets) {
            if (lat > 0.3) inc(Rr.side, tag);
            if (Math.abs(dy) > (15 * Math.PI) / 180) inc(Rr.turn, tag);
            if (lat > 0.3) inc(Rr.sideWhere, `${Math.round(x / 10) * 10},${Math.round(z / 10) * 10} ${kind}`);
          }
        }
      }
      prev.set(u, { x, z, yaw, e, boxed: D.boxed[i], fade: c.fade[i] });
      if (!on || c.fade[i] < 1) continue;
      // 1. 교차로 상자 안에 멈춤
      if (D.boxed[i] && D.v[i] < 0.3) {
        const t = (stopBox.get(u) ?? 0) + DT;
        stopBox.set(u, t);
        if (t - DT < 5 && t >= 5) {
          let why = c.kind[i] === 1 && D.v[i] === 0 && D.aheadWhy[i] === 0 ? '정류장 정차' : WHY[D.aheadWhy[i]];
          // 앞차 때문이면 앞차를 거슬러 맨 앞 차의 까닭을 붙인다(횡단보도 사람·신호·정류장에 선 차 뒤의 줄은 정상 대기)
          if (D.aheadWhy[i] >= 1 && D.aheadWhy[i] <= 4) {
            let f = D.ahead[i];
            for (let k = 0; k < 20 && f >= 0 && f < c.n && D.aheadWhy[f] >= 1 && D.aheadWhy[f] <= 4 && D.ahead[f] !== f; k++) f = D.ahead[f];
            const root = f >= 0 && f < c.n ? (c.kind[f] === 1 && D.v[f] === 0 && D.aheadWhy[f] === 0 ? '정류장' : WHY[D.aheadWhy[f]]) : '없음';
            why = `${why}(맨 앞: ${root})`;
          }
          const g = jnOf(i);
          for (const Rr of sets) {
            inc(Rr.stuck, why);
            inc(Rr.stuckJn, `교차로 ${g} (${Math.round(x)},${Math.round(z)} 둘레) ${why}`);
          }
        }
      } else stopBox.delete(u);
      // 4. 찻길 면 밖
      if (ground(i) && c.y[i] < 1.5) {
        const off = !(bitsAt(B, x, z) & CAR);
        const g = carGraph[e];
        const part = D.lane[i] === MED ? '중앙버스차로' : D.boxed[i] ? '교차로 곡선' : D.s[i] < jn.rOut[e] || D.s[i] > g.len - jn.rIn[e] ? '이음매 곡선' : '직선';
        for (const Rr of sets) {
          if (off && Rr === R[0] && process.env.SHOWOFF && offShown++ < Number(process.env.SHOWOFF) && st % 600 === 0) {
            const g = carGraph[e];
            console.error(JSON.stringify({ off: 1, x: +x.toFixed(1), z: +z.toFixed(1), e, road: g.road, name: g.name, cls: g.cls, lanes: g.lanes, lane: D.lane[i], lw: g.lw, off0: g.off0, med: g.med, s: +D.s[i].toFixed(1), len: +g.len.toFixed(1), boxed: D.boxed[i], rIn: +jn.rIn[e].toFixed(1), rOut: +jn.rOut[e].toFixed(1), bus: c.kind[i] === 1 }));
          }
          if (off) {
            Rr.offN++;
            inc(Rr.offWhere, `${g.name || '(이름 없음)'} ${Math.round(x / 10) * 10},${Math.round(z / 10) * 10} ${part}`);
            inc(Rr.offPart, part);
          } else Rr.onN++;
        }
      }
      // 5. 멈춘 차의 앞차 간격(그린 길이, 배율 1)
      const f = D.ahead[i];
      if (st % 6 === 0 && D.v[i] < 0.3 && f >= 0 && f !== i && f < c.n && D.aheadWhy[i] <= 4) {
        const gap = Math.hypot(c.x[f] - x, c.z[f] - z) - hl(i) - hl(f);
        for (const Rr of sets) {
          Rr.gaps.push(gap);
          if (gap < 1) inc(Rr.gapWhy, WHY[D.aheadWhy[i]] + (D.boxed[i] || D.boxed[f] ? ' (상자 안)' : ''));
        }
      }
    }
    for (const u of prev.keys()) if (!seenNow.has(u)) prev.delete(u);
    if (!on) continue;
    if (st % 60 === 0) {
      speeds.push(sim.meanSpeed());
      counts.push(c.n);
    }
    // 2. 그린 몸통 겹침(0.1초마다)
    if (st % 6 === 0) {
      const grid = new Map<number, number[]>();
      for (let i = 0; i < c.n; i++) {
        if (c.fade[i] < 1) continue;
        const k = Math.floor(c.x[i] / cell) * 4096 + Math.floor(c.z[i] / cell);
        (grid.get(k) ?? grid.set(k, []).get(k)!).push(i);
      }
      const corners = (i: number, S: number, out: number[]) => {
        const L = hl(i) * Math.min(S, Math.max(1, (c.room[i] - 0.8) / (2 * hl(i))));
        const W = hw(i) * S;
        const cs = Math.cos(c.yaw[i]);
        const sn = Math.sin(c.yaw[i]);
        let k = 0;
        for (const [a, b] of [[1, 1], [1, -1], [-1, -1], [-1, 1]]) {
          out[k++] = c.x[i] + a * L * cs - b * W * sn;
          out[k++] = c.z[i] + a * L * sn + b * W * cs;
        }
      };
      const A = new Array(8);
      const Bq = new Array(8);
      const sep = (P: number[], Q: number[]) => {
        for (const poly of [P, Q])
          for (let k = 0; k < 4; k++) {
            const nx = -(poly[((k + 1) % 4) * 2 + 1] - poly[k * 2 + 1]);
            const nz = poly[((k + 1) % 4) * 2] - poly[k * 2];
            let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
            for (let m = 0; m < 4; m++) {
              const pa = P[m * 2] * nx + P[m * 2 + 1] * nz;
              const pb = Q[m * 2] * nx + Q[m * 2 + 1] * nz;
              a0 = Math.min(a0, pa); a1 = Math.max(a1, pa); b0 = Math.min(b0, pb); b1 = Math.max(b1, pb);
            }
            if (a1 <= b0 || b1 <= a0) return true;
          }
        return false;
      };
      for (let i = 0; i < c.n; i++) {
        if (c.fade[i] < 1 || c.y[i] > 30) continue;
        const gx = Math.floor(c.x[i] / cell);
        const gz = Math.floor(c.z[i] / cell);
        for (let dx = -2; dx <= 2; dx++)
          for (let dz = -2; dz <= 2; dz++)
            for (const j of grid.get((gx + dx) * 4096 + gz + dz) ?? []) {
              if (j <= i || Math.abs(c.y[j] - c.y[i]) > 2.5) continue;
              if (Math.hypot(c.x[j] - c.x[i], c.z[j] - c.z[i]) > hl(i) + hl(j) + 1) continue;
              for (let q = 0; q < 2; q++) {
                const S = q ? 1.15 : 1;
                corners(i, S, A);
                corners(j, S, Bq);
                if (sep(A, Bq)) continue;
                const ei = D.edge[i];
                const ej = D.edge[j];
                const lead = D.ahead[i] === j || D.ahead[j] === i;
                const par = Math.cos(c.yaw[i] - c.yaw[j]) > 0.9;
                const kind =
                  D.boxed[i] || D.boxed[j]
                    ? '교차로 안'
                    : (ei === ej && D.lane[i] === D.lane[j]) || lead
                      ? '같은 차로 앞뒤'
                      : (ei === ej || par)
                        ? '옆 차로'
                        : '그 밖(엇갈림)';
                const tag = `${kind}${c.kind[i] === 1 || c.kind[j] === 1 ? ' (버스 낌)' : ''}`;
                if (process.env.SHOWOV && q === 0 && ovShown++ < Number(process.env.SHOWOV) && st % 120 === 0)
                  console.error(JSON.stringify({ ov: tag, a: [+c.x[i].toFixed(1), +c.z[i].toFixed(1), Math.round((c.yaw[i] * 180) / Math.PI), ei, D.lane[i], +D.s[i].toFixed(1), +carGraph[ei].len.toFixed(1), D.boxed[i], +D.v[i].toFixed(1), D.aheadWhy[i], +c.room[i].toFixed(1)], b: [+c.x[j].toFixed(1), +c.z[j].toFixed(1), Math.round((c.yaw[j] * 180) / Math.PI), ej, D.lane[j], +D.s[j].toFixed(1), +carGraph[ej].len.toFixed(1), D.boxed[j], +D.v[j].toFixed(1), D.aheadWhy[j], +c.room[j].toFixed(1)], ahead: [D.ahead[i] === j, D.ahead[j] === i] }));
                const sp = spotOf(c.x[i], c.z[i]);
                for (const Rr of sp >= 0 ? [R[0], R[sp + 1]] : [R[0]]) {
                  inc(Rr.ov[q], tag);
                  Rr.ovPairs[q].add(`${Math.min(c.uid[i], c.uid[j])}-${Math.max(c.uid[i], c.uid[j])}|${tag}`);
                  if (q) inc(Rr.ovWhere, `${Math.round(c.x[i] / 10) * 10},${Math.round(c.z[i] / 10) * 10} ${tag}`);
                }
              }
            }
      }
    }
  }
  const top = (o: Record<string, number>, n: number) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n);
  const pairsBy = (s: Set<string>) => {
    const o: Record<string, number> = {};
    for (const k of s) inc(o, k.split('|')[1]);
    return o;
  };
  const out = R.map((Rr, k) => ({
    where: k ? SPOTS[k - 1][0] : '판 전체',
    stuck: Rr.stuck,
    stuckJn: k ? top(Rr.stuckJn, 10) : top(Rr.stuckJn, 10),
    overlap1: { pairs: pairsBy(Rr.ovPairs[0]), seconds: Object.fromEntries(Object.entries(Rr.ov[0]).map(([a, b]) => [a, +(b * 0.1).toFixed(1)])) },
    overlap115: { pairs: pairsBy(Rr.ovPairs[1]), seconds: Object.fromEntries(Object.entries(Rr.ov[1]).map(([a, b]) => [a, +(b * 0.1).toFixed(1)])) },
    overlapWhere: top(Rr.ovWhere, 12),
    side: Rr.side,
    turn: Rr.turn,
    sideWhere: top(Rr.sideWhere, 12),
    offRoad: +((100 * Rr.offN) / Math.max(1, Rr.offN + Rr.onN)).toFixed(3),
    offPart: Object.fromEntries(Object.entries(Rr.offPart).map(([a, b]) => [a, +((100 * b) / Math.max(1, Rr.offN + Rr.onN)).toFixed(3)])),
    offWhere: top(Rr.offWhere, 15),
    gap: { n: Rr.gaps.length, median: +pct(Rr.gaps, 0.5).toFixed(2), p5: +pct(Rr.gaps, 0.05).toFixed(2), under1: +((100 * Rr.gaps.filter((g) => g < 1).length) / Math.max(1, Rr.gaps.length)).toFixed(2), under1Why: Rr.gapWhy },
  }));
  return { speed: +(speeds.reduce((a, b) => a + b, 0) / speeds.length).toFixed(3), cars: Math.round(counts.reduce((a, b) => a + b, 0) / counts.length), out };
}

for (const [k, [name, dow, tod]] of CASES.entries()) {
  if (ONLY >= 0 && k !== ONLY) continue;
  for (const seed of SEEDS) {
    const t0 = Date.now();
    const r = run(dow, tod, seed);
    console.log(JSON.stringify({ case: name, seed, secs: Math.round((Date.now() - t0) / 1000), ...r }));
  }
}
