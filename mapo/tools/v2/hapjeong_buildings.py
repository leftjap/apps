"""Bake a surveyed area's building volumes and ground decoration."""
from collections import Counter, defaultdict
import json
import math
import re
import sys

from shapely import STRtree, snap, union_all
from shapely.geometry import box

from hapjeong_hd import AREA, WINDOW, asset, rings, survey_faces
from hapjeong_hd_a import surface
from area import read_asset, write_asset
from survey_building_colors import apply_colors, read_tiles

OMIT = {'무벽건물', '가건물'}


def connected_building_faces():
    """Join equal-height pieces that share a measured edge on two source sheets."""
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
    tolerance = .005 if 'outline' in AREA else 0
    for i, (face, row) in enumerate(rows):
        own_edge = sheet_edges.get(row['sheet'])
        if own_edge is None or not own_edge.intersects(face):
            continue
        neighbours = (tree.query(face, predicate='dwithin', distance=tolerance) if tolerance
                      else tree.query(face, predicate='intersects'))
        for j in neighbours:
            if j <= i:
                continue
            other, partner = rows[j]
            if row['sheet'] == partner['sheet'] or partner['sheet'] not in sheet_edges:
                continue
            if any(row[key] != partner[key] for key in key_fields):
                continue
            shared = face.boundary.intersection(other.boundary)
            if tolerance and shared.length < .1:
                shared = face.boundary.intersection(other.boundary.buffer(tolerance))
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
            faces = [face for face, _ in group]
            merged = union_all(faces)
            if tolerance and merged.geom_type != 'Polygon':
                # Sheet conversion can leave matching edge endpoints millimetres apart.
                merged = faces[0]
                for face in faces[1:]:
                    merged = merged.union(snap(face, merged, tolerance))
                merged = merged.intersection(WINDOW)
            yield merged, {
                **row, 'sourceIds': [part['UFID'] for _, part in group],
            }


def pavement_cutter(reserved):
    """Cut local building faces without scanning the whole district's road network."""
    cell = 256
    x0, z0, x1, z1 = reserved.bounds
    tiles = [reserved.intersection(box(x-.01, z-.01, x+cell+.01, z+cell+.01))
             for x in range(math.floor(x0/cell)*cell, math.ceil(x1/cell)*cell, cell)
             for z in range(math.floor(z0/cell)*cell, math.ceil(z1/cell)*cell, cell)]
    tiles = [tile for tile in tiles if not tile.is_empty]
    index = STRtree(tiles)

    def clip(face):
        local = index.query(face)
        if len(local) == 1:
            return face.difference(tiles[local[0]])
        return face.difference(union_all([tiles[i] for i in sorted(local)])) if len(local) else face
    return clip


def bake(floor):
    wide = 'outline' in AREA
    pavement = surface(floor['floor']['walk'])
    road = surface(floor['floor']['road'] + [face for row in floor.get('decks', ()) for face in row['faces']])
    road = road.difference(pavement)
    reserved = road.union(pavement)
    # Leave a micron at the cut so round-off cannot put slivers back on the road.
    cut = reserved.buffer(1e-6)
    clip = pavement_cutter(cut) if wide else lambda face: face.difference(cut)
    buildings = []
    eligible = []
    omitted = Counter()
    shapes = connected_building_faces() if AREA.get('coverage') or wide else survey_faces('B0010000')
    for face, row in shapes:
        if face.area == 0:
            continue
        if row['종류'] in OMIT:
            omitted[row['종류']] += 1
            continue
        eligible.append(face)
        footprint = rings(clip(face))
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
                **({'ground': rings(WINDOW)} if AREA.get('excludeWindows') or AREA.get('coverage') or wide else {}),
                buildings=buildings,
                parking=rings(parking.difference(cut.union(original))),
                omitted=dict(omitted), clipped=dict(road=original.intersection(road).area,
                                                    walk=original.intersection(pavement).area))


if __name__ == '__main__':
    floor = read_asset(AREA, '-a')
    out = bake(floor)
    requested, tiles = read_tiles(sys.argv[1:])
    cars = asset(AREA, '-cars')
    road = json.loads(cars.read_text()) if cars.exists() else {}
    if 'outline' in AREA:
        from shapely.geometry import LineString
        from hapjeong_hd import features, paths

        # Only original, paired A2 lanes are needed to identify storefront façades.
        lanes = [{'kind': p['linktype'], 'points': line}
                 for row in features('a2-expanded') if (p := row['properties'])['linktype'] in ('4', '6')
                 and (p['l_linkid'] or p['r_linkid']) for line in paths(row)
                 if len(line) >= 2 and WINDOW.intersects(LineString(line))]
        road = {'links': lanes, 'bundles': [{'lanes': list(range(len(lanes)))}]} if len(lanes) >= 2 else {}
    elif AREA.get('coverage'):
        # Frontage depends on the original lane geometry, even before the car graph is baked.
        from hapjeong_cars import bundles, load_links

        links = load_links()
        road = {'links': links, 'bundles': bundles(links)}
    colors = apply_colors(out['buildings'], road, tiles)
    print(write_asset(AREA, '-buildings', out))
    print(f"{len(out['buildings'])} buildings; clipped {out['clipped']}")
    print(json.dumps(dict(tiles=[len(tiles), requested], **colors)))
