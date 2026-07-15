#!/bin/zsh
# 공유 무료팀(7일 TTL) 재서명·재설치 코어 — gym·readingtime·(향후 today) 공용.
#
# 배경: 무료 Apple ID(Personal Team) 프로파일은 서명일 기준 7일 만료. 앱을 계속 실행하려면
# 만료 전에 새 프로파일로 재서명·재설치해야 한다. 과거 gym 스크립트는 매일 재빌드했지만
# 증분 빌드가 서명을 재해결하지 않아(고정 DerivedData) 만료된 프로파일을 그대로 재-임베드,
# 만료 앱을 "설치 성공"으로 매일 재설치하는 조용한 실패에 빠졌다 (2026-07-14 만료→검출 안 됨).
#
# 이 코어가 넣는 3가지 (gym·readingtime 둘 다 없던 것):
#   1. 갱신 필요 시 `xcodebuild clean` 선행 → 서명 재해결 강제 (증분 freeze 회피, 실제 갱신 보장).
#   2. 빌드 후 **배포 산출물의 embedded 프로파일 만료일**을 실측 검증 — 캐시가 아니라 폰에 실제로
#      박히는 프로파일 기준. 갱신이 안 됐으면 설치하지 않는다(조용한 성공 금지).
#   3. 갱신 실패 시 macOS 알림 + 비정상 종료 → 만료 며칠 전 육성 경보(수동 Xcode 재로그인 유도).
#      자유 서명은 애플이 주기적으로 대화식 재로그인을 강제하므로 100% 무인은 구조적으로 불가 —
#      이 경보가 조용한 죽음 대신 lead time 을 준다.
#
# 사용: source 후 resign_verify <proj.xcodeproj> <scheme> <bundleid> <dd_path> <app_name> <udid...>
# 반환: 0 = 모든 기기 최신·성공 / 1 = 일부 기기 설치 실패(미접속 등, 다음 실행 재시도)
#       3 = 재서명 실패(수동 개입 필요, 알림 발송됨)
#
# 호출자는 LOG 환경변수로 앱별 로그 경로를 지정한다(미지정 시 공용 기본).

export DEVELOPER_DIR=${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}
: ${LOG:=$HOME/Library/Logs/resign-verify.log}
: ${REBUILD_THRESHOLD_DAYS:=4}   # 잔여 이 일수 미만 → 재서명 재빌드
: ${FRESH_MIN_DAYS:=5}           # 재빌드 후 잔여가 이 미만이면 갱신 실패로 판정(정상 신규=6d)

_rv_log()   { echo "[$(date '+%F %T')] $*" >> "$LOG"; }
_rv_alert() {
  _rv_log "ALERT: $*"
  /usr/bin/osascript -e "display notification \"$1\" with title \"⚠️ 재서명 경보\" sound name \"Basso\"" 2>/dev/null || true
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

resign_verify() {
  emulate -L zsh
  setopt localoptions no_unset
  local proj=$1 scheme=$2 bundle=$3 dd=$4 appname=$5
  shift 5
  local -a devices=("$@")
  local app="$dd/Build/Products/Debug-iphoneos/$scheme.app"
  local prof="$app/embedded.mobileprovision"
  local now exp remain_days
  now=$(date +%s)

  exp=$(_rv_embedded_exp "$prof")
  remain_days=$(( (exp - now) / 86400 ))
  _rv_log "── $appname 시작 (embedded 잔여 ${remain_days}d)"

  # 재빌드 필요? (프로파일/빌드 없음 또는 잔여 임박)
  if [[ ! -d $app ]] || (( exp == 0 )) || (( remain_days < REBUILD_THRESHOLD_DAYS )); then
    _rv_log "재서명 재빌드 (캐시 프로파일 purge + clean → 새 프로파일 강제 발급)"
    _rv_purge_profiles "$bundle"
    /usr/bin/xcodebuild -project "$proj" -scheme "$scheme" -derivedDataPath "$dd" clean >> "$LOG" 2>&1
    if ! /usr/bin/xcodebuild -project "$proj" -scheme "$scheme" \
           -destination 'generic/platform=iOS' -derivedDataPath "$dd" \
           -allowProvisioningUpdates CURRENT_PROJECT_VERSION=$(date +%Y%m%d%H%M) build >> "$LOG" 2>&1; then
      _rv_alert "$appname 재빌드 실패 — 로그 확인 ($LOG)"
      return 3
    fi
    # 검증: 새로 박힌 프로파일이 실제로 미래 만료인가
    exp=$(_rv_embedded_exp "$prof")
    remain_days=$(( (exp - now) / 86400 ))
    if (( remain_days < FRESH_MIN_DAYS )); then
      _rv_alert "$appname 재서명 실패: 새 프로파일 미발급(잔여 ${remain_days}d). Xcode 열어 Apple ID 재로그인 후 재실행 필요"
      _rv_log "검증 실패 remain=${remain_days}d — 설치 중단"
      return 3
    fi
    _rv_log "재서명 성공 remain=${remain_days}d"
  fi

  # 기기별 설치 — 상태파일의 UUID 와 다르면(재빌드됨/지난 설치 실패) 재시도. 매일 재시도로 자가치유.
  local uuid state_dir sf fail=0 i ok
  uuid=$(_rv_embedded_uuid "$prof")
  state_dir=$HOME/.local/share/resign-verify/$bundle
  /bin/mkdir -p "$state_dir"
  for udid in "${devices[@]}"; do
    sf="$state_dir/installed-$udid"
    if [[ -f $sf && "$(cat "$sf")" == "$uuid" ]]; then
      _rv_log "$udid 최신($uuid) 스킵"; continue
    fi
    ok=0
    for i in 1 2 3; do
      if /usr/bin/xcrun devicectl device install app --device "$udid" "$app" >> "$LOG" 2>&1; then
        echo "$uuid" > "$sf"; _rv_log "$udid 설치 성공 ($uuid)"; ok=1; break
      fi
      _rv_log "$udid 설치 시도 $i/3 실패 — 5s 후 재시도"; sleep 5
    done
    (( ok )) || { _rv_log "$udid 설치 실패(미접속/잠금 추정) — 다음 실행 재시도"; fail=1; }
  done
  return $fail
}
