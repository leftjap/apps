#!/bin/zsh
# Gym 무료 프로비저닝 자동 갱신 — 최신 main 을 iPhone 11 Pro 에 재서명·재설치.
#
# 무료 Apple 계정 프로파일은 7일 만료(서명일 기준). 이 스크립트를 매일 돌리면 서명일이 갱신돼
# 앱이 계속 실행 가능하다. 설치는 기기 잠금 상태에서도 성공한다(런치·UI 테스트만 잠금해제 필요).
# 업그레이드 설치라 사용자 데이터·로그인은 보존된다.
#
# build# = 실행 시각(YYYYMMDDHHMM) 으로 스탬프 → `devicectl device info apps` 로
#          잠금 해제 없이 어느 빌드가 설치됐는지 확인 가능.
#
# 수동: gym/scripts/deploy-device.sh   ·   자동: ~/Library/LaunchAgents/com.leftjap.gym.deploy.plist
set -e
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
REPO=/Users/gio_c/apps/gym
DEV=7E959831-9CD6-5413-8ADB-2A04D72C5073          # iPhone 11 Pro (paired)
DD=/Users/gio_c/Library/Developer/Xcode/DerivedData/Gym-device   # 안정 경로 (증분 빌드)
LOG="$REPO/scripts/deploy-device.log"
STAMP=$(date +%Y%m%d%H%M)

log(){ echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG"; }

cd "$REPO"
HEAD=$(git rev-parse --short HEAD 2>/dev/null || echo "?")
log "── 빌드 시작 (build#=$STAMP · HEAD=$HEAD)"
if ! xcodebuild -project Gym.xcodeproj -scheme Gym -destination "id=$DEV" \
        -derivedDataPath "$DD" -allowProvisioningUpdates \
        CURRENT_PROJECT_VERSION="$STAMP" build >> "$LOG" 2>&1; then
    log "빌드 실패 — 중단 (로그 참조)"; exit 1
fi
APP="$DD/Build/Products/Debug-iphoneos/Gym.app"

# 기기 절전 시 "연결 직후 끊김"(error 4000) → 재시도.
for i in 1 2 3; do
    if xcrun devicectl device install app --device "$DEV" "$APP" >> "$LOG" 2>&1; then
        log "설치 성공 (build#=$STAMP)"
        exit 0
    fi
    log "설치 실패 시도 $i/3 — 5s 후 재시도"
    sleep 5
done
log "설치 3회 실패 — 기기 도달 불가(절전/오프라인) 추정. 다음 실행 대기."
exit 2
