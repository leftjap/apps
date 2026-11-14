// 실시간 지하철 위치(중계 함수 supabase/functions/mapo-subway 가 추린 값)로 판 위 열차를 움직인다.
// 열차마다 '받은 시각에 어느 역 둘레에서 어떤 상태(진입·도착·출발·전역 출발)였는지'로 그때 자리를 정하고,
// 받은 뒤 지난 시간만큼 앞으로 옮긴 다음, 다음 자료가 올 때까지 역마다 서며(시간표 열차와 같은 25초) 달리게 한다.
// 새 자료로 자리가 바뀌면 몇 초에 걸쳐 따라가 순간 이동하지 않는다. 자료가 6분 넘게 끊기면 쓰지 않는다(시간표 열차로 돌아간다).
import { DWELL, type Arrival, type BoardRow, type LineDef, type TrainPos } from '../sim/trains.ts';

export interface LiveTrain {
  line: string;
  no: string;
  stn: string;
  updn: string;
  st: string;
  rcv: number;
}

const V = 12; // 역 사이를 달리는 속도(m/s, 어림)
const ACC = 1; // 가속·감속(m/s²)
/** 상하행 값 가운데 판 노선의 거리 값이 커지는 쪽(방향 0). 응답과 판 노선 모양으로 맞췄다 */
const DIR0: Record<string, string> = { '2': '0', '6': '0', K: '1', A: '1' };
/** 판 바로 바깥 이웃 역: [거리 값이 작은 쪽 역, 첫 역에서 떨어진 거리(m)], [큰 쪽 역, 마지막 역에서 떨어진 거리]. 실제 역 사이 거리의 어림값 */
const OUTSIDE: Record<string, [[string, number], [string, number]]> = {
  '2': [['당산', 1600], ['이대', 800]],
  '6': [['대흥', 900], ['월드컵경기장', 800]],
  K: [['가좌', 1900], ['공덕', 1800]],
  A: [['공덕', 2700], ['디지털미디어시티', 3200]],
};

interface Stop {
  name: string;
  s: number;
  inside: boolean;
}
interface State {
  key: number;
  line: LineDef;
  stops: Stop[];
  dir: 0 | 1;
  s: number;
  v: number;
  dwell: number;
  /** 그려지는 자리 = s + off. 새 자료로 자리가 바뀌면 off 가 0으로 줄어들며 따라간다 */
  off: number;
  seen: number;
}

export function makeLiveSubway(lines: LineDef[]) {
  const stopsOf = new Map<string, Stop[]>();
  for (const l of lines) {
    const own = l.stops.map((s, i) => ({ name: l.stopNames[i], s, inside: true }));
    const out = OUTSIDE[l.id];
    if (out && own.length) {
      own.unshift({ name: out[0][0], s: own[0].s - out[0][1], inside: false });
      own.push({ name: out[1][0], s: own[own.length - 1].s + out[1][1], inside: false });
    }
    stopsOf.set(l.id, own);
  }
  const keys = new Map<string, number>();
  let trains = new Map<number, State>();
  let arrived: Arrival[] = [];
  let lastSet = 0;
  const len = (l: LineDef) => l.cum[l.cum.length - 1];

  /** 열차 하나를 dt 초 움직인다. 판 안 역에 서면(quiet 가 아니면) 도착을 적는다 */
  function move(t: State, dt: number, quiet: boolean) {
    if (t.dwell > 0) {
      t.dwell -= dt;
      t.v = 0;
      return;
    }
    const sign = t.dir ? -1 : 1;
    let next: Stop | null = null;
    for (const st of t.stops) if ((st.s - t.s) * sign > 1e-3 && (!next || Math.abs(st.s - t.s) < Math.abs(next.s - t.s))) next = st;
    const dist = next ? Math.abs(next.s - t.s) : Infinity;
    t.v = Math.min(V, Math.sqrt(2 * ACC * dist), t.v + ACC * dt);
    const d = Math.max(t.v, 0.5) * dt;
    if (next && d >= dist) {
      t.s = next.s;
      t.v = 0;
      t.dwell = DWELL;
      if (next.inside && !quiet) arrived.push({ line: t.line.id, dir: t.dir, name: next.name });
    } else t.s += sign * d;
  }

  /** 새로 받은 열차 위치로 바꾼다(now 는 지금 시각 epoch ms) */
  function set(list: LiveTrain[], now: number) {
    const next = new Map<number, State>();
    for (const r of list) {
      const line = lines.find((l) => l.id === r.line);
      const stops = stopsOf.get(r.line);
      if (!line || !stops) continue;
      const k = stops.findIndex((st) => st.name === r.stn);
      if (k < 0) continue;
      const dir: 0 | 1 = r.updn === DIR0[r.line] ? 0 : 1;
      const sign = dir ? -1 : 1;
      const at = stops[k].s;
      let key = keys.get(r.line + r.no);
      if (key === undefined) keys.set(r.line + r.no, (key = 900000 + keys.size));
      const t: State = { key, line, stops, dir, s: at, v: 0, dwell: 0, off: 0, seen: now };
      if (r.st === '1') t.dwell = DWELL / 2; // 도착해 서 있다(얼마나 서 있었는지 모르니 반쯤 남은 것으로)
      else if (r.st === '2') (t.s = at + sign * 5), (t.v = 2); // 막 출발했다
      else if (r.st === '0') (t.s = at - sign * 120), (t.v = V); // 역에 들어서고 있다
      else {
        // 앞 역을 출발해 이 역으로 오고 있다
        const prev = stops[k - sign];
        if (prev) (t.s = prev.s + sign * 20), (t.v = 2);
        else (t.s = at - sign * 800), (t.v = V);
      }
      // 받은 뒤 지난 시간만큼 앞으로 옮긴다(10분까지)
      for (let left = Math.min(600, Math.max(0, (now - r.rcv) / 1000)); left > 0; left -= 0.5) move(t, Math.min(0.5, left), true);
      const old = trains.get(key);
      if (old) {
        const d = old.s + old.off - t.s;
        if (Math.abs(d) < 500) t.off = d;
      }
      next.set(key, t);
    }
    // 이번 자료에 없는 열차는 3분까지 마저 움직인다(판 둘레 역을 막 벗어났을 수 있다)
    for (const [k, t] of trains) if (!next.has(k) && now - t.seen < 180_000) next.set(k, t);
    trains = next;
    lastSet = now;
  }

  return {
    set,
    step(dt: number) {
      for (const [k, t] of trains) {
        t.off *= Math.exp(-dt / 2);
        move(t, dt, false);
        const L = len(t.line);
        if ((t.dir === 0 && t.s > L + 400) || (t.dir === 1 && t.s < -400)) trains.delete(k);
      }
    },
    /** 판 위에 그릴 열차 */
    positions(): TrainPos[] {
      const out: TrainPos[] = [];
      for (const t of trains.values()) {
        const s = t.s + t.off;
        if (s >= 0 && s <= len(t.line)) out.push({ line: t.line.id, dir: t.dir, s, key: t.key });
      }
      return out;
    },
    /** 지난번 뒤로 판 안 역에 선 열차들(꺼내면 비운다) */
    takeArrivals(): Arrival[] {
      const a = arrived;
      arrived = [];
      return a;
    },
    /** 쓸 만한 자료가 있는가(받은 지 6분 안) */
    ready: (now: number) => lastSet > 0 && now - lastSet < 6 * 60_000,
    /** 역 안내판: 노선·방향마다 다가오는 실제 열차까지 남은 시간. 그런 열차가 없으면 시간표 안내(sim)를 그대로 둔다 */
    board(station: string, sim: BoardRow[]): BoardRow[] {
      return sim.map((row) => {
        const stops = stopsOf.get(row.line);
        const st = stops?.find((x) => x.name === station && x.inside);
        if (!stops || !st) return row;
        const sign = row.dir ? -1 : 1;
        let best = Infinity;
        for (const t of trains.values()) {
          if (t.line.id !== row.line || t.dir !== row.dir || (st.s - t.s) * sign < -1) continue;
          if (Math.abs(st.s - t.s) < 1 && t.dwell > 0) {
            best = 0;
            break;
          }
          // 사이 역마다 25초 서고, 달리는 속도로 간다(서 있던 열차는 남은 정차 시간을 더한다)
          const between = stops.filter((x) => (x.s - t.s) * sign > 1 && (st.s - x.s) * sign > 1).length;
          best = Math.min(best, Math.max(0, t.dwell) + Math.abs(st.s - t.s) / V + between * DWELL + 6);
        }
        if (best === Infinity) return row;
        return { ...row, state: best === 0 ? '정차 중' : best < 90 ? '곧 도착' : `${Math.ceil(best / 60)}분 후`, inSec: Math.round(best) };
      });
    },
  };
}
