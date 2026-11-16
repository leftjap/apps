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
  it('역 안내판: 공식 도착 정보가 없으면 다가오는 실제 열차까지 남은 시간을 쓰고, 그런 열차도 없는 방향은 시간표 값임을 붙인다', () => {
    const sub = makeLiveSubway([line2]);
    sub.set([train('합정', '0', '2')], T0);
    const sim = [
      { line: '2', dir: 0 as const, toward: '내선 · 시청 방면', state: '9분 후', inSec: 540 },
      { line: '2', dir: 1 as const, toward: '외선 · 당산 방면', state: '3분 후', inSec: 180 },
    ];
    const rows = sub.board('홍대입구', sim, T0);
    expect(rows[0].inSec).toBeGreaterThan(60);
    expect(rows[0].inSec).toBeLessThan(200);
    expect(rows[0].toward).toBe('내선 · 시청 방면');
    expect(rows[1]).toEqual({ ...sim[1], state: '3분 후 · 시간표' });
  });
  it('역 안내판: 공식 역 도착 정보가 있으면 그 값을 받은 뒤 지난 시간만큼 줄여 쓴다(판 밖 먼 열차도)', () => {
    const sub = makeLiveSubway([line2]);
    sub.set([], T0);
    const arr = (updn: string, cd: string, sec: number, msg: string, ord: string, rcv = T0 - 60_000) => ({ line: '2', stn: '홍대입구', updn, cd, sec, msg, cur: '아현', ord, no: '2201', rcv });
    sub.setArrivals([arr('1', '99', 300, '5분 후', '02000'), arr('1', '99', 900, '15분 후', '02001'), arr('0', '99', 0, '[11]번째 전역 (청량리)', '01000')], T0);
    const sim = [
      { line: '2', dir: 0 as const, toward: '내선 · 시청 방면', state: '9분 후', inSec: 540 },
      { line: '2', dir: 1 as const, toward: '외선 · 당산 방면', state: '7분 후', inSec: 420 },
    ];
    const rows = sub.board('홍대입구', sim, T0);
    expect(rows[1].state).toBe('4분 후');
    expect(rows[1].inSec).toBe(240);
    expect(rows[0].state).toBe('11번째 전역 (청량리)');
  });
  it('역 안내판: 판 위에 서 있는 실제 열차가 없으면 "정차 중"이라고 쓰지 않는다', () => {
    const sub = makeLiveSubway([line2]);
    sub.set([], T0);
    // 공식 정보는 1분 전에 "도착"이었지만 그 열차는 이미 떠났다. 다음 열차 값을 쓴다
    sub.setArrivals(
      [
        { line: '2', stn: '홍대입구', updn: '0', cd: '1', sec: 0, msg: '홍대입구 도착', cur: '홍대입구', ord: '01000', no: '2101', rcv: T0 - 60_000 },
        { line: '2', stn: '홍대입구', updn: '0', cd: '99', sec: 480, msg: '8분 후', cur: '문래', ord: '01001', no: '2103', rcv: T0 - 60_000 },
      ],
      T0,
    );
    const sim = [{ line: '2', dir: 0 as const, toward: '내선 · 시청 방면', state: '정차 중', inSec: 0 }];
    expect(sub.board('홍대입구', sim, T0)[0].state).toBe('7분 후');
    // 공식 정보가 방금(1분 안) "도착"인데 판 위 열차가 아직 오지 않았으면 곧 도착으로 쓴다(다음 열차로 넘기지 않는다)
    sub.setArrivals([{ line: '2', stn: '홍대입구', updn: '0', cd: '1', sec: 0, msg: '홍대입구 도착', cur: '홍대입구', ord: '01000', no: '2101', rcv: T0 - 10_000 }], T0);
    expect(sub.board('홍대입구', sim, T0)[0].state).toBe('곧 도착');
    // 전역 출발·진입·도착은 남은 초가 있어도 공식 안내 말을 쓴다
    sub.setArrivals([{ line: '2', stn: '홍대입구', updn: '0', cd: '5', sec: 150, msg: '전역 도착', cur: '합정', ord: '01001', no: '2103', rcv: T0 - 10_000 }], T0);
    expect(sub.board('홍대입구', sim, T0)[0].state).toBe('전역 도착');
    // 시간표로 돌아간 줄의 "정차 중"도 판 위에 그 열차가 없으니 그대로 쓰지 않는다
    const none = makeLiveSubway([line2]);
    none.set([], T0);
    expect(none.board('홍대입구', sim, T0)[0].state).toBe('곧 도착 · 시간표');
    // 판 위에 서 있는 실제 열차가 있으면 정차 중
    const at = makeLiveSubway([line2]);
    at.set([train('홍대입구', '0', '1')], T0);
    expect(at.board('홍대입구', sim, T0)[0].state).toBe('정차 중');
  });
  it('자료를 받은 지 6분이 넘으면 쓰지 않는다(시간표 열차로 돌아간다)', () => {
    const sub = makeLiveSubway([line2]);
    sub.set([train('홍대입구', '0', '1')], T0);
    expect(sub.ready(T0 + 60_000)).toBe(true);
    expect(sub.ready(T0 + 7 * 60_000)).toBe(false);
  });
  it('새 자료로 자리가 바뀌면 그리는 자리는 순간 이동하지도, 뒤로 가지도 않고 평균 걸음의 2배 안에서 따라간다', () => {
    for (const [stn, st, dt] of [['신촌', '0', 0], ['합정', '0', 0], ['홍대입구', '1', 0]] as const) {
      const sub = makeLiveSubway([line2]);
      sub.set([train('합정', '0', '2')], T0);
      const shown: number[] = [];
      for (let k = 0; k < 60 * 60; k++) sub.step(1 / 60), shown.push(sub.positions()[0].s);
      // 1분 뒤 받은 자료가 지금 그리는 자리보다 한참 앞(신촌 진입)·뒤(합정 진입)·조금 앞(홍대입구 도착)이라고 한다
      sub.set([train(stn, '0', st, T0 + 60_000 + dt)], T0 + 60_000);
      for (let k = 0; k < 240 * 60; k++) sub.step(1 / 60), shown.push(sub.positions()[0]?.s ?? NaN);
      const steps = shown.slice(1).map((s, i) => s - shown[i]).filter((d) => !Number.isNaN(d));
      const moving = steps.filter((d) => d > 1e-4);
      const mean = moving.reduce((a, b) => a + b, 0) / moving.length;
      expect(Math.min(...steps)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...steps)).toBeLessThanOrEqual(2 * mean);
    }
  });
  it('따라간 뒤에는 받은 자료대로의 자리와 같아진다', () => {
    const sub = makeLiveSubway([line2]);
    sub.set([train('합정', '0', '2')], T0);
    for (let k = 0; k < 60 * 60; k++) sub.step(1 / 60);
    // 1분 뒤 홍대입구를 막 떠났다는 자료: 지금 그리는 자리보다 수백 m 앞이다
    const fresh = makeLiveSubway([line2]);
    for (const x of [sub, fresh]) x.set([train('홍대입구', '0', '2', T0 + 60_000)], T0 + 60_000);
    expect(fresh.positions()[0].s - sub.positions()[0].s).toBeGreaterThan(300);
    for (let k = 0; k < 90 * 60; k++) sub.step(1 / 60), fresh.step(1 / 60);
    expect(sub.positions()[0].s).toBeCloseTo(fresh.positions()[0].s, 0);
  });
});
