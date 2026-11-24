"""One numeric check for the A comparison asset."""
from collections import Counter
from itertools import combinations
import json
import math
import re
from shapely.geometry import GeometryCollection, LineString, Point, Polygon, box
from shapely.ops import nearest_points, unary_union
from hapjeong_hd_a import choose_direction, outline_exclusions
from hapjeong_hd import AREA, MAPO, WINDOW, asset, face_rings, features, parts, paths
from hapjeong_crossings import agreement, approach, crossing_axis, crossing_sources, half_metre_routes

def read(suffix=''):
    return json.loads(asset(AREA, suffix).read_text())

def surface(faces):
    return unary_union([Polygon(face[0], face[1:]) for face in faces])


def survey_access(audit, actual, marked):
    by_id = {row['id']:row for row in audit}
    counts = Counter()
    for row in audit:
        face = surface(row['faces'])
        ends = row['approaches']
        caps = []
        available = [actual.intersection(face.envelope.buffer(8)),face]
        for link, other in (ends,ends[::-1]):
            status = link['status']
            counts[status] += 1
            if status=='adjacent-survey-crossing':
                neighbour = by_id[link['adjacent']]
                shape = surface(neighbour['faces'])
                assert shape.distance(face)<.02
                available.append(shape)
                caps.append(shape.centroid)
            elif status=='joined':
                landing = surface(link['faces'])
                assert landing.difference(actual.union(marked)).area<1e-8
                available.append(landing)
                a,b = link['end'],other['end']
                caps.append(Point(*(p+(p-q)*(link['distance']+.6)/math.dist(a,b) for p,q in zip(a,b))))
            else:
                assert not link['faces']
        if caps:
            assert any(component.covers(face.centroid) and all(component.covers(p) for p in caps)
                       for component in half_metre_routes(*available)), row['id']
        print('surveyed ends',row['id'][-4:],row['status'],[(link['status'],link['distance'],link.get('adjacent')) for link in ends])
    print(f'outward survey access across all {2 * len(audit)} ends', dict(counts))


def verify_crossing_access(new, before, actual, lanes, original_marked, central):
    recovered = [row for row in new['crossings'] if row['id'] not in before]
    assert recovered, 'surveyed crossings missing from B3 still have no paint or approach audit'
    topo, seoul = crossing_sources()
    assert all(len(row.get('approaches',[]))==2 for row in new['crossingAudit']), 'every surveyed crossing must be checked at both ends, including those with retained B3 paint'
    audit = {row['id']:row['status'] for row in new['crossingAudit']}
    assert set(audit)==set(dict(topo))
    assert len(recovered)==len({row['id'] for row in recovered})
    base = surface([f for row in before.values() for f in row['faces']])
    survey_access(new['crossingAudit'], actual, original_marked)
    original = {row['properties']['id'] for row in features('b3-expanded')
                if row['properties']['kind'] in ('533','5321') and surface(face_rings(row)).intersects(WINDOW)}
    assert original <= set(before), 'an in-range B3 feature was missed by the core request'
    connected = {}
    clipped = {}
    for row in recovered:
        id = row['id']
        face = dict(topo)[id]
        assert audit[id]=='supplemented'
        assert face.equals(surface(row['faces'])) and row['stripes']
        assert face.intersection(base).area < .15*face.area
        if row['seoulId']:
            assert agreement(face,dict(seoul)[row['seoulId']])>0
        a,b,width,heading = crossing_axis(face)
        assert abs(math.sin(row['axisHeading']-heading))<1e-6
        assert all(abs(math.sin(crossing_axis(stripe)[3]-heading))>.9
                   for stripe in parts(surface(row['stripes']),'Polygon') if stripe.area>.25)
        endpoints = []
        for end,other,link in zip((a,b),(b,a),row['approaches'],strict=True):
            assert tuple(link['end'])==end
            landing = surface(link['faces'])
            if link['status']!='joined':
                assert landing.is_empty
                continue
            assert actual.covers(landing.representative_point())
            assert landing.intersection(face).area<1e-8 and not landing.intersects(lanes.buffer(.75))
            direction = tuple((x-y)/math.dist(end,other) for x,y in zip(end,other))
            endpoints.append(Point(*(p+v*(link['distance']+.6) for p,v in zip(end,direction))))
        print('survey crossing',id[-4:],row['seoulId'],'axis length and width',round(math.dist(a,b),3),round(width,3),
              'ends',[(e['status'], None if e['distance'] is None else round(e['distance'],3), e['walkComponent'],
                       [round(v,3) for v in e['end']]) for e in row['approaches']])
        clipped[id] = face
        if len(endpoints)==2:
            local = actual.intersection(face.envelope.buffer(8))
            assert any(all(p.covers(end) for end in endpoints) for p in half_metre_routes(local,face)), id
            connected[id] = (tuple(e['walkComponent'] for e in row['approaches']), endpoints)
    for (i,a),(j,b) in combinations(clipped.items(),2):
        assert a.intersection(b).area < 1e-8, (i,j)
    sequences = 0
    for (i,(sides, ends)), (j,(other, second)) in combinations(connected.items(),2):
        interior = set(sides).intersection(other)
        if len(interior)!=1 or len(set(sides+other))!=3:
            continue
        middle, = interior
        outside = ends[1-sides.index(middle)], second[1-other.index(middle)]
        assert any(all(p.covers(point) for point in outside) and p.intersects(clipped[i].centroid)
                   and p.intersects(clipped[j].centroid) for p in half_metre_routes(actual,clipped[i],clipped[j])), (i,j)
        sequences += 1
        print('two consecutive crossings, continuous .50m clearance',i[-4:],j[-4:],
              'outside ends',[(round(p.x,3),round(p.y,3)) for p in outside])
    assert sequences >= AREA.get('checks', {}).get('minDoubleCrossings', 0)
    unused = [id for id,s in seoul if s.intersection(base).area<.15*s.area
              and not any(agreement(s,t) for _,t in topo)]
    print('source census',len(topo),'survey /',len(seoul),'Seoul; audit',dict(Counter(audit.values())),
          'unmatched Seoul only',unused)
    verified = {row['id']:surface(row['faces']) for row in new['crossingAudit'] if row['status']!='unconfirmed'}
    landings = surface([f for row in new['crossingAudit'] if row['id'] in verified
                        for end in row['approaches'] for f in end['faces']])
    networks = half_metre_routes(actual,landings,*verified.values())
    central_access = {id for id, face in verified.items() if any(p.intersects(central) and p.covers(face.centroid) for p in networks)}
    print('survey faces connected to the central junction',len(central_access),'of',len(verified),
          'outside that network',[id[-4:] for id in sorted(set(verified)-central_access)])
    # B3 fragments already paired to a physical survey face use the end audit above.
    primary = {id:surface(row['faces']) for id,row in before.items()}
    measured = unary_union(list(verified.values()))
    unmatched = {id for id,shape in primary.items() if measured.intersection(shape).area < .15*shape.area}
    gaps = []
    for id in sorted(unmatched):
        shape = primary[id]
        other_walk = actual.union(unary_union([p for key,p in primary.items() if key!=id]))
        for face in parts(shape,'Polygon'):
            a,b,width,_ = crossing_axis(face)
            links = [approach(end,opposite,width,parts(other_walk,'Polygon'),GeometryCollection(),face,4*width)
                     for end,opposite in ((a,b),(b,a))]
            gaps.extend((id,link['distance']) for link in links if link['status']!='joined')
    print('B3-only paint fragments',len(unmatched),'outward ends without a short connection',len(gaps),gaps)


if __name__ == '__main__':
    old = read()
    new = read('-a')
    checks = AREA.get('checks', {})
    accepted = {'501','503','506','504','525','530','505','515'}
    assert new['lines'] == [r for r in old['lines'] if r['kind'] in accepted]
    assert not new['bicycles']
    assert new['views'] == [v for v in old['views'] if v['mode']=='photo']
    assert new['floor']['road'] == old['floor']['road']
    expected = surface(old['floor']['walk']+old['floor']['islands']+[f for row in old['floor']['a4'] for f in row['faces']])
    actual = surface(new['floor']['walk'])
    assert expected.difference(actual).area < 1e-8
    additions = actual.difference(expected)
    edges = [LineString(path) for row in old['lines'] if row['kind']=='505' for path in row['paths']]
    platforms = [surface(row['faces']) for row in old['floor']['a4']]
    witnesses = []
    for x,z in re.findall(r"', (-?[\d.]+), (-?[\d.]+)\]", (MAPO/AREA['sources']['medianStops']).read_text()):
        stop = Point(float(x),float(z))
        platform = min(platforms,key=stop.distance)
        edge = min(edges,key=stop.distance)
        if 1 < stop.distance(platform) < 4 and stop.distance(edge) < 1:
            boundary,mark = nearest_points(platform,edge.interpolate(edge.project(stop)))
            if boundary.distance(mark) > 1:
                witnesses.append(LineString([boundary,mark]).interpolate(.5,normalized=True))
    assert all(actual.covers(point) for point in witnesses), 'surveyed median strip beside the platform is still asphalt'
    lanes = unary_union([LineString(path) for row in features('a2-expanded') for path in paths(row)])
    crossings = surface([face for row in old['crossings']+old['bicycles'] for face in row['faces']])
    assert additions.difference(surface(old['floor']['road'])).area < 1e-8
    assert additions.intersection(lanes).length < 1e-8
    assert additions.intersection(crossings).area < 1e-8
    print('surveyed walk and landing additions (m²)', round(additions.area,3), 'median witnesses',len(witnesses))
    assert not new['floor']['islands']
    before = {r['id']:r for r in old['crossings']}
    verify_crossing_access(new,before,actual,lanes,crossings,surface(old['centralJunction']))
    missing = {id for id, row in before.items() if not row['stripes']}
    if 'recoveredDirections' in checks:
        assert len(missing) == checks['recoveredDirections']
    refitted = {r['id'] for r in new['crossings'] if r.get('spatial')}
    assert refitted <= missing
    if 'recoveredDirections' in checks:
        assert refitted == missing
    for row in new['crossings']:
        if row.get('spatial'):
            assert row['spatial']['method']=='spatial-crossing' and row['stripes']
            assert row['spatial']['chosen']['overlap'] > 0
        elif row['id'] in before:
            assert row == before[row['id']]
        assert surface(row['stripes']).difference(surface(row['faces'])).area < 1e-8
    # A tangent or a nearby passage that misses the face cannot select a direction.
    face = box(-2,-2,2,2)
    assert choose_direction(face, [('tangent', LineString([(-3,2),(3,2)]), 0)])['method']=='no-crossing'
    assert choose_direction(face, [('east', LineString([(-3,0),(3,0)]), 0),
                                   ('north', LineString([(0,-3),(0,3)]), 1.5708)])['method']=='ambiguous-crossing'
    buildings = json.loads((MAPO/AREA['sources']['pilotBuildings']).read_text())['buildings']
    road = surface(old['floor']['road']).difference(surface(old['floor']['walk']+old['floor']['islands']))
    assert new['hiddenBuildingOutlines'] == outline_exclusions(buildings,road)
    assert set(checks.get('requiredBuildingExclusions', [])) <= set(new['hiddenBuildingOutlines'])
    assert all(not buildings[i]['height'] and not buildings[i]['floors'] for i in new['hiddenBuildingOutlines'])
    print('A comparison: original views/roads; allowed paint; combined walking surface; crossing boundaries verified')
    print('B2 shown', len(new['lines']), 'B2 hidden', dict(Counter(r['kind'] for r in old['lines'] if r['kind'] not in accepted)),
          'B3 534 hidden', len(old['bicycles']))
    print('crossings with stripes', sum(bool(r['stripes']) for r in new['crossings']), '/', len(new['crossings']))
    print('excluded no-height outlines (1-based)', [i+1 for i in new['hiddenBuildingOutlines']])
