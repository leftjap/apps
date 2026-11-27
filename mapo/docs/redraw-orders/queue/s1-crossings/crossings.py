# s1-crossings 자료 검사: 수치지형도 횡단보도 후보가 규칙으로 들어와 큰 교차로의 지선 횡단이 채워졌다.
import gzip
import json
import math
import sys
from pathlib import Path

from shapely.geometry import Point, Polygon
from shapely.ops import unary_union
from shapely.strtree import STRtree

ROOT = Path(__file__).resolve().parents[4]
DATA = ROOT / 'public/data/v2'
RADIUS = 90  # 자리마다 이 반지름 안의 횡단보도 면 중심을 센다

# 2026-11-27 계획 세우기가 고치기 전 자료에서 직접 센 기준값이다. 구현이 이 표를 바꿀 수 없다.
# 번호, 이름, x, z, 고치기 전 횡단보도 수, s1-review 가 「지선 횡단 누락」으로 적었는지
SPOTS = [
    ('01', '합정', -490.85, 253.62, 32, True),
    ('02', '서교', 224.88, -410.60, 4, True),
    ('03', '홍대입구', 451.92, -624.28, 9, True),
    ('04', '동교동삼거리', 670.88, -800.17, 16, True),
    ('05', '신촌오거리', 1577.05, -402.09, 11, True),
    ('06', '이대역', 2373.44, -588.25, 12, False),
    ('07', '공덕오거리', 2826.55, 841.64, 13, True),
    ('08', '마포역', 2292.69, 1403.37, 2, True),
    ('09', '대흥역', 2023.83, 400.86, 9, False),
    ('10', '광흥창역', 1093.03, 444.82, 8, False),
    ('11', '상수역', 351.88, 417.68, 8, False),
    ('12', '망원역', -941.33, -730.32, 13, False),
    ('13', '마포구청역', -1394.21, -1364.79, 3, True),
    ('14', '월드컵경기장', -2239.32, -1801.84, 9, False),
    ('15', '디지털미디어시티역', -1614.72, -2665.39, 5, False),
    ('16', '성산2교', -638.17, -1535.73, 13, False),
    ('17', '연남', 209.14, -1303.29, 13, False),
    ('18', '서강대앞', 1772.35, 256.37, 2, True),
    ('19', '연세대앞', 1582.32, -952.00, 12, True),
    ('20', '양화대교북단', -1152.68, 317.86, 0, False),
]
WHOLE_BEFORE = 1638      # 고치기 전 전역 횡단보도 수
WHOLE_FLOOR = 1900       # 늘어난 뒤 하한
HONGDAE_BEFORE = 497     # 홍대 일대 자료는 다시 만들지 않으므로 그대로여야 한다
GAINED_FLOOR = 8         # 누락으로 적힌 10곳 가운데 횡단보도가 늘어야 하는 자리 수
bad = []


def read(stem):
    path = DATA / f'{stem}-a.json.gz'
    if not path.is_file():
        bad.append(f'없음: {path.relative_to(ROOT)}')
        return None
    return json.load(gzip.open(path))


def face_union(faces):
    return unary_union([Polygon(face[0], face[1:]) for face in faces])


def centre(poly):
    pt = poly.representative_point()
    return (pt.x, pt.y)


whole = read('mapo-all')
mark = read('hongdae-district')
if whole is None or mark is None:
    print('\n'.join(f'FAIL {line}' for line in bad))
    raise SystemExit(1)

rows = whole['crossings']
print(f'전역 횡단보도 {len(rows):,}개 (고치기 전 {WHOLE_BEFORE:,})')
if len(rows) <= WHOLE_BEFORE:
    bad.append(f'전역 횡단보도가 {len(rows):,}개로 늘지 않았다(고치기 전 {WHOLE_BEFORE:,})')
if len(rows) < WHOLE_FLOOR:
    bad.append(f'전역 횡단보도 {len(rows):,}개가 하한 {WHOLE_FLOOR:,} 아래다')
if len(mark['crossings']) != HONGDAE_BEFORE:
    bad.append(f'홍대 일대 횡단보도가 {len(mark["crossings"]):,}개다(그대로여야 한다: {HONGDAE_BEFORE:,})')

polys = [face_union(row['faces']) for row in rows]
centres = [centre(poly) for poly in polys]
old_rows = [i for i, row in enumerate(rows) if not row.get('source')]
new_rows = [i for i, row in enumerate(rows) if row.get('source')]
print(f'  정밀도로지도 B3 {len(old_rows):,}개, 수치지형도에서 보충 {len(new_rows):,}개')
if len(new_rows) < 100:
    bad.append(f'보충된 횡단보도가 {len(new_rows)}개다(하한 100)')

# 1. 자리 20곳: 줄어든 자리가 없고, 누락으로 적힌 자리에서 늘어난다
gained = []
for num, name, x, z, before, missing in SPOTS:
    now = sum(1 for cx, cz in centres if math.dist((cx, cz), (x, z)) <= RADIUS)
    flag = '+' if now > before else ('=' if now == before else '-')
    print(f'  {num} {name}: {before} → {now} {flag}{" (누락으로 적힌 자리)" if missing else ""}')
    if now < before:
        bad.append(f'{num} {name} 의 횡단보도가 {before} → {now} 로 줄었다')
    if missing and now > before:
        gained.append(num)
print(f'누락으로 적힌 10곳 가운데 늘어난 자리 {len(gained)}곳: {", ".join(gained) or "없음"}')
if len(gained) < GAINED_FLOOR:
    bad.append(f'누락으로 적힌 자리 가운데 {len(gained)}곳만 늘었다(하한 {GAINED_FLOOR})')

# 2. 새로 들어온 줄마다 거짓 양성 가드
roads = [Polygon(face[0], face[1:]) for face in whole['floor']['road']]
road_index = STRtree(roads)
old_index = STRtree([polys[i] for i in old_rows])
counts = {'거리': 0, '성분': 0, '접근': 0, '면적': 0, '축': 0, '찻길': 0, '겹침': 0, '줄무늬': 0}
for i in new_rows:
    row, poly = rows[i], polys[i]
    approaches = row.get('approaches') or []
    if len(approaches) != 2 or any(p.get('status') != 'joined' for p in approaches):
        counts['접근'] += 1
        continue
    if max(p['distance'] for p in approaches) > 2.5:
        counts['거리'] += 1
    if len({p.get('walkComponent') for p in approaches}) != 2:
        counts['성분'] += 1
    a, b = (Point(p['end']) for p in approaches)
    if not 4 <= poly.area <= 800:
        counts['면적'] += 1
    if not 2.5 <= a.distance(b) <= 70:
        counts['축'] += 1
    on_road = sum(poly.intersection(roads[j]).area for j in road_index.query(poly))
    if on_road < poly.area * .6:
        counts['찻길'] += 1
    same = sum(poly.intersection(old_index.geometries.take(j)).area for j in old_index.query(poly))
    if same > poly.area * .25:
        counts['겹침'] += 1
    if len(row.get('stripes') or []) < 2:
        counts['줄무늬'] += 1
print('새 줄의 가드 위반: ' + ', '.join(f'{k} {v}' for k, v in counts.items()))
for key, text in (('접근', '두 끝이 보행면에 닿지 않는다'), ('거리', '연석까지 2.5m 를 넘는다'),
                  ('성분', '두 끝이 같은 보행면 성분이다'), ('면적', '면적이 4~800㎡ 밖이다'),
                  ('축', '축 길이가 2.5~70m 밖이다'), ('찻길', '찻길 면과 60% 아래로만 겹친다'),
                  ('겹침', '기존 B3 횡단보도와 25% 넘게 겹친다'), ('줄무늬', '줄무늬가 2개 미만이다')):
    if counts[key]:
        bad.append(f'새 횡단보도 {counts[key]}개가 {text}')

# 3. 탈락 기록은 남아 있어야 한다(무엇을 왜 뺐는지 볼 수 있어야 한다)
audit = whole.get('crossingAudit') or []
status = {}
for row in audit:
    status[row.get('status')] = status.get(row.get('status'), 0) + 1
print('탈락 기록: ' + ', '.join(f'{k} {v:,}' for k, v in sorted(status.items())))
if not audit:
    bad.append('crossingAudit 가 비었다')
if status.get('unconfirmed', 0) >= 1674:
    bad.append(f'아직 확인 못 한 후보가 {status.get("unconfirmed", 0):,}개다(고치기 전 1,674)')

print('\n'.join(f'FAIL {line}' for line in bad) or 'CROSSINGS-OK')
sys.exit(1 if bad else 0)
