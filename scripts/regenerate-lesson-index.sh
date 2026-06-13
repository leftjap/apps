#!/usr/bin/env bash
# lessons/README.md 의 marker 사이 인덱스 자동 재생성.
# lesson 파일 첫 줄: <!-- trigger: kw1,kw2,... | match-paths: glob1,glob2 -->
#
# 사용: bash ~/apps/scripts/regenerate-lesson-index.sh
set -euo pipefail

LESSONS_DIR="${HOME}/apps/lessons"
README="${LESSONS_DIR}/README.md"
MARKER_BEGIN="<!-- LESSON_INDEX_BEGIN (auto-generated) -->"
MARKER_END="<!-- LESSON_INDEX_END -->"

[[ -d "$LESSONS_DIR" ]] || { echo "ERROR: $LESSONS_DIR not found" >&2; exit 1; }

NEW_INDEX=$(mktemp)
trap "rm -f $NEW_INDEX" EXIT

{
  echo "$MARKER_BEGIN"
  echo
  echo "## 인덱스 (자동 생성 — 수동 편집 금지)"
  echo
  echo "각 lesson 첫 줄 \`<!-- trigger: ... | match-paths: ... -->\` 주석에서 추출."
  echo "재생성: \`bash ~/apps/scripts/regenerate-lesson-index.sh\`"
  echo
  echo "| lesson | trigger 키워드 | match-paths (glob) |"
  echo "|---|---|---|"
  for f in "$LESSONS_DIR"/*.md; do
    base=$(basename "$f")
    [[ "$base" == "README.md" ]] && continue
    [[ "$base" == _* ]] && continue
    first=$(head -1 "$f")
    if [[ "$first" =~ ^\<!--\ trigger:\ (.*)\ \|\ match-paths:\ (.*)\ --\>$ ]]; then
      triggers="${BASH_REMATCH[1]}"
      paths="${BASH_REMATCH[2]}"
      [[ -z "$paths" ]] && paths="(키워드 트리거 only)"
      echo "| \`$base\` | $triggers | $paths |"
    else
      echo "| \`$base\` | ⚠️ trigger 주석 없음 | — |"
    fi
  done
  echo
  echo "$MARKER_END"
} > "$NEW_INDEX"

if grep -qF "$MARKER_BEGIN" "$README"; then
  TMP=$(mktemp)
  awk -v new_file="$NEW_INDEX" -v begin="$MARKER_BEGIN" -v end="$MARKER_END" '
    $0 == begin { skip=1; while ((getline line < new_file) > 0) print line; close(new_file); next }
    $0 == end   { skip=0; next }
    !skip       { print }
  ' "$README" > "$TMP"
  mv "$TMP" "$README"
else
  { cat "$README"; echo; cat "$NEW_INDEX"; } > "$README.tmp"
  mv "$README.tmp" "$README"
fi

echo "✓ $README 인덱스 갱신 완료 ($(grep -c '^| \`' "$README") lesson)"
