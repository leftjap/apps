"""Bake a surveyed area's building volumes and ground decoration."""
from collections import Counter
import json
import re
import sys

from shapely import union_all

from hapjeong_hd import AREA, WINDOW, asset, rings, survey_faces
from hapjeong_hd_a import surface
from survey_building_colors import apply_colors, read_tiles

OMIT = {'무벽건물', '가건물'}


def bake(floor):
    pavement = surface(floor['floor']['walk'])
    road = surface(floor['floor']['road']).difference(pavement)
    reserved = road.union(pavement)
    # Leave a micron at the cut so round-off cannot put slivers back on the road.
    cut = reserved.buffer(1e-6)
    buildings = []
    eligible = []
    omitted = Counter()
    for face, row in survey_faces('B0010000'):
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
        buildings.append(dict(id=row['UFID'], name=name, floors=floors, height=floors * 3, faces=footprint))

    original = union_all(eligible)
    parking = union_all([face for face, _ in survey_faces('C0430000')])
    return dict(window=list(WINDOW.bounds),
                **({'ground': rings(WINDOW)} if AREA.get('excludeWindows') else {}),
                buildings=buildings,
                parking=rings(parking.difference(cut.union(original))),
                omitted=dict(omitted), clipped=dict(road=original.intersection(road).area,
                                                    walk=original.intersection(pavement).area))


if __name__ == '__main__':
    floor = json.loads(asset(AREA, '-a').read_text())
    out = bake(floor)
    requested, tiles = read_tiles(sys.argv[1:])
    cars = asset(AREA, '-cars')
    colors = apply_colors(out['buildings'], json.loads(cars.read_text()) if cars.exists() else {}, tiles)
    path = asset(AREA, '-buildings')
    path.write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')) + '\n')
    print(f"{len(out['buildings'])} buildings; clipped {out['clipped']}")
    print(json.dumps(dict(tiles=[len(tiles), requested], **colors)))
