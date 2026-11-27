#!/bin/bash
# 루프를 일부러 멈춘다: keep-running 표시를 지우고, 그 폴더의 resume.sh·loop.sh 와 자손을 끝내고, loop.log 에 한 줄을 남긴다.
# 표시가 없으므로 상시 감시(watchdog.sh)는 이 루프를 되살리지 않는다. 다시 돌릴 때는 tools/sol/resume.sh 로 띄운다.
# 쓰는 법: tools/sol/stop.sh <루프 폴더(mapo 디렉터리)>
set -u
[ $# -eq 1 ] || { echo "쓰는 법: tools/sol/stop.sh <루프 폴더>" >&2; exit 2; }
D=$(cd "$1" 2>/dev/null && pwd -P) || { echo "stop.sh: 폴더가 없다: $1" >&2; exit 2; }
. "$(dirname "$0")/proc.sh" || exit 2
rm -f "$D/tmp/loop/keep-running"
n=0
# resume.sh 를 먼저 끝내야 loop.sh 가 끝난 뒤 다시 띄우지 않는다
for s in resume.sh loop.sh; do
  for p in $(pids_in "$s" "$D"); do
    alive_pid "$p" || continue
    kill_tree "$p"; n=$((n + 1))
  done
done
mkdir -p "$D/tmp/loop"
printf '%s 마스터가 멈췄다(stop.sh, 프로세스 %s개). 상시 감시는 이 루프를 되살리지 않는다\n' "$(date '+%Y-%m-%d %H:%M')" "$n" >> "$D/tmp/loop/loop.log"
echo "stop.sh: $D 의 루프를 멈췄다(프로세스 ${n}개, keep-running 지움)"
