"""Validate the Hapjeong A2 graph against the projected source and A floor."""
import json
from itertools import pairwise

from shapely.geometry import LineString, Point
from shapely.ops import substring

from hapjeong_hd import AREA, WINDOW, asset, features, paths
from hapjeong_hd_a import surface


def verify(data):
    floor = json.loads(asset(AREA, '-a').read_text())
    raw = {r['properties']['id']: LineString(paths(r)[0]) for r in features('a2-vehicle-audit')}
    road = surface(floor['floor']['road']).buffer(.001)
    links = data['links']
    assert len(links) == len({row['id'] for row in links})
    assert {row['kind'] for row in links} == {'1', '4', '6'}
    gaps = []
    for i, row in enumerate(links):
        line = LineString(row['points'])
        reference = raw[row.get('source', row['id'])].intersection(WINDOW)
        if 'sourceAt' in row:
            reference = substring(reference, row['sourceAt'], row['sourceAt'] + row['len'])
        gaps.append(line.hausdorff_distance(reference))
        assert row['len'] > 0 and abs(row['len'] - line.length) < .001
        assert road.covers(line), ('A2 lane outside road', row['id'])
        for j in row['next']:
            assert i != j and line.coords[-1] == tuple(links[j]['points'][0]), ('A2 endpoint', row['id'])
            assert row['kind'] == '1' or links[j]['kind'] in ('1', row['kind'])
    assert max(gaps) < .001, max(gaps)
    assert {i for bundle in data['bundles'] for i in bundle['lanes']} == set(range(len(links)))
    checks = AREA.get('checks', {})
    if 'seams' in checks:
        assert [len(data['seams']), sum(s['joined'] for s in data['seams'])] == checks['seams']
    if 'surveyCrossings' in checks:
        assert len(data['crosswalks']) == checks['surveyCrossings']
    assert all(not row['sig'] or row['lamps'] for row in data['crosswalks'])
    assert any(row['stop'] is not None for row in links if row['kind'] != '1')
    central = set(data['central'])
    ingresses = [row for row in links if row['kind'] != '1' and central.intersection(row['next'])]
    b2 = {r['properties']['id']: LineString(paths(r)[0])
          for r in features('b2') if r['properties']['kind'] == '530'}
    missing = []
    for row in ingresses:
        tip = Point(row['points'][-1])
        closest = min((line.distance(tip), key) for key, line in b2.items())
        if closest[0] <= .05:
            if not row['stop'] or row['stop']['id'] != closest[1] or row['len'] - row['stop']['at'] > .051:
                missing.append(row['id'])
    assert not missing, ('unmatched terminal stop lines', missing)
    bus = data['bus']
    assert sum(links[i]['kind'] == '4' for i in bus) >= checks.get('minBusLinks', 0)
    assert all(b in links[a]['next'] for a, b in pairwise(bus))
    assert links[bus[0]]['kind'] == links[bus[-1]]['kind'] == '4'
    gaps.sort()
    return dict(links=len(links), maxDeviation=max(gaps), p90Deviation=gaps[int(.9 * (len(gaps)-1))],
                ingresses=len(ingresses), missingStops=[r['id'] for r in ingresses if not r['stop']],
                maxStopGap=max(b2[r['stop']['id']].distance(Point(r['points'][-1]))
                               for r in ingresses if r['stop']))


if __name__ == '__main__':
    file = asset(AREA, '-cars')
    assert file.exists(), 'Hapjeong A2 graph has not been baked'
    print(json.dumps(verify(json.loads(file.read_text()))))
