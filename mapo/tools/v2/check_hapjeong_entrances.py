"""P4: count visible appearances and disappearances outside physical entrances."""
import argparse
from collections import defaultdict, deque
import json
import math

import numpy as np

from check_hapjeong_crowding import in_view, walker_identity


def audit(trace):
    meta = json.loads(next(trace))
    entrances = {p['key']:p for p in (meta.get('entrances') or [])}
    stops = {p['key']:p for p in (meta.get('platforms') or [])}
    physical = entrances | stops
    previous = {}
    births = defaultdict(deque)
    count = defaultdict(lambda: dict(incoming=0,outgoing=0,peakPerSecond=0))
    visible = []
    bus = []
    for line in trace:
        t, _, people, _, *extra = json.loads(line)
        if extra:
            bus.extend(extra[0] or [])
        current = {walker_identity(p):p for p in people}
        for mode, entries in (('incoming',current.keys()-previous.keys()),('outgoing',previous.keys()-current.keys())):
            for key in entries:
                row = (current if mode=='incoming' else previous)[key]
                info = row[9] or {}
                portal = info.get('from' if mode=='incoming' else 'to','?')
                at = row[1:3]
                if mode=='outgoing' and portal not in physical:
                    portal = next((key for key,p in entrances.items() if math.dist(at,[p['x'],p['z']]) <= .95),portal)
                point = physical.get(portal)
                matched = point and math.dist(at,[point['x'],point['z']]) <= (8 if portal in stops else .95)
                if not t:
                    continue
                count[portal][mode] += 1
                if mode=='incoming':
                    q = births[portal]
                    while q and q[0] <= t-1:
                        q.popleft()
                    q.append(t)
                    count[portal]['peakPerSecond'] = max(count[portal]['peakPerSecond'],len(q))
                if not matched and not row[10] and any(in_view(np.array([at]),v)[0] for v in meta['views']):
                    visible.append(dict(id=row[0], t=t, kind=mode, portal=portal, at=at))
        previous = current
    return dict(models=len(entrances), events=dict(count), visible=visible, buses=bus)


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('trace')
    parser.add_argument('--verify',action='store_true')
    options=parser.parse_args()
    with open(options.trace) as trace:
        result=audit(trace)
    print(json.dumps(result,ensure_ascii=False))
    if options.verify and (result['visible'] or not result['models']):
        parser.exit(1, f"P4 failed: {result['models']} models, {len(result['visible'])} visible events outside entrances\n")
