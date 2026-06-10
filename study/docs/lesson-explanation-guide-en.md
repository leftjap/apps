# Study 앱 — 영어 신규 학습 해설 가이드

> 출처: [study-app-spec.md](../specs/study-app-spec.md) §5, §8-3 + i+1 원리 (Krashen Input Hypothesis · jpdb.io / Migaku 운영 방식 · 1T sentence mining)
> 대상: Claude Code 가 영어 콘텐츠 생성 시 참조
>
> ⭐ **활성 모델 (2026-06-08 전환)**: **RealClass-mining — §6.3 이 생성 정본**. 다이얼로그-우선 (세션 첫 페이지 = 전체 장면) + 표현별 drills. 콩트 트랙 (§6.2 우희+여빈) 은 archive — 신규 시드에 사용 금지.
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

> ⚠️ 본 §4 는 콩트 트랙 시절 형식. **활성 RealClass-mining 트랙의 카드 형식은 §6.3** (scene 카드 = sceneTitle/sceneSummary/dialogue, 표현 카드 = key/situation/drills/… — [explanation-schema.md](./explanation-schema.md) 와 정합).

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

## 6.2 콩트 단위 운영 (Skit-based Sessions) — ⛔ archive (비활성)

> **2026-06-08 콩트 모델 폐기** (`seeds/en-parks-s1e1.json` `_note` 박제). 신규 en 시드는 §6.3 RealClass-mining 정본. 본 § 는 미래 다른 트랙 wave 대비 보존만. (ja 트랙의 콩트 운영은 ja 가이드 정본 — 영향 없음)

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
| `speaker` | string | 화자 한국식 호칭. 활성: **우희** / **여빈** (§6.2). archive: 지점장/박사/라쿤/평론가/검사/단장/회장/빅맨 |
| `is_stretch` | boolean | currentStage+1 어휘 사용 여부 |

### default + stretch 비율

| 구성 | 비율 | 규칙 |
|---|---|---|
| default 문장 | 60~80% | `stage === currentStage`, `is_stretch: false` |
| stretch 문장 | 20~40% (5문장이면 1~2개) | `stage === currentStage + 1`, `is_stretch: true` |
| Stage +2 이상 | 금지 | §5 점프 가드 준수 |

**배치 권장**: 1번 문장 default (진입 부담 ↓) → stretch 는 중간이나 펀치라인 (맥락 형성 후 만남)

### (구) 활성 트랙: 우희+여빈 친구 여행 (영어 단독) — 2026-06-08 폐기

**(archive) 콩트 모델 시절 en 활성 트랙 = 우희 + 여빈 친구 여행 단일 페어였음**. 현재 en 활성은 §6.3 RealClass-mining. 시나리오는 §"시나리오 풀" 의 여행 영어 일반 상황에서 선택했었음.

- 페어: **우희** (입담 폭주·자기 서사화·4차원) + **여빈** (시니컬 사이다·돌직구·flat 컷)
- 출처: 이병헌 감독 「멜로가 체질」 임진주(천우희)·이은정(전여빈) 차용 — 배우 이름 우희·여빈 사용
- 다이내믹: **Vitriolic Best Buds** (TV Tropes 정본) — 디스·조롱이 우정 표현. 일방향 mock 금지, 쌍방향 디스 의무

기존 캐릭터 풀 8명 (지점장·박사·라쿤·평론가·검사·단장·회장·빅맨) 은 **현재 트랙에서 사용 X**. 미래 다른 컨셉 (직장·학술 등) 트랙 wave 시 활용 가능, 보존만. 라쿤·빅맨 트랙 5/17·5/19 시드는 학습자 카드 회귀 보호 위해 그대로 유지.

### 캐릭터 풀 (활성 = 우희·여빈 / 보존 = 기존 8명)

한국식 호칭은 **메타에만** 박힘. sentence 안에는 영어 100% (영어 호칭 필요시 `Boss`/`Doc`/`Chief` 등 자연스럽게).

| # | 호칭 | 톤 레퍼런스 | 적합 Stage | 상태 |
|---|---|---|---|---|
| 1 | **우희** | 「멜로가 체질」 임진주 (천우희) — 드라마 작가 4차원·입담 폭주·자기 서사화·자뻑·자기 합리화 | 2~4 | **활성** |
| 2 | **여빈** | 「멜로가 체질」 이은정 (전여빈) — 다큐 감독 사이다·돌직구·flat sarcasm·진심 피로·짧은 컷 | 2~4 | **활성** |
| 3 | 지점장 | 마이클 스콧 (The Office) — 과시·어색한 농담·인정 욕구 | 1~4 | archive |
| 4 | 박사 | 셸든 (Big Bang Theory) — 무자각·자존감 무한·빈정거림 못 알아챔 | 1~4 | archive |
| 5 | 라쿤 | 로켓 (Guardians) — 슬랭·완곡 욕·짧은 컷오프·자기연민 | 2~4 | archive |
| 6 | 평론가 | 한물간 지식인 — 자기 포장·강자 비굴·열등감 | 2~4 | archive |
| 7 | 검사 | 무감정 관찰자 (Sherlock 류) — 정황 질문·관찰 톤 | 3~4 | archive |
| 8 | 단장 | Coach Taylor 류 — 차가운 재건 리더, 짧은 단언 | 3~4 | archive |
| 9 | 회장 | Logan Roy (Succession) — 욕·고급 어휘 풀 | 4 | archive |
| 10 | 빅맨 | Drax the Destroyer (Guardians) — literal 직역·비유 못 알아먹음·호전·자존감 무한·"shall" 절제 | 2~4 | archive |

### Stage 별 페어 ((구) 콩트 트랙 = 우희+여빈 단독 — archive)

| Stage | 활성 페어 | 비고 |
|---|---|---|
| 2 | **우희 + 여빈 친구 여행** | 멜로가 체질 톤 검증, 여행 영어 일반 상황 (§시나리오 풀) |
| 3 | 우희 + 여빈 | 같은 페어, 어휘·문법 stretch 확장 (현재완료·관계대명사·조건문) |
| 4 | 우희 + 여빈 | 같은 페어, 비즈니스·complex 상황 (보험 청구·고객 응대 등) |
| 1 | (활성 X) | Stage 1 = 가나·기초 — 콩트 트랙 비활성. 단순 어휘 카드만 |

(기존 8명 풀의 Stage 페어 정의는 미래 다른 트랙 wave 시 복원 가능, 현재 보존)

### 캐릭터-stage 정합 원칙

활성 페어 (우희·여빈) 는 Stage 2~4 어휘 풀에서 자연 정합. 특수 어휘 풀 X — **기본 동사** (be/have/get/take/give/make/do 변주) 70%+ 의무. 라틴계·추상 어휘 (construct/decline/require 등) 차단.

### 시트콤 작법 4원리 (외부 작법 정본)

콩트 작성 시 다음 4원리 적용:

1. **Show-don't-tell** — 캐릭터 설명 X. 1~2번 카드에서 voice 대조 즉시 노출. `scene_intro` 메타는 장소·상황·콩트 진입 톤만 (예: "여빈이 우희의 자뻑을 컷하기 시작한다"). 캐릭터 정의 ("우희는 드라마 작가") 박지 X
2. **Setup–Punchline 구조** — 1번 = Hook (캐릭터 voice 즉시) · 중간 = Build/Weaponize · 마지막 = Punchline (newElement 박힌 카드)
3. **Rule of Three** (적정 시) — 패턴 2~3회 반복 후 깨기. 강제 X — 콩트 호흡상 자연 적용
4. **Punchline 자연 선택** — Self-trapping 강제 X. 시나리오·동작에 따라 자연 선택 (자세는 §Punchline taxonomy 참조)

### Punchline taxonomy 5종 (어학 적합도 순)

| 우선 | type | 정의 | 어학 적합 |
|---|---|---|---|
| 1 | **Self-trapping** | 캐릭터가 자기 logic·자랑·솔직성 함정에 빠짐 (Always Sunny / Curb 톤) | 우희 자뻑·자기 서사 함정 만들 수 있는 상황 (자연 발생 빈번) |
| 2 | **Character-driven** | 캐릭터 voice 자체가 펀치 (자기 자랑 유지·literal 절정) | 모든 시나리오 자연 |
| 3 | **Misdirection** | assumption shatter (set up → tear down) | 일반 적용 가능 |
| 4 | **Hyperbole / Escalation** | 과장 점증 | 일반 적용 가능 |
| 5 | **Incongruity** | 논리·맥락 충돌 | 적용 가능 |

회피: Shock / Wordplay / Recognition (학습 noise — Recognition 은 학습자 cognitive load ↑)

**핵심**: 우희 자뻑 voice 가 모든 시나리오에서 Self-trapping 자연 발생 (영어 잘하는 척 → 들통 / 자기 서사화 → 무너짐). 라쿤·빅맨 페어 시절 시나리오 의존성 해소. 그래도 펀치라인 자체는 Character-driven (여빈 마지막 한 방) 이 1순위 — Self-trapping 강제 라벨링 회피.

### 카드 정의 확장 (시트콤 호흡 정합)

1 카드 = 1 화자의 1 발화 turn (sentence 1~2개 가능). 시트콤 대사 호흡 정본. (기존 "1 카드 = 1 sentence" 기본 유지하되 짧은 turn 묶음 허용)

### 신규 메타 2종

- **`scene_intro`** (string): 콩트 첫 카드 (scene_order=1) 진입 시 학습자에게 노출되는 1~2줄 한국어 컨텍스트. 형식: "장소 + 상황 + 콩트 진입 톤". 캐릭터 설명 금지 (show-don't-tell)
- **`scene_direction`** (string, optional): 카드 사이 narration. 형식: `*(action description)*` 한국어. 콩트 진입·장소 전환·시간 경과 표현 (예: `*(둘은 근처 햄버거 가게에 들어간다)*`)

### 우희+여빈 친구 여행 시리즈 (Stage 2 1순위 페어)

「멜로가 체질」 임진주·이은정 페어 검증된 코미디 다이내믹. 우희가 드라마 작가 답게 매 상황을 자기 서사화·입담 폭주, 여빈이 다큐 감독 답게 flat sarcasm·돌직구로 컷. **Vitriolic Best Buds — 디스·조롱·농담이 voice 의 기본값.**

**우희 voice 5 패턴 (입담 폭주·자기 서사화):**
- **Hook (1번 카드)**: 자뻑 진입 또는 4차원 자기 서사화 ("I have a feeling about this place." / "Watch this. My English is amazing.")
- **입담 폭주**: 묻지도 않은 정보 자기 서사화 ("We are here to make memories." / "We are best friends from Korea.")
- **자기 합리화**: 들통 직후 합리화 ("I was being polite." / "I was being charming." / "Rude.")
- **4차원 비유**: 일상을 dramatic 서사로 ("Money does not get to decide my life." / "You take all the magic.")
- **메인 어택커 반전 (회차 누적 후)**: 가끔 여빈 약점 한 방 — 일방향 mock 아닌 쌍방향 디스 ("At least I talk to people. You just glare.")

**여빈 voice 5 패턴 (시니컬 사이다·flat 컷):**
- **flat sarcasm**: 짧은 마침표 컷 ("It is a hotel." / "That is exactly what I thought." / "Of course.")
- **사실 폭로**: 우희 자뻑 직격 ("You did not get a word of that." / "Your card died yesterday.")
- **정정 (idiom anchor)**: 카운터·행인에 정정 ("She means we have a reservation. Just two nights.")
- **친구 톤 affectionate threat**: "Talk again, and I will end you." / "Try me." (라쿤 자리 계승)
- **진심 피로 노출 (가끔)**: 다큐 감독 + 슬픈 내면 측면 ("Do you ever stop talking." / "My life is also taking forever.")

**Vitriolic Best Buds 운영 의무:**
- 콩트당 양쪽 합산 디스·조롱·농담 **3회+** (단순 한 방 X)
- **쌍방향 검증** — 우희·여빈 각자 최소 1회 어택. 일방향 mock 회귀 시 라쿤·빅맨 5/19 실패 재발
- **농담 디자인 4패턴 (어휘 의존 X, 구조·반전으로):**
  - 단순 반전 ("I have money." → "No, you don't.")
  - 사실 폭로 ("Your card died yesterday.")
  - flat sarcasm ("It is literally about the time.")
  - 친구 톤 위협 ("Talk again, and I will end you.")

### 시나리오 풀 — 여행 영어 일반 상황 10 카테고리 (Stage 2 우희+여빈)

여행 영어가 다루는 일반 상황 전부 포괄. 각 시나리오 = 1 콩트, newElement 1개 펀치라인 카드 박힘.

**1. 공항·비행 (Airport & Flight)**

| 시나리오 | newElement 후보 | 권장 Punchline |
|---|---|---|
| 체크인 카운터 | "boarding pass" / "checked baggage" / "window or aisle" | Character-driven |
| 보안 검사 | 부정 의문 "do you not X" / "step aside" / "carry-on" | Character-driven |
| 면세점 | "duty-free" / "would you mind X-ing" | Misdirection |
| 게이트·탑승 | "now boarding" / "row by row" | Character-driven |
| 기내 | "would you like X" / "press the call button" | Self-trapping |
| 환승·도착 | "connecting flight" / "purpose of your visit" / "anything to declare" | Character-driven |
| 짐 분실 | "my luggage is missing" / "fill out this form" | Hyperbole |

**2. 숙박 (Hotel)**

| 시나리오 | newElement | Punchline |
|---|---|---|
| 체크인 | "have a reservation" / "two nights/beds" / "talk in one's sleep" | Character-driven |
| 체크아웃·과금 | "checkout time" / "extra charges" / "minibar" | Misdirection |
| 룸서비스 | "I'd like to order X" / "send it up" | Character-driven |
| 객실 문제 | "the X doesn't work" / "can I have a new room" | Self-trapping |

**3. 교통 (Transportation)**

| 시나리오 | newElement | Punchline |
|---|---|---|
| 택시 | "where to" / "keep the change" / "step on it" | Hyperbole |
| 버스 | 시니컬 confirmation "Yes. Yes I was." / "miss the bus" / "the next one" | Misdirection |
| 렌트카 | "shall take X" / "save by not X-ing" / "would rather X" | Character-driven |
| 기차·지하철 | "round trip" / "one-way" / "which platform" | Character-driven |
| 우버·앱 | "request a ride" / "share location" | Self-trapping |

**4. 식당 (Restaurant)**

| 시나리오 | newElement | Punchline |
|---|---|---|
| 메뉴 주문 | "killer X" slang / "to die for" / "Do you want to die?" threat | Self-trapping |
| 예약 | "table for two" / "do you have a reservation" | Character-driven |
| 계산·팁 | "split the bill" / "keep the change" / "service included" | Misdirection |
| 알레르기·dietary | "I'm allergic to X" / "any nuts" / "gluten-free" | Character-driven |

**5. 쇼핑 (Shopping)**

| 시나리오 | newElement | Punchline |
|---|---|---|
| 가격·할인 | "what's the price" / "any discount" / "haggle" | Hyperbole |
| 사이즈·교환 | "do you have it in X" / "I'd like to exchange" | Character-driven |
| 세금환급 | "tax refund" / "fill out the form" | Misdirection |
| 기념품 | "where can I find X" / "made locally" | Character-driven |

**6. 길찾기·관광 (Navigation & Sightseeing)**

| 시나리오 | newElement | Punchline |
|---|---|---|
| 길묻기 | 현재완료 "I have lost the X I was Y-ing" / "around the corner" / "you can't miss it" | Self-trapping |
| 관광지 안내 | "how long does it take" / "worth visiting" | Misdirection |
| 투어·티켓 | "book a tour" / "audio guide" / "skip the line" | Character-driven |
| 박물관 | "no flash photography" / "where's the entrance" | Self-trapping |

**7. 돈 (Money)**

| 시나리오 | newElement | Punchline |
|---|---|---|
| 환전 | "exchange rate" / "small bills please" | Character-driven |
| ATM·카드 | "my card is stuck" / "declined" / "PIN" | Self-trapping |

**8. 응급·문제 해결 (Emergency & Trouble)**

| 시나리오 | newElement | Punchline |
|---|---|---|
| 의사·약국 | "I have a X" / "over-the-counter" / "prescription" | Character-driven |
| 분실물 | "I lost my X" / "did someone turn it in" | Misdirection |
| 경찰·신고 | "report a theft" / "do you speak English" | Self-trapping |
| 고객 응대 (불만) | "this isn't what I ordered" / "speak to the manager" | Hyperbole |

**9. 소셜 (Social)**

| 시나리오 | newElement | Punchline |
|---|---|---|
| 인사·자기소개 | "nice to meet you" / "where are you from" | Character-driven |
| 스몰토크 | "have you been to X" / "what brings you here" | Misdirection |
| 약속·헤어짐 | "see you later" / "stay in touch" / "let's grab a coffee" | Character-driven |

**10. 통신 (Communication)**

| 시나리오 | newElement | Punchline |
|---|---|---|
| 와이파이·SIM | "free wifi" / "buy a SIM card" / "what's the password" | Self-trapping |
| 로밍·전화 | "is roaming on" / "expensive call" | Character-driven |

총 **약 32 시나리오**. 자연어 트리거가 콩트 생성 시 카테고리 + 세부 시나리오 선택 → newElement 풀에서 1개 박음.

**newElement 후보 확장 (스펙 §5-0:272 보강):**
- 기존: 문법 1개 OR 새 어휘 1개 OR 발음 1개
- 추가: **시나리오 핵심 idiom 1개** OR **친구 톤 affectionate threat idiom 1개**

콩트 1편 = 1 newElement 펀치라인 카드 박힘 (스펙 §5-0:272 정본 유지)

### 시리즈 callback 운영

같은 페어 (우희+여빈) 의 catchphrase 가 다음 콩트 setup 으로 자연 재사용:
- 우희: "Watch this. My English is amazing." / "I have a feeling about this place." → 다음 콩트에 자뻑 callback
- 여빈: "I will end you." / "Of course." / "Do you ever stop talking." → 다음 콩트에 컷 callback

---

## 6.3 RealClass-mining 트랙 (⭐ 활성 — 2026-06-08 전환)

본인 유료 구독 **리얼클래스(RealClass) 미드 스크립트의 개인 학습 발췌** 기반. 현재 소스 = Parks and Recreation S1E1. 실제 미드 맥락 (화자·관계·상황) 을 **전체 다이얼로그로 먼저** 접하고 → 문장(표현) 단위 학습으로 진입 (사용자 합의 — 맥락이 학습에 도움).

**형식 정본** = [`seeds/en-parks-s1e1.json`](../seeds/en-parks-s1e1.json). 렌더링: `src/components/session/scenePage.js` (다이얼로그 페이지) + `src/components/session/explanationPanel.js` `drillsSection` (변주).

### 소스 (로컬 전용 — 커밋 금지)

- 경로: `~/apps/study/seeds/sources/realclass-parks-s1e1.txt` (145문장, `EN:`/`KO:` 쌍, 문장번호)
- **gitignored** (`study/seeds/sources/`) — repo 가 PUBLIC 이므로 유료 콘텐츠 전문 커밋 금지. 시드에는 학습 발췌 (다이얼로그 6~10줄 압축 + 표현 카드) 만 커밋
- **소스 파일 부재 시 생성 중단** — 사용자에게 소스 파일 요청. 기억·추측으로 대사 재구성 금지

### 세션 구조 (1세션 = 1장면)

| 카드 | order_index | 역할 |
|---|---|---|
| **scene 카드** 1장 | **0** | 세션 첫 페이지 = 전체 다이얼로그 (줄마다 [듣기] + [시작하기]) |
| **표현 카드** 5~7장 | 1~ | 장면 속 핵심 표현 1개씩 — 뜻/핵심 + drills 변주 + 듣기/녹음 |

### scene 카드 형식

- `sentence` = 장면 제목 (한국어) / `meaning` = "전체 장면을 먼저 듣고 '시작하기'를 누르세요." / `reading`·`phonetic_kr` = null
- `explanation`:

```json
{
  "sceneTitle": "토론회 — 구덩이 신고",
  "sceneSummary": "공개 토론회에서 간호사 앤이 동네 구덩이 문제를 제기하고, 톰이 끼어든다.",
  "dialogue": [ { "speaker": "Leslie", "en": "...", "ko": "..." } ]
}
```

- `dialogue` 6~10줄. 원 대사 순서 유지하되 **학습용 압축·발췌 허용** (s1e1 정본: 원문 ~50문장 구간 → 8줄)
- scene 카드는 복습 큐 이관 자동 제외 (`sessionFinish.js` — 완료 표시만). 시드 측 작업 없음

### 표현 카드 형식 (`explanation`)

| 필드 | 내용 |
|---|---|
| `key` | 핵심 한 줄 — "표현 = 뜻. 성격." |
| `situation` | "장면 · …" — 장면 안 맥락 한 줄 |
| `drills` | `[{en, ko}]` 3~8개 — [explanation-schema.md](./explanation-schema.md) §drills 규칙 (핵심·헷갈림 6~8 / 쉬움 3, 패턴 치환 ~70% + 뜻 범위 ~30%) |
| `mistake` | 한국인 관점 함정 (직역 오해·발음 연음) 한 줄 |
| `similar` | 같은 뜻 대체 표현 1~2개 |
| `category` / `frequency` | 분류 / 1~10 빈도 |

- `sentence` = 장면 속 원문 (학습용 최소 단순화 허용) / `phonetic_kr` = 연음 반영 음차 (§7 규칙 동일)
- 콩트 메타 (skit*/scene_id/stage/newElements/knownElements) **미사용** — s1e1 정본 기준
- TTS·녹음·다이얼로그 색 강조 전부 코드 자동 — 시드 측 추가 필드 불필요

### 발췌 기준 (3종 — 사용자 합의)

1. **단순 인사·짧은 리액션 단독 제외** — Hello / Hi / Okay / Here we go 단독 등 학습 가치 없는 줄
2. **미국 지방정부·행정 고유 디테일 제외** — 학습자 수준·상황 (미드 자막 의존도 낮추기 + 여행 + 비즈니스 일상 회화) 과 무관한 내용
3. **일상 전이 가능 표현 우선** — 구동사·관용구·기본동사 chunk (fire away / care for / move on / bottom line 류)

### 중복 방지 (사용 이력)

- 사용 이력 정본 = repo `seeds/en-*.json` 중 Parks 출처 시드 (`_note` 에 출처 장면·문장 범위 명시 의무)
- 신규 장면의 dialogue·표현이 기존 시드와 겹치면 다른 장면 선택

### 파일·ID 규칙

- 파일명 `seeds/en-<YYYY-MM-DD>.json` (자동화 워크플로 `study-seed-supabase.yml` 인자 정합)
- payload `_note` 에 모델·출처 장면 (에피소드 + 스크립트 문장 번호 범위) 명시
- 카드 id `en-parks-s1e1-<slug>` — 전 시드 통틀어 고유

### 생성 후 자체 체크리스트 (en 활성 트랙)

- [ ] scene 카드 1장 — `order_index: 0` + `explanation.dialogue` 배열 (6~10줄, speaker/en/ko 완비)
- [ ] 표현 카드 5~7장 — 각 `drills` 3~8개 (en 필수, ko 동반)
- [ ] 발췌 기준 3종 통과 (인사 단독 0 / 행정 디테일 0 / 일상 전이성 O)
- [ ] 기존 Parks 시드와 dialogue·표현 중복 0
- [ ] 카드 id 전 시드 고유
- [ ] `_note` 에 출처 장면 문장 번호 범위 명시
- [ ] INSERT 전 라이브 미완료 en 신규 카드 확인 — 5건 초과 시 INSERT 보류 + 사용자 안내 (spec §5-0 단계 4)

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

> ⭐ 활성 RealClass-mining 트랙의 생성 원칙·구조 = **§6.3 정본**. 아래 일반 원칙 중 구어체·발음·phonetic_kr·drills 류는 유효하나, **콩트 관련 항목 (콩트 단위 생성 / default+stretch / 캐릭터 / 디스·농담) 은 archive (§6.2)**.

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
- **기본 동사 우선** (§6.2): sentence 동사 풀의 70%+ 가 **be / have / get / take / give / make / do** 의 변주. 라틴계·추상 어휘 (construct / decline / require / warrior 등) 차단
- **단문 reaction 단독 카드 금지**: "Of course." / "Sure." / "Got it." / "Right." 단독 카드 X. 복습 카드 가치 ↓. reaction 도 절로 확장 ("That is exactly what I thought." / "Take a year.")
- **모든 카드 = 절 1+ + 학습 포인트 1+**: subject + verb 절 최소 1개 + (idiom · grammar 구조 · phoneme 묶음) 중 최소 1
- **디스·조롱·농담이 voice 의 기본값** (§6.2): 평서문 자기 자랑 일변도 금지 (5/19 라쿤·빅맨 회귀 방지). 콩트당 양쪽 합산 디스 3회+
- **농담은 구조·반전으로** (어휘 의존 X): 단순 반전 · 사실 폭로 · flat sarcasm · 친구 톤 위협 4패턴 위주

---

## 11. 자체 검증 체크리스트

> ⭐ **활성 트랙 (RealClass-mining) 체크리스트 = §6.3 "생성 후 자체 체크리스트"**. 아래는 콩트 트랙 (§6.2 archive) 체크리스트 — 신규 en 시드에 적용하지 않음.

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
- [ ] `speaker` 가 §6.2 활성 페어 안 (우희 또는 여빈) — archive 캐릭터 (지점장/박사/라쿤/평론가/검사/단장/회장/빅맨) 신규 시드 사용 X
- [ ] sentence 안에는 한국식 호칭 0건 (영어 100%)

### Vitriolic Best Buds 운영 (§6.2 우희+여빈 페어 의무)

- [ ] 모든 카드 sentence 에 절 1+ 포함 (단문 reaction 단독 0건 — "Of course." / "Sure." / "Got it." 단독 X)
- [ ] 콩트당 디스·조롱·농담 양쪽 합산 **3회+** (sarcasm cut · 사실 폭로 · 친구 톤 위협 · 정정 모욕 중)
- [ ] **쌍방향 검증** — 우희·여빈 각자 디스 최소 1회 (일방향 mock 0건)
- [ ] sentence 동사 풀 — **기본 동사** (be/have/get/take/give/make/do 변주) 70%+
- [ ] 라틴계·추상 어휘 (construct/decline/require/warrior 등) **0건**

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
