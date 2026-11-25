"""Cross-check a camera census using the original ConnectedStops counter and the same replay trace."""
import json
import math
from pathlib import Path
import sys
from functools import lru_cache

from shapely.geometry import Point

from area import area_window
from check_hapjeong_car_run import ConnectedStops
from check_hapjeong_walk import AREA, read


def compare(path):
    baseline = json.loads((path.parent / 'baseline.json').read_text())
    scenario_id = path.stem.removeprefix('legacy-')
    result = next(row for row in baseline['results'] if row['scenario']['id'] == scenario_id)
    district = read(AREA['replay'].get('carAsset', 'cars')).get('districtTraffic')
    if district is None:
        raise ValueError('The legacy outline check requires declared district portals.')
    shape = area_window(AREA)
    border = shape.boundary
    initial, started, finished = set(), {}, {}
    stops = ConnectedStops(120)

    with path.open() as source:
        header = json.loads(next(source))
        for line in source:
            time, cars = json.loads(line)
            stops.add(time, cars, lambda t, r: [t, r[0], r[1], r[2]])
            if not time:
                initial.update(row[0] for row in cars)
            for uid, x, z, visible in cars:
                started.setdefault(uid, (time, x, z, visible))
                finished[uid] = (time, x, z, visible)

    birth = [row for uid,row in started.items() if uid not in initial]
    exit_ = [row for row in finished.values() if row[0] < time]
    portals = {key: [row['at'] for row in district[key] if not row['boundary']] for key in ('entries', 'exits')}
    all_portals = portals['entries'] + portals['exits']

    @lru_cache
    def interior(x, z):
        p = Point(x, z)
        return shape.covers(p) and border.distance(p) > 15

    def counts(rows, allowed):
        inside = [(x, z) for _,x,z,_ in rows if interior(x,z)]
        near = sum(any(math.hypot(x-u,z-v) <= 8 for u,v in allowed) for x,z in inside)
        legacy_visible = sum(not any(math.hypot(x-u,z-v) <= 8 for u,v in all_portals) for x,z in inside)
        return dict(all=len(rows), screen=sum(row[3] for row in rows), old_visible=legacy_visible,
                    interior=len(inside), interior_near=near, interior_other=len(inside)-near)

    observed = {'birth': counts(birth,portals['entries']), 'exit': counts(exit_,portals['exits'])}
    for event, compared in observed.items():
        new = result['life'][event]
        assert new['all'] == compared['all'], (event, new, compared)
        assert new['dots'] + new['body'] == compared['screen'], (event, new, compared)
        assert new['legacy'] == compared['old_visible'], (event, new, compared)
    old_stalls = {row[1] for row in stops.over_cycle}
    new_stalls = {row['uid'] for row in result['stalls']}
    assert old_stalls == new_stalls, (old_stalls-new_stalls,new_stalls-old_stalls)
    return dict(scenario=scenario_id, linkCount=len(header['links']), time=time, initial=len(initial),
                events=observed, stoppedOver120=len(old_stalls), matchedVehicleIds=True)


if __name__ == '__main__':
    print(json.dumps(compare(Path(sys.argv[1])), ensure_ascii=False, indent=2))
