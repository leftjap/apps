# Study 앱 — 일본어 신규 학습 해설 가이드

> 출처: [study-app-spec.md](../specs/study-app-spec.md) §5, §8-3 + i+1 원리 (Krashen Input Hypothesis · jpdb.io 운영 방식 · 1T sentence mining)
> 대상: Claude Code 가 일본어 콘텐츠 생성 시 참조
>
> **목표 학습자 수준**: 자막 없이 애니 시청 + 일본 여행 가능 수준
> **시작 가정**: 가나 자력 독해 / 한자 못 읽음 / 기초 문법 거의 없음
>
> 영어 가이드와 짝: [lesson-explanation-guide-en.md](./lesson-explanation-guide-en.md)

---

## 1. 핵심 원리 — 진짜 i+1

i+1 은 **문장 자체 난이도** 에 적용. 해설 깊이가 아님.

### 1T 원칙 (One Target — sentence mining 표준)

- 한 문장에 학습자가 **모르는 요소가 정확히 1개**.
- 0개 (다 아는 것) → 학습 가치 없음, 제외
- 2개 이상 (i+2) → 너무 어려움, 제외
- 채택된 문장 학습 후 → 새 요소를 `user_known_*` 에 등록

### i+1 알고리즘이 곧 요소 재출현 보장

학습자가 "새 요소 1개만 모르는 문장" 을 계속 받으면, **이미 학습한 요소들은 자연스럽게 다른 문장에서 반복 노출**. 별도의 spaced re-exposure 로직 불필요 — 콘텐츠 선정 알고리즘 자체가 요소 재출현을 만든다.

---

## 2. ReviewCard 메타 (ja 트랙 추가 필드)

영어 카드와 공통 필드 외, ja 트랙은 i+1 운영을 위한 메타 필드 5개 추가:

| 필드 | 형식 | 용도 |
|---|---|---|
| `stage` | 1 \| 2 \| 3 \| 4 | 학습 단계 (§4 정의) |
| `newElements` | string[] (length === 1) | 학습자 신규 요소 (가나 표기 또는 한자) |
| `knownElements` | string[] | 이 문장의 prerequisite — 사용자 `user_known_*` 매칭 검사용 |
| `frequency` | 1~10 | 애니/일상 빈도 (높을수록 우선 출제) |
| `category` | string | 분류 (예: `감탄/반응` `인사` `여행` `의사표현`) |

`phonetic_kr` 도 ja 카드에선 **필수** (영어 카드의 `pronunciation.phonetic_kr` 와 동일 의미).

---

## 3. explanation 스키마 (ja 트랙)

영어 8필드 대신 **4필드** 만 사용. 동사 활용·격식 분석은 Stage 1~2 에서 강제하지 않음.

```json
{
  "explanation": {
    "whenToUse": "상대방 말에 동의할 때",
    "grammar": "そう + だ + ね(동의 종조사)",
    "pronPoints": "そう → 소-(장음)",
    "similar": "だよね / たしかに"
  }
}
```

### 3.1 whenToUse
- 한 줄. 사용 상황 (한국어).

### 3.2 grammar
- 한 줄 형태소 분해. **분석 깊이 X.**
- 예: `そう + だ + ね(동의 종조사)`
- 활용·격식 차이는 Stage 3+ 에서 보강. Stage 1~2 카드는 분해 자체에 집중.

### 3.3 pronPoints
- §7 의 4패턴 (장음·촉음·묵음·조사) 중 해당되는 것만.
- 예: `そう → 소-(장음)` / `ちょっと → 촛토(촉음)` / `〜は → 와(조사 발음)`

### 3.4 similar
- 비슷한 표현 노출. **보통체/정중체 구분 가르치지 않음** (Stage 1~2). "이런 것도 있다" 정도.
- 예: `だよね / たしかに`

---

## 4. 학습 단계 정의

### Stage 1 — 가나만 (50~80문장)
한자 0개. 가나만으로 의미 형성. `そうだね` `すごい！` `やばい` `まじで？` `ありがとう` `ごめん` 등.

### Stage 2 — 기본 문형 도입 (80~150문장)
한 문장당 새 문형 또는 새 한자 **1개**. 빈도 최우선:
- 문형: `〜です/だ` `〜ます/ない` `〜が好き` `〜たい` `〜ている` + 조사 `は/が/を/に/で`
- 한자: `私` `君` `今` `何` `行く` `来る` `食べる` `見る` 등 일상 빈출

### Stage 3 — 짧은 회화/감정 (150~300문장)
복수 요소 결합. 단, 신규 요소는 **여전히 1개**.
- 예: `今、何してる？` (既知: 今/何, 신규: 〜してる)
- 예: `本当にありがとう` (既知: ありがとう, 신규: 本当に)

### Stage 4 — 여행/시청 실전 (300+)
여행 빈출, 애니 캐릭터 단문, 감정 표현 확장.

---

## 5. 콘텐츠 풀(Pool) 운영

### Phase 0: 시드 콘텐츠
Stage 1~2 빈출 표현 200~500문장 풀을 미리 생성. 각 문장에 메타 (`newElements`/`knownElements`/`frequency`/`category`) 박힘.

### Phase 1: 학습 중 동적 선정 (i+1 알고리즘)

```
세션 시작:
1. user_known_* 조회
2. 풀에서 1T 조건 만족 문장 필터링:
   newElements 의 모든 요소 ∉ user_known_*
   knownElements 의 모든 요소 ∈ user_known_*
3. frequency 높은 순 N개 선정

학습 후:
4. newElements 의 요소를 user_known_* 에 추가
```

### 풀 고갈 (i+1 후보 없음)
사용자 알림: "다음 단계로 진입할 수 있어요" + Claude Code 에 다음 stage 생성 요청.

> 본 알고리즘 구현은 spec §5/§8-3 변경 + DB 스키마 추가 필요. 별 wave 진행.

---

## 6. 발음 표기 (phonetic_kr) — 4패턴

영어 트랙과 동일 개념 (학습자 즉시 발음 가능). 일본어는 4패턴만:

| 패턴 | 표기 | 예시 |
|---|---|---|
| **장음** | `-` | `そう → 소-` `コーヒー → 코-히-` `えい → 에-` `ー → -` |
| **촉음(っ)** | 받침 | `ちょっと → 촛토` `がっこう → 갓코-` |
| **묵음** | 약하게 표기 | `です → 데스` `ます → 마스` |
| **조사** | 발음대로 | `は → 와` `を → 오` `へ → 에` |

### 표기 일관성 검증
| 문장 | reading | phonetic_kr |
|---|---|---|
| そうだね | そうだね | 소-다네 |
| やばい、もうこんな時間？ | やばい、もうこんなじかん | 야바이, 모- 콘나 지칸? |
| これはペンです | これはペンです | 코레와 펜데스 |
| コーヒーが飲みたい | コーヒーがのみたい | 코-히-가 노미타이 |
| 今、ご飯を食べています | いま、ごはんをたべています | 이마, 고항오 타베테이마스 |

### 안 다루는 것 (Stage 1~2)
- 高低 액센트 (학습 부담 대비 효용 낮음)
- IPA 음소 분석 (영어 트랙과 다른 차원)

---

## 7. 변형 연습 — Stage 1~2 비활성

영어 트랙은 `variations: [{type:'subject'|'tense'|'expression', ...}]` 3건 필수. **ja Stage 1~2 카드는 variations 미포함.**

이유:
- 동사 활용을 모르는 상태에서 시제·주어 변경 불가
- Krashen affective filter — 초급 강제 production 은 학습 방해
- jpdb.io 도 sentence card = recognition 중심. production 강제 X

대신 활성:
- **듣기** (Azure TTS — Aoi voice, Wave 11.32)
- **따라 말하기** (발음 분석 — analyze lang='ja-JP')
- **다른 문맥에서 같은 요소 재만남** (i+1 알고리즘이 자동 처리)

Stage 3+ 진입 시 `politeness` (보통체↔정중체) 등 단순 변환만 추가 검토.

---

## 8. SRS 보강 — 요소별 판정 기록

기존 `[1, 3, 7, 21, 60]` 일 간격 SRS 는 그대로. 추가:

### 요소별 판정
판정 (Got it / Hmm / No) 시 문장 단위 + **요소 단위** 기록:

```json
{
  "sentenceJudgment": "Got it",
  "elementJudgments": {
    "そうだ": "remembered",
    "ね": "remembered"
  }
}
```

### 약한 요소 우선
같은 요소가 **여러 문장에서 No 판정** 받으면 → `user_known_*` 에서 제거 + 재학습 대상 강등 + 약점 우선 모드 (spec §11-3 의 "약한 문장 보기" 확장) 에서 우선 출제.

---

## 9. 콘텐츠 생성 원칙

- **빈도 우선**: 애니/일상 빈출 표현. 사전 빈도 X.
- **한국어 표기 발음 (phonetic_kr)**: 4패턴 정확 반영. 사전 표기 X.
- **분해 깊이 자제**: grammar 한 줄 형태소 분해. 분석 깊이 X (Stage 1~2).
- **보통체/정중체 구분 강제 X** (Stage 1~2): "이런 것도 있다" 정도 노출.
- **새 요소 = 정확히 1개**: i+1 검증 필수.
- **변형 연습 미포함** (Stage 1~2).

---

## 10. 자체 검증 체크리스트

콘텐츠 생성 후 확인:

- [ ] `newElements` 길이가 정확히 **1** 인가
- [ ] `knownElements` 의 모든 요소가 이전 stage 에 등장했는가 (Stage 1 은 빈 배열 OK)
- [ ] `phonetic_kr` 이 4패턴 (장음 `-` / 촉음 받침 / 조사 `와·오·에` / 묵음 약한 `데스/마스`) 정확 반영했는가
- [ ] `frequency` 점수 (1~10) 가 매겨졌는가
- [ ] `category` 가 분류되었는가 (예: `감탄/반응` `인사` 등)
- [ ] Stage 1 문장이라면 한자 **0개** 인가
- [ ] `grammar` 가 한 줄 형태소 분해인가 (분석 깊이 X)
- [ ] `pronPoints` 가 §6 의 4패턴 중 하나인가
- [ ] 보통체/정중체 구분을 가르치려 하지 않았는가
- [ ] 동사 활용 학습이 핵심이 된 문장은 아닌가 (Stage 2 이전)
- [ ] `variations` 미포함인가 (Stage 1~2)

---

## 11. spec 영향 영역 (별 wave 진행)

본 가이드 운영을 위한 spec 변경:

### DB 스키마 (spec §3/§4)
```sql
-- 학습자 요소 추적
user_known_kanji (user_id, kanji_id, learned_at)
user_known_grammar (user_id, grammar_id, learned_at)
user_known_vocab (user_id, vocab_id, learned_at)

-- 문장 메타데이터
sentence_elements (sentence_id, kanji_ids[], grammar_ids[], vocab_ids[])
```

### explanation 스키마 분기 (spec §5)
- en 트랙: 영어 가이드 (8필드)
- ja 트랙: 본 가이드 (4필드 + 메타 5개)

### 신규 레슨 카드 분기 (spec §8-3)
- ja Stage 1~2: 변형 연습 패널 비활성
- ja: `phonetic_kr` 표시 (영어와 동일 위치)

### 통계 (spec §11)
- `user_known_*` 누적 그래프 (한자 N, 문형 N, 어휘 N)
- "다음 단계 진입 가능" 알림

---

## 12. 출처

- **i+1 / Comprehensible Input**: Krashen Input Hypothesis (학습자 현재 수준 i 보다 정확히 한 단계 위 인풋)
- **i+1 sentence card 운영**: jpdb.io (이미 안다고 표시한 단어를 추적, 새 단어 1개만 모르는 문장 자동 출제)
- **1T 원칙**: sentence mining 커뮤니티 표준 (immersion 자료에서 타겟 1개 문장만 SRS 후보)
- **SRS + immersion**: SRS 만으론 실사용 불가. immersion·회화·실사용 병행 필수
- **한국인 초급 일본어**: 가나 처음부터 다 외우지 않아도 OK. 문장 읽으며 글자 익숙해짐
- **초급 발음**: 책으로 익숙한 표현도 실제 원어민 발음은 다름 → 청취 훈련 병행

---

## 13. 참조 경로

- 본 가이드의 출처 spec: [../specs/study-app-spec.md](../specs/study-app-spec.md) §5, §8-3
- 형식 메타 (en/ja 공통): [./explanation-schema.md](./explanation-schema.md)
- 영어 가이드 (짝): [./lesson-explanation-guide-en.md](./lesson-explanation-guide-en.md)
