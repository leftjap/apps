// 건물 태그 → 용도·층수·지붕·아래 높이, 그리고 board.json 의 한 숫자로 묶고 푸는 것
import { describe, expect, it } from 'vitest';
import { buildingInfo, packInfo } from '../tools/lib/building.ts';
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
