import { describe, expect, it } from 'vitest';
import { BOARD_R, ORIGIN, toLatLon, toXZ } from '../src/geo.ts';

describe('geo', () => {
  it('원점은 (0,0)', () => {
    const [x, z] = toXZ(ORIGIN.lat, ORIGIN.lon);
    expect(Math.abs(x)).toBeLessThan(1e-9);
    expect(Math.abs(z)).toBeLessThan(1e-9);
  });
  it('북쪽은 z 음수, 동쪽은 x 양수', () => {
    const [, z] = toXZ(ORIGIN.lat + 0.001, ORIGIN.lon);
    expect(z).toBeGreaterThan(-112);
    expect(z).toBeLessThan(-110);
    const [x] = toXZ(ORIGIN.lat, ORIGIN.lon + 0.001);
    expect(x).toBeGreaterThan(87);
    expect(x).toBeLessThan(89);
  });
  it('왕복 변환', () => {
    const [x, z] = toXZ(37.5572, 126.9245);
    const [lat, lon] = toLatLon(x, z);
    expect(Math.abs(lat - 37.5572)).toBeLessThan(1e-7);
    expect(Math.abs(lon - 126.9245)).toBeLessThan(1e-7);
  });
  it('판 반지름', () => expect(BOARD_R).toBe(2000));
});
