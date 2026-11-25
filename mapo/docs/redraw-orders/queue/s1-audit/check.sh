#!/bin/bash
# s1-audit 통과 검사: 전역 큰길 사진 대조가 돌아 검수 페이지·패널·요약표·검수용 그림 12장이 있고, 앞 일감 검사가 그대로 통과한다.
set -u; cd "$(dirname "$0")/../../../.." || exit 1
PY=tools/.venv/bin/python; D=tmp/loop/s1-audit; A=$D/audit; ok=0

for f in "$A/index.html" "$A/plan.json" "$A/sections.ndjson" "$A/report.json" \
  "$D/summary.md" "$D/review/index.md" "$D/worst-lanes.tsv" "$D/worst-width.tsv" "$D/no-a2.tsv"; do
  [ -s "$f" ] || { echo "FAIL 없음: $f"; ok=1; }; done
for n in 01 02 03 04 05 06 07 08 09 10 11 12; do
  [ -s "$D/review/pick-$n.jpg" ] || { echo "FAIL 없음: $D/review/pick-$n.jpg"; ok=1; }; done
[ $ok = 0 ] || { echo '앞의 파일이 없어 검사를 멈춘다'; exit 1; }

$PY - "$A" "$D" <<'PY' || ok=1
import hashlib, json, sys
from pathlib import Path
audit, work = Path(sys.argv[1]), Path(sys.argv[2])
bad = []
report = json.loads((audit/'report.json').read_text())
rows = [json.loads(line) for line in (audit/'sections.ndjson').read_text().splitlines() if line.strip()]
total = report['all']
roads = {r['road']: r for r in report['roads']}
print(f"칸 {total['sections']:,}개, 길 {len(roads)}개, 빠진 사진 타일 {total['missing_tiles']}")
print(f"차로 수 판독 {total['lane_read']}, 불일치 {total['lane_mismatch']}, 판독 못 함 {total['not_read']}, "
      f"높이 섞임 {total['mixed']}, 노면선 {total['marks_read']}, 연석 {total['curbs_read']}, 인도 {total['sidewalk_read']}")
if total['sections'] < 2500: bad.append(f"칸이 {total['sections']}개다(하한 2,500). 전역이 아니라 일부만 돈 것이다")
if len(rows) != total['sections']: bad.append(f"sections.ndjson {len(rows)}줄과 보고서 {total['sections']}칸이 다르다")
if len(roads) < 15: bad.append(f"길이 {len(roads)}개다(하한 15)")
if total['missing_tiles']: bad.append(f"빠진 사진 타일 {total['missing_tiles']}장(전역 사진은 이미 다 받아 두었다)")

# 홍대 일대에서 떴던 큰길 15개가 전역에도 있어야 한다
want = {'강변북로','양화로','동교로','와우산로','희우정로','성산로','연희로','독막로',
        '망원로','연남로','토정로','월드컵로','방울내로','신촌로','월드컵북로'}
missing = sorted(want - set(roads))
if missing: bad.append('홍대 일대에 있던 길이 빠졌다: ' + ', '.join(missing))

# 칸마다 패널 세 장
lack = [r['id'] for r in rows if not all(
    (audit/'panels'/r['id'][:3]/f"{r['id']}-{suffix}").is_file()
    for suffix in ('photo.jpg', 'model.png', 'overlay.jpg'))]
if lack: bad.append(f"패널이 빠진 칸 {len(lack)}개(예: {', '.join(lack[:5])})")
else: print(f'패널 {len(rows)*3:,}장 모두 있음')

# 검수용 그림 12장: 서로 다르고 가로로 붙여 넓다
from PIL import Image
seen = {}
for n in range(1, 13):
    path = work/'review'/f'pick-{n:02d}.jpg'
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if digest in seen: bad.append(f'pick-{n:02d} 가 pick-{seen[digest]} 과 같은 그림이다')
    seen[digest] = f'{n:02d}'
    w, h = Image.open(path).size
    if w < 900: bad.append(f'pick-{n:02d} 폭이 {w}px 다(하한 900)')
index = (work/'review'/'index.md').read_text()
for n in range(1, 13):
    if f'pick-{n:02d}' not in index: bad.append(f'review/index.md 에 pick-{n:02d} 줄이 없다')

summary = (work/'summary.md').read_text()
absent = [road for road in roads if road not in summary]
if absent: bad.append(f'summary.md 에 길 {len(absent)}개가 빠졌다: ' + ', '.join(absent[:5]))
for name in ('worst-lanes.tsv', 'worst-width.tsv', 'no-a2.tsv'):
    print(f'{name}: {len((work/name).read_text().splitlines())}줄')

print('\n'.join(f'FAIL {line}' for line in bad) or '사진 대조 결과 통과')
sys.exit(1 if bad else 0)
PY

bash docs/redraw-orders/queue/s1-outline/check.sh > "$D/outline-check.txt" 2>&1 \
  || { echo 'FAIL s1-outline 검사'; tail -10 "$D/outline-check.txt"; ok=1; }
tail -3 "$D/outline-check.txt"

tiles=$($PY -B docs/redraw-orders/queue/s1-tiles/verify.py --area mapo-all 2>&1); echo "$tiles" | head -8
echo "$tiles" | grep -q '^VERIFY-OK' || { echo 'FAIL 칸 자료 검사'; ok=1; }

# 이 일감은 재기만 한다: 화면·굽기·구역 설정이 바뀌면 안 된다
git diff --quiet HEAD -- src tools/v2/areas tools/v2/bake_aerial_ground.py tools/v2/aerial_paint.py \
  tools/v2/aerial_rules.py tools/v2/aerial_buildings.py \
  || { echo 'FAIL 화면·굽기·구역 설정이 바뀜(이 일감은 고치지 않는다)'; git diff --stat HEAD -- src tools/v2 | tail -6; ok=1; }
git status --porcelain public/data/v2 | grep -v '^?? ' | grep . && { echo 'FAIL 구운 자료가 바뀜'; ok=1; }

pnpm test:map > "$D/test-map.log" 2>&1 || { echo 'FAIL pnpm test:map'; tail -12 "$D/test-map.log"; ok=1; }

[ $ok = 0 ] && echo PASS-AUDIT; exit $ok
