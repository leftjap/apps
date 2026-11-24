"""Surveyed river/deck faces and original public-park extents."""
import json

from shapely import make_valid, union_all
from shapely.geometry import LineString, Polygon
from shapely.ops import polygonize

from hapjeong_hd import AREA, MAPO, WINDOW, project, rings, survey_faces


def park_face(row):
    def coords(points):
        return [project((point['lon'], point['lat'])) for point in points]

    if row['type'] == 'relation':
        def outline(role):
            return union_all(list(polygonize([
                LineString(coords(member['geometry'])) for member in row['members']
                if member.get('role') == role and len(member.get('geometry', ())) >= 2
            ])))
        return outline('outer').difference(outline('inner'))
    points = coords(row.get('geometry', ()))
    return make_valid(Polygon(points)) if len(points) >= 4 and points[0] == points[-1] else Polygon()


def open_ground():
    water = union_all([face for face, _ in survey_faces('E0032111')])
    elements = json.loads((MAPO/AREA['sources']['parks']).read_text())['elements']
    parks = union_all([park_face(row) for row in elements if row.get('tags', {}).get('leisure') == 'park'])
    parks = parks.intersection(WINDOW).difference(water)
    decks = [
        {'kind': kind, 'name': row['명칭'], 'faces': rings(face)}
        for code, field, categories in (
            ('A0070000', '종류', {'도로교', '보도교'}),
            ('A0090000', '구분', {'고가차도'}),
        )
        for face, row in survey_faces(code)
        if (kind := row[field]) in categories and face.area > 0
    ]
    land = WINDOW.difference(water.union(parks))
    return dict(land=rings(land), water=rings(water), parks=rings(parks), decks=decks)
