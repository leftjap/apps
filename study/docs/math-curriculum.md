# 수학 사고력 — 커리큘럼 정본 (기하 중심)

`study-math-content` 스킬의 1차 정본. "오늘 수학" 콘텐츠는 이 문서를 따른다.

## 목표

학교 수학 완주가 아니라 **기하·시각으로 세상을 보는 힘** 단련. 도형·넓이·변화를 "보고 깨닫는" 경험 → 종착점은 **넓이(적분)·변화율(미분) 직관**. 기초(분수·곱셈·제곱·%)는 따로 안 가르치고 **해설에 녹여 환기**(refresh). 모델은 Lockhart 『Measurement』 + 3Blue1Brown 시각 추론.

## 하루 구조

- 신규일: 시각 통찰 미니레슨(공식 최소) → 적용 1~2문제
- 적용/복습일: 적용 + SRS 2~3문제 (어려운 문제가 기초 자동 환기)
- 채점: 직접 입력 자동(mathAnswer.js). 복습: 1·3·7·21·60일 간격(srs.js).
- 답은 **숫자**로 떨어지게(시각 통찰 → 수). 순수 증명형(답이 숫자 아님)은 지양.

## backbone (기하 척추 — 통찰 → 넓이 → 미적분 직관)

1. **모양으로 세기 (figurate)** — 홀수합=정사각형, 삼각수 1+2+…+n, 점 격자 곱. *수를 모양으로.*
2. **넓이는 변형** — 삼각형=직사각형 절반, 평행사변형=직사각형, 사다리꼴=평균×높이. *모르는 모양을 아는 모양으로.*
3. **피타고라스** — 직각삼각형 세 변, 정사각형 넓이 분해 시각증명.
4. **닮음·스케일** — 닮은 도형 길이비 k → 넓이비 k². 그림자·축소.
5. **원** — 원을 잘게 부채꼴로 펴면 직사각형 → 넓이 πr² 직관, 둘레 2πr.
6. **곡선 아래 넓이 (적분 씨앗)** — 계단으로 근사 → 넓이. 누적이 넓이가 된다.
7. **변화율 (미분 씨앗)** — 기울기·접선, 넓이가 자라는 속도.

각 모듈 = 통찰 1~2일 + 적용 며칠. ①②③은 우선 구현(m1/m2/m3), ④⑤는 m3 후반·확장, ⑥⑦은 각 문제 `think` 필드에 씨앗으로 깔고 후속 모듈로.

## 데이터 모듈 (src/data/math/)

- `m1-counting.js` — 모양으로 세기(figurate). dots figure 활용.
- `m2-visual.js` — 넓이는 변형(삼각형·평행사변형·사다리꼴). SVG figure.
- `m3-shapes.js` — 피타고라스·닮음·원→πr². SVG figure.
- `index.js` — `MATH_CONTENT = [...m1, ...m2, ...m3]` (학습 순서).

## 해설 포맷 (모든 문제 공통 — 친절·비유·예시 필수, 이모지 금지)

| 필드 | 내용 |
|---|---|
| `core` | 핵심 한 줄(개념) |
| `idea` | 비유·"왜 이렇게 보나" (권장) |
| `steps` | 단계별 풀이 (배열) |
| `refresh` | 쓰인 기초 환기(분수/곱셈/제곱/%) |
| `example` | 실생활 예시 (권장) |
| `think` | 사고 포인트·확장(미적분 씨앗 등) |

UI 매핑: 이 6필드는 session.css의 `.ex-section`/`.ex-label`/`.ex-text`/`.grammar-block` 클래스로 렌더(언어 explanation 패널과 동일 디자인). 별도 CSS 금지.

## 도형(figure) 규약

- `{ type: 'dots', n, legend? }` — n×n 점 격자(ㄱ자 색칠로 홀수합=제곱 등 시각 통찰).
- `{ type: 'svg', svg: '<svg…>', legend? }` — 직접 저작한 정적 SVG. 색은 tokens.css 톤(직접 hex 최소화, stroke/fill은 도형 가독 목적 한정).
- 외부 도형 데이터셋(Geometry3K 등)은 저작권 제한 → 직접 SVG. 인터랙티브 필요 시 JSXGraph(향후).

## 채점 규약 (mathAnswer.js)

- 정수·소수·분수("a/b")·퍼센트("n%") 동치 자동 비교.
- `accept: [...]` — 대체 표기(예: "5x5"). `range: [lo,hi]` — π 근사·추정형 허용 범위(예: 원 넓이).
- 1차 오답 → 힌트(core) 후 재시도, 2차 → 정답·풀이 공개.

## 데이터 흐름 (en/ja 미러)

생성: Claude → `seeds/math-<date>.json` → `study-seed-math.yml`(또는 `node scripts/seed-math.mjs`) → `study_math_problems`(Supabase)
소비: sync.js(TABLE_MAP: mathProblems/mathQueue) → Dexie → `session-math.js`(번들 폴백 `MATH_CONTENT` 있음 — 시드 전에도 동작)

## 마이그레이션 (실측 정본)

`supabase/migrations/0005_study_math.sql` (study_math_problems + study_math_queue, RLS). 적용:
`cd ~/apps/study && supabase db query --linked --yes --file supabase/migrations/0005_study_math.sql`
(`supabase` CLI keychain 인증·링크됨. PostgREST/service key로는 DDL 불가 — CLI 사용.)
