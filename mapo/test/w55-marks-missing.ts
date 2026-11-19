// 칠한 선이 화면에서 빠진 길이(재작업 W55, 설계 문서 59.10). 서울시가 칠한 차로를 가르는 선(중앙선 1·버스전용 5·차선 6·진로변경제한선 8·중앙버스전용 17)
// 가운데 땅 위 찻길 면 안에 있는데, 그린 노면 표시(marks.json)에서 1m 안에 같은 종류의 나란한(30° 안) 선이 없는 길이를 0.5m 표본으로 센다.
// 서울시 선은 굽기가 남긴 자르기 전 땅 위 선(tools/raw/seoul-lines-ground.json)이다. 이 파일은 커밋하지 않는 원자료라 없으면 시험을 건너뛴다.
import { existsSync, readFileSync } from 'node:fs';
import { decodeMarks, type MarkLine, type MarksJson } from '../src/data/marks.ts';
import { bitsAt } from '../tools/lib/bits.ts';
import { pointAt } from '../src/poly.ts';
import { headingNear, laneOff } from '../src/sim/graph.ts';
import { BIT, lanesOf, stage2Bits, type Stage2Data } from './w48-stage2.ts';

export const SEOUL_GROUND = new URL('../tools/raw/seoul-lines-ground.json', import.meta.url).pathname;
export const hasSeoulGround = () => existsSync(SEOUL_GROUND);
export const seoulGround = (path = SEOUL_GROUND): MarkLine[] => decodeMarks(JSON.parse(readFileSync(path, 'utf8')) as MarksJson).lines;

/** 시험하는 종류(서울시 대분류) */
export const PAINT_KINDS = [1, 5, 6, 8, 17] as const;

export interface Missing {
  /** 종류마다 찻길 면 안 서울시 선 길이(m)와 빠진 길이(m) */
  kinds: Record<number, { of: number; n: number }>;
  /** 빠진 표본(0.5m 마다): 종류, 자리, 진행 방향 */
  samples: { k: number; x: number; z: number; hx: number; hz: number }[];
  /** 50m 칸마다 빠진 길이가 큰 자리 */
  top: string[];
}

/** 그린 선(같은 종류)을 격자로: 점 둘레 r 안 나란한 선분이 있는가 */
function drawnNear(lines: MarkLine[]) {
  const C = 4;
  const grid = new Map<number, number[]>();
  const key = (k: number, i: number, j: number) => ((k * 4000 + i + 2000) * 4000 + j + 2000);
  // 높이는 보지 않는다: 서울시가 땅 위 선으로 적은 선이 정본에서 고가 찻길 위 선(h)인 곳은 위에서 보면 그 자리에 선이 있다
  for (const l of lines) {
    for (let q = 3; q < l.p.length; q += 3) {
      const [ax, az, bx, bz] = [l.p[q - 3], l.p[q - 1], l.p[q], l.p[q + 2]];
      for (let i = Math.floor(Math.min(ax, bx) / C); i <= Math.floor(Math.max(ax, bx) / C); i++)
        for (let j = Math.floor(Math.min(az, bz) / C); j <= Math.floor(Math.max(az, bz) / C); j++) {
          const kk = key(l.k, i, j);
          (grid.get(kk) ?? grid.set(kk, []).get(kk)!).push(ax, az, bx, bz);
        }
    }
  }
  const cos30 = Math.cos(Math.PI / 6);
  return (k: number, x: number, z: number, hx: number, hz: number, r: number) => {
    for (let i = Math.floor((x - r) / C); i <= Math.floor((x + r) / C); i++)
      for (let j = Math.floor((z - r) / C); j <= Math.floor((z + r) / C); j++) {
        const c = grid.get(key(k, i, j));
        if (!c) continue;
        for (let q = 0; q < c.length; q += 4) {
          const [ax, az, dx, dz] = [c[q], c[q + 1], c[q + 2] - c[q], c[q + 3] - c[q + 1]];
          const L = Math.hypot(dx, dz);
          if (L < 1e-6 || Math.abs((dx * hx + dz * hz) / L) < cos30) continue;
          const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (L * L)));
          if (Math.hypot(ax + dx * t - x, az + dz * t - z) <= r) return true;
        }
      }
    return false;
  };
}

/** 서울시 칠한 선(seoul) 가운데 구운 찻길 면 안인데 그린 표시(d.marks)에서 r m 안에 같은 종류 선이 없는 길이 */
export function missingPaint(d: Stage2Data, seoul: MarkLine[], r = 1): Missing {
  const B = stage2Bits(d);
  const has = drawnNear(d.marks.lines);
  const kinds: Missing['kinds'] = {};
  for (const k of PAINT_KINDS) kinds[k] = { of: 0, n: 0 };
  const samples: Missing['samples'] = [];
  const cells = new Map<string, number>();
  for (const l of seoul) {
    if (!kinds[l.k]) continue;
    for (let q = 3; q < l.p.length; q += 3) {
      const [ax, az, bx, bz] = [l.p[q - 3], l.p[q - 1], l.p[q], l.p[q + 2]];
      const L = Math.hypot(bx - ax, bz - az);
      if (L < 1e-6) continue;
      const [hx, hz] = [(bx - ax) / L, (bz - az) / L];
      const n = Math.max(1, Math.round(L / 0.5));
      for (let i = 0; i < n; i++) {
        const x = ax + ((bx - ax) * (i + 0.5)) / n;
        const z = az + ((bz - az) * (i + 0.5)) / n;
        if (!(bitsAt(B, x, z) & BIT.CAR)) continue;
        kinds[l.k].of += L / n;
        if (has(l.k, x, z, hx, hz, r)) continue;
        kinds[l.k].n += L / n;
        samples.push({ k: l.k, x, z, hx, hz });
        const c = `k${l.k} ${Math.floor(x / 50) * 50},${Math.floor(z / 50) * 50}`;
        cells.set(c, (cells.get(c) ?? 0) + L / n);
      }
    }
  }
  const top = [...cells].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([c, v]) => `${c} ${Math.round(v)}m`);
  return { kinds, samples, top };
}

/**
 * 빠진 표본을 까닭으로 나눈다. 차로를 고쳐야(B3·B4) 그을 수 있는 자리와 그리지 않는 것이 맞는 자리만 근거가 있고, 나머지(other)는 0 이어야 한다.
 * - shifted: 같은 계열 선(중앙선은 6m, 차로를 가르는 선은 1.6m 안)이 그어져 있다. 정본 차로가 칠한 자리에서 비켜나 선도 함께 비켜났다(B3)
 * - lane: 땅 위 정본 차로 가운데선 1m 안(차 몸이 지나는 자리)이다. 칠한 선 위로 차가 달리므로 차로 자리·차로 수를 고쳐야 긋는다(B3·B4)
 * - high: 고가·다리 차로 가운데선 2.5m 안이다. 서울시는 땅 위 선으로 적었지만 정본에서는 고가 찻길의 선이다(고가 위 선은 서울시 h 가 맡는다)
 * - stop: 가장 가까운 나란한 땅 위 차로 자리가 교차로 상자 안이거나 차가 서는 자리(정지선) 너머다
 * - xw: 횡단보도 면 위다
 * - arrow: 화살표 옆 1m·앞뒤 3m 안이다. 화살표는 정본 차로 칸에 맞춰 두었으므로 정본 차로에서 비켜난 칠한 선을 그으면 화살표를 지난다(B3)
 */
export function explainMissing(d: Stage2Data, m: Missing): { by: Record<string, Record<number, number>>; otherAt: string[] } {
  const { g, inter } = d;
  const { X, S } = inter;
  const C = 4;
  const key = (i: number, j: number) => (i + 2000) * 5000 + j + 2000;
  const lanes = new Map<number, number[]>();
  const P = [0, 0, 0];
  for (const e of g) {
    const [a, b] = [X.jStart[e.id] >= 0 ? X.rOut[e.id] : 0, X.jEnd[e.id] >= 0 ? e.len - X.rIn[e.id] : e.len];
    const signal = X.jEnd[e.id] >= 0 || S.siteOf(e.id) >= 0;
    for (const l of lanesOf(e)) {
      const cap = signal ? e.len - X.stopAt(e.id, l) + 0.3 : Infinity;
      for (let s = 0; s <= e.len; s += 0.5) {
        pointAt(e.p, e.cum, s, P);
        const o = laneOff(e, l, s);
        const h = headingNear(e, s, o);
        const [x, z] = [P[0] - Math.sin(h) * o, P[2] + Math.cos(h) * o];
        const kk = key(Math.floor(x / C), Math.floor(z / C));
        (lanes.get(kk) ?? lanes.set(kk, []).get(kk)!).push(x, z, Math.cos(h), Math.sin(h), Math.abs(P[1]) > 0.3 ? -2 : s >= a && s <= b && s <= cap ? 1 : 0);
      }
    }
  }
  const has = drawnNear(d.marks.lines);
  const xw = d.board.crosswalks.flatMap((c) => c.rings);
  const inXw = (x: number, z: number) =>
    xw.some((r) => {
      let c = false;
      for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) if (r[i + 1] > z !== r[j + 1] > z && x < r[i] + ((z - r[i + 1]) / (r[j + 1] - r[i + 1])) * (r[j] - r[i])) c = !c;
      return c;
    });
  const cos30 = Math.cos(Math.PI / 6);
  const out: Record<string, Record<number, number>> = {};
  const otherAt: string[] = [];
  for (const s of m.samples) {
    let why = 'other';
    const fam = s.k === 1 ? [1] : [5, 6, 8, 17];
    if (fam.some((k) => has(k, s.x, s.z, s.hx, s.hz, s.k === 1 ? 6 : 1.6))) why = 'shifted';
    else {
      let lane = false;
      let high = false;
      let bd = 4;
      let flag = 1;
      for (let i = Math.floor((s.x - 4) / C); i <= Math.floor((s.x + 4) / C); i++)
        for (let j = Math.floor((s.z - 4) / C); j <= Math.floor((s.z + 4) / C); j++) {
          const c = lanes.get(key(i, j));
          if (c)
            for (let q = 0; q < c.length; q += 5) {
              if (Math.abs(c[q + 2] * s.hx + c[q + 3] * s.hz) < cos30) continue;
              const [dx, dz] = [s.x - c[q], s.z - c[q + 1]];
              const along = Math.abs(dx * c[q + 2] + dz * c[q + 3]);
              const side = Math.abs(dx * c[q + 3] - dz * c[q + 2]);
              if (c[q + 4] === -2) {
                if (along <= 0.5 && side < 2.5) high = true;
                continue;
              }
              if (along <= 0.5 && side < 1) lane = true;
              const dd = Math.hypot(dx, dz);
              if (dd < bd) (bd = dd), (flag = c[q + 4]);
            }
        }
      const arrow = d.marks.arrows.some((a) => Math.abs((s.x - a.x) * a.fx + (s.z - a.z) * a.fz) < 3 && Math.abs((s.x - a.x) * a.fz - (s.z - a.z) * a.fx) < 1);
      why = lane ? 'lane' : high ? 'high' : flag === 0 ? 'stop' : inXw(s.x, s.z) ? 'xw' : arrow ? 'arrow' : 'other';
    }
    (out[why] ??= {})[s.k] = ((out[why] ??= {})[s.k] ?? 0) + 0.5;
    if (why === 'other' && otherAt.length < 20) otherAt.push(`k${s.k} ${s.x.toFixed(1)},${s.z.toFixed(1)}`);
  }
  return { by: out, otherAt };
}
