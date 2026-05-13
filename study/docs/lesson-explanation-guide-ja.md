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

영어 트랙과 동일 구조 + ja 특수 자산 (`korean_parallel` / `kanji_breakdown` / `politeness`). **콩트 운영 시 scene 메타 5필드 (§5.2) 가 같이 nested 됨.**

```json
{
  "explanation": {
    // 공통 메타 (5필드, en 과 동일)
    "stage": 2,
    "newElements": ["~ている"],
    "knownElements": ["今", "ご飯", "食べる"],
    "frequency": 9,
    "category": "상태/진행",

    // 콩트 메타 (5필드, §5.2)
    "scene_id": "scene-2026-05-13-cafe",
    "scene_order": 2,
    "scene_title": "오늘의 모닝",
    "speaker": "해결사",
    "is_stretch": false,

    // ja 본 필드
    "reading": "いま、ごはんをたべています",
    "whenToUse": "지금 진행 중인 동작 설명",
    "grammar": {
      "structure": "[今] + [ご飯] + を + [食べて] + います",
      "explanation": "동사 te형 + います = 진행 상태. 한국어 '~고 있다' 와 어순·구조 거의 동일.",
      "korean_parallel": "지금 + 밥 + 을 + 먹고 + 있어요"
    },
    "pronunciation": {
      "phonetic_kr": "이마, 고항오 타베테이마스",
      "chunks": [
        { "ja": "今、", "kr": "이마," },
        { "ja": "ご飯を", "kr": "고항오" },
        { "ja": "食べています", "kr": "타베테이마스" }
      ],
      "tips": "を 는 조사이므로 '오' 발음. ご飯 의 ん 은 뒤 を 앞에서 '항' 받침처럼.",
      "weak_focus": ["장음 (います)", "조사 を", "ん 변이"]
    },
    "kanji_breakdown": [
      { "kanji": "今", "reading": "いま/コン", "meaning": "지금", "korean_meaning": "이제 금" },
      { "kanji": "食", "reading": "た(べる)/ショク", "meaning": "먹다", "korean_meaning": "먹을 식" }
    ],
    "politeness": "polite",
    "commonMistakes": "を 를 '워'로 발음 → '오'. ご飯 을 '고한'으로 → '고항' (ん 받침).",
    "similar": [
      { "expression": "今、ご飯食べてる", "politeness": "casual", "nuance": "친한 사이" },
      { "expression": "今、お食事中です", "politeness": "formal", "nuance": "공식·존경" }
    ]
  }
}
```

### 3.1 reading (Stage 2+ 한자 든 문장 필수)
- 문장 전체의 가나 reading. Stage 1 (한자 0개) 은 sentence 와 동일해서 생략 가능.

### 3.2 whenToUse
- 한 줄. 사용 상황 (한국어).

### 3.3 grammar (객체 — `{structure, explanation, korean_parallel}`)
- `structure`: 형태소 분해. **ja 는 조사·활용 가르치는 트랙이라 전체 요소 박싱** (`[今] + [ご飯] + を + [食べて] + います`). en 의 핵심만 박싱 패턴과 의도된 차이.
- `explanation`: 그 구조의 이유. 활용 깊이 X (§3.2 정신 유지).
- `korean_parallel` (권장): 한국어 어순 대응 표기. ja 의 한국어 어순 닮음을 활용. 학습 가속.
- **Stage 1 단순화**: Stage 1 카드의 grammar 는 기존 `한 줄 형태소 분해 (분석 깊이 X)` 정신 그대로 string 한 줄 허용 (객체화 강제 X). `korean_parallel` 도 Stage 1 에서 생략 가능.

### 3.4 pronunciation (객체 — `{phonetic_kr, chunks, tips, weak_focus}`)
- `phonetic_kr`: 학습자 즉시 발음 가능한 한국어 표기 (§6 의 7패턴 반영).
- `chunks`: **호흡 단위** 분리 (예: `今、` / `ご飯を` / `食べています`). 발음 호흡용.
- `tips`: 발음 메커니즘 한 줄.
- `weak_focus`: §6 의 7패턴 중 해당되는 것 배열 (en 의 IPA 와 달리 ja 는 **패턴 이름** 으로 표기).
- **chunks vs korean_parallel 단위 차이**: chunks 는 발음 호흡 단위, korean_parallel 은 의미 어순 단위. 단위 다른 게 정상 — 두 분해의 목적이 다름.
- **Stage 1 단순화**: Stage 1 카드는 `chunks` 도 짧은 문장이라 단순 (예: `そうだね` → 1~2 chunk).

### 3.5 kanji_breakdown (Stage 2+ 한자 든 문장 필수)
- 한 자씩 reading·의미·한국 한자 훈음. Stage 1 은 빈 배열.
- `korean_meaning` (예: `"이제 금"` `"먹을 식"`): 한국 한자 훈음 노출. 한국 한자 학습 배경 있는 학습자에게 가속, 부담스러우면 별 wave 에서 optional 화 검토.

### 3.6 politeness (모든 Stage 필수)
- `casual` | `polite` | `formal` 라벨만. Stage 1~2 가르치진 않음, 표시만.

### 3.7 commonMistakes
- 한국인 학습자가 자주 하는 실수. 발음/문법 모두. **틀린 형태 → 올바른 형태** 화살표 권장.

### 3.8 similar (객체 배열로 확장)
- 비슷한 표현 + politeness + nuance. **보통체/정중체 구분 가르치지 않음** (Stage 1~2). "이런 것도 있다" 정도.
- 예: `[{ "expression": "だよね", "politeness": "casual", "nuance": "친한 사이" }]`

---

## 4. 학습 단계 정의 (5단계, JLPT 매핑)

학습자 목표 (애니 자막 없이 시청 + 일본 여행) → N3+ ~ N2 진입 도달.

| Stage | 목표 | JLPT 매핑 (어림) | 한자 도입 | 콩트 분량 |
|---|---|---|---|---|
| 1 — 가나 친숙 | 반응·인사·핵심 종조사 | JLPT 미만 | **0개 (의도적 제외)** | 3~4문장 |
| 2 — N5 기반 | 기본 문형·조사·일상 명사·기본 동사 | N5 (어휘 ~800 수준) | N5 한자 도입 (분석 추정 ~100자) | 4~5문장 |
| 3 — N4 진입 | te형·조건문·수수동사·가능형 | N4 | N4 한자 (분석 추정 ~300자) | 5~6문장 |
| 4 — N3 진입 | 자연 속도 회화·애니 따라가기 시작 | N3 (어휘 ~3,750 수준) | N3 한자 (분석 추정 ~650자) | 6~8문장 |
| 5 — N3+ → 목표 도달 | 슬라이스 애니 자막 없이 60~70% / 여행 자유 | N3+ ~ N2 진입 | N3+ | 7~10문장 |

> **수치 정확도 주의**: JLPT 공식 한자 수 비공개로 위 한자 수치는 **분석 추정**. 어휘 자산도 일반 통념 범위. 단정 톤 회피.
>
> **Stage 5 폭 인식**: N3+ ~ N2 진입 사이 어휘 자산 차이 큼 (~3,750 → ~6,000 추정). Stage 5 는 학습자가 가장 오래 머무는 구간이 될 가능성.

### Stage 1 — 가나 친숙 (한자 0개 의도적 제외)
가나 친숙도 우선. 종조사 (ね·よ·か·だ·です) + 기본 반응 (そう·やばい·まじ·すごい·ありがとう·ごめん·はい·いいえ) 중심.
- 예: `そうだね` `すごい！` `やばい` `まじで？` `ありがとう` `ごめん`
- **단순화 명시**: Stage 1 카드의 explanation 은 §3.2 grammar 한 줄 형태소 분해 정신 그대로. `grammar.structure` `korean_parallel` `pronunciation.chunks` 도 단순 또는 생략 (§3 단순화 규정 참조)

### Stage 2 — N5 기반
한자 도입 시작. 기본 N5 한자 (`私` `今` `何` `人` `見` `行` `来` `食` `飲` `書` `読` `言` 등).
- 문형: `〜です/だ` `〜ます/ない` `〜が好き` `〜たい` `〜ている` + 조사 `は/が/を/に/で`

### Stage 3 — N4 진입
te형·조건문·수수동사·가능형. politeness 의식적 구분 시작.
- 예: `今、何してる？` (既知: 今/何, 신규: 〜してる)
- 예: `本当にありがとう` (既知: ありがとう, 신규: 本当に)

### Stage 4 — N3 진입
애니 자막 보고 따라가기 시작. 슬라이스 라이프 우선.

### Stage 5 — N3+ → 목표 도달
자연 속도 회화. 미묘한 표현 (`~みたい` `~らしい` `~わけ` `~ばかり` 등).

### Stage 가드 (en §5 와 동일 구조)
- 콩트 내 모든 문장 stage 메타 ∈ `{currentStage, currentStage + 1}`
- `currentStage + 1` 문장은 **stretch** (§5.2)
- `currentStage + 2` 이상 점프 금지

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

## 5.2 콩트 단위 운영 (Skit-based Sessions)

문장 단위 무관계 학습 → 짧은 콩트 단위로 묶어서 학습. 한 세션 = 1 콩트 (Stage 별 분량 §4 참조, 캐릭터 2~3명, 펀치라인 1개).

### 근거
- **맥락성**: 한 문장만으로는 화용 비어있음. 콩트면 화자·관계·타이밍 자동 학습
- **Affective filter ↓**: 재미 = 학습 효율 ↑ (§1 i+1 원칙과 정합)
- **In-context 반복**: 한 콩트 안에서 같은 표현·요소 자연 변주 (SRS 별개 보너스)

### scene 메타 5필드 (explanation JSONB 안 nested, en 과 완전 동일)

| 필드 | 형식 | 용도 |
|---|---|---|
| `scene_id` | string | 같은 콩트 모든 문장 공유 (`scene-<YYYY-MM-DD>-<slug>`). PWA 묶음 표시 + SRS 그룹 복습 |
| `scene_order` | 1~N | 콩트 내 문장 순서. 1, 2, 3... 연속 (점프 X) |
| `scene_title` | string | 콩트 제목 (UI 헤더) |
| `speaker` | string | 화자 한국식 호칭 (§5.2 캐릭터 풀 4명 중 하나 — 검은 잡종 / 해결사 / 안경 소년 / 외계 소녀) |
| `is_stretch` | boolean | currentStage+1 어휘 사용 여부 |

### default + stretch 비율 (en 과 완전 동일)

| 구성 | 비율 | 규칙 |
|---|---|---|
| default 문장 | 60~80% | `stage === currentStage`, `is_stretch: false` |
| stretch 문장 | 20~40% | `stage === currentStage + 1`, `is_stretch: true` |
| Stage +2 이상 | 금지 | §4 점프 가드 준수 |

**배치 권장**: 1번 문장 default (진입 부담 ↓) → stretch 는 중간이나 펀치라인.

### 캐릭터 풀 4명

한국식 호칭은 **메타에만** 박힘. sentence 안에는 일본어 100% (캐릭터 일본 이름은 sentence 안 자연 등장 가능).

| # | 이름 | 한국식 호칭 | 톤 | speech_style | 1인칭 | 적합 Stage |
|---|---|---|---|---|---|---|
| 1 | クロタロウ | 검은 잡종 | 거친 입·욕설·야한 자체검열(삐—)·사무라이 우김·제4의 벽·낮자존감 거대자존심 | casual (야쿠자체) | `俺様` / `ワシ` | 3~5 |
| 2 | ギン | 해결사 | 죽은 눈·게으름·만화·푸딩·전설 검사 출신·결정적 변모·콧방귀 마무리 | casual (격앙 시 정색) | `俺` | 2~5 |
| 3 | ハチ | 안경 소년 | 츳코미·큰소리·사회상식 짚기·평균 능력 자조·결심 | polite ~ casual | `僕` | 1~5 |
| 4 | ルル | 외계 소녀 | 폭식·우산 무기·야쿠자 말투·가족 충성·트림·코후비기 | casual (욕설 섞임) | `あたし` | 2~5 |

### Stage 별 등장 가능 페어

| Stage | 등장 가능 | 권장 페어 (다이내믹) |
|---|---|---|
| 1 | 3 (+ 2 보조) | 안경 + 해결사 — 츳코미 + 게으름 boke. Stage 1 어휘 풀 (반응·인사·종조사) 안에서 짧은 vignette |
| 2 | 2·3 (+ 4 stretch) | 해결사 + 안경 (메인) / 안경 + 외계 (외계 stretch 어휘) |
| 3 | 1·2·3·4 모두 | 4인 풀 등장 가능. 권장 페어 — 해결사 + 외계 (가족 동거 다이내믹), 안경 + 잡종 (츳코미 + boke 카오스) |
| 4 | 1·2·3·4 모두 | 3인 조합 (해결사·안경·외계) 본격 시트콤. 잡종 고양이 합류로 4인 카오스 |
| 5 | 1·2·3·4 모두 | 모든 페어 가능. 미묘한 표현 + 사무라이 톤 (잡종) / 진지한 변모 (해결사) 가능 |

### 캐릭터-stage 정합 원칙

화자의 어휘 stage 가 캐릭터 톤과 자연 정합:
- Stage 1 콩트는 **안경 (ハチ)** 가 메인 화자. 츳코미 짧은 대사 (`やめてください` `だめですよ` 등) 가 Stage 1 어휘 풀과 자연 정합
- 해결사 (ギン) 는 stage 무관 default 화자 — 게으름·짧은 반응 (`めんどくさい` `知らない`) 으로 Stage 1~5 자연
- **잡종 (クロタロウ)** 등장 시 → 거친 어휘 / 사무라이 톤 = stretch 후보 1순위 (Stage 3+)
- **외계 (ルル)** 등장 시 → 야쿠자 말투 + 외계 특수 어휘 = stretch 후보 (Stage 2 부터 가능, 본격은 3+)
- 정중체/보통체 일관성: 각 캐릭터의 `speech_style` 따라 1인칭·종조사·문말 표현 turn 마다 일관

### ja 콩트 특수 원칙 (en 과 다른 부분, 캐릭터 무관하게 적용)

1. **방언 회피**: 표준어 (東京弁) 우선. 関西弁·東北弁 등 방언 사용 금지 (Stage 5 이전). 예외 — 사용자가 별도 세션에서 캐릭터에 방언 명시 시.
2. **정중체/보통체 일관성**: 화자별 1인칭·종조사·문말 표현 자동 분기. 같은 화자가 turn 마다 흔들리면 안 됨. 캐릭터 정의에 `speech_style` 메타 (`casual` / `polite` / `formal`) 필수 — 캐릭터 풀 확정 wave 에서 박힘.
3. **슬라이스 우선**: Shirokuma Cafe·Barakamon·K-On·Doraemon 류 톤. 판타지·SF·배틀 톤 회피.
4. **Manzai 구조 권장**: 일본 슬라이스 코미디의 표준 단위는 boke (보케 — 멍한 사람) + tsukkomi (츳코미 — 정정 역할) 듀오. 캐릭터 풀 확정 시 한 명 이상 tsukkomi 슬롯 권장. 강제 X, 사용자 결정 위임.

---

## 6. 발음 표기 (phonetic_kr) — 7패턴

영어 트랙과 동일 개념 (학습자 즉시 발음 가능). 일본어 7패턴:

| 패턴 | 표기 | 예시 | 한국인 학습자 주의점 |
|---|---|---|---|
| **장음** | `-` | `そう → 소-` `コーヒー → 코-히-` `えい → 에-` | 장음 누락 흔함 |
| **촉음(っ)** | 받침 | `ちょっと → 촛토` `がっこう → 갓코-` | 촉음 약화 흔함 |
| **묵음** | 약하게 표기 | `です → 데스` `ます → 마스` | 강하게 발음 흔함 |
| **조사** | 발음대로 | `は → 와` `を → 오` `へ → 에` | 표기대로 읽음 흔함 |
| **ん 변이** (신규) | 받침 `ㄴ/ㅁ/ㅇ` | `こんばんは → 콤방와` `さんぽ → 삼포` `あんがい → 앙가이` | 항상 '응'으로 발음 흔함 |
| **청탁 구분** (신규) | 청음/탁음 명시 | `か/が = 카/가` `た/だ = 타/다` | 일반적 관찰 — 약점 영역 흔함 |
| **つ vs す** (신규) | 명확 표기 | `つ → 츠` (입술 X) `す → 스` | 혼동 흔함 |

§3 의 `pronunciation.weak_focus` 는 이 7개 패턴 중 해당되는 것을 배열로 명시. en 의 IPA 와 달리 ja 는 **패턴 이름** 으로 표기.

> **수치·단정 톤 주의**: "한국인 약점" 절대 단정 회피. "흔함" "일반적 관찰" 등 약한 표현 사용.

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
- **요음** (`きゃ/きゅ/きょ` 류) — 한국인 흔한 어색 발음이긴 하나 본 wave 7패턴에서 제외. Stage 4+ 검토.

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

### Stage 3+ 활성 — 단순 변형 3타입

ja 어휘 자산 부족 (~N3 까지 ~3,750 추정) 시 expression 타입 (자유 표현 대체) 기계적 변환 어려움. 따라서 ja 는 **politeness / tense / subject** 3타입만 활성. `expression` 은 Stage 4+ 부터 추가 검토 (en §8 와 다른 점).

1. **politeness** — 보통체 ↔ 정중체 변환
2. **tense** — 현재 / 과거 / 진행
3. **subject** — 주어 변경 (1인칭 ↔ 3인칭)

각 변형 객체 (en §8 와 동일 구조):

```json
{
  "type": "politeness" | "tense" | "subject",
  "prompt": "한국어 지시문",
  "answers": ["정답 1", "정답 2"],
  "original": "원문 참조"
}
```

작성 원칙 (en §8 와 동일):
- 문장 전체 재작성. answers 는 **콘텐츠 생성 시점에 미리** 박음 (런타임 LLM 채점 X).
- politeness 타입 답 1~2개 / tense·subject 타입 답 1~2개.

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
- [ ] `phonetic_kr` 이 §6 의 7패턴 정확 반영했는가
- [ ] `frequency` 점수 (1~10) 가 매겨졌는가
- [ ] `category` 가 분류되었는가 (예: `감탄/반응` `인사` 등)
- [ ] Stage 1 문장이라면 한자 **0개** 인가
- [ ] 보통체/정중체 구분을 가르치려 하지 않았는가 (Stage 1~2)
- [ ] 동사 활용 학습이 핵심이 된 문장은 아닌가 (Stage 2 이전)
- [ ] `variations` 미포함인가 (Stage 1~2)
- [ ] Stage 3+ `variations` 가 type ∈ `{politeness, tense, subject}` 인가 (expression 제외)
- [ ] 각 variation 의 `answers` 배열이 비어있지 않은가
- [ ] `commonMistakes` 에 한국인 학습자 관점 명시되어 있는가

### 콩트 정합 (§5.2)

- [ ] 콩트 모든 문장이 같은 `scene_id` 공유
- [ ] `scene_order` 가 1~N 연속 (점프 없음)
- [ ] `scene_title` 박힘
- [ ] stretch 문장 비율이 20~40%
- [ ] 모든 stretch 문장 `stage === currentStage + 1` 이고 `is_stretch: true`
- [ ] default 문장 `stage === currentStage` 이고 `is_stretch: false`
- [ ] `currentStage + 2` 이상 점프 없음
- [ ] `speaker` 한국식 호칭이 §5.2 캐릭터 풀 4명 안 (검은 잡종 / 해결사 / 안경 소년 / 외계 소녀)
- [ ] sentence 안에는 한국식 호칭 0건 (일본어 100%, 캐릭터 일본 이름은 sentence 안 자연 등장 가능)
- [ ] 화자별 `speech_style` (casual/polite/formal) 이 turn 마다 일관 — §5.2 캐릭터 정의의 speech_style 준수
- [ ] 캐릭터 캐스팅이 currentStage 의 등장 가능 풀 안 (Stage 1 → 3 메인 + 2 보조 / Stage 2 → 2·3·4 / Stage 3+ → 1·2·3·4 전부)

### explanation 신규 필드 정합

- [ ] Stage 2+ 한자 든 문장에 `reading` 필드 박힘
- [ ] Stage 2+ 한자 든 문장에 `kanji_breakdown` 배열 비어있지 않음
- [ ] 모든 카드에 `politeness` 라벨 박힘
- [ ] `grammar.korean_parallel` 이 한국어 어순 대응으로 작성됨 (Stage 1 은 생략 가능)
- [ ] `pronunciation.chunks` 가 sentence 전체를 덮음 (누락 없음)
- [ ] `pronunciation.weak_focus` 가 §6 의 7패턴 이름 배열
- [ ] `similar` 가 객체 배열 (expression + politeness + nuance)
- [ ] Stage 1 카드라면 `reading` `kanji_breakdown` 생략 OK + grammar 한 줄 string 허용

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

-- 콩트 메타 (en 가이드 §6.2 / ja §5.2 공통 — 번호만 다름, 구조 동일. JSONB 안 nested 가능)
-- scene_id / scene_order / scene_title / speaker / is_stretch
```

### explanation 스키마 분기 (spec §5)
- en 트랙: 영어 가이드 (8필드)
- ja 트랙: 본 가이드 — `reading`, `kanji_breakdown`, `politeness`, `pronunciation:{phonetic_kr,chunks,tips,weak_focus}`, `grammar:{structure,explanation,korean_parallel}`, `commonMistakes`, `similar:[{expression,politeness,nuance}]`

### 신규 레슨 카드 분기 (spec §8-3)
- ja Stage 1~2: 변형 연습 패널 비활성
- ja Stage 3+: variations 활성 (`politeness` / `tense` / `subject` 3타입. `expression` 은 Stage 4+ 검토)
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
