#!/bin/zsh
# resign-verify.sh 기기 등록 재빌드 테스트 — devicectl·xcodebuild·security·codesign 을 함수로 바꿔 끼우고 가짜 프로파일(plist)로 돈다.
#  ① 설치가 0xe8008012(서명 프로파일에 기기 없음)로 거부되면 그 원인을 적고, 같은 거절을 세 번 재시도하지 않는다.
#  ② 그 기기의 하드웨어 UDID 를 대상으로 별도 폴더에서 등록 빌드를 하고, 설치용 산출물은 generic 으로 다시 빌드해 전 기기에 다시 설치한다.
#  ③ 등록 빌드가 실패해도 설치용 재빌드는 하고, 프로파일에 기기가 없으면 원인을 알린다(설치용 산출물의 프로파일은 그대로).
#     설치용 재빌드가 서명이 덜 된 앱을 남기면 지워 정규 재빌드를 탄다. 같은 기기는 그 기기 설치가 성공할 때까지
#     1시간에 한 번만 등록 빌드를 하고, 알림은 기기별로 6시간에 한 번만 띄운다.
#  ④ 잠긴 기기는 '잠김'으로 적는다(예전 문구 "미접속/잠금 추정"은 원인을 가렸다). 하드웨어 UDID 는 로그에 남기지 않는다.
set -u
CORE=${0:A:h:h}/resign-verify.sh
fail=0
check() { if eval "$2"; then print "ok   $1"; else print "FAIL $1"; fail=1; fi; }

# 가짜 프로파일 — security cms -D 가 내놓는 plist 와 같은 키만 둔다
mkprof() {   # $1 경로, $2 UUID, $3… 하드웨어 UDID
  local f=$1 u=$2; shift 2
  /usr/bin/plutil -create xml1 "$f"
  /usr/bin/plutil -insert UUID -string "$u" "$f"
  /usr/bin/plutil -insert ExpirationDate -date "$(TZ=UTC /bin/date -v+6d -v+12H +%Y-%m-%dT%H:%M:%SZ)" "$f"
  /usr/bin/plutil -insert Entitlements -dictionary "$f"
  /usr/bin/plutil -insert Entitlements.application-identifier -string "TEAM.com.example.p" "$f"
  /usr/bin/plutil -insert ProvisionedDevices -array "$f"
  local d; for d in "$@"; do /usr/bin/plutil -insert ProvisionedDevices -string "$d" -append "$f"; done
}

ST=home/.local/share/resign-verify/com.example.p
PP="home/Library/Developer/Xcode/UserData/Provisioning Profiles"
APPREL=dd/Build/Products/Debug-iphoneos/P.app

# 기존 산출물(지오 기기만 든 프로파일 OLD)과 캐시 프로파일 하나를 둔 상태. $1=nobuild 면 산출물 없이 시작(정규 재빌드 경로)
setup() {
  T=$(mktemp -d)
  /bin/mkdir -p $T/$ST "$T/$PP"
  mkprof "$T/$PP/cached.mobileprovision" CACHED HW-GIO
  if [[ ${1:-} != nobuild ]]; then
    /bin/mkdir -p $T/$APPREL/PlugIns/W.appex
    mkprof $T/$APPREL/embedded.mobileprovision OLD HW-GIO
    mkprof $T/$APPREL/PlugIns/W.appex/embedded.mobileprovision OLD-W HW-GIO
    print OLD > $T/$ST/installed-DEV-GIO
  fi
  print -r -- "$T"
}

# 팀 등록 상태는 $T/registered 파일 하나로 흉내 낸다 — generic 빌드는 등록된 기기만 프로파일에 넣는다.
# REG: ok | fail(등록 빌드 실패) | fail-registered(등록은 됐지만 등록 빌드가 실패로 끝남)
#      | fail-after(등록 뒤 설치용 재빌드가 덜 된 앱을 남기고 실패) | widget-missing | reject-always
# LOCK: true|false,  HWFAIL: 1 이면 하드웨어 UDID 조회 실패
run() {   # $1 = T, 나머지 = 기기
  local T=$1; shift
  HOME=$T/home LOG=$T/resign.log NOTES=$T/notes.log CALLS=$T/calls.log APP=$T/$APPREL TT=$T \
  REG=${REG:-ok} LOCK=${LOCK:-false} HWFAIL=${HWFAIL:-0} MKPROF="$(whence -f mkprof)" zsh -c '
    eval "$MKPROF"
    function /usr/bin/security { cat "${@[-1]}"; }
    function /usr/bin/osascript { print -r -- "$*" >> "$NOTES"; }
    function /usr/bin/codesign { ! grep -q HALF "$APP/embedded.mobileprovision" 2>/dev/null; }
    function /usr/bin/xcrun {
      print -r -- "xcrun $*" >> "$CALLS"
      local dev=${@[${@[(i)--device]}+1]} p
      case "$*" in
        *"info lockState"*) print "passcodeRequired: $LOCK" ;;
        *"info details"*)
          (( HWFAIL )) && return 1
          print -r -- "{\"result\":{\"hardwareProperties\":{\"udid\":\"HW-${dev#DEV-}\"}}}" > ${@[${@[(i)--json-output]}+1]} ;;
        *"install app"*)
          # 앱·위젯 중 하나라도 이 기기가 없으면 거절 (실기기와 같다)
          for p in "$APP/embedded.mobileprovision" "$APP"/PlugIns/*.appex/embedded.mobileprovision; do
            if [[ $REG == reject-always && $dev == DEV-SOY ]] || ! grep -q "HW-${dev#DEV-}" "$p"; then
              print "ERROR: Failed to install embedded profile for com.example.p : 0xe8008012 (This provisioning profile cannot be installed on this device.)"
              return 1
            fi
          done ;;
      esac
    }
    function /usr/bin/xcodebuild {
      print -r -- "xcodebuild $*" >> "$CALLS"
      print -r -- "Command line invocation: xcodebuild $*"   # 실제 xcodebuild 처럼 명령줄을 출력에 찍는다
      [[ " $* " == *" clean "* || $* == *" clean" ]] && return 0
      if [[ " $* " == *" -allowProvisioningDeviceRegistration "* ]]; then   # 등록 빌드: 팀 등록만 바꾼다(산출물은 별도 폴더)
        mkdir -p ${@[${@[(i)-derivedDataPath]}+1]}
        [[ $REG == fail ]] && return 65
        touch $TT/registered
        [[ $REG == fail-registered ]] && return 65
        return 0
      fi
      mkdir -p "$APP/PlugIns/W.appex"
      if [[ ! -f $TT/registered ]]; then
        # 프로파일 갱신 없는 빌드는 캐시 프로파일을 그대로 쓴다. 정규 빌드는 등록된 지오 기기만 든 새 프로파일을 받는다
        [[ " $* " == *" -allowProvisioningUpdates "* ]] || return 0
        mkprof "$APP/embedded.mobileprovision" GEN HW-GIO
        mkprof "$APP/PlugIns/W.appex/embedded.mobileprovision" GEN-W HW-GIO
        return 0
      fi
      if [[ $REG == fail-after && ! -f $TT/failed-once ]]; then   # 한 번만 실패
        touch $TT/failed-once; mkprof "$APP/embedded.mobileprovision" HALF HW-GIO HW-SOY; return 65
      fi
      mkprof "$APP/embedded.mobileprovision" NEW HW-GIO HW-SOY
      if [[ $REG == widget-missing ]]; then mkprof "$APP/PlugIns/W.appex/embedded.mobileprovision" NEW-W HW-GIO
      else mkprof "$APP/PlugIns/W.appex/embedded.mobileprovision" NEW-W HW-GIO HW-SOY; fi
    }
    function sleep { : ; }
    source '"$CORE"'
    resign_verify /x/P.xcodeproj P com.example.p $HOME/../dd P '"$*"'
    print "rc=$?" >> $HOME/../rc.log
  ' >> $T/stdout.log 2>&1
}
installs() { grep -c "install app --device $2" $1/calls.log; }
regbuilds() { grep -c -- "-allowProvisioningDeviceRegistration" $1/calls.log; }

T=$(setup); run $T DEV-GIO DEV-SOY
check "0xe8008012 원인을 로그에 적는다"            'grep -q "DEV-SOY 설치 거부: 서명 프로파일에 이 기기가 없음(0xe8008012)" $T/resign.log'
check "'미접속/잠금 추정'으로 적지 않는다"          '! grep -q "DEV-SOY 설치 실패(미접속/잠금 추정)" $T/resign.log'
check "같은 거절을 재시도하지 않는다(거절 1 + 재설치 1)" '[[ $(installs $T DEV-SOY) == 2 ]]'
check "하드웨어 UDID 를 대상으로 별도 폴더에서 등록 빌드" 'grep -q -- "-destination id=HW-SOY -derivedDataPath .*/dd.register -clonedSourcePackagesDirPath .*/dd/SourcePackages -allowProvisioningUpdates -allowProvisioningDeviceRegistration" $T/calls.log'
check "설치용 산출물은 generic 으로, 프로파일 갱신 없이" 'grep "generic/platform=iOS" $T/calls.log | grep -v -q -- "-allowProvisioningUpdates"'
check "등록 빌드 폴더는 지운다"                    '[[ ! -d $T/dd.register ]]'
check "clean·purge 없이"                           '! grep -q " clean" $T/calls.log && ! grep -q purge $T/resign.log && [[ -f "$T/$PP/cached.mobileprovision" ]]'
check "하드웨어 UDID 를 로그에 남기지 않는다"       '! grep -q HW-SOY $T/resign.log && grep -q "id=<하드웨어 UDID>" $T/resign.log'
check "소연 기기에 새 프로파일 설치"                '[[ $(cat $T/$ST/installed-DEV-SOY) == NEW ]]'
check "지오 기기도 새 프로파일로 재설치"            '[[ $(cat $T/$ST/installed-DEV-GIO) == NEW ]]'
check "종료 코드 0"                                '[[ $(tail -1 $T/rc.log) == rc=0 ]]'
check "알림 없음"                                  '[[ ! -s $T/notes.log ]]'
check "설치 성공 뒤 등록 표시를 지운다"            '[[ ! -f $T/$ST/register-tried-DEV-SOY ]]'
rm -r "$T"

# 실제 사고 경로: 정규 재빌드(generic, 지오 기기만 든 프로파일) 직후 소연 기기가 거절된다
T=$(setup nobuild); run $T DEV-GIO DEV-SOY
check "정규 재빌드(purge·clean) 뒤 거절 → 등록 빌드" 'grep -q purge $T/resign.log && grep -q " clean" $T/calls.log && [[ $(regbuilds $T) == 1 ]]'
check "정규 재빌드 경로에서도 두 기기 설치"          '[[ $(cat $T/$ST/installed-DEV-SOY) == NEW && $(cat $T/$ST/installed-DEV-GIO) == NEW ]]'
check "stdout 에 변수 값이 찍히지 않는다"            '[[ ! -s $T/stdout.log ]]'
rm -r "$T"

T=$(setup); REG=fail run $T DEV-GIO DEV-SOY
check "등록 빌드 실패 → 원인을 적은 알림"           'grep -q "0xe8008012).*기기 등록 빌드 실패" $T/notes.log'
check "등록 빌드 실패 → 종료 코드 1"               '[[ $(tail -1 $T/rc.log) == rc=1 ]]'
check "등록 빌드 실패 → 설치용 프로파일은 그대로"    '[[ -d $T/$APPREL ]] && grep -q "<string>OLD</string>" $T/$APPREL/embedded.mobileprovision'
REG=fail run $T DEV-GIO DEV-SOY
check "다음 주기에 전체 재빌드·지오 재설치 없음"     '! grep -q " clean" $T/calls.log && [[ $(installs $T DEV-GIO) == 0 ]]'
check "1시간 안에는 등록 빌드를 다시 하지 않는다"   '[[ $(regbuilds $T) == 1 ]] && grep -q "1시간 안에 이미 시도함" $T/resign.log'
rm -r "$T"

T=$(setup); REG=fail-registered run $T DEV-GIO DEV-SOY
check "등록 빌드가 실패로 끝나도 등록됐으면 설치"    '[[ $(cat $T/$ST/installed-DEV-SOY) == NEW ]] && [[ ! -s $T/notes.log ]]'
rm -r "$T"

T=$(setup); REG=fail-after run $T DEV-GIO DEV-SOY
check "설치용 재빌드 실패 → 서명 깨진 산출물을 지운다" '[[ ! -d $T/$APPREL ]] && grep -q "등록 뒤 설치용 재빌드 실패" $T/notes.log'
REG=fail-after run $T DEV-GIO DEV-SOY
check "다음 주기는 정규 재빌드(clean)"              'grep -q " clean" $T/calls.log && grep -q "재서명 성공" $T/resign.log'
rm -r "$T"

T=$(setup); REG=widget-missing run $T DEV-GIO DEV-SOY
check "위젯 프로파일에 기기가 없으면 실패로 본다"   'grep -q "앱·위젯 프로파일에 이 기기 없음" $T/notes.log && [[ ! -f $T/$ST/installed-DEV-SOY ]]'
rm -r "$T"

T=$(setup); REG=reject-always run $T DEV-GIO DEV-SOY
check "등록 뒤에도 거절되면 알린다"                 'grep -q "DEV-SOY… 등록 재빌드 뒤에도 설치가 거부됨" $T/notes.log'
REG=reject-always run $T DEV-GIO DEV-SOY
check "그 뒤 1시간 안에는 다시 빌드하지 않는다"     '[[ $(regbuilds $T) == 1 ]]'
/usr/bin/touch -t "$(/bin/date -v-2H +%Y%m%d%H%M)" $T/$ST/register-tried-DEV-SOY   # 2시간 전 시도로 돌린다
REG=reject-always run $T DEV-GIO DEV-SOY
check "1시간 뒤에는 다시 등록 빌드"                 '[[ $(regbuilds $T) == 2 ]]'
check "그래도 알림은 6시간에 한 번"                 '[[ $(grep -c "재빌드 뒤에도 설치가 거부됨" $T/notes.log) == 1 ]]'
rm -r "$T"

T=$(setup); HWFAIL=1 run $T DEV-GIO DEV-SOY
check "하드웨어 UDID 조회 실패 → 빌드 없이 그 이유로 알림" '[[ $(regbuilds $T) == 0 ]] && grep -q "하드웨어 UDID 조회 실패" $T/notes.log'
rm -r "$T"

T=$(setup); LOCK=true run $T DEV-SOY
check "잠긴 기기는 '잠김'으로 적는다"              'grep -q "DEV-SOY 설치 실패(잠김)" $T/resign.log'
check "잠긴 기기에는 등록 빌드를 하지 않는다"       '[[ $(regbuilds $T) == 0 ]]'
rm -r "$T"

T=$(setup); rm $T/$ST/installed-DEV-GIO; run $T DEV-GIO
check "gym 처럼 기기 하나·정상 설치 → 등록 경로 없음" '[[ $(cat $T/$ST/installed-DEV-GIO) == OLD && $(regbuilds $T) == 0 ]]'
rm -r "$T"

exit $fail
