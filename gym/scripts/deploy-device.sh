#!/bin/zsh
# Gym 무료 프로비저닝 자동 갱신 — 공용 코어 ~/apps/scripts/resign-verify.sh 에 위임.
# launchd: ~/Library/LaunchAgents/com.leftjap.gym.deploy.plist (30분 주기 + 로그인 직후 1회).
# 과거 매일 05:00 1회는 폰 잠김/부재 한 번에 24h 손실 → 2026-08-10 만료 사고로 주기화.
#
# 과거 인라인 로직은 만료 프로파일을 조용히 재설치하는 버그가 있었다(2026-07-15 규명):
# 증분 빌드가 서명을 재해결하지 않아 만료된 프로파일을 그대로 재-임베드 → 만료 앱을 "설치 성공"
# 으로 매일 재설치. 공용 코어가 (1) 갱신 시 clean 강제 (2) 배포 프로파일 만료일 사후 검증
# (3) 실패 시 macOS 알림 으로 해소.
set -u
export LOG=/Users/gio_c/apps/gym/scripts/deploy-device.log
# 서명 1일 경과 시 매일 재서명 — 항상 6일+ 버퍼 (기본 4는 여행 직전 버퍼 3일뿐, 2026-08-10 사고 요인)
export REBUILD_THRESHOLD_DAYS=6
source /Users/gio_c/apps/scripts/resign-verify.sh

resign_verify \
  /Users/gio_c/apps/gym/Gym.xcodeproj Gym com.leftjap.gym \
  /Users/gio_c/Library/Developer/Xcode/DerivedData/Gym-device Gym \
  7E959831-9CD6-5413-8ADB-2A04D72C5073   # 지오 iPhone 11 Pro (paired)
exit $?
