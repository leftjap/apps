"""Measure the shared Hapjeong replay on the actual survey polygons at 30 Hz."""
from collections import Counter
import json
import math
import sys

import numpy as np
from shapely import intersects_xy, prepare
from shapely.geometry import LineString
from shapely.prepared import prep

from check_hapjeong_car_run import audit as audit_cars, body, trace
from check_hapjeong_walk import faces, read


def audit(captured):
    frames = iter(captured)
    meta = json.loads(next(frames))
    data, floor = read('cars'), read('a')['floor']
    pavement = faces(floor['walk']).buffer(1e-7)
    shapes = [faces(r['faces']).buffer(1e-7) for r in data['crosswalks']]
    allowed = [pavement.union(face) for face in shapes]
    physical = [prep(face) for face in shapes]
    prepare(pavement)
    for area in allowed:
        prepare(area)
    ids = [row['id'][-4:] for row in data['crosswalks']]
    signed = [row['sig'] for row in data['crosswalks']]
    nearest = {ids[i]: min(face.distance(LineString(row['points'])) for row in data['links'])
               for i, face in enumerate(shapes)}
    stats, entries, completions, active_in = Counter(), Counter(), Counter(), Counter()
    contacts, green_wait, stuck, red_start = [], {}, {}, []
    stop_for_car, stop_for_person = {}, {}
    previous, old_contacts, entered_face, car_previous = {}, set(), set(), {}
    anchors, green_since, p_yield_since, c_yield_since = {}, {}, {}, {}
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

    for line in frames:
        t, cars, people, busy = json.loads(line)
        if not people:
            continue
        c_by_id = {r[0]: r for r in cars}
        min_pop, max_pop = min(min_pop, len(people)), max(max_pop, len(people))
        stats['samples'] += 1
        p_now, actual, overlap = {}, set(), set()
        p_x = np.array([p[1] for p in people])
        p_z = np.array([p[2] for p in people])
        on_walk = intersects_xy(pavement, p_x, p_z)
        frame_off = 0
        for i, (uid, x, z, state, idx, light, valid, waiting_car, moves) in enumerate(people):
            p_now[uid] = (state, idx)
            old, old_idx = previous.get(uid, ('', -1))
            label = ids[idx] if idx >= 0 else None
            if state == 'wait' and light == 2:
                red_wait.add((uid, idx))
            if not valid:
                stats['engine_invalid_samples'] += 1
            if not on_walk[i] and (state != 'cross' or idx < 0 or not intersects_xy(allowed[idx], x, z)):
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
                since = green_since.setdefault((uid, idx), t)
                if t - since > 10:
                    green_wait[uid] = [label, round(t-since, 2), round(x, 2), round(z, 2), round(t, 2)]
            elif idx >= 0:
                green_since.pop((uid, idx), None)

            episode(stop_for_car, p_yield_since, (uid, idx), waiting_car, t,
                    {'uid':uid, 'crossing':label})

        stats['off_floor_frames'] += bool(frame_off)
        stats['off_floor_samples'] += frame_off
        active = [i for i in actual if not signed[i]]
        for row in cars:
            uid, x, z, yaw, kind, length, half_width, edge, at, speed, why = row[:11]
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
            if not active:
                continue
            shape = body(x, z, yaw, length, half_width)
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
        for key in list(green_since):
            if p_now.get(key[0]) != ('wait', key[1]):
                del green_since[key]
        previous, car_previous = p_now, c_by_id
        old_contacts = overlap

    return {**stats, 'people': [min_pop, max_pop], 'contact': contacts, 'red_entries': red_start,
            'stuck': stuck, 'green_wait': green_wait, 'longest_wait_for_car': stop_for_car,
            'longest_wait_for_person': stop_for_person, 'passing_with_person': sorted(pass_during_crossing),
            'crossing_starts': entries, 'crossing_completions': completions, 'nearest_a2': nearest,
            'red_to_crossing_examples': signal_examples, 'used_approaches': active_in}


if __name__ == '__main__':
    captured = trace(with_people=True)
    result = {'people': audit(captured), 'cars': audit_cars(False, True, captured)}
    print(json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False))
    if '--verify' in sys.argv:
        assert not result['people']['contact'] and not result['people']['red_entries']
        assert not result['people']['passing_with_person']
