/* 복습 세션 데모 픽스처 — 인증 없이 시각 검증용 (작업지시서 §5).
 * mountSessionReview 의 ?demo=1 분기가 사용. 실 DB 무영향.
 * interval 로 Rung 1·2·3 모두 시연 (pickReviewRung: <3→1, 3~20→2, ≥21→3).
 * 필드명은 실제 reviewQueue row 와 동일하게 (meaning/phonetic_kr) — pickCardFields 가 읽는 키.
 */
export function demoReviewCards() {
  return [
    {
      id: 'demo-r1', lang: 'en', interval: 1, sentence: 'Count on it.', meaning: '믿어도 돼.', phonetic_kr: '카운트 온 잇', speaker: 'L',
      reviewCount: 0, lastScore: null, nextReviewLabel: '내일', history: [],
      explanation: {
        key: 'Count on it. = 믿어도 돼 / 장담해. 상대에게 확실함을 약속하는 표현.',
        situation: '약속이나 다짐을 확실히 못박을 때. "꼭 그렇게 될 거야"라는 자신감을 줘요.',
        chunks: [['Count on', '카운트 온'], ['it', '잇']],
      },
    },
    {
      id: 'demo-r2', lang: 'en', interval: 7, sentence: 'Is that a promise?', meaning: '약속하는 거예요?', phonetic_kr: '이즈 대러 프라미스', speaker: 'A',
      reviewCount: 2, lastScore: 78, nextReviewLabel: '6월 19일', history: [71, 78],
      explanation: {
        key: 'Is that a promise? = 약속하는 거예요? 상대의 말을 못박아 확인하는 되묻기.',
        situation: '상대가 한 말을 그대로 믿기 어려울 때 가볍게 다짐을 받아내요.',
        chunks: [['Is that', '이즈 댓'], ['a promise', '어 프라미스']],
      },
    },
    {
      id: 'demo-r3', lang: 'en', interval: 21, sentence: 'Thank you so much for coming.', meaning: '와 주셔서 정말 감사합니다.', phonetic_kr: '땡큐 쏘 머치 포 커밍', speaker: 'L',
      reviewCount: 4, lastScore: 88, nextReviewLabel: '7월 19일', history: [80, 85, 88],
      explanation: {
        key: 'Thank you so much for coming. = 와 주셔서 정말 감사합니다. 환영 인사 1순위.',
        situation: '행사·모임·초대 자리에서 참석자를 맞이할 때.',
        chunks: [['Thank you', '땡큐'], ['so much', '쏘 머치'], ['for coming', '포 커밍']],
      },
    },
  ];
}
