"""Validate the Hapjeong A2 graph against the projected source and A floor."""
import json
from itertools import pairwise

from shapely.geometry import LineString, Point

from hapjeong_hd import ASSET, WINDOW, features, paths
from hapjeong_hd_a import surface


def verify(data):
    floor = json.loads(ASSET.with_name('hapjeong-hd-a.json').read_text())
    raw = {r['properties']['id']: LineString(paths(r)[0]) for r in features('a2-vehicle-audit')}
    road = surface(floor['floor']['road']).buffer(.001)
    links = data['links']
    assert len(links) == len({row['id'] for row in links})
    assert {row['kind'] for row in links} == {'1', '4', '6'}
    gaps = []
    for i, row in enumerate(links):
        line = LineString(row['points'])
        reference = raw[row['id']].intersection(WINDOW)
        gaps.append(line.hausdorff_distance(reference))
        assert row['len'] > 0 and abs(row['len'] - line.length) < .001
        assert road.covers(line), ('A2 lane outside road', row['id'])
        for j in row['next']:
            assert i != j and line.coords[-1] == tuple(links[j]['points'][0]), ('A2 endpoint', row['id'])
            assert row['kind'] == '1' or links[j]['kind'] in ('1', row['kind'])
    assert max(gaps) < .001, max(gaps)
    assert {i for bundle in data['bundles'] for i in bundle['lanes']} == set(range(len(links)))
    assert len(data['seams']) == 11 and sum(s['joined'] for s in data['seams']) == 10
    assert sum(row['sig'] for row in data['crosswalks']) and len(data['crosswalks']) == 23
    assert all(not row['sig'] or row['lamps'] for row in data['crosswalks'])
    assert any(row['stop'] is not None for row in links if row['kind'] != '1')
    bus = data['bus']
    assert sum(links[i]['kind'] == '4' for i in bus) >= 3
    assert all(b in links[a]['next'] for a, b in pairwise(bus))
    assert links[bus[0]]['kind'] == links[bus[-1]]['kind'] == '4'
    gaps.sort()
    return dict(links=len(links), maxDeviation=max(gaps), p90Deviation=gaps[int(.9 * (len(gaps)-1))])


if __name__ == '__main__':
    file = ASSET.with_name('hapjeong-hd-cars.json')
    assert file.exists(), 'Hapjeong A2 graph has not been baked'
    print(json.dumps(verify(json.loads(file.read_text()))))
