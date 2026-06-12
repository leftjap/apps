/* 복습 세션 데모 픽스처 — 인증 없이 시각 검증용 (작업지시서 §5).
 * 시안 'Count on it.' 외 1문장. mountSessionReview 의 ?demo=1 분기가 사용. 실 DB 무영향.
 */
export function demoReviewCards() {
  return [
    {
      id: 'demo-r1', lang: 'en', sentence: 'Count on it.', ko: '믿어도 돼.', pron: '카운트 온 잇', speaker: 'L',
      reviewCount: 2, lastScore: 86, nextReviewLabel: '6월 19일', history: [92, 86],
      explanation: {
        key: 'Count on it. = 믿어도 돼 / 장담해. 상대에게 확실함을 약속하는 표현.',
        situation: '약속이나 다짐을 확실히 못박을 때. "꼭 그렇게 될 거야"라는 자신감을 줘요.',
      },
    },
    {
      id: 'demo-r2', lang: 'en', sentence: 'Is that a promise?', ko: '약속하는 거예요?', pron: '이즈 대러 프라미스', speaker: 'A',
      reviewCount: 0, lastScore: null, nextReviewLabel: '6월 16일', history: [],
      explanation: {
        key: 'Is that a promise? = 약속하는 거예요? 상대의 말을 못박아 확인하는 되묻기.',
        situation: '상대가 한 말을 그대로 믿기 어려울 때 가볍게 다짐을 받아내요.',
      },
    },
  ];
}
