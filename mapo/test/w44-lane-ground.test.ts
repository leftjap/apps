// 차가 달리는 자리는 찻길로 칠한다(재작업 W44, 설계 문서 58절). 판 전체 땅 위 차로 가운데선을 1m 마다 짚어, 그린 찻길 면
// (찻길 띠·교차로 면·분리대·그리기 전용 면·길 정본 차로 띠)에서 0.5m 넘게 밖인 길이를 센다. 차로 띠를 칠하기 전에는 5.8km(2.6%)가 보도색 면 위였다.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeBoard } from '../src/data/board.ts';
import { decodeMarks } from '../src/data/marks.ts';
import { decodeLanes } from '../src/data/road.ts';
import { pointAt } from '../src/poly.ts';
import { buildCarGraph, headingNear, laneOff, MED } from '../src/sim/graph.ts';
import { groundBits, onBit } from '../tools/measure-junction.ts';

const DATA = new URL('../public/data/', import.meta.url).pathname;
const data = (f: string) => JSON.parse(readFileSync(`${DATA}/${f}`, 'utf8'));

describe('차로 가운데선이 그린 찻길 면 안(판 전체)', () => {
  it('땅 위 차로 가운데선 가운데 찻길 면 밖인 길이 0', () => {
    const board = decodeBoard(data('board.json'));
    const g = buildCarGraph(board.roads, decodeLanes(data('road.json').lanes), decodeMarks(data('marks.json')).arrows);
    const B = groundBits(DATA, g, undefined, 0.5);
    const P = [0, 0, 0];
    let off = 0;
    let total = 0;
    const where: string[] = [];
    for (const e of g) {
      const lanes = [...Array(e.lanes).keys()];
      if (e.mo.length || e.med) lanes.push(MED);
      for (const l of lanes)
        for (let s = 0.5; s < e.len; s += 1) {
          pointAt(e.p, e.cum, s, P);
          if (Math.abs(P[1]) > 0.3) continue;
          const o = laneOff(e, l, s);
          const h = headingNear(e, s, o);
          const x = P[0] - Math.sin(h) * o;
          const z = P[2] + Math.cos(h) * o;
          total++;
          if (onBit(B, x, z, 1, 0.5)) continue;
          off++;
          if (where.length < 10) where.push(`e${e.id} l${l} ${Math.round(x)},${Math.round(z)}`);
        }
    }
    expect(total).toBeGreaterThan(200_000);
    expect(off, where.join(' ')).toBe(0);
  }, 120_000);
});
