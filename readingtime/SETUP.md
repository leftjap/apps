# 빌드·실기기 검증 절차

목표: **flip 자동 감지**가 iPhone 17 실기기에서 되는지, 특히 **잠금 상태에서 시간이 정확히 쌓이는지** 확인.
무료 Apple ID(Personal Team) 서명 기준.

프로젝트는 이미 있음: `ReadingTime.xcodeproj` (시뮬레이터 빌드·실행 검증 완료 — 2026-07-03).

## 1. 서명 (사용자 액션 — 1회)
1. `open ReadingTime.xcodeproj`
2. Xcode → Settings → Accounts → `+` → 본인 Apple ID 로그인 (Personal Team 자동 생성)
3. 타깃 ReadingTime → Signing & Capabilities → Team = 본인 Personal Team
   - Bundle Identifier `com.leftjap.readingtime` 가 충돌하면 뒤에 숫자 등 붙여 유니크하게
   - Background Modes(Location updates)·위치 문구·URL 스킴(readingtime)은 **Info.plist 에 이미 설정됨**
4. ※ Push Notifications·App Groups 등 추가 금지 (무료 Personal Team 서명 실패 원인)

## 2. 기기 연결·실행
- iPhone: 설정 → 개인정보 보호 및 보안 → **개발자 모드 ON** → 재부팅
- 케이블 연결 → Xcode 상단 기기 선택 → **Run**
- 첫 실행: "신뢰하지 않는 개발자" → iPhone 설정 → 일반 → VPN 및 기기 관리 → 신뢰
- 위치 권한: **앱을 사용하는 동안 허용** (03/04 화면 진입 시 요청됨)

## 3. 클라우드 (배선 완료 — 실기기에서 확인만)
- Supabase URL·anon 키·redirect(`readingtime://auth-callback`) = ✅ 설정·등록 완료
- `readingtime_daily` 테이블 = ✅ 프로덕션 적용 완료
- Google OAuth 실검증: 로그인 화면 → Google로 계속하기 → 콜백 복귀 확인 (§6-④)

## 4. 검증 시나리오 (flip-to-time 사활 검증)
1. 홈 → 엎기 모드 → **읽기 시작** → 03 대기 화면
2. 폰을 책상에 **엎어놓기** → 04 기록 중 (자동 시작, 0초부터)
3. **전원 버튼으로 잠근 뒤** 2~3분 엎어둔 채 대기
4. 집어 들기 → 04 일시정지로 전환 + **잠긴 동안 시간이 쌓였는지** 확인
   - ✅ 쌓임 → flip-to-time 성립
   - ❌ 멈춤 → keep-alive 가 CMMotion 콜백을 못 살린 것(Apple 미보장 지점) → `FlipEngine.swift` 로그·조정
5. 다시 엎으면 이어서 기록되는지 / **여기까지 읽기** → 06 완료 → 저장 → `readingtime_daily` 반영 확인
6. `gravity.z` 임계 조정 필요 시 `ReadingTime/FlipEngine.swift` 의 `startThreshold`(0.85)/`stopThreshold`(0.60)

## 시뮬레이터 (참고 — 이미 검증됨)
```sh
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
xcodebuild -project ReadingTime.xcodeproj -scheme ReadingTime \
  -destination "platform=iOS Simulator,name=RT-16e" build
xcrun simctl launch <UDID> com.leftjap.readingtime --seq "login,simFlip"   # 임의 상태 진입
```
CoreMotion 은 시뮬레이터에 없음 — flip 검증은 실기기 전용.
