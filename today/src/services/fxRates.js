/**
 * 해외 카드 결제 SMS 환산용 고정 환율 표 (KRW 기준).
 *
 * keep GAS Code.js (FX_RATES) 에서 가져왔으나 단위 테스트 가능한 순수 모듈로 분리.
 * 실제 환율 변동을 반영하지 않는 근사치 — 가계부 추정 목적. 정확한 환산은 결제일
 * 명세서 확정 시 사용자가 수동 보정.
 *
 * 추후 외부 환율 API (예: ECB / 한국수출입은행) 로 교체 가능하도록 함수 형태로 유지.
 */

const RATES = Object.freeze({
  USD: 1350,
  EUR: 1450,
  JPY: 9, // 100엔 기준이 아니라 1엔 기준. SMS 본문도 "8,100 엔" = 73K 원 추정.
  GBP: 1700,
  CNY: 190,
  THB: 40,
  VND: 0.055,
  PHP: 25,
  HUF: 4,
  KHR: 0.33,
  SGD: 1000,
  KRW: 1,
  CAD: 1000,
  AUD: 900,
  MYR: 290,
  INR: 16,
  AED: 370,
  TWD: 43,
  HKD: 175,
});

/** 한글 통화명 → ISO 4217 코드. 카드 SMS 후치 패턴 ("250.79 달러") 처리용. */
export const CURRENCY_KR = Object.freeze({
  달러: 'USD',
  엔: 'JPY',
  유로: 'EUR',
  위안: 'CNY',
  바트: 'THB',
  동: 'VND',
  링깃: 'MYR',
  루피: 'INR',
  페소: 'PHP',
});

/** 지원 통화 코드 set. 정규식 alternation 생성용. */
export const SUPPORTED_CURRENCIES = Object.freeze(Object.keys(RATES));

/**
 * 외화 → KRW 환산 (정수 반올림).
 *
 * @param {number} amount   외화 금액
 * @param {string} currency ISO 4217 (예: 'USD')
 * @returns {number|null}   환산 KRW. 미지원 통화면 null.
 */
export function convertToKrw(amount, currency) {
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) return null;
  const rate = RATES[currency];
  if (!rate) return null;
  return Math.round(amount * rate);
}

export default { convertToKrw, CURRENCY_KR, SUPPORTED_CURRENCIES };
