// 실시간 도시데이터(중계 함수 supabase/functions/mapo-citydata 가 추린 값)를 시뮬레이션 공급자 위에 덧씌운다.
// 장소 인구·혼잡 단계·나이대·여성 비율은 실제 값을 쓰고, 도로 속도는 실제 도로 구간 바로 옆(20m 안, 같은 방향)만
// 그 구간의 원활·서행·정체로 바꾼다. 도시고속도로(등급 0)는 공식 구간 선이 반대 방향 차로 위에 그려진 곳이 많아 같은 방향 80m 안까지 본다.
// 자료가 없는 장소와 길, 시험 시각으로 볼 때, 받은 지 15분이 넘은 자료(중계가 끊긴 때)는 시뮬레이션 그대로다.
import { BOARD_R, toXZ } from '../geo.ts';
import { effectOf, type Incident } from '../sim/incidents.ts';
import { LEVELS, type DataProvider } from '../sim/provider.ts';

export interface LivePlace {
  name: string;
  level: string;
  min: number;
  max: number;
  ages: number[];
  female: number;
  time: string;
}
export interface LiveRoad {
  id: string;
  idx: string;
  spd: number;
  /** [경도, 위도] 출발 노드부터 도착 노드까지 */
  xy: [number, number][];
}
/** 장소 둘레 날씨(실시간 도시데이터 WEATHER_STTS) */
export interface LiveWeather {
  /** 강수 형태: 없음·비·비/눈·눈·빗방울·빗방울/눈날림·눈날림 */
  type: string;
  /** 1시간 강수량: '-'(없음), '1mm 미만', '2.0' 같은 글 */
  mm: string;
  time: string;
}
/** 대기질(실시간 도시데이터 WEATHER_STTS): 농도(㎍/㎥)와 등급(좋음·보통·나쁨·매우나쁨) */
export interface LiveAir {
  pm10: number;
  pm10Idx: string;
  pm25: number;
  pm25Idx: string;
  time: string;
}
/** 사고·공사·통제 한 건(중계 함수가 도시데이터 사고통제와 TOPIS 돌발정보에서 판 둘레만 추린 것) */
export interface LiveAccident {
  id: string;
  src: string;
  kind: string;
  detail: string;
  info: string;
  start: string;
  end: string;
  lon: number;
  lat: number;
}
export interface LiveData {
  places: LivePlace[];
  roads: LiveRoad[];
  roadTime: string;
  weather?: LiveWeather | null;
  air?: LiveAir | null;
  accidents?: LiveAccident[];
  /** 중계 함수가 상류에서 받은 시각(epoch ms) */
  at: number;
}

/** 받은 지 이보다 오래된 자료는 쓰지 않는다(ms) */
export const STALE = 15 * 60_000;

/** 비 세기(0~1): 비가 섞인 강수 형태일 때 1시간 강수량으로 정한다(1mm 미만 0.3, 8mm 이상 1). 눈만 오면 0(눈은 그리지 않는다) */
export function rainOf(w: LiveWeather): number {
  if (!/비|빗방울|소나기/.test(w.type)) return 0;
  const n = parseFloat(w.mm);
  const mm = /미만/.test(w.mm) ? 0 : Number.isFinite(n) ? n : 0;
  return Math.min(1, 0.3 + 0.09 * mm);
}

/** 실시간 도시데이터 장소 이름 → 구역 id */
const AREA_ID: Record<string, string> = { '홍대 관광특구': 'hongdae', '홍대입구역(2호선)': 'hongik-stn', 연남동: 'yeonnam', 합정역: 'hapjeong', 망원한강공원: 'mangwon' };
/** 원활·서행·정체를 속도 비율로(흐름 색 경계 0.6·0.35 안쪽 값) */
const IDX_SPEED: Record<string, number> = { 원활: 0.8, 서행: 0.45, 정체: 0.2 };
/** 혼잡 단계 → 혼잡 정도(그 장소 붐빔 기준 대비) */
const CROWD = [0.3, 0.55, 0.8, 1.05];

/** 눈 세기(0~1): 눈이 섞인 강수 형태일 때. 눈날림 0.35, 눈은 0.45 에 1시간 강수량 1mm 마다 0.12 더한다 */
export function snowOf(w: LiveWeather): number {
  if (!/눈/.test(w.type)) return 0;
  if (!/(^|\/)눈($|\/)/.test(w.type)) return 0.35;
  const n = parseFloat(w.mm);
  return Math.min(1, 0.45 + 0.12 * (/미만/.test(w.mm) || !Number.isFinite(n) ? 0 : n));
}
const DUST: Record<string, number> = { 나쁨: 0.5, 매우나쁨: 1 };
/** 미세먼지 탁함(0~1, 두 등급 가운데 나쁜 쪽)과 화면에 쓸 글 */
export function airOf(a: LiveAir): { dust: number; text: string } {
  return { dust: Math.max(DUST[a.pm10Idx] ?? 0, DUST[a.pm25Idx] ?? 0), text: `미세먼지 ${a.pm10Idx}(${a.pm10}) · 초미세먼지 ${a.pm25Idx}(${a.pm25})` };
}

export function makeLiveProvider(sim: DataProvider, wall: () => number = Date.now) {
  let data: LiveData | null = null;
  let on = true;
  /** 지금 쓸 자료(실시간으로 보고 있고, 받은 지 15분 안) */
  const fresh = () => (on && data && wall() - data.at < STALE ? data : null);
  // 도로 구간 조각: [x0, z0, x1, z1, 속도 비율] 을 50m 칸 격자에 넣는다
  let segs: number[][] = [];
  let incs: Incident[] = [];
  let grid = new Map<number, number[]>();
  const key = (cx: number, cz: number) => cx * 100000 + cz;

  function set(d: LiveData) {
    data = d;
    incs = (d.accidents ?? [])
      .map((a) => {
        const [x, z] = toXZ(a.lat, a.lon);
        return { id: a.id, kind: a.kind, detail: a.detail, info: a.info, start: a.start, end: a.end, x, z, effect: effectOf(a.kind, a.detail, a.info) };
      })
      .filter((q) => Math.hypot(q.x, q.z) < BOARD_R);
    segs = [];
    grid = new Map();
    for (const r of d.roads) {
      const v = IDX_SPEED[r.idx];
      if (v === undefined) continue;
      const pts = r.xy.map(([lon, lat]) => toXZ(lat, lon));
      for (let k = 0; k + 1 < pts.length; k++) {
        const s = [pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1], v];
        const id = segs.length;
        segs.push(s);
        for (let cx = Math.floor(Math.min(s[0], s[2]) / 50) - 2; cx <= Math.floor(Math.max(s[0], s[2]) / 50) + 2; cx++)
          for (let cz = Math.floor(Math.min(s[1], s[3]) / 50) - 2; cz <= Math.floor(Math.max(s[1], s[3]) / 50) + 2; cz++)
            (grid.get(key(cx, cz)) ?? grid.set(key(cx, cz), []).get(key(cx, cz))!).push(id);
      }
    }
  }
  /** (x, z)에서 reach(m) 안이고 방향 h 와 50° 안으로 같은 실제 도로 구간의 속도 비율(없으면 −1) */
  function linkSpeed(x: number, z: number, h: number | undefined, reach: number): number {
    let best = -1;
    let bd = reach;
    for (const id of grid.get(key(Math.floor(x / 50), Math.floor(z / 50))) ?? []) {
      const [x0, z0, x1, z1, v] = segs[id];
      const dx = x1 - x0;
      const dz = z1 - z0;
      const L = Math.hypot(dx, dz) || 1;
      if (h !== undefined && (dx * Math.cos(h) + dz * Math.sin(h)) / L < Math.cos((50 * Math.PI) / 180)) continue;
      const u = Math.max(0, Math.min(L, ((x - x0) * dx + (z - z0) * dz) / L));
      const d = Math.hypot(x0 + (dx / L) * u - x, z0 + (dz / L) * u - z);
      if (d < bd) (bd = d), (best = v);
    }
    return best;
  }

  const provider: DataProvider = {
    get mode() {
      return fresh() ? 'live' : 'sim';
    },
    areas(now) {
      const base = sim.areas(now);
      const d = fresh();
      if (!d) return base;
      return base.map((a) => {
        const p = d.places.find((q) => AREA_ID[q.name] === a.id);
        if (!p) return a;
        const level = Math.max(0, LEVELS.indexOf(p.level as (typeof LEVELS)[number])) as 0 | 1 | 2 | 3;
        return { ...a, level, label: LEVELS[level], pplMin: p.min, pplMax: p.max, crowd: CROWD[level], ages: p.ages, female: p.female };
      });
    },
    roadSpeed(now, cls, edgeKey, x, z, h) {
      if (fresh() && x !== undefined && z !== undefined) {
        const v = linkSpeed(x, z, h, cls === 0 ? 80 : 20);
        if (v >= 0) return v;
        // 실시간 도로 속도가 없는 길(골목 등)만 돌발 지점 40m 안에서 절반으로 늦춘다(있는 길에는 사고 정체가 이미 들어 있다)
        if (incs.some((q) => Math.hypot(q.x - x, q.z - z) < 40)) return sim.roadSpeed(now, cls, edgeKey, x, z, h) * 0.5;
      }
      return sim.roadSpeed(now, cls, edgeKey, x, z, h);
    },
    alighting: (now, station) => sim.alighting(now, station),
  };
  return {
    provider,
    set,
    /** 지금 시각으로 볼 때만 실시간 자료를 쓴다 */
    use(v: boolean) {
      on = v;
    },
    /** 쓸 수 있는 자료(오래되었거나 시험 시각이면 null) */
    get data() {
      return fresh();
    },
    /** 실제 비 세기(0~1). 날씨 자료가 없거나 쓸 수 없으면 null */
    rain(): number | null {
      const w = fresh()?.weather;
      return w ? rainOf(w) : null;
    },
    /** 판 안 돌발정보(사고·공사·통제). 쓸 수 없으면 빈 목록 */
    incidents(): Incident[] {
      return fresh() ? incs : [];
    },
    /** 실제 눈 세기(0~1). 쓸 수 없으면 null */
    snow(): number | null {
      const w = fresh()?.weather;
      return w ? snowOf(w) : null;
    },
    /** 미세먼지 탁함과 글. 쓸 수 없으면 null */
    air(): { dust: number; text: string } | null {
      const a = fresh()?.air;
      return a ? airOf(a) : null;
    },
  };
}
