// 구운 결과(public/data)가 화면을 만들 만큼 온전한지 본다.
import { readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeBoard, type BoardJson } from '../src/data/board.ts';
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
});
