// 카메라 하한(재작업 W5-⑨): 가까이 당기면 사람 눈높이(지면 위 2~5m, 보는 거리 20m 안팎)까지 내려가고,
// 땅 밑·건물 속으로는 들어가지 않는다
import { describe, expect, it } from 'vitest';
import { CAM, clipPlanes, keepOut, makeSolids, maxPolar, minPolar } from '../src/render/camfloor.ts';

const box = (x0: number, z0: number, x1: number, z1: number, h: number, minH = 0) => ({
  h,
  minH,
  lm: 0,
  pts: Float32Array.from([x0, z0, x1, z0, x1, z1, x0, z1]),
});

describe('카메라 하한', () => {
  it('가장 가까이 당기면 보는 거리 20m 안팎에서 지면 위 2~5m 로 내려갈 수 있다', () => {
    expect(CAM.minDist).toBeGreaterThanOrEqual(15);
    expect(CAM.minDist).toBeLessThanOrEqual(25);
    const d = CAM.minDist;
    const lowest = Math.max(CAM.eye, d * Math.cos(maxPolar(d)));
    expect(lowest).toBeGreaterThanOrEqual(2);
    expect(lowest).toBeLessThanOrEqual(5);
    // 거리 40m 에서도 눈높이(5m 아래)까지 내려간다
    expect(40 * Math.cos(maxPolar(40))).toBeLessThanOrEqual(5);
  });

  it('휠로 가장 가까이 당기면 저절로 눕혀 눈높이(5m 아래)가 된다', () => {
    const d = CAM.minDist;
    expect(d * Math.cos(minPolar(d))).toBeLessThanOrEqual(5);
    expect(minPolar(d)).toBeLessThan(maxPolar(d));
    // 멀리서는 내려다보기를 막지 않는다
    expect(minPolar(60)).toBe(0);
    for (let k = 10; k < 200; k += 10) expect(minPolar(k)).toBeGreaterThanOrEqual(minPolar(k + 10));
  });

  it('멀리서 보면 예전처럼 80도까지만 기운다', () => {
    expect(maxPolar(300)).toBeCloseTo((80 * Math.PI) / 180, 5);
    expect(maxPolar(3000)).toBeCloseTo((80 * Math.PI) / 180, 5);
    // 가까울수록 더 눕고(거리 따라 늘지 않는다), 90도(수평) 아래다
    for (let d = 10; d < 400; d += 10) {
      expect(maxPolar(d)).toBeGreaterThanOrEqual(maxPolar(d + 10) - 1e-9);
      expect(maxPolar(d)).toBeLessThan(Math.PI / 2);
    }
  });

  it('가까운 면(near)은 눈높이에서 발밑 보도까지 그리고, 멀리서는 예전 값(20m)이다', () => {
    const lo = clipPlanes(CAM.minDist);
    // 거리 18m·높이 2m 에서 화면 아래 끝(수평 아래 약 22도)이 닿는 땅은 약 5m 앞
    expect(lo.near).toBeLessThanOrEqual(1);
    expect(lo.near).toBeGreaterThan(0.1);
    expect(clipPlanes(2000).near).toBe(20);
    expect(clipPlanes(16000).far).toBeGreaterThanOrEqual(40000);
  });

  it('땅 밑으로 내려가지 않는다', () => {
    const s = makeSolids([]);
    const p = { x: 0, y: -3, z: 30 };
    keepOut(s, 0, 0, p);
    expect(p.y).toBe(CAM.eye);
  });

  it('건물 속에 들면 보는 지점 쪽으로 건물 밖까지 당겨 낸다', () => {
    // 보는 지점 (0,0), 건물은 z 10~40, 높이 20m
    const s = makeSolids([box(-20, 10, 20, 40, 20)]);
    const p = { x: 0, y: 4, z: 25 };
    keepOut(s, 0, 0, p);
    expect(p.z).toBeLessThan(10);
    expect(p.z).toBeGreaterThan(8);
    expect(s.inside(p.x, p.y, p.z)).toBe(-1);
  });

  it('가까이 볼 때 보는 지점과 카메라 사이를 건물이 가리면 건물 앞으로 당긴다', () => {
    // 보는 지점 (0,0), 건물 z 8~14 높이 12m, 카메라는 건물 뒤 z 20 높이 3m(거리 약 20m)
    const s = makeSolids([box(-20, 8, 20, 14, 12)]);
    const p = { x: 0, y: 3, z: 20 };
    keepOut(s, 0, 0, p);
    expect(p.z).toBeLessThan(8);
    expect(p.z).toBeGreaterThan(5);
    expect(p.y).toBeGreaterThanOrEqual(CAM.eye);
  });

  it('멀리서 볼 때는 가린 건물 때문에 당기지 않는다', () => {
    const s = makeSolids([box(-20, 100, 20, 140, 120)]);
    const p = { x: 0, y: 100, z: 400 };
    keepOut(s, 0, 0, p);
    expect(p).toEqual({ x: 0, y: 100, z: 400 });
  });

  it('보는 지점이 건물 안(지붕 위를 볼 때)이면 지붕 위로 올린다', () => {
    const s = makeSolids([box(-50, -50, 50, 50, 30)]);
    const p = { x: 10, y: 12, z: 20 };
    keepOut(s, 0, 0, p);
    expect(p.y).toBeGreaterThanOrEqual(30);
    expect(s.inside(p.x, p.y, p.z)).toBe(-1);
  });

  it('건물 밖·지붕 위·필로티 아래 빈 곳은 그대로 둔다', () => {
    const s = makeSolids([box(-20, 10, 20, 40, 20), box(100, 0, 120, 20, 30, 8)]);
    for (const q of [
      { x: 0, y: 4, z: 5 },
      { x: 0, y: 60, z: 25 },
      { x: 110, y: 4, z: 10 },
    ]) {
      const p = { ...q };
      keepOut(s, 0, 0, p);
      expect(p).toEqual(q);
    }
  });

  it('hide 로 적은(그리지 않는) 건물은 막지 않는다', () => {
    const b = { ...box(-20, 10, 20, 40, 20), hidden: true };
    const s = makeSolids([b]);
    expect(s.inside(0, 4, 25)).toBe(-1);
  });
});
