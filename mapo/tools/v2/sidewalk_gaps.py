"""Connect short gaps in pavement at the mouths of roads without surveyed lanes."""
from itertools import combinations
import math

import numpy as np
from shapely import contains_xy, get_parts, union_all
from shapely.geometry import LineString, Point
from shapely.ops import nearest_points

from hapjeong_crossings import vehicle_clearance
from hapjeong_hd_a import surface
from hapjeong_hd import rings


def follows_sidewalk(part, point, direction):
    local = part.intersection(point.buffer(9))
    x0, z0, x1, z1 = local.bounds
    x, z = np.meshgrid(np.arange(x0, x1, .35), np.arange(z0, z1, .35))
    inside = contains_xy(local, x, z)
    if inside.sum() < 3:
        return False
    strength, axis = np.linalg.eigh(np.cov(np.stack((x[inside], z[inside]))))
    # Near a corner the patch need not have a long axis. Reject the
    # unmistakable opposite-curb case: a narrow sidewalk across the gap.
    return strength[1] < 4*strength[0] or abs(axis[:, 1] @ direction) >= .7


def lane_envelopes(lanes):
    return union_all([LineString(row['points']).buffer(vehicle_clearance(row['kind'])) for row in lanes])


def sidewalk_gaps(walk, floor, lanes, corridors, limit):
    parts = list(get_parts(walk.buffer(-.4)))
    ground = walk.union(surface(floor['floor']['road'])).buffer(1e-6)
    traffic = lane_envelopes(lanes)
    marked = {row['id']: surface(row['faces']) for row in floor['crossingAudit']}
    usable_marks = union_all([marked[key] for key in corridors])
    proposals, rejected = [], []
    for (i, p), (j, q) in combinations(enumerate(parts), 2):
        if p.distance(q) > limit + 3:
            continue
        start, end = nearest_points(p, q)
        if start.equals(end):
            continue
        line = LineString([start, end])
        outside = line.difference(walk)
        data = dict(at=[list(start.coords[0]), list(end.coords[0])], gap=round(outside.length, 3))
        if outside.length > limit:
            rejected.append({**data, 'reason': 'gap exceeds limit'})
            continue
        choices = []
        reasons = set()
        for half in (1.5, 1.25, 1., .85, .7):
            a, b = p.buffer(.4-half-.15), q.buffer(.4-half-.15)
            if a.is_empty or b.is_empty:
                reasons.add('insufficient sidewalk width')
                continue
            a, b = nearest_points(a, b)
            line = LineString([a, b])
            cut = line.difference(walk)
            if cut.geom_type != 'LineString' or not .25 < cut.length <= limit:
                reasons.add('not one short gap')
                continue
            strip = line.buffer(half, cap_style='flat')
            added = strip.difference(walk)
            if traffic.intersects(added):
                reasons.add('surveyed lane')
                continue
            if usable_marks.intersection(added).area > .15:
                reasons.add('existing crossing')
                continue
            if not ground.covers(strip) or not p.buffer(.4).covers(a.buffer(half)) or not q.buffer(.4).covers(b.buffer(half)):
                reasons.add('approach does not continue within pavement/road')
                continue
            # The end must lead into the sidewalk rather than touch its side
            # on the way across the road. Test the projected approach at both ends.
            ux, uz = (b.x-a.x)/line.length, (b.y-a.y)/line.length
            depth = min(1.2, half)
            if not (p.covers(Point(a.x-depth*ux,a.y-depth*uz)) and
                    q.covers(Point(b.x+depth*ux,b.y+depth*uz))):
                reasons.add('sidewalks do not face each other')
                continue
            if not follows_sidewalk(p, a, (ux, uz)) or not follows_sidewalk(q, b, (ux, uz)):
                reasons.add('opposite curb')
                continue
            choices.append((cut.length, -half, added, line))
        if not choices:
            rejected.append({**data, 'reason': ', '.join(sorted(reasons))})
            continue
        # Prefer the widest certified link unless it lengthens the crossing.
        shortest = min(row[0] for row in choices)
        length, half, added, line = min((row for row in choices if row[0] <= shortest+.6), key=lambda row: row[1])
        proposals.append((length, i, j, -half, added, line))
    root = list(range(len(parts)))

    def component(i):
        while i != root[i]:
            i = root[i]
        return i

    selected = []
    for length, i, j, half, strip, line in sorted(proposals, key=lambda row: row[:3]):
        data = dict(at=[list(p) for p in line.coords], gap=round(length, 3), width=2*half)
        if component(i) == component(j):
            rejected.append({**data, 'reason': 'already connected by a shorter link'})
            continue
        root[component(i)] = component(j)
        selected.append({**data, 'faces': rings(strip)})
    return selected, rejected


def widen_gap_bands(network, pavement, road, lanes, links, preserve_branches=False):
    """Replace slanted triangle legs across a gap with one centred walking band."""
    safe_pavement = pavement.buffer(-.4)
    ground = pavement.union(road).buffer(1e-6)
    traffic = lane_envelopes(lanes)
    widened = network
    for link in links:
        a, b = map(np.array, link['at'])
        vector = (b-a)/np.linalg.norm(b-a)
        side = vector[::-1]*[-1, 1]
        approach_widths = []
        for end, direction in ((a, -1), (b, 1)):
            widths_here = []
            for depth in (.5, 1, 1.5):
                at = end + direction*depth*vector
                cut = LineString([at-12*side, at+12*side]).intersection(safe_pavement)
                widths_here.extend(part.length for part in get_parts(cut) if part.distance(Point(at)) < 1e-7)
            approach_widths.append(min(widths_here, default=0))
        wanted = math.floor(min(approach_widths)*5+1e-7)
        gap = surface(link['faces'])
        current = widened if preserve_branches else network
        legs = {key for key in current.edges if LineString(key).intersection(gap).length > .05}
        ends = {point for key in legs for point in key if
                sum(point in leg for leg in legs) == 1}
        if len(ends) != 2 or not wanted:
            if preserve_branches:
                # A branched approach has no unique pair to replace. Its
                # original contained strips already certify the walk.
                link['bandFallback'] = 'branched or narrow junction'
                continue
            raise ValueError(f'Cannot match the sidewalk ends near {link["at"]}')
        start, stop = sorted(ends, key=lambda point: np.dot(point, vector))
        outside = LineString([a,b]).difference(pavement)
        if outside.geom_type != 'LineString':
            if preserve_branches:
                link['bandFallback'] = 'multiple pavement contacts'
                continue
            raise ValueError(f'Sidewalk band does not cross one gap near {link["at"]}')
        e0, e1 = map(np.array, (outside.coords[0],outside.coords[-1]))

        def rounded(point):
            return tuple(round(float(value), 1) for value in point)

        pairs = [(start, stop)]
        pairs.extend((rounded(e0-vector*depth+side*shift), rounded(e1+vector*depth+side*shift))
                     for depth in (.6,.9,1.2) for shift in (0, -.15, .15, -.3, .3, -.45, .45))
        for p, q in pairs:
            line = LineString([p, q])
            tangent = (np.array(q)-p)/line.length
            cap = LineString([p-.46*tangent, q+.46*tangent])
            strip = cap.buffer(wanted/10+.46, cap_style='flat')
            added = strip.difference(pavement)
            if not ground.covers(strip) or traffic.intersects(added):
                continue
            candidate = type(network)(widened.walk.union(strip).buffer(1e-7))
            approaches = [(outer, inner, candidate.band(outer,inner))
                          for outer,inner in ((start,p),(stop,q)) if outer != inner]
            if candidate.band(p,q) is None or any(band is None for _,_,band in approaches):
                continue
            for (k,l), band in widened.edges.items():
                if (k,l) not in legs:
                    candidate.edge(k,l,band)
            for outer,inner,band in approaches:
                candidate.edge(outer,inner,band)
            candidate.edge(p,q,(-wanted,wanted))
            link.update(bandMeters=wanted/5, approachMeters=[round(w,3) for w in approach_widths],
                        bandAxis=[p,q], faces=rings(gap.union(added)))
            widened = candidate
            break
        else:
            if preserve_branches:
                link['bandFallback'] = 'no contained centred band'
                continue
            raise ValueError(f'No centred sidewalk band fits near {link["at"]}')
    return widened
