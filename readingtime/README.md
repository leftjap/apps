# 리딩타임 (ReadingTime)

네이티브 iOS 독서 타이머. 개인용, 앱스토어 미등록(무료 서명 사이드로드). 타깃 iPhone 17 / iOS 17+.

## 무엇
- **엎어놓기(flip) 자동 감지**: 폰을 face-down으로 두면 타이머 시작, 집으면 정지. 잠금 상태에서도 유지(목표).
- **수동 버튼**: 지하철·버스·기차·기내 등 엎을 수 없을 때 버튼으로 시작/정지.
- **책 검색·등록**: 알라딘 API — Book 앱 Edge Function 프록시 재사용(`ReadingTimeKit/BookSearch.swift`). 요청 20초 제한 + 시트 13 에 검색 중·실패(다시 시도)·0건 표시 — 2026-09-10 상류(알라딘) 무응답 장애를 앱이 `try?` 로 삼켜 "검색 자체가 안 됨"으로 보였다(`~/apps/lessons/aladin-proxy-upstream-hang.md`).
- **통합 기록**: 밀리의서재(PC) 독서 시간은 Book/Cue가 이미 수집 중 → 이 앱 기록과 통합(방식 조사·계획 중).

## 상태 (3단계: iOS 앱)
- 웹 프로토타입 `prototype/`(v8 14화면) = 픽셀 정본 — 스펙 기계 대조 0건.
- **SwiftUI 이식 완료**: 14화면 픽셀 좌표 검증 + `RTAppModel` 상태머신(인터랙션 정본 `prototype/app.js`) + 모션 카탈로그(`MOTION.md` 이식) + macOS 데모 셸 `rtapp`.
- **iOS 앱 타깃 완료**: `ReadingTime.xcodeproj` — 기기 SDK·시뮬레이터 빌드 통과, iPhone 16e 시뮬레이터 실행·라이브 타이머·위치 권한 흐름 검증. **실기기 flip 검증만 남음**(`SETUP.md`).

## 파일
| 파일 | 역할 |
|---|---|
| `prototype/` | 웹 프로토타입 = 픽셀 정본 (+`_compare.html` 스펙 대조 하네스) |
| `design-ref/v3/` | v8 시안 정본 (SCREENS·MOTION + mockups/frames) |
| `design-ref/design_handoff_record_stats/` | **기록 화면(주·월·지도) 시안 정본** — README(작업지시서) + 동작 목업 `mockups/RTRecord.dc.html` + `screens/` |
| `.oracle/` + `scripts/record-verify.sh` | 기록 화면 픽셀 오라클(목업 Chrome 렌더) + rtshot 대조 파이프라인 |
| `ReadingTime.xcodeproj` | iOS 앱 프로젝트 (target ReadingTime, iOS 17+, 폴더 동기화) |
| `ReadingTime/` | 앱 소스 — `ReadingTimeApp.swift`(진입+배선)·`FlipEngine.swift`(엎기 감지+wall-clock)·`KeepAlive.swift`(잠금 유지)·`Info.plist` |
| `ReadingTimeKit/` | SPM 패키지 — 아래 타깃 4개. macOS 빌드+테스트 검증(`./test.sh`) |
| ├ `ReadingTimeKit` | 로직 — `CloudStore.swift`(Supabase)·`Config.swift`·`BookSearch.swift`(알라딘) |
| ├ `RTViews` | SwiftUI 15화면 + `RTAppModel`(상태머신)·`RTRootView`(라우트+시트)·`RTMotion`(키프레임 카탈로그)·`RTRecordData`(기록 엔진: 투영·클러스터·집계) |
| ├ `rtshot` | 헤드리스 렌더 CLI — `rtshot <NN> out.png` / `rtshot --app <NN>`(라우팅 오라클) / `rtshot --seq <액션들>` |
| └ `rtapp` | macOS 데모 셸(390×844 창, 모션 on, 알라딘 라이브 검색) — `rtapp --verify-search <q>` |
| `SETUP.md` | 실기기 배포·검증 절차 |
| `../.github/workflows/readingtime-ios.yml` | **CI 검증**(macOS 러너): `swift test` + iPhone 시뮬레이터 XCUITest(책 추가 검색 상태). 클라우드 Claude 세션(리눅스)의 시뮬레이터 대체 경로 — 스크린샷은 아티팩트 + 로그 base64 |
| `scripts/resign-reinstall.sh` | 무료팀 7일 재서명·재설치 — 공용 코어 `~/apps/scripts/resign-verify.sh` 위임. launchd `com.leftjap.readingtime.resign` 매일 21:30. 잔여 <4일 시 **캐시 프로파일 purge + clean 재빌드로 새 프로파일 강제 발급**(자유팀은 만료 전엔 갱신 안 됨) → **embedded 만료일 사후 검증**(조용한 실패 방지) → 두 기기(지오 11 Pro·소연 XR) 설치. 갱신 실패 시 macOS 알림. 로그 `~/Library/Logs/readingtime-resign.log` |

## 기록 화면 (주 · 월 · 지도)
- 시안 정본 = `design-ref/design_handoff_record_stats/`. 화면 = `Screen10Stats`(주) / `Screen11Month`(월) / `Screen15Map`(지도) + `RecordSheets`(장소 시트·책 상세). 로직·데이터는 전부 `RTRecordData.swift`(순수 엔진 + §12 데모 데이터).
- **지도**: **MapKit**(SwiftUI `Map`, iOS 17+) 실제 지도 타일 위에 폴라로이드 핀/클러스터/배지/시트를 얹는다(작업지시서 §0·§5.1·§14 — 지형은 fidelity 예외 = 실제 지도 SDK). 팬·줌은 MapKit이 담당하고, 클러스터링(화면거리 52px 체인)은 MapKit 카메라의 `MKMapPoint` 투영으로 화면좌표를 구해 동일 규칙 적용. 탭: 클러스터 → 카메라 줌 투 핏 / 단일 → openTarget(1권 책상세 · N권 시트). **헤드리스(rtshot)** 는 MapKit 타일을 렌더 못 하므로 픽셀 오라클 검증용으로만 목업 플레이스홀더(등장방형 `RTMapWorld`)를 유지(`rtHeadless` 분기).
- **읽은 위치**: `RTSessionRecord` 에 `latitude/longitude/placeId/placeName/country`(옵셔널 → 기존 기록 하위호환). 세션은 `readingtime_userdata.data` 의 JSON 스냅샷이라 **SQL 마이그레이션 불필요**. 위치 획득(CoreLocation) 시점은 미확정(§16) → 실데이터에 `placeId` 가 붙기 전까진 지도가 시안 데모 데이터를 렌더한다.
- 검증: `scripts/record-verify.sh <out>` — rtshot 렌더 vs 목업 오라클 픽셀 대조(`.oracle/README.md`).

## 데이터·통합 (결정됨)
- **종이책(엎어놓기/수동)** = 리딩타임 전용 테이블 `readingtime_daily`(공유 Supabase, source flip/manual). 마이그: `supabase/migrations/0001_readingtime_daily.sql`.
- **전자책(밀리)** = 기존 `book_reading_seconds`(source='millie-*') **그대로, 읽기 전용**으로 가져옴. 밀리 파이프라인·Book '밀리 독서시간' 카드 무손상.
- **통합은 표시 계층에서만** — 리딩타임 대시보드가 두 테이블을 읽어 `종이 + 전자` 구분 표시. 두 데이터를 DB에서 섞지 않음(종이책이 '밀리'로 오라벨되는 것 방지).
- 인증: Supabase Swift SDK + anon + Google OAuth(지오 계정) → RLS owner-only 충족. service_role 앱 번들 금지. 날짜=KST 실발생일.

### 밀리 수집 정확도 (2026-08-28 감사·수정)
수집 데몬 = `~/.local/bin/millie-sync.sh`(시간) + `millie-book-sync.sh`(책), launchd 15분. **repo 밖**.
- **시간 출처** = 맥 스크린타임 `knowledgeC.db` `/app/usage` — 엄밀히는 "밀리 앱이 화면 맨 앞에 있던 시간"(서재 탐색 포함). 폰 독서는 **구조적 미수집**: 같은 DB의 `/app/intents`는 다른 기기분이 들어오는데 `/app/usage`는 2544/2544 전부 로컬 = 애플이 앱 사용시간을 기기 간 동기화하지 않음.
- **knowledgeC 는 28~29일째에 그날 '앞부분부터' 지운다.** 조건 없는 `merge-duplicates` upsert 가 그 잘린 합계로 정본을 덮어써 61일 중 5일 2571초(42.9분)가 소실됐다(5/28 1254→18 등). → 데몬을 **신규만 삽입(`ignore-duplicates`) + 기존보다 클 때만 갱신(`seconds=lt.N` PATCH)** 으로 변경, 로그에서 5일 복구. knowledgeC 는 `mode=ro` 로 연다(`immutable=1` 은 WAL 을 무시해 최신 세션을 놓침).
- **밀리 `book` 테이블은 최근 3권만 남기는 롤링 캐시**(3행 vs `history_drift` 25행) — INNER JOIN 이라 22권이 조용히 탈락했다. → 데몬이 `~/.local/share/millie-tracker/book-catalog.db` 에 책 정보를 누적 보관하고 그걸로 조인.
- **맥미니 한정 보장** — 밀리 계정이 아이폰들과 공유되므로 `history_drift` 에 폰 독서가 섞일 수 있다. 위치 갱신 시각이 맥 밀리 앱 사용 구간 안(±60초)일 때만 인정. 스크린타임 보관 밖이면 판정 불가 → 쓰지 않음(기존분 유지).
- **표시 계층 규칙**(`RTAppModel`): ① 1분 미만인 날은 시간·연속·읽은 날수에서 제외(`ebookMinSeconds`) — 원본 DB 는 보존해 되돌릴 수 있게 둔다. ② 책 귀속은 **그날 책이 정확히 1권일 때만**, 아니면 "밀리의서재". 직전 책·현재 책 추측 금지 — 5월 독서에 8월 책 이름이 붙던 원인(수정 전 72.6%가 추측 라벨).
### 진짜 독서만 세기 — 재료 보관 중, 판정 미정 (2026-08-28)
밀리는 **뷰어 로그를 평문으로 남긴다**: `~/Library/Application Support/kr.co.millie.MillieShelf/log/<KST자정 epoch-ms>.txt`.
`viewer relocated {location: <CFI>, location_percent: N%, updated_at: <unix>}` 가 페이지 이동마다 찍히고 `insertHighlight` 도 있다.
`history_drift`(책당 1행 덮어쓰기)와 달리 **초 단위 이력**이라 "언제 실제로 읽었나"를 알 수 있는 유일한 원천이다.
- **보관**: `millie-book-sync.sh` 가 매 실행마다 ① 로그 파일을 `~/.local/share/millie-tracker/millie-logs/` 로 복사(append 전용이라 커졌을 때만) ② knowledgeC 밀리 세션을 `book-catalog.db:usage_sessions` 에 ③ 밑줄을 `:highlights` 에 스냅샷. 전부 멱등(PK 충돌 무시).
  **왜 급한가** — 로그는 영구 보존이 아니다(실측: 2026-08-12 에 574초 독서가 스크린타임에 있으나 그날 로그 파일 부재. 정확한 정책은 미확인). knowledgeC 는 28일 만료라 누적 21,856초 중 **90.6%가 이미 창 밖**이다.
- **판정은 아직 안 한다.** "진행률이 변하면 독서"는 실측 반례가 있다 — 2026-08-21 은 190초에 26번 이동(1초에 한 챕터, 100%→표지 10%→다시 100%)으로 **훑기**였고, 뷰어를 3번 재오픈·창 리사이즈까지 겹쳤다. 이 규칙을 그대로 쓰면 그 190초가 "확실한 독서"로 확정된다. 판정 가능한 날이 2일뿐이고 그중 1일이 전량 오탐이라 표본이 부족하다.
- **규칙을 만들 때의 단서**: 이동 간격(1초에 5%p = 훑기 / 1~2분에 1%p = 독서)·밑줄 동반 여부·한 위치 체류 시간.
- **함정(실측)**: ① 08-21 로그는 NEL(0x85) 종결자라 `grep` 이 바이너리로 보고 조용히 0건 반환(`grep -a` 또는 파이썬 바이트 디코딩 필요) ② 동시 쓰기로 라인이 섞여 느슨한 정규식(`updated_at\D*(\d{10})`)은 **유령 시각**을 만든다(파일당 8~9건) — 종결 키 `delete_yn` 까지 포함한 앵커만 쓸 것 ③ 창 리사이즈가 CFI 변화 없이 퍼센트만 바꾼다.
- **스크린타임은 양방향으로 틀린다**: 안 읽은 시간을 넣기도 하고(08-21), 읽은 시간을 빼기도 한다 — 08-25 에 독서 이벤트 6건이 밀리 세션 밖에 있었고 그때 frontmost 는 Obsidian·Chrome 이었다(퍼센트가 18→20% 실제 전진).

- **못 고치는 것**: `history_drift` 는 책당 1행(PK `book_id`)이라 과거 이력 소급 불가 — 데몬이 15분마다 스냅샷을 쌓아 앞으로만 누적된다. 밀리를 열었지만 페이지를 안 넘긴 날은 원천에 기록이 없어 "밀리의서재"로 남는다.

### 열어보기와 독서 가르기 · 세션 필터 완화 (2026-09-15 수정)
사용자 보고 — 밀리에서 검색해 눌러만 본 책이 홈 "읽고 있는 책"에 쌓이고, 정작 그날 읽은 시간은 엉뚱한 책에 붙었다. 원인 둘 다 실측으로 확인됐다.
- **`history_drift` 에 행이 생겼다 ≠ 읽었다.** 밀리는 뷰어를 열기만 해도 행을 만들고 `updated_at` 을 갱신한다. 실측: 사피엔스 09-06 15:02:41 과 살찌지 않는 몸 09-10 23:44:51 은 `location_percent` 가 NULL(뷰어 로그에도 0%)인데 `book_reading_books` 에 올라갔다.
  → 데몬에 판정 추가: ① `location_percent` 가 NULL 이면 제외 ② 직전 관측보다 진도가 늘어야 독서 ③ **직전 관측이 없으면(처음 열어보는 책) 올리지 않는다.** 판정 재료는 `book-catalog.db:progress_snapshots`(매 실행 누적) — **소급 불가, 앞으로만**.
  ③ 은 사용자 지적(2026-09-15 밤)으로 보강했다. 처음엔 "직전 관측 없음 = 판정 불가 → 인정" 으로 뒀는데, 그러면 **검색해서 눌러본 새 책이 그대로 올라온다** — 실제로 왕초보 영어패턴이 그 경로였다. 최근 30일 밀리 앱 세션 62개 중 38개(61%)가 1분 미만이라 이 경우가 대부분이다.
  대신 **데몬 주기를 15분에서 3분으로 줄였다**(`~/Library/LaunchAgents/com.gio.millie-book-sync.plist` `StartInterval` 180). 첫 관측을 보류해도 3분 뒤 두 번째 관측에서 진도 증가가 잡히므로 짧은 독서가 살아난다. **3분 미만 독서는 놓칠 수 있다** — 그 책을 다시 읽으면 진도가 늘어 잡힌다. 밀리 DB 읽기와 upsert 는 가벼워 주기 단축 비용은 무시할 수준이다.
- **스크린타임 세션 조각이 실제 독서를 떨어뜨렸다.** `MAC_ONLY` 가 조각 하나하나와 대조하는데, `/app/usage` 는 사용 구간을 듬성듬성 남긴다. 09-11 실측: 4분간 0→18% 읽은 왕초보 스피킹 코치(12:56:35)가 조각 12:54:05~12:58:42 **사이 틈**에 떨어져 탈락했고, 반대로 13:06:15 에 열어 2페이지 본 왕초보 영어패턴이 36초짜리 조각 안이라 통과해 `book_current_reading` 을 차지했다.
  → 판정 기준을 **그날 사용 구간 전체**(첫 조각 시작 ~ 마지막 조각 끝)로 바꿨다. 수정 후 실행에서 왕초보 스피킹 코치가 09-11 에 복구됐다.
- **이미 올라간 과거분은 지우지 않는다**(사용자 결정) — 대신 앱에서 홈 카드를 삭제할 수 있게 했다.
- 검증: `scripts/tests/millie-reading-judgement-test.sh` (+ 기존 2종). 세 스크립트 모두 `~/.local/bin` 의 실데몬을 `MILLIE_DB`·`MILLIE_KDB`·`MILLIE_CAT`·`MILLIE_LOG_DIR`·`MILLIE_ARCHIVE_DIR`·`MILLIE_ENV_FILE` 로 격리해 돌린다. **이 격리 이전엔 테스트가 실 DB 를 읽고 프로덕션 Supabase 에 upsert 했다**(데몬이 PATH 앞에 `/usr/bin` 을 붙여 가짜 curl 을 가렸다 — PATH 를 뒤에 붙이도록 수정).

### 기록이 책에 붙지 않던 문제 (2026-09-15 수정)
89분(5352초) 탭 세션이 `isbn:null` 로 저장돼 통계·마지막 기록에서 사라지고, 홈에는 밀리 책 이름이 대신 떴다.
- **세션 대상이 홈 캐러셀 '인덱스'였다.** 카드 배열은 포그라운드 복귀마다 `loadEbook` 이 밀리 기록을 다시 주입해 재정렬되는데 인덱스는 그대로라, 같은 번호가 다른 책을 가리켰다. 그 카드가 밀리면 `flipTargetISBN` 이 nil 을 내고 `startSession` 이 그대로 저장했다.
  → 선택을 **카드 ID**로 추적한다(`selectedCardID`, `homeCardIndex` 는 그때 계산). 더해 `startSession` 이 마지막에 `currentBook` 으로 폴백해 책 없는 세션 자체가 안 생긴다. `flipTargetISBN` 에는 폴백을 두지 않는다 — FlipEngine 의 밀리 카드 엎기 차단 기준이기 때문.
- **'마지막 기록'이 홈 첫 카드에서 책 이름을 빌려왔다**(`paperLastTitle ?? card.title`) → `RTAppModel.lastRecord` 로 옮기고 폴백 제거. 책이 없으면 "기록".
- 기존 기록은 `repairUnattributedSessions()` 가 앱 시작 시 1회 복구한다 — 그 기록이 끝난 시점에 읽는 중이던 종이책에 붙인다(붙일 책이 없으면 그대로 둠). 시뮬레이터 실데이터 주입으로 09-15 89분 → 서성이다 귀속 확인.

### 홈 밀리 카드 삭제 (2026-09-15, 사용자 결정)
밀리 카드를 홈에서 뺄 방법이 완독 처리뿐이었는데, 완독은 서재에 편입시키는 반대 동작이다.
- 카드에 "지우기" 추가(`deleteEbook`/`deleteSelectedCard`, 확인 대화상자). 완독과 달리 **더 최신 밀리 기록이 와도 되살아나지 않고 기록에서도 빠진다** — 그날 남은 책이 없으면 그날 시간을 시간·연속·읽은 날·랭킹에서 제외한다(`visibleEbookDaily`). 그날 다른 책이 있으면 시간은 남은 책 몫으로 둔다(원천이 날짜 총합이라 책별로 안 나뉜다).
- 영속은 `rt.hiddenEbooks`(UserDefaults). 종이책은 기존대로 서재 ⋯ 메뉴의 책 삭제를 쓴다.
- **확인 대화상자는 `alert` 이어야 한다.** 이 앱은 `RTRootView` 를 390×844 고정 프레임에 `scaleEffect` 로 넣는데, 하단에 붙는 액션시트(`confirmationDialog`)는 그 안에서 취소 버튼 자리를 잃어 **'삭제'만 렌더됐다** — 되돌릴 수 없는 동작인데 물러설 길이 없었다. 앱 안의 확인 대화상자 **네 곳 전부** 같은 상태였다: 홈 밀리 카드 삭제(신규)·서재 ⋯ 책 삭제·완료(06) '이 기록 삭제'·설정 로그아웃. 전부 `alert` 으로 바꿨고 소스에 `confirmationDialog` 는 남지 않았다(`lessons/swiftui-confirmation-dialog-scaled-shell.md`). 검증: `ReadingTimeUITests/ConfirmDialogUITests.swift`(서재·기록·로그아웃) · `MillieCardDeleteUITests.swift`(홈 카드).
- **'마지막 기록' 행 탭**: 행에 뜬 책과 열리는 책이 같아야 한다. 밀리 기록이 최신이면(밀리는 08 상세가 없다) 이동하지 않는다 — 종이책 상세로 새면 읽지도 않은 책을 연 것처럼 보인다. 책 미상(수동 세션)·기록 없음의 읽는 중 책 폴백은 기존대로 유지.

## 알라딘 장애 대처 (2026-09-10 결정)
현상: 2026-09-10 aladin.co.kr 자체가 504 Gateway Time-out(브라우저 실측) → 프록시 ItemSearch 13회 중 1회 성공, 2회 503, 10회 40~90초 무응답.
앱은 실패를 삼켜 무반응이었다(→ 수정: 20초 안에 실패 안내 + 다시 시도, `lessons/aladin-proxy-upstream-hang.md`).
**검색 소스가 하나뿐이라 장애 중엔 어떤 앱도 결과를 못 낸다.** 3단 대처, 우선순위 ① → ③ → ②.

① **프록시 페일오버** — Book·Pick·리딩타임 공통, 클라이언트 3곳 무수정 (`pick/supabase/functions/aladin/index.ts`)
- 상류 `fetch(target)` 에 `AbortSignal.timeout(8_000)`. 시간 초과·5xx·JSON 아님 → **카카오 책 검색 API** 로 재조회, 알라딘 응답 모양으로 정규화해 반환(`source:"kakao"` 필드만 추가).
  - `GET https://dapi.kakao.com/v3/search/book?query=&size=&target=title|isbn` 헤더 `Authorization: KakaoAK <REST 키>`. 무료 일 30,000건. 키 = Supabase secret `KAKAO_REST_API_KEY` — 없으면 페일오버 생략(지금처럼 상류 상태 전달).
  - 매핑: `title→title`, `authors.join(", ")→author`(클라이언트 cleanAuthor 가 첫 이름만 씀), `publisher→publisher`, `datetime[0..<10]→pubDate`, `thumbnail→cover`, `isbn "10 13"` 공백 분리→`isbn`/`isbn13`, `itemId` 생략(정규화가 isbn13 폴백), `categoryName ""`, `subInfo.subTitle ""`.
  - `ItemLookUp.aspx?ItemId=<isbn13>` → `target=isbn&query=<isbn13>` 같은 매핑. 밀리 편입 ISBN 매칭(`matchAdoptedMillieBook`)도 자동으로 혜택.
- 둘 다 죽으면 `504 {"error":"upstream unavailable"}` JSON → 앱이 "알라딘 서버 오류 (504)" 안내.
- 검증: 알라딘 URL 을 일부러 깨뜨린 상태에서 "서성이다" → isbn13 `9791167903792`·장강명·현대문학이 카카오 경유로 나와야 한다. 정상 시엔 응답이 기존과 동일(`source` 외).
- ✅ 완료(2026-09-11, v11 배포): 상류 8초 제한 + 카카오 페일오버. `ALADIN_FORCE_FAIL=1` 시크릿으로 상류를 건너뛴 상태에서 curl·Book·Pick·리딩타임(`rtapp --verify-search 서성이다`) 모두 카카오 경유로 "서성이다"(장강명·현대문학·9791167903792)를 냈고, 해제 후 알라딘 응답으로 복귀. 카카오 앱 ID 1573685(카카오디벨로퍼스 "앱 > 플랫폼 키" 페이지), 키는 Supabase secret `KAKAO_REST_API_KEY`(repo 기록 금지). 단위 테스트 `deno test --allow-env pick/supabase/functions/aladin/index_test.ts`(저장소 루트에서).
- 키 없이 되는 Google Books 는 공용 발신 IP 에서 429 가 나와(실측) 채택하지 않는다.

② **앱 직접 입력** — 검색이 완전히 죽어도 타이머는 돌아야 한다 (리딩타임)
- 실패 안내 아래 "직접 입력해서 추가": 제목·저자·출판사 → `manual:<hash(제목|저자)>` 키로 서재 등록. 표지는 기존 디자인 대체 표지(`RTComponents`).
- 검색이 살아나면 자동 승격: 밀리 편입과 같은 파이프라인(`matchAdoptedMillieBook` → `upgradeMillieBook`)을 `manual:` 키에도 적용 — 앱 시작·시트 열기 시 미승격 키 재매칭, 같은 ISBN 이 이미 있으면 포기(기존 규칙).
- 시트 13 은 픽셀 정본(`prototype/app.js`·design-ref v8)이라 폼 UI 는 **시안 추가가 먼저**.

③ **감시** — `.github/workflows/data-sentinel.yml` 에 프록시 헬스 게이트: ItemSearch 가 20초 안에 200+JSON 이 아니면 FAIL → GitHub 알림. 장애를 앱에서가 아니라 아침에 안다. 페일오버 뒤엔 `source` 필드로 "알라딘 죽고 카카오로 버티는 중"까지 구분. — ✅ 완료(2026-09-11): `aladin-proxy` 잡 신설, 20초 안에 200 + `item` 배열이 아니면 FAIL, `source:"kakao"` 면 "알라딘 장애, 카카오로 운영 중" 경고만. 브랜치 실행과 강제 실패 상태 로컬 실행 모두 통과.

## 로드맵
1. 타이머 코어 = **✅ FlipEngine 재작성**(v8 UX: 들면 일시정지·CTA 종료, wall-clock 누적 — iOS 컴파일 통과, 실기기 검증 대기)
2. 앱 Supabase 배선 = **ReadingTimeKit 이관·컴파일 검증**(OAuth·upsert 실동작은 실기기) · `readingtime_daily` 마이그 = **✅ 적용 완료**(2026-07-01, CLI)
3. 책 검색 = **✅ ReadingTimeKit 완료**(배포 프록시 계약 실측 + 라이브 통합 테스트 통과, 2026-07-02)
4. 디자인 SwiftUI 이식 = **✅ 완료**(14화면 픽셀 검증 + 앱 셸 `RTAppModel`/`RTRootView`/`RTMotion` + rtapp, 2026-07-03)
5. iOS 앱 타깃 = **✅ 완료**(xcodeproj + 시뮬레이터 실행·라이브 타이머·권한 흐름 검증, 2026-07-03) ← 현재
6. 실기기 flip 검증 (기기 연결 + 서명 = 사용자 액션) → 잠금화면 Live Activity

## 미검증·미확정 (추측 금지 원칙)
- **잠금 상태에서 CMMotionManager 콜백 지속** = Apple 문서 미보장 커뮤니티 기법 → 실기기 검증 필요.
- `0001_readingtime_daily.sql` = **✅ 프로덕션 적용·검증 완료** (`supabase db query --linked`, 인증된 CLI).
- Swift 코드 = `swiftc -parse` **구문 통과(7/7)** + `Config`·`Models` 타입체크 통과. **CoreMotion/Supabase 파일은 타입·API·빌드 미검증**(iOS SDK 부재 — `CMMotionManager unavailable in macOS` 확인) → 실기기 빌드 필요.
