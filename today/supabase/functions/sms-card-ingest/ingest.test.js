import { describe, expect, it } from 'vitest';
import { planSmsIngest, validateIngestBody } from './ingest.js';

// Synthetic messages only. No real transaction data belongs in this public repo.
const payment = (minute = '34', cumulative = '') => `삼성1595승인 테*트\n8,200원 일시불\n10/01 12:${minute} 테스트상점${cumulative}`;
const cancellation = '삼성1595취소 테*트\n8,200원 일시불\n10/02 13:00 테스트상점';
const base = { owner_id: 'owner-a', received_at: '2026-10-01T03:35:21Z', now: '2026-10-18T12:00:00Z' };
const plan = (text = payment(), extras = {}) => planSmsIngest({ ...base, text, existing: [], ...extras });
const original = {
  id: 'original', owner_id: 'owner-a', source: 'sms', card: '삼성1595',
  amount_krw: 8200, merchant_raw: '테스트상점', merchant: '사용자가 고친 가맹점',
  brand: '사용자 브랜드', category: 'food', sms_raw: payment(),
  spent_at: '2026-10-01T03:35:21Z', received_at: '2026-10-01T03:35:21Z', meta: { sms_kind: 'domestic' },
};

describe('SMS ingestion decisions', () => {
  it('uses the transaction time in Korea rather than the shortcut runtime', async () => {
    const result = await plan();
    expect(result.status).toBe('ok');
    expect(result.row.spent_at).toBe('2026-10-01T03:34:00.000Z');
    expect(result.row.received_at).toBe('2026-10-01T03:35:21.000Z');
    expect(result.row.meta).toMatchObject({ ingest_channel: 'live', ingested_at: base.now, sms_kind: 'domestic' });
  });

  it('keeps hipass bills on the received date rather than moving a future due date into last year', async () => {
    const text = 'KB국민카드 후불하이패스\n8건 21,400원\n04/01 결제예정';
    const result = await plan(text, { received_at: '2026-03-28T00:00:00Z' });
    expect(result).toMatchObject({ status: 'ok', row: {
      spent_at: '2026-03-28T00:00:00.000Z', amount_krw: 21400, meta: { sms_kind: 'scheduled_hipass' },
    } });
    const replay = await plan(text, { received_at: '2026-04-02T00:00:00Z' });
    expect(replay.row.id).toBe(result.row.id);
  });

  it('keeps a New Year hipass bill identity stable before and after its due date', async () => {
    const text = 'KB국민카드 후불하이패스\n8건 21,400원\n01/01 결제예정';
    const first = await plan(text, { received_at: '2026-12-28T00:00:00Z' });
    const replay = await plan(text, { received_at: '2027-01-02T00:00:00Z' });
    expect(first.row.spent_at).toBe('2026-12-28T00:00:00.000Z');
    expect(replay.row.id).toBe(first.row.id);
    expect(await plan(text, { received_at: '2027-01-02T00:00:00Z', existing: [first.row] }))
      .toMatchObject({ status: 'duplicate', expense_id: first.row.id });
  });

  it('ingests KB debit usage with its original time and deduplicates recovery', async () => {
    const text = 'KB국민체크(1303)\n테*트님\n07/30 17:42\n18,000원\n테스트점 사용';
    const first = await plan(text, { received_at: '2026-07-30T08:42:30Z', ingest_channel: 'backfill' });
    expect(first).toMatchObject({ status: 'ok', row: {
      amount_krw: 18000, card: 'KB국민체크1303', merchant: '테스트점', spent_at: '2026-07-30T08:42:00.000Z',
    } });
    expect(await plan(text.replace(/\n/g, '\r\n'), { received_at: '2026-10-18T00:00:00Z', existing: [first.row], ingest_channel: 'backfill' }))
      .toMatchObject({ status: 'duplicate', expense_id: first.row.id });
  });

  it('gives replayed text the same UUID despite line endings and receive times', async () => {
    const a = await plan();
    const b = await plan(`[Web발신]\r\n${payment().replace(/\n/g, '\r\n')}\r\n`, { received_at: '2026-10-03T09:00:00Z' });
    expect(a.row.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(b.row.id).toBe(a.row.id);
    expect((await plan(payment(), { owner_id: 'owner-b' })).row.id).not.toBe(a.row.id);
  });

  it('keeps distinct same-day payments separate, including same-minute different cumulative balances', async () => {
    const a = await plan();
    expect((await plan(payment('35'))).row.id).not.toBe(a.row.id);
    const b = await plan(payment('34', '\n누적10,000원'));
    expect((await plan(payment('34', '\n누적18,200원'))).row.id).not.toBe(b.row.id);
  });

  it('preserves legacy manual changes and tombstones on a canonical-text replay', async () => {
    const edited = { ...original, amount_krw: 9000, spent_at: '2026-09-30T00:00:00Z', deleted_at: '2026-10-02T00:00:00Z' };
    const snapshot = structuredClone(edited);
    const result = await plan(`[Web발신]\r\n${payment().replace(/\n/g, '\r\n')}`, { received_at: '2026-10-04T00:00:00Z', existing: [edited] });
    expect(result).toMatchObject({ status: 'duplicate', expense_id: 'original', deleted: true });
    expect(result.row).toBeUndefined();
    expect(edited).toEqual(snapshot);
  });

  it('does not use a different owner row for deduplication', async () => {
    expect((await plan(payment(), { existing: [{ ...original, owner_id: 'owner-b' }] })).status).toBe('ok');
  });

  it('infers the previous year across New Year and keeps the same date in delayed January replays', async () => {
    const text = payment().replace('10/01', '12/31');
    const result = await plan(text, { received_at: '2027-01-01T00:00:00Z' });
    expect(result.row.spent_at).toBe('2026-12-31T03:34:00.000Z');
    expect((await plan(text, { received_at: '2027-01-04T00:00:00Z' })).row.id).toBe(result.row.id);
  });

  it('does not move January transactions into next year when replayed in October', async () => {
    const text = payment().replace('10/01', '01/15');
    const first = await plan(text, { received_at: '2026-01-15T03:35:00Z' });
    const delayed = await plan(text, { received_at: '2026-10-18T03:35:00Z' });
    expect(delayed.row.spent_at).toBe('2026-01-15T03:34:00.000Z');
    expect(delayed.row.id).toBe(first.row.id);
  });

  it('holds impossible message dates instead of silently assigning today', async () => {
    expect(await plan(payment().replace('10/01', '02/30'))).toMatchObject({ status: 'review', reason: 'invalid_message_date', row: { amount_krw: null } });
  });

  it('marks historical imports and keeps the original receive timestamp', async () => {
    const result = await plan(payment(), { ingest_channel: 'backfill' });
    expect(result.row.meta.ingest_channel).toBe('backfill');
    expect(result.row.received_at).toBe('2026-10-01T03:35:21.000Z');
  });

  it('keeps message contents out of event metadata while preserving replay identity', async () => {
    const first = await plan();
    expect(JSON.stringify(first.row.meta)).not.toContain('테스트상점');
    expect(first.row.meta.sms_event_key).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('turns only a uniquely matched full domestic cancellation into a negative adjustment', async () => {
    const result = await plan(cancellation, { existing: [original], received_at: '2026-10-02T04:00:10Z' });
    expect(result).toMatchObject({ status: 'ok', matched_expense_id: 'original', row: {
      amount_krw: -8200, merchant: '사용자가 고친 가맹점', category: 'food', brand: '사용자 브랜드',
      spent_at: '2026-10-02T04:00:00.000Z', meta: { sms_kind: 'cancellation', cancelled_expense_id: 'original' },
    } });
    expect(original.amount_krw).toBe(8200);
  });

  it.each([
    ['unmatched', [], 'original_not_found'],
    ['ambiguous', [original, { ...original, id: 'second', sms_raw: payment('35') }], 'ambiguous_original'],
    ['deleted', [{ ...original, deleted_at: '2026-10-02T00:00:00Z' }], 'original_deleted'],
    ['manually changed amount', [{ ...original, amount_krw: 9000 }], 'original_amount_changed'],
    ['other owner', [{ ...original, owner_id: 'owner-b' }], 'original_not_found'],
  ])('holds %s cancellations without reducing totals', async (_, existing, reason) => {
    expect(await plan(cancellation, { existing, received_at: '2026-10-02T04:00:10Z' })).toMatchObject({
      status: 'review', reason, row: { amount_krw: null, meta: { review_reason: reason } },
    });
  });

  it('holds partial and foreign cancellations even if a matching original exists', async () => {
    expect(await plan(cancellation.replace('취소', '부분취소'), { existing: [original] })).toMatchObject({ status: 'review', reason: 'partial_cancellation', row: { amount_krw: null } });
    expect(await plan('삼성1595해외승인취소 테*트\nUSD 10.00\n10/02 13:00 TEST SHOP', { existing: [original] })).toMatchObject({ status: 'review', reason: 'foreign_cancellation', row: { amount_krw: null } });
  });

  it('does not subtract again for a differently worded full cancellation of the same original', async () => {
    const first = await plan(cancellation, { existing: [original], received_at: '2026-10-02T04:00:10Z' });
    const replay = await plan(cancellation.replace('취소', '승인취소').replace('13:00', '13:01'), {
      existing: [original, first.row], received_at: '2026-10-02T04:01:10Z',
    });
    expect(replay).toMatchObject({ status: 'duplicate', expense_id: first.row.id });
    const concurrent = await plan(cancellation.replace('13:00', '13:01'), { existing: [original], received_at: '2026-10-02T04:01:10Z' });
    expect(concurrent.row.id).toBe(first.row.id);
  });

  it('retains unparsed text once for review but rejects non-payment notices', async () => {
    const first = await plan('알 수 없는 카드 거래 형식');
    expect(first).toMatchObject({ status: 'unparsed', row: { amount_krw: null } });
    expect((await plan('알 수 없는 카드 거래 형식', { existing: [first.row], received_at: '2026-10-04T00:00:00Z' })).status).toBe('duplicate');
    expect(await plan('[KB국민카드] 10/02 카드대금 8,200원')).toMatchObject({ status: 'rejected' });
  });

  it.each([
    '신한은행 입출금알림\n10/14 12:34\n입금 80,000원\n잔액 90,000원',
    '신한 10/14 12:34\n출금 50,000원\n계좌 123-***-456\n잔액 10,000원',
    '신한은행\n10/14 12:34\n계좌이체 30,000원 완료',
    'KB국민은행\n송금 20,000원 완료\n잔액 50,000원',
  ])('does not retain a clear bank account notification: %s', async (text) => {
    const result = await plan(text);
    expect(result).toMatchObject({ status: 'rejected', reason: 'non_payment' });
    expect(result.row).toBeUndefined();
  });

  it.each([
    '신한카드 미지원거래형식\n10/14 12:34\n사용 10,000원\n계좌잔액 90,000원',
    'KB국민체크(1303) 미지원형식\n10/14 12:34\n계좌출금 10,000원',
    '신한8244 사용\n10/14 12:34\n계좌 출금 10,000원',
  ])('preserves unsupported card/debit notifications for review: %s', async (text) => {
    expect(await plan(text)).toMatchObject({ status: 'unparsed', row: { amount_krw: null } });
  });
});

describe('request validation', () => {
  it.each([null, {}, { text: 'test', received_at: 'not-a-date' }, { text: 'test', received_at: '2026-02-30T10:00:00Z' }, { text: 'test', received_at: '2026-10-01' }, { text: 'test', received_at: 123 }])('rejects malformed input without throwing', (body) => {
    expect(validateIngestBody(body).ok).toBe(false);
  });
  it('requires an explicit supported ingest channel when supplied', () => {
    expect(validateIngestBody({ text: 'test', received_at: base.received_at, ingest_channel: 'unknown' }).ok).toBe(false);
    expect(validateIngestBody({ text: 'test', received_at: base.received_at })).toMatchObject({ ok: true, ingest_channel: 'live' });
    expect(validateIngestBody({ text: 'test', received_at: '2026-10-01T12:35:21+09:00', ingest_channel: 'paste' })).toMatchObject({ ok: true, ingest_channel: 'paste' });
  });
});
