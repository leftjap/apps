# 리딩타임 (ReadingTime)

네이티브 iOS 독서 타이머. 개인용, 앱스토어 미등록(무료 서명 사이드로드). 타깃 iPhone 17 / iOS 17+.

## 무엇
- **엎어놓기(flip) 자동 감지**: 폰을 face-down으로 두면 타이머 시작, 집으면 정지. 잠금 상태에서도 유지(목표).
- **수동 버튼**: 지하철·버스·기차·기내 등 엎을 수 없을 때 버튼으로 시작/정지.
- **책 검색·등록**: 알라딘 API — Book 앱 Edge Function 프록시 재사용(`ReadingTimeKit/BookSearch.swift`, 테스트 9건 통과).
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
| `ReadingTime.xcodeproj` | iOS 앱 프로젝트 (target ReadingTime, iOS 17+, 폴더 동기화) |
| `ReadingTime/` | 앱 소스 — `ReadingTimeApp.swift`(진입+배선)·`FlipEngine.swift`(엎기 감지+wall-clock)·`KeepAlive.swift`(잠금 유지)·`Info.plist` |
| `ReadingTimeKit/` | SPM 패키지 — 아래 타깃 4개. macOS 빌드+테스트 검증(`./test.sh`) |
| ├ `ReadingTimeKit` | 로직 — `CloudStore.swift`(Supabase)·`Config.swift`·`BookSearch.swift`(알라딘) |
| ├ `RTViews` | SwiftUI 14화면 + `RTAppModel`(상태머신)·`RTRootView`(라우트+시트)·`RTMotion`(키프레임 카탈로그) |
| ├ `rtshot` | 헤드리스 렌더 CLI — `rtshot <NN> out.png` / `rtshot --app <NN>`(라우팅 오라클) |
| └ `rtapp` | macOS 데모 셸(390×844 창, 모션 on, 알라딘 라이브 검색) — `rtapp --verify-search <q>` |
| `SETUP.md` | 실기기 배포·검증 절차 |
| `scripts/resign-reinstall.sh` | 무료팀 7일 재서명·재설치 자동화 — launchd `com.leftjap.readingtime.resign` 매일 21:30, 만료 <4일 시 재빌드 후 두 기기(지오 11 Pro·소연 XR) 설치, 로그 `~/Library/Logs/readingtime-resign.log` |

## 데이터·통합 (결정됨)
- **종이책(엎어놓기/수동)** = 리딩타임 전용 테이블 `readingtime_daily`(공유 Supabase, source flip/manual). 마이그: `supabase/migrations/0001_readingtime_daily.sql`.
- **전자책(밀리)** = 기존 `book_reading_seconds`(source='millie-*') **그대로, 읽기 전용**으로 가져옴. 밀리 파이프라인·Book '밀리 독서시간' 카드 무손상.
- **통합은 표시 계층에서만** — 리딩타임 대시보드가 두 테이블을 읽어 `종이 + 전자` 구분 표시. 두 데이터를 DB에서 섞지 않음(종이책이 '밀리'로 오라벨되는 것 방지).
- 인증: Supabase Swift SDK + anon + Google OAuth(지오 계정) → RLS owner-only 충족. service_role 앱 번들 금지. 날짜=KST 실발생일.

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
