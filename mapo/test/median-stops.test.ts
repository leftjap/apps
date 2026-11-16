import { describe, expect, it } from 'vitest';
import { medianLaneClearance } from '../tools/measure-medlanes.ts';

// 중앙버스정류장 승강장 둘레: 일반 차로·반대 방향 중앙버스차로 가운데선이 승강장 테두리에서 (차 반폭 + 0.3m) 넘게 떨어진다(2026-11-17 W12).
// 고치기 전에는 신촌오거리.2호선신촌역 일반 −1.19m, 연희104고지앞 일반 −2.28m, 합정역 반대 방향 버스가 걸렸다(W8 측정)
describe('중앙 정류장 승강장 둘레 차로', () => {
  const all = medianLaneClearance();
  it('구운 판의 중앙 정류장 승강장 16곳이 모두 있고, 어느 곳도 차로가 승강장 테두리 여유 안으로 지나지 않는다', () => {
    expect(all).toHaveLength(16);
    expect(all.filter(([, d]) => d < 0)).toEqual([]);
  });
  it('세 정류장(신촌오거리.2호선신촌역, 연희104고지앞, 합정역)도 여유가 0 이상이다', () => {
    for (const name of ['신촌오거리.2호선신촌역', '연희104고지앞', '합정역']) {
      const mine = all.filter(([n]) => n.startsWith(name));
      expect(mine.length).toBeGreaterThan(0);
      for (const [, d] of mine) expect(d).toBeGreaterThanOrEqual(0);
    }
  });
});
