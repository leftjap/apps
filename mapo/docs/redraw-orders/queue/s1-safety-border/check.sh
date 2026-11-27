#!/bin/bash
# s1-safety-border 통과 검사: 안전지대 테두리 선이 들어와 가까운 화면이 달라지고, 다른 노면 자료와 기존 화면은 그대로다.
set -u; cd "$(dirname "$0")/../../../.." || exit 1
PY=tools/.venv/bin/python; Q=docs/redraw-orders/queue/s1-safety-border; D=tmp/loop/s1-safety-border; ok=0
mkdir -p "$D/shots" "$D/after"

for f in public/data/v2/mapo-all.json.gz public/data/v2/mapo-all-a.json.gz \
  public/data/v2/mapo-all-road-paint.json.gz public/data/v2/mapo-all-tiles/index.json \
  public/data/v2/mapo-all-tiles/overview.json.gz "$D/measure.md" \
  "$D/before/bd1.png" "$D/before/bd2.png" "$D/before/bd3.png" "$D/before/ewha-120.png" \
  "$D/before/near-200.png" "$D/before/mid-700.png" "$D/before/mid-1500.png" "$D/before/full.png" \
  "$D/shots/audit-1.jpg" "$D/shots/audit-2.jpg" \
  tmp/loop/s1-tiles/before/hd-tiles-150.png docs/redraw-orders/queue/s1-tiles/measure.mjs; do
  [ -s "$f" ] || { echo "FAIL 없음: $f"; ok=1; }; done
[ $ok = 0 ] || { echo '앞의 파일이 없어 검사를 멈춘다'; exit 1; }

# 노면 세부 자료와 칸은 검사가 직접 다시 만든다(마스터 11-27: 1회차 구현이 앞 일감 보관본의 빗금·화살표를 섞고
# 수치 파일에 옛 수를 적어 통과시켰다. 구현자가 쓴 수치 파일은 읽지 않는다)
$PY -B tools/v2/survey_road_paint.py --area tools/v2/areas/mapo-all.json --stats "$D/stats-check.json" > "$D/check-paint.log" 2>&1 \
  || { echo 'FAIL 노면 세부 자료를 다시 만들지 못했다'; tail -5 "$D/check-paint.log"; ok=1; }
$PY -B tools/v2/pack_district_tiles.py --area tools/v2/areas/mapo-all.json > "$D/check-pack.log" 2>&1 \
  || { echo 'FAIL 칸을 다시 포장하지 못했다'; tail -5 "$D/check-pack.log"; ok=1; }
out=$($PY -B "$Q/border.py" 2>&1); echo "$out" | head -40
echo "$out" | grep -q '^BORDER-OK' || { echo 'FAIL 안전지대 테두리 자료 검사'; ok=1; }

size=$(stat -f%z public/data/v2/mapo-all-tiles/overview.json.gz)
echo "먼 단계 $size 바이트"
[ "$size" -le 2000000 ] || { echo "FAIL 먼 단계 $size 바이트(상한 2,000,000)"; ok=1; }

# 앞 일감 검사를 그대로 다시 돌린다
bash docs/redraw-orders/queue/s1-outline/check.sh > "$D/outline-check.txt" 2>&1 \
  || { echo 'FAIL s1-outline 검사'; tail -10 "$D/outline-check.txt"; ok=1; }
tail -3 "$D/outline-check.txt"
tiles=$($PY -B docs/redraw-orders/queue/s1-tiles/verify.py --area mapo-all 2>&1); echo "$tiles" | tail -8
echo "$tiles" | grep -q '^VERIFY-OK' || { echo 'FAIL 칸 자료 검사'; ok=1; }
water=$($PY -B docs/redraw-orders/queue/s1-water/water.py 2>&1); echo "$water" | tail -5
echo "$water" | grep -q '^WATER-OK' || { echo 'FAIL 물·구멍 검사'; ok=1; }
paint=$($PY -B docs/redraw-orders/queue/s1-paint/paint.py 2>&1); echo "$paint" | tail -6
echo "$paint" | grep -q '^PAINT-OK' || { echo 'FAIL 노면 세부 자료 검사'; ok=1; }
cross=$($PY -B docs/redraw-orders/queue/s1-approach/approach.py 2>&1); echo "$cross" | tail -8
echo "$cross" | grep -q '^APPROACH-OK' || { echo 'FAIL 횡단보도 자료 검사'; ok=1; }

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
node tmp/connect/gpushot.mjs "$D/shots" \
  "bd1=$base&center=2941.3,833.2&width=60" \
  "bd2=$base&center=2497.5,1205.8&width=60" \
  "bd3=$base&center=-1756.4,-1104.7&width=60" \
  "ewha-120=$base&center=2373.44,-588.25&width=120" \
  "near-200=$base&center=2941.3,833.2&width=200" \
  "mid-700=$base&center=2941.3,833.2&width=700" \
  "mid-1500=$base&center=2941.3,833.2&width=1500" \
  "full=$base&center=-1192.55,-853.53&width=12000" \
  "mob-300=$base&center=2941.3,833.2&width=300" > "$D/shots.log" 2>&1
cat "$D/shots.log"
grep -q ERR "$D/shots.log" && { echo 'FAIL 캡처에 페이지 오류'; ok=1; }
for name in bd1 bd2 bd3 ewha-120 near-200 mid-700 mid-1500 full mob-300; do
  [ -s "$D/shots/$name.png" ] || { echo "FAIL 그림 없음: $D/shots/$name.png"; ok=1; }; done

# 가까운 자리는 테두리가 들어와 달라져야 하고, 넓은 보기는 거의 그대로여야 한다
diff_out=$(/usr/bin/python3 tmp/connect/pixdiff.py "$D/before" "$D/shots"); echo "$diff_out"
$PY - "$diff_out" <<'PY' || ok=1
import re, sys
# 이름: (최소 변화%, 최대 변화%). 계획 세우기가 센 창 안 531 길이로 예상값을 잡았다
# bd1 173m(예상 1.15%), bd2 162m(1.08%), bd3 128m(0.85%), ewha-120 96m(0.16%), near-200 373m(0.22%)
limits = {'bd1': (.4, None), 'bd2': (.4, None), 'bd3': (.3, None),
          'ewha-120': (.06, None), 'near-200': (.08, None),
          'mid-700': (0, .5), 'mid-1500': (0, .3), 'full': (0, .2)}
text, bad = sys.argv[1], []
for name, (low, high) in limits.items():
    line = next((l for l in text.splitlines() if l.startswith(name + '.png:')), None)
    if line is None:
        bad.append(f'{name} 대조 줄이 없다'); continue
    if '같음' in line:
        value = 0.0
    else:
        m = re.search(r'\(([\d.]+)%\)', line)
        if not m:
            bad.append(f'{name} 대조를 읽을 수 없다: {line}'); continue
        value = float(m.group(1))
    if value < low:
        bad.append(f'{name} 이 {value}% 만 달라졌다(문턱 {low}%, 테두리가 그려지지 않았다)')
    if high is not None and value > high:
        bad.append(f'{name} 이 {value}% 달라졌다(상한 {high}%, 넓은 보기가 크게 바뀌었다)')
print('\n'.join(f'FAIL {l}' for l in bad) or '가까운 자리 다섯이 달라지고 넓은 보기 셋은 그대로다')
sys.exit(1 if bad else 0)
PY

# 네 보기 수치(가까이·중간·전체·모바일)
node docs/redraw-orders/queue/s1-tiles/measure.mjs desktop \
  "bd1=$base&center=2941.3,833.2&width=60" \
  "near-200=$base&center=2941.3,833.2&width=200" \
  "mid-700=$base&center=2941.3,833.2&width=700" \
  "mid-1500=$base&center=2941.3,833.2&width=1500" \
  "full=$base&center=-1192.55,-853.53&width=12000" | tee "$D/measure.tsv"
node docs/redraw-orders/queue/s1-tiles/measure.mjs mobile \
  "mob-300=$base&center=2941.3,833.2&width=300" | tail -n +2 >> "$D/measure.tsv"
$PY - "$D/measure.tsv" <<'PY' || ok=1
import sys
bad = []
for line in open(sys.argv[1]).read().splitlines():
    if not line or line.startswith('이름'): continue
    name, first, byte, median, p95, *rest = line.split('\t')
    error = rest[0] if rest else ''
    if error or int(first) < 0:
        bad.append(f'{name} 가 뜨지 않았다: {error}'); continue
    if float(p95) > 33: bad.append(f'{name} 프레임 p95 {p95}ms(상한 33)')
    if int(first) > 8000: bad.append(f'{name} 첫 표시 {first}ms(상한 8,000)')
    print(f'{name}: 첫 표시 {int(first):,}ms, 자료 {int(byte):,} 바이트, 프레임 {median}/{p95}ms')
print('\n'.join(f'FAIL {l}' for l in bad) or '여섯 보기 수치 통과')
sys.exit(1 if bad else 0)
PY

# 기존 화면 넷이 그대로인지
node tmp/connect/gpushot.mjs "$D/after" \
  "hd-tiles-150=http://localhost:5199/apps/mapo/hongdae-district.html?tiles=1&center=-399,-394&width=150" \
  "hd-tiles-700=http://localhost:5199/apps/mapo/hongdae-district.html?tiles=1&center=-399,-394&width=700" \
  "hd-plain-700=http://localhost:5199/apps/mapo/hongdae-district.html?center=-399,-394&width=700" \
  "yanghwa-700=http://localhost:5199/apps/mapo/yanghwa-map.html?center=0,0&width=700" > "$D/after.log" 2>&1
same=$(/usr/bin/python3 tmp/connect/pixdiff.py tmp/loop/s1-tiles/before "$D/after"); echo "$same"
[ "$(echo "$same" | grep -c '같음')" = 4 ] || { echo 'FAIL 기존 화면 픽셀이 달라졌다'; ok=1; }

pnpm test:map > "$D/test-map.log" 2>&1 || { echo 'FAIL pnpm test:map'; tail -12 "$D/test-map.log"; ok=1; }
git status --porcelain src | grep . && { echo 'FAIL src 가 바뀜(이 일감은 자료와 굽기만 고친다)'; ok=1; }
git diff --quiet HEAD -- public/data/v2/hongdae-district* public/data/v2/hapjeong* \
  public/data/v2/seogyo* public/data/v2/yanghwa* \
  tools/v2/areas/hongdae-district.json tools/v2/areas/hapjeong.json tools/v2/areas/seogyo.json \
  tools/v2/areas/yanghwa-map.json tools/v2/areas/hongdae-west.json tools/v2/areas/hongdae-donggyo.json \
  tools/v2/areas/mapo-all.json \
  || { echo 'FAIL 다른 구역 자료나 전역 구역 설정이 바뀜'; git diff --stat HEAD -- public/data/v2 tools/v2/areas | tail -5; ok=1; }
git status --porcelain public/data/v2/hongdae-district-tiles | grep . && { echo 'FAIL 홍대 칸 자료가 바뀜'; ok=1; }

[ $ok = 0 ] && echo PASS-SAFETY-BORDER; exit $ok
