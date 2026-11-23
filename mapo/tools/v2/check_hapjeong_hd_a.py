"""One numeric check for the A comparison asset."""
from collections import Counter
from pathlib import Path
import json
from shapely.geometry import LineString, Polygon, box
from shapely.ops import unary_union
from hapjeong_hd_a import choose_direction, outline_exclusions

MAPO = Path(__file__).resolve().parents[2]
DATA = MAPO/'public/data/v2'

def read(name):
    return json.loads((DATA/name).read_text())

def surface(faces):
    return unary_union([Polygon(face[0], face[1:]) for face in faces])

if __name__ == '__main__':
    old = read('hapjeong-hd.json')
    path = DATA/'hapjeong-hd-a.json'
    assert path.exists(), 'A comparison asset must exist'
    new = read(path.name)
    accepted = {'501','503','506','504','525','530','505','515'}
    assert new['lines'] == [r for r in old['lines'] if r['kind'] in accepted]
    assert not new['bicycles']
    assert new['views'] == [v for v in old['views'] if v['mode']=='photo']
    assert new['floor']['road'] == old['floor']['road']
    expected = surface(old['floor']['walk']+old['floor']['islands']+[f for row in old['floor']['a4'] for f in row['faces']])
    assert surface(new['floor']['walk']).symmetric_difference(expected).area < 1e-8
    assert not new['floor']['islands']
    before = {r['id']:r for r in old['crossings']}
    missing = {id for id, row in before.items() if not row['stripes']}
    assert len(missing)==3 and {r['id'] for r in new['crossings'] if r.get('spatial')}==missing
    for row in new['crossings']:
        if row.get('spatial'):
            assert row['spatial']['method']=='spatial-crossing' and row['stripes']
            assert row['spatial']['chosen']['overlap'] > 0
        else:
            assert row == before[row['id']]
        assert surface(row['stripes']).difference(surface(row['faces'])).area < 1e-8
    # A tangent or a nearby passage that misses the face cannot select a direction.
    face = box(-2,-2,2,2)
    assert choose_direction(face, [('tangent', LineString([(-3,2),(3,2)]), 0)])['method']=='no-crossing'
    assert choose_direction(face, [('east', LineString([(-3,0),(3,0)]), 0),
                                   ('north', LineString([(0,-3),(0,3)]), 1.5708)])['method']=='ambiguous-crossing'
    buildings = json.loads((DATA.parent/'aerial-pilot.json').read_text())['buildings']
    road = surface(old['floor']['road']).difference(surface(old['floor']['walk']+old['floor']['islands']))
    assert new['hiddenBuildingOutlines'] == outline_exclusions(buildings,road)
    assert {293,307} <= set(new['hiddenBuildingOutlines'])
    assert all(not buildings[i]['height'] and not buildings[i]['floors'] for i in new['hiddenBuildingOutlines'])
    print('A comparison: original views/roads; allowed paint; combined walking surface; crossing boundaries verified')
    print('B2 shown', len(new['lines']), 'B2 hidden', dict(Counter(r['kind'] for r in old['lines'] if r['kind'] not in accepted)),
          'B3 534 hidden', len(old['bicycles']))
    print('crossings with stripes', sum(bool(r['stripes']) for r in new['crossings']), '/', len(new['crossings']))
    print('excluded no-height outlines (1-based)', [i+1 for i in new['hiddenBuildingOutlines']])
