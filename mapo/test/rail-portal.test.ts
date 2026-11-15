import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeBoard } from '../src/data/board.ts';
import { pointAt } from '../src/poly.ts';
import { carPose, findPortals } from '../src/render/rails.ts';

// 지금 판에서 터파기·터널 입구가 그려지는 자리. OSM 2호선은 (−538, 344) 에서 터널(tunnel=yes, layer=-2)이 시작하고,
// 그 남서쪽 179m 는 태그 없는 지상 구간, 그 남쪽은 당산철교다. 합정역 교차로 밑은 터널이다.
const board = decodeBoard(JSON.parse(readFileSync(new URL('../public/data/board.json', import.meta.url), 'utf8')));
const line = (id: string) => board.lines.find((l) => l.id === id)!;
/** 터파기 s0..sP 를 2m 간격으로 찍은 점들 */
function troughPoints(id: string): [number, number][] {
  const l = line(id);
  const out: [number, number][] = [];
  const tmp = [0, 0, 0];
  for (const { s0, sP } of findPortals(l)) {
    const n = Math.ceil(Math.abs(sP - s0) / 2);
    for (let i = 0; i <= n; i++) {
      pointAt(l.p, l.cum, s0 + ((sP - s0) * i) / n, tmp);
      out.push([tmp[0], tmp[2]]);
    }
  }
  return out;
}
const HAPJEONG: [number, number][] = [
  [-497, 250], // 서울시 교차로 자료 A008_P '합정역'
  [-470, 290], // 교차로 북동쪽 횡단보도 둘레
];

describe('지하철 터파기와 터널 입구', () => {
  it('합정역 교차로 둘레 60m 안에는 2호선 터파기·옹벽·터널 입구가 없다', () => {
    const pts = troughPoints('2');
    expect(pts.length).toBeGreaterThan(0);
    const near = Math.min(...pts.flatMap(([x, z]) => HAPJEONG.map(([cx, cz]) => Math.hypot(x - cx, z - cz))));
    expect(near).toBeGreaterThan(60);
  });

  it('2호선 터널 입구는 OSM 터널 시작점(−538, 344)에서 20m 안이다', () => {
    const l = line('2');
    const ps = findPortals(l);
    expect(ps).toHaveLength(1);
    const tmp = [0, 0, 0];
    pointAt(l.p, l.cum, ps[0].sP, tmp);
    expect(Math.hypot(tmp[0] + 538, tmp[2] - 344)).toBeLessThan(20);
  });

  it('6호선·공항철도·경의중앙선은 판 안이 모두 터널이라 터파기가 없다', () => {
    for (const id of ['6', 'A', 'K']) expect(findPortals(line(id))).toHaveLength(0);
  });

  it('네 노선 모두 역에 선 열차는 터널 안(지하)으로 그려진다', () => {
    for (const l of board.lines)
      for (const [k, s] of l.stops.entries()) expect(carPose(l, s).under, `${l.name} ${l.stopNames[k]}`).toBe(true);
  });
});
