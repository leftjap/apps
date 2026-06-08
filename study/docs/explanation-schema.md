# Explanation 스키마 — 형식 메타

> 카드별 `explanation` 필드 + ReviewCard 메타 (en/ja 공통 구조).
>
> **콘텐츠 작성 가이드 (en, 정본):** [./lesson-explanation-guide-en.md](./lesson-explanation-guide-en.md) — i+1·1T·Stage 1~4·구어 축약/리액션·chunks 객체·IPA weak_focus·variations Stage 3+·shadowing.
>
> **콘텐츠 작성 가이드 (ja, 정본):** [./lesson-explanation-guide-ja.md](./lesson-explanation-guide-ja.md) — i+1·1T·Stage 1~4·4패턴 발음·explanation 4필드 (whenToUse/grammar/pronPoints/similar)·variations 비활성 (Stage 1~2).

## en/ja 공통 ReviewCard 메타 (5필드 + phonetic_kr)

| 필드 | 형식 | 용도 |
|---|---|---|
| `stage` | 1 \| 2 \| 3 \| 4 (ja: 1~5) | 학습 단계 |
| `newElements` | string[] (콩트 단위 length===1 — 콩트 1편 안 정확히 1장만 length===1, 나머지 카드 length===0) | 학습자 신규 요소 (1T 원칙, 콩트 1편당 1요소). 룰 박제: 펀치라인 문장에 박는 것이 자연스러움 |
| `knownElements` | string[] | prerequisite 검사 (콩트 사슬 단위 — 본 콩트 직전까지의 콩트들 newElements 합집합 + 본 콩트 newElements 에 포함) |
| `frequency` | 1~10 | 빈도 (높을수록 우선) |
| `category` | string | 분류 |
| `phonetic_kr` | string | 한국인 즉시 발음 가능 표기 |

## en/ja 공통 콩트 메타 (4필드, Wave 11.7x — 시트콤/콩트 호흡 정본화)

| 필드 | 형식 | 용도 |
|---|---|---|
| `skitId` | string (`<lang>-<date>-skit<N>`) | 콩트 묶음 식별자. 같은 skitId 카드 = 한 콩트 |
| `skitTitle` | string | 콩트 제목 (예: "Empty Fridge Plans") |
| `skitOrder` | integer (1-base) | 콩트 안 순서. 1=셋업, skitTotal=펀치라인 |
| `skitTotal` | integer | 콩트 안 총 문장 수. Stage 별 가이드 (en §3 / ja §4 콩트 분량 컬럼) 준수 |

**콩트 단위 원칙:**
- 하루 = en 콩트 1편 + ja 콩트 1편 (default). 사용자가 "N편" 명시 시 그 수만큼
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
    { en: '핵심 요소를 레벨맞춤으로 치환한 변주 문장', ko: '한국어 뜻' },
    // 각 문장 = 듣기(TTS)/녹음(발음채점) 가능. 개수는 내용·레벨 기반 (3~8), 고정 quota X
  ],
}
```

## drills — 변주 연습 (RealClass-mining 모델 신규)

문장의 핵심 요소(기본동사·구동사·유용 명사 등 — AI가 식별)를 **레벨맞춤으로 다양하게 치환**한 연습 문장 배열. "변주"가 영어 학습 핵심이라는 정본.

| 필드 | 형식 | 비고 |
|---|---|---|
| drills | `[{en, ko}]` 객체 배열 | 각 행 = 변주 문장 1개. en 필수, ko 권장 |

**규칙:**
- **개수**: 내용·레벨 기반. 핵심·헷갈리는 요소 6~8개, 쉬운 요소 3개. 고정 quota 금지
- **구성**: 같은 뜻 패턴 치환 ~70%(패턴 그루빙) + 뜻 범위 ~30%(변주 폭). 자연·빈출·레벨맞춤만 — 기계적 슬롯 채우기 금지
- **UI**: 각 drill 행에 🔊(TTS `studySpeech.speak`) + ⏺(녹음→발음채점 `services/sessionAnalyze.js`) 자동 부착 → 듣기·말하기·녹음
- **렌더**: `components/session/explanationPanel.js` 의 `drillsSection(ex.drills, {lang})` (key 섹션 직후 append)

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

## 예시 (en)

```js
{
  key: '<span class="hl">I\'m not gonna lie</span>는 "솔직히 말하면" 의 관용 표현. gonna = going to 의 구어체 축약.',
  situation: '힘든 경험을 솔직하게 털어놓을 때. 친구끼리 편하게 대화하는 상황.',
  grammar: [
    { struct: '<span class="hl">I\'m not gonna lie</span> = 관용 표현 (문장 전체가 부사 역할)', body: '한국어는 "솔직히"를 한 단어로 놓지만, 영어는 절 전체가 앞에 옴.' },
    { struct: '<span class="hl">pretty</span> = 부사 "꽤" (형용사 아님)', body: 'pretty + 형용사 = 꽤 ~한. very 보다 캐주얼.' }
  ],
  chunks: [["I'm not gonna lie", '아임나러나 라이'], ['that was', '대러즈'], ['pretty rough', '프리리 러프']],
  phonemes: [['/ʌ/', 'gonna'], ['/f/', 'rough'], ['/ɾ/', 'pretty']],
  mistake: '"gonna" 를 "고나" 로 발음 — /ɡʌnə/ "거나" 에 가까움. 단어마다 끊어 읽음 — 하나의 덩어리로.',
  similar: '<span class="hl">to be honest</span> / <span class="hl">honestly</span> — 비슷하지만 I\'m not gonna lie 가 더 캐주얼.',
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
