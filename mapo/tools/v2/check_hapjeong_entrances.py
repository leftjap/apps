"""P4: count visible appearances and disappearances outside physical entrances."""
import argparse
from collections import Counter, defaultdict, deque
import json
import math

import numpy as np

from check_hapjeong_crowding import in_view, walker_identity

BALANCE_WINDOW = (120, 240)


def audit(trace):
    meta = json.loads(next(trace))
    entrances = {p['key']:p for p in (meta.get('entrances') or [])}
    stops = {p['key']:p for p in (meta.get('platforms') or [])}
    physical = entrances | stops
    previous = {}
    births = defaultdict(deque)
    count = defaultdict(lambda: dict(incoming=0,outgoing=0,peakPerSecond=0))
    by_kind = Counter()
    balance = {key: Counter(emerged=0, entered=0) for key in entrances}
    boundary = {p['key'] for p in (meta.get('portalAudit') or []) if p['kind']=='exit' and p['key'] not in entrances}
    if 'unlinkedExits' in meta:
        physical.update((p['key'],p) for p in meta.get('portalAudit', []) if p['key'] in boundary)

    def kind(key):
        return 'rail' if key in entrances else 'edge' if key in boundary else 'bus' if key in stops else 'other'

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
                    targets = physical if 'unlinkedExits' in meta else entrances
                    portal = next((key for key,p in targets.items() if key not in stops and math.dist(at,[p['x'],p['z']]) <= .95),portal)
                point = physical.get(portal)
                matched = point and math.dist(at,[point['x'],point['z']]) <= (8 if portal in stops else .95)
                if not t:
                    continue
                count[portal][mode] += 1
                if mode=='incoming' and info and not row[10]:
                    by_kind[f"{kind(info.get('from'))}->{kind(info.get('to'))}"] += 1
                if portal in entrances and matched and BALANCE_WINDOW[0] <= t <= BALANCE_WINDOW[1]:
                    balance[portal]['emerged' if mode=='incoming' else 'entered'] += 1
                if mode=='incoming':
                    q = births[portal]
                    while q and q[0] <= t-1:
                        q.popleft()
                    q.append(t)
                    count[portal]['peakPerSecond'] = max(count[portal]['peakPerSecond'],len(q))
                if not matched and not row[10] and any(in_view(np.array([at]),v)[0] for v in meta['views']):
                    visible.append(dict(id=row[0], t=t, kind=mode, portal=portal, at=at))
        previous = current
    lowest = min((n['entered']/n['emerged'] if n['emerged'] else 0 for n in balance.values()), default=0)
    return dict(models=len(entrances), events=dict(count), visible=visible, buses=bus,
                trip_kinds=dict(by_kind), balance_120_240=balance, min_entered_emerged=lowest)


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
