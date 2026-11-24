"""Find ordinary walk turns whose node cannot be reached directly from the approach."""
import argparse
from collections import defaultdict
from itertools import accumulate, product
import math
import json

import numpy as np
from shapely.geometry import Point

APPROACH = np.array([(s, u) for s in (.075, .25, .5, .75, 1)
                     for u in (.5, .75, 1, 1.25, 1.5, 1.75, 2)])
STEPS = np.arange(1, 21) / 20


def area_mask(packed):
    size, x, z, cols, rows, *runs = packed
    raster = np.zeros((rows, cols), dtype=bool)
    stream = iter(runs)
    for row in raster:
        a = 0
        for _ in range(next(stream)):
            a += next(stream)
            b = a + next(stream)
            row[a:b] = True
            a = b

    def contains(points):
        i, j = np.floor((points - [x, z]) / (size / 100)).astype(int).T
        valid = (0 <= i) & (i < cols) & (0 <= j) & (j < rows)
        return valid & raster[j.clip(0, rows - 1), i.clip(0, cols - 1)]

    return contains


def leg(a, b, lo, hi):
    vector = b - a
    length = np.linalg.norm(vector)
    along = vector / length
    side = along[::-1] * [-1, 1]

    def contains(points):
        offset = points - a
        s, u = offset @ along, offset @ side
        return (-.02 <= s) & (s <= length + .02) & (lo - .02 <= u) & (u <= hi + .02)

    return length, along, side, contains


def blind_turn(a, b, c, incoming, outgoing, radii, paved):
    length, along, side, on_incoming = incoming
    on_outgoing = outgoing[3]

    def on_axis(points):
        return on_incoming(points) | on_outgoing(points) | np.any(
            np.sum((points[:, None] - [a, b, c]) ** 2, axis=2) <= radii ** 2 + 1e-4, axis=1)

    offsets = APPROACH[APPROACH[:, 0] < length]
    probes = b - offsets[:, :1] * along + offsets[:, 1:] * side
    probes = probes[paved(probes) & ~on_axis(probes)]
    for probe in probes:
        chord = probe + STEPS[:, None] * (b - probe)
        if np.any(~(paved(chord) | on_axis(chord))):
            return probe.tolist()
    return None


def junction_nodes(encoded):
    start = 0
    while start < len(encoded):
        count = encoded[start]
        yield from accumulate(encoded[start + 2:start + 2 + count])
        start += 2 + count


def turn_risks(nodes, bands, radii, paved, regions, around):
    for b in around:
        if b in regions:
            continue
        for a, (lo, hi) in bands[b].items():
            incoming = leg(nodes[a], nodes[b], -hi / 10, -lo / 10)
            for c, (lo, hi) in bands[b].items():
                if c == a or c in regions:
                    continue
                outgoing = leg(nodes[b], nodes[c], lo / 10, hi / 10)
                probe = blind_turn(*nodes[[a, b, c]], incoming, outgoing, radii[[a, b, c]], paved)
                if probe is not None:
                    yield dict(nodes=[a, b, c], turn=nodes[b].tolist(), approach=probe)


def unpack(graph):
    nodes = np.array([list(accumulate(graph['n'][::2])),
                      list(accumulate(graph['n'][1::2]))]).T / 10
    bands = defaultdict(dict)
    a = 0
    for da, db, _, lo, hi in zip(*(iter(graph['e']),) * 5, strict=True):
        a += da
        b = a + db
        bands[a][b] = (lo, hi)
        bands[b][a] = (-hi, -lo)
    return nodes, bands, np.array(graph['r']) / 10


def measure(graph):
    nodes, bands, radii = unpack(graph)
    return list(turn_risks(nodes, bands, radii, area_mask(graph['a']),
                           set(junction_nodes(graph['j'])), bands))


def refit(network, graph, pinned):
    """Move each affected node by the smallest grid step that opens its turn."""
    nodes, bands, radii = unpack(graph)
    original = [tuple(node) for node in nodes]
    occupied = set(original)
    regions = set(junction_nodes(graph['j']))
    paved = area_mask(graph['a'])

    def count(around):
        return sum(1 for _ in turn_risks(nodes, bands, radii, paved, regions, around))

    def move(i, point, sides, radius):
        nodes[i] = point
        radii[i] = radius
        for j, (lo, hi) in sides.items():
            bands[i][j] = (lo, hi)
            bands[j][i] = (-hi, -lo)

    # Search on the encoded grid, keeping every edge and every physical endpoint.
    for limit in (6, 12):
        steps = sorted((p for p in product(range(-limit, limit+1, 2), repeat=2)
                        if 0 < math.hypot(*p) <= limit), key=lambda p: (math.hypot(*p), p))
        affected = dict.fromkeys(i for risk in turn_risks(nodes, bands, radii, paved, regions, bands)
                                 for i in (risk['nodes'][1], risk['nodes'][0], risk['nodes'][2]))
        for i in affected:
            if original[i] in pinned or i in regions:
                continue
            around = [i, *bands[i]]
            before = count(around)
            if not before:
                continue
            old = tuple(nodes[i]), bands[i].copy(), radii[i]
            best, score = old, before
            for dx, dz in steps:
                point = (round(old[0][0] + dx / 10, 1), round(old[0][1] + dz / 10, 1))
                if point in occupied or not network.room.covers(Point(point)):
                    continue
                sides = {j: network.band(point, tuple(nodes[j])) for j in bands[i]}
                if any(side is None for side in sides.values()):
                    continue
                move(i, point, sides, network.radius(point, sides.values()) / 10)
                remaining = count(around)
                if remaining < score:
                    best, score = (point, sides, radii[i]), remaining
                    if not remaining:
                        break
            move(i, *best)
            occupied.remove(old[0])
            occupied.add(best[0])

    if all(tuple(node) == point for node, point in zip(nodes, original, strict=True)):
        return False
    network.edges.clear()
    network.nodes.clear()
    for i, edges in bands.items():
        for j, side in edges.items():
            if i < j:
                network.edge(tuple(nodes[i]), tuple(nodes[j]), side)
    return True


if __name__ == '__main__':
    from check_hapjeong_walk import read

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--area', help='area manifest (default: Hapjeong)')
    parser.add_argument('--out', type=argparse.FileType('w'))
    args = parser.parse_args()
    risks = measure(read('walk'))
    print(f'{len(risks)} turns at {len({r["nodes"][1] for r in risks})} nodes')
    if args.out:
        json.dump(risks, args.out, indent=2)
    raise SystemExit(bool(risks))
