import type * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { cumLen } from '../src/poly.ts';
import { bodyType, CAR_MIX, SHAPES } from '../src/render/cars.ts';
import { carPose, findPortals, trainCar } from '../src/render/rails.ts';

// 동쪽으로 곧게 놓인 노선: 0~500m 는 높이 2m(지상), 500m 부터 6% 로 내려가 −14m 에서 평평해진다. 650m(높이 −7m)부터 터널 조각이다
const ramp = (() => {
  const pts: number[] = [];
  for (let x = 0; x <= 2000; x += 10) pts.push(x, Math.max(-14, Math.min(2, 2 - (x - 500) * 0.06)), 0);
  const p = Float32Array.from(pts);
  const kind = Int8Array.from({ length: pts.length / 3 - 1 }, (_, i) => (i * 10 >= 650 ? -1 : 0));
  return { p, cum: cumLen(p), kind };
})();

describe('터널 입구', () => {
  it('지상 조각에서 터널 조각으로 바뀌는 곳에 입구 하나를 두고, 터파기 구간은 땅높이(0)를 지나는 곳에서 입구까지다', () => {
    const ps = findPortals(ramp);
    expect(ps).toHaveLength(1);
    const { s0, sP } = ps[0];
    expect(s0).toBeCloseTo(500 + 2 / 0.06, 0);
    expect(sP).toBeCloseTo(650, 0);
  });
  it('높이가 아니라 조각 종류로 정한다: 입구보다 얕아도 지상 조각이면 터파기, 터널 조각이면 터널이다', () => {
    const p = Float32Array.from([0, -14, 0, 100, -14, 0, 110, 2, 0, 300, 2, 0]);
    const ps = findPortals({ p, cum: cumLen(p), kind: Int8Array.from([-1, 0, 0]) });
    expect(ps).toHaveLength(1);
    const L = Math.hypot(10, 16); // 거리 값은 높이까지 친 길이다
    expect(ps[0].sP).toBeCloseTo(100, 3);
    expect(ps[0].s0).toBeCloseTo(100 + (L * 14) / 16, 3);
    const flat = Float32Array.from([0, -3, 0, 100, -3, 0, 200, -3, 0]);
    expect(findPortals({ p: flat, cum: cumLen(flat), kind: Int8Array.from([-1, -1]) })).toHaveLength(0);
  });
  it('처음부터 끝까지 지하인 노선에는 입구가 없다', () => {
    const p = Float32Array.from([0, -14, 0, 3000, -14, 0]);
    expect(findPortals({ p, cum: cumLen(p), kind: Int8Array.from([-1]) })).toHaveLength(0);
  });
  it('칸의 앞뒤 끝이 모두 입구보다 깊어야 터널 안(지하 층)으로 친다', () => {
    const { sP } = findPortals(ramp)[0];
    expect(carPose(ramp, sP - 5).under).toBe(false);
    expect(carPose(ramp, sP + 5).under).toBe(false); // 뒤 끝이 아직 터파기 안에 있다
    expect(carPose(ramp, sP + 12).under).toBe(true);
    expect(carPose(ramp, 1500).under).toBe(true);
  });
  it('경사로의 칸은 기울어져 앞이 내려가고, 평지의 칸은 수평이다', () => {
    expect(carPose(ramp, 600).pitch).toBeCloseTo(Math.atan(-0.06), 2);
    expect(carPose(ramp, 200).pitch).toBeCloseTo(0, 5);
  });
});

describe('차 모형', () => {
  // 바꾸기 전 꼭짓점 수: 승용차·택시 732, 버스 1056, 마을버스 732
  const count = (g: THREE.BufferGeometry) => g.attributes.position.count;
  it('승용차·택시는 바꾸기 전의 1.5배(1098) 안이다', () => {
    for (const k of ['sedan', 'suv', 'kei', 'van', 'taxi'] as const) expect(count(SHAPES[k]())).toBeLessThanOrEqual(1098);
  });
  it('버스는 바꾸기 전의 1.5배(1584) 안이다', () => {
    for (const k of ['bus', 'coach', 'minibus'] as const) expect(count(SHAPES[k]())).toBeLessThanOrEqual(1584);
  });
  it('차종은 세단·SUV·경차·승합 비율대로 나뉜다', () => {
    const n = [0, 0, 0, 0];
    const N = 20000;
    for (let i = 0; i < N; i++) n[bodyType(Math.fround((i + 0.5) / N))]++;
    CAR_MIX.forEach((share, k) => expect(n[k] / N).toBeCloseTo(share, 1));
  });
});

describe('전동차 모형', () => {
  it('한 칸은 약 19.5m 이고 폭은 3.1~3.2m 다', () => {
    const g = trainCar();
    g.computeBoundingBox();
    const b = g.boundingBox!;
    expect(b.max.x - b.min.x).toBeCloseTo(19.5, 1);
    expect(b.max.z - b.min.z).toBeGreaterThan(3.1);
    expect(b.max.z - b.min.z).toBeLessThan(3.25);
  });
});
