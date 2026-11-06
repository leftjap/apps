#!/bin/zsh
# resign-verify.sh 경보 테스트 — xcodebuild·osascript 를 함수로 바꿔 끼우고 실패 경로만 돌린다.
#  ① Xcode 에서 Apple ID 가 빠진 실패(No Accounts)는 원인과 할 일을 알림에 직접 적는다.
#  ② 2분 주기로 실패가 반복돼도 알림은 6시간에 1회만 띄운다(로그는 매번 남긴다).
#  ③ 그 밖의 빌드 실패는 기존 문구(로그 확인)를 유지한다.
set -u
CORE=${0:A:h:h}/resign-verify.sh
fail=0
check() { if eval "$2"; then print "ok   $1"; else print "FAIL $1"; fail=1; fi; }

run_case() {   # $1 = 빌드 출력에 넣을 에러 줄, $2 = 실행 횟수
  local T; T=$(mktemp -d)
  HOME=$T LOG=$T/resign.log NOTES=$T/notes.log BUILD_ERR=$1 zsh -c '
    function /usr/bin/xcodebuild { [[ " $* " == *" build "* ]] && { print -r -- "$BUILD_ERR"; return 65; }; return 0; }
    function /usr/bin/osascript { print -r -- "$*" >> "$NOTES"; }
    source '"$CORE"'
    for i in {1..'"$2"'}; do resign_verify /x/P.xcodeproj P com.example.p $HOME/dd P UDID-1; print "rc=$?" >> $HOME/rc.log; done
  '
  print -r -- "$T"
}

T=$(run_case "P.xcodeproj: error: No Accounts: Add a new account in Accounts settings." 3)
check "No Accounts → 종료 코드 3"            '[[ $(sort -u $T/rc.log) == "rc=3" ]]'
check "No Accounts → 알림에 Apple ID 재로그인 안내" 'grep -q "Apple ID" $T/notes.log && grep -q "재로그인" $T/notes.log'
check "3회 연속 실패에도 알림은 1회"          '[[ $(wc -l < $T/notes.log | tr -d " ") == 1 ]]'
check "로그에는 3회 모두 경보 기록"           '[[ $(grep -c "ALERT" $T/resign.log) == 3 ]]'
rm -r "$T"

T=$(run_case "P.xcodeproj: error: Some other build error" 1)
check "기타 실패 → 기존 문구(로그 확인) 유지"  'grep -q "재빌드 실패" $T/notes.log && ! grep -q "Apple ID" $T/notes.log'
rm -r "$T"

exit $fail
