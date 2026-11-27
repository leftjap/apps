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
#   알림 줄을 찍을 때 그 폴더의 tmp/loop/master-notified 에 지금 시각(epoch)을 쓴다(상시 감시 watchdog.sh 가 읽는다).
#   --raw: 폴더마다 「상태<TAB>시각(epoch)<TAB>자세한 것」(시각은 STOPPED 면 멈춘 때, 그 밖에는 loop.log 가 바뀐 때). watchdog.sh 가 쓴다
#   resume.out 의 끝이 신호 종료(128 이상)면 STOPPED 가 아니라 DEAD 로 본다(죽임당했다).
#   STOPPED 의 자세한 것은 status.md 의 첫 문장이다. 다만 resume.out 의 마지막 종료가 멈춤 기록(finish)보다 뒤라
#   status.md 가 그 전 것이면(문서에 없는 종료 1·127 등) 그 문장 대신 「문서에 없는 종료 N. status.md 는 그 전 것」과
#   resume.out 끝 줄(3줄 안쪽, 줄마다 200자 안쪽)을 붙인다. 문서에 있는 종료는 loop.sh 맨 위 주석의 0·2~10 이다(10 은 CLI 로그인 오류).
set -u
mode=--once
case "${1:-}" in --once|--until-attention|--raw) mode=$1; shift ;; esac
[ $# -ge 1 ] || { echo "쓰는 법: tools/sol/watch.sh [--once | --until-attention | --raw] <루프 폴더>…" >&2; exit 2; }
. "$(dirname "$0")/proc.sh" || exit 2
STALL_MIN="${WATCH_STALL_MIN:-180}"
POLL="${WATCH_POLL:-20}"
IGNORE=" ${WATCH_IGNORE:-7} "
QUEUE_REL="docs/redraw-orders/queue.md"

mt() { stat -f %m "$1" 2>/dev/null || echo 0; }
ago() { echo $(( ($(date +%s) - $1) / 60 )); }
hm() { date -r "$1" '+%m-%d %H:%M'; }
has_proc() { [ -n "$(pids_in "$1" "$2")" ]; } # 그 폴더를 cwd 로 하는 tools/sol/<이름> 이 있으면 0
first_sentence() { # status.md 본문 첫 문장
  sed -n '3p' "$1" 2>/dev/null | awk '{ i = index($0, ". "); print (i ? substr($0, 1, i) : $0) }'
}
ro_tail() { # resume.out 의 마지막 종료 줄 앞의 줄들(3줄 안쪽, 줄마다 200자 안쪽)을 한 줄로
  tail -4 "$1" 2>/dev/null | awk '{ l[NR] = $0 } END { n = NR; if (n && l[n] ~ / loop 종료 [0-9]+$/) n--
    s = ""; for (i = (n > 3 ? n - 2 : 1); i <= n; i++) if (l[i] ~ /[^ \t]/) s = s (s == "" ? "" : " | ") substr(l[i], 1, 200); print s }'
}

state_of() { # 폴더 → "상태<TAB>시각<TAB>자세한 것"
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
      printf 'STALLED\t%s\t일감 %s, 기록과 일감 파일이 %s분째 그대로다(마지막 기록 %s)\n' "$llm" "${task:--}" "$(ago "$newest")" "${last:0:16}"
    else
      printf 'RUNNING\t%s\t일감 %s, 마지막 기록 %s(%s분 전)\n' "$llm" "${task:--}" "${last:0:16}" "$(ago "$llm")"
    fi
    return
  fi
  if has_proc resume.sh "$D"; then
    printf 'RETRY_WAIT\t%s\tresume.sh 가 다음 시도를 기다린다(마지막 기록 %s, %s분 전)\n' "$llm" "${last:0:16}" "$(ago "$llm")"
    return
  fi
  code=; when=; killed=
  if [ -f "$E" ] && [ "$(mt "$E")" -ge "$llm" ]; then
    read -r code when _ < "$E"
  elif c=$(printf '%s' "$last" | sed -n 's/^[0-9-]* [0-9:]* 멈춤(종료 \([0-9][0-9]*\)).*/\1/p') && [ -n "$c" ]; then
    code=$c; when=$llm
  fi
  # resume.out 의 마지막 줄이 멈춤 기록보다 뒤의 종료면(finish 를 거치지 않고 끝났다) 그것이 마지막 종료다
  c=$(tail -1 "$RO" 2>/dev/null | sed -n 's/.* loop 종료 \([0-9][0-9]*\)$/\1/p'); rt=$(mt "$RO")
  if [ -n "$c" ] && [ "$rt" -ge "$llm" ] && { [ -z "$code" ] || [ "$rt" -gt $(( when + 5 )) ]; }; then
    code=$c; when=$rt
    [ "$code" -ge 128 ] && { killed=$code; code=; }
  fi
  if [ -n "$code" ]; then
    S="$D/tmp/loop/status.md"
    if [ "$(mt "$S")" -ge $(( when - 5 )) ]; then why=$(first_sentence "$S")
    else
      case " 0 2 3 4 5 6 7 8 9 10 " in *" $code "*) why="멈춤 기록 없이 끝난 종료 $code" ;; *) why="문서에 없는 종료 $code" ;; esac
      why="$why. status.md 는 그 전 것. resume.out 끝: $(ro_tail "$RO")"
    fi
    printf 'STOPPED %s\t%s\t%s 에 멈춤(%s분 전). %s\n' "$code" "$when" "$(hm "$when")" "$(ago "$when")" "$why"
  elif [ -n "$killed" ]; then
    printf 'DEAD\t%s\tresume.sh 가 신호로 끝난 루프를 적고 끝났다(종료 %s, %s분 전)\n' "$llm" "$killed" "$(ago "$(mt "$RO")")"
  elif [ -f "$L" ]; then
    printf 'DEAD\t%s\tloop.sh 도 resume.sh 도 없는데 마지막 기록이 멈춤이 아니다(%s분 전): %s\n' "$llm" "$(ago "$llm")" "$last"
  else
    printf 'DEAD\t0\t루프 기록(%s)이 없다\n' "$L"
  fi
}

while :; do
  att=
  for a in "$@"; do
    D=$(cd "$a" 2>/dev/null && pwd -P) || { line="$a DEAD 폴더가 없다"; [ "$mode" = --until-attention ] || echo "$line"; att="$att$line"$'\n'; continue; }
    s=$(state_of "$D")
    [ "$mode" = --raw ] && { echo "$s"; continue; }
    st=${s%%$'\t'*}; rest=${s#*$'\t'}; line="$a $st ${rest#*$'\t'}"
    [ "$mode" = --once ] && { echo "$line"; continue; }
    hit=
    case "$st" in
      DEAD|STALLED) hit=1 ;;
      STOPPED*) case "$IGNORE" in *" ${st#STOPPED } "*) ;; *) hit=1 ;; esac ;;
    esac
    if [ -n "$hit" ]; then
      att="$att$line"$'\n'
      mkdir -p "$D/tmp/loop" && date +%s > "$D/tmp/loop/master-notified"
    fi
  done
  [ "$mode" = --until-attention ] || exit 0
  [ -n "$att" ] && { printf '%s' "$att"; exit 0; }
  sleep "$POLL"
done
