# 빌드·실기기 검증 절차

목표: **flip 자동 감지**가 실기기에서 되는지, 특히 **잠금 상태에서 시간이 정확히 쌓이는지** 확인.
무료 Apple ID(Personal Team) 서명 기준.

**진행 상태 (2026-07-03)**: 서명(Team `FNXM5SF6PX`)·기기 페어링·설치·실행까지 완료 —
검증 기기 iPhone 11 Pro(iPhone12,3, 375×812pt, iOS 18.7.3), 연결은 로컬 네트워크 터널
(`devicectl` transportType=localNetwork 실측 — 페어링 후 케이블 불필요). 남은 것 = §4 flip 시나리오.

## 1. 서명 — ✅ 완료됨 (새 맥/계정에서 다시 할 때만)
1. `open ReadingTime.xcodeproj`
2. Xcode → Settings → Accounts → `+` → Apple ID 로그인 (Personal Team 자동 생성)
3. 타깃 ReadingTime → Signing & Capabilities → Team 선택 (DEVELOPMENT_TEAM 은 pbxproj 에 기록됨)
   - Background Modes(Location updates)·위치 문구·URL 스킴(readingtime)은 **Info.plist 에 이미 설정됨**
4. ※ Push Notifications·App Groups 등 추가 금지 (무료 Personal Team 서명 실패 원인)

## 2. 기기 연결·실행 — ✅ 완료됨 (절차 기록)
- iPhone: 설정 → 개인정보 보호 및 보안 → **개발자 모드 ON** → 재부팅
- 첫 페어링만 케이블(신뢰 탭) — 이후 무선. CLI:
  ```sh
  export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
  xcodebuild -project ReadingTime.xcodeproj -scheme ReadingTime \
    -destination "platform=iOS,id=<UDID>" -allowProvisioningUpdates build
  xcrun devicectl device install app --device <UDID> <DerivedData>/Debug-iphoneos/ReadingTime.app
  xcrun devicectl device process launch --device <UDID> com.leftjap.readingtime
  ```
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
