# s1-approach 자료 검사: 끝 접속 판정을 고쳐 실제 횡단보도가 더 들어왔고 보행면은 그대로다.
import gzip
import json
import math
import sys
from pathlib import Path

from shapely.geometry import Polygon
from shapely.ops import unary_union
from shapely.strtree import STRtree

ROOT = Path(__file__).resolve().parents[4]
DATA = ROOT / 'public/data/v2'
RADIUS = 90   # 자리마다 이 반지름 안의 횡단보도 면 중심을 센다
KERB = 2.0    # 끝이 보행면을 만났다고 보는 절대 상한(브리프 2번)

# 2026-11-27 계획 세우기가 고치기 전 자료에서 직접 센 기준값이다. 구현이 이 표를 바꿀 수 없다.
# 번호, 이름, x, z, 고치기 전 횡단보도 수
SPOTS = [
    ('01', '합정', -490.85, 253.62, 37),
    ('02', '서교', 224.88, -410.60, 7),
    ('03', '홍대입구', 451.92, -624.28, 12),
    ('04', '동교동삼거리', 670.88, -800.17, 18),
    ('05', '신촌오거리', 1577.05, -402.09, 11),
    ('06', '이대역', 2373.44, -588.25, 16),
    ('07', '공덕오거리', 2826.55, 841.64, 15),
    ('08', '마포역', 2292.69, 1403.37, 5),
    ('09', '대흥역', 2023.83, 400.86, 10),
    ('10', '광흥창역', 1093.03, 444.82, 8),
    ('11', '상수역', 351.88, 417.68, 10),
    ('12', '망원역', -941.33, -730.32, 13),
    ('13', '마포구청역', -1394.21, -1364.79, 5),
    ('14', '월드컵경기장', -2239.32, -1801.84, 9),
    ('15', '디지털미디어시티역', -1614.72, -2665.39, 5),
    ('16', '성산2교', -638.17, -1535.73, 13),
    ('17', '연남', 209.14, -1303.29, 14),
    ('18', '서강대앞', 1772.35, 256.37, 3),
    ('19', '연세대앞', 1582.32, -952.00, 14),
    ('20', '양화대교북단', -1152.68, 317.86, 0),
]
GAIN_SPOTS = {'02', '03', '06', '08', '18', '19'}  # 새 후보가 반경 90m 안에 있는 자리
GAIN_FLOOR = 3
WHOLE_BEFORE, WHOLE_FLOOR, WHOLE_CEIL = 2294, 2420, 2650
SOURCE_BEFORE, SOURCE_FLOOR, SOURCE_CEIL = 665, 790, 1030
UNCONFIRMED_BEFORE, UNCONFIRMED_CEIL = 1018, 820
COVERED_ADMIT_BEFORE, COVERED_ADMIT_FLOOR = 682, 640
LEFTOVER_CEIL = 20
HONGDAE_BEFORE = 497
LANDINGS_BEFORE, WALK_RINGS_BEFORE, ROAD_RINGS_BEFORE = 2636, 2241, 39
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


def reached(end):
    # 보행면을 아예 못 만난 끝은 거절한다. 그 밖의 끝은 절대 거리로만 본다.
    gap = end.get('distance')
    return end.get('status') != 'no-walk-in-outward-range' and gap is not None and gap <= KERB


def admit(row):
    ends = row.get('approaches') or []
    return (len(ends) == 2 and all(reached(end) for end in ends)
            and ends[0].get('walkComponent') != ends[1].get('walkComponent'))


whole = read('mapo-all')
mark = read('hongdae-district')
if whole is None or mark is None:
    print('\n'.join(f'FAIL {line}' for line in bad))
    raise SystemExit(1)

rows = whole['crossings']
new_rows = [i for i, row in enumerate(rows) if row.get('source')]
print(f'전역 횡단보도 {len(rows):,}개 (고치기 전 {WHOLE_BEFORE:,}), 그 가운데 보충 {len(new_rows):,}개 (고치기 전 {SOURCE_BEFORE:,})')
if not WHOLE_FLOOR <= len(rows) <= WHOLE_CEIL:
    bad.append(f'전역 횡단보도 {len(rows):,}개가 {WHOLE_FLOOR:,}~{WHOLE_CEIL:,} 밖이다')
if not SOURCE_FLOOR <= len(new_rows) <= SOURCE_CEIL:
    bad.append(f'보충된 횡단보도 {len(new_rows):,}개가 {SOURCE_FLOOR:,}~{SOURCE_CEIL:,} 밖이다')
if len(mark['crossings']) != HONGDAE_BEFORE:
    bad.append(f'홍대 일대 횡단보도가 {len(mark["crossings"]):,}개다(그대로여야 한다: {HONGDAE_BEFORE:,})')

# 1. 보행면·찻길 면은 그대로여야 한다(받아들이기만 고쳤다는 뜻)
landings = len(whole.get('pedestrianLandings') or {})
walk_rings, road_rings = len(whole['floor']['walk']), len(whole['floor']['road'])
print(f'보행 접근면 {landings:,}개(기준 {LANDINGS_BEFORE:,}), 보행면 고리 {walk_rings:,}개(기준 {WALK_RINGS_BEFORE:,}), '
      f'찻길 고리 {road_rings:,}개(기준 {ROAD_RINGS_BEFORE:,})')
for now, was, name in ((landings, LANDINGS_BEFORE, 'pedestrianLandings'),
                       (walk_rings, WALK_RINGS_BEFORE, "floor['walk'] 고리"),
                       (road_rings, ROAD_RINGS_BEFORE, "floor['road'] 고리")):
    if now != was:
        bad.append(f'{name} 가 {was:,} → {now:,} 로 바뀌었다(보행면·찻길 면은 그대로여야 한다)')

# 2. 자리 20곳: 줄어든 자리가 없고 새 후보가 있던 자리에서 늘어난다
polys = [face_union(row['faces']) for row in rows]
centres = [centre(poly) for poly in polys]
gained = []
for num, name, x, z, before in SPOTS:
    now = sum(1 for cx, cz in centres if math.dist((cx, cz), (x, z)) <= RADIUS)
    flag = '+' if now > before else ('=' if now == before else '-')
    print(f'  {num} {name}: {before} → {now} {flag}{" (새 후보가 있는 자리)" if num in GAIN_SPOTS else ""}')
    if now < before:
        bad.append(f'{num} {name} 의 횡단보도가 {before} → {now} 로 줄었다')
    if num in GAIN_SPOTS and now > before:
        gained.append(num)
print(f'새 후보가 있는 {len(GAIN_SPOTS)}곳 가운데 늘어난 자리 {len(gained)}곳: {", ".join(gained) or "없음"}')
if len(gained) < GAIN_FLOOR:
    bad.append(f'새 후보가 있는 자리 가운데 {len(gained)}곳만 늘었다(하한 {GAIN_FLOOR})')

# 3. 새로 들어온 줄마다 거짓 양성 가드
roads = [Polygon(face[0], face[1:]) for face in whole['floor']['road']]
road_index = STRtree(roads)
old = [polys[i] for i, row in enumerate(rows) if not row.get('source')]
old_index = STRtree(old)


def guards(poly, row):
    """가드를 어긴 까닭만 모아 돌려준다(빈 목록이면 통과)."""
    hurt = []
    ends = row.get('approaches') or []
    if len(ends) != 2 or not all(reached(end) for end in ends):
        hurt.append('접근')
        return hurt
    if ends[0].get('walkComponent') == ends[1].get('walkComponent'):
        hurt.append('성분')
    if not 4 <= poly.area <= 800:
        hurt.append('면적')
    if not 2.5 <= math.dist(ends[0]['end'], ends[1]['end']) <= 70:
        hurt.append('축')
    if sum(poly.intersection(roads[j]).area for j in road_index.query(poly)) < poly.area * .6:
        hurt.append('찻길')
    if sum(poly.intersection(old_index.geometries.take(j)).area for j in old_index.query(poly)) > poly.area * .25:
        hurt.append('겹침')
    return hurt


counts = {}
for i in new_rows:
    for key in guards(polys[i], rows[i]):
        counts[key] = counts.get(key, 0) + 1
    if len(rows[i].get('stripes') or []) < 2:
        counts['줄무늬'] = counts.get('줄무늬', 0) + 1
print('새 줄의 가드 위반: ' + (', '.join(f'{k} {v}' for k, v in sorted(counts.items())) or '없음'))
for key, text in (('접근', '두 끝이 2.0m 안에서 보행면을 만나지 않았다'),
                  ('성분', '두 끝이 같은 보행면 성분이다'), ('면적', '면적이 4~800㎡ 밖이다'),
                  ('축', '축 길이가 2.5~70m 밖이다'), ('찻길', '찻길 면과 60% 아래로만 겹친다'),
                  ('겹침', '기존 B3 횡단보도와 25% 넘게 겹친다'), ('줄무늬', '줄무늬가 2개 미만이다')):
    if counts.get(key):
        bad.append(f'새 횡단보도 {counts[key]}개가 {text}')

# 4. 탈락 기록: 접속 측정이 나빠지지 않았고, 받아들일 수 있는 것이 남아 있지 않다
audit = whole.get('crossingAudit') or []
status = {}
for row in audit:
    status[row.get('status')] = status.get(row.get('status'), 0) + 1
print('탈락 기록: ' + ', '.join(f'{k} {v:,}' for k, v in sorted(status.items())))
if not audit:
    bad.append('crossingAudit 가 비었다')
if status.get('unconfirmed', 0) > UNCONFIRMED_CEIL:
    bad.append(f'아직 확인 못 한 후보가 {status.get("unconfirmed", 0):,}개다(상한 {UNCONFIRMED_CEIL:,}, 고치기 전 {UNCONFIRMED_BEFORE:,})')

covered = [row for row in audit if row.get('status') == 'covered-by-b3']
covered_admit = sum(1 for row in covered if admit(row))
print(f'B3 가 확인한 {len(covered):,}개 가운데 「양끝 {KERB}m 안·성분 다름」 {covered_admit:,}개 (기준 {COVERED_ADMIT_BEFORE:,})')
if covered_admit < COVERED_ADMIT_FLOOR:
    bad.append(f'B3 확인 면의 접속 측정이 {COVERED_ADMIT_BEFORE:,} → {covered_admit:,} 로 나빠졌다(하한 {COVERED_ADMIT_FLOOR:,})')

leftover = []
for row in audit:
    if row.get('status') != 'unconfirmed' or row.get('reason') == 'too-few-stripes':
        continue
    if not admit(row):
        continue
    poly = face_union(row['faces'])
    if not guards(poly, row):
        leftover.append(row.get('reason'))
print(f'받아들일 수 있는데 아직 unconfirmed 로 남은 줄 {len(leftover):,}개 (상한 {LEFTOVER_CEIL})'
      + (f': 까닭 {sorted(set(filter(None, leftover)))}' if leftover else ''))
if len(leftover) > LEFTOVER_CEIL:
    bad.append(f'가드를 다 지나는데 떨어진 줄이 {len(leftover):,}개다(상한 {LEFTOVER_CEIL})')

print('\n'.join(f'FAIL {line}' for line in bad) or 'APPROACH-OK')
sys.exit(1 if bad else 0)
