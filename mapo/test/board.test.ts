// 구운 결과(public/data)가 화면을 만들 만큼 온전한지 본다.
import { readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { curbAt, decodeBoard, roadHalf, type BoardJson } from '../src/data/board.ts';
import { buildWalkGraph } from '../src/sim/graph.ts';
import { road } from './helpers.ts';
import { BOARD_R } from '../src/geo.ts';

const json: BoardJson = JSON.parse(readFileSync(new URL('../public/data/board.json', import.meta.url), 'utf8'));
const board = decodeBoard(json);

describe('구운 모형판 자료', () => {
  it('건물 8,000동 이상이고 모두 판 안', () => {
    expect(board.buildings.length).toBeGreaterThan(8000);
    for (const b of board.buildings) {
      expect(Math.hypot(b.pts[0], b.pts[1])).toBeLessThan(BOARD_R + 80);
      expect(b.h).toBeGreaterThan(2);
    }
  });
  it('홍익대 건물이 랜드마크로 표시돼 있다', () => expect(board.buildings.filter((b) => b.lm === 1).length).toBeGreaterThan(10));
  it('노선 4개와 정차역', () => {
    const stops = Object.fromEntries(board.lines.map((l) => [l.id, l.stopNames]));
    expect(Object.keys(stops).sort()).toEqual(['2', '6', 'A', 'K']);
    expect(stops['2']).toEqual(['합정', '홍대입구', '신촌']);
    expect(stops['A']).toEqual(['홍대입구']);
    expect(stops['K']).toEqual(['홍대입구', '서강대']);
    expect(stops['6']).toEqual(expect.arrayContaining(['광흥창', '상수', '합정', '망원']));
  });
  it('역은 선 위에 오름차순으로 놓인다', () => {
    for (const l of board.lines) {
      const len = l.cum[l.cum.length - 1];
      expect(len).toBeGreaterThan(2500);
      l.stops.forEach((s, i) => {
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThanOrEqual(len);
        if (i) expect(s).toBeGreaterThan(l.stops[i - 1] + 300);
      });
    }
  });
  it('2호선은 지하 구간과 지상(당산철교) 구간이 모두 있다', () => {
    const l = board.lines.find((l) => l.id === '2')!;
    const ys = Array.from(l.p).filter((_, i) => i % 3 === 1);
    expect(Math.max(...ys)).toBeGreaterThan(5);
    expect(Math.min(...ys)).toBeLessThan(-5);
  });
  it('한강 다리는 10m 넘게 떠 있고 랜드마크로 표시돼 있다', () => {
    const top = Math.max(...board.roads.map((r) => Math.max(...Array.from(r.p).filter((_, i) => i % 3 === 1))));
    expect(top).toBeGreaterThan(10);
    expect(board.roads.some((r) => r.lm === 4)).toBe(true);
    expect(board.roads.some((r) => r.lm === 5)).toBe(true);
  });
  it('랜드마크 5개가 판 안의 제자리에', () => {
    expect(board.landmarks.map((l) => l.id)).toEqual(['hongik', 'hongik-stn', 'hapjeong-stn', 'seogang-br', 'yanghwa-br']);
    for (const l of board.landmarks) {
      expect(Math.hypot(l.x, l.z)).toBeGreaterThan(50);
      expect(Math.hypot(l.x, l.z)).toBeLessThan(BOARD_R);
    }
  });
  it('출구는 20곳 이상이고 모두 아는 역에 딸려 있다', () => {
    expect(board.exits.length).toBeGreaterThan(20);
    const names = new Set(board.stations.map((s) => s.name));
    for (const e of board.exits) expect(names.has(e.st)).toBe(true);
  });
  it('나무 1,500그루 이상', () => expect(board.trees.length / 2).toBeGreaterThan(1500));
  it('마스크 이미지가 있다', () => expect(statSync(new URL('../public/data/mask.png', import.meta.url)).size).toBeGreaterThan(50_000));
  it('횡단보도는 서울시 면 모양 그대로 그린다: 조각마다 외곽선이 있고, 외곽선은 축 사각형 안에 든다', () => {
    expect(board.crosswalks.length).toBeGreaterThan(800);
    for (const c of board.crosswalks) {
      expect(c.rings.length).toBeGreaterThan(0);
      for (const r of c.rings) {
        expect(r.length).toBeGreaterThanOrEqual(6);
        for (let k = 0; k < r.length; k += 2) {
          const dx = r[k] - c.x;
          const dz = r[k + 1] - c.z;
          expect(Math.abs(dx * c.ux + dz * c.uz)).toBeLessThan(c.half + 0.6);
          expect(Math.abs(-dx * c.uz + dz * c.ux)).toBeLessThan(c.wid + 2.5); // 두 단 조각은 옆으로 2.5m 까지 비켜 있다
        }
      }
    }
    // 판에 없는 골목·진입로 입구의 횡단보도(사람이 건너는 데는 쓰지 않는다)
    expect(board.crosswalkMarks.length).toBeGreaterThan(20);
  });
});

describe('찻길 가장자리(연석선으로 읽은 값)', () => {
  const prof = (s: number[], v: number[]) => ({ s: Float32Array.from(s), v: Float32Array.from(v) });
  it('가장자리 값이 있으면 그 자리를 보간하고, 없으면 차로로 어림한 값', () => {
    const a = road([[0, 0], [100, 0]], { edge: { r: prof([0, 50, 100], [8, 8, 11]), l: prof([0, 100], [6, 6]) } });
    expect(curbAt(a, 25, 1)).toBeCloseTo(8, 5);
    expect(curbAt(a, 75, 1)).toBeCloseTo(9.5, 5);
    expect(curbAt(a, 75, -1)).toBeCloseTo(6, 5);
    const b = road([[0, 0], [100, 0]]);
    expect(curbAt(b, 30, 1)).toBeCloseTo(roadHalf(b)[0], 5);
    expect(curbAt(b, 30, -1)).toBeCloseTo(roadHalf(b)[1], 5);
  });
  it('판 자료에서 읽는다', () => {
    const j = { ...json, r: [[2, 2, 0, 0, 0, 0, 0, 0, 0, 1000, 0, 0]], rl: [0], re: [[[0, 80, 1000, 80], [0, 60, 1000, 60]]] } as BoardJson;
    const r = decodeBoard(j).roads[0];
    expect(curbAt(r, 50, 1)).toBeCloseTo(8, 5);
    expect(curbAt(r, 50, -1)).toBeCloseTo(6, 5);
  });
  it('큰길 보도는 연석 바깥으로 걷는다', () => {
    const g = buildWalkGraph([road([[0, 0], [100, 0]], { edge: { r: prof([0, 100], [9, 9]), l: prof([0, 100], [5, 5]) } })]);
    const a = g.nodeAt(0, 0);
    expect(g.lat[a][0]).toEqual([9.8, 11.4]);
    expect(g.latL[a][0][0]).toBeCloseTo(5.8, 5);
  });
});
