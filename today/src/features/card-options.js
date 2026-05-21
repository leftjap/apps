/**
 * 사용자별 가계부 카드 옵션 정적 매핑.
 *
 * value 는 today_expenses.card 컬럼 raw 값과 정확히 일치 — SMS ingest 정규화
 * 결과 (예: '삼성1337') 또는 keep cardNameMap 친화 라벨 ('K-패스 신한카드 체크') 그대로.
 * label 은 드롭다운 표시용 가공 라벨.
 *
 * 검증 근거: ~/.claude/plans/radiant-wobbling-axolotl.md
 *  - 지오 (leftjap@gmail.com): chat.db 결제 SMS distinct + 최종 결제일 활성 카드만
 *  - 소연 (soyoun312@gmail.com): specs/sms-ingest-pipeline.md L143-150 keep cardNameMap
 */

export const COMMON_CARD_OPTIONS = Object.freeze([
  { value: '', label: '선택 안 함' },
  { value: '현금', label: '현금' },
]);

export const CARD_OPTIONS_BY_EMAIL = Object.freeze({
  'leftjap@gmail.com': Object.freeze([
    { value: '삼성1337', label: '삼성카드 1337' },
    { value: 'KB국민카드7007', label: 'KB국민카드 7007' },
    { value: 'KB국민카드 후불하이패스', label: 'KB국민 하이패스2.0카드' },
  ]),
  'soyoun312@gmail.com': Object.freeze([
    { value: 'K-패스 신한카드 체크', label: 'K-패스 신한카드 체크' },
    { value: '신한카드 Air', label: '신한카드 Air' },
    { value: '현대백화점카드', label: '현대백화점카드' },
    { value: '삼성카드 iD SIMPLE', label: '삼성카드 iD SIMPLE' },
  ]),
});

/**
 * email 기준 카드 옵션 배열 (공통 2개 + owner 카드).
 * 등록되지 않은 email 은 공통 2개만 반환.
 */
export function getCardOptionsForEmail(email) {
  const userCards = (email && CARD_OPTIONS_BY_EMAIL[email]) || [];
  return [...COMMON_CARD_OPTIONS, ...userCards];
}
