#!/bin/bash
# s1-fill-lanes 통과 검사: 폭 규칙으로 넣은 새 노면선의 길이·개수와 침범을 세고, 화면 네 보기와 기존 화면이 그대로인지 본다.
set -u; cd "$(dirname "$0")/../../../.." || exit 1
PY=tools/.venv/bin/python; Q=docs/redraw-orders/queue/s1-fill-lanes; D=tmp/loop/s1-fill-lanes; ok=0
mkdir -p "$D/shots" "$D/after"

for f in tools/v2/infer_lane_lines.py public/data/v2/mapo-all-a.json.gz \
  public/data/v2/mapo-all-tiles/index.json public/data/v2/mapo-all-tiles/overview.json.gz \
  "$D/summary.md" "$D/shots/poeun.jpg" "$D/shots/jandari.jpg" "$D/shots/donggyo.jpg" "$D/shots/mallijae.jpg" \
  tmp/loop/s1-tiles/before/hd-tiles-150.png docs/redraw-orders/queue/s1-tiles/measure.mjs; do
  [ -s "$f" ] || { echo "FAIL 없음: $f"; ok=1; }; done
[ $ok = 0 ] || { echo '앞의 파일이 없어 검사를 멈춘다'; exit 1; }

out=$($PY -B "$Q/fill_lanes.py" 2>&1); echo "$out" | head -24
echo "$out" | grep -q '^FILL-OK' || { echo 'FAIL 새 노면선 검사'; ok=1; }

# 표본 그림 네 장이 서로 다르고 넓다
$PY - "$D/shots" <<'PY' || ok=1
import hashlib, sys
from pathlib import Path
from PIL import Image
shots = Path(sys.argv[1]); bad = []; seen = {}
for name in ('poeun', 'jandari', 'donggyo', 'mallijae'):
    path = shots / f'{name}.jpg'
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if digest in seen: bad.append(f'{name} 이 {seen[digest]} 과 같은 그림이다')
    seen[digest] = name
    w, h = Image.open(path).size
    print(f'{name}: {w}x{h}px')
    if w < 1200: bad.append(f'{name} 폭이 {w}px 다(하한 1,200)')
    if h < 200: bad.append(f'{name} 높이가 {h}px 다(하한 200)')
print('\n'.join(f'FAIL {line}' for line in bad) or '표본 그림 네 장 통과')
sys.exit(1 if bad else 0)
PY

# 앞 일감 검사를 그대로 다시 돌린다(s1-water 검사가 s1-outline 검사를 품고 있다)
bash docs/redraw-orders/queue/s1-water/check.sh > "$D/water-check.txt" 2>&1 \
  || { echo 'FAIL s1-water 검사'; tail -12 "$D/water-check.txt"; ok=1; }
tail -3 "$D/water-check.txt"
tiles=$($PY -B docs/redraw-orders/queue/s1-tiles/verify.py --area mapo-all 2>&1); echo "$tiles" | head -14
echo "$tiles" | grep -q '^VERIFY-OK' || { echo 'FAIL 칸 자료 검사'; ok=1; }

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
desk="view-120=$base&center=-1301.96,-705.67&width=120
view-700=$base&center=-399,-394&width=700
full=$base&center=-1192.55,-853.53&width=12000"
mob="mob-300=$base&center=-399,-394&width=300"
# shellcheck disable=SC2086
{ node "$Q/../s1-tiles/measure.mjs" desktop $desk; node "$Q/../s1-tiles/measure.mjs" mobile $mob | tail -n +2; } \
  | tee "$D/measure.tsv"
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
node tmp/connect/gpushot.mjs "$D/shots" $desk > "$D/shots.log" 2>&1
grep -q ERR "$D/shots.log" && { echo 'FAIL 캡처에 페이지 오류'; grep ERR "$D/shots.log" | head -3; ok=1; }
for name in view-120 view-700 full; do
  [ -s "$D/shots/$name.png" ] || { echo "FAIL 그림 없음: $D/shots/$name.png"; ok=1; }; done

# 기존 화면이 그대로인지
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
  tools/v2/areas/mapo-all.json \
  || { echo 'FAIL 다른 구역 자료나 src/sim, 전역 구역 설정이 바뀜'; git diff --stat HEAD -- src/sim public/data/v2 tools/v2/areas | tail -5; ok=1; }
git status --porcelain public/data/v2/hongdae-district-tiles | grep . && { echo 'FAIL 홍대 칸 자료가 바뀜'; ok=1; }

[ $ok = 0 ] && echo PASS-FILL-LANES; exit $ok
