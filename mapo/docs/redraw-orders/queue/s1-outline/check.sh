#!/bin/bash
# s1-outline 통과 검사: s1-bake 검사 전부 + 윤곽이 자르는 교차로 면 0.
set -u; cd "$(dirname "$0")/../../../.." || exit 1
bash docs/redraw-orders/queue/s1-bake/check.sh; ok=$?
out=$(tools/.venv/bin/python -B docs/redraw-orders/queue/s1-outline/cuts.py 2>&1); echo "$out" | head -12
echo "$out" | grep -q '^잘린 교차로 면 0개' || { echo "FAIL 윤곽이 교차로 면을 자른다"; ok=1; }
[ -s tmp/loop/s1-outline/border-worst.png ] || { echo "FAIL 그림 없음"; ok=1; }
[ $ok = 0 ] && echo PASS-OUTLINE; exit $ok
