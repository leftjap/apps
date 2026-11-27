"""Supplement B3 crossings from survey faces and audit access at both ends."""
import json
import math
from itertools import pairwise

from shapely import affinity, get_coordinates, make_valid, set_precision, STRtree
from shapely.geometry import LineString, Point, Polygon, box
from shapely.ops import unary_union

from hapjeong_hd import (AREA, FRAME, MAPO, SHEETS, WINDOW, dbf, even_odd, face_rings, features,
                         offset_zebra, parts, paths, project, rings, shapes, tm_to_ll)

CROSSING_KERB_GAP = 2.0
PAVING_KERB_GAP = .15


def half_metre_routes(*areas):
    # Reunite edges produced by clipping before measuring clearance in metres.
    tolerance = 1e-7
    return parts(unary_union([area.buffer(tolerance) for area in areas]).buffer(-.25-tolerance),'Polygon')


def crossing_sources():
    topo = []
    for sheet in sorted(SHEETS.iterdir()):
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
    source = AREA['sources'].get('seoulCrossings')
    for row in json.loads((MAPO/source).read_text())['areas'] if source else ():
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
    return unary_union([make_valid(Polygon(outer,holes)) for row in features('a4-expanded')
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


def approach(end, other, width, walk_parts, walk_index, forbidden, crossing, reach):
    # Look outward through the painted end, never sideways to the same curb.
    length = math.dist(end,other)
    dx,dz = (end[0]-other[0])/length,(end[1]-other[1])/length
    point = Point(end)
    ray = LineString([end,(end[0]+dx*reach,end[1]+dz*reach)])
    hits = [(point.distance(section), int(i)) for i in walk_index.query(ray)
            if not (section := walk_parts[i].intersection(ray)).is_empty]
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


def vehicle_clearance(kind):
    # General lanes carry passenger cars. Reserved and intersection lanes may
    # also carry a bus whose corners sweep wider than its 1.245m half-width.
    return 1.1 if kind == '6' else 1.65


def supplement_crossings(b3, walk, building_faces, road):
    topo,seoul = crossing_sources()
    walk_parts = sorted(parts(walk,'Polygon'),key=lambda face: face.bounds)
    walk_index = STRtree(walk_parts)
    rows = features('a2-expanded')
    if AREA.get('signals'):
        # A landing is inferred between measured surfaces. Leave room for the
        # vehicle body (including bus corner swing), not just the lane centre.
        lanes = unary_union([LineString(path).buffer(1.0 if row['properties']['linktype'] == '6' else 1.3)
                            for row in rows for path in paths(row)])
    else:
        lanes = unary_union([LineString(path) for row in rows for path in paths(row)]).buffer(.75)
    forbidden = lanes.union(building_faces)
    painted = [(row,unary_union([Polygon(outer,holes) for outer,*holes in row['faces']])) for row in b3]
    paint_index = STRtree([face for _, face in painted])
    primary = unary_union([face for _,face in painted])
    road_index = STRtree(parts(road, 'Polygon'))
    clip = AREA.get('coverage') or 'outline' in AREA
    rows = []
    audit = []
    paving = []
    for id, face in topo:
        covered = face.intersection(primary).area >= face.area*.15
        score, city_id = max(((agreement(face,city), key) for key,city in seoul), default=(0,None))
        nearby = [painted[i] for i in sorted(paint_index.query(face))] if covered else []
        a,b,width,heading = crossing_axis(face,survey_heading(face,nearby))
        approaches = [approach(end,other,width,walk_parts,walk_index,forbidden,face,4*width)
                      for end,other in ((a,b),(b,a))]
        entry = {'id':id, 'axisHeading':heading, 'approaches':approaches, 'faces':rings(face)}
        joined = all(p['status']=='joined' for p in approaches)
        opposite = approaches[0]['walkComponent'] != approaches[1]['walkComponent']
        gap = max(p['distance'] for p in approaches) if joined else math.inf
        # Retain the measured-pavement rule when admitting paint with a wider gap.
        if covered or score or (opposite and gap <= PAVING_KERB_GAP):
            paving.extend(face for p in approaches for face in p['faces'])
        if covered:
            audit.append({**entry,'status':'covered-by-b3'})
            continue
        visible = face.intersection(WINDOW) if clip else face
        area = visible.area
        if not joined:
            reason = 'unjoined-approach'
        elif not opposite:
            reason = 'same-walk-component'
        elif gap > CROSSING_KERB_GAP:
            reason = 'kerb-gap'
        elif not 4 <= area <= 800 or not 2.5 <= math.dist(a,b) <= 70:
            reason = 'size'
        elif sum(visible.intersection(road_index.geometries[i]).area for i in road_index.query(visible)) < .6*area:
            reason = 'off-road'
        elif sum(visible.intersection(painted[i][1]).area for i in paint_index.query(visible)) > .25*area:
            reason = 'b3-overlap'
        else:
            reason = None
        if reason:
            audit.append({**entry,'status':'unconfirmed','reason':reason})
            continue
        stripes = [ring for stripe in offset_zebra(face,heading+math.pi/2)
                   for ring in rings(stripe.intersection(WINDOW) if clip else stripe)]
        if len(stripes) < 2:
            audit.append({**entry,'status':'unconfirmed','reason':'too-few-stripes'})
            continue
        rows.append({'id':id,'source':'수치지형도 A0043325','seoulId':city_id if score else None,
                     'overlap':score,'axisHeading':heading,'approaches':approaches,
                     'faces':rings(face),'stripes':stripes})
        audit.append({**entry,'status':'supplemented'})
    survey_continuations([row for row in audit if row['status']!='unconfirmed'],dict(topo))
    return rows,audit,paving


LANDING_STRIP = .05
LANDING_REACH = 6
LANDING_SEAM = .09


def walking_landings(row, pavement, lanes, *, lane_index=None):
    """Extend the actual ends of the stripe to their adjoining pavements."""
    cross = unary_union([Polygon(outer, holes) for outer, *holes in row['faces']])
    a, b = [Point(end['end']) for end in row['approaches']]
    length = a.distance(b)
    ux, uz = (b.x-a.x)/length, (b.y-a.y)/length
    to_local = [ux, uz, -uz, ux, -a.x*ux-a.y*uz, a.x*uz-a.y*ux]
    to_world = [ux, -uz, uz, ux, a.x, a.y]
    project_local = lambda g: affinity.affine_transform(g, to_local)
    paint = project_local(cross)
    cap_a, lo, cap_b, hi = paint.bounds
    span = hi-lo
    # An A2 lane already traversed by this stripe is part of the crossing.
    search = cross.buffer(6+span)
    nearby_lanes = lanes if lane_index is None else (lanes[i] for i in sorted(lane_index.query(search)))
    forbidden = unary_union([line.buffer(width+.02, cap_style='flat') for line, width in nearby_lanes
                             if line.intersects(search) and line.intersection(cross).length < .1])
    nearby = project_local(pavement.intersection(search))
    blocked = project_local(forbidden)
    ends = []
    for cap, direction in [(cap_a, -1), (cap_b, 1)]:
        # The terminal section lies slightly inside the kerb so the join
        # survives coordinate rounding. Use the first full-width contact.
        best = (0, 0)
        for i in range(round(LANDING_REACH / LANDING_STRIP) + 1):
            distance = i*LANDING_STRIP
            at = cap + distance*direction
            cut = LineString([(at, lo), (at, hi)])
            ratio = cut.intersection(nearby.buffer(1e-7)).length / span
            if ratio > best[0] + .001:
                best = ratio, distance
            if ratio >= .995:
                break
        _, distance = best
        tip = cap + direction*distance
        # Keep the prior cap extension, and fill the wedges where a skew
        # paint edge does not reach that cap. Follow the same pavement
        # component as the centre of this end.
        patch = box(min(tip, cap-.2*direction), lo, max(tip,cap-.2*direction), hi)
        origin = a if direction < 0 else b
        components = parts(pavement, 'Polygon')
        if components:
            end_pavement = project_local(min(components, key=origin.distance))
            strips = []
            for i in range(math.ceil(span / LANDING_STRIP)):
                low = lo + i*LANDING_STRIP
                high = min(hi, low+LANDING_STRIP)
                y = (low+high)/2
                ray = LineString([(cap_a-LANDING_REACH, y), (cap_b+LANDING_REACH, y)])
                stripe = parts(paint.intersection(ray), 'LineString')
                if not stripe:
                    continue
                stripe_tip = max(max(direction*r.bounds[0], direction*r.bounds[2]) for r in stripe)
                contacts = [max(stripe_tip, min(direction*r.bounds[0], direction*r.bounds[2]))
                            for r in parts(end_pavement.intersection(ray), 'LineString')
                            if r.length >= .08 and max(direction*r.bounds[0], direction*r.bounds[2]) > stripe_tip]
                if not contacts or min(contacts)-stripe_tip > LANDING_REACH:
                    continue
                first, last = sorted((direction*(stripe_tip-LANDING_SEAM),
                                      direction*(min(contacts)+LANDING_SEAM)))
                strips.append(box(first, low, last, high))
            patch = patch.union(unary_union(strips))
        patch = patch.difference(paint.union(nearby))
        clipped = patch.intersection(blocked).area > 1e-6
        patch = patch.difference(blocked.buffer(1e-5))
        # Measure the width of the actual join at the pavement edge after
        # cutting away any encroachment on a neighbouring lane.
        contact = patch.boundary.intersection(nearby.buffer(1e-6))
        # Project each connected contact to the lateral axis. Union the
        # intervals so corners or multiple components cannot inflate width.
        intervals = []
        for part in parts(contact, 'LineString'):
            ys = get_coordinates(part)[:, 1]
            if len(ys) and max(ys)-min(ys)>1e-6:
                intervals.append(LineString([(0, min(ys)), (0, max(ys))]))
        ratio = max(best[0] if distance == 0 else 0, unary_union(intervals).length / span)
        connected = ratio > .01
        world = set_precision(make_valid(affinity.affine_transform(patch, to_world)), 1e-7)
        world = unary_union([p for p in parts(world, 'Polygon') if p.area > 1e-6])
        # A strip that cannot reach a pavement edge is not traversable.
        ends.append(dict(extension=round(distance, 2), ratio=round(min(1., ratio), 4),
                         connected=connected, clipped=clipped,
                         faces=rings(world) if connected else []))
    return ends
