import { TODAY_ISO as APP_TODAY_ISO } from '../utils/today.js';

/**
 * 개발용 seed 데이터 (Wave 11.73 — 콘텐츠 전면 갈아엎기 v11).
 *
 * 정본 원칙:
 *  - 영어 7 review (re1~re7) + 3 today (te1~te3) = 10건
 *  - 일본어 7 review (rj1~rj7) + 3 today (tj1~tj3) = 10건
 *  - ID 는 v10 과 동일 슬롯 재사용. 콘텐츠만 전면 교체 (sentence/meaning/phoneticKr/explanation).
 *    → SESSION_LOGS sentenceIds 무결성 유지. SRS 진도 (interval/nextReview/consecutivePass/lastResult)
 *      는 REVIEW_UPDATE_FIELDS 에 미포함이라 사용자 학습 기록 보존.
 *  - 일본어 카드 explanation 은 spec 정합 ja 4필드 (whenToUse/grammar/pronPoints/similar) + meta 5필드
 *    (stage/newElements/knownElements/frequency/category). i+1 1T 원칙 — newElements length=1.
 *    Stage 1 6건 + Stage 2 1건 (review) / Stage 1 2건 + Stage 2 1건 (today). Stage 2 의 knownElements
 *    는 직전 Stage 1 카드 newElements 사슬에 등장 (rj7 → rj3 'そう' / tj3 → rj4 'わかった').
 *    spec 정본: ~/apps/study/docs/lesson-explanation-guide-ja.md §1·§3·§4
 *  - 영어 카드 explanation 은 mocks/session.html renderExplain 호환 8필드
 *    (key/situation/grammar 배열/chunks/phonemes/mistake/similar). today 카드는 varData 추가.
 *  - mocks/session.html · home.html · stats.html 의 fixture id 와 동기화 — drift 방지.
 *
 * 실행:
 *  - main.js 에서 인증 후 `createStudyDB('study_' + userHash)` 로 만든 db 를 `seedIfNeeded(db)` 에 전달.
 *  - `meta.seeded === SEED_VERSION` 면 no-op (재진입 시 중복 put 방지).
 *  - SPA 모드만 실행 — mocks 허브(iframe)는 main.js 를 거치지 않아 자동으로 skip.
 *
 * Wave 11.73 마이그레이션 (v10 → v11):
 *  - re1~re7 / te1~te3 / rj1~rj7 / tj1~tj3 ID 그대로. 기존 카드 update path 로 콘텐츠 갱신.
 *  - OBSOLETE_*_IDS 는 v8 이전 (r1~r5, s04~s13, jr1~jr5, n1~n3, jn1~jn2) 잔존분 정리 용도 그대로 유지.
 */

const TODAY_ISO = APP_TODAY_ISO;

// v8 이전 ID 잔존 시 명시적 delete (v8/v10 마이그레이션 시 도입). v11 도 동일 OBSOLETE 유지.
const OBSOLETE_REVIEW_IDS = [
  'r1','r2','r3','r4','r5',
  's04','s06','s07','s08','s09','s11','s12','s13',
  'jr1','jr2','jr3','jr4','jr5',
];
const OBSOLETE_LESSON_IDS = ['n1','n2','n3','jn1','jn2'];

const REVIEW_CARDS = [
  // ─── 영어 review (re1~re7) ── Wave 11.73 — 미드/일상 빈출 Stage 1~2 mix ───
  {
    id:'re1', lang:'en',
    sentence:"Got it.",
    meaning:'알겠어 / 이해했어.',
    reading:null, phoneticKr:'가릿',
    explanation:{
      key:'<span class="hl">Got it</span> = 즉시 응답 "이해함". 가장 짧은 확인 표현.',
      situation:'지시·정보 받았을 때 즉답. 친구·동료·상사 모두 가능.',
      grammar:[
        {struct:'<span class="hl">Got it</span> = I got it (I 생략)', body:'주어 생략 캐주얼. got = get 의 과거 — "(메시지를) 받았다" 의 idiom.'},
      ],
      chunks:[["Got it","가릿"]],
      phonemes:[["/ɾ/","got it (flap)"]],
      mistake:'"갓 잇" 단어별 끊지 말고 "가릿" 한 호흡. t 가 모음 사이에서 flap → /ɾ/.',
      similar:'<span class="hl">I see</span> / <span class="hl">Understood</span> / <span class="hl">Roger that</span>',
    },
    interval:3, nextReview:'2026-04-30', consecutivePass:1, lastResult:'O', category:'acknowledgement',
  },
  {
    id:'re2', lang:'en',
    sentence:"No worries.",
    meaning:'괜찮아 / 신경 쓰지 마.',
    reading:null, phoneticKr:'노 워리즈',
    explanation:{
      key:'사과·실수에 대한 가벼운 안심 응답. 미국·호주 회화에서 표준.',
      situation:'누가 사과·실수했을 때 "괜찮다" 답. 식당 직원·동료 모두 OK.',
      grammar:[
        {struct:'<span class="hl">No + 명사</span> = 명사가 전혀 없음', body:'No worries = 걱정거리가 없음 → "괜찮다" 의 idiom 적 정착.'},
      ],
      chunks:[["No worries","노 워리즈"]],
      phonemes:[["/z/","worries"],["/ɜːr/","wor-"]],
      mistake:'"노 워리스" X — worries 끝이 z 발음 (s 무성 X). 단·복수 -ies → /iːz/.',
      similar:'<span class="hl">It\'s fine</span> / <span class="hl">Don\'t worry about it</span> / <span class="hl">All good</span>',
    },
    interval:7, nextReview:'2026-05-08', consecutivePass:2, lastResult:'O', category:'reassurance',
  },
  {
    id:'re3', lang:'en',
    sentence:"Are you serious?",
    meaning:'진짜야? / 정말?',
    reading:null, phoneticKr:'알 유 시리어스',
    explanation:{
      key:'놀람·불신 리액션. 강한 의문. 친구·동료 사이.',
      situation:'믿기 어려운 소식 들었을 때 즉답. 톤에 따라 화남/감탄 양쪽.',
      grammar:[
        {struct:'<span class="hl">Are you + 형용사</span> = be 동사 의문', body:'be 동사 의문문 도치 — 가장 기본 패턴.'},
      ],
      chunks:[["Are you","알 유"],["serious?","시리어스"]],
      phonemes:[["/ɪə/","serious"],["/ɹ/","are"]],
      mistake:'"아 유 시리어스" 끊어 X — "알 유" 한 호흡 연결. r 약음 처리.',
      similar:'<span class="hl">For real?</span> / <span class="hl">No way!</span> / <span class="hl">You serious?</span>',
    },
    interval:1, nextReview:TODAY_ISO, consecutivePass:0, lastResult:'△', category:'disbelief',
  },
  {
    id:'re4', lang:'en',
    sentence:"Hold on a sec.",
    meaning:'잠깐만.',
    reading:null, phoneticKr:'홀돈 어 쎅',
    explanation:{
      key:'<span class="hl">hold on</span> = 기다리다 (idiom) / <span class="hl">sec</span> = second 축약.',
      situation:'통화·대화 중 잠깐 멈추라고 요청. 짐 들고 있는 동료에게도.',
      grammar:[
        {struct:'<span class="hl">Hold on</span> = 동사 + 부사 (구동사)', body:'직역 "붙들고 있어" → "기다려" 의 관용 의미로 정착.'},
        {struct:'<span class="hl">a sec</span> = a second', body:'second 의 회화 축약. 시간이 짧다는 의미만 전달.'},
      ],
      chunks:[["Hold on","홀돈"],["a sec","어 쎅"]],
      phonemes:[["/oʊ/","hold"]],
      mistake:'"홀드 온" X — d 약음, "홀돈" 한 호흡. sec 짧게 끊어.',
      similar:'<span class="hl">Just a sec</span> / <span class="hl">One moment</span> / <span class="hl">Wait up</span>',
    },
    interval:3, nextReview:'2026-05-02', consecutivePass:1, lastResult:'O', category:'wait_request',
  },
  {
    id:'re5', lang:'en',
    sentence:"I'm working on it.",
    meaning:'하고 있어 / 처리 중이야.',
    reading:null, phoneticKr:'아임 워킹 오닛',
    explanation:{
      key:'<span class="hl">work on X</span> = X 를 진행 중 (idiom). 비즈니스 응답 표준.',
      situation:'상사·동료가 진행 상황 물었을 때. 이메일 답으로도 자주.',
      grammar:[
        {struct:'<span class="hl">be + V-ing</span> = 현재진행', body:'지금 이 순간 진행 중. on 이 "그것에 대해" 라는 방향성.'},
      ],
      chunks:[["I'm working","아임 워킹"],["on it","오닛"]],
      phonemes:[["/ɜːr/","working"],["/ɾ/","on it"]],
      mistake:'"워킹 온 잇" 단어 끊지 말고 "워킹 오닛" 연음. on it 의 t 가 flap.',
      similar:'<span class="hl">I\'m on it</span> / <span class="hl">Almost there</span> / <span class="hl">In progress</span>',
    },
    interval:7, nextReview:'2026-05-10', consecutivePass:2, lastResult:'O', category:'work_progress',
  },
  {
    id:'re6', lang:'en',
    sentence:"Let's call it a day.",
    meaning:'오늘은 여기까지 하자.',
    reading:null, phoneticKr:'렛츠 콜 이러 데이',
    explanation:{
      key:'<span class="hl">call it a day</span> = 그날 일을 마치다 (idiom).',
      situation:'회의·작업 끝낼 때. 야근 그만 하고 퇴근하자고 제안.',
      grammar:[
        {struct:'<span class="hl">Let\'s</span> = Let us — 권유', body:'명령문 with us — "함께 ~하자".'},
        {struct:'<span class="hl">call it X</span> = X 라고 부르다/규정하다', body:'직역 "오늘이라고 부르자" → "오늘 종료" 의 idiom.'},
      ],
      chunks:[["Let's call","렛츠 콜"],["it a","이러"],["day","데이"]],
      phonemes:[["/ɾ/","it a (flap)"]],
      mistake:'"이트 어" → "이러" t flap 연음. idiom 통째로 외우기 — 개별 단어 분석 X.',
      similar:'<span class="hl">Wrap it up</span> / <span class="hl">That\'s a wrap</span> / <span class="hl">Let\'s wrap up</span>',
    },
    interval:21, nextReview:'2026-05-22', consecutivePass:3, lastResult:'O', category:'wrap_up',
  },
  {
    id:'re7', lang:'en',
    sentence:"How's it going?",
    meaning:'잘 지내? / 어때?',
    reading:null, phoneticKr:'하우즈 잇 고잉',
    explanation:{
      key:'캐주얼 인사. <span class="hl">How are you</span> 보다 자주 씀.',
      situation:'친구·동료 만났을 때 첫 인사. 카페 직원이 손님에게도.',
      grammar:[
        {struct:'<span class="hl">How\'s</span> = How is (축약)', body:'is 의 \'s 축약 — 회화 디폴트.'},
        {struct:'<span class="hl">How is it going</span>', body:'직역 "어떻게 가고 있냐" → "어떻게 지내" 의 idiom.'},
      ],
      chunks:[["How's it","하우즈 잇"],["going","고잉"]],
      phonemes:[["/aʊ/","how"]],
      mistake:'"하우 이즈 잇" X — 축약 "하우즈 잇" 한 호흡. \'s 빼지 말 것.',
      similar:'<span class="hl">How are you</span> / <span class="hl">What\'s up</span> / <span class="hl">How\'s everything</span>',
    },
    interval:60, nextReview:'2026-06-15', consecutivePass:4, lastResult:'O', category:'casual_greeting',
  },

  // ─── 일본어 review (rj1~rj7) ── Wave 11.73 — 응답·리액션 만능 표현 Stage 1 6건 + Stage 2 1건 ───
  //
  // i+1 사슬: rj1~rj6 모두 Stage 1 (knownElements:[]). rj7 Stage 2 (known=['そう'] ← rj3 newElement).
  // 한자 0개 (Stage 1 §4 정합). phoneticKr 4패턴 (장음·촉음·묵음·조사) 적용.
  // nextReview 분포: due today 2 + overdue 2 + future 3 → 자유복습/오늘복습 cover.
  {
    id:'rj1', lang:'ja',
    sentence:'はい',
    meaning:'네 / 응',
    reading:'はい', phoneticKr:'하이',
    explanation:{
      whenToUse:'격식·캐주얼 모두 가능한 긍정 응답. 회사·낯선 사람 사이에서도 OK.',
      grammar:'はい = 긍정 응답 (관용 어휘 — 분해 X)',
      pronPoints:'はい → 하이(가나 그대로 — 특이 패턴 X)',
      similar:'ええ (캐주얼) / うん (반말 / 친구 사이)',
      stage:1, newElements:['はい'], knownElements:[], frequency:10, category:'응답/긍정',
    },
    interval:7, nextReview:'2026-04-28', consecutivePass:2, lastResult:'O', category:'positive_response',
  },
  {
    id:'rj2', lang:'ja',
    sentence:'いいえ',
    meaning:'아니요',
    reading:'いいえ', phoneticKr:'이-에',
    explanation:{
      whenToUse:'격식 부정 응답. 비즈니스·낯선 사람 사이.',
      grammar:'いいえ = 부정 응답 (관용 어휘 — 분해 X)',
      pronPoints:'いいえ → 이-에(장음 い)',
      similar:'いえ (짧은 부정) / いや (반말) / ううん (친구 사이)',
      stage:1, newElements:['いいえ'], knownElements:[], frequency:8, category:'응답/부정',
    },
    interval:3, nextReview:'2026-05-01', consecutivePass:1, lastResult:'O', category:'negative_response',
  },
  {
    id:'rj3', lang:'ja',
    sentence:'そう',
    meaning:'그래 / 맞아',
    reading:'そう', phoneticKr:'소-',
    explanation:{
      whenToUse:'상대방 말에 동의·확인. 캐주얼. 의문문 そう？도 가능.',
      grammar:'そう = 부사적 동의 (관용 어휘 — 분해 X)',
      pronPoints:'そう → 소-(장음 う)',
      similar:'そうそう (강한 동의) / うん (단순 응) / そうだ (강조 단정)',
      stage:1, newElements:['そう'], knownElements:[], frequency:10, category:'응답/동의',
    },
    interval:7, nextReview:TODAY_ISO, consecutivePass:2, lastResult:'O', category:'agreement',
  },
  {
    id:'rj4', lang:'ja',
    sentence:'わかった',
    meaning:'알았어 / 이해했어',
    reading:'わかった', phoneticKr:'와캇타',
    explanation:{
      whenToUse:'지시·설명 받았을 때 즉답. 친구·가족·동료 사이.',
      grammar:'わかった = 동사 わかる 의 과거 (이해함)',
      pronPoints:'わかった → 와캇타(촉음 っ → 받침)',
      similar:'わかります (정중) / りょうかい (캐주얼/군대 톤) / オッケー (외래어)',
      stage:1, newElements:['わかった'], knownElements:[], frequency:10, category:'응답/이해',
    },
    interval:1, nextReview:TODAY_ISO, consecutivePass:0, lastResult:'△', category:'understanding',
  },
  {
    id:'rj5', lang:'ja',
    sentence:'まじで',
    meaning:'진짜? / 정말?',
    reading:'まじで', phoneticKr:'마지데',
    explanation:{
      whenToUse:'놀람·불신 리액션. 친구 사이 캐주얼. 현대 회화 핵심.',
      grammar:'まじ + で (진짜 + 부사 어미)',
      pronPoints:'まじで → 마지데(가나 그대로 — 특이 패턴 X)',
      similar:'ほんとう (격식 / 진짜) / うそ (거짓말 → 놀람 의미)',
      stage:1, newElements:['まじで'], knownElements:[], frequency:9, category:'리액션/놀람',
    },
    interval:3, nextReview:'2026-05-02', consecutivePass:1, lastResult:'O', category:'surprise',
  },
  {
    id:'rj6', lang:'ja',
    sentence:'ちょっと',
    meaning:'잠깐 / 조금',
    reading:'ちょっと', phoneticKr:'촛토',
    explanation:{
      whenToUse:'부탁·거절·요청 부드럽게 만드는 만능 부사. 양해 요청에도.',
      grammar:'ちょっと = 부사 (조금/잠깐)',
      pronPoints:'ちょっと → 촛토(촉음 っ → 받침)',
      similar:'すこし (격식 / 조금) / ちょい (캐주얼 축약) / ちょっとまって (잠깐만)',
      stage:1, newElements:['ちょっと'], knownElements:[], frequency:10, category:'부사/완곡',
    },
    interval:7, nextReview:'2026-05-09', consecutivePass:2, lastResult:'O', category:'softener',
  },
  {
    id:'rj7', lang:'ja',
    sentence:'そうですね',
    meaning:'그렇네요 / 맞네요',
    reading:'そうですね', phoneticKr:'소-데스네',
    explanation:{
      whenToUse:'격식 자리에서 부드러운 동의. 회사·미팅. 즉답 곤란할 때 시간 벌기.',
      grammar:'そう + ですね (동의 부사 + 정중 어미 + 동의 종조사)',
      pronPoints:'です → 데스(묵음 す)',
      similar:'そうだね (캐주얼) / おっしゃるとおりです (격식 강조) / なるほど (격식/이해)',
      stage:2, newElements:['ですね'], knownElements:['そう'], frequency:10, category:'응답/정중동의',
    },
    interval:21, nextReview:'2026-05-20', consecutivePass:3, lastResult:'O', category:'polite_agreement',
  },
];

const TODAY_LESSONS = [
  // ─── 영어 today (te1~te3) ── Wave 11.73 — 회화 빈출 idiom · varData 3타입 ───
  {
    id:'te1', lang:'en', date:TODAY_ISO,
    sentence:"I could use a coffee.",
    meaning:'커피 한잔 마시고 싶다.',
    reading:null, phoneticKr:'아이 쿠 쥬즈 어 커피',
    completed:false, orderIndex:1,
    explanation:{
      key:'<span class="hl">could use X</span> = X 가 좀 있으면 좋겠다 (idiom — 약한 부드러운 표현).',
      situation:'피곤할 때 "뭐 좀 마시고 싶다" 부드러운 제안. 직설보다 캐주얼.',
      grammar:[
        {struct:'<span class="hl">could use</span> = idiom', body:'직역 "사용할 수 있겠다" → "있으면 좋겠다". 약한 욕구 표현.'},
      ],
      chunks:[["I could","아이 쿠"],["use a","쥬즈 어"],["coffee","커피"]],
      phonemes:[["/uː/","use"],["/ʊ/","could"]],
      mistake:'"could use" → "쿠드 유즈" 끊어 X — d 약음, "쿠 쥬즈" 한 호흡. "필요하다" 직역보다 idiom 그대로.',
      similar:'<span class="hl">I\'d love a coffee</span> / <span class="hl">I really need a coffee</span>',
      varData:{
        original:"I could use a coffee.",
        exercises:[
          { type:'주어 변형', prompt:'<strong>주어를 We</strong> 로 바꿔 다시 쓰세요.', expected:["we could use a coffee","we could use a coffee."], examples:["We could use a coffee."] },
          { type:'시제 변형', prompt:'<strong>could</strong> 를 <strong>would love</strong> 로 바꿔 다시 쓰세요.', expected:["i would love a coffee","i would love a coffee.","i'd love a coffee","i'd love a coffee."], examples:["I'd love a coffee."] },
          { type:'표현 변형', prompt:'비슷한 의미 <strong>"I really need"</strong> 로 다시 쓰세요.', expected:["i really need a coffee","i really need a coffee."], examples:["I really need a coffee."] },
        ],
      },
    },
  },
  {
    id:'te2', lang:'en', date:TODAY_ISO,
    sentence:"It is what it is.",
    meaning:'어쩔 수 없지 / 그러려니 해.',
    reading:null, phoneticKr:'이리즈 와리리즈',
    completed:false, orderIndex:2,
    explanation:{
      key:'받아들임 idiom. 바꿀 수 없는 상황에 대한 체념·수용.',
      situation:'어쩔 수 없는 상황. 한탄·체념 톤. 친구·동료 위로하면서도.',
      grammar:[
        {struct:'<span class="hl">It is what it is</span> = 동어반복 idiom', body:'직역 "그것은 그것이다" → "그게 그런 거다" 의 수용 표현.'},
      ],
      chunks:[["It is","이리즈"],["what it is","와리리즈"]],
      phonemes:[["/ɾ/","it is (flap)"]],
      mistake:'"잇 이즈" X — 모든 t 가 모음 사이 flap. "이리즈" 한 호흡 연음.',
      similar:'<span class="hl">That\'s how it is</span> / <span class="hl">Nothing we can do</span> / <span class="hl">Such is life</span>',
      varData:{
        original:"It is what it is.",
        exercises:[
          { type:'주어 변형', prompt:'<strong>It</strong> 을 <strong>They</strong> 로 바꿔 다시 쓰세요.', expected:["they are what they are","they are what they are."], examples:["They are what they are."] },
          { type:'시제 변형', prompt:'<strong>현재</strong>를 <strong>과거</strong>로 바꿔 다시 쓰세요.', expected:["it was what it was","it was what it was."], examples:["It was what it was."] },
          { type:'표현 변형', prompt:'비슷한 표현 <strong>"That\'s how it is"</strong> 로 다시 쓰세요.', expected:["that's how it is","that's how it is.","that is how it is","that is how it is."], examples:["That's how it is."] },
        ],
      },
    },
  },
  {
    id:'te3', lang:'en', date:TODAY_ISO,
    sentence:"Let me get back to you.",
    meaning:'다시 연락드릴게요.',
    reading:null, phoneticKr:'렛 미 겟 백 트유',
    completed:false, orderIndex:3,
    explanation:{
      key:'<span class="hl">get back to X</span> = X 에게 답을 다시 주다 (비즈니스 표준).',
      situation:'즉답 못하고 확인 후 답하겠다는 비즈니스 답. 이메일·통화 양쪽.',
      grammar:[
        {struct:'<span class="hl">Let me</span> = 부드러운 의지', body:'명령문 형태지만 "내가 ~할게" 의 부드러운 자기 의지.'},
        {struct:'<span class="hl">get back to + 사람</span> = 답·연락을 다시 주다', body:'단순 "돌아가다" 가 아니라 "응답을 다시 보내다" 의 idiom.'},
      ],
      chunks:[["Let me","렛 미"],["get back","겟 백"],["to you","트유"]],
      phonemes:[["/æ/","back"]],
      mistake:'"투 유" X — "트유" 약음 연음. "let me" 의 t 도 약음.',
      similar:'<span class="hl">I\'ll follow up</span> / <span class="hl">I\'ll get in touch</span> / <span class="hl">I\'ll let you know</span>',
      varData:{
        original:"Let me get back to you.",
        exercises:[
          { type:'주어 변형', prompt:'<strong>주어를 We</strong> 로 바꿔 다시 쓰세요. (We will 형태)', expected:["we'll get back to you","we'll get back to you.","we will get back to you","we will get back to you."], examples:["We'll get back to you."] },
          { type:'시제 변형', prompt:'<strong>현재</strong>를 <strong>과거</strong>로 바꿔 다시 쓰세요.', expected:["i got back to you","i got back to you."], examples:["I got back to you."] },
          { type:'표현 변형', prompt:'비슷한 표현 <strong>"I\'ll follow up"</strong> 으로 다시 쓰세요.', expected:["i'll follow up with you","i'll follow up with you.","i will follow up with you","i'll follow up","i'll follow up."], examples:["I'll follow up with you."] },
        ],
      },
    },
  },

  // ─── 일본어 today (tj1~tj3) ── Wave 11.73 — 만능 리액션 Stage 1 2건 + Stage 2 1건 ───
  // tj3 의 known=['わかった'] ← rj4 newElement 사슬.
  {
    id:'tj1', lang:'ja', date:TODAY_ISO,
    sentence:'すごい',
    meaning:'대단해 / 짱이야',
    reading:'すごい', phoneticKr:'스고이',
    completed:false, orderIndex:1,
    explanation:{
      whenToUse:'칭찬·감탄 리액션. 만능 긍정 표현. 친구·가족 사이 빈출.',
      grammar:'すごい = 형용사 (감탄)',
      pronPoints:'すごい → 스고이(묵음 す 약하게)',
      similar:'やばい (강조 감탄 — 좋고 나쁨 양쪽) / さすが (역시) / いいね (좋네)',
      stage:1, newElements:['すごい'], knownElements:[], frequency:10, category:'리액션/감탄',
    },
  },
  {
    id:'tj2', lang:'ja', date:TODAY_ISO,
    sentence:'だいじょうぶ',
    meaning:'괜찮아 / 문제 없어',
    reading:'だいじょうぶ', phoneticKr:'다이죠-부',
    completed:false, orderIndex:2,
    explanation:{
      whenToUse:'안심·거절 양쪽. 사과 받았을 때 "괜찮아" 또는 권유 부드러운 거절.',
      grammar:'だいじょうぶ = 형용동사 (괜찮음 — 어원 大丈夫 의 가나 표기)',
      pronPoints:'だいじょうぶ → 다이죠-부(장음 う)',
      similar:'もんだいない (문제 없다 / 격식) / へいき (태연 / 괜찮음)',
      stage:1, newElements:['だいじょうぶ'], knownElements:[], frequency:10, category:'응답/안심',
    },
  },
  {
    id:'tj3', lang:'ja', date:TODAY_ISO,
    sentence:'わかったよ',
    meaning:'알겠어 (강조)',
    reading:'わかったよ', phoneticKr:'와캇타요',
    completed:false, orderIndex:3,
    explanation:{
      whenToUse:'친구 사이 동의·이해 강조. よ 가 발화자 입장 부각. rj4 わかった 의 강조형.',
      grammar:'わかった + よ (이해함 + 단정·강조 종조사)',
      pronPoints:'わかった → 와캇타(촉음 っ → 받침)',
      similar:'わかった (단순 이해) / わかったって (귀찮음 강조) / りょうかい (캐주얼)',
      stage:2, newElements:['よ'], knownElements:['わかった'], frequency:8, category:'응답/이해강조',
    },
  },
];

// 사용자 historical 학습 기록 — 첫 시드 시만 push (마이그레이션 시 보존).
// sentenceIds 는 reviewQueue.id 참조 (Wave 11.73 에서 콘텐츠만 갱신, ID 슬롯 동일).
const SESSION_LOGS = [
  { id:'sl-20260401', lang:'en', date:'2026-04-01', category:'casual_greeting',  durationSec: 18*60, newCount:2, reviewResults:{O:6,'△':1,X:0}, utteranceCount:12, passCount: 9, sessionType:'normal',      sentenceIds:['re7'], newSentenceIds:['re7'] },
  { id:'sl-20260403', lang:'en', date:'2026-04-03', category:'wrap_up',          durationSec: 14*60, newCount:1, reviewResults:{O:5,'△':0,X:0}, utteranceCount: 8, passCount: 6, sessionType:'normal',      sentenceIds:['re6'], newSentenceIds:['re6'] },
  { id:'sl-20260404', lang:'en', date:'2026-04-04', category:'wait_request',     durationSec: 26*60, newCount:3, reviewResults:{O:7,'△':2,X:1}, utteranceCount:18, passCount:13, sessionType:'normal',      sentenceIds:['re4'], newSentenceIds:['re4'] },
  { id:'sl-20260405', lang:'en', date:'2026-04-05', category:'reassurance',      durationSec:  8*60, newCount:0, reviewResults:{O:2,'△':1,X:0}, utteranceCount: 3, passCount: 2, sessionType:'free_review', sentenceIds:['re2'], newSentenceIds:[] },
  { id:'sl-20260407', lang:'ja', date:'2026-04-07', category:'polite_agreement', durationSec: 22*60, newCount:2, reviewResults:{O:6,'△':1,X:1}, utteranceCount:15, passCount:11, sessionType:'normal',      sentenceIds:['rj7'], newSentenceIds:['rj7'] },
  { id:'sl-20260408', lang:'en', date:'2026-04-08', category:'work_progress',    durationSec: 30*60, newCount:3, reviewResults:{O:8,'△':2,X:1}, utteranceCount:22, passCount:16, sessionType:'normal',      sentenceIds:['re5'], newSentenceIds:['re5'] },
  { id:'sl-20260410', lang:'en', date:'2026-04-10', category:'disbelief',        durationSec: 27*60, newCount:2, reviewResults:{O:7,'△':1,X:1}, utteranceCount:18, passCount:13, sessionType:'normal',      sentenceIds:['re1','re3'], newSentenceIds:['re1','re3'] },
  { id:'sl-20260411', lang:'ja', date:'2026-04-11', category:'surprise',         durationSec: 20*60, newCount:1, reviewResults:{O:5,'△':2,X:1}, utteranceCount:14, passCount: 9, sessionType:'normal',      sentenceIds:['rj5'], newSentenceIds:['rj5'] },
  { id:'sl-20260412', lang:'ja', date:'2026-04-12', category:'agreement',        durationSec: 10*60, newCount:0, reviewResults:{O:3,'△':1,X:0}, utteranceCount: 5, passCount: 4, sessionType:'free_review', sentenceIds:['rj3'], newSentenceIds:[] },
  { id:'sl-20260414', lang:'ja', date:'2026-04-14', category:'positive_response',durationSec: 28*60, newCount:3, reviewResults:{O:7,'△':2,X:1}, utteranceCount:20, passCount:14, sessionType:'normal',      sentenceIds:['rj1','rj2'], newSentenceIds:['rj1','rj2'] },
  { id:'sl-20260415', lang:'ja', date:TODAY_ISO,    category:'softener',         durationSec: 14*60, newCount:2, reviewResults:{O:4,'△':1,X:0}, utteranceCount: 9, passCount: 7, sessionType:'normal',      sentenceIds:['rj4','rj6'], newSentenceIds:['rj4','rj6'] },
];

const DAILY_STATS = SESSION_LOGS.map((s) => ({
  date: s.date,
  lang: s.lang,
  utteranceCount: s.utteranceCount,
  studyTimeSec: s.durationSec,
  newSentences: s.newCount,
  reviewCount: s.reviewResults.O + s.reviewResults['△'] + s.reviewResults.X,
}));

// Wave 11.71 — v8: 콘텐츠 전면 갈아엎기 (영어 10 / 일본어 10).
// Wave 11.71 — v9: 일본어 카드 spec 정합 정정.
// Wave 11.72 — v10: ja similar 필드 한자 제거 (학습자 한자 못 읽음 가정 정합).
// Wave 11.73 — v11: 콘텐츠 전면 갈아엎기 (사용자 명시 요청 — "기존 더미 삭제 후 신규 각 10개").
//   - en: What's up?/I'm not gonna lie/Take it easy/Long time no see/Could you give me a hand/I have no idea/Sounds good to me
//         → Got it/No worries/Are you serious?/Hold on a sec/I'm working on it/Let's call it a day/How's it going? (Stage 1~2 mix)
//   - en today: What's the catch/I'm down for that/I'll get right on it
//                → I could use a coffee/It is what it is/Let me get back to you (idiom 회화 빈출 + varData 3타입)
//   - ja review: ありがとう/おはよう/すみません/ごめん/やばい/おやすみ/ありがとうございます
//                → はい/いいえ/そう/わかった/まじで/ちょっと/そうですね (응답·리액션 만능)
//   - ja today: いただきます/ごちそうさま/おやすみなさい
//                → すごい/だいじょうぶ/わかったよ (Stage 1 2 + Stage 2 1, i+1 사슬)
//   - i+1 사슬: rj7 known=['そう']←rj3, tj3 known=['わかった']←rj4
//   - phoneticKr §6 4패턴 정합. Stage 1 카드 한자 0개.
//   - SESSION_LOGS sentenceIds 는 ID 슬롯 재사용으로 무결성 유지. 카테고리 라벨만 새 카드 카테고리에 맞춰 정정.
//   - mocks/session.html CARDS.en/CARDS.ja 동기화.
//   - REVIEW_UPDATE_FIELDS 에 explanation 포함 → v10 받은 사용자 자동 update (학습 진도 보존).
const SEED_VERSION = 'v11';

const REVIEW_UPDATE_FIELDS = ['sentence', 'meaning', 'reading', 'phoneticKr', 'explanation'];
const LESSON_UPDATE_FIELDS = ['sentence', 'meaning', 'reading', 'phoneticKr', 'explanation'];

function pickFields(card, fields) {
  const out = {};
  for (const f of fields) {
    if (f in card) out[f] = card[f];
  }
  return out;
}

export async function seedIfNeeded(db) {
  if (!db) throw new Error('seedIfNeeded: db 인자 누락 (Wave 11.12 부터 팩토리 인스턴스 명시 필수)');
  const marker = await db.meta.get('seeded');
  if (marker?.value === SEED_VERSION) return { skipped: true };

  const isFirstSeed = !marker?.value;
  let addedReview = 0;
  let addedLessons = 0;
  let deletedObsolete = 0;

  await db.transaction('rw', db.reviewQueue, db.todayLessons, db.sessionLogs, db.dailyStats, db.meta, async () => {
    // Wave 11.71 — OBSOLETE 잔존분 명시적 삭제 (학습 진도까지 폐기, 사용자 명시 요청).
    if (!isFirstSeed) {
      const existingObsoleteReview = await db.reviewQueue.bulkGet(OBSOLETE_REVIEW_IDS);
      const obsoleteReviewIds = OBSOLETE_REVIEW_IDS.filter((_, i) => existingObsoleteReview[i]);
      if (obsoleteReviewIds.length > 0) {
        await db.reviewQueue.bulkDelete(obsoleteReviewIds);
        deletedObsolete += obsoleteReviewIds.length;
      }
      const existingObsoleteLessons = await db.todayLessons.bulkGet(OBSOLETE_LESSON_IDS);
      const obsoleteLessonIds = OBSOLETE_LESSON_IDS.filter((_, i) => existingObsoleteLessons[i]);
      if (obsoleteLessonIds.length > 0) {
        await db.todayLessons.bulkDelete(obsoleteLessonIds);
        deletedObsolete += obsoleteLessonIds.length;
      }
    }

    const existingReview = await db.reviewQueue.bulkGet(REVIEW_CARDS.map((c) => c.id));
    const missingReview = REVIEW_CARDS.filter((_, i) => !existingReview[i]);
    if (missingReview.length > 0) {
      await db.reviewQueue.bulkAdd(missingReview);
      addedReview = missingReview.length;
    }
    for (let i = 0; i < REVIEW_CARDS.length; i++) {
      if (existingReview[i]) {
        const c = REVIEW_CARDS[i];
        await db.reviewQueue.update(c.id, pickFields(c, REVIEW_UPDATE_FIELDS));
      }
    }
    if (!isFirstSeed) {
      const settings = await db.meta.get('studySettings');
      if (settings?.value) {
        settings.value.autoTTS = false;
        await db.meta.put({ key: 'studySettings', value: settings.value, at: Date.now() });
      }
    }

    const existingLessons = await db.todayLessons.bulkGet(TODAY_LESSONS.map((c) => c.id));
    const missingLessons = TODAY_LESSONS.filter((_, i) => !existingLessons[i]);
    if (missingLessons.length > 0) {
      await db.todayLessons.bulkAdd(missingLessons);
      addedLessons = missingLessons.length;
    }
    for (let i = 0; i < TODAY_LESSONS.length; i++) {
      if (existingLessons[i]) {
        const c = TODAY_LESSONS[i];
        await db.todayLessons.update(c.id, pickFields(c, LESSON_UPDATE_FIELDS));
      }
    }

    if (isFirstSeed) {
      await db.sessionLogs.bulkPut(SESSION_LOGS);
      await db.dailyStats.bulkPut(DAILY_STATS);
    }

    await db.meta.put({ key: 'seeded', value: SEED_VERSION, at: new Date().toISOString() });
  });

  return {
    skipped: false,
    isFirstSeed,
    version: SEED_VERSION,
    counts: {
      reviewQueueAdded: addedReview,
      todayLessonsAdded: addedLessons,
      obsoleteDeleted: deletedObsolete,
      sessionLogs: isFirstSeed ? SESSION_LOGS.length : 0,
      dailyStats: isFirstSeed ? DAILY_STATS.length : 0,
    },
  };
}

export default seedIfNeeded;
