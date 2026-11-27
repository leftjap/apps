#!/bin/bash
# 상시 감시. launchd 가 5분마다 실행한다(손으로 실행해도 된다). 감시의 주체는 이 스크립트이고, AI 는 아래 조건에서만 불려 와 일감 쪽 오류만 고친다.
# 설정: $MAPO_LOOP_CONFIG(기본 ~/.config/mapo-loop)/dirs 에 루프 폴더(mapo 디렉터리)를 한 줄에 하나, until 에 다시 띄울 때의 마감(없으면 30시간 뒤)
# 상태·기록: $MAPO_LOOP_STATE(기본 ~/.local/state/mapo-loop)/{watchdog.log, watchdog.lock, responder.lock, attempts/, seen/, last-env.txt}
#   last-env.txt: 돌 때마다 자기 환경의 USER·LOGNAME·HOME·PATH·LANG 을 덮어 적는다(launchd 가 띄운 환경을 확인하는 용도)
# launchd 가 띄우면 USER·LOGNAME 이 없을 수 있다. Claude CLI 는 USER 가 없으면 「Not logged in」으로 끝나므로, 비어 있으면 id -un 으로 채워 자식(루프·응급 처치)에게 넘긴다
# 폴더마다 tools/sol/watch.sh 로 상태를 읽고:
#   RUNNING·RETRY_WAIT·STOPPED 0/5/7  아무것도 하지 않는다(단계 끝의 판정은 마스터와 지오의 일)
#   DEAD     tmp/loop/keep-running 이 있고 loop.log 가 3분 넘게 그대로면 resume.sh 를 새 세션으로 띄운다(1시간에 3번까지)
#   STALLED  그 폴더의 loop.sh 와 자손을 끝낸다(다음 실행에서 DEAD 로 보고 다시 띄운다)
#   STOPPED 2/3/4/6/8/9  멈춘 지 20분(마스터가 알림을 받았으면 알림 뒤 45분), 멈춘 뒤 손댄 흔적 없음, 시도 2번 미만,
#            다른 응급 처치 없음, NEEDS-MASTER.md 없음이면 응급 처치(tools/sol/responder.md 를 지시문으로 claude)를 한 번 부른다
#   STOPPED 10  CLI 로그인 오류. 응급 처치도 같은 CLI 라 똑같이 실패하므로 부르지 않고 「마스터 몫」으로 한 번만 적는다
#   STOPPED 그 밖(문서에 없는 종료 1·127 등)  응급 처치도 되살리기도 하지 않고 「마스터 몫」으로 한 번만 적는다(설명은 watch.sh 가 붙인 resume.out 끝 줄)
# 한 일은 watchdog.log 에, 루프를 건드렸으면 그 폴더의 loop.log 에도 「상시 감시가 …」 한 줄. 아무 일도 없으면 적지 않는다.
# WATCHDOG_DRY=1: 아무것도 실행하지 않고 하려던 것만 찍는다.
# 쓰는 법: tools/sol/watchdog.sh        (내부용: watchdog.sh --respond <폴더> <코드> <멈춘 시각>)
set -u
[ -n "${USER:-}" ] || USER=$(id -un)
[ -n "${LOGNAME:-}" ] || LOGNAME=$(id -un)
export USER LOGNAME
HERE=$(cd "$(dirname "$0")" && pwd)
. "$HERE/proc.sh" || exit 2
CONF="${MAPO_LOOP_CONFIG:-$HOME/.config/mapo-loop}"
STATE="${MAPO_LOOP_STATE:-$HOME/.local/state/mapo-loop}"
CLAUDE="${LOOP_CLAUDE:-claude}"
PY="${WATCHDOG_PY:-python3}"
DRY="${WATCHDOG_DRY:-}"
WAIT_MIN="${WATCHDOG_WAIT_MIN:-20}"
NOTIFIED_WAIT_MIN="${WATCHDOG_NOTIFIED_WAIT_MIN:-45}"
DEAD_QUIET_MIN="${WATCHDOG_DEAD_QUIET_MIN:-3}"
RESPOND_MAX_MIN="${WATCHDOG_RESPOND_MAX_MIN:-40}"
MAX_TRIES=2; MAX_RELAUNCH_PER_HOUR=3
mkdir -p "$STATE/attempts" "$STATE/seen" || exit 2
printf 'USER=%s\nLOGNAME=%s\nHOME=%s\nPATH=%s\nLANG=%s\n' "${USER:-}" "${LOGNAME:-}" "${HOME:-}" "${PATH:-}" "${LANG:-}" > "$STATE/last-env.txt"
WLOG="$STATE/watchdog.log"

now() { date +%s; }
mt() { stat -f %m "$1" 2>/dev/null || echo 0; }
wlog() { printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >> "$WLOG"; }
llog() { mkdir -p "$1/tmp/loop"; printf '%s 상시 감시가 %s\n' "$(date '+%Y-%m-%d %H:%M')" "$2" >> "$1/tmp/loop/loop.log"; }
key_of() { printf '%s' "$1" | shasum | cut -c1-12; }
note_once() { # 폴더 열쇠 글: 같은 폴더·같은 열쇠로는 한 번만 적는다(5분마다 같은 줄이 쌓이지 않게)
  nf="$STATE/seen/$(key_of "$1")"
  [ "$(cat "$nf" 2>/dev/null)" = "$2" ] && return 0
  [ -n "$DRY" ] && { echo "DRY $1: (기록) $3"; return 0; }
  echo "$2" > "$nf"; wlog "$1: $3"
}
detach() { # 폴더 명령… : 그 폴더를 cwd 로 새 세션에 떼어 띄운다(감시가 끝나도 남는다)
  "$PY" - "$@" <<'PY'
import subprocess, sys
subprocess.Popen(sys.argv[2:], cwd=sys.argv[1], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                 stderr=subprocess.DEVNULL, start_new_session=True)
PY
}
until_of() { cat "$CONF/until" 2>/dev/null || date -v+30H '+%Y-%m-%dT%H:%M'; }
relaunch() { # 폴더 까닭
  if [ -n "$DRY" ]; then echo "DRY $1: resume.sh 를 다시 띄우려 했다($2)"; return 0; fi
  # 프로세스가 없는데 남은 잠금은 죽은 루프의 것이다(그대로 두면 새 루프가 종료 2 로 선다)
  [ -d "$1/tmp/loop/lock" ] && rmdir "$1/tmp/loop/lock" 2>/dev/null && wlog "$1: 죽은 루프가 남긴 tmp/loop/lock 을 지웠다"
  llog "$1" "루프를 다시 띄웠다($2)"
  detach "$1" /bin/bash tools/sol/resume.sh "" "$(until_of)"
  wlog "$1: resume.sh 를 다시 띄웠다($2)"
}
raw_state() { bash "$HERE/watch.sh" --raw "$1"; }
lock_take() { # 잠금 폴더 → 잡으면 0. 주인이 죽은 잠금은 넘겨받는다
  if ! mkdir "$1" 2>/dev/null; then
    lp=$(cat "$1/pid" 2>/dev/null)
    [ -n "$lp" ] && alive_pid "$lp" && return 1
    rm -f "$1/pid"; rmdir "$1" 2>/dev/null; mkdir "$1" 2>/dev/null || return 1
  fi
  echo $$ > "$1/pid"
}
lock_drop() { rm -f "$1/pid"; rmdir "$1" 2>/dev/null; }
lock_busy() { lp=$(cat "$1/pid" 2>/dev/null); [ -n "$lp" ] && alive_pid "$lp"; }

# ---------- 응급 처치(떼어 띄운 프로세스) ----------
respond() { # 폴더 코드 멈춘 시각
  D=$1; code=$2; RL="$STATE/responder.lock"
  lock_take "$RL" || exit 0
  trap 'lock_drop "$RL"' EXIT
  ts=$(date +%Y%m%d-%H%M%S); RD="$D/tmp/loop/responder"; mkdir -p "$RD"
  id=$(awk '{print $3}' "$D/tmp/loop/last-exit" 2>/dev/null)
  pf="$RD/$ts.prompt.md"
  {
    cat "$HERE/responder.md"
    echo; echo "## 지금 상태 (상시 감시가 붙임)"
    echo "- watch.sh: $(bash "$HERE/watch.sh" --once "$D")"
    echo "- 멈춘 일감: ${id:--} (종료 $code)"
    echo "- 이번 실행의 시각 문자열: $ts"
    echo; echo "### tmp/loop/status.md"
    cat "$D/tmp/loop/status.md" 2>/dev/null
  } > "$pf"
  wlog "$D: 응급 처치 시작(종료 $code, 일감 ${id:--}, 지시문 $pf)"
  cd "$D" || exit 2
  run_capped "$RESPOND_MAX_MIN" "$CLAUDE" -p --model opus --effort high --output-format json \
    --permission-mode bypassPermissions "$(cat "$pf")" < /dev/null > "$RD/$ts.json" 2> "$RD/$ts.err"
  rc=$?
  if [ -n "$CAPPED" ]; then wlog "$D: 응급 처치가 ${RESPOND_MAX_MIN}분 상한을 넘어 끝냈다($RD/$ts.json)"
  else wlog "$D: 응급 처치 끝(종료 $rc, 답 $RD/$ts.json)"; fi
  if [ -f "$RD/$ts.relaunch" ]; then
    st=$(raw_state "$D" | cut -f1)
    case "$st" in
      STOPPED*) relaunch "$D" "응급 처치가 일감을 고쳤다: $RD/$ts.md" ;;
      *) wlog "$D: .relaunch 가 있지만 상태가 $st 라 띄우지 않는다" ;;
    esac
  else
    nm=; [ -f "$D/tmp/loop/NEEDS-MASTER.md" ] && nm=" NEEDS-MASTER.md 를 남겼다."
    wlog "$D: 응급 처치가 다시 띄우라는 표시(.relaunch)를 남기지 않았다.$nm 루프는 그대로 둔다"
  fi
}
if [ "${1:-}" = --respond ]; then respond "$2" "$3" "$4"; exit 0; fi

# ---------- 5분마다 ----------
maybe_respond() { # 폴더 코드 멈춘 시각 자세한 것
  D=$1; code=$2; ep=$3; n=$(now)
  # ① 멈춘 지 WAIT_MIN 분. 마스터가 알림을 받은 뒤라면 그 알림에서 NOTIFIED_WAIT_MIN 분
  [ $(( n - ep )) -ge $(( WAIT_MIN * 60 )) ] || return 0
  mn=$(cat "$D/tmp/loop/master-notified" 2>/dev/null); mn=${mn:-0}
  if [ "$mn" -gt "$ep" ] && [ $(( n - mn )) -lt $(( NOTIFIED_WAIT_MIN * 60 )) ]; then return 0; fi
  # ⑤ 마스터 몫이라고 남긴 진단이 있다
  if [ -f "$D/tmp/loop/NEEDS-MASTER.md" ] && [ "$(mt "$D/tmp/loop/NEEDS-MASTER.md")" -gt "$ep" ]; then
    note_once "$D" "needs-$ep" "STOPPED $code: NEEDS-MASTER.md 가 있어 마스터를 기다린다"; return 0
  fi
  # ② 멈춘 뒤 누가 손댄 흔적(이 폴더의 새 커밋, 일감 폴더·tools/sol 의 새 파일)
  ct=$(git -C "$D" log -1 --format=%ct -- . 2>/dev/null); ct=${ct:-0}
  if [ "$ct" -gt "$ep" ]; then note_once "$D" "touched-$ep" "STOPPED $code: 멈춘 뒤 새 커밋이 있다(누가 손대는 중). 부르지 않는다"; return 0; fi
  ref="$STATE/seen/ref.$$"; touch -t "$(date -r "$ep" '+%Y%m%d%H%M.%S')" "$ref"
  newer=$(find "$D/docs/redraw-orders/queue" "$D/tools/sol" -type f -newer "$ref" 2>/dev/null | head -1)
  rm -f "$ref"
  if [ -n "$newer" ]; then note_once "$D" "touched-$ep" "STOPPED $code: 멈춘 뒤 바뀐 파일이 있다($newer). 부르지 않는다"; return 0; fi
  # ③ 이 멈춤에 대한 시도 횟수
  af="$STATE/attempts/$(key_of "$D")-$ep"; tries=$(cat "$af" 2>/dev/null); tries=${tries:-0}
  if [ "$tries" -ge "$MAX_TRIES" ]; then note_once "$D" "tries-$ep" "STOPPED $code: 응급 처치를 ${MAX_TRIES}번 불렀는데 아직 서 있다. 마스터 몫"; return 0; fi
  # ④ 다른 응급 처치가 돈다
  lock_busy "$STATE/responder.lock" && return 0
  if [ -n "$DRY" ]; then echo "DRY $D: 응급 처치를 부르려 했다(STOPPED $code, $(( (n - ep) / 60 ))분, 시도 $((tries + 1)))"; return 0; fi
  echo $((tries + 1)) > "$af"
  wlog "$D: STOPPED $code ($(( (n - ep) / 60 ))분 전) → 응급 처치를 부른다(시도 $((tries + 1))/$MAX_TRIES)"
  detach "$D" /bin/bash "$HERE/watchdog.sh" --respond "$D" "$code" "$ep"
}

handle() { # 폴더
  D=$(cd "$1" 2>/dev/null && pwd -P) || { note_once "$1" missing "루프 폴더가 없다"; return 0; }
  raw=$(raw_state "$D")
  st=${raw%%$'\t'*}; rest=${raw#*$'\t'}; ep=${rest%%$'\t'*}; detail=${rest#*$'\t'}
  case "$st" in
    RUNNING|RETRY_WAIT|"STOPPED 0"|"STOPPED 5"|"STOPPED 7") return 0 ;;
    DEAD)
      if [ ! -f "$D/tmp/loop/keep-running" ]; then
        note_once "$D" "dead-nokeep-$ep" "DEAD 이지만 keep-running 이 없어 다시 띄우지 않는다: $detail"; return 0
      fi
      [ $(( $(now) - ep )) -ge $(( DEAD_QUIET_MIN * 60 )) ] || return 0
      rf="$STATE/attempts/$(key_of "$D")-relaunch"; cut0=$(( $(now) - 3600 ))
      recent=$(awk -v c="$cut0" '$1 >= c' "$rf" 2>/dev/null | grep -c .)
      if [ "$recent" -ge "$MAX_RELAUNCH_PER_HOUR" ]; then
        note_once "$D" "storm-$ep" "DEAD: 1시간에 ${MAX_RELAUNCH_PER_HOUR}번 되살렸는데 또 죽었다. 더 띄우지 않는다(마스터 몫): $detail"; return 0
      fi
      [ -n "$DRY" ] || now >> "$rf"
      relaunch "$D" "DEAD: $detail" ;;
    STALLED)
      if [ -n "$DRY" ]; then echo "DRY $D: 멈춰 선 loop.sh 를 끝내려 했다($detail)"; return 0; fi
      k=0; for p in $(pids_in loop.sh "$D"); do alive_pid "$p" && { kill_tree "$p"; k=$((k + 1)); }; done
      llog "$D" "멈춰 선 loop.sh 를 끝냈다(STALLED: $detail). 다음 감시에서 DEAD 로 보고 다시 띄운다"
      wlog "$D: STALLED → loop.sh 프로세스 ${k}개를 끝냈다($detail)" ;;
    "STOPPED 2"|"STOPPED 3"|"STOPPED 4"|"STOPPED 6"|"STOPPED 8"|"STOPPED 9")
      maybe_respond "$D" "${st#STOPPED }" "$ep" "$detail" ;;
    "STOPPED 10")
      note_once "$D" "login-$ep" "STOPPED 10: Claude CLI 로그인 오류로 섰다. 응급 처치도 같은 CLI 라 부르지 않는다(마스터 몫): $detail" ;;
    STOPPED*)
      note_once "$D" "undoc-$st-$ep" "$st: 문서에 없는 종료라 응급 처치도 되살리기도 하지 않는다(마스터 몫): $detail" ;;
    *) note_once "$D" "other-$st-$ep" "$st 는 상시 감시가 다루지 않는다: $detail" ;;
  esac
}

lock_take "$STATE/watchdog.lock" || exit 0
trap 'lock_drop "$STATE/watchdog.lock"' EXIT
[ -f "$CONF/dirs" ] || { note_once "$CONF" nodirs "설정 $CONF/dirs 가 없다"; exit 0; }
while IFS= read -r d; do
  case "$d" in ''|'#'*) continue ;; esac
  handle "$d" < /dev/null
done < "$CONF/dirs"
exit 0
