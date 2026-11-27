#!/bin/bash
# 한도로 선 루프를 다시 돌린다: 끝날 때까지 기다릴 프로세스가 있으면 기다린 뒤 loop.sh --continue, 종료 7(한도)이면 30분 뒤 다시. 다른 종료면 끝낸다.
# 쓰는 법: tools/sol/resume.sh [기다릴 PID] [마감 시각 YYYY-mm-ddTHH:MM]
# 시작할 때 tmp/loop/keep-running 에 마감 시각을 쓴다(상시 감시가 되살려도 된다는 표시)
set -u; cd "$(dirname "$0")/../.." || exit 2; mkdir -p tmp/loop
pid="${1:-}"; until="${2:-$(date -v+30H '+%Y-%m-%dT%H:%M')}"
# 상시 감시(watchdog.sh)가 죽은 루프를 다시 띄워도 된다는 표시. 일부러 멈출 때는 tools/sol/stop.sh 가 지운다
echo "$until" > tmp/loop/keep-running
while [ "$pid" != "" ] && kill -0 "$pid" 2>/dev/null; do sleep 60; done
while :; do
  bash tools/sol/loop.sh --continue >> tmp/loop/resume.out 2>&1; code=$?
  echo "$(date '+%F %T') loop 종료 $code" >> tmp/loop/resume.out
  [ "$code" = 7 ] || exit "$code"
  [ "$(date '+%Y-%m-%dT%H:%M')" \< "$until" ] || exit 7
  sleep 1800
done
