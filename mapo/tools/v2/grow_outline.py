"""Grow an area outline until its edge cuts no surveyed junction face, crossing face or stop line."""
import argparse
import json
from pathlib import Path

import numpy as np
from shapely import crosses, envelope, intersects, make_valid, prepare, union_all
from shapely.geometry import LineString, Polygon, shape

from area import DEFAULT_AREA
from hapjeong_hd import AREA, SHEETS, face_rings, features, paths, project
from land import even_odd
from shp import dbf, shapes
from tm import tm_to_ll

STOP_HALF_WIDTH = .25  # metres each side of a stop line, so the whole painted line fits inside
CLEARANCE = .01  # metres of slack around a kept feature, so rounding cannot leave its edge on the outline
REACH = 100  # metres beyond the outline: no feature further out can ever be cut by the edge
LIMIT = 20  # rounds, a backstop in case taking whole features never settles


def area_path():
    parser = argparse.ArgumentParser(add_help=False, allow_abbrev=False)
    parser.add_argument('--area', type=Path, default=DEFAULT_AREA)
    path = parser.parse_known_args()[0].area
    if not path.is_file() and path.parent == Path('.') and not path.suffix:
        path = DEFAULT_AREA.with_name(path.name + '.json')
    return path


def sheet_faces(code):
    """Original survey faces, unclipped, so the outline's own cuts stay visible."""
    for sheet in sorted(SHEETS.iterdir()):
        stem = sheet / f'N1A_{code}'
        if not stem.with_suffix('.shp').is_file():
            continue
        _, rows = dbf(stem.with_suffix('.dbf'))
        for (kind, raw_rings), row in zip(shapes(stem.with_suffix('.shp')), rows, strict=True):
            if kind != 5 or not raw_rings:
                continue
            projected = [[project(tm_to_ll(east, north)[::-1]) for east, north in ring]
                         for ring in raw_rings]
            face = even_odd(projected)
            if face is not None and not face.is_empty:
                yield face


def candidates(reach):
    """Faces and lines near the outline, grouped by what the report calls them."""
    groups = {
        '수치지형도 교차로 면': list(sheet_faces('A0080000')),
        '수치지형도 횡단보도 면': list(sheet_faces('A0043325')),
        '정밀도로지도 횡단보도 면': [make_valid(Polygon(shell, holes))
                            for row in features('b3')
                            if row['properties']['kind'] in ('533', '5321')
                            for shell, *holes in face_rings(row)],
        '정밀도로지도 정지선': [LineString(line) for row in features('b2')
                        if row['properties']['kind'] == '530'
                        for line in paths(row) if len(line) >= 2],
    }
    prepare(reach)
    near = {}
    for name, group in groups.items():
        kept = np.array([g for g in group if not g.is_empty], dtype=object)
        near[name] = kept[intersects(reach, envelope(kept))] if len(kept) else kept
        print(f'{name} 후보 {len(near[name])}개 (원본 {len(group)}개)', flush=True)
    return near


def grow(outline, groups):
    """Union in every whole feature the edge cuts, until the edge cuts nothing."""
    outline = Polygon(outline.exterior)
    rounds = []
    while True:
        edge = outline.boundary
        prepare(edge)
        added, taken = [], {}
        for name, group in groups.items():
            cut = list(group[crosses(edge, group)]) if len(group) else []
            if not cut:
                continue
            taken[name] = len(cut)
            added += [g.buffer(STOP_HALF_WIDTH + CLEARANCE, cap_style='square')
                      if g.geom_type == 'LineString' else g.buffer(CLEARANCE) for g in cut]
        if not added:
            return outline, rounds
        if len(rounds) >= LIMIT:
            raise ValueError(f'{LIMIT}회전을 넘겨도 잘리는 것이 남는다: {taken}')
        grown = union_all([outline, *added])
        if grown.geom_type != 'Polygon':
            raise ValueError(f'Growing broke the outline into {grown.geom_type}')
        grown = Polygon(grown.exterior)
        rounds.append((taken, grown.area - outline.area))
        print(f'{len(rounds)}회전: {taken} → {grown.area - outline.area:,.0f}㎡ 늘어남', flush=True)
        outline = grown


def main():
    path = area_path()
    before = shape(AREA['outline'])
    groups = candidates(before.buffer(REACH))
    after, rounds = grow(before, groups)
    area = json.loads(path.read_text())
    area['outline'] = {'type': 'Polygon',
                       'coordinates': [[list(point) for point in after.exterior.coords]]}
    area['window'] = list(after.bounds)
    path.write_text(json.dumps(area, ensure_ascii=False, indent=2) + '\n')
    print(f'{path}: {before.area:,.0f}㎡ → {after.area:,.0f}㎡ '
          f'(+{after.area - before.area:,.0f}㎡), 고리 {[len(ring) for ring in area["outline"]["coordinates"]]}')


if __name__ == '__main__':
    main()
