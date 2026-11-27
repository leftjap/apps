"""s1-deck-mask 통과 검사: 상판 아래 도색이 가려졌는지 다시 구운 자료에서 직접 센다."""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT / 'tools/v2'))

import numpy as np
import shapely as s
from shapely.geometry import LineString, Polygon
from shapely.strtree import STRtree

from area import area_window, read_area, read_asset

DECK_KINDS = ('도로교', '고가차도')
# 2026-11-27 계획 세우기가 커밋 832d4ac9 의 구운 자료에서 직접 잰 값이다(㎡·m).
BASE = {
    'deck_faces': 233, 'deck_area': 602508.15,
    'shown_in': 20459.692, 'shown_out': 85830.576,
    'a-paint-1': {'in': 3663.346, 'out': 28662.036},
    'a-paint-2': {'in': 15095.694, 'out': 39854.753},
    'rp-white-fine': {'in': 14986.436, 'out': 35757.601},
    'rp-white-stops': {'in': 109.168, 'out': 4097.127},
    'rp-zones-yellow': {'in': 103.484, 'out': 4722.302},
    'rp-zones-white': {'in': 1116.917, 'out': 6649.298},
    'rp-symbols': {'in': 480.341, 'out': 5942.212},
    'lines_rows': 19850, 'lines_length': 857080.973, 'lines_in': 173127.324,
    'crossing_rows': 2565, 'crossings_in': 49,
}
# 선 종류별 (행 수, 길이m). s1-safety-border·s1-uturn·s1-fill-lanes 가 넣은 선이 그대로 있다는 증거다.
# 그 두 일감의 검사(border.py·uturn.py)는 도색 면적을 못 박아 두어 이 일감과 어긋나므로 대신 여기서 본다.
KINDS = {'501': (3195, 179001.4), '502': (466, 4961.3), '503': (4085, 296401.6), '504': (251, 15520.4),
         '505': (2191, 166589.3), '506': (2097, 39150.6), '515': (5130, 117566.3), '525': (780, 22463.9),
         '530': (1314, 9447.6), '531': (340, 5945.4), '599': (1, 33.1)}
WIDTH_RULE_ROWS = 213  # origin == 'width-rule'
SHOWN = ('a-paint-1', 'rp-white-fine', 'rp-white-stops', 'rp-zones-yellow', 'rp-zones-white', 'rp-symbols')
MIN_DROP = 1200      # 아래 도색이 실제로 가려졌다는 증거(후보 규칙의 12,030m 를 폭 0.1m 로만 잡은 하한)
MAX_DROP = 9000      # 상판 자신의 도색까지 지우지 않았다는 증거(상판 안 보이는 도색은 모두 20,460㎡)
OUT_TOLERANCE = .005  # 상판 밖 도색은 그대로여야 한다(선을 통째로 버리지 않고 상판에서만 잘랐다는 증거)


def polygons(geometry):
    return [part for part in s.get_parts(geometry) if part.geom_type == 'Polygon' and part.area]


def faces(rows):
    for shell, *holes in rows:
        polygon = Polygon(shell, holes)
        yield from polygons(polygon if polygon.is_valid else s.make_valid(polygon))


def split_area(geometries, parts):
    """상판 조각들과 겹치는 면적과 나머지 면적(조각은 서로 겹치지 않는다)."""
    geometries = list(geometries)
    whole = float(np.sum(s.area(np.asarray(geometries, dtype=object)))) if geometries else 0.0
    if not geometries:
        return 0.0, 0.0
    tree = STRtree(geometries)
    part_idx, geom_idx = tree.query(parts, predicate='intersects')
    inside = float(np.sum(s.area(s.intersection(parts[part_idx], tree.geometries[geom_idx]))))
    return inside, whole - inside


def main():
    area = read_area(Path('mapo-all'))
    outline = area_window(area)
    data = read_asset(area, '-a')
    paint = read_asset(area, '-road-paint')

    decks = [geom for row in data['decks'] if row['kind'] in DECK_KINDS
             for face in faces(row['faces']) for geom in polygons(face.intersection(outline))]
    mask = s.union_all(decks)
    parts = np.asarray(polygons(mask), dtype=object)

    groups = {f'a-paint-{row["color"]}': list(faces(row['faces'])) for row in data['paint']}
    groups['rp-white-fine'] = list(faces(paint['white']['fine']))
    groups['rp-white-stops'] = list(faces(paint['white']['stops']))
    groups['rp-zones-yellow'] = [g for row in paint['zones'] if row['yellow'] for g in faces(row['stripes'])]
    groups['rp-zones-white'] = [g for row in paint['zones'] if not row['yellow'] for g in faces(row['stripes'])]
    groups['rp-symbols'] = [g for row in paint['symbols'] for g in faces(row['faces'])]

    stats = {'deck_faces': len(decks), 'deck_area': round(mask.area, 3)}
    for name, geometries in sorted(groups.items()):
        inside, outside = split_area(geometries, parts)
        stats[name] = {'faces': len(geometries), 'in': round(inside, 3), 'out': round(outside, 3)}

    kinds = {}
    for row in data['lines']:
        count, metres = kinds.get(str(row.get('kind')), (0, 0.0))
        metres += sum(LineString(path).length for path in row['paths'] if len(path) >= 2)
        kinds[str(row.get('kind'))] = (count + 1, metres)
    stats['line_kinds'] = {kind: [count, round(metres, 1)] for kind, (count, metres) in sorted(kinds.items())}
    stats['width_rule_rows'] = sum(1 for row in data['lines'] if row.get('origin') == 'width-rule')

    paths = [LineString(path) for row in data['lines'] for path in row['paths'] if len(path) >= 2]
    tree = STRtree(paths)
    part_idx, geom_idx = tree.query(parts, predicate='intersects')
    masks = parts[part_idx]
    cut = s.intersection(masks, tree.geometries[geom_idx])
    stats['lines'] = {
        'rows': len(data['lines']),
        'length': round(float(np.sum(s.length(np.asarray(paths, dtype=object)))), 3),
        'in': round(float(np.sum(s.length(s.difference(cut, s.boundary(masks))))), 3),
    }
    crossings = [(row['id'], geom) for row in data['crossings'] for geom in faces(row['faces'])]
    ids, geometries = zip(*crossings)
    tree = STRtree(list(geometries))
    part_idx, geom_idx = tree.query(parts, predicate='intersects')
    touched = {ids[i] for i, clip in zip(geom_idx, s.intersection(parts[part_idx], tree.geometries[geom_idx]))
              if clip.area > 1e-6}
    stats['crossings'] = {'rows': len(data['crossings']), 'in': len(touched)}

    shown_in = sum(stats[name]['in'] for name in SHOWN)
    shown_out = sum(stats[name]['out'] for name in SHOWN)
    bad = []
    print(f'상판(도로교·고가차도) {stats["deck_faces"]}면 {stats["deck_area"]:,.0f}㎡')
    for name in sorted(groups):
        row = stats[name]
        before = BASE.get(name)
        mark = '' if before is None else f' (전 안 {before["in"]:,.0f} 밖 {before["out"]:,.0f})'
        print(f'  {name}: {row["faces"]:,}면, 상판 안 {row["in"]:,.0f}㎡ 밖 {row["out"]:,.0f}㎡{mark}')
    print(f'보이는 도색: 상판 안 {shown_in:,.0f}㎡ (전 {BASE["shown_in"]:,.0f}), '
          f'밖 {shown_out:,.0f}㎡ (전 {BASE["shown_out"]:,.0f})')
    print(f'노면선 {stats["lines"]["rows"]:,}행 {stats["lines"]["length"]:,.0f}m, 상판 안 {stats["lines"]["in"]:,.0f}m')
    print(f'횡단보도 {stats["crossings"]["rows"]:,}행, 상판에 닿는 것 {stats["crossings"]["in"]}')

    if stats['deck_faces'] != BASE['deck_faces']:
        bad.append(f'상판이 {stats["deck_faces"]}면이다(전 {BASE["deck_faces"]}면. 상판 자체를 바꾸는 일감이 아니다)')
    if abs(stats['deck_area'] - BASE['deck_area']) > BASE['deck_area'] * .005:
        bad.append(f'상판 면적이 {stats["deck_area"]:,.0f}㎡ 다(전 {BASE["deck_area"]:,.0f}㎡, 허용 0.5%)')

    drop = BASE['shown_in'] - shown_in
    print(f'상판 안에서 지운 보이는 도색 {drop:,.0f}㎡ (하한 {MIN_DROP:,}, 상한 {MAX_DROP:,})')
    if drop < MIN_DROP:
        bad.append(f'상판 안 보이는 도색이 {drop:,.0f}㎡ 만 줄었다(하한 {MIN_DROP:,}㎡. 아래 도색이 가려지지 않았다)')
    if drop > MAX_DROP:
        bad.append(f'상판 안 보이는 도색이 {drop:,.0f}㎡ 줄었다(상한 {MAX_DROP:,}㎡. 상판 자신의 도색까지 지웠다)')
    if abs(shown_out - BASE['shown_out']) > BASE['shown_out'] * OUT_TOLERANCE:
        bad.append(f'상판 밖 보이는 도색이 {shown_out:,.0f}㎡ 다(전 {BASE["shown_out"]:,.0f}㎡, 허용 0.5%. '
                   '선을 상판에서만 자르지 않고 통째로 버렸다)')
    white_drop = BASE['a-paint-2']['in'] - stats['a-paint-2']['in']
    print(f'상판 안에서 지운 흰 원본 도색 {white_drop:,.0f}㎡ (하한 800)')
    if white_drop < 800:
        bad.append(f'A 자료의 흰 도색(색 2)이 상판 안에서 {white_drop:,.0f}㎡ 만 줄었다(하한 800㎡. '
                   '흰 선 세부는 이 면에서 나오므로 굽기에서 가려야 한다)')

    lines = stats['lines']
    if lines['rows'] != BASE['lines_rows']:
        bad.append(f'노면선이 {lines["rows"]:,}행이다(전 {BASE["lines_rows"]:,}행. `lines` 는 고치지 않는다)')
    for key, value, before in (('length', lines['length'], BASE['lines_length']),
                               ('in', lines['in'], BASE['lines_in'])):
        if abs(value - before) > before * .001:
            bad.append(f'노면선 {key} 가 {value:,.0f} 다(전 {before:,.0f}, 허용 0.1%. `lines` 는 고치지 않는다)')
    missing = [kind for kind in KINDS if kind not in stats['line_kinds']]
    for kind in missing:
        bad.append(f'선 종류 {kind} 가 `lines` 에서 사라졌다')
    for kind, (count, metres) in sorted(stats['line_kinds'].items()):
        before = KINDS.get(kind)
        if before is None:
            print(f'  선 {kind}: {count:,}행 {metres:,.0f}m (전에 없던 종류다)')
            continue
        print(f'  선 {kind}: {count:,}행 {metres:,.0f}m (전 {before[0]:,}행 {before[1]:,.0f}m)')
        if count != before[0]:
            bad.append(f'선 종류 {kind} 가 {count:,}행이다(전 {before[0]:,}행. `lines` 는 고치지 않는다)')
        if abs(metres - before[1]) > before[1] * .001:
            bad.append(f'선 종류 {kind} 길이가 {metres:,.0f}m 다(전 {before[1]:,.0f}m, 허용 0.1%)')
    if stats['width_rule_rows'] != WIDTH_RULE_ROWS:
        bad.append(f'폭 규칙으로 넣은 선이 {stats["width_rule_rows"]:,}행이다(전 {WIDTH_RULE_ROWS:,}행)')
    if stats['crossings']['rows'] != BASE['crossing_rows'] or stats['crossings']['in'] != BASE['crossings_in']:
        bad.append(f'횡단보도가 {stats["crossings"]["rows"]:,}행·상판 안 {stats["crossings"]["in"]} 이다'
                   f'(전 {BASE["crossing_rows"]:,}행·{BASE["crossings_in"]}. 이 일감은 횡단보도를 건드리지 않는다)')

    print('MASK-STATS', json.dumps(stats, ensure_ascii=False))
    print('\n'.join(f'FAIL {line}' for line in bad) or 'MASK-OK 상판 아래 도색이 가려지고 밖은 그대로다')
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()
