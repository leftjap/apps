// 길 정본 시험(재작업 W23, 설계 문서 51절): public/data/road.json 의 차로는 굽기가 정한 최종 차로이고, 차 그래프는 실행 중에 고치지 않고 쓴다.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeBoard, type BoardJson } from '../src/data/board.ts';
import { decodeLanes, type RoadJson } from '../src/data/road.ts';
import { buildCarGraph, carRoad, laneOff, MED, type Edge } from '../src/sim/graph.ts';
import { junctionZone, oppositeClashes, seamGaps, STITCH_MAX } from '../src/sim/lanes.ts';
import { buildIntersections } from '../src/sim/intersection/build.ts';
import { BODY_HW, BUS_HW } from '../src/sim/bodies.ts';

const read = (f: string) => JSON.parse(readFileSync(new URL(`../public/data/${f}`, import.meta.url), 'utf8'));
const board = decodeBoard(read('board.json') as BoardJson);
const canon = decodeLanes((read('road.json') as RoadJson).lanes);
const edges = buildCarGraph(board.roads, canon);
const prev: number[][] = edges.map(() => []);
for (const e of edges) for (const k of e.next) prev[k].push(e.id);
// 교차로 상자 둘레는 정본 제약이 차로를 옮기지 않는다(교차로 차로 경로가 맡는다, src/sim/lanes.ts junctionZone)
const X = buildIntersections(edges, board.crosswalks, board.stopLines);
/** 2m 마다 다시 적은 차로 표(표 단면 수와 상관없이 같은 잣대로 센다) */
const dense = (list: Edge[]): Edge[] =>
  list.map((e) => {
    const m = Math.max(2, Math.ceil(e.len / 2) + 1);
    const st = Float32Array.from({ length: m }, (_, k) => Math.min(e.len, (k * e.len) / (m - 1)));
    const lo = Float32Array.from({ length: m * e.lanes }, (_, i) => laneOff(e, i % e.lanes, st[Math.floor(i / e.lanes)]));
    const mo = e.med ? Float32Array.from(st, (s) => laneOff(e, MED, s)) : new Float32Array(0);
    return { ...e, st, lo, mo };
  });
/** 남은 반대 방향 포개짐(2m 표본, 2026-11-17 W27 판): 한 방향 길 쌍의 OSM 가운데선이 2~6m 로 가까워 양쪽 차로를 다 놓을 자리가 없는 곳
 *  (연희로 945,−1541·백범로 1642,13·연세로 1579,−829 등, 차로 수를 줄여야 풀린다)와 중앙버스차로 쌍(양화로 445,−628·82,−263, 성산로). 고치기 전(W23 1단계 판) 3,145 */
const CLASH_SAMPLES = 504;
/** 1.5m 넘게 어긋난 이음매: 두 조각이 칠한 선을 다르게 나눠 읽은 곳이라 옮겨 맞추지 않는다(W20 메모의 1m 넘는 138곳과 같은 무리) */
const BIG_SEAMS = 33;
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
  // 고치기 전(W23 1단계 판) 교차로 밖 2m 표본 3,145개(연석 사이가 좁은 길에서 차로를 따로 읽은 두 방향, 양화로 홍대입구 중앙버스차로 등)
  it('반대 방향 차로 가운데가 2.6m 안으로 포개지는 2m 표본이 늘지 않는다(높이 2.5m 안, 교차로 상자 둘레 밖)', () => {
    const d = dense(edges);
    const cl = oppositeClashes(d, prev, 2.6, (e, s) => junctionZone(X, e, s));
    const where = new Set<string>();
    for (let o = 0; o < cl.length; o += 7) where.add(`${at(edges[cl[o]])} ↔ ${at(edges[cl[o + 2]])}`);
    expect(cl.length / 7, [...where].slice(0, 30).join(' | ')).toBeLessThanOrEqual(CLASH_SAMPLES);
  });
  // 고치기 전(W23 1단계 판) 0.3~1.4m 끊긴 이음매 301곳. 방향을 고정한 3m 아래 꺾인 토막(fixShortKinks, 월드컵로 xw420 r1439 의 역방향) 양쪽 이음매는
  // 토막 방향이 앞뒤 방향의 가운데라 옆 거리 5~10m 차로가 길 따라 0.6m 어긋난다(옆 거리로는 못 맞춘다, 고치기 전에도 0.60). 그 둘은 따로 세어 늘지 않게 본다
  it('교차로 밖 갈림 없는 이음매에서 같은 차로가 0.3m 넘게 끊기지 않는다(차로 나눔이 다른 이음매 빼고)', () => {
    const sg = seamGaps(edges, prev).filter(([a]) => X.jEnd[a] < 0);
    const kink = ([a, b]: [number, number, number]) => edges[a].fixH !== undefined || edges[b].fixH !== undefined;
    const bad = sg.filter(([, , g]) => g > 0.3 && g <= STITCH_MAX - 0.1);
    expect(bad.filter((x) => !kink(x)).slice(0, 12).map(([a, b, g]) => `${at(edges[a])} → e${b} ${g.toFixed(2)}m`)).toEqual([]);
    expect(bad.filter(kink).length).toBeLessThanOrEqual(2);
    expect(sg.filter(([, , g]) => g > STITCH_MAX - 0.1).length).toBeLessThanOrEqual(BIG_SEAMS);
  });
});
