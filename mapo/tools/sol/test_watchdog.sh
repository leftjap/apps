#!/bin/bash
# tools/sol/watchdog.sh·stop.sh·watchdog-install.sh --print·watch.sh 의 master-notified 시험.
# 임시 폴더의 가짜 루프 폴더(git 저장소), 가짜 claude, 가짜 resume.sh 로 돈다. 시각은 파일 mtime 과 last-exit 의 epoch 로 흉내 낸다.
# 쓰는 법: bash tools/sol/test_watchdog.sh   (모두 통과하면 종료 0)
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
OKN=0; BADN=0
chk() { # 설명 기대 실제
  if [ "$2" = "$3" ]; then OKN=$((OKN + 1)); printf '  ok   %s = %s\n' "$1" "$3"
  else BADN=$((BADN + 1)); printf '  FAIL %s: 기대 %s, 실제 %s\n' "$1" "$2" "$3"
    [ -n "${WD_TEST_DEBUG:-}" ] && { echo "    --- watchdog.log"; sed 's/^/    /' "$STATE/watchdog.log" 2>/dev/null; }; fi
}
ROOT=$(mktemp -d /tmp/mapo-wd-test.XXXXXX); ROOT=$(cd "$ROOT" && pwd -P)
NOW=$(date +%s); OLD=$(( NOW - 4 * 3600 ))
stamp() { date -r "$1" '+%Y%m%d%H%M.%S'; }
cat > "$ROOT/fake-claude" <<'EOF'
#!/bin/bash
# 가짜 claude. 지시문에서 이번 실행의 시각 문자열을 읽어 .relaunch·NEEDS-MASTER 를 흉내 낸다
echo "claude $(pwd)" >> "$FAKE_LOG"
echo "USER=${USER:-} LOGNAME=${LOGNAME:-}" > "$FAKE_LOG.env"
ts=$(printf '%s\n' "$@" | sed -n 's/^- 이번 실행의 시각 문자열: //p' | head -1)
[ -n "${FAKE_RELAUNCH:-}" ] && : > "tmp/loop/responder/$ts.relaunch"
[ -n "${FAKE_NEEDS:-}" ] && echo "진단" > tmp/loop/NEEDS-MASTER.md
echo '{"type":"result","subtype":"success","is_error":false,"result":"ok"}'
EOF
chmod +x "$ROOT/fake-claude"
N=0

fresh() { # 새 루프 폴더 D 와 새 설정·상태
  N=$((N + 1)); D="$ROOT/loop$N/mapo"; CONF="$ROOT/conf$N"; STATE="$ROOT/state$N"
  mkdir -p "$D/tools/sol" "$D/docs/redraw-orders/queue/t1" "$D/tmp/loop" "$CONF"
  cp "$HERE/watch.sh" "$HERE/proc.sh" "$HERE/stop.sh" "$D/tools/sol/"
  printf '#!/bin/bash\ncd "$(dirname "$0")/../.."; echo "resume $*" >> tmp/resume-calls; echo "USER=${USER:-} LOGNAME=${LOGNAME:-}" > tmp/resume-env\n' > "$D/tools/sol/resume.sh"
  printf -- '- [ ] t1 일감\n' > "$D/docs/redraw-orders/queue.md"
  echo 'STAGE=s0' > "$D/docs/redraw-orders/queue/t1/task.env"
  echo 'tmp/' > "$D/.gitignore"
  ( cd "$D" && git -c init.defaultBranch=main init -q && git add -A \
    && GIT_AUTHOR_DATE="$OLD +0000" GIT_COMMITTER_DATE="$OLD +0000" git -c user.email=t@example.com -c user.name=t commit -qm init ) >/dev/null 2>&1
  find "$D" -path "$D/.git" -prune -o -exec touch -t "$(stamp "$OLD")" {} +
  echo "$D" > "$CONF/dirs"; echo 2026-12-05T00:00 > "$CONF/until"
  FAKE_LOG="$ROOT/claude$N.log"
}
stopped() { # 코드 몇 분 전
  ep=$(( $(date +%s) - $2 * 60 ))
  echo "2026-11-27 10:00 멈춤(종료 $1): 일감 t1 이 섰다." > "$D/tmp/loop/loop.log"
  printf '# 루프가 선 자리 (x)\n\n일감 t1 이 섰다. 그 뒤.\n' > "$D/tmp/loop/status.md"
  touch -t "$(stamp "$ep")" "$D/tmp/loop/loop.log" "$D/tmp/loop/status.md"
  echo "$1 $ep t1" > "$D/tmp/loop/last-exit"
}
dead() { # 몇 분 전
  echo "2026-11-27 10:00 일감 t1 1회차 검사 종료 0" > "$D/tmp/loop/loop.log"
  touch -t "$(stamp $(( $(date +%s) - $1 * 60 )))" "$D/tmp/loop/loop.log"
}
wd() { # 남은 인자는 env 에 더할 변수. WD_UNSET 에 「-u 이름」을 두면 그 변수를 빼고 띄운다(launchd 흉내)
  env ${WD_UNSET:-} MAPO_LOOP_CONFIG="$CONF" MAPO_LOOP_STATE="$STATE" LOOP_CLAUDE="$ROOT/fake-claude" FAKE_LOG="$FAKE_LOG" "$@" \
    bash "$HERE/watchdog.sh" < /dev/null > "$ROOT/wd.out" 2>&1
  # 떼어 띄운 응급 처치와 resume.sh 가 끝날 때까지 기다린다
  i=0; while pgrep -f -- "--respond $D " > /dev/null && [ $i -lt 50 ]; do sleep 0.2; i=$((i + 1)); done
  sleep 0.3
}
calls() { c=$(grep -c . "$FAKE_LOG" 2>/dev/null); echo "${c:-0}" | tr -d ' '; }
resumes() { c=$(grep -c . "$D/tmp/resume-calls" 2>/dev/null); echo "${c:-0}" | tr -d ' '; }
wlines() { c=$(grep -c . "$STATE/watchdog.log" 2>/dev/null); echo "${c:-0}" | tr -d ' '; }
fakeproc() { # 스크립트 이름 초 → 그 폴더를 cwd 로 하는 가짜 프로세스(PID 는 FP)
  ( cd "$D" && exec -a "bash tools/sol/$1 --continue" sleep "$2" ) & FP=$!; sleep 0.5
}

echo "① 도는 중·STOPPED 5·STOPPED 7 에서는 아무것도 하지 않는다"
fresh; stopped 9 30; fakeproc loop.sh 20
wd; chk "① RUNNING: 응급 처치 안 부름" 0 "$(calls)"; chk "① RUNNING: 기록 없음" 0 "$(wlines)"
kill $FP 2>/dev/null; wait $FP 2>/dev/null
for c in 5 7 0; do
  fresh; stopped $c 60; echo keep > "$D/tmp/loop/keep-running"
  wd; chk "① STOPPED $c: 부르지 않음" 0 "$(calls)"; chk "① STOPPED $c: 띄우지 않음" 0 "$(resumes)"; chk "① STOPPED $c: 기록 없음" 0 "$(wlines)"
done

echo "② DEAD"
fresh; dead 5; echo 2026-12-05T00:00 > "$D/tmp/loop/keep-running"; mkdir "$D/tmp/loop/lock"
wd; chk "② keep-running + 5분: 다시 띄움" 1 "$(resumes)"
chk "② 마감을 넘김" 1 "$(grep -c 'resume  2026-12-05T00:00' "$D/tmp/resume-calls" | tr -d ' ')"
chk "② loop.log 에 한 줄" 1 "$(grep -c '상시 감시가 루프를 다시 띄웠다' "$D/tmp/loop/loop.log" | tr -d ' ')"
chk "② 죽은 잠금 지움" 0 "$([ -d "$D/tmp/loop/lock" ] && echo 1 || echo 0)"
wd; chk "② 바로 다음 감시는 띄우지 않음(기록이 새로움)" 1 "$(resumes)"
fresh; dead 5
wd; wd; chk "② keep-running 없음: 띄우지 않음" 0 "$(resumes)"; chk "② keep-running 없음: 한 번만 기록" 1 "$(wlines)"
fresh; dead 1; echo x > "$D/tmp/loop/keep-running"
wd; chk "② 1분 전 기록: 띄우지 않음" 0 "$(resumes)"
fresh; echo x > "$D/tmp/loop/keep-running"
for k in 1 2 3 4; do dead 5; wd; done
chk "② 1시간에 세 번까지만" 3 "$(resumes)"

echo "③ STOPPED 9"
fresh; stopped 9 10
wd; chk "③ 10분: 부르지 않음" 0 "$(calls)"
fresh; stopped 9 25
wd FAKE_RELAUNCH=1; chk "③ 25분: 부름" 1 "$(calls)"; chk "③ .relaunch 있음: 다시 띄움" 1 "$(resumes)"
chk "③ 답을 남김" 1 "$(ls "$D"/tmp/loop/responder/*.json 2>/dev/null | grep -c . | tr -d ' ')"
chk "③ 지시문에 상태" 1 "$(grep -l '멈춘 일감: t1 (종료 9)' "$D"/tmp/loop/responder/*.prompt.md 2>/dev/null | grep -c . | tr -d ' ')"
chk "③ 잠금 풀림" 0 "$([ -d "$STATE/responder.lock" ] && echo 1 || echo 0)"
fresh; stopped 9 25
wd; chk "③ .relaunch 없음: 부름" 1 "$(calls)"; chk "③ .relaunch 없음: 띄우지 않음" 0 "$(resumes)"

echo "④ 마스터가 알림을 받은 뒤"
fresh; stopped 3 25; echo $(( $(date +%s) - 24 * 60 )) > "$D/tmp/loop/master-notified"
wd; chk "④ 알림 뒤 24분: 부르지 않음" 0 "$(calls)"
fresh; stopped 3 51; echo $(( $(date +%s) - 50 * 60 )) > "$D/tmp/loop/master-notified"
wd; chk "④ 알림 뒤 50분: 부름" 1 "$(calls)"
fresh; stopped 3 25; echo $(( $(date +%s) - 120 * 60 )) > "$D/tmp/loop/master-notified"
wd; chk "④ 멈추기 전의 알림은 무시: 부름" 1 "$(calls)"

echo "⑤ 멈춘 뒤 손댄 흔적"
fresh; stopped 9 25; echo "고침" >> "$D/docs/redraw-orders/queue/t1/task.env"
wd; chk "⑤ queue/ 파일이 새로움: 부르지 않음" 0 "$(calls)"
fresh; stopped 9 25; echo n > "$D/note.txt"; touch -t "$(stamp "$OLD")" "$D/note.txt"
( cd "$D" && git add note.txt && git -c user.email=t@example.com -c user.name=t commit -qm note ) >/dev/null 2>&1
wd; chk "⑤ 새 커밋: 부르지 않음" 0 "$(calls)"

echo "⑥ 시도 횟수와 NEEDS-MASTER"
fresh; stopped 4 25
wd; wd; wd; chk "⑥ 같은 멈춤에 두 번까지" 2 "$(calls)"
fresh; stopped 8 25; echo "진단" > "$D/tmp/loop/NEEDS-MASTER.md"
wd; chk "⑥ NEEDS-MASTER 가 새로움: 부르지 않음" 0 "$(calls)"
fresh; stopped 8 25; echo "옛 진단" > "$D/tmp/loop/NEEDS-MASTER.md"; touch -t "$(stamp "$OLD")" "$D/tmp/loop/NEEDS-MASTER.md"
wd; chk "⑥ 멈추기 전의 NEEDS-MASTER: 부름" 1 "$(calls)"

echo "⑦ DRY·stop.sh·master-notified·STALLED"
fresh; stopped 9 25
wd WATCHDOG_DRY=1; chk "⑦ DRY: 부르지 않음" 0 "$(calls)"; chk "⑦ DRY: 하려던 것을 찍음" 1 "$(grep -c '^DRY .*응급 처치를 부르려 했다' "$ROOT/wd.out" | tr -d ' ')"
chk "⑦ DRY: 기록 없음" 0 "$(wlines)"
fresh; dead 5; echo x > "$D/tmp/loop/keep-running"
wd WATCHDOG_DRY=1; chk "⑦ DRY: 띄우지 않음" 0 "$(resumes)"
fresh; echo x > "$D/tmp/loop/keep-running"
fakeproc resume.sh 30; rp=$FP; fakeproc loop.sh 30; lp=$FP
bash "$D/tools/sol/stop.sh" "$D" > /dev/null 2>&1
wait $rp $lp 2>/dev/null
chk "⑦ stop.sh: 프로세스 끝남" 0 "$( (kill -0 $rp || kill -0 $lp) 2>/dev/null && echo 1 || echo 0)"
chk "⑦ stop.sh: keep-running 지움" 0 "$([ -e "$D/tmp/loop/keep-running" ] && echo 1 || echo 0)"
chk "⑦ stop.sh: loop.log 에 한 줄" 1 "$(grep -c '마스터가 멈췄다' "$D/tmp/loop/loop.log" | tr -d ' ')"
touch -t "$(stamp $(( $(date +%s) - 600 )))" "$D/tmp/loop/loop.log"
wd; chk "⑦ stop.sh 뒤 DEAD 여도 띄우지 않음" 0 "$(resumes)"
fresh; stopped 3 1
WATCH_POLL=1 bash "$D/tools/sol/watch.sh" --until-attention "$D" > /dev/null 2>&1
m=$(cat "$D/tmp/loop/master-notified" 2>/dev/null); m=${m:-0}
chk "⑦ --until-attention 이 master-notified 를 남김" 1 "$([ $(( $(date +%s) - m )) -lt 30 ] && echo 1 || echo 0)"
bash "$D/tools/sol/watch.sh" --once "$D" > /dev/null; chk "⑦ --once 는 master-notified 를 바꾸지 않음" "$m" "$(cat "$D/tmp/loop/master-notified")"
fresh; dead 300; fakeproc loop.sh 30; lp=$FP; echo x > "$D/tmp/loop/keep-running"
wd; chk "⑦ STALLED: loop.sh 를 끝냄" 0 "$(kill -0 $lp 2>/dev/null && echo 1 || echo 0)"
chk "⑦ STALLED: loop.log 에 한 줄" 1 "$(grep -c '상시 감시가 멈춰 선 loop.sh 를 끝냈다' "$D/tmp/loop/loop.log" | tr -d ' ')"
wait $lp 2>/dev/null

echo "⑧ watchdog-install.sh --print"
bash "$HERE/watchdog-install.sh" --print > "$ROOT/p.plist"
chk "⑧ plutil -lint" 0 "$(plutil -lint "$ROOT/p.plist" > /dev/null 2>&1; echo $?)"
chk "⑧ Label" com.gio.mapo-loop-watch "$(plutil -extract Label raw "$ROOT/p.plist" 2>/dev/null)"
chk "⑧ StartInterval" 300 "$(plutil -extract StartInterval raw "$ROOT/p.plist" 2>/dev/null)"
chk "⑧ 스크립트" /Users/gio_c/apps/mapo/tools/sol/watchdog.sh "$(plutil -extract ProgramArguments.1 raw "$ROOT/p.plist" 2>/dev/null)"
chk "⑧ PATH 에 homebrew" 1 "$(plutil -extract EnvironmentVariables.PATH raw "$ROOT/p.plist" 2>/dev/null | grep -c '^/opt/homebrew/bin:' | tr -d ' ')"
chk "⑧ ProcessType" Background "$(plutil -extract ProcessType raw "$ROOT/p.plist" 2>/dev/null)"
chk "⑧ USER" "$(id -un)" "$(plutil -extract EnvironmentVariables.USER raw "$ROOT/p.plist" 2>/dev/null)"
chk "⑧ LOGNAME" "$(id -un)" "$(plutil -extract EnvironmentVariables.LOGNAME raw "$ROOT/p.plist" 2>/dev/null)"
chk "⑧ HOME" "$HOME" "$(plutil -extract EnvironmentVariables.HOME raw "$ROOT/p.plist" 2>/dev/null)"

echo "⑨ 로그인 오류(종료 10)·문서에 없는 종료·launchd 에 없는 USER"
ME=$(id -un)
fresh; stopped 10 60; echo x > "$D/tmp/loop/keep-running"
wd; wd; chk "⑨ STOPPED 10: 부르지 않음" 0 "$(calls)"; chk "⑨ STOPPED 10: 띄우지 않음" 0 "$(resumes)"
chk "⑨ STOPPED 10: 마스터 몫으로 한 번" 1 "$(grep -c 'STOPPED 10.*마스터 몫' "$STATE/watchdog.log" | tr -d ' ')"; chk "⑨ STOPPED 10: 기록 한 줄" 1 "$(wlines)"
fresh; stopped 3 120; touch -t "$(stamp $(( $(date +%s) - 120 * 60 )))" "$D/tmp/loop/last-exit"; dead 3; echo x > "$D/tmp/loop/keep-running"
long=$(printf 'x%.0s' $(seq 1 300))
printf '앞 줄\ntools/sol/loop.sh: line 373: n회차: unbound variable\n%s\n2026-11-27 12:00:00 loop 종료 1\n' "$long" > "$D/tmp/loop/resume.out"
touch -t "$(stamp $(( $(date +%s) - 120 )))" "$D/tmp/loop/resume.out"
wd; wd; chk "⑨ 종료 1: 부르지 않음" 0 "$(calls)"; chk "⑨ 종료 1: 띄우지 않음" 0 "$(resumes)"
chk "⑨ 종료 1: 마스터 몫으로 한 번" 1 "$(grep -c 'STOPPED 1:.*마스터 몫' "$STATE/watchdog.log" | tr -d ' ')"; chk "⑨ 종료 1: 기록 한 줄" 1 "$(wlines)"
chk "⑨ 종료 1: resume.out 끝을 붙임" 1 "$(grep -c 'n회차: unbound variable' "$STATE/watchdog.log" | tr -d ' ')"
chk "⑨ 종료 1: 옛 status.md 문장 안 붙임" 0 "$(grep -c '일감 t1 이 섰다' "$STATE/watchdog.log" | tr -d ' ')"
chk "⑨ 종료 1: 줄마다 200자 안쪽(201자 없음, 200자 있음)" "0 1" "$(grep -c 'x\{201\}' "$STATE/watchdog.log" | tr -d ' ') $(grep -c 'x\{200\}' "$STATE/watchdog.log" | tr -d ' ')"
fresh; dead 5; echo x > "$D/tmp/loop/keep-running"
WD_UNSET="-u USER -u LOGNAME" wd
chk "⑨ last-env: USER 를 채움" 1 "$(grep -cx "USER=$ME" "$STATE/last-env.txt" 2>/dev/null | tr -d ' ')"
chk "⑨ last-env: LOGNAME 을 채움" 1 "$(grep -cx "LOGNAME=$ME" "$STATE/last-env.txt" 2>/dev/null | tr -d ' ')"
chk "⑨ last-env: 다섯 값" 5 "$(grep -cE '^(USER|LOGNAME|HOME|PATH|LANG)=' "$STATE/last-env.txt" 2>/dev/null | tr -d ' ')"
chk "⑨ 되살린 resume.sh 의 환경" "USER=$ME LOGNAME=$ME" "$(cat "$D/tmp/resume-env" 2>/dev/null)"
fresh; stopped 9 25
WD_UNSET="-u USER -u LOGNAME" wd
chk "⑨ 응급 처치(claude)의 환경" "USER=$ME LOGNAME=$ME" "$(cat "$FAKE_LOG.env" 2>/dev/null)"

[ -n "${WD_TEST_KEEP:-}" ] || { find "$ROOT" -mindepth 1 -delete 2>/dev/null; rmdir "$ROOT" 2>/dev/null; }
printf '\n문법 검사: '; for f in "$HERE"/*.sh; do bash -n "$f" || { echo "FAIL $f"; BADN=$((BADN + 1)); }; done; echo ok
printf '통과 %s, 실패 %s\n' "$OKN" "$BADN"
[ "$BADN" = 0 ] || exit 1
