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
                if self.room.covers(Polygon([a, b, (b[0]+dx, b[1]+dz), (a[0]+dx, a[1]+dz)])):
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

    def attach(self, p, reach=math.inf, landing=False):
        if p in self.nodes:
            return True
        options = []
        for q in sorted(self.nodes, key=lambda q: math.dist(p, q))[:48]:
            distance = math.dist(p, q)
            if distance > reach:
                break
            band = self.band(p, q)
            if band is None:
                continue
            if not landing:
                return self.edge(p, q, band)
            # Don't funnel the end of a broad crossing into the nearest
            # skinny triangle. Prefer a direct two-way approach when one fits.
            width = band[1] - band[0]
            options.append((max(0, 24 - width), distance, q, band))
        if not options:
            return False
        _, _, q, band = min(options)
        return self.edge(p, q, band)

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
                         [direction * (base + d * .25) for d in range(2, 15)],
                         [d * .25 for d in range(-9, 10)])
        return [p for p in sorted(places, key=lambda p: (math.dist(p, target), p))
                if network.safe.covers(LineString([p, (p[0]+direction*.8*ux, p[1]+direction*.8*uz)]).buffer(.06))
                and route.covers(Point(p))][:32]

    aa, bb = waits(left, -1), waits(right, 1)
    if not aa or not bb:
        return None
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

    def clearance(pts):
        return LineString(pts).distance(allowed.boundary)

    def score(pts):
        _, p, q, _ = pts
        line = LineString(pts)
        room = min(Point(pts[i]).distance(network.safe.boundary) for i in (0, 3))
        return (-min(max(.2, width / 20 - .3) + .021, line.distance(allowed.boundary), (room-.375)/.27+.021),
                Point(p).distance(survey_axis) + Point(q).distance(survey_axis), line.length, pts)

    for points in sorted(candidates, key=score):
        start, p, q, end = points
        # The static wait box is not clipped at runtime, so only keep room
        # already covered on both sides of its length.
        dx, dz = q[0] - p[0], q[1] - p[1]
        scale = math.hypot(dx, dz)
        vx, vz = dx / scale, dz / scale

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
            lim = math.floor(max(.25, width / 20 - .3) * 10)
            while lo > -lim and fits((lo-1)/10,hi/10):
                lo -= 1
            while hi < lim and fits(lo/10,(hi+1)/10):
                hi += 1
            return [lo, hi]

        # The legacy crossing can hand a walker to the ordinary graph
        # within .3m of the lateral final target. The whole arrival zone
        # has to be on the raster pavement, even if the crossing band
        # temporarily allows more ground around it.
        arrival_room = min(Point(p).distance(network.safe.boundary) for p in (start, end))
        if arrival_room < .43:
            continue
        arrival_width = math.floor(20 * ((arrival_room - .375)/.27 + .3))
        usable = min(width, max(6, math.floor(20 * (clearance(points) + .279))), arrival_width)
        if usable < 6:
            continue
        wait_a, wait_b = wait(start, -1), wait(end, 1)
        if wait_a is not None and wait_b is not None and network.attach(start, reach=15, landing=True) and network.attach(end, reach=15, landing=True):
            return (*points, usable, wait_a, wait_b)
    return None


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


def bake(floor, cars):
    walk = surface(floor['floor']['walk']).buffer(1e-7)
    network = Network(walk)
    network.pavement()
    crossings, ids, excluded = [], [], []
    landings = pedestrian_landings(floor, cars)
    for row in floor['crossingAudit']:
        ends = landings[row['id']]
        result = crossing_route(row, network, ends) if all(end['connected'] for end in ends) else None
        if result:
            crossings.append(result)
            ids.append(row['id'])
        else:
            reason = 'pavement missing at one or both ends' if not all(e['connected'] for e in ends) else 'full-width engine corridor does not fit'
            excluded.append(dict(id=row['id'], reason=reason))
    portals, rejected = spawn_points(network, floor, box(*cars['window']))
    graph = network.encode(crossings)
    derived = subprocess.run(['node', '--experimental-strip-types', str(Path(__file__).with_name('hapjeong_walk_width.mts'))],
                             input=json.dumps(graph), text=True, capture_output=True, check=True)
    return dict(**graph, **json.loads(derived.stdout), crossings=ids, landings=landings, excluded=excluded, portals=portals, rejectedPortals=rejected)


if __name__ == '__main__':
    floor = json.loads(ASSET.with_name('hapjeong-hd-a.json').read_text())
    cars = json.loads(ASSET.with_name('hapjeong-hd-cars.json').read_text())
    out = bake(floor, cars)
    ASSET.with_name('hapjeong-hd-walk.json').write_text(json.dumps(out, separators=(',', ':')) + '\n')
    print(f'{len(out["n"]) // 2} nodes, {len(out["e"]) // 5} edges, {len(out["crossings"])} crossings')
    print([(row['id'][-4:], row['reason']) for row in out['excluded']])
