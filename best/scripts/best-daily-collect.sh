#!/bin/zsh
# best 일일 수집 — launchd 러너 (com.gio.best-daily).
#
# 왜 launchd 인가:
#   Claude scheduled-task 는 앱이 열려 있어야 발화한다 (study 는 17일 중 2일 결손한 전례).
#   launchd 는 StartCalendarInterval 시각을 슬립으로 놓치면 깨어난 직후 실행한다
#   — launchd.plist(5) 원문: "Unlike cron which skips job invocations when the computer is
#   asleep, launchd will start the job the next time the computer wakes up."
#   전원을 껐던 경우는 RunAtLoad(로그인 시 실행)가 담당한다.
#
# 중복 방지: --if-missing 이 오늘(KST) 9곳 전부 ok 면 즉시 종료한다.
#   그래서 launchd 와 Claude 루틴이 둘 다 돌아도 요청은 한 번만 나간다.

set -u
setopt NULL_GLOB   # 매치 없는 glob 이 zsh 를 죽이지 않게
LOG_DIR="$HOME/.local/share/best"
mkdir -p "$LOG_DIR"

# launchd 는 로그인 셸 PATH 를 안 물려준다 — node 를 명시적으로 찾는다.
NODE=""
for c in /opt/homebrew/bin/node /usr/local/bin/node; do
  if [ -x "$c" ]; then NODE="$c"; break; fi
done
[ -z "$NODE" ] && NODE="$(command -v node || true)"

if [ -z "${NODE:-}" ]; then
  echo "$(date '+%F %T') [fatal] node 를 찾지 못함" >&2
  exit 1
fi

cd "$HOME/apps/best" || exit 1
echo "$(date '+%F %T') [start] $NODE src/collect.mjs --if-missing"
"$NODE" src/collect.mjs --if-missing
echo "$(date '+%F %T') [exit] $?"
