"""Bake the Hapjeong A pavement into the original WalkJson coordinate format."""
import math
from collections import defaultdict
from itertools import pairwise
import json
import subprocess
from pathlib import Path

import numpy as np
from shapely import constrained_delaunay_triangles, contains_xy, get_parts
from shapely.geometry import LineString, Point, Polygon, box
from shapely.prepared import prep

from hapjeong_hd import ASSET, MAPO, ORIGIN, project
from hapjeong_hd_a import pedestrian_landings, surface

BODY = .4
EDGE_PAD = .025
CELL = .10
PORT_SHIFT = .15
PORT_REACH = 8


def dm(point):
    return tuple(round(value * 10) / 10 for value in point)


class Network:
    def __init__(self, walk):
        self.walk = walk
        self.safe = walk.buffer(-BODY)
        self.room = prep(self.safe)
        self.edges = {}
        self.nodes = defaultdict(set)

    def band(self, a, b):
        # Like walkfix, measure each side independently after dm rounding.
        # Here the surveyed pavement can certify the entire rectangle.
        line = LineString([a, b])
        if not self.room.covers(line) or line.distance(self.safe.boundary) < EDGE_PAD:
            return None
        length = line.length
        nx, nz = (a[1] - b[1]) / length, (b[0] - a[0]) / length

        def room(sign):
            lo, hi = 0, 80
            while lo < hi:
                m = (lo + hi + 1) // 2
                dx, dz = (m / 10 + EDGE_PAD) * nx * sign, (m / 10 + EDGE_PAD) * nz * sign
                tx, tz = nz * EDGE_PAD, -nx * EDGE_PAD
                start, end = (a[0]-tx, a[1]-tz), (b[0]+tx, b[1]+tz)
                if self.room.covers(Polygon([start, end, (end[0]+dx, end[1]+dz), (start[0]+dx, start[1]+dz)])):
                    lo = m
                else:
                    hi = m - 1
            return lo

        return -room(-1), room(1)

    def edge(self, a, b, band=None):
        if a == b:
            return False
        if a > b:
            a, b = b, a
            band = (-band[1], -band[0]) if band is not None else None
        if band is None:
            band = self.band(a, b)
        if band is None:
            return False
        self.edges[a, b] = band
        self.nodes[a].add(b)
        self.nodes[b].add(a)
        return True

    def pavement(self):
        for poly in get_parts(self.safe.buffer(-.07).simplify(.07)):
            owners = {}
            triangles = get_parts(constrained_delaunay_triangles(poly))
            for triangle in triangles:
                p = dm(triangle.centroid.coords[0])
                for a, b in pairwise(triangle.exterior.coords):
                    key = tuple(sorted((a, b)))
                    q = owners.setdefault(key, p)
                    if p != q and not self.edge(p, q):
                        middle = dm(((a[0] + b[0]) / 2, (a[1] + b[1]) / 2))
                        if self.safe.covers(LineString([p, middle, q]).buffer(EDGE_PAD)):
                            self.edge(p, middle)
                            self.edge(middle, q)

    def link_candidate(self, p, reach=math.inf, landing=False):
        if p in self.nodes:
            return p, None
        options = []
        for q in sorted(self.nodes, key=lambda q: math.dist(p, q))[:48]:
            distance = math.dist(p, q)
            if distance > reach:
                break
            band = self.band(p, q)
            if band is None:
                continue
            if not landing:
                return q, band
            # Don't funnel the end of a broad crossing into the nearest
            # skinny triangle. Prefer a direct two-way approach when one fits.
            width = band[1] - band[0]
            options.append((max(0, 24 - width), distance, q, band))
        if not options:
            return None
        _, _, q, band = min(options)
        return q, band

    def attach(self, p, reach=math.inf, landing=False):
        found = self.link_candidate(p, reach, landing)
        if found is None:
            return False
        q, band = found
        return q == p or self.edge(p, q, band)

    def encode(self, crossings):
        n, e, r, x = [], [], [], []
        ids = {p: i for i, p in enumerate(sorted(self.nodes))}
        prev = (0, 0)
        for p in ids:
            n.extend(round((v - q) * 10) for v, q in zip(p, prev, strict=True))
            # Legacy node-circle bound, also constrained by the surveyed pavement.
            limit = min(30, max(6, *(max(map(abs, self.edges[min(p,q), max(p,q)])) for q in self.nodes[p])))
            r.append(max(0, min(limit, math.floor(Point(p).distance(self.safe.boundary) * 10)) - 1))
            prev = p
        last = 0
        ordered = sorted((min(ids[a], ids[b]), max(ids[a], ids[b]), band) for (a, b), band in self.edges.items())
        for a, b, (lo, hi) in ordered:
            e.extend([a - last, b - a, 6, lo, hi])
            last = a
        for i, (a, p, q, b, width, wait_a, wait_b) in enumerate(crossings):
            coords = [round(v * 10) for pt in (p, q, a, b) for v in pt]
            x.extend([i, ids[a], ids[b], *coords, width, 1, *wait_a, *wait_b])
        return dict(v=3, n=n, e=e, r=r, x=x, d=[], a=encode_area(self.safe))


def encode_area(safe):
    x0, z0, x1, z1 = safe.bounds
    x0, z0 = math.floor(x0), math.floor(z0)
    width, height = math.ceil((x1 - x0) / CELL), math.ceil((z1 - z0) / CELL)
    centres = (np.arange(width) + .5) * CELL + x0
    full_cells = safe.buffer(-CELL / math.sqrt(2))
    out = [round(CELL * 100), x0, z0, width, height]
    for j in range(height):
        row = contains_xy(full_cells, centres, z0 + (j + .5) * CELL)
        limits = np.flatnonzero(np.diff(row, prepend=False, append=False))
        out.append(len(limits) // 2)
        last = 0
        for a, b in zip(limits[::2], limits[1::2], strict=True):
            out.extend([int(a) - last, int(b - a)])
            last = int(b)
    return out


def samples(origin, vector, along, lateral):
    x, z = origin
    ux, uz = vector
    return {dm((x + u * ux - v * uz, z + u * uz + v * ux)) for u in along for v in lateral}


def end_ports(cap, vector, direction, pavement, safe, route):
    """Pairs of kerb contact and nearby waiting point, on the same pavement."""
    x, z = cap
    ux, uz = vector
    for k in range(-12, 13):
        shift = k*PORT_SHIFT
        px, pz = x-uz*shift, z+ux*shift
        dx, dz = direction*ux, direction*uz
        ray = LineString([(px-dx, pz-dz), (px+PORT_REACH*dx, pz+PORT_REACH*dz)])
        spans = []
        for part in get_parts(ray.intersection(pavement)):
            if part.geom_type != 'LineString' or part.length <= .05:
                continue
            distances = [(rx-px)*dx+(rz-pz)*dz for rx,rz in part.coords]
            if max(distances) >= -1e-5:
                spans.append(min(distances))
        if not spans:
            continue
        d = min(spans)
        kx, kz = px+d*dx, pz+d*dz
        kerb = dm((kx, kz))
        room = 0
        for depth in (.5, .8, 1.05, 1.3, 1.55, 1.8, 2.1, 2.5, 3):
            at = dm((kx+depth*dx, kz+depth*dz))
            point = Point(at)
            if at == kerb or not safe.covers(point) or not route.covers(LineString([kerb, at])):
                continue
            clearance = point.distance(safe.boundary)
            if clearance >= room:
                yield kerb, at
                room = clearance + .10


def crossing_route(row, network, landings):
    left, right = row['approaches']
    a, b = left['end'], right['end']
    distance = math.dist(a, b)
    vector = ux, uz = ((b[0] - a[0]) / distance, (b[1] - a[1]) / distance)
    cross = surface(row['faces'])
    rectangle = list(cross.minimum_rotated_rectangle.exterior.coords)
    span = min(range(4), key=lambda i: math.dist(rectangle[i], rectangle[i+1]))
    width = math.floor(10 * math.dist(rectangle[span], rectangle[span+1]))
    caps = [tuple((x+y)/2 for x, y in zip(rectangle[i], rectangle[i+1]))
            for i in (span, (span+2) % 4)]
    if math.dist(a, caps[0]) > math.dist(a, caps[1]):
        caps.reverse()
    survey_axis = LineString(caps)
    approaches = surface([face for end in landings for face in end['faces']])
    allowed = network.walk.union(cross).union(approaches).buffer(1e-6)
    arrival_area = prep(network.safe.union(cross).union(approaches).buffer(1e-6))
    route_area = allowed.buffer(-.221)
    route = prep(route_area)
    # Search outward from the audited caps. Both wait nodes must be on the
    # pavement and have room to wait behind the entrance.
    def waits(approach, direction):
        base = approach['distance'] or 0
        origin = approach['end']
        target = (origin[0] + direction * (base + 1.2) * ux,
                  origin[1] + direction * (base + 1.2) * uz)
        places = samples(origin, vector,
                         [direction * (base + d * .25) for d in range(2, 19)],
                         [d * .25 for d in range(-9, 10)])
        return [p for p in sorted(places, key=lambda p: (
                    -min(1.3, Point(p).distance(network.safe.boundary)), math.dist(p, target), p))
                if network.safe.covers(LineString([p, (p[0]+direction*.8*ux, p[1]+direction*.8*uz)]).buffer(.06))
                and route.covers(Point(p))][:32]

    aa, bb = waits(left, -1), waits(right, 1)
    # Use up to two interior turns, the original engine's four-point format.
    # Prefer a straight line and use the cap neighbourhoods only when needed.
    candidates = []
    direct = sorted((i + j, p, q) for i, p in enumerate(aa) for j, q in enumerate(bb))
    for _, p, q in direct:
        if route.covers(LineString([p, q])):
            inner = [dm((p[0]+t*(q[0]-p[0]), p[1]+t*(q[1]-p[1]))) for t in (.25, .75)]
            if route.covers(LineString([p, *inner, q])):
                candidates.append((p, *inner, q))
    if not candidates:
        def elbows(origin, direction, starts):
            pts = samples(origin, vector, [direction * d * .35 for d in range(-2, 7)],
                          [d * .35 for d in range(-8, 9)])
            return [(p, next((end for end in starts if route.covers(LineString([end, p]))), None))
                    for p in sorted(pts) if route.covers(Point(p))]
        fst, lst = elbows(a, 1, aa), elbows(b, -1, bb)
        candidates = [(start, p, q, end) for p, start in fst if start is not None
                      for q, end in lst if end is not None and p != q and route.covers(LineString([p, q]))]

    # Use the measured stripe axis if both ends can connect to that axis.
    # The audited connectors remain inside pavement and the surveyed crossing.
    inner = [dm(survey_axis.interpolate(t, normalized=True).coords[0]) for t in (.18, .82)]
    candidates.extend((p, *inner, q) for _, p, q in direct
                      if route.covers(LineString([p, *inner, q])))

    # Move the turns to the kerbs. The minimum rectangle offers a second
    # alignment only when it points towards the same two pavements.
    parts = list(get_parts(network.walk))
    pavement = [min(parts, key=Point(pt).distance) for pt in (a, b)]
    road_axis = [(a, b)]
    rx, rz = (caps[1][0]-caps[0][0])/survey_axis.length, (caps[1][1]-caps[0][1])/survey_axis.length
    if ux*rx+uz*rz > .85:
        road_axis.append(tuple(caps))
    for ca, cb in road_axis:
        length = math.dist(ca, cb)
        direction = (cb[0]-ca[0])/length, (cb[1]-ca[1])/length
        starts = list(end_ports(ca, direction, -1, pavement[0], network.safe, route))
        ends = list(end_ports(cb, direction, 1, pavement[1], network.safe, route))
        for p, start in starts:
            for q, end in ends:
                if p != q and start != end:
                    points = start, p, q, end
                    if route.covers(LineString(points)):
                        candidates.append(points)

    boundary = allowed.boundary
    def score(pts):
        start, p, q, end = pts
        line = LineString(pts)
        widest = min(width, math.floor(20 * (line.distance(boundary) + .279)))
        soft_ends = math.dist(start, p) + math.dist(q, end)
        return -widest, soft_ends, line.length, pts

    best = None
    for negative_width, soft_ends, length, points in sorted(map(score, candidates)):
        usable = -negative_width
        if usable < 6 or (best is not None and usable < best[0]):
            break
        start, p, q, end = points
        # The static wait box is not clipped at runtime, so only keep room
        # already covered on both sides of its length.
        dx, dz = q[0] - p[0], q[1] - p[1]
        scale = math.hypot(dx, dz)
        vx, vz = dx / scale, dz / scale
        half = max(.2, usable / 20 - .3)
        if not all(arrival_area.covers(arrival_envelope(tip, at, half)) for tip, at in ((p,start),(q,end))):
            continue

        def wait(at, direction):
            u = (at[0]-p[0])*vx + (at[1]-p[1])*vz
            v = -(at[0]-p[0])*vz + (at[1]-p[1])*vx
            # The engine includes axis offset 0 and extends the box behind the wait point.
            def fits(lo, hi):
                return network.safe.covers(Polygon([
                    (p[0]+(u+du)*vx-off*vz, p[1]+(u+du)*vz+off*vx)
                    for du, off in [(direction*.75, lo), (direction*.75, hi),
                                    (-direction*.05, hi), (-direction*.05,lo)]
                ]))
            lo, hi = min(0, math.floor(v*10)), max(0, math.ceil(v*10))
            if not fits(lo/10-.01,hi/10+.01):
                return None
            lim = math.floor(max(.25, half) * 10)
            while lo > -lim and fits((lo-1)/10,hi/10):
                lo -= 1
            while hi < lim and fits(lo/10,(hi+1)/10):
                hi += 1
            # The incoming right-hand lane is on the opposite side of the
            # crossing axis. Keep it clear when the departure side fits seats
            # at the engine's 0.85m spacing. Offset 0 is included by the engine.
            if direction == -1 and hi >= v*10 + 8.5:
                lo = min(0, math.floor(v*10))
            if direction == 1 and lo <= v*10 - 8.5:
                hi = max(0, math.ceil(v*10))
            slots = sum(lo-1e-8 <= 10*v + k*8.5 <= hi+1e-8 for k in range(-3,4))
            return [lo, hi], slots

        one, two = wait(start, -1), wait(end, 1)
        if one is None or two is None:
            continue
        rank = (usable, min(one[1],two[1]), one[1]+two[1], -soft_ends, -length)
        if (best is None or rank > best) and network.link_candidate(start, reach=15, landing=True) is not None \
                and network.link_candidate(end, reach=15, landing=True) is not None:
            best, chosen = rank, (*points, usable, one[0], two[0])
    if best is not None:
        network.attach(chosen[0], reach=15, landing=True)
        network.attach(chosen[3], reach=15, landing=True)
        return chosen


def arrival_envelope(tip, at, half):
    # crossStep aims up to .27 half-width to the right of the last leg
    # and can hand off within .3m of that target.
    dx, dz = at[0]-tip[0], at[1]-tip[1]
    length = math.hypot(dx, dz)
    if not length:
        return Point(at).buffer(.3)
    lateral = .27*half/length
    return LineString([at, (at[0]-dz*lateral, at[1]+dx*lateral)]).buffer(.3)


def previous_corridors(graph):
    rows = zip(*(iter(graph['x']),) * 17, strict=True)
    for i, _, _, ax, az, bx, bz, pax, paz, pbx, pbz, width, _, alo, ahi, blo, bhi in rows:
        yield graph['crossings'][i], (
            (pax/10, paz/10), (ax/10, az/10), (bx/10, bz/10), (pbx/10, pbz/10),
            width, [alo, ahi], [blo, bhi],
        )


def preserve_yielding_corridor(network, row, ends, previous, refitted):
    pa, a, b, pb, prior, wa, wb = previous
    face = surface(row['faces'])
    landing = surface([poly for end in ends for poly in end['faces']])
    line = LineString([pa, a, b, pb])
    boundary = network.walk.union(face).union(landing).buffer(1e-6).boundary
    arrival = prep(network.safe.union(face).union(landing).buffer(1e-6))
    measured = min(math.dist(p, q) for p, q in pairwise(face.minimum_rotated_rectangle.exterior.coords))
    # Retain the yielding approach and wait points. Widen towards 80% of
    # the face only where the existing line and arrival envelope allow it.
    width = max(prior, min(refitted[4], math.floor((line.distance(boundary)+.279)*20),
                          math.ceil(measured*8)))
    while width >= prior:
        half = max(.2, width/20-.3)
        if all(arrival.covers(arrival_envelope(tip, point, half)) for tip, point in ((a, pa), (b, pb))):
            return pa, a, b, pb, width, wa, wb
        width -= 1
    raise ValueError(f"{row['id']}: existing yielding corridor no longer fits")


def spawn_points(network, floor, window):
    road = prep(surface(floor['floor']['road']).difference(network.walk))
    board = json.loads((MAPO / 'public/data/board.json').read_text())
    lat0, lon0 = ORIGIN
    longitude_metres = 111320 * math.cos(math.radians(lat0))
    portals, rejected = [], []
    for exit in board['exits']:
        if exit['st'] != '합정':
            continue
        origin = project((lon0 + exit['x'] / 10 / longitude_metres, lat0 - exit['z'] / 10 / 110950))
        if not window.covers(Point(origin)):
            continue
        for node in sorted(network.nodes, key=lambda p: math.dist(p, origin)):
            if math.dist(node, origin) > 8:
                break
            if not road.intersects(LineString([origin, node])):
                portals.append(dict(kind='exit', key=f'역 {exit["ref"]}번', x=node[0], z=node[1], origin=origin))
                break
        if not portals or portals[-1]['key'] != f'역 {exit["ref"]}번':
            rejected.append(dict(key=f'역 {exit["ref"]}번', reason='no safe path to the walk graph', origin=origin))

    xmin, zmin, xmax, zmax = window.bounds
    for name, u, v, nx, nz in [
        ('서', (xmin, zmin), (xmin, zmax), 1, 0),
        ('북', (xmin, zmin), (xmax, zmin), 0, 1),
        ('동', (xmax, zmin), (xmax, zmax), -1, 0),
        ('남', (xmin, zmax), (xmax, zmax), 0, -1),
    ]:
        boundary = LineString([u, v])
        ends = sorted((g for g in get_parts(boundary.intersection(network.walk)) if g.length >= .8),
                      key=lambda g: boundary.project(g.interpolate(.5, normalized=True)))
        for i, span in enumerate(ends, 1):
            key = f'{name}쪽 인도 {i}'
            origin = span.interpolate(.5, normalized=True).coords[0]
            for depth in [.7, 1., 1.5, 2., 3., 4.]:
                node = dm((origin[0]+depth*nx, origin[1]+depth*nz))
                if not network.safe.covers(Point(node)):
                    continue
                if not network.walk.buffer(1e-6).covers(LineString([origin, node])):
                    continue
                if network.attach(node, reach=8):
                    portals.append(dict(kind='exit', key=key, x=node[0], z=node[1], origin=origin))
                    break
            else:
                rejected.append(dict(key=key, reason='no safe path to the boundary footway', origin=origin))
    return portals, rejected


def bake(floor, cars, reference=None):
    walk = surface(floor['floor']['walk']).buffer(1e-7)
    network = Network(walk)
    network.pavement()
    refitted, excluded = [], []
    landings = pedestrian_landings(floor, cars)
    for row in floor['crossingAudit']:
        ends = landings[row['id']]
        surveyed_ends = all(end['walkComponent'] is not None for end in row['approaches'])
        result = crossing_route(row, network, ends) if surveyed_ends and all(end['connected'] for end in ends) else None
        if result:
            refitted.append((row, result))
        else:
            reason = 'pavement missing at one or both ends' if not surveyed_ends or not all(e['connected'] for e in ends) else 'full-width engine corridor does not fit'
            excluded.append(dict(id=row['id'], reason=reason))
    # Reattach to a clean pavement graph in the same crossing order, since
    # a yielding corridor may retain different terminals than the refit.
    network = Network(walk)
    network.pavement()
    old = dict(previous_corridors(reference)) if reference is not None else {}
    signals = {row['id']: row['sig'] for row in cars['crosswalks']}
    crossings, ids = [], []
    for row, result in refitted:
        key = row['id']
        if not signals[key] and key in old:
            result = preserve_yielding_corridor(network, row, landings[key], old[key], result)
        if not all(network.attach(point, reach=15, landing=True) for point in (result[0], result[3])):
            raise ValueError(f'{key}: crossing terminal does not connect to pavement')
        ids.append(key)
        crossings.append(result)
    portals, rejected = spawn_points(network, floor, box(*cars['window']))
    graph = network.encode(crossings)
    derived = subprocess.run(['node', '--experimental-strip-types', str(Path(__file__).with_name('hapjeong_walk_width.mts'))],
                             input=json.dumps(graph), text=True, capture_output=True, check=True)
    return dict(**graph, **json.loads(derived.stdout), crossings=ids, landings=landings,
                excluded=excluded, portals=portals, rejectedPortals=rejected)


if __name__ == '__main__':
    floor_path = ASSET.with_name('hapjeong-hd-a.json')
    walk_path = ASSET.with_name('hapjeong-hd-walk.json')
    floor = json.loads(floor_path.read_text())
    cars = json.loads(ASSET.with_name('hapjeong-hd-cars.json').read_text())
    reference = json.loads(walk_path.read_text()) if walk_path.exists() else None
    out = bake(floor, cars, reference)
    # Metadata for pedestrians only. Keep the existing rendering layers and
    # crossing audit faces byte-for-byte equivalent after JSON decoding.
    floor['pedestrianLandings'] = out['landings']
    floor_path.write_text(json.dumps(floor, ensure_ascii=False, separators=(',', ':')) + '\n')
    walk_path.write_text(json.dumps(out, separators=(',', ':')) + '\n')
    print(f'{len(out["n"]) // 2} nodes, {len(out["e"]) // 5} edges, {len(out["crossings"])} crossings')
    print([(row['id'][-4:], row['reason']) for row in out['excluded']])
