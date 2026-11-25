#!/bin/bash
# s1-no-a2 통과 검사: A2 없는 길 조사 결과(갈래 분류·표본 그림 여덟 장·요약)가 있고, 자료와 화면은 그대로이며 앞 일감 검사가 통과한다.
set -u; cd "$(dirname "$0")/../../../.." || exit 1
PY=tools/.venv/bin/python; D=tmp/loop/s1-no-a2; ok=0

for f in "$D/classify.tsv" "$D/classify.py" "$D/summary.md"; do
  [ -s "$f" ] || { echo "FAIL 없음: $f"; ok=1; }; done
for n in 01 02 03 04 05 06 07 08; do
  [ -s "$D/shots/pick-$n.jpg" ] || { echo "FAIL 없음: $D/shots/pick-$n.jpg"; ok=1; }; done
[ $ok = 0 ] || { echo '앞의 파일이 없어 검사를 멈춘다'; exit 1; }

$PY - "$D" <<'PY' || ok=1
import hashlib, sys
from pathlib import Path
from PIL import Image
work = Path(sys.argv[1])
bad = []

# 앞 일감이 센 343길(머리줄 1 + 342길)을 모두 덮는지
source = [l for l in (Path('tmp/loop/s1-audit/no-a2.tsv').read_text().splitlines()) if l.strip()]
want = {l.split('\t')[0] for l in source[1:]}
rows = [l for l in work.joinpath('classify.tsv').read_text().splitlines() if l.strip()]
head, body = rows[0].split('\t'), rows[1:]
got = {l.split('\t')[0] for l in body}
print(f'분류 {len(body)}줄, 앞 일감 목록 {len(want)}길, 머리줄 {len(head)}칸')
missing = sorted(want - got)
if missing: bad.append(f'분류에서 빠진 길 {len(missing)}개: ' + ', '.join(missing[:5]))
extra = sorted(got - want)
if extra: bad.append(f'앞 일감 목록에 없는 길 {len(extra)}개: ' + ', '.join(extra[:5]))
if len(head) < 5: bad.append(f'분류 머리줄이 {len(head)}칸이다(길 이름·미대조 길이·세 갈래 길이·네모 안 여부로 5칸 이상)')

# 세 갈래 길이를 숫자로 읽을 수 있고, 합이 0 이 아니다
nums = []
for line in body:
    cell = line.split('\t')
    vals = []
    for c in cell[1:]:
        try: vals.append(float(c))
        except ValueError: pass
    nums.append(vals)
if not any(sum(v) > 0 for v in nums):
    bad.append('분류의 숫자 칸이 모두 0 이다(재지 않았다)')
else:
    print(f'숫자 칸이 있는 줄 {sum(1 for v in nums if v)}개, 가장 큰 값 {max((max(v) for v in nums if v), default=0):,.0f}')

# 표본 그림 여덟 장: 서로 다르고 가로로 붙여 넓다
seen = {}
for n in range(1, 9):
    path = work/'shots'/f'pick-{n:02d}.jpg'
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if digest in seen: bad.append(f'pick-{n:02d} 가 pick-{seen[digest]} 과 같은 그림이다')
    seen[digest] = f'{n:02d}'
    w, h = Image.open(path).size
    if w < 1200: bad.append(f'pick-{n:02d} 폭이 {w}px 다(하한 1,200)')
    if h < 200: bad.append(f'pick-{n:02d} 높이가 {h}px 다(하한 200)')

# 요약에 표본 여덟 길과 판정이 있다
summary = work.joinpath('summary.md').read_text()
for road in ('어울마당로', '잔다리로', '연세로', '동교로', '와우산로', '만리재옛길', '포은로', '마포대로'):
    if road not in summary: bad.append(f'summary.md 에 표본 길 {road} 가 없다')
if len(summary.splitlines()) < 12: bad.append(f'summary.md 가 {len(summary.splitlines())}줄이다(하한 12)')

print('\n'.join(f'FAIL {line}' for line in bad) or '조사 결과 통과')
sys.exit(1 if bad else 0)
PY

# 이 일감은 재기만 한다: 자료·화면·구역 설정이 바뀌면 안 된다
git diff --quiet HEAD -- src tools/v2 \
  || { echo 'FAIL src 나 tools/v2 가 바뀜(이 일감은 고치지 않는다)'; git diff --stat HEAD -- src tools/v2 | tail -6; ok=1; }
git status --porcelain public/data/v2 | grep -v '^?? ' | grep . && { echo 'FAIL 구운 자료가 바뀜'; ok=1; }

bash docs/redraw-orders/queue/s1-outline/check.sh > "$D/outline-check.txt" 2>&1 \
  || { echo 'FAIL s1-outline 검사'; tail -10 "$D/outline-check.txt"; ok=1; }
tail -3 "$D/outline-check.txt"

tiles=$($PY -B docs/redraw-orders/queue/s1-tiles/verify.py --area mapo-all 2>&1); echo "$tiles" | head -6
echo "$tiles" | grep -q '^VERIFY-OK' || { echo 'FAIL 칸 자료 검사'; ok=1; }

pnpm test:map > "$D/test-map.log" 2>&1 || { echo 'FAIL pnpm test:map'; tail -12 "$D/test-map.log"; ok=1; }

[ $ok = 0 ] && echo PASS-NO-A2; exit $ok
