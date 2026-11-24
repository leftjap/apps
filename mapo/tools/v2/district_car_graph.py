"""District A2 topology, grade separation and permitted entries and exits."""
from collections import Counter, defaultdict
from heapq import heappop, heappush
from itertools import pairwise
import math

from shapely import STRtree, get_parts
from shapely.geometry import LineString, Point

GRADE_CLEARANCE = 2.5
PORTAL_LENGTH = 8.5


def height_axis(row):
    if 'heights' in row:
        return LineString([(*p, y) for p, y in zip(row['line'].coords, row['heights'], strict=True)])
    if all(len(p) >= 3 for p in row['raw']):
        return LineString([(*p, r[2]) for p, r in zip(row['line'].coords, row['raw'], strict=True)])
    return None


def grade_crossings(rows):
    lines = [LineString(row.get('points', row['line'].coords)) for row in rows]
    heights = [height_axis(row) for row in rows]
    tree = STRtree(lines)
    result = []
    for i, first in enumerate(lines):
        for j in sorted(int(j) for j in tree.query(first, predicate='crosses') if j > i):
            if j in rows[i]['next'] or i in rows[j]['next'] or heights[i] is None or heights[j] is None:
                continue
            for p in get_parts(first.intersection(lines[j])):
                if p.geom_type != 'Point':
                    continue
                h, k = (heights[n].interpolate(heights[n].project(p)).z for n in (i, j))
                if math.isfinite(h-k) and abs(h-k) >= GRADE_CLEARANCE:
                    low, high = (i, j) if h < k else (j, i)
                    result.append(dict(lower=low, upper=high, at=list(p.coords[0]), metres=round(abs(h-k), 2)))
    return result


def traverse(next_, starts):
    done = set(starts)
    pending = list(done)
    for i in pending:
        for j in next_[i]:
            if j not in done:
                done.add(j)
                pending.append(j)
    return done


def district_bus_routes(rows, window):
    """Find routes through surveyed reserved corridors, using ordinary end sections."""
    next_ = [row['next'][:] for row in rows]
    incoming = defaultdict(list)
    for i, row in enumerate(rows):
        if not row.get('clippedStart'):
            incoming[row['from_id'], tuple(row['points'][0])].append(i)
    for i, row in enumerate(rows):
        if row.get('clippedEnd'):
            continue
        # A reserved lane can change class at a measured A1 endpoint.
        start, end = row['points'][-2:]
        for j in incoming[row['to'], tuple(end)]:
            other = rows[j]
            if {row['kind'], other['kind']} != {'4', '6'}:
                continue
            tip = other['points'][1]
            dot = sum((b-a)*(c-b) for a, b, c in zip(start, end, tip, strict=True))
            if dot > 0:
                next_[i].append(j)
    prev = [[] for _ in rows]
    for i, arcs in enumerate(next_):
        for j in arcs:
            prev[j].append(i)

    def terminal(i, reverse):
        row = rows[i]
        point = Point(row['points'][0 if reverse else -1])
        if row['len'] < PORTAL_LENGTH:
            return False
        if window.boundary.distance(point) < .001:
            return True
        return row['kind'] == '6' and not (prev if reverse else next_)[i]

    def to_terminal(start, reverse):
        arcs = prev if reverse else next_
        pending = [(0, start, [start])]
        visited = set()
        while pending:
            cost, i, path = heappop(pending)
            if i in visited:
                continue
            visited.add(i)
            if terminal(i, reverse):
                return path
            for j in arcs[i]:
                if j in visited:
                    continue
                edge = rows[j]
                penalty = 1 if edge['kind'] != '6' else 6
                heappush(pending, (cost + (edge['len'] + 1) * penalty, j, [*path, j]))
        return []

    routes, served = [], set()
    for i, row in enumerate(rows):
        if row['kind'] != '4' or i in served:
            continue
        before, after = to_terminal(i, True), to_terminal(i, False)
        if before and after and not set(before[1:]).intersection(after[1:]):
            route = [*reversed(before[1:]), *after]
            routes.append(route)
            served.update(j for j in route if rows[j]['kind'] == '4')
    # A shorter corridor may be a prefix or suffix of another complete route.
    return [r for r in routes if not any(len(p) > len(r) and any(
        p[i:i+len(r)] == r for i in range(len(p)-len(r)+1)) for p in routes)]


def plan_routes(rows, buses, window):
    bus = {i for chain in buses for i in chain}
    before = [[] for _ in rows]
    for i, row in enumerate(rows):
        for j in row['next']:
            before[j].append(i)

    entry, exit_ = {}, {}
    for i, row in enumerate(rows):
        if row['kind'] != '6' or row['len'] < PORTAL_LENGTH:
            continue
        for side, candidates, connected in ((0, entry, before[i]), (-1, exit_, row['next'])):
            at = row['points'][side]
            boundary = window.boundary.distance(Point(at)) < .001
            if boundary or not connected:
                candidates[i] = dict(edge=i, at=at, boundary=boundary)

    usable = {i for i, row in enumerate(rows) if row['kind'] != '4'
              and (row['kind'] == '6' or i not in bus) and not row.get('disabled')}
    ids = {row['id']: i for i, row in enumerate(rows)}

    def search():
        forward = [[j for j in row['next'] if j in usable] if i in usable else []
                   for i, row in enumerate(rows)]
        reverse = [[j for j in incoming if j in usable] if i in usable else []
                   for i, incoming in enumerate(before)]
        ingress = traverse(forward, usable.intersection(entry))
        egress = traverse(reverse, usable.intersection(exit_))
        return ingress, egress

    ingress, egress = search()
    active = ingress & egress
    shadows = {i for i in active if ids.get(rows[i]['duplicateOf']) in active}
    usable -= shadows
    ingress, egress = search()
    # With no measured common outlet, coincident exit centres cannot be two sinks.
    sinks = defaultdict(list)
    for i in (ingress & egress).intersection(exit_):
        sinks[tuple(round(x, 2) for x in exit_[i]['at'])].append(i)
    for choices in sinks.values():
        for i in sorted(choices, key=lambda i: (-rows[i]['len'], i))[1:]:
            del exit_[i]
    ingress, egress = search()
    active = ingress & egress
    causes = Counter()
    excluded = []
    for i, row in enumerate(rows):
        if i in active or i in bus:
            continue
        reason = (row.get('disabled') or [
            'unused bus lane' if row['kind'] == '4' else 'duplicate' if i in shadows else
            'no ingress or egress' if i not in ingress and i not in egress else
            'no ingress' if i not in ingress else 'no egress'])[0]
        causes[reason] += 1
        excluded.append({'id': row['id'], 'reason': reason})
    return dict(selected=sorted(active | bus), entries=[entry[i] for i in sorted(active & entry.keys())],
                exits=[exit_[i] for i in sorted(active & exit_.keys())], excluded=excluded,
                reasons=dict(causes))


def district_routes(rows, buses, window, crossings):
    reserved = {i for chain in buses for i in chain}
    for crossing in crossings:
        low, high = crossing['lower'], crossing['upper']
        if low in reserved and high in reserved:
            raise ValueError('Two reserved bus lanes cross at different heights')
        # Keep the main road over a lower-rank crossing when possible.
        cut = low if high in reserved else high if low in reserved else max(
            (high, low), key=lambda i: (rows[i]['rank'], i == high))
        rows[cut]['disabled'] = ['grade separation']
        crossing['excluded'] = rows[cut]['id']
    return plan_routes(rows, buses, window)
