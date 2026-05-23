# 수학 사고력 — 커리큘럼 정본 (기하 중심)

`study-math-content` 스킬의 1차 정본. "오늘 수학" 콘텐츠는 이 문서를 따른다.

## 목표

학교 수학 완주가 아니라 **기하·시각으로 세상을 보는 힘** 단련. 도형·넓이·변화를 "보고 깨닫는" 경험 → 종착점은 **넓이(적분)·변화율(미분) 직관**. 기초(분수·곱셈·제곱·%)는 따로 안 가르치고 **해설에 녹여 환기**(refresh). 모델은 Lockhart 『Measurement』 + 3Blue1Brown 시각 추론.

## 학습 설계 근거 (검색 2026-05)

- **개념 → 절차** (NCTM·ST Math): 개념 이해가 절차에 선행·병행해야 절차가 견고·유연. 시각(개념) 먼저.
- **Variation Theory**: 개념 설명 → worked example → **변형 응용**. "한 번에 하나만 변경"해야 핵심 원리 추출. 전이는 의도적 설계 없이는 안 일어남.
- **Productive Failure** (Kapur): 탐구·추측 먼저 → 설명하면 개념이해·전이 우수.
- **금지**: 개념 학습 없는 단순 공식 대입 단답 반복(위 근거 모두 미달).

## 하루 구조

- 신규일: **개념 카드 1개**(시각 통찰 미니레슨, 채점 없음) → **변형 응용 2~3문제**(그 개념 적용·전이).
- 적용/복습일: 응용 + SRS 2~3문제 (어려운 문제가 기초 자동 환기).
- 채점: 응용만 직접 입력 자동(mathAnswer.js). 복습: 응용만, 2·7·30·90일 간격(개념 숙달형).
- 답은 **숫자**로 떨어지게(시각 통찰 → 수). 순수 증명형(답 숫자 아님) 지양.

## 카드 2종 (concept / apply) — 데이터 모델

한 개념을 `conceptId`로 묶음. 순서: **개념 → 그 응용 2개 → 다음 개념**. SRS 복습은 apply 만(개념은 신규일마다 학습).

**개념 카드** (`kind:'concept'`, 채점 없음 — "다음"):
```
{ id, module, conceptId, kind:'concept', tag, title,
  figure?: {type,…}, body: ['원리 단락…'], worked: { prompt, steps:['…'] } }
```
**응용 문제** (`kind:'apply'`, 입력 채점):
```
{ id, module, conceptId, kind:'apply', tag, figure?, prompt,
  answer, accept?, range?, solution: {core,idea,steps,refresh,example,think} }
```

## 응용 설계 (Variation — 한 번에 하나만 변경)

개념당 응용 2~3: ① **동형**(수치만 변경 — 적용 확인) ② **전이**(표면 변형 — 진짜 이해. 예: 삼각형 배운 뒤 "평행사변형을 대각선으로 자른 삼각형"). 한 번에 한 요소만 바꿔 핵심 원리를 드러낸다.

## backbone (기하 척추 — 통찰 → 넓이 → 미적분 직관)

1. **모양으로 세기 (figurate)** — 홀수합=정사각형, 삼각수 1+2+…+n. *수를 모양으로.*
2. **넓이는 변형** — 삼각형=직사각형 절반, 평행사변형=직사각형, 사다리꼴=평균×높이. *모르는 모양을 아는 모양으로.*
3. **피타고라스** — 직각삼각형 세 변, 정사각형 넓이 분해 시각증명.
4. **닮음·스케일** — 길이비 k → 넓이비 k².
5. **원** — 부채꼴로 펴면 직사각형 → πr² 직관.
6. **곡선 아래 넓이 (적분 씨앗)** · 7. **변화율 (미분 씨앗)** — 각 응용 `think` 필드 + 후속 모듈.

각 모듈 = 개념 카드 1~2개 + 모듈당 응용 며칠치. ①②③ 우선 구현(m1/m2/m3).

## 데이터 모듈 (src/data/math/)

- `m1-counting.js`·`m2-visual.js`·`m3-shapes.js` — 각 [개념 카드 + 응용]. `index.js` = `MATH_CONTENT = [...m1, ...m2, ...m3]`.

## 도형(figure) 규약

- `{type:'dots', n, legend?}` — n×n 점 격자. `{type:'svg', svg, legend?}` — 직접 저작 정적 SVG. **SVG 좌표 비율 = 라벨 수치 비율**(일관 단위 — node 파싱 검증). 색은 tokens 톤, hex 최소.
- 외부 도형 데이터셋(저작권) 금지 → 직접 SVG.

## 채점 규약 (mathAnswer.js)

- 정수·소수·분수·% 동치 자동. `accept:[…]` 대체표기, `range:[lo,hi]` π·추정 허용. 1차 오답 → 힌트(core) → 2차 정답·해설.
- UI: 해설 6필드는 session.css `.ex-section`/`.explain-toggle`(언어 패널과 동일, 입력칸 아래 접힘). 별도 CSS 금지.

## 데이터 흐름 · 마이그레이션

생성: Claude → `seeds/math-<date>.json` → `seed-math.mjs`(또는 `study-seed-math.yml`) → `study_math_problems`(Supabase). 소비: sync.js → Dexie(schema v3) → `session-math.js`(번들 폴백 `MATH_CONTENT`).
마이그: `cd ~/apps/study && supabase db query --linked --yes --file supabase/migrations/0005_study_math.sql` (CLI keychain 인증·링크됨).
