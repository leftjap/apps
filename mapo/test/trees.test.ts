import { existsSync, readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BOARD_R, toXZ } from '../src/geo.ts';
import { TREE_KINDS, treeClass, treeKinds } from '../tools/lib/trees.ts';
import { FAR_TREE_VERTS, LOOK, NEAR_TREE_VERTS, TREE_SIZE, treeLod } from '../src/render/trees.ts';

describe('수종 분류', () => {
  it('원자료 수종 이름을 모형 6가지(은행·양버즘·느티·벚·소나무류·그 밖)로 나눈다', () => {
    expect(treeClass('은행나무')).toBe(0);
    expect(treeClass('양버즘나무')).toBe(1);
    expect(treeClass('느티나무')).toBe(2);
    expect(treeClass('벚나무류')).toBe(3);
    expect(treeClass('왕벚나무')).toBe(3);
    expect(treeClass('소나무')).toBe(4);
    expect(treeClass('잣나무')).toBe(4);
    expect(treeClass('이팝나무')).toBe(5);
    expect(treeClass('살구나무')).toBe(5);
    expect(TREE_KINDS.length).toBe(7);
  });
  it('판 나무와 가로수 원자료를 자리(0.1m 단위 좌표)로 맞추고, 맞는 점이 없으면 녹지 나무(6)로 둔다', () => {
    const [x, z] = toXZ(37.55, 126.92);
    const board = [Math.round(x * 10), Math.round(z * 10), 123, 456];
    expect([...treeKinds(board, [[37.55, 126.92, '은행나무']])]).toEqual([0, 6]);
  });
  it('찻길 면 위 원래 점은 굽기가 옮기는 거리(pushTreesOffRoad 12.8m)까지 떨어진 판 나무와도 짝짓는다', () => {
    const [x, z] = toXZ(37.55, 126.92);
    const board = [Math.round(x * 10) + 110, Math.round(z * 10)];
    expect([...treeKinds(board, [[37.55, 126.92, '소나무']], () => true)]).toEqual([4]);
  });
});

describe('구운 수종 파일(public/data/trees.json)', () => {
  const file = new URL('../public/data/trees.json', import.meta.url);
  it.skipIf(!existsSync(file))('판 나무와 수가 같고, 수종별 그루 수가 판 안 원자료와 맞는다(건물·물 위 점을 뺀 만큼만 적다)', () => {
    const j = JSON.parse(readFileSync(file, 'utf8')) as { k: string };
    const board = JSON.parse(readFileSync(new URL('../public/data/board.json', import.meta.url), 'utf8')) as { trees: number[] };
    expect(j.k.length).toBe(board.trees.length / 2);
    const raw = new URL('../tools/raw/seoul-trees.json', import.meta.url);
    if (!existsSync(raw)) return;
    const rows = (JSON.parse(readFileSync(raw, 'utf8')) as { trees: [number, number, string][] }).trees;
    const want = new Array(6).fill(0);
    for (const [lat, lon, name] of rows) {
      const [x, z] = toXZ(lat, lon);
      if (Math.hypot(x, z) <= BOARD_R - 12) want[treeClass(name)]++;
    }
    const got = new Array(7).fill(0);
    for (const c of j.k) got[+c]++;
    for (let k = 0; k < 6; k++) {
      expect(got[k]).toBeLessThanOrEqual(want[k]);
      expect(got[k]).toBeGreaterThanOrEqual(want[k] * 0.9);
    }
  });
});

describe('나무 그리기', () => {
  const projK = 900 / (2 * Math.tan((16 * Math.PI) / 180));
  const cam = (x: number, y: number, z: number) => {
    const c = new THREE.PerspectiveCamera(32, 1.6, 1, 20000);
    c.position.set(x, y, z);
    c.lookAt(0, 0, 0);
    c.updateMatrixWorld();
    return new THREE.Matrix4().multiplyMatrices(c.projectionMatrix, c.matrixWorldInverse).elements;
  };
  it('화면 밖·카메라 뒤 나무는 그리지 않고, 가까우면 자세한 모형, 멀면 단순한 모형', () => {
    const e = cam(0, 150, 100);
    expect(treeLod(e, projK, 5000, 0)).toBe(0);
    expect(treeLod(e, projK, 0, 0)).toBe(1);
    expect(treeLod(cam(0, 3000, 3000), projK, 0, 0)).toBe(2);
  });
  it('모형 정점: 자세한 모형 250개 안, 단순한 모형 48개 안(옛 모형은 모든 나무가 120개)', () => {
    expect(NEAR_TREE_VERTS.every((n) => n <= 250)).toBe(true);
    expect(FAR_TREE_VERTS).toBeLessThanOrEqual(48);
  });
  it('가로수 수관 지름은 4~7m(실제 크기), 키는 12m 안', () => {
    for (const [d, h] of TREE_SIZE) {
      expect(d).toBeGreaterThanOrEqual(4);
      expect(d).toBeLessThanOrEqual(7);
      expect(h).toBeLessThanOrEqual(12);
    }
  });
  it('수종별 계절: 가을 은행은 노랑, 벚은 잎이 거의 없고, 겨울에는 소나무만 잎이 있다', () => {
    const [ginkgo] = LOOK.autumn;
    const c = new THREE.Color(ginkgo[0]);
    expect(c.r).toBeGreaterThan(c.b + 0.3);
    expect(c.g).toBeGreaterThan(c.b + 0.2);
    expect(LOOK.autumn[3][2]).toBeLessThan(0.3);
    expect(LOOK.winter[4][2]).toBe(1);
    for (const k of [0, 1, 2, 3]) expect(LOOK.winter[k][2]).toBe(0);
  });
});
