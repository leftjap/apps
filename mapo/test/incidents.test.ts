import { describe, expect, it } from 'vitest';
import { makeCars } from '../src/sim/cars.ts';
import { buildCarGraph, laneOff } from '../src/sim/graph.ts';
import { effectOf, matchIncidents, type Incident } from '../src/sim/incidents.ts';
import { at, fixedProvider, road } from './helpers.ts';

const inc = (x: number, z: number, o: Partial<Incident> = {}): Incident => ({ id: 'a', kind: '교통사고', detail: '추돌사고', info: '', start: '', end: '', x, z, effect: 'lane', ...o });

describe('돌발정보 효과 가르기', () => {
  it('전면통제·행사·집회는 통제, 사고·공사·고장·낙하물은 한 차로 막기', () => {
    expect(effectOf('공사', '도로보수', '탄천나들목 구조개선공사 - 통제 : 양방향 전면통제')).toBe('close');
    expect(effectOf('행사', '', '마라톤 대회')).toBe('close');
    expect(effectOf('집회', '', '')).toBe('close');
    expect(effectOf('교통사고', '추돌사고', '2차로 추돌')).toBe('lane');
    expect(effectOf('공사', '도로보수', '1개 차로 부분통제')).toBe('lane');
  });
});

describe('돌발 지점을 차 구간에 붙이기', () => {
  // 동서로 놓인 양방향 4차로(한 방향 2차로). 동쪽으로 가는 구간의 오른쪽(+z)에 차로 0, 1 이 차례로 놓인다
  const g = buildCarGraph([road([[0, 0], [200, 0]], { lanes: 4 })]);
  const east = g.find((e) => e.p[3] > e.p[0])!;
  const west = g.find((e) => e.p[3] < e.p[0])!;
  it('사고는 가장 가까운 구간의 그 자리 차로 하나를 막는다', () => {
    const m = matchIncidents(g, [inc(100, laneOff(east, 1, 100) + 0.3)]);
    expect(m.blocks).toEqual([{ edge: east.id, lane: 1, at: expect.closeTo(100, 0) }]);
    expect(m.close).toEqual([]);
    expect(m.spots[0]).toMatchObject({ id: 'a', edge: east.id, effect: 'lane' });
    expect(m.spots[0].s).toBeCloseTo(100, 0);
  });
  it('통제는 그 자리 둘레 30m 안의 구간을 양방향 모두 막는다', () => {
    const m = matchIncidents(g, [inc(100, 2, { effect: 'close' })]);
    expect([...m.close].sort()).toEqual([east.id, west.id].sort());
    expect(m.blocks).toEqual([]);
  });
  it('차로가 하나뿐인 길은 막지 않고 그 자리에서 천천히 지나가게 한다', () => {
    const one = buildCarGraph([road([[0, 0], [200, 0]], { lanes: 1, oneway: true })]);
    const m = matchIncidents(one, [inc(120, 1)]);
    expect(m.blocks).toEqual([]);
    expect(m.slow).toEqual([{ edge: 0, at: expect.closeTo(120, 0), v: 3 }]);
  });
  it('차 구간에서 30m 넘게 떨어진 돌발은 무시한다', () => {
    const m = matchIncidents(g, [inc(100, 60)]);
    expect([m.blocks, m.close, m.slow, m.spots]).toEqual([[], [], [], []]);
  });
});

// 한 변 400m 정사각형을 시계 방향으로 도는 일방통행 순환로
const ring = (lanes: number, chord = false) =>
  buildCarGraph([
    road([[0, 0], [400, 0]], { oneway: true, lanes }),
    road([[400, 0], [400, 400]], { oneway: true, lanes }),
    road([[400, 400], [0, 400]], { oneway: true, lanes }),
    road([[0, 400], [0, 0]], { oneway: true, lanes }),
    ...(chord ? [road([[400, 0], [0, 400]], { oneway: true, lanes })] : []),
  ]);

describe('돌발이 차 흐름에 주는 효과', () => {
  it('막힌 차로에는 차가 들어서지 않는다(옆 차로로 비켜 간다)', () => {
    const g = ring(2);
    const sim = makeCars(g, fixedProvider(1), 3, 60);
    sim.setIncidents({ blocks: [{ edge: 1, lane: 0, at: 200 }], close: [], slow: [] });
    sim.fill(40);
    let bad = 0;
    for (let k = 0; k < 3000; k++) {
      sim.step(0.1, at(12), false);
      if (k % 50) continue;
      const c = sim.cars;
      // 1번 구간(400,0)→(400,400): 남쪽으로 가는 차의 오른쪽은 −x 쪽, 차로 0 이 길 가운데선에 가깝다
      for (let i = 0; i < c.n; i++) if (Math.abs(c.x[i] - 400) < 12 && c.z[i] > 60 && c.z[i] < 340 && sim.laneOf(i) === 0) bad++;
    }
    expect(bad).toBe(0);
  });
  it('통제된 구간으로는 다른 길이 있으면 들어가지 않고, 그 구간에 차를 놓지도 않는다', () => {
    const g = ring(1, true);
    const chord = g.findIndex((e) => e.p[0] === 400 && e.p[2] === 0 && e.p[3] === 0 && e.p[5] === 400);
    expect(chord).toBeGreaterThanOrEqual(0);
    const sim = makeCars(g, fixedProvider(1), 4, 60);
    sim.setIncidents({ blocks: [], close: [chord], slow: [] });
    sim.fill(40);
    let on = 0;
    for (let k = 0; k < 3000; k++) {
      sim.step(0.1, at(12), false);
      if (k % 50) continue;
      const c = sim.cars;
      for (let i = 0; i < c.n; i++) if (c.x[i] > 60 && c.x[i] < 340 && c.z[i] > 60 && c.z[i] < 340) on++;
    }
    expect(on).toBe(0);
  });
  it('서행 지점 둘레(25m 안)에서는 시속 약 11km(3m/s) 넘게 달리지 않는다', () => {
    const g = ring(1);
    const sim = makeCars(g, fixedProvider(1), 5, 30);
    sim.setIncidents({ blocks: [], close: [], slow: [{ edge: 0, at: 200, v: 3 }] });
    sim.fill(20);
    let fast = 0;
    let seen = 0;
    for (let k = 0; k < 3000; k++) {
      sim.step(0.1, at(12), false);
      const c = sim.cars;
      for (let i = 0; i < c.n; i++)
        if (Math.abs(c.z[i]) < 6 && c.x[i] > 185 && c.x[i] < 215) {
          seen++;
          if (sim.speedOf(i) > 3.3) fast++;
        }
    }
    expect(seen).toBeGreaterThan(0);
    expect(fast).toBe(0);
  });
  it('막힌 차로 옆(앞뒤 25m)을 지나는 차는 5m/s 를 넘지 않는다(좁아진 자리를 조심해 지난다)', () => {
    const g = ring(2);
    const sim = makeCars(g, fixedProvider(1), 6, 60);
    sim.setIncidents({ blocks: [{ edge: 0, lane: 1, at: 200 }], close: [], slow: [] });
    sim.fill(30);
    let fast = 0;
    let seen = 0;
    for (let k = 0; k < 3000; k++) {
      sim.step(0.1, at(12), false);
      if (k < 300) continue;
      const c = sim.cars;
      for (let i = 0; i < c.n; i++)
        if (Math.abs(c.z[i]) < 8 && c.x[i] > 185 && c.x[i] < 215) {
          seen++;
          if (sim.speedOf(i) > 5.3) fast++;
        }
    }
    expect(seen).toBeGreaterThan(0);
    expect(fast).toBe(0);
  });
  it('갈림길 없이 이어진 길 가운데를 통제하면, 그 길로 들어서는 갈림길에서부터 피한다', () => {
    // 지름길을 두 조각으로 나눠, 갈림길에서 바로 이어지지 않는 뒤 조각만 통제한다
    const g = buildCarGraph([
      road([[0, 0], [400, 0]], { oneway: true, lanes: 1 }),
      road([[400, 0], [400, 400]], { oneway: true, lanes: 1 }),
      road([[400, 400], [0, 400]], { oneway: true, lanes: 1 }),
      road([[0, 400], [0, 0]], { oneway: true, lanes: 1 }),
      road([[400, 0], [200, 200]], { oneway: true, lanes: 1 }),
      road([[200, 200], [0, 400]], { oneway: true, lanes: 1 }),
    ]);
    const back = g.findIndex((e) => e.p[0] === 200 && e.p[2] === 200);
    const sim = makeCars(g, fixedProvider(1), 4, 60);
    sim.setIncidents({ blocks: [], close: [back], slow: [] });
    sim.fill(40);
    let on = 0;
    for (let k = 0; k < 3000; k++) {
      sim.step(0.1, at(12), false);
      if (k % 50) continue;
      const c = sim.cars;
      for (let i = 0; i < c.n; i++) if (c.x[i] > 60 && c.x[i] < 340 && c.z[i] > 60 && c.z[i] < 340) on++;
    }
    expect(on).toBe(0);
  });
});
