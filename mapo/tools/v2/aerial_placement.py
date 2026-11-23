"""Source lane assignment and dependent paint placement in a common metre frame."""
import math

from shapely.geometry import LineString, Point, Polygon
from shapely.ops import unary_union

from aerial_paint import arrow_geometry, line_footprint, paint_definitions
from aerial_rules import parallel_duplicate

DUPLICATE_METRES = 1.0
ARROW_UPSTREAM_METRES = 6.0
BORDER_KINDS = {1,2,3,5,6,8,9,10,11,17,18}


def polylines(shape):
    if shape.geom_type=='LineString':
        return [shape] if shape.length>0 else []
    return [line for g in getattr(shape,'geoms',()) for line in polylines(g)]


def deduplicate_marks(marks):
    kept,merged = [],{}
    for mark in sorted(marks,key=lambda m:(not bool(m.fixes),-m.geom.length,m.id)):
        other = next((m for m in kept if (m.kind,m.subtype)==(mark.kind,mark.subtype)
                      and parallel_duplicate(m.geom,mark.geom,DUPLICATE_METRES)),None)
        if other:
            merged.setdefault(other.id,[]).append(mark.id)
        else:
            kept.append(mark)
    keep = {m.id for m in kept}
    return [m for m in marks if m.id in keep],merged


def duplicate_face(face, other):
    return (face.area>0 and other.area>0 and
            face.intersection(other).area>=.65*max(face.area,other.area) and
            face.hausdorff_distance(other)<=DUPLICATE_METRES)


def unit(dx,dy):
    length = math.hypot(dx,dy)
    return dx/length,dy/length


def shifted(p,v,t):
    return p[0]+v[0]*t,p[1]+v[1]*t


def dot(p,v):
    return p[0]*v[0]+p[1]*v[1]


def subtract(a,b):
    return a[0]-b[0],a[1]-b[1]


def lane_section(origin, forward, borders):
    side = (-forward[1],forward[0])
    cross = LineString([shifted(origin,side,-6),shifted(origin,side,6)])
    nearby = []
    for mark in borders:
        if mark.kind not in BORDER_KINDS or not cross.intersects(mark.geom):
            continue
        for line in polylines(mark.geom):
            hit = cross.intersection(line)
            for pt in getattr(hit,'geoms',(hit,)):
                if pt.geom_type!='Point' or pt.is_empty:
                    continue
                station = line.project(pt)
                a,b = [line.interpolate(t).coords[0] for t in (max(0,station-1), min(line.length,station+1))]
                tangent = unit(*subtract(b,a))
                alignment = dot(tangent,forward)
                if abs(alignment)<.85:
                    continue
                if alignment<0:
                    tangent = (-tangent[0],-tangent[1])
                across = dot(subtract(pt.coords[0],origin),side)
                nearby.append((across,mark.id,tangent))
    # A source point may be close to a separator. Choose the nearest pair
    # containing it, requiring a plausible distinct lane rather than a double line.
    candidates = [(a,b) for a in nearby for b in nearby if a[0]<=0<=b[0] and
                  a[1]!=b[1] and 1.9<=b[0]-a[0]<=5.5 and dot(a[2],b[2])>.94]
    if not candidates:
        return None
    a,b = min(candidates,key=lambda pair:(pair[1][0]-pair[0][0],abs(pair[0][0]+pair[1][0]),pair[0][1],pair[1][1]))
    tangent = unit(a[2][0]+b[2][0],a[2][1]+b[2][1])
    return shifted(origin,side,(a[0]+b[0])/2), tangent, (a[1],b[1]), b[0]-a[0]


def matching_stop(centre,tangent,stops,frame):
    ray = LineString([shifted(centre,tangent,-10),shifted(centre,tangent,95)])
    anchors = []
    for stop in stops:
        for coords in stop['parts']:
            line = LineString([frame.project(p) for p in coords])
            normal = unit(*subtract(line.coords[-1],line.coords[0]))
            if abs(dot(tangent,normal)) > .45:
                continue
            hit = ray.intersection(line)
            if hit.geom_type=='Point' and not hit.is_empty:
                along = dot(subtract(hit.coords[0],centre),tangent)
                anchors.append((abs(along),stop['id'],hit.coords[0]))
    return min(anchors,default=None)


def lane_slot(source,forward,borders,stops,frame,section=None):
    section = section or lane_section(source.coords[0], forward, borders)
    if not section:
        return None
    centre,tangent,edges,width = section
    anchor = matching_stop(centre,tangent,stops,frame)
    if anchor is None:
        return None
    _,stop,contact = anchor
    position = shifted(contact,tangent,-ARROW_UPSTREAM_METRES)
    # The same physical lane can have different source rows upstream and
    # near the stop. Canonicalize its two edges on the final cross-section.
    section = lane_section(position,tangent,borders)
    if section:
        position,tangent,edges,width = section
    east,south = rotated_to_ground(tangent,frame.angle)
    return {'point':Point(position),'bearing':round(math.degrees(math.atan2(-south,east)),5),
            'lane':list(edges),'laneWidth':round(width,3),'stop':stop}


def rotated_to_ground(vector,angle):
    a = math.radians(angle)
    x,y = vector
    return x*math.cos(a)-y*math.sin(a), x*math.sin(a)+y*math.cos(a)


def stop_shadows(stops, crossings):
    masks = []
    for stop in stops:
        for line in polylines(stop.geom):
            a,b = line.coords[0],line.coords[-1]
            tangent = unit(*subtract(b,a))
            normal = -tangent[1],tangent[0]
            face = min(crossings,key=line.distance,default=None)
            if face is None or line.distance(face)>18:
                continue
            middle = line.centroid.coords[0]
            advance = dot(subtract(face.centroid.coords[0],middle),normal)
            if abs(advance)>25:
                continue
            end_a,end_b = shifted(a,normal,advance),shifted(b,normal,advance)
            masks.append(Polygon([a,b,end_b,end_a]))
    return unary_union(masks)


def same_stop_lane(a,b,stop_axes,frame):
    if a['stop']!=b['stop']:
        return False
    if set(a['lane'])==set(b['lane']):
        return True
    p,q = frame.project(a['at']),frame.project(b['at'])
    if math.dist(p,q)<=DUPLICATE_METRES:
        return True
    if not set(a['lane']).intersection(b['lane']):
        return False
    edge = stop_axes[a['stop']]
    along = unit(*subtract(edge.coords[-1],edge.coords[0]))
    separation = abs(dot(subtract(p,q),along))
    # Fragments can disagree on one separator. A shared edge and more than
    # half of the smaller transverse interval identify the same stop slot.
    width_a,width_b = a['laneWidth'],b['laneWidth']
    overlap = (width_a+width_b)/2-separation
    return overlap>.5*min(width_a,width_b)


def same_kind_point(rows, kind, point):
    return next((key for other,source,key in rows
                 if other==kind and source.distance(point)<=DUPLICATE_METRES),None)


def place_arrows(rows, window, road, frame, borders, lines, crossings, observations, raw_stops=()):
    inputs = [(i,row,Point(frame.project((row['lon'],row['lat'])))) for i,row in enumerate(rows)]
    inputs = [(i,row,p) for i,row,p in inputs if window.covers(p)]
    stops = [line for line in lines if line['kind']==4]
    blocker = unary_union([*(line_footprint(line,frame.project) for line in stops),
                            *(Polygon([frame.project(p) for p in ring])
                              for c in crossings for ring in c['stripes'])])
    seen,candidates,omitted = [],[],[]
    definitions = paint_definitions()['arrows']
    for i,row,p in inputs:
        key,kind = f'A{i}',int(row['kind'])
        source = {'id':key,'kind':kind,'sourceAt':[row['lon'],row['lat']],
                  'sourceBearing':row['drn'],'photo':'occluded' if key in observations else 'unassessed'}
        prior = same_kind_point(seen,kind,p)
        if prior:
            omitted.append({**source,'reason':'point-duplicate','of':prior})
            continue
        seen.append((kind,p,key))
        if not definitions.get(str(kind)):
            omitted.append({**source,'reason':'unsupported-kind'})
            continue
        if not road.covers(p):
            omitted.append({**source,'reason':'source-outside-road'})
            continue
        angle = math.radians(row['drn'])
        forward = frame.vector(math.cos(angle),-math.sin(angle))
        section = lane_section(p.coords[0],forward,borders)
        slot = lane_slot(p,forward,borders,stops,frame,section) if section else None
        if not slot:
            if not section:
                reason = 'no-lane'
            else:
                anchor = matching_stop(section[0],section[1],raw_stops,frame)
                reason = ('no-stop' if anchor is None else 'source-stop-not-drawn' if window.covers(Point(anchor[2]))
                          else 'stop-outside-window')
            omitted.append({**source,'reason':reason})
            continue
        position = slot.pop('point')
        arrow = {**source,**slot,'at':frame.geographic(*position.coords[0]),'source':'seoul-lane',
                 'upstreamMetres':ARROW_UPSTREAM_METRES}
        geom = arrow_geometry(arrow,frame.project,frame.vector)
        candidates.append((p.distance(position),key,source,arrow,geom))
    stop_axes = {stop['id']:max((LineString([frame.project(p) for p in path])
                                for path in stop['parts']),key=lambda line:line.length) for stop in stops}
    placed,occupied = [],[]
    for _,_,_,arrow,geom in sorted(candidates,key=lambda t:t[:2]):
        near = next((a for a,_ in occupied if same_stop_lane(a,arrow,stop_axes,frame)),None)
        if near:
            reason = 'lane-already-assigned' if near['kind']==arrow['kind'] else 'lane-kind-conflict'
            omitted.append({**arrow,'reason':reason,'of':near['id']})
        elif not road.buffer(.005).covers(geom):
            omitted.append({**arrow,'reason':'placement-outside-road'})
        elif any(geom.intersection(g).area>1e-8 for _,g in occupied) or geom.intersection(blocker).area>1e-8:
            omitted.append({**arrow,'reason':'no-clear-placement-at-fixed-offset',
                            'blockingArrows':[a['id'] for a,g in occupied if geom.intersection(g).area>1e-8],
                            'blockingStopOrCrossing':round(geom.intersection(blocker).area,6)})
        else:
            placed.append(arrow)
            occupied.append((arrow,geom))
    faces = [Polygon([frame.project(p) for p in c['face']]) for c in crossings]
    missing = []
    sourced_lanes = {(a['stop'],*sorted(a['lane'])) for _,_,_,a,_ in candidates}
    eligible = set()
    for stop in stops:
        for coords in stop['parts']:
            line = LineString([frame.project(p) for p in coords])
            face = min(faces,key=line.distance,default=None)
            if face is None or line.distance(face)>18:
                continue
            along = unit(*subtract(line.coords[-1],line.coords[0]))
            normal = -along[1],along[0]
            towards = subtract(face.centroid.coords[0],line.centroid.coords[0])
            if dot(towards,normal)<0:
                normal = -normal[0],-normal[1]
            n = max(1,math.ceil(line.length/.5))
            for j in range(n):
                middle = line.interpolate((j+.5)/n,normalized=True).coords[0]
                p = shifted(middle,normal,-ARROW_UPSTREAM_METRES)
                section = lane_section(p,normal,borders)
                if section:
                    mid,tangent,edges,width = section
                    lane = (stop['id'],*sorted(edges))
                    eligible.add(lane)
    for stop,a,b in sorted(eligible-sourced_lanes):
        missing.append({'stop':stop,'lane':[a,b]})
    return placed,omitted,len(inputs),missing,len(eligible)
