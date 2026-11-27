#!/bin/bash
# 선 일감 하나를 「검사·검수부터」 다시 돌릴 수 있게 해 둔다. 종료 9(일감이 틀렸다)·3·4 로 선 일감을 마스터가 고친 뒤에 쓴다.
# 하는 일: (1) 보관한 구현 변경(failed.patch 의 장부 뺀 부분, failed-untracked/)이 있으면 되살린다(안 되면 아무것도 바꾸지 않고 선다)
#   (2) 지난 회차 파일을 tmp/loop/<id>/run-<날짜시각>/ 으로 옮긴다(impl-1.*·base-head.txt·base-untracked.txt 는 남긴다)
#   (3) 일감 목록의 [!] 를 [ ] 로 돌린다 (4) 표시 파일 tmp/loop/<id>/recheck 를 남긴다
# 그 뒤 tools/sol/loop.sh --continue 가 구현 없이 검사·검수부터 한다(표시는 검수가 끝나면 루프가 지운다).
# 쓰는 법: tools/sol/retry.sh <일감 id>
set -u
cd "$(dirname "$0")/../.." || exit 2
QUEUE="${LOOP_QUEUE:-docs/redraw-orders/queue.md}"
OUT="${LOOP_OUT:-tmp/loop}"

die() { echo "retry.sh: $1" >&2; exit 2; }
[ $# -eq 1 ] || die "쓰는 법: tools/sol/retry.sh <일감 id>"
id=$1; W="$OUT/$id"
[ -d "$W" ] || die "$W 가 없다"
[ -f "$W/base-untracked.txt" ] || die "$W/base-untracked.txt 가 없다(루프가 시작한 적 없는 일감이다)"
[ ! -d "$OUT/lock" ] || die "루프가 돌고 있다($OUT/lock). 끝난 뒤에 쓴다"
[ -f "$QUEUE" ] || die "일감 목록이 없다: $QUEUE"
awk -v id="$id" '$1=="-" && $2=="[!]" && $3==id {f=1} END{exit !f}' "$QUEUE" || die "$QUEUE 에 '- [!] $id' 줄이 없다"
TOP=$(git rev-parse --show-toplevel 2>/dev/null) || die "git 저장소가 아니다"
W_ABS=$(cd "$W" && pwd)

# (1) 되살리기. 먼저 모두 되는지 본 뒤에 바꾼다
patch=; nu=0
if [ -s "$W/failed.patch" ]; then
  patch="$W_ABS/failed.patch"
  git -C "$TOP" apply --check --exclude='*-ledger.tsv' "$patch" 2>"$W/retry-apply.err" \
    || die "보관한 패치가 지금 작업 트리에 들어가지 않는다($W/retry-apply.err). 아무것도 바꾸지 않았다"
fi
if [ -d "$W/failed-untracked" ]; then
  while IFS= read -r f; do
    rel=${f#"$W_ABS/failed-untracked/"}
    [ ! -e "$TOP/$rel" ] || die "보관한 새 파일 $rel 이 이미 제자리에 있다. 아무것도 바꾸지 않았다"
  done < <(find "$W_ABS/failed-untracked" -type f)
fi
if [ -n "$patch" ]; then
  git -C "$TOP" apply --exclude='*-ledger.tsv' "$patch" || die "패치를 넣지 못했다(--check 는 통과했다). 작업 트리를 확인한다"
fi
if [ -d "$W/failed-untracked" ]; then
  while IFS= read -r f; do
    rel=${f#"$W_ABS/failed-untracked/"}
    mkdir -p "$(dirname "$TOP/$rel")" && mv "$f" "$TOP/$rel" && nu=$((nu + 1))
  done < <(find "$W_ABS/failed-untracked" -type f)
fi

# (2) 지난 회차 파일 옮기기
R="$W/run-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$R" || die "$R 를 만들지 못했다"
for f in "$W"/review-* "$W"/check-* "$W"/brief-* "$W"/failed.patch "$W"/failed-untracked "$W"/impl-*; do
  [ -e "$f" ] || continue
  b=${f##*/}
  case "$b" in impl-*) k=${b#impl-}; k=${k%%.*}; [ "$k" = 1 ] && continue ;; esac
  mv "$f" "$R/"
done

# (3) 일감 목록 (4) 표시
awk -v id="$id" '$1=="-" && $2=="[!]" && $3==id {sub(/^- \[!\]/, "- [ ]")} {print}' "$QUEUE" > "$QUEUE.tmp" && mv "$QUEUE.tmp" "$QUEUE"
date '+%Y-%m-%d %H:%M retry.sh' > "$W/recheck"

if [ -n "$patch" ] || [ "$nu" -gt 0 ]; then
  echo "retry.sh: 일감 $id 의 보관한 구현 변경을 되살렸다(패치 $([ -n "$patch" ] && echo 있음 || echo 없음), 새 파일 ${nu}개). 지난 회차 파일은 $R 로 옮겼다."
else
  echo "retry.sh: 일감 $id 의 구현 변경은 작업 트리에 있던 그대로다. 지난 회차 파일은 $R 로 옮겼다."
fi
echo "retry.sh: 목록을 [ ] 로 돌리고 $W/recheck 를 남겼다. 다음: tools/sol/loop.sh --continue (구현 없이 검사·검수부터)"
