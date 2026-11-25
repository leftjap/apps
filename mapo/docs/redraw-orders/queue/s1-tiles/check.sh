#!/bin/bash
# s1-tiles 통과 검사: 전역 칸 화면이 일곱 보기에서 열리고, 기존 화면과 자료가 그대로다.
set -u; cd "$(dirname "$0")/../../../.." || exit 1
PY=tools/.venv/bin/python; Q=docs/redraw-orders/queue/s1-tiles; D=tmp/loop/s1-tiles; ok=0
mkdir -p "$D/shots" "$D/after"

for f in mapo-all.html "$D/views.tsv" "$D/before/hd-tiles-150.png" "$D/before/hd-tiles-700.png" \
  "$D/before/hd-plain-700.png" "$D/before/yanghwa-700.png" \
  public/data/v2/mapo-all-tiles/index.json public/data/v2/mapo-all-tiles/overview.json.gz; do
  [ -s "$f" ] || { echo "FAIL 없음: $f"; ok=1; }; done
[ $ok = 0 ] || { echo '앞의 파일이 없어 검사를 멈춘다'; exit 1; }

out=$($PY -B "$Q/verify.py" --area mapo-all 2>&1); echo "$out" | head -14
echo "$out" | grep -q '^VERIFY-OK' || { echo 'FAIL 칸 자료 검사'; ok=1; }
size=$(stat -f%z public/data/v2/mapo-all-tiles/overview.json.gz)
[ "$size" -le 2000000 ] || { echo "FAIL 먼 단계 $size 바이트(상한 2,000,000)"; ok=1; }

# 보기 목록: 이름 일곱 개와 배율이 정해진 대로인지 본다
$PY - "$D/views.tsv" <<'PY' || ok=1
import re, sys
need = {'near-sinchon': (60, 200), 'near-hapjeong': (60, 200), 'near-gongdeok': (60, 200),
        'near-seongsan': (60, 200), 'mid-hongdae': (600, 1500), 'mid-mapodaero': (600, 1500),
        'full': (9000, 99000)}
rows = [line.split('\t') for line in open(sys.argv[1]).read().splitlines() if line.strip()]
seen, bad = {}, []
for row in rows:
    if len(row) != 2: bad.append(f'줄 모양이 이름<탭>주소가 아니다: {row}'); continue
    name, url = row[0].strip(), row[1].strip()
    if name not in need: bad.append(f'모르는 이름 {name}'); continue
    if not url.startswith('http://localhost:5199/apps/mapo/mapo-all.html?'): bad.append(f'{name} 주소가 전역 화면이 아니다')
    found = re.search(r'[?&]width=(\d+)', url)
    low, high = need[name]
    if not found or not low <= int(found.group(1)) <= high:
        bad.append(f'{name} 배율이 {low}~{high}m 가 아니다: {url}')
    if not re.search(r'[?&]center=-?\d', url): bad.append(f'{name} 에 center 가 없다')
    seen[name] = url
for name in need:
    if name not in seen: bad.append(f'{name} 보기가 없다')
print('\n'.join(f'FAIL {line}' for line in bad) or '보기 목록 일곱 개 확인')
sys.exit(1 if bad else 0)
PY

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

jobs=$(awk -F'\t' 'NF>1 {printf "%s=%s\n", $1, $2}' "$D/views.tsv")
# shellcheck disable=SC2086
node "$Q/measure.mjs" desktop $jobs | tee "$D/measure.tsv"
# shellcheck disable=SC2086
node "$Q/measure.mjs" mobile $(awk -F'\t' '$1=="full" {printf "mobile-full=%s\n", $2}' "$D/views.tsv") | tee "$D/measure-mobile.tsv"
$PY - "$D/measure.tsv" "$D/measure-mobile.tsv" <<'PY' || ok=1
import sys
limits = {'near': (8000, 10_000_000), 'mid': (8000, 15_000_000), 'full': (6000, 2_500_000)}
bad = []
for path in sys.argv[1:]:
    for line in open(path).read().splitlines()[1:]:
        name, first, byte, median, p95, *rest = line.split('\t')
        error = rest[0] if rest else ''
        first, byte = int(first), int(byte)
        if error or first < 0: bad.append(f'{name} 가 뜨지 않았다: {error}'); continue
        if float(p95) > 33: bad.append(f'{name} 프레임 p95 {p95}ms(상한 33)')
        if name.startswith('mobile'):
            print(f'모바일 {name}: 첫 표시 {first}ms, 자료 {byte:,} 바이트, 프레임 {median}/{p95}ms')
            continue
        slow, heavy = limits[name.split('-')[0]]
        if first > slow: bad.append(f'{name} 첫 표시 {first}ms(상한 {slow})')
        if byte > heavy: bad.append(f'{name} 자료 {byte:,} 바이트(상한 {heavy:,})')
print('\n'.join(f'FAIL {line}' for line in bad) or '일곱 보기 수치 통과')
sys.exit(1 if bad else 0)
PY

# 검수자가 볼 그림
# shellcheck disable=SC2086
node tmp/connect/gpushot.mjs "$D/shots" $jobs > "$D/shots.log" 2>&1
grep -q ERR "$D/shots.log" && { echo 'FAIL 캡처에 페이지 오류'; grep ERR "$D/shots.log" | head -3; ok=1; }
for name in near-sinchon near-hapjeong near-gongdeok near-seongsan mid-hongdae mid-mapodaero full; do
  [ -s "$D/shots/$name.png" ] || { echo "FAIL 그림 없음: $D/shots/$name.png"; ok=1; }; done

# 기존 화면이 그대로인지(공용 코드를 고쳤으므로)
node tmp/connect/gpushot.mjs "$D/after" \
  "hd-tiles-150=http://localhost:5199/apps/mapo/hongdae-district.html?tiles=1&center=-399,-394&width=150" \
  "hd-tiles-700=http://localhost:5199/apps/mapo/hongdae-district.html?tiles=1&center=-399,-394&width=700" \
  "hd-plain-700=http://localhost:5199/apps/mapo/hongdae-district.html?center=-399,-394&width=700" \
  "yanghwa-700=http://localhost:5199/apps/mapo/yanghwa-map.html?center=0,0&width=700" > "$D/after.log" 2>&1
diff_out=$(/usr/bin/python3 tmp/connect/pixdiff.py "$D/before" "$D/after"); echo "$diff_out"
[ "$(echo "$diff_out" | grep -c '같음')" = 4 ] || { echo 'FAIL 기존 화면 픽셀이 달라졌다'; ok=1; }

pnpm test:map > "$D/test-map.log" 2>&1 || { echo 'FAIL pnpm test:map'; tail -12 "$D/test-map.log"; ok=1; }
git diff --quiet HEAD -- src/sim public/data/v2/hongdae-district* public/data/v2/hapjeong* \
  public/data/v2/seogyo* public/data/v2/yanghwa* \
  tools/v2/areas/hongdae-district.json tools/v2/areas/hapjeong.json tools/v2/areas/seogyo.json \
  tools/v2/areas/yanghwa-map.json tools/v2/areas/hongdae-west.json tools/v2/areas/hongdae-donggyo.json \
  || { echo 'FAIL 다른 구역 자료나 src/sim 이 바뀜'; git diff --stat HEAD -- src/sim public/data/v2 tools/v2/areas | tail -5; ok=1; }
git status --porcelain public/data/v2/hongdae-district-tiles | grep . && { echo 'FAIL 홍대 칸 자료가 바뀜'; ok=1; }

[ $ok = 0 ] && echo PASS-TILES; exit $ok
