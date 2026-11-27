#!/bin/bash
# s1-decks 통과 검사: 다리·고가·지하차도 겹침 조사(상판 목록·겹침·층 단서·표본 네 곳·규칙 후보)가 있고,
# 검사가 측정 스크립트를 직접 다시 돌려 수치를 만들며, 코드와 구운 자료는 그대로다.
set -u; cd "$(dirname "$0")/../../../.." || exit 1
PY=tools/.venv/bin/python; D=tmp/loop/s1-decks; ok=0

for f in "$D/measure_decks.py" "$D/decks.tsv" "$D/summary.md"; do
  [ -s "$f" ] || { echo "FAIL 없음: $f"; ok=1; }; done
for n in 01 02 03 04; do
  for kind in photo overlay; do
    [ -s "$D/shots/d-$n-$kind.jpg" ] || { echo "FAIL 없음: $D/shots/d-$n-$kind.jpg"; ok=1; }; done; done
[ $ok = 0 ] || { echo '앞의 파일이 없어 검사를 멈춘다'; exit 1; }

# 수치는 검사가 직접 만든다(마스터 11-27 15:55). 구현자가 쓴 수치 파일을 그대로 믿지 않는다.
$PY -B "$D/measure_decks.py" > "$D/check-measure.log" 2>&1 \
  || { echo 'FAIL 측정 스크립트를 다시 돌리지 못했다'; tail -15 "$D/check-measure.log"; exit 1; }
grep -o '^DECKS-STATS .*' "$D/check-measure.log" | tail -1 > "$D/check-stats.txt"
[ -s "$D/check-stats.txt" ] || { echo 'FAIL 측정 스크립트가 DECKS-STATS 줄을 찍지 않았다'; tail -15 "$D/check-measure.log"; exit 1; }

$PY - "$D" <<'PY' || ok=1
import hashlib, json, sys
from pathlib import Path
from PIL import Image
work = Path(sys.argv[1])
bad = []
stats = json.loads(work.joinpath('check-stats.txt').read_text().split(' ', 1)[1])

def number(value, label):
    try:
        return float(value)
    except (TypeError, ValueError):
        bad.append(f'{label} 이 숫자가 아니다: {value!r}')
        return 0.0

decks = stats.get('decks') or {}
total = 0
for kind in ('도로교', '보도교', '고가차도'):
    row = decks.get(kind)
    if not isinstance(row, dict) or 'count' not in row or 'area' not in row:
        bad.append(f'상판 종류 {kind} 를 재지 않았다(decks 의 열쇠로 count·area 를 넣는다)')
        continue
    count = number(row['count'], f'{kind}.count')
    total += count
    print(f'  상판 {kind}: {count:,.0f}면, {number(row["area"], kind+".area"):,.0f}㎡')
print(f'상판 합 {total:,.0f}면')
if total < 200:
    bad.append(f'상판이 {total:,.0f}면이다(하한 200. 구운 자료의 decks 는 287면이므로 윤곽이나 걸러내기를 다시 본다)')

skipped = stats.get('skipped') or {}
for kind in ('철교', '지하차도'):
    row = skipped.get(kind)
    if not isinstance(row, dict) or 'count' not in row or 'area' not in row:
        bad.append(f'버려지는 {kind} 를 재지 않았다(skipped 의 열쇠로 count·area 를 넣는다)')
    else:
        print(f'  버려짐 {kind}: {number(row["count"], kind):,.0f}면, {number(row["area"], kind):,.0f}㎡')

overlap = stats.get('overlap') or {}
for field in ('lines', 'road', 'paint', 'crossings'):
    if field not in overlap:
        bad.append(f'상판 아래 겹침 {field} 를 재지 않았다(overlap 의 열쇠로 넣는다)')
if 'lines' in overlap:
    metres = number(overlap['lines'], 'overlap.lines')
    print(f'상판 안 노면선 {metres:,.0f}m, 찻길 {number(overlap.get("road", 0), "overlap.road"):,.0f}㎡, '
          f'도색 {number(overlap.get("paint", 0), "overlap.paint"):,.0f}㎡, 횡단보도 {overlap.get("crossings")}')
    if metres <= 0:
        bad.append('상판 안 노면선이 0m 다(세는 방법이 틀렸다. 겹침이 없다면 이 조사의 전제가 무너진다)')

underpass = stats.get('underpass') or {}
for field in ('lines', 'road'):
    if field not in underpass:
        bad.append(f'지하차도 {field} 를 재지 않았다(underpass 의 열쇠로 넣는다)')
if 'lines' in underpass:
    print(f'지하차도 면 안 노면선 {number(underpass["lines"], "underpass.lines"):,.0f}m')

fields = stats.get('layer_fields') or {}
for key in ('a0090000', 'a2', 'b2', 'a0070000'):
    if key not in fields:
        bad.append(f'층을 가를 단서 {key} 를 재지 않았다(layer_fields 의 열쇠로 넣는다)')
    else:
        print(f'  단서 {key}: {json.dumps(fields[key], ensure_ascii=False)[:160]}')

spots = stats.get('spots') or {}
for name in ('D01', 'D02', 'D03', 'D04'):
    row = spots.get(name)
    if not isinstance(row, dict):
        bad.append(f'표본 {name} 을 재지 않았다(spots 의 열쇠로 넣는다)')
        continue
    for field in ('deck_area', 'lines', 'above', 'below'):
        if field not in row:
            bad.append(f'{name} 에 {field} 가 없다')
    print(f'  {name}: 상판 {number(row.get("deck_area", 0), name):,.0f}㎡, 선 {number(row.get("lines", 0), name):,.0f}m, '
          f'위 {row.get("above")!r} / 아래 {row.get("below")!r}')

# decks.tsv 의 숫자가 다시 돌린 값과 1% 안에서 같다
rows = [line for line in work.joinpath('decks.tsv').read_text().splitlines() if line.strip()]
if len(rows) < 2:
    bad.append('decks.tsv 가 머리줄뿐이다')
else:
    print(f'decks.tsv {len(rows) - 1}줄')
    area_sum = 0.0
    for line in rows[1:]:
        for cell in line.split('\t')[1:]:
            try:
                area_sum += float(cell.replace(',', ''))
                break
            except ValueError:
                continue
    if area_sum <= 0:
        bad.append('decks.tsv 의 둘째 칸에서 숫자를 읽을 수 없다(상판 면적을 둘째 칸에 둔다)')
    deck_area = sum(number(row.get('area', 0), 'area') for row in decks.values() if isinstance(row, dict))
    if deck_area and area_sum > deck_area * 1.01:
        bad.append(f'decks.tsv 의 면적 합 {area_sum:,.0f}㎡ 가 다시 잰 전체 {deck_area:,.0f}㎡ 보다 크다')

# 그림 여덟 장: 서로 다르고 충분히 크다
seen = {}
for n in range(1, 5):
    for kind in ('photo', 'overlay'):
        path = work/'shots'/f'd-{n:02d}-{kind}.jpg'
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        if digest in seen:
            bad.append(f'd-{n:02d}-{kind} 가 {seen[digest]} 과 같은 그림이다')
        seen[digest] = f'd-{n:02d}-{kind}'
        w, h = Image.open(path).size
        if w < 900: bad.append(f'd-{n:02d}-{kind} 폭이 {w}px 다(하한 900)')
        if h < 300: bad.append(f'd-{n:02d}-{kind} 높이가 {h}px 다(하한 300)')

summary = work.joinpath('summary.md').read_text()
for word in ('규칙 후보', '양화대교', '성산2교', '마포구청', '디지털미디어시티', '지하차도'):
    if word not in summary: bad.append(f'summary.md 에 「{word}」가 없다')
if len(summary.splitlines()) < 12:
    bad.append(f'summary.md 가 {len(summary.splitlines())}줄이다(하한 12)')

print('\n'.join(f'FAIL {line}' for line in bad) or '다리·고가 조사 결과 통과')
sys.exit(1 if bad else 0)
PY

# 이 일감은 재기만 한다: 코드·자료·구역 설정이 바뀌면 안 된다
git diff --quiet HEAD -- src tools/v2 \
  || { echo 'FAIL src 나 tools/v2 가 바뀜(이 일감은 고치지 않는다)'; git diff --stat HEAD -- src tools/v2 | tail -6; ok=1; }
git status --porcelain src tools/v2 | grep '^?? ' | grep . \
  && { echo 'FAIL src 나 tools/v2 에 새 파일이 생김(측정 스크립트는 tmp/loop/s1-decks 에 둔다)'; ok=1; }
git status --porcelain public/data/v2 | grep -v '^?? ' | grep . && { echo 'FAIL 구운 자료가 바뀜'; ok=1; }
for prev in s1-outline s1-tiles s1-water s1-paint s1-approach s1-safety-border s1-uturn s1-sidewalk; do
  git diff --quiet HEAD -- "docs/redraw-orders/queue/$prev" \
    || { echo "FAIL 앞 일감 $prev 의 검사 파일이 바뀜"; ok=1; }; done

bash docs/redraw-orders/queue/s1-outline/check.sh > "$D/outline-check.txt" 2>&1 \
  || { echo 'FAIL s1-outline 검사'; tail -10 "$D/outline-check.txt"; ok=1; }
tail -3 "$D/outline-check.txt"

tiles=$($PY -B docs/redraw-orders/queue/s1-tiles/verify.py --area mapo-all 2>&1); echo "$tiles" | tail -6
echo "$tiles" | grep -q '^VERIFY-OK' || { echo 'FAIL 칸 자료 검사'; ok=1; }

pnpm test:map > "$D/test-map.log" 2>&1 || { echo 'FAIL pnpm test:map'; tail -12 "$D/test-map.log"; ok=1; }

[ $ok = 0 ] && echo PASS-DECKS; exit $ok
