"""Measure the body and movement of every legacy-engine car at 30 Hz."""
from collections import Counter
from functools import lru_cache
import json
import math
import subprocess
import sys

from shapely import affinity, union_all
from shapely.geometry import LineString, Point, Polygon
from shapely.prepared import prep

import check_hapjeong_walk as area_data
from check_hapjeong_walk import faces, read

MIN_OFF_FLOOR_AREA = .01  # m², behavior-rules.md C5


def body(x, z, yaw, length, half_width):
    c, s = math.cos(yaw), math.sin(yaw)
    return Polygon([(x + c*a - s*b, z + s*a + c*b)
                    for a, b in [(length/2, half_width), (-length/2, half_width),
                                 (-length/2, -half_width), (length/2, -half_width)]])


@lru_cache(maxsize=1)
def rendered_footprints():
    raw = subprocess.check_output(['node', '--experimental-strip-types', 'tools/v2/hapjeong_car_footprints.mts'],
                                  cwd=area_data.ROOT, text=True)
    shapes = {}
    for name, vertices in json.loads(raw).items():
        # SHAPES returns non-indexed meshes. Project the actual triangles
        # rather than filling the gaps between wheels and the rounded body.
        triangles = [Polygon(vertices[i:i+3]) for i in range(0, len(vertices), 3)]
        shape = union_all([triangle for triangle in triangles if triangle.is_valid and triangle.area > 0])
        shapes[name] = (shape, *shape.bounds)
    return shapes


def model_name(kind, length):
    if kind == 1:
        return 'minibus' if length < 10 else 'coach' if length > 11.8 else 'bus'
    if kind == 2:
        return 'taxi'
    return min([(4.94, 'sedan'), (4.74, 'suv'), (3.64, 'kei'), (5.22, 'van')],
               key=lambda pair: abs(pair[0] - length))[1]


def rendered_body(footprint, x, z, yaw, road):
    shape, a, b, c, d = footprint
    # Most poses are fully inside the road by the cheaper envelope test.
    if road.covers(body(x,z,yaw,2*max(-a,c),max(-b,d))):
        return None
    return affinity.translate(affinity.rotate(shape, yaw, origin=(0,0), use_radians=True), x, z)


def trace(seeded=False, with_people=False):
    command = ['node', '--experimental-strip-types', 'tools/v2/trace_hapjeong_cars.mts']
    if '--area' in sys.argv:
        command.extend(['--area', sys.argv[sys.argv.index('--area') + 1]])
    raw = subprocess.run([*command, *(['--seeded'] if seeded else []), *(['--people'] if with_people else [])],
                         cwd=area_data.ROOT, text=True, capture_output=True, check=True)
    return raw.stdout.splitlines()


def audit(seeded, with_people=False, captured=None):
    lines = iter(captured if captured is not None else trace(seeded, with_people))
    signals = json.loads(next(lines))
    data, floor = read('cars'), read('a')['floor']
    road = prep(faces(floor['road']).difference(faces(floor['walk'])).buffer(1e-6))
    footprints = rendered_footprints()
    source = {r['id']: r for r in data['links']}
    driven = [source[key] for key in signals['links']]
    surveyed = [LineString(r['points']) for r in driven]
    red, overlap, excessive, included, scenes = [], [], {}, [], []
    stats, movement, right = Counter(), Counter(), set()
    boundary, old, contacts = {}, {}, set()
    stopped, complete, stopped_at_red, waiting_red = {}, set(), set(), set()
    seen_count, speeds, min_gap = [], [], math.inf

    def describe(t, r):
        return [round(t, 2), r[0], driven[r[7]]['id'], round(r[1], 2), round(r[2], 2)]

    for line in lines:
        t, rows, *_ = json.loads(line)
        now = {r[0]: r for r in rows}
        stats['samples'] += 1
        seen_count.append(len(rows))
        car_bodies = []
        distances, outside = [], []
        touching = set()
        for i, r in enumerate(rows):
            uid, x, z, yaw, kind, length, hwidth, edge, at, speed, why, light, _, past, site, move, internal, visible, blocker, leader, gate, _ = r[:22]
            prev = old.get(uid)
            current = body(x, z, yaw, length, hwidth)
            car_bodies.append(current)
            error = surveyed[edge].distance(Point(x, z))
            distances.append(error)
            if error >= stats['max_a2_deviation']:
                stats['max_a2_deviation'] = error
                boundary['worstDeviation'] = describe(t, r)
            if not road.covers(current):
                stats['box_off_floor_samples'] += 1
            footprint = rendered_body(footprints[model_name(kind,length)], x,z,yaw,road)
            if footprint is not None and not road.covers(footprint):
                off_area = footprint.difference(road.context).area
                stats['raw_off_floor_samples'] += 1
                if off_area >= MIN_OFF_FLOOR_AREA:
                    outside.append(i)
                    boundary.setdefault('firstCountedOffFloor', describe(t, r))
                if not road.covers(Point(x, z)):
                    stats['centre_out_samples'] += 1
                boundary.setdefault('firstOffFloor', describe(t, r))
                if off_area >= stats['largest_off_floor_area']:
                    stats['largest_off_floor_area'] = off_area
                    boundary['worstOffFloor'] = describe(t, r)
            if (not prev and t and visible) or (prev and prev[16] and not internal and t < signals['cycle']):
                if not prev:
                    stats['visible_births'] += 1
                    included.append(['birth', *describe(t, r)])
                elif uid not in complete:
                    movement[prev[15]] += 1
                    complete.add(uid)
                    scenes.append(['junction', prev[15], *describe(t, r)])
            if prev and prev[7] in signals['curves'] and edge != prev[7] and t < signals['cycle'] and uid not in right:
                movement[4] += 1
                right.add(uid)
                scenes.append(['right slip', 4, *describe(t, r)])
            stop = driven[edge]['stop']
            if stop and prev and prev[7] == edge and (uid, edge) not in stopped_at_red:
                front, last = at + length / 2, prev[8] + length / 2
                if light == 2 and last <= stop['at'] < front:
                    red.append(describe(t, r))
                    stopped_at_red.add((uid, edge))
            # Red/amber and a queue behind one are expected stops. Walk the
            # same-frame leader chain to distinguish them from a stuck car.
            head, followed = r, {uid}
            while head[19] in now and head[19] not in followed:
                followed.add(head[19])
                head = now[head[19]]
            red_queue = head[20] in (1, 2) or (signals.get('signalSites') and head[28])
            if speed < .10 and not red_queue:
                x0, z0, start = stopped.get(uid, (x, z, t))
                if math.hypot(x - x0, z - z0) > .8:
                    x0, z0, start = x, z, t
                stopped[uid] = (x0, z0, start)
                if t - start > 30:
                    excessive[uid] = [*describe(t, r), round(t - start, 2), why, light, blocker, leader, gate]
            else:
                stopped.pop(uid, None)
            if speed < .12 and gate == 1:
                waiting_red.add(uid)
            if uid in waiting_red and speed > .15 and light == 0:
                speeds.append(describe(t, r))
                waiting_red.remove(uid)
            for j in range(i):
                b = rows[j]
                if math.hypot(x - b[1], z - b[2]) > (length + b[5]) / 2 + 2:
                    continue
                if edge == b[7]:
                    min_gap = min(min_gap, abs(at - b[8]) - (length + b[5]) / 2)
                if current.intersects(car_bodies[j]) and current.intersection(car_bodies[j]).area > 1e-6:
                    key = tuple(sorted((uid, b[0])))
                    touching.add(key)
                    if key not in contacts:
                        overlap.append([*describe(t, r), b[0]])
        contacts = touching
        stats['off_floor_frames'] += bool(outside)
        stats['off_floor_samples'] += len(outside)
        stats['overlap_frames'] += bool(touching)
        for uid, prev in old.items():
            if uid not in now and prev[17]:
                stats['visible_removals'] += 1
                included.append(['removal', *describe(t, prev)])
        old = now
    return dict(**stats, cars=[min(seen_count), max(seen_count)], red=red, overlap=overlap,
                stalled=list(excessive.values()), visible_events=included, movement=movement, signals=signals,
                exits=scenes, departures_on_green=speeds, min_same_lane_bumper_gap=min_gap, **boundary)


if __name__ == '__main__':
    print(json.dumps(audit('--seeded' in sys.argv, '--people' in sys.argv), ensure_ascii=False, indent=2, allow_nan=False))
