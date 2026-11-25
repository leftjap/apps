#!/bin/bash
# 검수-구현 루프. 일감 하나를 CLI 로 구현 → 통과 검사 → 다른 모델 CLI 가 읽기 전용으로 검수 → PASS 면 로컬 커밋하고 다음 일감.
# 규칙은 mapo/CLAUDE.md 「낭비 없이 일하는 법」, 멈춤 조건은 docs/redraw-orders/README.md 「운용 방식」.
# 일감은 docs/redraw-orders/queue/<id>/{task.env,brief.md}, 목록은 docs/redraw-orders/queue.md.
# 쓰는 법: tools/sol/loop.sh [--once] [--dry-run] [--continue]
#   --continue: 한도나 중단으로 끊긴 맨 위 일감을 작업 트리 그대로 이어받는다(구현이 끝났으면 검사·검수부터)
# 종료: 0 목록 끝, 2 사용법·환경, 3 같은 일감 두 번 실패, 4 STOP 판정, 5 단계의 끝(지오 확인), 6 단계 신호, 7 한도
set -u
cd "$(dirname "$0")/../.." || exit 2

QUEUE="${LOOP_QUEUE:-docs/redraw-orders/queue.md}"
QDIR="${LOOP_QUEUE_DIR:-docs/redraw-orders/queue}"
LEDGER="${LOOP_LEDGER:-docs/redraw-orders/loop-ledger.tsv}"
OUT="${LOOP_OUT:-tmp/loop}"
CLAUDE="${LOOP_CLAUDE:-claude}"
SOL_RUN="${LOOP_SOL_RUN:-tools/sol/run.sh}"
SOL_OUT="${SOL_OUT:-tmp/sol}"
CODEX_SESSIONS="${LOOP_CODEX_SESSIONS:-$HOME/.codex/sessions}"
PGREP="${LOOP_PGREP:-pgrep}"
PY="${LOOP_PY:-/usr/bin/python3}"
LIMIT="${LOOP_LIMIT:-90}"
MAX_REVIEW_BRIEF="${LOOP_MAX_REVIEW_BRIEF:-11500}"
MAX_ATTEMPTS="${LOOP_MAX_ATTEMPTS:-4}"
# 구현이 배경으로 돌려 두고 먼저 답한 긴 작업(자료 만들기 등). 끝날 때까지 검사를 미룬다
BUSY_PATTERN="${LOOP_BUSY_PATTERN:-heavy\.sh|tools/v2/|pack_district|survey_roof|tmp/loop/.*\.py}"
BUSY_POLL="${LOOP_BUSY_POLL:-30}"
BUSY_MAX="${LOOP_BUSY_MAX:-10800}"
PLAN_MODEL="${LOOP_PLAN_MODEL:-opus}"
PLANNER="${LOOP_PLANNER:-docs/redraw-orders/queue/PLANNER.md}"
COAUTHOR='Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'

once=; dry=; cont=
for a in "$@"; do
  case "$a" in
    --once) once=1 ;;
    --dry-run) dry=1 ;;
    --continue) cont=1 ;;
    *) echo "loop.sh: 쓰는 법: tools/sol/loop.sh [--once] [--dry-run] [--continue]" >&2; exit 2 ;;
  esac
done

mkdir -p "$OUT" || exit 2
OUT_ABS=$(cd "$OUT" && pwd) || exit 2
TOP=$(git rev-parse --show-toplevel 2>/dev/null) || { echo "loop.sh: git 저장소가 아니다" >&2; exit 2; }
PREFIX=$(git rev-parse --show-prefix 2>/dev/null)
SCOPE="${PREFIX:-.}"
LEDGER_R="${PREFIX}${LEDGER}"
QUEUE_R="${PREFIX}${QUEUE}"

g() { git -C "$TOP" "$@"; }
log() { printf '%s\n' "$*"; printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M')" "$*" >> "$OUT/loop.log"; }
finish() { # 종료 코드, 한 단락
  c=$1; shift
  printf '# 루프가 선 자리 (%s)\n\n%s\n' "$(date '+%Y-%m-%d %H:%M')" "$*" > "$OUT/status.md"
  log "멈춤(종료 $c): $*"
  exit "$c"
}

# ---- 한 번에 하나 ----
LOCK="$OUT/lock"
if ! mkdir "$LOCK" 2>/dev/null; then
  echo "loop.sh: 다른 루프가 돌고 있다($LOCK). 끝났는데 남아 있으면 그 폴더를 지운다" >&2; exit 2
fi
trap 'rmdir "$LOCK" 2>/dev/null' EXIT
# Sol 은 run.sh 가 한 번에 하나만 돌게 기다린다(두 루프가 함께 돌 수 있다)

# ---- 작업 트리를 읽는 도구 ----
porcelain() { g status --porcelain --untracked-files=all -- "$SCOPE"; }
SOL_LEDGER_R="${PREFIX}${SOL_LEDGER:-docs/redraw-orders/sol-ledger.tsv}"
impl_paths() { # 구현이 바꾼 파일(루프가 스스로 쓰는 장부·일감 목록은 뺀다). 저장소 뿌리 기준 경로
  porcelain | while IFS= read -r l; do
    p=$(printf '%s' "$l" | cut -c4-)
    case "$l" in R*|*' -> '*) p=${p##* -> } ;; esac
    p=${p%\"}; p=${p#\"}
    [ -n "$p" ] || continue
    case "$p" in "$LEDGER_R"|"$QUEUE_R") continue ;; esac
    # 시작 전부터 있던 추적 안 된 파일(다른 세션의 것)은 구현이 바꾼 것이 아니다
    [ -n "${BASE_UNTRACKED:-}" ] && [ -f "$BASE_UNTRACKED" ] && grep -Fxq -- "$p" "$BASE_UNTRACKED" && continue
    printf '%s\n' "$p"
  done
}
tree_sig() { # 검수가 작업 트리를 건드렸는지 보려고 재는 값
  {
    # 장부는 run.sh·loop.sh 가 실행마다 한 줄씩 더하므로 뺀다(검수 중에도 바뀐다)
    porcelain | grep -v -F -e "$SOL_LEDGER_R" -e "$LEDGER_R"
    g diff HEAD -- "$SCOPE" ":(exclude)$SOL_LEDGER_R" ":(exclude)$LEDGER_R"
    g ls-files -o --exclude-standard -- "$SCOPE" | while IFS= read -r f; do
      [ -f "$TOP/$f" ] && shasum "$TOP/$f"
    done
  } 2>/dev/null | shasum | cut -d' ' -f1
}

# ---- 한도 ----
codex_pct() {
  f=$(find "$CODEX_SESSIONS" -name 'rollout-*.jsonl' -type f 2>/dev/null | while IFS= read -r p; do
        printf '%s\t%s\n' "$(stat -f %m "$p" 2>/dev/null || echo 0)" "$p"
      done | sort -rn | head -1 | cut -f2-)
  [ -n "$f" ] || return 0
  "$PY" - "$f" <<'PY' 2>/dev/null
import json, sys
def walk(x):
    if isinstance(x, dict):
        p = x.get('primary')
        if isinstance(p, dict) and 'used_percent' in p:
            return p['used_percent']
        for v in x.values():
            r = walk(v)
            if r is not None:
                return r
    elif isinstance(x, list):
        for v in x:
            r = walk(v)
            if r is not None:
                return r
    return None
pct = ''
for line in open(sys.argv[1], errors='replace'):
    if 'used_percent' not in line:
        continue
    try:
        o = json.loads(line)
    except Exception:
        continue
    r = walk(o)
    if r is not None:
        pct = r
print(pct)
PY
}
over_limit() { # 모델 이름(opus|sonnet|haiku|sol) → 남은 한도가 모자라면 0
  if [ "$1" != sol ]; then
    pct="${CLAUDE_WEEKLY_USED:-}"
    [ -n "$pct" ] || { log "한도 미확인(Claude: CLAUDE_WEEKLY_USED 가 없다). 검사를 생략한다"; return 1; }
  else
    pct=$(codex_pct)
    [ -n "$pct" ] || { log "한도 미확인(Codex: $CODEX_SESSIONS 에 세션 파일이 없다). 검사를 생략한다"; return 1; }
  fi
  if awk -v p="$pct" -v m="$LIMIT" 'BEGIN{exit !(p+0>=m+0)}'; then
    LIMIT_MSG="$1 의 쓴 한도가 ${pct}% 다(상한 ${LIMIT}%)"
    return 0
  fi
  log "한도 $1 ${pct}% (상한 ${LIMIT}%)"
  return 1
}

# ---- 장부 ----
ledger() { # 일감 회차 단계 모델 에포트 분 비용 결과
  [ -f "$LEDGER" ] || printf '날짜\t일감\t회차\t단계\t모델\t에포트\t분\t비용\t결과\n' > "$LEDGER"
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$(date '+%Y-%m-%d %H:%M')" "$@" >> "$LEDGER"
}
busy_jobs() { # 구현이 남긴 긴 작업이 있으면 0. 지시문 글에 경로가 든 claude·codex 실행(다른 루프 포함)은 치지 않는다
  ps -axo args= | grep -E -- "$BUSY_PATTERN" | grep -v -E -e '^(claude|[^ ]*/claude) ' -e 'codex' -e 'grep ' | grep -q .
}
task_sig() { cat "$TASKDIR"/* 2>/dev/null | shasum | cut -d' ' -f1; }
impl_cut() { # claude -p 결과가 비었거나 오류(한도 포함)면 0
  python3 - "$1" <<'PYC' 2>/dev/null
import json, sys
try:
    d = json.load(open(sys.argv[1]))
except Exception:
    sys.exit(0)
sys.exit(0 if d.get('is_error') or d.get('subtype') != 'success' else 1)
PYC
}
plan_next() { # 목록이 비면 계획 세우기 모델이 다음 일감을 쓰고, 루프가 그것을 커밋한다
  t0=$(date +%s)
  pf="$OUT/plan-$(date +%s).md"
  {
    echo "# 계획 세우기 (루프가 부름)"
    echo "아래 안내를 따라 다음 일감 하나를 $QDIR/<id>/ 에 쓰고 $QUEUE 끝에 '- [ ] <id> 한 줄 설명' 을 더한다. 단계가 끝났으면 일감을 쓰지 말고 $OUT/stage-done.md 에 지오에게 보일 주소와 한 단락을 쓴다."
    echo; cat "$PLANNER"
    echo; echo "## 지금 목록"; cat "$QUEUE"
    echo; echo "## 루프 기록 끝 40줄"; tail -40 "$OUT/loop.log" 2>/dev/null
    echo; echo "## 최근 커밋"; g log --oneline -8 -- "$SCOPE"
  } > "$pf"
  sig_before=$(g status --porcelain --untracked-files=all -- "$SCOPE" | grep -v -F -e "$SOL_LEDGER_R" -e "$LEDGER_R" | shasum)
  "$CLAUDE" -p --model "$PLAN_MODEL" --effort high --output-format json \
    --permission-mode bypassPermissions "$(cat "$pf")" > "$pf.json" 2>"$pf.err"
  pcode=$?
  ledger plan 1 plan "$PLAN_MODEL" high "$(mins_since "$t0")" "$(json_cost "$pf.json")" "종료 $pcode"
  impl_cut "$pf.json" && finish 7 "계획 세우기가 한도나 오류로 끊겼다($pf.json). tools/sol/loop.sh --continue 로 이어 간다."
  new=$(g status --porcelain --untracked-files=all -- "${PREFIX}$QDIR" "$QUEUE_R" | sed 's/^...//')
  if [ -n "$new" ]; then
    printf '%s\n' "$new" | while IFS= read -r p; do g add -- "$p"; done
    g commit -q -m "chore(mapo-loop): plan next task" -m "$COAUTHOR" || finish 2 "계획한 일감을 커밋하지 못했다"
    log "계획 세우기가 일감을 더했다: $(g log -1 --format=%h)"
  fi
  [ "$sig_before" = "$(g status --porcelain --untracked-files=all -- "$SCOPE" | grep -v -F -e "$SOL_LEDGER_R" -e "$LEDGER_R" | shasum)" ] || \
    finish 4 "계획 세우기가 일감 목록 밖의 파일을 고쳤다. 계획 단계는 일감만 쓴다."
}
read_field() { # 검수 답의 마지막 JSON 줄에서 칸 하나
  python3 - "$1" "$2" <<'PYF' 2>/dev/null
import json, sys
raw = open(sys.argv[1], encoding='utf-8', errors='replace').read()
try:
    text = json.loads(raw).get('result', '')
except Exception:
    text = raw
for line in reversed(text.strip().splitlines()):
    line = line.strip().strip('`')
    if line.startswith('{'):
        try:
            print(str(json.loads(line).get(sys.argv[2])).lower())
        except Exception:
            continue
        break
PYF
}
read_verdict() { # 검수 답(claude json 이면 result 칸, 아니면 글)의 마지막 JSON 줄에서 판정 하나만 읽는다
  python3 - "$1" <<'PYV' 2>/dev/null
import json, sys
raw = open(sys.argv[1], encoding='utf-8', errors='replace').read()
try:
    text = json.loads(raw).get('result', '')
except Exception:
    text = raw
for line in reversed(text.strip().splitlines()):
    line = line.strip().strip('`')
    if not line.startswith('{'):
        continue
    try:
        v = json.loads(line).get('verdict')
    except Exception:
        continue
    if v in ('PASS', 'FAIL', 'STOP'):
        print(v)
    break
PYV
}
json_cost() { # opus 응답 json → 비용과 입력 토큰(캐시 포함)
  c=$(grep -oE '"total_cost_usd"[: ]*[0-9.]+' "$1" 2>/dev/null | tail -1 | grep -oE '[0-9.]+$')
  t=$(grep -oE '"(input_tokens|cache_read_input_tokens|cache_creation_input_tokens)"[: ]*[0-9]+' "$1" 2>/dev/null \
      | grep -oE '[0-9]+$' | awk '{s+=$1} END{print s+0}')
  printf '$%s/입력 %s' "${c:-?}" "${t:-0}"
}
mins_since() { echo $(( ($(date +%s) - $1 + 30) / 60 )); }
cap_bytes() { # 파일을 바이트 수 안으로 자른다(Sol 의 지시문 상한 때문에)
  [ "$(wc -c < "$1" | tr -d ' ')" -le "$2" ] && return 0
  head -c "$2" "$1" > "$1.cut" && printf '\n…(여기서 잘랐다. 전체는 %s)\n' "$1" >> "$1.cut" && mv "$1.cut" "$1"
}

# ---- 일감 목록 ----
mark_queue() { # 줄 번호, x 또는 !
  awk -v n="$1" -v m="$2" 'NR==n{sub(/^- \[ \]/, "- [" m "]")} {print}' "$QUEUE" > "$QUEUE.tmp" \
    && mv "$QUEUE.tmp" "$QUEUE"
}

[ -f "$QUEUE" ] || finish 2 "일감 목록이 없다: $QUEUE"

# ---- 되돌리기 ----
keep_and_restore() { # 두 번 실패하거나 STOP 일 때. 구현 변경을 보관하고 기준점 상태로 되돌린다
  mkdir -p "$WORK/failed-untracked"
  g diff HEAD -- "$SCOPE" > "$WORK/failed.patch" 2>/dev/null
  impl_paths | while IFS= read -r p; do
    if g ls-files --error-unmatch -- "$p" > /dev/null 2>&1; then
      g restore --staged --worktree -- "$p" 2>/dev/null || g checkout -- "$p" 2>/dev/null
    else
      d=$(dirname "$p")
      mkdir -p "$WORK_ABS/failed-untracked/$d"
      mv "$TOP/$p" "$WORK_ABS/failed-untracked/$p" 2>/dev/null
    fi
  done
  log "구현 변경을 $WORK/failed.patch 와 $WORK/failed-untracked/ 에 보관하고 기준점으로 되돌렸다"
}

# ================= 일감 하나씩 =================
while :; do
  qline=$(grep -n -m1 '^- \[ \] ' "$QUEUE")
  if [ -z "$qline" ] && [ -f "$PLANNER" ] && [ -z "$dry" ]; then
    plan_next
    qline=$(grep -n -m1 '^- \[ \] ' "$QUEUE")
    [ -z "$qline" ] && [ -s "$OUT/stage-done.md" ] && { m=$(cat "$OUT/stage-done.md"); mv "$OUT/stage-done.md" "$OUT/stage-done.$(date +%s).md"; finish 5 "계획 세우기가 단계가 끝났다고 판단했다. 지오 확인 필요: $m"; }
  fi
  if [ -z "$qline" ]; then
    finish 0 "일감 목록($QUEUE)에 남은 일감이 없다. 다음 단계의 일감을 적으면 다시 돈다."
  fi
  lineno=${qline%%:*}
  qtext=${qline#*:}
  id=$(printf '%s' "${qtext#*] }" | awk '{print $1}')
  [ -n "$id" ] || finish 2 "$QUEUE $lineno 행에서 일감 이름을 읽지 못했다: $qtext"
  TASKDIR="$QDIR/$id"
  WORK="$OUT/$id"; WORK_ABS="$OUT_ABS/$id"
  mkdir -p "$WORK"
  [ -f "$TASKDIR/task.env" ] || finish 2 "일감 $id 의 $TASKDIR/task.env 가 없다"
  [ -s "$TASKDIR/brief.md" ] || finish 2 "일감 $id 의 $TASKDIR/brief.md 가 없다"

  unset STAGE IMPL IMPL_EFFORT REVIEW REVIEW_EFFORT CHECK SIGNAL STAGE_END SHOTS
  . "$TASKDIR/task.env" || finish 2 "일감 $id 의 task.env 를 읽지 못했다"
  for v in STAGE IMPL IMPL_EFFORT REVIEW REVIEW_EFFORT CHECK; do
    eval "x=\${$v:-}"
    [ -n "$x" ] || finish 2 "일감 $id 의 task.env 에 $v 가 없다"
  done
  SIGNAL="${SIGNAL:-}"; STAGE_END="${STAGE_END:-}"; SHOTS="${SHOTS:-}"
  case "$IMPL" in opus|sonnet|haiku|sol) ;; *) finish 2 "일감 $id 의 IMPL 은 opus·sonnet·haiku·sol 가운데 하나다(지금 $IMPL)";; esac
  case "$REVIEW" in opus|sonnet|haiku|sol) ;; *) finish 2 "일감 $id 의 REVIEW 는 opus·sonnet·haiku·sol 가운데 하나다(지금 $REVIEW)";; esac
  [ "$IMPL" != "$REVIEW" ] || finish 2 "일감 $id: 구현자와 검수자가 같은 모델이다($IMPL). 검수는 다른 모델이 한다"
  case "$IMPL_EFFORT" in low|medium|high) ;; *) finish 2 "일감 $id 의 IMPL_EFFORT 는 low·medium·high 가운데 하나다";; esac
  case "$REVIEW_EFFORT" in low|medium|high) ;; *) finish 2 "일감 $id 의 REVIEW_EFFORT 는 low·medium·high 가운데 하나다";; esac

  # 1. 한도
  LIMIT_MSG=""
  if over_limit "$IMPL" || over_limit "$REVIEW"; then
    finish 7 "일감 $id 를 시작하지 않았다. $LIMIT_MSG. 한도가 풀린 뒤에 다시 돌린다(다른 서비스가 남았으면 그쪽으로 일감의 IMPL·REVIEW 를 바꾼다)."
  fi

  if [ -n "$dry" ]; then
    printf 'loop.sh --dry-run: 다음 일감 %s (단계 %s, 구현 %s/%s, 검수 %s/%s)\n검사: %s\n' \
      "$id" "$STAGE" "$IMPL" "$IMPL_EFFORT" "$REVIEW" "$REVIEW_EFFORT" "$CHECK"
    [ -n "$SHOTS" ] && printf '화면: %s\n' "$SHOTS"
    finish 0 "--dry-run 이라 CLI 를 부르지 않았다. 다음 일감은 $id 다."
  fi

  # 2. 구현 전 기준점
  BASE_UNTRACKED="$WORK/base-untracked.txt"
  skip_impl1=; skip_n=; resume_note=; start_n=1
  if [ -n "$cont" ] && [ -f "$BASE_UNTRACKED" ] && { [ -e "$WORK/impl-1.json" ] || [ -e "$WORK/impl-1.log" ]; }; then
    # 끊긴 일감을 이어받는다: 기준점 목록은 처음 것을 그대로 쓰고, 작업 트리의 변경은 그 일감의 것으로 본다
    base_head=$(cat "$WORK/base-head.txt" 2>/dev/null || g rev-parse HEAD)
    base_status=
    k=0; for i in $(seq 1 "$MAX_ATTEMPTS"); do [ -e "$WORK/review-$i.out" ] && k=$i; done
    if [ "$k" -ge 1 ] && [ "$k" -lt "$MAX_ATTEMPTS" ] && [ "$(read_verdict "$WORK/review-$k.out")" != PASS ] && [ "$(read_verdict "$WORK/review-$k.out")" != STOP ]; then
      start_n=$((k + 1)); log "일감 $id: ${k}회차 검수가 FAIL 이었다. 그 의견을 붙여 ${start_n}회차 구현부터 한다"
      if [ -e "$WORK/impl-$start_n.json" ] && ! impl_cut "$WORK/impl-$start_n.json"; then
        skip_n=$start_n; log "일감 $id: ${start_n}회차 구현은 이미 끝나 있었다. 검사·검수부터 한다"
      fi
    elif [ -e "$WORK/impl-1.json" ] && impl_cut "$WORK/impl-1.json"; then
      resume_note=1; log "일감 $id: 1회차 구현이 끊겨 있었다. 작업 트리를 이어받아 다시 맡긴다"
    else
      skip_impl1=1; log "일감 $id: 1회차 구현은 끝나 있었다. 검사·검수부터 한다"
    fi
  else
    base_head=$(g rev-parse HEAD)
    echo "$base_head" > "$WORK/base-head.txt"
    # 추적 안 된 파일은 다른 세션이 둔 것일 수 있어 막지 않고 목록으로 남겨 빼고 센다. 추적하는 파일의 수정만 막는다
    g ls-files -o --exclude-standard --full-name -- "$SCOPE" > "$BASE_UNTRACKED"
    base_status=$(g status --porcelain --untracked-files=no -- "$SCOPE" | grep -v -F -e "$SOL_LEDGER_R" -e "$LEDGER_R")
  fi
  if [ -n "$base_status" ]; then
    printf '%s\n' "$base_status" > "$WORK/dirty.txt"
    finish 2 "작업 트리에 이미 바뀐 파일이 있어 시작하지 않았다($WORK/dirty.txt). 누가 무엇을 바꿨는지 가린 뒤에(커밋하거나 되돌린 뒤에) 다시 돌린다."
  fi

  verdict=""; attempt=0
  for n in $(seq "$start_n" "$MAX_ATTEMPTS"); do
    attempt=$n
    # 3. 구현
    bf="$WORK/brief-$n.md"
    {
      echo "# 루프가 붙이는 줄"
      echo "- 커밋하지 않는다. git commit·push·tag 를 쓰지 않는다. 바꾼 파일은 작업 트리에 그대로 둔다(검수가 끝나면 루프가 커밋한다)."
      echo "- 아래 지시문 밖의 파일은 건드리지 않는다."
      echo "- 10분 넘는 명령을 배경으로 돌렸으면, 끝날 때까지 9분 이하의 기다림(while pgrep … ; do sleep 30; done)을 되풀이해 기다린 뒤 그 결과로 그림·검사를 하고 답한다. 끝나기 전에 답하지 않는다."
      echo
      cat "$TASKDIR/brief.md"
    } > "$bf"
    if [ -n "$resume_note" ] && [ "$n" = 1 ]; then
      { echo; echo "## 이어서 하는 실행"; echo "앞 실행이 한도나 중단으로 끊겼다. 작업 트리에 남은 변경과 tmp/loop/$id/ 의 파일을 먼저 보고, 이미 된 것은 다시 하지 말고 남은 것만 끝낸다."; } >> "$bf"
    fi
    if [ "$n" -ge 2 ]; then
      p=$((n - 1))
      {
        echo; echo "## ${p}회차 검수 의견 (이것부터 고친다)"
        echo '```'; tail -40 "$WORK/review-$p.out" 2>/dev/null; echo '```'
        echo "## ${p}회차 통과 검사 결과"
        echo '```'; tail -20 "$WORK/check-$p.txt" 2>/dev/null; echo '```'
      } >> "$bf"
    fi
    t0=$(date +%s)
    task_sig0=$(task_sig)
    if { [ "$n" = 1 ] && [ -n "$skip_impl1" ]; } || [ "$n" = "$skip_n" ]; then
      icode=0
    elif [ "$IMPL" != sol ]; then
      "$CLAUDE" -p --model "$IMPL" --effort "$IMPL_EFFORT" --output-format json \
        --permission-mode bypassPermissions "$(cat "$bf")" > "$WORK/impl-$n.json" 2>"$WORK/impl-$n.err"
      icode=$?
      icost=$(json_cost "$WORK/impl-$n.json")
    else
      # 구현 지시문에는 앞 회차 검수 의견이 붙으므로 Sol 지시문 상한을 넓혀 준다
      SOL_MAX_BRIEF="${LOOP_SOL_IMPL_MAX_BRIEF:-24000}" "$SOL_RUN" "$STAGE-$id-i$n" "$id-impl-$n" "$IMPL_EFFORT" "$bf" > "$WORK/impl-$n.log" 2>&1
      icode=$?
      icost="$id-impl-$n"
    fi
    if ! { [ "$n" = 1 ] && [ -n "$skip_impl1" ]; } && [ "$n" != "$skip_n" ]; then
    ledger "$id" "$n" impl "$IMPL" "$IMPL_EFFORT" "$(mins_since "$t0")" "$icost" "종료 $icode"
    log "일감 $id $n회차 구현 끝($IMPL, 종료 $icode)"
    fi
    if [ "$IMPL" != sol ] && [ -e "$WORK/impl-$n.json" ] && impl_cut "$WORK/impl-$n.json"; then
      finish 7 "일감 $id 의 $n회차 구현이 한도나 오류로 끊겼다($WORK/impl-$n.json). 작업 트리는 그대로 두었다. 한도가 풀리면 tools/sol/loop.sh --continue 로 이어 간다."
    fi
    if [ "$task_sig0" != "$(task_sig)" ]; then
      mark_queue "$lineno" '!'
      finish 4 "일감 $id 의 구현자가 일감 폴더($TASKDIR)를 고쳤다. 통과 기준을 구현자가 바꿀 수 없다. 작업 트리는 그대로 두었다. 마스터가 그 변경을 보고 받아들일지 정한다."
    fi

    # 4. 통과 검사(구현이 배경에 남긴 작업이 끝난 뒤에)
    w0=$(date +%s)
    while busy_jobs; do
      [ $(( $(date +%s) - w0 )) -lt "$BUSY_MAX" ] || { log "배경 작업이 ${BUSY_MAX}초 넘게 끝나지 않는다. 검사를 그대로 돌린다"; break; }
      sleep "$BUSY_POLL"
    done
    [ $(( $(date +%s) - w0 )) -gt "$BUSY_POLL" ] && log "구현이 남긴 배경 작업을 $(( ($(date +%s) - w0) / 60 ))분 기다렸다"
    t0=$(date +%s)
    bash -c "$CHECK" > "$WORK/check-$n.full" 2>&1
    ccode=$?
    tail -80 "$WORK/check-$n.full" > "$WORK/check-$n.txt"
    ledger "$id" "$n" check - - "$(mins_since "$t0")" - "종료 $ccode"
    log "일감 $id $n회차 검사 종료 $ccode"

    # 5. 검수(다른 모델, 읽기 전용)
    rf="$WORK/review-$n.md"
    {
      echo "# 검수 지시 (읽기 전용). 일감 $id, $n 회차"
      echo "아래 일감 지시문이 요구한 것이 실제로 됐는지 본다. 파일을 고치지 않는다."
      echo
      echo "## 일감 지시문"
      cat "$TASKDIR/brief.md"
      echo
      echo "## 바뀐 것"
      g diff --stat HEAD -- "$SCOPE" | tail -60
      echo "바뀐 파일(저장소 뿌리 기준):"
      impl_paths | sed 's/^/- /'
      echo
      echo "## 통과 검사"
      echo "명령: $CHECK"
      echo "종료 코드: $ccode (0 이 통과)"
      echo '```'; cat "$WORK/check-$n.txt"; echo '```'
      echo
      echo "## 화면"
      if [ -n "$SHOTS" ]; then
        echo "다음 캡처를 Read 로 직접 열어 보고 판단한다. 파일만 생겼는지 보고 넘어가지 않는다."
        for s in $SHOTS; do echo "- $s"; done
      else
        echo "이 일감에는 캡처가 없다. 자료와 검사 출력으로 판단한다."
      fi
      echo
      echo "## 문턱"
      echo "- 통과 검사가 0 이고, 일감 지시문의 문턱을 실제로 넘었고, 요청 밖으로 달라진 것이 없으면 PASS."
      echo "- 고치면 될 결함이 있으면 FAIL 이고 무엇을 어떻게 고치는지 적는다."
      echo "- 이 방향으로는 고쳐도 안 된다고 보이면 STOP 이다(망한 길을 밀고 가지 않는 것이 이 루프의 목적이다)."
      echo
      echo "## 하지 않는 것"
      echo "- 파일을 고치지 않는다(작업 트리가 바뀌면 루프가 STOP 으로 센다). 커밋·굽기·측정 실행을 하지 않는다."
      echo "- 일감 밖의 개선을 요구하지 않는다."
      echo
      if [ "$n" -ge 2 ]; then
        echo "## 앞 회차 검수 의견"
        echo '```'; tail -15 "$WORK/review-$((n - 1)).out" 2>/dev/null; echo '```'
        echo "FAIL 의 주된 까닭이 앞 회차와 같은 문제(고쳐지지 않았거나 같은 자리에서 다시 생김)면 repeat 를 true 로 한다. 앞 문제가 풀리고 새 문제만 남았으면 false."
        echo
      fi
      echo "## 답의 꼴"
      echo "열 줄 안쪽으로 까닭을 적고, 맨 마지막 줄에 JSON 한 줄만 둔다:"
      echo '{"verdict":"PASS|FAIL|STOP","repeat":false,"reasons":["..."],"fixes":["..."]}'
    } > "$rf"
    [ "$REVIEW" = sol ] && cap_bytes "$rf" "$MAX_REVIEW_BRIEF"

    sig0=$(tree_sig)
    t0=$(date +%s)
    if [ "$REVIEW" != sol ]; then
      "$CLAUDE" -p --model "$REVIEW" --effort "$REVIEW_EFFORT" --output-format json \
        --permission-mode bypassPermissions --disallowedTools Edit Write NotebookEdit "$(cat "$rf")" > "$WORK/review-$n.out" 2>"$WORK/review-$n.err"
      rcode=$?
      rcost=$(json_cost "$WORK/review-$n.out")
      vfiles="$WORK/review-$n.out"
    else
      SOL_SANDBOX=read-only "$SOL_RUN" "$STAGE-$id-r$n" "$id-review-$n" "$REVIEW_EFFORT" "$rf" > "$WORK/review-$n.log" 2>&1
      rcode=$?
      rcost="$id-review-$n"
      # 판정은 답 파일에서만 읽는다(기록에는 지시문의 답 본보기가 되풀이된다)
      cat "$SOL_OUT/$id-review-$n-answer.md" > "$WORK/review-$n.out" 2>/dev/null
      vfiles="$WORK/review-$n.out"
    fi
    sig1=$(tree_sig)
    verdict=$(read_verdict "$vfiles")
    [ -n "$verdict" ] || { verdict=FAIL; log "검수 답에서 JSON 한 줄을 읽지 못했다($WORK/review-$n.out). FAIL 로 센다"; }
    if [ "$sig0" != "$sig1" ]; then
      verdict=STOP
      log "검수 앞뒤로 작업 트리가 달라졌다($sig0 → $sig1). 읽기 전용 검수가 아니었으므로 STOP 으로 센다"
    fi
    ledger "$id" "$n" review "$REVIEW" "$REVIEW_EFFORT" "$(mins_since "$t0")" "$rcost" "$verdict(종료 $rcode)"
    log "일감 $id $n회차 검수 $verdict"

    # 6. 판정
    [ "$ccode" = 0 ] || { [ "$verdict" = STOP ] || verdict=FAIL; }
    [ "$verdict" = PASS ] && break
    [ "$verdict" = STOP ] && break
    if [ "$n" -ge 2 ] && [ "$(read_field "$vfiles" repeat)" = true ]; then
      log "일감 $id ${n}회차 FAIL 이 앞 회차와 같은 문제다. 밀고 가지 않고 선다"; break
    fi
    [ "$n" = "$MAX_ATTEMPTS" ] && break
    log "일감 $id ${n}회차 FAIL(새 문제). 검수 의견을 붙여 다시 한다"
  done

  if [ "$verdict" != PASS ]; then
    keep_and_restore
    mark_queue "$lineno" '!'
    if [ "$verdict" = STOP ]; then
      finish 4 "일감 $id 가 STOP 판정이다(이 방향으로는 고쳐도 안 된다는 검수 의견). 밀고 가지 않고 섰다. 검수 의견 $WORK/review-$attempt.out, 보관한 변경 $WORK/failed.patch. 원인 조사나 다른 길을 지오에게 낸다."
    fi
    finish 3 "일감 $id 가 ${attempt}회차에서 같은 문제로 FAIL 했거나 회차 상한(${MAX_ATTEMPTS})에 닿았다. 추측으로 더 고치지 않고 섰다. 검수 의견 $WORK/review-*.out, 검사 출력 $WORK/check-$attempt.txt, 보관한 변경 $WORK/failed.patch(새 파일은 $WORK/failed-untracked/). 원인을 조사한 뒤 일감을 다시 쓴다."
  fi

  # PASS: 구현이 바꾼 파일만 골라 로컬 커밋(푸시는 하지 않는다)
  mark_queue "$lineno" x
  changed=$(impl_paths)
  if [ -n "$changed" ]; then
    printf '%s\n' "$changed" | while IFS= read -r p; do g add -- "$p"; done
  fi
  g add -- "$LEDGER_R" "$QUEUE_R" 2>/dev/null
  if g diff --cached --quiet; then
    log "일감 $id 는 PASS 인데 바뀐 파일이 없다. 커밋하지 않는다"
  else
    g commit -q -m "chore(mapo-loop): $id" -m "$COAUTHOR" || finish 2 "일감 $id 의 커밋이 실패했다. 출력을 보고 손으로 정리한다"
    log "일감 $id PASS, 커밋 $(g rev-parse --short HEAD)(푸시하지 않음)"
  fi

  # 단계 신호: 이 방식이 틀렸다는 수치가 나오면 선다
  if [ -n "$SIGNAL" ]; then
    bash -c "$SIGNAL" > "$WORK/signal.txt" 2>&1
    scode=$?
    last=$(grep -v '^[[:space:]]*$' "$WORK/signal.txt" | tail -1)
    log "일감 $id 단계 신호(종료 $scode): $last"
    if [ "$last" = STOP ]; then
      finish 6 "일감 $id 는 커밋했는데 단계 신호가 STOP 이다(이 방식이 틀렸다는 신호). 다음 일감으로 가지 않고 섰다. 잰 값은 $WORK/signal.txt. 고치기를 멈추고 원인 조사나 다른 길을 지오에게 낸다."
    fi
  fi

  [ -n "$STAGE_END" ] && finish 5 "일감 $id 로 단계 $STAGE 를 마쳤다(STAGE_END). 지오가 링크로 보고 넘기기 전에는 다음 단계로 가지 않는다. 검수 의견 $WORK/review-$attempt.out, 검사 출력 $WORK/check-$attempt.txt."
  [ -n "$once" ] && finish 0 "일감 $id 하나를 PASS 로 끝냈다(--once)."
done
