// 단위 테스트: deno test --allow-env mapo/supabase/functions/mapo-subway/index_test.ts (저장소 루트에서)
import { assertEquals } from 'jsr:@std/assert@1';
import { trim, trimArrivals } from './index.ts';

// 실시간 열차 위치 응답과 같은 모양의 작은 가짜 응답(값은 지어낸 것)
const fake = {
  errorMessage: { code: 'INFO-000', message: '정상 처리되었습니다.' },
  realtimePositionList: [
    { statnNm: '홍대입구', updnLine: '0', trainSttus: '1', trainNo: '2101', recptnDt: '2026-11-14 23:01:55' },
    { statnNm: '신촌', updnLine: '1', trainSttus: '0', trainNo: '2102', recptnDt: '2026-11-14 23:02:00' },
    { statnNm: '강남', updnLine: '0', trainSttus: '2', trainNo: '2200', recptnDt: '2026-11-14 23:02:01' },
  ],
};

Deno.test('판 둘레 역에 있는 열차만 골라 노선·번호·역·방향·상태·받은 시각(epoch ms)으로 추린다', () => {
  const t = trim('2', fake);
  assertEquals(t, [
    { line: '2', no: '2101', stn: '홍대입구', updn: '0', st: '1', rcv: Date.parse('2026-11-14T23:01:55+09:00') },
    { line: '2', no: '2102', stn: '신촌', updn: '1', st: '0', rcv: Date.parse('2026-11-14T23:02:00+09:00') },
  ]);
});

Deno.test('역 이름의 괄호는 떼고 고른다', () => {
  const t = trim('6', { realtimePositionList: [{ statnNm: '대흥(서강대앞)', updnLine: '0', trainSttus: '2', trainNo: '6234', recptnDt: '2026-11-14 23:02:19' }] });
  assertEquals(t?.[0].stn, '대흥');
});

Deno.test('오류 응답(일일 한도 초과 등)이면 null', () => {
  assertEquals(trim('2', { status: 500, code: 'ERROR-337', message: '일일트래픽 초과' }), null);
});

Deno.test('공식 역 도착 정보는 판 안 역의 네 노선만 골라 상하행을 열차 위치와 같은 코드로 바꿔 추린다', () => {
  const raw = {
    realtimeArrivalList: [
      { subwayId: '1002', statnNm: '홍대입구', updnLine: '외선', arvlCd: '99', barvlDt: '240', arvlMsg2: '4분 후', arvlMsg3: '아현', ordkey: '02000홍대입구0', btrainNo: '2201', recptnDt: '2026-11-15 05:35:10.0' },
      { subwayId: '1063', statnNm: '홍대입구', updnLine: '상행', arvlCd: '99', barvlDt: '0', arvlMsg2: '[10]번째 전역 (왕십리)', arvlMsg3: '왕십리', ordkey: '01010왕십리0', btrainNo: 'K1', recptnDt: '2026-11-15 05:35:00' },
      { subwayId: '1002', statnNm: '강남', updnLine: '내선', arvlCd: '1', barvlDt: '0', arvlMsg2: '강남 도착', arvlMsg3: '강남', ordkey: '01000강남0', btrainNo: '2300', recptnDt: '2026-11-15 05:35:00' },
      { subwayId: '1009', statnNm: '합정', updnLine: '상행', arvlCd: '1', barvlDt: '0', arvlMsg2: '합정 도착', arvlMsg3: '합정', ordkey: '01000', btrainNo: '9', recptnDt: '2026-11-15 05:35:00' },
    ],
  };
  assertEquals(trimArrivals(raw), [
    { line: '2', stn: '홍대입구', updn: '1', cd: '99', sec: 240, msg: '4분 후', cur: '아현', ord: '02000홍대입구0', no: '2201', rcv: Date.parse('2026-11-15T05:35:10+09:00') },
    { line: 'K', stn: '홍대입구', updn: '0', cd: '99', sec: 0, msg: '[10]번째 전역 (왕십리)', cur: '왕십리', ord: '01010왕십리0', no: 'K1', rcv: Date.parse('2026-11-15T05:35:00+09:00') },
  ]);
  assertEquals(trimArrivals({ status: 500, code: 'ERROR-337' }), null);
  // 공항철도는 열차 위치의 상하행 코드가 거꾸로다(같은 열차 번호로 맞춰 봄: 상행 A2107 이 위치에서는 1)
  const a = trimArrivals({ realtimeArrivalList: [{ subwayId: '1065', statnNm: '홍대입구', updnLine: '상행', arvlCd: '2', barvlDt: '0', arvlMsg2: '홍대입구 출발', arvlMsg3: '홍대입구', ordkey: '01000', btrainNo: 'A2107', recptnDt: '2026-11-15 12:39:00' }] });
  assertEquals(a?.[0].updn, '1');
});
