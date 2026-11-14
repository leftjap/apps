import type { Road } from '../src/data/board.ts';
import type { DataProvider } from '../src/sim/provider.ts';

/** 시험용 도로 조각. pts 는 [x,z] 목록 */
export const road = (pts: [number, number][], o: Partial<Road> = {}): Road => ({
  cls: 2,
  lanes: 2,
  oneway: false,
  bridge: false,
  name: '',
  lm: 0,
  p: Float32Array.from(pts.flatMap(([x, z]) => [x, 0, z])),
  ...o,
});

/** 속도 비율을 고정한 자료 공급자 */
export const fixedProvider = (speed: number, pop = 20000): DataProvider => ({
  mode: 'sim',
  areas: () => [{ id: 'hongdae', name: '홍대 관광특구', level: 2, label: '약간 붐빔', pplMin: pop, pplMax: pop + 1000, crowd: pop / 30000, ages: [5, 10, 25, 20, 15, 12, 8, 5], female: 50 }],
  roadSpeed: () => speed,
  alighting: () => 300,
});

export const at = (h: number, dow = 2) => ({ tod: h * 3600, dow, doy: 317 });
