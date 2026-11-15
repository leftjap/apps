#!/bin/zsh
# 여러 Claude 세션이 무거운 작업(시뮬레이션 측정, 헤드리스 크롬 fps·스크린샷, pnpm bake, pnpm test 전체)을
# 한 번에 하나만 돌리게 하는 잠금. 사용법: heavy.sh <제한 초> <명령...>
# - 다른 세션이 잡고 있으면 끝날 때까지 기다린다(잡은 프로세스가 죽었으면 잠금을 푼다).
# - 1분 평균 부하가 7 이상이면 내려갈 때까지 기다린다.
# - nice 15 로 낮은 우선순위, 제한 초가 지나면 끝낸다.
# - 끝난 뒤 20초 동안 잠금을 쥐고 쉬어서, 무거운 작업이 쉬지 않고 이어지지 않게 한다(팬 소음).

LOCK=/tmp/claude-heavy.lock
limit=$1; shift
while ! mkdir "$LOCK" 2>/dev/null; do
  holder=$(cat "$LOCK/pid" 2>/dev/null)
  if [[ -n $holder ]] && ! kill -0 $holder 2>/dev/null; then
    rm -f "$LOCK/pid" "$LOCK/cmd"; rmdir "$LOCK" 2>/dev/null; continue
  fi
  sleep 5
done
echo $$ > "$LOCK/pid"
echo "$*" > "$LOCK/cmd"
trap 'rm -f "$LOCK/pid" "$LOCK/cmd"; rmdir "$LOCK" 2>/dev/null' EXIT INT TERM
while (( $(sysctl -n vm.loadavg | awk '{print int($2)}') >= 7 )); do sleep 10; done
nice -n 15 perl -e 'alarm shift; exec @ARGV' "$limit" "$@"
rc=$?
sleep 20
exit $rc
