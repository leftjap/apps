# 빌드·검증 절차 (1단계 타이머 코어)

목표: **flip 자동 감지 + 수동 버튼**이 iPhone 17 실기기에서 되는지, 특히 **잠금 상태에서 시간이 정확히 쌓이는지** 확인.
무료 Apple ID(Personal Team) 서명 기준.

## 1. Xcode 새 프로젝트
- New Project → iOS App / Interface **SwiftUI** / Language **Swift** / Storage None
- Deployment Target **iOS 17.0** 이상
- 이 폴더의 `.swift` 5개를 넣고, 생성된 기본 App·ContentView는 이 폴더 것으로 대체

## 2. Info.plist (2개 — 둘 다 entitlement 아님 → 무료 서명 OK)
- **Privacy - Location When In Use Usage Description**
  값 예: `독서 시간을 재는 동안 백그라운드에서 타이머를 유지하는 데 사용됩니다.`
- 타깃 → **Signing & Capabilities** → `+ Capability` → **Background Modes** → ☑ **Location updates**

※ Push Notifications·App Groups 등은 추가 금지 (무료 Personal Team 서명 실패 원인).

## 2b. 클라우드 동기화 (Supabase + Google 로그인)
- **패키지**: 로컬 패키지 `ReadingTimeKit`(이 폴더)만 앱 타깃에 추가 — `Supabase`(supabase/supabase-swift)는 전이 의존성으로 따라옴.
- **URL 스킴**(OAuth 콜백): 타깃 → Info → URL Types → `+` → URL Schemes = **`readingtime`** (콜백 `readingtime://auth-callback`).
- **Supabase Redirect URL**: `readingtime://auth-callback` = ✅ **등록 완료**(2026-07-02, Management API PATCH — read-back 으로 기존 8개 보존 + 추가 확인). Google provider 는 다른 앱에서 이미 활성.
- 접속값(`ReadingTimeKit/Sources/ReadingTimeKit/Config.swift`)은 채워둠 — URL + anon 키(공개 안전, service_role 아님). 앱 타깃에 로컬 패키지 `ReadingTimeKit` 추가 필요.
- **DB 테이블**: `readingtime_daily` = ✅ **프로덕션 적용 완료** (`supabase db query --linked`, 인증된 CLI). 앱 종이책 쓰기가 바로 동작.

## 3. 서명·기기
- Signing & Capabilities → Team = 본인 Apple ID(Personal Team)
- iPhone 17: 설정 → 개인정보 보호 및 보안 → **개발자 모드 ON**
- 케이블 연결 → 타깃 iPhone 17 → **Run** → 첫 실행 시 위치 권한 **앱을 사용하는 동안 허용**

## 4. 검증 시나리오

### A. 엎어놓기(flip) — 잠금 상태 핵심 검증
1. **"엎어놓기 감지 시작"** 탭 → 위치권한 OK
2. 폰을 책상에 **엎어놓기** → `독서 중(엎어놓기)`(초록) + 타이머 증가
3. **전원 버튼으로 화면 끄고 잠근 뒤** 2~3분 엎어둔 채 대기
4. 집어 다시 열기 → **잠긴 동안 시간이 정확히 쌓였는지** 확인
   - ✅ 쌓임 → 코어 성립
   - ❌ 멈춤 → keep-alive가 CMMotion 콜백을 못 살린 것(Apple 미보장 지점). 로그 확인 후 조정
5. `gravity.z` 보고 임계(0.85) 조정 필요 시 `ReadingTimer.swift`의 `startThreshold`/`stopThreshold`

### B. 수동 버튼 — 엎을 수 없는 상황
1. **"수동 독서 시작"** 탭 → `독서 중(수동)` + 타이머 증가 (엎지 않아도)
2. 화면 잠갔다 다시 열어도 시간 유지되는지 확인
3. **"수동 독서 정지"** → 정지
4. (엎어놓기 세션 중엔 수동 버튼 비활성 — 중복 카운트 방지)

> 이 코드는 작성자(Claude)가 빌드 검증하지 못함 — Xcode 환경 부재. 실기기 결과를 알려주면 이어서 조정한다.
