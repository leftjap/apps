#!/bin/zsh
# 리딩타임 무료팀(7일 TTL) 재서명·재설치 자동화 — launchd(com.leftjap.readingtime.resign)가 매일 호출.
# 로직: 프로파일 잔여 <4일 → 재빌드(프로파일 갱신). 기기별로 "현재 프로파일 UUID 설치됨" 상태를
#       추적해, 빌드가 새로 됐거나 지난 설치가 실패한 기기만 install 재시도 (매일 재시도로 자가 치유).
# 주의: 빌드는 ~/apps/readingtime 워킹트리 현재 상태를 그대로 집는다 (미커밋 WIP 포함).
set -u
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
PROJ=$HOME/apps/readingtime
STATE_DIR=$HOME/.local/share/readingtime-resign
DD=$STATE_DIR/dd
LOG=$HOME/Library/Logs/readingtime-resign.log
APP=$DD/Build/Products/Debug-iphoneos/ReadingTime.app
BUNDLE=com.leftjap.readingtime
REBUILD_THRESHOLD_DAYS=4
# UDID: 지오 iPhone 11 Pro · 소연 iPhone XR (devicectl identifier)
DEVICES=(7E959831-9CD6-5413-8ADB-2A04D72C5073 4DBC8522-14E4-5308-B527-E43DAEB2DAE4)

mkdir -p "$STATE_DIR"
log() { echo "[$(date '+%F %T')] $*" >> "$LOG"; }

# 1. 설치된 최신 프로파일(UUID·만료) 파악 — Xcode 가 받아둔 팀 프로파일에서 앱 번들 것만
newest_uuid=""; newest_exp=0
for f in "$HOME/Library/Developer/Xcode/UserData/Provisioning Profiles"/*.mobileprovision(N); do
  plist=$(security cms -D -i "$f" 2>/dev/null) || continue
  echo "$plist" | grep -q "FNXM5SF6PX.$BUNDLE<" || continue
  exp=$(echo "$plist" | plutil -extract ExpirationDate raw -o - - 2>/dev/null) || continue
  exp_epoch=$(TZ=UTC date -j -f "%Y-%m-%dT%H:%M:%SZ" "$exp" +%s 2>/dev/null) || continue
  if (( exp_epoch > newest_exp )); then
    newest_exp=$exp_epoch
    newest_uuid=$(echo "$plist" | plutil -extract UUID raw -o - - 2>/dev/null)
  fi
done

now=$(date +%s)
remain_days=$(( (newest_exp - now) / 86400 ))
log "profile=$newest_uuid remain=${remain_days}d"

# 2. 잔여 임박(또는 프로파일/빌드 없음) → 재빌드 (-allowProvisioningUpdates 가 프로파일 7일 갱신)
if [[ -z "$newest_uuid" ]] || (( remain_days < REBUILD_THRESHOLD_DAYS )) || [[ ! -d "$APP" ]]; then
  log "rebuild 시작 (threshold ${REBUILD_THRESHOLD_DAYS}d)"
  if xcodebuild -project "$PROJ/ReadingTime.xcodeproj" -scheme ReadingTime \
       -destination "generic/platform=iOS" -derivedDataPath "$DD" \
       -allowProvisioningUpdates build >> "$LOG" 2>&1; then
    # 빌드 산출물에 실제로 박힌 프로파일이 배포 기준
    newest_uuid=$(security cms -D -i "$APP/embedded.mobileprovision" 2>/dev/null \
                  | plutil -extract UUID raw -o - - 2>/dev/null)
    log "rebuild 성공 profile=$newest_uuid"
  else
    log "rebuild 실패 — 내일 재시도"; exit 1
  fi
fi

# 3. 기기별 설치 — 상태 파일의 UUID 와 다르면 (재빌드됐거나 지난 설치 실패) 시도
fail=0
for udid in "${DEVICES[@]}"; do
  state_file=$STATE_DIR/installed-$udid
  [[ -f $state_file ]] && [[ "$(cat "$state_file")" == "$newest_uuid" ]] && { log "$udid 최신 — 스킵"; continue; }
  if xcrun devicectl device install app --device "$udid" "$APP" >> "$LOG" 2>&1; then
    echo "$newest_uuid" > "$state_file"
    log "$udid 설치 성공"
  else
    log "$udid 설치 실패 (미접속/잠금?) — 내일 재시도"; fail=1
  fi
done
exit $fail
