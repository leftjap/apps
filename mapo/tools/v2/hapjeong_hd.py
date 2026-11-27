"""Bake the Hapjeong HD source comparison without moving or clipping its surveyed lines."""
from collections import Counter, defaultdict, deque
from itertools import pairwise
import json
import math

from shapely import affinity, make_valid
from shapely.geometry import LineString, MultiLineString, Point, Polygon, box
from shapely.ops import unary_union

from aerial_paint import style
from aerial_rules import PITCH, STRIPE_WIDTH
from area import MAPO, area_window, asset, load_area, write_asset
from bake_aerial_ground import Frame, parts
from land import even_odd
from shp import dbf, shapes
from tm import ORIGIN, tm_to_ll

AREA = load_area()
RAW = MAPO / AREA['sources']['hd']
SHEETS = MAPO / AREA['sources']['sheets']
ASSET = asset(AREA)
WINDOW = area_window(AREA)
FRAME = Frame(*AREA['frame']['origin'], 0)
VIEWS = AREA['views']['display']


# NGII December 2020 manual, B2 tables 9.51 and 9.52 (printed pp. 106–107).
# Last column selects the existing app paint width and dash family, not a new source.
KINDS = {
    '501': ('중앙선', 1), '503': ('차선', 6), '504': ('버스전용차선', 17),
    '505': ('길가장자리구역선', 7), '506': ('진로변경제한선', 8),
    '515': ('주정차금지선', 10), '525': ('유도선', 12), '530': ('정지선', 4),
    '531': ('안전지대', 1), '535': ('자전거도로', 6), '599': ('기타선', 6),
}
TYPES = {
    str(color * 100 + 10 + form): (name + (' 실선' if form == 1 else ' 점선'), color, form)
    for color, name in ((1, '황색 단선'), (2, '백색 단선'), (3, '청색 단선'))
    for form in (1, 2)
}
def features(layer):
    if AREA['sources'].get('hdSharedExtents'):
        layer = layer.split('-', 1)[0]
    return json.loads((RAW / f'{layer}.json').read_text())['features']


def project(point):
    return FRAME.project(point[:2])


def paths(feature):
    geom = feature['geometry']
    lines = geom['coordinates'] if geom['type'] == 'MultiLineString' else [geom['coordinates']]
    return [[project(point) for point in line] for line in lines]


def face_rings(feature):
    geom = feature['geometry']
    faces = geom['coordinates'] if geom['type'] == 'MultiPolygon' else [geom['coordinates']]
    return [[[project(point) for point in ring] for ring in face] for face in faces]


def offset_zebra(face, heading):
    # Local +y is the travel axis, so a stripe follows traffic and repeats across it.
    rotation = heading - math.pi / 2
    origin = face.centroid.coords[0]
    aligned = affinity.rotate(face, -rotation, origin=origin, use_radians=True)
    lo, bottom, hi, top = aligned.bounds
    count = max(1, math.floor((hi - lo - STRIPE_WIDTH) / PITCH) + 1)
    first = (lo + hi - (count - 1) * PITCH) / 2
    for n in range(count):
        x = first + n * PITCH
        stripe = aligned.intersection(box(x - STRIPE_WIDTH/2, bottom, x + STRIPE_WIDTH/2, top))
        yield affinity.rotate(stripe, rotation, origin=origin, use_radians=True)


def link_heading(face, lines):
    center = face.centroid
    segments = [(LineString([a, b]), a, b) for line in lines for a, b in pairwise(line) if a != b]
    if not segments:
        return None, 'empty-link', None
    # Prefer the intersecting original segment closest to the crossing centroid.
    # Some split faces reference a neighbouring lane beside the face, use its nearest tangent.
    intersecting = [row for row in segments if row[0].intersection(face).length > 1e-8]
    candidates = intersecting or segments
    segment, a, b = min(candidates, key=lambda row: (row[0].distance(face), row[0].distance(center)))
    method = 'crosses-face' if intersecting else 'nearest-tangent'
    return math.atan2(b[1] - a[1], b[0] - a[0]), method, segment.distance(face)


def rings(geom):
    return [[list(ring.coords) for ring in (p.exterior, *p.interiors)]
            for p in parts(geom, 'Polygon') if p.area > 0]


def survey_faces(code, *, include_sheet=False):
    """Yield clipped original faces in sheet and record order."""
    for sheet in sorted(SHEETS.iterdir()):
        stem = sheet / f'N1A_{code}'
        if not stem.with_suffix('.shp').is_file():
            continue
        _, rows = dbf(stem.with_suffix('.dbf'))
        for (kind, raw_rings), row in zip(shapes(stem.with_suffix('.shp')), rows, strict=True):
            if kind != 5 or not raw_rings:
                continue
            projected = [[project(tm_to_ll(east,north)[::-1]) for east,north in ring] for ring in raw_rings]
            if not Polygon(projected[0]).envelope.intersects(WINDOW):
                continue
            face = even_odd(projected)
            if face is not None:
                yield face.intersection(WINDOW), ({**row, 'sheet': sheet.name} if include_sheet else row)


def survey_islands():
    paved = unary_union([
        make_valid(Polygon(shell, holes))
        for row in features('a4') if row['properties']['subtype'] == '3'
        for shell, *holes in face_rings(row)
    ])
    curb = unary_union([
        LineString(line) for row in features('b2') if row['properties']['kind'] == '505'
        for line in paths(row)
    ])
    crossings = unary_union([face for face, _ in survey_faces('A0043325')])
    traffic = unary_union([
        LineString(line).buffer(1.245 if row['properties']['linktype'] == '4' else 1)
        for row in features('a2-expanded') if row['properties']['linktype'] in ('1', '4', '6')
        for line in paths(row)
    ])
    # A005 also contains painted safety zones. Require a paved refuge
    # at a road edge with a crossing approach and room outside vehicle bodies.
    return [(face, row) for face, row in survey_faces('A0053326')
            if face.area > 0 and face.intersection(paved).area >= face.area / 2
            and face.distance(curb) <= 1 and face.distance(crossings) <= 2
            and face.intersection(traffic).area < 1e-6]


def survey_floor():
    roads = [face for face, _ in survey_faces('A0010000')]
    walks = [face for face, _ in survey_faces('A0033320')]
    junctions = [face for face, _ in survey_faces('A0080000')]
    anchor = Point(AREA['junctionAt'])
    central, = [face for face in junctions if face.covers(anchor)]
    return {'road': unary_union(roads + junctions), 'walk': unary_union(walks),
            'island': unary_union([face for face, _ in survey_islands()]), 'central': central}


def marking_style(kind, type_):
    if kind not in KINDS or type_ not in TYPES:
        return {'color': 0, 'width': style(6, 1)['w'], 'dash': 0, 'known': False}
    name, app_kind = KINDS[kind]
    form_name, color, form = TYPES[type_]
    app = style(app_kind, form)
    return {'name': name, 'typeName': form_name, 'color': color, 'width': app['w'],
            'dash': (app['dashL'] or style(6,2)['dashL']) if form == 2 else 0, 'known': True}


def connectivity(core, expanded, nodes, central):
    junctions = [r['properties'] for r in core if r['properties']['linktype'] == '1']
    entry_nodes = {r[key] for r in junctions for key in ('fromnodeid','tonodeid')}
    lanes = {'4', '6'}
    bbox_entries = sum(r['properties']['linktype'] in lanes and r['properties']['tonodeid'] in entry_nodes for r in core)
    node_index = {row['properties']['id']: row['geometry']['coordinates'] for row in nodes}
    links = {}
    arrows = defaultdict(list)
    boundary = central.boundary

    def distance(coords):
        point = Point(project(coords))
        return -point.distance(boundary) if central.covers(point) else point.distance(central)

    for row in expanded:
        p = row['properties']
        lines = row['geometry']['coordinates']
        start = node_index.get(p['fromnodeid'], lines[0][0])
        end = node_index.get(p['tonodeid'], lines[-1][-1])
        edge = {
            **p, 'start_m': distance(start), 'end_m': distance(end), 'end_at': end[:2],
            'touches': MultiLineString(paths(row)).intersects(central),
        }
        links[p['id']] = edge
        if p['fromnodeid'] and p['tonodeid']:
            arrows[p['fromnodeid']].append(edge)
    for rows in arrows.values():
        rows.sort(key=lambda p: p['id'])
    ledger = []
    for row in core:
        entry = links[row['properties']['id']]
        # Seed geometrically before reading successors, so terminal and stale node IDs remain candidates.
        if entry['linktype'] not in lanes or not entry['touches'] or not entry['end_m'] <= 0 or entry['end_m'] >= entry['start_m']:
            continue
        node = entry['tonodeid']
        todo = deque([(node, [], False)])
        visited = set()
        found = None
        while todo and found is None:
            node_id, history, inside = todo.popleft()
            if (node_id, inside) in visited:
                continue
            visited.add((node_id, inside))
            for target in arrows[node_id]:
                if target['id'] == entry['id']:
                    continue
                role = target['linktype']
                if role in lanes and target['end_m'] > target['start_m'] and (inside or target['end_m'] > 0):
                    found = [*history, target['id']]
                    break
                if role in lanes | {'1'} and target['touches']:
                    todo.append((target['tonodeid'], [*history, target['id']], inside or role == '1'))
        ledger.append({'id': entry['id'], 'type': entry['linktype'], 'lane': entry['laneno'], 'atNode': node,
                       'at': entry['end_at'], 'startDistance': entry['start_m'], 'endDistance': entry['end_m'],
                       'route': found or [], 'startNodeOutgoing': len(arrows[node])})
    return {'entries': sorted(ledger, key=lambda row: row['id']), 'expandedLinkCount': len(expanded),
            'expandedNodeCount': len(nodes), 'bboxReferenceCount': bbox_entries}


def floor_faces(faces):
    if not AREA.get('floor', {}).get('clipToWindow'):
        return faces
    return rings(unary_union([make_valid(Polygon(outer, holes)) for outer, *holes in faces]).intersection(WINDOW))


def floor_paths(lines):
    if not AREA.get('floor', {}).get('clipToWindow'):
        return lines
    return [list(section.coords) for line in lines
            for section in parts(LineString(line).intersection(WINDOW), 'LineString')]


def bake():
    core = features('a2')
    expanded = features('a2-expanded')
    core_index = {row['properties']['id']: paths(row) for row in core}
    expanded_index = {row['properties']['id']: paths(row) for row in expanded}
    lines, crossings, bicycles = [], [], []
    for row in features('b2'):
        p = row['properties']
        ink_paths = floor_paths(paths(row))
        if not ink_paths:
            continue
        lines.append({'id': p['id'], 'kind': p['kind'], 'type': p['type'], 'paths': ink_paths,
                      'ink': marking_style(p['kind'], p['type'])})

    for row in features('b3'):
        p = row['properties']
        if p['kind'] not in ('533', '5321', '534'):
            continue
        faces = floor_faces(face_rings(row))
        if not faces:
            continue
        if p['kind'] == '534':
            bicycles.append({'id': p['id'], 'faces': faces})
            continue
        stage, related = 'unresolved', None
        if p['linkid'] in core_index:
            stage, related = 'core', core_index[p['linkid']]
        elif p['linkid'] in expanded_index:
            stage, related = 'expanded', expanded_index[p['linkid']]
        stripes = []
        directions = []
        for shell, *holes in faces:
            face = make_valid(Polygon(shell, holes))
            for area in parts(face, 'Polygon'):
                heading, basis, distance = link_heading(area, related) if related else (None, 'no-reference', None)
                directions.append({'method': basis, 'angle': heading, 'distance': distance})
                if heading is not None:
                    stripes.extend(r for stripe in offset_zebra(area, heading) for r in rings(stripe))
        crossings.append({'id': p['id'], 'kind': p['kind'], 'linkId': p['linkid'], 'lookup': stage,
                          'directions': directions, 'faces': faces, 'stripes': stripes})

    floor = survey_floor()
    a4 = [{'id': row['properties']['id'], 'faces': faces} for row in features('a4')
          if (faces := floor_faces(face_rings(row)))]
    result = {
        'views': VIEWS,
        'floor': {'road': rings(floor['road']), 'walk': rings(floor['walk']), 'islands': rings(floor['island']), 'a4': a4},
        'lines': lines, 'crossings': crossings, 'bicycles': bicycles,
    }
    if 'outline' not in AREA:
        result.update(
            links=[{'id': row['properties']['id'], 'type': row['properties']['linktype'],
                    'paths': core_index[row['properties']['id']]} for row in core],
            routing=connectivity(core, expanded, features('a1-expanded'), floor['central']),
        )
    result['centralJunction'] = rings(floor['central'])
    return result


if __name__ == '__main__':
    result = bake()
    print(write_asset(AREA, '', result))
    print('lines', len(result['lines']), 'crossings', Counter(row['lookup'] for row in result['crossings']),
          'bike', len(result['bicycles']))
    if 'routing' in result:
        entries = result['routing']['entries']
        print('routing', len(entries), 'reachable', sum(bool(row['route']) for row in entries),
              'hops', Counter(len(row['route'])-1 for row in entries if row['route']))
