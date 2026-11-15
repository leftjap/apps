import { describe, expect, it } from 'vitest';
import { FAR_VERTS, NEAR_VERTS, WARM, wearOf } from '../src/render/walkers.ts';

// 사람 수천 명을 흉내 낸다: 색 값(tint)은 0~1 고르게
const crowd = (n: number, age: number, female: number, warm: number) =>
  Array.from({ length: n }, (_, i) => wearOf((i + 0.5) / n, age, female, warm));
const share = (list: number[][], f: (w: number[]) => boolean) => list.filter(f).length / list.length;
// wearOf 결과: [겉옷(0 없음·1 재킷·2 코트·3 패딩), 머리 모양(0 짧은·1 긴·2 묶은·3 올린·4 파마), 모자 + 4·목도리, 가방 + 4·짧은 옷]
const outer = (w: number[]) => w[0];
const hair = (w: number[]) => w[1];
const hat = (w: number[]) => w[2] % 4;
const scarf = (w: number[]) => Math.floor(w[2] / 4);
const bag = (w: number[]) => w[3] % 4;
const short = (w: number[]) => Math.floor(w[3] / 4);

describe('사람 옷차림', () => {
  it('계절 온기: 겨울 0, 가을 0.35, 봄 0.6, 여름 1', () => {
    expect(WARM).toEqual({ winter: 0, autumn: 0.35, blossom: 0.6, green: 1 });
  });

  it('겨울에는 대부분 코트·패딩·재킷을 입고, 목도리·털모자를 한 사람도 있다', () => {
    const list = [...crowd(2000, 1, 0, WARM.winter), ...crowd(2000, 2, 1, WARM.winter)];
    expect(share(list, (w) => outer(w) > 0)).toBeGreaterThan(0.85);
    expect(share(list, (w) => outer(w) >= 2)).toBeGreaterThan(0.6);
    expect(share(list, (w) => scarf(w) === 1)).toBeGreaterThan(0.2);
    expect(share(list, (w) => hat(w) === 1)).toBeGreaterThan(0.08);
    expect(share(list, (w) => short(w) > 0)).toBe(0);
  });

  it('여름에는 겉옷·목도리·털모자 없이 반팔이고, 일부는 반바지다', () => {
    const list = [...crowd(2000, 1, 0, WARM.green), ...crowd(2000, 2, 1, WARM.green)];
    expect(share(list, (w) => outer(w) > 0)).toBe(0);
    expect(share(list, (w) => scarf(w) === 1 || hat(w) === 1)).toBe(0);
    expect(share(list, (w) => short(w) >= 1)).toBe(1);
    expect(share(list, (w) => short(w) === 2)).toBeGreaterThan(0.2);
  });

  it('11월(가을)에는 겉옷 입은 사람이 절반을 넘지만 겨울보다 적다', () => {
    const list = crowd(4000, 1, 1, WARM.autumn);
    const s = share(list, (w) => outer(w) > 0);
    expect(s).toBeGreaterThan(0.5);
    expect(s).toBeLessThan(0.85);
  });

  it('긴 머리·묶은 머리·올린 머리는 여성만, 파마는 60대 이상 여성만 한다', () => {
    const men = [0, 1, 2, 3].flatMap((age) => crowd(1000, age, 0, 0.5));
    expect(share(men, (w) => hair(w) > 0)).toBe(0);
    const young = crowd(2000, 1, 1, 0.5);
    for (const h of [0, 1, 2, 3]) expect(share(young, (w) => hair(w) === h)).toBeGreaterThan(0.08);
    expect(share(young, (w) => hair(w) === 4)).toBe(0);
    expect(share(crowd(2000, 3, 1, 0.5), (w) => hair(w) === 4)).toBeGreaterThan(0.5);
  });

  it('가방은 넷 중 하나쯤이 들고, 백팩·숄더백·쇼핑백이 모두 나온다', () => {
    const list = crowd(4000, 1, 1, 0.5);
    const s = share(list, (w) => bag(w) > 0);
    expect(s).toBeGreaterThan(0.25);
    expect(s).toBeLessThan(0.6);
    for (const b of [1, 2, 3]) expect(share(list, (w) => bag(w) === b)).toBeGreaterThan(0.05);
  });

  it('소지품·모자를 더해도 자세한 모형은 정점 2,700개, 단순한 모형은 130개를 넘지 않는다', () => {
    expect(NEAR_VERTS).toBeLessThanOrEqual(2700);
    expect(FAR_VERTS).toBeLessThanOrEqual(130);
  });
});
