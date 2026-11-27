"""Bake optional safety-zone and B3 paint for a connected survey map."""
from collections import Counter, defaultdict
from itertools import pairwise
import argparse
import json
import math
from pathlib import Path

from shapely import STRtree, affinity, make_valid, set_precision, union_all
from shapely.geometry import LineString, Point, Polygon, box
from shapely.ops import linemerge, polygonize_full

from aerial_paint import footprint, paint_definitions
from area import read_asset, write_asset

# NGII December 2020 manual, B3 table 9.56. Values are the app's arrow shapes.
ARROWS = {
    '5371': 7, '5372': 5, '5373': 6, '5374': 13, '5379': 14,
    '5381': 8, '5382': 9, '5383': 15, '5391': 10, '5392': 11,
    '5431': 7, '5432': 7,
}
CROSSINGS = {'5321', '533', '534'}


def closed_zones(lines, tolerance):
    """Bridge mutually nearest dangling endpoints, while retaining both surveyed sides."""
    if not lines:
        return [], []
    network = union_all(lines)
    if network.geom_type == 'MultiLineString':
        network = linemerge(network)
    segments = ([network] if network.geom_type == 'LineString' else list(network.geoms))
    endpoints = Counter(tuple(p) for line in segments for p in (line.coords[0], line.coords[-1]))
    points = [Point(p) for p, degree in endpoints.items() if degree == 1]
    tree = STRtree(points)
    nearest = {}
    for i, p in enumerate(points):
        close = sorted((p.distance(points[j]), j) for j in tree.query(p, predicate='dwithin', distance=tolerance)
                       if j != i)
        if close and (len(close) == 1 or close[1][0] - close[0][0] > .04):
            nearest[i] = close[0][1]
    bridges = []
    for i, j in nearest.items():
        if i >= j or nearest.get(j) != i:
            continue
        bridge = LineString([points[i], points[j]])
        if not bridge.crosses(network) and not bridge.overlaps(network):
            bridges.append(bridge)
    polygons, cuts, loose, invalid = polygonize_full([union_all([network, *bridges])])
    remainder = union_all([cuts, loose, invalid])
    if remainder.is_empty:
        return list(polygons.geoms), []
    return list(polygons.geoms), ([remainder] if remainder.geom_type == 'LineString' else list(remainder.geoms))


def long_axis(face):
    a, b = max(pairwise(face.minimum_rotated_rectangle.exterior.coords), key=lambda p: math.dist(*p))
    return math.atan2(b[1]-a[1], b[0]-a[0])


def hatch(face):
    center = face.centroid
    angle = long_axis(face) + math.pi / 4
    local = affinity.rotate(face, -angle, center, use_radians=True)
    west, north, east, south = local.bounds
    for i in range(math.floor(west / .95), math.ceil(east / .95)):
        stripe = local.intersection(box(i*.95, north, i*.95+.22, south))
        if stripe.area:
            yield affinity.rotate(stripe, angle, center, use_radians=True).intersection(face)


def surface_arrow(kind, envelope, lane):
    if kind not in ARROWS:
        return None
    d = lane.project(envelope.centroid)
    a = lane.interpolate(max(0, d-2))
    b = lane.interpolate(min(lane.length, d+2))
    if a.equals(b):
        return None
    heading = math.atan2(b.y-a.y, b.x-a.x)
    center = envelope.centroid
    local = affinity.rotate(envelope, -heading, center, use_radians=True)
    west, north, east, south = local.bounds
    pieces = [Polygon([(u, -v) for u,v in zip(part[::2],part[1::2])])
              for part in paint_definitions()['arrows'][str(ARROWS[kind])]]
    glyph = union_all(pieces)
    if kind in {'5431', '5432'}:
        glyph = affinity.rotate(glyph, -28 if kind == '5431' else 28, origin=(0, 0))
    x0, y0, x1, y1 = glyph.bounds
    sx, sy = (east-west)*.9/(x1-x0), (south-north)*.85/(y1-y0)
    glyph = affinity.scale(glyph, sx, sy, origin=(0, 0))
    glyph = affinity.translate(glyph, (west+east-(x0+x1)*sx)/2, (north+south-(y0+y1)*sy)/2)
    return affinity.rotate(glyph, heading, center, use_radians=True).intersection(envelope)


def split_white_paint(white, markings):
    stops = union_all([
        mark for row in markings if row['kind']=='530' and row['ink']['color']==2
        for path in row['paths']
        for mark in footprint(path,row['ink']['width'],0,row['ink']['dash'])
    ]).intersection(white)
    return white.difference(stops), stops


def bake_details():
    from hapjeong_hd import AREA, WINDOW, features, face_rings, parts, paths, rings, survey_faces
    from hapjeong_hd_a import surface

    data = read_asset(AREA, '-a')
    floor = data['floor']
    solid = surface([*floor['walk'], *floor['islands'],
                     *(face for row in floor['a4'] for face in row['faces']),
                     *(face for row in [*data['crossings'], *data['bicycles']] for face in row['faces'])])
    road = surface(floor['road']).difference(solid)
    lanes = {}
    for row in features('a2-expanded'):
        p = row['properties']
        if p['linktype'] in {'1', '4', '6'}:
            lanes[p['id']] = [(LineString(path), 1.18 if p['linktype']=='4' else .9)
                              for path in paths(row) if len(path) >= 2]
    lane_geoms = [line for rows in lanes.values() for line, _ in rows]
    body = union_all([line.buffer(width, cap_style='flat') for rows in lanes.values() for line, width in rows])

    measured = defaultdict(list)
    for row in features('b2'):
        p = row['properties']
        if p['kind'] not in {'501','531'}:
            continue
        for path in paths(row):
            if len(path) >= 2:
                measured[(p['kind'], p['type'].startswith('1'))].extend(
                    parts(LineString(path).intersection(WINDOW),'LineString'))
    explicit = []
    unresolved = []
    for yellow in (True, False):
        closed, opened = closed_zones(measured['531',yellow], .25)
        explicit.extend((face,yellow,'B2 531') for face in closed)
        unresolved.extend(list(line.coords) for line in opened if line.length >= 1)
    center, open_centers = closed_zones(measured['501', True], .7)
    # Opposing yellow borders sometimes encode a median without a 531 code.
    # Ordinary double yellow lines are too narrow to be a painted island.
    explicit.extend((face, True, 'B2 501') for face in center if 2*face.area/face.length >= 1.15)
    yellow_border = union_all([*measured['501',True], *measured['531',True]]).buffer(.55)
    zones = []
    occupied = Polygon()
    rejected = Counter()
    for face, color, method in [*explicit, *((f, None, 'A005') for f,p in survey_faces('A0053326')
                                            if p['구조'] == '평면(도색)')]:
        for piece in parts(face, 'Polygon'):
            if piece.area < 3 or piece.area > 3000:
                rejected[method] += 1
                continue
            cover = piece.intersection(road)
            safe = cover.difference(body)
            if safe.area < .8*piece.area:
                rejected[method] += 1
                continue
            if color is None:
                # Central yellow paint is identifiable from the measured border.
                color = piece.boundary.intersection(yellow_border).length > piece.length*.25
            for polygon in parts(safe.difference(occupied), 'Polygon'):
                if polygon.area < 3:
                    continue
                snapped = set_precision(polygon,.01)
                for part in parts(snapped,'Polygon'):
                    edge = rings(part)
                    stripes = [r for stripe in hatch(part) for r in rings(set_precision(stripe,.01))]
                    if stripes:
                        zones.append({'method':method, 'yellow':color, 'faces':edge, 'stripes':stripes})
                        occupied = occupied.union(part)

    shapes = defaultdict(list)
    counts = Counter()
    skipped = Counter()
    lanes_index = STRtree(lane_geoms)
    accepted = defaultdict(list)
    for row in features('b3'):
        p = row['properties']
        kind = p['kind']
        if kind in CROSSINGS:
            continue
        for face in face_rings(row):
            for envelope in parts(make_valid(Polygon(face[0], face[1:])), 'Polygon'):
                if envelope.area < .2 or not WINDOW.intersects(envelope):
                    continue
                if kind not in ARROWS:
                    skipped[kind, 'unsupported'] += 1
                    continue
                center = envelope.centroid
                nearby = [line for line, _ in lanes.get(p.get('linkid'), ()) if line.distance(center) < 3]
                if not nearby:
                    nearby = [lane_geoms[i] for i in lanes_index.query(center,predicate='dwithin',distance=1.4)]
                    nearby.sort(key=lambda g:g.distance(center))
                    if len(nearby) >= 2 and nearby[1].distance(center)-nearby[0].distance(center) < .25:
                        skipped[kind, 'ambiguous lane'] += 1
                        continue
                if not nearby:
                    skipped[kind, 'no lane'] += 1
                    continue
                used = min(nearby, key=lambda line:line.distance(center))
                glyph = surface_arrow(kind,envelope,used)
                if glyph is None or glyph.is_empty:
                    skipped[kind, 'degenerate'] += 1
                    continue
                clipped = glyph.intersection(road)
                if clipped.area < .65*glyph.area:
                    skipped[kind, 'outside paint surface'] += 1
                    continue
                cell = (math.floor(center.x/5),math.floor(center.y/5))
                x,z = cell
                previous = [other for i in (-1,0,1) for j in (-1,0,1) for other in accepted[x+i,z+j]]
                if any(envelope.intersection(other).area >= .75*min(other.area,envelope.area) for other in previous):
                    skipped[kind, 'overlapping source envelope'] += 1
                    continue
                accepted[cell].append(envelope)
                shapes[kind].extend(rings(set_precision(clipped,.01)))
                counts[kind] += 1

    unresolved = [list(line.coords) for color in (True, False)
                  for line in closed_zones(measured['531',color],.25)[1] if line.length >= 1]
    white = surface([face for row in data['paint'] if row['color']==2 for face in row['faces']])
    fine,stops = split_white_paint(white,data['lines'])
    return {'zones':zones, 'symbols':[{'kind':k,'faces':faces} for k,faces in sorted(shapes.items())],
            'white':{'fine':rings(set_precision(fine,.001)), 'stops':rings(set_precision(stops,.001))}}, {
        'area':AREA['id'], 'zones':dict(Counter(z['method'] for z in zones)),
        'yellow':sum(z['yellow'] for z in zones), 'rejected':dict(rejected),
        'open531':len(unresolved), 'open531Paths':unresolved,
        'openCenterPieces':len(open_centers), 'symbols':dict(counts),
        'skippedSymbols':{f'{kind} / {reason}':n for (kind,reason),n in sorted(skipped.items())},
    }


def main():
    from hapjeong_hd import AREA
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--area', required=True, help='Survey area manifest or area id')
    parser.add_argument('--stats', type=Path, help='Optional audit log under tmp/')
    args = parser.parse_args()
    if 'coverage' not in AREA and 'outline' not in AREA:
        parser.error('Road paint is enabled for connected survey maps.')
    data, stats = bake_details()
    print(write_asset(AREA,'-road-paint',data))
    if args.stats:
        args.stats.parent.mkdir(parents=True,exist_ok=True)
        args.stats.write_text(json.dumps(stats,ensure_ascii=False,indent=2)+'\n')


if __name__ == '__main__':
    main()
