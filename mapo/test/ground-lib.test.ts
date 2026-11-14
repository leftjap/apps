import { describe, expect, it } from 'vitest';
import { decodeGroundAreas, GK } from '../src/data/board.ts';
import { assembleRings, biotopeKind, encodeArea, groupRings, osmKind, simplifyRing } from '../tools/lib/ground.ts';
import { fillPolygonAA, strokeLineAA } from '../tools/lib/raster.ts';

describe('OSM 면 → 바닥 종류', () => {
  it('흙 운동장: 종목만 있고 바닥 재질이 없는 축구장', () => expect(osmKind({ leisure: 'pitch', sport: 'soccer' })).toEqual({ kind: GK.PITCH_DIRT, sport: 1 }));
  it('인조 잔디 축구장', () => expect(osmKind({ leisure: 'pitch', sport: 'soccer', surface: 'artificial_turf' })).toEqual({ kind: GK.PITCH_TURF, sport: 1 }));
  it('테니스장은 코트', () => expect(osmKind({ leisure: 'pitch', sport: 'tennis' })).toEqual({ kind: GK.COURT, sport: 2 }));
  it('농구장은 코트', () => expect(osmKind({ leisure: 'pitch', sport: 'basketball' })).toEqual({ kind: GK.COURT, sport: 3 }));
  it('모래 바닥 경기장', () => expect(osmKind({ leisure: 'pitch', surface: 'sand' }).kind).toBe(GK.PITCH_DIRT));
  it('주차장', () => expect(osmKind({ amenity: 'parking' }).kind).toBe(GK.PARKING));
  it('지하·건물 안 주차장은 그리지 않는다', () => {
    expect(osmKind({ amenity: 'parking', parking: 'underground' }).kind).toBe(0);
    expect(osmKind({ amenity: 'parking', parking: 'multi-storey' }).kind).toBe(0);
  });
  it('보행 광장 면', () => {
    expect(osmKind({ highway: 'pedestrian', area: 'yes' }).kind).toBe(GK.PLAZA);
    expect(osmKind({ place: 'square' }).kind).toBe(GK.PLAZA);
    expect(osmKind({ 'area:highway': 'pedestrian' }).kind).toBe(GK.PLAZA);
  });
  it('포장된 공원은 광장', () => expect(osmKind({ leisure: 'park', surface: 'paving_stones' }).kind).toBe(GK.PLAZA));
  it('공원·잔디·숲', () => {
    expect(osmKind({ leisure: 'park' }).kind).toBe(GK.PARK);
    expect(osmKind({ landuse: 'grass' }).kind).toBe(GK.PARK);
    expect(osmKind({ natural: 'wood' }).kind).toBe(GK.WOOD);
    expect(osmKind({ landuse: 'forest' }).kind).toBe(GK.WOOD);
  });
  it('놀이터·트랙·공사장·부두·수영장', () => {
    expect(osmKind({ leisure: 'playground' }).kind).toBe(GK.PLAYGROUND);
    expect(osmKind({ leisure: 'track' }).kind).toBe(GK.TRACK);
    expect(osmKind({ landuse: 'construction' }).kind).toBe(GK.BARE);
    expect(osmKind({ man_made: 'pier' }).kind).toBe(GK.PIER);
    expect(osmKind({ leisure: 'swimming_pool' }).kind).toBe(GK.POOL);
  });
  it('주거지·상업지 같은 넓은 쓰임새는 서울 비오톱 자료에 맡긴다', () => {
    expect(osmKind({ landuse: 'residential' }).kind).toBe(0);
    expect(osmKind({ landuse: 'retail' }).kind).toBe(0);
  });
  it('지붕 위·실내 시설은 그리지 않는다', () => {
    expect(osmKind({ leisure: 'pitch', sport: 'tennis', location: 'roof' }).kind).toBe(0);
    expect(osmKind({ leisure: 'pitch', indoor: 'yes' }).kind).toBe(0);
    expect(osmKind({ leisure: 'playground', level: '1' }).kind).toBe(0);
  });
});

describe('서울 비오톱 면 → 바닥 종류', () => {
  it('도로 부지는 보도 포장', () => expect(biotopeKind({ lu: 'E2', use: '교통시설지', veg: '도로' })).toBe(GK.ROADSIDE));
  it('하천 수면은 마스크의 물이 맡는다', () => expect(biotopeKind({ lu: 'J1', use: '하천 및 호소', veg: '수면' })).toBe(0));
  it('둔치는 식생에 따라 녹지·포장·호안', () => {
    expect(biotopeKind({ lu: 'J2', use: '하천 및 호소', veg: '조경수목식재지' })).toBe(GK.RIVER_GREEN);
    expect(biotopeKind({ lu: 'J2', use: '하천 및 호소', veg: '초지' })).toBe(GK.RIVER_GREEN);
    expect(biotopeKind({ lu: 'J2', use: '하천 및 호소', veg: '시가화지역' })).toBe(GK.RIVER_PAVED);
    expect(biotopeKind({ lu: 'J2', use: '하천 및 호소', veg: '호안블럭' })).toBe(GK.REVETMENT);
  });
  it('둔치의 포장 비율로 산책로·자전거길과 흙 바닥을 가른다', () => {
    // 망원한강공원: 물가를 따라 난 호안 블록 띠는 대부분 포장(불투수 80%)이고, 투수 포장 100% 시가화지역은 흙 운동장이다
    expect(biotopeKind({ lu: 'J2', use: '하천 및 호소', veg: '호안블럭', imp: 80, perm: 0 })).toBe(GK.RIVER_PAVED);
    expect(biotopeKind({ lu: 'J2', use: '하천 및 호소', veg: '호안블럭', imp: 20, perm: 0 })).toBe(GK.REVETMENT);
    expect(biotopeKind({ lu: 'J2', use: '하천 및 호소', veg: '시가화지역', imp: 0, perm: 100 })).toBe(GK.BARE);
    expect(biotopeKind({ lu: 'J2', use: '하천 및 호소', veg: '도로', imp: 100, perm: 0 })).toBe(GK.RIVER_PAVED);
  });
  it('주거·상업·공공', () => {
    expect(biotopeKind({ lu: 'A1', use: '주택지', veg: '시가화지역' })).toBe(GK.HOUSE);
    expect(biotopeKind({ lu: 'A2', use: '주택지', veg: '시가화지역' })).toBe(GK.APT);
    expect(biotopeKind({ lu: 'AB', use: '주거 및 상업혼합지', veg: '시가화지역' })).toBe(GK.MIXED);
    expect(biotopeKind({ lu: 'B', use: '상업 및 업무시설지', veg: '시가화지역' })).toBe(GK.COMMERCE);
    expect(biotopeKind({ lu: 'D1', use: '공공용도지', veg: '시가화지역' })).toBe(GK.PUBLIC);
  });
  it('녹지: 산림·조경녹지·경작지·나지', () => {
    expect(biotopeKind({ lu: 'I1', use: '녹지 및 오픈스페이스', veg: '아까시나무림' })).toBe(GK.FOREST);
    expect(biotopeKind({ lu: 'I7', use: '녹지 및 오픈스페이스', veg: '조경수목식재지' })).toBe(GK.GREEN);
    expect(biotopeKind({ lu: 'I3', use: '녹지 및 오픈스페이스', veg: '경작지' })).toBe(GK.FARM);
    expect(biotopeKind({ lu: 'G1', use: '나지', veg: '시가화지역' })).toBe(GK.BARE);
  });
  it('철도·역 부지', () => expect(biotopeKind({ lu: 'E1', use: '교통시설지', veg: '시가화지역' })).toBe(GK.RAIL));
});

describe('고리 다루기', () => {
  const sq = (x: number, z: number, s: number): [number, number][] => [
    [x, z],
    [x + s, z],
    [x + s, z + s],
    [x, z + s],
    [x, z],
  ];
  it('바깥 고리 안의 고리는 구멍', () => {
    const polys = groupRings([sq(0, 0, 10), sq(3, 3, 2).reverse()]);
    expect(polys).toHaveLength(1);
    expect(polys[0].holes).toHaveLength(1);
  });
  it('떨어진 두 고리는 두 면', () => expect(groupRings([sq(0, 0, 10), sq(20, 0, 5)])).toHaveLength(2));
  it('둘로 나뉜 길을 이어 닫힌 고리로', () => {
    const rings = assembleRings([
      [
        [0, 0],
        [10, 0],
        [10, 10],
      ],
      [
        [0, 0],
        [0, 10],
        [10, 10],
      ],
    ]);
    expect(rings).toHaveLength(1);
    expect(rings[0]).toHaveLength(5);
    expect(rings[0][0]).toEqual(rings[0][4]);
  });
  it('일직선 위 점은 줄이고 모서리는 남긴다', () => {
    const r = simplifyRing(
      [
        [0, 0],
        [5, 0.01],
        [10, 0],
        [10, 10],
        [0, 10],
        [0, 0],
      ],
      0.2,
    );
    expect(r).toHaveLength(5);
    expect(r).toContainEqual([10, 10]);
  });
});

describe('바닥 면 자료 굽기·풀기', () => {
  it('종류·값·직사각형·고리가 그대로 돌아온다', () => {
    const outer: [number, number][] = [
      [0, 0],
      [40, 0],
      [40, 20],
      [0, 20],
      [0, 0],
    ];
    const hole: [number, number][] = [
      [10, 5],
      [10, 8],
      [12, 8],
      [10, 5],
    ];
    const enc = encodeArea(GK.PITCH_DIRT, 1, { cx: 20, cz: 10, ux: 1, uz: 0, len: 40, wid: 20 }, outer, [hole]);
    const [a] = decodeGroundAreas([JSON.parse(JSON.stringify(enc))]);
    expect(a.kind).toBe(GK.PITCH_DIRT);
    expect(a.param).toBe(1);
    expect(a.rect).toEqual({ cx: 20, cz: 10, ux: 1, uz: 0, hl: 20, hw: 10 });
    expect(Array.from(a.outer)).toEqual([0, 0, 40, 0, 40, 20, 0, 20]);
    expect(a.holes).toHaveLength(1);
    expect(Array.from(a.holes[0])).toEqual([10, 5, 10, 8, 12, 8]);
  });
  it('직사각형이 없는 종류', () => {
    const [a] = decodeGroundAreas([encodeArea(GK.FOREST, 0, null, [[0, 0], [5, 0], [5, 5], [0, 0]], [])]);
    expect(a.rect).toBeNull();
    expect(a.outer.length).toBe(6);
  });
});

describe('마스크 경계를 부드럽게 칠하기', () => {
  const size = 8;
  const at = (m: Uint8Array, x: number, y: number) => m[(y * size + x) * 4];
  it('반쯤 걸친 칸은 반쯤 칠한다', () => {
    const m = new Uint8Array(size * size * 4);
    fillPolygonAA(m, size, [[1, 1, 4.5, 1, 4.5, 6, 1, 6, 1, 1]], 0);
    expect(at(m, 2, 3)).toBe(255);
    expect(at(m, 4, 3)).toBeGreaterThan(100);
    expect(at(m, 4, 3)).toBeLessThan(160);
    expect(at(m, 6, 3)).toBe(0);
  });
  it('이미 칠한 값보다 작게 덮어쓰지 않는다', () => {
    const m = new Uint8Array(size * size * 4);
    m[(3 * size + 4) * 4] = 255;
    fillPolygonAA(m, size, [[1, 1, 4.5, 1, 4.5, 6, 1, 6, 1, 1]], 0);
    expect(at(m, 4, 3)).toBe(255);
  });
  it('굵기 1칸 선은 가운데 칸을 거의 다 칠한다', () => {
    const m = new Uint8Array(size * size * 4);
    strokeLineAA(m, size, [0, 3.5, 8, 3.5], 1, 0);
    expect(at(m, 4, 3)).toBeGreaterThan(200);
    expect(at(m, 4, 1)).toBe(0);
  });
});
