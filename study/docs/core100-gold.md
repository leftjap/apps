# 코어100 phonetic_kr gold (확정)

> **2026-09-09 사용자 승인.** 제안서 4차(3차안 + 전수 감사 27건 + 2차 판정 4건 + 최종 정리 4건)를 그대로 확정 gold 로 삼는다. 이 문서가 코어100 100문장 `phonetic_kr` 의 정본이며, 시드(`seeds/en-core100-*.json`)와 런타임 코드는 아직 이 문서를 반영하지 않았다. 보류 5문장(14·26·42·52·94, I'll·called 의 어두운 L)은 확정하지 않는다. 저작 데이터·렌더러는 `~/.local/state/study-probe/phonetic-kr-20260908/gold/`(v3.py·v4.py·render_v4.py), 감사 원문은 `~/apps/tmp/core100-gold-v3-chatgpt-audit.md`, 작업 원칙은 `2026-09-08-phonetic-kr-work-order.md`.

기본형 변경 **82문장** · 현행 유지 18문장 · 보류(I'll·called) 5문장 — 2026-09-08 밤, 3차안에 사용자 전수 감사를 반영한 판. 확신도 HIGH 40 · MEDIUM 55 · LOW 5

> **판정 기준 (작업지시서 §1.3, 사용자 확정, 변경 금지)**
> 
> 기본형(DEFAULT) = "미국 성인이 정상적인 회화 속도에서 해당 단어를 특별히 강조하지 않고 말할 때 가장 대표적이고 자연스러운 realization 을 한국인이 재현하도록 만든 표기."
> 핵심은 **필수인가가 아니라 대표적인가**다. 선택적(optional) 현상이라도 중립 회화에서 대표적이면 기본형에 넣는다(`버라이`·`레미`·`커저`·비강세 `you→여`).
> 반대로 '현상이 존재한다 → 모든 문맥에 적용' 도 금지다. 여러 강한 축약을 한 문장에 연쇄 적용해 '가장 많이 줄어든 형태' 를 기본형으로 만들지 않는다.
> 
> **두 축 (합치지 않는다)**
> - realization_status: **DEFAULT**(기본형 칸) · **COMMON**(매우 흔한 다른 실현형) · **FAST**(여러 강한 축약이 연쇄된 빠른 형태) · **CAREFUL**(강조·또박또박)
> - evidence_confidence: **HIGH**(사전·교재 명시) · **MEDIUM**(일반 원리에서 도출되나 문맥 의존) · **LOW**(근거 부족)
> 
> **금지 사항 (§1.5 요약)**: ① 전역 치환·정규식 규칙(`to=터`·`t=ㄹ`·`dark L=을`) ② 한 현상만 전수조사하고 나머지 통과 ③ Azure 점수·정렬 수치로 승자 결정 ④ PA 예상 음소 정렬을 실제 음소 관찰로 착각 ⑤ 단일 폐쇄시간 cutoff 로 flap 판정 ⑥ 평활 DFT 포먼트로 화자 순위 ⑦ TTS 한계를 목표에 되먹임 ⑧ 화자 선정을 gold 앞에 두기 ⑨ gold 확정 전 시드·코드 수정
> 
> **이 문서에서 적용한 표기 결정 — 검토자가 뒤집을 수 있는 항목**
> 1. **합쳐 적기 규약**(음운 규칙이 아니라 표기 규약): 파열음·비음·s 가 모음 앞에서 이어지면 합쳐 적는다(`푸쉿`·`커나이`·`f렌던`·`퍼r퍼서v`·`f아인더나더r`). 라틴 글자 r·v·z·f 로 끝나는 자리는 띄어 둔다(`f퍼r 어`·`픽처r 어v`·`데이z 어f`) — 라틴 글자가 이미 삽입모음을 막기 때문. 예외로 현행 시드가 이미 ㄹ 로 합쳐 적은 `f피겨라웃`(30) 은 유지하고 92번을 거기에 맞췄다. 라틴 병기 규약(f v z r) 자체는 현행 유지.
> 2. **구개음화+약형 you 의 모음은 ㅓ 로 통일** (감사 확정): `커저`(1·7·30·62·65·72·79) `워저`(28) `쏘처`(23) `언더r스투저`(6) `왓처`(7·8·13) `왓처r`(24) `리이처`(19) `쎄저`(23) `톨저`(41) `메이켜`(22) `애스켜`(31) `씽켜`(87) `피켜`(94). 이때 could/would 는 Cambridge US 약형 /kəd/·/wəd/ 를 반영해 `커·워` 로 적었다(강조 없는 요청·가정문). 같은 약형을 you 앞이 아닌 자리에도 적용했다(감사 파일): `커라이`(68·76) `셔라이`(58) `커드 위`(75) `워드`(89·99). 70번 `do I` 는 모음 앞이라 `두 아이`(do 의 약형은 자음 앞 /də/·모음 앞 /du/, 2차 판정). 강형 모음을 남긴 `쿠저·우저·쿠라이·슈라이·두여` 는 COMMON.
> 3. **비강세 `you` = `여`**(사용자 지시). 다만 문두 주어 `You`(43·91)와 문말·쉼표 앞 `you`(18·27)는 [ju] 가 흔해 `유` 로 두고 `여` 를 COMMON 에. `여` 의 가독성은 발음 판정이 아니라 UI 문제이므로 구현 단계에서 별도 점검한다.
> 4. **`do you`**: 문중·문두 모두 기본형 `더여`(조동사 do 약형 /də/ + you /jə/, 감사 확정), COMMON `두여`(중간형)·`저`(합쳐진 형), CAREFUL `두 유`. `what do you` 만 FAST `워러여`. 81번 `what are you gonna` 의 `워러r여` 는 감사에서 MEDIUM DEFAULT 로 수용됐다.
> 5. **현행보다 덜 줄어든 자리는 3번 `암→아임` 하나**(대표형은 이중모음이 남는 [aɪm]). 그 외에는 없다.
> 6. **단어 경계 flap 의 조건**: 단어 내부 flap 은 뒤 모음이 무강세일 때 일어나지만, 어말 /t/ 는 뒤 단어 첫 모음이 강세여도 굴러 이어진다(`get out`·`at all`·`that is`·`private airplane`). Switchboard 자연 회화에서 simple word-final /t/ coda 뒤에 모음이 온 120건 중 70%(84건)가 flap 이었고, 전체 /t/-final 단어 중 모음이 뒤따른 185건에서는 54.3% 였다(Ranbom, Connine & Yudman 2009). phrase boundary 나 pause 는 flap 빈도를 낮춘다. 감사 1차가 5·88·90 에 든 '뒤 모음 강세' 이유는 사용자 2차 판정(2026-09-08)에서 철회됐다 → 5·88 은 3차안 flap 형으로 복귀, 90 은 flap 형을 기본형으로 승격. 끊는 형은 COMMON.
> 7. **`to`**: Cambridge US 가 약형으로 /tə/·/t̬ə/·/tu/ 셋을 모두 싣는다. 그래서 `터` 도 `러` 도 회화형이며 문장별로 정한다(부록 A). 감사에서 3·15 는 `터`, 47·62·70·93 은 flap 형으로 확정.
> 
> **칸 설명**: '현재 앱 음원' 은 **정답을 정하지 않는 구현 QA 칸**이다(Aria · rate 0.85, 2026-09-08 측정). 자동으로 붙는 `폐쇄 Nms` 는 정렬된 /t d/ 구간의 무음 길이이며 **단독으로 flap 을 판정하지 않는다**(§1.5-⑤). '정렬' 은 ReferenceText 기반 발음평가가 고른 발음 변이일 뿐 실제 음소 관찰이 아니다(§6.3). 어휘 축약 항목의 Aria 실측은 진단문(rate 1.0) 기준이다. 표시가 없는 문장은 '미측정'.
> 
> ⚠ **보류 5문장(14·26·42·52·94)** 은 `{I'll}`·`{called you}` 자리를 확정하지 않았다. 후보만 나열한다. **시드·코드는 수정하지 않았다.**

## 감사 반영 내역 (3차 → 4차)

사용자 전수 감사(2026-09-08 밤, 파일 `~/apps/tmp/core100-gold-v3-chatgpt-audit.md`): DEFAULT 그대로 67 · DEFAULT 수정 27 · variant 만 수정 1 · 보류 유지 5. 27건 전부와 변이 규정을 이 판에 반영했다.

| # | 3차 기본형 | 4차 기본형 | 반영 사유 |
|---|---|---|---|
| 1 | 쏘리 쿠쥬 쎄이 대러겐 모어r 슬로울리 | 쏘리 커저 쎄이 대러겐 모어r 슬로울리 | ㅠ→ㅓ·could 약형 |
| 2 | 왓 두여 미인 바이 대리그잭틀리 | 왓 더여 미인 바이 대리그잭틀리 | do you→더여 |
| 3 | 아임 낫 슈어r 하우러 익스플레이니린 잉글리쉬 | 아임 낫 슈어r 하우 터 익스플레이니린 잉글리쉬 | how to→하우 터(검토 판정) |
| 5 | 아이 노우 와라이 미인 버라이 캔트 푸리린투 워r즈 | (3차와 동일) | 감사 1차 `푸릿 인투` → 2차 철회, 3차안 flap 복귀 |
| 6 | 레미 씨이 이f 아이 언더r스투쥬 커r렉틀리 | 레미 씨이 이f 아이 언더r스투저 커r렉틀리 | ㅠ→ㅓ |
| 7 | 쿠쥬 기미 어니그잼플 어v 왓처 미인 | 커저 기미 어니그잼플 어v 왓처 미인 | ㅠ→ㅓ·could 약형 |
| 9 | 하우 두여 쎄이 디스 인 잉글리쉬 | 하우 더여 쎄이 디스 인 잉글리쉬 | do you→더여 |
| 15 | 댓 사운즈 라이커 구다이디어러 미 | 댓 사운즈 라이커 구다이디어 터 미 | idea to→이디어 터(검토 판정) |
| 23 | 아이 쏘츄 쎄저 워r 비지 터데이 | 아이 쏘처 쎄저 워r 비지 터데이 | ㅠ→ㅓ |
| 28 | 왓 우쥬 두 이f 여 워r 미 | 왓 워저 두 이f 여 워r 미 | ㅠ→ㅓ·would 약형 |
| 30 | (현행 유지) 쿠쥬 헬프 미 f피겨라웃 왓 웬 롱 | 커저 헬프 미 f피겨라웃 왓 웬 롱 | ㅠ→ㅓ·could 약형 |
| 47 | 왓 두여 원 미러 두 어바우릿 | 왓 더여 원 미러 두 어바우릿 | do you→더여 |
| 55 | 두여 해v 애니씽 터 디클레어r | 더여 해v 애니씽 터 디클레어r | do you→더여 |
| 58 | 마이 러기지 해즌 터라이v드 옛 쏘 왓 슈라이 두 | 마이 러기지 해즌 터라이v드 옛 쏘 왓 셔라이 두 | should 약형+d flap → 셔라이 |
| 62 | 쿠쥬 텔 미 하우러 겟 터 더 스테이션 | 커저 텔 미 하우러 겟 터 더 스테이션 | ㅠ→ㅓ·could 약형 |
| 65 | 쿠쥬 레미 노우 웬 위 겟 데어r | 커저 레미 노우 웬 위 겟 데어r | ㅠ→ㅓ·could 약형 |
| 68 | (현행 유지) 쿠라이 리이v 마이 러기지 히어r 언틸 체킨 | 커라이 리이v 마이 러기지 히어r 언틸 체킨 | could 약형+d flap → 커라이 |
| 70 | 이z 브렉f퍼스트 인클루우디드 어r 두 아이 니이러 페이 엑스트라 | (3차와 동일) | 감사 1차 `더 아이` → 2차 철회(모음 앞 do 약형은 /du/), 3차안 유지 |
| 72 | 쿠쥬 레커멘드 썸씽 더리즌 투우 스파이씨 | 커저 레커멘드 썸씽 더리즌 투우 스파이씨 | ㅠ→ㅓ·could 약형 |
| 75 | 쿠드 위 겟 더 체크 웬 여 해v 어 미닛 | 커드 위 겟 더 체크 웬 여 해v 어 미닛 | could 약형 → 커드 위 |
| 76 | 쿠라이 겟 디스 터 고우 플리이z | 커라이 겟 디스 터 고우 플리이z | could 약형+d flap → 커라이 |
| 78 | 두여 해v 애니씽 f퍼r 어 헤데익 | 더여 해v 애니씽 f퍼r 어 헤데익 | do you→더여 |
| 79 | (현행 유지) 쿠쥬 테이커 픽처r 어v 어스 플리이z | 커저 테이커 픽처r 어v 어스 플리이z | ㅠ→ㅓ·could 약형 |
| 83 | 두여 워너 커모우버r f퍼r 디너r 터나잇 | 더여 워너 커모우버r f퍼r 디너r 터나잇 | do you→더여 |
| 88 | 와렐스 워자이 써포우스터 두 | (3차와 동일) | 감사 1차 `왓 엘스` → 2차 철회, 3차안 flap 복귀 |
| 89 | (현행 유지) 아이 뉴 썸씽 라이크 디스 우드 해픈 | 아이 뉴 썸씽 라이크 디스 워드 해픈 | would 약형 → 워드 |
| 90 | 아이 리얼리 어프리이시에잇 에v리씽 유v 던 f퍼r 미 | 아이 리얼리 어프리이시에이레v리씽 유v 던 f퍼r 미 | 감사 1차 COMMON 삭제 → 2차에서 flap 형을 DEFAULT 로 승격 |
| 99 | 아이 쏘옷 씽z 우드 워r카우린 디 엔드 | 아이 쏘옷 씽z 워드 워r카우린 디 엔드 | would 약형 → 워드 |

**미반영·미결**

- 없음. 2차 판정(2026-09-08)으로 5·70·88·90 이 정리됐고 #7 `커저` 는 감사 파일에서 확정. 남은 보류는 I'll·called 5문장(14·26·42·52·94)뿐.

### 1. Sorry, could you say that again more slowly?

- **English** Sorry, could you say that again more slowly?
- **현행** 쏘리 쿠쥬 쎄이 댓 어겐 모어r 슬로울리
- **기본형 (DEFAULT)** **쏘리 커저 쎄이 대러겐 모어r 슬로울리**
- **다른 실현형** COMMON: 쏘리 쿠저 쎄이 대러겐 모어r 슬로울리 · CAREFUL: 쏘리 쿠드 유 쎄이 댓 어겐 모어r 슬로울리
- **현상** 반영: could 약형 [kəd]+you 구개음화 [kədʒə] · that again 단어경계 flap+연결 ｜ 변이: —
- **확신도** MEDIUM — could·you 약형과 구개음화는 사전·교재 명시(HIGH)이나 that again 의 flap 은 단어 경계 현상
- **근거** Cambridge US: could 약형 /kəd/, you /jə/. 강조 없는 요청문의 could 는 약형이 대표형이고 /d/+/j/→[dʒ] 가 이어져 [kədʒə] → `커저` (검토 2026-09-08: ㅠ→ㅓ 통일 + modal 약형). that 은 목적어라 강형 [ðæt] 을 유지하되 어말 /t/ 가 again 의 무강세 모음 앞에서 굴러 [ðæɾəˈgɛn].
- **현재 앱 음원** that+again: 폐쇄 없음·에너지 유지 ｜ 정렬(레퍼런스 기반 변이 선택, 관찰 아님): you→uh

### 2. What do you mean by that exactly?

- **English** What do you mean by that exactly?
- **현행** 왓 두 유 미인 바이 댓 이그잭틀리
- **기본형 (DEFAULT)** **왓 더여 미인 바이 대리그잭틀리**
- **다른 실현형** COMMON: 왓 두여 미인 바이 대리그잭틀리 · COMMON: 왓 저 미인 바이 대리그잭틀리 · FAST: 워러여 미인 바이 대리그잭틀리 · CAREFUL: 왓 두 유 미인 바이 댓 이그잭틀리
- **현상** 반영: 조동사 do 약형 [də]+비강세 you [jə] · that exactly 단어경계 flap ｜ 변이: do you 구개음화 [dʒə](COMMON) · what do you 연쇄 축약 whaddaya(FAST)
- **확신도** MEDIUM — do·you 약형은 사전 명시(HIGH)이나 that exactly 의 flap 은 단어 경계 현상
- **근거** Cambridge US 조동사 do: /də/ /du/ /duː/ — 자음 /j/ 앞이라 [də]. you /jə/. → [dəjə] `더여`(검토 확정). 중간형 `두여` 와 합쳐진 [dʒə] `저` 는 COMMON(감사 파일 변이 규정). 세 축약이 겹친 [wʌɾəjə] 는 §1.3 의 '연쇄 강한 축약' 이라 FAST. that 의 어말 t 는 exactly 앞에서 flap.
- **현재 앱 음원** that+exactly: 폐쇄 없음·에너지 유지 ｜ 정렬(레퍼런스 기반 변이 선택, 관찰 아님): you→uw

### 3. I'm not sure how to explain it in English.

- **English** I'm not sure how to explain it in English.
- **현행** 암 낫 슈어r 하우 투 익스플레인 잇 인 잉글리쉬
- **기본형 (DEFAULT)** **아임 낫 슈어r 하우 터 익스플레이니린 잉글리쉬**
- **다른 실현형** COMMON: 아임 낫 슈어r 하우러 익스플레이니린 잉글리쉬 · COMMON: 아임 낫 슈어r 하우 투 익스플레이니린 잉글리쉬 · COMMON: 암 낫 슈어r 하우 터 익스플레이니린 잉글리쉬 · CAREFUL: 아임 낫 슈어r 하우 투 익스플레인 잇 인 잉글리쉬
- **현상** 반영: how to 의 to 약형 [tə] · explain it 연결 · it in 단어경계 flap ｜ 변이: to 의 flap 형 [t̬ə](COMMON) · 모음 앞 [tu](COMMON) · I'm→[ɑm] 단순화(COMMON, 현행 `암`)
- **확신도** MEDIUM — to 의 세 약형이 모두 사전에 있어 `터`·`러`·`투` 가 다 회화형. 검토에서 `터` 를 기본형으로 확정
- **근거** Cambridge US 는 to 의 약형으로 /tə/·/t̬ə/(flap)·/tu/ 를 모두 싣는다. 어느 것이 이 자리의 대표형인지는 문장별 판정이며 전역 규칙이 아니다. 뒤가 모음(explain)이라 [tu] 도 정상. 현행 `암` 은 [aɪm]→[ɑm] 단순화로 흔하지만 대표형은 이중모음이 남는 `아임` — 현행보다 덜 줄어든 자리(자기 점검 4).
- **현재 앱 음원** to(단어 내): 폐쇄 없음·에너지 유지 ｜ it+in: 폐쇄 없음·에너지 유지 ｜ 정렬(레퍼런스 기반 변이 선택, 관찰 아님): to→ow

### 4. Give me a second to think about it.

- **English** Give me a second to think about it.
- **현행** 기v 미 어 쎄컨 투 씽크 어바우릿
- **기본형 (DEFAULT)** **기미 어 쎄컨 터 씽크 어바우릿**
- **다른 실현형** CAREFUL: 기v 미 어 쎄컨드 투 씽크 어바웃 잇
- **현상** 반영: give me→기미(사용자 기본형 후보) · second 의 d 흡수+to 약형 [tə] · about it flap(현행) ｜ 변이: —
- **확신도** MEDIUM — give me 축약은 사전이 informal(gimme)로 표시하므로 대표성 판단은 사용자 확정(부록 B)에 의존
- **근거** second to 는 /nd/+/t/ 에서 d 가 t 에 흡수돼 [ˈsɛkən tə]. 무성 파열음이 남으므로 flap 없음. give me 는 부록 B 의 사용자 기본형 후보.
- **현재 앱 음원** to(단어 내): 폐쇄 없음·에너지 유지 ｜ about+it: 폐쇄 없음·에너지 유지 ｜ 정렬(레퍼런스 기반 변이 선택, 관찰 아님): to→ax ｜ Aria: give me 의 /v/ 유성 유지 → 기미 미구현(진단문 2026-09-08 파형)

### 5. I know what I mean, but I can't put it into words.

- **English** I know what I mean, but I can't put it into words.
- **현행** 아이 노우 왓 아이 미인 벗 아이 캔트 푸릿 인투 워r즈
- **기본형 (DEFAULT)** **아이 노우 와라이 미인 버라이 캔트 푸리린투 워r즈**
- **다른 실현형** COMMON: 아이 노우 와라이 미인 버라이 캔트 푸릿 인투 워r즈 · CAREFUL: 아이 노우 왓 아이 미인 벗 아이 캔트 풋 잇 인투 워r즈
- **현상** 반영: what I · but I · put it · it into 단어경계 flap 4곳 ｜ 변이: it|into 경계를 끊는 형(COMMON)
- **확신도** MEDIUM — 단어경계 flap. it into 만 센 코퍼스는 없어 MEDIUM(사용자 2차 판정)
- **근거** what I·but I 는 부록 B 후보, put it·it into 는 같은 원리. it 뒤에 pause·의미 경계 없이 into words 로 이어진다. 어말 /t/+모음 환경의 flap 은 뒤 모음 강세와 무관하게 일어난다. Switchboard 자연 회화에서 simple word-final /t/ coda 뒤에 모음이 온 120건 중 70%(84건)가 flap 이었다(Ranbom, Connine & Yudman 2009). 전체 /t/-final 단어 중 모음이 뒤따른 185건에서는 54.3% 가 flap 이었다. phrase boundary 나 pause 는 flap 빈도를 낮춘다. 강세 모음 앞 실례: `that is`·`private airplane`·`get out`·`at all`. into/else/everything 의 첫음절 강세는 판정 근거가 아니다(사용자 2차 판정 2026-09-08). 앱 음원도 이 자리 유성·무파열이나 gold 근거는 아니다(§1.2).
- **현재 앱 음원** what+I: 폐쇄 없음·에너지 유지 ｜ but+I: 폐쇄 없음·에너지 유지 ｜ put+it: 폐쇄 없음·에너지 유지 ｜ it+into: 폐쇄 없음·에너지 유지 ｜ into(단어 내): 폐쇄 없음·에너지 유지 ｜ 앱 음원 4자리 모두 유성·무파열(2026-09-08 파형)

### 6. Let me see if I understood you correctly.

- **English** Let me see if I understood you correctly.
- **현행** 렛 미 씨 이f 아이 언더r스투쥬 커r렉틀리
- **기본형 (DEFAULT)** **레미 씨이 이f 아이 언더r스투저 커r렉틀리**
- **다른 실현형** CAREFUL: 렛 미 씨이 이f 아이 언더r스투드 유 커r렉틀리
- **현상** 반영: let me→레미(사용자 기본형 후보) · understood you 구개음화+약형 you [ʊdʒə] · see 장모음 겹모음(현행 `씨` 정정) ｜ 변이: —
- **확신도** MEDIUM — let me 축약은 사전이 informal(lemme)로 표시, 대표성은 사용자 확정에 의존
- **근거** 부록 B. understood 는 -stood 에 강세가 있어 모음 [ʊ] 는 그대로(`스투`), 뒤의 you 만 [dʒə] → `스투저`(ㅠ→ㅓ 통일). `씨`→`씨이` 는 장모음 겹모음 규약.
- **현재 앱 음원** 정렬(레퍼런스 기반 변이 선택, 관찰 아님): you→uh ｜ Aria: let me 의 /t/ 자리 유성·모음성 — 독립 파열음 증거 없음(진단문 2026-09-08)

### 7. Could you give me an example of what you mean?

- **English** Could you give me an example of what you mean?
- **현행** 쿠쥬 기v 미 어니그잼플 어v 왓 유 미인
- **기본형 (DEFAULT)** **커저 기미 어니그잼플 어v 왓처 미인**
- **다른 실현형** COMMON: 쿠저 기미 어니그잼플 어v 왓처 미인 · CAREFUL: 쿠드 유 기v 미 언 이그잼플 어v 왓 유 미인
- **현상** 반영: could 약형+you 구개음화 [kədʒə] · give me→기미 · an example 연결(현행) · what you [wʌtʃə] ｜ 변이: —
- **확신도** MEDIUM — could·you 약형과 구개음화는 사전·교재 명시(HIGH)이나 give me 축약의 대표성 판단 때문에 문장 전체는 MEDIUM
- **근거** Cambridge US: could 약형 /kəd/, you /jə/. 강조 없는 요청문의 could 는 약형이 대표형이고 /d/+/j/→[dʒ] 가 이어져 [kədʒə] → `커저` (검토 2026-09-08: ㅠ→ㅓ 통일 + modal 약형). what you 는 [wʌtʃə] → `왓처`.
- **현재 앱 음원** 정렬(레퍼런스 기반 변이 선택, 관찰 아님): you→uh · you→uw ｜ give me: 4번과 동일(Aria /v/ 유성)

### 8. I didn't catch the last part of what you said.

- **English** I didn't catch the last part of what you said.
- **현행** 아이 디든 캐치 더 라스 파r트 어v 왓 유 쎄드
- **기본형 (DEFAULT)** **아이 디든 캐치 더 라스 파r러v 왓처 쎄드**
- **다른 실현형** CAREFUL: 아이 디든트 캐치 더 라스트 파r트 어v 왓 유 쎄드
- **현상** 반영: didn't 성절비음(현행) · last 의 t 탈락(현행) · part of 의 t flap+연결 · what you [wʌtʃə] ｜ 변이: —
- **확신도** MEDIUM — part of 의 flap 은 단어경계 현상
- **근거** part of 는 /r/ 뒤·무강세 모음 앞이라 flap 이 일어나는 자리([pɑɹɾəv]). what you 는 7번과 동일.
- **현재 앱 음원** part+of: 폐쇄 없음·에너지 유지 ｜ 정렬(레퍼런스 기반 변이 선택, 관찰 아님): you→uh

### 9. How do you say this in English?

- **English** How do you say this in English?
- **현행** 하우 두 유 쎄이 디스 인 잉글리쉬
- **기본형 (DEFAULT)** **하우 더여 쎄이 디스 인 잉글리쉬**
- **다른 실현형** COMMON: 하우 두여 쎄이 디스 인 잉글리쉬 · COMMON: 하우 저 쎄이 디스 인 잉글리쉬 · CAREFUL: 하우 두 유 쎄이 디스 인 잉글리쉬
- **현상** 반영: 조동사 do 약형 [də]+비강세 you [jə] ｜ 변이: do you 구개음화 [dʒə](COMMON)
- **확신도** HIGH — do 약형 /də/·you /jə/ 는 Cambridge US 명시(검토 확정)
- **근거** Cambridge US 조동사 do: /də/ /du/ /duː/ — 자음 /j/ 앞이라 [də]. you /jə/. → [dəjə] `더여`(검토 확정). 중간형 `두여` 와 합쳐진 [dʒə] `저` 는 COMMON(감사 파일 변이 규정).
- **현재 앱 음원** 정렬(레퍼런스 기반 변이 선택, 관찰 아님): you→uh

### 10. What I'm trying to say is that I disagree.

- **English** What I'm trying to say is that I disagree.
- **현행** 와라임 트라잉 투 쎄이 이z 댓 아이 디써그리이
- **기본형 (DEFAULT)** **와라임 트라잉 터 쎄이 이z 더라이 디써그리이**
- **다른 실현형** COMMON: 와라임 트라잉 어 쎄이 이z 더라이 디써그리이 · FAST: 와라임 트라이너 쎄이 이z 더라이 디써그리이 · CAREFUL: 왓 아임 트라잉 투 쎄이 이z 댓 아이 디써그리이
- **현상** 반영: what I'm flap(현행) · trying to 의 to 약형 [tə] · 접속사 that 약형 [ðət]+I 앞 flap ｜ 변이: -ing 뒤 to 의 비음성 flap(COMMON) · tryna(FAST)
- **확신도** MEDIUM — -ing 뒤 to 는 [tə] 와 [ɾə]/[nə] 가 모두 흔해 어느 쪽이 대표인지 문맥 의존
- **근거** to 의 기본 약형 [tə] 는 사전 명시. /ŋ/ 뒤 flap 은 가능하지만 선택적이라 COMMON. 접속사 that 은 사전 약형 [ðət] 이고 어말 t 가 I 앞에서 굴러 [ðəɾaɪ] → `더라이`(현행 `댓 아이` 는 강형+끊김).
- **현재 앱 음원** What+Im: 폐쇄 없음·에너지 유지 ｜ to(단어 내): 폐쇄 없음·에너지 유지 ｜ that+I: 폐쇄 40ms(끊김/파열 가능) ｜ 정렬(레퍼런스 기반 변이 선택, 관찰 아님): to→ax

### 11. That makes sense, but I still have a question.

- **English** That makes sense, but I still have a question.
- **현행** 댓 메익스 쎈스 버라이 스틸 해v 어 퀘스천
- **기본형 (DEFAULT)** (현행 유지) 댓 메익스 쎈스 버라이 스틸 해v 어 퀘스천
- **다른 실현형** CAREFUL: 댓 메익스 쎈스 벗 아이 스틸 해v 어 퀘스천
- **현상** 반영: but I flap(현행) ｜ 변이: —
- **확신도** MEDIUM — 단어경계 flap(부록 B `버라이`)
- **근거** still 의 어두운 L 은 현행 `스틸` 유지(I'll 계열 판정 대상에 넣지 않았다).
- **현재 앱 음원** but+I: 폐쇄 없음·에너지 유지

### 12. I see your point, but I don't completely agree.

- **English** I see your point, but I don't completely agree.
- **현행** 아이 씨이 유어r 포인트 버라이 돈 컴플리이틀리 어그리이
- **기본형 (DEFAULT)** **아이 씨이 여r 포인트 버라이 돈 컴플리이틀리 어그리이**
- **다른 실현형** CAREFUL: 아이 씨이 유어r 포인트 벗 아이 돈트 컴플리이틀리 어그리이
- **현상** 반영: your 약형 [jɚ] · but I flap(현행) · don't 의 t 탈락(현행) ｜ 변이: —
- **확신도** HIGH — your 의 약형 [jɚ] 는 사전 명시(LPD·EPD 약형 항목), but I 는 부록 B
- **근거** 소유격 your 는 비강세에서 [jɚ]. 강조·대비('your point, not mine')면 CAREFUL 강형.
- **현재 앱 음원** but+I: 폐쇄 없음·에너지 유지 ｜ 정렬(레퍼런스 기반 변이 선택, 관찰 아님): your→ax

### 13. It depends on what you want to do.

- **English** It depends on what you want to do.
- **현행** 잇 디펜존 왓 유 원트 투 두
- **기본형 (DEFAULT)** **잇 디펜존 왓처 워너 두**
- **다른 실현형** CAREFUL: 잇 디펜즈 온 왓 유 원트 투 두
- **현상** 반영: depends on 연결(현행) · what you [wʌtʃə] · want to→워너(동사구 앞) ｜ 변이: —
- **확신도** HIGH — want to→[wɑnə] 는 사전 표제(wanna)·교재 명시, 뒤에 동사 do 가 와서 적용 조건 충족
- **근거** 부록 B. what you 는 7번과 동일.
- **현재 앱 음원** to(단어 내): 폐쇄 없음·에너지 유지 ｜ 정렬(레퍼런스 기반 변이 선택, 관찰 아님): you→uh · to→ax ｜ Aria: want 의 /t/ 가 진짜 [t](고역E 0.94·영교차 8700) → 워너 미구현. `<sub alias="wanna">` 로 구현 성공(진단문)

### 14. I'll think about it before I decide.

- **English** I'll think about it before I decide.
- **현행** 아일 씽크 어바우릿 비f포어r 아이 디싸이드
- **기본형 (DEFAULT)** **{I'll} 씽크 어바우릿 비f포어r 아이 디싸이드** ⟨보류⟩ — I'll 표기 보류 — 후보 `아일`(현행) · `아을` · `아이을` · `아으L`. 앱 채점에서 아을 이 +20점대(생산 지표)이나 NBest 에서 모음 [aɪ] 가 8화자 전부 살아 있어 아을 은 글라이드를 잃을 위험. 사람이 들어야 정한다. (검토 확정: 보류 유지)
- **다른 실현형** CAREFUL: 아일 씽크 어바웃 잇 비f포어r 아이 디싸이드
- **현상** 반영: about it flap(현행) ｜ 변이: — ｜ 보류: I'll 어두운 L
- **확신도** LOW — I'll 표기 근거 부족(작업지시서 §4.3)
- **근거** I'll 이외 자리는 현행 유지. before I 의 r 연결은 라틴 r 규약상 띄어 둔다.
- **현재 앱 음원** about+it: 폐쇄 없음·에너지 유지 ｜ I'll 모음 NBest [aɪ] 100(진단문 8화자 공통) · L 의 F2 1102 는 탐색값(순위 판정 금지)

### 15. That sounds like a good idea to me.

- **English** That sounds like a good idea to me.
- **현행** 댓 사운즈 라이크 어 구다이디어 투 미
- **기본형 (DEFAULT)** **댓 사운즈 라이커 구다이디어 터 미**
- **다른 실현형** COMMON: 댓 사운즈 라이커 구다이디어러 미 · CAREFUL: 댓 사운즈 라이크 어 굿 아이디어 투 미
- **현상** 반영: like a 연결 · good idea 연결(현행) · idea to 의 to 약형 [tə] ｜ 변이: 모음 뒤 flap 형 [t̬ə](COMMON)
- **확신도** MEDIUM — to 의 약형 [tə]·[t̬ə] 가 모두 사전에 있어 판정 사안. 검토에서 `터` 확정
- **근거** Cambridge US 는 to 의 약형으로 /tə/·/t̬ə/(flap)·/tu/ 를 모두 싣는다. 어느 것이 이 자리의 대표형인지는 문장별 판정이며 전역 규칙이 아니다. like a 는 [laɪkə] 로 이어진다(파열음+모음 합침 규약).
- **현재 앱 음원** good+idea: 폐쇄 없음·에너지 유지 ｜ to(단어 내): 폐쇄 45ms(끊김/파열 가능) ｜ 정렬(레퍼런스 기반 변이 선택, 관찰 아님): to→ax

### 16. I'd love to, but I already have plans.

- **English** I'd love to, but I already have plans.
- **현행** 아이드 러v 투 벗 아이 올레디 해v 플랜즈
- **기본형 (DEFAULT)** **아이드 러v 투 버라이 올레디 해v 플랜즈**
- **다른 실현형** CAREFUL: 아이드 러v 투 벗 아이 올레디 해v 플랜즈
- **현상** 반영: 뒤 동사 생략 자리의 to 강형 [tu] · but I flap ｜ 변이: —
- **확신도** HIGH — stranded to 는 약화하지 않는다(사전·교재 일치). but I 는 부록 B
- **근거** 쉼표 앞에서 동사가 생략된 to 는 강형. `to→터` 를 전역 적용하면 안 되는 대표 자리.
- **현재 앱 음원** to(단어 내): 폐쇄 15ms(끊김/파열 가능) ｜ but+I: 폐쇄 없음·에너지 유지 ｜ 정렬(레퍼런스 기반 변이 선택, 관찰 아님): to→uw

### 17. I can't make it tonight, but how about tomorrow?

- **English** I can't make it tonight, but how about tomorrow?
- **현행** 아이 캔트 메이킷 터나잇 벗 하우 어바웃 터마로우
- **기본형 (DEFAULT)** (현행 유지) 아이 캔트 메이킷 터나잇 벗 하우 어바웃 터마로우
- **다른 실현형** —
- **현상** 반영: make it 연결(현행) · tonight·tomorrow 첫 모음 약화(현행) ｜ 변이: —
- **확신도** HIGH — 변경 없음
- **근거** about tomorrow 의 t+t 는 하나로 합쳐져 `어바웃 터마로우` 가 그대로 맞다.
- **현재 앱 음원** tonight(단어 내): 폐쇄 10ms(짧음) ｜ tomorrow(단어 내): 폐쇄 20ms(끊김/파열 가능)

### 18. Let me know what time works best for you.

- **English** Let me know what time works best for you.
- **현행** 렛 미 노우 왓 타임 워r크스 베스트 f포어r 유
- **기본형 (DEFAULT)** **레미 노우 왓 타임 워r크스 베스 f퍼r 유**
- **다른 실현형** COMMON: 레미 노우 왓 타임 워r크스 베스 f퍼r 여 · CAREFUL: 렛 미 노우 왓 타임 워r크스 베스트 f포어r 유
- **현상** 반영: let me→레미 · best for 의 t 탈락(st+f) · for 약형 [fɚ] ｜ 변이: 문말 you 약형(COMMON)
- **확신도** MEDIUM — 문말 you 는 강형 [ju] 과 약형 [jə] 가 모두 흔함(for 는 HIGH)
- **근거** for 는 사전 약형 [fɚ]. 문장 끝 you 는 구말 장음화로 [ju] 가 살아나는 경우가 많아 `유` 를 기본으로 두고 `여` 를 COMMON 에. best for 의 /t/ 는 자음군 사이라 탈락이 대표적(현행 `라스 파r트`·`저스 해v` 와 같은 원리).
- **현재 앱 음원** 정렬(레퍼런스 기반 변이 선택, 관찰 아님): for→ax · you→uw ｜ let me: 6번과 동일

### 19. I've been trying to reach you all morning.

- **English** I've been trying to reach you all morning.
- **현행** 아이v 빈 트라잉 투 리이치 유 올 모어r닝
- **기본형 (DEFAULT)** **아이v 빈 트라잉 터 리이처 올 모어r닝**
- **다른 실현형** COMMON: 아이v 빈 트라잉 어 리이처 올 모어r닝 · CAREFUL: 아이v 빈 트라잉 투 리이치 유 올 모어r닝
- **현상** 반영: trying to 의 to 약형 [tə] · reach you 의 비강세 you [jə](tʃ 뒤라 구개음화 아님, 연결만) ｜ 변이: -ing 뒤 to flap(COMMON)
- **확신도** MEDIUM — 10번과 같은 이유
- **근거** reach 의 [tʃ] 뒤 [jə] 는 `리이처` — reach 의 장모음 `리이` 를 유지. all 의 어두운 L 은 현행.
- **현재 앱 음원** to(단어 내): 폐쇄 5ms(짧음) ｜ 정렬(레퍼런스 기반 변이 선택, 관찰 아님): to→ax · you→uh

### 20. Something came up, so I may be a little late.

- **English** Something came up, so I may be a little late.
- **현행** 썸씽 케이멉 쏘 아이 메이 비 어 리를 레잇
- **기본형 (DEFAULT)** (현행 유지) 썸씽 케이멉 쏘 아이 메이 비 어 리를 레잇
- **다른 실현형** —
- **현상** 반영: came up 연결(현행) · little 단어 내 flap(현행) ｜ 변이: —
- **확신도** HIGH — 변경 없음(단어 내 flap 은 교재 명시)
- **근거** —
- **현재 앱 음원** little(단어 내): 폐쇄 없음·에너지 유지

### 21. Can we push it back an hour or so?

- **English** Can we push it back an hour or so?
- **현행** 캔 위 푸쉬 잇 백 어나워r 오어r 쏘우
- **기본형 (DEFAULT)** **컨 위 푸쉿 백 어나워r 어r 쏘우**
- **다른 실현형** CAREFUL: 캔 위 푸쉬 잇 백 언 아워r 오어r 쏘우
- **현상** 반영: 조동사 can 약형 [kən] · push it 연결 · an hour 연결(현행) · or 약형 [ɚ] ｜ 변이: —
- **확신도** HIGH — can·or 의 약형은 사전 명시. push it 합침은 표기 규약
- **근거** 긍정 조동사 can 은 비강세에서 [kən](강형 [kæn] 은 강조·문말·부정). or 는 [ɚ].
- **현재 앱 음원** 정렬(레퍼런스 기반 변이 선택, 관찰 아님): Can→ax · or→ao

### 22. I didn't mean to make you feel bad.

- **English** I didn't mean to make you feel bad.
- **현행** 아이 디든 미인 투 메익 유 f피일 배드
- **기본형 (DEFAULT)** **아이 디든 미인 터 메이켜 f피일 배드**
- **다른 실현형** COMMON: 아이 디든 미이너 메이켜 f피일 배드 · CAREFUL: 아이 디든트 미인 투 메익 유 f피일 배드
- **현상** 반영: mean to 의 to 약형 [tə] · make you [kjə] 연결 ｜ 변이: /n/ 뒤 to 의 비음성 flap(COMMON)
- **확신도** MEDIUM — /n/ 뒤 to 는 [tə]·[ɾə] 둘 다 흔함
- **근거** make you 는 /k/+/j/ 가 [kjə] 로 이어져 `메이켜`(mean 의 장모음 `미인` 유지).
- **현재 앱 음원** to(단어 내): 폐쇄 없음·에너지 유지 ｜ 정렬(레퍼런스 기반 변이 선택, 관찰 아님): to→ax · you→uh

### 23. I thought you said you were busy today.

- **English** I thought you said you were busy today.
- **현행** 아이 쏘츄 쎄드 유 워r 비지 투데이
- **기본형 (DEFAULT)** **아이 쏘처 쎄저 워r 비지 터데이**
- **다른 실현형** COMMON: 아이 쏘처 쎄드 여 워r 비지 터데이 · CAREFUL: 아이 쏘트 유 쎄드 유 워r 비지 투데이
- **현상** 반영: thought you 구개음화+약형 you [θɔtʃə] · said you 구개음화 [sɛdʒə] · today 첫 모음 약화 [tə] ｜ 변이: said you 를 연결만으로(COMMON)
- **확신도** MEDIUM — said you 의 구개음화는 흔하지만 could you 만큼 고정적이지 않음(today 는 HIGH)
- **근거** today 는 사전 표기 자체가 /təˈdeɪ/ 라 `터데이`. thought you 는 현행 `쏘츄` 의 you 가 강형 모음이라 ㅓ 로 통일해 `쏘처`(검토 확정). said you 는 /d/+/j/ 라 41번 told you 와 같은 원리.
- **현재 앱 음원** today(단어 내): 폐쇄 15ms(끊김/파열 가능) ｜ today(단어 내): 폐쇄 없음·에너지 유지 ｜ 정렬(레퍼런스 기반 변이 선택, 관찰 아님): you→uh · you→uh

### 24. I have no idea what you're talking about.

- **English** I have no idea what you're talking about.
- **현행** 아이 해v 노우 아이디어 왓 유어r 토킹 어바웃
- **기본형 (DEFAULT)** **아이 해v 노우 아이디어 왓처r 토킹 어바웃**
- **다른 실현형** CAREFUL: 아이 해v 노우 아이디어 왓 유어r 토킹 어바웃
- **현상** 반영: what you're 구개음화+약형 [wʌtʃɚ] ｜ 변이: —
- **확신도** MEDIUM — 구개음화 자리이나 표기 모음은 사용자 결정 항목
- **근거** you're 의 약형 [jɚ] 가 /t/ 와 합쳐 [tʃɚ] → `왓처r`(r 유지).
- **현재 앱 음원** 정렬(레퍼런스 기반 변이 선택, 관찰 아님): youre→uh

### 25. I don't know what I'm supposed to do.

- **English** I don't know what I'm supposed to do.
- **현행** 아이 돈 노우 와라임 써포우즈드 투 두
- **기본형 (DEFAULT)** **아이 돈 노우 와라임 써포우스터 두**
- **다른 실현형** CAREFUL: 아이 돈트 노우 왓 아임 써포우즈드 투 두
- **현상** 반영: don't 의 t 탈락(현행) · what I'm flap(현행) · supposed to→써포우스터 ｜ 변이: —
- **확신도** HIGH — supposed to 의 [səˈpoʊstə] 는 교재 명시(부록 B)
- **근거** /zd/+/t/ 에서 d 가 무성화·흡수되고 z 도 s 로 무성화된 [səˈpoʊstə].
- **현재 앱 음원** what+Im: 폐쇄 없음·에너지 유지 ｜ to(단어 내): 폐쇄 없음·에너지 유지 ｜ 정렬(레퍼런스 기반 변이 선택, 관찰 아님): to→ax ｜ Aria: /z/ 유성 유지 → 써포우스터 미구현. `<sub alias="spostuh">` 로 무성 [s] 구현 성공(진단문)

### 26. I'll see what I can do about it.

- **English** I'll see what I can do about it.
- **현행** 아일 씨이 와라이 캔 두 어바우릿
- **기본형 (DEFAULT)** **{I'll} 씨이 와라이 컨 두 어바우릿** ⟨보류⟩ — I'll 보류(14번 참조). (검토 확정: 보류 유지)
- **다른 실현형** CAREFUL: 아일 씨이 왓 아이 캔 두 어바웃 잇
- **현상** 반영: what I flap(현행) · can 약형 [kən] · about it flap(현행) ｜ 변이: — ｜ 보류: I'll
- **확신도** LOW — I'll 표기 근거 부족
- **근거** can 은 긍정 조동사 비강세라 `컨`(사전 약형).
- **현재 앱 음원** what+I: 폐쇄 없음·에너지 유지 ｜ about+it: 폐쇄 없음·에너지 유지 ｜ 정렬(레퍼런스 기반 변이 선택, 관찰 아님): can→ax

### 27. If I were you, I'd wait until tomorrow.

- **English** If I were you, I'd wait until tomorrow.
- **현행** 이f 아이 워r 유 아이드 웨잇 언틸 터마로우
- **기본형 (DEFAULT)** **이f 아이 워r 유 아이드 웨이런틸 터마로우**
- **다른 실현형** COMMON: 이f 아이 워r 여 아이드 웨이런틸 터마로우 · CAREFUL: 이f 아이 워r 유 아이드 웨잇 언틸 터마로우
- **현상** 반영: were 약형(현행) · wait until 단어경계 flap+연결 ｜ 변이: 쉼표 앞 you 약형(COMMON)
- **확신도** MEDIUM — 단어경계 flap
- **근거** wait 의 어말 t 가 until 의 무강세 첫 모음 앞이라 [weɪɾənˈtɪl]. 쉼표 앞 you 는 구말이라 `유`(18번과 같은 판단).
- **현재 앱 음원** wait+until: 폐쇄 30ms(끊김/파열 가능) ｜ tomorrow(단어 내): 폐쇄 30ms(끊김/파열 가능) ｜ 정렬(레퍼런스 기반 변이 선택, 관찰 아님): you→uw

### 28. What would you do if you were me?

- **English** What would you do if you were me?
- **현행** 왓 우쥬 두 이f 유 워r 미
- **기본형 (DEFAULT)** **왓 워저 두 이f 여 워r 미**
- **다른 실현형** COMMON: 왓 우저 두 이f 여 워r 미 · CAREFUL: 왓 우드 유 두 이f 유 워r 미
- **현상** 반영: would 약형 [wəd]+you 구개음화 [wədʒə] · if you 의 비강세 you ｜ 변이: —
- **확신도** MEDIUM — would·you 약형은 사전 명시(HIGH). 문장 확신도는 you 약형 표기(여)의 대표성 판단 때문에 MEDIUM
- **근거** Cambridge US: would 약형 /wəd/·/əd/, you /jə/. 가정 질문의 would 는 강조가 없어 약형 → [wədʒə] `워저`(검토 확정, 현행 `우쥬`).
- **현재 앱 음원** 정렬(레퍼런스 기반 변이 선택, 관찰 아님): you→uw · you→uh

### 29. I wish I could, but it's not possible right now.

- **English** I wish I could, but it's not possible right now.
- **현행** 아이 위쉬 아이 쿠드 버릿츠 낫 파써블 라잇 나우
- **기본형 (DEFAULT)** (현행 유지) 아이 위쉬 아이 쿠드 버릿츠 낫 파써블 라잇 나우
- **다른 실현형** CAREFUL: 아이 위쉬 아이 쿠드 벗 잇츠 낫 파써블 라잇 나우
- **현상** 반영: but it's flap(현행) ｜ 변이: —
- **확신도** MEDIUM — 부록 B `버릿츠`
- **근거** 쉼표 앞 could 는 강형 유지.
- **현재 앱 음원** but+its: 폐쇄 없음·에너지 유지

### 30. Could you help me figure out what went wrong?

- **English** Could you help me figure out what went wrong?
- **현행** 쿠쥬 헬프 미 f피겨라웃 왓 웬 롱
- **기본형 (DEFAULT)** **커저 헬프 미 f피겨라웃 왓 웬 롱**
- **다른 실현형** COMMON: 쿠저 헬프 미 f피겨라웃 왓 웬 롱 · CAREFUL: 쿠드 유 헬프 미 f피겨r 아웃 왓 웬트 롱
- **현상** 반영: could 약형+you 구개음화 [kədʒə] · figure out r 연결(현행) · went 의 t 탈락(현행) ｜ 변이: —
- **확신도** HIGH — could 약형 /kəd/·you /jə/·구개음화 모두 사전·교재 명시(검토 확정)
- **근거** Cambridge US: could 약형 /kəd/, you /jə/. 강조 없는 요청문의 could 는 약형이 대표형이고 /d/+/j/→[dʒ] 가 이어져 [kədʒə] → `커저` (검토 2026-09-08: ㅠ→ㅓ 통일 + modal 약형).
- **현재 앱 음원** 정렬(레퍼런스 기반 변이 선택, 관찰 아님): you→uh

### 31. I've been meaning to ask you something.

- **English** I've been meaning to ask you something.
- **현행** 아이v 빈 미이닝 투 애스크 유 썸씽
- **기본형 (DEFAULT)** **아이v 빈 미이닝 터 애스켜 썸씽**
- **다른 실현형** COMMON: 아이v 빈 미이닝 투 애스켜 썸씽 · CAREFUL: 아이v 빈 미이닝 투 애스크 유 썸씽
- **현상** 반영: meaning to 의 to 약형 [tə] · ask you [kjə] 연결 ｜ 변이: 모음 앞 to [tu] 유지(COMMON)
- **확신도** MEDIUM — 뒤가 모음(ask)이라 [tu] 도 정상
- **근거** —
- **현재 앱 음원** to(단어 내): 폐쇄 없음·에너지 유지 ｜ 정렬(레퍼런스 기반 변이 선택, 관찰 아님): to→ax · you→uh

### 32. I've never thought about it that way before.

- **English** I've never thought about it that way before.
- **현행** 아이v 네버r 쏫 어바우릿 댓 웨이 비f포어r
- **기본형 (DEFAULT)** **아이v 네버r 쏘러바우릿 댓 웨이 비f포어r**
- **다른 실현형** CAREFUL: 아이v 네버r 쏘트 어바웃 잇 댓 웨이 비f포어r
- **현상** 반영: thought about 단어경계 flap · about it flap(현행) ｜ 변이: —
- **확신도** MEDIUM — 단어경계 flap
- **근거** thought 의 어말 t 가 about 의 무강세 첫 모음 앞에서 굴러 [θɔɾəˈbaʊɾɪt]. 현행 `쏫 어바우릿` 은 앞의 t 를 끊어 둔 것.
- **현재 앱 음원** thought+about: 폐쇄 없음·에너지 유지 ｜ about+it: 폐쇄 없음·에너지 유지

### 33. It turns out we were both wrong.

- **English** It turns out we were both wrong.
- **현행** 잇 터r언자웃 위 워r 보우쓰 롱
- **기본형 (DEFAULT)** (현행 유지) 잇 터r언자웃 위 워r 보우쓰 롱
- **다른 실현형** —
- **현상** 반영: turns out 연결(현행) · were 약형(현행) ｜ 변이: —
- **확신도** HIGH — 변경 없음
- **근거** —
- **현재 앱 음원** 미측정

### 34. I ended up staying home all weekend.

- **English** I ended up staying home all weekend.
- **현행** 아이 엔디덥 스테잉 호움 올 위켄드
- **기본형 (DEFAULT)** (현행 유지) 아이 엔디덥 스테잉 호움 올 위켄드
- **다른 실현형** —
- **현상** 반영: ended up 연결+flap(현행) ｜ 변이: —
- **확신도** HIGH — 변경 없음
- **근거** —
- **현재 앱 음원** ended+up: 폐쇄 없음·에너지 유지

### 35. I used to do that all the time.

- **English** I used to do that all the time.
- **현행** 아이 유우스 투 두 댓 올 더 타임
- **기본형 (DEFAULT)** **아이 유우스터 두 대롤 더 타임**
- **다른 실현형** COMMON: 아이 유우스터 두 댓 올 더 타임 · CAREFUL: 아이 유우스드 투 두 댓 올 더 타임
- **현상** 반영: used to→유우스터 · that all 단어경계 flap ｜ 변이: that all 사이 성문 폐쇄/끊김(COMMON)
- **확신도** MEDIUM — used to 는 HIGH(사전 [ˈjuːstə])이나 that all 의 flap 은 목적어-부사구 경계라 끊기기도 함
- **근거** 조동사적 used to 는 [ˈjuːstə] — z 가 아니라 s(사전 명시). that all 은 어말 t + 모음이라 정상 속도에서는 [ðæɾɔl] 로 이어지지만 구 경계라 COMMON 에 끊김형을 둔다.
- **현재 앱 음원** to(단어 내): 폐쇄 없음·에너지 유지 ｜ that+all: 폐쇄 95ms(끊김/파열 가능) ｜ 정렬(레퍼런스 기반 변이 선택, 관찰 아님): used→s · to→ax

### 36. I'm not used to getting up this early.

- **English** I'm not used to getting up this early.
- **현행** 아임 낫 유우스 투 게링 업 디스 어r리
- **기본형 (DEFAULT)** **아임 낫 유우스터 게링 업 디스 어r리**
- **다른 실현형** CAREFUL: 아임 낫 유우스드 투 게팅 업 디스 어r리
- **현상** 반영: used to→유우스터 · getting 단어 내 flap(현행) ｜ 변이: —
- **확신도** HIGH — 사전 명시
- **근거** 형용사적 'be used to' 도 [ˈjuːstə].
- **현재 앱 음원** to(단어 내): 폐쇄 없음·에너지 유지 ｜ getting(단어 내): 폐쇄 없음·에너지 유지 ｜ 정렬(레퍼런스 기반 변이 선택, 관찰 아님): used→s · to→ax

### 37. I'm thinking about taking a few days off.

- **English** I'm thinking about taking a few days off.
- **현행** 아임 씽킹 어바웃 테이킹 어 f퓨 데이z 어f
- **기본형 (DEFAULT)** (현행 유지) 아임 씽킹 어바웃 테이킹 어 f퓨 데이z 어f
- **다른 실현형** —
- **현상** 반영: (특기 현상 없음. taking a 는 ŋ+모음이라 자연 연결) ｜ 변이: —
- **확신도** HIGH — 변경 없음
- **근거** —
- **현재 앱 음원** 미측정

### 38. I feel like staying home and doing nothing.

- **English** I feel like staying home and doing nothing.
- **현행** 아이 f필 라이크 스테잉 호움 앤 두잉 낫씽
- **기본형 (DEFAULT)** **아이 f피일 라이크 스테잉 호움 언 두잉 낫씽**
- **다른 실현형** CAREFUL: 아이 f피일 라이크 스테잉 호움 앤드 두잉 낫씽
- **현상** 반영: and 약형 [ən] · feel 장모음 겹모음(현행 `f필` 정정) ｜ 변이: —
- **확신도** HIGH — and 의 약형은 사전 명시, 장모음은 규약
- **근거** 22번 `f피일` 과 통일.
- **현재 앱 음원** 정렬(레퍼런스 기반 변이 선택, 관찰 아님): and→ax

### 39. I'm supposed to meet her after work.

- **English** I'm supposed to meet her after work.
- **현행** 아임 써포우즈드 투 미잇 허r 애f터r 워r크
- **기본형 (DEFAULT)** **아임 써포우스터 미이러r 애f터r 워r크**
- **다른 실현형** CAREFUL: 아임 써포우즈드 투 미잇 허r 애f터r 워r크
- **현상** 반영: supposed to→써포우스터 · her 의 h 탈락+meet 의 t flap [miːɾɚ] ｜ 변이: —
- **확신도** MEDIUM — her 의 h 탈락은 사전이 약형 [ɚ] 를 병기하나 문맥 의존(supposed to 는 HIGH)
- **근거** 부록 B `미이러r`(meet 의 장모음 유지. `미러r` 금지).
- **현재 앱 음원** to(단어 내): 폐쇄 없음·에너지 유지 ｜ 정렬(레퍼런스 기반 변이 선택, 관찰 아님): to→ax · her→h 자리 배정 ｜ Aria: /z/ 유성 → 써포우스터 미구현(진단문)

### 40. I was trying to help, but I made it worse.

- **English** I was trying to help, but I made it worse.
- **현행** 아이 워z 트라잉 투 헬프 버라이 메이딧 워r스
- **기본형 (DEFAULT)** **아이 워z 트라잉 터 헬프 버라이 메이딧 워r스**
- **다른 실현형** COMMON: 아이 워z 트라잉 어 헬프 버라이 메이딧 워r스 · CAREFUL: 아이 워z 트라잉 투 헬프 벗 아이 메이드 잇 워r스
- **현상** 반영: was 약형(현행) · trying to [tə] · but I flap(현행) · made it flap(현행) ｜ 변이: -ing 뒤 flap(COMMON)
- **확신도** MEDIUM — 10번과 같음
- **근거** —
- **현재 앱 음원** to(단어 내): 폐쇄 없음·에너지 유지 ｜ but+I: 폐쇄 없음·에너지 유지 ｜ made+it: 폐쇄 없음·에너지 유지 ｜ 정렬(레퍼런스 기반 변이 선택, 관찰 아님): to→ax

### 41. I should've told you about it sooner.

- **English** I should've told you about it sooner.
- **현행** 아이 슈더v 톨드 유 어바우릿 쑤우너r
- **기본형 (DEFAULT)** **아이 슈더v 톨저 어바우릿 쑤우너r**
- **다른 실현형** CAREFUL: 아이 슈더v 톨드 유 어바웃 잇 쑤우너r
- **현상** 반영: should've(현행) · told you 구개음화 [toʊldʒə] · about it flap(현행) ｜ 변이: —
- **확신도** MEDIUM — 구개음화 자리(사용자 목록에 있음)이나 표기 모음은 결정 항목
- **근거** /d/+/j/→[dʒ]. told 의 L 은 현행처럼 `톨` 유지.
- **현재 앱 음원** told(단어 내): 폐쇄 25ms(끊김/파열 가능) ｜ about+it: 폐쇄 없음·에너지 유지 ｜ 정렬(레퍼런스 기반 변이 선택, 관찰 아님): you→uw

### 42. I would've called you if I'd known.

- **English** I would've called you if I'd known.
- **현행** 아이 우더v 콜드 유 이f 아이드 노운
- **기본형 (DEFAULT)** **아이 우더v {called you} 이f 아이드 노운** ⟨보류⟩ — called 의 어두운 L 표기 보류(I'll 과 같은 계열). 후보: `콜쥬`·`콜저`(구개음화만 반영) · `커을쥬`·`코을저`(어두운 L 반영). CAREFUL 은 `콜드 유`. (검토 확정: 보류 유지)
- **다른 실현형** CAREFUL: 아이 우더v 콜드 유 이f 아이드 노운
- **현상** 반영: would've(현행) · called you 구개음화 ｜ 변이: — ｜ 보류: called 의 어두운 L
- **확신도** LOW — 어두운 L 표기 근거 부족
- **근거** —
- **현재 앱 음원** 정렬(레퍼런스 기반 변이 선택, 관찰 아님): you→uw

### 43. You don't have to explain everything right now.

- **English** You don't have to explain everything right now.
- **현행** 유 돈 해v 투 익스플레인 에v리씽 라잇 나우
- **기본형 (DEFAULT)** **유 돈 해프터 익스플레인 에v리씽 라잇 나우**
- **다른 실현형** COMMON: 여 돈 해프터 익스플레인 에v리씽 라잇 나우 · CAREFUL: 유 돈트 해v 투 익스플레인 에v리씽 라잇 나우
- **현상** 반영: don't 의 t 탈락(현행) · have to→해프터 ｜ 변이: 문두 주어 You 약형(COMMON)
- **확신도** HIGH — have to 는 미국식 사전 /hæf.tə/(부록 B)
- **근거** 문두 주어 You 는 [ju] 가 흔해 `유` 유지, `여` 는 COMMON.
- **현재 앱 음원** to(단어 내): 폐쇄 5ms(짧음) ｜ 정렬(레퍼런스 기반 변이 선택, 관찰 아님): You→uw · to→uw ｜ Aria: /v/ 유성 → 해프터 미구현. `<sub alias="hafta">`·IPA 태그 모두 실패(진단문)

### 44. I can't believe you actually went through with it.

- **English** I can't believe you actually went through with it.
- **현행** 아이 캔트 빌리이v 유 액츄얼리 웬트 쓰루우 위딧
- **기본형 (DEFAULT)** **아이 캔트 빌리이v 여 액츄얼리 웬 쓰루우 위딧**
- **다른 실현형** CAREFUL: 아이 캔트 빌리이v 유 액츄얼리 웬트 쓰루우 위드 잇
- **현상** 반영: believe you 의 비강세 you · went through 의 t 탈락(nt+θ) · with it 연결(현행) ｜ 변이: —
- **확신도** MEDIUM — t 탈락은 자음군에서 대표적이나 선택적
- **근거** 30번 `웬 롱` 과 같은 원리.
- **현재 앱 음원** 정렬(레퍼런스 기반 변이 선택, 관찰 아님): you→uh

### 45. That's not what I was trying to say.

- **English** That's not what I was trying to say.
- **현행** 댓츠 낫 왓 아이 워z 트라잉 투 쎄이
- **기본형 (DEFAULT)** **댓츠 낫 와라이 워z 트라잉 터 쎄이**
- **다른 실현형** COMMON: 댓츠 낫 와라이 워z 트라잉 어 쎄이 · CAREFUL: 댓츠 낫 왓 아이 워z 트라잉 투 쎄이
- **현상** 반영: what I flap · was 약형(현행) · trying to [tə] ｜ 변이: -ing 뒤 flap(COMMON)
- **확신도** MEDIUM — 10번과 같음
- **근거** what I 는 부록 B(5·26·74 번과 통일).
- **현재 앱 음원** what+I: 폐쇄 없음·에너지 유지 ｜ to(단어 내): 폐쇄 없음·에너지 유지 ｜ 정렬(레퍼런스 기반 변이 선택, 관찰 아님): to→ax

### 46. I don't think that's what she meant.

- **English** I don't think that's what she meant.
- **현행** 아이 돈 씽크 댓츠 왓 쉬 멘트
- **기본형 (DEFAULT)** (현행 유지) 아이 돈 씽크 댓츠 왓 쉬 멘트
- **다른 실현형** —
- **현상** 반영: don't 의 t 탈락(현행) ｜ 변이: —
- **확신도** HIGH — 변경 없음
- **근거** what she 는 자음 앞이라 t 유지(성문음화).
- **현재 앱 음원** 미측정

### 47. What do you want me to do about it?

- **English** What do you want me to do about it?
- **현행** 왓 두 유 원트 미 투 두 어바우릿
- **기본형 (DEFAULT)** **왓 더여 원 미러 두 어바우릿**
- **다른 실현형** COMMON: 왓 두여 원 미러 두 어바우릿 · COMMON: 왓 저 원 미러 두 어바우릿 · FAST: 워러여 원 미러 두 어바우릿 · CAREFUL: 왓 두 유 원트 미 투 두 어바웃 잇
- **현상** 반영: 조동사 do 약형+비강세 you · want me 의 t 탈락(nt+m) · me to 의 to 약형+모음 뒤 flap · about it flap(현행) ｜ 변이: do you→저(COMMON) · whaddaya(FAST)
- **확신도** MEDIUM — me to 의 flap 과 want me 의 t 탈락 모두 선택적이나 정상 속도에서 대표적
- **근거** Cambridge US 조동사 do: /də/ /du/ /duː/ — 자음 /j/ 앞이라 [də]. you /jə/. → [dəjə] `더여`(검토 확정). 중간형 `두여` 와 합쳐진 [dʒə] `저` 는 COMMON(감사 파일 변이 규정). 여기 want 는 목적어 me 앞이라 wanna 가 아니다. me to 의 flap `미러` 는 검토에서 수용.
- **현재 앱 음원** to(단어 내): 폐쇄 없음·에너지 유지 ｜ about+it: 폐쇄 없음·에너지 유지 ｜ 정렬(레퍼런스 기반 변이 선택, 관찰 아님): you→uh · to→ax

### 48. There's no way I'm going to do that.

- **English** There's no way I'm going to do that.
- **현행** 데어r즈 노우 웨이 아임 고잉 투 두 댓
- **기본형 (DEFAULT)** **데어r즈 노우 웨이 아임 거너 두 댓**
- **다른 실현형** CAREFUL: 데어r즈 노우 웨이 아임 고잉 투 두 댓
- **현상** 반영: going to(미래표지)→거너 ｜ 변이: —
- **확신도** HIGH — 미래 be going to 의 [gənə] 는 사전 표제(gonna)
- **근거** 이동 의미가 아니라 미래표지.
- **현재 앱 음원** to(단어 내): 폐쇄 5ms(짧음) ｜ 정렬(레퍼런스 기반 변이 선택, 관찰 아님): to→ax ｜ Aria: 거너 미구현. `<sub alias="gonna">` 성공(진단문)

### 49. It looks like we're going to be late.

- **English** It looks like we're going to be late.
- **현행** 잇 룩스 라이크 위어r 고잉 투 비 레잇
- **기본형 (DEFAULT)** **잇 룩스 라이크 위어r 거너 비 레잇**
- **다른 실현형** CAREFUL: 잇 룩스 라이크 위어r 고잉 투 비 레잇
- **현상** 반영: going to→거너 ｜ 변이: —
- **확신도** HIGH — 48번과 같음 — 미래 be going to 의 [gənə] 는 사전 표제(gonna)
- **근거** we're 는 [wɪr] 로 두고 약형 [wɚ] 는 적지 않았다(대표성 근거 부족).
- **현재 앱 음원** to(단어 내): 폐쇄 없음·에너지 유지 ｜ 정렬(레퍼런스 기반 변이 선택, 관찰 아님): to→ax

### 50. I guess we'll just have to wait and see.

- **English** I guess we'll just have to wait and see.
- **현행** 아이 게스 위일 저스 해v 투 웨이랜 씨이
- **기본형 (DEFAULT)** **아이 게스 위일 저스 해프터 웨이런 씨이**
- **다른 실현형** COMMON: 아이 게스 위일 저스 해프터 웨잇 언 씨이 · CAREFUL: 아이 게스 위일 저스트 해v 투 웨잇 앤드 씨이
- **현상** 반영: just 의 t 탈락(현행) · have to→해프터 · wait and 단어경계 flap+and 약형 [ən] ｜ 변이: wait and 사이 끊김(COMMON)
- **확신도** MEDIUM — wait and 의 flap 은 단어경계 현상(앱 음원은 끊음). have to·and 는 HIGH
- **근거** 'wait and see' 는 관용구라 [weɪɾn̩ si] 로 이어지는 것이 대표적. 현행 `웨이랜` 은 flap 은 반영했으나 and 를 강형 `앤` 으로 둔 것.
- **현재 앱 음원** to(단어 내): 폐쇄 5ms(짧음) ｜ wait+and: 폐쇄 25ms(끊김/파열 가능) ｜ 정렬(레퍼런스 기반 변이 선택, 관찰 아님): to→ax · and→ax ｜ have to: 43번과 동일

### 51. What's the purpose of your visit?

- **English** What's the purpose of your visit?
- **현행** 왓츠 더 퍼r퍼스 어v 유어r v이짓
- **기본형 (DEFAULT)** **왓츠 더 퍼r퍼서v 여r v이짓**
- **다른 실현형** CAREFUL: 왓츠 더 퍼r퍼스 어v 유어r v이짓
- **현상** 반영: purpose of 연결 · your 약형 [jɚ] ｜ 변이: —
- **확신도** HIGH — your 약형은 사전 명시(12번과 통일). 합침은 표기 규약
- **근거** purpose 의 어말 s 와 of 가 이어져 [pɝpəsəv](s+모음은 합쳐 적는 규약).
- **현재 앱 음원** 정렬(레퍼런스 기반 변이 선택, 관찰 아님): your→ax

### 52. I'm here on vacation, and I'll be staying for a week.

- **English** I'm here on vacation, and I'll be staying for a week.
- **현행** 아임 히어r 온 v에이케이션 앤다일 비 스테잉 f포어r 어 위이크
- **기본형 (DEFAULT)** **아임 히어r 온 v에이케이션 언 {I'll} 비 스테잉 f퍼r 어 위이크** ⟨보류⟩ — I'll 보류(14번 참조). 확정 후 and I'll 은 [ənaɪl]/[əndaɪl] 로 합쳐 `어나일`/`언다일` 꼴이 된다. (검토 확정: 보류 유지)
- **다른 실현형** CAREFUL: 아임 히어r 온 v에이케이션 앤드 아일 비 스테잉 f포어r 어 위이크
- **현상** 반영: and 약형 · for 약형 ｜ 변이: — ｜ 보류: I'll
- **확신도** LOW — I'll 표기 근거 부족(and·for 약형 자체는 HIGH)
- **근거** for a 의 r 연결은 라틴 r 규약상 띄어 둔다.
- **현재 앱 음원** 정렬(레퍼런스 기반 변이 선택, 관찰 아님): and→ax · for→ao ｜ I'll: 14번과 동일

### 53. How long will you be staying in the country?

- **English** How long will you be staying in the country?
- **현행** 하우 롱 윌 유 비 스테잉 인 더 컨트리
- **기본형 (DEFAULT)** **하우 롱 윌 여 비 스테잉 인 더 컨트리**
- **다른 실현형** CAREFUL: 하우 롱 윌 유 비 스테잉 인 더 컨트리
- **현상** 반영: will you 의 비강세 you ｜ 변이: —
- **확신도** MEDIUM — you 약형
- **근거** —
- **현재 앱 음원** 정렬(레퍼런스 기반 변이 선택, 관찰 아님): you→uh

### 54. I'm staying at this hotel for five nights.

- **English** I'm staying at this hotel for five nights.
- **현행** 아임 스테잉 앳 디스 호텔 f포어r f파이v 나이츠
- **기본형 (DEFAULT)** **아임 스테잉 엇 디스 호텔 f퍼r f파이v 나이츠**
- **다른 실현형** CAREFUL: 아임 스테잉 앳 디스 호텔 f포어r f파이v 나이츠
- **현상** 반영: at 약형 [ət] · for 약형 [fɚ] ｜ 변이: —
- **확신도** HIGH — 둘 다 사전 약형
- **근거** —
- **현재 앱 음원** 정렬(레퍼런스 기반 변이 선택, 관찰 아님): at→ae · for→ax

### 55. Do you have anything to declare?

- **English** Do you have anything to declare?
- **현행** 두 유 해v 애니씽 투 디클레어r
- **기본형 (DEFAULT)** **더여 해v 애니씽 터 디클레어r**
- **다른 실현형** COMMON: 두여 해v 애니씽 터 디클레어r · COMMON: 저 해v 애니씽 터 디클레어r · CAREFUL: 두 유 해v 애니씽 투 디클레어r
- **현상** 반영: 문두 조동사 do 약형+비강세 you · anything to 의 to 약형 [tə] ｜ 변이: 문두 Do you→저(COMMON)
- **확신도** HIGH — do·you·to 약형 모두 Cambridge US 명시(검토 확정)
- **근거** Cambridge US 조동사 do: /də/ /du/ /duː/ — 자음 /j/ 앞이라 [də]. you /jə/. → [dəjə] `더여`(검토 확정). 중간형 `두여` 와 합쳐진 [dʒə] `저` 는 COMMON(감사 파일 변이 규정). /ŋ/ 뒤 to 는 [tə].
- **현재 앱 음원** Do(단어 내): 폐쇄 100ms(끊김/파열 가능) ｜ to(단어 내): 폐쇄 없음·에너지 유지 ｜ 정렬(레퍼런스 기반 변이 선택, 관찰 아님): you→uh · to→ax

### 56. I don't have anything to declare.

- **English** I don't have anything to declare.
- **현행** 아이 돈 해v 애니씽 투 디클레어r
- **기본형 (DEFAULT)** **아이 돈 해v 애니씽 터 디클레어r**
- **다른 실현형** CAREFUL: 아이 돈트 해v 애니씽 투 디클레어r
- **현상** 반영: don't 의 t 탈락(현행) · to 약형 [tə] ｜ 변이: —
- **확신도** HIGH — to 의 [tə] 는 사전 약형(뒤가 자음)
- **근거** —
- **현재 앱 음원** to(단어 내): 폐쇄 5ms(짧음) ｜ 정렬(레퍼런스 기반 변이 선택, 관찰 아님): to→ax

### 57. My flight was delayed, so I missed my connection.

- **English** My flight was delayed, so I missed my connection.
- **현행** 마이 f라잇 워z 딜레이드 쏘 아이 미스트 마이 커넥션
- **기본형 (DEFAULT)** (현행 유지) 마이 f라잇 워z 딜레이드 쏘 아이 미스트 마이 커넥션
- **다른 실현형** —
- **현상** 반영: was 약형(현행) ｜ 변이: —
- **확신도** HIGH — 변경 없음
- **근거** —
- **현재 앱 음원** 미측정

### 58. My luggage hasn't arrived yet, so what should I do?

- **English** My luggage hasn't arrived yet, so what should I do?
- **현행** 마이 러기지 해즌 터라이v드 옛 쏘 왓 슈다이 두
- **기본형 (DEFAULT)** **마이 러기지 해즌 터라이v드 옛 쏘 왓 셔라이 두**
- **다른 실현형** COMMON: 마이 러기지 해즌 터라이v드 옛 쏘 왓 슈라이 두 · CAREFUL: 마이 러기지 해즌트 어라이v드 옛 쏘 왓 슈드 아이 두
- **현상** 반영: hasn't arrived 연결(현행) · should 약형 [ʃəd]+I 앞 d flap [ʃəɾaɪ] ｜ 변이: 강형 모음 `슈라이`(COMMON)
- **확신도** MEDIUM — should 약형 /ʃəd/ 는 Cambridge US 명시(HIGH). d 의 단어경계 flap 은 문맥 의존
- **근거** Cambridge US: should 강형 /ʃʊd/·약형 /ʃəd/. 의문문의 should 는 강조가 없어 약형이고 어말 d 가 I 앞에서 굴러 [ʃəɾaɪ] → `셔라이`(감사 확정). 68·76 의 `커라이` 와 같은 원리.
- **현재 앱 음원** hasnt+arrived: 폐쇄 없음·에너지 유지 ｜ should+I: 폐쇄 없음·에너지 유지

### 59. I think I left my passport in the taxi.

- **English** I think I left my passport in the taxi.
- **현행** 아이 씽크 아이 레f트 마이 패스포어r트 인 더 택씨
- **기본형 (DEFAULT)** **아이 씽크 아이 레f 마이 패스포어r린 더 택씨**
- **다른 실현형** CAREFUL: 아이 씽크 아이 레f트 마이 패스포어r트 인 더 택씨
- **현상** 반영: left my 의 t 탈락(ft+m) · passport in 의 t flap+연결 ｜ 변이: —
- **확신도** MEDIUM — 둘 다 선택적 연결 현상
- **근거** passport 의 어말 t 는 /r/ 뒤·모음 앞이라 flap([pæspɔɹɾɪn]). r 는 유지.
- **현재 앱 음원** passport+in: 폐쇄 10ms(짧음)

### 60. I'd like to change my flight to tomorrow, if possible.

- **English** I'd like to change my flight to tomorrow, if possible.
- **현행** 아이드 라이크 투 체인지 마이 f라잇 투 터마로우 이f 파써블
- **기본형 (DEFAULT)** **아이드 라이크 터 체인지 마이 f라잇 터 터마로우 이f 파써블**
- **다른 실현형** CAREFUL: 아이드 라이크 투 체인지 마이 f라잇 투 터마로우 이f 파써블
- **현상** 반영: like to · flight to 의 to 약형 [tə] ×2 ｜ 변이: —
- **확신도** HIGH — 무성 파열음 뒤·자음 앞의 to 는 [tə](사전 약형), flap 조건 없음
- **근거** —
- **현재 앱 음원** to(단어 내): 폐쇄 없음·에너지 유지 ｜ to(단어 내): 폐쇄 없음·에너지 유지 ｜ tomorrow(단어 내): 폐쇄 15ms(끊김/파열 가능) ｜ 정렬(레퍼런스 기반 변이 선택, 관찰 아님): to→ax · to→ax

### 61. Can I use this ticket on the next train?

- **English** Can I use this ticket on the next train?
- **현행** 캔 아이 유즈 디스 티킷 온 더 넥스트 트레인
- **기본형 (DEFAULT)** **커나이 유즈 디스 티키론 더 넥스 트레인**
- **다른 실현형** CAREFUL: 캔 아이 유즈 디스 티킷 온 더 넥스트 트레인
- **현상** 반영: can 약형+Can I 연결 [kənaɪ] · ticket on 의 t flap+연결 · next train 의 t 탈락(kst+t) ｜ 변이: —
- **확신도** MEDIUM — 연결·flap·탈락 모두 문맥 의존이나 정상 속도의 대표형(can 약형은 HIGH)
- **근거** ticket 의 어말 t 는 on 앞에서 flap. next 의 t 는 자음군 사이라 탈락.
- **현재 앱 음원** ticket(단어 내): 폐쇄 35ms(끊김/파열 가능) ｜ ticket+on: 폐쇄 10ms(짧음) ｜ 정렬(레퍼런스 기반 변이 선택, 관찰 아님): Can→ae

### 62. Could you tell me how to get to the station?

- **English** Could you tell me how to get to the station?
- **현행** 쿠쥬 텔 미 하우 투 겟 투 더 스테이션
- **기본형 (DEFAULT)** **커저 텔 미 하우러 겟 터 더 스테이션**
- **다른 실현형** COMMON: 쿠저 텔 미 하우러 겟 터 더 스테이션 · CAREFUL: 쿠드 유 텔 미 하우 투 겟 투 더 스테이션
- **현상** 반영: could 약형+you 구개음화 [kədʒə] · how to 의 to 약형+모음 뒤 flap · get to 의 to 약형 [tə](t+t) ｜ 변이: —
- **확신도** MEDIUM — how to 의 flap 은 3번보다 확실(뒤가 자음 get)하나 여전히 선택적 — 검토에서 `하우러` 수용
- **근거** Cambridge US: could 약형 /kəd/, you /jə/. 강조 없는 요청문의 could 는 약형이 대표형이고 /d/+/j/→[dʒ] 가 이어져 [kədʒə] → `커저` (검토 2026-09-08: ㅠ→ㅓ 통일 + modal 약형). get to 는 t+t 가 하나로 합쳐져 `겟 터`.
- **현재 앱 음원** to(단어 내): 폐쇄 없음·에너지 유지 ｜ to(단어 내): 폐쇄 없음·에너지 유지 ｜ 정렬(레퍼런스 기반 변이 선택, 관찰 아님): you→uh · to→ax · to→ax

### 63. Is this train going in the right direction?

- **English** Is this train going in the right direction?
- **현행** 이z 디스 트레인 고잉 인 더 라잇 디렉션
- **기본형 (DEFAULT)** (현행 유지) 이z 디스 트레인 고잉 인 더 라잇 디렉션
- **다른 실현형** —
- **현상** 반영: going in 연결(현행) ｜ 변이: — ｜ 주의: 이동 의미의 going 이라 거너 금지
- **확신도** HIGH — 변경 없음
- **근거** —
- **현재 앱 음원** 미측정

### 64. How long does it take to get there by subway?

- **English** How long does it take to get there by subway?
- **현행** 하우 롱 더짓 테익 투 겟 데어r 바이 써브웨이
- **기본형 (DEFAULT)** **하우 롱 더짓 테익 터 겟 데어r 바이 써브웨이**
- **다른 실현형** CAREFUL: 하우 롱 더즈 잇 테익 투 겟 데어r 바이 써브웨이
- **현상** 반영: does it 연결(현행) · take to [tə] ｜ 변이: —
- **확신도** HIGH — k 뒤 to 는 [tə]
- **근거** —
- **현재 앱 음원** to(단어 내): 폐쇄 없음·에너지 유지 ｜ 정렬(레퍼런스 기반 변이 선택, 관찰 아님): to→ax

### 65. Could you let me know when we get there?

- **English** Could you let me know when we get there?
- **현행** 쿠쥬 렛 미 노우 웬 위 겟 데어r
- **기본형 (DEFAULT)** **커저 레미 노우 웬 위 겟 데어r**
- **다른 실현형** COMMON: 쿠저 레미 노우 웬 위 겟 데어r · CAREFUL: 쿠드 유 렛 미 노우 웬 위 겟 데어r
- **현상** 반영: could 약형+you 구개음화 [kədʒə] · let me→레미 ｜ 변이: —
- **확신도** MEDIUM — let me(6번과 같음)
- **근거** Cambridge US: could 약형 /kəd/, you /jə/. 강조 없는 요청문의 could 는 약형이 대표형이고 /d/+/j/→[dʒ] 가 이어져 [kədʒə] → `커저` (검토 2026-09-08: ㅠ→ㅓ 통일 + modal 약형). let me 는 부록 B.
- **현재 앱 음원** 정렬(레퍼런스 기반 변이 선택, 관찰 아님): you→uh ｜ let me: 6번과 동일

### 66. I have a reservation under the name Kim.

- **English** I have a reservation under the name Kim.
- **현행** 아이 해v 어 레저r베이션 언더r 더 네임 킴
- **기본형 (DEFAULT)** (현행 유지) 아이 해v 어 레저r베이션 언더r 더 네임 킴
- **다른 실현형** —
- **현상** 반영: (have a 는 v+모음이라 자연 연결) ｜ 변이: —
- **확신도** HIGH — 변경 없음
- **근거** —
- **현재 앱 음원** 미측정

### 67. I'd like to check in, but I arrived early.

- **English** I'd like to check in, but I arrived early.
- **현행** 아이드 라이크 투 체킨 버라이 어라이v드 어r리
- **기본형 (DEFAULT)** **아이드 라이크 터 체킨 버라이 어라이v더r리**
- **다른 실현형** CAREFUL: 아이드 라이크 투 체크 인 벗 아이 어라이v드 어r리
- **현상** 반영: like to [tə] · check in 연결(현행) · but I flap(현행) · arrived early 연결(d+모음) ｜ 변이: —
- **확신도** MEDIUM — arrived early 의 연결은 강세 모음 앞이라 flap 은 아니고 연결만
- **근거** arrived 의 d 는 early 의 강세 모음 앞이라 [d] 유지, 다만 이어진다 → `어라이v더r리`(v·r 유지).
- **현재 앱 음원** to(단어 내): 폐쇄 5ms(짧음) ｜ but+I: 폐쇄 없음·에너지 유지 ｜ arrived+early: 폐쇄 40ms(끊김/파열 가능) ｜ 정렬(레퍼런스 기반 변이 선택, 관찰 아님): to→ax

### 68. Could I leave my luggage here until check-in?

- **English** Could I leave my luggage here until check-in?
- **현행** 쿠라이 리이v 마이 러기지 히어r 언틸 체킨
- **기본형 (DEFAULT)** **커라이 리이v 마이 러기지 히어r 언틸 체킨**
- **다른 실현형** COMMON: 쿠라이 리이v 마이 러기지 히어r 언틸 체킨 · CAREFUL: 쿠드 아이 리이v 마이 러기지 히어r 언틸 체크 인
- **현상** 반영: could 약형 [kəd]+I 앞 d flap [kəɾaɪ] ｜ 변이: 강형 모음 `쿠라이`(COMMON, 현행)
- **확신도** MEDIUM — could 약형 /kəd/ 는 사전 명시(HIGH). d 의 단어경계 flap 은 문맥 의존
- **근거** Cambridge US: could 약형 /kəd/. 요청문의 could 는 약형 → [kəɾaɪ] `커라이`(감사 확정). 76번과 통일.
- **현재 앱 음원** Could+I: 폐쇄 없음·에너지 유지

### 69. I think there's been a mistake with my reservation.

- **English** I think there's been a mistake with my reservation.
- **현행** 아이 씽크 데어r즈 비너 미스테익 위드 마이 레저r베이션
- **기본형 (DEFAULT)** (현행 유지) 아이 씽크 데어r즈 비너 미스테익 위드 마이 레저r베이션
- **다른 실현형** —
- **현상** 반영: been a 연결(현행) ｜ 변이: —
- **확신도** HIGH — 변경 없음
- **근거** with 의 th 표기(`위드`)는 이 작업 범위 밖.
- **현재 앱 음원** 미측정

### 70. Is breakfast included, or do I need to pay extra?

- **English** Is breakfast included, or do I need to pay extra?
- **현행** 이z 브렉f퍼스트 인클루우디드 오어r 두 아이 니이드 투 페이 엑스트라
- **기본형 (DEFAULT)** **이z 브렉f퍼스트 인클루우디드 어r 두 아이 니이러 페이 엑스트라**
- **다른 실현형** COMMON: 이z 브렉f퍼스트 인클루우디드 어r 두 아이 니잇 터 페이 엑스트라 · CAREFUL: 이z 브렉f퍼스트 인클루우디드 오어r 두 아이 니이드 투 페이 엑스트라
- **현상** 반영: or 약형 [ɚ] · 조동사 do 의 모음 앞 약형 [du] · need to 의 d+to→flap [niːɾə] ｜ 변이: need to 를 [niːt tə] 로(COMMON)
- **확신도** MEDIUM — need to 는 [niɾə] 와 [nit tə] 가 모두 흔함(감사: MEDIUM 유지 확정). or·do 약형은 HIGH
- **근거** do 의 약형은 자음 앞 /də/, 모음 앞 /du~dʊ/ (Roach: so do I /du aɪ/ vs so do they /də ðeɪ/; Oxford Advanced American 조동사 do /də, dʊ, du/). 감사 1차의 `더 아이` 는 Cambridge 목록을 문맥 없이 적용한 오류로 사용자가 철회(2026-09-08). need to 는 d 흡수 뒤 모음 사이 flap [niːɾə].
- **현재 앱 음원** breakfast+included: 폐쇄 없음·에너지 유지 ｜ included+or: 폐쇄 240ms(끊김/파열 가능) ｜ to(단어 내): 폐쇄 없음·에너지 유지 ｜ 정렬(레퍼런스 기반 변이 선택, 관찰 아님): or→ao · to→ax

### 71. The air conditioner isn't working in my room.

- **English** The air conditioner isn't working in my room.
- **현행** 디 에어r 컨디셔너r 이즌 워r킹 인 마이 루움
- **기본형 (DEFAULT)** (현행 유지) 디 에어r 컨디셔너r 이즌 워r킹 인 마이 루움
- **다른 실현형** —
- **현상** 반영: isn't 성절비음(현행) ｜ 변이: —
- **확신도** HIGH — 변경 없음
- **근거** —
- **현재 앱 음원** 미측정

### 72. Could you recommend something that isn't too spicy?

- **English** Could you recommend something that isn't too spicy?
- **현행** 쿠쥬 레커멘드 썸씽 대리즌 투우 스파이씨
- **기본형 (DEFAULT)** **커저 레커멘드 썸씽 더리즌 투우 스파이씨**
- **다른 실현형** COMMON: 쿠저 레커멘드 썸씽 더리즌 투우 스파이씨 · COMMON: 커저 레커멘드 썸씽 댓 이즌 투우 스파이씨 · CAREFUL: 쿠드 유 레커멘드 썸씽 댓 이즌트 투우 스파이씨
- **현상** 반영: could 약형+you 구개음화 [kədʒə] · 관계사 that 약형 [ðət]+isn't 앞 flap ｜ 변이: that isn't 사이 끊김(COMMON)
- **확신도** MEDIUM — 관계사 that 의 약형은 사전 명시(HIGH)이나 flap 여부는 경계 의존(앱 음원은 끊음)
- **근거** Cambridge US: could 약형 /kəd/, you /jə/. 강조 없는 요청문의 could 는 약형이 대표형이고 /d/+/j/→[dʒ] 가 이어져 [kədʒə] → `커저` (검토 2026-09-08: ㅠ→ㅓ 통일 + modal 약형). 관계사 that 은 비강세 [ðət] → `더리즌`.
- **현재 앱 음원** that+isnt: 폐쇄 20ms(끊김/파열 가능) ｜ 정렬(레퍼런스 기반 변이 선택, 관찰 아님): you→uw · that→ax(약형)

### 73. I'm allergic to nuts, so does this have any?

- **English** I'm allergic to nuts, so does this have any?
- **현행** 아이멀러r직 투 넛츠 쏘 더즈 디스 해v 애니
- **기본형 (DEFAULT)** **아이멀러r직 터 넛츠 쏘 더즈 디스 해v 애니**
- **다른 실현형** CAREFUL: 아임 얼러r직 투 넛츠 쏘 더즈 디스 해v 애니
- **현상** 반영: I'm allergic 연결(현행) · allergic to [tə] ｜ 변이: —
- **확신도** HIGH — k 뒤 to 는 [tə]
- **근거** —
- **현재 앱 음원** to(단어 내): 폐쇄 10ms(짧음) ｜ 정렬(레퍼런스 기반 변이 선택, 관찰 아님): to→ax

### 74. I'm sorry, but this isn't what I ordered.

- **English** I'm sorry, but this isn't what I ordered.
- **현행** 아임 쏘리 벗 디스 이즌 와라이 오어r더r드
- **기본형 (DEFAULT)** (현행 유지) 아임 쏘리 벗 디스 이즌 와라이 오어r더r드
- **다른 실현형** CAREFUL: 아임 쏘리 벗 디스 이즌트 왓 아이 오어r더r드
- **현상** 반영: what I flap(현행) · isn't 성절비음(현행) ｜ 변이: —
- **확신도** MEDIUM — 단어경계 flap
- **근거** —
- **현재 앱 음원** what+I: 폐쇄 없음·에너지 유지

### 75. Could we get the check when you have a minute?

- **English** Could we get the check when you have a minute?
- **현행** 쿠드 위 겟 더 체크 웬 유 해v 어 미닛
- **기본형 (DEFAULT)** **커드 위 겟 더 체크 웬 여 해v 어 미닛**
- **다른 실현형** COMMON: 쿠드 위 겟 더 체크 웬 여 해v 어 미닛 · CAREFUL: 쿠드 위 겟 더 체크 웬 유 해v 어 미닛
- **현상** 반영: could 약형 [kəd](뒤가 /w/ 라 구개음화 없음) · when you 의 비강세 you ｜ 변이: 강형 모음 `쿠드`(COMMON)
- **확신도** MEDIUM — could 약형은 사전 명시(HIGH). you 약형 표기의 대표성 판단 때문에 MEDIUM
- **근거** Cambridge US: could 약형 /kəd/. 공손한 요청의 could 는 약형 → `커드 위`(감사 확정). could we 는 뒤가 자음이라 구개음화 없음.
- **현재 앱 음원** 정렬(레퍼런스 기반 변이 선택, 관찰 아님): you→uh

### 76. Could I get this to go, please?

- **English** Could I get this to go, please?
- **현행** 쿠다이 겟 디스 투 고우 플리이z
- **기본형 (DEFAULT)** **커라이 겟 디스 터 고우 플리이z**
- **다른 실현형** COMMON: 쿠라이 겟 디스 터 고우 플리이z · CAREFUL: 쿠드 아이 겟 디스 투 고우 플리이z
- **현상** 반영: could 약형 [kəd]+I 앞 d flap [kəɾaɪ] · this to [tə] ｜ 변이: 강형 모음 `쿠라이`(COMMON)
- **확신도** MEDIUM — could 약형은 사전 명시(HIGH). d 의 단어경계 flap 은 문맥 의존. to 는 HIGH(s 뒤)
- **근거** 68번과 동일(감사 확정).
- **현재 앱 음원** Could+I: 폐쇄 없음·에너지 유지 ｜ to(단어 내): 폐쇄 10ms(짧음) ｜ 정렬(레퍼런스 기반 변이 선택, 관찰 아님): to→ax

### 77. I'd like to return this because it doesn't fit.

- **English** I'd like to return this because it doesn't fit.
- **현행** 아이드 라이크 투 리터r언 디스 비커z 잇 더즌 f핏
- **기본형 (DEFAULT)** **아이드 라이크 터 리터r언 디스 비커z 잇 더즌 f핏**
- **다른 실현형** CAREFUL: 아이드 라이크 투 리터r언 디스 비커z 잇 더즌트 f핏
- **현상** 반영: like to [tə] · because 약화(현행) · doesn't 성절비음(현행) ｜ 변이: —
- **확신도** HIGH — k 뒤 to 는 [tə]
- **근거** —
- **현재 앱 음원** to(단어 내): 폐쇄 15ms(끊김/파열 가능) ｜ 정렬(레퍼런스 기반 변이 선택, 관찰 아님): to→ax

### 78. Do you have anything for a headache?

- **English** Do you have anything for a headache?
- **현행** 두 유 해v 애니씽 f포어r 어 헤데익
- **기본형 (DEFAULT)** **더여 해v 애니씽 f퍼r 어 헤데익**
- **다른 실현형** COMMON: 두여 해v 애니씽 f퍼r 어 헤데익 · COMMON: 저 해v 애니씽 f퍼r 어 헤데익 · CAREFUL: 두 유 해v 애니씽 f포어r 어 헤데익
- **현상** 반영: 문두 조동사 do 약형+비강세 you · for 약형 ｜ 변이: Do you→저(COMMON)
- **확신도** HIGH — do·you·for 약형 모두 사전 명시(검토 확정)
- **근거** Cambridge US 조동사 do: /də/ /du/ /duː/ — 자음 /j/ 앞이라 [də]. you /jə/. → [dəjə] `더여`(검토 확정). 중간형 `두여` 와 합쳐진 [dʒə] `저` 는 COMMON(감사 파일 변이 규정). for a 의 r 연결은 라틴 r 규약상 띄어 둔다.
- **현재 앱 음원** Do(단어 내): 폐쇄 65ms(끊김/파열 가능) ｜ 정렬(레퍼런스 기반 변이 선택, 관찰 아님): you→uh · for→ax

### 79. Could you take a picture of us, please?

- **English** Could you take a picture of us, please?
- **현행** 쿠쥬 테이커 픽처r 어v 어스 플리이z
- **기본형 (DEFAULT)** **커저 테이커 픽처r 어v 어스 플리이z**
- **다른 실현형** COMMON: 쿠저 테이커 픽처r 어v 어스 플리이z · CAREFUL: 쿠드 유 테익 어 픽처r 어v 어스 플리이z
- **현상** 반영: could 약형+you 구개음화 [kədʒə] · take a 연결(현행) ｜ 변이: —
- **확신도** HIGH — could 약형 /kəd/·you /jə/·구개음화 모두 사전·교재 명시(검토 확정)
- **근거** Cambridge US: could 약형 /kəd/, you /jə/. 강조 없는 요청문의 could 는 약형이 대표형이고 /d/+/j/→[dʒ] 가 이어져 [kədʒə] → `커저` (검토 2026-09-08: ㅠ→ㅓ 통일 + modal 약형).
- **현재 앱 음원** 정렬(레퍼런스 기반 변이 선택, 관찰 아님): you→uh

### 80. Is there a pharmacy within walking distance?

- **English** Is there a pharmacy within walking distance?
- **현행** 이z 데어r 어 f파r머씨 위딘 워킹 디스턴스
- **기본형 (DEFAULT)** (현행 유지) 이z 데어r 어 f파r머씨 위딘 워킹 디스턴스
- **다른 실현형** —
- **현상** 반영: (특기 현상 없음) ｜ 변이: —
- **확신도** HIGH — 변경 없음
- **근거** —
- **현재 앱 음원** 미측정

### 81. What are you gonna do about it?

- **English** What are you gonna do about it?
- **현행** 왓 아r 유 거나 두 어바우릿
- **기본형 (DEFAULT)** **워러r여 거너 두 어바우릿**
- **다른 실현형** CAREFUL: 왓 아r 유 거너 두 어바우릿
- **현상** 반영: what are 의 t flap+are 약형 [wʌɾɚ] · 비강세 you · gonna(원문) 끝모음 정정 · about it flap(현행) ｜ 변이: —
- **확신도** MEDIUM — what are you 는 작업지시서가 FAST 예로 든 연쇄이나, 이 문장은 원문이 gonna 인 캐주얼 레지스터라 [wʌɾɚjə] 가 대표형이라고 판단 — **사용자 재검토 요망** — 검토: MEDIUM DEFAULT 로 수용
- **근거** what are 의 t 는 모음 사이(are 는 약형 [ɚ])라 flap. 가이드 §7 의 예 `워러유 두잉` 과 같은 형태이되 are 의 r 정보를 지우지 않으려고 `워러r여` 로 적었다. `거나`→`거너` 는 gonna 의 끝모음 [ə].
- **현재 앱 음원** What+are: 폐쇄 없음·에너지 유지 ｜ about+it: 폐쇄 없음·에너지 유지 ｜ 정렬(레퍼런스 기반 변이 선택, 관찰 아님): you→uh ｜ what are 자리 /t/ 유성·무파열(진단문 8화자 공통)

### 82. I'm not gonna let that happen again.

- **English** I'm not gonna let that happen again.
- **현행** 아임 낫 거나 렛 댓 해프너겐
- **기본형 (DEFAULT)** **아임 낫 거너 렛 댓 해프너겐**
- **다른 실현형** CAREFUL: 아임 낫 고잉 투 렛 댓 해픈 어겐
- **현상** 반영: gonna(원문) 끝모음 정정 · happen again 연결(현행) ｜ 변이: —
- **확신도** HIGH — gonna 는 사전 표제, 끝모음 [ə]
- **근거** let that 은 t+ð 라 t 가 흡수되지만 표기는 현행 `렛 댓` 유지.
- **현재 앱 음원** 미측정

### 83. Do you wanna come over for dinner tonight?

- **English** Do you wanna come over for dinner tonight?
- **현행** 두 유 워나 커모우버r f포어r 디너r 터나잇
- **기본형 (DEFAULT)** **더여 워너 커모우버r f퍼r 디너r 터나잇**
- **다른 실현형** COMMON: 두여 워너 커모우버r f퍼r 디너r 터나잇 · COMMON: 저 워너 커모우버r f퍼r 디너r 터나잇 · CAREFUL: 두 유 원트 투 컴 오우버r f포어r 디너r 터나잇
- **현상** 반영: 문두 조동사 do 약형+비강세 you · wanna(원문) 끝모음 정정 · come over 연결(현행) · for 약형 ｜ 변이: Do you→저(COMMON)
- **확신도** HIGH — do·you·for 약형과 wanna 모두 사전 명시(검토 확정)
- **근거** Cambridge US 조동사 do: /də/ /du/ /duː/ — 자음 /j/ 앞이라 [də]. you /jə/. → [dəjə] `더여`(검토 확정). 중간형 `두여` 와 합쳐진 [dʒə] `저` 는 COMMON(감사 파일 변이 규정).
- **현재 앱 음원** Do(단어 내): 폐쇄 65ms(끊김/파열 가능) ｜ tonight(단어 내): 폐쇄 10ms(짧음) ｜ 정렬(레퍼런스 기반 변이 선택, 관찰 아님): you→uh · for→ax

### 84. I gotta get back to work before it gets late.

- **English** I gotta get back to work before it gets late.
- **현행** 아이 가라 겟 백 투 워r크 비f포어r 잇 겟츠 레잇
- **기본형 (DEFAULT)** **아이 가러 겟 백 터 워r크 비f포어r 잇 겟츠 레잇**
- **다른 실현형** CAREFUL: 아이 갓 투 겟 백 투 워r크 비f포어r 잇 겟츠 레잇
- **현상** 반영: gotta 의 flap+끝모음 [gɑɾə](현행 `가라` 정정) · back to [tə] ｜ 변이: —
- **확신도** HIGH — gotta 는 사전 표제, k 뒤 to 는 [tə]
- **근거** `가라`→`가러` 는 끝모음 [ə]. 해프터·써포우스터·거너 와 같은 원리.
- **현재 앱 음원** gotta(단어 내): 폐쇄 없음·에너지 유지 ｜ to(단어 내): 폐쇄 10ms(짧음) ｜ 정렬(레퍼런스 기반 변이 선택, 관찰 아님): to→ax

### 85. Lemme see if I can find another way.

- **English** Lemme see if I can find another way.
- **현행** 레미 씨이 이f 아이 캔 f아인드 어나더r 웨이
- **기본형 (DEFAULT)** **레미 씨이 이f 아이 컨 f아인더나더r 웨이**
- **다른 실현형** CAREFUL: 레미 씨이 이f 아이 캔 f아인드 어나더r 웨이
- **현상** 반영: lemme(원문) · can 약형 [kən] · find another 연결(d+모음) ｜ 변이: —
- **확신도** MEDIUM — find another 의 합침은 표기 규약(파열음+모음). can 은 HIGH
- **근거** —
- **현재 앱 음원** find+another: 폐쇄 없음·에너지 유지 ｜ 정렬(레퍼런스 기반 변이 선택, 관찰 아님): can→ax

### 86. I was kinda hoping you'd say yes.

- **English** I was kinda hoping you'd say yes.
- **현행** 아이 워z 카인다 호우핑 유드 쎄이 예스
- **기본형 (DEFAULT)** **아이 워z 카인더 호우핑 유드 쎄이 예스**
- **다른 실현형** CAREFUL: 아이 워z 카인드 어v 호우핑 유드 쎄이 예스
- **현상** 반영: kinda(원문) 끝모음 정정 · was 약형(현행) ｜ 변이: —
- **확신도** HIGH — kinda 는 사전 표제, kind of→[kaɪndə]
- **근거** —
- **현재 앱 음원** kinda(단어 내): 폐쇄 없음·에너지 유지

### 87. I think you might be right about that.

- **English** I think you might be right about that.
- **현행** 아이 씽크 유 마잇 비 라이러바웃 댓
- **기본형 (DEFAULT)** **아이 씽켜 마잇 비 라이러바웃 댓**
- **다른 실현형** CAREFUL: 아이 씽크 유 마잇 비 라잇 어바웃 댓
- **현상** 반영: think you [kjə] 연결 · right about flap(현행) ｜ 변이: —
- **확신도** MEDIUM — you 약형(22·31 번의 `메이켜`·`애스켜` 와 같은 표기)
- **근거** —
- **현재 앱 음원** right+about: 폐쇄 없음·에너지 유지 ｜ 정렬(레퍼런스 기반 변이 선택, 관찰 아님): you→uw

### 88. What else was I supposed to do?

- **English** What else was I supposed to do?
- **현행** 와렐스 워자이 써포우즈드 투 두
- **기본형 (DEFAULT)** **와렐스 워자이 써포우스터 두**
- **다른 실현형** COMMON: 왓 엘스 워자이 써포우스터 두 · CAREFUL: 왓 엘스 워z 아이 써포우즈드 투 두
- **현상** 반영: what else 단어경계 flap(현행) · was I 연결(현행) · supposed to→써포우스터 ｜ 변이: what|else 를 끊는 형(COMMON)
- **확신도** MEDIUM — supposed to 는 HIGH. what else 의 flap 은 단어경계 현상이라 MEDIUM — else 의 초점은 차단 조건이 아니다(사용자 2차 판정)
- **근거** what+else 는 pause 도 상위 phrase boundary 도 없는 긴밀한 의문 표현이고 현행 표기도 `와렐스`. 어말 /t/+모음 환경의 flap 은 뒤 모음 강세와 무관하게 일어난다. Switchboard 자연 회화에서 simple word-final /t/ coda 뒤에 모음이 온 120건 중 70%(84건)가 flap 이었다(Ranbom, Connine & Yudman 2009). 전체 /t/-final 단어 중 모음이 뒤따른 185건에서는 54.3% 가 flap 이었다. phrase boundary 나 pause 는 flap 빈도를 낮춘다. 강세 모음 앞 실례: `that is`·`private airplane`·`get out`·`at all`. into/else/everything 의 첫음절 강세는 판정 근거가 아니다(사용자 2차 판정 2026-09-08).
- **현재 앱 음원** What+else: 폐쇄 없음·에너지 유지 ｜ to(단어 내): 폐쇄 없음·에너지 유지 ｜ 정렬(레퍼런스 기반 변이 선택, 관찰 아님): to→ax ｜ Aria: /z/ 유성 → 미구현(진단문)

### 89. I knew something like this would happen.

- **English** I knew something like this would happen.
- **현행** 아이 뉴 썸씽 라이크 디스 우드 해픈
- **기본형 (DEFAULT)** **아이 뉴 썸씽 라이크 디스 워드 해픈**
- **다른 실현형** COMMON: 아이 뉴 썸씽 라이크 디스 우드 해픈
- **현상** 반영: 조동사 would 약형 [wəd] ｜ 변이: 강형 모음 `우드`(COMMON, 현행)
- **확신도** HIGH — would 약형 /wəd/ 는 Cambridge US 명시(감사 확정). 이 문장의 would 는 비강세
- **근거** Cambridge US: would 강형 /wʊd/·약형 /wəd/·/əd/. 서술문 안의 조동사 would 는 강조가 없어 약형 → `워드`.
- **현재 앱 음원** 미측정

### 90. I really appreciate everything you've done for me.

- **English** I really appreciate everything you've done for me.
- **현행** 아이 리얼리 어프리이시에잇 에v리씽 유v 던 f포어r 미
- **기본형 (DEFAULT)** **아이 리얼리 어프리이시에이레v리씽 유v 던 f퍼r 미**
- **다른 실현형** COMMON: 아이 리얼리 어프리이시에잇 에v리씽 유v 던 f퍼r 미 · CAREFUL: 아이 리얼리 어프리이시에잇 에v리씽 유v 던 f포어r 미
- **현상** 반영: appreciate everything 단어경계 flap+연결 · for 약형 ｜ 변이: 경계를 끊는 형(COMMON)
- **확신도** MEDIUM — for 는 HIGH. appreciate|everything 의 flap 은 내용어+강세 모음 경계라 문맥 의존(사용자 2차 판정)
- **근거** pause 나 intonational boundary 를 유도할 표지가 없고, 내용어+강세 모음 경계의 flap 도 실례가 있다(`private airplane`). 어말 /t/+모음 환경의 flap 은 뒤 모음 강세와 무관하게 일어난다. Switchboard 자연 회화에서 simple word-final /t/ coda 뒤에 모음이 온 120건 중 70%(84건)가 flap 이었다(Ranbom, Connine & Yudman 2009). 전체 /t/-final 단어 중 모음이 뒤따른 185건에서는 54.3% 가 flap 이었다. phrase boundary 나 pause 는 flap 빈도를 낮춘다. 강세 모음 앞 실례: `that is`·`private airplane`·`get out`·`at all`. into/else/everything 의 첫음절 강세는 판정 근거가 아니다(사용자 2차 판정 2026-09-08). 앱 음원(Aria)은 이 자리를 80ms 폐쇄로 끊었으나 TTS 는 gold 근거가 아니다(§1.2).
- **현재 앱 음원** appreciate+everything: 폐쇄 80ms(끊김/파열 가능) ｜ 정렬(레퍼런스 기반 변이 선택, 관찰 아님): for→ax

### 91. You could've told me you were coming.

- **English** You could've told me you were coming.
- **현행** 유 쿠드v 톨드 미 유 워r 커밍
- **기본형 (DEFAULT)** **유 쿠더v 톨 미 여 워r 커밍**
- **다른 실현형** COMMON: 여 쿠더v 톨 미 여 워r 커밍 · CAREFUL: 유 쿠드 해v 톨드 미 유 워r 커밍
- **현상** 반영: could've [kʊdəv](현행 `쿠드v` 정정) · told me 의 d 탈락(ld+m) · you were 의 비강세 you ｜ 변이: 문두 You 약형(COMMON)
- **확신도** MEDIUM — told me 의 d 탈락은 자음군 축소로 흔하나 선택적
- **근거** could've 는 [kʊdəv] — 현행 `쿠드v` 는 `슈더v`(41)·`우더v`(42) 와 어긋난다.
- **현재 앱 음원** told(단어 내): 폐쇄 15ms(끊김/파열 가능) ｜ 정렬(레퍼런스 기반 변이 선택, 관찰 아님): You→uh · you→uh

### 92. I can't figure out why she left so early.

- **English** I can't figure out why she left so early.
- **현행** 아이 캔트 f피겨r 아웃 와이 쉬 레f트 쏘 어r리
- **기본형 (DEFAULT)** **아이 캔트 f피겨라웃 와이 쉬 레f 쏘 어r리**
- **다른 실현형** CAREFUL: 아이 캔트 f피겨r 아웃 와이 쉬 레f트 쏘 어r리
- **현상** 반영: figure out r 연결(30번과 통일) · left so 의 t 탈락(ft+s) ｜ 변이: —
- **확신도** MEDIUM — 둘 다 선택적 연결 현상
- **근거** 현행은 30번 `f피겨라웃` 과 92번 `f피겨r 아웃` 이 달랐다. left 의 t 는 59번과 같은 원리.
- **현재 앱 음원** 미측정

### 93. We need to find out what really happened.

- **English** We need to find out what really happened.
- **현행** 위 니이드 투 f파인다웃 왓 리얼리 해픈드
- **기본형 (DEFAULT)** **위 니이러 f파인다웃 왓 리얼리 해픈드**
- **다른 실현형** COMMON: 위 니잇 터 f파인다웃 왓 리얼리 해픈드 · CAREFUL: 위 니이드 투 f파인드 아웃 왓 리얼리 해픈드
- **현상** 반영: need to→[niːɾə] · find out 연결(현행) ｜ 변이: [niːt tə](COMMON)
- **확신도** MEDIUM — 70번과 같음 — 검토: MEDIUM 유지 확정
- **근거** —
- **현재 앱 음원** to(단어 내): 폐쇄 없음·에너지 유지 ｜ find+out: 폐쇄 없음·에너지 유지 ｜ 정렬(레퍼런스 기반 변이 선택, 관찰 아님): to→ax

### 94. I'll pick you up when I get off work.

- **English** I'll pick you up when I get off work.
- **현행** 아일 픽 유 업 웨나이 게로f 워r크
- **기본형 (DEFAULT)** **{I'll} 피켜 업 웨나이 게로f 워r크** ⟨보류⟩ — I'll 보류(14번 참조). (검토 확정: 보류 유지)
- **다른 실현형** CAREFUL: 아일 픽 유 업 웬 아이 겟 오f 워r크
- **현상** 반영: pick you [kjə] 연결 · when I 연결(현행) · get off flap(현행) ｜ 변이: — ｜ 보류: I'll
- **확신도** LOW — I'll 표기 근거 부족
- **근거** —
- **현재 앱 음원** get+off: 폐쇄 없음·에너지 유지 ｜ 정렬(레퍼런스 기반 변이 선택, 관찰 아님): you→uw

### 95. Can you drop me off near the station?

- **English** Can you drop me off near the station?
- **현행** 캔 유 드랍 미 오f 니어r 더 스테이션
- **기본형 (DEFAULT)** **컨 여 드랍 미 오f 니어r 더 스테이션**
- **다른 실현형** CAREFUL: 캔 유 드랍 미 오f 니어r 더 스테이션
- **현상** 반영: can 약형 [kən] · 비강세 you ｜ 변이: —
- **확신도** MEDIUM — you 약형(can 은 HIGH)
- **근거** —
- **현재 앱 음원** 정렬(레퍼런스 기반 변이 선택, 관찰 아님): Can→ae · you→uw

### 96. I ran into an old friend on my way home.

- **English** I ran into an old friend on my way home.
- **현행** 아이 래닌투 어노울드 f렌드 온 마이 웨이 호움
- **기본형 (DEFAULT)** **아이 래닌투 어노울드 f렌던 마이 웨이 호움**
- **다른 실현형** CAREFUL: 아이 랜 인투 언 오울드 f렌드 온 마이 웨이 호움
- **현상** 반영: ran into · an old 연결(현행) · friend on 연결(d+모음) ｜ 변이: —
- **확신도** MEDIUM — 표기 규약(파열음+모음 합침)
- **근거** an 의 약형은 현행 `어노울드` 가 이미 반영(and 의 `언` 과 혼동 주의).
- **현재 앱 음원** into(단어 내): 폐쇄 20ms(끊김/파열 가능) ｜ friend+on: 폐쇄 없음·에너지 유지

### 97. Let's go over everything one more time.

- **English** Let's go over everything one more time.
- **현행** 렛츠 고우 오우버r 에v리씽 원 모어r 타임
- **기본형 (DEFAULT)** (현행 유지) 렛츠 고우 오우버r 에v리씽 원 모어r 타임
- **다른 실현형** —
- **현상** 반영: (go over 는 모음+모음이라 활음 연결. 표기 변화 없음) ｜ 변이: —
- **확신도** HIGH — 변경 없음
- **근거** —
- **현재 앱 음원** 미측정

### 98. He showed up without telling anyone he was coming.

- **English** He showed up without telling anyone he was coming.
- **현행** 히 쇼우덥 위다웃 텔링 애니원 히 워z 커밍
- **기본형 (DEFAULT)** (현행 유지) 히 쇼우덥 위다웃 텔링 애니원 히 워z 커밍
- **다른 실현형** COMMON: 히 쇼우덥 위다웃 텔링 애니워니 워z 커밍
- **현상** 반영: showed up 연결(현행) · was 약형(현행) ｜ 변이: 비강세 he 의 h 탈락(COMMON)
- **확신도** MEDIUM — 문중 비강세 he 의 h 탈락은 흔하나 대표성 근거 부족
- **근거** —
- **현재 앱 음원** showed+up: 폐쇄 없음·에너지 유지

### 99. I thought things would work out in the end.

- **English** I thought things would work out in the end.
- **현행** 아이 쏘옷 씽z 우드 워r카웃 인 디 엔드
- **기본형 (DEFAULT)** **아이 쏘옷 씽z 워드 워r카우린 디 엔드**
- **다른 실현형** COMMON: 아이 쏘옷 씽z 우드 워r카우린 디 엔드 · CAREFUL: 아이 쏘옷 씽z 우드 워r크 아웃 인 디 엔드
- **현상** 반영: 조동사 would 약형 [wəd] · work out 연결(현행) · out in 의 t flap+연결 ｜ 변이: 강형 모음 `우드`(COMMON)
- **확신도** MEDIUM — would 약형은 사전 명시(HIGH). out in 의 flap 은 단어 경계 현상
- **근거** 89번과 동일(감사 확정). out in 의 flap 은 감사에서 v3 유지.
- **현재 앱 음원** out+in: 폐쇄 없음·에너지 유지

### 100. I can't put up with this much longer.

- **English** I can't put up with this much longer.
- **현행** 아이 캔트 푸럽 위드 디스 머치 롱거r
- **기본형 (DEFAULT)** (현행 유지) 아이 캔트 푸럽 위드 디스 머치 롱거r
- **다른 실현형** CAREFUL: 아이 캔트 풋 업 위드 디스 머치 롱거r
- **현상** 반영: put up flap(현행) ｜ 변이: —
- **확신도** MEDIUM — 단어경계 flap(현행 반영)
- **근거** —
- **현재 앱 음원** put+up: 폐쇄 없음·에너지 유지

---

## 부록 A — `to` 23문장 판정표 (문장별. 규칙이 아니다)

| # | 자리 | 기본형 | 확신도 | 판정 이유 |
|---|---|---|---|---|
| 3 | how to explain | 하우 터 | MEDIUM | 검토 확정 [tə]. Cambridge US 는 /tə/·/t̬ə/·/tu/ 를 모두 약형으로 실어 `하우러`·`하우 투` 는 COMMON |
| 4 | second to think | 쎄컨 터 | HIGH | /nd/+/t/ → d 흡수, [tə] |
| 10 | trying to say | 트라잉 터 | MEDIUM | [tə] 기본. /ŋ/ 뒤 flap `트라잉 어` COMMON · tryna FAST |
| 15 | idea to me | 이디어 터 | MEDIUM | 검토 확정 [tə]. 모음 뒤 flap 형 `이디어러` 는 COMMON |
| 16 | love to, | 투 | HIGH | 뒤 동사 생략(stranded) → 강형 [tu] |
| 19 | trying to reach | 트라잉 터 | MEDIUM | 10번과 같음 |
| 22 | mean to make | 미인 터 | MEDIUM | /n/ 뒤 [tə]. 비음성 flap `미이너` COMMON |
| 31 | meaning to ask | 미이닝 터 | MEDIUM | [tə]. 뒤가 모음이라 `투` COMMON |
| 40 | trying to help | 트라잉 터 | MEDIUM | 10번과 같음 |
| 45 | trying to say | 트라잉 터 | MEDIUM | 10번과 같음 |
| 47 | me to do | 미러 | MEDIUM | 모음 뒤 flap [ɾə] |
| 55 | anything to declare | 애니씽 터 | HIGH | /ŋ/ 뒤 [tə] |
| 56 | anything to declare | 애니씽 터 | HIGH | /ŋ/ 뒤 [tə] |
| 60 | like to change · flight to tomorrow | 라이크 터 · f라잇 터 | HIGH | k·t 뒤, 자음 앞 → [tə] |
| 62 | how to get · get to the | 하우러 · 겟 터 | MEDIUM | how to 는 모음 뒤 flap(뒤가 자음이라 3번보다 확실). get to 는 t+t 합침 |
| 64 | take to get | 테익 터 | HIGH | k 뒤 [tə] |
| 67 | like to check | 라이크 터 | HIGH | k 뒤 [tə] |
| 70 | need to pay | 니이러 | MEDIUM | d 흡수 뒤 모음 사이 flap [niːɾə]. `니잇 터` COMMON |
| 73 | allergic to nuts | 얼러r직 터 | HIGH | k 뒤 [tə] |
| 76 | this to go | 디스 터 | HIGH | s 뒤 [tə] |
| 77 | like to return | 라이크 터 | HIGH | k 뒤 [tə] |
| 84 | back to work | 백 터 | HIGH | k 뒤 [tə] |
| 93 | need to find | 니이러 | MEDIUM | 70번과 같음 |

어휘 축약 안의 to(`워너` 13 · `써포우스터` 25·39·88 · `유우스터` 35·36 · `해프터` 43·50 · `거너` 48·49)는 위 표 밖이다.

## 부록 B — 같은 표현의 문장별 표기 (자기 점검 1·2·5·7)

| 표현 | 해당 문장 | 기본형에 반영됐는가 |
|---|---|---|
| could you | 1, 7, 30, 62, 65, 72, 79 | ✓ 1 7 30 62 65 72 79 |
| would you | 28 | ✓ 28 |
| thought you | 23 | ✓ 23 |
| understood you | 6 | ✓ 6 |
| put it (+ it into flap) | 5 | ✓ 5 |
| what else | 88 | ✓ 88 |
| appreciate everything | 90 | ✓ 90 |
| let me / lemme | 6, 18, 65, 85 | ✓ 6 18 65 85 |
| give me | 4, 7 | ✓ 4 7 |
| what I / what I'm | 5, 10, 25, 26, 45, 74 | ✓ 5 10 25 26 45 74 |
| but I | 5, 11, 12, 16, 40, 67 | ✓ 5 11 12 16 40 67 |
| but it's | 29 | ✓ 29 |
| about it | 4, 14, 26, 32, 41, 47, 81 | ✓ 4 14 26 32 41 47 81 |
| trying to | 10, 19, 40, 45 | ✓ 10 19 40 45 |
| could I | 68, 76 | ✓ 68 76 |
| could we | 75 | ✓ 75 |
| would (비강세 조동사) | 28, 89, 99 | ✓ 28 89 99 |
| do I (모음 앞 do 약형 /du/) | 70 | ✓ 70 |
| should I | 58 | ✓ 58 |
| do you (문중·문두) | 2, 9, 47, 55, 78, 83 | ✓ 2 9 47 55 78 83 |
| what you | 7, 8, 13, 24 | ✓ 7 8 13 24 |
| what you're | 24 | ✓ 24 |
| for (비강세) | 18, 52, 54, 78, 83, 90 | ✓ 18 52 54 78 83 90 |
| and (비강세) | 38, 50, 52 | ✓ 38 50 52 |
| can (긍정 조동사) | 21, 26, 61, 85, 95 | ✓ 21 26 61 85 95 |
| have to | 43, 50 | ✓ 43 50 |
| supposed to | 25, 39, 88 | ✓ 25 39 88 |
| used to | 35, 36 | ✓ 35 36 |
| going to (미래) | 48, 49 | ✓ 48 49 |
| going in (이동·거너 금지) | 63 | ✓ 63 |
| want to (동사구) | 13 | ✓ 13 |
| want me (wanna 아님) | 47 | ✓ 47 |
| gonna / wanna / gotta / kinda | 81, 82, 83, 84, 86 | ✓ 81 82 83 84 86 |
| today / tonight / tomorrow | 17, 23, 27, 60, 83 | ✓ 17 23 27 60 83 |
| your (비강세) | 12, 51 | ✓ 12 51 |
| at this | 54 | ✓ 54 |
| or (비강세) | 21, 70 | ✓ 21 70 |
| meet her | 39 | ✓ 39 |
| need to | 70, 93 | ✓ 70 93 |
| how to (3 터 · 62 러) | 3, 62 | ✓ 3 62 |
| like to / take to / back to / allergic to (k 뒤) | 60, 64, 67, 73, 77, 84 | ✓ 60 64 67 73 77 84 |
| this to / flight to / second to / anything to (무성·비음 뒤) | 4, 55, 56, 60, 76 | ✓ 4 55 56 60 76 |
| love to, (stranded) | 16 | ✓ 16 |
| mean / meaning to | 22, 31 | ✓ 22 31 |
| idea to (터) / me to (러) | 15, 47 | ✓ 15 47 |
| get to | 62 | ✓ 62 |
| 장모음 mean | 2, 5, 7, 22 | ✓ 2 5 7 22 |
| 장모음 see | 6, 12, 26, 50, 85 | ✓ 6 12 26 50 85 |
| 장모음 feel | 22, 38 | ✓ 22 38 |
| 장모음 reach | 19 | ✓ 19 |
| 장모음 need | 70, 93 | ✓ 70 93 |
| 장모음 week / leave / please / too / through / room / sooner | 41, 44, 52, 68, 71, 72, 76, 79 | ✓ 41 44 52 68 71 72 76 79 |
| that (접속사·관계사 약형) | 10, 72 | ✓ 10 72 |
| figure out | 30, 92 | ✓ 30 92 |
| left + 자음 | 59, 92 | ✓ 59 92 |
| could've | 91 | ✓ 91 |
| you (문두 주어·문말) | 18, 27, 43, 91 | ✓ 18 27 43 91 |
| you (문중 비강세 → 여·구개음화) | 1, 2, 6, 7, 8, 9, 13, 19, 22, 23, 28, 30, 31, 41, 42, 44, 47, 53, 55, 62, 65, 72, 75, 78, 79, 81, 83, 87, 91, 94, 95 | ✓ 1 2 6 7 8 9 13 19 22 23 28 30 31 41 42(보류) 44 47 53 55 62 65 72 75 78 79 81 83 87 91 94 95 |

## 부록 C — 자기 점검 결과 (§4.4)

1. 같은 표현의 문장별 표기 — 부록 B. 규칙 밖 표시 0건.
2. `to` 23곳 전부 부록 A 에 문장별 근거가 있다. 현상·근거 칸에 to 언급이 없는 문장: 없음.
3. 기본형에 연쇄 축약(FAST 형)이 들어간 문장: [81] — 81번은 감사에서 MEDIUM DEFAULT 로 수용됨(머리말 4번).
4. 기본형이 현행보다 또박또박해진 문장: 3번 `암→아임` 한 곳(머리말 5번). 그 외 없음.
5. 연음 표기로 r·v·f·z 글자가 줄어든 문장: 4: give me→기미(gimme, v 삭제); 7: give me→기미(gimme, v 삭제); 43: have to→해프터(v 가 [f] 로 무성화); 50: have to→해프터(v 가 [f] 로 무성화); 92: figure out 의 r 을 30번 현행 `f피겨라웃` 처럼 ㄹ 로 합침 — 전부 어휘 축약이나 현행 규약에 따른 의도적 변화. 장모음 겹모음(미인·씨이·니이·리이·f피일 등)은 부록 B 에서 확인.
6. 확신도 HIGH 인데 사전·교재·규약 근거를 안 적은 문장: 없음.
7. 63번 `going in`(이동) 에 거너를 적지 않았는가: 예.
8. 보류 5문장(14·26·42·52·94) 이 표기를 확정하지 않았는가: 예.
9. 문서 머리에 정의·두 축·금지 사항 요약: 있음.

이 문서는 **사람 검토용 제안**이다. 사용자가 100문장을 한 줄씩 대조해 확정/수정/변이 이동을 한 결과가 확정 gold 다.
