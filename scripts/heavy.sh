#!/bin/zsh
# 여러 Claude 세션이 무거운 작업(시뮬레이션 측정, 헤드리스 크롬 fps·스크린샷, pnpm bake, pnpm test 전체)을
# 한 번에 하나만 돌리게 하는 잠금. 사용법: heavy.sh <제한 초> <명령...>
# - 다른 세션이 잡고 있으면 끝날 때까지 기다린다(잡은 쪽이 적어 둔 끝 시각이 지났으면 잠금을 푼다).
# - 1분 평균 부하가 7 이상이면 내려갈 때까지 기다린다(최대 5분).
# - 낮은 우선순위(nice 15)로 돌리고, 제한 초가 지나면 끝낸다.
# - 끝난 뒤 20초 동안 잠금을 쥐고 쉬어서, 무거운 작업이 쉬지 않고 이어지지 않게 한다(팬 소음).
# 샌드박스 안에서도 돌아야 한다: /tmp 바로 아래에는 쓸 수 없고, 다른 세션의 프로세스는 보이지 않으며,
# sysctl 과 우선순위 낮추기가 막혀 있다. 그래서 잠금은 /tmp/claude 아래에 두고, 죽은 잠금은 프로세스가 아니라 시각으로 가린다.

mkdir -p /tmp/claude 2>/dev/null
LOCK=/tmp/claude/heavy.lock
limit=$1; shift
now() { date +%s; }
while ! mkdir "$LOCK" 2>/dev/null; do
  until=$(cat "$LOCK/until" 2>/dev/null)
  made=$(stat -f %m "$LOCK" 2>/dev/null)
  # 끝 시각이 지났거나, 끝 시각을 적지 못한 채 15초 넘게 남아 있는 잠금은 죽은 것으로 본다
  if { [[ -n $until ]] && (( $(now) > until )); } || { [[ -z $until && -n $made ]] && (( $(now) - made > 15 )); }; then
    rm -f "$LOCK/until" "$LOCK/cmd"; rmdir "$LOCK" 2>/dev/null; continue
  fi
  sleep 5
done
echo $(( $(now) + limit + 340 )) > "$LOCK/until"
echo "$*" > "$LOCK/cmd"
trap 'rm -f "$LOCK/until" "$LOCK/cmd"; rmdir "$LOCK" 2>/dev/null' EXIT INT TERM
load1() { uptime 2>/dev/null | sed -n 's/.*load averages*: *\([0-9]*\).*/\1/p'; }
waited=0
while (( ${$(load1):-0} >= 7 && waited < 300 )); do sleep 10; (( waited += 10 )); done
# 남은 메모리가 25% 아래면 올라올 때까지 기다린다(최대 5분). 측정 node 여럿이 겹쳐 스왑이 6GB 중 5GB 찬 일이 있었다(2026-11-18)
memfree() { memory_pressure 2>/dev/null | sed -n 's/.*free percentage: *\([0-9]*\)%.*/\1/p'; }
waited=0
while (( ${$(memfree):-100} < 25 && waited < 300 )); do sleep 10; (( waited += 10 )); done
echo $(( $(now) + limit + 40 )) > "$LOCK/until"
if nice -n 15 true 2>/dev/null; then
  nice -n 15 perl -e 'alarm shift; exec @ARGV' "$limit" "$@"
else
  perl -e 'alarm shift; exec @ARGV' "$limit" "$@"
fi
rc=$?
sleep 20
exit $rc
