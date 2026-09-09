# 작업지시서 — 코어100 발음 표기(phonetic_kr) gold 3차안 작성 → 검토 → 화자 평가 → 시드 반영

> 작성 2026-09-08 저녁. 이 문서 하나로 새 세션이 맥락 없이 이어갈 수 있게 썼다.
> **읽는 순서**: §1 원칙 → §2 실패 이력 → §3 현재 상태 → §4 이번 과제 → §5 그 다음 → §6 도구 → §7 미결.
> 관련 정본: `lesson-explanation-guide-en.md` §7 "phonetic_kr 의 정의" · `pronunciation-research-log.md`.
>
> **2026-09-09 상태**: §4 의 3차안은 사용자 전수 감사(27건)·2차 판정(4건)·최종 정리(4건)를 거쳐 **확정 gold 로 승인·커밋됐다**
> (`core100-gold.md`, 커밋 dfee645). 확정 표기는 그 문서를 따른다. 이 문서의 표기 예시는 3차안 작성 당시 것이라 일부가
> 확정 규약과 다르며, 아래 §1.3·§4.3 의 예시만 확정 규약(약형 you 는 ㅓ 계열: `커저`·`워러여`·`워러r여`·`저`)으로 고쳤다.
> 부록 A 의 `to` 초안은 참고용 그대로다. §5.2 1차(8화자 × 100문장 측정, `~/apps/tmp/voice-eval-2026-09/matrix.md`)와 §5.4 시드 반영(2026-09-09,
> `phonetic_kr`·`chunks[].kr`, 대조 테스트 `scripts/core100-gold.test.mjs`)은 끝났다. Supabase 사용자 행 100장은 PATCH(내용 열만)로 반영·화면 검증 완료(2026-09-09). 남은 것: 블라인드 청취 → 음원 보정 → 드릴 1,411건 + `phonemes` 팁 옛 표기.

---

## 1. 확정된 원칙 (사용자 확정, 변경 금지)

### 1.1 phonetic_kr 이 무엇인가
`phonetic_kr` 은 영어 철자를 한글로 옮긴 독음이 **아니다.** **중립적인 현대 미국인의 자연스러운 대화체 발화가
한국인 귀에 어떻게 들리는지를 옮긴 청각·재현 단서**다. 음소 전사도 아니다. `아을` 은 /aɪɫ/ 의 IPA 가 아니라
한국인이 그 소리를 재현하는 데 쓰는 단서다.

### 1.2 세 층을 섞지 않는다
| 층 | 내용 | 지위 |
|---|---|---|
| `spoken_target` | 중립 미국 회화의 목표 발화 | **SSOT** (아직 런타임 스키마 아님, 저작 기준으로만) |
| `phonetic_kr` | 그 목표 발화의 한국어 청각 단서 | 화면에 보이는 것 |
| `audio` (TTS) · Azure 발음평가 | 목표를 구현·측정하는 하위 수단 | **SSOT 아님** |

**TTS 가 못 내는 발음이라고 phonetic_kr 을 또박또박형으로 되돌리지 않는다.** 도구의 한계는 도구 쪽에서
풀거나(화자 교체·`<sub alias>`·IPA 태그) 카드에 "음원이 목표를 못 낸다" 고 명시한다.

### 1.3 default_kr 의 정의 (2026-09-08 저녁 확정 — 가장 중요)
> **미국 성인이 정상적인 회화 속도에서 해당 단어를 특별히 강조하지 않고 말할 때 가장 대표적이고
> 자연스러운 realization 을 한국인이 재현하도록 만든 표기.**

핵심은 **"필수인가" 가 아니라 "대표적인가"** 다. 음성학적으로 선택적(optional)인 현상도 중립 회화에서
대표적이면 기본형에 들어간다. `but I → 버라이`, `let me → 레미`, `could you → 커저`, 비강세 `you → 여` 가 그 예다.
**"optional 이면 기본형에서 제외" 라고 해석하면 기본형이 교과서 영어로 되돌아간다** — 2차안이 그 실패였다.

반대로 **"이 현상이 존재한다 → 모든 문맥에 적용" 도 금지**다. 1차안이 그 실패였다. 여러 강한 축약을
한 문장에 연쇄 적용해 '가장 많이 줄어든 형태' 를 기본형으로 만들지 않는다.

### 1.4 두 축 (절대 합치지 않는다)
**축 1 — realization_status** (그 표기가 어떤 발화인가)
- `DEFAULT` 정상 회화의 production target (기본형 칸)
- `COMMON` 매우 흔한 다른 실현형
- `FAST` 빠르고 캐주얼할 때 알아들어야 할 형태 (여러 강한 축약이 연쇄된 것만)
- `CAREFUL` 강조하거나 또박또박 말할 때의 형태

**축 2 — evidence_confidence** (그 판정의 근거가 얼마나 확실한가)
- `HIGH` 사전·음성학 교재가 명시 (예: have to /hæftə/, used to /justə/, for /fɚ/)
- `MEDIUM` 일반 원리에서 도출되나 문맥 의존 (예: 특정 자리의 flap)
- `LOW` 판단 근거 부족 (예: I'll 의 한글 표기)

2차안의 A/B/C 는 이 두 축을 하나로 뭉갠 것이라 **폐기**했다.

### 1.5 금지 사항 (실패 이력에서 도출)
1. 전역 치환·정규식 규칙 금지. `dark L = 을`, `t = ㄹ`, `to = 터`, `to = 러/터 규칙` 전부 금지.
2. 한 현상만 골라 전수조사하고 나머지를 통과시키는 것 금지 (t/d 만 55곳 세던 실수).
3. Azure 점수·정렬 수치로 승자를 정하는 것 금지. 후보 선별과 상대 비교에만 쓴다.
4. 예상 음소 정렬(PA Words/Phonemes) 을 실제 음소 관찰로 착각하는 것 금지 (§6.3).
5. 단일 폐쇄시간 cutoff 로 flap 판정 금지.
6. 평활 DFT 포먼트 값으로 화자 순위 매기기 금지.
7. TTS 한계를 학습 목표에 되먹이기 금지.
8. 화자 선정을 gold 확정보다 앞에 두기 금지. **gold 100문장이 화자를 평가하는 벤치마크다.**
9. 시드·런타임 코드 수정은 사용자가 gold 를 확정한 뒤에만. 그때도 test-first.

---

## 2. 이번 세션의 실패 이력 (같은 실수를 하지 않기 위해)

순서대로 이렇게 헤맸다. 각각 사용자 지적으로 정정됐다.

| # | 실수 | 정정 |
|---|---|---|
| 1 | 철자 독음에 묶임 (`왓 아이`, `아일`) | 정의 개정 |
| 2 | 앱 채점 경로가 아닌 STT-lexical 로 `왓 아이` 가 낫다고 권장 | 앱 경로(발음평가)로 재면 손해 없음 |
| 3 | 측정하기 쉬운 t/d flap 만 55곳 전수조사, `have to`·`let me` 통과 | 모든 현상을 함께 보라 |
| 4 | "TTS 가 못 내면 tips 로 내리자" — 도구 한계를 목표에 되먹임 | 금지 |
| 5 | 화자 선정 → gold 순서로 뒤집음 | gold 먼저 |
| 6 | PA 예상 음소의 Duration·Accuracy 를 실제 음소로 착각 → "어느 화자도 축약 안 함" 오결론 | NBestPhonemes + 파형으로 재분석해 철회 |
| 7 | `폐쇄 0ms = flap` 단일 cutoff, L/모음 지속시간비 = dark L 강도 | 둘 다 폐기 |
| 8 | 1차 gold: 근거 없는 `to` 규칙(모음 뒤 러/무성음 뒤 터) + 최대 축약을 gold 로 | 규칙 폐기 |
| 9 | 2차 gold: optional 을 전부 변이로 빼서 기본형이 careful speech 로 후퇴 (`버라이→벗 아이`) | 1.3 정의로 정정 |
| 10 | 2차 gold: `to` 23곳 전부 `터` — 또 하나의 전역 규칙 | 문장별 판정 |

**공통 패턴**: "정답을 먼저 정의하고 도구를 평가" 대신 "도구에서 나오는 숫자로 정답을 정의". 3차안에서는
**"이 문장을 미국인이 보통 대화할 때 가장 대표적으로 어떻게 말하나" 를 문장 단위로 판단**한다.

---

## 3. 현재 상태

### 3.1 커밋된 것 (main, 전부 push 됨)
| 커밋 | 내용 |
|---|---|
| `6b67eaf` | 채점: Display 숫자 표기 오누락 수정(커버리지 Lexical 우선) + 억양 기준점 100→90 (scoreModel ded2) |
| `0ef0130` | 가이드 §7 에 phonetic_kr 정의 6개 조항 |
| `9f42f76` | 가이드 §7 을 규칙만 남기고 실측 기록을 `pronunciation-research-log.md` 로 분리. §7 자기모순("강한 축약은 음차에 적지 않는다") 폐기. `validate-seed.mjs` 의 받침+ㅇ 연음 정규식 경고 제거 |
| `4748c9e` | 화자 12종 비교 실험 기록 (⚠ 이 커밋의 "어느 화자도 축약 안 함 → Azure 전반 성질" 결론은 다음 커밋에서 철회) |
| `251414b` | 위 결론 철회·재분석 (NBestPhonemes + 파형 유성 분석) |
| `e8690c9` | 재분석의 증거 수준 하향 (삭제 판정·dark L·I'll 을 확정에서 내림) |

**시드(`seeds/en-core100-*.json`)·런타임 코드는 이 작업으로 한 줄도 바뀌지 않았다.**
`6b67eaf` 의 채점 변경(ded2)은 배포됐고 그것과 이 작업은 별개다.

### 3.2 커밋되지 않은 산출물 (untracked, 영구 위치)
| 경로 | 내용 | 지위 |
|---|---|---|
| `~/apps/tmp/core100-gold-proposal.md` | **1차안** — 최대 축약형. 근거 없는 to 규칙 포함 | 폐기. 참고만 |
| `~/apps/tmp/core100-gold-proposal-v2.md` | **2차안** — A/B/C 등급, 기본형이 careful 로 후퇴 | 폐기. 참고만. 다만 "흔히 들리는 변이" 칸의 내용은 3차 COMMON/FAST 재료로 쓸 만하다 |
| `~/apps/tmp/voice-bakeoff/*.mp3` | 화자 8종이 진단문 12개를 읽은 음성 (Aria·Andrew·Ava·AvaMulti·NovaTurbo·Kai·Emma·Brian) | 사용자 블라인드 청취용. §5.3 |
| `~/.local/state/study-probe/phonetic-kr-20260908/gold/` | 1·2차안 저작 데이터(`part*.py`, `v2*.py`) — 3차안은 이 구조를 재사용 | 재료 |
| `~/.local/state/study-probe/phonetic-kr-20260908/` | `detect2.json`(코어100 100문장 앱 음원 정렬·flap 판정), `evidence100.json`(음소 길이·경계 간극), `nbest.json`, `acoustic.json`, `bakeoff/result.json`, 측정 스크립트(`*.mjs`), `acoustic.py` | 재료·도구 |
| `~/.local/state/study-probe/pa-itn-probe-20260906/` | 9/6 원어민 TTS 픽스처 (채점 ITN 결함 재현용) | 별개 작업 |
| `~/apps/tmp/e2e-20260906/` | 9/6 가짜 마이크 e2e 산출물 | 별개 작업 |

`~/apps/tmp` 는 **gitignore 가 아니다**. 다만 Stop 훅 스냅샷은 `git add -u`(추적 파일만)라 untracked 는 안 올라간다.
그래도 커밋 시 `git add -A` 금지 — 파일을 지정해 add 한다.

### 3.3 다른 세션의 작업과의 관계
같은 날 다른 세션이 **미니대화**(코어100 19~24번, `2026-09-08-mini-dialogue-plan.md`, `speak-loop-plan.md`,
`validate-seed.mjs` 의 miniDialogue 검사, `sessionExprV2.js` 의 미니대화 블록)를 커밋했다. 이 작업과 파일이 겹칠
수 있는 곳은 `validate-seed.mjs` 와 `sessionExprV2.js` 다. **gold 확정 전에는 둘 다 건드릴 일이 없다.**
시드 반영 단계(§5.4)에서 `validate-seed.mjs` 에 손댈 때 최신 main 을 먼저 pull 하고 그 세션의 miniDialogue
검사 블록을 보존한다.

---

## 4. 이번 세션의 과제: 3차 gold 제안서 작성

### 4.1 출력물
`~/apps/tmp/core100-gold-proposal-v3.md` (untracked). 100문장 전부. 문장당 다음 항목.

| 항목 | 내용 |
|---|---|
| **English** | 원문 그대로 |
| **현행** | 시드의 `phonetic_kr` 그대로 (`detect2.json` 의 `kr` 필드에 100개 있음) |
| **기본형 (DEFAULT)** | §1.3 정의에 따른 대표 realization. 현행과 같으면 "(현행 유지)" |
| **다른 실현형** | 있으면 각각 `COMMON:` `FAST:` `CAREFUL:` 라벨을 붙여 나열. 없으면 "—" |
| **현상** | 그 문장에서 판단한 connected-speech 현상 목록. 기본형에 반영한 것과 변이로 보낸 것을 구분 |
| **확신도** | 기본형 판정에 대한 HIGH / MEDIUM / LOW 와 한 줄 이유 |
| **근거** | 왜 그 형태가 대표적인가. 사전·교재·일반 원리. 문맥 의존이면 그 문맥을 적는다 |
| **현재 앱 음원** | 측정한 것만. **정답을 정하지 않는 구현 QA 칸**임을 표 머리에 명시. 미측정은 "미측정" |

문서 머리에 §1.3 정의, 두 축, 금지 사항을 요약해 박는다(다음 검토자가 문서만 봐도 기준을 알게).

### 4.2 작성 절차
1. `detect2.json` 에서 100문장과 현행 표기를 읽는다. 순서는 `n` 필드(1~100, 파일 순·order_index 순).
2. **문장 하나씩** 다음 질문에 답한다: "미국 성인이 이 문장을 정상 속도로 특별한 강조 없이 말하면
   가장 대표적으로 어떻게 들리나?" 그 답을 기본형으로 쓴다. 규칙표를 만들어 대입하지 않는다.
3. 기본형과 다른 자연스러운 실현형이 있으면 COMMON/FAST/CAREFUL 로 나열한다.
4. 문장별로 확신도와 근거를 적는다.
5. 100개를 다 쓴 뒤 **자기 점검(§4.4)** 을 돌린다.
6. 2차안(`v2*.py`)의 "흔히 들리는 변이" 는 COMMON/FAST 재료로 재활용 가능. 2차안의 **기본형은 재활용하지
   않는다**(careful 로 후퇴한 판이다).

### 4.3 항목별 지침 (사용자가 직접 정한 것)

**`to`** — 전역 규칙 금지. "23곳 전부 터" 도 금지. 문장별로 판정한다. 알아둘 사실: `to` 의 기본 약형은 [tə]
이고, /t/ 의 flap 은 **별개의 선택적 과정**이며 모음뿐 아니라 /m n ŋ l r w j/ 뒤에서도 일어날 수 있다.
뒤 단어가 모음으로 시작하면 [tu] 를 유지하는 화자도 많다. 뒤 동사가 생략된 자리(`I'd love to.`, 16번)는
강형 [tu]=`투` (HIGH). `to` 가 든 문장은 3·4·10·15·16·19·22·31·40·45·47·55·56·60·62·64·67·70·73·76·77·84·93 이다.
부록 A 에 문장별 1차 판정 초안을 두었다 — 참고만 하고 그대로 베끼지 않는다.

**비강세 `you`** — weak form [jə] 가 정상 체계다. 강조·대비가 없는데 `유`(강형)를 기본으로 두지 않는다.
한글 표기는 `여` 계열(또는 구개음화와 합쳐 `쥬`·`츄`·`처`). ⚠ `여` 가 한국인에게 낯설 수 있다 — 표기 자체의
가독성은 검토 항목으로 남긴다.

**구개음화** (`do you`·`could you`·`would you`·`did you`·`what you`·`told you`·`thought you`·`make you`·`ask you`·`pick you`)
— 정상 회화의 대표 realization 이면 기본형. (확정 gold 에서 구개음화+약형 you 의 모음은 ㅓ 로 통일됐다: `커저`·`워저`·`쏘처`·`언더r스투저`. 3차안 당시의 "현행 `쿠쥬`·`디쥬`·`쏘츄` 유지" 지시는 감사에서 폐기.)
`what you` 는 /t/+/j/→[tʃ] 와 비강세 you 가 함께 가서 [wʌtʃə] → **`왓처`** 계열. `왓츄` 는 you 를 강형으로
남겨 불균형(사용자 지적).

**`let me → 레미`, `give me → 기미`** — 흔한 informal elision 이지만 사용자는 **기본형 후보**로 본다.
"optional" 이라는 이유만으로 COMMON 으로 내리지 않는다. CAREFUL 에 `렛 미`·`기v 미` 를 남긴다.

**어휘 축약 (HIGH)** — `have to → 해프터`(사전 /hæf.tu/ + 약화), `supposed to → 써포우스터`, `used to → 유우스터`,
`want to → 워너`(동사구 앞일 때. 47번 `want me` 는 아님), `going to → 거너`(**미래표지일 때만**. 63번 `train going
in` 은 이동 의미라 금지). 원문이 이미 gonna/wanna/gotta/lemme/kinda 인 81~86번은 그대로.

**flap** — 모음 사이 /t d/ 의 flap 은 Standard American 의 대표 특성이다. `but I → 버라이`, `but it's → 버릿츠`,
`what I → 와라이`, `about it → 어바우릿`, `put it → 푸릿` 류는 **기본형에 둔다**(2차안에서 되돌린 것을 복구).
다만 강세 경계로 끊기는 자리(72번 `that isn't`, 90번 `appreciate everything`, 50번 `wait and` — 앱 음원에서
끊김 확인)는 문장별로 본다.

**h 탈락** (`her`·`him`) — 문맥별. 39번 `meet her` 는 비강세 her 가 [ɚ] 로 가고 t 가 flap 되어 [miːɾɚ]. 표기는
**`미이러r`** — `미러r` 은 meet 의 장모음을 지우므로 금지(사용자 지적). CAREFUL `미잇 허r`.

**연쇄 축약 → FAST** — `what do you → 워러여` 처럼 여러 축약이 겹쳐 청감이 크게 바뀌는 형태만 FAST.
(확정 gold: `do you` 는 기본형 `더여`, COMMON `두여`·`저`, CAREFUL `두 유`. `what are you gonna`(81) 는 캐주얼 레지스터라
`워러r여` 가 기본형. 3차안 당시 예시 `워러유`·`쥬`·`하우쥬` 는 ㅠ 계열이라 폐기.)

**`I'll` 의 어두운 L** — **미확정 유지.** 후보 `아일`·`아을`·`아이을`·`아으L` 계열을 나열하고 확신도 LOW.
알려진 사실: (가) 아을은 앱 채점 경로에서 아일보다 +20점대 (생산 지표), (나) NBest 에서 모음이 8화자 전부
[aɪ] 로 살아 있어 아을은 글라이드를 잃을 위험, (다) 어느 쪽이 나은 재현 단서인지는 사람이 들어야 안다.
`called`(42번) 도 같은 계열. 해당 문장 14·26·42·52·94 는 "보류" 표시.

**장모음 겹모음** — 기존 규칙(`mean`→미인, `see`→씨이) 유지. 연음 표기를 하면서 장모음 정보를 지우지 않는다.

**기능어 약형** — `for → f퍼r`, `and → 언`, 조동사 `can → 컨`, `at → 엇`, `or → 어r`, `your → 여r`, `was → 워z`,
`were → 워r`, `of → 어v`, `a/an → 어/언` 은 비강세에서 기본형. 강세·대비가 있는 자리는 CAREFUL.

**라틴 병기** (`f v z r th`) — 현행 규약 유지. 바꾸지 않는다.

### 4.4 자기 점검 (100개 다 쓴 뒤)
- [ ] 같은 표현이 문장마다 다르게 적혔는가? (`Could I` 68·76, `let me` 6·18·65, `what I` 5·26·45·74…) 다르면 이유가 문맥에 있는가, 아니면 실수인가.
- [ ] 어떤 `to` 도 규칙으로 정하지 않았는가. 23곳의 근거가 각각 문장에 붙어 있는가.
- [ ] 기본형에 여러 강한 축약이 연쇄된 문장이 있는가 → 있으면 FAST 로 옮긴다.
- [ ] 기본형이 현행보다 **또박또박** 해진 문장이 있는가 → 있으면 정의 1.3 위반이다. 되돌린다.
- [ ] 연음 표기를 하면서 장모음·r·v·f·z 정보를 지운 자리가 있는가.
- [ ] 확신도 HIGH 인데 사전·교재 근거를 안 적은 문장이 있는가.
- [ ] `going to` 가 이동 의미인데 거너로 적은 문장이 있는가 (63번).
- [ ] 보류 5문장(14·26·42·52·94)에 표기를 확정해 버리지 않았는가.
- [ ] 문서 머리에 정의·두 축·금지 사항 요약이 있는가.

### 4.5 전달
`SendUserFile` 로 v3 파일을 보내고, 채팅에는 변경 문장 수·보류 수·특기 판정(to·you·I'll)만 요약한다.
**사용자가 100문장을 한 줄씩 대조해 확정/수정/변이 이동을 한다** — 그 결과가 확정 gold 다.

---

## 5. 3차안 이후 순서 (사용자 확정 순서)

### 5.1 사람 검토 → 확정 gold
사용자가 v3 를 줄 단위로 검토한다. 결과를 `~/apps/tmp/core100-gold-final.md` 로 받아 두고,
확정되면 **`study/docs/core100-gold.md` 로 저장소에 넣는다**(그때 커밋).

### 5.2 화자 평가 — gold 가 벤치마크
확정 gold 의 100문장을 후보 화자로 합성해 **gold 를 얼마나 구현하는지** 본다. 실험 재료는 §6. 이미 한 12종
비교(`bakeoff/result.json`)는 진단문 12개 기준이라 예비 자료다. 최종 화자는 **사용자 블라인드 청취**로 정한다
(`~/apps/tmp/voice-bakeoff/*.mp3` 8종, 파일명 가리고 같은 순서로).
알아둘 사실: 검사한 12종 모두 flap·weak to·`what are` 연결은 낸다. 어휘 축약은 화자·항목마다 다르다
(§6.4). Kai·Luna 의 `conversation` 스타일은 콜센터용이라 캐주얼 대화체가 아니며 가장 느리다. 현행 Aria 는
12종 중 뒤에서 4번째로 느리고 앱이 rate 0.85 를 또 곱한다. koreacentral 은 HD·MAI 계열 미지원.

### 5.3 음원 보정
gold 와 음원이 어긋나는 항목은 `<sub alias>` 로 화면 원문을 유지한 채 발음만 바꾼다. 실측(Aria):
`gonna`·`wanna`·`spostuh` 는 성공, `hafta` 는 실패(sub alias·IPA 태그 모두). 항목별 확인 필수.
그래도 안 되면 카드에 "음원이 목표를 못 낸다" 를 **명시**한다. 표기를 되돌리지 않는다.

### 5.4 시드 반영 (test-first)
1. 실패 테스트: 코어100 시드의 `phonetic_kr` 이 확정 gold 와 일치하는지 검사하는 테스트를 먼저 쓴다.
2. `seeds/en-core100-*.json` 100장 갱신. 드릴(`explanation.drills[].kr` 1,411건)은 별도 단계.
3. `validate-seed.mjs` — 연음 정규식은 이미 제거됨. gold 대조 검사를 넣을지는 사용자 결정.
4. Supabase 반영은 `study-seed-supabase.yml` (id 기준 upsert). **DB 변경이므로 사용자 확인 후.**
   9/1 메모리의 주의: 시드 게이트가 id 기준이라 이미 완료된 카드는 BLOCKED — 완료분을 뺀 payload 를
   같은 파일명으로 저장소 밖에 만들어 올린다.
5. 문서 동기화: 가이드 §7 에 gold 문서 링크, `core100-curriculum.md` 에 표기 정본 위치.

### 5.5 드릴 1,411건 확장
확정 gold 를 기준으로 드릴을 감사한다. 자동 선별은 §6 도구로, 판정은 사람.

---

## 6. 측정 도구와 한계

### 6.1 Azure 접근
봇 계정 magiclink → `azure-token` Edge Function. 절차는 auto memory `study-azure-speech-local-probe`.
`generate_link` 응답의 token_hash 는 `properties.hashed_token` 또는 최상위 `hashed_token` 둘 다 대비.
앱과 같은 조건: `en-US-AriaNeural`, rate 0.85 (`speech.js` speakAzure 기본값), SSML 은 `buildAzureSSML` 과 동일.

### 6.2 쓸 수 있는 도구 (전부 `~/.local/state/study-probe/phonetic-kr-20260908/`)
| 도구 | 용도 | 한계 |
|---|---|---|
| `detect2.mjs` | 100문장 앱 음원 합성 + PA 음소 정렬 + /t d/ 구간 파형 폐쇄·에너지 | 정렬 시간창은 ReferenceText 의존 |
| `nbest.mjs` | PA 에 `NBestPhonemeCount:5` 를 켜 각 자리의 **후보 음소** 확인 | 레퍼런스 조건부. [f]/[v] 구별에는 유효 |
| `acoustic.py` + `acrun.mjs` | 순수 파이썬 DFT: 자기상관 주기성·저역/고역 에너지·영교차율 → **유성 여부** | 신뢰 가능. numpy 없음 |
| `acoustic.py` formants | 평활 스펙트럼 최대점으로 F1·F2 근사 | **탐색용만.** LPC 아님. 순위 판정 금지 |
| `bakeoff.mjs` | 화자 × 진단문 합성·정렬·이어붙이기 | 진단문 12개 기준 |
| `subalias.mjs`, `canfix2.mjs` | `<sub alias>`·IPA 태그가 실제 소리를 바꾸는지 | — |

### 6.3 방법론 주의 (반드시)
- **PA 는 ReferenceText 기반 정렬**이다. 예상 음소 자리에 Duration·Accuracy 가 있다고 그 음소가 실현된
  것이 아니다. `have to` 의 /v/ 가 70ms·정확도 97 이어도 [f] 로 무성화됐을 수 있다 — 실제로 Andrew·Kai·Brian
  은 파형에서 무성 쪽이었다. 삭제·병합 판정은 "독립 stop 실현 증거 없음, 축약과 일치" 까지만 말한다.
- **flap 판정**은 폐쇄 길이 단독 금지(문헌상 flap 폐쇄 18~44ms). 유성·고역 파열 유무를 함께 본다.
- **ko-KR PA 를 영어 음원에 거는 것**은 MS 가 혼합 언어 평가를 지원하지 않으므로 음향 거리가 아니다.
  `아을 49 vs 아일 38` 은 후보 탐색 휴리스틱일 뿐이다.
- 한국어 TTS 로 음차를 읽혀 영어 STT 에 넣는 가이드 §7 의 절차는 **생산 지표**다. 청각 표기의 옳음을
  판정하지 않는다.
- 자연스러움·억양·듣기 편함은 수치로 판정할 수 없다. 사람이 듣는다.

### 6.4 이미 잰 것 (재지 말 것)
- 앱 음원(Aria 0.85)은 flap 을 낸다(파형: 유성·무파열, 같은 화자의 진짜 [t] 는 고역E 0.94·영교차 8700).
  `to` 는 슈와로 정렬된다(14곳 중 13곳). rate 0.85 도 연음을 지우지 않는다.
- 어휘 축약(12화자): `let me` 는 8종 전부 독립 stop 증거 없음. `want to` 는 5종(Andrew·Ava·AvaMulti·NovaTurbo·Kai)
  독립 stop 없음, Aria·Emma·Brian 은 진짜 [t]. `have to` 는 Andrew·Kai·Brian 이 무성 쪽. `give me` 는 8종 전부
  유성 /v/ 유지. `supposed to` 는 /z/ 유지, /d/ 는 후보에 [t] 높음.
- `I'll` 의 모음: NBest 에서 8종 전부 [aɪ]. L 의 F2 는 탐색값(순위 금지).
- 코어100 100문장 정렬 데이터는 `detect2.json`·`evidence100.json` 에 있다.

---

## 7. 관련 미결 (이 작업과 별개, 건드리지 말 것)
- **채점 기준점 90(ded2)의 부작용**: 8/31 에 사용자가 '유치' 로 분류한 실기록(억양 82.4)이 83→92, 끊어읽기
  앵커 76→85. 단가 1.5 면 87·82 복귀하나 본인 중앙값 71. 사용자 결정 대기. (`deductionScore.js` 주석)
- **1~2단어 문장**: 원어민 TTS 억양이 `Sure.` 73.7, `Thank you.` 86.2 라 기준점 90 으로도 부족. 결정 대기.
- **지연 계측**: 늦은 점수 = STT 재시도 행. 실패 사유(429/5xx/네트워크)가 계측에 없다. `_fetchWithRetry` meter 에
  시도별 status 기록이 다음 과제. "요청 겹치면 429" 는 9/6 실측 10/10 200 이라 상시 상한 아님.
- **DB `pron_score` 컬럼은 PronScore(종합)** 이지 AccuracyScore 가 아니다(마이그레이션 0007 주석 오류).
- **가짜 마이크 e2e 절차**: 스킬 `study-fake-mic-e2e`.

---

## 8. 참조
- 정의 정본: `docs/lesson-explanation-guide-en.md` §7 "phonetic_kr 의 정의"
- 실측 로그: `docs/pronunciation-research-log.md` (폐기된 결론이 앞에, 9/8 재분석·화자 비교·정정이 뒤에)
- 커리큘럼: `docs/core100-curriculum.md`
- 이전 핸드오프: `docs/pronunciation-session-handoff.md` (8/31~9/6 채점 작업)
- auto memory: `study-phonetic-kr-definition`, `study-pronunciation-open-work`, `study-azure-speech-local-probe`

---

## 부록 A — `to` 23문장 1차 판정 초안 (참고만. 문장별로 다시 판단할 것)

기본형 후보는 "그 문장에서 가장 대표적인 realization" 을 묻고 적은 것이다. 규칙이 아니다.
앞이 모음·유성음이면 flap 이 대표적인 경우가 많고, 무성 파열음 뒤에서는 [tə] 가 대표적이며, /n ŋ/ 뒤는
둘 다 흔하다 — 그러나 이것도 경향이지 규칙이 아니다. 뒤 단어가 모음이면 [tu] 도 정상이다.

| # | 자리 | 기본형 후보 | 다른 실현형 | 메모 |
|---|---|---|---|---|
| 3 | how to explain | 하우러 | COMMON 하우 투 (뒤가 모음) · CAREFUL 하우 투 | 판단 갈림 — 검토 필요 |
| 4 | second to think | 쎄컨 터 | — | d+t 에서 d 가 죽고 [tə] |
| 10 | trying to say | 트라잉 터 | COMMON 트라잉 어 (ŋ 뒤 flap) · FAST 트라이너 | |
| 15 | idea to me | 러 | CAREFUL 투 | 모음 뒤 flap |
| 16 | I'd love to, | **투** | — | stranded, HIGH |
| 19 | trying to reach | 트라잉 터 | COMMON 트라잉 어 | |
| 22 | mean to make | 미인 터 | COMMON 미인 어 | n 뒤 |
| 31 | meaning to ask | 미이닝 터 | COMMON 미이닝 어 | |
| 40 | trying to help | 트라잉 터 | COMMON 트라잉 어 | |
| 45 | trying to say | 트라잉 터 | COMMON 트라잉 어 | |
| 47 | me to do | 미 러 두 | CAREFUL 미 투 두 | 모음 뒤 flap |
| 55 | anything to declare | 애니씽 터 | — | |
| 56 | anything to declare | 애니씽 터 | — | |
| 60 | like to change · flight to tomorrow | 라이크 터 · f라잇 터 | — | k·t 뒤 |
| 62 | how to get to the | 하우러 게러 | CAREFUL 하우 투 겟 투 | 둘 다 모음 뒤 |
| 64 | take to get | 테익 터 | — | k 뒤 |
| 67 | like to check | 라이크 터 | — | |
| 70 | need to pay | 니이러 | CAREFUL 니이드 투 | d 뒤 flap 매우 흔함 |
| 73 | allergic to nuts | 얼러r직 터 | — | k 뒤 |
| 76 | this to go | 디스 터 | — | s 뒤 |
| 77 | like to return | 라이크 터 | — | |
| 84 | back to work | 백 터 | — | k 뒤 |
| 93 | need to find | 니이러 | CAREFUL 니이드 투 | |

## 부록 B — 사용자가 직접 든 기본형 후보 (그대로 반영)
| 표현 | 기본형 후보 | CAREFUL |
|---|---|---|
| let me | 레미 | 렛 미 |
| give me | 기미 | 기v 미 |
| want to (동사구) | 워너 | 원트 투 |
| going to (미래) | 거너 | 고잉 투 |
| have to | 해프터 | 해v 투 |
| supposed to | 써포우스터 | 써포우즈드 투 |
| but I | 버라이 | 벗 아이 |
| but it's | 버릿츠 | 벗 잇츠 |
| what you | 왓처 | 왓 유 |
| meet her | 미이러r | 미잇 허r |
