#!/bin/bash
# 루프 폴더(mapo 디렉터리)의 상태를 밖에서 읽는다. 누가 루프를 띄웠든, 멈추거나 죽으면 알 수 있게 한다.
# 쓰는 법: tools/sol/watch.sh [--once | --until-attention] <루프 폴더>…
#   폴더마다 한 줄: <폴더> <상태> <자세한 것>
#     RUNNING     그 폴더를 cwd 로 하는 loop.sh 가 돈다
#     RETRY_WAIT  resume.sh 만 살아 있다(종료 7 뒤 기다리는 중)
#     STOPPED <코드>  둘 다 없고 마지막 멈춤 기록이 그 코드다
#     DEAD        둘 다 없는데 마지막 기록이 멈춤 기록이 아니다(죽었거나 죽임당했다)
#     STALLED     loop.sh 는 도는데 loop.log 와 tmp/loop/<일감>/ 이 WATCH_STALL_MIN(180)분 넘게 그대로다
#   --once(기본): 한 번 찍고 끝. --until-attention: WATCH_POLL(20)초마다 보다가 STOPPED(WATCH_IGNORE 의 코드, 기본 7 제외)·DEAD·STALLED 가
#   되면 그 줄만 찍고 종료 0. 마스터 세션이 배경으로 띄워 두면 멈춘 순간 한 번 알림을 받는다.
set -u
mode=--once
case "${1:-}" in --once|--until-attention) mode=$1; shift ;; esac
[ $# -ge 1 ] || { echo "쓰는 법: tools/sol/watch.sh [--once | --until-attention] <루프 폴더>…" >&2; exit 2; }
STALL_MIN="${WATCH_STALL_MIN:-180}"
POLL="${WATCH_POLL:-20}"
IGNORE=" ${WATCH_IGNORE:-7} "
QUEUE_REL="docs/redraw-orders/queue.md"

mt() { stat -f %m "$1" 2>/dev/null || echo 0; }
ago() { echo $(( ($(date +%s) - $1) / 60 )); }
hm() { date -r "$1" '+%m-%d %H:%M'; }
has_proc() { # 스크립트 이름(loop.sh|resume.sh) 폴더 → 그 폴더를 cwd 로 하는 그 스크립트 프로세스가 있으면 0
  ps -axo pid=,args= | awk -v s="tools/sol/$1" '
    function ends(x) { return length(x) >= length(s) && substr(x, length(x) - length(s) + 1) == s }
    ends($2) || ($2 ~ /(^|\/)(ba|z)?sh$/ && ends($3)) { print $1 }' | {
    while read -r p; do
      cwd=$(lsof -a -d cwd -p "$p" -Fn 2>/dev/null | sed -n 's/^n//p' | head -1)
      [ "$cwd" = "$2" ] && exit 0
    done
    exit 1
  }
}
first_sentence() { # status.md 본문 첫 문장
  sed -n '3p' "$1" 2>/dev/null | awk '{ i = index($0, ". "); print (i ? substr($0, 1, i) : $0) }'
}

state_of() { # 폴더 → "상태<TAB>자세한 것"
  D=$1; L="$D/tmp/loop/loop.log"; E="$D/tmp/loop/last-exit"; RO="$D/tmp/loop/resume.out"
  llm=$(mt "$L"); last=$(tail -1 "$L" 2>/dev/null)
  if has_proc loop.sh "$D"; then
    task=$(grep -m1 '^- \[ \] ' "$D/$QUEUE_REL" 2>/dev/null | awk '{print $4}')
    newest=$llm
    if [ -n "$task" ] && [ -d "$D/tmp/loop/$task" ]; then
      for f in "$D/tmp/loop/$task" "$D/tmp/loop/$task"/*; do
        [ -e "$f" ] || continue; m=$(mt "$f"); [ "$m" -gt "$newest" ] && newest=$m
      done
    fi
    if awk -v a="$(( $(date +%s) - newest ))" -v m="$STALL_MIN" 'BEGIN{exit !(a >= m * 60)}'; then
      printf 'STALLED\t일감 %s, 기록과 일감 파일이 %s분째 그대로다(마지막 기록 %s)\n' "${task:--}" "$(ago "$newest")" "${last:0:16}"
    else
      printf 'RUNNING\t일감 %s, 마지막 기록 %s(%s분 전)\n' "${task:--}" "${last:0:16}" "$(ago "$llm")"
    fi
    return
  fi
  if has_proc resume.sh "$D"; then
    printf 'RETRY_WAIT\tresume.sh 가 다음 시도를 기다린다(마지막 기록 %s, %s분 전)\n' "${last:0:16}" "$(ago "$llm")"
    return
  fi
  code=; when=
  if [ -f "$E" ] && [ "$(mt "$E")" -ge "$llm" ]; then
    read -r code when _ < "$E"
  elif c=$(printf '%s' "$last" | sed -n 's/^[0-9-]* [0-9:]* 멈춤(종료 \([0-9][0-9]*\)).*/\1/p') && [ -n "$c" ]; then
    code=$c; when=$llm
  else
    rl=$(tail -1 "$RO" 2>/dev/null)
    c=$(printf '%s' "$rl" | sed -n 's/.* loop 종료 \([0-9][0-9]*\)$/\1/p')
    [ -n "$c" ] && [ "$(mt "$RO")" -ge "$llm" ] && { code=$c; when=$(mt "$RO"); }
  fi
  if [ -n "$code" ]; then
    printf 'STOPPED %s\t%s 에 멈춤(%s분 전). %s\n' "$code" "$(hm "$when")" "$(ago "$when")" "$(first_sentence "$D/tmp/loop/status.md")"
  elif [ -f "$L" ]; then
    printf 'DEAD\tloop.sh 도 resume.sh 도 없는데 마지막 기록이 멈춤이 아니다(%s분 전): %s\n' "$(ago "$llm")" "$last"
  else
    printf 'DEAD\t루프 기록(%s)이 없다\n' "$L"
  fi
}

while :; do
  att=
  for a in "$@"; do
    D=$(cd "$a" 2>/dev/null && pwd -P) || { line="$a DEAD 폴더가 없다"; [ "$mode" = --once ] && echo "$line"; att="$att$line"$'\n'; continue; }
    s=$(state_of "$D"); st=${s%%$'\t'*}; line="$a $st ${s#*$'\t'}"
    [ "$mode" = --once ] && { echo "$line"; continue; }
    case "$st" in
      DEAD|STALLED) att="$att$line"$'\n' ;;
      STOPPED*) case "$IGNORE" in *" ${st#STOPPED } "*) ;; *) att="$att$line"$'\n' ;; esac ;;
    esac
  done
  [ "$mode" = --once ] && exit 0
  [ -n "$att" ] && { printf '%s' "$att"; exit 0; }
  sleep "$POLL"
done
