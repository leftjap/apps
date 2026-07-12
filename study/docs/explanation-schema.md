# Explanation 스키마 — 형식 메타

> 카드별 `explanation` 필드 + ReviewCard 메타 (en/ja 공통 구조).
>
> **콘텐츠 작성 가이드 (en, 정본):** [./lesson-explanation-guide-en.md](./lesson-explanation-guide-en.md) — ⭐ **활성 = §6.3 RealClass-mining** (scene 카드 다이얼로그-우선 + 표현 카드 drills, 2026-06-08 전환). i+1·발음·phonetic_kr 일반 원칙 동일.
>
> **콘텐츠 작성 가이드 (ja, 정본):** [./lesson-explanation-guide-ja.md](./lesson-explanation-guide-ja.md) — i+1·1T·Stage 1~4·4패턴 발음·explanation 4필드 (whenToUse/grammar/pronPoints/similar)·variations 비활성 (Stage 1~2).

## en/ja 공통 ReviewCard 메타 (5필드 + phonetic_kr) — ⚠️ ja 정본 (en RealClass 는 미사용: §scene 카드·guide §6.3)

| 필드 | 형식 | 용도 |
|---|---|---|
| `stage` | 1 \| 2 \| 3 \| 4 (ja: 1~5) | 학습 단계 |
| `newElements` | string[] (콩트 단위 length===1 — 콩트 1편 안 정확히 1장만 length===1, 나머지 카드 length===0) | 학습자 신규 요소 (1T 원칙, 콩트 1편당 1요소). 룰 박제: 펀치라인 문장에 박는 것이 자연스러움 |
| `knownElements` | string[] | prerequisite 검사 (콩트 사슬 단위 — 본 콩트 직전까지의 콩트들 newElements 합집합 + 본 콩트 newElements 에 포함) |
| `frequency` | 1~10 | 빈도 (높을수록 우선) |
| `category` | string | 분류 |
| `phonetic_kr` | string | 한국인 즉시 발음 가능 표기 |

## 콩트 메타 (4필드, Wave 11.7x) — ja 전용 (en 은 2026-06-08 RealClass-mining 전환, §scene 카드 참조)

| 필드 | 형식 | 용도 |
|---|---|---|
| `skitId` | string (`<lang>-<date>-skit<N>`) | 콩트 묶음 식별자. 같은 skitId 카드 = 한 콩트 |
| `skitTitle` | string | 콩트 제목 (예: "Empty Fridge Plans") |
| `skitOrder` | integer (1-base) | 콩트 안 순서. 1=셋업, skitTotal=펀치라인 |
| `skitTotal` | integer | 콩트 안 총 문장 수. Stage 별 가이드 (en §3 / ja §4 콩트 분량 컬럼) 준수 |

**콩트 단위 원칙 (ja):**
- 하루 = ja 콩트 1편 (default. en 은 RealClass 1장면 — §scene 카드). 사용자가 "N편" 명시 시 그 수만큼
- 콩트 호흡 = 셋업 → 전개 → 펀치라인 (캐릭터 2~3명, 펀치라인 1개)
- 분량은 콩트가 결정. 정해진 N문장 강제 X — Stage 별 가이드 범위 안에서 자연스럽게
- newElements 박는 위치: 펀치라인 문장 (skitOrder === skitTotal) 권장. 셋업/전개에 신규 요소 등장 시 그 문장의 knownElements 에는 안 들어가지만, 같은 콩트 펀치라인 newElements 가 prerequisite 충족시킴

## explanation 필드 차이 (en vs ja)

| 영역 | en (정본) | ja (정본) |
|---|---|---|
| 핵심 라벨 | `keyPoint` | (없음, `whenToUse` 가 첫 라벨) |
| 사용 상황 | `whenToUse` | `whenToUse` |
| 문법 | `grammar: {structure, explanation}` 객체 | `grammar` 한 줄 형태소 분해 |
| 발음 — 청크 | `pronunciation.chunks: [{en,kr}]` 객체 배열 | (없음, phonetic_kr 한 줄로 대체) |
| 발음 — 팁 | `pronunciation.tips` | `pronPoints` (4패턴 중 해당) |
| 발음 — 음소 | `pronunciation.weak_focus: [IPA]` | (없음) |
| 실수 | `commonMistakes` | (없음) |
| 유사 표현 | `similar` | `similar` |
| 변형 연습 | `variations` (Stage 3+ 만) | (Stage 1~2 미포함, Stage 3+ 추후) |

## 현재 drift 상태 (Wave 11.34, 정직히)

- **정본**: 위 en/ja 가이드 (i+1 + Stage 1~4 + 메타 5필드 + 트랙별 explanation 분기)
- **mocks fixture (r1-r5) + renderExplain 코드**: 시안 시점 형식 (`key` / `grammar:[{struct,body}]` / `chunks:[[en,kr]]` / `phonemes:[[ipa,word]]` / `mistake`). 메타 5필드 미존재
- **ja seed (jr1-5, v5)**: mocks fixture 호환용 형식. 가이드와 다름
- **DB 스키마**: `user_known_*` / `sentence_elements` / `user_phoneme_scores` 미존재 → i+1 알고리즘 구현 불가

drift fix 는 multi-wave 진행 필요 (en/ja 가이드 §11~12 의 spec 영향 영역 참조). 렌더 코드: [mocks/session.html](../mocks/session.html) `renderExplain()` (line ~1079).

## 형식

```js
{
  key: '핵심 포인트 한 문장 (15~30자)',
  situation: '이 표현이 자연스러운 상황 (한 줄)',
  grammar: [
    { struct: '문법 구조', body: '구체 설명 (한국어 어순 비교 / 생략·도치 이유)' },
    // 1~3건 권장
  ],
  chunks: [
    ['덩어리 텍스트', '한국어 음차'],
    // 발음 단위로 끊어 — 연음·축약 반영. en: 영문 / ja: 히라가나 또는 한자
  ],
  phonemes: [
    ['/IPA/', '단어 또는 음절 위치'],
    // 한국인이 어려워하는 음소 1~3건
  ],
  mistake: '한국인이 자주 하는 실수 (한 문단)',
  similar: '비슷한 표현 비교 (한 문단)',
  drills: [
    { en: '핵심 요소를 레벨맞춤으로 치환한 응용 문장', ko: '한국어 뜻', kr: '한글 음차 (연음 반영 — en 의무)' },
    // 각 문장 = 듣기(TTS)/녹음(발음채점) 가능. 개수는 내용·레벨 기반 (3~8), 고정 quota X
  ],
}
```

## scene 카드 — 전체 다이얼로그 (RealClass-mining 모델, en 활성)

세션 첫 페이지 = 장면 전체 다이얼로그. **카드 1장 (`order_index: 0`)** 의 explanation 에 박힘. 형식 정본 = [`seeds/en-parks-s1e1.json`](../seeds/en-parks-s1e1.json).

| 필드 | 형식 | 비고 |
|---|---|---|
| `sceneTitle` | string | 다이얼로그 페이지 제목 (없으면 '오늘의 장면') |
| `sceneSummary` | string (선택) | 1~2줄 상황 요약 |
| `dialogue` | `[{speaker, en, ko}]` | 6~10줄. **이 필드 존재 = scene 카드로 인식** |

**동작 (코드 박제 — 시드 측 추가 작업 없음):**
- 감지: `src/pages/session-new.js` 가 현재 카드 `explanation.dialogue` 배열 존재 시 다이얼로그 페이지 렌더 (`components/session/scenePage.js`, D1 데스크탑 = `renderD1Dialogue`)
- 정렬: scene 카드 `order_index 0` → `pages/cardLoader.js` `loadNewCards` (date FIFO → order_index ASC) 가 세션 첫 카드로 배치
- 복습 제외: `services/sessionFinish.js` 가 scene 카드 (`explanation.dialogue` 보유) 를 복습 큐 이관에서 제외 (완료 표시만)
- 색 강조: D1 다이얼로그가 표현 카드 문장과 자동 매칭 강조 — 시드 측 highlights 필드 불필요

## drills — 응용 연습 (RealClass-mining 모델 신규)

문장의 핵심 요소(기본동사·구동사·유용 명사 등 — AI가 식별)를 **레벨맞춤으로 다양하게 치환**한 연습 문장 배열. "응용"이 영어 학습 핵심이라는 정본.

| 필드 | 형식 | 비고 |
|---|---|---|
| drills | `[{en, ko, kr}]` 객체 배열 | 각 행 = 응용 문장 1개. en 필수, ko 권장, **kr = 한글 음차 의무 (en 신규, 2026-06-10)** — 녹음 연습 발음 가이드, 연음/flap 반영 |

**규칙:**
- **개수**: 내용·레벨 기반. 핵심·헷갈리는 요소 6~8개, 쉬운 요소 3개. 고정 quota 금지
- **구성**: 같은 뜻 패턴 치환 ~70%(패턴 그루빙) + 뜻 범위 ~30%(응용 폭). 자연·빈출·레벨맞춤만 — 기계적 슬롯 채우기 금지
- ⛔ **근접중복 금지 (게이트 차단, 2026-07-10)**: **base 의 문법 맥락이 그대로면 변주가 아니다.**
  변주 = **주어·시제·극성·문형·목적어 중 하나 이상을 바꾼 것.**

  차단 두 종류:
  1. **호칭류** — 쉼표로 호칭·감탄사·담화표지·문미태그만 덧붙인 것
     ❌ `It's been a while, honey.` · `Seems like yesterday, doesn't it?` · `Sir, is there a problem?`
  2. **꼬리확장** — base 를 통째로 앞에 두고 **뒤에 말만 덧붙인 것** (2026-07-10 사용자 지적)
     ❌ `Is there a problem?` → `Is there a problem here?` · `Is there a problem with that?`
     ❌ `I have no appetite.` → `I have no appetite these days.` · `It's your turn.` → `It's your turn now.`
     → 주어·시제·극성·문형·목적어가 **하나도 안 바뀐다.**

  통과:
  - `base` 와 **완전 동일한** 드릴(영상 원문 반복)은 **1개까지**
  - **앞에 주어를 붙인 것**은 변주 — `Seems like yesterday.` → `Our wedding seems like yesterday.`
  - **종결부호가 바뀌면**(평서→의문) 문형 변경이므로 변주 — `It's your turn.` → `It's your turn now?`
  - ✅ `Is there a problem?` → `Do we have a problem?` (주어·문형 변경)
  - ✅ `It's been a while.` → `Has it been a while since your last trip?` / `It hasn't been long since I fed the cat.`

  판정 단일 출처 = `src/components/session/applied.js` `nearDupDrills()` (게이트·렌더 공유).
  ⚠️ 쉼표 조건 없이 `base 포함 + 2단어 이하 추가`만 보면 **주어 추가를 오탐**한다(105편 433건). 반대로 쉼표만 보면 **꼬리확장을 놓친다**(105편 772건). 둘 다 필요하다.
- **UI**: 각 drill 행에 🔊(TTS `studySpeech.speak`) + ⏺(녹음→발음채점 `services/sessionAnalyze.js`) 자동 부착 → 듣기·말하기·녹음. kr 음차는 en 아래 faint 줄
- **렌더**: phone/tablet = `components/session/explanationPanel.js` `drillsSection` / D1 데스크탑 = `components/d1/sessionShell.js` `buildD1DrillRows` (양쪽 kr 지원, 누락 시 미표시 — 구 시드 호환). 신규 세션은 `sessionExprV2.js` 가 `filterNearDupDrills()` 로 구 데이터를 한 번 더 거른다(안전망)

## chain — 무자막 체이닝 (2026-07-09 신설, `ladder` 대체)

자막 없이 **듣고 따라 말하며** base 를 2문장 수준까지 확장 (elicited imitation). 표현 카드 `explanation.chain`.

```json
"chain": {
  "target": "I have no appetite these days. Maybe I'm just tired from work.",
  "chunks": ["I have no appetite", "these days.", "Maybe I'm just tired", "from work."],
  "ko": "요즘 입맛이 없어. 일 때문에 그냥 피곤한가 봐."
}
```
(단계 4→6→10→12단어: base → +시간부사구 → +추측절 → +원인 전치사구)

| 필드 | 규칙 |
|---|---|
| `target` | base 에 **확장 성분을 하나씩 쌓아** 지은 실제 쓰는 발화. 10~14단어·2문장 수준 권장 (8단어 미만 경고 — 짧으면 앵무새 반복) |
| `chunks` | `[base, 확장성분1, …]` 2~8개. **한 chunk = 성분 1개**(부사구·전치사구·형용사·접속절 — 1~4단어, 절 최대 5. 초과 경고). 분절은 자연 쉼·억양 경계에서만 — 성분 내부 절단(`or` 단독 등) 금지. **순서대로 이어붙이면 `target` 과 일치**(불일치 차단). 10단어+ 인데 3단계 이하면 경고 |
| `ko` | **의무**. 마지막 단계 3회 실패 시 첫 힌트 |

- **단계 세분화 (2026-07-13 사용자 결정)**: 체이닝의 목적 = base 반복 + **확장 요소(부사·형용사·접속사)가 어떻게 붙는지의 감각 학습**. 그래서 한 단계에 성분 하나씩 쌓는다 — build-up 드릴의 "조금씩 추가" 원칙 + sentence combining 연구(기본절에 수식어를 하나씩 결합하는 훈련이 문장 구성력 향상, Graham & Perin 메타분석 효과크기 0.5-0.7) 근거. 세분이 부족하면 chunk 를 억지로 쪼개지 말고(쉼·억양 경계=자연 청크 경계) **target 자체를 확장요소 스택으로 재구성**한다.
- **자막 금지가 계약**: 화면에 영어를 절대 노출하지 않는다. 회귀 테스트 = `src/pages/sessionExprV2.test.js` · `sessionReviewV2.test.js`
- **단계 텍스트는 `target` 의 원문 접두부**다 (`buildChainSteps`). `chunks` 는 끊는 위치만 정한다 — 이어붙이면 구두점이 사라져 `…with that`(물음표 소실)·`…caught up We should`(런온) 오디오가 나온다 (2026-07-10 수정)
- **통과 = 단어 누락 0** (`EnableMiscue` → `passesCoverage`). 발음 정확도 하한 없음
- **힌트**: 3회 실패부터. 마지막 단계는 뜻 → 첫 단어 → 전체, **중간 단계는 뜻을 건너뛴다**(전체 뜻이 뒷 문장을 미리 알려주므로)
- 재생마다 화자·속도 변주 (`pickChainVoice`) — 리듬 통째 암기 차단
- ⚠️ `ladder`(확장 사다리)는 **2026-07-09 폐기**. 저작 금지, 렌더 제거됨

## 필드별 규칙

| 필드 | 형식 | 비고 |
|---|---|---|
| key | string | 문장의 의미·문법 핵심 한 줄. **이 표현은 …** 패턴 권장 |
| situation | string | "이런 상황에서 써요" 라벨로 표시. 직장·친구 등 맥락 |
| grammar | `[{struct, body}]` 객체 배열 | 단순 string 배열도 호환되나 객체 형식 정본 |
| chunks | `[[text, phonetic]]` 튜플 배열 | en: 영문+한국어 음차 / ja: 히라가나(또는 한자)+한국어 음차 |
| phonemes | `[[ipa, word]]` 튜플 배열 | en: IPA + 단어 / ja: 음절(つ/だい 등) + 한국어 묘사 가능 |
| mistake | string | "한국인 실수" 라벨로 표시 |
| similar | string | "비슷한 표현" 라벨로 표시. `<span class="hl">텍스트</span>` 강조 가능 |

## 콘텐츠 작성 원칙

- **구어체 우선** (en): gonna, wanna, gotta, kinda, lemme — 실제 원어민 빈도 높은 표현
- **한국어 음차** (chunks): 연음·축약·생략 반영. 사전 발음 X, 실제 빠른 발화 기준
- **문법 객체화** (grammar): 단순 키워드 나열 X. `struct` 에 패턴 명시 + `body` 에 한국어 학습자 입장 설명
- **음소 선별** (phonemes): 한국인이 헷갈리는 1~3건만. 모든 음소 X
- **단정형 회피**: "꼭/반드시" 보다 "권장/자연스러움" 표현
- **html 태그 허용** — `<span class="hl">…</span>` 강조, `<br>` 줄바꿈. 다른 태그는 escape 필요

## 예시 (en — 활성 RealClass 표현 카드, 2026-06-10 현행화. 실 시드 = seeds/en-2026-06-10-2.json)

```js
{
  key: 'Is that a promise? = 약속하는 거예요? 상대의 말을 못박아 확인하는 되묻기.',
  situation: '장면 · 레슬리의 다짐에 앤이 진짜냐고 확인',
  drills: [
    { en: 'Is that a promise?', ko: '약속하는 거죠?', kr: '이즈 대러 프라미스?' },
    { en: 'Is that a yes?', ko: '그거 승낙인 거죠?', kr: '이즈 대러 예스?' },
    { en: 'Is that a deal?', ko: '그럼 그렇게 하기로 한 거죠?', kr: '이즈 대러 디-일?' },
    // … 핵심·헷갈리는 표현 6~8 / 쉬운 표현 3 (§drills 규칙)
  ],
  grammar: [
    { struct: 'Is that a + 명사?', body: "상대가 방금 한 말을 '~인 거예요?' 라고 한 단어로 규정해 확인. that = 방금 그 말." },
  ],
  chunks: [['Is that a', '이즈 대러'], ['promise?', '프라미스?']], // 이어붙임 = phonetic_kr 와 일치 의무
  phonemes: [['/ð/', "that — 혀끝 이 사이 '대'"], ['/ɾ/', "that a → '대러' (flap 연결)"]],
  mistake: "that a 를 끊어 '댓 어' (X) — 연음 '대러' 한 호흡. 프로미스(X) 프라미스(O).",
  similar: 'Do you promise? / You promise?',
  category: 'chunk/confirmation',
  frequency: 8,
}
```

## 예시 (ja)

```js
{
  key: '정중한 감사 표현',
  situation: '비즈니스·격식 자리에서 감사 표현',
  grammar: [
    { struct: 'ます형 = 정중체 어미', body: '동사 끝 ます/です 가 격식 표시. 친구 사이엔 생략' },
    { struct: 'ありがとう 는 형용사 ありがたい (감사할 만하다) 의 て형', body: '어원적으로 "감사할 만한 일" 이라는 형용사. ございます 가 더해져 정중체' }
  ],
  chunks: [['ありがとう', '아리가또우'], ['ございます', '고자이마스']],
  phonemes: [['/r/', 'ありがとう (r flap)'], ['/z/', 'ございます (z 유성음)']],
  mistake: 'ありがとう 단독은 친구·반말. 격식엔 ございます 까지',
  similar: 'どうもありがとうございます (더 정중)',
}
```

## seed 추가 절차

1. `src/db/seed.js` 의 `REVIEW_CARDS` 배열에 카드 추가 — 위 형식 explanation 채움
2. `SEED_VERSION` bump (예: v5 → v6)
3. `seedIfNeeded` 의 v?-→v? 마이그레이션 path 가 자동으로 기존 카드의 explanation·sentence·meaning·reading update — 학습 진도 (interval/nextReview/consecutivePass/lastResult) 보존

## 회귀 방지

- `renderExplain` ([mocks/session.html](../mocks/session.html)) 가 정본 형식 + 단순 string 배열 양 형식 모두 지원 (Wave 11.34). drift 방어
- spec §5 의 deprecated 형식 (keyPoint / commonMistakes / pronunciation 객체) 사용 금지 — 본 docs 형식 우선
