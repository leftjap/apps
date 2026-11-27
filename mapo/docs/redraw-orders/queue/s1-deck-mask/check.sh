#!/bin/bash
# s1-deck-mask 통과 검사: 상판 아래 도색이 가려져 가까운 화면이 달라지고, 상판 밖 도색·선·기존 화면은 그대로다.
set -u; cd "$(dirname "$0")/../../../.." || exit 1
PY=tools/.venv/bin/python; Q=docs/redraw-orders/queue/s1-deck-mask; D=tmp/loop/s1-deck-mask; ok=0
AREA=tools/v2/areas/mapo-all.json
mkdir -p "$D/shots" "$D/after"

for f in "$D/measure.md" "$D/spots.tsv" \
  "$D/before/d02-200.png" "$D/before/d03-200.png" "$D/before/d02-60.png" "$D/before/deck-c.png" \
  "$D/before/mid-700.png" "$D/before/mid-1500.png" "$D/before/full.png" "$D/before/mob-300.png" \
  tmp/loop/s1-decks/shots/d-02-photo.jpg tmp/loop/s1-decks/shots/d-03-photo.jpg \
  tmp/loop/s1-tiles/before/hd-tiles-150.png docs/redraw-orders/queue/s1-tiles/measure.mjs; do
  [ -s "$f" ] || { echo "FAIL 없음: $f"; ok=1; }; done
[ $ok = 0 ] || { echo '앞의 파일이 없어 검사를 멈춘다'; exit 1; }

# deck-c 자리는 구현이 자료에서 고른다: 이름<탭>x<탭>z<탭>그 창에서 가린 도색㎡
read -r c_name c_x c_z c_hidden < <(awk -F'\t' '$1=="deck-c"{print $1, $2, $3, $4; exit}' "$D/spots.tsv")
[ -n "${c_x:-}" ] && [ -n "${c_z:-}" ] && [ -n "${c_hidden:-}" ] \
  || { echo 'FAIL spots.tsv 에 deck-c 줄이 없다(이름/x/z/가린 도색㎡ 를 탭으로 적는다)'; exit 1; }
echo "deck-c 자리 $c_x,$c_z, 그 창에서 가린 도색 ${c_hidden}㎡"

# 자료는 검사가 직접 다시 만든다(마스터 11-27 15:55). 구현자가 쓴 수치 파일은 읽지 않는다. 약 8분.
$PY -B tools/v2/hapjeong_hd_a.py --area "$AREA" > "$D/check-a.log" 2>&1 \
  || { echo 'FAIL A 보기 자료를 다시 만들지 못했다'; tail -8 "$D/check-a.log"; ok=1; }
$PY -B tools/v2/survey_road_paint.py --area "$AREA" --stats "$D/stats-check.json" > "$D/check-paint.log" 2>&1 \
  || { echo 'FAIL 노면 세부 자료를 다시 만들지 못했다'; tail -8 "$D/check-paint.log"; ok=1; }
$PY -B tools/v2/pack_district_tiles.py --area "$AREA" > "$D/check-pack.log" 2>&1 \
  || { echo 'FAIL 칸을 다시 포장하지 못했다'; tail -8 "$D/check-pack.log"; ok=1; }
[ $ok = 0 ] || { echo '다시 굽기가 실패해 검사를 멈춘다'; exit 1; }

out=$($PY -B "$Q/mask.py" 2>&1); echo "$out" | grep -v '^MASK-STATS' | tail -45
echo "$out" | grep -o '^MASK-STATS.*' > "$D/mask-stats.txt"
echo "$out" | grep -q '^MASK-OK' || { echo 'FAIL 상판 아래 도색 검사'; ok=1; }

size=$(stat -f%z public/data/v2/mapo-all-tiles/overview.json.gz)
echo "먼 단계 $size 바이트"
[ "$size" -le 2000000 ] || { echo "FAIL 먼 단계 $size 바이트(상한 2,000,000)"; ok=1; }

# 앞 일감 검사를 그대로 다시 돌린다. s1-safety-border 의 border.py 와 s1-uturn 의 uturn.py 는 색별 도색
# 면적을 좁게 못 박아 두어(흰색 54,780~55,020㎡) 상판 아래를 가리면 반드시 떨어진다. 그 두 일감이 넣은
# 선이 그대로 있는지는 mask.py 가 선 종류별 행 수·길이로 본다.
bash docs/redraw-orders/queue/s1-outline/check.sh > "$D/outline-check.txt" 2>&1 \
  || { echo 'FAIL s1-outline 검사'; tail -10 "$D/outline-check.txt"; ok=1; }
tail -3 "$D/outline-check.txt"
tiles=$($PY -B docs/redraw-orders/queue/s1-tiles/verify.py --area mapo-all 2>&1); echo "$tiles" | tail -6
echo "$tiles" | grep -q '^VERIFY-OK' || { echo 'FAIL 칸 자료 검사'; ok=1; }
water=$($PY -B docs/redraw-orders/queue/s1-water/water.py 2>&1); echo "$water" | tail -4
echo "$water" | grep -q '^WATER-OK' || { echo 'FAIL 물·구멍 검사'; ok=1; }
paint=$($PY -B docs/redraw-orders/queue/s1-paint/paint.py 2>&1); echo "$paint" | tail -6
echo "$paint" | grep -q '^PAINT-OK' || { echo 'FAIL 노면 세부 자료 검사'; ok=1; }
cross=$($PY -B docs/redraw-orders/queue/s1-approach/approach.py 2>&1); echo "$cross" | tail -6
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
  "d02-200=$base&center=-638.17,-1535.73&width=200" \
  "d03-200=$base&center=-1394.21,-1364.79&width=200" \
  "d02-60=$base&center=-638.17,-1535.73&width=60" \
  "deck-c=$base&center=$c_x,$c_z&width=60" \
  "mid-700=$base&center=-1394.21,-1364.79&width=700" \
  "mid-1500=$base&center=-1394.21,-1364.79&width=1500" \
  "full=$base&center=-1192.55,-853.53&width=12000" \
  "mob-300=$base&center=-638.17,-1535.73&width=300" > "$D/shots.log" 2>&1
cat "$D/shots.log"
grep -q ERR "$D/shots.log" && { echo 'FAIL 캡처에 페이지 오류'; ok=1; }
for name in d02-200 d03-200 d02-60 deck-c mid-700 mid-1500 full mob-300; do
  [ -s "$D/shots/$name.png" ] || { echo "FAIL 그림 없음: $D/shots/$name.png"; ok=1; }; done

# 상판 자리는 아래 도색이 사라져 달라져야 하고, 넓은 보기는 거의 그대로여야 한다
diff_out=$(/usr/bin/python3 tmp/connect/pixdiff.py "$D/before" "$D/shots"); echo "$diff_out"
$PY - "$diff_out" "$c_x" "$c_z" "$c_hidden" <<'PY' || ok=1
import math, re, sys
# 이름: (최소 변화%, 최대 변화%). 계획 세우기가 센 창 안 「상판에 겹친 보이는 도색」으로 예상값을 잡았다
# d02-200 232㎡ · d03-200 273㎡ · d02-60 39㎡ 가 창 안 상판 도색 전체이고, 가려지는 것은 그 가운데 아래 몫이다
limits = {'d02-200': (.10, None), 'd03-200': (.10, None), 'd02-60': (.15, None), 'deck-c': (.30, None),
          'mid-700': (0, .6), 'mid-1500': (0, .35), 'full': (0, .2)}
text, bad = sys.argv[1], []
x, z, hidden = float(sys.argv[2]), float(sys.argv[3]), float(sys.argv[4])
if hidden < 10:
    bad.append(f'deck-c 창에서 가린 도색이 {hidden}㎡ 다(하한 10㎡. 더 많이 가려지는 자리를 고른다)')
for name, (cx, cz) in (('성산2교', (-638.17, -1535.73)), ('마포구청역', (-1394.21, -1364.79))):
    if math.dist((x, z), (cx, cz)) < 300:
        bad.append(f'deck-c 가 {name} 에서 {math.dist((x, z), (cx, cz)):.0f}m 다(하한 300m. 다른 상판을 고른다)')
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
        bad.append(f'{name} 이 {value}% 만 달라졌다(문턱 {low}%, 아래 도색이 가려지지 않았다)')
    if high is not None and value > high:
        bad.append(f'{name} 이 {value}% 달라졌다(상한 {high}%, 넓은 보기가 크게 바뀌었다)')
print('\n'.join(f'FAIL {l}' for l in bad) or '상판 자리 넷이 달라지고 넓은 보기 셋은 그대로다')
sys.exit(1 if bad else 0)
PY

# 네 보기 수치(가까이·중간·전체·모바일)
node docs/redraw-orders/queue/s1-tiles/measure.mjs desktop \
  "d02-60=$base&center=-638.17,-1535.73&width=60" \
  "d02-200=$base&center=-638.17,-1535.73&width=200" \
  "mid-700=$base&center=-1394.21,-1364.79&width=700" \
  "mid-1500=$base&center=-1394.21,-1364.79&width=1500" \
  "full=$base&center=-1192.55,-853.53&width=12000" | tee "$D/measure.tsv"
node docs/redraw-orders/queue/s1-tiles/measure.mjs mobile \
  "mob-300=$base&center=-638.17,-1535.73&width=300" | tail -n +2 >> "$D/measure.tsv"
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
git status --porcelain src | grep . && { echo 'FAIL src 가 바뀜(이 일감은 굽기와 자료만 고친다)'; ok=1; }
git diff --quiet HEAD -- public/data/v2/hongdae-district* public/data/v2/hapjeong* \
  public/data/v2/seogyo* public/data/v2/yanghwa* \
  tools/v2/areas/hongdae-district.json tools/v2/areas/hapjeong.json tools/v2/areas/seogyo.json \
  tools/v2/areas/yanghwa-map.json tools/v2/areas/hongdae-west.json tools/v2/areas/hongdae-donggyo.json \
  tools/v2/areas/mapo-all.json \
  || { echo 'FAIL 다른 구역 자료나 전역 구역 설정이 바뀜'; git diff --stat HEAD -- public/data/v2 tools/v2/areas | tail -5; ok=1; }
git status --porcelain public/data/v2/hongdae-district-tiles | grep . && { echo 'FAIL 홍대 칸 자료가 바뀜'; ok=1; }
git diff --quiet HEAD -- "$Q/mask.py" "$Q/check.sh" \
  || { echo 'FAIL 이 일감의 검사 파일이 바뀜'; ok=1; }
for prev in s1-outline s1-tiles s1-water s1-paint s1-approach s1-safety-border s1-uturn s1-sidewalk s1-decks; do
  git diff --quiet HEAD -- "docs/redraw-orders/queue/$prev" \
    || { echo "FAIL 앞 일감 $prev 의 검사 파일이 바뀜"; ok=1; }; done

[ $ok = 0 ] && echo PASS-DECK-MASK; exit $ok
