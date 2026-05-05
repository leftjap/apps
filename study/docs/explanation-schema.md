# Explanation 스키마 — 형식 메타

> 카드별 `explanation` 필드 + ReviewCard 메타 (en/ja 공통 구조).
>
> **콘텐츠 작성 가이드 (en, 정본):** [./lesson-explanation-guide-en.md](./lesson-explanation-guide-en.md) — i+1·1T·Stage 1~4·구어 축약/리액션·chunks 객체·IPA weak_focus·variations Stage 3+·shadowing.
>
> **콘텐츠 작성 가이드 (ja, 정본):** [./lesson-explanation-guide-ja.md](./lesson-explanation-guide-ja.md) — i+1·1T·Stage 1~4·4패턴 발음·explanation 4필드 (whenToUse/grammar/pronPoints/similar)·variations 비활성 (Stage 1~2).

## en/ja 공통 ReviewCard 메타 (5필드 + phonetic_kr)

| 필드 | 형식 | 용도 |
|---|---|---|
| `stage` | 1 \| 2 \| 3 \| 4 | 학습 단계 |
| `newElements` | string[] (length === 1) | 학습자 신규 요소 (1T 원칙) |
| `knownElements` | string[] | prerequisite 검사 |
| `frequency` | 1~10 | 빈도 (높을수록 우선) |
| `category` | string | 분류 |
| `phonetic_kr` | string | 한국인 즉시 발음 가능 표기 |

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
}
```

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
