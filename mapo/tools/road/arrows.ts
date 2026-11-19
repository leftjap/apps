// 노면 화살표를 놓인 정본 차로 가운데로(재작업 W57). 차 그래프가 화살표로 차로 회전(turns)을 정하므로(src/sim/graph.ts buildCarGraph),
// 옮긴 뒤 차 그래프 차로 회전이 하나라도 바뀌면 그 구간 둘레 60m 안 옮긴 화살표는 제자리로 되돌린다(refitArrows 와 같은 방법). 시험(test/w57-stage1.ts)도 arrowLanes 를 쓴다.
import { decodeMarks, type Marks, type MarksJson } from '../../src/data/marks.ts';
import { pointAt } from '../../src/poly.ts';
import { headingNear, laneOff, laneWidth, leftEdge, rightEdge, type Edge } from '../../src/sim/graph.ts';
import { fitCells } from '../lib/arrows.ts';

/** 차로 가운데에서 이만큼(m) 넘게 벗어난 화살표를 옮긴다(시험 기준과 같다) */
export const ARROW_OFF = 0.3;

export interface ArrowLane {
  e: Edge;
  s: number;
  lane: number;
  /** 차로 가운데에서 벗어난 거리(m) */
  off: number;
  /** 차로 가운데 자리 */
  x: number;
  z: number;
}

const P = [0, 0, 0];

/** 화살표마다 놓인 구간·차로: 진행 방향이 같은(0.8) 땅 위 구간 가운데 화살표가 일반 차로 가장자리 0.5m 안인 곳의, 옆 거리가 가장 가까운 차로. 없으면 null */
export function arrowLanes(arrows: Marks['arrows'], g: Edge[]): (ArrowLane | null)[] {
  const grid = new Map<number, number[]>();
  const key = (x: number, z: number) => Math.floor(x / 20) * 100003 + Math.floor(z / 20);
  for (const e of g)
    for (let s = 0; s <= e.len + 5; s += 5) {
      pointAt(e.p, e.cum, Math.min(s, e.len), P);
      const k = key(P[0], P[2]);
      const a = grid.get(k) ?? grid.set(k, []).get(k)!;
      if (a[a.length - 1] !== e.id) a.push(e.id);
    }
  return arrows.map((a) => {
    let best: ArrowLane | null = null;
    const seen = new Set<number>();
    for (let gx = -1; gx <= 1; gx++)
      for (let gz = -1; gz <= 1; gz++)
        for (const id of grid.get((Math.floor(a.x / 20) + gx) * 100003 + Math.floor(a.z / 20) + gz) ?? []) {
          if (seen.has(id)) continue;
          seen.add(id);
          const e = g[id];
          // 중심선에서 화살표에 가장 가까운 자리(1m 로 찾고 0.05m 로 좁힌다)
          let bs = 0;
          let bd = Infinity;
          for (let s = 0; s <= e.len; s += 1) {
            pointAt(e.p, e.cum, s, P);
            const dd = Math.hypot(P[0] - a.x, P[2] - a.z);
            if (dd < bd) (bd = dd), (bs = s);
          }
          if (bd > 20) continue;
          for (let s = Math.max(0, bs - 1); s <= Math.min(e.len, bs + 1); s += 0.05) {
            pointAt(e.p, e.cum, s, P);
            const dd = Math.hypot(P[0] - a.x, P[2] - a.z);
            if (dd < bd) (bd = dd), (bs = s);
          }
          const s = bs;
          pointAt(e.p, e.cum, s, P);
          if (Math.abs(P[1]) > 0.3) continue;
          const h = headingNear(e, s);
          if (a.fx * Math.cos(h) + a.fz * Math.sin(h) < 0.8) continue;
          const lat = (a.x - P[0]) * -Math.sin(h) + (a.z - P[2]) * Math.cos(h);
          if (lat < leftEdge(e, s) - 0.5 || lat > rightEdge(e, s) + 0.5) continue;
          for (let l = 0; l < e.lanes; l++) {
            const o = laneOff(e, l, s);
            const off = Math.abs(lat - o);
            if (!best || off < best.off) best = { e, s, lane: l, off, x: P[0] - Math.sin(h) * o, z: P[2] + Math.cos(h) * o };
          }
        }
    return best;
  });
}

/**
 * 양옆 칠한 선 칸을 찾지 못한 화살표(fitCells, 칸을 찾은 화살표는 굽기가 이미 칸 가운데에 두었다) 가운데 정본 차로 가운데에서 ARROW_OFF 넘게 벗어난 것을
 * 그 차로 가운데(onGround 가 참인 자리만)로 옮기고 칸 폭을 그 차로 폭으로 둔다. 옮긴 자리에서 칠한 선 칸이 잡히거나(칠한 선과 정본 차로가 어긋난 곳, B3),
 * build 로 다시 만든 차 그래프의 차로 회전이 바뀌면(바뀐 구간 둘레 60m 안) 옮기지 않는다. 차 그래프는 json 의 화살표로 만든 것과 같다
 */
export function centerArrows(json: MarksJson, build: (arrows: Marks['arrows']) => Edge[], onGround: (x: number, z: number) => boolean): { json: MarksJson; moved: number; reverted: number } {
  const marks = decodeMarks(json);
  const arrows = marks.arrows;
  const g0 = build(arrows);
  const base = g0.map((e) => Array.from(e.turns).join(','));
  const lanes = arrowLanes(arrows, g0);
  const cell0 = fitCells(arrows, marks.lines).out;
  const use = lanes.map((b, i) => !!b && b.off > ARROW_OFF && cell0[i].w === 0 && onGround(b.x, b.z));
  const dm = (v: number) => Math.round(v * 10);
  const enc = () => {
    const a = json.a.slice();
    const aw = (json.aw ?? []).slice();
    lanes.forEach((b, i) => {
      if (!use[i] || !b) return;
      a[i * 4 + 1] = dm(b.x);
      a[i * 4 + 2] = dm(b.z);
      aw[i] = dm(laneWidth(b.e, b.lane, b.s));
    });
    return { ...json, a, aw };
  };
  let reverted = 0;
  for (let round = 0; round < 20; round++) {
    const out = enc();
    const moved = decodeMarks(out).arrows;
    const cell1 = fitCells(moved, marks.lines).out;
    const found = use.map((u, i) => u && cell1[i].w > 0);
    if (found.some(Boolean)) {
      found.forEach((f, i) => f && ((use[i] = false), reverted++));
      continue;
    }
    const g = build(moved);
    const bad = g.filter((e, i) => Array.from(e.turns).join(',') !== base[i]);
    if (!bad.length) return { json: out, moved: use.filter(Boolean).length, reverted };
    for (const e of bad)
      arrows.forEach((o, i) => {
        if (!use[i]) return;
        for (let k = 0; k < e.p.length; k += 3)
          if (Math.hypot(e.p[k] - o.x, e.p[k + 2] - o.z) < 60) {
            use[i] = false;
            reverted++;
            return;
          }
      });
  }
  return { json, moved: 0, reverted: arrows.length };
}
