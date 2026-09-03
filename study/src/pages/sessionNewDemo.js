/* 신규 세션 데모 픽스처 — 인증 없이 다이얼로그(§2)·표현 세션(§3) 시각 검증용.
 * 시안 '레슬리의 다짐' 대화 8줄 + 표현 카드 5개(4 추천 + 1 제외 후보).
 * mountSessionNew 의 ?demo=1 분기가 사용. 실데이터 경로는 무영향.
 */

const DIALOGUE = [
  { speaker: 'L', en: "I'm going to finish the report by Friday.", ko: '이번 주 금요일까지 보고서 끝낼 거야.' },
  { speaker: 'A', en: 'You said that last week.', ko: '지난주에도 그렇게 말했잖아.' },
  { speaker: 'L', en: "This time it's different. I already started.", ko: '이번엔 달라. 벌써 시작했거든.' },
  { speaker: 'A', en: 'Is that a promise?', ko: '약속하는 거예요?' },
  { speaker: 'L', en: "It's more than a promise. Count on it.", ko: '약속 그 이상이지. 믿어도 돼.' },
  { speaker: 'A', en: "Fine. I'll fill in the rest of the team.", ko: '좋아, 나머지 팀원들에겐 내가 알려둘게.' },
  { speaker: 'L', en: 'Thanks. I can handle the numbers myself.', ko: '고마워. 숫자 쪽은 내가 처리할 수 있어.' },
  { speaker: 'A', en: "Then let's build the deck from scratch.", ko: '그럼 자료는 처음부터 다시 만들자.' },
];

const SCENE = {
  id: 'demo-scene', lang: 'en', sentence: '', ko: '', speaker: 'A',
  explanation: {
    sceneTitle: '레슬리의 다짐',
    sceneSummary: '금요일까지 보고서를 끝내겠다는 레슬리 — 앤은 이번에야말로 진짜인지 확인하고 싶어요. 대화 맥락을 먼저 익히고, 공부할 표현을 직접 골라요.',
    dialogue: DIALOGUE,
  },
};

// 표현 카드 — sentence 가 대화 줄의 부분문자열이어야 deriveDialogue 가 num/하이라이트 부여.
const EXPR = [
  {
    id: 'demo-e1', lang: 'en', sentence: 'Is that a promise?', ko: '약속하는 거예요?', pron: '이즈 대러 프라미스?', speaker: 'A',
    explanation: {
      key: 'Is that a promise? = 약속하는 거예요? 상대의 말을 못박아 확인하는 되묻기.',
      situation: '레슬리의 다짐에 앤이 진짜냐고 확인하는 장면. 상대가 한 말을 그대로 믿기 어려울 때, 가볍게 다짐을 받아내는 뉘앙스로 써요. 진지한 추궁보다는 살짝 장난스러운 톤까지 폭넓게 쓰입니다.',
      grammar: [
        { struct: 'Is that a + 명사?', body: "상대가 방금 한 말을 '~인 거예요?'라고 한 단어로 규정해 확인해요. that은 방금 그 말 전체를 가리켜요." },
        { struct: 'Is that a threat?', body: '그거 협박이에요?' },
        { struct: 'Is that an offer?', body: '그거 제안인 거예요?' },
      ],
      phonemes: [['/ð/', "that — 혀끝 이 사이 '대'"], ['/t̬/', "that a → '대러'"], ['/ɑ/', 'promise 첫음절 강세']],
      mistake: "that a 를 끊어 '댓 어'(X) — 연음 '대러' 한 호흡으로. 프로미스(X) 프라미스(O), 첫음절에 강세를 둬요.",
      similar: 'Do you promise? / You promise?',
      // 체이닝 데모 (2026-09-03) — 단계 행 점수 원까지 인증 없이 화면 검증하려고 추가. 실데이터 무영향.
      chain: {
        target: 'Is that a promise, or are you just saying that to make me feel better?',
        chunks: ['Is that a promise,', 'or are you', 'just saying that', 'to make me', 'feel better?'],
        ko: '약속하는 거예요, 아니면 그냥 나 기분 좋으라고 하는 말이에요?',
      },
      drills: [
        { en: 'Is that a promise?', ko: '약속하는 거죠?', kr: '이즈 대러 프라미스?' },
        { en: 'Is that a yes?', ko: '그거 승낙인 거죠?', kr: '이즈 대러 예스?' },
        { en: 'Is that an apology?', ko: '그거 사과하는 거예요?', kr: '이즈 대런 어팔러지?' },
        { en: 'Is that a no, then?', ko: '그럼 거절인 거예요?', kr: '이즈 대러 노우 덴?' },
        { en: "You'll be there at six. Is that a promise?", ko: '6시에 온다는 거죠. 약속하는 거예요?', kr: '' },
      ],
    },
  },
  {
    id: 'demo-e2', lang: 'en', sentence: 'more than a promise', ko: '약속 그 이상', pron: '모어 댄 어 프라미스', speaker: 'L',
    explanation: {
      key: 'more than a promise = 약속 그 이상 — 단순한 약속을 넘어선다는 강조.',
      situation: '말로 그치지 않고 반드시 지키겠다는 결의를 강조할 때.',
      grammar: [{ struct: 'more than a + 명사', body: '단순한 ~ 이상이라는 뜻으로 강조해요.' }],
      phonemes: [['/ð/', 'than → 댄']],
      similar: 'way more than / not just a promise',
    },
  },
  {
    id: 'demo-e3', lang: 'en', sentence: 'fill in', ko: '알려주다 / 채워 넣다', pron: '필 인', speaker: 'A',
    explanation: {
      key: 'fill in = ~에게 (빠진 정보를) 알려주다.',
      situation: '누군가에게 진행 상황·빠진 내용을 업데이트해 줄 때.',
      grammar: [{ struct: 'fill + 사람 + in (on 사항)', body: "'fill the team in'처럼 사람을 가운데 넣어요." }],
      similar: 'update / bring up to speed',
    },
  },
  {
    id: 'demo-e4', lang: 'en', sentence: 'handle', ko: '처리하다 / 감당하다', pron: '핸들', speaker: 'L',
    explanation: {
      key: 'handle = (일·상황을) 처리하다, 감당하다.',
      situation: '어떤 일을 스스로 맡아 해낼 수 있다고 말할 때.',
      similar: 'deal with / take care of',
    },
  },
  {
    id: 'demo-e5', lang: 'en', sentence: 'from scratch', ko: '처음부터', pron: '프럼 스크래치', speaker: 'A',
    explanation: {
      key: 'from scratch = 맨 처음부터 (아무것도 없는 상태에서).',
      situation: '기존 것을 쓰지 않고 완전히 새로 시작할 때.',
      grammar: [{ struct: 'build/make ~ from scratch', body: '처음부터 만들다.' }],
      similar: 'from the ground up',
    },
  },
];

// 데모에서 기본 제외할 표현 (시안: 'handle' 1개 제외 → AI 추천 5개 중 4개 선택).
export const DEMO_EXCLUDE_IDS = ['demo-e4'];

export function demoNewCards() {
  // 깊은 복사 — 세션이 state 를 변형해도 픽스처 원본 보존.
  return JSON.parse(JSON.stringify([SCENE, ...EXPR]));
}
