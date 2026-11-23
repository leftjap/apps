"""Shared, source-only rules for an aerial road window of any shape."""
import json
import math

from shapely import affinity
from shapely.geometry import Point, Polygon, box
from shapely.ops import unary_union
from shapely.validation import make_valid

PITCH = 1.1
STRIPE_WIDTH = .49
STOP_CLEARANCE = 1.0
DUPLICATE_DISTANCE = .6


def crossing_basis(face):
    """The long side is the walking axis. The short side follows traffic."""
    ring = list(face.minimum_rotated_rectangle.exterior.coords)
    dx,dy = max(((b[0]-a[0],b[1]-a[1]) for a,b in zip(ring,ring[1:])),
                key=lambda v:math.hypot(*v))
    # The polarity is stable if the polygon's winding or first vertex changes.
    turn = (math.atan2(dy,dx)+math.pi/2)%math.pi-math.pi/2
    return turn,(-math.sin(turn),math.cos(turn))


def zebra(face, staggered):
    turn,_ = crossing_basis(face)
    origin = face.centroid.coords[0]
    aligned = affinity.rotate(face,-turn,origin=origin,use_radians=True)
    lo,start,hi,end = aligned.bounds
    if staggered:
        seam = (start+end)/2
        bands = [(start,seam),(seam,end)]
    else:
        bands = [(start,end)]
    n = max(1,math.floor((hi-lo-STRIPE_WIDTH)/PITCH)+1)
    centre = (lo+hi)/2
    first = centre-(n-1)*PITCH/2
    halves,stripes = [],[]
    for i,(a,b) in enumerate(bands):
        half = aligned.intersection(box(lo,a,hi,b))
        halves.append(half)
        phase = first+i*PITCH/2
        for k in range(-1,n+1):
            x = phase+k*PITCH
            # Both ends are symmetric for the first half. The next half uses
            # the same grid shifted by half a period, clipped to its own face.
            if lo <= x <= hi:
                shape = half.intersection(box(x-STRIPE_WIDTH/2,a,x+STRIPE_WIDTH/2,b))
                if shape.area > 0:
                    stripes.append(shape)
    def restore(shapes):
        return [affinity.rotate(s,turn,origin=origin,use_radians=True) for s in shapes]
    return restore(halves),restore(stripes)


def move_stop(line, crossings, width):
    if not crossings:
        return line
    paint = line.buffer(width/2,cap_style='flat')
    face = min(crossings,key=paint.distance)
    if paint.distance(face) > STOP_CLEARANCE:
        return line
    _,normal = crossing_basis(face)
    def along(point):
        return point[0]*normal[0]+point[1]*normal[1]
    side = 1 if along(line.centroid.coords[0])>=along(face.centroid.coords[0]) else -1
    outer = max(side*along(p) for p in face.convex_hull.exterior.coords)
    inner = min(side*along(p) for p in paint.convex_hull.exterior.coords)
    shift = max(0,outer+STOP_CLEARANCE-inner)
    return affinity.translate(line,side*normal[0]*shift,side*normal[1]*shift)


def merge_guides(marks):
    """Suppress coextensive parallel source rows; retain joins and divergence."""
    kept,merged = [],{}
    for mark in sorted(marks,key=lambda m:(-m.geom.length,m.id)):
        other = next((m for m in kept if (m.kind,m.subtype)==(mark.kind,mark.subtype)
                      and parallel_duplicate(m.geom,mark.geom)),None)
        if other:
            merged.setdefault(other.id,[]).append(mark.id)
        else:
            kept.append(mark)
    return kept,merged


def parallel_duplicate(a,b,distance=DUPLICATE_DISTANCE):
    if a.geom_type!='LineString' or b.geom_type!='LineString' or a.crosses(b):
        return False
    delta = [(p.coords[-1][0]-p.coords[0][0],p.coords[-1][1]-p.coords[0][1]) for p in (a,b)]
    (ax,ay),(bx,by) = delta
    aligned = abs(ax*bx+ay*by)>=.985*math.hypot(ax,ay)*math.hypot(bx,by)
    return aligned and a.hausdorff_distance(b)<=distance


def road_extent(raw,frame,window):
    """Clip public road extent. Keep source holes and preserve joined streets."""
    inputs = json.loads((raw/'gis-roads.json').read_text())['roads']
    roads = []
    for row in inputs:
        extent = Polygon()
        for ring in row['r']:
            if len(ring)<4:
                continue
            face = Polygon([frame.project(p[::-1]) for p in ring])
            if window.intersects(face.envelope):
                extent = extent.symmetric_difference(make_valid(face).intersection(window))
        if extent.area>.01:
            roads.append(extent)
    if not roads:
        raise ValueError('no public road polygons in requested window')
    return unary_union(roads)


def is_guide(mark, crossings):
    if mark.kind==12:
        return True
    if mark.kind!=17 or mark.subtype!=2:
        return False
    # A cross-junction dashed bus guide has a different zebra near each end.
    matches = []
    for part in getattr(mark.geom,'geoms',(mark.geom,)):
        if part.geom_type!='LineString':
            continue
        for p in (part.coords[0],part.coords[-1]):
            nearest = min(enumerate(crossings),key=lambda f:f[1].distance(Point(p)),default=None)
            if nearest and nearest[1].distance(Point(p))<=6:
                matches.append(nearest[0])
    return len(set(matches))>=2
