#!/bin/zsh
# 공유 무료팀(7일 TTL) 재서명·재설치 코어 — gym·readingtime·(향후 today) 공용.
#
# 배경: 무료 Apple ID(Personal Team) 프로파일은 서명일 기준 7일 만료. 앱을 계속 실행하려면
# 만료 전에 새 프로파일로 재서명·재설치해야 한다. 과거 gym 스크립트는 매일 재빌드했지만
# 증분 빌드가 서명을 재해결하지 않아(고정 DerivedData) 만료된 프로파일을 그대로 재-임베드,
# 만료 앱을 "설치 성공"으로 매일 재설치하는 조용한 실패에 빠졌다 (2026-07-14 만료→검출 안 됨).
#
# 이 코어가 넣는 것 (gym·readingtime 둘 다 없던 것):
#   1. 갱신 필요 시 `xcodebuild clean` 선행 → 서명 재해결 강제 (증분 freeze 회피, 실제 갱신 보장).
#   2. 빌드 후 **배포 산출물의 embedded 프로파일 만료일**을 실측 검증 — 캐시가 아니라 폰에 실제로
#      박히는 프로파일 기준. 갱신이 안 됐으면 설치하지 않는다(조용한 성공 금지).
#   3. 갱신 실패 시 macOS 알림 + 비정상 종료 → 만료 며칠 전 육성 경보(수동 Xcode 재로그인 유도).
#      자유 서명은 애플이 주기적으로 대화식 재로그인을 강제하므로 100% 무인은 구조적으로 불가 —
#      이 경보가 조용한 죽음 대신 lead time 을 준다.
#   4. 30분 주기 호출 전제 (2026-08-10 방콕 만료 사고 — 하루 1회는 폰 잠김/부재 한 번에 24h 손실):
#      최신 상태면 무음 no-op(~0.05s), 기기 미갱신 5일 초과 시 하루 1회 스테일 경보
#      (설치 실패는 로그만 남고 알림이 없어 조용히 만료됐던 구멍), 로그 10MB 회전.
#   5. 설치가 0xe8008012(서명 프로파일에 기기 없음)로 거부되면 원인을 그대로 적고, 연결된 그 기기를 팀에 등록해
#      다시 빌드한 뒤 전 기기에 재설치한다 (2026-11-10 — 소연 폰이 사흘간 "미접속/잠금 추정"으로 잘못 적힌 사고).
#
# 사용: source 후 resign_verify <proj.xcodeproj> <scheme> <bundleid> <dd_path> <app_name> <udid...>
# 반환: 0 = 모든 기기 최신·성공 / 1 = 일부 기기 설치 실패(미접속 등, 다음 실행 재시도)
#       3 = 재서명 실패(수동 개입 필요, 알림 발송됨)
#
# 호출자는 LOG 환경변수로 앱별 로그 경로를 지정한다(미지정 시 공용 기본).
# 선택: BUILD_CONFIG(기본 Debug) = 빌드 구성. rv_prepare_source 함수를 정의하면 재빌드 직전에만 불러
#       빌드할 소스를 준비한다(readingtime: 푸시된 origin/main 스냅샷 — 작업 트리의 미커밋 변경 제외).

export DEVELOPER_DIR=${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}
: ${LOG:=$HOME/Library/Logs/resign-verify.log}
: ${REBUILD_THRESHOLD_DAYS:=4}   # 잔여 이 일수 미만 → 재서명 재빌드 (신규=7d 기준 6 = 서명 ~1일 경과 시 매일 재서명)
: ${FRESH_MIN_DAYS:=5}           # 재빌드 후 잔여가 이 미만이면 갱신 실패로 판정(정상 신규=6d)
: ${BUILD_CONFIG:=Debug}         # 빌드 구성 — 산출물 경로(<구성>-iphoneos)도 따라간다

_rv_log()   { echo "[$(date '+%F %T')] $*" >> "$LOG"; }
_rv_alert() {
  _rv_log "ALERT: $*"
  /usr/bin/osascript -e "display notification \"$1\" with title \"⚠️ 재서명 경보\" sound name \"Basso\"" 2>/dev/null || true
}
# 수동 개입이 필요한 경보 — 주기 실행마다 실패해도 알림은 6시간에 1회만 띄운다(로그는 매번).
# readingtime 은 2분 주기라 2026-11-02 Apple ID 로그아웃 때 2분마다 경보음이 울렸다.
_rv_alert_throttled() {
  local mark=$1; shift
  if [[ -f $mark ]] && (( $(date +%s) - $(/usr/bin/stat -f %m "$mark") < 21600 )); then
    _rv_log "ALERT(알림 생략 — 6시간 내 재발): $*"; return
  fi
  /bin/mkdir -p "${mark:h}"; /usr/bin/touch "$mark"
  _rv_alert "$@"
}

# 빌드 산출물 embedded 프로파일의 만료 epoch (없으면 0)
_rv_embedded_exp() {
  local p=$1
  [[ -f $p ]] || { echo 0; return; }
  local e
  e=$(/usr/bin/security cms -D -i "$p" 2>/dev/null | /usr/bin/plutil -extract ExpirationDate raw - 2>/dev/null) || { echo 0; return; }
  [[ -n $e ]] || { echo 0; return; }
  TZ=UTC /bin/date -j -f "%Y-%m-%dT%H:%M:%SZ" "$e" +%s 2>/dev/null || echo 0
}
_rv_embedded_uuid() {
  /usr/bin/security cms -D -i "$1" 2>/dev/null | /usr/bin/plutil -extract UUID raw - 2>/dev/null
}

# 캐시된 해당 번들(+확장) 프로파일 제거 → 강제 갱신.
# 자유팀은 프로파일이 유효한 동안엔 재빌드해도 갱신하지 않고(만료돼야만 자동 재발급),
# 캐시를 비워야만 -allowProvisioningUpdates 가 새 7일 프로파일을 발급한다 (readingtime E2E 로 규명).
# 기존 App ID 재발급이라 자유계정 "주 10 App ID" 등록 한도와 무관.
_rv_purge_profiles() {
  local bundle=$1 f appid
  local ppdir="$HOME/Library/Developer/Xcode/UserData/Provisioning Profiles"
  for f in "$ppdir"/*.mobileprovision(N); do
    appid=$(/usr/bin/security cms -D -i "$f" 2>/dev/null | /usr/bin/plutil -extract Entitlements.application-identifier raw - 2>/dev/null)
    case "$appid" in
      *".$bundle"|*".$bundle."*) _rv_log "purge 캐시 프로파일 $(basename "$f") ($appid)"; /bin/rm -f -- "$f" ;;
    esac
  done
}

# 기기 등록 재빌드. 반환: 0 성공 / 1 등록 빌드 실패(설치용 재빌드는 성공) / 2 설치용 재빌드 실패.
#  ① 기기를 빌드 대상으로 지정해 팀에 등록하고 그 기기가 든 프로파일을 받는다(2026-11-10 readingtime 실측). 이 빌드는
#     별도 폴더에 만들고 버린다 — 기기 지정 빌드는 에셋을 그 기기 iOS 버전에 맞춰 거르고(actool --filter-for-device-os-version),
#     실패해도 설치용 산출물을 건드리지 않게. xcodebuild 가 명령줄을 출력에 찍으므로 UDID 는 가려서 로그에 남긴다
#     (gym 로그는 공개 저장소 폴더 안에 있다).
#     Swift 패키지는 설치용 폴더에 받아 둔 것을 쓴다(매번 새로 받지 않게).
#  ② 설치용 산출물을 평소처럼 generic 으로 다시 빌드한다. -allowProvisioningUpdates 없이 ①이 받아 둔 프로파일만 쓴다(재발급 없음).
#     ①이 실패로 끝나도 한다 — 같은 빌드에서 프로파일이 두 번 발급돼 '파일 없음'으로 실패한 경우(2026-11-08)처럼
#     등록과 프로파일 수신은 끝났을 수 있다. 등록됐는지는 호출자가 프로파일로 판정한다.
_rv_register_build() {
  local proj=$1 scheme=$2 dd=$3 hw=$4 rc
  /usr/bin/xcodebuild -project "$proj" -scheme "$scheme" -configuration "$BUILD_CONFIG" \
    -destination "id=$hw" -derivedDataPath "$dd.register" -clonedSourcePackagesDirPath "$dd/SourcePackages" \
    -allowProvisioningUpdates -allowProvisioningDeviceRegistration build 2>&1 \
    | /usr/bin/sed "s/$hw/<하드웨어 UDID>/g" >> "$LOG"
  rc=${pipestatus[1]}
  /bin/rm -rf -- "$dd.register"
  /usr/bin/xcodebuild -project "$proj" -scheme "$scheme" -configuration "$BUILD_CONFIG" \
    -destination 'generic/platform=iOS' -derivedDataPath "$dd" \
    CURRENT_PROJECT_VERSION=$(date +%Y%m%d%H%M) build >> "$LOG" 2>&1 || return 2
  (( rc == 0 )) || return 1
}
# 앱과 확장(위젯)의 embedded 프로파일 모두에 이 하드웨어 UDID 가 있나 — 하나라도 빠지면 설치가 거부된다
_rv_profiles_include() {
  local p
  for p in "$1/embedded.mobileprovision" "$1"/PlugIns/*.appex/embedded.mobileprovision(N); do
    /usr/bin/security cms -D -i "$p" 2>/dev/null | /usr/bin/plutil -extract ProvisionedDevices json -o - - 2>/dev/null \
      | /usr/bin/grep -qi "\"$2\"" || return 1
  done
}

resign_verify() {
  emulate -L zsh
  setopt localoptions no_unset
  local -a all_args=("$@")   # 등록 재빌드 뒤 다시 부를 때 쓴다
  local proj=$1 scheme=$2 bundle=$3 dd=$4 appname=$5
  shift 5
  local -a devices=("$@")
  local app="$dd/Build/Products/${BUILD_CONFIG}-iphoneos/$scheme.app"
  local prof="$app/embedded.mobileprovision"
  local now exp remain_days
  now=$(date +%s)

  # 로그 상한 — 10MB 초과 시 .old 1개로 회전
  if [[ -f $LOG ]] && (( $(/usr/bin/stat -f %z "$LOG") > 10485760 )); then
    /bin/mv -f "$LOG" "$LOG.old"
  fi

  exp=$(_rv_embedded_exp "$prof")
  remain_days=$(( (exp - now) / 86400 ))

  # 재빌드 필요? (프로파일/빌드 없음 또는 잔여 임박)
  local need_rebuild=0
  if [[ ! -d $app ]] || (( exp == 0 )) || (( remain_days < REBUILD_THRESHOLD_DAYS )); then
    need_rebuild=1
  fi

  # 기기 pending 선판정 — 재빌드 불필요 + 전 기기 최신이면 무음 종료 (30분 주기 no-op)
  local uuid state_dir sf pending=0
  uuid=$(_rv_embedded_uuid "$prof")
  state_dir=$HOME/.local/share/resign-verify/$bundle
  for udid in "${devices[@]}"; do
    sf="$state_dir/installed-$udid"
    [[ -f $sf && "$(cat "$sf")" == "$uuid" ]] || pending=1
  done
  (( need_rebuild || pending )) || return 0

  _rv_log "── $appname 시작 (embedded 잔여 ${remain_days}d)"

  if (( need_rebuild )); then
    if (( ${+functions[rv_prepare_source]} )) && ! rv_prepare_source; then
      _rv_alert_throttled "$state_dir/alerted-resign" "$appname 빌드 소스 준비 실패 — 로그 확인 ($LOG)"
      return 3
    fi
    _rv_log "재서명 재빌드 (캐시 프로파일 purge + clean → 새 프로파일 강제 발급)"
    _rv_purge_profiles "$bundle"
    local logsize; logsize=$(/usr/bin/stat -f %z "$LOG" 2>/dev/null || echo 0)
    /usr/bin/xcodebuild -project "$proj" -scheme "$scheme" -configuration "$BUILD_CONFIG" -derivedDataPath "$dd" clean >> "$LOG" 2>&1
    local version; version=$(date +%Y%m%d%H%M)
    _rv_build() {
      /usr/bin/xcodebuild -project "$proj" -scheme "$scheme" -configuration "$BUILD_CONFIG" \
        -destination 'generic/platform=iOS' -derivedDataPath "$dd" \
        -allowProvisioningUpdates CURRENT_PROJECT_VERSION=$version build >> "$LOG" 2>&1
    }
    local ok=1
    _rv_build || ok=0
    # 같은 빌드 안에서 한 앱(또는 위젯)의 프로파일이 두 번 발급되면 Xcode 가 앞의 파일을 지운 뒤 그 경로로 포장하려다
    # '파일 없음'으로 실패한다(2026-11-08 readingtime 두 번 연속 실측 — 위젯 c20c6178·앱 dee660f0). 실패한 빌드가 받은
    # 새 프로파일은 디스크에 남으므로, 프로파일을 다시 지우지 않고 한 번만 더 빌드한다.
    if (( ! ok )) && /usr/bin/tail -c +$(( logsize + 1 )) "$LOG" \
         | /usr/bin/grep -E "(cannot be found|unable to read input file).*Provisioning Profiles/" -q; then
      _rv_log "프로파일 파일 없음으로 빌드 실패 — 받아 둔 프로파일로 한 번 더 빌드"
      logsize=$(/usr/bin/stat -f %z "$LOG" 2>/dev/null || echo 0)
      ok=1
      _rv_build || ok=0
    fi
    if (( ! ok )); then
      # Xcode 에서 Apple ID 가 빠지면(2026-11-02 사고) 빌드가 "No Accounts" 로 실패한다 — 원인을 알림에 직접 적는다.
      if /usr/bin/tail -c +$(( logsize + 1 )) "$LOG" | /usr/bin/grep -q "No Accounts"; then
        _rv_alert_throttled "$state_dir/alerted-resign" "$appname 재서명 불가: Xcode 에서 Apple ID 로그아웃됨. Xcode 설정 > Apple Accounts 에서 재로그인 필요"
      else
        _rv_alert_throttled "$state_dir/alerted-resign" "$appname 재빌드 실패 — 로그 확인 ($LOG)"
      fi
      return 3
    fi
    # 검증: 새로 박힌 프로파일이 실제로 미래 만료인가
    exp=$(_rv_embedded_exp "$prof")
    remain_days=$(( (exp - now) / 86400 ))
    if (( remain_days < FRESH_MIN_DAYS )); then
      _rv_alert_throttled "$state_dir/alerted-resign" "$appname 재서명 실패: 새 프로파일 미발급(잔여 ${remain_days}d). Xcode 열어 Apple ID 재로그인 후 재실행 필요"
      _rv_log "검증 실패 remain=${remain_days}d — 설치 중단"
      return 3
    fi
    /bin/rm -f "$state_dir/alerted-resign"   # 복구됐으니 다음 실패는 바로 알린다
    _rv_log "재서명 성공 remain=${remain_days}d"
  fi

  # 기기별 설치 — 상태파일의 UUID 와 다르면(재빌드됨/지난 설치 실패) 재시도. 매 주기 재시도로 자가치유.
  # 이미 있는 이름을 값 없이 local 로 다시 선언하면 zsh 가 그 값을 stdout 에 찍는다(launchd 로그의 lock=·ok=1 줄) — 값과 함께 선언
  local fail=0 i=0 ok=0 lock="" out="" rc=0
  local -a unprovisioned=()
  uuid=$(_rv_embedded_uuid "$prof")   # 재빌드 시 변경되므로 재조회
  /bin/mkdir -p "$state_dir"
  for udid in "${devices[@]}"; do
    sf="$state_dir/installed-$udid"
    if [[ -f $sf && "$(cat "$sf")" == "$uuid" ]]; then
      _rv_log "$udid 최신($uuid) 스킵"; continue
    fi
    ok=0
    # 잠금 게이트 — iOS 는 **잠긴 기기에 개발자 디스크 이미지를 마운트하지 않는다**. 잠겨 있으면
    # 설치는 100% 실패하므로 3회×5s 헛시도를 하지 않는다(로그만 오염되고 기기를 계속 깨운다).
    # 규명 2026-08-28: 소연 XR 이 8/15 이후 1900+회 실패 — lockState 로 재보니 passcodeRequired=true.
    # 같은 파이프라인의 지오 11 Pro 는 passcodeRequired=false 라 매일 성공하고 있었다.
    # lockState 는 잠긴 기기에도 ~4s 안에 응답한다. 조회가 실패하면 판정하지 않고 기존 동작을
    # 그대로 태운다(fail-open) — 게이트가 설치를 막는 일은 없어야 한다.
    lock=$(/usr/bin/xcrun devicectl device info lockState --device "$udid" 2>/dev/null \
            | /usr/bin/sed -n 's/.*passcodeRequired: *\([a-z]*\).*/\1/p' | /usr/bin/head -1)
    if [[ "$lock" == "true" ]]; then
      _rv_log "$udid 잠김(passcodeRequired=true) — 설치 시도 생략, 다음 주기 재시도"
    else
      for i in 1 2 3; do
        out=$(/usr/bin/xcrun devicectl device install app --device "$udid" "$app" 2>&1); rc=$?
        print -r -- "$out" >> "$LOG"
        if (( rc == 0 )); then
          echo "$uuid" > "$sf"; _rv_log "$udid 설치 성공 ($uuid)"; ok=1
          /bin/rm -f "$state_dir/register-tried-$udid" "$state_dir/alerted-register-$udid"; break
        fi
        # 0xe8008012 = 서명 프로파일의 기기 목록에 이 기기가 없다 — 재시도해도 같으므로 아래 등록 재빌드로 넘긴다
        if [[ $out == *0xe8008012* ]]; then
          _rv_log "$udid 설치 거부: 서명 프로파일에 이 기기가 없음(0xe8008012) — 팀 기기 등록 필요"
          unprovisioned+=("$udid"); break
        fi
        _rv_log "$udid 설치 시도 $i/3 실패 — 5s 후 재시도"; sleep 5
      done
    fi
    (( ok )) || {
      local why="미접속/잠금 추정" hint="폰 접속/잠금해제 필요"
      [[ "$lock" == "true" ]] && why="잠김"
      if (( ${unprovisioned[(Ie)$udid]} )); then
        why="서명 프로파일에 기기 없음(0xe8008012)"; hint="서명 프로파일에 기기 없음(0xe8008012), 자동 기기 등록 재빌드 시도"
      fi
      _rv_log "$udid 설치 실패($why) — 다음 주기 재시도"; fail=1
      # 스테일 경보 — 마지막 설치 성공(state mtime) 5일 초과 시 하루 1회 알림.
      # 설치 실패는 알림 없이 로그만 남아 조용히 만료됐던 구멍(2026-08-10 사고)을 막는다.
      if [[ -f $sf ]] && (( now - $(/usr/bin/stat -f %m "$sf") > 5*86400 )); then
        local mark="$state_dir/alerted-$udid"
        if [[ ! -f $mark ]] || (( now - $(/usr/bin/stat -f %m "$mark") > 86400 )); then
          /usr/bin/touch "$mark"
          _rv_alert "$appname: 기기 ${udid:0:8}… 마지막 갱신 $(( (now - $(/usr/bin/stat -f %m "$sf")) / 86400 ))일 경과 — $hint"
        fi
      fi
    }
  done

  # 등록 재빌드 — 무료 팀 프로파일에는 팀에 등록된 기기만 들어간다. 2026-11-07 Xcode 재로그인 뒤 팀 등록 기기가
  # 지오 폰 하나로 다시 만들어져(Apple 서버 기기 목록의 addedDate = 재로그인 시각) 소연 폰이 프로파일에서 빠졌고,
  # 사흘 동안 "미접속/잠금 추정"으로 잘못 적혔다. generic 대상 빌드는 기기를 등록하지 못하므로, 거절한 기기가 연결된
  # 지금 그 기기를 빌드 대상으로 지정해 팀에 등록하고 그 기기가 든 새 프로파일로 다시 빌드한 뒤 전 기기에 다시 설치한다.
  # 하드웨어 UDID 는 저장소에 적지 않고 실행 때 devicectl 로 찾는다. 같은 기기는 1시간에 한 번만 시도한다(2분 주기 재빌드 방지).
  local registered=0 regok=0 hw="" j="" regmark="" why=""
  if (( ${#unprovisioned} && ! ${RV_AFTER_REGISTER:-0} )); then
    for udid in "${unprovisioned[@]}"; do
      regmark="$state_dir/register-tried-$udid"
      if [[ -f $regmark ]] && (( now - $(/usr/bin/stat -f %m "$regmark") < 3600 )); then
        _rv_log "$udid 등록 재빌드는 1시간 안에 이미 시도함 — 생략"; continue
      fi
      /usr/bin/touch "$regmark"
      regok=0 hw="" why="자동 기기 등록 재빌드 실패"
      if j=$(/usr/bin/mktemp -t resign-verify); then
        /usr/bin/xcrun devicectl device info details --device "$udid" --json-output "$j" >/dev/null 2>&1
        hw=$(/usr/bin/plutil -extract result.hardwareProperties.udid raw "$j" 2>/dev/null); /bin/rm -f "$j"
      fi
      if [[ -z $hw ]]; then
        why="하드웨어 UDID 조회 실패(연결 끊김 추정)"; _rv_log "$udid $why"
      else
        _rv_log "$udid 팀 등록 재빌드 (-destination id=<하드웨어 UDID> -allowProvisioningDeviceRegistration → generic 재빌드)"
        _rv_register_build "$proj" "$scheme" "$dd" "$hw"; rc=$?
        if (( rc == 2 )); then
          why="등록 뒤 설치용 재빌드 실패"; _rv_log "$udid $why"
          # 실패한 빌드가 서명이 덜 된 앱을 남겼으면 지워서 다음 주기에 정규 재빌드(purge+clean)를 탄다
          if ! /usr/bin/codesign --verify --deep --strict "$app" >/dev/null 2>&1; then
            _rv_log "산출물 서명 검증 실패 — 지우고 다음 주기에 정규 재빌드"; /bin/rm -rf -- "$app"
          fi
        elif _rv_profiles_include "$app" "$hw"; then
          regok=1   # ①이 실패로 끝났어도 프로파일에 기기가 들었으면 등록된 것이다
        elif (( rc == 1 )); then
          why="기기 등록 빌드 실패"; _rv_log "$udid $why"
        else
          why="등록 뒤에도 앱·위젯 프로파일에 이 기기 없음"; _rv_log "$udid $why"
        fi
      fi
      if (( regok )); then
        _rv_log "$udid 팀 등록 재빌드 성공 — 새 프로파일 $(_rv_embedded_uuid "$prof") 에 이 기기 포함"
        registered=1   # 등록 표시·알림 제한 표시는 그 기기 설치가 성공할 때 지운다
      else
        _rv_alert_throttled "$state_dir/alerted-register-$udid" "$appname: 기기 ${udid:0:8}… 가 서명 프로파일에 없어 설치 거부됨(0xe8008012). $why, 로그 확인 ($LOG)"
      fi
    done
    if (( registered )); then
      RV_AFTER_REGISTER=1 resign_verify "${all_args[@]}"; return $?
    fi
  elif (( ${#unprovisioned} )); then
    # 등록·재빌드가 성공했는데도 거절 — 같은 오류가 다른 이유로 나는 경우. 다음 등록도 "성공"이라 알림 없이 묻히지 않게 여기서 알린다.
    for udid in "${unprovisioned[@]}"; do
      _rv_alert_throttled "$state_dir/alerted-register-$udid" "$appname: 기기 ${udid:0:8}… 등록 재빌드 뒤에도 설치가 거부됨(0xe8008012), 로그 확인 ($LOG)"
    done
  fi
  return $fail
}
