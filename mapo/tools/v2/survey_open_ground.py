"""Surveyed river/deck faces and original public-park extents."""
import json

from shapely import get_parts, make_valid, union_all
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


def fill_survey_gaps(water, parks):
    """Extend the surface that borders the most of each unsurveyed patch."""
    surveyed = union_all([face for face, _ in survey_faces('H0010000')])
    gaps = WINDOW.difference(surveyed)
    if surveyed.is_empty or gaps.is_empty:
        return water, parks

    # Projecting a sheet edge and projecting the water along it can differ slightly.
    survey_edge = surveyed.boundary
    near_water, near_parks = water.buffer(.01), parks.buffer(.01)
    water_gaps, park_gaps = [], []
    for gap in get_parts(gaps):
        edge = gap.boundary.intersection(survey_edge)
        water_edge = edge.intersection(near_water)
        water_length = water_edge.length
        park_length = edge.difference(water_edge).intersection(near_parks).length
        land_length = edge.length - water_length - park_length
        if water_length > max(land_length, park_length):
            water_gaps.append(gap)
        elif park_length > land_length:
            park_gaps.append(gap)
    return union_all([water, *water_gaps]), union_all([parks, *park_gaps])


def open_ground():
    water = union_all([face for face, _ in survey_faces('E0032111')])
    elements = json.loads((MAPO/AREA['sources']['parks']).read_text())['elements']
    parks = union_all([park_face(row) for row in elements if row.get('tags', {}).get('leisure') == 'park'])
    water, parks = fill_survey_gaps(water, parks.intersection(WINDOW))
    parks = parks.difference(water)
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
