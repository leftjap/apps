# iOS 시뮬레이터 E2E 자동화 함정 (readingtime, 2026-07-04 실측)

## 1. terminate 후 무인자 자동 재기동 → launch 인자 소실
CLBackgroundActivitySession(위치 keep-alive)을 한 번이라도 등록한 앱은 `simctl terminate` 후
**0.5초 내에 시스템(locationd)이 인자 없이 재기동**한다. 이어지는 `simctl launch` 는 그 기존
pid 를 반환하며 런치 인자를 조용히 버린다 (`--terminate-running-process` 도 경쟁에서 짐).
- **증상**: `--seq`/`--sim-motion` 미적용, 앱이 홈 라우트로 뜸. 에러 없음.
- **판정**: 매 launch 후 `ps aux | grep <app>` 로 인자 실재 확인 의무 (스크린샷보다 먼저).
- **해법**: `simctl privacy <UD> reset location <bundle>` + **시뮬 재부팅** → 재기동 루프 소멸.

## 2. 잠금 후 ~30초에 앱 서스펜드 — 시뮬은 keep-alive 검증 불가
위치 권한을 허용해도 시뮬의 CLBackgroundActivitySession + CLLocationUpdate.liveUpdates 는
(정적 시뮬 위치라 스트림이 지속되지 않아) 백그라운드 유예 ~30초를 넘기지 못한다 (2회 재현).
잠금 +16초 이벤트는 발화, +37초는 미발화. **긴 잠금 keep-alive 는 실기기에서만 검증 가능.**
서스펜드 중 놓친 모션 이벤트는 프로세스가 깨어나는 순간 지연 발화한다 (오판 주의).

## 3. System Events `click at` 은 SwiftUI onTapGesture 를 못 누른다
TextField 포커스·시스템 다이얼로그 버튼(UIKit)은 눌리지만 SwiftUI `.onTapGesture` 는 무반응.
**HID 레벨 CGEvent 합성으로 해결** (accessibility 권한만 있으면 됨):
```swift
// click.swift — swift click.swift <x> <y>
import CoreGraphics; import Foundation
let x = Double(CommandLine.arguments[1])!, y = Double(CommandLine.arguments[2])!
let pt = CGPoint(x: x, y: y)
CGEvent(mouseEventSource: nil, mouseType: .mouseMoved, mouseCursorPosition: pt, mouseButton: .left)?.post(tap: .cghidEventTap)
usleep(80_000)
CGEvent(mouseEventSource: nil, mouseType: .leftMouseDown, mouseCursorPosition: pt, mouseButton: .left)?.post(tap: .cghidEventTap)
usleep(70_000)
CGEvent(mouseEventSource: nil, mouseType: .leftMouseUp, mouseCursorPosition: pt, mouseButton: .left)?.post(tap: .cghidEventTap)
```

## 4. 좌표 매핑: 창 AXGroup = 디바이스 포인트 1:1
`tell process "Simulator" to tell window <이름> to get {position,size} of group 1`
→ (예: 795,128 / 390×844). 디바이스 포인트 (x,y) → 화면 (795+x, 128+y). 창 이동 후 재측정.
스크린샷(@3x px) → 포인트는 /3. 메뉴(Device>Lock/Home, Edit>Paste)는 menu item 클릭이 안정적.

## 5. 시뮬 TextField 한글 입력 — keystroke·pbcopy 모두 실패
`simctl pbcopy` 는 한글 인코딩 에러, System Events keystroke 는 IME 미경유라 무효,
호스트 pbcopy + Cmd+V/Edit>Paste 도 미반영 (Return 만 전달됨). ASCII 쿼리로 우회하거나
검색 제출은 기본 쿼리 + Return 으로 검증.

## 6. 시뮬 unified log: `log show --info` 필수, stream 은 무출력
`simctl spawn <UD> log stream --predicate ...` 은 앱이 로깅해도 아무것도 안 잡혔다 (원인 미상).
`log show --info --last Nm --predicate 'subsystem == "..."'` 는 확실히 동작 — Logger `.info()` 는
`--info` 플래그 없으면 안 보인다. 검증 계측은 stream 말고 show 사후 조회로.

## 7. simctl push 는 잠자는 디스플레이를 못 깨운다
sound+time-sensitive 를 넣어도 잠금 소등 화면 유지 (2회 실측). 앱 자체의 로컬 알림/LA alert
경로는 깨웠음(r5) — 웨이크 검증은 앱 신호로만 가능. 잠금 직후 시뮬 디스플레이는 즉시 소등되고
탭·클릭으로도 안 깨어남 → 잠금 화면 스샷은 앱 신호 도착 직후 타이밍에만 가능.

## 8. Darwin lockstate: 시뮬은 잠금당 1회, 실기기는 다회 발화 — 토글 추론 금지
`com.apple.springboard.lockstate` 는 페이로드가 없어 방향을 알 수 없다. 시뮬(잠금당 1회)로
검증한 "미잠금이면 잠금, 잠금이면 해제" 토글 추론이 실기기(잠금·화면 이벤트 다회 발화)에서
두 번째 발화에 뒤집혀 잠금 오판 회귀를 냈다 (2026-07-04 9차). **잠금 설정만 멱등으로 하고,
해제는 방향 명확한 신호(protectedDataDidBecomeAvailable·앱 활성 복귀)로만.**

추가 (12차 stdout 계측으로 확정 — 10차의 ".active 경합" 추정은 **반증**):
- 잠금 순간 lockstate·protectedDataWillBecomeUnavailable 는 **즉시, 항상 배경 상태(state=2)**
  로 도착한다 (6/6 사이클). "protected data ~10초 유예"도 이 기기 잠금 순간엔 미관측.
- **진짜 함정: Face ID 기기는 잠금 화면 탭(글랜스)만으로 `protectedDataDidBecomeAvailable`
  가 발화한다** — 키백 해제 ≠ 사용 재개. available 을 "해제" 신호로 쓰면 잠금 화면 위의
  엎기가 비잠금으로 오판되고, 엎어서 화면이 덮여 재잠금될 때(2~5초)까지 감지가 지연된다.
- 해제 직후 잔여 lockstate 발화(state=1/2)가 잠금을 잠깐 재래치한다 — 앱 활성 복귀가 보정.
- 교훈: 신호 타이밍 가설은 stdout 계측(print — devicectl --console 은 os.log 미표시)으로
  실측 후 수정할 것. 추론만으로 3회 연속 수정 실패했다.

추가 (15차): **"12초 내 잠금 신호 없으면 홈 이탈 엎기로 폐기" 가드는 실기기 도달 불가** —
엎어놓기만 해도 face-down 감지 → 화면 오프 → 수 초 내 자동 잠금 신호가 발생해 보류가 항상
소급된다 (시뮬엔 face-down 자동잠금이 없어 시뮬 실증이 이를 못 잡았음). 잠금 신호만으로
독서 잠금/홈 이탈 구분 불가 → 이탈 컨텍스트(무장 모델: 앱에서 잠금으로 이탈했을 때만 배경
엎힘 유효)로 구분. 해제 직후 잔여 lockstate 는 키백 열림(`isProtectedDataAvailable`)이면
stray 로 무시 — 실제 잠금은 protected data 신호가 동시각 도착해 커버 (12·14차 실측).

## 9. 빈 사진 보관함 위에서 XCUITest 가 가짜로 통과한다
`xcodebuild test` 는 끝나면 시뮬을 Shutdown 시킨다. 이어지는 `simctl addmedia` 는 exit≠0 과
"Unable to lookup in current state: Shutdown" 을 **똑똑히 출력**하지만, 스크립트가 종료코드를
검사하지 않으면 그대로 다음 단계로 넘어간다 (실제로 그렇게 넘어갔다).
그 상태로 PhotosPicker 테스트를 돌렸더니 **통과**했다 — 오라클이 "행을 탭했다"였기 때문.
- **교훈 1**: UI 테스트 오라클은 상호작용이 아니라 **결과**로 쓴다 (`photoRow.value == "photo"`).
  탭·존재 확인만 하는 단언은 대상이 없어도 통과한다.
- **교훈 2**: 테스트가 통과하면 그 테스트가 실패할 수 있는지부터 확인한다 (결함을 되살려 돌연변이 검증).
- 앱 샌드박스 밖 결과(파일 생성)는 테스트 후 셸이 `simctl get_app_container … data` 로 확인.
- PHPicker 그리드 셀(iOS 26.5): `app.images.matching(identifier: "PXGGridLayout-Info")`,
  hittable=false 라 `.coordinate(withNormalizedOffset:).tap()` 필요. 상단 온보딩 배너는 무시 가능.

## 10. 실기기 `--capture`: 잠긴 기기는 흰 화면, 그리고 **예전 rtscreen.png 를 그대로 회수한다**
`devicectl process launch` 는 잠긴 기기에서도 "Launched application" 을 찍지만, 화면이 렌더되지
않아 `captureWindow()` 가 흰 이미지를 쓰거나 아예 안 쓴다. 그 상태로 `copy from` 하면 **며칠 전
캡처가 그대로 딸려온다** — 구 UI 스크린샷을 최신 실행 결과로 오독하게 된다 (2026-07-10, 14:27
파일을 17:36 결과로 착각해 "설치가 반영 안 됐다"고 오진).
- **판정**: 회수한 파일의 mtime 을 반드시 확인. 또는 실행 전에 sentinel 이미지로 덮어써 둔다:
  `devicectl device copy to … --source sentinel.png --destination Documents/rtscreen.png`
- 기기가 자면 `launch` 자체가 `CoreDeviceError 4000 (device disconnected immediately)` 로 실패.
  설치(`install app`)는 성공해도 실행·캡처는 별개 — 설치 성공을 렌더 검증으로 쓰지 말 것.

## 11. 무료 Personal 팀: Time Sensitive Notifications capability 불가
`com.apple.developer.usernotifications.time-sensitive` entitlement 추가 시 실기기 프로비저닝
실패 ("Personal development teams ... do not support"). 시뮬은 entitlement 미검증이라 "긴급"
표시가 되므로 시뮬 성공 ≠ 실기기 자격. 코드의 `interruptionLevel = .timeSensitive` 자체는
무자격 시 시스템이 일반 알림으로 강등하므로 남겨도 무해.
