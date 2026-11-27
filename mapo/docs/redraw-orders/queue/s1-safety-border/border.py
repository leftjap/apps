# s1-safety-border 자료 검사: 안전지대 테두리(B2 531)가 선으로 그려지고 다른 노면 자료는 그대로다.
import gzip
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
DATA = ROOT / 'public/data/v2'
WORK = ROOT / 'tmp/loop/s1-safety-border'
bad = []

# 계획 세우기가 지금 자료에서 직접 센 값이다
LINES_TOTAL = 19980
KINDS_BEFORE = {'503': 4085, '515': 5130, '501': 3195, '505': 2191, '506': 2097,
                '530': 1314, '525': 780, '504': 251}
# 531 의 type: (색, 줄 수, 총 길이m, 점선인가)
BORDER = {'111': (1, 220, 2716.0, False), '211': (2, 119, 3186.0, False), '212': (2, 1, 43.0, True)}
ZONES = {'B2 531': 46, 'B2 501': 40, 'A005': 661}
SYMBOLS = {'5371': 2854, '5372': 670, '5373': 474, '5374': 10, '5379': 2, '5381': 174,
           '5382': 488, '5383': 20, '5391': 80, '5392': 188, '5431': 101, '5432': 27}
# 색별 노면 도색 면적m². 황색은 +407㎡, 백색은 +484㎡ 가 들어올 자리다(길이×0.15m)
PAINT = {0: (3718.1, 3720.1), 1: (32060.0, 32500.0), 2: (54340.0, 54900.0), 3: (1778.2, 1780.2)}


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

# ① 바닥 자료: 종류·개수는 그대로이고 531 의 ink 가 규격대로 찍혔다
if len(bottom['lines']) != LINES_TOTAL:
    bad.append(f"바닥 자료의 선이 {len(bottom['lines']):,}개다(전 {LINES_TOTAL:,}개)")
if len(bottom['crossings']) != 1629 or len(bottom['bicycles']) != 182:
    bad.append(f"바닥 자료의 횡단보도 {len(bottom['crossings']):,}·자전거 {len(bottom['bicycles']):,}"
               ' 가 전(1,629·182)과 다르다')
border = [row for row in bottom['lines'] if row['kind'] == '531']
print(f'바닥 자료: 선 {len(bottom["lines"]):,}개, 그 가운데 531 안전지대 {len(border)}개')
for type_, (color, count, metres, dashed) in sorted(BORDER.items()):
    rows = [row for row in border if row['type'] == type_]
    length = path_length([path for row in rows for path in row['paths']])
    print(f'  531 type {type_}: {len(rows)}줄, {length:,.0f}m, ink {rows[0]["ink"] if rows else "없음"}')
    if len(rows) != count:
        bad.append(f'531 type {type_} 이 {len(rows)}줄이다(자료에 {count}줄 있다)')
    if not 0.98 * metres <= length <= 1.02 * metres:
        bad.append(f'531 type {type_} 길이 {length:,.0f}m(자료 {metres:,.0f}m)')
    for row in rows:
        ink = row['ink']
        if not ink.get('known'):
            bad.append(f'531 type {type_} 의 ink 가 아직 모르는 종류다: {ink}')
            break
        if ink['color'] != color:
            bad.append(f'531 type {type_} 의 색이 {ink["color"]}다(자료의 색은 {color})')
            break
        if not 0.10 <= ink['width'] <= 0.25:
            bad.append(f'531 type {type_} 의 폭이 {ink["width"]}m 다(0.10~0.25m)')
            break
        if dashed and not ink['dash']:
            bad.append(f'531 type {type_} 은 점선인데 dash 가 {ink["dash"]}다')
            break
        if not dashed and ink['dash']:
            bad.append(f'531 type {type_} 은 실선인데 dash 가 {ink["dash"]}다')
            break

# ② A 보기: 531 이 들어오고 다른 종류의 줄 수는 그대로다
counts = {}
for row in asset['lines']:
    counts[row['kind']] = counts.get(row['kind'], 0) + 1
print('A 보기 선 종류:', ', '.join(f'{k} {v:,}' for k, v in sorted(counts.items())))
for kind, before in sorted(KINDS_BEFORE.items()):
    if counts.get(kind) != before:
        bad.append(f'{kind} 이 {counts.get(kind, 0):,}줄이다(전 {before:,}줄)')
if counts.get('531') != 340:
    bad.append(f'A 보기에 531 이 {counts.get("531", 0)}줄이다(들어와야 할 수 340줄)')
extra = sorted(set(counts) - set(KINDS_BEFORE) - {'531'})
if extra:
    bad.append(f'요청에 없는 종류가 들어왔다: {", ".join(extra)}')
in_asset = path_length([path for row in asset['lines'] if row['kind'] == '531' for path in row['paths']])
print(f'A 보기 531 길이 {in_asset:,.0f}m')
if not 5800 <= in_asset <= 6100:
    bad.append(f'A 보기 531 길이 {in_asset:,.0f}m(5,800~6,100m)')

# ③ 노면 도색 면적: 테두리가 한 번만, 규격 폭으로 들어왔다
for row in sorted(asset['paint'], key=lambda row: row['color']):
    area = paint_area(row['faces'])
    print(f'  도색 색 {row["color"]}: 면 {len(row["faces"]):,}개, {area:,.1f}㎡')
    low, high = PAINT[row['color']]
    if not low <= area <= high:
        bad.append(f'도색 색 {row["color"]} 면적 {area:,.1f}㎡({low:,.0f}~{high:,.0f}㎡)')
if {row['color'] for row in asset['paint']} != set(PAINT):
    bad.append('도색 색 묶음이 전(0·1·2·3)과 다르다')

# ④ 노면 세부(빗금·화살표)는 건드리지 않았다
stats_path = WORK / 'stats.json'
if not stats_path.is_file():
    bad.append(f'없음: {stats_path.relative_to(ROOT)}(survey_road_paint.py --stats 로 만든다)')
else:
    stats = json.loads(stats_path.read_text())
    print(f'노면 세부: 빗금 {stats.get("zones")}, 황색 {stats.get("yellow")}, '
          f'열린 531 {stats.get("open531")}, 열린 중앙 조각 {stats.get("openCenterPieces")}')
    if stats.get('zones') != ZONES:
        bad.append(f'빗금 면 수가 {stats.get("zones")} 다(전 {ZONES})')
    if stats.get('symbols') != SYMBOLS:
        bad.append('화살표 수가 전과 다르다')
    if stats.get('yellow') != 250:
        bad.append(f'황색 빗금이 {stats.get("yellow")}개다(전 250개)')
    if (stats.get('open531'), stats.get('openCenterPieces')) != (73, 694):
        bad.append('열린 테두리·중앙 조각 수가 전(73·694)과 다르다')

print('\n'.join(f'FAIL {line}' for line in bad) or 'BORDER-OK')
raise SystemExit(1 if bad else 0)
