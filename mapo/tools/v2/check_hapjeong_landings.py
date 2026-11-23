"""Check the crossing approaches against the finished pavement and A2 lane widths."""
import json

from shapely.geometry import LineString
from shapely.ops import unary_union

from check_hapjeong_walk import faces, read


def verify():
    graph, floor, cars = read('walk'), read('a'), read('cars')
    assert 'landings' in graph, 'the walk asset has no full-width crossing approaches'
    pavement = faces(floor['floor']['walk'])
    cross = {r['id']: faces(r['faces']) for r in floor['crossingAudit']}
    lanes = [(LineString(r['points']), 1.245 if r['kind'] == '4' else 1.0)
             for r in cars['links']]
    assert set(graph['landings']) == set(cross)
    assert 'crossAreas' not in graph
    for key, ends in graph['landings'].items():
        assert len(ends) == 2
        forbidden = unary_union([line.buffer(width, cap_style='flat') for line, width in lanes
                                 if line.intersection(cross[key]).length < .1])
        for end in ends:
            patch = faces(end['faces'])
            assert 0 <= end['ratio'] <= 1 and 0 <= end['extension'] <= 6
            assert patch.intersection(forbidden).area < .0001, ('other A2 lane', key)
            if end['connected']:
                assert end['ratio'] > 0
                assert patch.is_empty or patch.distance(pavement) < .001, ('pavement connection', key)
        if key in graph['crossings']:
            assert all(end['connected'] for end in ends), ('unattached crossing', key)
    print(json.dumps({k[-4:]: [[e['extension'], e['ratio'], e['connected'], e['clipped']] for e in v]
                      for k, v in graph['landings'].items()}, ensure_ascii=False))


if __name__ == '__main__':
    verify()
