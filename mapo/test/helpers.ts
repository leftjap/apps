import type { Crosswalk, Road } from '../src/data/board.ts';
import type { DataProvider } from '../src/sim/provider.ts';

/** 시험용 도로 조각. pts 는 [x,z] 목록 */
export const road = (pts: [number, number][], o: Partial<Road> = {}): Road => {
  const lanes = o.lanes ?? 2;
  const oneway = o.oneway ?? false;
  return {
    cls: 2,
    lanes,
    oneway,
    bridge: false,
    name: '',
    lm: 0,
    p: Float32Array.from(pts.flatMap(([x, z]) => [x, 0, z])),
    lf: oneway ? Math.max(1, lanes) : Math.max(1, Math.ceil(lanes / 2)),
    lb: oneway ? 0 : Math.max(1, Math.ceil(lanes / 2)),
    lw: 3.3,
    ctype: 1,
    busR: false,
    busL: false,
    medBus: false,
    gap: 0,
    measured: false,
    ...o,
  };
};

/** 속도 비율을 고정한 자료 공급자 */
export const fixedProvider = (speed: number, pop = 20000): DataProvider => ({
  mode: 'sim',
  areas: () => [{ id: 'hongdae', name: '홍대 관광특구', level: 2, label: '약간 붐빔', pplMin: pop, pplMax: pop + 1000, crowd: pop / 30000, ages: [5, 10, 25, 20, 15, 12, 8, 5], female: 50 }],
  roadSpeed: () => speed,
  alighting: () => 300,
});

export const at = (h: number, dow = 2) => ({ tod: h * 3600, dow, doy: 317 });

/** 시험용 횡단보도. verts 는 축이 지나는 길 꼭짓점 [x,z] 목록 */
export const crosswalk = (x: number, z: number, ux: number, uz: number, half: number, verts: [number, number][], sig = true, wid = 4): Crosswalk => ({
  x,
  z,
  ux,
  uz,
  half,
  wid,
  sig,
  sigUnknown: false,
  verts: Float32Array.from(verts.flat()),
});
