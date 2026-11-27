#!/bin/bash
# tools/sol/loop.sh 의 시험. 임시 git 저장소와 가짜 claude·sol 로 열 경우를 돌린다(진짜 CLI 를 부르지 않는다).
# 쓰는 법: bash tools/sol/test_loop.sh   (모두 통과하면 종료 0)
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
LOOP_SRC="$HERE/loop.sh"
OKN=0; BADN=0
LOOP_ARGS=""

chk() { # 설명 기대 실제
  if [ "$2" = "$3" ]; then OKN=$((OKN + 1)); printf '  ok   %s = %s\n' "$1" "$3"
  else BADN=$((BADN + 1)); printf '  FAIL %s: 기대 %s, 실제 %s\n' "$1" "$2" "$3"
    [ -n "${LOOP_TEST_DEBUG:-}" ] && { echo "    --- run.out"; sed 's/^/    /' "$REPO/tmp/run.out"; }; fi
}

# ---- 가짜 CLI ----
write_fakes() {
  cat > "$REPO/fake/claude" <<'EOF'
#!/bin/bash
# 가짜 claude CLI. --disallowedTools 가 있으면 검수 호출, 없으면 구현 호출.
role=impl; model=; prev=
for a in "$@"; do [ "$a" = "--disallowedTools" ] && role=review; case "$a" in *"# 계획 세우기"*) role=plan;; esac; [ "$prev" = "--model" ] && model=$a; prev=$a; done
echo "claude $role model=$model" >> "$FAKE_LOG"
if [ "$role" = plan ]; then
  n=$(cat "$FAKE_REPO/tmp/plan-count" 2>/dev/null || echo 0); n=$((n+1)); echo $n > "$FAKE_REPO/tmp/plan-count"
  if [ "$n" -le "${FAKE_PLAN_TASKS:-1}" ]; then
    mkdir -p "$FAKE_REPO/docs/redraw-orders/queue/p$n"
    printf 'STAGE=s0\nIMPL=opus\nIMPL_EFFORT=high\nREVIEW=sol\nREVIEW_EFFORT=medium\nCHECK="test -s work.txt"\n' > "$FAKE_REPO/docs/redraw-orders/queue/p$n/task.env"
    printf '# p%s\n## 할 일\nwork.txt\n' "$n" > "$FAKE_REPO/docs/redraw-orders/queue/p$n/brief.md"
    printf -- '- [ ] p%s 계획한 일감\n' "$n" >> "$FAKE_REPO/docs/redraw-orders/queue.md"
  else
    echo "단계 끝: 지오에게 보일 주소 http://x" > "$FAKE_REPO/tmp/loop/stage-done.md"
  fi
  printf '{"type":"result","subtype":"success","is_error":false,"total_cost_usd":0.01,"result":"계획"}\n'
elif [ "$role" = impl ]; then
  echo "impl" >> "$FAKE_REPO/work.txt"
  echo "impl" >> "$FAKE_REPO/seed.txt"
  [ -n "${FAKE_IMPL_BG:-}" ] && { nohup bash -c "sleep 3; echo late > '$FAKE_REPO/late.txt'" loop-busy-marker >/dev/null 2>&1 & }
  [ -n "${FAKE_IMPL_TOUCH_TASK:-}" ] && echo "기준 바꿈" >> "$FAKE_REPO/docs/redraw-orders/queue/t1/brief.md"
  [ -n "${FAKE_IMPL_SLEEP:-}" ] && sleep "$FAKE_IMPL_SLEEP"
  if [ -n "${FAKE_IMPL_LIMIT:-}" ]; then printf '{"type":"result","subtype":"error","is_error":true,"result":"limit reached"}\n'; exit 1; fi
  printf '{"type":"result","subtype":"success","is_error":false,"total_cost_usd":0.0123,"usage":{"input_tokens":1200,"cache_read_input_tokens":3400}}\n'
else
  # 진짜 claude 처럼 --disallowedTools 는 뒤 인자를 모두 도구 이름으로 먹는다: 지시문은 표준 입력으로 와야 한다
  input=; IFS= read -r -t 2 input; [ -n "$input" ] || { echo "Error: Input must be provided either through stdin or as a prompt argument when using --print"; exit 1; }
  [ -n "${FAKE_REVIEW_TOUCH:-}" ] && echo "검수자가 고침" >> "$FAKE_REPO/work.txt"
  v=$(head -1 "$FAKE_VERDICTS"); tail -n +2 "$FAKE_VERDICTS" > "$FAKE_VERDICTS.n"; mv "$FAKE_VERDICTS.n" "$FAKE_VERDICTS"
  # 판정 뒤의 표시: :r 같은 문제, :t 일감 탓(blame task), :i 구현 탓(blame impl)
  r=false; b=; case "$v" in *:r*) r=true;; esac; case "$v" in *:t*) b='\"blame\":\"task\",';; *:i*) b='\"blame\":\"impl\",';; esac; v=${v%%:*}
  printf '{"type":"result","total_cost_usd":0.002,"usage":{"input_tokens":900},"result":"가짜 검수\\n{\\"verdict\\":\\"%s\\",%s\\"repeat\\":%s,\\"reasons\\":[\\"가짜 까닭\\"],\\"fixes\\":[\\"가짜 고칠 것: 검사 줄\\"]}"}\n' "$v" "$b" "$r"
fi
EOF
  cat > "$REPO/fake/run.sh" <<'EOF'
#!/bin/bash
# 가짜 tools/sol/run.sh. 인자는 <단계> <실행 이름> <에포트> <지시문 파일>.
echo "sol $2 effort=$3 sandbox=${SOL_SANDBOX:-없음}" >> "$FAKE_LOG"
# 진짜 run.sh 처럼 실행마다 장부에 한 줄을 더한다(검수 중이어도)
echo "$2" >> "$FAKE_REPO/docs/redraw-orders/sol-ledger.tsv"
out="${SOL_OUT:-tmp/sol}"; mkdir -p "$out"
case "$2" in
  *-impl-*)
    echo "impl" >> "$FAKE_REPO/work.txt"
    echo "impl" >> "$FAKE_REPO/seed.txt"
    echo "sol 구현 끝" > "$out/$2-answer.md" ;;
  *)
    [ -n "${FAKE_REVIEW_SLEEP:-}" ] && sleep "$FAKE_REVIEW_SLEEP"
    v=$(head -1 "$FAKE_VERDICTS"); tail -n +2 "$FAKE_VERDICTS" > "$FAKE_VERDICTS.n"; mv "$FAKE_VERDICTS.n" "$FAKE_VERDICTS"
    r=false; b=; case "$v" in *:r*) r=true;; esac; case "$v" in *:t*) b='"blame":"task",';; *:i*) b='"blame":"impl",';; esac; v=${v%%:*}
    printf '가짜 검수\n{"verdict":"%s",%s"repeat":%s,"reasons":["가짜 까닭"],"fixes":["가짜 고칠 것: 검사 줄"]}\n' "$v" "$b" "$r" > "$out/$2-answer.md" ;;
esac
# 진짜 codex 처럼 지시문을 기록에 되풀이한다(지시문 안의 답 본보기가 판정으로 읽히면 안 된다)
cat "$4"
echo "sol/run.sh(가짜): $2 끝"
EOF
  chmod +x "$REPO/fake/claude" "$REPO/fake/run.sh"
  mkdir -p "$REPO/fake/sessions/2026/11/25"
  printf '{"type":"event_msg","payload":{"rate_limits":{"primary":{"used_percent":10.5},"secondary":{"used_percent":40.0}}}}\n' \
    > "$REPO/fake/sessions/2026/11/25/rollout-2026-11-25T00-00-00-aaaa.jsonl"
}

wipe() { # 앞 경우의 임시 저장소를 지운다(통째로 지우는 명령은 쓰지 않는다)
  [ -n "${REPO:-}" ] || return 0
  case "$REPO" in /tmp/mapo-loop-test.*|/private/tmp/mapo-loop-test.*) ;; *) return 0 ;; esac
  find "$REPO" -mindepth 1 -delete 2>/dev/null; rmdir "$REPO" 2>/dev/null; REPO=""
}

setup() { # 깨끗한 임시 저장소
  wipe
  REPO=$(mktemp -d /tmp/mapo-loop-test.XXXXXX)
  mkdir -p "$REPO/tools/sol" "$REPO/docs/redraw-orders/queue" "$REPO/fake" "$REPO/tmp"
  cp "$LOOP_SRC" "$REPO/tools/sol/loop.sh" 2>/dev/null || { echo "  (loop.sh 가 없다: $LOOP_SRC)"; }
  for f in retry.sh watch.sh; do cp "$HERE/$f" "$REPO/tools/sol/$f" 2>/dev/null || echo "  ($f 가 없다)"; done
  printf 'tmp/\n' > "$REPO/.gitignore"
  printf '# 일감 목록\n\n' > "$REPO/docs/redraw-orders/queue.md"
  echo seed > "$REPO/seed.txt"
  echo "날짜" > "$REPO/docs/redraw-orders/sol-ledger.tsv"
  ( cd "$REPO" && git -c init.defaultBranch=main init -q && git config user.email t@example.com && git config user.name tester ) >/dev/null 2>&1
  write_fakes
  LOOP_ARGS=""
}

env_task() { # 기본 task.env 본문. $1 에 덧붙일 줄
  printf 'STAGE=s0\nIMPL=%s\nIMPL_EFFORT=high\nREVIEW=%s\nREVIEW_EFFORT=medium\nCHECK="test -s work.txt"\n%s' \
    "${IMPL_M:-opus}" "${REVIEW_M:-sol}" "${1:-}"
}

add_task() { # $1 id, $2 한 줄 설명, $3 task.env 본문
  mkdir -p "$REPO/docs/redraw-orders/queue/$1"
  printf '%s\n' "$3" > "$REPO/docs/redraw-orders/queue/$1/task.env"
  printf '# %s\n\n## 할 일\nwork.txt 를 만든다.\n' "$1" > "$REPO/docs/redraw-orders/queue/$1/brief.md"
  printf -- '- [ ] %s %s\n' "$1" "$2" >> "$REPO/docs/redraw-orders/queue.md"
}

commit_all() { ( cd "$REPO" && git add -A && git commit -qm "일감 목록" ) >/dev/null 2>&1; }

verdicts() { printf '%s\n' "$@" > "$REPO/tmp/verdicts"; }

run_loop() { # 남은 인자는 env 에 더할 변수
  ( cd "$REPO" && env \
      LOOP_CLAUDE="$REPO/fake/claude" LOOP_SOL_RUN="$REPO/fake/run.sh" LOOP_PGREP=false \
      LOOP_BUSY_PATTERN=no-such-busy-job-xyz \
      LOOP_OUT="$REPO/tmp/loop" SOL_OUT="$REPO/tmp/sol" LOOP_CODEX_SESSIONS="$REPO/fake/sessions" \
      FAKE_LOG="$REPO/tmp/fake.log" FAKE_VERDICTS="$REPO/tmp/verdicts" FAKE_REPO="$REPO" \
      "$@" bash tools/sol/loop.sh $LOOP_ARGS > "$REPO/tmp/run.out" 2>&1 )
  echo $?
}

commits() { git -C "$REPO" rev-list --count HEAD 2>/dev/null || echo 0; }
# 루프가 스스로 쓰는 두 파일(장부·일감 목록)은 빼고 센다
dirty_impl() { git -C "$REPO" status --porcelain -- . | grep -v -e 'loop-ledger.tsv' -e 'queue.md' | grep -c . | tr -d ' '; }
qmark() { grep -F -c -- "- [$1] $2 " "$REPO/docs/redraw-orders/queue.md" | tr -d ' '; }
ledger_rows() { c=$(grep -c . "$REPO/docs/redraw-orders/loop-ledger.tsv" 2>/dev/null); echo "${c:-0}" | tr -d ' '; }
hits() { c=$(grep -c "$1" "$REPO/tmp/fake.log" 2>/dev/null); echo "${c:-0}" | tr -d ' '; }
have() { [ -s "$1" ] && echo 1 || echo 0; }

# ---- 경우 ----
case1() { echo "① PASS 두 일감"
  setup; add_task t1 "첫 일감" "$(env_task)"; add_task t2 "둘째 일감" "$(env_task)"; commit_all
  verdicts PASS PASS
  code=$(run_loop)
  chk "① 종료" 0 "$code"
  chk "① 커밋 수(처음 1 + 일감 2)" 3 "$(commits)"
  chk "① t1 표시" 1 "$(qmark x t1)"
  chk "① t2 표시" 1 "$(qmark x t2)"
  chk "① 트리 깨끗" 0 "$(dirty_impl)"
  chk "① 장부 줄(머리 1 + 2일감×3단계)" 7 "$(ledger_rows)"
  chk "① 검수 샌드박스 read-only" 2 "$(hits 'sandbox=read-only')"
}

case2() { echo "② FAIL 뒤 PASS"
  setup; add_task t1 "첫 일감" "$(env_task)"; commit_all
  verdicts FAIL PASS
  code=$(run_loop)
  chk "② 종료" 0 "$code"
  chk "② 커밋 수" 2 "$(commits)"
  chk "② 2회차 구현 기록" 1 "$(have "$REPO/tmp/loop/t1/impl-2.json")"
  chk "② t1 표시" 1 "$(qmark x t1)"
}

case3() { echo "③ 같은 문제로 다시 FAIL"
  setup; add_task t1 "첫 일감" "$(env_task)"; add_task t2 "둘째 일감" "$(env_task)"; commit_all
  verdicts FAIL FAIL:r
  code=$(run_loop)
  chk "③ 종료" 3 "$code"
  chk "③ 커밋 없음" 1 "$(commits)"
  chk "③ 트리 원상" 0 "$(dirty_impl)"
  chk "③ 보관한 패치" 1 "$(have "$REPO/tmp/loop/t1/failed.patch")"
  chk "③ 보관한 새 파일" 1 "$(have "$REPO/tmp/loop/t1/failed-untracked/work.txt")"
  chk "③ t1 표시" 1 "$(qmark '!' t1)"
  chk "③ 둘째 일감 그대로" 1 "$(grep -F -c -- '- [ ] t2 ' "$REPO/docs/redraw-orders/queue.md" | tr -d ' ')"
  chk "③ 멈춘 까닭 기록" 1 "$(have "$REPO/tmp/loop/status.md")"
  chk "③ 기계가 읽는 멈춤 기록" 3 "$(awk '{print $1}' "$REPO/tmp/loop/last-exit" 2>/dev/null)"
  chk "③ watch 가 STOPPED 3" 1 "$(bash "$REPO/tools/sol/watch.sh" --once "$REPO" | grep -c ' STOPPED 3 ' | tr -d ' ')"
}

case4() { echo "④ STOP 판정"
  setup; IMPL_M=sol REVIEW_M=opus; add_task t1 "첫 일감" "$(IMPL_M=sol REVIEW_M=opus env_task)"; commit_all
  verdicts STOP
  code=$(run_loop)
  chk "④ 종료" 4 "$code"
  chk "④ 커밋 없음" 1 "$(commits)"
  chk "④ 트리 원상" 0 "$(dirty_impl)"
  chk "④ t1 표시" 1 "$(qmark '!' t1)"
}

case5() { echo "⑤ 검수자가 파일을 고침"
  setup; add_task t1 "첫 일감" "$(IMPL_M=sol REVIEW_M=opus env_task)"; commit_all
  verdicts PASS
  code=$(run_loop FAKE_REVIEW_TOUCH=1)
  chk "⑤ 종료" 4 "$code"
  chk "⑤ 커밋 없음" 1 "$(commits)"
}

case6() { echo "⑥ 단계의 끝"
  setup; add_task t1 "첫 일감" "$(env_task 'STAGE_END=1')"; add_task t2 "둘째 일감" "$(env_task)"; commit_all
  verdicts PASS PASS
  code=$(run_loop)
  chk "⑥ 종료" 5 "$code"
  chk "⑥ 커밋 1개" 2 "$(commits)"
  chk "⑥ t1 표시" 1 "$(qmark x t1)"
  chk "⑥ 둘째 일감 안 건드림" 1 "$(grep -F -c -- '- [ ] t2 ' "$REPO/docs/redraw-orders/queue.md" | tr -d ' ')"
}

case7() { echo "⑦ 단계 신호가 STOP"
  setup; add_task t1 "첫 일감" "$(env_task 'SIGNAL="bash docs/redraw-orders/queue/t1/signal.sh"')"
  printf '#!/bin/bash\necho "잰 값 0"\necho STOP\n' > "$REPO/docs/redraw-orders/queue/t1/signal.sh"
  commit_all
  verdicts PASS
  code=$(run_loop)
  chk "⑦ 종료" 6 "$code"
  chk "⑦ 커밋 1개" 2 "$(commits)"
  chk "⑦ t1 표시" 1 "$(qmark x t1)"
}

case8() { echo "⑧ 한도 95%"
  setup; add_task t1 "첫 일감" "$(env_task)"; commit_all
  verdicts PASS
  code=$(run_loop CLAUDE_WEEKLY_USED=95)
  chk "⑧ 종료" 7 "$code"
  chk "⑧ CLI 안 부름" 0 "$(hits claude)"
  chk "⑧ 커밋 없음" 1 "$(commits)"
}

case9() { echo "⑨ 구현자와 검수자가 같다"
  setup; add_task t1 "첫 일감" "$(IMPL_M=opus REVIEW_M=opus env_task)"; commit_all
  verdicts PASS
  code=$(run_loop)
  chk "⑨ 종료" 2 "$code"
  chk "⑨ CLI 안 부름" 0 "$(hits claude)"
}

case10() { echo "⑩ 시작 전 트리가 더럽다"
  setup; add_task t1 "첫 일감" "$(env_task)"; commit_all
  echo "남의 수정" >> "$REPO/seed.txt"
  verdicts PASS
  code=$(run_loop)
  chk "⑩ 종료" 2 "$code"
  chk "⑩ CLI 안 부름" 0 "$(hits claude)"
}

case11() { echo "⑪ --dry-run 과 빈 목록"
  setup; commit_all
  verdicts PASS
  LOOP_ARGS="--dry-run"
  code=$(run_loop)
  chk "⑪ 빈 목록 종료" 0 "$code"
  setup; add_task t1 "첫 일감" "$(env_task)"; commit_all; verdicts PASS
  LOOP_ARGS="--dry-run"
  code=$(run_loop)
  chk "⑪ 종료" 0 "$code"
  chk "⑪ CLI 안 부름" 0 "$(hits claude)"
  chk "⑪ 일감 그대로" 1 "$(grep -F -c -- '- [ ] t1 ' "$REPO/docs/redraw-orders/queue.md" | tr -d ' ')"
}

case12() { echo "⑫ 남이 둔 추적 안 된 파일"
  setup; add_task t1 "첫 일감" "$(env_task)"; commit_all
  echo "남의 메모" > "$REPO/other.txt"
  mkdir -p "$REPO/notes"; echo "남의 폴더" > "$REPO/notes/plan.md"
  verdicts PASS
  code=$(run_loop)
  chk "⑫ 종료" 0 "$code"
  chk "⑫ 커밋 수" 2 "$(commits)"
  chk "⑫ 남의 파일은 커밋 안 됨" 0 "$(git -C "$REPO" ls-files other.txt | grep -c . | tr -d ' ')"
  chk "⑫ 남의 파일은 그대로" 1 "$(have "$REPO/other.txt")"
  chk "⑫ 남의 폴더는 그대로" 1 "$(have "$REPO/notes/plan.md")"
}

case13() { echo "⑬ sol 검수 기록 안의 답 본보기"
  setup; add_task t1 "첫 일감" "$(env_task)"; commit_all
  verdicts FAIL FAIL:r
  code=$(run_loop)
  chk "⑬ 종료(같은 문제 FAIL)" 3 "$code"
  chk "⑬ 커밋 없음" 1 "$(commits)"
}

case14() { echo "⑭ Claude 모델 고르기"
  setup; add_task t1 "첫 일감" "$(IMPL_M=sonnet REVIEW_M=sol env_task)"; add_task t2 "둘째" "$(IMPL_M=sol REVIEW_M=haiku env_task)"; commit_all
  verdicts PASS PASS
  code=$(run_loop)
  chk "⑭ 종료" 0 "$code"
  chk "⑭ sonnet 구현" 1 "$(hits 'claude impl model=sonnet')"
  chk "⑭ haiku 검수" 1 "$(hits 'claude review model=haiku')"
}

case15() { echo "⑮ 구현이 한도로 끊김 → --continue"
  setup; add_task t1 "첫 일감" "$(IMPL_M=opus REVIEW_M=sol env_task)"; commit_all
  verdicts PASS
  code=$(run_loop FAKE_IMPL_LIMIT=1)
  chk "⑮ 종료" 7 "$code"
  chk "⑮ 트리 그대로(구현 변경 남음)" 1 "$(have "$REPO/work.txt")"
  chk "⑮ 일감 그대로" 1 "$(qmark ' ' t1)"
  LOOP_ARGS="--continue"
  code=$(run_loop)
  chk "⑮ 이어서 종료" 0 "$code"
  chk "⑮ 커밋 수" 2 "$(commits)"
  chk "⑮ 이어서 지시문" 1 "$(grep -c '이어서 하는 실행' "$REPO/tmp/loop/t1/brief-1.md" | tr -d ' ')"
  chk "⑮ t1 표시" 1 "$(qmark x t1)"
}

case16() { echo "⑯ 구현자가 일감 폴더를 고침"
  setup; add_task t1 "첫 일감" "$(IMPL_M=opus REVIEW_M=sol env_task)"; commit_all
  verdicts PASS
  code=$(run_loop FAKE_IMPL_TOUCH_TASK=1)
  chk "⑯ 종료" 4 "$code"
  chk "⑯ 커밋 없음" 1 "$(commits)"
}

case17() { echo "⑰ 구현은 끝났는데 루프가 끊김 → --continue 는 검사·검수부터"
  setup; add_task t1 "첫 일감" "$(IMPL_M=opus REVIEW_M=sol env_task)"; commit_all
  mkdir -p "$REPO/tmp/loop/t1"; : > "$REPO/tmp/loop/t1/base-untracked.txt"
  git -C "$REPO" rev-parse HEAD > "$REPO/tmp/loop/t1/base-head.txt"
  printf '{"type":"result","subtype":"success","is_error":false,"total_cost_usd":1}\n' > "$REPO/tmp/loop/t1/impl-1.json"
  echo impl > "$REPO/work.txt"; echo impl >> "$REPO/seed.txt"
  verdicts PASS
  LOOP_ARGS="--continue"
  code=$(run_loop)
  chk "⑰ 종료" 0 "$code"
  chk "⑰ 구현 다시 안 부름" 0 "$(hits 'claude impl')"
  chk "⑰ 커밋 수" 2 "$(commits)"
}

case18() { echo "⑱ 1회차 검수 FAIL 뒤 끊김 → --continue 는 2회차 구현부터"
  setup; add_task t1 "첫 일감" "$(IMPL_M=opus REVIEW_M=sol env_task)"; commit_all
  mkdir -p "$REPO/tmp/loop/t1"; : > "$REPO/tmp/loop/t1/base-untracked.txt"
  printf '{"type":"result","subtype":"success","is_error":false}\n' > "$REPO/tmp/loop/t1/impl-1.json"
  printf '까닭\n{"verdict":"FAIL","reasons":["x"],"fixes":["y"]}\n' > "$REPO/tmp/loop/t1/review-1.out"
  echo impl > "$REPO/work.txt"
  verdicts PASS
  LOOP_ARGS="--continue"
  code=$(run_loop)
  chk "⑱ 종료" 0 "$code"
  chk "⑱ 2회차 구현만" 1 "$(hits 'claude impl')"
  chk "⑱ 2회차 지시문에 의견" 1 "$(grep -c '1회차 검수 의견' "$REPO/tmp/loop/t1/brief-2.md" | tr -d ' ')"
  chk "⑱ 커밋 수" 2 "$(commits)"
}

case19() { echo "⑲ 다른 문제로 FAIL 이 이어지면 계속, 세 번째에 PASS"
  setup; add_task t1 "첫 일감" "$(IMPL_M=opus REVIEW_M=sol env_task)"; commit_all
  verdicts FAIL FAIL PASS
  code=$(run_loop)
  chk "⑲ 종료" 0 "$code"
  chk "⑲ 구현 세 번" 3 "$(hits 'claude impl')"
  chk "⑲ 커밋 수" 2 "$(commits)"
}

case20() { echo "⑳ 회차 상한"
  setup; add_task t1 "첫 일감" "$(IMPL_M=opus REVIEW_M=sol env_task)"; commit_all
  verdicts FAIL FAIL FAIL FAIL FAIL
  code=$(run_loop)
  chk "⑳ 종료" 3 "$code"
  chk "⑳ 구현 네 번" 4 "$(hits 'claude impl')"
}

case21() { echo "㉑ 목록이 비면 계획 세우기 → 일감 → 단계 끝"
  setup; printf '# 계획 세우기 안내\n' > "$REPO/docs/redraw-orders/queue/PLANNER.md"; commit_all
  verdicts PASS PASS
  code=$(run_loop FAKE_PLAN_TASKS=2)
  chk "㉑ 종료(단계 끝)" 5 "$code"
  chk "㉑ 계획 세 번" 3 "$(hits 'claude plan')"
  chk "㉑ p1·p2 표시" 2 "$(grep -c -- '- \[x\] p' "$REPO/docs/redraw-orders/queue.md" | tr -d ' ')"
  chk "㉑ 커밋(처음+계획2+일감2)" 5 "$(commits)"
  chk "㉑ 단계 끝 기록" 1 "$(grep -c 'http://x' "$REPO/tmp/loop/status.md" | tr -d ' ')"
}

case22() { echo "㉒ 구현이 배경에 남긴 작업이 끝난 뒤에 검사"
  setup; add_task t1 "첫 일감" "$(IMPL_M=opus REVIEW_M=sol env_task | sed 's/CHECK=.*/CHECK="test -s late.txt"/')"; commit_all
  verdicts PASS
  code=$(run_loop FAKE_IMPL_BG=1 LOOP_BUSY_PATTERN=loop-busy-marker LOOP_BUSY_POLL=1)
  chk "㉒ 종료" 0 "$code"
  chk "㉒ 늦게 끝난 결과가 커밋됨" 1 "$(git -C "$REPO" ls-files late.txt | grep -c . | tr -d ' ')"
}

case23() { echo "㉓ 다른 루프의 claude·codex 는 배경 작업으로 치지 않는다"
  setup; add_task t1 "첫 일감" "$(IMPL_M=opus REVIEW_M=sol env_task)"; commit_all
  bash -c 'exec -a "claude -p claude-linger" sleep 25' & lp=$!
  verdicts PASS
  t=$(date +%s); code=$(run_loop LOOP_BUSY_PATTERN=claude-linger LOOP_BUSY_POLL=1); t=$(( $(date +%s) - t ))
  kill $lp 2>/dev/null
  chk "㉓ 종료" 0 "$code"
  chk "㉓ 기다리지 않음" 1 "$([ "$t" -lt 15 ] && echo 1 || echo 0)"
}

case24() { echo "㉔ 끊긴 뒤 이어받을 때 이미 끝난 회차 구현은 다시 부르지 않는다"
  setup; add_task t1 "첫 일감" "$(IMPL_M=opus REVIEW_M=sol env_task)"; commit_all
  mkdir -p "$REPO/tmp/loop/t1"; : > "$REPO/tmp/loop/t1/base-untracked.txt"
  printf '{"type":"result","subtype":"success","is_error":false}\n' > "$REPO/tmp/loop/t1/impl-1.json"
  printf '{"type":"result","subtype":"success","is_error":false}\n' > "$REPO/tmp/loop/t1/impl-2.json"
  printf '까닭\n{"verdict":"FAIL","reasons":["x"],"fixes":["y"]}\n' > "$REPO/tmp/loop/t1/review-1.out"
  echo impl > "$REPO/work.txt"
  verdicts PASS
  LOOP_ARGS="--continue"
  code=$(run_loop)
  chk "㉔ 종료" 0 "$code"
  chk "㉔ 구현 다시 안 부름" 0 "$(hits 'claude impl')"
}

left() { c=$(pgrep -f "$1" 2>/dev/null | grep -c .); echo "${c:-0}" | tr -d ' '; } # 남은 프로세스 수

case25() { echo "㉕ 배경 작업은 이 저장소 안의 것만 기다린다"
  setup; add_task t1 "첫 일감" "$(IMPL_M=opus REVIEW_M=sol env_task)"; add_task t2 "둘째" "$(IMPL_M=opus REVIEW_M=sol env_task)"
  add_task t3 "셋째" "$(IMPL_M=opus REVIEW_M=sol env_task)"; commit_all
  other=$(mktemp -d /tmp/mapo-loop-test.XXXXXX)
  ( cd "$other" && exec -a "python3 tools/v2/xbusy-other.py" sleep 25 ) & op=$!
  verdicts PASS PASS PASS
  LOOP_ARGS="--once"
  t=$(date +%s); code=$(run_loop LOOP_BUSY_PATTERN=tools/v2/xbusy LOOP_BUSY_POLL=1); t=$(( $(date +%s) - t ))
  chk "㉕ 다른 폴더의 것: 종료" 0 "$code"
  chk "㉕ 다른 폴더의 것: 기다리지 않음" 1 "$([ "$t" -lt 10 ] && echo 1 || echo 0)"
  ( cd "$REPO" && exec -a "python3 tools/v2/xbusy-in.py" sleep 5 ) & ip=$!
  t=$(date +%s); code=$(run_loop LOOP_BUSY_PATTERN=tools/v2/xbusy LOOP_BUSY_POLL=1); t=$(( $(date +%s) - t ))
  chk "㉕ 이 저장소 안의 것: 기다림" 1 "$([ "$t" -ge 4 ] && echo 1 || echo 0)"
  rp=$(cd "$REPO" && pwd -P)
  ( cd "$other" && exec -a "python3 tools/v2/xbusy-arg.py $rp/data" sleep 5 ) & ap=$!
  t=$(date +%s); code=$(run_loop LOOP_BUSY_PATTERN=tools/v2/xbusy LOOP_BUSY_POLL=1); t=$(( $(date +%s) - t ))
  chk "㉕ 인자에 이 저장소 경로: 기다림" 1 "$([ "$t" -ge 4 ] && echo 1 || echo 0)"
  kill $op $ip $ap 2>/dev/null; wait $op $ip $ap 2>/dev/null; rmdir "$other" 2>/dev/null
}

case26() { echo "㉖ 검사가 시간 상한을 넘으면 종료 8, 남는 프로세스 없음"
  setup; add_task t1 "첫 일감" "$(IMPL_M=opus REVIEW_M=sol env_task 'CHECK_MAX_MIN=0.04' | sed 's/^CHECK=.*/CHECK="sleep 3171 \& sleep 3172; wait"/')"; commit_all
  verdicts PASS
  code=$(run_loop LOOP_KILL_GRACE=2)
  chk "㉖ 종료" 8 "$code"
  chk "㉖ 검사 프로세스 남지 않음" 0 "$(left 'sleep 317[12]')"
  chk "㉖ 검수 안 부름" 0 "$(hits 'review')"
  chk "㉖ 트리 그대로" 1 "$(have "$REPO/work.txt")"
  chk "㉖ 기계가 읽는 멈춤 기록" 8 "$(awk '{print $1}' "$REPO/tmp/loop/last-exit" 2>/dev/null)"
}

case27() { echo "㉗ 구현이 시간 상한을 넘으면 종료 8 → --continue 는 구현부터"
  setup; add_task t1 "첫 일감" "$(IMPL_M=opus REVIEW_M=sol env_task 'IMPL_MAX_MIN=0.04')"; commit_all
  verdicts PASS
  code=$(run_loop LOOP_KILL_GRACE=2 FAKE_IMPL_SLEEP=3173)
  chk "㉗ 종료" 8 "$code"
  chk "㉗ 구현 프로세스 남지 않음" 0 "$(left 'sleep 3173')"
  chk "㉗ 검수 안 부름" 0 "$(hits 'review')"
  LOOP_ARGS="--continue"
  code=$(run_loop)
  chk "㉗ 이어서 종료" 0 "$code"
  chk "㉗ 구현을 다시 부름" 2 "$(hits 'claude impl')"
  chk "㉗ 커밋 수" 2 "$(commits)"
}

case28() { echo "㉘ 검수가 시간 상한을 넘으면 종료 8 → --continue 는 검사·검수부터"
  setup; add_task t1 "첫 일감" "$(IMPL_M=opus REVIEW_M=sol env_task)"; commit_all
  verdicts PASS
  code=$(run_loop LOOP_KILL_GRACE=2 LOOP_REVIEW_MAX_MIN=0.04 FAKE_REVIEW_SLEEP=3174)
  chk "㉘ 종료" 8 "$code"
  chk "㉘ 검수 프로세스 남지 않음" 0 "$(left 'sleep 3174')"
  LOOP_ARGS="--continue"
  code=$(run_loop)
  chk "㉘ 이어서 종료" 0 "$code"
  chk "㉘ 구현 다시 안 부름" 1 "$(hits 'claude impl')"
  chk "㉘ 커밋 수" 2 "$(commits)"
}

case29() { echo "㉙ 검수가 일감 탓(blame task) → 종료 9, 트리 남김 → retry.sh + --continue"
  setup; add_task t1 "첫 일감" "$(IMPL_M=opus REVIEW_M=sol env_task | sed 's/^CHECK=.*/CHECK="test -s nothere.txt"/')"; add_task t2 "둘째" "$(env_task)"; commit_all
  verdicts FAIL:t PASS
  code=$(run_loop)
  chk "㉙ 종료" 9 "$code"
  chk "㉙ 구현 한 번" 1 "$(hits 'claude impl')"
  chk "㉙ 구현 변경 남음" 1 "$(have "$REPO/work.txt")"
  chk "㉙ 보관 패치 없음" 0 "$(have "$REPO/tmp/loop/t1/failed.patch")"
  chk "㉙ t1 표시" 1 "$(qmark '!' t1)"
  chk "㉙ 고칠 것을 status.md 에" 1 "$(grep -c '가짜 고칠 것: 검사 줄' "$REPO/tmp/loop/status.md" | tr -d ' ')"
  chk "㉙ 검수 지시문에 blame 문단" 1 "$(grep -c '"blame":"task"' "$REPO/tmp/loop/t1/review-1.md" | tr -d ' ')"
  # 마스터가 일감의 검사를 고쳐 커밋한다
  sed -i '' 's/^CHECK=.*/CHECK="test -s work.txt"/' "$REPO/docs/redraw-orders/queue/t1/task.env"
  git -C "$REPO" add docs/redraw-orders/queue/t1/task.env; git -C "$REPO" commit -q -m "검사 고침" >/dev/null 2>&1
  ( cd "$REPO" && env LOOP_OUT="$REPO/tmp/loop" bash tools/sol/retry.sh t1 > "$REPO/tmp/retry.out" 2>&1 ); rc=$?
  chk "㉙ retry 종료" 0 "$rc"
  chk "㉙ retry 뒤 t1 표시" 1 "$(qmark ' ' t1)"
  chk "㉙ 지난 회차 파일 옮김" 0 "$(have "$REPO/tmp/loop/t1/review-1.out")"
  chk "㉙ 옮긴 자리" 1 "$(ls "$REPO"/tmp/loop/t1/run-*/review-1.out 2>/dev/null | grep -c . | tr -d ' ')"
  chk "㉙ recheck 표시" 1 "$([ -e "$REPO/tmp/loop/t1/recheck" ] && echo 1 || echo 0)"
  LOOP_ARGS="--continue --once"
  code=$(run_loop)
  chk "㉙ 이어서 종료" 0 "$code"
  chk "㉙ 구현 다시 안 부름" 1 "$(hits 'claude impl')"
  chk "㉙ 커밋(처음+고침+일감)" 3 "$(commits)"
  chk "㉙ t1 표시 x" 1 "$(qmark x t1)"
  chk "㉙ recheck 지움" 0 "$([ -e "$REPO/tmp/loop/t1/recheck" ] && echo 1 || echo 0)"
}

case30() { echo "㉚ 종료 3 으로 되돌려진 일감도 retry.sh 로 되살린다(충돌이면 아무것도 안 바꿈)"
  setup; add_task t1 "첫 일감" "$(IMPL_M=opus REVIEW_M=sol env_task)"; commit_all
  verdicts FAIL FAIL:r
  code=$(run_loop)
  chk "㉚ 종료" 3 "$code"
  chk "㉚ 되돌려짐" 0 "$(have "$REPO/work.txt")"
  echo "남의 충돌" > "$REPO/seed.txt"
  ( cd "$REPO" && bash tools/sol/retry.sh t1 > "$REPO/tmp/retry.out" 2>&1 ); rc=$?
  chk "㉚ 충돌이면 retry 실패" 1 "$([ "$rc" != 0 ] && echo 1 || echo 0)"
  chk "㉚ 실패하면 파일 그대로" 1 "$(have "$REPO/tmp/loop/t1/review-1.out")"
  chk "㉚ 실패하면 표시 그대로" 1 "$(qmark '!' t1)"
  chk "㉚ 실패하면 새 파일 안 되살림" 0 "$(have "$REPO/work.txt")"
  git -C "$REPO" checkout -q -- seed.txt
  ( cd "$REPO" && bash tools/sol/retry.sh t1 > "$REPO/tmp/retry.out" 2>&1 ); rc=$?
  chk "㉚ retry 종료" 0 "$rc"
  chk "㉚ 새 파일 되살림" 1 "$(have "$REPO/work.txt")"
  chk "㉚ 추적 파일 변경 되살림" 1 "$(grep -c impl "$REPO/seed.txt" | awk '{print ($1>0)}')"
  chk "㉚ 장부는 되살리지 않음" 0 "$(git -C "$REPO" diff --name-only | grep -c 'ledger' | tr -d ' ')"
  verdicts PASS
  LOOP_ARGS="--continue"
  code=$(run_loop)
  chk "㉚ 이어서 종료" 0 "$code"
  chk "㉚ 구현 다시 안 부름" 2 "$(hits 'claude impl')"
  chk "㉚ 커밋 수" 2 "$(commits)"
  chk "㉚ 되살린 변경이 커밋됨" 1 "$(git -C "$REPO" ls-files work.txt | grep -c . | tr -d ' ')"
}

case31() { echo "㉛ blame impl 은 지금 동작과 같다"
  setup; add_task t1 "첫 일감" "$(IMPL_M=opus REVIEW_M=sol env_task)"; commit_all
  verdicts FAIL:i PASS
  code=$(run_loop)
  chk "㉛ 종료" 0 "$code"
  chk "㉛ 구현 두 번" 2 "$(hits 'claude impl')"
}

case32() { echo "㉜ 빈 impl-1.log 만 있으면 --continue 는 구현부터"
  setup; add_task t1 "첫 일감" "$(IMPL_M=opus REVIEW_M=sol env_task)"; commit_all
  mkdir -p "$REPO/tmp/loop/t1"; : > "$REPO/tmp/loop/t1/base-untracked.txt"; : > "$REPO/tmp/loop/t1/impl-1.log"
  git -C "$REPO" rev-parse HEAD > "$REPO/tmp/loop/t1/base-head.txt"
  verdicts PASS
  LOOP_ARGS="--continue"
  code=$(run_loop)
  chk "㉜ 종료" 0 "$code"
  chk "㉜ 구현을 부름" 1 "$(hits 'claude impl')"
  # sol 구현의 정상 종료 줄이 있으면 끝난 것으로 본다
  setup; add_task t1 "첫 일감" "$(IMPL_M=sol REVIEW_M=opus env_task)"; commit_all
  mkdir -p "$REPO/tmp/loop/t1"; : > "$REPO/tmp/loop/t1/base-untracked.txt"
  echo "sol/run.sh: s0/t1 끝(new, 3분, 호출 2, 끝 문맥 1, 입력 1, 커밋 0, 종료 0). 답: x" > "$REPO/tmp/loop/t1/impl-1.log"
  echo impl > "$REPO/work.txt"
  verdicts PASS
  LOOP_ARGS="--continue"
  code=$(run_loop)
  chk "㉜ sol 정상 종료 줄: 종료" 0 "$code"
  chk "㉜ sol 정상 종료 줄: 구현 안 부름" 0 "$(hits 'impl-1')"
}

case33() { echo "㉝ watch.sh 가 밖에서 상태를 읽는다"
  setup; add_task t1 "첫 일감" "$(env_task)"; commit_all
  mkdir -p "$REPO/tmp/loop/t1"; W="$REPO/tools/sol/watch.sh"
  echo "2026-11-27 10:00 일감 t1 1회차 구현 끝(opus, 종료 0)" > "$REPO/tmp/loop/loop.log"
  ( cd "$REPO" && exec -a "bash tools/sol/loop.sh --continue" sleep 9 ) & fp=$!
  sleep 1
  chk "㉝ RUNNING" 1 "$(bash "$W" --once "$REPO" | grep -c ' RUNNING .*t1' | tr -d ' ')"
  touch -t 202601010000 "$REPO/tmp/loop/loop.log" "$REPO/tmp/loop/t1"
  chk "㉝ STALLED" 1 "$(bash "$W" --once "$REPO" | grep -c ' STALLED ' | tr -d ' ')"
  touch "$REPO/tmp/loop/loop.log"
  WATCH_POLL=1 bash "$W" --until-attention "$REPO" > "$REPO/tmp/watch.out" 2>&1 & wp=$!
  sleep 2
  chk "㉝ 도는 동안 끝나지 않음" 1 "$(kill -0 $wp 2>/dev/null && echo 1 || echo 0)"
  chk "㉝ 도는 동안 찍지 않음" 0 "$(grep -c . "$REPO/tmp/watch.out" | tr -d ' ')"
  printf '# 루프가 선 자리 (x)\n\n일감 t1 이 같은 문제로 FAIL 했다. 그 뒤.\n' > "$REPO/tmp/loop/status.md"
  echo "2026-11-27 10:05 멈춤(종료 3): 일감 t1 이 같은 문제로 FAIL 했다." >> "$REPO/tmp/loop/loop.log"
  wait $fp 2>/dev/null
  i=0; while kill -0 $wp 2>/dev/null && [ $i -lt 10 ]; do sleep 1; i=$((i + 1)); done
  chk "㉝ 멈추면 끝남" 0 "$(kill -0 $wp 2>/dev/null && echo 1 || echo 0)"
  kill $wp 2>/dev/null
  chk "㉝ 한 줄 STOPPED 3" 1 "$(grep -c ' STOPPED 3 .*같은 문제로 FAIL 했다\.' "$REPO/tmp/watch.out" | tr -d ' ')"
  chk "㉝ --once STOPPED 3" 1 "$(bash "$W" --once "$REPO" | grep -c ' STOPPED 3 ' | tr -d ' ')"
  echo "2026-11-27 10:06 일감 t1 1회차 검사 종료 0" >> "$REPO/tmp/loop/loop.log"
  chk "㉝ DEAD" 1 "$(bash "$W" --once "$REPO" | grep -c ' DEAD ' | tr -d ' ')"
  ( cd "$REPO" && exec -a "bash tools/sol/resume.sh" sleep 4 ) & rp=$!
  sleep 1
  chk "㉝ RETRY_WAIT" 1 "$(bash "$W" --once "$REPO" | grep -c ' RETRY_WAIT' | tr -d ' ')"
  kill $rp 2>/dev/null; wait $rp 2>/dev/null
}

case34() { echo "㉞ 루프가 TERM 을 받으면 배경으로 돌던 단계도 끝낸다"
  setup; add_task t1 "첫 일감" "$(IMPL_M=opus REVIEW_M=sol env_task)"; commit_all
  verdicts PASS
  ( cd "$REPO" && exec env LOOP_CLAUDE="$REPO/fake/claude" LOOP_SOL_RUN="$REPO/fake/run.sh" LOOP_BUSY_PATTERN=no-such-busy-job-xyz \
      LOOP_OUT="$REPO/tmp/loop" SOL_OUT="$REPO/tmp/sol" LOOP_CODEX_SESSIONS="$REPO/fake/sessions" LOOP_KILL_GRACE=2 \
      FAKE_LOG="$REPO/tmp/fake.log" FAKE_VERDICTS="$REPO/tmp/verdicts" FAKE_REPO="$REPO" FAKE_IMPL_SLEEP=3175 \
      bash tools/sol/loop.sh > "$REPO/tmp/run.out" 2>&1 ) & lp=$!
  sleep 2; kill -TERM $lp; wait $lp; code=$?
  chk "㉞ 종료" 143 "$code"
  chk "㉞ 구현 프로세스 남지 않음" 0 "$(left 'sleep 3175')"
  chk "㉞ 잠금 풀림" 0 "$([ -d "$REPO/tmp/loop/lock" ] && echo 1 || echo 0)"
}

for c in ${LOOP_TEST_CASES:-case1 case2 case3 case4 case5 case6 case7 case8 case9 case10 case11 case12 case13 case14 case15 case16 case17 case18 case19 case20 case21 case22 case23 case24 case25 case26 case27 case28 case29 case30 case31 case32 case33 case34}; do "$c"; done
[ -n "${LOOP_TEST_KEEP:-}" ] || wipe
printf '\n문법 검사: '; for f in "$LOOP_SRC" "$HERE/retry.sh" "$HERE/watch.sh" "$HERE/resume.sh"; do bash -n "$f" || { echo "FAIL $f"; BADN=$((BADN + 1)); }; done; echo ok
printf '통과 %s, 실패 %s\n' "$OKN" "$BADN"
[ "$BADN" = 0 ] || exit 1
