#!/bin/bash
# s1-review 통과 검사: 큰 교차로 20곳의 패널·판정표·묶음 요약이 있고, 자료와 화면은 그대로이며 앞 일감 검사가 통과한다.
set -u; cd "$(dirname "$0")/../../../.." || exit 1
PY=tools/.venv/bin/python; D=tmp/loop/s1-review; ok=0

for f in "$D/spots.tsv" "$D/spots.py" "$D/plan.json" "$D/findings.tsv" "$D/summary.md" \
  "$D/review/index.md" "$D/audit/plan.json" "$D/audit/sections.ndjson" "$D/audit/index.html"; do
  [ -s "$f" ] || { echo "FAIL 없음: $f"; ok=1; }; done
for n in 01 02 03 04 05 06 07 08 09 10 11 12 13 14 15 16 17 18 19 20; do
  [ -s "$D/shots/j-$n.jpg" ] || { echo "FAIL 없음: $D/shots/j-$n.jpg"; ok=1; }; done
[ $ok = 0 ] || { echo '앞의 파일이 없어 검사를 멈춘다'; exit 1; }

$PY - "$D" <<'PY' || ok=1
import hashlib, json, math, sys
from pathlib import Path
from PIL import Image
work = Path(sys.argv[1])
bad = []

NAMES = ['합정','서교','홍대입구','동교동삼거리','신촌오거리','이대역','공덕오거리','마포역','대흥역',
         '광흥창역','상수역','망원역','마포구청역','월드컵경기장','디지털미디어시티역','성산2교',
         '연남','서강대앞','연세대앞','양화대교북단']
ITEMS = ['차로수','차선','정지선','횡단보도','교통섬','인도폭']
VERDICTS = {'맞음','틀림','판독못함'}

# 1. 자리 20곳: 이름·순서·좌표·간격
rows = [l.split('\t') for l in work.joinpath('spots.tsv').read_text().splitlines() if l.strip()]
head, body = rows[0], rows[1:]
if len(head) < 10: bad.append(f'spots.tsv 머리줄이 {len(head)}칸이다(하한 10)')
if len(body) != 20: bad.append(f'spots.tsv 가 {len(body)}줄이다(20줄이어야 한다)')
spots = {}
for i, cell in enumerate(body):
    if len(cell) < 10: bad.append(f'spots.tsv {i+1}번째 줄이 {len(cell)}칸이다'); continue
    name = cell[1].strip()
    if i < len(NAMES) and name != NAMES[i]:
        bad.append(f'{i+1}번 이름이 {name} 이다(주어진 순서는 {NAMES[i]})')
    try: x, z = float(cell[2]), float(cell[3])
    except ValueError: bad.append(f'{name} 의 좌표를 숫자로 읽을 수 없다: {cell[2]}, {cell[3]}'); continue
    if cell[4].strip() not in ('가','나','다','라'):
        bad.append(f'{name} 의 찾은 규칙이 가/나/다/라 가 아니다: {cell[4]}')
    if not cell[9].strip(): bad.append(f'{name} 의 패널 road 가 비었다')
    spots[i+1] = (name, x, z, cell[9].strip())
win = json.loads(Path('tools/v2/areas/mapo-all.json').read_text())['window']
for n, (name, x, z, _road) in spots.items():
    if not (win[0] <= x <= win[2] and win[1] <= z <= win[3]):
        bad.append(f'{name} 좌표 ({x:.0f}, {z:.0f}) 가 구역 창 밖이다')
keys = sorted(spots)
for a in range(len(keys)):
    for b in range(a+1, len(keys)):
        na, xa, za, _ = spots[keys[a]]; nb, xb, zb, _ = spots[keys[b]]
        d = math.dist((xa, za), (xb, zb))
        if d < 200: bad.append(f'{na} 와 {nb} 가 {d:.0f}m 떨어져 있다(하한 200m)')
print(f'자리 {len(spots)}곳, 가장 가까운 두 곳 '
      f'{min((math.dist(spots[keys[a]][1:3], spots[keys[b]][1:3]) for a in range(len(keys)) for b in range(a+1, len(keys))), default=0):.0f}m')

# 2. plan.json: 20줄, 좌표가 spots 와 1m 안쪽, 패널 한 변 180m 쯤, 패널 세 장
plan = json.loads(work.joinpath('plan.json').read_text())
if len(plan) != 20: bad.append(f'plan.json 이 {len(plan)}줄이다(20줄)')
used = json.loads(work.joinpath('audit/plan.json').read_text())
if len(used) != len(plan): bad.append(f'실제로 쓴 plan 이 {len(used)}줄, 넘긴 것이 {len(plan)}줄이다')
for row in plan:
    rid = row.get('id','?')
    try: n = int(str(rid)[1:3])
    except ValueError: bad.append(f'id {rid} 에서 자리 번호를 읽을 수 없다(J01-001 꼴)'); continue
    if n not in spots: bad.append(f'id {rid} 가 자리 번호 1~20 밖이다'); continue
    _name, x, z, road = spots[n]
    if math.dist(row['xy'], (x, z)) > 1:
        bad.append(f'{rid} 의 좌표가 spots.tsv 와 {math.dist(row["xy"], (x, z)):.1f}m 다르다')
    if row.get('road') != road: bad.append(f'{rid} 의 road 가 spots.tsv 와 다르다: {row.get("road")} / {road}')
    if min(row.get('h',0), row.get('w',0)) < 150:
        bad.append(f'{rid} 패널이 {row.get("w")}×{row.get("h")}m 다(한 변 150m 이상)')
    panel = work/'audit'/'panels'/str(rid)[:3]
    for suffix in ('photo.jpg','model.png','overlay.jpg'):
        if not (panel/f'{rid}-{suffix}').is_file(): bad.append(f'패널 없음: {panel/f"{rid}-{suffix}"}')
lines = [l for l in work.joinpath('audit/sections.ndjson').read_text().splitlines() if l.strip()]
if len(lines) != len(used): bad.append(f'sections.ndjson {len(lines)}줄과 plan {len(used)}줄이 다르다')
print(f'plan {len(plan)}줄, 패널 {len(plan)*3}장, 판독 기록 {len(lines)}줄')

# 3. 붙인 그림 20장: 서로 다르고 넓다
seen = {}
for n in range(1, 21):
    path = work/'shots'/f'j-{n:02d}.jpg'
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if digest in seen: bad.append(f'j-{n:02d} 가 j-{seen[digest]} 과 같은 그림이다')
    seen[digest] = f'{n:02d}'
    w, h = Image.open(path).size
    if w < 1200: bad.append(f'j-{n:02d} 폭이 {w}px 다(하한 1,200)')
    if h < 300: bad.append(f'j-{n:02d} 높이가 {h}px 다(하한 300)')

# 4. 판정표: 20곳 × 항목 6가지, 판정 값, 메모 길이
frows = [l.split('\t') for l in work.joinpath('findings.tsv').read_text().splitlines() if l.strip()]
fbody = frows[1:]
if len(fbody) != 120: bad.append(f'findings.tsv 가 {len(fbody)}줄이다(20곳 × 6항목 = 120줄)')
count = {v: 0 for v in VERDICTS}
per_item = {item: {v: 0 for v in VERDICTS} for item in ITEMS}
pairs = set()
for cell in fbody:
    if len(cell) < 5: bad.append(f'findings.tsv 의 줄이 {len(cell)}칸이다: {cell[:3]}'); continue
    try: n = int(cell[0])
    except ValueError: bad.append(f'findings.tsv 번호를 읽을 수 없다: {cell[0]}'); continue
    item, verdict, note = cell[2].strip(), cell[3].strip(), cell[4].strip()
    if n not in spots: bad.append(f'findings.tsv 의 번호 {n} 가 자리 밖이다'); continue
    if item not in ITEMS: bad.append(f'항목 이름이 다르다: {item}'); continue
    if verdict not in VERDICTS: bad.append(f'{n}번 {item} 의 판정이 맞음/틀림/판독못함 이 아니다: {verdict}'); continue
    if (n, item) in pairs: bad.append(f'{n}번 {item} 줄이 두 번 있다')
    pairs.add((n, item))
    count[verdict] += 1; per_item[item][verdict] += 1
    if verdict != '맞음' and len(note) < 10:
        bad.append(f'{n}번 {item} 의 메모가 {len(note)}자다(틀림·판독못함은 10자 이상)')
missing = [(n, item) for n in spots for item in ITEMS if (n, item) not in pairs]
if missing: bad.append(f'빠진 칸 {len(missing)}개(예: {missing[:4]})')
print('판정 ' + ', '.join(f'{v} {count[v]}' for v in ('맞음','틀림','판독못함')))
for item in ITEMS:
    print(f'  {item}: 맞음 {per_item[item]["맞음"]}, 틀림 {per_item[item]["틀림"]}, 판독못함 {per_item[item]["판독못함"]}')

# 5. 요약과 검수 페이지
summary = work.joinpath('summary.md').read_text()
for name in NAMES:
    if name not in summary: bad.append(f'summary.md 에 {name} 가 없다')
for item in ITEMS:
    if item not in summary: bad.append(f'summary.md 에 항목 {item} 가 없다')
if len(summary.splitlines()) < 25: bad.append(f'summary.md 가 {len(summary.splitlines())}줄이다(하한 25)')
index = work.joinpath('review/index.md').read_text()
for n in range(1, 21):
    if f'j-{n:02d}' not in index: bad.append(f'review/index.md 에 j-{n:02d} 줄이 없다')

print('\n'.join(f'FAIL {line}' for line in bad) or '조사 결과 통과')
sys.exit(1 if bad else 0)
PY

# 이 일감은 재기만 한다: 자료·화면·구역 설정이 바뀌면 안 된다
git diff --quiet HEAD -- src tools/v2 \
  || { echo 'FAIL src 나 tools/v2 가 바뀜(이 일감은 고치지 않는다)'; git diff --stat HEAD -- src tools/v2 | tail -6; ok=1; }
git status --porcelain public/data/v2 | grep -v '^?? ' | grep . && { echo 'FAIL 구운 자료가 바뀜'; ok=1; }

# 앞 일감 검사를 그대로 다시 돌린다(화면 캡처가 없는 자료 검사만)
bash docs/redraw-orders/queue/s1-outline/check.sh > "$D/outline-check.txt" 2>&1 \
  || { echo 'FAIL s1-outline 검사'; tail -10 "$D/outline-check.txt"; ok=1; }
tail -3 "$D/outline-check.txt"
tiles=$($PY -B docs/redraw-orders/queue/s1-tiles/verify.py --area mapo-all 2>&1); echo "$tiles" | tail -6
echo "$tiles" | grep -q '^VERIFY-OK' || { echo 'FAIL 칸 자료 검사'; ok=1; }
water=$($PY -B docs/redraw-orders/queue/s1-water/water.py 2>&1); echo "$water" | tail -4
echo "$water" | grep -q '^WATER-OK' || { echo 'FAIL 물·구멍 검사'; ok=1; }
paint=$($PY -B docs/redraw-orders/queue/s1-paint/paint.py 2>&1); echo "$paint" | tail -6
echo "$paint" | grep -q '^PAINT-OK' || { echo 'FAIL 노면 세부 자료 검사'; ok=1; }

pnpm test:map > "$D/test-map.log" 2>&1 || { echo 'FAIL pnpm test:map'; tail -12 "$D/test-map.log"; ok=1; }

[ $ok = 0 ] && echo PASS-REVIEW; exit $ok
