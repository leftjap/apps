import { describe, expect, it } from 'vitest';
import { makeLiveSubway } from '../src/data/subway.ts';
import { cumLen } from '../src/poly.ts';
import type { LineDef } from '../src/sim/trains.ts';

// 동쪽으로 곧게 놓인 5km 2호선: 합정 1540m, 홍대입구 2723m, 신촌 4079m (거리 값이 커지는 쪽이 내선 = 상하행 0)
const p = Float32Array.from([0, 0, 0, 5000, 0, 0]);
const line2: LineDef = { id: '2', name: '2호선', color: '#3a3', cars: 10, carLen: 20, p, cum: cumLen(p), stops: [1540, 2723, 4079], stopNames: ['합정', '홍대입구', '신촌'] };
const T0 = Date.parse('2026-11-14T23:00:00+09:00');
const train = (stn: string, updn: string, st: string, rcv = T0) => ({ line: '2', no: '2101', stn, updn, st, rcv });

describe('실시간 지하철', () => {
  it('역에 도착한 열차는 그 역에 서 있다가 떠나 다음 역 쪽(내선이면 거리 값이 커지는 쪽)으로 달린다', () => {
    const sub = makeLiveSubway([line2]);
    sub.set([train('홍대입구', '0', '1')], T0);
    expect(sub.positions()[0].s).toBeCloseTo(2723, 0);
    for (let k = 0; k < 400; k++) sub.step(0.1);
    const s = sub.positions()[0].s;
    expect(s).toBeGreaterThan(2723 + 50);
    expect(s).toBeLessThan(4079);
    expect(sub.positions()[0].dir).toBe(0);
  });
  it('받은 뒤 지난 시간만큼 앞으로 옮겨 그린다(외선이면 거리 값이 작아지는 쪽)', () => {
    const sub = makeLiveSubway([line2]);
    // 2분 전에 신촌을 출발한 외선 열차는 지금 홍대입구 둘레에 있다
    sub.set([train('신촌', '1', '2', T0 - 120_000)], T0);
    const s = sub.positions()[0].s;
    expect(s).toBeLessThan(3400);
    expect(s).toBeGreaterThan(1540);
  });
  it('판 안 역에 도착하면 도착을 알린다(역 출구에서 사람이 나오도록)', () => {
    const sub = makeLiveSubway([line2]);
    sub.set([train('홍대입구', '0', '0')], T0);
    const seen = [];
    for (let k = 0; k < 600; k++) {
      sub.step(0.1);
      seen.push(...sub.takeArrivals());
    }
    expect(seen).toContainEqual({ line: '2', dir: 0, name: '홍대입구' });
  });
  it('역 안내판: 다가오는 실제 열차까지 남은 시간을 쓰고, 그런 열차가 없는 방향은 시간표 안내를 그대로 둔다', () => {
    const sub = makeLiveSubway([line2]);
    sub.set([train('합정', '0', '2')], T0);
    const sim = [
      { line: '2', dir: 0 as const, toward: '내선 · 시청 방면', state: '9분 후', inSec: 540 },
      { line: '2', dir: 1 as const, toward: '외선 · 당산 방면', state: '3분 후', inSec: 180 },
    ];
    const rows = sub.board('홍대입구', sim);
    expect(rows[0].inSec).toBeGreaterThan(60);
    expect(rows[0].inSec).toBeLessThan(200);
    expect(rows[0].toward).toBe('내선 · 시청 방면');
    expect(rows[1]).toEqual(sim[1]);
  });
  it('자료를 받은 지 6분이 넘으면 쓰지 않는다(시간표 열차로 돌아간다)', () => {
    const sub = makeLiveSubway([line2]);
    sub.set([train('홍대입구', '0', '1')], T0);
    expect(sub.ready(T0 + 60_000)).toBe(true);
    expect(sub.ready(T0 + 7 * 60_000)).toBe(false);
  });
});
