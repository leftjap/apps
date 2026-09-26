#!/bin/sh
# 시뮬 앱 시계 이동 라이브러리 빌드 — 날짜 넘김(앱이 살아 있는 채로 자정 통과) 재현용.
# 사용: ./build.sh <out.dylib>  →  SIMCTL_CHILD_DYLD_INSERT_LIBRARIES=<out.dylib> SIMCTL_CHILD_FAKE_OFFSET_SEC=-86400 \
#        xcrun simctl launch <DEV> com.leftjap.gym ...   이후 kill -USR1 <pid> 로 하루 앞당긴다.
# XCUITest 에서는 launchEnvironment 에 같은 키 + FAKE_ADVANCE_ON_BACKGROUND=1 (첫 백그라운드 때 하루 앞당김).
set -e
export DEVELOPER_DIR=${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}
OUT=${1:-/tmp/gym-faketime.dylib}
SDK=$(xcrun --sdk iphonesimulator --show-sdk-path)
xcrun --sdk iphonesimulator clang -target arm64-apple-ios17.0-simulator -isysroot "$SDK" -dynamiclib \
  -framework CoreFoundation -o "$OUT" "$(dirname "$0")/faketime.c"
codesign -s - -f "$OUT"
echo "$OUT"
