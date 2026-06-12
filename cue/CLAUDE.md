# cue — geo-apps 대시보드 (행동 트리거)

> 4앱 공통 룰은 `~/apps/CLAUDE.md` 참조. 본 파일은 cue 앱 전용.

## 목적

미루는 4가지(독서·글쓰기·어학·운동)의 도구를 **오늘 실제로 열게 만드는** 대시보드.
보조 모니터 상시 표시 + 폰. 수동 입력·체크 UI 없음 — 완료는 **각 앱 DB 결과가 되비치는 것**.

## 디자인 정본 (v8, 2026-06-12 전면 교체)

- **정본**: `design-ref/v8/작업지시서.html` — 화면 명세·토큰·애니메이션·데이터 계약·카피 규칙. **새 디자인 발명 금지**.
- 시안: `design-ref/v8/시안-소스/` (동작 단일본 `큐 대시보드 v8.html`) + `img/01~05-시안.png`.
- 구 버전(`design-ref/cue.html`·`cue 작업지시서.md`·`flow/`)은 이력 보관 — v8 이 전부 대체.
- 팔레트·서체는 v8 작업지시서 §4 전용 토큰 (`#FAF7F1`·`#D2602F` 등) — `~/apps/DESIGN.md` 일반 토큰 대신 **앱 정본 우선**. 서체는 Pretendard 단일 + 숫자 `tnum` (구 Lekton mono 폐지). Light only.

## 스택

Vite 6 + React 18 + vite-plugin-pwa (형제 앱은 바닐라지만 cue 는 React).
포트 dev 5178 / preview 4178 (strictPort — OAuth redirect URI 한정; pick 이 5177 점유).

## 구조

- `src/components/` — App(조립·Gate·Tweaks) / Hero(시계·하루 고리·타임라인) / AppRow(활동 행+월 캘린더+펼침) / StatsView(8주 통계) / icons / AccountMenu / Tweaks
- `src/data/` — adapter(`buildRealApps`: Supabase→v8 shape, YTD 윈도우) / copy(모든 사용자 문장 — §9 단일 검사 지점) / transforms(순수 수치 함수) / flow(staggerLane) / mock(`MOCK_APPS` 데모) / useApps / launch
- due 판정(§6): `transforms.dueOf` — 보통 시각(최근 4주 중앙값) 지난 미완료 중 가장 이른 1개

## 데이터 (실연동)

같은 Supabase 프로젝트(`tcbooffrdacfatywdzcm`) 공유. RLS owner-scoped → 로그인 사용자 데이터만.
`src/data/adapter.js` 가 4앱 지표를 fetch (윈도우 = 올해 1/1~오늘, 최소 63일):

| 활동 | 출처 테이블 | 지표 |
|---|---|---|
| 독서 read | `book_reading_seconds` | `seconds`/60 (분). 외부 millie-tracker 가 채움 — 시각 없음 |
| 글쓰기 write | `today_entries` | `content` 글자수→매수(200자=1매), WRITING_KINDS. hook=마지막 문서 `title` |
| 어학 lang | `study_daily_stats` + `study_today_lessons` | `study_time_sec`/60 (분). hook=마지막 학습일 이전 최신 `explanation->>'sceneTitle'` |
| 운동 gym | `gym_sessions` | `duration_min`, status=completed. 주 4일 목표, 부위=`tags[0]`. iPhone 전용 — CTA 무동작 |

`src/data/transforms.js`·`copy.js` = 순수 함수 — 단위 테스트 대상 (`pnpm vitest run`).
데모 모드(Tweaks, localStorage 키 `cue.tweaks.v8`)는 `mock.js` 시안 목업 사용 — due 는 데모에서도 실제 `dueOf` 가 시각으로 판정.
로컬 실데이터 검증: `scripts/sanity-real-data.mjs` (service-role, 주석의 실행법 참조).
