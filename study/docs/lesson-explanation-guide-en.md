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

> 콩트 단위 운영 시 추가 메타 (`scene_id` 등 5필드) → §6.2 참조

---

## 4. explanation 스키마 (en 트랙)

ja 4필드 대비 **풍부한 객체 구조**. en 은 chunks·IPA·variations 도 포함. **콩트 운영 시 scene 메타 5필드 (§6.2) 가 같이 nested 됨.**

```json
{
  "explanation": {
    // 공통 메타 (5필드)
    "stage": 2,
    "newElements": ["I'm not gonna lie"],
    "knownElements": ["that was", "pretty rough"],
    "frequency": 8,
    "category": "감정/리액션",

    // 콩트 메타 (5필드 — §6.2)
    "scene_id": "scene-2026-05-13-mixer",
    "scene_order": 3,
    "scene_title": "Just a Quick Mixer",
    "speaker": "지점장",
    "is_stretch": false,

    // en 본 6필드
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

### Stage 1 — 구어 축약/리액션 (50~80문장, **콩트 분량 4~7문장**)
한국인이 **읽으면 이해하지만 말로 안 들리는** 표현.
- `gonna` `wanna` `gotta` `kinda` `sorta`
- `Yeah` `nope` `for real` `no way`
- `lemme see` `hang on` `you know what` `oh my god`

### Stage 2 — 짧은 일상 패턴 (80~150문장, **콩트 분량 6~10문장**)
빈도 최우선:
- `I'm not gonna lie` `to be honest` `I was just`
- `kind of / sort of` `would you mind` `do you wanna`

### Stage 3 — 회화/감정 표현 (150~300문장, **콩트 분량 8~14문장**)
복합 패턴. 신규 요소는 **여전히 1개**.
- 예: `I've been meaning to ask you` (既知: I've been, 신규: meaning to)
- 예: `Not gonna sugarcoat it` (既知: Not gonna, 신규: sugarcoat)

### Stage 4 — 미드/여행/비즈니스 실전 (300+, **콩트 분량 8~14문장**)
자연 발화 속도, idiom 밀도 높은 표현.

### Stage 가드 (spec §5-0 단계 5 준수)
- 콩트 내 모든 문장 stage 메타 ∈ `{currentStage, currentStage + 1}`
- `currentStage + 1` 문장은 **stretch** (§6.2)
- `currentStage + 2` 이상 점프 금지

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

## 6.2 콩트 단위 운영 (Skit-based Sessions)

문장 단위 무관계 학습 → 짧은 시트콤/콩트 단위로 묶어서 학습. 한 세션 = 1 콩트 (5~6문장, 캐릭터 2~3명, 펀치라인 1개).

### 근거
- **맥락성**: 한 문장만으로는 화용 (pragmatics) 비어있음. 콩트면 화자·관계·타이밍 자동 학습
- **Affective filter ↓**: 재미 = 학습 효율 ↑ (§1 i+1 원칙과 정합)
- **In-context 반복**: 한 콩트 안에서 같은 표현 변주 자연 발생 (SRS 별개 보너스)

### scene 메타 5필드 (explanation JSONB 안 nested)

| 필드 | 형식 | 용도 |
|---|---|---|
| `scene_id` | string | 같은 콩트 모든 문장 공유 (`scene-<YYYY-MM-DD>-<slug>`). PWA 묶음 표시 + SRS 그룹 복습 |
| `scene_order` | 1~N | 콩트 내 문장 순서. 1, 2, 3... 연속 (점프 X) |
| `scene_title` | string | 콩트 제목 (UI 헤더) |
| `speaker` | string | 화자 한국식 호칭 (지점장/박사/라쿤/평론가/검사/단장/회장) |
| `is_stretch` | boolean | currentStage+1 어휘 사용 여부 |

### default + stretch 비율

| 구성 | 비율 | 규칙 |
|---|---|---|
| default 문장 | 60~80% | `stage === currentStage`, `is_stretch: false` |
| stretch 문장 | 20~40% (5문장이면 1~2개) | `stage === currentStage + 1`, `is_stretch: true` |
| Stage +2 이상 | 금지 | §5 점프 가드 준수 |

**배치 권장**: 1번 문장 default (진입 부담 ↓) → stretch 는 중간이나 펀치라인 (맥락 형성 후 만남)

### 캐릭터 풀 7명

한국식 호칭은 **메타에만** 박힘. sentence 안에는 영어 100% (영어 호칭 필요시 `Boss`/`Doc`/`Chief` 등 자연스럽게).

| # | 호칭 | 톤 레퍼런스 | 적합 Stage |
|---|---|---|---|
| 1 | 지점장 | 마이클 스콧 (The Office) — 과시·어색한 농담·인정 욕구 | 1~4 |
| 2 | 박사 | 셸든 (Big Bang Theory) — 무자각·자존감 무한·빈정거림 못 알아챔 | 1~4 |
| 3 | 라쿤 | 로켓 (Guardians) — 슬랭·완곡 욕·짧은 컷오프·자기연민 | 2~4 |
| 4 | 평론가 | 한물간 지식인 — 자기 포장·강자 비굴·열등감 | 2~4 |
| 5 | 검사 | 무감정 관찰자 (Sherlock 류) — 정황 질문·관찰 톤 | 3~4 |
| 6 | 단장 | Coach Taylor 류 — 차가운 재건 리더, 짧은 단언 | 3~4 |
| 7 | 회장 | Logan Roy (Succession) — 욕·고급 어휘 풀 | 4 |
| 8 | 빅맨 | Drax the Destroyer (Guardians) — literal 직역·비유 못 알아먹음·호전·자존감 무한·거짓말 X·솔직·"shall" 절제 | 2~4 |

### Stage 별 등장 가능 페어

| Stage | 등장 가능 | 권장 페어 (다이내믹) |
|---|---|---|
| 1 | 1·2 | 지점장 + 박사 (과시 vs 무자각) |
| 2 | 1·2·3·4·**8** | **라쿤 + 빅맨 친구 여행 (시니컬 천재 vs literal 전사, 가오갤 검증 — Stage 2 1순위)** / 지점장 + 평론가 / 박사 + 평론가 / 지점장 + 라쿤 |
| 3 | 1~6·8 | + 검사·단장 등장 / 라쿤+빅맨 친구 여행 시리즈 |
| 4 | 1~8 | 회장 등장 (Succession 톤) / 라쿤+빅맨 |

### 캐릭터-stage 정합 원칙

화자의 어휘 stage 가 캐릭터 톤과 자연 정합:
- Stage 1 콩트에 박사 등장 시 → 박사 대사가 stretch (Stage 2 어휘) 가 자연스러움
- 라쿤·평론가·검사·단장·회장 등장 시 → 그들의 대사가 stretch 후보 1순위
- 지점장은 stage 무관 default 어휘 풀로 자연스러움 (구어 축약 풀의 표준 화자)

### 시트콤 작법 4원리 (외부 작법 정본)

콩트 작성 시 다음 4원리 적용:

1. **Show-don't-tell** — 캐릭터 설명 X. 1~2번 카드에서 voice 대조 즉시 노출. `scene_intro` 메타는 장소·상황·콩트 진입 톤만 (예: "라쿤이 빅맨을 놀리기 시작한다"). 캐릭터 정의 ("라쿤은 천재 발명가") 박지 X
2. **Setup–Punchline 구조** — 1번 = Hook (캐릭터 voice 즉시) · 중간 = Build/Weaponize · 마지막 = Punchline (newElement 박힌 카드)
3. **Rule of Three** (적정 시) — 패턴 2~3회 반복 후 깨기. 강제 X — 콩트 호흡상 자연 적용
4. **Punchline 자연 선택** — Self-trapping 강제 X. 시나리오·동작에 따라 자연 선택 (자세는 §Punchline taxonomy 참조)

### Punchline taxonomy 5종 (어학 적합도 순)

| 우선 | type | 정의 | 어학 적합 |
|---|---|---|---|
| 1 | **Self-trapping** | 캐릭터가 자기 logic·자랑·솔직성 함정에 빠짐 (Always Sunny / Curb 톤) | 시나리오 제한 — 빅맨 logic 함정 만들 수 있는 상황만 |
| 2 | **Character-driven** | 캐릭터 voice 자체가 펀치 (자기 자랑 유지·literal 절정) | 모든 시나리오 자연 |
| 3 | **Misdirection** | assumption shatter (set up → tear down) | 일반 적용 가능 |
| 4 | **Hyperbole / Escalation** | 과장 점증 | 일반 적용 가능 |
| 5 | **Incongruity** | 논리·맥락 충돌 | 적용 가능 |

회피: Shock / Wordplay / Recognition (학습 noise — Recognition 은 학습자 cognitive load ↑)

**핵심**: Self-trapping 1순위는 임팩트 강하나 시나리오 의존도 큼. 자연 시나리오 (식당·길묻기 류 — 빅맨 logic 함정 만들 수 있음) 에서만 작동. 다른 시나리오는 Character-driven 자연 선택 (즉흥 Self-trapping 강제 시 라벨링 부정확).

### 카드 정의 확장 (시트콤 호흡 정합)

1 카드 = 1 화자의 1 발화 turn (sentence 1~2개 가능). 시트콤 대사 호흡 정본. (기존 "1 카드 = 1 sentence" 기본 유지하되 짧은 turn 묶음 허용)

### 신규 메타 2종

- **`scene_intro`** (string): 콩트 첫 카드 (scene_order=1) 진입 시 학습자에게 노출되는 1~2줄 한국어 컨텍스트. 형식: "장소 + 상황 + 콩트 진입 톤". 캐릭터 설명 금지 (show-don't-tell)
- **`scene_direction`** (string, optional): 카드 사이 narration. 형식: `*(action description)*` 한국어. 콩트 진입·장소 전환·시간 경과 표현 (예: `*(둘은 근처 햄버거 가게에 들어간다)*`)

### 라쿤+빅맨 친구 여행 시리즈 (Stage 2 1순위 페어)

가오갤 Rocket + Drax 페어 검증된 코미디 다이내믹. 라쿤이 빅맨을 습관처럼 놀려먹고 빅맨이 literal 진지하게 받는 친구 동행.

**라쿤 voice 4 패턴:**
- **Hook (1번 카드)**: 일상 실용 표현. "I'm starving. Let's grab a burger." / "We have a reservation." / "Excuse me, where's X?"
- **Weaponize (3~5번)**: 빅맨 logic 받아서 escalation·역이용 ("Cool. Then run ahead. I'll catch the next bus.")
- **Cut**: 짧은 컷오프·deflate. "Just X" / "Cool" / "Sure" / "Right"
- **Affectionate threat idiom**: 친구 농담 위협. "or I will kill you" / "Do you want to die?" / "I'm going to murder you" — 한국 학습자에게 cultural learning (직역 X)

**빅맨 voice 6 패턴:**
- **Literal 직역**: idiom 첫 등장 시 직역 질문. "A killer burger? Who did it kill?" / "Which corner? I see four corners."
- **Logic 응대**: 자기 논리로 받음. "Every duty deserves honor" / "If it has killed before, it may try again"
- **호전·자랑**: "A warrior X" / "I am a man of X" / "My feet are weapons. They require no protection."
- **거짓말 X (솔직)**: 무기 명세 / 친구 공격 인정 / 자기 무지 인정 (사용자 제공 Drax 명세 정합)
- **Self-trap**: 자기 logic·자랑·솔직성의 함정에 빠짐 (펀치라인 후보, 자연 시나리오만)
- **"shall" 절제**: 콩트당 0~1회. 격식체 과용 회피 (이전 시뮬 honor 어쩌구 함정 회피)

### 시나리오 풀 (Stage 2 라쿤+빅맨) + newElement 풀

| 시나리오 | newElement 후보 (Stage 2~3) | 권장 Punchline type |
|---|---|---|
| 식당 | "Do you want to X?" threat idiom / "killer X" slang / "or I will X" / "to die for" | Self-trapping |
| 호텔 | "talk in one's sleep" / "have a reservation" / "two nights/beds" | Character-driven |
| 공항 | 부정 의문 "do you not X" / "step aside" / "carry-on" | Character-driven |
| 렌트카 | "shall take X" / "save by not X-ing" / "would rather X" | Character-driven |
| 대중교통 | 시니컬 confirmation "Yes. Yes I was." / "mock X this entire time" / "miss the bus" | Misdirection |
| 길묻기 | 현재완료 "I have lost the X I was Y-ing" / "around the corner" / "you can't miss it" | Self-trapping |

**newElement 후보 확장 (스펙 §5-0:272 보강):**
- 기존: 문법 1개 OR 새 어휘 1개 OR 발음 1개
- 추가: **시나리오 핵심 idiom 1개** OR **친구 톤 affectionate threat idiom 1개**

콩트 1편 = 1 newElement 펀치라인 카드 박힘 (스펙 §5-0:272 정본 유지)

### 시리즈 callback 운영

같은 페어 (라쿤+빅맨) 의 catchphrase 가 다음 콩트 setup 으로 자연 재사용:
- 라쿤: "or I will kill you" → 다음 콩트에 "Yes. Yes I was." 시니컬 confirmation 등
- 빅맨: "shall" / "warrior" 자랑 → 다음 콩트에 자기 자랑 callback

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
- **콩트 단위 생성** (§6.2): 한 세션 = 5~6문장 1 콩트, scene 메타 5필드 nested
- **default 60~80% + stretch 20~40% 비율**: stretch_level ≤ 1, `currentStage + 2` 점프 금지
- **캐릭터-stage 정합** (§6.2 페어 매트릭스): currentStage 의 등장 가능 풀 안에서만 캐스팅

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

### 콩트 정합 (§6.2)

- [ ] 콩트 모든 문장이 같은 `scene_id` 공유
- [ ] `scene_order` 가 1~N 연속 (점프 없음)
- [ ] `scene_title` 박힘 (콩트 헤더용)
- [ ] stretch 문장 비율이 20~40% (5문장이면 1~2개)
- [ ] 모든 stretch 문장 `stage === currentStage + 1` 이고 `is_stretch: true`
- [ ] default 문장 `stage === currentStage` 이고 `is_stretch: false`
- [ ] `currentStage + 2` 이상 점프 없음
- [ ] `speaker` 가 §6.2 캐릭터 풀 7명 안 (지점장/박사/라쿤/평론가/검사/단장/회장) 한국식 호칭
- [ ] sentence 안에는 한국식 호칭 0건 (영어 100%)
- [ ] 캐릭터 캐스팅이 currentStage 의 등장 가능 풀 안 (Stage 1 → 1·2 만 / Stage 2 → 1·2·3·4 / Stage 3 → 1~6 / Stage 4 → 1~7)

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
