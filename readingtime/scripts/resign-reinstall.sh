#!/bin/zsh
# 리딩타임 무료팀(7일 TTL) 재서명·재설치 — 공용 코어 ~/apps/scripts/resign-verify.sh 에 위임.
# launchd: ~/Library/LaunchAgents/com.leftjap.readingtime.resign.plist (매일 21:30).
#
# 이전 인라인 로직은 (a) 캐시 프로파일 만료로 판정(폰에 실제 박힌 embedded 가 아님) (b) 갱신 시
# clean 미선행(증분 freeze 위험) (c) 갱신됐는지 사후 검증 없음 — gym 을 죽인 것과 같은 잠재 결함.
# 공용 코어가 embedded 기준 판정 + clean 강제 + 만료일 검증 + 실패 알림 으로 해소.
# 주의: 빌드는 ~/apps/readingtime 워킹트리 현재 상태를 그대로 집는다 (미커밋 WIP 포함).
set -u
export LOG=$HOME/Library/Logs/readingtime-resign.log
source /Users/gio_c/apps/scripts/resign-verify.sh

resign_verify \
  $HOME/apps/readingtime/ReadingTime.xcodeproj ReadingTime com.leftjap.readingtime \
  $HOME/.local/share/readingtime-resign/dd ReadingTime \
  7E959831-9CD6-5413-8ADB-2A04D72C5073 \
  4DBC8522-14E4-5308-B527-E43DAEB2DAE4   # 지오 iPhone 11 Pro · 소연 iPhone XR
exit $?
