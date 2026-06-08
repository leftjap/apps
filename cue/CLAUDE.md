# cue — geo-apps 런처 (행동 트리거 대시보드)

> 4앱 공통 룰은 `~/apps/CLAUDE.md` 참조. 본 파일은 cue 앱 전용.

## 목적

미루는 4가지(어학·운동·글쓰기·독서)를 **시작하게(launch) 만드는** glanceable 대시보드.
보조 모니터 상시 표시 + 폰. 각 카드 = 해당 앱으로 들어가는 "문". 완료는 cue 에서 찍는 게 아니라
**각 앱 DB 결과가 되비치는 것**.

## 디자인 정본

- 시안: `design-ref/cue.html`(오프라인 단일본, 폰트 내장) + `design-ref/런처.html`(편집용).
- 작업지시서: `design-ref/cue 작업지시서.md` — 디자인 토큰·레이아웃·모션의 정본. **새 디자인 발명 금지**.
- 공통 디자인 시스템: `~/apps/DESIGN.md`. cue 는 mono 를 **Lekton** 로 override
  (0 안에 점·슬래시 전혀 없는 빈 glyph — Spline/JetBrains/IBM=점, Inconsolata/Roboto/PT=슬래시라 제외). Light only.

## 스택

Vite 6 + React 18 + vite-plugin-pwa (형제 앱은 바닐라지만 cue 는 시안이 React 라 React 유지).
포트 dev 5178 / preview 4178 (strictPort — OAuth redirect URI 한정; taste 가 5177 점유).

## 데이터 (실연동)

같은 Supabase 프로젝트(`tcbooffrdacfatywdzcm`) 공유. RLS owner-scoped → 로그인 사용자 데이터만.
`src/data/adapter.js` 가 4앱 지표를 fetch:

| 습관 | 출처 테이블 | 지표 |
|---|---|---|
| 어학 study | `study_daily_stats` | `utterance_count` 합/일 (문장 수) |
| 글쓰기 today | `today_entries` | `content` 글자수 → 매수(200자=1매), WRITING_KINDS only |
| 운동 gym | `gym_sessions` | `duration_min`/`total_volume`, status=completed, 이번주 회수 + active 라이브 타이머 |
| 독서 book | `book_reading_seconds` | `seconds`/60 (분). 외부 millie-tracker 가 채움 |

`src/data/transforms.js` = 순수 함수(streak/level/매수/일별 버킷) — 단위 테스트 대상.
데모 모드(Tweaks)는 `src/data/mock.js` 시안 목업 사용.
