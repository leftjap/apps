# Xcode 업데이트 후 라이선스 미동의로 빌드가 전면 차단될 때 SPM 테스트만 되살리기

**실측 2026-09-16, 리딩타임 (Xcode 27.0 설치 · 동의본 26.6)**

## 증상

Xcode 가 새 버전으로 올라가면 라이선스 재동의 전까지 이 메시지 하나로 전부 막힌다.

```
You have not agreed to the Xcode license agreements.
Please run 'sudo xcodebuild -license' from within a Terminal window
```

`xcodebuild`, `DEVELOPER_DIR=/Applications/Xcode.app/... swift test`, `swift <파일>.swift` 가 모두 여기서 멈춘다. `sudo` 는 비밀번호가 필요해 에이전트가 대신 실행할 수 없다.

**함정**: `xcodebuild -version` 은 라이선스를 검사하지 않아 **성공한다.** 이걸 보고 "풀렸다"고 판단하면 틀린다. 실제 빌드를 한 번 돌려 확인해야 한다. 판정은 이 값으로 한다.

```bash
defaults read /Library/Preferences/com.apple.dt.Xcode IDEXcodeVersionForAgreedToGMLicense
# 이 값이 설치된 Xcode 메이저 버전보다 낮으면 차단 상태
```

## 우회 — CommandLineTools 드라이버 + Xcode 매크로 플러그인

CommandLineTools 의 `swift` 는 라이선스를 검사하지 않는다. 막히는 실제 이유는 **매크로 플러그인 부재**다. SwiftUI 의 `@State` 같은 매크로 구현체가 CLT 에는 없다.

```
error: external macro implementation type 'SwiftUIMacros.StateMacro' could not be found
       for macro 'State()'; plugin for module 'SwiftUIMacros' not found
```

플러그인은 Xcode 의 **플랫폼** 디렉터리에 있다(`usr/lib/swift/host/plugins` 아래가 아니다).

```
/Applications/Xcode.app/Contents/Developer/Platforms/MacOSX.platform/Developer/usr/lib/swift/host/plugins/libSwiftUIMacros.dylib
```

경로를 `-plugin-path` 로 물려주면 CLT 드라이버로 빌드·테스트가 된다.

```sh
CLT_PLUGINS=/Library/Developer/CommandLineTools/usr/lib/swift/host/plugins
XCODE_PLUGINS=/Applications/Xcode.app/Contents/Developer/Platforms/MacOSX.platform/Developer/usr/lib/swift/host/plugins
swift test \
  -Xswiftc -plugin-path -Xswiftc "$XCODE_PLUGINS" \
  -Xswiftc -plugin-path -Xswiftc "$CLT_PLUGINS" \
  -Xswiftc -plugin-path -Xswiftc "$CLT_PLUGINS/testing"
```

**CLT 쪽 경로도 반드시 함께 준다.** Xcode 것만 주면 Swift Testing 매크로가 밀려나 이번엔 이쪽이 깨진다.

```
error: external macro implementation type 'TestingMacros.SuiteDeclarationMacro' could not be found
```

리딩타임은 이 플래그를 `ReadingTimeKit/test.sh` 에 넣어 두었다(Testing.framework `-F`·rpath 플래그와 함께).

## 우회로 되는 것과 안 되는 것

| 가능 | 불가 |
|---|---|
| SPM 단위 테스트 (`swift test`) | iOS 앱 빌드 (`xcodebuild`) |
| SPM 실행 파일 (`swift run rtshot` — 헤드리스 화면 렌더) | 시뮬레이터 설치·XCUITest |
| macOS 데모 셸 (`rtapp`) | 실기기 재서명·설치 (`resign-verify.sh`) |

로직 검증과 픽셀 렌더까지는 이걸로 끝낼 수 있다. **실기기에 넣는 일만 라이선스 동의가 필요하다.**

## 관련

- `swiftui-confirmation-dialog-scaled-shell.md` — 같은 앱의 XCUITest 로 잡은 결함(그쪽은 라이선스가 필요하다)
- `feedback-verify-before-claiming-impossible.md` (메모리) — "xcrun 실패 ≠ Xcode 부재". 막혔을 때 우회 경로를 먼저 찾는다
