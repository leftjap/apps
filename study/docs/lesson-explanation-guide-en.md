# Study 앱 — 영어 신규 학습 해설 가이드

> 출처: [study-app-spec.md](../specs/study-app-spec.md) §5, §8-3 + i+1 원리 (Krashen Input Hypothesis · jpdb.io / Migaku 운영 방식 · 1T sentence mining)
> 대상: Claude Code 가 영어 콘텐츠 생성 시 참조
>
> **목표 학습자 수준**: 미드/영화 자막 의존도 낮추기 + 영어권 여행 + 비즈니스 일상 회화
> **시작 가정**: 한국 정규 교육 기반 (읽기 가능, 회화/리스닝 약점). 성인 학습자
>
> 일본어 가이드와 짝: [lesson-explanation-guide-ja.md](./lesson-explanation-guide-ja.md)

---

## 1. 핵심 원리 — i+1 + 1T

ja 트랙과 동일 원리. **문장 자체 난이도** 기준.

### 1T 규칙 (One Target — sentence mining 표준)
- 한 문장에 신규 학습 요소 **정확히 1개**
- 0개 (다 아는 것) 또는 2개 이상 (i+2) → 후보 제외
- 학습 후 신규 요소를 `user_known_*` 등록

### 한국인 성인 학습자 특수
성인은 i+1 을 **명시적으로** 운영해야 함. 모국어 배우듯 무작정 인풋만 받는 방식은 비효율적. i+0 (이미 아는 것) 정체 또는 i+2 점프 시 학습 동기 빠르게 소진.

---

## 2. 학습자 요소 추적 (en 트랙 — 4종)

ja 와 구조는 같으나 **추적 단위** 가 다름:

| 단위 | 의미 | ja 트랙 대응 |
|---|---|---|
| `user_known_vocab` | 학습한 어휘 (단어 ID) | `user_known_vocab` 동일 |
| `user_known_grammar` | 학습한 문법 패턴 (현재완료·가정법·used to 등) | `user_known_grammar` |
| `user_known_idiom` | 학습한 관용 표현 (gonna·wanna·you know what 등) | `user_known_kanji` 위치 |
| `user_known_phoneme` | 학습자가 안정적으로 발음하는 음소 (IPA) | (en 전용) |

⚠️ **회화 진짜 장벽은 단어보다 idiom·구어 축약**. en 트랙 핵심은 `user_known_idiom`.

---

## 3. ReviewCard 메타 (en 트랙 추가 필드)

ja 와 동일한 5필드 — 양 트랙 정합:

| 필드 | 형식 | 용도 |
|---|---|---|
| `stage` | 1 \| 2 \| 3 \| 4 | 학습 단계 (§5 정의) |
| `newElements` | string[] (length === 1) | 학습자 신규 요소 (vocab·grammar·idiom 명) |
| `knownElements` | string[] | prerequisite — 사용자 `user_known_*` 매칭 검사 |
| `frequency` | 1~10 | 미드/일상 빈도 (높을수록 우선 출제) |
| `category` | string | 분류 (예: `감정/리액션` `의사표현` `여행` `비즈니스`) |

`phonetic_kr` 도 카드 메타. 한국인 즉시 발음 가능하게.

---

## 4. explanation 스키마 (en 트랙)

ja 4필드 대비 **풍부한 객체 구조**. en 은 chunks·IPA·variations 도 포함.

```json
{
  "explanation": {
    "keyPoint": "I'm not gonna lie = 솔직히 말하면. 관용 표현.",
    "whenToUse": "힘든 경험을 솔직하게 털어놓을 때",
    "grammar": {
      "structure": "I'm not gonna lie, [that was pretty rough].",
      "explanation": "관용 표현(절 전체가 부사 역할) + pretty(부사) + 형용사 패턴"
    },
    "pronunciation": {
      "chunks": [
        { "en": "I'm not gonna", "kr": "아임 나러나" },
        { "en": "lie, that was", "kr": "라이, 대러즈" },
        { "en": "pretty rough", "kr": "프리리 러프" }
      ],
      "tips": "not gonna 는 연음되어 '낫거나' 보다 '나러나'. pretty 의 t 는 flap 되어 '프리리'.",
      "weak_focus": ["ɹ", "θ", "ʌ", "f"]
    },
    "commonMistakes": "gonna 를 '고나'로 발음 → /ɡʌnə/. rough 를 '라우프'로 → gh 는 /f/.",
    "similar": "to be honest / honestly / tbh — 캐주얼·강조 느낌"
  }
}
```

### 4.1 keyPoint
한 줄. 학습자가 이 문장에서 가져갈 **핵심**. 길어지면 안 됨.

### 4.2 whenToUse
한 줄. **언제 쓰는지** (한국어 짧게).

### 4.3 grammar (객체 — `{structure, explanation}`)
- `structure`: 문장 구조 시각화. 핵심 부분 `[ ]` 로 묶음
- `explanation`: 그 구조의 이유. 한국어 어순 비교 권장

### 4.4 pronunciation (객체 — chunks/tips/weak_focus)

**`chunks: [{en, kr}]`** ⭐ — en 트랙 핵심. 문장을 2~4개 청크로 분리, 각 청크는 한 호흡. 한국인 단어별 끊어 읽기 습관 교정.

**`tips`** — 연음·flap·생략 메커니즘 한 줄.

**`weak_focus: [IPA]`** — 한국인 어려움 음소 IPA 배열 (2~4개). 주요 후보: `θ ð ɹ f v ʌ æ ɪ`.

### 4.5 commonMistakes
한국인 자주 하는 실수. 발음/문법 모두. **틀린 형태 → 올바른 형태** 화살표 권장.

### 4.6 similar
같은 의미 다른 표현. 뉘앙스/격식 차이.

---

## 5. 학습 단계 정의 (한국인 성인 영어 기준)

한국인은 **읽기/문법은 강하고 회화/리스닝은 약함** → ja 와 단계 구성 다름.

### Stage 1 — 구어 축약/리액션 (50~80문장)
한국인이 **읽으면 이해하지만 말로 안 들리는** 표현.
- `gonna` `wanna` `gotta` `kinda` `sorta`
- `Yeah` `nope` `for real` `no way`
- `lemme see` `hang on` `you know what` `oh my god`

### Stage 2 — 짧은 일상 패턴 (80~150문장)
빈도 최우선:
- `I'm not gonna lie` `to be honest` `I was just`
- `kind of / sort of` `would you mind` `do you wanna`

### Stage 3 — 회화/감정 표현 (150~300문장)
복합 패턴. 신규 요소는 **여전히 1개**.
- 예: `I've been meaning to ask you` (既知: I've been, 신규: meaning to)
- 예: `Not gonna sugarcoat it` (既知: Not gonna, 신규: sugarcoat)

### Stage 4 — 미드/여행/비즈니스 실전 (300+)
자연 발화 속도, idiom 밀도 높은 표현.

---

## 6. 콘텐츠 풀 운영

### Phase 0: 시드 콘텐츠
Stage 1~2 미드/일상 빈출 200~500문장 풀. 각 문장에 메타 (`newElements`/`knownElements`/`frequency`/`category`).

### Phase 1: 학습 중 동적 선정 (i+1)
ja 와 동일 알고리즘. `user_known_*` 조회 → 1T 만족 필터 → frequency 정렬 → N개 선정 → 학습 후 `newElements` 등록.

### 콘텐츠 우선순위 — slice-of-life
- voice actor 발음 명확 + 표준 문법 + idiom 밀도 → 학습 이상적
- **slice-of-life 우선**: Friends · How I Met Your Mother · Brooklyn Nine-Nine 류
- 의학·법정·SF 후순위
- **미국식 우선** (한국인 노출도 기준)

> 본 알고리즘 구현은 spec §5/§8-3 변경 + DB 스키마 추가 필요. 별 wave 진행.

---

## 7. 발음 학습 — en 특화 4영역

| 영역 | 내용 | 표기 위치 |
|---|---|---|
| **연음** | gonna · wanna · didja · wouldja | `phonetic_kr` `chunks` |
| **Flap** | water → wadder · pretty → priddy | `phonetic_kr` `tips` |
| **약음/생략** | for → fer · and → 'n · of → uh | `phonetic_kr` `tips` |
| **IPA 음소** | θ · ð · ɹ · f · v · æ · ʌ · ɪ | `weak_focus` (pill 태그) |

### Shadowing 메커니즘
영상 오디오 들으면서 즉시 따라 말함. 자막 보며 하면 어휘 암기에 도움, 자막 끄고 하면 듣기 이해력 향상.
→ 신규 학습 카드의 "따라 말하기" 버튼이 이 역할: TTS 재생 → 즉시 녹음 → 음소별 정확도 분석.

### phonetic_kr 작성 — 사전 표기 X, 실제 발음 O
| 문장 | 사전 표기 (X) | phonetic_kr (O) |
|---|---|---|
| I'm not gonna lie | 아임 낫 거나 라이 | **아임 나러나 라이** |
| What are you doing? | 왓 아 유 두잉 | **워러유 두잉?** |
| Did you eat? | 디드 유 잇 | **디쥬 잇?** |
| pretty rough | 프리티 러프 | **프리리 러프** |

---

## 8. 변형 연습 (variations) — 단계별 정책

### Stage 1~2 — 비활성 (ja 와 동일)
초급 강제 production 은 affective filter 높여 학습 방해. 대신 활성:
- **shadowing** (TTS 듣고 따라 말하기)
- **요소 재만남** (i+1 알고리즘 자동)

### Stage 3+ — Guided Variation 활성 (ja 와 다른 점)

3타입 고정:
1. **subject** — 주어 변경
2. **tense** — 시제 변경
3. **expression** — 표현 대체

각 변형 객체:
```json
{
  "type": "subject" | "tense" | "expression",
  "prompt": "한국어 지시문",
  "answers": ["정답 1", "정답 2", ...],
  "original": "원문 참조"
}
```

작성 원칙:
- **문장 전체 재작성** (한 단어 X). 주어 바뀌면 동사도 바뀌어야 하고, 시제 바꾸면 시간 부사도 변경 가능
- `answers` 에 모든 합당한 정답을 **콘텐츠 생성 시점에 미리** 박음. 런타임 LLM 채점 X
- expression 타입 답 2~4개 권장
- subject/tense 타입 답 1~2개

### Stage 4+ — Free Production (선택)
간격 21일+ 복습 단계에서 자유 작문 도입.

### 채점 파이프라인 (Stage 3+ 런타임)
```
사용자 입력
  → answers 정확 매칭? → sage (정답 확정)
  → LanguageTool API OK? → blue (다른 정답)
  → 문법 오류 → danger (수정 제안)

오프라인 시: answers[0] 예시 답 표시
```

---

## 9. SRS 보강 — 음소 가중치

기존 `[1, 3, 7, 21, 60]` 일 SRS 그대로. 추가:

### 요소별 + 음소별 판정 기록
```json
{
  "sentenceJudgment": "Hmm",
  "elementJudgments": {
    "gonna": "remembered",
    "pretty (intensifier)": "weak",
    "rough": "remembered"
  },
  "pronunciationScore": {
    "ɹ": 78,
    "θ": 45,
    "ʌ": 90
  }
}
```

### 약점 우선 출제 (spec §11-3 확장)
- **약한 idiom 우선**: 여러 문장에서 No 판정받은 idiom 든 신규 문장 우선
- **약한 음소 우선** (en 전용): `weak_focus` 에 자주 등장한 음소 (예: /θ/) 든 신규 문장 우선

발음 점수 낮은 음소 → 가중치 추가 → 다음 문장 선정 시 우선.

---

## 10. 콘텐츠 생성 원칙

- **구어체 우선**: gonna · wanna · gotta · kinda · lemme. 교과서 영어 X
- **한국어 표기 발음 (phonetic_kr)**: 연음/flap/약음 정확 반영. 사전 표기 X
- **chunks 분리 필수**: 한국인 단어별 끊어 읽기 교정
- **IPA weak_focus**: 한국인 약점 음소 명시
- **신규 요소 = 정확히 1개**: i+1 검증
- **변형 연습**: Stage 1~2 미포함 / Stage 3+ 항상 3건 (subject/tense/expression)
- **slice-of-life 콘텐츠 우선**: voice actor 명확 발음

---

## 11. 자체 검증 체크리스트

콘텐츠 생성 후 확인:

- [ ] `newElements` 길이가 정확히 **1** 인가
- [ ] `knownElements` 의 모든 요소가 이전 stage 에 등장했는가
- [ ] `phonetic_kr` 이 연음/flap/약음 반영했는가 (사전 표기 X)
- [ ] `pronunciation.chunks` 배열에 모든 단어가 빠짐없이 포함되는가
- [ ] `phonetic_kr` 이 chunks 의 kr 을 이어붙인 것과 일치하는가
- [ ] `weak_focus` 가 IPA 기호 배열인가 (한글 X, 2~4개)
- [ ] `frequency` 점수 (1~10) 가 매겨졌는가
- [ ] `category` 가 분류되었는가
- [ ] Stage 1 문장이라면 구어 축약/리액션 위주인가
- [ ] Stage 1~2 문장에 `variations` 미포함인가
- [ ] Stage 3+ `variations` 가 정확히 3개이고 type 이 `subject`/`tense`/`expression` 인가
- [ ] 각 variation 의 `answers` 배열이 비어있지 않은가
- [ ] `commonMistakes` 에 한국인 학습자 관점 명시되어 있는가

---

## 12. spec 영향 영역 (별 wave 진행)

en/ja 양 트랙 공통 변경:

### DB 스키마 (spec §3/§4)
```sql
-- 학습자 요소 추적 (en/ja 공통 구조, element_type 분기)
user_known_elements (user_id, lang, element_type, element_id, learned_at, strength)
-- en: element_type ∈ {'vocab', 'grammar', 'idiom'}
-- ja: element_type ∈ {'kanji', 'grammar', 'vocab'}

-- 문장 메타데이터
sentence_elements (sentence_id, lang, element_ids[])

-- 발음 추적 (en 전용)
user_phoneme_scores (user_id, phoneme_ipa, avg_score, attempts)
```

### explanation 스키마 분기 (spec §5)
- 공통 메타: `stage` `newElements` `knownElements` `frequency` `category` `phonetic_kr`
- en explanation: `keyPoint` `whenToUse` `grammar:{structure,explanation}` `pronunciation:{chunks,tips,weak_focus}` `commonMistakes` `similar`
- ja explanation: `whenToUse` `grammar` (한 줄) `pronPoints` (4패턴) `similar`

### 신규 레슨 카드 분기 (spec §8-3)
- en/ja 공통: Stage 1~2 변형 연습 비활성
- en Stage 3+: variations 활성 + 채점 파이프라인 (LanguageTool API)
- ja Stage 3+: politeness 변환 등 단순 변형 추후 검토

### 통계 (spec §11)
- `user_known_*` 누적 그래프 — en (vocab/grammar/idiom), ja (kanji/grammar/vocab)
- "다음 단계 진입 가능" 알림
- en 트랙: 음소별 평균 점수 표시

---

## 13. 출처

- **i+1 / Comprehensible Input**: Krashen Input Hypothesis
- **i+1 sentence card 운영**: jpdb.io / Migaku (학습 단어 추적 + comprehension score 기반 콘텐츠 추천)
- **1T 원칙**: sentence mining 커뮤니티 표준
- **Shadowing**: 시리즈/유튜버/성우 음성을 들으며 즉시 따라 말하기. 자막 끄면 듣기 이해력 향상
- **slice-of-life 우선**: voice actor 발음 명확 + 표준 문법. 장르가 sci-fi/스릴러보다 훨씬 쉬움
- **한국인 성인 학습자**: 모국어 배우듯 무작정 듣고 외우기는 비효율적 → 명시적 i+1 운영 필요
- **회화 중심 학습**: 초급은 생활 회화 / 중급은 이메일·토론 등 실용 활동 중심

---

## 14. 참조 경로

- 본 가이드의 출처 spec: [../specs/study-app-spec.md](../specs/study-app-spec.md) §5, §8-3
- 형식 메타 (en/ja 공통): [./explanation-schema.md](./explanation-schema.md)
- 일본어 가이드 (짝): [./lesson-explanation-guide-ja.md](./lesson-explanation-guide-ja.md)
