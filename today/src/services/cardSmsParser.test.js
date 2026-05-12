import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseCardSms } from './cardSmsParser.js';

const FIXTURE_DIR = join(process.env.HOME, 'apps/today/audit/sms-fixtures/by-bucket');

/** fixture 디렉토리에서 (card, kind) 버킷별 SMS 본문 배열을 로드. */
function loadBucket(card, kind) {
  const path = join(FIXTURE_DIR, `${card}__${kind}.jsonl`);
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

describe('parseCardSms — 단위 케이스 (인라인)', () => {
  it('rejected: 거절', () => expect(parseCardSms('[Web발신]\n삼성1337거절\n5,000원\n10/01 12:00 가맹점')).toBeNull());
  it('rejected: 취소', () => expect(parseCardSms('[Web발신]\n삼성1337취소\n5,000원')).toBeNull());
  it('rejected: 문자명세서', () => expect(parseCardSms('[Web발신]\n고*진님\n04월 문자명세서 보기')).toBeNull());
  it('rejected: 일반 결제예정', () => expect(parseCardSms('[Web발신]\n삼성카드 결제예정 5,000원')).toBeNull());
  it('rejected: 광고 SMS', () => expect(parseCardSms('[Web발신]\n(광고)[KB국민카드]\n스타샵 할인정보 5만원 이상 결제 시 할인!')).toBeNull());
  it('rejected: 안내 라벨', () => expect(parseCardSms('[Web발신]\n[KB국민카드, 이용한도 조정안내]\n100,000원 한도 안내드립니다')).toBeNull());
  it('rejected: 차단 신청 안내', () => expect(parseCardSms('[Web발신]\n[삼성카드] 해외원화거래 차단 신청은 1588-8700')).toBeNull());
  it('rejected: 비밀번호 변경 완료', () => expect(parseCardSms('[Web발신]\n[KB국민카드] 고세진님 웹비밀번호 변경이 완료되었습니다.')).toBeNull());
  it('rejected: 0원 외화 사전승인', () => {
    expect(parseCardSms('[Web발신]\n삼성1337해외승인 고*진\nUSD 0.00\n08/29 01:32 SUBSTACKINC.')).toBeNull();
    expect(parseCardSms('[Web발신]\n삼성1337해외승인 고*진\nKRW 0\n04/15 20:59 QUIZLET')).toBeNull();
  });
  it('rejected: domestic-shape 광고 (시간 패턴 부재)', () => {
    // 광고/안내문에 "X원" + "승인" 같은 키워드가 우연히 들어가도 시간 패턴 없으면 reject
    expect(parseCardSms('[KB국민카드] 50,000원 이상 결제 시 5,000원 캐시백! 승인 즉시 적립됩니다')).toBeNull();
  });
  it('빈 입력 / 잘못된 타입', () => {
    expect(parseCardSms('')).toBeNull();
    expect(parseCardSms(null)).toBeNull();
    expect(parseCardSms(undefined)).toBeNull();
    expect(parseCardSms(123)).toBeNull();
  });

  it('domestic: 삼성 일시불 — 사진 샘플', () => {
    const r = parseCardSms('[Web발신]\n삼성1337승인 고*진\n16,900원 일시불\n05/02 21:41 주식회사우아\n누적3,046,279원');
    expect(r).toEqual({ kind: 'domestic', amount_krw: 16900, merchant_raw: '주식회사우아', card: '삼성1337' });
  });

  it('overseas: KB 7007 사진 샘플 — 13.19(USD)', () => {
    const r = parseCardSms('[Web발신]\nKB국민카드7007 해외승인\n고*진님\n13.19(USD) 04/01 22:44\n싱가  Google Dig');
    expect(r.kind).toBe('overseas');
    expect(r.foreign_amount).toBe(13.19);
    expect(r.currency).toBe('USD');
    expect(r.amount_krw).toBe(Math.round(13.19 * 1350));
    expect(r.card).toBe('KB국민카드7007');
    expect(r.merchant_raw).toMatch(/Google Dig/);
  });

  it('overseas: 삼성 USD 22.00 전치', () => {
    const r = parseCardSms('[Web발신]\n삼성1337해외승인 고*진\nUSD 22.00\n03/25 23:32 OPENAIOPCO,LLC');
    expect(r.kind).toBe('overseas');
    expect(r.foreign_amount).toBe(22);
    expect(r.currency).toBe('USD');
    expect(r.merchant_raw).toBe('OPENAIOPCO,LLC');
  });

  it('installment: 16개월 할부', () => {
    const r = parseCardSms('[Web발신]\n삼성1337승인 고*진\n2,754,000원 16개월\n10/29 18:53 쿠팡\n누적4,428,190원');
    expect(r).toEqual({
      kind: 'installment', amount_krw: 2754000, installment_months: 16,
      merchant_raw: '쿠팡', card: '삼성1337',
    });
  });

  it('auto: 자동결제 — 대괄호 카드 표기 정규화', () => {
    const r = parseCardSms('[삼성카드]1337 자동결제 03/19접수\nSK통신료(491949)\n38,000원');
    expect(r.kind).toBe('auto');
    expect(r.amount_krw).toBe(38000);
    expect(r.card).toBe('삼성1337'); // [삼성카드] / 삼성 모두 '삼성1337' 로 통일
  });

  it('scheduled_hipass: KB 후불하이패스 결제예정 — 사진 샘플', () => {
    const r = parseCardSms('[Web발신]\nKB국민카드 후불하이패스\n8건 21,400원\n04/01 결제예정');
    expect(r).toEqual({
      kind: 'scheduled_hipass', amount_krw: 21400, merchant_raw: '하이패스',
      card: 'KB국민카드 후불하이패스',
    });
  });

  it('transit: 후불교통 월정산 (사용합계)', () => {
    const r = parseCardSms('[Web발신]\n[삼성카드]3716\n05월분 후불교통\n(버스+지하철+통행료)\n사용합계 900원');
    expect(r.kind).toBe('transit');
    expect(r.amount_krw).toBe(900);
    expect(r.merchant_raw).toBe('후불교통');
  });
  it('transit: 후불교통 월접수 변형 (합계 단독, 카드 정규화)', () => {
    const r = parseCardSms('[Web발신]\n[삼성카드]1337\n09월접수 후불교통\n(버스+지하철+통행료)\n합계 10,300원');
    expect(r.kind).toBe('transit');
    expect(r.amount_krw).toBe(10300);
    expect(r.card).toBe('삼성1337');
  });
});

// ─── Fixture-driven 회귀 테스트 (audit/sms-fixtures 의 실제 SMS) ───
describe('parseCardSms — fixture 회귀', () => {
  const buckets = [
    { card: 'samsung_1337', kind: 'domestic' },
    { card: 'samsung_1337', kind: 'overseas' },
    { card: 'samsung_1337', kind: 'installment' },
    { card: 'samsung_1337', kind: 'auto' },
    { card: 'samsung_1337', kind: 'rejected' },
    { card: 'kb_7007', kind: 'domestic' },
    { card: 'kb_7007', kind: 'overseas' },
    { card: 'kb_7007', kind: 'rejected' },
    { card: 'kb_7007', kind: 'scheduled_hipass' },
    { card: 'cards', kind: 'ad' },     // (광고) 패턴 — null 기대
    { card: 'cards', kind: 'notice' }, // 안내문 — null 기대
  ];

  // ad/notice 는 expected_kind 가 'rejected' 와 동일 (null)
  const REJECT_KINDS = new Set(['rejected', 'ad', 'notice']);

  for (const { card, kind } of buckets) {
    const items = loadBucket(card, kind);
    if (items.length === 0) {
      it.skip(`${card}/${kind} — fixture 없음 (audit 디렉토리 누락)`, () => {});
      continue;
    }
    it(`${card}/${kind} — ${items.length}건 모두 expected_kind 일치`, () => {
      for (const item of items) {
        const result = parseCardSms(item.text);
        if (REJECT_KINDS.has(kind)) {
          expect(result, `본문: ${item.text.slice(0, 60)}`).toBeNull();
        } else {
          expect(result, `본문: ${item.text.slice(0, 60)}`).not.toBeNull();
          expect(result.kind, `본문: ${item.text.slice(0, 60)}`).toBe(kind);
          expect(result.amount_krw).toBeGreaterThan(0);
        }
      }
    });
  }
});

