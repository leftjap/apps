#!/bin/sh
# CommandLineTools 환경에서 swift test 실행 (Xcode 없이 Swift Testing 사용).
# CLT 는 Testing.framework 경로·lib_TestingInterop rpath 를 기본 탐색에 안 넣어줘서 명시 필요.
#
# 매크로 플러그인 (2026-09-16): RTViews 가 SwiftUI 의 @State 를 쓰는데 그 매크로 구현
# (libSwiftUIMacros.dylib)이 CLT 에는 없고 Xcode 의 플랫폼 디렉터리에만 있다. 경로를 물려주면
# CLT 드라이버로 빌드된다 — **Xcode 라이선스 동의 없이 테스트가 돈다**(xcodebuild·DEVELOPER_DIR
# 경로는 Xcode 가 업데이트될 때마다 `sudo xcodebuild -license accept` 를 요구해 막힌다.
# 실측 2026-09-16: 동의본 26.6 · 설치본 27.0 으로 전면 차단, 이 경로만 통과).
# CLT 쪽 플러그인 경로도 함께 줘야 한다 — 하나만 주면 Swift Testing 매크로가 밀려난다.
set -e
FW=/Library/Developer/CommandLineTools/Library/Developer/Frameworks
LIB=/Library/Developer/CommandLineTools/Library/Developer/usr/lib
CLT_PLUGINS=/Library/Developer/CommandLineTools/usr/lib/swift/host/plugins
XCODE_PLUGINS=/Applications/Xcode.app/Contents/Developer/Platforms/MacOSX.platform/Developer/usr/lib/swift/host/plugins
exec swift test \
  -Xswiftc -plugin-path -Xswiftc "$XCODE_PLUGINS" \
  -Xswiftc -plugin-path -Xswiftc "$CLT_PLUGINS" \
  -Xswiftc -plugin-path -Xswiftc "$CLT_PLUGINS/testing" \
  -Xswiftc -F"$FW" \
  -Xlinker -F"$FW" \
  -Xlinker -rpath -Xlinker "$FW" \
  -Xlinker -rpath -Xlinker "$LIB" \
  "$@"
