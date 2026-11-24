"""Check one connected static map with --area NAME or --area PATH."""
from collections import Counter
import json
from pathlib import Path

from shapely.geometry import LineString, Point
from shapely.ops import unary_union

from area import COMPARISON_SEAM_MARGIN, area_window, read_area
from hapjeong_hd import AREA, SHEETS, WINDOW, asset, parts, project, survey_faces
from hapjeong_hd_a import polygon, surface
from shp import dbf, shapes
from tm import tm_to_ll

AREA_EPS = 1e-6  # m², for floating-point polygon operations


def floor_layers(paving):
    return {key: surface([face for row in rows for face in row['faces']] if key == 'a4' else rows)
            for key, rows in paving.items()}


def floor_parity(paving, areas):
    combined = floor_layers(paving)
    compared = {}
    for area in areas:
        core = area_window(area).buffer(-COMPARISON_SEAM_MARGIN)
        reference = floor_layers(json.loads(asset(area, '-a').read_text())['floor'])
        compared[area['id']] = {}
        for layer, original in reference.items():
            actual, expected = combined[layer].intersection(core), original.intersection(core)
            compared[area['id']][layer] = {
                'combinedOnlyM2': actual.difference(expected).area,
                'areaOnlyM2': expected.difference(actual).area,
            }
    return compared


def named_road_footprint(road, name, number):
    lanes = []
    for path in sorted(SHEETS.glob('*/N1L_A0020000.shp')):
        _, rows = dbf(path.with_suffix('.dbf'))
        for (kind, lines), row in zip(shapes(path), rows, strict=True):
            if (kind != 3 or row['도로명'] != name or row['도로번호'] != number or not row['도로폭']):
                continue
            for line in lines:
                if len(line) >= 2:
                    axis = LineString([project(tm_to_ll(*p)[::-1]) for p in line])
                    lanes.append(axis.buffer(float(row['도로폭']) / 2, cap_style='flat'))
    return road.intersection(unary_union(lanes))


def coincident_faces(faces, seams):
    return sum(face.boundary.intersection(seams).length > .01 for face in faces)


def inspect():
    master = json.loads(asset(AREA).read_text())
    floor = json.loads(asset(AREA, '-a').read_text())
    built = json.loads(asset(AREA, '-buildings').read_text())
    paving = floor['floor']
    road, walk = (surface(paving[key]) for key in ('road', 'walk'))
    comparisons = [read_area(Path(name)) for name in AREA['comparisonAreas']]
    older = [area_window(area) for area in comparisons]
    old_union = unary_union(older)
    seams = unary_union([area.boundary for area in older]).intersection(WINDOW.buffer(-.001))
    buildings = [surface(row['faces']) for row in built['buildings']]
    building_union = unary_union(buildings)
    footways = list(parts(walk, 'Polygon'))
    landings = floor['pedestrianLandings']
    features = {
        'road': road, 'walk': walk, 'islands': surface(paving['islands']),
        'a4': surface([face for row in paving['a4'] for face in row['faces']]),
        'buildings': building_union, 'parking': surface(built['parking']),
        'ground': surface(built['ground']),
        'paint': surface([face for row in floor['paint'] for face in row['faces']]),
        'crossings': surface([face for row in floor['crossings'] for face in row['faces'] + row['stripes']]),
        'landings': surface([face for rows in landings.values() for row in rows for face in row['faces']]),
        'bicycles': surface([face for row in floor['bicycles'] for face in row['faces']]),
    }
    corners = list(WINDOW.exterior.coords)[:-1]
    winding = 1 if WINDOW.exterior.is_ccw else -1
    concave = []
    for i, (x, z) in enumerate(corners):
        a, b = corners[i-1]
        c, d = corners[(i+1) % len(corners)]
        if winding * ((x-a)*(d-z) - (z-b)*(c-x)) < -1e-7:
            concave.append((x, z))
    coverage = AREA['coverage']
    road_name = coverage['roadName']
    arterial = named_road_footprint(road, road_name, coverage['roadNumber'])
    if arterial.is_empty:
        raise ValueError(f'No survey centreline for {road_name}')
    distances = sorted((Point(p).distance(arterial), p) for p in concave)
    sheets = [(face, row['도엽코드']) for face, row in survey_faces('H0010000') if face.area > AREA_EPS]
    new_land = WINDOW.difference(old_union)
    return {
        'area': AREA['id'],
        'outlineM2': WINDOW.area,
        'addedM2': new_land.area,
        'buildingRecords': len(buildings),
        'buildingPieces': sum(len(row['faces']) for row in built['buildings']),
        'buildingsInAddedLand': sum(face.intersection(new_land).area > AREA_EPS for face in buildings),
        'buildingsOnlyInAddedLand': sum(face.intersection(old_union).area <= AREA_EPS for face in buildings),
        'withoutHeight': sum(row['height'] <= 0 for row in built['buildings']),
        'outsideM2': {key: feature.difference(WINDOW).area for key, feature in features.items()},
        'buildingRoadOverlapM2': building_union.intersection(road).area,
        'buildingWalkOverlapM2': building_union.intersection(walk).area,
        'oldBoundaryBuildingFaces': coincident_faces(
            [polygon(face) for row in built['buildings'] for face in row['faces']], seams),
        'oldBoundaryWalkFaces': coincident_faces(footways, seams),
        'shortestConcaveDistanceM': distances[0][0] if distances else None,
        'concaveDistances': distances,
        'outsideSheetsM2': WINDOW.difference(unary_union([face for face, _ in sheets])).area,
        'sheets': [key for _, key in sheets],
        'floorFaces': {key: len(rows) for key, rows in master['floor'].items()},
        'floorParity': floor_parity(paving, comparisons),
        'crossings': len(floor['crossings']),
        'crossingsByKind': dict(Counter(row.get('kind', 'survey') for row in floor['crossings'])),
        'landingCoverage': dict(Counter(sum(row['connected'] for row in rows) for rows in landings.values())),
        'landingFaces': sum(len(row['faces']) for rows in landings.values() for row in rows),
    }


if __name__ == '__main__':
    result = inspect()
    print(json.dumps(result, ensure_ascii=False, indent=2))
    violations = (
        any(value > AREA_EPS for value in result['outsideM2'].values())
        or any(result[key] > AREA_EPS for key in (
            'buildingRoadOverlapM2', 'buildingWalkOverlapM2', 'outsideSheetsM2',
        ))
        or any(result[key] for key in ('withoutHeight', 'oldBoundaryBuildingFaces', 'oldBoundaryWalkFaces'))
        or any(value > AREA_EPS for area in result['floorParity'].values()
               for layer in area.values() for value in layer.values())
        or (result['shortestConcaveDistanceM'] is not None
            and result['shortestConcaveDistanceM'] < AREA['coverage']['roadMargin'])
    )
    raise SystemExit(int(violations))
