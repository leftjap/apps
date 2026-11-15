// 건물 유형별 덩어리: 변마다 들이기, 빌라 북쪽 사선 후퇴·필로티, 단독주택 박공, 상가주택·업무 빌딩 단차, 아파트 옥상 구조물
import { describe, expect, it } from 'vitest';
import { USE, type Building } from '../src/data/board.ts';
import { insetEdges, looks, prismGeometry, propsOf, refine, STYLE } from '../src/render/buildings.ts';

const box = (x0: number, z0: number, w: number, d: number) => new Float32Array([x0, z0, x0 + w, z0, x0 + w, z0 + d, x0, z0 + d]);
const bld = (o: Partial<Building> & { pts: Float32Array; h: number }): Building => ({ lm: 0, minH: 0, roof: 0, ...o });
const minZ = (p: Float32Array) => Math.min(...Array.from(p).filter((_, i) => i % 2 === 1));

describe('변마다 들이기', () => {
  it('북쪽 변(−z 쪽)만 2m 들인다', () => {
    expect(Array.from(insetEdges(box(0, 0, 10, 10), [2, 0, 0, 0])!)).toEqual([0, 2, 10, 2, 10, 10, 0, 10]);
  });
  it('네 변을 모두 1m 들인다', () => {
    expect(Array.from(insetEdges(box(0, 0, 10, 10), [1, 1, 1, 1])!)).toEqual([1, 1, 9, 1, 9, 9, 1, 9]);
  });
  it('너무 들여 뒤집히면 null', () => {
    expect(insetEdges(box(0, 0, 4, 4), [3, 0, 3, 0])).toBeNull();
  });
});

describe('유형별 덩어리', () => {
  it('5층 빌라는 북쪽 변을 위층에서 계단식으로 들이고, 꼭짓점 수는 그대로다', () => {
    const [L] = looks([bld({ pts: box(0, 0, 12, 14), h: 16.5, use: USE.villa, levels: 5 })]);
    expect(L.style).toBe(STYLE.villa);
    const tiers = L.tiers;
    expect(tiers.length).toBeGreaterThanOrEqual(2);
    for (const t of tiers) expect(t.ring.length).toBe(8);
    const top = tiers[tiers.length - 1];
    expect(minZ(top.ring)).toBeGreaterThan(1);
    expect(top.y1).toBeCloseTo(16.5, 5);
    // 남쪽 변(z = 14)은 들이지 않는다
    expect(Math.max(...Array.from(top.ring).filter((_, i) => i % 2 === 1))).toBeCloseTo(14, 5);
  });
  it('필로티 빌라는 1층을 안쪽으로 들인 어두운 덩어리로 세운다', () => {
    // 필로티 여부는 난수로 정해지므로 여러 자리에서 하나라도 나오면 된다
    const found = Array.from({ length: 40 }, (_, k) => looks([bld({ pts: box(k * 37.3, k * 11.1, 11, 13), h: 13.8, use: USE.villa, levels: 4 })])[0]).find((L) => L.tiers[0].dark);
    expect(found).toBeDefined();
    const g = found!.tiers[0];
    expect(g.y0).toBe(0);
    expect(g.y1).toBeLessThan(3.6);
    expect(Math.min(...Array.from(g.ring).filter((_, i) => i % 2 === 0))).toBeGreaterThan(found!.tiers[1].ring[0]);
  });
  it('단독주택은 박공 지붕을 얹는다', () => {
    const [L] = looks([bld({ pts: box(0, 0, 9, 7), h: 6.5, use: USE.house, levels: 2 })]);
    expect(L.style).toBe(STYLE.house);
    expect(L.roof).toBe(2);
    expect(L.parapet).toBe(0);
  });
  it('상가주택은 1층 상가 위로 주거부를 트인 변에서만 들이고, 옆 건물과 붙은 변은 그대로 둔다', () => {
    const list = [
      bld({ pts: box(0, 0, 10, 12), h: 14, use: USE.commercial, levels: 4 }),
      bld({ pts: box(10, 0, 10, 12), h: 14, use: USE.commercial, levels: 4 }),
    ];
    const L = looks(list).find((l, i) => i === 0 && l.tiers.length === 2) ?? looks(list)[0];
    expect(L.tiers).toHaveLength(2);
    const [shop, home] = L.tiers;
    expect(shop.style).toBe(STYLE.shop);
    expect(home.style).toBe(STYLE.villa);
    expect(home.y0).toBeCloseTo(L.gh, 5);
    // 동쪽 변(x = 10)은 옆 건물과 붙어 있어 그대로, 서쪽 변(x = 0)은 들인다
    const xs = Array.from(home.ring).filter((_, i) => i % 2 === 0);
    expect(Math.max(...xs)).toBeCloseTo(10, 5);
    expect(Math.min(...xs)).toBeGreaterThan(0.3);
  });
  it('업무 빌딩은 저층부 위로 탑을 들인다', () => {
    const [L] = looks([bld({ pts: box(0, 0, 32, 28), h: 62, use: USE.office, levels: 15 })]);
    expect(L.base).toBe(STYLE.glass);
    expect(L.tiers).toHaveLength(2);
    const [pod, tower] = L.tiers;
    expect(pod.y1).toBeGreaterThan(8);
    expect(pod.y1).toBeLessThan(16);
    expect(Math.min(...Array.from(tower.ring).filter((_, i) => i % 2 === 0))).toBeGreaterThanOrEqual(1.5);
  });
  it('판상형 아파트 옥상에는 기계실이 둘 이상, 타워형에는 가운데 하나와 물탱크실', () => {
    const slab = [bld({ pts: box(0, 0, 60, 13), h: 45, use: USE.apartments, levels: 15 })];
    const tower = [bld({ pts: box(0, 0, 24, 22), h: 70, use: USE.apartments, levels: 25 })];
    const machines = (list: Building[]) => {
      const d = propsOf(list, looks(list));
      return Array.from({ length: d.length / 12 }, (_, i) => d[i * 12 + 7]).filter((k) => k === 3).length;
    };
    expect(machines(slab)).toBeGreaterThanOrEqual(2);
    expect(machines(tower)).toBe(2);
  });
});

describe('상징 건물', () => {
  it('메세나폴리스 탑은 꼭대기가 긴 축을 따라 기운 경사 왕관이고, 가장 높은 곳이 실제 높이다', () => {
    const list = refine([bld({ pts: box(0, 0, 40, 20), h: 137, lm: 13, use: USE.apartments, levels: 39 })]);
    const g = prismGeometry(list, looks(list));
    const y = g.attributes.position.array as Float32Array;
    let top = 0;
    let low = Infinity;
    for (let i = 1; i < y.length; i += 3) if (y[i] > 100) (top = Math.max(top, y[i])), (low = Math.min(low, y[i]));
    expect(top).toBeCloseTo(137, 3);
    expect(top - low).toBeGreaterThan(10);
  });
});
