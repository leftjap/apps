"""Bake a surveyed area's building volumes and ground decoration."""
from collections import Counter, defaultdict
import json
import re
import sys

from shapely import union_all

from hapjeong_hd import AREA, WINDOW, asset, rings, survey_faces
from hapjeong_hd_a import surface
from survey_building_colors import apply_colors, read_tiles

OMIT = {'무벽건물', '가건물'}


def connected_building_faces():
    """Join equal-height pieces that share a measured edge on two source sheets."""
    from shapely import STRtree

    rows = [(face, props) for face, props in survey_faces('B0010000', include_sheet=True) if face.area > 0]
    sheet_edges = {row['도엽코드']: face.boundary.buffer(.01) for face, row in survey_faces('H0010000')
                   if face.area > 0}
    tree = STRtree([face for face, _ in rows])
    owner = list(range(len(rows)))

    def root(i):
        while owner[i] != i:
            i = owner[i]
        return i

    key_fields = ('명칭', '종류', '용도', '층수', '도로명', '건물본번', '건물부번')
    for i, (face, row) in enumerate(rows):
        own_edge = sheet_edges.get(row['sheet'])
        if own_edge is None or not own_edge.intersects(face):
            continue
        for j in tree.query(face, predicate='intersects'):
            if j <= i:
                continue
            other, partner = rows[j]
            if row['sheet'] == partner['sheet'] or partner['sheet'] not in sheet_edges:
                continue
            if any(row[key] != partner[key] for key in key_fields):
                continue
            shared = face.boundary.intersection(other.boundary)
            if shared.length < .1:
                continue
            shared_at_sheet = shared.intersection(own_edge).intersection(sheet_edges[partner['sheet']])
            if shared_at_sheet.length >= shared.length - .01:
                owner[root(j)] = root(i)

    groups = defaultdict(list)
    for i, pair in enumerate(rows):
        groups[root(i)].append(pair)
    for group in groups.values():
        row = group[0][1]
        if len(group) == 1:
            yield group[0]
        else:
            yield union_all([face for face, _ in group]), {
                **row, 'sourceIds': [part['UFID'] for _, part in group],
            }


def bake(floor):
    pavement = surface(floor['floor']['walk'])
    road = surface(floor['floor']['road']).difference(pavement)
    reserved = road.union(pavement)
    # Leave a micron at the cut so round-off cannot put slivers back on the road.
    cut = reserved.buffer(1e-6)
    buildings = []
    eligible = []
    omitted = Counter()
    shapes = connected_building_faces() if AREA.get('coverage') else survey_faces('B0010000')
    for face, row in shapes:
        if face.area == 0:
            continue
        if row['종류'] in OMIT:
            omitted[row['종류']] += 1
            continue
        eligible.append(face)
        footprint = rings(face.difference(cut))
        if not footprint:
            omitted['covered by roads or pavement'] += 1
            continue
        floors = int(row['층수'])
        if floors <= 0:
            raise ValueError(f"Missing floor count for {row['UFID']}")
        name = row['명칭'] or row['주기']
        if row['명칭'] and re.fullmatch(r'\d+동', row['주기']):
            name += ' ' + row['주기']
        merged = {'sourceIds': row['sourceIds']} if 'sourceIds' in row else {}
        buildings.append(dict(id=row['UFID'], name=name, floors=floors, height=floors * 3, faces=footprint, **merged))

    original = union_all(eligible)
    parking = union_all([face for face, _ in survey_faces('C0430000')])
    return dict(window=list(WINDOW.bounds),
                **({'ground': rings(WINDOW)} if AREA.get('excludeWindows') or AREA.get('coverage') else {}),
                buildings=buildings,
                parking=rings(parking.difference(cut.union(original))),
                omitted=dict(omitted), clipped=dict(road=original.intersection(road).area,
                                                    walk=original.intersection(pavement).area))


if __name__ == '__main__':
    floor = json.loads(asset(AREA, '-a').read_text())
    out = bake(floor)
    requested, tiles = read_tiles(sys.argv[1:])
    cars = asset(AREA, '-cars')
    road = json.loads(cars.read_text()) if cars.exists() else {}
    if AREA.get('coverage'):
        # Frontage depends on the original lane geometry, even before the car graph is baked.
        from hapjeong_cars import bundles, load_links

        links = load_links()
        road = {'links': links, 'bundles': bundles(links)}
    colors = apply_colors(out['buildings'], road, tiles)
    path = asset(AREA, '-buildings')
    path.write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')) + '\n')
    print(f"{len(out['buildings'])} buildings; clipped {out['clipped']}")
    print(json.dumps(dict(tiles=[len(tiles), requested], **colors)))
