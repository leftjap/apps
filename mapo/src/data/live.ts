// 실시간 도시데이터(중계 함수 supabase/functions/mapo-citydata 가 추린 값)를 시뮬레이션 공급자 위에 덧씌운다.
// 장소 인구·혼잡 단계·나이대·여성 비율은 실제 값을 쓰고, 도로 속도는 실제 도로 구간 바로 옆(20m 안, 같은 방향)만
// 그 구간의 원활·서행·정체로 바꾼다. 자료가 없는 장소와 길, 시험 시각으로 볼 때는 시뮬레이션 그대로다.
import { toXZ } from '../geo.ts';
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
export interface LiveData {
  places: LivePlace[];
  roads: LiveRoad[];
  roadTime: string;
  at: number;
}

/** 실시간 도시데이터 장소 이름 → 구역 id */
const AREA_ID: Record<string, string> = { '홍대 관광특구': 'hongdae', '홍대입구역(2호선)': 'hongik-stn', 연남동: 'yeonnam', 합정역: 'hapjeong', 망원한강공원: 'mangwon' };
/** 원활·서행·정체를 속도 비율로(흐름 색 경계 0.6·0.35 안쪽 값) */
const IDX_SPEED: Record<string, number> = { 원활: 0.8, 서행: 0.45, 정체: 0.2 };
/** 혼잡 단계 → 혼잡 정도(그 장소 붐빔 기준 대비) */
const CROWD = [0.3, 0.55, 0.8, 1.05];

export function makeLiveProvider(sim: DataProvider) {
  let data: LiveData | null = null;
  let on = true;
  // 도로 구간 조각: [x0, z0, x1, z1, 속도 비율] 을 50m 칸 격자에 넣는다
  let segs: number[][] = [];
  let grid = new Map<number, number[]>();
  const key = (cx: number, cz: number) => cx * 100000 + cz;

  function set(d: LiveData) {
    data = d;
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
        for (let cx = Math.floor(Math.min(s[0], s[2]) / 50) - 1; cx <= Math.floor(Math.max(s[0], s[2]) / 50) + 1; cx++)
          for (let cz = Math.floor(Math.min(s[1], s[3]) / 50) - 1; cz <= Math.floor(Math.max(s[1], s[3]) / 50) + 1; cz++)
            (grid.get(key(cx, cz)) ?? grid.set(key(cx, cz), []).get(key(cx, cz))!).push(id);
      }
    }
  }
  /** (x, z)에서 20m 안이고 방향 h 와 50° 안으로 같은 실제 도로 구간의 속도 비율(없으면 −1) */
  function linkSpeed(x: number, z: number, h?: number): number {
    let best = -1;
    let bd = 20;
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
      return on && data ? 'live' : 'sim';
    },
    areas(now) {
      const base = sim.areas(now);
      if (!on || !data) return base;
      return base.map((a) => {
        const p = data!.places.find((q) => AREA_ID[q.name] === a.id);
        if (!p) return a;
        const level = Math.max(0, LEVELS.indexOf(p.level as (typeof LEVELS)[number])) as 0 | 1 | 2 | 3;
        return { ...a, level, label: LEVELS[level], pplMin: p.min, pplMax: p.max, crowd: CROWD[level], ages: p.ages, female: p.female };
      });
    },
    roadSpeed(now, cls, edgeKey, x, z, h) {
      if (on && data && x !== undefined && z !== undefined) {
        const v = linkSpeed(x, z, h);
        if (v >= 0) return v;
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
    get data() {
      return data;
    },
  };
}
