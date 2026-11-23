"""Supplement B3 crossings from survey faces and audit access at both ends."""
import json
import math
from itertools import pairwise

from shapely import make_valid
from shapely.geometry import LineString, Point, Polygon
from shapely.ops import unary_union

from hapjeong_hd import (FRAME, MAPO, RAW, WINDOW, dbf, even_odd, face_rings, features,
                         offset_zebra, parts, paths, project, rings, shapes, tm_to_ll)


def half_metre_routes(*areas):
    # Reunite edges produced by clipping before measuring clearance in metres.
    tolerance = 1e-7
    return parts(unary_union([area.buffer(tolerance) for area in areas]).buffer(-.25-tolerance),'Polygon')


def crossing_sources():
    topo = []
    for sheet in sorted((RAW.parent/'suchi/sheets').iterdir()):
        stem = sheet/'N1A_A0043325.shp'
        if not stem.exists():
            continue
        _, rows = dbf(stem.with_suffix('.dbf'))
        for (kind, raw_rings), row in zip(shapes(stem), rows, strict=True):
            if kind != 5:
                continue
            face = even_odd([[project(tm_to_ll(e,n)[::-1]) for e,n in ring] for ring in raw_rings])
            if face is not None:
                topo.extend((row['UFID'], p) for p in parts(face, 'Polygon') if WINDOW.covers(p.centroid))
    seoul = []
    for row in json.loads((MAPO/'tools/raw/seoul-crosswalks.json').read_text())['areas']:
        face = make_valid(Polygon([FRAME.project(p[::-1]) for p in row['ring']]))
        seoul.extend((row['id'], p) for p in parts(face, 'Polygon') if WINDOW.covers(p.centroid))
    return topo, seoul


def crossing_axis(face, heading=None):
    if heading is None:
        edges = list(pairwise(face.minimum_rotated_rectangle.exterior.coords))
        caps = sorted(edges, key=lambda edge: math.dist(*edge))[:2]
        midpoints = [LineString(cap).interpolate(.5, normalized=True) for cap in caps]
        width = min(math.dist(*cap) for cap in caps)
    else:
        x,z = face.centroid.coords[0]
        span = math.dist(face.bounds[:2],face.bounds[2:])
        midpoints = [(x+d*span*math.cos(heading),z+d*span*math.sin(heading)) for d in (-1,1)]
    axis = max(parts(face.intersection(LineString(midpoints)), 'LineString'), key=lambda line: line.length)
    a,b = axis.coords[0],axis.coords[-1]
    if heading is not None:
        width = face.area / axis.length
    return a,b,width,math.atan2(b[1]-a[1], b[0]-a[0])


def overlap(a, b):
    return a.intersection(b).area / min(a.area, b.area)


def agreement(a, b):
    share = overlap(a,b)
    if share < .25:
        return 0
    angle = crossing_axis(a)[3] - crossing_axis(b)[3]
    return share if abs(math.sin(angle)) <= math.sin(math.radians(15)) else 0


def expanded_walk(existing):
    known = {row['id'] for row in existing}
    return unary_union([Polygon(outer,holes) for row in features('a4-expanded')
                        if row['properties']['id'] not in known and row['properties']['subtype']=='3'
                        for outer,*holes in face_rings(row)]).intersection(WINDOW)


def survey_heading(face, painted):
    weights = []
    for row, paint in painted:
        share = face.intersection(paint).area
        if share < .15*face.area:
            continue
        angles = [d['angle'] for d in row['directions'] if d['angle'] is not None]
        if row.get('spatial') and row['spatial']['method']=='spatial-crossing':
            angles.append(row['spatial']['chosen']['angle'])
        weights.extend((share,angle+math.pi/2) for angle in angles)
    x = sum(weight*math.cos(2*angle) for weight,angle in weights)
    y = sum(weight*math.sin(2*angle) for weight,angle in weights)
    if x or y:
        if math.hypot(x,y) >= math.cos(math.pi/6)*sum(weight for weight,_ in weights):
            return math.atan2(y,x)/2
    return None


def approach(end, other, width, walk_parts, forbidden, crossing, reach):
    # Look outward through the painted end, never sideways to the same curb.
    length = math.dist(end,other)
    dx,dz = (end[0]-other[0])/length,(end[1]-other[1])/length
    point = Point(end)
    ray = LineString([end,(end[0]+dx*reach,end[1]+dz*reach)])
    hits = [(point.distance(section), i) for i,face in enumerate(walk_parts)
            if not (section := face.intersection(ray)).is_empty]
    if not hits:
        return {'end':end, 'status':'no-walk-in-outward-range','distance':None,'walkComponent':None,'faces':[]}
    gap, component = min(hits)
    status = 'joined' if gap <= width/2 else 'gap-exceeds-half-width'
    faces = []
    if status=='joined':
        # The narrow approach reaches existing pavement, while the paint keeps its surveyed outline.
        landing = LineString([(end[0]-dx*.2,end[1]-dz*.2),
                              (end[0]+dx*(gap+.25),end[1]+dz*(gap+.25))]).buffer(width/6,cap_style='flat')
        if landing.intersects(forbidden):
            status = 'blocked-by-lane-or-building'
        else:
            faces = rings(landing.difference(crossing))
    return {'end':end,'status':status,'distance':gap,'walkComponent':component,'faces':faces}


def survey_continuations(audit, surveyed):
    """Recognize coincident limits of two measured halves without paving traffic space."""
    direct = [row for row in audit if all(end['status']=='joined' for end in row['approaches'])]
    for row in audit:
        for end, opposite in (row['approaches'], row['approaches'][::-1]):
            if end['status']=='joined':
                continue
            p = Point(end['end'])
            q = Point(opposite['end'])
            length = p.distance(q)
            ray = LineString([p,(p.x+.1*(p.x-q.x)/length,p.y+.1*(p.y-q.y)/length)])
            for other in direct:
                if other['id']==row['id'] or abs(math.sin(other['axisHeading']-row['axisHeading']))>.26:
                    continue
                piece = surveyed[other['id']].intersection(ray)
                if piece.length>.02 and p.distance(piece)<.02:
                    end.update(status='adjacent-survey-crossing',distance=p.distance(piece),
                               walkComponent=None, adjacent=other['id'])
                    break


def supplement_crossings(b3, walk, building_faces):
    topo,seoul = crossing_sources()
    walk_parts = sorted(parts(walk,'Polygon'),key=lambda face: face.bounds)
    lanes = unary_union([LineString(path) for row in features('a2-expanded') for path in paths(row)])
    forbidden = lanes.buffer(.75).union(building_faces)
    painted = [(row,unary_union([Polygon(outer,holes) for outer,*holes in row['faces']])) for row in b3]
    primary = unary_union([face for _,face in painted])
    rows = []
    audit = []
    for id, face in topo:
        covered = face.intersection(primary).area >= face.area*.15
        score, city_id = max((agreement(face,city), key) for key,city in seoul)
        a,b,width,heading = crossing_axis(face,survey_heading(face,painted) if covered else None)
        approaches = [approach(end,other,width,walk_parts,forbidden,face,4*width) for end,other in ((a,b),(b,a))]
        entry = {'id':id, 'axisHeading':heading, 'approaches':approaches, 'faces':rings(face)}
        if covered:
            audit.append({**entry,'status':'covered-by-b3'})
            continue
        # Survey-only faces qualify when both ends match measured opposing kerbs within survey tolerance.
        curb_confirmed = (all(p['status']=='joined' and p['distance'] <= .15 for p in approaches)
                          and approaches[0]['walkComponent'] != approaches[1]['walkComponent'])
        if not score and not curb_confirmed:
            audit.append({**entry,'status':'unconfirmed'})
            continue
        stripes = [ring for stripe in offset_zebra(face,heading+math.pi/2) for ring in rings(stripe)]
        rows.append({'id':id,'source':'수치지형도 A0043325','seoulId':city_id if score else None,
                     'overlap':score,'axisHeading':heading,'approaches':approaches,
                     'faces':rings(face),'stripes':stripes})
        audit.append({**entry,'status':'supplemented'})
    survey_continuations([row for row in audit if row['status']!='unconfirmed'],dict(topo))
    return rows,audit
