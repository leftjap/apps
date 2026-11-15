// 실시간 지하철 위치(중계 함수 supabase/functions/mapo-subway 가 추린 값)로 판 위 열차를 움직인다.
// 열차마다 '받은 시각에 어느 역 둘레에서 어떤 상태(진입·도착·출발·전역 출발)였는지'로 그때 자리를 정하고,
// 받은 뒤 지난 시간만큼 앞으로 옮긴 다음, 다음 자료가 올 때까지 역마다 서며(시간표 열차와 같은 25초) 달리게 한다.
// 새 자료로 자리가 바뀌면 몇 초에 걸쳐 따라가 순간 이동하지 않는다. 자료가 6분 넘게 끊기면 쓰지 않는다(시간표 열차로 돌아간다).
// 역 안내판은 공식 역 도착 정보(realtimeStationArrival, 판 밖 먼 열차까지 있다)를 먼저 쓰고, 없으면 판 위 실제 열차, 그것도 없으면 시간표 값에 '시간표'를 붙인다.
// 판 위에는 실제 열차만 그리므로 '정차 중'은 그 역에 실제 열차가 서 있을 때만 쓴다.
import { DWELL, type Arrival, type BoardRow, type LineDef, type TrainPos } from '../sim/trains.ts';

export interface LiveTrain {
  line: string;
  no: string;
  stn: string;
  updn: string;
  st: string;
  rcv: number;
}

/** 공식 역 도착 정보 한 줄(중계 함수가 판 안 역만 추린 것) */
export interface LiveArrival {
  line: string;
  /** 판 안 역 */
  stn: string;
  /** 상하행 코드(열차 위치 응답과 같은 값. 중계 함수가 공항철도의 뒤집힌 코드까지 맞춰 준다) */
  updn: string;
  /** 0 진입, 1 도착, 2 출발, 3 전역 출발, 4 전역 진입, 5 전역 도착, 99 운행 중 */
  cd: string;
  /** 도착까지 남은 초(0 이면 알 수 없음) */
  sec: number;
  /** 공식 안내 글('5분 후', '[11]번째 전역 (청량리)' 등) */
  msg: string;
  /** 열차가 지금 있는 역 */
  cur: string;
  /** 같은 방향 안 순서(작을수록 먼저 온다) */
  ord: string;
  no: string;
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
  let arrivals: LiveArrival[] = [];
  let arrivalsAt = 0;
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

  /** 공식 도착 정보 한 줄을 안내판 글과 남은 초로. 이미 지나갔거나(도착·출발한 지 오래) 알 수 없으면 null */
  function arrivalState(a: LiveArrival, now: number): { state: string; inSec: number } | null {
    const age = Math.max(0, (now - a.rcv) / 1000);
    // 출발은 지나간 열차다. 도착·진입은 그 역에 선 열차가 판 위에 있으면 앞에서 '정차 중'으로 썼으니, 여기서는 방금(1분 안) 받은 것만 곧 도착으로 쓴다
    if (a.cd === '2') return null;
    if (a.cd === '1' || a.cd === '0') return age < 60 ? { state: '곧 도착', inSec: 0 } : null;
    const prev = a.cd === '3' ? '전역 출발' : a.cd === '4' ? '전역 진입' : a.cd === '5' ? '전역 도착' : '';
    const eta = a.sec > 0 ? a.sec - age : -1;
    if (prev && age < 90) return { state: prev, inSec: Math.max(0, Math.round(eta >= 0 ? eta : 90 - age)) };
    if (a.sec > 0) {
      if (eta < -30) return null;
      return { state: eta < 90 ? '곧 도착' : `${Math.ceil(eta / 60)}분 후`, inSec: Math.max(0, Math.round(eta)) };
    }
    if (prev) return { state: '곧 도착', inSec: 0 };
    const n = /\[(\d+)\]번째 전역/.exec(a.msg);
    if (n) return { state: a.msg.replace(/\[(\d+)\]/, '$1').trim(), inSec: Number(n[1]) * 120 };
    return a.msg ? { state: a.msg.trim(), inSec: 600 } : null;
  }

  return {
    set,
    /** 공식 역 도착 정보로 바꾼다(now 는 지금 시각 epoch ms) */
    setArrivals(list: LiveArrival[], now: number) {
      arrivals = [...list].sort((a, b) => (a.ord < b.ord ? -1 : a.ord > b.ord ? 1 : 0));
      arrivalsAt = now;
    },
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
        if (s >= 0 && s <= len(t.line)) out.push({ line: t.line.id, dir: t.dir, s, key: t.key, at: t.dwell > 0 ? DWELL - t.dwell : -1 });
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
    /** 역 안내판: 노선·방향마다 그 역에 선 실제 열차, 공식 도착 정보, 다가오는 실제 열차까지 남은 시간 순으로 쓴다. 다 없으면 시간표 안내(sim)에 '시간표'를 붙인다 */
    board(station: string, sim: BoardRow[], now: number): BoardRow[] {
      const table = (row: BoardRow): BoardRow => ({ ...row, state: `${row.state === '정차 중' ? '곧 도착' : row.state} · 시간표` });
      return sim.map((row) => {
        const stops = stopsOf.get(row.line);
        const st = stops?.find((x) => x.name === station && x.inside);
        if (!stops || !st) return table(row);
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
        if (best === 0) return { ...row, state: '정차 중', inSec: 0 };
        // 공식 도착 정보(받은 지 6분 안)
        if (now - arrivalsAt < 6 * 60_000)
          for (const a of arrivals) {
            if (a.line !== row.line || a.stn !== station || (a.updn === DIR0[a.line] ? 0 : 1) !== row.dir) continue;
            const got = arrivalState(a, now);
            if (got) return { ...row, ...got };
          }
        if (best === Infinity) return table(row);
        return { ...row, state: best < 90 ? '곧 도착' : `${Math.ceil(best / 60)}분 후`, inSec: Math.round(best) };
      });
    },
  };
}
