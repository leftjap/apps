import { describe, expect, it } from 'vitest';
import { cumLen } from '../src/poly.ts';
import { arrivals, departures, headway, makeProfile, stationBoard, trainsAt, type LineDef } from '../src/sim/trains.ts';

const line = (id: string, len: number, stops: number[]): LineDef => {
  const p = new Float32Array([0, 0, 0, len, 0, 0]);
  return { id, name: id, color: '#0f0', cars: 10, carLen: 20, p, cum: cumLen(p), stops, stopNames: stops.map((_, i) => `역${i}`) };
};

describe('주행 곡선', () => {
  const pr = makeProfile(4000, [1000, 2600]);
  it('단조 증가하고 끝에서 전체 길이', () => {
    let prev = -1;
    for (let t = 0; t <= pr.dur; t += 0.5) {
      const s = pr.distAt(t);
      expect(s).toBeGreaterThanOrEqual(prev - 1e-6);
      prev = s;
    }
    expect(pr.distAt(pr.dur)).toBeCloseTo(4000, 0);
    expect(pr.distAt(pr.dur + 100)).toBeCloseTo(4000, 0);
  });
  it('역마다 25초 동안 서 있다', () => {
    expect(pr.arrive.length).toBe(2);
    for (let i = 0; i < 2; i++) {
      expect(pr.distAt(pr.arrive[i])).toBeCloseTo([1000, 2600][i], 0);
      expect(pr.distAt(pr.arrive[i] + 24.9)).toBeCloseTo([1000, 2600][i], 0);
      expect(pr.distAt(pr.arrive[i] + 30)).toBeGreaterThan([1000, 2600][i] + 1);
    }
  });
  it('최고 속도 22m/s 이하', () => {
    for (let t = 0; t < pr.dur; t += 1) expect(pr.distAt(t + 1) - pr.distAt(t)).toBeLessThanOrEqual(22.01);
  });
  it('역이 진입 지점 바로 앞이어도 멈춘다', () => {
    const near = makeProfile(1500, [60]);
    expect(near.distAt(near.arrive[0])).toBeCloseTo(60, 0);
    expect(near.distAt(near.arrive[0] + 10)).toBeCloseTo(60, 0);
  });
});

describe('배차', () => {
  it('2호선: 출근 시간 180초 이하, 낮엔 더 길고, 새벽 3시는 운행 없음', () => {
    expect(headway('2', 8.5 * 3600)).toBeLessThanOrEqual(180);
    expect(headway('2', 14 * 3600)).toBeGreaterThan(headway('2', 8.5 * 3600));
    expect(headway('2', 3 * 3600)).toBe(0);
  });
  it('경의중앙선은 2호선보다 드물다', () => expect(headway('K', 14 * 3600)).toBeGreaterThan(headway('2', 14 * 3600)));
  it('출발 시각은 오름차순이고 방향마다 다르다', () => {
    const a = departures('2', 0);
    const b = departures('2', 1);
    expect(a.length).toBeGreaterThan(200);
    for (let i = 1; i < a.length; i++) expect(a[i]).toBeGreaterThan(a[i - 1]);
    expect(a[0]).not.toBe(b[0]);
  });
});

describe('열차 위치', () => {
  const lines = [line('2', 4000, [1000, 2600]), line('K', 3000, [1500])];
  it('같은 시각은 같은 결과', () => expect(trainsAt(lines, 30600)).toEqual(trainsAt(lines, 30600)));
  it('출근 시간에는 두 방향 모두 열차가 있다', () => {
    const ts = trainsAt(lines, 30600).filter((t) => t.line === '2');
    expect(ts.some((t) => t.dir === 0)).toBe(true);
    expect(ts.some((t) => t.dir === 1)).toBe(true);
    for (const t of ts) {
      expect(t.s).toBeGreaterThanOrEqual(0);
      expect(t.s).toBeLessThanOrEqual(4000);
    }
  });
  it('1초 사이 22m 넘게 움직이지 않는다', () => {
    const a = new Map(trainsAt(lines, 30600).map((t) => [t.key, t.s]));
    for (const t of trainsAt(lines, 30601)) if (a.has(t.key)) expect(Math.abs(t.s - a.get(t.key)!)).toBeLessThanOrEqual(22.01);
  });
  it('새벽 3시에는 열차가 없다', () => expect(trainsAt(lines, 3 * 3600).length).toBe(0));
  it('자정 직후에는 막차가 아직 달린다', () => expect(trainsAt(lines, 600).length).toBeGreaterThan(0));
  it('도착 사건: 구간을 나눠 세도 합이 같다', () => {
    const whole = arrivals(lines, 30000, 31200).length;
    const parts = arrivals(lines, 30000, 30500).length + arrivals(lines, 30500, 31200).length;
    expect(whole).toBeGreaterThan(5);
    expect(parts).toBe(whole);
  });
  it('도착 사건에는 역 이름이 있다', () => expect(arrivals(lines, 30000, 31200)[0].name).toMatch(/^역\d$/));
});

describe('역 도착 안내', () => {
  const l = line('2', 4000, [1000, 2600]);
  const prof = makeProfile(4000, [1000, 2600]);
  const arr = departures('2', 0)[40] + prof.arrive[0]; // 낮 시간 열차 하나가 역0에 서는 시각

  it('정차 중인 열차를 먼저 알린다', () => {
    const b = stationBoard([l], '역0', arr + 5).find((x) => x.dir === 0)!;
    expect(b.state).toBe('정차 중');
  });
  it('90초 안에 오면 곧 도착, 그보다 멀면 몇 분 후', () => {
    const soon = stationBoard([l], '역0', arr - 40).find((x) => x.dir === 0)!;
    expect(soon.state).toBe('곧 도착');
    expect(soon.inSec).toBeCloseTo(40, 0);
    const later = stationBoard([l], '역0', arr - 100).find((x) => x.dir === 0)!;
    expect(later.state).toMatch(/^\d+분 후$/);
  });
  it('두 방향을 모두 알리고 방향 이름을 붙인다', () => {
    const b = stationBoard([l], '역0', arr);
    expect(b.map((x) => x.dir).sort()).toEqual([0, 1]);
    expect(b[0].toward).toContain('방면');
  });
  it('새벽 3시에는 운행이 끝났다고 알린다', () => {
    expect(stationBoard([l], '역0', 3 * 3600)[0].state).toMatch(/^운행 종료 · 첫차 05:/);
  });
  it('서지 않는 역이면 빈 목록', () => {
    expect(stationBoard([l], '없는역', arr)).toEqual([]);
  });
});
