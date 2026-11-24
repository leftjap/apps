"""Bake exact A2 lane geometry and directed topology for the Hapjeong A floor."""
from collections import defaultdict
from itertools import combinations, pairwise
import json
import math
import sys

from shapely import get_parts
from shapely.geometry import LineString, Point
from shapely.ops import nearest_points

from hapjeong_hd import AREA, ASSET, WINDOW, asset, features, paths, project, rings, survey_faces
from hapjeong_hd_a import surface
from survey_signal_sites import junction_layout, split_at_signal_stops, survey_signal_sites

OUTPUT = asset(AREA, '-cars')
C1_PEDESTRIAN = '11'  # NGII HD map production manual (2020), section 9.3.10.
SEAM_COS = .5
STOP_TIP_TOLERANCE = .05


def dot_forward(a, b):
    end = Point(a.coords[-1])
    behind = a.interpolate(max(0, a.length - 2))
    ahead = b.interpolate(min(2, b.length))
    length = behind.distance(end) * end.distance(ahead)
    return ((end.x - behind.x) * (ahead.x - end.x) +
            (end.y - behind.y) * (ahead.y - end.y)) / length if length else -1


def load_links():
    result = []
    for feature in sorted(features('a2-vehicle-audit'), key=lambda row: row['properties']['id']):
        props = feature['properties']
        kind = props['linktype']
        if kind not in {'1', '4', '6'}:
            continue
        coordinates = feature['geometry']['coordinates']
        raw = coordinates[0] if feature['geometry']['type'] == 'MultiLineString' else coordinates
        line = LineString(paths(feature)[0])
        parts = [part for part in get_parts(line.intersection(WINDOW)) if part.geom_type == 'LineString' and part.length]
        if not parts:
            continue
        assert len(parts) == 1, (props['id'], 'disjoint in the map window')
        points = list(parts[0].coords)
        if line.project(Point(points[0])) > line.project(Point(points[-1])):
            points.reverse()
        points = [tuple(round(x, 6) for x in p) for p in points]
        result.append(dict(
            id=props['id'], kind=kind, rank=int(props['roadrank']), seq=props['laneno'], date=props['updatedate'] or '',
            left=props['l_linkid'], right=props['r_linkid'], from_id=props['fromnodeid'],
            to=props['tonodeid'], raw=raw, line=line, points=points, len=LineString(points).length,
            next=[], stop=None,
        ))
    return result


def connect(rows, nodes, allow_connector_seams=False):
    starts = defaultdict(list)
    for j, row in enumerate(rows):
        if WINDOW.covers(Point(row['line'].coords[0])):
            starts[tuple(row['raw'][0])].append(j)
    seams = []
    connector_kinds = {}
    if allow_connector_seams:
        # A type-1 connector inherits the class of its verified, unanimous
        # ingress. Keep reserved routes distinct from ordinary lanes.
        for row in rows:
            if row['kind'] != '1':
                continue
            before = [r for r in rows if r['to'] == row['from_id'] and r['raw'][-1] == row['raw'][0]
                      and dot_forward(r['line'], row['line']) >= SEAM_COS]
            kinds = {r['kind'] for r in before}
            if len(kinds) == 1 and '1' not in kinds:
                connector_kinds[row['id']] = kinds.pop()
    for a in rows:
        if not WINDOW.covers(Point(a['line'].coords[-1])):
            continue
        for j in starts[tuple(a['raw'][-1])]:
            b = rows[j]
            if a is b or dot_forward(a['line'], b['line']) < SEAM_COS:
                continue
            match = a['to'] == b['from_id']
            # Do not route from a regular lane directly into a reserved one.
            compatible = a['kind'] == b['kind'] or '1' in (a['kind'], b['kind'])
            if match and compatible:
                a['next'].append(j)
                continue
            if match:
                continue
            # A1 must corroborate duplicate IDs when both nodes exist. With a
            # missing node, exact XYZ and matching lane types are required.
            both_nodes = a['to'] in nodes and b['from_id'] in nodes
            same_node_position = both_nodes and nodes[a['to']] == nodes[b['from_id']] == a['raw'][-1]
            connector_join = connector_kinds.get(a['id']) == b['kind'] and any(
                nodes.get(key) == a['raw'][-1] for key in (a['to'], b['from_id']))
            joined = compatible and (same_node_position if both_nodes else a['kind'] == b['kind'] or connector_join)
            if joined:
                a['next'].append(j)
            seams.append(dict(a=a['id'], b=b['id'], fromNode=a['to'], toNode=b['from_id'],
                              a1=[a['to'] in nodes, b['from_id'] in nodes], joined=joined,
                              method=('A1' if same_node_position else 'A1+connector' if connector_join
                                      else 'XYZ') if joined else None))
    return seams


def boundary_bus_routes(rows):
    """Complete reserved routes, including their measured junction connectors."""
    def boundary(point):
        return WINDOW.boundary.distance(Point(point)) < .001

    def finish(chain):
        row = rows[chain[-1]]
        if boundary(row['points'][-1]) and row['kind'] == '4':
            yield chain
        else:
            for i in row['next']:
                if i not in chain and rows[i]['kind'] in {'1', '4'}:
                    yield from finish([*chain, i])

    return [max(routes, key=lambda chain: sum(rows[i]['len'] for i in chain))
            for i, row in enumerate(rows) if row['kind'] == '4' and boundary(row['points'][0])
            if (routes := list(finish([i])))]


def bundles(rows):
    indices = {row['id']: i for i, row in enumerate(rows)}
    waiting = set(range(len(rows)))
    output = []
    while waiting:
        lane = min(waiting)
        while rows[lane]['left'] in indices:
            left = indices[rows[lane]['left']]
            if left not in waiting or rows[left]['right'] != rows[lane]['id'] or rows[left]['kind'] == '1':
                break
            lane = left
        group = []
        while lane in waiting:
            waiting.remove(lane)
            group.append(lane)
            row = rows[lane]
            right = indices.get(row['right'], -1)
            if right not in waiting or rows[right]['left'] != row['id'] or row['kind'] == '1' or rows[right]['kind'] == '1':
                break
            lane = right
        ref = LineString(rows[group[0]]['points'])
        lengths = [LineString(rows[i]['points']) for i in group]
        # Sample signed cross-track offsets at each lane's own surveyed vertex
        # stations. The full polylines remain authoritative for vehicle poses.
        stations = sorted({0., 1., *(line.project(Point(p), normalized=True)
                                     for line in lengths for p in line.coords[1:-1])})
        offsets = []
        for t in stations:
            p = ref.interpolate(t, normalized=True)
            a = ref.interpolate(max(0, t * ref.length - .75))
            b = ref.interpolate(min(ref.length, t * ref.length + .75))
            dx, dz = b.x - a.x, b.y - a.y
            for line in lengths:
                q = line.interpolate(t, normalized=True)
                offsets.append(round(((q.y-p.y)*dx - (q.x-p.x)*dz) / math.hypot(dx, dz), 4))
        output.append(dict(lanes=group, at=[round(t * ref.length, 5) for t in stations], offsets=offsets))
    return output


def crosswalks(floor, c1):
    rows = []
    for row in floor['crossingAudit']:
        area = surface(row['faces'])
        rect = list(area.minimum_rotated_rectangle.exterior.coords)
        width = min(math.dist(a, b) for a, b in pairwise(rect))
        [a, b] = [item['end'] for item in row['approaches']]
        rows.append(dict(id=row['id'], ends=[a, b], width=width, faces=row['faces'], shape=area, lamps=[]))
    for light in c1:
        if light['kind'] != C1_PEDESTRIAN:
            continue
        pt = Point(light['at'])
        # Assign a lamp to its closest crosswalk, close to one of its two
        # entrances. Do not let one lamp enable multiple neighbouring crossings.
        candidates = [r for r in rows if min(pt.distance(Point(end)) for end in r['ends']) <= 11]
        if candidates:
            row = min(candidates, key=lambda r: (r['shape'].distance(pt), r['id']))
            if row['shape'].distance(pt) <= 8:
                row['lamps'].append(light['id'])
    for row in rows:
        row['sig'] = bool(row['lamps'])
        del row['shape']
    return rows


def longest_bus(rows):
    def walk(chain):
        if rows[chain[-1]]['kind'] == '4':
            yield chain
        for n in rows[chain[-1]]['next']:
            if n not in chain and rows[n]['kind'] in {'1', '4'}:
                yield from walk([*chain, n])
    candidates = (chain for i, row in enumerate(rows) if row['kind'] == '4' for chain in walk([i]))
    return max(candidates, key=lambda chain: (sum(rows[i]['kind'] == '4' for i in chain),
                                              sum(rows[i]['len'] for i in chain)))


def duplicates(rows):
    shapes = [LineString(r['points']) for r in rows]
    buffers = [line.buffer(.65) for line in shapes]
    for i, (row, line) in enumerate(zip(rows, shapes)):
        a, b = line.coords[0], line.coords[-1]
        matches = []
        for j, other in enumerate(rows):
            if row['kind'] != other['kind'] or row['date'] >= other['date']:
                continue
            ref = shapes[j]
            if ref.project(Point(a)) >= ref.project(Point(b)):
                continue
            shared = line.intersection(buffers[j]).length
            if shared >= .92 * line.length:
                matches.append((shared, other['date'], other['id']))
        row['duplicateOf'] = max(matches)[2] if matches else None


def walk_signal_groups(rows, pavement):
    """Find collinear signalized stripes joined by a paved central refuge."""
    adjacent = defaultdict(set)
    for a, b in combinations((row for row in rows if row['sig']), 2):
        a0, a1 = a['ends']
        b0, b1 = b['ends']
        ux, uz = ((q-p)/math.dist(a0, a1) for p, q in zip(a0, a1, strict=True))
        vx, vz = ((q-p)/math.dist(b0, b1) for p, q in zip(b0, b1, strict=True))
        if abs(ux*vx + uz*vz) < math.cos(math.pi/12):
            continue
        gap, p, q = min((math.dist(p, q), p, q) for p in (a0, a1) for q in (b0, b1))
        if not .2 < gap < 7 or abs((q[0]-p[0])*uz - (q[1]-p[1])*ux) > min(a['width'], b['width'])/2:
            continue
        bridge = LineString([p, q])
        if bridge.intersection(pavement).length < .9*gap:
            continue
        adjacent[a['id']].add(b['id'])
        adjacent[b['id']].add(a['id'])
    groups = []
    while adjacent:
        pending = [min(adjacent)]
        group = set()
        while pending:
            key = pending.pop()
            if key not in group:
                group.add(key)
                pending.extend(adjacent.pop(key))
        groups.append(sorted(group))
    return groups


def bake(floor):
    rows = load_links()
    nodes = {r['properties']['id']: r['geometry']['coordinates'] for r in features('a1-vehicle-seams')}
    settings = AREA.get('signals', {})
    by_arms = settings.get('byJunctionArms')
    seams = connect(rows, nodes, settings.get('allowConnectorSeams', False))
    stops = [(r['properties']['id'], LineString(line)) for r in features('b2') if r['properties']['kind'] == '530'
             for line in paths(r)]
    for row in rows:
        line = LineString(row['points'])
        tip = Point(line.coords[-1])
        gap, name, stop = min((stop.distance(tip), name, stop) for name, stop in stops)
        if gap <= STOP_TIP_TOLERANCE:
            at = line.project(nearest_points(tip, stop)[1])
            row['stop'] = dict(id=name, at=round(at, 6))
            continue
        hits = [(line.project(p), name) for name, stop in stops
                for p in get_parts(line.intersection(stop)) if p.geom_type == 'Point']
        if hits:
            at, name = max(hits)
            row['stop'] = dict(id=name, at=round(at, 6))
    lights = [dict(id=r['properties']['id'], kind=r['properties']['type'], link=r['properties']['linkid'],
                   at=project(r['geometry']['coordinates'])) for r in features('c1')]
    routes = longest_bus(rows)
    lane_groups = bundles(rows)
    central_floor = surface(json.loads(ASSET.read_text())['centralJunction'])
    central = [i for i, r in enumerate(rows) if r['kind'] == '1'
               and central_floor.covers(LineString(r['points']).interpolate(.5, normalized=True))]
    junctions = junction_layout(rows, [face for face, _ in survey_faces('A0080000')]) if by_arms else None
    if junctions is not None:
        central = [i for _, group in junctions for i in group]
    duplicates(rows)
    for i in routes:
        rows[i]['duplicateOf'] = None
    for r in rows:
        for key in ('raw', 'line'):
            del r[key]
    crossings = crosswalks(floor, lights)
    data = dict(v=1, a1Count=len(nodes), links=rows, seams=seams, bundles=lane_groups,
                bus=routes, central=central, window=list(WINDOW.bounds),
                crosswalks=crossings, lights=lights,
                stopLines=[pt for _, line in stops for a, b in pairwise(line.coords) for pt in (*a, *b)],
                walkSignalGroups=walk_signal_groups(crossings, surface(floor['floor']['walk'])))
    if AREA.get('excludeWindows') or AREA.get('coverage'):
        data['boundaryFaces'] = rings(WINDOW)
    if by_arms:
        data['busRoutes'] = boundary_bus_routes(rows)
        data['boundaryRoutes'] = True
    if settings:
        sites = survey_signal_sites(rows, crossings, lights, stops, central, central_floor, settings, junctions)
        split_at_signal_stops(data, sites)
    return data


if __name__ == '__main__':
    floor = json.loads(asset(AREA, '-a').read_text())
    if '--walk-signals' in sys.argv:
        data = json.loads(OUTPUT.read_text())
        data['walkSignalGroups'] = walk_signal_groups(data['crosswalks'], surface(floor['floor']['walk']))
    else:
        data = bake(floor)
    OUTPUT.write_text(json.dumps(data, separators=(',', ':')) + '\n')
