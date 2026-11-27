# 루프 도구들이 함께 쓰는 프로세스 함수(source 로 읽는다). loop.sh·watch.sh·watchdog.sh·stop.sh 가 쓴다.
# 쓰는 변수: KILL_GRACE(TERM 뒤 KILL 까지 초, 기본 10). run_capped 는 CUR_PID·CAPPED 를 남긴다.
KILL_GRACE="${KILL_GRACE:-10}"
CUR_PID=; CAPPED=
alive_pid() { # 좀비가 아닌 프로세스면 0
  st=$(ps -o stat= -p "$1" 2>/dev/null)
  case "$st" in ''|Z*) return 1 ;; esac
}
tree_pids() { for tp_c in $(pgrep -P "$1" 2>/dev/null); do tree_pids "$tp_c"; done; echo "$1"; }
kill_tree() { # PID 와 그 자손에 TERM, KILL_GRACE 초 뒤 남은 것에 KILL
  kt_pids=$(tree_pids "$1")
  kill -TERM $kt_pids 2>/dev/null
  kt_i=0
  while [ "$kt_i" -lt "$KILL_GRACE" ]; do
    kt_alive=; for kt_p in $kt_pids; do alive_pid "$kt_p" && kt_alive=1; done
    [ -n "$kt_alive" ] || return 0
    sleep 1; kt_i=$((kt_i + 1))
  done
  kill -KILL $kt_pids $(tree_pids "$1") 2>/dev/null
}
run_capped() { # 상한(분) 명령… : 상한을 넘으면 명령과 그 자손을 끝내고 CAPPED=1, 124 를 돌려준다
  rc_lim=$(awk -v m="$1" 'BEGIN{s=int(m*60+0.5); if(s<1)s=1; print s}'); shift
  CAPPED=; rc_t0=$(date +%s)
  "$@" <&0 &
  CUR_PID=$!
  while alive_pid "$CUR_PID"; do
    if [ $(( $(date +%s) - rc_t0 )) -ge "$rc_lim" ]; then
      kill_tree "$CUR_PID"; wait "$CUR_PID" 2>/dev/null
      CUR_PID=; CAPPED=1; return 124
    fi
    # 짧게 끝나는 단계가 1초씩 기다리지 않게 처음 5초는 자주 본다
    if [ $(( $(date +%s) - rc_t0 )) -lt 5 ]; then sleep 0.2; else sleep 1; fi
  done
  wait "$CUR_PID"; rc_code=$?; CUR_PID=
  return "$rc_code"
}
pids_in() { # 스크립트 이름(loop.sh|resume.sh) 폴더(실제 경로) → 그 폴더를 cwd 로 하는 tools/sol/<이름> 프로세스의 PID
  ps -axo pid=,args= | awk -v s="tools/sol/$1" '
    function ends(x) { return length(x) >= length(s) && substr(x, length(x) - length(s) + 1) == s }
    ends($2) || ($2 ~ /(^|\/)(ba|z)?sh$/ && ends($3)) { print $1 }' | while read -r pi_p; do
    [ "$(lsof -a -d cwd -p "$pi_p" -Fn 2>/dev/null | sed -n 's/^n//p' | head -1)" = "$2" ] && echo "$pi_p"
  done
}
