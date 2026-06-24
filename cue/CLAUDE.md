# cue — geo-apps 대시보드 (행동 트리거)

> 4앱 공통 룰은 `~/apps/CLAUDE.md` 참조. 본 파일은 cue 앱 전용.

## 목적

미루는 4가지(독서·글쓰기·어학·운동)의 도구를 **오늘 실제로 열게 만드는** 대시보드.
보조 모니터 상시 표시 + 폰. 수동 입력·체크 UI 없음 — 완료는 **각 앱 DB 결과가 되비치는 것**.

## 디자인 정본 (v9 정보 재설계, 2026-06-13)

- **정본**: `design-ref/v9/작업지시서.html` — 활동 카드 정보 재설계 명세·토큰·데이터 계약·카피 규칙. **새 디자인 발명 금지**.
- 시안: `design-ref/v9/시안/` (`app.jsx`·`styles.css`·`큐 대시보드 - 정보 재설계.html`) + `img/01~07-시안.png`. 정렬·색·카피 최종 기준.
- **v9 핵심**: 펼침 기록 3종을 **직전(최근 한 일) → 이번 주(근접목표·진행막대) → 추세(이번 달/진척)** 통일 4행 subgrid 로 정렬. 연간 누적·최장연속은 카드에서 빼고 전체 통계로 이동(페이스·8주 빈도·기록 3종). 어학 sub=SRS 복습 대기, 운동 slot1=부위 2개+★PR. 주간 목표는 운동(주 4일)만 실제값, 나머지는 "제안" 칩.
- **독서 데이터 편차**: book Supabase 엔 `book_reading_seconds`(일별 분)만 있고 제목·진도% 미연동(밀리는 read_percent 동기화 안 함). 그래서 독서 hook=직전 읽은 시점, slot3=이번 달 시간으로 실데이터 대체(시안의 제목/진도%는 미사용 — 가짜 발명 금지).
- v8(`design-ref/v8/`)·구 버전(`design-ref/cue.html`·`cue 작업지시서.md`·`flow/`)은 이력 보관 — v9 가 활동 카드·통계를 대체(히어로는 v8 유지, 범위 밖).
- 팔레트·서체는 작업지시서 §6 전용 토큰 (`#FAF7F1`·`#D2602F` 등) — **앱 정본 토큰 사용**. 서체는 Pretendard 단일 + 숫자 `tnum`. Light only.

## 스택

Vite 6 + React 18 + vite-plugin-pwa (형제 앱은 바닐라지만 cue 는 React).
포트 dev 5178 / preview 4178 (strictPort — OAuth redirect URI 한정; pick 이 5177 점유).

## 구조

- 레이아웃: App 의 `.layout`(2단 grid `minmax(0,1fr) 296px`) = 메인(Hero+활동행) + 화면시간 레일(`ScreenTime`). 좁은 화면은 1단 폴백.
- `src/components/` — App(조립·Gate·Tweaks·2단 레이아웃) / Hero(시계·하루 고리·타임라인) / AppRow(활동 행+월 캘린더+펼침) / StatsView(8주 통계) / ScreenTime(화면시간 레일+전체기록 모달) / icons / AccountMenu / Tweaks
- `src/data/` — adapter(`buildRealApps`: Supabase→v9 shape(직전/이번 주/추세·pace·statRecords), YTD 윈도우) / copy(모든 사용자 문장·beat 3분할 배열 — §5·§9 단일 검사 지점) / transforms(순수 수치 함수, `countRowsInWeek/Month`·`countPRs` 등) / flow(`clusterPoints`·`sweepLefts` — 타임라인 클러스터 라벨) / mock(`MOCK_APPS` 데모=v9 시안 스냅샷) / screentime(화면시간 §5 `screenTimeRows`·§6 `stackedTrend` + **실데이터 어댑터** `buildScreenTimeData`(screentime_daily→일/주/월: total=앱합·내도구=밀리앱+leftjap사이트·랭킹·추세·증감) / `SCREENTIME_DATA`=데모 목업 폴백) / useScreenTime(screentime_daily fetch·hook) / useApps / launch
- due 판정(§6): `transforms.dueOf` — 보통 시각(최근 4주 중앙값) 지난 미완료 중 가장 이른 1개

## 데이터 (실연동)

같은 Supabase 프로젝트(`tcbooffrdacfatywdzcm`) 공유. RLS owner-scoped → 로그인 사용자 데이터만.
`src/data/adapter.js` 가 4앱 지표를 fetch (윈도우 = 올해 1/1~오늘, 최소 63일):

| 활동 | 출처 테이블 | 지표 (v9 슬롯: 직전·이번 주·추세) |
|---|---|---|
| 독서 read | `book_reading_seconds` | `seconds`/60 (분). 제목·진도% 미연동 → 직전=직전 읽은 분·시점, 이번 주=활동일/제안5일, 추세=이번 달 시간 |
| 글쓰기 write | `today_entries` | 매수(200자=1매), kind 라벨(KIND_LABEL). 직전=직전 글 매수·kind·날짜, 이번 주=편수(행)/제안3편, 추세=이번 달 매수 |
| 어학 lang | `study_daily_stats` + `study_review_queue` + `study_today_lessons` | utterance·new_sentences·study_time. 직전=직전 발화·신규, sub=복습 대기(next_review≤오늘), 추세=이번 달 익힘 델타. 익힌 문장=활성 언어 큐. **활성 언어 한정**: study 는 en/ja 둘 다 매일 today_lessons 시딩하나 daily_stats 는 실제 학습만 기록 → `pickActiveLang`(최신 daily_stats lang) 으로 전 study 쿼리 필터 (미학습 언어 시드 누출 차단) |
| 운동 gym | `gym_sessions` | `duration_min`·`total_volume`·`tags`(부위 2개, PARTS)·`blocks` PR. 주 4일 실제 목표, 직전=부위2+★PR, 추세=이번 달 횟수. iPhone 전용 — CTA 무동작 |
| 화면시간 | `screentime_daily` | `date`·`kind`(app/site)·`name`(앱 번들ID/도메인)·`seconds`. 내 도구(올리브)=밀리앱(`kr.co.millie.MillieShelf`)+leftjap사이트. total=앱 합(사이트는 브라우저 내부 분해). `useScreenTime`→`buildScreenTimeData`. 증감=**같은 경과 구간 비교**(이번주 월~today vs 지난주 동일·이번달 1~today vs 지난달 동일), 비교 데이터 없으면 미표시. 데모는 `SCREENTIME_DATA` 목업 |

**화면시간 데몬 (시스템, repo 밖 `~/.local/bin/`)**: `app-usage-sync.py`(앱=macOS knowledgeC `/app/usage` **∩ `/display/isBacklit`(화면 켜짐)** — knowledgeC 는 화면 OFF/자리비움 중에도 앱을 '사용중'으로 기록해 과대(예 06-19 raw 691분→교정 253분), 화면켜짐 교차로 제거. `APP_SYNC_DAYS` env=윈도우, 기본 3) + `chrome-site-poll.py`(사이트=30초 폴링, Chrome 최전면+idle<5분) + `.sh` 래퍼(launchd 호출). launchd: `com.gio.app-usage-sync`(900초)·`com.gio.chrome-site-poll`(30초).

`src/data/transforms.js`·`copy.js` = 순수 함수 — 단위 테스트 대상 (`pnpm vitest run`).
데모 모드(Tweaks, localStorage 키 `cue.tweaks.v8`)는 `mock.js` 시안 목업 사용 — due 는 데모에서도 실제 `dueOf` 가 시각으로 판정.
로컬 실데이터 검증: `scripts/sanity-real-data.mjs` (adapter 출력 덤프·육안) / `scripts/audit-faithfulness.mjs` (adapter vs raw 1:1 PASS/FAIL — "보이는 값이 팩트인가" 증명). 둘 다 service-role, 주석의 실행법 참조.
