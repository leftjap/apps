#!/bin/bash
# s1-water 통과 검사: 윤곽에 구멍이 없고, 구운 바닥이 윤곽 안을 다 덮고, 빠진 조각 두 자리가 물이다.
set -u; cd "$(dirname "$0")/../../../.." || exit 1
PY=tools/.venv/bin/python; Q=docs/redraw-orders/queue/s1-water; D=tmp/loop/s1-water; ok=0
mkdir -p "$D/shots" "$D/after"

for f in tools/v2/areas/mapo-all.json public/data/v2/mapo-all.json.gz public/data/v2/mapo-all-a.json.gz \
  public/data/v2/mapo-all-buildings.json.gz public/data/v2/mapo-all-tiles/index.json \
  public/data/v2/mapo-all-tiles/overview.json.gz "$D/gaps.png" "$D/measure.md" \
  tmp/loop/s1-tiles/before/hd-tiles-150.png docs/redraw-orders/queue/s1-tiles/measure.mjs; do
  [ -s "$f" ] || { echo "FAIL 없음: $f"; ok=1; }; done
[ $ok = 0 ] || { echo '앞의 파일이 없어 검사를 멈춘다'; exit 1; }

out=$($PY -B "$Q/water.py" 2>&1); echo "$out" | head -24
echo "$out" | grep -q '^WATER-OK' || { echo 'FAIL 구멍·물 검사'; ok=1; }

# 앞 일감 검사를 그대로 다시 돌린다(윤곽이 교차로 면을 자르지 않고, 자료가 온전하다)
bash docs/redraw-orders/queue/s1-outline/check.sh > "$D/outline-check.txt" 2>&1 \
  || { echo 'FAIL s1-outline 검사'; tail -10 "$D/outline-check.txt"; ok=1; }
tail -4 "$D/outline-check.txt"

tiles=$($PY -B docs/redraw-orders/queue/s1-tiles/verify.py --area mapo-all 2>&1); echo "$tiles" | head -14
echo "$tiles" | grep -q '^VERIFY-OK' || { echo 'FAIL 칸 자료 검사'; ok=1; }
size=$(stat -f%z public/data/v2/mapo-all-tiles/overview.json.gz)
[ "$size" -le 2000000 ] || { echo "FAIL 먼 단계 $size 바이트(상한 2,000,000)"; ok=1; }

# 개발 서버(5199). 이미 떠 있으면 그대로 쓴다
mine=
if [ "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:5199/apps/mapo/mapo-all.html)" != 200 ]; then
  pnpm exec vite --port 5199 --strictPort > "$D/vite.log" 2>&1 & mine=$!
  for _ in $(seq 60); do sleep 1
    [ "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:5199/apps/mapo/mapo-all.html)" = 200 ] && break; done
fi
cleanup() { [ -n "$mine" ] && kill "$mine" 2>/dev/null; }
trap cleanup EXIT
[ "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:5199/apps/mapo/mapo-all.html)" = 200 ] \
  || { echo 'FAIL 개발 서버 5199 가 전역 화면을 주지 못한다'; exit 1; }

base='http://localhost:5199/apps/mapo/mapo-all.html?tiles=1'
jobs="hole-sangam=$base&center=-5428,-2338&width=900
hole-seongsan=$base&center=-4104,-1225&width=900
pocket-daeheung=$base&center=2466,1860&width=400
full=$base&center=-1192.55,-853.53&width=12000"
# shellcheck disable=SC2086
node docs/redraw-orders/queue/s1-tiles/measure.mjs desktop $jobs | tee "$D/measure.tsv"
$PY - "$D/measure.tsv" <<'PY' || ok=1
import sys
bad = []
for line in open(sys.argv[1]).read().splitlines()[1:]:
    name, first, byte, median, p95, *rest = line.split('\t')
    error = rest[0] if rest else ''
    if error or int(first) < 0: bad.append(f'{name} 가 뜨지 않았다: {error}'); continue
    if float(p95) > 33: bad.append(f'{name} 프레임 p95 {p95}ms(상한 33)')
    if int(first) > 8000: bad.append(f'{name} 첫 표시 {first}ms(상한 8,000)')
    print(f'{name}: 첫 표시 {int(first):,}ms, 자료 {int(byte):,} 바이트, 프레임 {median}/{p95}ms')
print('\n'.join(f'FAIL {line}' for line in bad) or '네 보기 수치 통과')
sys.exit(1 if bad else 0)
PY

# shellcheck disable=SC2086
node tmp/connect/gpushot.mjs "$D/shots" $jobs > "$D/shots.log" 2>&1
grep -q ERR "$D/shots.log" && { echo 'FAIL 캡처에 페이지 오류'; grep ERR "$D/shots.log" | head -3; ok=1; }
for name in hole-sangam hole-seongsan pocket-daeheung full; do
  [ -s "$D/shots/$name.png" ] || { echo "FAIL 그림 없음: $D/shots/$name.png"; ok=1; }; done

# 기존 화면이 그대로인지(공용 도구·화면 코드를 고쳤으므로)
node tmp/connect/gpushot.mjs "$D/after" \
  "hd-tiles-150=http://localhost:5199/apps/mapo/hongdae-district.html?tiles=1&center=-399,-394&width=150" \
  "hd-tiles-700=http://localhost:5199/apps/mapo/hongdae-district.html?tiles=1&center=-399,-394&width=700" \
  "hd-plain-700=http://localhost:5199/apps/mapo/hongdae-district.html?center=-399,-394&width=700" \
  "yanghwa-700=http://localhost:5199/apps/mapo/yanghwa-map.html?center=0,0&width=700" > "$D/after.log" 2>&1
diff_out=$(/usr/bin/python3 tmp/connect/pixdiff.py tmp/loop/s1-tiles/before "$D/after"); echo "$diff_out"
[ "$(echo "$diff_out" | grep -c '같음')" = 4 ] || { echo 'FAIL 기존 화면 픽셀이 달라졌다'; ok=1; }

pnpm test:map > "$D/test-map.log" 2>&1 || { echo 'FAIL pnpm test:map'; tail -12 "$D/test-map.log"; ok=1; }
git diff --quiet HEAD -- src/sim public/data/v2/hongdae-district* public/data/v2/hapjeong* \
  public/data/v2/seogyo* public/data/v2/yanghwa* \
  tools/v2/areas/hongdae-district.json tools/v2/areas/hapjeong.json tools/v2/areas/seogyo.json \
  tools/v2/areas/yanghwa-map.json tools/v2/areas/hongdae-west.json tools/v2/areas/hongdae-donggyo.json \
  || { echo 'FAIL 다른 구역 자료나 src/sim 이 바뀜'; git diff --stat HEAD -- src/sim public/data/v2 tools/v2/areas | tail -5; ok=1; }
git status --porcelain public/data/v2/hongdae-district-tiles | grep . && { echo 'FAIL 홍대 칸 자료가 바뀜'; ok=1; }

[ $ok = 0 ] && echo PASS-WATER; exit $ok
