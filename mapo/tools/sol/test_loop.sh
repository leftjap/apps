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
  if [ -n "${FAKE_IMPL_LIMIT:-}" ]; then printf '{"type":"result","subtype":"error","is_error":true,"result":"limit reached"}\n'; exit 1; fi
  printf '{"type":"result","subtype":"success","is_error":false,"total_cost_usd":0.0123,"usage":{"input_tokens":1200,"cache_read_input_tokens":3400}}\n'
else
  [ -n "${FAKE_REVIEW_TOUCH:-}" ] && echo "검수자가 고침" >> "$FAKE_REPO/work.txt"
  v=$(head -1 "$FAKE_VERDICTS"); tail -n +2 "$FAKE_VERDICTS" > "$FAKE_VERDICTS.n"; mv "$FAKE_VERDICTS.n" "$FAKE_VERDICTS"
  r=false; case "$v" in *:r) r=true; v=${v%:r};; esac
  printf '{"type":"result","total_cost_usd":0.002,"usage":{"input_tokens":900},"result":"가짜 검수\\n{\\"verdict\\":\\"%s\\",\\"repeat\\":%s,\\"reasons\\":[\\"가짜 까닭\\"],\\"fixes\\":[\\"가짜 고칠 것\\"]}"}\n' "$v" "$r"
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
    v=$(head -1 "$FAKE_VERDICTS"); tail -n +2 "$FAKE_VERDICTS" > "$FAKE_VERDICTS.n"; mv "$FAKE_VERDICTS.n" "$FAKE_VERDICTS"
    r=false; case "$v" in *:r) r=true; v=${v%:r};; esac
    printf '가짜 검수\n{"verdict":"%s","repeat":%s,"reasons":["가짜 까닭"],"fixes":["가짜 고칠 것"]}\n' "$v" "$r" > "$out/$2-answer.md" ;;
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

for c in ${LOOP_TEST_CASES:-case1 case2 case3 case4 case5 case6 case7 case8 case9 case10 case11 case12 case13 case14 case15 case16 case17 case18 case19 case20 case21 case22 case23 case24}; do "$c"; done
[ -n "${LOOP_TEST_KEEP:-}" ] || wipe
printf '\n문법 검사: '; bash -n "$LOOP_SRC" && echo ok || { echo FAIL; BADN=$((BADN + 1)); }
printf '통과 %s, 실패 %s\n' "$OKN" "$BADN"
[ "$BADN" = 0 ] || exit 1
