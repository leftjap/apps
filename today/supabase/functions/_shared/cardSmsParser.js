/**
 * 카드사 SMS 본문 → 가계부 입력 객체 순수 파서.
 *
 * spent_at 은 호출자가 received_at 그대로 사용 — 파서는 본문에서 날짜 추출 안 함.
 * rejected (거절·취소·문자명세서·일반 결제예정) 은 null 반환.
 * merchant_raw 는 정제 안 된 원본만 반환 — 호출자가 cleanMerchantName 후처리.
 *
 * kind: domestic / installment / overseas / auto / scheduled_hipass / transit
 */

import { convertToKrw } from './fxRates.js';

const ISSUER_PATTERNS = [
  { code: '삼성', re: /삼성(?:카드)?(?:해외)?\s*(\d{4})/ },
  { code: 'KB국민카드', re: /KB국민카드\s*(\d{4})/ },
  { code: '신한', re: /신한(?:카드)?\s*(\d{4})/ },
  { code: '하나', re: /하나(?:카드)?\s*(\d{4}|[\d*]+)/ },
  { code: '현대', re: /현대(?:카드)?\s*(\d{4})/ },
  { code: '롯데', re: /롯데(?:카드)?\s*(\d{4})/ },
  { code: '우리', re: /우리(?:카드)?\s*(\d{4})/ },
];

function normalize(text) {
  return String(text)
    .replace(/\r\n?/g, '\n')
    .replace(/^\[Web발신\]\s*\n?/u, '')
    .replace(/^\[웹발신\]\s*\n?/u, '')
    .trim();
}

function extractCard(text) {
  if (/KB국민카드\s*후불하이패스/.test(text)) return 'KB국민카드 후불하이패스';
  const sc = text.match(/SC은행BC\((\d{4})\)/);
  if (sc) return `SC은행BC${sc[1]}`;
  // 대괄호 형식 — issuer 표준 prefix 로 정규화 (예: '[삼성카드]1337' → '삼성1337')
  const bracketed = text.match(/\[(삼성|신한|KB|국민|현대|롯데|하나|우리)(?:[^\]]*)\]\s*(\d{4})/);
  if (bracketed) {
    const issuer = bracketed[1] === '국민' ? 'KB국민카드' : bracketed[1];
    return `${issuer}${bracketed[2]}`;
  }
  for (const { code, re } of ISSUER_PATTERNS) {
    const m = text.match(re);
    if (m) return `${code}${m[1]}`;
  }
  // 번호 없는 대괄호 카드명 (현대백화점카드 등) — '카드' 로 끝나는 대괄호 라벨.
  const named = text.match(/\[([^\]\n]*카드)\]/);
  if (named) return named[1].trim();
  return null;
}

function extractKrwAmount(text) {
  const m = text.match(/([\d,]+)\s*원/);
  if (!m) return null;
  const n = parseInt(m[1].replace(/,/g, ''), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function extractMerchantFromTimeline(text) {
  const m = text.match(/\d{1,2}\/\d{1,2}\s+\d{1,2}:\d{2}\s+([^\n]+)/);
  return m ? m[1].trim() : null;
}

function extractMerchantOverseasKb(text) {
  const m = text.match(/\d{1,2}:\d{2}\s*\n([^\n]+)/);
  return m ? m[1].trim() : null;
}

/** 멀티라인 포맷 (현대백화점카드 등) — 가맹점이 금액 줄 바로 위 별도 줄에 있음.
 *  inline 포맷 (삼성/KB) 은 extractMerchantFromTimeline 이 먼저 잡으므로 폴백으로만 호출. */
function extractMerchantBeforeAmount(text) {
  const lines = text.split('\n').map((s) => s.trim()).filter(Boolean);
  const amtIdx = lines.findIndex((l) => /[\d,]+\s*원/.test(l));
  if (amtIdx <= 0) return null;
  const cand = lines[amtIdx - 1];
  if (/^\d{1,2}\/\d{1,2}/.test(cand) || /^\[.*\]$/.test(cand)) return null; // 날짜·카드 줄 제외
  return cand.replace(/[-\s]+$/, '').trim() || null; // 꼬리 부호 제거 (베즐리베이커리- → 베즐리베이커리)
}

/** 외화 + 통화 추출 — 괄호(USD)·전치 USD·후치 한글 통화. */
function extractForeign(text) {
  const paren = text.match(/([\d,]+(?:\.\d+)?)\s*\(\s*US\$?\)/);
  if (paren) return { amount: parseFloat(paren[1].replace(/,/g, '')), currency: 'USD' };
  const paren2 = text.match(/([\d,]+(?:\.\d+)?)\s*\(([A-Z]{3})\)/);
  if (paren2) return { amount: parseFloat(paren2[1].replace(/,/g, '')), currency: paren2[2] };
  // KRW 도 허용 (해외승인이지만 KRW 표기 — 예: PADDLE.NET 109,000 KRW)
  const pre = text.match(/\b([A-Z]{3})\s+([\d,]+(?:\.\d+)?)\b/);
  if (pre) {
    return { amount: parseFloat(pre[2].replace(/,/g, '')), currency: pre[1] };
  }
  const ko = text.match(/([\d,]+(?:\.\d+)?)\s*(달러|엔|유로|위안|바트|동|페소|루피|링깃)/);
  if (ko) {
    const map = { 달러: 'USD', 엔: 'JPY', 유로: 'EUR', 위안: 'CNY', 바트: 'THB', 동: 'VND', 페소: 'PHP', 루피: 'INR', 링깃: 'MYR' };
    return { amount: parseFloat(ko[1].replace(/,/g, '')), currency: map[ko[2]] };
  }
  return null;
}

export function parseCardSms(text) {
  if (!text || typeof text !== 'string') return null;
  const t = normalize(text);
  if (/거절|취소/.test(t)) return null;
  if (/문자명세서/.test(t)) return null;
  // 0원 외화 결제 (사전승인 / 취소 처리된 거래) — 해외승인 SMS 형식이지만 실 결제 아님
  // 예: "KRW 0", "USD 0.00", "GBP 0.00", "0(USD)"
  if (/(USD|EUR|GBP|JPY|CNY|THB|VND|PHP|HUF|KHR|SGD|KRW|MYR|INR|CAD|AUD|AED|TWD|HKD)\s+0(?:\.0+)?\b/.test(t)) return null;
  if (/\b0(?:\.0+)?\s*\((?:US\$?|[A-Z]{3})\)/.test(t)) return null;
  // 광고 / 카드사 비결제 안내문 (이용한도 조정안내, 해외원화 차단서비스, 비밀번호 변경, 카드교부 등)
  if (/\(광고\)/.test(t)) return null;
  if (/,\s*[^\]\n]*안내\]/.test(t)) return null;          // [KB국민카드, XX 안내]
  if (/차단\s*(신청|서비스)/.test(t)) return null;
  if (/비밀번호\s*변경/.test(t)) return null;
  if (/카드(발급|교부)/.test(t)) return null;
  const card = extractCard(t);
  return _dispatch(t, card);
}

function _dispatch(t, card) {
  // KB 후불하이패스 결제예정 (가계부 저장)
  if (/후불하이패스/.test(t) && /결제예정/.test(t)) {
    const amount = extractKrwAmount(t);
    if (!amount) return null;
    return { kind: 'scheduled_hipass', amount_krw: amount, merchant_raw: '하이패스', card };
  }
  if (/결제예정/.test(t)) return null;

  // transit: "후불교통" + "사용합계 N원" 또는 "접수 후불교통 ... 합계 N원" 패턴 모두 커버
  if (/후불교통/.test(t) && /(사용)?합계\s*[\d,]+\s*원/.test(t)) {
    const amount = extractKrwAmount(t);
    if (!amount) return null;
    return { kind: 'transit', amount_krw: amount, merchant_raw: '후불교통', card };
  }

  if (/자동결제/.test(t)) return _parseAuto(t, card);
  if (/해외승인|해외\d{4}/.test(t) || /\(US\$?\)|\([A-Z]{3}\)/.test(t)) return _parseOverseas(t, card);

  const inst = t.match(/([\d,]+)\s*원\s+(\d+)\s*개월/);
  if (inst || /할부/.test(t)) return _parseInstallment(t, card, inst);

  if (/일시불|\[체크\.승인\]|승인/.test(t)) {
    const amount = extractKrwAmount(t);
    if (!amount) return null;
    // 결제 시그니처 검증 — 시간 패턴(MM/DD or HH:MM) 또는 누적 잔액 없으면 광고/안내로 간주
    const hasPaymentSig = /\d{1,2}\/\d{1,2}|\d{1,2}:\d{2}|누적[\d,]+원/.test(t);
    if (!hasPaymentSig) return null;
    const merchant_raw = extractMerchantFromTimeline(t) || extractMerchantBeforeAmount(t);
    return { kind: 'domestic', amount_krw: amount, merchant_raw, card };
  }
  return null;
}

function _parseAuto(t, card) {
  const amount = extractKrwAmount(t);
  if (!amount) return null;
  let merchant = null;
  for (const line of t.split('\n').map((s) => s.trim()).filter(Boolean)) {
    if (/자동결제|\[.*\]|^[\d,]+\s*원$|\d+\/\d+/.test(line)) continue;
    merchant = line;
    break;
  }
  return { kind: 'auto', amount_krw: amount, merchant_raw: merchant, card };
}

function _parseOverseas(t, card) {
  const fx = extractForeign(t);
  if (!fx) return null;
  const amount_krw = convertToKrw(fx.amount, fx.currency);
  if (!amount_krw) return null;
  const merchant = extractMerchantOverseasKb(t) || extractMerchantFromTimeline(t);
  return {
    kind: 'overseas',
    amount_krw,
    foreign_amount: fx.amount,
    currency: fx.currency,
    merchant_raw: merchant,
    card,
  };
}

function _parseInstallment(t, card, inst) {
  const amount = inst ? parseInt(inst[1].replace(/,/g, ''), 10) : extractKrwAmount(t);
  if (!amount) return null;
  const months = inst ? parseInt(inst[2], 10) : null;
  return {
    kind: 'installment',
    amount_krw: amount,
    installment_months: months,
    merchant_raw: extractMerchantFromTimeline(t),
    card,
  };
}

export default parseCardSms;
