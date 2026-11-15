// 건물 유형별 덩어리: 변마다 들이기, 빌라 북쪽 사선 후퇴·필로티, 단독주택 박공, 상가주택·업무 빌딩 단차, 아파트 옥상 구조물
import { describe, expect, it } from 'vitest';
import { USE, type Building } from '../src/data/board.ts';
import { insetEdges, looks, prismGeometry, propsOf, refine, shopOpen, STYLE } from '../src/render/buildings.ts';

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
  it('빌라 사선: 꼭대기가 9m 를 넘는 층부터 북쪽 변을 그 층 꼭대기 높이의 절반 − 1.5m 만큼 들인다', () => {
    const [L] = looks([bld({ pts: box(0, 0, 12, 16), h: 16.5, use: USE.villa, levels: 5 })]);
    const steps = L.tiers.filter((t) => !t.dark && minZ(t.ring) > 0.01);
    expect(steps.length).toBeGreaterThanOrEqual(2);
    const first = steps[0];
    expect(first.y0).toBeLessThanOrEqual(9);
    expect(first.y0 + L.fh).toBeGreaterThan(9);
    expect(minZ(first.ring)).toBeCloseTo((first.y0 + L.fh) / 2 - 1.5, 1);
    expect(minZ(steps[1].ring)).toBeGreaterThan(minZ(first.ring));
  });
  it('북쪽이 아닌 변(동쪽을 향한 변)이나 9m 아래 낮은 빌라는 들이지 않는다', () => {
    const low = looks([bld({ pts: box(0, 0, 12, 16), h: 9.5, use: USE.villa, levels: 3 })])[0];
    expect(low.tiers.filter((t) => !t.dark).every((t) => minZ(t.ring) < 0.01)).toBe(true);
    // 30° 돌린 정사각형: 정북에서 30° 돌아간 변 하나만 들이고(그 변의 두 꼭짓점만 움직인다), 동쪽을 보는 변은 그대로
    const a = (30 * Math.PI) / 180;
    const rot = (x: number, z: number) => [x * Math.cos(a) - z * Math.sin(a), x * Math.sin(a) + z * Math.cos(a)];
    const q = new Float32Array([...rot(0, 0), ...rot(14, 0), ...rot(14, 14), ...rot(0, 14)]);
    const [R] = looks([bld({ pts: q, h: 16.5, use: USE.villa, levels: 5 })]);
    const moved = (t: { ring: Float32Array }) => [0, 1, 2, 3].filter((k) => Math.hypot(t.ring[k * 2] - q[k * 2], t.ring[k * 2 + 1] - q[k * 2 + 1]) > 0.01);
    const steps = R.tiers.filter((t) => !t.dark && moved(t).length);
    expect(steps.length).toBeGreaterThan(0);
    for (const t of steps) expect(moved(t)).toEqual([0, 1]);
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
  it('단독주택 지붕은 자료를 따른다: 박공(2)이면 박공, 모르면 평지붕과 난간', () => {
    const [G] = looks([bld({ pts: box(0, 0, 9, 7), h: 6.5, use: USE.house, levels: 2, roof: 2 })]);
    expect(G.style).toBe(STYLE.house);
    expect(G.roof).toBe(2);
    expect(G.parapet).toBe(0);
    const [F] = looks([bld({ pts: box(0, 0, 9, 7), h: 6.5, use: USE.house, levels: 2 })]);
    expect(F.roof).toBe(0);
    expect(F.parapet).toBeGreaterThan(0);
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
  it('메세나폴리스 탑: 층 높이는 대장 높이(OSM 137m) 지붕선 기준, 유리 왕관 꼭대기는 실제 높이 180m(103동 102 → 121m)', () => {
    const peak = (h: number) => {
      const list = refine([bld({ pts: box(0, 0, 40, 20), h, lm: 13, use: USE.apartments, levels: 39 })]);
      const L = looks(list);
      const y = prismGeometry(list, L).attributes.position.array as Float32Array;
      let top = 0;
      let low = Infinity;
      for (let i = 1; i < y.length; i += 3) if (y[i] > 90) (top = Math.max(top, y[i])), (low = Math.min(low, y[i]));
      return { top, low, fh: L[0].fh };
    };
    const a = peak(137);
    expect(a.top).toBeCloseTo(180, 3);
    expect(a.low).toBeCloseTo(137, 3);
    // 층 높이는 지붕선(137m) 기준(39층이면 3.5m 안팎), 유리 외벽은 왕관 꼭대기까지 이어진다
    expect(a.fh).toBeCloseTo(136.7 / 39, 1);
    expect(peak(102).top).toBeCloseTo(121, 3);
  });
  it('홍문관: OSM building:part 의 45m 두 기둥과 다리를 건축물대장 높이 64.8m(16층)로 올린다', () => {
    const pillar = bld({ pts: box(500, -110, 12, 20), h: 45, lm: 1, use: USE.civic, levels: 10 });
    const bridge = bld({ pts: box(512, -110, 20, 20), h: 45, lm: 1, use: USE.civic, levels: 10, minH: 20 });
    const [p, b] = refine([pillar, bridge]);
    expect(p.h).toBeCloseTo(64.8, 3);
    expect(p.levels).toBe(16);
    expect(b.h).toBeCloseTo(64.8, 3);
    expect(b.minH).toBe(20);
  });
});

describe('가게 불빛', () => {
  it('카페·식당은 22~23시쯤 끄고 주점은 새벽까지, 편의점은 밤새 켠다', () => {
    expect(shopOpen(1, 0.5, 20)).toBe(1);
    expect(shopOpen(1, 0.5, 23.5)).toBe(0);
    expect(shopOpen(2, 0.5, 22)).toBe(1);
    expect(shopOpen(2, 0.99, 23.8)).toBe(0);
    expect(shopOpen(3, 0.5, 2)).toBe(1);
    expect(shopOpen(3, 0.5, 6)).toBe(0);
    expect(shopOpen(3, 0.5, 14)).toBe(0);
    expect(shopOpen(4, 0.1, 4)).toBe(1);
    expect(shopOpen(1, 0.5, 3)).toBe(0);
    // 병원·약국은 저녁 7시 안팎, 소매·생활은 9~10시 안팎에 닫는다
    expect(shopOpen(5, 0.5, 12)).toBe(1);
    expect(shopOpen(5, 0.5, 20.5)).toBe(0);
    expect(shopOpen(6, 0.5, 21)).toBe(1);
    expect(shopOpen(6, 0.5, 22.5)).toBe(0);
  });
  it('위층 가게만 있는 건물은 1층 가게 없이 위층 가게 종류만 갖는다', () => {
    const [L] = looks([bld({ pts: box(0, 0, 11, 13), h: 13.8, use: USE.villa, levels: 4, shop: 0, shopUp: 5, shopMask: 8, shops: 1 })]);
    expect(L.shopK).toBe(0);
    expect(L.upK).toBe(5);
    expect(L.shopMask).toBe(8);
  });
  it('가게가 붙은 건물만 1층 가게(층 높이)와 가게 종류를 갖고, 필로티로 세우지 않는다', () => {
    const villa = (shop?: number) => looks([bld({ pts: box(0, 0, 11, 13), h: 13.8, use: USE.villa, levels: 4, shop, shops: shop ? 2 : 0 })])[0];
    expect(villa().shopK).toBe(0);
    const s = villa(3);
    expect(s.shopK).toBe(3);
    expect(s.gh).toBeGreaterThan(3);
    expect(s.tiers[0].dark).toBe(false);
  });
});
