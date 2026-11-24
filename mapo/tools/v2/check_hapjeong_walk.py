"""Check the exported Hapjeong graph against the finished A floor."""
from collections import defaultdict
from itertools import accumulate
import json
from area import MAPO, asset, load_area

from shapely.geometry import LineString, Point, Polygon, box
from shapely.ops import unary_union
from shapely.prepared import prep

AREA = load_area()
ROOT = MAPO
BODY = .4


def faces(rows):
    return unary_union([Polygon(outer, holes) for outer, *holes in rows])


def read(name):
    return json.loads(asset(AREA, f'-{name}', root=ROOT).read_text())


def verify():
    floor = read('a')
    assert asset(AREA, '-walk', root=ROOT).exists(), 'The area walk graph has not been baked'
    graph = read('walk')
    walk = faces(floor['floor']['walk']).buffer(1e-7)
    if graph.get('sidewalkLinks'):
        from hapjeong_crossings import vehicle_clearance
        lanes = unary_union([LineString(row['points']).buffer(vehicle_clearance(row['kind']))
                             for row in read('cars')['links']])
        links = faces([face for row in graph['sidewalkLinks'] for face in row['faces']])
        assert not links.intersects(lanes), 'sidewalk connection reaches a surveyed lane'
        walk = walk.union(links).buffer(1e-7)
    safe = prep(walk.buffer(-BODY))
    road = prep(faces(floor['floor']['road']).difference(walk))
    assert graph['v'] == 3 and graph['n'] and graph['e'] and graph['a']
    nodes = list(zip((x / 10 for x in accumulate(graph['n'][::2])),
                     (z / 10 for z in accumulate(graph['n'][1::2])), strict=True))
    assert len(nodes) == len(graph['r'])
    assert len(graph['e']) % 5 == len(graph['x']) % 17 == 0
    for pos, radius in zip(nodes, graph['r'], strict=True):
        shape = Point(pos)
        if radius:
            shape = shape.buffer(radius / 10)
        assert safe.covers(shape), ('node clearance', pos, radius)

    neighbours = defaultdict(set)
    a = 0
    for da, db, _kind, lo, hi in zip(*(iter(graph['e']),) * 5, strict=True):
        a += da
        b = a + db
        assert a != b and 0 <= a < len(nodes) and 0 <= b < len(nodes)
        ax, az = nodes[a]
        bx, bz = nodes[b]
        line = LineString([nodes[a], nodes[b]])
        assert line.length > 0 and lo <= 0 <= hi
        nx, nz = (az - bz) / line.length, (bx - ax) / line.length
        low, high = lo / 10 - .02, hi / 10 + .02
        clearance = Polygon([(ax + t*nx, az + t*nz) for t in (low, high)] +
                            [(bx + t*nx, bz + t*nz) for t in (high, low)])
        assert safe.covers(clearance), ('edge clearance', nodes[a], nodes[b], lo, hi)
        assert not road.intersects(line), ('ordinary edge crosses traffic', nodes[a], nodes[b])
        neighbours[a].add(b)
        neighbours[b].add(a)

    cross_ids = graph['crossings']
    by_id = {row['id']: row for row in floor['crossingAudit']}
    excluded = {row['id'] for row in graph['excluded']}
    assert len(cross_ids) == len(set(cross_ids)) == len(graph['x']) // 17
    expected = AREA.get('checks', {}).get('surveyCrossings')
    if expected is not None:
        assert len(by_id) == expected
    assert set(cross_ids).isdisjoint(excluded) and set(cross_ids) | excluded == set(by_id)
    for i, (xw, a, b, ax, az, bx, bz, pax, paz, pbx, pbz, width, major, *wait) in enumerate(
            zip(*(iter(graph['x']),) * 17, strict=True)):
        assert xw == i and a != b and neighbours[a] and neighbours[b]
        assert nodes[a] == (pax / 10, paz / 10) and nodes[b] == (pbx / 10, pbz / 10)
        assert width > 0 and major == 1 and wait[0] <= 0 <= wait[1] and wait[2] <= 0 <= wait[3]
        crossing = by_id[cross_ids[xw]]
        allowed = walk.union(faces(crossing['faces'])).union(
            faces([p for end in graph['landings'][cross_ids[xw]] for p in end['faces']])).buffer(1e-6)
        axis = LineString([nodes[a], (ax / 10, az / 10), (bx / 10, bz / 10), nodes[b]])
        half_width = max(.2, width / 20 - .3)
        assert allowed.covers(axis.buffer(half_width + .019)), ('crossing clearance', cross_ids[xw], list(axis.coords))
        if 'pedestrianLandings' in floor:
            from hapjeong_walk import arrival_envelope
            handoff = walk.buffer(-BODY).union(faces(crossing['faces'])).union(
                faces([p for end in graph['landings'][cross_ids[xw]] for p in end['faces']])).buffer(1e-6)
            for tip, node in ((axis.coords[1], nodes[a]), (axis.coords[2], nodes[b])):
                assert handoff.covers(arrival_envelope(tip, node, half_width)), ('crossing handoff', cross_ids[xw])
        else:
            for node in (nodes[a], nodes[b]):
                assert safe.covers(Point(node).buffer(.375 + half_width*.27 - .001)), ('crossing handoff', cross_ids[xw])
        dx, dz = (bx - ax) / 10, (bz - az) / 10
        length = (dx * dx + dz * dz) ** .5
        vx, vz = dx / length, dz / length
        for (px, pz), direction, (lo, hi) in zip((nodes[a], nodes[b]), (-1, 1), (wait[:2], wait[2:]), strict=True):
            u = (px - ax / 10) * vx + (pz - az / 10) * vz
            area = Polygon([(ax/10 + (u+t)*vx - off*vz, az/10 + (u+t)*vz + off*vx)
                            for t, off in [(direction*.75, lo/10), (direction*.75, hi/10),
                                           (-direction*.05, hi/10), (-direction*.05, lo/10)]])
            assert (safe.covers(area) if hi > lo else safe.covers(area.boundary)), ('waiting area', cross_ids[xw])
        neighbours[a].add(b)
        neighbours[b].add(a)

    size, x0, z0, cols, rows, *runs = graph['a']
    step = size / 100
    it = iter(runs)
    for row in range(rows):
        col = 0
        for _ in range(next(it)):
            col += next(it)
            end = col + next(it)
            assert end <= cols
            assert safe.covers(box(x0 + col * step, z0 + row * step,
                                   x0 + end * step, z0 + (row + 1) * step)), ('area clearance', col, row)
            col = end
    assert next(it, None) is None

    unseen = set(range(len(nodes)))
    sizes = []
    while unseen:
        pending = [unseen.pop()]
        count = 0
        while pending:
            node = pending.pop()
            count += 1
            for nxt in neighbours[node] & unseen:
                unseen.remove(nxt)
                pending.append(nxt)
        sizes.append(count)
    assert min(sizes) > 1, sizes
    print(f'nodes={len(nodes)}, edges={len(graph["e"]) // 5}, crossings={len(cross_ids)}, '
          f'components={len(sizes)} sizes={sorted(sizes, reverse=True)}')
    for row in graph['excluded']:
        print(f'excluded {row["id"][-4:]}: {row["reason"]}')


if __name__ == '__main__':
    verify()
