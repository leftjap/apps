import { describe, expect, it } from 'vitest';
import { PLACES, placeDist, placeLevel, placeMask } from '../src/sim/places.ts';
import { doorWanted, makeWalkers, zoneTargets, ZONE_IDS } from '../src/sim/walkers.ts';
import { makeSimProvider } from '../src/sim/provider.ts';
import { fixedProvider, road, walkNet } from './helpers.ts';

const P = (id: string) => PLACES.find((p) => p.id === id)!;
const when = (dow: number, h: number) => ({ tod: h * 3600, dow, doy: 320 });

describe('명소 붐빔', () => {
  it('클럽거리는 토요일 밤에 가장 붐비고 평일 새벽에는 비었다', () => {
    expect(placeLevel(P('club'), when(6, 21))).toBeGreaterThan(0.8);
    expect(placeLevel(P('club'), when(2, 5))).toBe(0);
    expect(placeLevel(P('club'), when(6, 21))).toBeGreaterThan(placeLevel(P('club'), when(6, 14)) * 2);
  });
  it('경의선숲길은 주말 낮·저녁에 붐빈다', () => {
    expect(placeLevel(P('yeontral'), when(6, 17))).toBeGreaterThan(0.8);
    expect(placeLevel(P('yeontral'), when(0, 3))).toBeLessThan(0.15);
  });
  it('자정에는 다음 날짜의 0시 값으로 끊기지 않게 이어진다', () => {
    const p = P('club');
    const a = placeLevel(p, { tod: 86399, dow: 6, doy: 320 });
    const b = placeLevel(p, { tod: 0, dow: 0, doy: 321 });
    expect(Math.abs(a - b)).toBeLessThan(0.01);
  });
  it('명소 안 자리만 그 명소 비트를 갖는다', () => {
    const k = PLACES.findIndex((p) => p.id === 'playground');
    expect(placeMask(382, -88) & (1 << k)).toBeTruthy();
    expect(placeMask(382, 200) & (1 << k)).toBeFalsy();
    expect(placeDist(P('redroad'), 216, -48)).toBeLessThan(1);
  });
  it('구역 밖 명소(망원시장) 둘레 건물에도 문을 둔다', () => {
    expect(doorWanted(-1140, -550)).toBe(true);
    expect(doorWanted(-1800, -1800)).toBe(false);
  });
  it('구역 밖 명소 인원은 그 명소가 붐빌 때만 는다', () => {
    const pv = makeSimProvider();
    const busy = zoneTargets(pv, when(6, 18), 1e9)[ZONE_IDS.length + 1];
    const quiet = zoneTargets(pv, when(2, 4), 1e9)[ZONE_IDS.length + 1];
    expect(busy).toBeGreaterThan(500);
    expect(quiet).toBeLessThan(busy * 0.05);
  });
});

describe('붐비는 명소로 모이는 사람', () => {
  // 클럽거리(잔다리로 201,81 → 279,82 → 359,89) 둘레 50m 격자 골목. 출구는 격자 북쪽 끝
  const grid = () => {
    const rs = [];
    for (let x = 150; x <= 450; x += 50)
      for (let z = -50; z <= 200; z += 50) {
        if (x < 450) rs.push(road([[x, z], [x + 50, z]], { cls: 5, lanes: 1 }));
        if (z < 200) rs.push(road([[x, z], [x, z + 50]], { cls: 5, lanes: 1 }));
      }
    // 클럽거리 길 자체(격자와 이어진다)
    rs.push(road([[201, 81], [279, 82], [359, 89]], { cls: 5, lanes: 1 }), road([[150, 81], [201, 81]], { cls: 5, lanes: 1 }), road([[359, 89], [450, 89]], { cls: 5, lanes: 1 }));
    return rs;
  };
  const share = (now: { tod: number; dow: number; doy: number }) => {
    const sim = makeWalkers(walkNet(grid()), [{ kind: 'exit', key: 'h', x: 300, z: -50 }], fixedProvider(1), 7, 300);
    const club = P('club');
    let on = 0;
    let all = 0;
    for (let k = 0; k < 3000; k++) {
      if (k % 40 === 0 && sim.w.n < 200) sim.burst('h', 5);
      sim.step(0.5, { ...now, tod: now.tod + k * 0.5 }, false);
      if (k < 600 || k % 10) continue;
      for (let i = 0; i < sim.w.n; i++) {
        all++;
        if (placeDist(club, sim.w.x[i], sim.w.z[i]) < 15) on++;
      }
    }
    return on / all;
  };
  it('토요일 밤에는 평일 새벽보다 클럽거리 길 위에 사람이 훨씬 많다', () => {
    const night = share(when(6, 20.5));
    const dawn = share(when(2, 4));
    expect(night).toBeGreaterThan(dawn * 1.5);
  });
});
