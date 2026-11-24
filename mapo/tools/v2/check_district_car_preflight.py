"""Rebuild district reachability from usable engine paths and rendered vehicle poses."""
import argparse
from collections import Counter, defaultdict
import json
import math
from pathlib import Path
import subprocess

from shapely.geometry import LineString, Point
from shapely.prepared import prep

from area import MAPO, area_window, asset, read_area, read_asset
from check_hapjeong_car_run import MIN_OFF_FLOOR_AREA, body, rendered_body, rendered_footprints
from check_hapjeong_walk import faces
from district_car_graph import PORTAL_LENGTH, plan_routes

POSE_STEP = .25
CARS = ('sedan', 'suv', 'kei', 'van', 'taxi')


def topology(data):
    return json.loads(subprocess.check_output([
        'node', '--experimental-strip-types', 'tools/v2/district_replay_topology.mts',
    ], cwd=MAPO, input=json.dumps(data), text=True))


def sweep(points, models, road, painted, decks):
    line = LineString(points)
    length = line.length
    envelope_length = 2 * max(max(-a, c) for _, a, _, c, _ in models)
    envelope_width = max(max(-b, d) for _, _, b, _, d in models)
    count = max(1, math.ceil(length / POSE_STEP))
    # Include bends as well as regularly spaced samples.
    bends = [0.]
    for a, b in zip(points, points[1:]):
        bends.append(bends[-1] + math.dist(a, b))
    distances = sorted({*bends, *(length * i / count for i in range(count + 1))})
    half_span = min(1.5, length / 2)
    worst = None
    for s in distances:
        p = line.interpolate(s)
        a, b = line.interpolate(max(0, s - half_span)), line.interpolate(min(length, s + half_span))
        yaw = math.atan2(b.y - a.y, b.x - a.x)
        if road.covers(body(p.x, p.y, yaw, envelope_length, envelope_width)):
            continue
        for model in models:
            footprint = rendered_body(model, p.x, p.y, yaw, road)
            area = 0 if footprint is None else footprint.difference(road.context).area
            if area >= MIN_OFF_FLOOR_AREA and (worst is None or area > worst['outsideM2']):
                layer = 'deck edge' if decks.intersects(footprint) else 'missing road' if not painted.covers(p) else 'road edge'
                worst = {'at': [round(p.x, 3), round(p.y, 3)], 's': s, 'outsideM2': area, 'layer': layer}
    return worst


def merge_portal_clearance(lanes, portals, model):
    """An interior entrance must leave room to yield before a shared outlet."""
    feeders = defaultdict(list)
    for lane in lanes:
        for outlet in lane['next']:
            feeders[outlet].append(lane)
    _, a, b, c, d = model
    length, half_width = 2 * max(-a, c), max(-b, d)

    def positions(lane, start, stop):
        line = LineString(lane['points'])
        lo, hi = start(line.length), stop(line.length)
        n = max(1, math.ceil((hi - lo) / .5))
        for j in range(n + 1):
            s = lo + (hi - lo) * j / n
            p = line.interpolate(s)
            span = min(1.5, line.length / 2)
            u = line.interpolate(max(0, s - span))
            v = line.interpolate(min(line.length, s + span))
            yield s, body(p.x, p.y, math.atan2(v.y-u.y, v.x-u.x), length, half_width)

    rejected = {}
    for outlet, incoming in feeders.items():
        if len(incoming) < 2:
            continue
        for lane in incoming:
            if lane['key'] not in portals:
                continue
            arrival = list(positions(lane, lambda _: 0, lambda n: min(PORTAL_LENGTH, n)))
            for rival in incoming:
                if rival is lane:
                    continue
                other = list(positions(rival, lambda n: max(0, n - 24), lambda n: n))
                first = next((s for s, box in arrival if any(box.intersects(obs) for _, obs in other)), None)
                if first is not None:
                    rejected[lane['key']] = {'rival': rival['key'], 'outlet': outlet, 'distanceM': first}
                    break
    return rejected


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--area', required=True, type=Path)
    parser.add_argument('--out', required=True, type=Path)
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    area = read_area(args.area)
    window = area_window(area)
    data = json.loads(asset(area, '-cars').read_text())
    ground = read_asset(area, '-a')
    painted = faces(ground['floor']['road'])
    decks = faces([f for deck in ground.get('decks', ()) for f in deck['faces']])
    road = prep(painted.union(decks).difference(faces(ground['floor']['walk'])).buffer(1e-6))
    models = rendered_footprints()
    rows = data['links']
    original = data['districtTraffic']
    original_buses = data['busRoutes']
    before = topology(data)
    points = {lane['key']: lane['points'] for lane in before['lanes']}
    failures = {}
    for i, line in points.items():
        if rows[i]['kind'] == '4':
            continue
        if hit := sweep(line, [models[k] for k in CARS], road, painted, decks):
            failures[i] = hit
    buses = []
    bus_failures = []
    for route, missing in zip(original_buses, before['busProblems'], strict=True):
        clearance = {rows[i]['id']: hit for i in route
                     if (hit := sweep(points[i], [models['bus']], road, painted, decks))}
        if missing or clearance:
            bus_failures.append({'engine': [{'from': rows[p['from']]['id'], 'to': rows[p['to']]['id']} for p in missing],
                                 'clearance': clearance,
                                 'stops': [s['key'] for s in data['platforms']
                                           if any(s['link'] == rows[i]['id'] for i in route)]})
        else:
            buses.append(route)
    disabled = {p['id']: p['reason'] for p in original['excluded']}
    for i, row in enumerate(rows):
        if i in failures:
            row['disabled'] = ['body clearance']
        elif i not in points:
            row['disabled'] = [disabled.get(row['id'], 'not in original candidate graph')]
    portals = set()
    portal_rejections = []
    for field, side in [('entries', 0), ('exits', -1)]:
        for portal in original[field]:
            i = portal['edge']
            if rows[i]['len'] >= PORTAL_LENGTH and i not in failures:
                portals.add((i, side))
            else:
                portal_rejections.append({'side': field, 'id': rows[i]['id'], **portal,
                                          'reason': 'body clearance' if i in failures else 'too short'})
    ingress = {j for row in rows for j in row['next']}
    short_terminals = [
        {'id': row['id'], 'at': row['points'][side], 'end': side == -1, 'lengthM': row['len']}
        for i, row in enumerate(rows) if row['kind'] == '6' and row['len'] < PORTAL_LENGTH
        for side, linked in [(0, i in ingress), (-1, bool(row['next']))]
        if not linked or window.boundary.distance(Point(row['points'][side])) < .001
    ]

    engine_rejections = {}
    current = before
    # Removing an edge can invalidate a path through a junction. Rebuild until
    # both the edge set and the usable successor lists agree with the engine.
    connections = [row['next'] for row in rows]
    merge_rejections = {}
    while True:
        usable = [[] for _ in rows]
        for lane in current['lanes']:
            i = lane['key']
            usable[i] = [j for j in lane['next'] if j in connections[i]]
        for issue in current['rejected']:
            engine_rejections[issue['from'], issue['to']] = issue
        plan = plan_routes(rows, buses, window, connections=usable, permitted_portals=portals)
        active = set(plan['selected'])
        interior = {p['edge'] for p in plan['entries'] if not p['boundary']}
        merge_rejected = merge_portal_clearance(
            [{**lane, 'next': [j for j in usable[lane['key']] if j in active]}
             for lane in current['lanes'] if lane['key'] in active], interior, models['van'],
        )
        if merge_rejected:
            merge_rejections.update(merge_rejected)
            portals -= {(i, 0) for i in merge_rejected}
            plan = plan_routes(rows, buses, window, connections=usable, permitted_portals=portals)
        unchanged = plan['selected'] == data['districtTraffic']['selected'] and usable == connections
        data['districtTraffic'] = {**original, **plan}
        if unchanged:
            break
        connections = usable
        # Keep original A2 adjacency in rows. The copy is only for compiling.
        candidate = {**data, 'links': [{**row, 'next': usable[i]} for i, row in enumerate(rows)],
                     'busRoutes': buses}
        current = topology(candidate)
        if any(current['busProblems']):
            raise ValueError('Rebuilding the graph invalidated a retained bus path')

    selected = set(plan['selected'])
    ordinary = [i for i, row in enumerate(rows) if row['kind'] == '6']
    length = sum(rows[i]['len'] for i in ordinary)
    used_length = sum(rows[i]['len'] for i in ordinary if i in selected)
    report = {
        'selected': len(selected), 'ordinary': len(selected.intersection(ordinary)),
        'lengthM': length, 'usedLengthM': used_length, 'demandScale': used_length / length,
        'portals': {side: dict(Counter('boundary' if p['boundary'] else 'interior' for p in plan[side]))
                    for side in ('entries', 'exits')}, 'portalRejections': portal_rejections,
        'shortTerminals': short_terminals,
        'mergePortalRejections': {rows[i]['id']: {**issue, **{k: rows[issue[k]]['id'] for k in ('rival','outlet')}}
                                 for i, issue in merge_rejections.items()},
        'engineRejections': [{**issue, 'from': rows[a]['id'], 'to': rows[b]['id']}
                             for (a, b), issue in engine_rejections.items()],
        'clearanceFailures': {rows[i]['id']: hit for i, hit in failures.items()},
        'busFailures': bus_failures, 'retainedBusRoutes': len(buses),
        'excluded': plan['reasons'],
    }
    candidate = {**data, 'busRoutes': buses, 'bus': buses[0] if buses else [],
                 'links': [{k: connections[i] if k == 'next' else v for k, v in row.items() if k != 'disabled'}
                           for i, row in enumerate(rows)]}
    (args.out / 'candidate-cars.json').write_text(json.dumps(candidate, separators=(',', ':')) + '\n')
    (args.out / 'preflight.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({k: v for k, v in report.items() if k != 'clearanceFailures'}, ensure_ascii=False))


if __name__ == '__main__':
    main()
