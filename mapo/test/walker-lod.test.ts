import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { FAR_VERTS, NEAR_VERTS, walkerLod } from '../src/render/walkers.ts';

// 화면 높이 900px, 화각 32°인 카메라(앱과 같은 값)
const projK = 900 / (2 * Math.tan((16 * Math.PI) / 180));
const cam = (x: number, y: number, z: number) => {
  const c = new THREE.PerspectiveCamera(32, 1.6, 1, 20000);
  c.position.set(x, y, z);
  c.lookAt(0, 0, 0);
  c.updateMatrixWorld();
  return new THREE.Matrix4().multiplyMatrices(c.projectionMatrix, c.matrixWorldInverse).elements;
};

describe('사람 그리기 단계', () => {
  it('화면 밖이나 카메라 뒤에 있는 사람은 그리지 않는다', () => {
    const e = cam(0, 300, 300);
    expect(walkerLod(e, projK, 5000, 0)).toBe(0);
    expect(walkerLod(e, projK, 0, 2000)).toBe(0);
  });
  it('가까이 크게 보이는 사람은 자세한 모형, 멀리 작게(14px 미만) 보이는 사람은 단순한 모형으로 그린다', () => {
    expect(walkerLod(cam(0, 30, 30), projK, 0, 0)).toBe(1);
    expect(walkerLod(cam(0, 300, 300), projK, 0, 0)).toBe(2);
    expect(walkerLod(cam(0, 900, 700), projK, 0, 0)).toBe(2);
  });
  it('단순한 모형은 정점 130개 안이고, 자세한 모형은 2,400개를 넘지 않는다', () => {
    expect(FAR_VERTS).toBeLessThanOrEqual(130);
    expect(NEAR_VERTS).toBeLessThanOrEqual(2400);
  });
});
