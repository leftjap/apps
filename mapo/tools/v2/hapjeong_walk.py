"""Bake the Hapjeong A pavement into the original WalkJson coordinate format."""
import math
from collections import defaultdict
from itertools import pairwise
import json

import numpy as np
from shapely import constrained_delaunay_triangles, contains_xy, get_parts
from shapely.geometry import LineString, Point, Polygon
from shapely.prepared import prep

from hapjeong_hd import ASSET, MAPO, ORIGIN, project
from hapjeong_hd_a import surface

BODY = .4
EDGE_PAD = .025
CELL = .10
# The original engine uses a minimum .20 m half-width for walking across a crossing.
CROSS_CLEAR = .23


def dm(point):
    return tuple(round(value * 10) / 10 for value in point)


class Network:
    def __init__(self, walk):
        self.walk = walk
        self.safe = walk.buffer(-BODY)
        self.edges = {}
        self.nodes = defaultdict(set)

    def edge(self, a, b):
        if a == b:
            return False
        line = LineString([a, b])
        if not self.safe.covers(line) or line.distance(self.safe.boundary) < EDGE_PAD:
            return False
        self.edges[min(a, b), max(a, b)] = min(14, math.floor((line.distance(self.safe.boundary) - EDGE_PAD) * 10))
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

    def attach(self, p):
        if p in self.nodes:
            return True
        for q in sorted(self.nodes, key=lambda q: math.dist(p, q))[:48]:
            if self.edge(p, q):
                return True
        return False

    def encode(self, crossings):
        n, e, r, x = [], [], [], []
        landings = {p for a, _, _, b, *_ in crossings for p in (a, b)}
        ids = {p: i for i, p in enumerate(sorted(self.nodes))}
        prev = (0, 0)
        for p in ids:
            n.extend(round((v - q) * 10) for v, q in zip(p, prev, strict=True))
            # Finish the crossing close to the attached edge. A large node
            # circle can end CROSS before the walker reaches the pavement grid.
            cap = 3 if p in landings else 20
            r.append(min(cap, max(0, math.floor((Point(p).distance(self.safe.boundary) - .01) * 10))))
            prev = p
        last = 0
        ordered = sorted((min(ids[a], ids[b]), max(ids[a], ids[b]), width) for (a, b), width in self.edges.items())
        for a, b, width in ordered:
            e.extend([a - last, b - a, 6, -width, width])
            last = a
        for i, (a, p, q, b, width, wait_a, wait_b) in enumerate(crossings):
            coords = [round(v * 10) for pt in (p, q, a, b) for v in pt]
            x.extend([i, ids[a], ids[b], *coords, width, 1, *wait_a, *wait_b])
        return dict(v=3, n=n, e=e, r=r, x=x, a=encode_area(self.safe))


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


def crossing_route(row, network):
    left, right = row['approaches']
    a, b = left['end'], right['end']
    distance = math.dist(a, b)
    vector = ux, uz = ((b[0] - a[0]) / distance, (b[1] - a[1]) / distance)
    cross = surface(row['faces'])
    allowed = network.walk.union(cross)
    route_area = allowed.buffer(-CROSS_CLEAR)
    route = prep(route_area)
    # Search outward from the audited caps. Both wait nodes must be on the
    # pavement and have room to wait behind the entrance.
    def waits(approach, direction):
        base = approach['distance']
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
                if len(candidates) == 24:
                    break
    if not candidates:
        def elbows(origin, direction, starts):
            pts = samples(origin, vector, [direction * d * .35 for d in range(-2, 7)],
                          [d * .35 for d in range(-8, 9)])
            return [(p, next((end for end in starts if route.covers(LineString([end, p]))), None))
                    for p in sorted(pts) if route.covers(Point(p))]
        fst, lst = elbows(a, 1, aa), elbows(b, -1, bb)
        candidates = [(start, p, q, end) for p, start in fst if start is not None
                      for q, end in lst if end is not None and p != q and route.covers(LineString([p, q]))]

    def clearance(points):
        line = LineString(points)
        return min(.85, line.distance(allowed.boundary) - .02)

    for points in sorted(candidates, key=lambda pts: (-clearance(pts), LineString(pts).length, pts)):
        start, p, q, end = points
        half = clearance(points)
        width = max(10, math.floor((half + .3) * 20))
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
            while lo > -14 and fits((lo-1)/10,hi/10):
                lo -= 1
            while hi < 14 and fits(lo/10,(hi+1)/10):
                hi += 1
            return [lo, hi]

        wait_a, wait_b = wait(start, -1), wait(end, 1)
        if wait_a is not None and wait_b is not None and network.attach(start) and network.attach(end):
            return (*points, width, wait_a, wait_b)
    return None


def spawn_points(network, floor, views):
    road = prep(surface(floor['floor']['road']).difference(network.walk))
    board = json.loads((MAPO / 'public/data/board.json').read_text())
    lat0, lon0 = ORIGIN
    longitude_metres = 111320 * math.cos(math.radians(lat0))
    portals = []
    for exit in board['exits']:
        if exit['st'] != '합정':
            continue
        origin = project((lon0 + exit['x'] / 10 / longitude_metres, lat0 - exit['z'] / 10 / 110950))
        for node in sorted(network.nodes, key=lambda p: math.dist(p, origin)):
            if math.dist(node, origin) > 7:
                break
            if not road.intersects(LineString([origin, node])):
                portals.append(dict(kind='exit', key=exit['st'], ref=exit['ref'], x=node[0], z=node[1]))
                break

    spacious = [p for p in sorted(network.nodes)
                if len(network.nodes[p]) > 1 and Point(p).distance(network.safe.boundary) >= .5]
    for view in views:
        centre = view['at']
        nearby = sorted((p for p in spacious if math.dist(p, centre) <= 29),
                        key=lambda p: math.dist(p, centre))
        count = 0
        for x, z in nearby:
            if any(math.dist((portal['x'], portal['z']), (x, z)) < 9 for portal in portals):
                continue
            portals.append(dict(kind='exit', key='인도', x=x, z=z))
            count += 1
            if count == 4:
                break
    return portals


def bake(floor):
    walk = surface(floor['floor']['walk']).buffer(1e-7)
    network = Network(walk)
    network.pavement()
    crossings, ids, excluded = [], [], []
    for row in floor['crossingAudit']:
        bad = [end['status'] for end in row['approaches'] if end['status'] != 'joined']
        result = None if bad else crossing_route(row, network)
        if result:
            crossings.append(result)
            ids.append(row['id'])
        else:
            excluded.append(dict(id=row['id'], reason=', '.join(bad) if bad else 'no continuous corridor with two safe wait areas'))
    rehearsal = json.loads(ASSET.with_name('hapjeong-hd-pedestrians.json').read_text())
    portals = spawn_points(network, floor, [person['view'] for person in rehearsal['people']])
    return dict(**network.encode(crossings), crossings=ids, excluded=excluded, portals=portals)


if __name__ == '__main__':
    floor = json.loads(ASSET.with_name('hapjeong-hd-a.json').read_text())
    out = bake(floor)
    ASSET.with_name('hapjeong-hd-walk.json').write_text(json.dumps(out, separators=(',', ':')) + '\n')
    print(f'{len(out["n"]) // 2} nodes, {len(out["e"]) // 5} edges, {len(out["crossings"])} crossings')
    print([(row['id'][-4:], row['reason']) for row in out['excluded']])
