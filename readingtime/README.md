# 리딩타임 (ReadingTime)

네이티브 iOS 독서 타이머. 개인용, 앱스토어 미등록(무료 서명 사이드로드). 타깃 iPhone 17 / iOS 17+.

## 무엇
- **엎어놓기(flip) 자동 감지**: 폰을 face-down으로 두면 타이머 시작, 집으면 정지. 잠금 상태에서도 유지(목표).
- **수동 버튼**: 지하철·버스·기차·기내 등 엎을 수 없을 때 버튼으로 시작/정지.
- **책 검색·등록**: 알라딘 API — Book 앱 Edge Function 프록시 재사용(`ReadingTimeKit/BookSearch.swift`). 요청 20초 제한 + 시트 13 에 검색 중·실패(다시 시도)·0건 표시 — 2026-09-10 상류(알라딘) 무응답 장애를 앱이 `try?` 로 삼켜 "검색 자체가 안 됨"으로 보였다(`~/apps/lessons/aladin-proxy-upstream-hang.md`).
  - 2026-11-08: 시트가 다 올라오면(0.55초) 검색칸이 자동 선택된다(앱을 켠 뒤 첫 키보드는 iOS 준비 시간 0.3~0.43초 동안 무반응이었다 — 시뮬레이터 실측. 시트를 열자마자 선택하면 그 준비가 시트 첫 프레임을 189ms 막아 뒤로 미룸). 검색칸 글자가 결과를 낸 검색어와 다르면 결과를 "최근 검색 · 검색어" 로 표시하고, 마지막 결과는 UserDefaults `rt.lastSearch.*` 에 저장해 다시 켜도 보인다. 키보드가 떠도 목록 끝까지 키보드 위로 스크롤된다(`RTKeyboard.canvasInset`). 행 어디를 눌러도 추가되고, 기록(완독·별점·세션·밀리 연결)이 있는 책은 검색 시트의 ✓ 로 해제되지 않는다. 표지는 프록시가 카카오 120×174 썸네일 대신 원본(실측 458×687)을 https 로 주고, 그 전에 저장된 썸네일 주소는 그릴 때 `RTCoverURL.fullSize` 가 원본으로 바꾼다.
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
| `design-ref/design_handoff_tap_mode/` | **탭 모드(05) 시안 J 정본** — README(작업지시서 + 구현 결정) + 동작 목업 `mockups/RTTapMode.dc.html`. 05 는 프로토타입(`app.js` `handleTapZone`·`frames/05.html`) 대신 이 문서를 따른다 |
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
| `scripts/resign-reinstall.sh` | 무료팀 7일 재서명·재설치 — 공용 코어 `~/apps/scripts/resign-verify.sh` 위임. **빌드 소스 = 푸시된 `origin/main` 의 `readingtime/` 스냅샷**(`~/.local/share/readingtime-resign/src`, 2026-11-08 — 작업 트리의 미커밋 변경·로컬 WIP 커밋은 폰에 안 깔린다). launchd `com.leftjap.readingtime.resign` 2분마다 확인. 잔여 <6일(서명 약 1일 경과) 시 **캐시 프로파일 purge + clean 재빌드로 새 프로파일 강제 발급** → **embedded 만료일 사후 검증** → 두 기기(지오 11 Pro·소연 iPhone 17) 설치. 미접속·잠김이면 다음 주기에 재시도. 갱신 실패 시 macOS 알림. 로그 `~/Library/Logs/readingtime-resign.log` |

## 기록 화면 (주 · 월 · 지도)
- 시안 정본 = `design-ref/design_handoff_record_stats/`. 화면 = `Screen10Stats`(주) / `Screen11Month`(월) / `Screen15Map`(지도) + `RecordSheets`(장소 시트·책 상세). 로직·데이터는 전부 `RTRecordData.swift`(순수 엔진 + §12 데모 데이터).
- **지도**: **MapKit**(SwiftUI `Map`, iOS 17+) 실제 지도 타일 위에 폴라로이드 핀/클러스터/배지/시트를 얹는다(작업지시서 §0·§5.1·§14 — 지형은 fidelity 예외 = 실제 지도 SDK). 팬·줌은 MapKit이 담당하고, 클러스터링(화면거리 52px 체인)은 MapKit 카메라의 `MKMapPoint` 투영으로 화면좌표를 구해 동일 규칙 적용. 탭: 클러스터 → 카메라 줌 투 핏 / 단일 → openTarget(1권 책상세 · N권 시트). **헤드리스(rtshot)** 는 MapKit 타일을 렌더 못 하므로 픽셀 오라클 검증용으로만 목업 플레이스홀더(등장방형 `RTMapWorld`)를 유지(`rtHeadless` 분기).
- **읽은 위치**: `RTSessionRecord` 에 `latitude/longitude/placeId/placeName/country`(옵셔널 → 기존 기록 하위호환). 세션은 `readingtime_userdata.data` 의 JSON 스냅샷이라 **SQL 마이그레이션 불필요**. 위치 획득(CoreLocation) 시점은 미확정(§16) → 실데이터에 `placeId` 가 붙기 전까진 지도가 시안 데모 데이터를 렌더한다.
- 검증: `scripts/record-verify.sh <out>` — rtshot 렌더 vs 목업 오라클 픽셀 대조(`.oracle/README.md`).

## 데이터·통합 (결정됨)
- **기기 교체 복원**: 로컬 `rt.userData`가 없으면 로그인·앱 시작 시 본인의 `readingtime_userdata`를 먼저 복원·영속화한 뒤 업로드한다. 다운로드·디코딩 실패 시 업로드를 차단하며, 기존 로컬 사본은 오프라인 변경을 보존하기 위해 유지한다.
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

### 완독 시트가 시안 책을 보여주던 문제 (2026-09-19 수정)
'압록강은 흐른다'를 완독 처리했는데 시트에 시안 데모 책(몰입 · 미하이 칙센트미하이 · 4:12 · 8회 · 18일)이 떴다.
- **`Sheet09Finish` 가 시안(`design-ref/v3/mockups/frames/09.html`) 문자열을 그대로 들고 있었다.** 표지·제목·저자·타일 세 개가 전부 하드코딩이라 어떤 책을 완독해도 같은 화면이 나왔다. 08 상세(`Screen08Detail.Live`)는 실데이터로 배선돼 있었는데 시트만 빠져 있었다.
  → 시트도 `selectedBook` 스냅샷을 만든다. 누적·기록 수는 08 상세와 같은 정본(`RTAppModel.bookTotals`)을 쓰고, 밀리 편입 책은 세션이 없으므로 '세션 N회' 대신 '읽은 날 N일'로 표기한다. 표지는 `RTRemoteCover`.
- **표지에 `title` 을 넘겨야 한다**(사용자 지적 2026-09-19). 시안의 표지에는 제목이 그려져 있고(`FlowCover` — 09.html 표지 안 '몰입/FLOW'), 실표지로 바꾸면서 `title` 을 안 넘겨 **표지 이미지가 없는 책은 빈 사각형만** 남았다. `RTPlaceholderCover` 가 뜨도록 09 시트와 08 상세 둘 다 `title`·`author` 를 넘긴다(통계 화면은 이미 그랬다). 큰 글씨 "다 읽었어요" 는 시안 그대로고, 책 제목은 바로 아래 줄과 표지에 들어간다.
  → **저장은 원래 옳았다** — `saveFinished()` 는 `selectedBook.isbn` 으로 찾아 쓴다. 표시만 틀렸다.
- **별점이 직전 책 값으로 남았다.** `openSheet(.finish)` 가 책에 별점이 있을 때만 프리셋해서, 평가 없는 책을 열면 직전에 평가한 책의 별점이 그대로 떠 있었다(그 상태로 저장하면 그 값이 들어간다). 기본 4★ 로 되돌린다.
- **부제 줄은 2줄까지 흘린다.** 1줄로 자르면 긴 제목에서 저자와 'N일 동안' 이 통째로 잘린다(실측: 김초엽 장편 제목이 '… · …' 로 끝났다). `lineLimit(2)` + 가운데 정렬.
- 검증: `RTFinishSheetTests`(종이·밀리·데모 폴백·별점 잔존) + `RTDetailTotalsPinTests`(08 수치 핀). `rtshot 09`·`--app 09`·`08` 네 장 모두 수정 전과 픽셀 0 차이(데모 경로 불변). 시뮬레이터(iPhone 11 Pro) 실데이터 주입으로 종이·밀리 시트와 서재 별점 귀속까지 확인.

### 기록 시간이 지워지거나 빠지던 문제 (2026-11-08 수정)
- 원인 ①: 엎기 엔진이 경과를 따로 셌다(`WallClockSession`). 04 가운데 탭(이어 읽기)은 모델만 기록 중으로 바꿔 엔진 시계가 멈춘 채였고, 폰을 들 때·앱 활성 복귀 때 엔진 값으로 덮어써 탭 이후 시간이 지워졌다. 탭 모드는 별도 시계(`RTTapSessionClock`)를 썼다.
- 원인 ②: 진행 중 세션은 경과 초만 저장돼, 기록 중에 앱이 종료되면 마지막 틱 이후 시간이 말없이 빠졌다. 저장 시각은 저장 버튼을 누른 순간이라, 밤에 멈추고 다음 날 저장하면 다음 날 기록이 됐다. 복원하면 예전 Live Activity 가 '기록 중'으로 남았다.
- 수정: 세션에 벽시계 기준점(`RTSession.anchorAt`·`anchorElapsed` = 상태가 바뀐 시각과 그때 경과)을 두고, 엔진·화면 탭·복원이 모두 이것으로 계산한다. 엔진은 감지한 시각만 넘긴다(`simFlip(at:)`·`togglePause(at:)`). 경과는 틱보다 줄지 않는다. 앱 활성 복귀는 `refreshElapsed()` 하나(엎기·탭 공통). 두 시계 타입은 삭제.
- 복원: 기록 중이던 세션은 마지막 틱까지 넣고 일시정지로 되살린 뒤, 꺼져 있던 시간이 1분 이상이면 "N분 넣기 / 넣지 않기"로 묻는다(`restoredGap`). 저장 시각은 마지막 기록 시각(일시정지 시각·"여기까지 읽기" 시각). 기준점이 없는 예전 저장본은 종전 동작.
- 검증: `RTSessionWallClockTests`(모델), `FlipTapResumeUITests`(합성 모션으로 엎기→들기→화면 탭 재개→들기, 수정 전 코드에서는 실패), `RestoredGapUITests`(시드 `restoreRecording:<초>`). 실기기 미검증.
- 검은 덮개: 04 화면 탭으로 이어 읽으면 손에 든 채로 검은 덮개(엎힘 화면)가 씌워져 '여기까지 읽기'도 눌리지 않았다(`faceDownDark` 가 '기록 중' 상태만 봄, 시뮬레이터 재현). 덮개 조건에 엔진의 실제 엎힘(`FlipEngine.isFaceDown`)을 더했다(`testScreenTapResumeInHandKeepsScreenUsable`, 수정 전 실패). 03 폰 그림 탭(프로토타입용 엎기 흉내)은 남겼다 — 이제 덮개 없이 04 기록 화면이 보이는 수동 시작이 된다.

### 전체 검토 후속 수정 (2026-11-08)
두 에이전트의 전체 검토에서 남은 항목을 우선순위대로 고쳤다. 같은 날 앞선 커밋(서재 ▶·로그아웃 확인·탭 복귀·기록 시간·검은 덮개)의 후속이다.
- **07 시간 직접 추가가 시안 그대로였다.** 책 행이 "몰입 · 미하이 칙센트미하이", 일시가 "오늘 · 14:14" 고정이었고, 열 때마다 시안 데모 상태(35분·+15 선택)였으며 날짜를 고를 수 없었다(저장은 지금 시각). → 실데이터면 상세에서 연 그 책(`selectedBook`)과 실제 일시를 보이고, 일시 행을 누르면 한국어 날짜·시간 휠이 펼쳐진다(지난 시각만, 미래는 모델이 한 번 더 막는다). 기본값은 30분·선택 없음·일시 = 저장하는 순간(`addtimeDate == nil`). ›(책 변경)은 2차에서 구현(아래). 데모(rtshot)는 시안 그대로.
- **저장된 기록을 고치거나 지울 수 없었다.** → 08 기록 행을 누르면 같은 시트가 '기록 고치기'로 열린다(`openRecordEditor`): 분·일시 수정, "이 기록 삭제"(alert 확인). 방식·일시정지·위치는 그대로 두고, 분을 안 바꾸면 원래 초를 유지한다(표시값으로 덮으면 초가 사라진다). 세션에 ID 가 없어 값이 같은 첫 기록을 찾는다 — 완전히 같은 기록 둘 중 하나만 지운다. 08 은 그 책의 기록 **전부**를 스크롤로 보인다(예전엔 최근 5건만이라 그 앞은 고칠 수 없었다). 스테퍼 하한 5분은 이미 5분 미만인 값을 올리지 않는다.
- **1분 미만 종이 기록도 연속일을 이었다.** → 종이도 그날 합 1분 이상만 읽은 날(밀리 `ebookMinSeconds` 와 같은 기준). 기록 화면 '읽은 날'도 같은 기준.
- **책을 지우면 기록 화면만 그 시간을 뺐다.** 삭제 확인창은 "읽기 기록은 남아요"라고 하고 홈 합계·캘린더는 그 시간을 셌다. → 기록 화면에 '삭제한 책'(서재에 없는 ISBN)·'책 미지정'(ISBN 없음) 한 줄로 모은다. 탭은 안 된다(08 이 없다). 파트너 통계도 같은 규칙.
- **서버 업로드 실패가 안 보였고, 순서가 뒤집힐 수 있었다.** 변경마다 `Task { try? upload }` 를 따로 띄웠다. → `RTSnapshotUploader` 가 한 번에 하나만 올리고, 올리는 동안 들어온 것 중 마지막 것만 이어서 올린다. 실패하면 설정 시트에 "동기화 · ○○부터 실패" 행이 생기고(누르면 다시 올림), 앱이 다시 활성화될 때도 다시 올린다. 정상이면 행이 없다(시안 불변).
- **로컬 사본을 못 읽으면 원본을 버렸다.** → `RTUserData.loadLocal` 이 못 읽은 원본을 돌려주고 앱이 `Documents/rt-userData-unreadable-<epoch>.json` 에 보관한 뒤 서버 복원 절차를 탄다(복원 전 업로드 차단은 종전 그대로).
- **밀리 숨김·완독 표시가 기기에만 있었다.** → 스냅샷 JSON(`readingtime_userdata.data`)에 `hiddenEbooks`·`finishedEbooks` 로 함께 싣는다(SQL 변경 없음, 없으면 예전 모양 그대로). 스냅샷을 바꾸는 모든 저장(`mutateUserData`)이 현재 표시를 싣고, 앱 시작·서버 복원 때 기기 표시와 합친다(숨김은 합집합, 완독 시각은 늦은 쪽).
- **서버 행이 사용자당 하나라 이력이 없다**는 지적은 DB 를 바꾸지 않았다 — 맥미니 `com.gio.supabase-backup`(매일 04:00, `scripts/supabase-backup.py`)이 전 테이블을 `~/backups/supabase/<날짜>/` 에 덤프하고 있어 `readingtime_userdata` 도 하루 단위 이력이 있다(2026-11-08 기준 07-14 부터 날짜 폴더 116개 중 115개에 `readingtime_userdata.json`). 하루 안의 변경은 남지 않는다.
- **06 막대가 1시간 고정이었다** — 1시간 넘게 읽은 날엔 기존 구간이 막대를 채워 이번 세션 구간이 0 이 됐다. → 축을 1시간 단위로 늘린다(`Screen06Done.barScale`, 축 라벨 "N시간").
- **표지 없는 책이 서재·지도에서 빈 사각형이었다** → `RTRemoteCover` 에 `title` 을 넘겨 대체 표지(09 와 같은 이유).
- **작은 터치 영역** — 08 "직접 추가"(글자 16pt)와 서재 필터·정렬 칩(28pt)을 그린 크기 그대로 두고 누르는 영역만 44pt 로(`rtHitArea`: padding → contentShape → 음수 padding). 실측: SwiftUI 는 접촉 반경만큼 너그럽게 받아 고치기 전에도 '직접 추가' 글자 위 12pt 까지는 눌렸고 16pt 부터 안 눌렸다. 넓힌 뒤 접근성 프레임이 44 캔버스pt 가 되고 16pt 위도 눌린다. 같은 방식인 홈 '전체 통계' 테스트가 늘 실패하던 것은 기준값이 기기 배율(375/390)을 빼먹었기 때문이었다 — 고쳤다.
- **자동 재설치가 작업 트리를 빌드했다.** 세션이 고치던 미커밋 변경이 매일 폰에 깔렸다. → 재빌드 직전에만 `origin/main` 의 `readingtime/` 을 `git archive` 로 꺼내 빌드한다(폰트는 작업 트리에서 복사). 공용 코어엔 선택 항목 둘(`rv_prepare_source` 훅·`BUILD_CONFIG`)만 넣어 gym 동작은 그대로다(`scripts/tests/resign-verify-source-test.sh`). 푸시하지 않은 변경은 폰에 안 간다. 같은 때 폰 설치본을 **Release** 로 바꿨다(예전엔 최적화 없는 Debug). 시뮬레이터 UI 테스트 50개를 Release 로 돌려 기존 실패 1건(`testMonthNavigation`) 외 통과, 기기용 Release 빌드 컴파일 확인. 실기기 동작은 확인 안 함 — 이상하면 스크립트의 `BUILD_CONFIG=Release` 한 줄을 지우면 Debug 로 돌아간다.
- 검증: 단위 `RTRecordEditTests`·`RTSnapshotUploaderTests`·`RTEbookMarksSyncTests`, UI `RecordEditUITests`(07 실데이터·피커로 날짜 바꿔 저장 / 고치기·삭제 / 동기화 행)·`HitAreaUITests`(고치기 전 코드에서 실패 확인). rtshot 13화면 정적·앱 경로 26장이 직전 커밋과 바이트 단위로 같다. 실기기는 확인 안 함.

### 전체 검토 후속 수정 2차 (2026-11-08)
1차 보고의 "남은 항목"을 지오 지시로 전부 진행했다. 시안을 바꾸는 항목 포함.
- **06 완료 화면**: 저장 전인데 "기록됐어요"라고 했다 → "이만큼 읽었어요". '저장하기' 옆에 '이어 읽기'(08 CTA 행과 같은 1.6 : 1) — 실수로 끝냈을 때 저장하지 않고 일시정지 상태로 타이머에 돌아간다(`resumeFromDone`).
- **07 책 고르기**: 책 행 › 를 누르면 종이책 목록(읽는 중 → 완독, 밀리 편입 책 제외)이 펼쳐진다. 새 기록은 고른 책에, '기록 고치기'에선 기록을 다른 책으로 옮긴다(잘못 붙은 기록 바로잡기). 고를 책이 하나뿐이면 › 를 그리지 않는다.
- **글자 대비**: 1차 권장안 #76705C 는 종이 배경 위 4.46:1 로 4.5:1 에 조금 못 미쳤고, 보조 글자 muted #8C8570 도 3.32:1 이었다. faint 만 올리면 muted 보다 진해져 위계가 뒤집힌다. → muted #5E5947(6.3:1), 정보가 담긴 흐린 글자 `RT.faintText` #6F6957(4.9:1, 세그먼트 배경 위 4.55:1). faint·ghost 는 장식(아이콘·점·꺽쇠)과 빈 상태(14 시안 띠)에만 남겼다. 비활성 CTA 의 안내 글자("밀리에서 자동 기록 중"·"밀리의 서재")는 왜 비활성인지 알려 주므로 올렸다.
- **빈 상태**: 14 빈 홈 — 읽는 책은 없어도 기록이 있으면 실제 값을 흐리지 않고 '전체 통계' 캡슐을 둔다(기록이 전혀 없으면 시안 그대로). 지도 — 위치가 남은 기록이 없으면 카드·전체 화면에 "아직 지도에 남은 곳이 없어요" 안내.
- **성능**(맥 측정, 기록 700건·밀리 400일, 20회 평균): 타이머 1초 갱신 계산 9.5 → 1.5ms, 홈 한 번 38 → 2.5ms, 기록 화면 집계 80 → 10ms. 원인은 Calendar·DateFormatter 를 접근마다 새로 만들고(시간대가 바뀔 때만 새로 만들도록 캐시), 읽은 날 집합을 매번 밀리 날짜 400개 해석으로 다시 계산하고(입력이 바뀔 때만), 2주 달력이 14칸 × 기록 전체를 비교한 것(한 번 훑어 날짜별로 묶음). Debug·Release 측정값이 거의 같아 Foundation 날짜 처리가 대부분이었다. 매초 모델 갱신 자체는 두었다(경과를 벽시계 기준점으로 계산하므로 틱을 줄이면 복원 때 '마지막으로 살아 있던 시각'이 흐려진다).
- **상태 표시줄**: 03~05 어두운 화면에서 기본(어두운) 글자라 시계가 안 보였다 → 화면에 맞춰 `preferredColorScheme`(어두운 화면 .dark, 나머지 .light). 기기를 다크 모드로 써도 경고창·날짜 휠·키보드가 종이 배경 위에 흰 글자로 그려지지 않는다(시뮬레이터 다크 모드로 확인).
- **잠금 화면 탭 모드 제어**: 탭 모드 Live Activity 에 일시정지·재개 버튼(`RTToggleReadingIntent`, iOS 17 `LiveActivityIntent` — 앱 프로세스에서 실행, App Intents 는 별도 entitlement 가 없어 무료 팀 서명으로도 된다). 탭 모드에선 "다시 엎으면 이어서" 문구를 뺐다. 시뮬레이터(잠금 상태, 앱 백그라운드)에서 일시정지·재개 양쪽 확인(`la: 갱신 (paused)` → `(recording)`). 실기기 확인 안 함. 앱이 완전히 꺼진 상태에서 누를 때는 확인 안 함.
- **VoiceOver**: 아이콘만 있는 버튼(뒤로·책 메뉴·책 추가·닫기·메뉴·이전/다음 달·스테퍼·별점)에 라벨.
- **설정**: '밀리의서재 연결됨' 의 누를 수 없는 › 제거. **시트**: 손잡이 줄(위 32pt)을 끌어내리면 닫힌다(목록·휠과 겹치지 않게 손잡이 줄에서만).
- **위치**: 재개할 때마다 위치를 다시 잡아 마지막 재개 위치가 세션 위치가 됐다 → 세션을 새로 시작할 때만(`onSessionStart`). 저장 좌표는 소수 셋째 자리(약 110m)까지(`RTAppModel.coarse`) — 스냅샷이 서버에 올라가고 파트너도 읽는다. 이미 저장된 좌표는 바꾸지 않았다. 디버그 로그(`rtdbg.log`)에서 좌표를 뺐다.
- **클라우드 조회 행 제한**: PostgREST 는 한 번에 최대 1000행 — 밀리 일별·책별·책 메타와 `readingtime_daily` 조회를 정렬 고정 + 1000행씩 이어 받기로(`CloudStore.fetchAllPages`). 2026-11-08 행 수는 밀리 일별 88·책별 27·`readingtime_daily` 40 이라 아직 잘리지 않았다.
- **`readingtime_daily`**: Cue 앱이 읽는 표인데, 저장할 때마다 '저장한 날'에 초를 더하기만 해서 직접 추가·고치기·지우기·다음 날 저장이 반영되지 않았다. → 앱 기록 전체에서 날짜(KST)·방식별 합을 계산(`RTDailyMirror`)해 서버 값과 다른 행만 덮어쓰고, 서버에만 있는 행은 0 으로(`setPaperDaily`). 로컬 사본 복원 전엔 하지 않는다(빈 기록으로 0 을 쓰지 않게). 11-08 백업으로 미리 계산하니 첫 실행에서 지오 2행(새 행 1, +51분)만 바뀌고 소연은 그대로다. SQL 변경은 없다. 방식 값이 flip·tap 에 더해 manual 도 들어간다(마이그레이션 주석의 'flip' | 'manual' 규약과 맞다).
- **오래된 밀리 카드**: 30일 넘게 안 읽은 밀리 책은 홈 카드에서 뺀다(`millieCardDays`). 다시 읽으면 돌아온다.
- **MillieLibraryUITests 불안정 = 앱 버그**: 밀리 책을 완독하면 서재에 편입된 뒤 백그라운드 책 검색이 키를 `millie:…` 에서 실 ISBN 으로 바꾼다(`upgradeMillieBook`). 이 테스트엔 검색 스텁이 없어 실서버 응답 속도에 따라, 응답이 상세를 연 **뒤에** 오면 상세가 들고 있던 옛 키(`selectedISBN`)가 사라져 `selectedBook` 이 읽는 중 종이책으로 넘어갔다 — '완독' 글자(종이책 CTA)는 있고 '자동 기록' 행은 없는, 실패 로그와 같은 상태. 실사용에서도 상세를 보다가 다른 책으로 바뀐다. → 열려 있는 책이면 새 키를 따라간다. 검색을 4.5초 늦추는 스텁(`--stub-search millieSlow`)으로 항상 그 순서를 만드는 `testMillieDetailStaysAfterLateISBNUpgrade` 가 수정 전 코드에서 실패하고 수정 후 통과한다. 별개로 `RereadCaptureUITests.testA` 가 첫 단계(10초 안에 홈 '몰입' 글자)에서 연달아 두 번 실패한 뒤로는 앱 삭제 직후·재빌드 직후를 포함한 4회 모두 통과했다(원인 미확인, 결과 번들 없이 실패해 화면을 못 봤다).
- 검증: 단위 `RTReviewFollowup2Tests`·`PagedFetchTests`, UI `ReviewFollowupUITests`(06 이어 읽기·07 책 고르기·시트 끌어내리기·14 통계 버튼·지도 안내). rtshot: 03·04·05·14 는 직전 커밋과 바이트 동일, 글자색만 바뀐 화면은 이진 마스크 모양 차가 280~1040px(글자 가장자리), 06 만 레이아웃 변화. 실기기 확인 안 함.

### 재설치 빌드 '프로파일 파일 없음' 실패 (2026-11-08~09)
- 11-08 20:57·21:00 에 `814c6389` 를 폰용으로 빌드하다 두 번 연속 실패했다: 위젯(20:57)·앱(21:00)이 디스크에 없는 프로파일 파일(`c20c6178`·`dee660f0`)로 포장하려 했다. 같은 빌드에서 위젯은 그 빌드가 새로 받은 프로파일을 썼고, 실패 뒤 폴더엔 그 빌드가 받은 새 프로파일만 남아 있었다. 같은 빌드 안에서 한 대상의 프로파일이 두 번 발급돼 앞의 파일이 지워진 것으로 보인다(추정 — 확인 안 함). 그날 19:30 에 한 번 재서명한 뒤 한 시간 반 안에 강제로 두 번 더 재서명한 것이 계기로 보인다.
- 대처: 공용 코어가 빌드 실패 출력에 `Provisioning Profiles/` 의 '파일 없음'이 있으면 프로파일을 다시 지우지 않고 한 번만 더 빌드한다(`scripts/tests/resign-verify-source-test.sh` ④). 11-09 19:04 재빌드는 첫 시도에 성공해 이 재시도는 실제로는 아직 쓰이지 않았다.
- 결과: 11-09 19:05 지오 폰에 `814c6389` 빌드(번호 202611091904) 설치 — `devicectl device info apps` 로 확인. 소연 폰은 잠겨 있어 다음 주기 재시도.

### 홈 밀리 카드 삭제 (2026-09-15, 사용자 결정)
밀리 카드를 홈에서 뺄 방법이 완독 처리뿐이었는데, 완독은 서재에 편입시키는 반대 동작이다.
- 카드에 "지우기" 추가(`deleteEbook`/`deleteSelectedCard`, 확인 대화상자). 완독과 달리 **더 최신 밀리 기록이 와도 되살아나지 않고 기록에서도 빠진다** — 그날 남은 책이 없으면 그날 시간을 시간·연속·읽은 날·랭킹에서 제외한다(`visibleEbookDaily`). 그날 다른 책이 있으면 시간은 남은 책 몫으로 둔다(원천이 날짜 총합이라 책별로 안 나뉜다).
- 영속은 `rt.hiddenEbooks`(UserDefaults). 종이책은 기존대로 서재 ⋯ 메뉴의 책 삭제를 쓴다.
- **확인 대화상자는 `alert` 이어야 한다.** 이 앱은 `RTRootView` 를 390×844 고정 프레임에 `scaleEffect` 로 넣는데, 하단에 붙는 액션시트(`confirmationDialog`)는 그 안에서 취소 버튼 자리를 잃어 **'삭제'만 렌더됐다** — 되돌릴 수 없는 동작인데 물러설 길이 없었다. 앱 안의 확인 대화상자 **네 곳 전부** 같은 상태였다: 홈 밀리 카드 삭제(신규)·서재 ⋯ 책 삭제·완료(06) '이 기록 삭제'·설정 로그아웃. 전부 `alert` 으로 바꿨고 소스에 `confirmationDialog` 는 남지 않았다(`lessons/swiftui-confirmation-dialog-scaled-shell.md`). 검증: `ReadingTimeUITests/ConfirmDialogUITests.swift`(서재·기록·로그아웃) · `MillieCardDeleteUITests.swift`(홈 카드). 2026-11-08: 홈 아바타 메뉴의 로그아웃은 확인 없이 실행되고 있어(이 목록에서 빠져 있었다) 같은 alert 를 붙였다(`testHomeMenuLogoutDialogHasCancel`).
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
- ⚠️ 2026-10-30 알라딘 OpenAPI 전면 종료(기존 TTB 키도 불가, 200 + errorCode "…OpenAPI 서비스는 종료되었습니다."). 프록시가 그 200 을 정상으로 넘겨 책 추가 검색이 막힘(2026-11-02 실기기). → 프록시를 **카카오 키가 있으면 알라딘 미호출·카카오 직행**으로 변경. 경로(`functions/v1/aladin/*`)·응답 모양은 그대로라 앱 재빌드 불필요, 함수 재배포만 필요.
  - ✅ 배포(2026-11-07, v15): CI 배포(`deploy-aladin-proxy.yml`)는 repo secret `SUPABASE_ACCESS_TOKEN` 미설정으로 11-02 두 번 다 실패해 v14(09-11 00:27 KST 배포본)가 그대로였고, data-sentinel 의 `aladin-proxy` 잡은 10-31 부터 매일 FAIL 이었다. Mac 의 로그인된 CLI 로 `cd pick && supabase functions deploy aladin --project-ref tcbooffrdacfatywdzcm --use-api`. 실서버 "예술원에 드리는 보고"·"서성이다" → `source:"kakao"` 결과, `BookSearch.swift` 원본을 묶어 컴파일한 클라이언트로도 검색·ISBN 조회 정상, data-sentinel 수동 실행 통과.
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
