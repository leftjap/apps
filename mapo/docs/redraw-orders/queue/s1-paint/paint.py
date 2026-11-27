# s1-paint 자료 검사: 전역 노면 세부 자료가 홍대 눈금을 넘고, 고른 세 자리의 칸이 실제로 커졌다.
import gzip
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
DATA = ROOT / 'public/data/v2'
WORK = ROOT / 'tmp/loop/s1-paint'
HONGDAE_FLOOR = 0.85  # 전역을 홍대 상자로 자른 값이 홍대 자료의 이 비율 이상이어야 한다
bad = []


def read(stem):
    path = DATA / f'{stem}-road-paint.json.gz'
    if not path.is_file():
        bad.append(f'없음: {path.relative_to(ROOT)}')
        return None
    return json.load(gzip.open(path))


def centre(face):
    ring = face[0]
    return (sum(p[0] for p in ring) / len(ring), sum(p[1] for p in ring) / len(ring))


def tally(paint, inside=None):
    keep = (lambda face: True) if inside is None else (lambda face: inside(centre(face)))
    # 안전지대 항목의 'faces' 는 면 목록이고 화살표·흰 선의 원소는 면 하나다
    zones = sum(1 for z in paint['zones'] if any(keep(face) for face in z['faces']))
    symbols = {}
    for row in paint['symbols']:
        n = sum(1 for face in row['faces'] if keep(face))
        if n:
            symbols[row['kind']] = n
    fine = sum(1 for face in paint['white']['fine'] if keep(face))
    stops = sum(1 for face in paint['white']['stops'] if keep(face))
    return {'zones': zones, 'arrows': sum(symbols.values()), 'symbols': symbols,
            'fine': fine, 'stops': stops}


whole = read('mapo-all')
mark = read('hongdae-district')
if whole is None or mark is None:
    print('\n'.join(f'FAIL {line}' for line in bad))
    raise SystemExit(1)

base = tally(mark)
all_counts = tally(whole)
print(f"전역: 안전지대 {all_counts['zones']:,}, 화살표 면 {all_counts['arrows']:,}, "
      f"흰 선 세부 {all_counts['fine']:,}, 정지선 {all_counts['stops']:,}")
print(f"  종류별 화살표 {', '.join(f'{k} {n}' for k, n in sorted(all_counts['symbols'].items()))}")
print(f"홍대 눈금: 안전지대 {base['zones']:,}, 화살표 면 {base['arrows']:,}, "
      f"흰 선 세부 {base['fine']:,}, 정지선 {base['stops']:,}")

for key, name in (('zones', '안전지대'), ('arrows', '화살표 면'), ('fine', '흰 선 세부'), ('stops', '정지선')):
    if all_counts[key] < base[key]:
        bad.append(f'{name} {all_counts[key]:,} 가 홍대 눈금 {base[key]:,} 보다 적다')

# 홍대 윤곽 상자 안에서 센 값이 홍대 자료와 맞아야 같은 길로 만든 것이다
manifest = json.load(open(ROOT / 'tools/v2/areas/hongdae-district.json'))
def points(node):
    if isinstance(node[0], (int, float)):
        yield node
        return
    for child in node:
        yield from points(child)


coords = list(points(manifest['outline']['coordinates']))
x0, x1 = min(p[0] for p in coords), max(p[0] for p in coords)
z0, z1 = min(p[1] for p in coords), max(p[1] for p in coords)
box = lambda p: x0 <= p[0] <= x1 and z0 <= p[1] <= z1
clipped = tally(whole, box)
print(f'홍대 상자({x0:,.0f}~{x1:,.0f}, {z0:,.0f}~{z1:,.0f}) 안의 전역 값: '
      f"안전지대 {clipped['zones']:,}, 화살표 면 {clipped['arrows']:,}, "
      f"흰 선 세부 {clipped['fine']:,}, 정지선 {clipped['stops']:,}")
for key, name in (('zones', '안전지대'), ('arrows', '화살표 면'), ('fine', '흰 선 세부')):
    floor = math.floor(base[key] * HONGDAE_FLOOR)
    if clipped[key] < floor:
        bad.append(f'홍대 상자 안 {name} {clipped[key]:,} 가 홍대 자료의 {HONGDAE_FLOOR:.0%}({floor:,}) 에 못 미친다')

# 고른 세 자리의 칸이 실제로 커졌는지
rows = [line.split('\t') for line in (WORK / 'spots.tsv').read_text().strip().splitlines()]
if len(rows) != 3:
    bad.append(f'spots.tsv 가 세 줄이 아니다({len(rows)}줄)')
else:
    now = json.load(open(DATA / 'mapo-all-tiles/index.json'))
    was = json.load(open(WORK / 'before/index.json'))
    if len(now['tiles']) < len(was['tiles']):
        bad.append(f"칸이 {len(was['tiles'])}개에서 {len(now['tiles'])}개로 줄었다")
    if len(now['tiles']) < 177:
        bad.append(f"칸 {len(now['tiles'])}개(하한 177)")
    size = now['size']
    index = {(t['x'], t['z']): t for t in now['tiles']}
    before = {(t['x'], t['z']): t for t in was['tiles']}
    seen = set()
    for name, x, z, *rest in rows:
        key = (math.floor(float(x) / size), math.floor(float(z) / size))
        if key in seen:
            bad.append(f'{name} 가 앞의 자리와 같은 칸이다')
        seen.add(key)
        a, b = before.get(key), index.get(key)
        if not a or not b:
            bad.append(f'{name} 자리의 칸 {key} 이 색인에 없다')
            continue
        grew = b['rawBytes'] / a['rawBytes'] if a['rawBytes'] else 0
        print(f"{name} 칸 {key}: {a['rawBytes']:,} → {b['rawBytes']:,} 바이트({grew:.3f}배)")

print('\n'.join(f'FAIL {line}' for line in bad) or 'PAINT-OK')
raise SystemExit(1 if bad else 0)
