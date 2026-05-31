/**
 * 사용자별 가계부 카드 옵션 정적 매핑.
 *
 * value 는 today_expenses.card 컬럼 raw 값과 정확히 일치 — SMS ingest 정규화
 * 결과 (예: '삼성1337') 또는 keep cardNameMap 친화 라벨 ('K-패스 신한카드 체크') 그대로.
 * label 은 드롭다운 표시용 가공 라벨.
 *
 * 옵션 순서: 사용자 명시 순서. 첫 항목 = 기본값 (모달 open 시 자동 선택).
 *
 * 검증 근거: ~/.claude/plans/radiant-wobbling-axolotl.md
 *  - 지오 (leftjap@gmail.com): chat.db Chrome history + AMEX BIN 정황
 *  - 소연 (soyoun312@gmail.com): specs/sms-ingest-pipeline.md L143-150 keep cardNameMap
 */

export const CARD_OPTIONS_BY_EMAIL = Object.freeze({
  'leftjap@gmail.com': Object.freeze([
    { value: '삼성1337', label: '삼성카드 MILEAGE PLATINUM (스카이패스)' },
    { value: 'KB국민카드7007', label: 'KB국민카드 7007' },
    { value: 'KB국민카드 후불하이패스', label: 'KB국민 하이패스2.0카드' },
    { value: '현금', label: '현금' },
  ]),
  'soyoun312@gmail.com': Object.freeze([
    { value: '삼성카드 iD SIMPLE', label: '삼성카드 iD SIMPLE' },
    { value: '현대백화점카드', label: '현대백화점카드' },
    { value: '신한카드 Air', label: '신한카드 Air One' },
    { value: 'K-패스 신한카드 체크', label: 'K-패스 신한카드 체크' },
    { value: '현금', label: '현금' },
  ]),
});

const FALLBACK_OPTIONS = Object.freeze([
  { value: '현금', label: '현금' },
]);

/** email 기준 카드 옵션 배열. 미등록 email 은 [현금, 선택 안 함] fallback. */
export function getCardOptionsForEmail(email) {
  const userOpts = email && CARD_OPTIONS_BY_EMAIL[email];
  return userOpts ? [...userOpts] : [...FALLBACK_OPTIONS];
}

/** email 기준 기본 카드 — 옵션 첫 항목 중 value 가 비어있지 않은 것. */
export function getDefaultCardForEmail(email) {
  const opts = getCardOptionsForEmail(email);
  return opts.find((o) => o.value) || null;
}

/**
 * raw card value (today_expenses.card) → 사용자 친화 표시 label.
 * email 의 등록 옵션에서 value 매칭 시 label, 미매칭·email 없음 → value 그대로 (graceful).
 * 타임라인·팝오버·검색·카테고리 모달이 raw 값('삼성1337')을 그대로 노출하던 버그 해소용.
 */
export function cardLabelFromValue(value, email) {
  if (!value) return value || '';
  const opts = email && CARD_OPTIONS_BY_EMAIL[email];
  if (opts) {
    const hit = opts.find((o) => o.value === value);
    if (hit) return hit.label;
  }
  return value;
}
