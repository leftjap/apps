"""Check the crossing approaches against the finished pavement and A2 lane widths."""
import argparse
import json

from shapely.geometry import LineString
from shapely.ops import unary_union

from check_hapjeong_walk import faces, read


def verify(static=False):
    floor = read('a')
    if static:
        from hapjeong_cars import load_links

        landings, links = floor['pedestrianLandings'], load_links()
        linked = set()
    else:
        graph = read('walk')
        landings, links = graph['landings'], read('cars')['links']
        linked = set(graph['crossings'])
        assert 'crossAreas' not in graph
        if 'pedestrianLandings' in floor:
            assert floor['pedestrianLandings'] == landings, 'walking-only layers disagree'

    pavement = faces(floor['floor']['walk'])
    cross = {r['id']: faces(r['faces']) for r in floor['crossingAudit']}
    lanes = [(LineString(r['points']), 1.245 if r['kind'] == '4' else 1.0) for r in links]
    assert set(landings) == set(cross)
    for key, ends in landings.items():
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
        if key in linked:
            assert all(end['connected'] for end in ends), ('unattached crossing', key)
    print(json.dumps({k[-4:]: [[e['extension'], e['ratio'], e['connected'], e['clipped']] for e in v]
                      for k, v in landings.items()}, ensure_ascii=False))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--area', help='area manifest (default: Hapjeong)')
    parser.add_argument('--static', action='store_true', help='check floor landings without car or walk assets')
    verify(parser.parse_args().static)
