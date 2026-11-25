#!/bin/bash
# s1-bake 통과 검사: 전역 구역 설정과 구운 자료가 있고, 정적 검사를 통과하고, 다른 구역 자료와 src/sim 이 그대로다.
set -u; cd "$(dirname "$0")/../../../.." || exit 1
PY=tools/.venv/bin/python; ok=0
for f in tools/v2/areas/mapo-all.json public/data/v2/mapo-all.json.gz public/data/v2/mapo-all-a.json.gz public/data/v2/mapo-all-buildings.json.gz tmp/loop/s1-bake/sinchon.png tmp/loop/s1-bake/seongsan.png tmp/loop/s1-bake/mapo-daero.png tmp/loop/s1-bake/gangbyeon.png; do
  [ -s "$f" ] || { echo "FAIL 없음: $f"; ok=1; }; done
$PY -B tools/v2/check_connected_map.py --area mapo-all || { echo "FAIL check_connected_map"; ok=1; }
PYTHONPATH=tools/v2 $PY -B -m unittest tools/v2/test_area_outline.py tools/v2/test_district_building_seams.py 2>&1 | tail -3
[ "${PIPESTATUS[0]}" = 0 ] || { echo "FAIL unittest"; ok=1; }
git diff --quiet HEAD -- src/sim public/data/v2/hongdae-district* public/data/v2/hapjeong* public/data/v2/seogyo* public/data/v2/yanghwa* tools/v2/areas/hongdae-district.json tools/v2/areas/hapjeong.json tools/v2/areas/seogyo.json tools/v2/areas/yanghwa-map.json tools/v2/areas/hongdae-west.json tools/v2/areas/hongdae-donggyo.json \
  || { echo "FAIL 다른 구역 자료나 src/sim 이 바뀜"; git diff --stat HEAD -- src/sim public/data/v2 tools/v2/areas | tail -5; ok=1; }
$PY - <<'PY' || ok=1
import gzip, json, sys
a = json.load(gzip.open('public/data/v2/mapo-all-a.json.gz')); b = json.load(gzip.open('public/data/v2/mapo-all-buildings.json.gz'))
n = dict(buildings=len(b['buildings']), crossings=len(a.get('crossings') or a.get('floor', {}).get('crossings', [])), paint=len(a.get('paint') or a.get('floor', {}).get('paint', [])))
print('counts', n)
bad = n['buildings'] < 30000 or n['crossings'] < 1500
print('FAIL 개수 하한(건물 30,000, 횡단보도 1,500)' if bad else 'counts ok'); sys.exit(1 if bad else 0)
PY
[ $ok = 0 ] && echo PASS-CHECK; exit $ok
