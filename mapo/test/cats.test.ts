import { describe, expect, it } from 'vitest';
import { nearestS } from '../src/poly.ts';
import { CAT_SPOTS, catAt, catName, makeCats } from '../src/sim/cats.ts';
import { buildWalkGraph } from '../src/sim/graph.ts';
import { at, road } from './helpers.ts';

// 판 전체에 50m 간격 골목 격자를 깐 시험용 그래프
const grid = () => {
  const out = [];
  for (let k = -2000; k <= 2000; k += 50)
    for (let j = -2000; j < 2000; j += 50) {
      out.push(road([[j, k], [j + 50, k]], { cls: 4, lanes: 1 }), road([[k, j], [k, j + 50]], { cls: 4, lanes: 1 }));
    }
  return buildWalkGraph(out);
};
const building = (x: number, z: number) => ({ h: 9, lm: 0, pts: Float32Array.from([x - 5, z - 5, x + 5, z - 5, x + 5, z + 5, x - 5, z + 5]) });
const cats = makeCats(CAT_SPOTS, grid(), CAT_SPOTS.map((s) => building(s.x + 12, s.z + 12)));

describe('길고양이', () => {
  it('18마리, 네 가지 색, 이름은 "{동} {색}냥"이고 겹치지 않는다', () => {
    expect(cats.length).toBe(18);
    expect(new Set(cats.map((c) => c.coat)).size).toBe(4);
    const names = cats.map(catName);
    expect(new Set(names).size).toBe(18);
    for (const n of names) expect(n).toMatch(/^\S+ (치즈|삼색|고등어|턱시도)냥$/);
    expect(names).toContain('연남동 치즈냥');
  });
  it('한낮에는 모두 건물 남쪽 옆 자리에서 식빵 자세로 쉰다', () => {
    for (const c of cats) {
      const s = catAt(c, at(13));
      expect(s.pose).toBe(0);
      expect(Math.hypot(s.x - c.loaf[0], s.z - c.loaf[1])).toBeLessThan(0.01);
      expect(['식빵 굽는 중', '낮잠 중', '그루밍 중']).toContain(s.status);
    }
    // 식빵 자리는 가장 가까운 건물의 남쪽(z가 큰 쪽) 벽 바로 밖
    const c = cats[0];
    expect(c.loaf[1]).toBeGreaterThan(CAT_SPOTS[0].z + 17);
    expect(c.loaf[1]).toBeLessThan(CAT_SPOTS[0].z + 19);
  });
  it('밤 11시에는 절반 넘게 걷고 있고 모두 자기 경로 가까이에 있다', () => {
    let walking = 0;
    for (const c of cats) {
      const s = catAt(c, at(23));
      if (s.pose > 0.5) walking++;
      expect(nearestS(c.route, c.cum, s.x, s.z).d).toBeLessThan(3);
    }
    expect(walking).toBeGreaterThan(9);
  });
  it('밤 상태는 정해진 말 가운데 하나', () => {
    const seen = new Set<string>();
    for (let t = 22; t < 28; t += 0.05) for (const c of cats) seen.add(catAt(c, at(t % 24)).status);
    for (const s of seen) expect(['어슬렁거리는 중', '주변을 살피는 중', '급식소에서 밥 먹는 중', '쉬는 중']).toContain(s);
    expect(seen.has('어슬렁거리는 중')).toBe(true);
    expect(seen.has('급식소에서 밥 먹는 중')).toBe(true);
  });
  it('같은 시각은 같은 결과이고 1초에 1.5m 넘게 움직이지 않는다', () => {
    for (const c of cats)
      for (const h of [5.5, 7.2, 13, 17.4, 23, 2]) {
        const a = catAt(c, at(h));
        expect(catAt(c, at(h))).toEqual(a);
        const b = catAt(c, { tod: h * 3600 + 1, dow: 2, doy: 317 });
        expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeLessThan(1.5);
      }
  });
  it('해 질 녘에 식빵 자리에서 조금씩 멀어진다', () => {
    // 11월 13일 일몰은 17:23 무렵
    const far = (h: number) => Math.max(...cats.map((c) => { const s = catAt(c, at(h)); return Math.hypot(s.x - c.loaf[0], s.z - c.loaf[1]); }));
    expect(far(16)).toBeLessThan(0.01);
    expect(far(19)).toBeGreaterThan(8);
  });
});
