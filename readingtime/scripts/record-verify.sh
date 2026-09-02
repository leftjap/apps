#!/bin/sh
# 기록 원페이지(원페이지·day 시트·list 시트·전체 화면 지도·place 시트) 검증 — rtshot 렌더 → 목업 오라클 픽셀 대조.
# 오라클(.oracle/ora-*.png)은 Chrome 으로 design-ref/design_handoff_record_onepage/mockups/RTRecordOnePage.dc.html
# 을 390×844 @2x 로 찍은 것. 사용: scripts/record-verify.sh <출력디렉터리>
set -e
OUT="${1:?사용: record-verify.sh <출력디렉터리>}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
KIT="$ROOT/ReadingTimeKit"
ORA="$ROOT/.oracle"
SHOT="$KIT/.build/debug/rtshot"
CMP="$ROOT/scripts/record-cmp.py"
mkdir -p "$OUT"

"$SHOT" 10 "$OUT/onepage.png" > /dev/null
"$SHOT" --seq "login,nav:10,statsDay:22" "$OUT/day.png" > /dev/null
"$SHOT" --seq "login,nav:10,statsList" "$OUT/list.png" > /dev/null
"$SHOT" --seq "login,nav:10,statsMap" "$OUT/mapfull.png" > /dev/null
"$SHOT" --seq "login,nav:10,statsMap,statsPlace:뉴욕" "$OUT/place.png" > /dev/null

echo "── 픽셀 불일치율 (글리프 AA 포함) ──"
for n in onepage day list mapfull place; do
  printf '%-8s ' "$n"
  python3 "$CMP" "$ORA/ora-$n.png" "$OUT/$n.png" "$OUT/cmp-$n"
done

echo
echo "── 구조 랜드마크 (Δ≤1px 이어야 함 — 불일치율만으론 1~3px 어긋남이 글리프 AA 에 묻힌다) ──"
fail=0
for n in onepage day list mapfull place; do
  echo "$n:"
  python3 "$ROOT/scripts/record-landmark.py" "$n" "$ORA/ora-$n.png" "$OUT/$n.png" || fail=1
done
exit $fail
