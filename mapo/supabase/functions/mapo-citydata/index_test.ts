// 단위 테스트: deno test --allow-env mapo/supabase/functions/mapo-citydata/index_test.ts (저장소 루트에서)
import { assertEquals } from 'jsr:@std/assert@1';
import { trim } from './index.ts';

// 실시간 도시데이터 응답과 같은 모양의 작은 가짜 응답(값은 지어낸 것)
const fake = {
  CITYDATA: {
    AREA_NM: '연남동',
    LIVE_PPLTN_STTS: [
      {
        AREA_CONGEST_LVL: '붐빔',
        AREA_PPLTN_MIN: '20000',
        AREA_PPLTN_MAX: '22000',
        FEMALE_PPLTN_RATE: '58.0',
        PPLTN_RATE_0: '1.0',
        PPLTN_RATE_10: '9.0',
        PPLTN_RATE_20: '40.0',
        PPLTN_RATE_30: '20.0',
        PPLTN_RATE_40: '12.0',
        PPLTN_RATE_50: '9.0',
        PPLTN_RATE_60: '6.0',
        PPLTN_RATE_70: '3.0',
        PPLTN_TIME: '2026-11-14 21:50',
      },
    ],
    ROAD_TRAFFIC_STTS: {
      AVG_ROAD_DATA: { ROAD_TRAFFIC_TIME: '2026-11-14 22:20' },
      ROAD_TRAFFIC_STTS: [
        // 좌표열이 도착 노드부터 적혀 있어도 출발 노드부터로 뒤집는다
        { LINK_ID: 'L1', IDX: '정체', SPD: 8, START_ND_XY: '126.9200_37.5550', END_ND_XY: '126.9210_37.5550', XYLIST: '126.9210_37.5550|126.9205_37.5550|126.9200_37.5550' },
        { LINK_ID: 'L2', IDX: '원활', SPD: 31, START_ND_XY: '126.9210_37.5550', END_ND_XY: '126.9200_37.5550', XYLIST: '126.9210_37.5550|126.9200_37.5550' },
      ],
    },
  },
};

Deno.test('장소 인구와 도로 구간을 화면에 필요한 값만 추린다', () => {
  const t = trim(fake);
  assertEquals(t.place, { name: '연남동', level: '붐빔', min: 20000, max: 22000, ages: [1, 9, 40, 20, 12, 9, 6, 3], female: 58, time: '2026-11-14 21:50' });
  assertEquals(t.roadTime, '2026-11-14 22:20');
  assertEquals(t.roads.length, 2);
  assertEquals(t.roads[0], { id: 'L1', idx: '정체', spd: 8, xy: [[126.92, 37.555], [126.9205, 37.555], [126.921, 37.555]] });
  assertEquals(t.roads[1].xy, [[126.921, 37.555], [126.92, 37.555]]);
});

Deno.test('응답에 장소 자료가 없으면 null', () => {
  assertEquals(trim({ RESULT: { CODE: 'INFO-200' } }).place, null);
});
