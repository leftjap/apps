import { describe, expect, it } from 'vitest';
import { rampHeight } from '../tools/lib/elevate.ts';
import { estimateHeight } from '../tools/lib/height.ts';
import { stitch } from '../tools/lib/rail.ts';
import { encodePng, fillPolygon, strokeLine } from '../tools/lib/raster.ts';

describe('건물 높이 추정', () => {
  it('height 태그가 있으면 그대로', () => expect(estimateHeight({ height: '30' }, 200, 1)).toBe(30));
  it('단위가 붙은 height', () => expect(estimateHeight({ height: '12.5 m' }, 200, 1)).toBe(12.5));
  it('층수 태그', () => {
    const h = estimateHeight({ 'building:levels': '5' }, 200, 1);
    expect(h).toBeGreaterThanOrEqual(16);
    expect(h).toBeLessThanOrEqual(18);
  });
  it('태그 없는 넓은 아파트는 높게', () =>
    expect(estimateHeight({ building: 'apartments' }, 900, 7)).toBeGreaterThanOrEqual(35));
  it('태그 없는 작은 주택은 낮게', () => expect(estimateHeight({ building: 'house' }, 80, 7)).toBeLessThanOrEqual(12));
  it('같은 id는 같은 값', () =>
    expect(estimateHeight({ building: 'yes' }, 150, 42)).toBe(estimateHeight({ building: 'yes' }, 150, 42)));
  it('id가 다르면 값이 흩어진다', () => {
    const hs = new Set(Array.from({ length: 30 }, (_, i) => estimateHeight({ building: 'yes' }, 150, i)));
    expect(hs.size).toBeGreaterThan(3);
  });
});

describe('교량 높이', () => {
  it('땅에 닿는 점은 0', () => expect(rampHeight(0, 12)).toBe(0));
  it('80m 넘으면 꼭대기', () => expect(rampHeight(120, 12)).toBe(12));
  it('단조 증가', () => {
    let prev = -1;
    for (let d = 0; d <= 100; d += 5) {
      const h = rampHeight(d, 12);
      expect(h).toBeGreaterThanOrEqual(prev);
      prev = h;
    }
  });
});

describe('마스크 칠하기', () => {
  const size = 16;
  const at = (m: Uint8Array, x: number, y: number, ch = 0) => m[(y * size + x) * 4 + ch];
  it('사각형 안만 칠한다', () => {
    const m = new Uint8Array(size * size * 4);
    fillPolygon(m, size, [[2, 2, 10, 2, 10, 10, 2, 10, 2, 2]], 0);
    expect(at(m, 5, 5)).toBe(255);
    expect(at(m, 12, 5)).toBe(0);
    expect(at(m, 5, 12)).toBe(0);
    expect(at(m, 5, 5, 1)).toBe(0);
  });
  it('구멍 고리 안은 비운다', () => {
    const m = new Uint8Array(size * size * 4);
    fillPolygon(m, size, [[1, 1, 14, 1, 14, 14, 1, 14, 1, 1], [5, 5, 10, 5, 10, 10, 5, 10, 5, 5]], 1);
    expect(at(m, 3, 3, 1)).toBe(255);
    expect(at(m, 7, 7, 1)).toBe(0);
  });
  it('캔버스 밖으로 나가도 잘려서 칠한다', () => {
    const m = new Uint8Array(size * size * 4);
    fillPolygon(m, size, [[-50, -50, 8, -50, 8, 50, -50, 50, -50, -50]], 0);
    expect(at(m, 0, 0)).toBe(255);
    expect(at(m, 7, 15)).toBe(255);
    expect(at(m, 9, 8)).toBe(0);
  });
  it('고리가 여러 조각으로 나뉘어 있어도 합쳐서 닫혀 있으면 채운다', () => {
    const m = new Uint8Array(size * size * 4);
    // 사각형 둘레를 세 조각으로 나눈 것. 조각마다 끝점을 이어 닫아 버리면 안쪽이 비게 된다
    fillPolygon(m, size, [[2, 2, 10, 2, 10, 6], [10, 6, 10, 10, 2, 10], [2, 10, 2, 2]], 0);
    expect(at(m, 5, 5)).toBe(255);
    expect(at(m, 12, 5)).toBe(0);
    expect(at(m, 1, 5)).toBe(0);
  });
  it('굵은 선', () => {
    const m = new Uint8Array(size * size * 4);
    strokeLine(m, size, [0, 8, 15, 8], 4, 0);
    expect(at(m, 7, 8)).toBe(255);
    expect(at(m, 7, 7)).toBe(255);
    expect(at(m, 7, 2)).toBe(0);
  });
  it('PNG 머리', () => {
    const png = encodePng(new Uint8Array(4 * 4 * 4), 4);
    expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(png.readUInt32BE(16)).toBe(4);
    expect(png.readUInt32BE(20)).toBe(4);
  });
});

describe('선로 조각 잇기', () => {
  it('순서와 방향이 섞여도 한 줄로', () => {
    const line = stitch([
      { id: 2, pts: [[30, 0], [20, 0]] },
      { id: 1, pts: [[0, 0], [10, 0], [20, 0]] },
      { id: 3, pts: [[30, 0], [40, 5]] },
    ]);
    const xs = line.map((p) => p[0]);
    const asc = xs.join() === '0,10,20,30,40';
    const desc = xs.join() === '40,30,20,10,0';
    expect(asc || desc).toBe(true);
  });
  it('떨어진 조각은 가장 긴 줄만', () => {
    const line = stitch([
      { id: 1, pts: [[0, 0], [10, 0]] },
      { id: 2, pts: [[10, 0], [25, 0]] },
      { id: 9, pts: [[500, 500], [505, 500]] },
    ]);
    expect(line.length).toBe(3);
  });
});
