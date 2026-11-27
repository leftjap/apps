#!/bin/bash
# s1-sidewalk 통과 검사: 보행면 폭 조사(출처별 분해·녹지 자료·유형 B 추적·그림 여덟 장)가 있고,
# 검사가 측정 스크립트를 직접 다시 돌려 수치를 만들며, 코드와 구운 자료는 그대로다.
set -u; cd "$(dirname "$0")/../../../.." || exit 1
PY=tools/.venv/bin/python; D=tmp/loop/s1-sidewalk; ok=0

for f in "$D/measure_sidewalk.py" "$D/sources.tsv" "$D/summary.md"; do
  [ -s "$f" ] || { echo "FAIL 없음: $f"; ok=1; }; done
for n in 01 02 03 04 05 06 07 08; do
  [ -s "$D/shots/w-$n.jpg" ] || { echo "FAIL 없음: $D/shots/w-$n.jpg"; ok=1; }; done
[ $ok = 0 ] || { echo '앞의 파일이 없어 검사를 멈춘다'; exit 1; }

# 수치는 검사가 직접 만든다(마스터 11-27 15:55). 구현자가 쓴 수치 파일을 그대로 믿지 않는다.
$PY -B "$D/measure_sidewalk.py" > "$D/check-measure.log" 2>&1 \
  || { echo 'FAIL 측정 스크립트를 다시 돌리지 못했다'; tail -15 "$D/check-measure.log"; exit 1; }
grep -o '^SIDEWALK-STATS .*' "$D/check-measure.log" | tail -1 > "$D/check-stats.txt"
[ -s "$D/check-stats.txt" ] || { echo 'FAIL 측정 스크립트가 SIDEWALK-STATS 줄을 찍지 않았다'; tail -15 "$D/check-measure.log"; exit 1; }

$PY - "$D" <<'PY' || ok=1
import hashlib, json, sys
from pathlib import Path
from PIL import Image
work = Path(sys.argv[1])
bad = []

stats = json.loads(work.joinpath('check-stats.txt').read_text().split(' ', 1)[1])
total = float(stats.get('total', 0))
sources = stats.get('sources') or {}
green = stats.get('green') or {}
type_b = stats.get('typeB') or {}
print(f'보행면 {total:,.0f}㎡, 출처 {len(sources)}가지, 녹지 자료 {len(green)}갈래, 유형 B 자리 {len(type_b)}곳')

if total <= 0:
    bad.append('보행면 전체 면적이 0 이다(재지 않았다)')
else:
    covered = sum(float(v) for v in sources.values())
    share = covered / total * 100
    print(f'출처 합 {covered:,.0f}㎡ = 전체의 {share:.1f}%')
    for name, value in sorted(sources.items(), key=lambda kv: -float(kv[1])):
        print(f'  {name}: {float(value):,.0f}㎡ ({float(value)/total*100:.1f}%)')
    if share < 95:
        bad.append(f'출처별 면적의 합이 전체의 {share:.1f}% 다(하한 95%. 분해가 보행면을 설명하지 못한다)')
    if share > 110:
        bad.append(f'출처별 면적의 합이 전체의 {share:.1f}% 다(상한 110%. 겹치는 몫을 한 출처에만 넣는다)')
if len(sources) < 4:
    bad.append(f'출처가 {len(sources)}가지다(측량 보행도로·섬·A4·확장·중앙 포장·횡단 접속 가운데 4가지 이상)')

# 녹지 자료 네 갈래가 모두 재어져 있다. 값은 0 이어도 된다(처음 재는 칸)
for key in ('ngii-e', 'green-mapo-all', 'seoul-biotope', 'seoul-trees'):
    row = green.get(key)
    if row is None:
        bad.append(f'녹지 자료 {key} 를 재지 않았다(green 의 열쇠로 넣는다)')
        continue
    if not all(field in row for field in ('count', 'area', 'overlap')):
        bad.append(f'녹지 자료 {key} 에 count·area·overlap 가운데 빠진 것이 있다')
    else:
        print(f'  {key}: {row["count"]:,}개, {float(row["area"]):,.0f}㎡, 보행면과 겹침 {float(row["overlap"]):,.0f}㎡')

# 유형 B 네 자리를 자리마다 갈랐다
for name in ('J03', 'J13', 'J16', 'J19'):
    row = type_b.get(name)
    if row is None:
        bad.append(f'유형 B 자리 {name} 을 재지 않았다(typeB 의 열쇠로 넣는다)')
        continue
    if not all(field in row for field in ('raw', 'dropped', 'stage')):
        bad.append(f'{name} 에 raw·dropped·stage 가운데 빠진 것이 있다')
    else:
        print(f'  {name}: 원자료 {float(row["raw"]):,.0f}㎡, 떨어진 몫 {float(row["dropped"]):,.0f}㎡, 자리 {row["stage"]}')

# sources.tsv 의 수치가 다시 돌린 값과 1% 안에서 같다
rows = [l for l in work.joinpath('sources.tsv').read_text().splitlines() if l.strip()]
if len(rows) < 2:
    bad.append('sources.tsv 가 머리줄뿐이다')
else:
    written = {}
    for line in rows[1:]:
        cell = line.split('\t')
        for value in cell[1:]:
            try:
                written[cell[0].strip()] = float(value.replace(',', ''))
                break
            except ValueError:
                continue
    print(f'sources.tsv {len(written)}줄에서 숫자를 읽었다')
    if not written:
        bad.append('sources.tsv 에서 숫자를 읽을 수 없다')
    matched = 0
    for name, value in sources.items():
        mine = written.get(name)
        if mine is None:
            continue
        matched += 1
        if abs(mine - float(value)) > max(1.0, float(value) * 0.01):
            bad.append(f'sources.tsv 의 {name} 이 {mine:,.0f}㎡ 인데 다시 재니 {float(value):,.0f}㎡ 다')
    if matched < max(3, len(sources) - 1):
        bad.append(f'sources.tsv 의 줄 이름이 측정 출력과 {matched}개만 맞는다(출처 {len(sources)}가지)')

# 그림 여덟 장: 서로 다르고 가로로 붙여 넓다
seen = {}
for n in range(1, 9):
    path = work/'shots'/f'w-{n:02d}.jpg'
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if digest in seen:
        bad.append(f'w-{n:02d} 가 w-{seen[digest]} 과 같은 그림이다')
    seen[digest] = f'{n:02d}'
    w, h = Image.open(path).size
    if w < 1500: bad.append(f'w-{n:02d} 폭이 {w}px 다(하한 1,500)')
    if h < 300: bad.append(f'w-{n:02d} 높이가 {h}px 다(하한 300)')

# 보고에 여덟 자리와 두 유형의 결론, 규칙 후보가 있다
summary = work.joinpath('summary.md').read_text()
for spot in ('합정', '동교동삼거리', '광흥창', '상수', '홍대입구', '마포구청', '성산2교', '연세대'):
    if spot not in summary: bad.append(f'summary.md 에 자리 {spot} 가 없다')
for word in ('규칙 후보', '유형 A', '유형 B'):
    if word not in summary: bad.append(f'summary.md 에 「{word}」가 없다')
if len(summary.splitlines()) < 14:
    bad.append(f'summary.md 가 {len(summary.splitlines())}줄이다(하한 14)')

print('\n'.join(f'FAIL {line}' for line in bad) or '보행면 조사 결과 통과')
sys.exit(1 if bad else 0)
PY

# 이 일감은 재기만 한다: 코드·자료·구역 설정이 바뀌면 안 된다
git diff --quiet HEAD -- src tools/v2 \
  || { echo 'FAIL src 나 tools/v2 가 바뀜(이 일감은 고치지 않는다)'; git diff --stat HEAD -- src tools/v2 | tail -6; ok=1; }
git status --porcelain src tools/v2 | grep '^?? ' | grep . \
  && { echo 'FAIL src 나 tools/v2 에 새 파일이 생김(측정 스크립트는 tmp/loop/s1-sidewalk 에 둔다)'; ok=1; }
git status --porcelain public/data/v2 | grep -v '^?? ' | grep . && { echo 'FAIL 구운 자료가 바뀜'; ok=1; }
for prev in s1-outline s1-tiles s1-water s1-paint s1-approach s1-safety-border s1-uturn; do
  git diff --quiet HEAD -- "docs/redraw-orders/queue/$prev" \
    || { echo "FAIL 앞 일감 $prev 의 검사 파일이 바뀜"; ok=1; }; done

bash docs/redraw-orders/queue/s1-outline/check.sh > "$D/outline-check.txt" 2>&1 \
  || { echo 'FAIL s1-outline 검사'; tail -10 "$D/outline-check.txt"; ok=1; }
tail -3 "$D/outline-check.txt"

tiles=$($PY -B docs/redraw-orders/queue/s1-tiles/verify.py --area mapo-all 2>&1); echo "$tiles" | tail -6
echo "$tiles" | grep -q '^VERIFY-OK' || { echo 'FAIL 칸 자료 검사'; ok=1; }

pnpm test:map > "$D/test-map.log" 2>&1 || { echo 'FAIL pnpm test:map'; tail -12 "$D/test-map.log"; ok=1; }

[ $ok = 0 ] && echo PASS-SIDEWALK; exit $ok
