"""Build the A view from the preserved Hapjeong HD comparison."""
import json
import math
import re
from itertools import pairwise
from collections import defaultdict
from pathlib import Path

from shapely import affinity, make_valid, STRtree
from shapely.geometry import LineString, Point, Polygon
from shapely.ops import unary_union

from area import COMPARISON_SEAM_MARGIN, area_window, read_area, read_asset, write_asset
from hapjeong_hd import AREA, MAPO, ORIGIN, WINDOW, features, parts, paths, project, offset_zebra, rings, survey_faces
from hapjeong_crossings import expanded_walk, supplement_crossings, vehicle_clearance, walking_landings
from aerial_paint import footprint

LINE_KINDS = {'501','503','506','504','525','530','505','515'}
TIE_METRES = .25
TIE_DEGREES = 15


def polygon(face):
    return make_valid(Polygon(face[0], face[1:]))


def surface(faces):
    return unary_union([polygon(face) for face in faces])


def angle_difference(a, b):
    # Paint has an axis. Links facing opposite ways can support the same stripe.
    return abs((a - b + math.pi / 2) % math.pi - math.pi / 2)


def link_segments(rows):
    for row in rows:
        p = row['properties']
        if p['linktype'] not in ('1','4','6'):
            continue
        for path in paths(row):
            for a, b in pairwise(path):
                if a != b:
                    yield p['id'], LineString([a, b]), math.atan2(b[1]-a[1], b[0]-a[0])


def choose_direction(face, segments):
    centroid = face.centroid
    interior = face.buffer(-1e-6)
    best = {}
    nearby = []
    for id, segment, angle in segments:
        distance = segment.distance(face)
        if distance > 12:
            continue
        overlap = segment.intersection(interior).length
        row = dict(linkId=id, angle=angle, faceDistance=distance, centerDistance=segment.distance(centroid),
                   overlap=overlap, segment=list(segment.coords))
        nearby.append(row)
        if overlap <= 0:
            continue
        # Among true interior crossings prefer the local segment nearest the face center.
        score = (row['centerDistance'], -overlap)
        if id not in best or score < best[id][0]:
            best[id] = (score, row)
    options = sorted((row for _, row in best.values()), key=lambda row: (row['centerDistance'], -row['overlap'], row['linkId']))
    if not options:
        return {'method':'no-crossing'}
    first = options[0]
    tied = [row for row in nearby if row['overlap'] > 0
            and row['centerDistance'] <= first['centerDistance']+TIE_METRES]
    conflict = next((row for row in tied
                     if math.degrees(angle_difference(first['angle'], row['angle'])) > TIE_DEGREES), None)
    if conflict:
        return {'method':'ambiguous-crossing', 'proposed':first, 'conflict':conflict}
    other = min((row for row in nearby if row['overlap'] <= 0
                 and math.degrees(angle_difference(first['angle'], row['angle'])) > 30),
                key=lambda row:(row['faceDistance'],row['centerDistance']), default=None)
    return {'method':'spatial-crossing', 'chosen':first, 'alternatives':options[1:3],
            'nearDifferentDirection':other, 'crossingLinks':len(options)}


def outline_exclusions(buildings, road):
    excluded = []
    for i, row in enumerate(buildings):
        if any(isinstance(row[key], (int,float)) and math.isfinite(row[key]) and row[key] > 0
               for key in ('height','floors')):
            continue
        face = polygon([[project(point) for point in ring] for ring in row['rings']])
        if not face.is_empty and road.covers(face):
            excluded.append(i)
    return excluded


def median_faces(floor):
    dx, dz = project(ORIGIN[::-1])
    stops = [Point(float(x) + dx, float(z) + dz) for x, z in re.findall(
        r"', (-?[\d.]+), (-?[\d.]+)\]", (MAPO/AREA['sources']['medianStops']).read_text())]
    for row in floor['a4']:
        for face in parts(surface(row['faces']), 'Polygon'):
            axes = list(pairwise(face.minimum_rotated_rectangle.exterior.coords))
            span = max(axes, key=lambda pair: math.dist(*pair))
            width = min(math.dist(*pair) for pair in axes)
            if math.dist(*span) >= 3*width and any(stop.distance(face) <= width for stop in stops):
                yield row['id'],face,span,width


def median_paving(floor, crossings):
    """Between a central stop's A4 face and a one-sided B2 road edge."""
    lanes = {row['properties']['id']: unary_union([LineString(path) for path in paths(row)])
             for row in features('a2-expanded')}
    all_lanes = unary_union(list(lanes.values()))
    clearance = (unary_union([lanes[row['properties']['id']].buffer(vehicle_clearance(row['properties']['linktype']))
                              for row in features('a2-expanded')]) if AREA.get('signals') else None)
    edges = []
    for row in features('b2'):
        p = row['properties']
        adjacent = [lanes.get(p[key]) for key in ('l_linkid', 'r_linkid') if p[key]]
        if p['kind'] == '505' and len(adjacent) == 1 and adjacent[0] is not None:
            edges.extend((LineString(path), adjacent[0]) for path in paths(row))
    recovered = []
    for _,face,span,width in median_faces(floor):
        strips = platform_strips(face, span, width, edges)
        recovered.extend(strip for strip in strips if not strip.intersects(all_lanes))
    added = unary_union(recovered).intersection(surface(floor['road'])).difference(crossings)
    return added.difference(clearance) if clearance is not None else added


def platform_strips(face, span, width, edges):
    origin = face.centroid
    a, b = span
    angle = math.atan2(b[1]-a[1], b[0]-a[0])
    section_face = affinity.rotate(face, -angle, origin, use_radians=True)
    left, bottom, right, top = section_face.bounds
    breaks = sorted({x for x,_ in section_face.exterior.coords})
    for edge, lane in edges:
        if edge.distance(face) > width:
            continue
        border = affinity.rotate(edge, -angle, origin, use_radians=True)
        drive = affinity.rotate(lane, -angle, origin, use_radians=True)
        for start, end in pairwise(border.coords):
            (x0,z0),(x1,z1) = sorted((start,end))
            if x1-x0 <= abs(z1-z0):
                continue  # Transverse lines cannot bound the length of the platform.
            lo, hi = max(x0,left), min(x1,right)
            if lo >= hi:
                continue
            mid = Point((lo+hi)/2, z0+((lo+hi)/2-x0)*(z1-z0)/(x1-x0))
            lower = drive.interpolate(drive.project(mid)).y < mid.y
            sections = []
            for x in [lo, *(x for x in breaks if lo < x < hi), hi]:
                section = section_face.intersection(LineString([(x,bottom-1),(x,top+1)]))
                z = z0+(x-x0)*(z1-z0)/(x1-x0)
                rim = section.bounds[1 if lower else 3]
                gap = rim-z if lower else z-rim
                sections.append(((x,z),(x,rim)) if 0 <= gap <= width else None)
            for before, after in pairwise(sections):
                if before is None or after is None:
                    continue
                strip = Polygon([before[0],after[0],after[1],before[1]])
                if strip.area > 0:
                    yield affinity.rotate(strip, angle, origin, use_radians=True)


def connected_paint(lines):
    # Start dash phase at each original line, before the new perimeter cuts it.
    ink = {row['id']: row['ink'] for row in lines}
    fills = defaultdict(list)
    for row in features('b2'):
        style = ink.get(row['properties']['id'])
        if style is None:
            continue
        for path in paths(row):
            fills[style['color']].extend(footprint(path, style['width'], 0, style['dash']))
    return [{'color': color, 'faces': rings(unary_union(polys).intersection(WINDOW))}
            for color, polys in sorted(fills.items())]


def inferred_paint(lines, clip_to=None):
    fills = defaultdict(list)
    for row in lines:
        ink = row['ink']
        for path in row['paths']:
            fills[ink['color']].extend(footprint(path, ink['width'], 0, ink['dash']))
    result = []
    for color, polys in sorted(fills.items()):
        painted = unary_union(polys)
        if clip_to is not None:
            painted = painted.intersection(clip_to)
        result.append({'color': color, 'faces': rings(painted)})
    return result


def preserve_inferred_pavement(measured, inferred):
    """Use reviewed additions inside the earlier areas; infer across their joins."""
    references = [(name, COMPARISON_SEAM_MARGIN) for name in AREA.get('comparisonAreas', ())]
    if name := AREA.get('floorReference'):
        references.insert(0, (name, 0))
    for name, margin in references:
        reference = read_area(Path(name))
        core = area_window(reference).buffer(-margin)
        paving = read_asset(reference, '-a')['floor']['walk']
        confirmed = surface(paving).intersection(core)
        inferred = inferred.difference(core).union(confirmed.difference(measured))
    return measured.union(inferred)


def bake_a(old):
    floor = old['floor']
    clip = AREA.get('floor', {}).get('clipToWindow')
    survey_walk = surface(floor['walk'] + floor['islands'])
    combined = survey_walk.union(surface([face for row in floor['a4'] for face in row['faces']]))
    measured = combined
    road_surface = surface(floor['road'])
    common_road = road_surface.difference(survey_walk)
    segments = list(link_segments(features('a2-expanded')))
    wide = 'outline' in AREA
    segment_index = STRtree([line for _, line, _ in segments]) if wide else None
    crossings = []
    for row in old['crossings']:
        if row['stripes']:
            crossings.append(row)
            continue
        face = surface(row['faces'])
        nearby = (segments[i] for i in sorted(segment_index.query(face.buffer(12)))) if wide else segments
        result = choose_direction(face, nearby)
        stripes = [ring for stripe in offset_zebra(surface(row['faces']), result['chosen']['angle'])
                   for ring in rings(stripe)] if result['method']=='spatial-crossing' else []
        crossings.append({**row, 'stripes':stripes, 'spatial':result})
    cross_faces = surface([face for row in crossings+old['bicycles'] for face in row['faces']])
    combined = combined.union(median_paving(floor,cross_faces)).union(expanded_walk(floor['a4']))
    if clip:
        combined = combined.intersection(WINDOW)
    if wide:
        buildings = unary_union([face for face, row in survey_faces('B0010000')
                                  if row['종류'] not in ('무벽건물', '가건물')])
        hidden = []
    else:
        source_buildings = json.loads((MAPO/AREA['sources']['pilotBuildings']).read_text())['buildings']
        buildings = surface([[ [project(p) for p in ring] for ring in row['rings']]
                             for row in source_buildings if row['height'] or row['floors']])
        hidden = outline_exclusions(source_buildings, common_road)
    recovered, crossing_audit = supplement_crossings(crossings,combined,buildings)
    approaches = surface([face for row in crossing_audit if row['status']!='unconfirmed'
                          for end in row['approaches'] for face in end['faces']])
    combined = combined.union(approaches.difference(cross_faces))
    if AREA.get('comparisonAreas'):
        combined = preserve_inferred_pavement(measured, combined.difference(measured))
    if clip:
        combined = combined.intersection(WINDOW)
    result = {
        'views': [view for view in old['views'] if view['mode']=='photo'],
        'floor': {'road':floor['road'], 'walk':rings(combined), 'islands':[], 'a4':[]},
        'lines': [row for row in old['lines'] if row['kind'] in LINE_KINDS],
        'crossings':crossings+recovered, 'crossingAudit':crossing_audit, 'bicycles':[], 'links':[],
        'hiddenBuildingOutlines':hidden,
    }
    if AREA.get('coverage') or wide:
        result['crossings'] = [clipped for row in result['crossings']
                               if (clipped := clip_crossing(row))['faces']]
        result['crossingAudit'] = [
            {**row, 'faces': clip_faces(row['faces']),
             'approaches': [{**end, 'faces': clip_faces(end['faces'])} for end in row['approaches']]}
            for row in result['crossingAudit']
            if surface(row['faces']).intersection(WINDOW).area > 0
        ]
        result['paint'] = connected_paint(result['lines'])
        result['bicycles'] = old['bicycles']
    if AREA['id'] == 'mapo-all':
        from infer_lane_lines import infer_lane_lines

        inferred, excluded, _ = infer_lane_lines(AREA, result)
        result['lines'].extend(inferred)
        paint_by_color = {row['color']: row for row in result['paint']}
        for row in inferred_paint(inferred, road_surface.intersection(WINDOW)):
            if row['color'] in paint_by_color:
                paint_by_color[row['color']]['faces'].extend(row['faces'])
            else:
                result['paint'].append(row)
        print('width-rule metres:', json.dumps({key: round(value, 2) for key, value in sorted(excluded.items())}))
    if wide:
        from survey_open_ground import open_ground
        result.update(open_ground())
    return result


def clip_faces(faces):
    return rings(surface(faces).intersection(WINDOW))


def clip_crossing(row):
    return {**row, 'faces': clip_faces(row['faces']), 'stripes': clip_faces(row['stripes'])}


def pedestrian_landings(floor, cars):
    # Keep the rendered floor intact. The separate walking asset owns these
    # extensions and uses the very same measured crossing IDs as the car graph.
    pavement = surface(floor['floor']['walk'])
    links = cars['links']
    if cars.get('signalSites'):
        # A stop split never changes whether a physical lane crosses the face.
        from hapjeong_cars import load_links
        links = load_links()
    lanes = [(LineString(row['points']), 1.245 if row['kind'] == '4' else 1.0) for row in links]
    lane_index = STRtree([line for line, _ in lanes]) if 'outline' in AREA else None
    result = {row['id']: walking_landings(row, pavement, lanes, lane_index=lane_index)
              for row in floor['crossingAudit']}
    if AREA.get('coverage') or 'outline' in AREA:
        for ends in result.values():
            for end in ends:
                end['faces'] = clip_faces(end['faces'])
    return result


if __name__=='__main__':
    result = bake_a(read_asset(AREA))
    if AREA.get('floor', {}).get('bakeLandings'):
        if 'outline' in AREA:
            links = [{'points': line, 'kind': kind}
                     for feature in features('a2-expanded')
                     if (kind := feature['properties']['linktype']) in ('1', '4', '6')
                     for line in paths(feature)]
        else:
            from hapjeong_cars import load_links
            links = load_links()
        result['pedestrianLandings'] = pedestrian_landings(result, {'links': links})
    print(write_asset(AREA, '-a', result))
