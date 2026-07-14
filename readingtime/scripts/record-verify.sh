#!/bin/sh
# 기록(주·월·지도·장소시트·책상세) 화면 검증 — rtshot 렌더 → 목업 오라클 픽셀 대조.
# 오라클(.oracle/*.png)은 Chrome 으로 mockups/RTRecord.dc.html 을 390×844 로 찍은 것(2x).
# 사용: scripts/record-verify.sh <출력디렉터리>
set -e
OUT="${1:?사용: record-verify.sh <출력디렉터리>}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
KIT="$ROOT/ReadingTimeKit"
ORA="$ROOT/.oracle"
SHOT="$KIT/.build/debug/rtshot"
CMP="$ROOT/scripts/record-cmp.py"
mkdir -p "$OUT"

"$SHOT" 10 "$OUT/week.png"  > /dev/null
"$SHOT" 11 "$OUT/month.png" > /dev/null
"$SHOT" 15 "$OUT/map.png"   > /dev/null
"$SHOT" --seq "login,nav:15,mapTapPin:뉴욕" "$OUT/sheet.png" > /dev/null
"$SHOT" --seq "login,nav:15,mapTapPin:뉴욕,openRecBook:4" "$OUT/book.png" > /dev/null

echo "── 픽셀 불일치율 (글리프 AA 포함) ──"
for n in week month map sheet book; do
  printf '%-6s ' "$n"
  python3 "$CMP" "$ORA/ora-$n.png" "$OUT/$n.png" "$OUT/cmp-$n"
done

echo
echo "── 구조 랜드마크 (Δ≤1px 이어야 함 — 불일치율만으론 1~3px 어긋남이 글리프 AA 에 묻힌다) ──"
fail=0
for n in week month sheet book map; do
  echo "$n:"
  python3 "$ROOT/scripts/record-landmark.py" "$n" "$ORA/ora-$n.png" "$OUT/$n.png" || fail=1
done
exit $fail
