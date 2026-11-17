import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeBoard } from '../src/data/board.ts';
import { makePeople, type Portal } from '../src/sim/people/index.ts';
import { makeSimProvider } from '../src/sim/provider.ts';
import { decodeWalk, type WalkJson } from '../src/sim/walknet.ts';

// 재작업 W41: 되돌아감(목적지가 있는 사람의 남은 길이 30초 안에 10m 넘게 늘어남, w31-run.ts)의 큰 갈래.
// 돌아다니던 사람의 수명이 다해 목적지가 생길 때 그 목적지 반대쪽으로 걷고 있었으면, 다음 노드에서 길 고르기(plan)가 온 길을 빼고 골라
// 갈래 없는 선 사슬을 따라 계속 멀어졌다(W40: 홍대 화15 씨앗 11 의 747 (209, −371), 29.4m → 52.8m).
// 또 정류장 목적지(열에 하나)를 공유 난수로 뽑아, 차 흐름이 바뀌어 사람 쪽 난수 쓰는 차례가 바뀌면 판 전체에서 누가 정류장으로 가는지가 섞였다.
const read = (f: string) => JSON.parse(readFileSync(new URL(`../public/data/${f}`, import.meta.url), 'utf8'));
const board = decodeBoard(read('board.json'));
const W = decodeWalk(read('walk.json') as WalkJson);

describe('W41 목적지가 뒤쪽에 생기면 돌아선다', () => {
  // 747 자리에서 여덟 방향으로 걷던 사람에게 집(가장 가까운 문·출구)을 주고 40초 동안 남은 길(w31-run.ts 와 같이 지금 선 끝까지 + 선 끝에서 목적지까지)을 본다.
  // 고치기 전: 네 방향에서 31.7m 늘었고 40초 안에 집에 닿지 못했다. 남은 길은 선 위에 붙은 문을 세지 않아(문까지 가는 선으로 갈아타면 선 끝까지를 더한다)
  // 바르게 걸어도 몇 m 늘 수 있어, 되돌아감과 같은 10m 를 넘지 않고 40초 안에 집에 닿는지 본다
  it.each([0, 1, 2, 3, 4, 5, 6, 7])('747 (209, −371) 방향 %i: 남은 길이 10m 넘게 늘지 않고 40초 안에 집에 닿는다', (k) => {
    const a = (k * Math.PI) / 4;
    const p = makePeople(W, [], makeSimProvider(), 11, 20, {
      buildings: board.buildings,
    });
    const id = p.put(209, -371, 209 + Math.cos(a) * 300, -371 + Math.sin(a) * 300);
    expect(id).toBeGreaterThan(0);
    const now = { tod: 15 * 3600, dow: 2, doy: 320 };
    p.goHome(id, 0);
    let lo = Infinity;
    let grow = 0;
    let home = false;
    for (let f = 0; f < 40 * 30 && !home; f++) {
      now.tod += 1 / 30;
      p.step(1 / 30, now, false);
      let i = -1;
      for (let q = 0; q < p.w.n; q++) if (p.w.id[q] === id) i = q;
      home = i < 0 || p.stateOf(i).mode === p.MODES.INDOOR;
      if (home) break;
      const d = p.debugOf(i);
      if (d.mode !== p.MODES.WALK || d.goal < 0) continue;
      const rem = d.D + Math.max(0, d.L - d.s);
      lo = Math.min(lo, rem);
      grow = Math.max(grow, rem - lo);
    }
    expect(grow).toBeLessThanOrEqual(10);
    expect(home).toBe(true);
  });
});

describe('W41 정류장 목적지는 사람마다 따로 정해진다', () => {
  // 같은 씨앗 두 판에서 한쪽만 사람 한 명을 더 놓아(공유 난수 차례가 바뀐다: 차 흐름이 바뀐 것과 같다) 10분 돌린다.
  // 두 판 모두에서 목적지를 받은 사람은 같은 목적지(문·출구 또는 정류장)를 받아야 한다
  const stops: Portal[] = [
    [209, -371],
    [330, -300],
    [290, 40],
    [380, -1110],
    [330, -350],
  ].map(([x, z], k) => ({ kind: 'stop', key: `t${k}`, x, z }));
  const run = (extra: boolean) => {
    const p = makePeople(W, stops, makeSimProvider(), 11, 400, {
      buildings: board.buildings,
    });
    p.setFocus(330, -300, 300);
    const now = { tod: 15 * 3600, dow: 2, doy: 320 };
    p.warm(60, now);
    if (extra) expect(p.put(209, -371, 509, -371)).toBeGreaterThan(0);
    const got = new Map<number, number>();
    for (let f = 0; f < 600 * 2; f++) {
      now.tod += 0.5;
      p.step(0.5, now, false);
      for (let i = 0; i < p.w.n; i++) {
        const g = p.stateOf(i).goal;
        if (g >= 0 && !got.has(p.w.id[i])) got.set(p.w.id[i], g);
      }
    }
    return got;
  };
  it('한 명을 더 놓아도 두 판 모두 목적지를 받은 사람의 목적지가 같다', () => {
    const A = run(false);
    const B = run(true);
    let both = 0;
    let stop = 0;
    const diff: string[] = [];
    for (const [id, g] of A) {
      const h = B.get(id);
      if (h === undefined) continue;
      both++;
      if (g === 1) stop++;
      if (g !== h) diff.push(`${id}:${g}/${h}`);
    }
    expect(both).toBeGreaterThan(50);
    expect(stop).toBeGreaterThan(0);
    expect(diff).toEqual([]);
  }, 120_000);
});

describe('W41 차에 밀려 움직인 사람에게 줄 선 표시가 남지 않는다', () => {
  // W39 c9: 연트럴 씨앗 11 에서 게이트 앞 줄에 선 사람(337번)이 한 프레임 움직였는데 줄 선 표시가 남았다. 단계 처음에 차 몸통에서 비켜난 뒤(escapeCar)
  // 걸음이 줄 선 표시를 정하고 자리를 비켜난 자리로 되돌려, 차에 밀린 사람이 '줄에 서 있다'고 남았다.
  // Y 갈림 칸(w31-people 시험과 같은 자리)에 맞흐름을 놓아 게이트 앞 줄을 만들고, 줄 선 사람 바로 옆에 버스 몸통을 놓아 한 프레임 돌린다
  it('줄 선 사람 옆에 버스를 놓으면 비켜나고 줄 선 표시가 지워진다', () => {
    const cars = {
      n: 0,
      x: new Float32Array(1),
      y: new Float32Array(1),
      z: new Float32Array(1),
      yaw: new Float32Array(1),
      kind: new Uint8Array([1]),
      tint: new Float32Array(1),
    };
    const p = makePeople(W, [], makeSimProvider(), 11, 200, {
      buildings: board.buildings,
      cars,
    });
    const unit = (x: number, z: number): [number, number] => [x / Math.hypot(x, z), z / Math.hypot(x, z)];
    const S = unit(436 - 417, -458 + 440);
    const N = unit(406 - 410, -400 + 420);
    const fill = (ox: number, oz: number, d: [number, number], gx: number, gz: number) => {
      for (let r = 0; r < 12; r++) for (let c = -4; c <= 4; c++) p.put(ox + d[0] * (3 + r * 0.95) - d[1] * c * 0.95, oz + d[1] * (3 + r * 0.95) + d[0] * c * 0.95, gx, gz);
    };
    fill(417, -440, S, 410 + N[0] * 300, -420 + N[1] * 300);
    fill(410, -420, N, 417 + S[0] * 300, -440 + S[1] * 300);
    const now = { tod: 21 * 3600, dow: 6, doy: 320 };
    const tried = new Set<number>();
    let pushed = 0;
    const bad: string[] = [];
    for (let f = 0; f < 60 * 30 && tried.size < 20; f++) {
      now.tod += 1 / 30;
      cars.n = 0;
      p.step(1 / 30, now, false);
      let i = -1;
      for (let q = 0; q < p.w.n && i < 0; q++) if (p.stateOf(q).queued && !tried.has(p.w.id[q])) i = q;
      if (i < 0) continue;
      const id = p.w.id[i];
      tried.add(id);
      // 버스(반 길이 6m, 반 폭 1.25m) 앞 끝이 몸에서 0.3m 안으로 들어오게 동쪽에 놓는다(비켜날 거리 안)
      [cars.x[0], cars.z[0], cars.yaw[0], cars.n] = [p.w.x[i] + 6 + 0.4 + 0.1 + 0.3, p.w.z[i], 0, 1];
      const [x0, z0] = [p.w.x[i], p.w.z[i]];
      now.tod += 1 / 30;
      p.step(1 / 30, now, false);
      for (let q = 0; q < p.w.n; q++) {
        if (p.w.id[q] !== id) continue;
        const d = Math.hypot(p.w.x[q] - x0, p.w.z[q] - z0);
        if (d > 0.02) pushed++;
        if (d > 0.02 && p.stateOf(q).queued) bad.push(`${id} ${d.toFixed(3)}m`);
      }
    }
    expect(pushed).toBeGreaterThan(0);
    expect(bad).toEqual([]);
  }, 60_000);
});

describe('W41 걷는 중 고르기는 사람마다 따로 정해진다', () => {
  // 같은 씨앗 두 판에서 한쪽만 (209, −371)에 사람 한 명을 더 놓고(공유 난수 차례가 바뀐다: 차 흐름이 바뀐 것과 같다) 2분 돌린다.
  // 더 놓은 사람에게서 150m 넘게 떨어진 사람은 거의 모두 두 판에서 같은 자리에 있어야 한다(고치기 전: 돌아다닐 길·갈 쪽을 공유 난수로 골라 287명 가운데 152명이 달랐다).
  // 고친 뒤 293명 가운데 5명(255m·357m 둘레에서 서로 만난 두 쌍과 164m 한 명)이 다르다. 공유 난수를 쓰는 고르기는 남지 않았고 까닭은 확인하지 않았다(차례대로 피하기 계산의 순서로 추정)
  const run = (extra: boolean) => {
    const p = makePeople(W, [], makeSimProvider(), 11, 400, { buildings: board.buildings });
    p.setFocus(330, -300, 300);
    const now = { tod: 15 * 3600, dow: 2, doy: 320 };
    p.warm(60, now);
    if (extra) expect(p.put(209, -371, 509, -371)).toBeGreaterThan(0);
    for (let f = 0; f < 120 * 2; f++) {
      now.tod += 0.5;
      p.step(0.5, now, false);
    }
    const at = new Map<number, [number, number]>();
    for (let i = 0; i < p.w.n; i++) at.set(p.w.id[i], [p.w.x[i], p.w.z[i]]);
    return at;
  };
  it('한 명을 더 놓아도 멀리 있는 사람의 자리가 같다', () => {
    const A = run(false);
    const B = run(true);
    let far = 0;
    const diff: string[] = [];
    for (const [id, [x, z]] of A) {
      const q = B.get(id);
      if (!q || Math.hypot(x - 209, z + 371) < 150) continue;
      far++;
      if (Math.hypot(q[0] - x, q[1] - z) > 1e-3) diff.push(`${id}@${Math.hypot(x - 209, z + 371).toFixed(0)}m`);
    }
    expect(far).toBeGreaterThan(100);
    expect(diff.length, `${diff.length}/${far} ${diff.join(' ')}`).toBeLessThanOrEqual(far * 0.05);
  }, 60_000);
});
