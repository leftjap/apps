import { describe, expect, it } from 'vitest';
import { BOATS, boatAt } from '../src/sim/boats.ts';

describe('한강 배(연출)', () => {
  const L = 3600;
  it('운항 시간에만 물 위에 있고, 새벽에는 없다', () => {
    for (const b of BOATS) {
      expect(boatAt(b, 3 * 3600, L)).toBeNull();
      let seen = false;
      for (let t = 12 * 3600; t < 14 * 3600; t += 30) if (boatAt(b, t, L)) seen = true;
      expect(seen).toBe(true);
    }
  });
  it('물길 안에서 움직이고 1초에 12m 넘게 건너뛰지 않는다', () => {
    for (const b of BOATS)
      for (let t = 10 * 3600; t < 22 * 3600; t += 7) {
        const a = boatAt(b, t, L);
        const c = boatAt(b, t + 1, L);
        if (!a || !c) continue;
        expect(a.s).toBeGreaterThanOrEqual(0);
        expect(a.s).toBeLessThanOrEqual(L);
        expect(Math.abs(a.s - c.s)).toBeLessThan(12);
      }
  });
  it('동쪽으로 갔다가 서쪽으로 돌아온다', () => {
    const dirs = new Set<number>();
    for (const b of BOATS) for (let t = 12 * 3600; t < 16 * 3600; t += 20) dirs.add(boatAt(b, t, L)?.dir ?? 0);
    expect(dirs.has(1)).toBe(true);
    expect(dirs.has(-1)).toBe(true);
  });
});
