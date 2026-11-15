import { describe, expect, it } from 'vitest';
import { lampMap } from '../src/render/roads.ts';
import { road } from './helpers.ts';

describe('밤 가로등 빛 지도', () => {
  it('여러 큰길이 모이는 교차로에서도 가로등 하나의 최대 세기(0.4)를 넘지 않는다(빛을 더해 하얗게 포화되지 않게)', () => {
    const roads = [0, 1, 2, 3, 4, 5].map((k) => {
      const a = (k * Math.PI) / 3;
      return road([[0, 0], [Math.cos(a) * 200, Math.sin(a) * 200]], { cls: 1, lanes: 4 });
    });
    const data = lampMap(roads).image.data as Uint8Array;
    let top = 0;
    for (const v of data) top = Math.max(top, v);
    expect(top).toBeGreaterThan(90);
    expect(top).toBeLessThanOrEqual(Math.round(0.4 * 255));
  });
});
