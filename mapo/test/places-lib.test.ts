import { describe, expect, it } from 'vitest';
import { axis, roomiest } from '../tools/lib/label.ts';

describe('가장 넓은 자리', () => {
  it('정사각형이면 가운데, 반지름은 변까지', () => {
    const r = roomiest([0, 0, 1000, 1000], 20, () => true)!;
    expect(Math.abs(r.x - 500)).toBeLessThan(25);
    expect(Math.abs(r.z - 500)).toBeLessThan(25);
    expect(r.r).toBeGreaterThan(470);
    expect(r.r).toBeLessThan(530);
  });
  it('ㄱ자 모양이면 굵은 팔 안쪽', () => {
    // 굵은 팔 x 0~1000 · z 0~600, 가는 팔 x 0~200 · z 600~2000
    const ok = (x: number, z: number) => (z < 600 && x < 1000) || x < 200;
    const r = roomiest([0, 0, 1000, 2000], 20, ok)!;
    expect(r.z).toBeLessThan(600);
    expect(r.x).toBeGreaterThan(200);
    expect(r.r).toBeGreaterThan(250);
  });
  it('들어갈 칸이 없으면 null', () => expect(roomiest([0, 0, 100, 100], 20, () => false)).toBeNull());
});

describe('글줄 방향', () => {
  const line = (deg: number, n = 11) =>
    Array.from({ length: n }, (_, i) => [100 + Math.cos((deg * Math.PI) / 180) * (i - 5) * 10, 50 + Math.sin((deg * Math.PI) / 180) * (i - 5) * 10] as [number, number]);
  it('30° 로 늘어선 점들', () => {
    const a = axis(line(30));
    expect(a.turn).toBeCloseTo((30 * Math.PI) / 180, 5);
    expect(a.x).toBeCloseTo(100, 5);
    expect(a.z).toBeCloseTo(50, 5);
    expect(a.len).toBeCloseTo(100, 5);
  });
  it('거꾸로 읽히는 방향(150°)은 반대로 돌려 -30° 로', () => expect(axis(line(150)).turn).toBeCloseTo((-30 * Math.PI) / 180, 5));
  it('가운데는 양 끝의 한가운데(점이 한쪽에 몰려 있어도)', () => {
    const pts: [number, number][] = [[0, 0], [1, 0], [2, 0], [3, 0], [100, 0]];
    expect(axis(pts).x).toBeCloseTo(50, 5);
  });
});
