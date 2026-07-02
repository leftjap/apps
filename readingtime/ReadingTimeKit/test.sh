#!/bin/sh
# CommandLineTools 환경에서 swift test 실행 (Xcode 없이 Swift Testing 사용).
# CLT 는 Testing.framework 경로·lib_TestingInterop rpath 를 기본 탐색에 안 넣어줘서 명시 필요.
# 라이브 통합 테스트 포함 실행: RT_LIVE=1 ./test.sh
set -e
FW=/Library/Developer/CommandLineTools/Library/Developer/Frameworks
LIB=/Library/Developer/CommandLineTools/Library/Developer/usr/lib
exec swift test \
  -Xswiftc -F"$FW" \
  -Xlinker -F"$FW" \
  -Xlinker -rpath -Xlinker "$FW" \
  -Xlinker -rpath -Xlinker "$LIB" \
  "$@"
