// 건물 태그(OSM·Overture)에서 그리기에 쓰는 용도·층수·지붕 모양·아래쪽 높이를 읽고, board.json 의 숫자 하나로 묶는다.
import { USE, type BuildingInfo } from '../../src/data/board.ts';

const FLOOR = 3.2;
const ROOF: Record<string, number> = { flat: 1, gabled: 2, hipped: 3, pyramidal: 4, skillion: 5, dome: 6, round: 7, half_hipped: 3, gambrel: 2, mansard: 3 };

const USES: [RegExp, number][] = [
  [/^(house|detached|semidetached_house|bungalow|hut|cabin|farm)$/, USE.house],
  [/^(residential|dormitory|terrace)$/, USE.villa],
  [/^apartments$/, USE.apartments],
  [/^(commercial|retail|shop|supermarket|kiosk|warehouse|industrial)$/, USE.commercial],
  [/^(office|hotel)$/, USE.office],
  [/^(school|university|college|kindergarten|public|government|civic|hospital|train_station|fire_station|library|education)$/, USE.civic],
  [/^(church|chapel|cathedral|temple|religious|shrine|mosque)$/, USE.religious],
];

export function buildingInfo(tags: Record<string, string>): BuildingInfo {
  const kind = tags.building ?? tags['building:part'] ?? '';
  let use = USES.find(([re]) => re.test(kind))?.[1] ?? USE.unknown;
  if (use === USE.unknown) {
    if (tags.amenity === 'place_of_worship' || tags.religion) use = USE.religious;
    else if (/^(school|university|college|hospital|library|townhall|police|fire_station|community_centre)$/.test(tags.amenity ?? '')) use = USE.civic;
    else if (tags.shop || /빌딩|타워|플라자|센터|상가|호텔|오피스|빌$/.test(tags.name ?? '')) use = USE.commercial;
  }
  const lv = Math.round(parseFloat(tags['building:levels'] ?? ''));
  const mh = parseFloat(tags.min_height ?? '');
  const ml = parseFloat(tags['building:min_level'] ?? '');
  return {
    use,
    levels: lv > 0 ? Math.min(127, lv) : 0,
    roof: ROOF[tags['roof:shape'] ?? ''] ?? 0,
    minH: mh > 0 ? mh : ml > 0 ? Math.round(ml * FLOOR * 10) / 10 : 0,
  };
}

/** 용도(3비트) + 층수(7비트) + 지붕(3비트) + 아래 높이(dm). 풀기는 src/data/board.ts 의 unpackInfo */
export function packInfo(i: BuildingInfo): number {
  return i.use + i.levels * 8 + i.roof * 1024 + Math.round(i.minH * 10) * 8192;
}
