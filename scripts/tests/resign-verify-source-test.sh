#!/bin/zsh
# resign-verify.sh 빌드 소스·구성 테스트 — xcodebuild 를 함수로 바꿔 끼워 인자와 호출 순서만 본다.
#  ① 호출자가 rv_prepare_source 를 정의하면 재빌드 직전에(빌드보다 먼저) 부른다.
#  ② 그 준비가 실패하면 빌드하지 않고 3 으로 끝나며 알림을 띄운다.
#  ③ BUILD_CONFIG 를 주면 clean·build 모두 그 구성으로 부른다. 안 주면 Debug (gym 기존 동작).
set -u
CORE=${0:A:h:h}/resign-verify.sh
fail=0
check() { if eval "$2"; then print "ok   $1"; else print "FAIL $1"; fail=1; fi; }

run_case() {   # $1 = 준비 훅 본문("" = 훅 없음), $2 = BUILD_CONFIG("" = 미지정)
  local T; T=$(mktemp -d)
  HOME=$T LOG=$T/resign.log NOTES=$T/notes.log CALLS=$T/calls.log HOOK=$1 CFG=$2 zsh -c '
    function /usr/bin/xcodebuild { print -r -- "xcodebuild $*" >> "$CALLS"; [[ " $* " == *" build "* ]] && return 65; return 0; }
    function /usr/bin/osascript { print -r -- "$*" >> "$NOTES"; }
    [[ -n $CFG ]] && export BUILD_CONFIG=$CFG
    [[ -n $HOOK ]] && eval "rv_prepare_source() { $HOOK; }"
    source '"$CORE"'
    resign_verify /x/P.xcodeproj P com.example.p $HOME/dd P UDID-1
    print "rc=$?" >> $HOME/rc.log
  '
  print -r -- "$T"
}

T=$(run_case 'print -r -- prepare >> $CALLS' Release)
check "준비 훅이 빌드보다 먼저 불린다"        '[[ $(head -1 $T/calls.log) == prepare ]]'
check "clean 이 Release 구성"                 'grep -q "^xcodebuild .*-configuration Release .*clean" $T/calls.log'
check "build 가 Release 구성"                 'grep -q "^xcodebuild .*-configuration Release .*build" $T/calls.log'
rm -r "$T"

T=$(run_case 'return 1' "")
check "준비 실패 → 종료 코드 3"               '[[ $(cat $T/rc.log) == "rc=3" ]]'
check "준비 실패 → 빌드하지 않음"             '[[ ! -f $T/calls.log ]]'
check "준비 실패 → 알림"                      'grep -q "빌드 소스" $T/notes.log'
rm -r "$T"

T=$(run_case "" "")
check "훅·구성 미지정(gym) → Debug 로 빌드"   'grep -q "^xcodebuild .*-configuration Debug .*build" $T/calls.log'
rm -r "$T"

exit $fail
