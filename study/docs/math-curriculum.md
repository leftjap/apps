# 수학 사고력 — 커리큘럼 정본

`study-math-content` 스킬의 1차 정본. "오늘 수학" 콘텐츠는 이 문서를 따른다.

## 목표

학교 수학 완주가 아니라 **실생활을 수학적으로 사고하는 힘** 단련. 기초(분수·%)는 따로 가르치지 않고 **해설에 녹여 환기**(FIRe). 최종 지향 = 변화율·누적(미적분 직관)으로 세상 모델링.

## 하루 구조

- 신규일: 개념 미니레슨(직관·공식최소) → 적용 1~2문제
- 적용/복습일: 적용 + SRS 2~3문제 (어려운 문제가 기초 자동 환기)
- 채점: 직접 입력 자동(mathAnswer.js). 복습: 도구 단위 1·3·7·21·60일(srs.js).

## backbone (진단이 시작점 결정 — 기초 탄탄하면 프런티어부터)

정량추론 척추 + 기하·시각 strand:

① 비율적 사고(비·%·스케일) ② %변화·복리·지수(72의 법칙) ③ 추정·자릿수(Fermi)·단위검산 ④ 확률·기댓값 ⑤ 조건부확률·베이즈 ⑥ 통계 읽기(평균vs중앙값) ⑦ 상관≠인과 ⑧ 최적화·트레이드오프 ⑨ 의사결정·공정분배 ⑩ 변화율 직관(미분 씨앗) ⑪ 누적 직관(적분 씨앗) ⑫ 모델링 종합

각 모듈 = 개념 1~2일 + 응용 며칠. 시각·기하(⑩⑪)는 SVG 도형으로.

## 해설 포맷 (모든 문제 공통 — 친절·비유·예시 필수)

| 필드 | 내용 |
|---|---|
| `core` | 핵심 한 줄(개념) |
| `idea` | 비유·"왜 이렇게 생각하나" (권장) |
| `steps` | 단계별 풀이 (배열) |
| `refresh` | 🔧 쓰인 기초 환기(분수/%/방정식) |
| `example` | 실생활 예시 (권장) |
| `think` | 사고 포인트(확장) |

## 도형(figure) 규약

- `{ type: 'dots', n, legend? }` — n×n 점 격자(ㄱ자 색칠로 홀수합=제곱 등 시각 통찰)
- `{ type: 'svg', svg: '<svg…>', legend? }` — 직접 저작한 정적 SVG(삼각형 넓이 등)
- 외부 도형 데이터셋(Geometry3K 등)은 저작권 제한 → 직접 SVG. 인터랙티브 필요 시 JSXGraph(향후).
- 순수 증명형(답이 숫자 아님)은 지양 — 자동채점은 "시각 통찰 → 숫자 답".

## 채점 규약 (mathAnswer.js)

- 정수·소수·분수("a/b")·퍼센트("n%") 동치 자동 비교.
- `accept: [...]` — 대체 표기(예: "5x5"). `range: [lo,hi]` — 추정형 허용 범위.
- 1차 오답 → 힌트(core) 후 재시도, 2차 → 정답·풀이 공개.

## 데이터 흐름 (en/ja 미러)

생성: Claude → `seeds/math-<date>.json` → `study-seed-math.yml` → `study_math_problems`(Supabase)
소비: sync.js(TABLE_MAP: mathProblems/mathQueue) → Dexie → `session-math.js`(번들 폴백 있음)

## 마이그레이션

`supabase/migrations/0005_study_math.sql` (study_math_problems + study_math_queue, RLS). Dashboard SQL Editor 적용(en/ja 관례).
