"""Build a local intersection from Seoul's public A058/A055 and crossing areas.

Pass longitude, latitude and the side of the camera-aligned square in metres.
Requires Shapely 2. The hand trace and restricted survey data are not inputs.
"""
import argparse
from dataclasses import dataclass, replace
import json
import math
from pathlib import Path
from statistics import median

from shapely import affinity
from shapely.geometry import GeometryCollection, LineString, Point, Polygon, box
from shapely.ops import unary_union
from shapely.validation import make_valid

from aerial_paint import line_footprint, style
from aerial_placement import deduplicate_marks, duplicate_face, place_arrows, stop_shadows as dependent_stop_shadows
from aerial_rules import is_guide, move_stop, road_extent, zebra

MAPO = Path(__file__).resolve().parents[2]
RAW = MAPO / 'tools/raw'
SCALE = 6378137 * math.cos(math.radians(37.5515))  # src/aerial/map.ts
CAMERA = 42.0
ARMS = ((1, -1), (1, 1), (0, -1), (0, 1))
CORNERS = ((-1, -1, 'NW'), (-1, 1, 'SW'), (1, 1, 'SE'), (1, -1, 'NE'))
APPROACH = {1, 6, 8, 17}
EDGE = {9, 10, 11}


def mercator(lat):
    return math.asinh(math.tan(math.radians(lat)))


@dataclass(frozen=True)
class Frame:
    lon: float
    lat: float
    angle: float = CAMERA

    def project(self, p):
        lon, lat = p
        return self.vector(SCALE * math.radians(lon - self.lon), SCALE * (mercator(self.lat) - mercator(lat)))

    def vector(self, x, y):
        a = math.radians(self.angle)
        return x * math.cos(a) + y * math.sin(a), -x * math.sin(a) + y * math.cos(a)

    def geographic(self, x, y):
        a = math.radians(self.angle)
        east, south = x * math.cos(a) - y * math.sin(a), x * math.sin(a) + y * math.cos(a)
        return [round(self.lon + math.degrees(east / SCALE), 7),
                round(math.degrees(math.atan(math.sinh(mercator(self.lat) - south / SCALE))), 7)]


@dataclass(frozen=True)
class Mark:
    id: str
    kind: int
    subtype: int
    geom: object
    fixes: tuple = ()
    photo: str = 'unassessed'


def read(name, field):
    return json.loads((RAW / f'seoul-{name}.json').read_text())[field]


def parts(geom, kind):
    if geom.is_empty:
        return []
    if geom.geom_type == kind:
        return [geom]
    return [g for child in getattr(geom, 'geoms', ()) for g in parts(child, kind)]


def line_parts(geom):
    return [p for p in parts(geom, 'LineString') if p.length > .025]


def polygon_parts(geom):
    return [p for p in parts(geom, 'Polygon') if p.area > .0025]


def square(frame, size):
    return affinity.rotate(box(-size/2, -size/2, size/2, size/2), CAMERA-frame.angle, origin=(0,0))


def direction(line):
    a, b = line.coords[0], line.coords[-1]
    return math.atan2(b[1]-a[1], b[0]-a[0])


def load_lines(rows, frame, window):
    lines = {}
    for index, row in enumerate(rows):
        if len(row['p']) < 2:
            continue
        g = LineString([frame.project(p[::-1]) for p in row['p']])
        if not g.intersects(window):
            continue
        geom = g.intersection(window)
        if geom.length > .05:
            key = f'L{index}'
            lines[key] = Mark(key, int(row['k']), int(row['k2']), geom)
    return lines


def fitting_frame(lanes, centre, size):
    camera = Frame(*centre)
    trial = load_lines(lanes, camera, square(camera, size))
    middle = Point(0, 0)
    bearings = [(direction(p), p.length) for l in trial.values() if l.kind == 1
                for p in line_parts(l.geom) if p.distance(middle) < size/4 and p.length > 12]
    if not bearings:
        return camera
    mean = math.atan2(sum(math.sin(4*a)*w for a,w in bearings),
                      sum(math.cos(4*a)*w for a,w in bearings)) / 4
    return replace(camera, angle=CAMERA+math.degrees(mean))


def arm_at(point):
    axis = max((0,1), key=lambda i: abs(point[i]))
    return axis, 1 if point[axis] >= 0 else -1


def armpoint(axis, along, across):
    return (along, across) if axis == 0 else (across, along)


def extent(geom, axis):
    return geom.bounds[axis], geom.bounds[axis+2]


def crossing_arms(crossings):
    arms = {}
    for key, (_, face, _) in crossings.items():
        point = face.centroid
        arm = arm_at((point.x, point.y))
        prior = arms.get(arm)
        if prior is None or point.distance(Point(0,0)) < crossings[prior][1].centroid.distance(Point(0,0)):
            arms[arm] = key
    return arms


def edge_candidates(lines, axis, sign, far, across, side, width):
    candidates = []
    for f in lines.values():
        if f.kind not in EDGE:
            continue
        for line in line_parts(f.geom):
            for a,b in zip(line.coords, list(line.coords)[1:]):
                reach = abs(a[axis]-b[axis])
                lateral = abs(a[1-axis]-b[1-axis])
                if reach < .7 or lateral > min(1.5, .16*reach):
                    continue
                inner, outer = sorted((sign*a[axis],sign*b[axis]))
                if outer < far - 10 or inner > far + 28:
                    continue
                # Predict position at the outer edge of the crossing. Selection
                # only considers the respective side and follows curb paint.
                near = a[1-axis]+(b[1-axis]-a[1-axis])*(sign*far-a[axis])/(b[axis]-a[axis])
                if abs(near-across) > max(5, width*.23):
                    continue
                score = abs(near-across) + .12*max(0, inner-far) + .035*max(0,far-outer)
                m = (b[1-axis]-a[1-axis])/(b[axis]-a[axis])
                if reach < 3:
                    # A local tangent point supplies position only. Very short
                    # paint segments cannot establish the bearing of the arm.
                    near = (a[1-axis]+b[1-axis])/2
                    m = 0
                    score += .15
                candidates.append((score, f.id, m, near-m*sign*far))
    if not candidates:
        return None
    return min(candidates)


def corner_arc(x_edge, y_edge, sx, sy, source, override):
    _, vx, bx = x_edge
    _, hy, by = y_edge
    x0 = (vx*by+bx)/(1-vx*hy)
    y0 = hy*x0+by
    # Rays into the two approaches (east/south frame). The centre and tangent
    # distances follow the angle bisector, so the arc meets both inferred rays.
    def unit(x,y):
        length = math.hypot(x,y)
        return (x/length,y/length)
    u = unit(vx*sy, sy)
    v = unit(sx,hy*sx)
    bis = unit(u[0]+v[0], u[1]+v[1])
    half = math.acos(max(-1,min(1,u[0]*v[0]+u[1]*v[1])))/2
    candidates = []
    for f in source.values():
        if f.kind not in EDGE:
            continue
        for line in line_parts(f.geom):
            for x,y in list(line.coords)[1:-1]:
                dx,dy = x-x0,y-y0
                if not (.8 < sx*dx < 10 and .8 < sy*dy < 10):
                    continue
                dot = dx*bis[0]+dy*bis[1]
                # |p - r*b/sin(half)|² = r². The larger root places the
                # sample on the corner-facing half of the circular arc.
                a = 1/math.sin(half)**2-1
                b = -2*dot/math.sin(half)
                c = dx*dx+dy*dy
                if b*b >= 4*a*c:
                    candidates.append(((-b+math.sqrt(b*b-4*a*c))/(2*a),f.id))
    if override:
        radius = override['metres']
    else:
        plausible = [r for r,_ in candidates if 3 <= r <= 18]
        radius = median(plausible) if plausible else 7
    tx, ty = (x0+bis[0]*radius/math.sin(half), y0+bis[1]*radius/math.sin(half))
    tangent = radius/math.tan(half)
    start = (x0+u[0]*tangent,y0+u[1]*tangent)
    end = (x0+v[0]*tangent,y0+v[1]*tangent)
    a, b = math.atan2(start[1]-ty,start[0]-tx), math.atan2(end[1]-ty,end[0]-tx)
    delta = (b-a+math.pi)%(2*math.pi)-math.pi
    arc = [(tx+radius*math.cos(a+delta*i/24),ty+radius*math.sin(a+delta*i/24)) for i in range(25)]
    sources = sorted({x_edge[0],y_edge[0],*(key for _,key in candidates)} - {None})
    return arc, start, end, radius, sources


def make_road(lines, crossings, arms, window, offset, radii):
    edges = {}
    for (axis, sign), key in arms.items():
        face = crossings[key][1]
        lo, hi = extent(face, 1-axis)
        far = max(sign*c for c in extent(face,axis))
        for side, across in ((-1,lo),(1,hi)):
            match = edge_candidates(lines,axis,sign,far,across,side,hi-lo)
            if match:
                _, id, slope, intercept = match
            else:
                # The mouth of the public crossing is still available if no
                # road-edge marking reaches this approach, e.g. a raised island.
                id,slope,intercept = None,0,across
            edges[axis,sign,side] = (id,slope,intercept+side*offset*math.hypot(1,slope))
    if set(arms) != set(ARMS):
        raise ValueError(f'need four crossing mouths, found {list(arms)}')

    outside = max(abs(n) for n in window.bounds)+25
    out = []
    ring = []
    for i,(sx,sy,name) in enumerate(CORNERS):
        x_edge = edges[1,sy,sx]
        y_edge = edges[0,sx,sy]
        arc, start, end, radius, sources = corner_arc(x_edge,y_edge,sx,sy,lines,radii.get(name))
        v = (x_edge[1]*sy*outside+x_edge[2],sy*outside)
        h = (sx*outside,y_edge[1]*sx*outside+y_edge[2])
        coords = [v,*arc,h]
        if i%2:
            coords.reverse()
        ring.extend(coords)
        out.append((name,LineString(coords).intersection(window),radius,sources,
                    'seoul-curb-paint' if x_edge[0] and y_edge[0] else 'includes-crossing-edge-fallback',
                    radii[name]['id'] if name in radii else None))
    road = make_valid(Polygon(ring)).intersection(window)
    if not polygon_parts(road):
        raise ValueError('curb reconstruction does not enclose a road')
    return road, out


def selector(features, target, frame):
    p = Point(frame.project(target['at']))
    if 'source' in target:
        candidates = [target['source']] if target['source'] in features else []
    else:
        candidates = list(features)
    hits = sorted((features[k].geom.distance(p),k) for k in candidates
                  if features[k].kind == target['kind'])
    if not hits or hits[0][0] > .30:
        raise ValueError(f'no source match within 30cm of {target}')
    if len(hits) > 1 and hits[1][0] - hits[0][0] < .05:
        raise ValueError(f'ambiguous source match {target}: {hits[:2]}')
    return hits[0][1]


def apply_fixes(lines, crossings, frame, fixes):
    raw = dict(lines)
    split = {}
    suppressed = []
    for fix in fixes:
        op, fixid = fix['op'],fix['id']
        if op in ('radius', 'zebra'):
            continue
        if op == 'add':
            lines[fixid] = Mark(fixid,fix['target']['kind'],fix['subtype'],
                                LineString([frame.project(p) for p in fix['points']]),(fixid,), 'confirmed')
            continue
        if op == 'expand':
            key = fix['target']['source']
            kind, face, _ = crossings[key]
            anchor = Point(frame.project(fix['target']['at']))
            if face.boundary.distance(anchor) > .30:
                raise ValueError(f'{fixid} crossing anchor is not on the source boundary')
            axis,sign = arm_at((face.centroid.x,face.centroid.y))
            lo,hi = extent(face,axis)
            origin = armpoint(axis,lo if sign==1 else hi,0)
            scale = 1+fix['metres']/(hi-lo)
            face = affinity.scale(face, xfact=scale if axis==0 else 1,
                                  yfact=scale if axis==1 else 1, origin=origin)
            crossings[key] = (kind,face,(fixid,))
            continue
        targets = fix.get('members', [fix['target']])
        for target in targets:
            key = selector(raw,target,frame)
            line = raw[key]
            if op == 'hide':
                del lines[key]
                suppressed.append({'id':key,'fix':fixid})
            elif op == 'shift':
                dx,dy = frame.vector(*fix['eastSouthMetres'])
                lines[key] = replace(line,geom=affinity.translate(line.geom,dx,dy),fixes=(fixid,),photo='confirmed')
            elif op == 'stop':
                split.setdefault(key,[]).append(fix)
            else:
                raise ValueError(f'unknown correction: {op}')
    return split,suppressed


def make_stops(mark, corrections, marks):
    source = max(line_parts(mark.geom),key=lambda p:p.length)
    mid = source.interpolate(.5,normalized=True)
    axis,sign = arm_at((mid.x,mid.y))
    # Fit the approach direction to public lane segments near each stop.
    local_slopes = []
    along = (mid.x,mid.y)[axis]
    for f in marks.values():
        if f.kind not in APPROACH:
            continue
        for p in line_parts(f.geom):
            for a,b in zip(p.coords,list(p.coords)[1:]):
                d = b[axis]-a[axis]
                if abs(d) > 6 and abs(b[1-axis]-a[1-axis]) < .16*abs(d) and min(a[axis],b[axis])-12 <= along <= max(a[axis],b[axis])+12:
                    if abs((a[1-axis]+b[1-axis])/2 - (mid.x,mid.y)[1-axis]) < 22:
                        local_slopes.append((b[1-axis]-a[1-axis])/d)
    slope = median(local_slopes) if local_slopes else 0
    transverse = median((p[1-axis] for p in source.coords))
    intervals = [(source.bounds[1-axis],source.bounds[3-axis])]
    # A source marking can be a single line across two independently
    # staggered lane groups. Partition it at the recorded lane divider.
    if len(corrections) > 1:
        if len(corrections) != 2 or not all(c.get('divider')==corrections[0].get('divider') for c in corrections):
            raise ValueError(f'{mark.id} needs two disjoint stop intervals')
        divider = marks[corrections[0]['divider']]
        segment = max(line_parts(divider.geom),key=lambda p:p.length)
        split = segment.interpolate(segment.project(mid)).coords[0][1-axis]
        (lo,hi), = intervals
        if not lo < split < hi:
            raise ValueError(f'{mark.id} divider must be inside the source width')
        # Apply a common transverse axis and split it at the lane divider.
        intervals = [(lo,split-.003),(split+.003,hi)]
        corrections = sorted(corrections,key=lambda e:e['part'])
        if [c['part'] for c in corrections] != [0,1]:
            raise ValueError(f'{mark.id} requires each of the two parts once')
    length = math.hypot(1,slope)
    for i, (lo,hi) in enumerate(intervals):
        fix = corrections[i] if corrections else None
        shift = sign*fix['metres'] if fix else 0
        geom = LineString([armpoint(axis,along+(shift-slope*(u-transverse))/length,
                                    transverse+(u-transverse+slope*shift)/length) for u in (lo,hi)])
        id = f"{mark.id}:{fix['id']}" if len(intervals)>1 else mark.id
        yield replace(mark,id=id,geom=geom,fixes=(fix['id'],) if fix else (),
                      photo='confirmed' if fix else mark.photo)


def approach_stop_shadows(stops, crossings, arms):
    shadows = []
    for stop in stops:
        segment = max(line_parts(stop.geom),key=lambda p:p.length)
        mid = segment.interpolate(.5,normalized=True)
        axis,sign = arm_at(mid.coords[0])
        face = crossings[arms[axis,sign]][1]
        inner,outer = sorted(sign*x for x in extent(face,axis))
        position = sign*mid.coords[0][axis]
        depth = position-inner
        # Scope a stop to the crossing it can serve. A second stop for a
        # peripheral junction is still painted, without cutting this approach.
        if position < outer or position-outer > 18:
            continue
        a,b = segment.coords[0],segment.coords[-1]
        def inward(point):
            p = list(point)
            p[axis] -= sign*depth
            return p
        shadows.append(Polygon([a,b,inward(b),inward(a)]))
    return unary_union(shadows)


def stripe_faces(face, axis, across_phase):
    polygon = face.minimum_rotated_rectangle
    bearings = [direction(LineString([a,b])) for a,b in zip(polygon.exterior.coords,list(polygon.exterior.coords)[1:])]
    axis_angle = (1-axis)*math.pi/2
    angles = [(angle-axis_angle+math.pi/2)%math.pi-math.pi/2 for angle in bearings]
    rotation = math.degrees(min(angles,key=abs))
    origin = face.centroid.coords[0]
    face = affinity.rotate(face,-rotation,origin=origin)
    lo,hi = extent(face,1-axis)
    lo_a,hi_a = extent(face,axis)
    if across_phase:
        mid = (lo_a+hi_a)/2
        along_ranges = [(lo_a,mid),(mid,hi_a)]
    else:
        along_ranges = [(lo_a,hi_a)]
    halves, stripes = [], []
    for i,(start,end) in enumerate(along_ranges):
        bounds = [armpoint(axis,start,lo-1), armpoint(axis,end,hi+1)]
        half = face.intersection(box(*(min(a,b) for a,b in zip(*bounds)),
                                     *(max(a,b) for a,b in zip(*bounds))))
        halves.extend(polygon_parts(half))
        # Same half-metre white / half-metre gap as render/signals.ts.
        for j in range(math.ceil(hi-lo)+2):
            across = lo+j-.5*(i%2)
            lower = armpoint(axis,start-1,across)
            upper = armpoint(axis,end+1,across+.5)
            stripes.extend(polygon_parts(half.intersection(box(*(min(a,b) for a,b in zip(lower,upper)),
                                                               *(max(a,b) for a,b in zip(lower,upper))))))
    def restore(shapes):
        return [affinity.rotate(shape,rotation,origin=origin) for shape in shapes]
    return restore(halves),restore(stripes)


def calibrated_zebra(fix, frame, axis):
    """Generate regular painted bands from observed centres and two edge lines."""
    origin = frame.project(fix['target']['at'])
    delta = math.radians(fix['bearingDegrees']-frame.angle)
    width = fix['stripeWidth']
    if width<=0 or len(fix['halves'])!=2:
        raise ValueError(f"{fix['id']} needs a positive width and two calibrated halves")

    def coord(along, across):
        x,y = armpoint(axis,along,across)
        return (origin[0]+x*math.cos(delta)-y*math.sin(delta),
                origin[1]+x*math.sin(delta)+y*math.cos(delta))

    halves, stripes = [], []
    for half in fix['halves']:
        phase,pitch,count = half['phase'],half['pitch'],half['count']
        start,end = half['ends']
        if width>=pitch or count<1 or start>=end:
            raise ValueError(f"{fix['id']} has an invalid stripe grid")

        def band(lo,hi):
            def point(edge,across):
                return coord(edge+half['edgeSlope']*(across-phase),across)
            return Polygon([point(start,lo),point(end,lo),point(end,hi),point(start,hi)])

        halves.append(band(phase-width/2,phase+(count-1)*pitch+width/2))
        estimates = set()
        for first,last in half['estimated']:
            if not 0<=first<=last<count:
                raise ValueError(f"{fix['id']} estimates a stripe outside its half")
            estimates.update(range(first,last+1))
        for i in range(count):
            x = phase+i*pitch
            stripes.append((band(x-width/2,x+width/2),i in estimates))
    return halves,stripes


def cut_guide_at_zebras(mark, zebras, frame, margin):
    if not zebras:
        return
    lines = [LineString([frame.project(p) for p in path]) for path in mark['parts']]
    axes = unary_union(lines)
    ink = line_footprint(mark,frame.project)
    touched = [half for half in zebras if
               half.intersection(axes).length>1e-7 or half.intersection(ink).area>1e-7]
    if not touched:
        return
    # Each half includes the spaces between stripes. Leave the dash phase
    # and the rest of each guide untouched outside its existing clearance.
    boundary = unary_union(touched).buffer(margin)
    pieces = []
    for line in lines:
        for kept in line_parts(line.difference(boundary)):
            a = line.project(Point(kept.coords[0]))
            b = line.project(Point(kept.coords[-1]))
            if a>b:
                kept,a = kept.reverse(),b
            pieces.append((a,[frame.geographic(*p) for p in kept.coords]))
    mark['parts'] = [path for _,path in pieces]
    # The dash begins at its position on the old path after shortening.
    mark['phase'] = [round(a,4) for a,_ in pieces]


def build(centre, size, config, end=None):
    fixes = config.get('fixes',[])
    if len(fixes)>20 or len({f['id'] for f in fixes})!=len(fixes) or any(not f['why'] or not f['photo'] for f in fixes):
        raise ValueError('at most 20 distinct corrections with reasons and photo evidence')
    rules_only = not config
    if end and not rules_only:
        raise ValueError('a corridor requires source-only rules')
    lanes = read('lanes','lanes')
    frame = fitting_frame(lanes,centre,size)
    route = LineString([(0,0),frame.project(end)]) if end else None
    window = route.buffer(size/2,cap_style='square') if route else square(frame,size)
    lines = load_lines(lanes,frame,window)
    crossings = {}
    for row in read('crosswalks','areas'):
        ring = Polygon([frame.project(p[::-1]) for p in row['ring']])
        if ring.is_empty or not ring.intersects(window):
            continue
        face = make_valid(ring).intersection(window)
        if face.area > .1:
            crossings[row['id']] = (row['kind'],face,())
    calibrations = {}
    for fix in (f for f in fixes if f['op']=='zebra'):
        key = fix['target']['source']
        if (key in calibrations or key not in crossings or
                crossings[key][1].boundary.distance(Point(frame.project(fix['target']['at'])))>.30):
            raise ValueError(f"{fix['id']} does not uniquely identify a source crossing boundary")
        calibrations[key] = fix
    corrections,suppressed = apply_fixes(lines,crossings,frame,fixes)
    for tag in config.get('unverified',[]):
        key = selector(lines,tag,frame)
        lines[key] = replace(lines[key],photo='occluded')
    for observation in config.get('differences',[]):
        key = observation['source']
        lines[key] = replace(lines[key],photo='reference-mismatch')
    arms = crossing_arms(crossings) if not route else {}
    fit_crossing = not rules_only or set(arms)==set(ARMS)
    if fit_crossing:
        radii = {f['target']['corner']:f for f in fixes if f['op']=='radius'}
        road,curbs = make_road(lines,crossings,arms,window,config.get('curbOffsetMetres',0),radii)
    else:
        road = road_extent(RAW,frame,window)
        curbs = []

    def coords(seq):
        return [frame.geographic(x,y) for x,y in seq]

    def line_coords(shape):
        return [coords(line.simplify(.018).coords) for line in line_parts(shape)]

    def rings(shape):
        return [coords(p.exterior.coords) for p in polygon_parts(shape)]

    road_faces = rings(road)
    paintable = road.buffer(-.012)
    crosses = []
    guide_zebras = []
    for key,(kind,face,fixids) in crossings.items():
        if not face.intersects(road) or face.intersection(road).area < .1:
            continue
        face = max(polygon_parts(face),key=lambda g:g.area)
        axis,_ = arm_at((face.centroid.x,face.centroid.y))
        calibration = calibrations.get(key)
        if calibration:
            source_face = coords(face.exterior.coords)
            halves,marked = calibrated_zebra(calibration,frame,axis)
            face = unary_union(halves).convex_hull
            fixids = (*fixids,calibration['id'])
        else:
            halves,stripes = (zebra(face,'이단' in kind) if rules_only else stripe_faces(face,axis,'이단' in kind))
            marked = [(stripe,False) for stripe in stripes]
        halves = [part for half in halves for part in polygon_parts(half)]
        shapes = [(part,estimated) for stripe,estimated in marked
                  for part in polygon_parts(stripe.intersection(paintable))]
        result = {'id':key,'kind':kind,'source':'seoul','fixes':fixids,
                  'face':coords(face.exterior.coords),'halves':[coords(p.exterior.coords) for p in halves],
                  'stripes':[coords(p.exterior.coords) for p,_ in shapes]}
        if calibration:
            result['sourceFace'] = source_face
            result['estimatedStripes'] = [i for i,(_,estimated) in enumerate(shapes) if estimated]
            guide_zebras.extend(halves)
        crosses.append(result)
    facility_duplicates = []
    kept_crosses = []
    geometries = {c['id']:Polygon([frame.project(p) for p in c['face']]) for c in crosses}
    for cross in sorted(crosses,key=lambda c:not bool(c['fixes'])):
        other = next((c for c in kept_crosses if c['kind']==cross['kind']
                      and duplicate_face(geometries[cross['id']],geometries[c['id']])),None)
        if other:
            facility_duplicates.append({'type':'crossing','id':cross['id'],'of':other['id']})
        else:
            kept_crosses.append(cross)
    kept_ids = {c['id'] for c in kept_crosses}
    crosses = [c for c in crosses if c['id'] in kept_ids]
    final_faces = [geometries[c['id']] for c in crosses]
    final_crossing_mask = unary_union(final_faces)
    # Include the original masks and recalculate ends against the final paint.
    crossing_mask = unary_union([crossings[c['id']][1] for c in crosses])
    faces = [crossings[c['id']][1] for c in crosses]
    if rules_only:
        junction = GeometryCollection()
        stop_shadows = GeometryCollection()
        stops = [replace(m,geom=unary_union([
                    move_stop(part,faces,style(m.kind,m.subtype)['w']) for part in line_parts(m.geom)]))
                 for m in lines.values() if m.kind==4]
        guide_ids = {m.id for m in lines.values() if is_guide(m,faces)}
    else:
        # Four arms are only used by the archived calibrated intersection.
        inner = {}
        for arm,key in arms.items():
            axis,sign = arm
            inner[arm] = min(sign*n for n in extent(crossings[key][1],axis))
        junction = box(-inner[0,-1],-inner[1,-1],inner[0,1],inner[1,1])
        stops = [s for m in lines.values() if m.kind==4
                 for s in ([m] if m.photo=='occluded' else make_stops(m,corrections.get(m.id,[]),lines))]
        stop_shadows = approach_stop_shadows(stops,crossings,arms)
    # Use final stop locations for the upstream boundary on both render paths.
    if rules_only:
        stop_shadows = dependent_stop_shadows(stops,final_faces)
    stop_mask = unary_union([s.geom.buffer(style(s.kind,s.subtype)['w']/2,cap_style='flat') for s in stops])
    marks,merged = deduplicate_marks([*(m for m in lines.values() if m.kind!=4),*stops])
    paint = []
    for mark in marks:
        if mark.kind in EDGE:
            continue
        geom = mark.geom
        if geom.length<=.025:
            continue
        in_junction = geom.intersection(junction).length / geom.length
        guide = mark.id in guide_ids if rules_only else mark.kind==12 or (mark.kind==17 and in_junction>.65)
        ink = style(mark.kind,mark.subtype)
        margin = ink['w']/2+ink['sep']+.015
        allowed = road.buffer(-margin)
        if mark.kind==4:
            # A stop has flat ends across its assigned lane span. Check the
            # two actual offset edges without shrinking that span by half a
            # paint width at the curb.
            stop = max(line_parts(geom),key=lambda p:p.length)
            a = direction(stop)
            half = ink['w']/2
            dx,dy = -math.sin(a)*half,math.cos(a)*half
            allowed = paintable.intersection(affinity.translate(paintable,dx,dy)).intersection(
                affinity.translate(paintable,-dx,-dy))
        if mark.kind in (1,2,3,5,6,8,17,18) and not guide:
            # Extend the end of each stop across just the local adjacent
            # boundary; the other staggered stop remains independent.
            gaps = junction.union(crossing_mask).union(final_crossing_mask).union(stop_mask)
            if mark.kind != 1:
                gaps = gaps.union(stop_shadows)
            geom = geom.difference(gaps.buffer(margin))
        if guide:
            geom = geom.difference(crossing_mask.union(stop_mask).buffer(margin))
        geom = geom.intersection(allowed)
        draw = line_coords(geom)
        if not draw:
            continue
        out = {'id':mark.id,'kind':mark.kind,'subtype':mark.subtype,'source':'photo' if mark.id==next(iter(mark.fixes),None) else 'seoul',
               'fixes':mark.fixes,'photo':mark.photo,'parts':draw}
        if mark.id in merged:
            out['mergedFrom'] = merged[mark.id]
        if guide:
            out['guide'] = True
            cut_guide_at_zebras(out,guide_zebras,frame,margin)
            if not out['parts']:
                continue
        if mark.kind==1 and mark.subtype>=3:
            # Offset the two rails before clipping, then remove equal small end
            # portions to keep the full 0.36 m centre separation at the caps.
            rails = [[],[]]
            for line in line_parts(geom):
                # Simplify road-centre knots to one stable curve before the two
                # matched offsets, using mitres to avoid unequal rail joins.
                line = line.simplify(.018)
                for i, offset in enumerate((-.18,.18)):
                    rails[i].append(coords(line.offset_curve(offset,join_style='mitre').coords))
            out['stripes'] = rails
        paint.append(out)
    observations = {item['source']:item for item in config.get('arrowUnverified',[])}
    raw_stops = []
    near_window = window.buffer(100)
    for i,row in enumerate(lanes):
        if int(row['k'])!=4 or len(row['p'])<2:
            continue
        path = [p[::-1] for p in row['p']]
        if near_window.intersects(LineString([frame.project(p) for p in path])):
            raw_stops.append({'id':f'L{i}','parts':[path]})
    arrows,omitted,source_count,without_source,lane_count = place_arrows(read('arrows','arrows'),window,road,frame,
                                               [m for m in lines.values() if m.kind!=4],
                                               paint,crosses,observations,raw_stops)
    ground = {'version':1,'centre':centre,'size':size,'frame':rings(window)[0],
            'road':road_faces,'curbOffsetMetres':config.get('curbOffsetMetres',0),
            'curbs':[{'corner':name,'parts':line_coords(g),'radius':round(r,3),'sources':sources,
                      'source':source,'fixes':[fix] if fix else []} for name,g,r,sources,source,fix in curbs],
            'lines':paint,'crossings':crosses,'arrows':arrows,
            'arrowInventory':{'frameRows':source_count,'placed':len(arrows),'omitted':omitted,
                              'mappedStopLanes':lane_count,'noMatchedSource':without_source},
            'duplicates': [*facility_duplicates,*({'type':'line','id':key,'of':primary}
                         for primary,keys in merged.items() for key in keys)],
            'fixes':[f['id'] for f in fixes],'hidden':suppressed}

    if rules_only:
        safety = []
        for row in read('safety','zones'):
            face = make_valid(Polygon([frame.project(p[::-1]) for p in row['ring']])).intersection(window)
            if face.area<=.01:
                continue
            other = next((item for item in safety if item[1]==row['kind'] and duplicate_face(item[2],face)),None)
            if other:
                ground['duplicates'].append({'type':'safety','id':row['id'],'of':other[0]})
            else:
                safety.append((row['id'],row['kind'],face))
        ground.update({
            'rulesOnly':True, 'end':end,
            'roadSource':'seoul-edge-fit' if fit_crossing else 'TL_SPRD_RW',
            'roadHoles':[[coords(ring.coords) for ring in p.interiors] for p in polygon_parts(road)],
            'safety':[{'id':key,'parts':rings(face)} for key,_,face in safety],
        })
        if not fit_crossing:
            ground['curbs'] = [{'source':'seoul-edge-paint','id':m.id,'parts':line_coords(m.geom),'fixes':[]}
                               for m in marks if m.kind in EDGE]
    return ground


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('lon',type=float)
    parser.add_argument('lat',type=float)
    parser.add_argument('size',type=float)
    parser.add_argument('output',type=Path)
    parser.add_argument('--fixes',type=Path)
    parser.add_argument('--corridor-end',nargs=2,type=float,metavar=('LON','LAT'))
    args = parser.parse_args()
    config = json.loads(args.fixes.read_text()) if args.fixes else {}
    data = build((args.lon,args.lat),args.size,config,end=args.corridor_end)
    content = json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n'
    if not args.corridor_end and len(content.encode())>100_000:
        raise SystemExit('generated data exceeds 100 KB')
    args.output.write_text(content)
    print(f'{args.output}: {len(content.encode())} B, {len(data["lines"])} lines, '
          f'{len(data["crossings"])} crossings, {len(data["arrows"])} arrows, {len(data["fixes"])} corrections')


if __name__ == '__main__':
    main()
