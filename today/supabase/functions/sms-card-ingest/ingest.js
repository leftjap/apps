import { parseCardSms } from '../_shared/cardSmsParser.js';

const DAY = 86400000;

function validCalendarDate(year, month, day) {
  return month >= 1 && month <= 12 && day >= 1 && day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function validReceivedAt(value) {
  if (typeof value !== 'string') return false;
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/);
  return !!m && validCalendarDate(+m[1], +m[2], +m[3]) && +m[4] < 24 && +m[5] < 60 && +m[6] < 60 && Number.isFinite(Date.parse(value));
}

export function validateIngestBody(body) {
  if (!body || typeof body !== 'object' || typeof body.text !== 'string' || !body.text.trim()) return { ok: false, reason: 'Missing text' };
  if (body.text.length > 20000) return { ok: false, reason: 'Text too long' };
  if (!validReceivedAt(body.received_at)) return { ok: false, reason: 'Invalid received_at (ISO8601 timestamp required)' };
  const ingest_channel = body.ingest_channel ?? 'live';
  if (!['live', 'backfill', 'paste'].includes(ingest_channel)) return { ok: false, reason: 'Invalid ingest_channel' };
  return { ok: true, text: body.text, received_at: new Date(body.received_at).toISOString(), ingest_channel };
}

function canonicalText(text) {
  return text.replace(/\r\n?/g, '\n').trim().replace(/^\[(?:Web발신|웹발신)\]\s*/u, '').replace(/\s+/gu, ' ').trim();
}

// MM/DD는 원본 수신시각보다 늦지 않은 가장 최근 날짜로 해를 추론한다.
// 하루 정도의 시차·지연은 허용하되, 늦게 재전송한 1월 문자를 내년으로 옮기지 않는다.
// 복구 호출자는 재전송 시각이 아닌 원본 수신시각을 전달해야 한다.
function transactionDate(text, received_at) {
  const received = new Date(received_at);
  const year = new Date(received.getTime() + 9 * 3600000).getUTCFullYear();
  const scheduled = /후불하이패스/.test(text) && /결제예정/.test(text);
  const full = text.match(/\b(\d{4})[./-](\d{1,2})[./-](\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?/);
  const short = !full && text.match(/\b(\d{1,2})\/(\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?/);
  const monthOnly = !full && !short && text.match(/(\d{1,2})월(?:분|접수)/);
  if (!full && !short && !monthOnly) return { spent_at: received.toISOString(), year, precision: 'received_at' };
  const month = +(full ? full[2] : short ? short[1] : monthOnly[1]);
  const day = +(full ? full[3] : short ? short[2] : 1);
  const hour = +(full ? full[4] || 0 : short ? short[3] || 0 : 0);
  const minute = +(full ? full[5] || 0 : short ? short[4] || 0 : 0);
  const years = full ? [+full[1]] : [year - 1, year, year + 1];
  const candidates = years.filter((y) => validCalendarDate(y, month, day) && hour < 24 && minute < 60)
    .map((y) => ({ year: y, time: Date.UTC(y, month - 1, day, hour - 9, minute) }))
    .filter((candidate) => candidate.time <= received.getTime() + (scheduled ? 45 * DAY : 36 * 3600000))
    .sort((a, b) => Math.abs(a.time - received.getTime()) - Math.abs(b.time - received.getTime()));
  if (!candidates.length) return { spent_at: received.toISOString(), year, precision: 'invalid' };
  const best = candidates[0];
  // 하이패스 결제예정일은 이용일이 아니다. 수신일에 월 합계를 기록하되
  // 가까운 청구일의 연도를 식별에 써서 연말 수신/연초 재전송도 중복 차단한다.
  if (scheduled) return { spent_at: received.toISOString(), year: best.year, precision: 'scheduled' };
  // 월별 합계의 월은 개별 이용일이 아니므로 수신일을 남기고 식별 연도만 추론.
  return {
    spent_at: monthOnly ? received.toISOString() : new Date(best.time).toISOString(), year: best.year,
    precision: monthOnly ? 'monthly' : (full ? full[4] : short[3]) ? 'minute' : 'day',
  };
}

async function stableId(value) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))).slice(0, 16);
  bytes[6] = (bytes[6] & 15) | 0x50;
  bytes[8] = (bytes[8] & 63) | 0x80;
  const hex = [...bytes].map((n) => n.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function rejected(text) {
  const cardSignature = /카드|체크|일시불|할부|후불교통|자동결제/.test(text)
    || (/(?:삼성|신한|KB국민|하나|현대|롯데|우리)\s*\(?\d{4}\)?/.test(text) && /승인|사용|결제|취소/.test(text));
  const bankAccountNotice = /은행|신한|KB국민|하나|우리|농협|기업|카카오뱅크|토스뱅크/.test(text)
    && /입금|출금|이체|송금|잔액|계좌/.test(text);
  // 넓은 카드사 트리거에 잡힌 계좌 알림은 버리되, 미지원 카드/체크 사용은
  // 잔액·출금 문구가 있어도 검토할 수 있게 null 금액으로 남긴다.
  return (!cardSignature && bankAccountNotice)
    || /거절|문자명세서|카드대금|\(광고\)|,\s*[^\]\n]*안내\]|차단\s*(신청|서비스)|비밀번호\s*변경|카드(발급|교부)/.test(text)
    || (/결제예정/.test(text) && !/후불하이패스/.test(text))
    || (/(?:USD|EUR|GBP|JPY|CNY|THB|VND|PHP|HUF|KHR|SGD|KRW|MYR|INR|CAD|AUD|AED|TWD|HKD)\s+0(?:\.0+)?\b|\b0(?:\.0+)?\s*\((?:US\$?|[A-Z]{3})\)/.test(text));
}

function duplicate(row) {
  return { status: 'duplicate', expense_id: row.id, deleted: !!row.deleted_at, reason: row.meta?.review_reason,
    amount_krw: row.amount_krw, merchant: row.merchant, category: row.category, kind: row.meta?.sms_kind };
}

function merchantKey(value) { return (value || '').replace(/\s+/gu, '').trim(); }

export async function planSmsIngest({ owner_id, text, received_at, ingest_channel = 'live', existing = [], now = new Date().toISOString() }) {
  const validated = validateIngestBody({ text, received_at, ingest_channel });
  if (!validated.ok) return { status: 'invalid', reason: validated.reason };
  received_at = validated.received_at;
  const parsed = parseCardSms(text);
  if (!parsed && rejected(text)) return { status: 'rejected', reason: 'non_payment' };
  const date = transactionDate(text, received_at);
  const eventKey = `${date.year}:${canonicalText(text)}`;
  const id = await stableId(`today:sms:v1:${owner_id}:${eventKey}`);
  const ownRows = existing.filter((r) => r && r.owner_id === owner_id);
  const previous = ownRows.find((r) => {
    if (r.id === id || r.meta?.sms_event_key === id) return true;
    if (!r.sms_raw || canonicalText(r.sms_raw) !== canonicalText(text)) return false;
    const legacyDate = transactionDate(r.sms_raw, r.received_at || r.spent_at);
    return legacyDate.year === date.year;
  });
  if (previous) return duplicate(previous);
  const row = {
    id, owner_id, spent_at: date.spent_at, received_at, source: 'sms', sms_raw: text,
    amount_krw: parsed?.amount_krw ?? null, merchant_raw: parsed?.merchant_raw ?? null,
    merchant: parsed?.merchant_raw ?? null, brand: null, category: null, card: parsed?.card ?? null,
    currency: parsed?.currency ?? null, foreign_amount: parsed?.foreign_amount ?? null,
    installment_months: parsed?.installment_months ?? null,
    meta: { sms_kind: parsed?.kind ?? 'unparsed', ingest_channel, ingested_at: now, sms_event_key: id, date_precision: date.precision },
  };
  const review = (reason) => {
    row.amount_krw = null;
    row.meta.review_reason = reason;
    return { status: 'review', reason, row };
  };
  if (date.precision === 'invalid') return review('invalid_message_date');
  if (!parsed) return /취소/.test(text) ? review('unparsed_cancellation') : { status: 'unparsed', row };
  if (parsed.kind !== 'cancellation') return { status: 'ok', row };
  if (parsed.partial) return review('partial_cancellation');
  if (parsed.currency || parsed.cancellation_kind === 'overseas') return review('foreign_cancellation');
  if (!parsed.card || !parsed.merchant_raw || date.precision !== 'minute') return review('incomplete_cancellation');
  const cancelledAt = Date.parse(date.spent_at);
  const candidates = ownRows.filter((r) => {
    if (!(r.amount_krw > 0) || r.card !== parsed.card || !r.sms_raw) return false;
    const payment = parseCardSms(r.sms_raw);
    if (!payment || payment.kind === 'cancellation' || payment.currency || payment.amount_krw !== parsed.amount_krw) return false;
    if (merchantKey(payment.merchant_raw) !== merchantKey(parsed.merchant_raw)) return false;
    const originalDate = transactionDate(r.sms_raw, r.received_at || r.spent_at);
    if (originalDate.precision !== 'minute') return false;
    const elapsed = cancelledAt - Date.parse(originalDate.spent_at);
    return elapsed >= 0 && elapsed <= 30 * DAY;
  });
  if (!candidates.length) return review('original_not_found');
  if (candidates.length !== 1) return review('ambiguous_original');
  const original = candidates[0];
  if (original.deleted_at) return review('original_deleted');
  if (original.amount_krw !== parsed.amount_krw) return review('original_amount_changed');
  // Full reversal UUID is tied to the original, so two different cancellation
  // notifications racing against one payment cannot both reduce the balance.
  row.id = await stableId(`today:sms:refund:v1:${owner_id}:${original.id}`);
  const refunded = ownRows.find((r) => r.id === row.id || r.meta?.cancelled_expense_id === original.id);
  if (refunded) return duplicate(refunded);
  if (ownRows.some((r) => !r.deleted_at && r.amount_krw < 0 && r.card === original.card && merchantKey(r.merchant_raw || r.merchant) === merchantKey(original.merchant_raw || original.merchant))) return review('possible_existing_refund');
  row.amount_krw = -original.amount_krw;
  row.merchant = original.merchant;
  row.brand = original.brand;
  row.category = original.category;
  row.meta.cancelled_expense_id = original.id;
  return { status: 'ok', matched_expense_id: original.id, row };
}
