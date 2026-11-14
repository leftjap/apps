// 단위 테스트: deno test --allow-env mapo/supabase/functions/mapo-subway/index_test.ts (저장소 루트에서)
import { assertEquals } from 'jsr:@std/assert@1';
import { trim } from './index.ts';

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
