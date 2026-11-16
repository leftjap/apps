// 신호·차로·버스전용차로·몸통 겹침 측정(차만 돌린다): node tools/measure-signals.ts [잴 초] [씨앗,...] [조건 번호]
// main.ts 와 같은 순서로 차·신호·버스를 만들고 1/30초 단계로 30초를 버린 뒤 [잴 초](기본 120) 동안 잰다. 조건은 일 14:00·토 17:00·평일(화) 08:30, 씨앗 기본 11.
// 고치기 전 코드에도 돌 수 있게 신호의 움직임별 상태(moveState)가 없으면 진입로 무리 상태를 쓴다. 판 폴더는 MAPO_DATA 로 바꾼다.
//  1. 신호 위반: 신호 진입로에서 앞 범퍼가 그 차로 정지 자리를 넘는 순간, 그 차가 그 교차로에서 한 움직임(좌·직진·우·유턴)의 신호가 빨간불이면 센다.
//     우회전은 따로 센다('빨간불 우회전', 우리나라는 멈춘 뒤 우회전할 수 있다).
//  2. 엇갈림: 신호 교차로에서 서로 다른 진입로로 들어와 상자 안 자취가 30° 넘게 가로지르는 두 움직임이, 한 차가 빠져나간 뒤 2초 안에 다른 차가 들어서거나
//     함께 상자 안에 있으면 센다(함께 있음은 따로). 같은 초록불에 좌회전과 마주 오는 직진이 번갈아 지나가면 여기에 잡힌다.
//     신호 진입로는 정지 자리를 넘은 때부터 상자 안으로 본다. 비보호 좌회전·양보 유턴(새 신호의 permissive)이 낀 쌍은 'yielded' 로 따로 센다.
//  3. 허용되지 않은 차로에서 한 회전(움직임은 교차로를 지난 방향 변화로, 비스듬한 길은 너그럽게, laneOk): 노면 화살표가 있는 차로는 그 화살표, 없는 차로는 좌회전은 맨 왼쪽(중앙버스차로 포함) 차로, 우회전은 맨 오른쪽 차로(버스전용차로 포함),
//     유턴은 유턴 화살표가 있는 차로에서만 허용으로 본다. 차로가 하나면 모두 허용. 출구가 하나뿐인 진입로(길 중간 신호, 묶인 교차로 안 구간)는 보지 않는다.
//  4. 실선 구간 차로 바꾸기: 같은 구간에서 차로가 바뀌거나, 이음매에서 차로 가운데가 1.5m 넘게 옆으로 옮겨지는 일 가운데 교차로 상자 30m 앞 안에서 일어난 것.
//  5. 일반 차(버스 아닌 차)가 가로변 버스전용차로·중앙버스차로를 달린 거리(m). 교차로 앞 50m 안(우회전하려고 들어간 것)은 따로.
//  6. 몸통 겹침(배율 1, 차종별 길이·반폭의 회전 상자, 0.5초마다): 겹친 쌍 수와 표본 수. 높이가 2.5m 넘게 다른 두 차는 보지 않는다.
//  7. 평균 속도(1초마다)와 대수.
import { existsSync, readFileSync } from 'node:fs';
import { decodeBoard } from '../src/data/board.ts';
import { decodeMarks } from '../src/data/marks.ts';
import { decodeLanes } from '../src/data/lanes.ts';
import { buildCarGraph, headingNear, laneOff, MED, type Edge } from '../src/sim/graph.ts';
import { makeSignals } from '../src/sim/signals.ts';
import { makeCars } from '../src/sim/cars.ts';
import { makeBusRoutes } from '../src/sim/buses.ts';
import { makeSimProvider } from '../src/sim/provider.ts';

const MEAS = Number(process.argv[2] ?? 120);
const SEEDS = (process.argv[3] ?? '11').split(',').map(Number);
const ONLY = process.argv[4] === undefined || process.argv[4] === '-' ? -1 : Number(process.argv[4]);
const DATA = process.env.MAPO_DATA ?? new URL('../public/data/', import.meta.url).pathname;
const CASES: [string, number, number][] = [
  ['일 14:00', 0, 14 * 3600],
  ['토 17:00', 6, 17 * 3600],
  ['평일 08:30', 2, 8.5 * 3600],
];
const data = (f: string) => JSON.parse(readFileSync(`${DATA}/${f}`, 'utf8'));
const board = decodeBoard(data('board.json'));
const roadLanes = existsSync(`${DATA}/lanes.json`) ? decodeLanes(data('lanes.json')) : undefined;
const marks = decodeMarks(data('marks.json'));
const lampFile = existsSync(`${DATA}/signals.json`) ? data('signals.json') : undefined;

const L = 1, S = 2, R = 4, U = 8;
const NAME: Record<number, string> = { 1: '좌', 2: '직', 4: '우', 8: '유턴' };
const wrapA = (a: number) => {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
};
const kindOf = (dh: number) => (Math.abs(dh) > (150 * Math.PI) / 180 ? U : Math.abs(dh) < Math.PI / 4 ? S : dh < 0 ? L : R);
/** 차로 l 에서 움직임 t(교차로 전체를 지난 방향 변화 dh 로 정한 것)가 허용되는가(측정 정의: 화살표, 없으면 가장자리 차로).
 *  분리대가 있는 큰길은 진입로에서 곧게 들어가 안쪽 노드에서 꺾으므로 첫 출구가 아니라 전체 방향으로 본다.
 *  화살표와 비스듬한 길 사이는 너그럽게: 직진 화살표 차로의 60° 안 꺾임, 그쪽 회전 화살표 차로의 20° 넘는 비스듬한 직진은 허용 */
function laneOk(e: Edge, l: number, t: number, dh: number): boolean {
  if (l === MED) return t === L || t === U || t === S;
  const side = dh < 0 ? L : R;
  const fits = (m: number) => (m & t) !== 0 || (t === U && (m & 8) !== 0) || (t !== U && (m & S) !== 0 && Math.abs(dh) < Math.PI / 3) || (t === S && (m & side) !== 0 && Math.abs(dh) > Math.PI / 9);
  if (e.lanes <= 1) return t !== U || (e.turns[0] & 8) !== 0;
  const m = e.turns[Math.min(l, e.lanes - 1)];
  if (m) return fits(m);
  if (t === S) return true;
  if (e.turns.some((x) => (x & t) !== 0)) return false;
  if (t === L) return l === 0;
  if (t === R) return l === e.lanes - 1 || l === e.bus || (e.bus >= 0 && l === e.bus - 1);
  return false;
}
/** 두 자취가 30° 넘게 가로지르는가 */
function crosses(a: number[], b: number[]): boolean {
  const box = (p: number[]) => {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (let k = 0; k < p.length; k += 2) (x0 = Math.min(x0, p[k])), (x1 = Math.max(x1, p[k])), (z0 = Math.min(z0, p[k + 1])), (z1 = Math.max(z1, p[k + 1]));
    return [x0, z0, x1, z1];
  };
  const A = box(a);
  const B = box(b);
  if (A[0] > B[2] || B[0] > A[2] || A[1] > B[3] || B[1] > A[3]) return false;
  for (let i = 0; i + 3 < a.length; i += 2)
    for (let k = 0; k + 3 < b.length; k += 2) {
      const [ax, az, bx, bz] = [a[i], a[i + 1], a[i + 2], a[i + 3]];
      const [cx, cz, dx, dz] = [b[k], b[k + 1], b[k + 2], b[k + 3]];
      const d1x = bx - ax, d1z = bz - az, d2x = dx - cx, d2z = dz - cz;
      const den = d1x * d2z - d1z * d2x;
      if (Math.abs(den) < 1e-9) continue;
      const t = ((cx - ax) * d2z - (cz - az) * d2x) / den;
      const u = ((cx - ax) * d1z - (cz - az) * d1x) / den;
      if (t < 0 || t > 1 || u < 0 || u > 1) continue;
      const l1 = Math.hypot(d1x, d1z) || 1, l2 = Math.hypot(d2x, d2z) || 1;
      if (Math.abs(den) / (l1 * l2) > Math.sin(Math.PI / 6)) return true;
    }
  return false;
}
/** 두 회전 상자(가운데, 방향, 반길이, 반폭)가 겹치는가 */
function obb(ax: number, az: number, ay: number, al: number, aw: number, bx: number, bz: number, by: number, bl: number, bw: number): boolean {
  const axes = [ay, ay + Math.PI / 2, by, by + Math.PI / 2];
  const dx = bx - ax, dz = bz - az;
  for (const t of axes) {
    const ux = Math.cos(t), uz = Math.sin(t);
    const ra = Math.abs(al * Math.cos(ay - t)) + Math.abs(aw * Math.sin(ay - t));
    const rb = Math.abs(bl * Math.cos(by - t)) + Math.abs(bw * Math.sin(by - t));
    if (Math.abs(dx * ux + dz * uz) >= ra + rb) return false;
  }
  return true;
}
const inc = (o: Record<string, number>, k: string, n = 1) => (o[k] = (o[k] ?? 0) + n);
const top = (o: Record<string, number>, n = 8) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k} ${v}`).join(', ');

function run(name: string, dow: number, tod: number, seed: number) {
  const provider = makeSimProvider();
  const start = { tod, dow, doy: 320 };
  const g = buildCarGraph(board.roads, roadLanes, marks.arrows);
  const sigData = { crosswalks: board.crosswalks, stopLines: board.stopLines, lamps: lampFile };
  const signals = makeSignals(g, sigData as Parameters<typeof makeSignals>[1]) as ReturnType<typeof makeSignals> & {
    moveState?: (ap: unknown, kind: number, tod: number) => number;
    permissive?: (ap: unknown, kind: number) => boolean;
  };
  const crossBusy = new Uint32Array(board.crosswalks.length);
  const sim = makeCars(g, provider, seed, 5000, makeBusRoutes(board.buses, g, undefined, board.crosswalks), signals, { list: board.crosswalks, busy: crossBusy });
  sim.setFocus(0, 0, 2200, () => false);
  sim.fill(sim.target(start));
  sim.fillBuses(start);
  const c = sim.cars;
  const D = sim.debug() as ReturnType<typeof sim.debug> & { wid?: Float32Array };
  const jn = D.junctions;
  const stops = signals.stops;
  const res = {
    cross: 0, red: {} as Record<string, number>, redWhere: {} as Record<string, number>, rightOnRed: 0,
    moves: 0, conflict: {} as Record<string, number>, together: 0, yielded: 0, confWhere: {} as Record<string, number>,
    laneBad: {} as Record<string, number>, laneWhere: {} as Record<string, number>,
    lc: 0, lcSolid: 0, lcWhere: {} as Record<string, number>,
    busM: 0, busNearM: 0, busWhere: {} as Record<string, number>,
    ovPairs: new Set<string>(), ovSamples: 0, ovWhere: {} as Record<string, number>,
    speeds: [] as number[], counts: [] as number[],
  };
  type Track = { G: number; e: number; lane: number; t0: number; pts: number[]; h0: number; st: number[] | null; line: number; nx: number };
  const track = new Map<number, Track>(); // 차 uid → 교차로를 지나는 중
  const done: { G: number; e: number; kind: number; t0: number; t1: number; pts: number[] }[] = [];
  const last = new Map<number, { e: number; lane: number; s: number; front: number }>();
  const lineSt = new Map<number, number[]>();
  const DT = 1 / 30;
  let now = { ...start };
  const steps = Math.round((30 + MEAS) / DT);
  const where = (x: number, z: number) => `${Math.round(x / 10) * 10},${Math.round(z / 10) * 10}`;
  const wid = (i: number) => D.wid?.[i] ?? (c.kind[i] === 1 ? 1.245 : 0.93);
  const stateOf = (ap: { c: number; group: number }, kind: number, t: number) => (signals.moveState ? signals.moveState(ap, kind, t) : signals.state(ap.c, ap.group, t));
  for (let st = 0; st < steps; st++) {
    now = { ...now, tod: (now.tod + DT) % 86400 };
    sim.step(DT, now);
    const on = st * DT >= 30;
    const T = st * DT;
    for (let i = 0; i < c.n; i++) {
      const u = c.uid[i];
      const e = g[D.edge[i]];
      const s = D.s[i];
      const ln = D.lane[i];
      const p = last.get(u);
      last.set(u, { e: e.id, lane: ln, s, front: s + D.size[i] / 2 });
      if (!p || c.fade[i] < 1) continue;
      // 1. 정지 자리 넘기(그 순간의 신호를 움직임별로 적어 두고, 움직임은 교차로를 빠져나갈 때 정한다)
      // 정지선에 붙어 선 차의 흔들림은 세지 않는다: 넘던 순간의 신호를 적고, 0~0.5m 넘어 멈춰 있는 동안은 지금 신호로 다시 적고, 0.5m 넘게 나아가면 확정한다
      const ap = signals.approach.get(e.id);
      if (ap && p.e === e.id) {
        const back = stops ? stops.back(e.id, ln === MED ? 0 : ln) : -1;
        const line = e.len - (back >= 0 ? back : ap.setback);
        const d = line - (s + D.size[i] / 2);
        const pd = line - p.front;
        const now4 = () => [L, S, R, U].map((k) => stateOf(ap, k, now.tod));
        const ls = lineSt.get(u);
        if (pd > 0 && d <= 0) lineSt.set(u, now4());
        else if (ls && d <= 0 && d > -0.5 && D.v[i] < 0.3) lineSt.set(u, now4());
        if (ls && pd > -0.5 && d <= -0.5) {
          lineSt.delete(u);
          const tr = track.get(u);
          // 신호 진입로는 정지 자리를 넘은 때부터 교차로 안으로 본다(정지 자리가 상자 안인 진입로에서 기다리는 차를 빼려고)
          if (tr && tr.e === e.id) (tr.st = ls), (tr.t0 = T), (tr.pts.length = 0);
          else track.set(u, { G: jn.groupOfEnd[e.id], e: e.id, lane: ln, t0: T, pts: [], h0: c.yaw[i], st: ls, line: 1, nx: -1 });
        }
      } else lineSt.delete(u);
      // 교차로 자취
      const G = jn.groupOfEnd[e.id];
      let tr = track.get(u);
      if (D.boxed[i] && G >= 0 && !ap && D.edge[i] === e.id && s > e.len / 2 && (!tr || tr.t0 < 0)) {
        if (!tr || tr.e !== e.id) {
          tr = { G, e: e.id, lane: ln, t0: T, pts: [], h0: c.yaw[i], st: null, line: 0, nx: -1 };
          track.set(u, tr);
        } else (tr.t0 = T), (tr.lane = ln);
      }
      if (tr && tr.t0 < 0 && p.e === e.id) tr.h0 = c.yaw[i];
      if (tr && tr.nx < 0 && p.e === tr.e && e.id !== tr.e) tr.nx = e.id;
      if (tr && tr.t0 >= 0) {
        if (st % 3 === 0) tr.pts.push(c.x[i], c.z[i]);
        const out = jn.groupOfStart[e.id] === tr.G && jn.groupOfEnd[e.id] !== tr.G && !D.boxed[i];
        if (out || T - tr.t0 > 60) {
          track.delete(u);
          if (!out) continue;
          // 움직임: 진입로 끝 방향과, 교차로를 빠져나간 구간 8m 자리 방향의 차이(새 신호 moveOf 와 같은 정의)
          const kind = kindOf(wrapA(headingNear(e, Math.min(e.len, 8)) - headingNear(g[tr.e], g[tr.e].len)));
          const ae = g[tr.e];
          const dh = wrapA(headingNear(e, Math.min(e.len, 8)) - headingNear(g[tr.e], g[tr.e].len));
          const laneKind = kind;
          if (on) {
            res.moves++;
            const isBus = c.kind[i] === 1;
            if (ae.next.length > 1 && !laneOk(ae, tr.lane, laneKind, dh)) {
              inc(res.laneBad, `${NAME[laneKind]}${isBus ? '(버스)' : ''}`);
              if (process.env.SHOW) console.error(JSON.stringify({ lane: NAME[laneKind], bus: isBus, e: tr.e, l: tr.lane, lanes: ae.lanes, turns: [...ae.turns], bl: ae.bus, nx: tr.nx, x: Math.round(ae.p[ae.p.length - 3]), z: Math.round(ae.p[ae.p.length - 1]) }));
              inc(res.laneWhere, where(ae.p[ae.p.length - 3], ae.p[ae.p.length - 1]));
            }
            if (tr.st) {
              res.cross++;
              const sv = tr.st[[L, S, R, U].indexOf(kind)];
              if (sv === 2) {
                if (kind === R) res.rightOnRed++;
                else {
                  inc(res.red, NAME[kind] + (isBus ? '(버스)' : ''));
                  if (process.env.SHOW) console.error(JSON.stringify({ red: NAME[kind], bus: isBus, e: tr.e, lane: tr.lane, ap: signals.approach.get(tr.e), st: tr.st, x: Math.round(c.x[i]), z: Math.round(c.z[i]) }));
                  inc(res.redWhere, where(ae.p[ae.p.length - 3], ae.p[ae.p.length - 1]));
                }
              }
            }
            // 2. 엇갈림
            for (const m of done) {
              if (m.G !== tr.G || m.e === tr.e || m.t1 < tr.t0 - 2 || !signals.approach.has(m.e) || !signals.approach.has(tr.e)) continue;
              if (!crosses(m.pts, tr.pts)) continue;
              const pair = [NAME[m.kind], NAME[kind]].sort().join('×');
              // 비보호 좌회전·양보 유턴이 마주 오는 차가 지나간 뒤 들어간 것은 따로 센다
              const yieldTurn = (e2: number, k2: number) => !!signals.permissive?.(signals.approach.get(e2), k2);
              if (yieldTurn(m.e, m.kind) || yieldTurn(tr.e, kind)) {
                res.yielded++;
                continue;
              }
              inc(res.conflict, pair);
              if (process.env.SHOW) console.error(JSON.stringify({ conf: pair, a: m.e, b: tr.e, apA: signals.approach.get(m.e), apB: signals.approach.get(tr.e), gap: +(tr.t0 - m.t1).toFixed(1), x: Math.round(ae.p[ae.p.length - 3]), z: Math.round(ae.p[ae.p.length - 1]) }));
              if (m.t1 > tr.t0) res.together++;
              inc(res.confWhere, where(ae.p[ae.p.length - 3], ae.p[ae.p.length - 1]));
            }
          }
          done.push({ G: tr.G, e: tr.e, kind, t0: tr.t0, t1: T, pts: tr.pts });
          if (done.length > 4000) done.splice(0, done.length - 3000);
        }
      }
      if (!on) continue;
      // 4. 차로 바꾸기
      let changed = false;
      if (p.e === e.id && p.lane !== ln) changed = true;
      else if (p.e !== e.id && g[p.e].next.includes(e.id) && jn.groupOfEnd[p.e] < 0 && ln !== MED && p.lane !== MED) {
        const a = g[p.e];
        if (Math.abs(laneOff(e, ln, 0) - laneOff(a, p.lane, a.len)) > 1.5) changed = true;
      }
      if (changed) {
        res.lc++;
        if (jn.groupOfEnd[e.id] >= 0 && e.len - jn.rIn[e.id] - s < 30) {
          res.lcSolid++;
          inc(res.lcWhere, where(c.x[i], c.z[i]));
        }
      }
      // 5. 일반 차의 버스전용차로
      if (c.kind[i] !== 1 && (ln === MED || (e.bus >= 0 && ln === e.bus)) && !D.boxed[i]) {
        const d = D.v[i] * DT;
        if (jn.groupOfEnd[e.id] >= 0 && e.len - jn.rIn[e.id] - s < 50) res.busNearM += d;
        else {
          res.busM += d;
          inc(res.busWhere, where(c.x[i], c.z[i]), d);
        }
      }
    }
    if (!on) continue;
    // 6. 겹침
    if (st % 15 === 0) {
      const cell = new Map<number, number[]>();
      for (let i = 0; i < c.n; i++) {
        if (c.fade[i] < 1) continue;
        const k = Math.floor(c.x[i] / 10) * 4096 + Math.floor(c.z[i] / 10);
        (cell.get(k) ?? cell.set(k, []).get(k)!).push(i);
      }
      for (let i = 0; i < c.n; i++) {
        if (c.fade[i] < 1) continue;
        const gx = Math.floor(c.x[i] / 10), gz = Math.floor(c.z[i] / 10);
        for (let dx = -1; dx <= 1; dx++)
          for (let dz = -1; dz <= 1; dz++)
            for (const j of cell.get((gx + dx) * 4096 + gz + dz) ?? []) {
              if (j <= i || Math.abs(c.y[i] - c.y[j]) > 2.5) continue;
              if (!obb(c.x[i], c.z[i], c.yaw[i], D.size[i] / 2, wid(i), c.x[j], c.z[j], c.yaw[j], D.size[j] / 2, wid(j))) continue;
              res.ovSamples++;
              const key = c.uid[i] < c.uid[j] ? `${c.uid[i]},${c.uid[j]}` : `${c.uid[j]},${c.uid[i]}`;
              if (!res.ovPairs.has(key)) {
                inc(res.ovWhere, where(c.x[i], c.z[i]));
                if (process.env.SHOW)
                  console.error(JSON.stringify({ ov: key, x: Math.round(c.x[i]), z: Math.round(c.z[i]), a: [D.edge[i], D.lane[i], +D.s[i].toFixed(1), +D.v[i].toFixed(1), D.boxed[i], c.kind[i], c.y[i].toFixed(1)], b: [D.edge[j], D.lane[j], +D.s[j].toFixed(1), +D.v[j].toFixed(1), D.boxed[j], c.kind[j], c.y[j].toFixed(1)], d: +Math.hypot(c.x[i] - c.x[j], c.z[i] - c.z[j]).toFixed(1) }));
              }
              res.ovPairs.add(key);
            }
      }
    }
    if (st % 30 === 0) {
      res.speeds.push(sim.meanSpeed());
      res.counts.push(c.n);
    }
  }
  const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
  const nRed = Object.values(res.red).reduce((a, b) => a + b, 0);
  const nConf = Object.values(res.conflict).reduce((a, b) => a + b, 0);
  const nLane = Object.values(res.laneBad).reduce((a, b) => a + b, 0);
  console.log(
    JSON.stringify({
      case: name, seed,
      speed: +mean(res.speeds).toFixed(3), cars: Math.round(mean(res.counts)),
      cross: res.cross, red: nRed, redBy: top(res.red), redWhere: top(res.redWhere, 5), rightOnRed: res.rightOnRed,
      moves: res.moves, conflict: nConf, together: res.together, yielded: res.yielded, conflictBy: top(res.conflict), confWhere: top(res.confWhere, 5),
      laneBad: nLane, laneBy: top(res.laneBad), laneWhere: top(res.laneWhere, 5),
      laneChange: res.lc, laneChangeSolid: res.lcSolid, lcWhere: top(res.lcWhere, 5),
      busLaneM: Math.round(res.busM), busLaneNearM: Math.round(res.busNearM), busWhere: top(res.busWhere, 5),
      overlapPairs: res.ovPairs.size, overlapSamples: res.ovSamples, ovWhere: top(res.ovWhere, 6),
    }),
  );
}

CASES.forEach(([name, dow, tod], k) => {
  if (ONLY >= 0 && k !== ONLY) return;
  for (const seed of SEEDS) run(name, dow, tod, seed);
});
