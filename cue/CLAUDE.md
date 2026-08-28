# cue — geo-apps 대시보드 (행동 트리거)

> 4앱 공통 룰은 `~/apps/CLAUDE.md` 참조. 본 파일은 cue 앱 전용.

## 목적

미루는 4가지(독서·글쓰기·어학·운동)의 도구를 **오늘 실제로 열게 만드는** 대시보드.
보조 모니터 상시 표시 + 폰. 수동 입력·체크 UI 없음 — 완료는 **각 앱 DB 결과가 되비치는 것**.

## 디자인 정본 (v9 정보 재설계, 2026-06-13)

- **정본**: `design-ref/v9/작업지시서.html` — 활동 카드 정보 재설계 명세·토큰·데이터 계약·카피 규칙. **새 디자인 발명 금지**.
- 시안: `design-ref/v9/시안/` (`app.jsx`·`styles.css`·`큐 대시보드 - 정보 재설계.html`) + `img/01~07-시안.png`. 정렬·색·카피 최종 기준.
- **v9 핵심**: 펼침 기록 3종을 **직전(최근 한 일) → 이번 주(근접목표·진행막대) → 추세(이번 달/진척)** 통일 4행 subgrid 로 정렬. 연간 누적·최장연속은 카드에서 빼고 전체 통계로 이동(페이스·8주 빈도·기록 3종). 어학 sub=SRS 복습 대기, 운동 slot1=부위 2개+★PR. 주간 목표는 운동(주 4일)만 실제값, 나머지는 "제안" 칩.
- **독서 데이터**: 전자(밀리) `book_reading_seconds`(일별 초) + 종이(리딩타임 iOS) `readingtime_daily`(일별 초, flip/manual) **일별 초 합산 후 분 반올림** (2026-07-17 병합 — 종이책 독서 미표시 버그 수정). 제목은 `book_current_reading`(밀리 제목·저자·진도%) vs `readingtime_userdata`(RTUserData JSON 마지막 세션 isbn→books 제목) 중 **더 최근에 읽은 소스** — 종이책은 진도% 없음(hook % 생략). `book_reading_books`(일별×책별 히스토리, 리딩타임 통계 귀속용 — `~/.local/bin/millie-book-sync.sh` 가 맥 밀리앱 로컬 DB 에서 15분마다 적재, 2026-06-22~/2026-07-14~). hook=「제목」 N%까지, slot3=이번 달 시간. (구 서술 "제목·진도% 미연동"은 2026-07-04 폐기 — 연동됨.) 한계: 밀리 분은 앱 화면시간 프록시 — 앱만 잠깐 포커스해도 1~2분 계상될 수 있음(2026-07-16 97초 사례).
- v8(`design-ref/v8/`)·구 버전(`design-ref/cue.html`·`cue 작업지시서.md`·`flow/`)은 이력 보관 — v9 가 활동 카드·통계를 대체(히어로는 v8 유지, 범위 밖).
- 팔레트·서체는 작업지시서 §6 전용 토큰 (`#FAF7F1`·`#D2602F` 등) — **앱 정본 토큰 사용**. 서체는 Pretendard 단일 + 숫자 `tnum`. Light only.

## 스택

Vite 6 + React 18 + vite-plugin-pwa (형제 앱은 바닐라지만 cue 는 React).
포트 dev 5178 / preview 4178 (strictPort — OAuth redirect URI 한정; pick 이 5177 점유).

## 구조

- 레이아웃(2026-07-17 재배치): App 의 `<main class="layout">` = 3 아이템 grid(`minmax(0,1fr) 296px`, gap 40) — **히어로는 전폭 행**(`grid-column:1/-1`), 그 아래 행에 활동 행(`.rows`) + 화면시간 레일(`ScreenTime`) 나란히. 효과: 레일 상단 = 독서 카드 상단(실측 0px), 타임라인 폭 292→628px(+레일296+gap40). 히어로↔행 간격은 `.layout` row-gap 40px 담당(구 `.rows` margin-top 이관). 좁은 화면(≤920px) 1단 폴백 — 레일은 행 아래, `.rows{margin-top:12px}` 로 히어로 간격 40px 원복(row-gap 28 + 12). **레일 배치·296px 폭은 design-ref 정본에 규정 없음**(v9 시안=활동 카드, v8=히어로/팔레트 한정 — grep 확인) → 이 배치는 코드가 정본.
- `src/components/` — App(조립·Gate·Tweaks·2단 레이아웃) / Hero(시계·하루 고리·타임라인) / AppRow(활동 행+월 캘린더+펼침) / StatsView(8주 통계) / ScreenTime(화면시간 레일+전체기록 모달) / icons / AccountMenu / Tweaks
- `src/data/` — adapter(`buildRealApps`: Supabase→v9 shape(직전/이번 주/추세·pace·statRecords), YTD 윈도우) / copy(모든 사용자 문장·beat 3분할 배열 — §5·§9 단일 검사 지점) / transforms(순수 수치 함수, `countRowsInWeek/Month`·`countPRs` 등) / flow(`clusterPoints`·`sweepLefts` — 타임라인 클러스터 라벨) / mock(`MOCK_APPS` 데모=v9 시안 스냅샷) / screentime(화면시간 §5 `screenTimeRows`·§6 `stackedTrend` + **실데이터 어댑터** `buildScreenTimeData`(screentime_daily→일/주/월: total=앱합·내도구=밀리앱+leftjap사이트·랭킹·추세·증감) / `SCREENTIME_DATA`=데모 목업 폴백) / useScreenTime(screentime_daily fetch·hook) / useApps / launch
- due 판정(§6): `transforms.dueOf` — 보통 시각(최근 4주 중앙값) 지난 미완료 중 가장 이른 1개

## 데이터 (실연동)

같은 Supabase 프로젝트(`tcbooffrdacfatywdzcm`) 공유. RLS owner-scoped → 로그인 사용자 데이터만.
`src/data/adapter.js` 가 4앱 지표를 fetch (윈도우 = 올해 1/1~오늘, 최소 63일):

| 활동 | 출처 테이블 | 지표 (v9 슬롯: 직전·이번 주·추세) |
|---|---|---|
| 독서 read | `book_reading_seconds` + `readingtime_daily` + `book_current_reading` + `readingtime_userdata` | 밀리+종이책 일별 초 합산→분 반올림. 제목=최근 읽은 소스(밀리 `last_read_at` vs 리딩타임 마지막 세션 `endedAt`), 종이책은 진도% 생략. 직전=「제목」 N%까지, 이번 주=활동일/제안5일, 추세=이번 달 시간 |
| 글쓰기 write | `today_entries` | 매수(200자=1매), kind 라벨(KIND_LABEL). 직전=직전 글 매수·kind·날짜, 이번 주=편수(행)/제안3편, 추세=이번 달 매수 |
| 어학 lang | `study_daily_stats` + `study_review_queue` + `study_today_lessons` | utterance·new_sentences·review_count·study_time. 직전=직전 발화·신규, sub=복습 대기(next_review≤오늘), 추세=이번 달 익힘 델타. 익힌 문장=활성 언어 큐. **실학습 신호 게이트(2026-07-04)**: `hasLearningSignal`(발화·신규·복습 >0) 행만 done·캘린더·streak·활성언어에 집계 — study 세션 탭을 열어두기만 해도 쌓이는 `study_time_sec` 단독 행(잔류 세션)이 ✔ 오탐을 만들던 버그 차단 (study 쪽 근본 수정 = `activeTimer.js` 활성 시간 누적). **활성 언어 한정**: study 는 en/ja 둘 다 매일 today_lessons 시딩 → `pickActiveLang`(실학습 행 중 최신 lang) 으로 전 study 쿼리 필터 (미학습 언어 시드 누출 차단) |
| 운동 gym | `gym_sessions` | `duration_min`·`total_volume`·`tags`(부위 2개, PARTS)·`blocks` PR. 주 4일 실제 목표, 직전=부위2+★PR, 추세=이번 달 횟수. iPhone 전용 — CTA 무동작 |
| 화면시간 | `screentime_daily` | `date`·`kind`(app/site)·`name`(앱 번들ID/도메인)·`seconds`. 내 도구(올리브)=밀리앱(`kr.co.millie.MillieShelf`)+leftjap사이트. total=앱 합(사이트는 브라우저 내부 분해). `useScreenTime`→`buildScreenTimeData`. 증감=**같은 경과 구간 비교**(이번주 월~today vs 지난주 동일·이번달 1~today vs 지난달 동일), 비교 데이터 없으면 미표시. 데모는 `SCREENTIME_DATA` 목업 |

**화면시간 데몬 (시스템, repo 밖 `~/.local/bin/`)** — **단일 폴 통합(§6, 2026-06-25)**: `chrome-site-poll.py`(30초)가 매 틱 **활성**(frontmost 앱 존재 + `HIDIdleTime`<`IDLE_MAX`=300초 + **잠금 아님**(`CGSSessionScreenIsLocked`, 2026-07-04) + **`SKIP_BUNDLES` 제외**(loginwindow·SecurityAgent·ScreenSaver — 잠금화면이 하루 300초씩 사용시간으로 계상되던 오염 수정))이면 ① frontmost 앱을 **번들 ID**로 `kind='app'` 누적, ② 그 앱이 Chrome 이면 활성 탭 도메인을 `kind='site'` 누적. **앱·사이트가 같은 틱·같은 idle 게이트에서 나오므로 site 틱 ⟹ Chrome-app 틱 → `사이트합 ≤ Chrome앱`이 구조적으로 보장**(물리적으로 사이트는 Chrome 내부). localhost·사설IP·점없는 베어 호스트는 `chrome_domain()`에서 필터(노이즈 차단). state 는 **원자적 쓰기**(`os.replace`) + 파손·부재 시 **오늘 DB 누계 재시드**(0부터 재시작한 작은 누계가 merge-duplicates upsert 로 하루 데이터를 하향 덮어쓰는 사고 방지, 2026-07-04). UI 쪽도 `screentime.js EXCLUDED_APPS` 로 같은 데니리스트를 이중 방어(과거 적재분·롤백 대비). launchd: `com.gio.chrome-site-poll`(30초)만.
- **구 이원 측정 폐기**: 종전엔 앱=knowledgeC(`/app/usage` ∩ `isBacklit`, `IDLE_CAP=300` record 캡) + 사이트=폴 → **두 idle 모델 불일치**로 '사이트 > Chrome'(물리 불가) 발생. 진단: ① IDLE_CAP 이 긴 능동 Chrome 과소(06-24) ② 폴 flat-30초-틱 과대(06-23). 단일 폴이 양쪽을 한 틱에서 동률로 만들어 구조 해소. `app-usage-sync.py`(+`.sh`·`com.gio.app-usage-sync.plist`)는 **은퇴**(plist→`.disabled`, 롤백용 보존). knowledgeC 캡 휴리스틱·`IDLE_CAP`·`TRACKING_START` 더는 안 씀.
- **한계·메모**: 30초 틱 granularity(짧은 앱전환 누락 가능), `IDLE_MAX=300`은 무입력 5분까지 활성 인정(영상 보호, 짧은 자리비움 과대 가능 — 단 앱·사이트 동일 적용이라 코히어런스 불변). Chrome-frontmost-window 의 active tab 만 사이트로 잡음(타 브라우저·비전면 창 미포함). 추적 06-22 시작이라 데이터<1주일이면 주==월(정상 — 누적되며 분기). 과거 06-22~24 는 단일 폴 이전이라 1회 레거시 정합(노이즈 사이트 삭제 + 그날 Chrome 을 사이트합으로 플로어)으로 코히어런스 맞춤.
- **자동화 Chrome 트윈 방어 (2026-07-17)**: chrome-devtools MCP 디버그 Chrome(동일 번들, 포트 9333)이 상주하면 AppleScript 가 그 인스턴스에 응답해 사이트 귀속이 디버그 탭으로 붕괴(7/14~17 leftjap.github.io 오염 — site 행 4개 삭제 정정). 데몬이 ① frontmost pid 커맨드라인(`--remote-debugging-port`/`--user-data-dir`)으로 자동화 Chrome 틱 전체 스킵 ② osascript 응답 URL 을 CDP `/json/list` 탭 집합과 대조해 오귀속 site 틱 폐기. 한계·상세: `~/apps/lessons/chrome-debug-twin-screentime-pollution.md` — **검증 세션 후 디버그 Chrome 종료 권장**(상주 중 실 Chrome site 틱 결측 가능).

`src/data/transforms.js`·`copy.js` = 순수 함수 — 단위 테스트 대상 (`pnpm vitest run`).
데모 모드(Tweaks, localStorage 키 `cue.tweaks.v8`)는 `mock.js` 시안 목업 사용 — due 는 데모에서도 실제 `dueOf` 가 시각으로 판정.
로컬 실데이터 검증: `scripts/sanity-real-data.mjs` (4활동 adapter 출력 덤프·육안) / `scripts/audit-faithfulness.mjs` (4활동 adapter vs raw 1:1 PASS/FAIL — 어학 재계산도 실학습 신호 게이트 적용) / `scripts/audit-screentime.mjs` (화면시간 adapter vs raw — total·tool·증감·추세·랭킹 전수 충실성 PASS/FAIL **게이트** + **DB 위생 게이트**(데니리스트 행 존재 시 FAIL — 데몬 SKIP_BUNDLES 회귀 감지) + 사이트합≤Chrome앱·도구≤전체 코히어런스 **경고**) / `scripts/audit-study-hygiene.mjs` (study_daily_stats 팬텀(신호0·1h+)·폭주(6h+)·증거결핍(2h+인데 발음로그<3) 행 감지, `--self-test` 로 판정 로직 자가검증). 전부 service-role, 주석의 실행법 참조. ("보이는 값이 팩트인가" 증명 — audit-faithfulness 는 화면시간 미커버라 audit-screentime 가 그 공백을 메움.)

**유튜브 게이트 — 은퇴 (2026-08-28, 사용자 결정)**: 유튜브 진입 시 마찰 카드를 띄우던 2단 구조(`com.gio.cue.youtube-gate` 감지 + `com.gio.cue.popup` 표시)를 껐다. 두 LaunchAgent 는 `.plist.disabled` 로 재워둠 → launchd 미로드·프로세스 0. **소스는 보존**(`tools/` 의 youtube-gate-native.sh·youtube-cue-gate.user.js·youtube-gate-card.html·cue-popup.swift·due-now.mjs·CuePopup.app) — 실행 경로만 끊겼을 뿐 파일은 멀쩡하니 "왜 안 도나" 디버깅 금지. 되살리려면 두 plist 의 `.disabled` 만 떼면 된다. 되살릴 때 주의: `due-now.mjs`·유저스크립트의 독서 완료 판정이 `Math.round(초/60)>0` = **30초 기준**이라 리딩타임의 60초 기준과 어긋난다(밀리 30초만 띄워도 '오늘 독서 완료'). 

**구조적 재발 방지 (2026-07-04)**: ① 배포 게이트 — `deploy-pages.yml` 이 today 에 더해 **study·cue vitest 실패 시 전체 배포 차단**. ② 데이터 센티널 — `.github/workflows/data-sentinel.yml` 이 매일 07:30 KST 에 audit-study-hygiene(+self-test)·audit-screentime·audit-faithfulness 를 CI 에서 실행, FAIL 시 워크플로 실패 → GitHub 알림 메일. 오염이 재발하면 하루 안에 자동 검출되는 구조.
