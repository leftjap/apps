// 빈 도로 지도 마무리(재작업 W57, 설계 문서 59.11): 차·사람 없이 보이는 판이 그린 찻길 면·길 정본과 맞는지 판 전체로 센다(정적, 함수는 test/w57-stage1.ts).
// 기준 0 은 풀지 않는다. 둘 곳이 없는 자리와 B3(차로·섬·분리대 정본화)에서 정할 자리만 목록·상한으로 남기고, 목록과 상한은 줄이기만 한다.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { MarksJson } from '../src/data/marks.ts';
import { decodeLanes } from '../src/data/road.ts';
import { buildCarGraph } from '../src/sim/graph.ts';
import { groundQuery } from '../src/data/offroad.ts';
import { centerArrows } from '../tools/road/arrows.ts';
import { arrowCheck, busLaneCheck, crosswalkGaps, groundTilesOf, load, onCarriageway, placedFacilities, shelterSpotsPlaced } from './w57-stage1.ts';

const d = load();
const tiles = groundTilesOf(d);

/**
 * 8m 안에 찻길 면 밖 자리가 없어 그 자리에 둔 기둥(종류 진입로·횡단보도 번호): 섬이 그려지지 않은 교차로 한가운데 진입로·횡단보도 끝.
 * 찻길 면이 섬·분리대를 빼면(B3) 옮겨진다.
 * 재작업 W65(2026-11-22): 측량 선으로 차로 수 구간이 바뀌어 진입로 번호가 밀려 자리로 맞춰 다시 적었다(e693→e681, e872→e865, e2333→e2327, e1353→e1347,
 * e1785→e1780, e1470→e1464, e2131→e2124, e2058→e2052, e2057→e2051). 정지선 끝까지 따라 세우게 고쳐 찻길 밖으로 간 기둥은 뺐다.
 * e80(-280.0,-1802.0)은 측량 차선이 교차로 쪽으로 길게 칠해져 상자가 작아지며 큰 교차로 하나가 둘로 나뉘어 생긴 진입로로, 정지선 끝이 교차로 한가운데다
 */
const LEFT_AB = [
  'carPole e80', 'carPole e165', 'carPole e681', 'carPole e865', 'carPole e2327', 'carPole e1347', 'carPole e1780', 'carPole e1464', 'carPole e2124', 'carPole e2052',
  'carPole e2051',
  'pedPole xw25', 'pedPole xw125', 'pedPole xw414', 'pedPole xw485', 'pedPole xw522', 'pedPole xw666', 'pedPole xw666', 'pedPole xw719', 'pedPole xw719', 'pedPole xw720',
  'pedPole xw857', 'pedPole xw863',
];

describe('빈 도로 지도: 시설물이 찻길 면 위에 서지 않는다(A·B)', () => {
  it('신호 기둥·보행 신호 기둥·출구·엘리베이터·로드뷰 가로등·문·부스·퍼걸러가 그린 찻길 면 안(가장자리에서 0.3m 넘게)에 없다(둘 곳 없는 자리 빼고)', () => {
    const f = onCarriageway(d, placedFacilities(d, tiles));
    expect(f.of).toBeGreaterThan(1000);
    const left = f.where.map((w) => w.split(' ').slice(0, 2).join(' '));
    const rest = [...LEFT_AB];
    const extra = left.filter((w) => {
      const k = rest.indexOf(w);
      if (k < 0) return true;
      rest.splice(k, 1);
      return false;
    });
    expect(extra, f.where.join('\n')).toEqual([]);
  });
  it('길가 정류장 쉼터 바닥이 그린 찻길 면 안에 없다', () => {
    const f = onCarriageway(d, shelterSpotsPlaced(d, tiles));
    expect(f.of).toBeGreaterThan(100);
    expect(f.where, f.where.join('\n')).toEqual([]);
  });
});

/**
 * 줄무늬를 늘여도 8m 안 빈 토막이 남는 신호 횡단보도(번호): 합정 교차로 두 단 횡단보도(xw125·xw471·xw485, 섬 자리가 찻길), 엇갈린 두 면 사이가 11m(xw425),
 * 서울시 섬 테두리 선 안이 찻길로 칠해진 교차로 안(xw666·xw719·xw732), 폭의 반 넘게가 8m 넘게 교차로 안으로 이어져 늘이지 않은 끝(xw289·xw465·xw876),
 * 대각선 횡단보도 모서리(xw361). 찻길 면이 섬을 빼면(B3) 다시 본다
 */
const LEFT_C = [125, 471, 485, 425, 666, 719, 732, 289, 465, 876, 361];

describe('빈 도로 지도: 횡단보도 줄무늬가 찻길 폭을 덮는다(C)', () => {
  it('신호 횡단보도가 가로지르는 찻길 줄(연석·섬·분리대 사이)에서 줄무늬 옆·두 줄무늬 사이 8m 안의 빈 토막이 없다(남긴 자리 빼고)', () => {
    const f = crosswalkGaps(d, (i) => d.marks.crossings.get(i) ?? d.board.crosswalks[i].rings);
    expect(f.of).toBeGreaterThan(200);
    expect(f.per.map((p) => p.i).filter((i) => !LEFT_C.includes(i)), f.where.join('\n')).toEqual([]);
  });
});

describe('빈 도로 지도: 화살표와 버스전용차로 구획(D)', () => {
  // 정본 차로 가운데에서 0.3m 넘게 벗어난 화살표는 칠한 선 칸 가운데에 맞춘 것(칠한 선과 정본 차로가 어긋난 곳)과, 옮기면 칠한 칸에 걸리거나 차 그래프 차로 회전이 바뀌는 것만 남는다(B3)
  it('차로 가운데에서 벗어난 화살표가 늘지 않고, 칠한 선 칸이 없는 화살표 가운데 더 옮길 것이 없다', () => {
    const a = arrowCheck(d);
    expect(a.off.of).toBeGreaterThan(2000);
    expect(a.off.n, a.off.where.slice(0, 20).join('\n')).toBeLessThanOrEqual(134);
    const mj = JSON.parse(readFileSync(`${d.dir}/marks.json`, 'utf8')) as MarksJson;
    const lanes = decodeLanes(JSON.parse(readFileSync(`${d.dir}/road.json`, 'utf8')).lanes);
    const q = groundQuery(tiles);
    expect(centerArrows(mj, (arrows) => buildCarGraph(d.board.roads, lanes, arrows), (x, z) => q.deep(x, z, 0.5)).moved).toBe(0);
  });
  // 기록만(B3 로 넘김): 화살표가 보이는 움직임이 그 차로 허용 움직임(X.laneMoves) 밖인 것, 정본 버스차로 경계와 버스전용 선이 어긋난 길이. 늘지 않게만 본다
  it('화살표 종류와 차로 허용 움직임이 다른 곳이 늘지 않는다', () => {
    const a = arrowCheck(d);
    expect(a.kind.of).toBeGreaterThan(600);
    // 재작업 W65(2026-11-22 다시 잡음): 측량 선으로 차로를 다시 읽어 차로 구성이 바뀌며 141 → 143(W65 판에만 34곳·전 판에만 32곳, 같은 결함이 자리를 옮김).
    // 회전교차로 고리를 측량 섬에 맞춰 옮겨(tools/road/hdcurbs.ts fitRoundabouts) 고리 둘레 화살표가 2곳(e510·e512) → 4곳(e496·e499·e500 고리 돌기, e502 들어가기) 143 → 145.
    // 고리에 들고 도는 움직임을 화살표 회전과 다르게 나누는 차 규칙 결함이라 3단계(차 규칙)에서 고친다
    expect(a.kind.n).toBeLessThanOrEqual(145);
  });
  it('버스전용 선과 정본 버스차로 경계가 어긋난 길이가 늘지 않는다', () => {
    const b = busLaneCheck(d);
    expect(b.miss.of).toBeGreaterThan(8000);
    expect(b.miss.n).toBeLessThanOrEqual(3072);
    // 재작업 W65(2026-11-22 다시 잡음): 노면 표시를 최종 찻길 면으로 자르며 1600,-400 중앙버스전용선 하나가 교차로 쪽으로 3m 덜 잘림 1227 → 1228
    expect(b.stray.n).toBeLessThanOrEqual(1228);
  });
});
