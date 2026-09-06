<!-- trigger: simulator,simctl,xcode-select,DEVELOPER_DIR,잠금,백그라운드,오디오,PWA,Media Session,홈 화면,CGEvent,sendBeacon | match-paths: study/src/services/speech*.js,study/src/pages/listen*.js,*/lessons/ios-* -->
# iOS 시뮬레이터에서 웹·PWA 의 잠금 중 오디오 재생 검증 — 2026-09-06 실측

발생: study 연속 듣기 기획 spike / 환경: macOS, Xcode 26.6, iOS 26.5 런타임, `xcode-select` 가 CommandLineTools 를 가리킴 / 요약: 시뮬레이터 전용 MCP 가 없어도 AppleScript 메뉴 + CGEvent 클릭 + 페이지 beacon 로그로 잠금 중 재생을 정량 검증할 수 있다. "시뮬레이터가 없다·실기기만 된다" 는 단정은 틀렸다(README 의 verification-layer-mismatch #D 재발).

## 결과 (iOS 26.5 시뮬레이터, 5문장 30.8초 WAV → Blob URL → `<audio loop>` + Media Session 메타데이터)

| 모드 | 기기 | 잠금 시간 | 결과 |
|---|---|---|---|
| Safari 탭 | iPhone 17e | 294초 | 반복 1→10회, 실제 소리 36→327초, 놓친 시간 3초 |
| 홈 화면 앱(웹 앱으로 열기) | iPhone 11 Pro | 219초 | 반복 4→11회, 실제 소리 130→348초, 놓친 시간 2초 |

- 잠금화면 재생 패널(제목·진행 막대)이 두 모드 모두 표시되고, 표시 위치가 계산값과 ±2.5초 안에서 일치했다.
- 잠금 중에도 페이지의 1초 타이머가 5초 넘게 멈춘 적이 없었다(재생 중인 오디오가 있으면 JS 가 계속 돈다). 다만 beacon 은 잠금 해제 직후 몰려 도착하기도 한다.
- 미검증: 잠금화면에서 일시정지 → 40초 뒤 재개. 시뮬레이터의 제어 센터가 비어 있고, 패널을 탭하면 앱이 열리며 잠금이 풀리므로 잠금화면 일시정지 버튼에 닿을 수 없다.
- 실기기와의 차이(전원 관리 등)는 검증 범위 밖이다. 결과를 쓸 때 "시뮬레이터에서 확인" 이라고 명시한다.
- 잠금화면 패널의 시간 표시는 반복 경계에서 파일 끝 값(예: 0:31/−0:00, 6초 파일이면 0:06)에 머물 수 있다. 진행 판정은 페이지의 자체 기록으로만 하고 패널 숫자는 참고만 한다.

## Why (함정 원인)

- `xcrun simctl` 이 "unable to find utility simctl" 로 실패한 건 Xcode 가 없어서가 아니라 `xcode-select -p` 가 `/Library/Developer/CommandLineTools` 라서다. `DEVELOPER_DIR` 환경변수로 sudo 없이 우회된다. 시뮬레이터 MCP(`Claude Code iOS Simulator`)만 이 상태에서 동작하지 않는다.
- 시뮬레이터는 잠금 뒤 디스플레이를 끄고(검은 캡처), 탭 투 웨이크가 없다. Lock 메뉴가 사이드 버튼이라 한 번 더 누르면 켜진다(토글).
- 키보드 단축키(Cmd+L)는 Simulator 메뉴가 아니라 iOS 의 웹 페이지로 전달된다. 페이지가 keydown 을 받는다.
- CGEvent 누르기 시간이 80ms 를 넘으면 홈 화면 아이콘은 편집(흔들림) 모드, 웹 버튼은 텍스트 돋보기가 뜬다. Safari 의 "···" 버튼은 정확한 중심 좌표 + 60ms 홀드에서만 열렸다.
- 잠금화면 재생 패널을 탭하면 앱이 열리면서 잠금이 풀린다(비밀번호 없음). 측정 중에 시뮬레이터 창을 사람이 클릭해도 같은 일이 생긴다.
- 시뮬레이터 창을 닫으면 기기가 shutdown 된다(17e 가 16:16 에 원인 없이 꺼진 사례).

## How to avoid (절차)

1. `export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer` 후 `xcrun simctl list runtimes`. 사용자 기기 모델로 만든다: `xcrun simctl create "iPhone 11 Pro (x)" com.apple.CoreSimulator.SimDeviceType.iPhone-11-Pro com.apple.CoreSimulator.SimRuntime.iOS-26-5` → `boot` → `open -a Simulator --args -CurrentDeviceUDID <UDID>`.
2. 측정은 페이지가 스스로 한다: 재생 위치·반복 횟수(timeupdate 로 되감김 감지)·재생 상태였던 벽시계 시간을 세고, 모든 로그 줄을 `navigator.sendBeacon('log', …)` 로 Mac 의 POST 수신 서버(파일 append)에 보낸다. 잠금 중 화면은 읽을 수 없으므로 이것이 유일한 정량 채널이다.
3. 조작 도구: 잠금·홈은 `tell application "System Events" to tell process "Simulator" to click menu item "Lock"(또는 "Home") of menu "Device" of menu bar 1`. 탭·드래그는 CGEvent(`click.swift`, `drag.swift`, `.cghidEventTap` 에 post). 창 좌표 = `position of group 1 of window 1` + 기기 포인트(1:1). 캡처는 `xcrun simctl io <UDID> screenshot` (픽셀은 @3x).
4. 홈 화면에 추가: Safari "···" → 공유 → 더 보기 → 홈 화면에 추가 → 추가("웹 앱으로 열기" 기본 켜짐). 아이콘은 홈 마지막 페이지에 생긴다. 열린 페이지는 `navigator.standalone === true` 로 모드를 확인한다.
5. 시험 순서: 재생 확인(로그) → Lock → 타이머(백그라운드 sleep) → 필요 시 Lock 한 번 더 눌러 패널 캡처(위치 = (시작 위치 + 경과) mod 길이) → Home 으로 해제 → 페이지의 복귀 로그에서 증가분 비교.
6. 사람 개입 검출: `xcrun simctl spawn <UDID> log show --info --start … --predicate 'process == "SpringBoard"'` 에서 UITouch·DashBoard 줄의 시각이 내 명령과 다르면 외부 조작이다.
7. 시뮬 오디오는 Mac 스피커로 나간다. 시작 전 `osascript -e 'set volume output muted true'`, 끝나면 `false` 로 복원하고 `get volume settings` 로 확인한다.
   출력 장치가 모니터(HDMI/DisplayPort) 등 소프트웨어 볼륨이 없는 기기면 `get volume settings` 가 `missing value` 를 돌려주고 음소거가 안 된다. 그때는 데모 소리를 무음으로 만든다(mocks/listen.html 의 `amp=0`).

## 검증 (재발 사인)

- "이 Mac 에는 시뮬레이터가 없다" 또는 "실기기에서만 된다" 를 쓰려 한다 → 1번을 먼저 실행한 출력을 붙인다.
- 잠금 뒤 로그가 안 온다 → beacon 은 JS 가 살아 있을 때만 전송된다. 해제 직후 도착분을 본다.
- 로그에 내 명령 없이 "복귀" 나 위치 0 되감김이 찍힌다 → 6번으로 터치 이벤트를 확인한다.
