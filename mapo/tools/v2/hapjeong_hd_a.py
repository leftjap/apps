"""Build the A view from the preserved Hapjeong HD comparison."""
import json
import math
from itertools import pairwise

from shapely import make_valid
from shapely.geometry import LineString, Polygon
from shapely.ops import unary_union

from hapjeong_hd import ASSET, MAPO, features, paths, project, offset_zebra, rings

OUTPUT = ASSET.with_name('hapjeong-hd-a.json')
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


def bake_a(old):
    floor = old['floor']
    survey_walk = surface(floor['walk'] + floor['islands'])
    combined = survey_walk.union(surface([face for row in floor['a4'] for face in row['faces']]))
    common_road = surface(floor['road']).difference(survey_walk)
    source_buildings = json.loads((MAPO/'public/data/aerial-pilot.json').read_text())['buildings']
    segments = list(link_segments(features('a2-expanded')))
    crossings = []
    for row in old['crossings']:
        if row['stripes']:
            crossings.append(row)
            continue
        result = choose_direction(surface(row['faces']), segments)
        stripes = [ring for stripe in offset_zebra(surface(row['faces']), result['chosen']['angle'])
                   for ring in rings(stripe)] if result['method']=='spatial-crossing' else []
        crossings.append({**row, 'stripes':stripes, 'spatial':result})
    return {
        'views': [view for view in old['views'] if view['mode']=='photo'],
        'floor': {'road':floor['road'], 'walk':rings(combined), 'islands':[], 'a4':[]},
        'lines': [row for row in old['lines'] if row['kind'] in LINE_KINDS],
        'crossings':crossings, 'bicycles':[], 'links':[],
        'hiddenBuildingOutlines':outline_exclusions(source_buildings, common_road),
    }


if __name__=='__main__':
    result = bake_a(json.loads(ASSET.read_text()))
    OUTPUT.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':'))+'\n')
