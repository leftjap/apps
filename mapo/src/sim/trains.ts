// 열차. 배차 간격표로 하루치 진입 시각을 만들고, 위치는 "진입 뒤 지난 시간"의 함수로만 정한다.
// 상태를 쌓지 않으므로 어느 시각으로 건너뛰어도 같은 결과가 나온다.
import { inService } from './curves.ts';

export interface LineDef {
  id: string;
  name: string;
  color: string;
  cars: number;
  carLen: number;
  /** 중심선 [x,y,z,...] */
  p: Float32Array;
  cum: Float32Array;
  /** 역의 거리 값(m, 오름차순) */
  stops: number[];
  stopNames: string[];
}

export interface RunProfile {
  dur: number;
  /** 진입 뒤 tau초에 달린 거리(m) */
  distAt(tau: number): number;
  /** 각 역에 멈춰 서는 시각(진입 뒤 초) */
  arrive: number[];
}

const VMAX = 22; // m/s
const ACC = 1; // m/s²
const DWELL = 25; // 초

interface Seg {
  t: number;
  s: number;
  v: number;
  a: number;
  dur: number;
}

export function makeProfile(length: number, stops: number[]): RunProfile {
  const segs: Seg[] = [];
  const arrive: number[] = [];
  let t = 0;
  let s = 0;
  const push = (v: number, a: number, dur: number) => {
    if (dur <= 0) return;
    segs.push({ t, s, v, a, dur });
    s += v * dur + 0.5 * a * dur * dur;
    t += dur;
  };
  /** d(m)를 v0에서 v1까지: 가속 → 정속 → 감속 */
  const leg = (d: number, v0: number, v1: number) => {
    const vp = Math.min(VMAX, Math.sqrt(Math.max(0, (2 * ACC * d + v0 * v0 + v1 * v1) / 2)));
    const d0 = (vp * vp - v0 * v0) / (2 * ACC);
    const d1 = (vp * vp - v1 * v1) / (2 * ACC);
    push(v0, ACC, (vp - v0) / ACC);
    push(vp, 0, Math.max(0, d - d0 - d1) / vp);
    push(vp, -ACC, (vp - v1) / ACC);
  };
  const pts = [...stops, length];
  // 판 밖에서 달려 들어오므로 첫 구간은 제동 거리가 허락하는 가장 빠른 속도로 진입한다
  let v = Math.min(VMAX, stops.length ? Math.sqrt(2 * ACC * Math.max(1, pts[0])) : VMAX);
  let from = 0;
  pts.forEach((to, i) => {
    const last = i === pts.length - 1;
    leg(to - from, v, last ? Math.min(VMAX, Math.sqrt(v * v + 2 * ACC * (to - from))) : 0);
    s = to;
    if (!last) {
      arrive.push(t);
      push(0, 0, DWELL);
      // 정차 구간은 거리 0이라 push가 s를 그대로 둔다
    }
    from = to;
    v = 0;
  });
  const dur = t;
  return {
    dur,
    arrive,
    distAt(tau) {
      if (tau <= 0) return 0;
      if (tau >= dur) return length;
      let lo = 0;
      let hi = segs.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (segs[mid].t <= tau) lo = mid;
        else hi = mid - 1;
      }
      const g = segs[lo];
      const dt = Math.min(g.dur, tau - g.t);
      return g.s + g.v * dt + 0.5 * g.a * dt * dt;
    },
  };
}

/** [출퇴근, 낮, 밤 늦게] 배차 간격(초) */
const HEADWAY: Record<string, [number, number, number]> = {
  '2': [150, 300, 480],
  '6': [240, 420, 540],
  K: [420, 720, 900],
  A: [300, 420, 600],
};

export function headway(lineId: string, tod: number): number {
  if (!inService(tod)) return 0;
  const h = tod / 3600;
  const [peak, day, late] = HEADWAY[lineId] ?? HEADWAY['6'];
  if ((h >= 7 && h < 9.5) || (h >= 17.5 && h < 20)) return peak;
  if (h >= 22.5 || h < 6) return late;
  return day;
}

const SERVICE_START = 5.5 * 3600;
const SERVICE_END = 24 * 3600 + 40 * 60;
const depCache = new Map<string, number[]>();

/** 하루치 판 진입 시각(초). 자정을 넘긴 막차는 86400보다 큰 값으로 둔다. */
export function departures(lineId: string, dir: 0 | 1): number[] {
  const k = lineId + dir;
  let out = depCache.get(k);
  if (out) return out;
  out = [];
  // 방향·노선마다 첫 차 시각을 어긋나게 한다
  let t = SERVICE_START + ((lineId.charCodeAt(0) * 37 + dir * 71) % 150);
  while (t < SERVICE_END) {
    out.push(t);
    t += headway(lineId, t % 86400) || 600;
  }
  depCache.set(k, out);
  return out;
}

const profCache = new WeakMap<LineDef, [RunProfile, RunProfile]>();
function profiles(l: LineDef): [RunProfile, RunProfile] {
  let p = profCache.get(l);
  if (!p) {
    const len = l.cum[l.cum.length - 1];
    p = [makeProfile(len, l.stops), makeProfile(len, l.stops.map((s) => len - s).reverse())];
    profCache.set(l, p);
  }
  return p;
}

export interface TrainPos {
  line: string;
  dir: 0 | 1;
  /** 선두의 거리 값(m). 방향과 상관없이 중심선의 정방향 기준 */
  s: number;
  key: number;
}

export function trainsAt(lines: LineDef[], tod: number): TrainPos[] {
  const out: TrainPos[] = [];
  lines.forEach((l, li) => {
    const len = l.cum[l.cum.length - 1];
    const prof = profiles(l);
    for (const dir of [0, 1] as const) {
      const deps = departures(l.id, dir);
      for (let i = 0; i < deps.length; i++) {
        for (const t of [tod, tod + 86400]) {
          const tau = t - deps[i];
          if (tau < 0 || tau > prof[dir].dur) continue;
          const d = prof[dir].distAt(tau);
          out.push({ line: l.id, dir, s: dir ? len - d : d, key: li * 100000 + dir * 50000 + i });
        }
      }
    }
  });
  return out;
}

export interface Arrival {
  line: string;
  dir: 0 | 1;
  name: string;
}

/** (t0, t1] 사이에 역에 멈춰 선 열차들. t1 < t0 이면 자정을 넘긴 것으로 본다. */
export function arrivals(lines: LineDef[], t0: number, t1: number): Arrival[] {
  if (t1 < t0) return [...arrivals(lines, t0, 86400), ...arrivals(lines, 0, t1)];
  const out: Arrival[] = [];
  for (const l of lines) {
    const prof = profiles(l);
    for (const dir of [0, 1] as const) {
      const names = dir ? [...l.stopNames].reverse() : l.stopNames;
      for (const dep of departures(l.id, dir))
        prof[dir].arrive.forEach((a, i) => {
          for (const off of [0, 86400]) {
            const t = dep + a - off;
            if (t > t0 && t <= t1) out.push({ line: l.id, dir, name: names[i] });
          }
        });
    }
  }
  return out;
}
