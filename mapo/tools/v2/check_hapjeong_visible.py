"""Measure and gate the visible behavior in the ordinary 240-second replay."""
from collections import Counter, defaultdict
from math import dist
import json
import subprocess

import numpy as np
from shapely import intersects_xy, prepare, union_all

from check_hapjeong_crowding import walker_identity
from check_hapjeong_walk import faces

STOP_SAMPLES = range(0, 241, 30)
# Reference 30-second basic-board runs, with the seeds used by the legacy checks.
LEGACY_HASH = {
    'cars': '661682145d9d5f1905aa0112e52c5934bba3cba766146462fddc0511ff22aae1',
    'people': '50f7e50bfc4aada72a4490983e7348c2385887a192cf7e36f9b7b1a708564f02',
}


class Stationary:
    """Longest continuous spell within 0.15 m, per pedestrian trip."""

    def __init__(self):
        self.anchors = {}
        self.longest = {}

    def frame(self, t, walkers):
        current = {}
        for key, at, state, crossing in walkers:
            x, z, since = self.anchors.get(key, (*at, t))
            if dist((x, z), at) > .15:
                x, z, since = *at, t
            current[key] = x, z, since
            seconds = t - since
            if seconds > self.longest.get(key, {}).get('seconds', 0):
                self.longest[key] = dict(id=key[0], at=list(at), state=state, crossing=crossing,
                                         start=since, end=t, seconds=seconds)
        self.anchors = current

    def over(self, seconds):
        return [r for r in self.longest.values() if r['seconds'] > seconds + 1e-8]


def non_red_faces(phases, t, meta):
    u = (t + meta['offset']) % meta['cycle']
    k = next(i for i, phase in enumerate(phases) if u < phase['start'] + phase['duration'])
    phase = phases[k]
    # Match walkState: the first all-red phase after pedestrian green is flashing yellow.
    return set(phase['walk']) | (set(phases[k-1]['walk']) if not phase['green'] else set())


def measure(trace, plan, floor, walk):
    meta = json.loads(next(trace))
    platforms = {r['key']: r for r in (meta.get('platforms') or [])}
    calls, alighted, boarded = defaultdict(list), Counter(), Counter()
    waiting = {key: {} for key in platforms}
    demand_totals, sample_count = Counter(), 0
    pavement = faces(floor['walk']).buffer(1e-7)
    if walk.get('sidewalkLinks'):
        pavement = union_all([pavement, *(faces(link['faces']) for link in walk['sidewalkLinks'])]).buffer(1e-7)
    areas = [union_all([faces(r['faces']), faces([part for end in walk['landings'][r['id']]
                                                  for part in end['faces']])])
             for r in plan['faces']]
    road = union_all([faces(floor['road']), *areas]).difference(pavement)
    controlled = [(r['id'], area) for r, area, signal in zip(plan['faces'], areas, meta['crosswalks'], strict=True)
                  if signal['sig'] and signal['associated']]
    for geom in (pavement, road, *(area for _, area in controlled)):
        prepare(geom)
    signed_ids = {r['id'] for r in meta['crosswalks'] if r['sig'] and r['associated']}
    stalled, on_sidewalk, on_red = Stationary(), Stationary(), Stationary()
    previous = {}
    for line in trace:
        t, _, people, _, *extra = json.loads(line)
        if 0 <= t <= 240 and extra:
            for event in extra[0] or []:
                key = event['key']
                if key in platforms:
                    calls[key].append(round(event['at'], 3))
                    alighted[key] += event['alighted']
            if len(extra) > 1 and extra[1] is not None:
                sample_count += 1
                for key, value in extra[1].items():
                    demand_totals[key] += value
                    if t in STOP_SAMPLES:
                        waiting[key][t] = value
        current = {walker_identity(p): p for p in people}
        for identity in previous.keys() - current.keys():
            row = previous[identity]
            key = (row[9] or {}).get('to')
            if row[3] == 'leave' and key in platforms and dist(row[1:3], (platforms[key]['x'], platforms[key]['z'])) <= 8:
                boarded[key] += 1
        previous = current

        valid_modes = {'walk', 'wait', 'cross'}
        movers = [(identity, p) for identity, p in current.items() if p[3] in valid_modes]
        x, z = np.asarray([p[1:3] for _, p in movers]).reshape(-1, 2).T
        paved = intersects_xy(pavement, x, z)
        traffic = intersects_xy(road, x, z)
        not_red = non_red_faces(plan['phase'], t, meta)
        labels = {}
        for key, area in controlled:
            if key not in not_red:
                for i in np.flatnonzero(traffic & intersects_xy(area, x, z)):
                    labels[i] = key[-4:]
        walkers = []
        for i, (identity, p) in enumerate(movers):
            crossing = meta['crosswalks'][p[4]]['id'] if p[4] >= 0 else None
            if traffic[i] and p[5] == 2 and crossing in signed_ids:
                labels[i] = crossing
            walkers.append((identity, p[1:3], p[3], crossing))
        stalled.frame(t, walkers)
        on_sidewalk.frame(t, (row for i, row in enumerate(walkers) if paved[i]))
        on_red.frame(t, ((*walkers[i][:3], crossing) for i, crossing in labels.items()))

    buses = [dict(key=key, calls=calls[key], boarded=boarded[key], alighted=alighted[key],
                  waiting=[waiting[key].get(t) for t in STOP_SAMPLES],
                  mean_waiting=round(demand_totals[key]/sample_count,3) if sample_count else None)
             for key in platforms]
    return dict(road_red_over_30=on_red.over(30), stuck_over_120=stalled.over(120),
                sidewalk_30_to_120=[r for r in on_sidewalk.over(30) if r['seconds'] <= 120 + 1e-8],
                buses=buses, duration=meta['duration'])


def check_legacy(tree):
    hashes = {}
    for kind, expected in LEGACY_HASH.items():
        result = subprocess.run(['node', '--experimental-strip-types', f'tools/v2/check_legacy_{kind}.mts'],
                                cwd=tree, capture_output=True, text=True)
        report = json.loads(result.stdout) if result.stdout.strip() else {}
        current = report.get('after', report).get('digest')
        hashes[kind] = dict(passed=result.returncode == 0 and current == expected, actual=current, expected=expected)
        if result.stderr:
            hashes[kind]['stderr'] = result.stderr
    return hashes


def gate_failures(rules, visible, *, exit_keys, stop_keys, exit_events=None, check_buses=True):
    issues = []

    def require(gate, name, measured, passed):
        if not passed:
            issues.append(dict(gate=gate, test=name, measured=measured))

    groups = {
        1: {'P1': ('people_on_red', 'cars_on_red', 'signed_face_cars'),
            'P2': ('body_contacts', 'occupied_landing_passages', 'unsignalized_cars')},
        2: {'P4': ('visible_events',), 'C5': ('visible_events',)},
        3: {'C5': ('overlap', 'stuck', 'off_floor')},
        4: {'P5': ('off_floor', 'invalid')},
    }
    for gate, entries in groups.items():
        for rule, fields in entries.items():
            for key in fields:
                measured = rules[rule][key]
                require(gate, f'{rule}.{key}', measured, measured == 0)

    require(5, 'road_red_over_30', visible['road_red_over_30'], not visible['road_red_over_30'])
    require(6, 'stuck_over_120', visible['stuck_over_120'], not visible['stuck_over_120'])
    peak = rules['P6']['peak_5m']
    require(6, 'peak_5m', peak, peak <= 25)
    models, missing = rules['P4']['models'], rules['P4']['missing_direction']
    two_way = models - (missing or 0)
    if exit_events is not None:
        two_way = sum(bool(exit_events.get(key, {}).get('incoming') and exit_events.get(key, {}).get('outgoing'))
                      for key in exit_keys)
    require(7, 'two_way_exits', two_way, models == len(exit_keys) and two_way == len(exit_keys))
    if check_buses:
        served = [bus['key'] for bus in visible['buses']]
        require(7, 'platforms', served, sorted(served) == sorted(stop_keys))
        for bus in visible['buses']:
            for name, value, lower in [('calls', len(bus['calls']), 2), ('boarded', bus['boarded'], 1),
                                       ('alighted', bus['alighted'], 1)]:
                require(7, f"{bus['key']}.{name}", value, value >= lower)
    for name in LEGACY_HASH:
        report = visible['legacy'].get(name, False)
        require(8, name, report, report.get('passed', False) if isinstance(report, dict) else report)
    return issues
