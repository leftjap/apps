"""Single numeric check for the Hapjeong HD comparison."""
import json
from collections import Counter
from math import pi
from shapely import make_valid
from shapely.geometry import LineString, Polygon
from shapely.ops import unary_union
from hapjeong_hd import AREA, ASSET, RAW, WINDOW, connectivity, features, paths, face_rings, floor_faces, floor_paths, offset_zebra

def read(path):
    return json.loads(path.read_text())

def polygon(face):
    return make_valid(Polygon(face[0], face[1:]))

def surface(faces):
    return unary_union([polygon(face) for face in faces])

def main():
    assert ASSET.is_file(), 'the HD comparison asset has not been generated'
    data = read(ASSET)
    checks = AREA.get('checks', {})
    for layer, count in checks.get('rawCounts', {}).items():
        assert len(read(RAW / f'{layer}.json')['features']) == count, layer
    counts = {key: len(data[key]) for key in ('lines', 'crossings', 'bicycles', 'links', 'views')}
    counts.update(entries=len(data['routing']['entries']), a4=len(data['floor']['a4']))
    for key, expected in checks.get('baseCounts', {}).items():
        assert counts[key] == expected, (key, counts[key], expected)
    assert [row['paths'] for row in data['lines']] == [
        json.loads(json.dumps(sections)) for row in features('b2')
        if (sections := floor_paths(paths(row)))]
    assert [row['paths'] for row in data['links']] == [
        json.loads(json.dumps(paths(row))) for row in features('a2')]
    marks = {row['properties']['id']: row for row in features('b3')}
    for row in data['crossings'] + data['bicycles']:
        assert row['faces'] == json.loads(json.dumps(floor_faces(face_rings(marks[row['id']]))))
    for row in data['crossings']:
        face = surface(row['faces'])
        assert surface(row['stripes']).difference(face).area < 1e-8, row['id']
        assert bool(row['stripes']) == (row['lookup'] != 'unresolved'), row['id']
    test_face = Polygon([(0,0), (20,0), (20,5), (0,5)])
    stripes = list(offset_zebra(test_face, pi/2))
    assert all(abs(s.bounds[2] - s.bounds[0] - .49) < 1e-9 for s in stripes)
    assert all(abs(b.centroid.x - a.centroid.x - 1.1) < 1e-9 for a,b in zip(stripes,stripes[1:]))
    central = surface(data['centralJunction'])
    assert data['routing'] == connectivity(features('a2'), features('a2-expanded'), features('a1-expanded'), central)
    # Verify the witness routes against original direction and link roles.
    graph = {row['properties']['id']: row['properties'] for row in features('a2-expanded')}
    print('원본 WFS 6층 수량 일치 · B2/A2 선 정점과 B3 원 면 보존')
    print('횡단보도', dict(Counter(row['lookup'] for row in data['crossings'])),
          '방향 방식', dict(Counter(d['method'] for row in data['crossings'] for d in row['directions'])))
    near = [rule['distance'] for row in data['crossings'] for rule in row['directions'] if rule['method']=='nearest-tangent']
    if near:
        print('근접 방향의 원본 링크∼면 거리(m)', f'{min(near):.3f}–{max(near):.3f}')
    for row in data['crossings']:
        if row['lookup'] == 'unresolved':
            print('미해결 횡단보도', row['id'], 'link=', row['linkId'],
                  'x/z=', tuple(round(v,2) for v in surface(row['faces']).centroid.coords[0]))
    print('미확인 B2 종류/유형', sorted({(r['kind'],r['type']) for r in data['lines'] if not r['ink']['known']}))
    for row in data['routing']['entries']:
        assert row['endDistance'] <= 0 and row['endDistance'] < row['startDistance']
        if not row['route']:
            print('미도달', row['id'], row['atNode'], row['at'], '순방향 링크', row['startNodeOutgoing'])
            continue
        chain = [graph[id] for id in row['route']]
        assert chain[0]['fromnodeid'] == row['atNode']
        assert all(a['tonodeid']==b['fromnodeid'] for a,b in zip(chain,chain[1:]))
        assert all(p['linktype'] in ('1','4','6') for p in chain[:-1]) and chain[-1]['linktype'] in ('4','6')
    entries = data['routing']['entries']
    print('진입차로', len(entries), dict(Counter(r['type'] for r in entries)),
          '도달', sum(bool(r['route']) for r in entries), '미도달', sum(not r['route'] for r in entries))
    print('확장 링크/노드', data['routing']['expandedLinkCount'], data['routing']['expandedNodeCount'])
    print('중앙 교차로 면적(m²)', round(central.area, 2), 'BBOX 참고 분모', data['routing']['bboxReferenceCount'])

    road = surface(data['floor']['road'])
    topo_walk = surface(data['floor']['walk'] + data['floor']['islands'])
    hd_walk = surface([face for row in data['floor']['a4'] for face in row['faces']])
    included = [(row['kind'], geom) for row in data['lines'] for path in row['paths']
                if (geom := LineString(path).intersection(WINDOW)).length > 0]
    total = sum(geom.length for _, geom in included)
    print('공통 계측 창 x/z(m)', WINDOW.bounds, '노면선 중심선 분모(m)', round(total,6))
    for name, walk in [('수치지형도', topo_walk), ('A4 보도', hd_walk)]:
        travelled = road.difference(walk)
        outside = sum(geom.difference(travelled).length for _, geom in included)
        print(f'{name}: 찻길 밖 {outside:.6f} m ({100*outside/total:.6f}%)')

if __name__ == '__main__':
    main()
