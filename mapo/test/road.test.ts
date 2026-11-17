// 길 정본 시험(재작업 W23, 설계 문서 51절): public/data/road.json 의 차로는 굽기가 정한 최종 차로이고, 차 그래프는 실행 중에 고치지 않고 쓴다.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeBoard, type BoardJson } from '../src/data/board.ts';
import { decodeLanes, type RoadJson } from '../src/data/road.ts';
import { buildCarGraph, carRoad } from '../src/sim/graph.ts';
import { BODY_HW, BUS_HW } from '../src/sim/bodies.ts';

const read = (f: string) => JSON.parse(readFileSync(new URL(`../public/data/${f}`, import.meta.url), 'utf8'));
const board = decodeBoard(read('board.json') as BoardJson);
const canon = decodeLanes((read('road.json') as RoadJson).lanes);
const edges = buildCarGraph(board.roads, canon);
const at = (e: (typeof edges)[number]) => `e${e.id} ${e.name || '이름 없음'} (${Math.round(e.p[0])},${Math.round(e.p[2])})`;

describe('길 정본: 차로', () => {
  it('차가 다니는 조각의 모든 방향에 차로가 있다(실행 중에 채우지 않는다)', () => {
    const miss: number[] = [];
    board.roads.forEach((r, i) => {
      if (!carRoad(r)) return;
      if (!canon.dirs[i]?.[0] || (!r.oneway && !canon.dirs[i]?.[1])) miss.push(i);
    });
    expect(miss).toEqual([]);
    expect(edges.length).toBeGreaterThan(2000);
  });
  it('중앙버스차로가 있는 구간은 일반 차로 왼쪽 가장자리에서 버스차로까지 거리가 있고, 옆 거리 표가 있으면 단면마다 하나다', () => {
    expect(edges.filter((e) => e.med && (e.med < 0.5 || (e.mo.length && e.mo.length !== e.st.length))).map(at)).toEqual([]);
    expect(edges.filter((e) => e.med).length).toBeGreaterThan(50);
  });
  // 선 없는 한 방향 찻길이 마주 오는 찻길과 붙은 곳은 차로를 2.4m 까지 좁힌다(src/sim/lanes.ts keepApart). 중앙버스차로와 1차로 사이는 버스 반폭 + 가장 넓은 승용차 반폭 + 0.15m
  const medGap = Math.max(...BUS_HW) + Math.max(...BODY_HW) + 0.15 - 0.02;
  it('같은 방향 이웃 차로 가운데 사이가 2.4m 아래가 아니고, 중앙버스차로와 1차로는 버스와 승용차가 나란히 설 만큼 떨어진다', () => {
    const bad = new Set<string>();
    for (const e of edges)
      for (let k = 0; k < e.st.length; k++) {
        for (let l = 1; l < e.lanes; l++) if (e.lo[k * e.lanes + l] - e.lo[k * e.lanes + l - 1] < 2.39) bad.add(`${at(e)} 차로 ${l}`);
        if (e.med && e.lo[k * e.lanes] - e.mo[k] < medGap) bad.add(`${at(e)} 중앙버스차로`);
      }
    expect([...bad].slice(0, 12)).toEqual([]);
  });
});
