"""Measure crowd growth and clearance over one 240-second Hapjeong replay."""
import argparse
from collections import Counter, defaultdict
import json
import math
from statistics import mean

import numpy as np


def in_view(points, view):
    tilt, bearing = map(math.radians, (28, -42))
    fov = math.tan(math.radians(17))
    x, z = (points - view['at']).T
    right = x * math.cos(bearing) - z * math.sin(bearing)
    depth = -x * math.sin(bearing) - z * math.cos(bearing)
    half = view['width'] / (2 * (4/3)) + depth * math.sin(tilt) * fov
    return (abs(right) <= half * (4/3)) & (abs(depth * math.cos(tilt)) <= half)


def walker_identity(p):
    # The engine guarantees unique IDs among live walkers. Deliberate trips
    # can reuse a departed walker's ID; their recorded departure distinguishes them.
    trial = p[10] if len(p)>10 else None
    return p[0], trial['at'] if trial else p[9]['tod'] if len(p)>9 and p[9] else None


def peak(points, views):
    """Test each walker and both radius-five circle centres through nearby pairs."""
    if not len(points):
        return None
    a, b = np.triu_indices(len(points), 1)
    delta = points[b] - points[a]
    distance = np.hypot(*delta.T)
    near = (distance > 1e-6) & (distance <= 10)
    d, v = distance[near], delta[near]
    middle = (points[a[near]] + points[b[near]]) / 2
    side = np.c_[-v[:, 1], v[:, 0]] * (np.sqrt(25 - d*d/4) / d)[:, None]
    candidates = np.concatenate([points, middle + side, middle - side])
    candidates = candidates[np.logical_or.reduce([in_view(candidates, view) for view in views])]
    best = None
    for group in np.array_split(candidates, max(1, math.ceil(len(candidates)/128))):
        if not len(group):
            continue
        counts = (np.square(group[:, None] - points).sum(axis=2) <= 25 + 1e-7).sum(axis=1)
        i = int(np.argmax(counts))
        if best is None or counts[i] > best['n']:
            best = dict(n=int(counts[i]), at=group[i].tolist())
    return best


def audit(records, plan):
    meta = json.loads(next(records))
    linked = {r['xw']: r for r in plan['linked']}
    signed = {i for i in linked if plan['faces'][i]['sig']}
    labels = {i:plan['faces'][i]['id'][-4:] for i in linked}
    ends = [(i, side, [r[x], r[z]]) for i, r in linked.items()
            for side, x, z in [('a','pax','paz'),('b','pbx','pbz')]]
    end_points = np.array([p for _, _, p in ends])
    green = {i:[(row['start'], row['start'] + row['duration']) for row in plan['phase']
                if plan['faces'][i]['id'] in row['walk']] for i in signed}

    def green_now(i,t):
        phase = (t + meta['offset']) % meta['cycle']
        return any(a <= phase < b for a,b in green[i])

    peaks, series = [], []
    phase_entry = {}
    left_behind = []
    previous_wait = defaultdict(set)
    jam = {}
    traffic_delay = [dict(seconds=0),dict(seconds=0)]
    timers = [{},{}]
    previous_cross = {}
    crossings = Counter()
    walk_at = {}
    frozen = {}
    for line in records:
        t, cars, people, *_ = json.loads(line)
        xy = np.asarray([p[1:3] for p in people]).reshape(-1,2)
        waiting = defaultdict(set)
        for p in people:
            if p[3] == 'wait':
                waiting[p[4]].add(p[0])
        for i in signed:
            if green_now(i,t):
                if t and i not in phase_entry and not green_now(i,t-1/30):
                    phase_entry[i] = (t, previous_wait[i])
            elif i in phase_entry:
                first, arrivals = phase_entry.pop(i)
                left_behind.append(dict(crossing=labels[i], start=first, end=t, awaiting=len(arrivals),
                                        remaining=sorted(arrivals & waiting[i])))
        previous_wait = waiting
        if round(t*30) % 60 == 0:
            peaks.append(dict(t=t, best=peak(xy,meta['views'])))
            series.append([t, *(np.square(xy[:, None] - end_points).sum(axis=2) <= 81).sum(axis=0).tolist()])
        anchors = {}
        wait_xy = xy[[p[3]=='wait' and p[4] in signed for p in people]]
        for p in people:
            uid,x,z,mode,idx = p[:5]
            identity = walker_identity(p)
            if mode == 'cross' and t and previous_cross.get(identity) != idx:
                crossings[identity,idx] += 1
            if mode not in ('walk','cross'):
                continue
            ax,az,m,t0,near_t = walk_at.get(uid,(x,z,mode,t,None))
            if m != mode or math.hypot(ax-x,az-z) > .15:
                ax,az,m,t0,near_t = x,z,mode,t,None
            near_queue = mode=='walk' and len(wait_xy)>0 and np.any(np.square(wait_xy-[x,z]).sum(axis=1) <= 25)
            near_t = (t if near_t is None else near_t) if near_queue else None
            if near_t is not None and t-near_t > 10:
                jam.setdefault(uid, [round(t,3),x,z])
            if t-t0 > 30:
                frozen.setdefault(uid, [round(t,3), x, z, mode, labels.get(idx)])
            anchors[uid] = (ax,az,m,t0,near_t)
        walk_at = anchors
        previous_cross = {walker_identity(p):p[4] for p in people if p[3]=='cross'}
        for k, active in enumerate((
            [(p[0],p[4],p[1],p[2]) for p in people if p[7]],
            [(c[0],c[7],c[1],c[2]) for c in cars if c[9]<.1 and c[10] in (7,13)],
        )):
            now = {}
            for uid, idx, x, z in active:
                key = uid, idx
                t0 = now[key] = timers[k].get(key,t)
                duration = t-t0+1/30
                if duration > traffic_delay[k]['seconds']:
                    traffic_delay[k] = dict(seconds=duration,start=t0,end=t,id=uid,
                                            at=[x,z],site=labels.get(idx) if k==0 else meta['links'][idx])
            timers[k] = now

    if abs(t-240) > 1e-6:
        raise ValueError('expected complete 240-second trace')
    growth = []
    for k,(i,side,at) in enumerate(ends,1):
        early = mean(r[k] for r in series if 60<=r[0]<120)
        late = mean(r[k] for r in series if 180<=r[0]<240)
        growth.append(dict(crossing=labels[i], side=side, at=at, signed=i in signed, early=early, late=late,
                           ratio=late/early if early else None, exceed=late > 1.5*early))
    return dict(peaks=peaks, ends=growth, series=series, green_clearance=left_behind,
                queue_blocked=jam, traffic_delay=traffic_delay, frozen=frozen,
                repeated=[[uid,labels.get(idx),n] for ((uid,_),idx),n in crossings.items() if n>1])


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('trace')
    parser.add_argument('plan')
    parser.add_argument('--verify',action='store_true')
    args=parser.parse_args()
    with open(args.trace) as trace, open(args.plan) as plan:
        checks=audit(trace,json.load(plan))
    print(json.dumps(checks,ensure_ascii=False))
    if args.verify:
        failures = [name for name,fail in (
            ('unsignalized growth',any(r['exceed'] and not r['signed'] for r in checks['ends'])),
            ('green clearance',any(r['remaining'] for r in checks['green_clearance'])),
            ('mutual delay',any(r['seconds']>60 for r in checks['traffic_delay'])),
            ('stopped walkers',checks['frozen']),
            ('repeated crossings',checks['repeated']),
        ) if fail]
        if failures:
            parser.exit(1, 'Failed: ' + ', '.join(failures) + '\n')
