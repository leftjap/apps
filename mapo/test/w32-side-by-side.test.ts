// 나란한 두 차가 서로 막아 둘 다 서지 않는다(재작업 W32, 설계 문서 56절).
// 서교로 xw23 앞 독막로 e119(합정·홍대 둘레 450m 로 자른 판의 구간 번호)는 15m 안에서 차로 옆 거리가 0.3~0.5m 흔들린다.
// 빈 길에 버스 크기 차(l2)와 승용차(l1)를 나란히 놓으면, 고치기 전에는 앞선 승용차의 걸음이 차로를 따라 버스 쪽으로 다가가 막히고
// 버스는 그 승용차에 막혀 둘 다 끝까지 섰다(W29 가 찾은 교착, 평일 씨앗 13·가속 한도 2.0 의 여러 판).
import { describe, expect, it } from 'vitest';
import { setup } from '../tools/measure-junction.ts';

function hit(ax: number, az: number, ay: number, al: number, aw: number, bx: number, bz: number, by: number, bl: number, bw: number) {
  for (const t of [ay, ay + Math.PI / 2, by, by + Math.PI / 2]) {
    const ra = Math.abs(al * Math.cos(ay - t)) + Math.abs(aw * Math.sin(ay - t));
    const rb = Math.abs(bl * Math.cos(by - t)) + Math.abs(bw * Math.sin(by - t));
    if (Math.abs((bx - ax) * Math.cos(t) + (bz - az) * Math.sin(t)) >= ra + rb) return false;
  }
  return true;
}

describe('나란한 두 차(서교로 e119, 빈 길에 버스 크기 차와 승용차)', () => {
  const { sim, start, g } = setup({ seconds: 10, keep: 450, count: 300, seed: 11 }, 0);
  const D = sim.debug();
  const c = sim.cars;
  const e = g[119];
  it.each([
    [9.5, 13.55],
    [9, 12.8],
    [7, 11.5],
    [8, 13],
    [9.5, 12],
    [10, 12.5],
  ])('버스 s%f · 승용차 s%f: 둘 다 20초 안에 이 구간을 떠나고 서로 막은 채 1초 넘게 서지 않으며 몸이 겹치지 않는다', (bs, cs) => {
    expect(e.lanes).toBe(3);
    c.n = 0;
    sim.put(e.id, bs, 2);
    D.size[0] = 11.5;
    D.wid[0] = 1.245;
    sim.put(e.id, cs, 1);
    const uids = [c.uid[0], c.uid[1]];
    let now = { ...start };
    let mutual = 0;
    let overlap = 0;
    const left = new Set<number>();
    for (let k = 0; k < 600 && c.n === 2; k++) {
      now = { ...now, tod: now.tod + 1 / 30 };
      sim.step(1 / 30, now, false);
      if (c.n < 2) break;
      if (D.blockBy[0] === 1 && D.blockBy[1] === 0) mutual++;
      if (D.v[0] < 0.3 && D.v[1] < 0.3 && (D.blockBy[0] === 1 || D.blockBy[1] === 0)) mutual++;
      if (hit(c.x[0], c.z[0], c.yaw[0], D.size[0] / 2, D.wid[0], c.x[1], c.z[1], c.yaw[1], D.size[1] / 2, D.wid[1])) overlap++;
      for (let i = 0; i < 2; i++) if (D.edge[i] !== e.id) left.add(c.uid[i]);
    }
    expect({ mutual: mutual < 30, overlap, left: uids.filter((u) => left.has(u)).length }).toEqual({ mutual: true, overlap: 0, left: 2 });
  });
});
