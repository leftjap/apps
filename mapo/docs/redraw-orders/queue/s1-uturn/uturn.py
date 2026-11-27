# s1-uturn 자료 검사: 유턴구역선(B2 502)과 기타선(599)이 선으로 그려지고 다른 노면 자료는 그대로다.
import gzip
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
DATA = ROOT / 'public/data/v2'
WORK = ROOT / 'tmp/loop/s1-uturn'
bad = []

# 계획 세우기가 s1-safety-border 가 끝난 자료에서 직접 센 값이다
LINES_TOTAL = 19980
KINDS_BEFORE = {'503': 4085, '515': 5130, '501': 3195, '505': 2191, '506': 2097,
                '530': 1314, '525': 780, '504': 251, '531': 340}
# 새로 들어올 종류: (줄 수, 총 길이m)
NEW = {'502': (466, 4961.0), '599': (1, 33.0)}
ZONES = {'B2 531': 46, 'B2 501': 40, 'A005': 661}
SYMBOLS = {'5371': 2852, '5372': 670, '5373': 474, '5374': 10, '5379': 2, '5381': 174,
           '5382': 488, '5383': 20, '5391': 80, '5392': 188, '5431': 101, '5432': 27}
# 색별 노면 도색 면적m². 백색은 점선 도색 +296㎡ 가 들어올 자리다(계획 세우기가 같은 footprint 로 쟀다)
PAINT = {0: (3717.6, 3720.6), 1: (32323.9, 32326.9), 2: (54780.0, 55020.0), 3: (1777.7, 1780.7)}


def path_length(paths):
    return sum(math.dist(p, q) for path in paths for p, q in zip(path, path[1:]))


def shoelace(ring):
    return abs(sum(x0 * y1 - x1 * y0 for (x0, y0), (x1, y1) in zip(ring, ring[1:]))) / 2


def paint_area(faces):
    return sum(shoelace(poly[0]) - sum(shoelace(hole) for hole in poly[1:]) for poly in faces)


def read(stem):
    path = DATA / f'{stem}.json.gz'
    if not path.is_file():
        bad.append(f'없음: {path.relative_to(ROOT)}')
        return None
    return json.load(gzip.open(path))


bottom = read('mapo-all')
asset = read('mapo-all-a')
if bottom is None or asset is None:
    print('\n'.join(f'FAIL {line}' for line in bad))
    raise SystemExit(1)

# ① 바닥 자료: 개수는 그대로이고 502 의 ink 가 규격대로 찍혔다
if len(bottom['lines']) != LINES_TOTAL:
    bad.append(f"바닥 자료의 선이 {len(bottom['lines']):,}개다(전 {LINES_TOTAL:,}개)")
if len(bottom['crossings']) != 1629 or len(bottom['bicycles']) != 182:
    bad.append(f"바닥 자료의 횡단보도 {len(bottom['crossings']):,}·자전거 {len(bottom['bicycles']):,}"
               ' 가 전(1,629·182)과 다르다')
for kind, (count, metres) in sorted(NEW.items()):
    rows = [row for row in bottom['lines'] if row['kind'] == kind]
    length = path_length([path for row in rows for path in row['paths']])
    ink = rows[0]['ink'] if rows else None
    print(f'바닥 자료 {kind}: {len(rows)}줄, {length:,.0f}m, ink {ink}')
    if len(rows) != count:
        bad.append(f'{kind} 이 {len(rows)}줄이다(자료에 {count}줄 있다)')
    if not 0.98 * metres <= length <= 1.02 * metres:
        bad.append(f'{kind} 길이 {length:,.0f}m(자료 {metres:,.0f}m)')
    for row in rows:
        ink = row['ink']
        if not ink.get('known'):
            bad.append(f'{kind} 의 ink 가 아직 모르는 종류다: {ink}')
            break
        if ink['color'] != 2:
            bad.append(f'{kind} 의 색이 {ink["color"]}다(자료의 type 212 는 백색 2)')
            break
        if not 0.10 <= ink['width'] <= 0.25:
            bad.append(f'{kind} 의 폭이 {ink["width"]}m 다(0.10~0.25m)')
            break
        if not ink['dash']:
            bad.append(f'{kind} 은 점선인데 dash 가 {ink["dash"]}다')
            break
        if row['type'] != '212':
            bad.append(f'{kind} 에 type {row["type"]} 이 섞였다(전부 212 여야 한다)')
            break

# ② A 보기: 502·599 가 들어오고 다른 종류의 줄 수는 그대로다
counts = {}
for row in asset['lines']:
    counts[row['kind']] = counts.get(row['kind'], 0) + 1
print('A 보기 선 종류:', ', '.join(f'{k} {v:,}' for k, v in sorted(counts.items())))
for kind, before in sorted(KINDS_BEFORE.items()):
    if counts.get(kind) != before:
        bad.append(f'{kind} 이 {counts.get(kind, 0):,}줄이다(전 {before:,}줄)')
for kind, (count, metres) in sorted(NEW.items()):
    if counts.get(kind) != count:
        bad.append(f'A 보기에 {kind} 이 {counts.get(kind, 0)}줄이다(들어와야 할 수 {count}줄)')
    length = path_length([path for row in asset['lines'] if row['kind'] == kind for path in row['paths']])
    print(f'A 보기 {kind} 길이 {length:,.0f}m')
    if not 0.98 * metres <= length <= 1.02 * metres:
        bad.append(f'A 보기 {kind} 길이 {length:,.0f}m(자료 {metres:,.0f}m)')
extra = sorted(set(counts) - set(KINDS_BEFORE) - set(NEW))
if extra:
    bad.append(f'요청에 없는 종류가 들어왔다: {", ".join(extra)}')

# ③ 노면 도색 면적: 백색만 점선만큼 늘고 황색은 그대로다
for row in sorted(asset['paint'], key=lambda row: row['color']):
    area = paint_area(row['faces'])
    print(f'  도색 색 {row["color"]}: 면 {len(row["faces"]):,}개, {area:,.1f}㎡')
    low, high = PAINT[row['color']]
    if not low <= area <= high:
        bad.append(f'도색 색 {row["color"]} 면적 {area:,.1f}㎡({low:,.0f}~{high:,.0f}㎡)')
if {row['color'] for row in asset['paint']} != set(PAINT):
    bad.append('도색 색 묶음이 전(0·1·2·3)과 다르다')

# ④ 빗금·화살표는 건드리지 않았다(502 는 빗금 판정에 들어가지 않는다)
stats_path = WORK / 'stats-check.json'  # check.sh 가 직접 다시 만든 수치(구현자가 쓴 파일은 읽지 않는다)
if not stats_path.is_file():
    bad.append(f'없음: {stats_path.relative_to(ROOT)}(check.sh 가 survey_road_paint.py --stats 로 만든다)')
else:
    stats = json.loads(stats_path.read_text())
    print(f'노면 세부: 빗금 {stats.get("zones")}, 황색 {stats.get("yellow")}, '
          f'열린 531 {stats.get("open531")}, 열린 중앙 조각 {stats.get("openCenterPieces")}')
    if stats.get('zones') != ZONES:
        bad.append(f'빗금 면 수가 {stats.get("zones")} 다(전 {ZONES})')
    got = stats.get('symbols') or {}
    for kind, before in SYMBOLS.items():
        now = got.get(kind, 0)
        if now != before:
            print(f'  화살표 {kind}: {before} → {now}')
        if abs(now - before) > 4:
            bad.append(f'화살표 {kind} 가 {before} → {now} 다(±4 까지만 받아들인다)')
    if set(got) - set(SYMBOLS):
        bad.append(f'새 화살표 종류가 생겼다: {sorted(set(got) - set(SYMBOLS))}')
    if stats.get('yellow') != 250:
        bad.append(f'황색 빗금이 {stats.get("yellow")}개다(전 250개)')
    if (stats.get('open531'), stats.get('openCenterPieces')) != (73, 694):
        bad.append('열린 테두리·중앙 조각 수가 전(73·694)과 다르다')

print('\n'.join(f'FAIL {line}' for line in bad) or 'UTURN-OK')
raise SystemExit(1 if bad else 0)
