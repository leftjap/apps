#!/bin/bash
# Sol(Codex CLI) 실행 도구. 규칙은 mapo/CLAUDE.md 「낭비 없이 일하는 법」.
# 강제하는 것: 단계마다 새 세션(같은 단계 안에서만, 문맥이 20만 토큰 안쪽일 때만 이어 쓰기),
# 한 번에 하나, 지시문 크기와 필수 절, 실행마다 실제 비용을 장부(docs/redraw-orders/sol-ledger.tsv)에 적기.
#
# 쓰는 법: tools/sol/run.sh <단계> <실행 이름> <low|medium|high> <지시문 파일>
#   예: tools/sol/run.sh i2 i2 medium tmp/sol/brief-i2.md      (새 세션)
#       tools/sol/run.sh i2 i2b medium tmp/sol/brief-i2b.md    (같은 단계라 이어 씀)
# 답은 tmp/sol/<실행 이름>-answer.md, 기록은 tmp/sol/<실행 이름>.log 에 남는다.
set -u
cd "$(dirname "$0")/../.." || exit 1

CODEX="${CODEX:-/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex}"
MODEL="${SOL_MODEL:-gpt-6.2-sol}"
LEDGER="${SOL_LEDGER:-docs/redraw-orders/sol-ledger.tsv}"
OUT="${SOL_OUT:-tmp/sol}"
MAX_BRIEF="${SOL_MAX_BRIEF:-12000}"
MAX_CONTEXT="${SOL_MAX_CONTEXT:-200000}"

fail() { echo "sol/run.sh: $1" >&2; exit 2; }

[ $# -eq 4 ] || fail "쓰는 법: tools/sol/run.sh <단계> <실행 이름> <low|medium|high> <지시문 파일>"
stage="$1"; run="$2"; effort="$3"; brief="$4"

case "$effort" in low|medium|high) ;; *) fail "에포트는 low·medium·high 가운데 하나다(기계적 실행은 medium, 설계·엔진·원인 조사는 high)";; esac
[ -f "$brief" ] || fail "지시문 파일이 없다: $brief"
bytes=$(wc -c < "$brief" | tr -d ' ')
[ "$bytes" -le "$MAX_BRIEF" ] || fail "지시문이 ${bytes}바이트다(상한 ${MAX_BRIEF}). CLAUDE.md 에 있는 규칙을 빼고 읽을 문서를 절 단위로 짚어 줄여라. 일을 둘로 나누는 것이 맞는지도 본다."
grep -q '하지 않는 것' "$brief" || fail "지시문에 「하지 않는 것」 절이 없다"
grep -q '답의 꼴' "$brief" || fail "지시문에 「답의 꼴」 절(줄 수 상한)이 없다"
grep -Eq '문턱|통과 조건|고치지 않는다' "$brief" || fail "지시문에 문턱(통과 조건과 재는 명령)이 없다. 조사라면 「고치지 않는다」를 적는다"
mkdir -p "$OUT"
[ ! -e "$OUT/$run.log" ] || fail "실행 이름 $run 은 이미 썼다($OUT/$run.log). 다른 이름을 쓴다"
if pgrep -f 'codex exec' > /dev/null; then fail "다른 Sol 실행이 돌고 있다. 한 번에 하나만 돌린다"; fi

sfile="$OUT/$stage.session"; cfile="$OUT/$stage.context"
# 이어 쓰면 호출마다 그 세션의 문맥 전체를 다시 싣는다. 문맥이 큰 세션은 이어 쓰지 않는다.
if [ -s "$sfile" ] && [ -s "$cfile" ] && [ "$(cat "$cfile")" -gt "$MAX_CONTEXT" ] && [ -z "${SOL_RESUME_ANYWAY:-}" ]; then
  fail "단계 $stage 의 세션은 문맥이 $(cat "$cfile") 토큰이다(상한 $MAX_CONTEXT). 이어 쓰지 말고 새 단계 이름으로 새 세션을 시작한다. 필요한 것은 지시문에 파일과 줄로 짚는다"
fi
head0=$(git rev-parse HEAD); t0=$(date +%s)
args=(-m "$MODEL" -c "model_reasoning_effort=\"$effort\"" -c 'sandbox_mode="danger-full-access"' -o "$OUT/$run-answer.md")
if [ -s "$sfile" ]; then
  mode=resume
  "$CODEX" exec resume "$(cat "$sfile")" "${args[@]}" "$(cat "$brief")" > "$OUT/$run.log" 2>&1
else
  mode=new
  "$CODEX" exec "${args[@]}" "$(cat "$brief")" > "$OUT/$run.log" 2>&1
fi
code=$?

sid=$(grep -m1 '^session id:' "$OUT/$run.log" | awk '{print $3}')
[ "$mode" = new ] && [ -n "$sid" ] && echo "$sid" > "$sfile"
# 실제 내역은 Codex 세션 파일에서 읽는다: 호출 수, 끝 문맥, 최대 문맥, 입력(캐시 포함), 비캐시 입력+출력
IFS=$'\t' read -r calls ctx peak input fresh < <("${SOL_USAGE:-tools/sol/usage.py}" "${sid:-none}" --after "$t0")
echo "${ctx:-0}" > "$cfile"
mins=$(( ($(date +%s) - t0 + 30) / 60 ))
commits=$(git rev-list --count "$head0"..HEAD -- . 2>/dev/null || echo 0)

[ -f "$LEDGER" ] || printf '날짜\t단계\t실행\t에포트\t세션\t지시문(바이트)\t분\t호출\t끝 문맥\t입력(캐시 포함)\t비캐시+출력\t커밋\t종료\t메모\n' > "$LEDGER"
printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t\n' "$(date '+%Y-%m-%d %H:%M')" "$stage" "$run" "$effort" "$mode" "$bytes" "$mins" "$calls" "$ctx" "$input" "$fresh" "$commits" "$code" >> "$LEDGER"
# 코드가 바뀌었으면 코드 지도를 다시 만든다(커밋은 Claude 가 확인한 뒤에 한다)
[ "${commits:-0}" != 0 ] && tools/sol/codemap.py
echo "sol/run.sh: $stage/$run 끝($mode, ${mins}분, 호출 $calls, 끝 문맥 $ctx, 입력 $input, 커밋 $commits, 종료 $code). 답: $OUT/$run-answer.md"
[ "${ctx:-0}" -gt "$MAX_CONTEXT" ] && echo "sol/run.sh: 끝 문맥이 상한($MAX_CONTEXT)을 넘었다. 이 단계는 더 이어 쓰지 않는다. 지시문이 넓었는지 본다(tools/sol/where.py 로 무엇을 읽었는지 확인)."
exit $code
