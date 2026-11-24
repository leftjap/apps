"""Check a surveyed area's building and ground asset."""
from collections import Counter
import json

from shapely import union_all

from hapjeong_buildings import OMIT
from hapjeong_hd import AREA, WINDOW, asset, survey_faces
from hapjeong_hd_a import surface


def verify(data, floor):
    assert tuple(data['window']) == WINDOW.bounds
    pavement = surface(floor['floor']['walk'])
    road = surface(floor['floor']['road']).difference(pavement)
    reserved = road.union(pavement)
    eligible = Counter((row['UFID'], int(row['층수'])) for face, row in survey_faces('B0010000')
                       if row['종류'] not in OMIT and face.difference(reserved).area > 0)
    buildings = data['buildings']
    assert Counter((row['id'], row['floors']) for row in buildings) == eligible
    poses = []
    for building in buildings:
        face = surface(building['faces'])
        floors = building['floors']
        assert floors > 0 and building['height'] == 3 * floors
        assert face.area > 0 and WINDOW.covers(face), building['id']
        poses.append(face)
    footprint = union_all(poses)
    overlap = {key: footprint.intersection(face).area for key, face in [('road', road), ('walk', pavement)]}
    assert all(area < 1e-7 for area in overlap.values()), overlap
    parking = surface(data['parking'])
    assert parking.is_empty or WINDOW.covers(parking)
    assert parking.intersection(footprint.union(road).union(pavement)).area < 1e-7
    return dict(buildings=len(buildings), missingHeight=0, offWindow=0, overlap=overlap)


if __name__ == '__main__':
    floor = json.loads(asset(AREA, '-a').read_text())
    data = json.loads(asset(AREA, '-buildings').read_text())
    print(json.dumps(verify(data, floor)))
