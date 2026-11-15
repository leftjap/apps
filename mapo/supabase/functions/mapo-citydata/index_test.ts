// 단위 테스트: deno test --allow-env mapo/supabase/functions/mapo-citydata/index_test.ts (저장소 루트에서)
import { assertEquals } from 'jsr:@std/assert@1';
import { tmToLonLat, trim, trimAcc } from './index.ts';

// 실시간 도시데이터 응답과 같은 모양의 작은 가짜 응답(값은 지어낸 것)
const fake = {
  CITYDATA: {
    AREA_NM: '연남동',
    WEATHER_STTS: [{ WEATHER_TIME: '2026-11-15 04:00', PRECIPITATION: '1.5', PRECPT_TYPE: '비', TEMP: '9.0', PM10: '59', PM10_INDEX: '보통', PM25: '45', PM25_INDEX: '나쁨' }],
    ACDNT_CNTRL_STTS: [
      { ACDNT_OCCR_DT: '2026-11-15 21:10', EXP_CLR_DT: '2026-11-15 23:00', ACDNT_TYPE: '공사', ACDNT_DTYPE: '도로보수', ACDNT_INFO: '양화로 1개 차로 통제', ACDNT_X: '126.9235', ACDNT_Y: '37.5560' },
    ],
    EVENT_STTS: [{ EVENT_NM: '연남 골목 축제', EVENT_PERIOD: '2026-11-14~2026-11-16', EVENT_PLACE: '연트럴파크', EVENT_X: 126.925, EVENT_Y: 37.562, URL: 'https://example.org/e' }],
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

Deno.test('날씨는 강수 형태와 1시간 강수량만 추린다(없으면 null)', () => {
  assertEquals(trim(fake).weather, { type: '비', mm: '1.5', time: '2026-11-15 04:00' });
  assertEquals(trim({ CITYDATA: { AREA_NM: '연남동' } }).weather, null);
});

Deno.test('대기질·사고통제·문화행사를 추린다', () => {
  const t = trim(fake);
  assertEquals(t.air, { pm10: 59, pm10Idx: '보통', pm25: 45, pm25Idx: '나쁨', time: '2026-11-15 04:00' });
  assertEquals(t.accidents, [{ id: 'c:126.9235,37.5560,2026-11-15 21:10', src: 'city', kind: '공사', detail: '도로보수', info: '양화로 1개 차로 통제', start: '2026-11-15 21:10', end: '2026-11-15 23:00', lon: 126.9235, lat: 37.556 }]);
  assertEquals(t.events, [{ name: '연남 골목 축제', period: '2026-11-14~2026-11-16', place: '연트럴파크', lon: 126.925, lat: 37.562, area: '연남동' }]);
  const none = trim({ CITYDATA: { AREA_NM: '연남동' } });
  assertEquals([none.air, none.accidents, none.events], [null, [], []]);
});

Deno.test('GRS80 중부원점 TM(원점 북 500000) 좌표를 경위도로 바꾼다', () => {
  const [lon, lat] = tmToLonLat(206076.7132692197, 446245.6950463236);
  assertEquals([Math.round(lon * 1e5) / 1e5, Math.round(lat * 1e5) / 1e5], [127.06874, 37.51567]);
});

Deno.test('TOPIS 돌발정보 XML 에서 판 둘레(반경 2.3km)만 골라 유형 이름·시각·경위도로 추린다', () => {
  const xml =
    '<AccInfo><RESULT><CODE>INFO-000</CODE></RESULT>' +
    // 판 안(합정 둘레): 경위도 (126.9061, 37.5585) 쯤
    '<row><acc_id>1</acc_id><occr_date>20261115</occr_date><occr_time>2110</occr_time><exp_clr_date>20261116</exp_clr_date><exp_clr_time>060000</exp_clr_time><acc_type>A04</acc_type><acc_dtype>04B01</acc_dtype><link_id>1210001000</link_id><grs80tm_x>191700.0</grs80tm_x><grs80tm_y>451000.0</grs80tm_y><acc_info>도로 보수&#13;- 1개 차로 통제</acc_info><acc_road_code>009</acc_road_code></row>' +
    // 판 밖(봉은교)
    '<row><acc_id>2</acc_id><occr_date>20260407</occr_date><occr_time>1000</occr_time><exp_clr_date>20270301</exp_clr_date><exp_clr_time>000000</exp_clr_time><acc_type>A04</acc_type><acc_dtype>04B01</acc_dtype><link_id>1220031600</link_id><grs80tm_x>206076.7</grs80tm_x><grs80tm_y>446245.7</grs80tm_y><acc_info>봉은교</acc_info><acc_road_code>009</acc_road_code></row>' +
    '</AccInfo>';
  const t = trimAcc(xml, { A04: '공사' }, { '04B01': '도로보수' });
  assertEquals(t?.length, 1);
  assertEquals({ ...t![0], lon: Math.round(t![0].lon * 1e4) / 1e4, lat: Math.round(t![0].lat * 1e4) / 1e4 }, {
    id: 't:1',
    src: 'topis',
    kind: '공사',
    detail: '도로보수',
    info: '도로 보수 - 1개 차로 통제',
    start: '2026-11-15 21:10',
    end: '2026-11-16 06:00',
    lon: 126.9061,
    lat: 37.5585,
    link: '1210001000',
  });
  assertEquals(trimAcc('<RESULT><CODE>ERROR-500</CODE></RESULT>', {}, {}), null);
  assertEquals(trimAcc('<AccInfo><RESULT><CODE>INFO-200</CODE><MESSAGE>해당하는 데이터가 없습니다.</MESSAGE></RESULT></AccInfo>', {}, {}), []);
});
