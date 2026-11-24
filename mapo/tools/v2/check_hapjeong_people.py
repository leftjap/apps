"""Measure the shared Hapjeong replay on the actual survey polygons at 30 Hz."""
from collections import Counter, defaultdict
import json
import math
import sys
from statistics import median

import numpy as np
from shapely import intersects_xy, prepare, union_all
from shapely.geometry import LineString
from shapely.prepared import prep

from check_hapjeong_car_run import audit as audit_cars, body, trace
from check_hapjeong_walk import faces, read
from check_hapjeong_crowding import walker_identity


def audit(captured):
    frames = iter(captured)
    meta = json.loads(next(frames))
    data, floor = read('cars'), read('a')['floor']
    pavement = faces(floor['walk']).buffer(1e-7)
    shapes = [faces(r['faces']).buffer(1e-7) for r in data['crosswalks']]
    walk = read('walk')
    pads = [faces([part for end in walk['landings'][row['id']] for part in end['faces']]).buffer(1e-7)
            for row in data['crosswalks']]
    allowed = union_all([pavement, *shapes, *pads,
                         *(faces(link['faces']) for link in walk.get('sidewalkLinks', ()))])
    prepare(allowed)
    prepare(pads)
    physical_pads = [prep(pad) for pad in pads]
    # Same framing as the 80m production review cameras.
    views = meta['views']
    tilt, bearing = map(math.radians, (28, -42))
    sin, cos = math.sin, math.cos
    distance = 80 / (2 * (4/3) * math.tan(math.radians(17)))
    def in_view(p, view):
        x, z = p[1] - view['at'][0], p[2] - view['at'][1]
        right = x*cos(bearing)-z*sin(bearing)
        depth = -x*sin(bearing)-z*cos(bearing)
        half = (distance+depth*sin(tilt))*math.tan(math.radians(17))
        return abs(right) <= half*(4/3) and abs(depth*cos(tilt)) <= half
    views_count = {v['id']: [] for v in views}
    completed = Counter()
    completed_by_person = Counter()
    trip_positions, arrived, departures = {}, {}, {}
    touches_pad = defaultdict(list)
    pad_active = set()
    pad_samples = 0
    physical = [prep(face) for face in shapes]
    ids = [row['id'][-4:] for row in data['crosswalks']]
    signed = [row['sig'] for row in data['crosswalks']]
    nearest = {ids[i]: min(face.distance(LineString(row['points'])) for row in data['links'])
               for i, face in enumerate(shapes)}
    stats = Counter(engine_invalid_samples=0)
    invalid_since = {}
    invalid_runs = []
    entries, completions, active_in = Counter(), Counter(), Counter()
    occupied_approaches = set()
    contacts, green_wait, green_wait_any, stuck, red_start = [], {}, {}, {}, []
    stop_for_car, stop_for_person = {}, {}
    previous, old_contacts, entered_face, car_previous = {}, set(), set(), {}
    anchors, green_since, eligible_since, p_yield_since, c_yield_since = {}, {}, {}, {}, {}
    missing_wait_timing = 0
    pass_during_crossing, signal_examples, red_wait = set(), {}, set()
    approach = {r['edge']: r['id'] for r in meta['approach']}
    min_pop, max_pop = math.inf, 0

    def episode(target, timers, key, current, time, detail):
        if not current:
            timers.pop(key, None)
            return
        t0 = timers.setdefault(key, time)
        if time - t0 >= target.get('seconds', -1):
            target.update(seconds=round(time - t0 + 1/30, 3), start=round(t0, 2), end=round(time, 2), **detail)

    for frame, line in enumerate(frames):
        t, cars, people, busy, *_ = json.loads(line)
        if people is None:
            continue
        c_by_id = {r[0]: r for r in cars}
        min_pop, max_pop = min(min_pop, len(people)), max(max_pop, len(people))
        stats['samples'] += 1
        p_now, actual, overlap, at_pad = {}, set(), set(), set()
        for v in views:
            views_count[v['id']].append(sum(in_view(p, v) for p in people))
        p_x = np.array([p[1] for p in people])
        p_z = np.array([p[2] for p in people])
        on_walk = intersects_xy(allowed, p_x, p_z)
        at_pad.update(np.flatnonzero(intersects_xy(pads, p_x[:, None], p_z[:, None]).any(axis=0)))
        frame_off = 0
        green_now, eligible_now = {}, {}
        for i, row in enumerate(people):
            uid, x, z, state, idx, light, valid, waiting_car, moves, trip = row[:10]
            if trip:
                oldloc = trip_positions.get(uid)
                if not oldloc:
                    departures[uid] = [round(trip['tod']-50400, 3), trip['from'], trip['to'], x, z]
                length = oldloc[2]+math.hypot(x-oldloc[0], z-oldloc[1]) if oldloc else 0
                trip_positions[uid] = x, z, length
                if state == 'leave' and uid not in arrived:
                    arrived[uid] = [round(t,3), trip['from'], trip['to'], round(length,2), x, z]
            p_now[uid] = (state, idx)
            old, old_idx = previous.get(uid, ('', -1))
            label = ids[idx] if idx >= 0 else None
            if state == 'wait' and light == 2:
                red_wait.add((uid, idx))
            if not valid:
                stats['engine_invalid_samples'] += 1
                identity = walker_identity(row)
                start, last = invalid_since.get(identity, (frame, frame-1))
                if last != frame-1:
                    start = frame
                if frame-start == 3:
                    invalid_runs.append(dict(id=uid,t=round(t,3),x=x,z=z,state=state))
                invalid_since[identity] = (start,frame)
            if not on_walk[i]:
                frame_off += 1
            if state == 'cross':
                if idx >= 0 and intersects_xy(shapes[idx], x, z):
                    actual.add(idx)
                    entered_face.add((uid, idx))
                if t and (old != 'cross' or old_idx != idx):
                    if t < meta['cycle']:
                        entries[label] += 1
                    if light == 2:
                        red_start.append([round(t, 2), uid, label])
                    if signed[idx] and (uid, idx) in red_wait:
                        signal_examples.setdefault(label, []).append([round(t, 2), uid, x, z])
                    red_wait.discard((uid, idx))
            if old == 'cross' and (state != 'cross' or idx != old_idx) and (uid, old_idx) in entered_face:
                completed[ids[old_idx]] += 1
                completed_by_person[walker_identity(row), ids[old_idx]] += 1
                if t < meta['cycle']:
                    completions[ids[old_idx]] += 1
                entered_face.remove((uid, old_idx))

            x0, z0, since = anchors.get(uid, (x, z, t))
            if state not in {'walk', 'cross'}:
                anchors.pop(uid, None)
            elif math.hypot(x-x0, z-z0) > .15:
                anchors[uid] = (x, z, t)
            else:
                anchors[uid] = x0, z0, since
                if t - since > 30:
                    stuck[uid] = [state, label, round(t-since, 2), round(x, 2), round(z, 2), round(t, 2)]

            if state == 'wait' and light == 0:
                key = (walker_identity(row), idx)
                since = green_now[key] = green_since.get(key, t)
                if t - since > 10:
                    green_wait_any[uid] = [label, round(t-since, 2), round(x, 2), round(z, 2), round(t, 2)]
                timing = row[11] if len(row)>11 else None
                if not timing or timing[1] is None:
                    missing_wait_timing += 1
                elif timing[0] >= timing[1]:
                    ready_since = eligible_now[key] = eligible_since.get(key,t)
                    if t - ready_since > 10:
                        green_wait[uid] = [label, round(t-ready_since, 2), round(x, 2), round(z, 2), round(t, 2)]

            episode(stop_for_car, p_yield_since, (uid, idx), waiting_car, t,
                    {'uid':uid, 'crossing':label})

        green_since, eligible_since = green_now, eligible_now
        stats['off_floor_frames'] += bool(frame_off)
        stats['off_floor_samples'] += frame_off
        active = [i for i in actual if not signed[i]]
        this_pad = set()
        for row in cars:
            uid, x, z, yaw, kind, length, half_width, edge, at, speed, why = row[:11]
            if edge in approach:
                occupied_approaches.add(approach[edge])
            hx, hz = math.cos(yaw), math.sin(yaw)
            dx, dz = p_x - x, p_z - z
            longitudinal = np.maximum(np.abs(dx*hx + dz*hz) - length/2, 0)
            transverse = np.maximum(np.abs(-dx*hz + dz*hx) - half_width, 0)
            for i in np.flatnonzero(longitudinal**2 + transverse**2 < (meta['bodyRadius'] - .0001)**2):
                person = people[i]
                key = (uid, person[0])
                overlap.add(key)
                if key not in old_contacts:
                    xw = ids[person[4]] if person[4] >= 0 else None
                    contacts.append([round(t, 2), uid, person[0], xw, meta['links'][edge], round(x, 2), round(z, 2)])
            if t and uid in car_previous:
                last = car_previous[uid]
                if last[7] in approach and last[7] != edge and t < meta['cycle']:
                    active_in[approach[last[7]]] += 1
            if not active and not at_pad:
                continue
            shape = body(x, z, yaw, length, half_width)
            for idx in at_pad:
                if physical_pads[idx].intersects(shape):
                    key = (uid, ids[idx])
                    this_pad.add(key)
                    if key not in pad_active:
                        touches_pad[ids[idx]].append([round(t, 3), uid, why, speed])

            for idx in active:
                if physical[idx].intersects(shape) and speed >= .1:
                    pass_during_crossing.add((uid, ids[idx]))
                # Codes 7/13 are engine stops for crossing occupancy/body.
                close = shapes[idx].distance(shape) < length + 4
                episode(stop_for_person, c_yield_since, (uid, idx), close and speed < .1 and why in (7, 13), t,
                        {'uid':uid, 'crossing':ids[idx]})
        for key in list(c_yield_since):
            if key[1] not in active or key[0] not in c_by_id:
                del c_yield_since[key]
        for key in list(p_yield_since):
            if p_now.get(key[0]) != ('wait', key[1]):
                del p_yield_since[key]
        previous, car_previous = p_now, c_by_id
        old_contacts = overlap
        pad_active = this_pad
        pad_samples += len(this_pad)

    assert stats['samples'] == round(meta['duration'] * 30) + 1, 'incomplete replay'
    full_trips = [entry[3] for uid, entry in arrived.items() if departures[uid][0] >= 0]
    return {**stats, 'trip_departures':departures, 'trip_arrivals':arrived,
            'trips_started_in_run':sum(entry[0] >= 0 for entry in departures.values()),
            'trips_completed_in_run':len(arrived),
            'trips_disappeared_in_run':len(arrived.keys() - p_now.keys()),
            'trip_distance_median':median(full_trips) if full_trips else None,
            'n_complete_distance_samples':len(full_trips),
            'per_view':{key:[min(n),max(n)] for key,n in views_count.items()},
            'landings_passage_episodes':touches_pad, 'landings_passage_samples':pad_samples,
            'crossings_completed_in_run':completed,
            'repeat_over_three':sorted({uid for ((uid,_),_), n in completed_by_person.items() if n>3}),
            'repeat': [[uid,c,n] for ((uid,_),c),n in completed_by_person.items() if n>1],
            'people': [min_pop, max_pop], 'contact': contacts, 'red_entries': red_start, 'invalid_runs': invalid_runs,
            'stuck': stuck, 'green_wait': green_wait if not missing_wait_timing else None,
            'green_wait_any': green_wait_any, 'longest_wait_for_car': stop_for_car,
            'longest_wait_for_person': stop_for_person, 'passing_with_person': sorted(pass_during_crossing),
            'crossing_starts': entries, 'crossing_completions': completions, 'nearest_a2': nearest,
            'red_to_crossing_examples': signal_examples, 'used_approaches': active_in,
            'occupied_approaches': sorted(occupied_approaches)}


if __name__ == '__main__':
    if '--trace' in sys.argv:
        with open(sys.argv[sys.argv.index('--trace')+1]) as captured:
            people = audit(captured)
            captured.seek(0)
            cars = audit_cars(False, True, captured)
    else:
        captured = trace(with_people=True)
        people, cars = audit(captured), audit_cars(False, True, captured)
    result = {'people': people, 'cars': cars}
    print(json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False))
    if '--verify' in sys.argv:
        assert result['people']['green_wait'] is not None, 're-record with crossing timing'
        assert not result['people']['contact'] and not result['people']['red_entries']
        assert not result['people'].get('off_floor_frames'), 'pedestrian outside paved face'
        assert not result['people']['landings_passage_episodes'], 'vehicle on a landing while occupied'
        assert not result['people']['repeat'], 'person crossed the same stripe twice'
        assert not result['people']['invalid_runs'], 'engine rejected walker position for more than three consecutive ticks'
        assert not result['people']['stuck'] and not result['people']['green_wait'], 'pedestrian stalled'
        assert not result['people']['passing_with_person'] and not result['cars']['red']
