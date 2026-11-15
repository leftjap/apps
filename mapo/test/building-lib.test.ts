// 건물 태그 → 용도·층수·지붕·아래 높이, 그리고 board.json 의 한 숫자로 묶고 푸는 것
import { describe, expect, it } from 'vitest';
import { attachShops, buildingInfo, gableGuess, packInfo, pickTitle, rectFootprint, titleTags, type Title } from '../tools/lib/building.ts';
import { unpackInfo, USE } from '../src/data/board.ts';

describe('건물 태그 읽기', () => {
  it('용도', () => {
    expect(buildingInfo({ building: 'house' }).use).toBe(USE.house);
    expect(buildingInfo({ building: 'residential' }).use).toBe(USE.villa);
    expect(buildingInfo({ building: 'apartments' }).use).toBe(USE.apartments);
    expect(buildingInfo({ building: 'retail' }).use).toBe(USE.commercial);
    expect(buildingInfo({ building: 'hotel' }).use).toBe(USE.office);
    expect(buildingInfo({ building: 'university' }).use).toBe(USE.civic);
    expect(buildingInfo({ building: 'church' }).use).toBe(USE.religious);
    expect(buildingInfo({ building: 'yes', name: '세리빌딩' }).use).toBe(USE.commercial);
    expect(buildingInfo({ building: 'yes', amenity: 'place_of_worship' }).use).toBe(USE.religious);
    expect(buildingInfo({ building: 'yes' }).use).toBe(USE.unknown);
  });
  it('층수·지붕·아래 높이', () => {
    const a = buildingInfo({ 'building:part': 'yes', 'building:levels': '10', 'building:min_level': '6', min_height: '20', 'roof:shape': 'gabled' });
    expect(a).toMatchObject({ levels: 10, roof: 2, minH: 20 });
    expect(buildingInfo({ 'building:min_level': '3' }).minH).toBeCloseTo(9.6);
    expect(buildingInfo({ 'roof:shape': 'hipped' }).roof).toBe(3);
    expect(buildingInfo({ 'roof:shape': 'flat' }).roof).toBe(1);
  });
  it('한 숫자로 묶었다 풀면 같다', () => {
    const info = { use: USE.office, levels: 39, roof: 4, minH: 20.3 };
    expect(unpackInfo(packInfo(info))).toEqual(info);
    expect(unpackInfo(0)).toEqual({ use: 0, levels: 0, roof: 0, minH: 0 });
  });
});

describe('건축물대장 표제부 → 건물 태그', () => {
  const t = (o: Partial<Title>): Title => ({ use: '', etc: '', floors: 0, height: 0, area: 0, households: 0, families: 0, dong: '', ...o });
  it('주용도로 외벽 종류를 고른다', () => {
    const use = (o: Partial<Title>) => buildingInfo(titleTags(t(o))).use;
    expect(use({ use: '단독주택', etc: '단독주택', floors: 2 })).toBe(USE.house);
    expect(use({ use: '단독주택', etc: '다가구주택', floors: 4, families: 8 })).toBe(USE.villa);
    expect(use({ use: '공동주택', etc: '다세대주택', floors: 4 })).toBe(USE.villa);
    expect(use({ use: '공동주택', etc: '아파트', floors: 15 })).toBe(USE.apartments);
    expect(use({ use: '제2종근린생활시설', floors: 5 })).toBe(USE.commercial);
    expect(use({ use: '업무시설', floors: 12 })).toBe(USE.office);
    expect(use({ use: '숙박시설', floors: 8 })).toBe(USE.office);
    expect(use({ use: '교육연구시설', floors: 4 })).toBe(USE.civic);
    expect(use({ use: '종교시설', floors: 3 })).toBe(USE.religious);
  });
  it('층수와 높이: 높이가 층수에 견줘 그럴듯할 때만 쓴다', () => {
    expect(titleTags(t({ use: '업무시설', floors: 10, height: 38.5 }))).toMatchObject({ 'building:levels': '10', height: '38.5' });
    expect(titleTags(t({ use: '업무시설', floors: 10, height: 0 })).height).toBeUndefined();
    expect(titleTags(t({ use: '업무시설', floors: 3, height: 95 })).height).toBeUndefined();
  });
  it('한 주소에 동이 여럿이면 이름이 같은 동, 없으면 건축면적이 바닥 면적에 가장 가까운 동', () => {
    const list = [t({ dong: '101동', area: 600, floors: 15 }), t({ dong: '상가동', area: 300, floors: 2 })];
    expect(pickTitle(list, 320, '').floors).toBe(2);
    expect(pickTitle(list, 320, '101동').floors).toBe(15);
  });
});

describe('외곽선이 없는 건물의 바닥', () => {
  it('가운데·넓이·방향으로 직사각형을 만든다', () => {
    const r = rectFootprint(10, 20, 120, 1, 0, 1.2);
    let a = 0;
    for (let i = 0; i < 4; i++) a += r[i][0] * r[(i + 1) % 4][1] - r[(i + 1) % 4][0] * r[i][1];
    expect(Math.abs(a / 2)).toBeCloseTo(120, 3);
    expect(r.reduce((s, p) => s + p[0], 0) / 4).toBeCloseTo(10, 5);
    expect(r.reduce((s, p) => s + p[1], 0) / 4).toBeCloseTo(20, 5);
    expect(a).toBeGreaterThan(0); // 판의 다른 외곽선과 같은 방향(넓이 양수)
    expect(Math.hypot(r[1][0] - r[0][0], r[1][1] - r[0][1]) / Math.hypot(r[2][0] - r[1][0], r[2][1] - r[1][1])).toBeCloseTo(1.2, 3);
  });
});

describe('가게를 건물에 붙이기', () => {
  const sq = (x: number, z: number, w: number): [number, number][] => [[x, z], [x + w, z], [x + w, z + w], [x, z + w]];
  it('외곽선 안이면 그 건물, 밖이면 12m 안 가장 가까운 건물, 더 멀면 버린다. 1층·지하와 2층 위를 나눠 가장 많은 종류, 층 표시, 수', () => {
    const fps = [sq(0, 0, 10), sq(30, 0, 10)];
    // [x, z, 종류, 층(−1 지하, 1, 2, 3...)]
    const got = attachShops([[5, 5, 2, 1], [5, 6, 2, 1], [4, 4, 3, -1], [6, 6, 1, 2], [45, 5, 5, 3], [70, 5, 2, 1]], fps, 12);
    // 1층·지하: 식당 2·주점 1 → 식당, 2층 카페, 층 표시 지하1 + 1층2 + 2층4
    expect(got.get(0)).toEqual({ kind: 2, up: 1, mask: 7, n: 4 });
    // 3층 병원만: 1층 가게 없음
    expect(got.get(1)).toEqual({ kind: 0, up: 5, mask: 8, n: 1 });
    expect(got.size).toBe(2);
  });
});

describe('오래된 저층 단독주택 박공 지붕', () => {
  it('지붕 태그가 없고 1990년 전에 지은 2층 이하 단독주택 일부(60%)에만 박공을 얹고, 태그가 있으면 그대로 둔다', () => {
    const n = Array.from({ length: 200 }, (_, id) => gableGuess({ building: 'house', 'building:levels': '2' }, 1984, id)['roof:shape']).filter((r) => r === 'gabled').length;
    expect(n).toBeGreaterThan(90);
    expect(n).toBeLessThan(150);
    expect(gableGuess({ building: 'house', 'building:levels': '2' }, 2004, 1)['roof:shape']).toBeUndefined();
    expect(gableGuess({ building: 'house', 'building:levels': '3' }, 1980, 1)['roof:shape']).toBeUndefined();
    expect(gableGuess({ building: 'residential', 'building:levels': '2' }, 1980, 1)['roof:shape']).toBeUndefined();
    expect(gableGuess({ building: 'house', 'roof:shape': 'flat' }, 1975, 1)['roof:shape']).toBe('flat');
    expect(gableGuess({ building: 'house' }, 0, 1)['roof:shape']).toBeUndefined();
  });
});
