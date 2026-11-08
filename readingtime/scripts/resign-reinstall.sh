#!/bin/zsh
# 리딩타임 무료팀(7일 TTL) 재서명·재설치 — 공용 코어 ~/apps/scripts/resign-verify.sh 에 위임.
# launchd: ~/Library/LaunchAgents/com.leftjap.readingtime.resign.plist (30분 주기 + 로그인 직후 1회).
#
# 이전 인라인 로직은 (a) 캐시 프로파일 만료로 판정(폰에 실제 박힌 embedded 가 아님) (b) 갱신 시
# clean 미선행(증분 freeze 위험) (c) 갱신됐는지 사후 검증 없음 — gym 을 죽인 것과 같은 잠재 결함.
# 공용 코어가 embedded 기준 판정 + clean 강제 + 만료일 검증 + 실패 알림 으로 해소.
#
# 빌드 소스 (2026-11-08): 예전엔 ~/apps/readingtime 작업 트리를 그대로 빌드해, 세션이 고치던 중인 미커밋 변경이
# 매일 폰에 깔렸다. 이제 재빌드 직전에 푸시된 origin/main 의 readingtime/ 만 따로 꺼내 빌드한다
# (로컬 WIP(claude-snapshot) 커밋도 제외). 폰트는 저장소에 없어(.gitignore) 작업 트리에서 복사한다.
# 무엇이 빌드될지 확인: RT_PREPARE_ONLY=1 zsh readingtime/scripts/resign-reinstall.sh → 로그에 커밋이 남는다.
set -u
export LOG=$HOME/Library/Logs/readingtime-resign.log
# 서명 1일 경과 시 매일 재서명 = 항상 6일+ 버퍼 (기본 4 는 갱신 직전 출국 시 4일치만 들고 나감 —
# 2026-07-17 시애틀 소연 폰 만료 사고의 구조적 원인). 구 값 7은 "매 실행 재빌드"와 동치라
# 30분 주기 전환(2026-08-10) 시 재빌드 폭주 — 6이 같은 "매일 갱신" 의미를 주기 안전하게 보존.
export REBUILD_THRESHOLD_DAYS=6
# Release 구성 (2026-11-08) — 예전엔 최적화 없는 Debug(-Onone)가 폰에 깔렸다. 시뮬레이터 UI 테스트 전체를 Release 로
# 돌려 기존 실패 1건(매달 3일 이후 testMonthNavigation) 외 통과, 기기용 Release 빌드(위젯 포함) 컴파일 확인.
export BUILD_CONFIG=Release
source /Users/gio_c/apps/scripts/resign-verify.sh

REPO=${RT_REPO:-$HOME/apps}
SRC=${RT_SRC:-$HOME/.local/share/readingtime-resign/src}

rv_prepare_source() {
  # 받지 못하면(오프라인·인증) 마지막으로 받은 origin/main 으로 빌드한다 — 푸시는 이 맥에서 하므로 대개 최신이다
  /usr/bin/git -C "$REPO" fetch -q origin main >> "$LOG" 2>&1 || _rv_log "git fetch 실패 — 마지막으로 받은 origin/main 으로 빌드"
  local rev
  rev=$(/usr/bin/git -C "$REPO" rev-parse --short origin/main) || return 1
  /bin/rm -rf "$SRC" && /bin/mkdir -p "$SRC" || return 1
  /usr/bin/git -C "$REPO" archive origin/main readingtime | /usr/bin/tar -x -C "$SRC" || return 1
  /bin/cp -R "$REPO/readingtime/ReadingTimeKit/Sources/RTViews/Fonts" "$SRC/readingtime/ReadingTimeKit/Sources/RTViews/" || return 1
  _rv_log "빌드 소스 = origin/main $rev (푸시된 커밋만 — 작업 트리의 미커밋 변경 제외)"
}

if [[ ${RT_PREPARE_ONLY:-0} == 1 ]]; then rv_prepare_source; exit $?; fi

resign_verify \
  "$SRC/readingtime/ReadingTime.xcodeproj" ReadingTime com.leftjap.readingtime \
  $HOME/.local/share/readingtime-resign/dd ReadingTime \
  7E959831-9CD6-5413-8ADB-2A04D72C5073 \
  3587B7A1-B2F0-50F9-88DB-116441284DC6   # 지오 iPhone 11 Pro · 소연 iPhone 17
exit $?
