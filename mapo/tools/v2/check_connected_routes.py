"""Compare boundary-connected A2 links with the individual-area replay graphs."""
import argparse
from collections import Counter, defaultdict
import json
from pathlib import Path

from shapely.geometry import LineString, Point
from shapely.ops import unary_union

from area import MAPO, area_window, asset, read_area


def header(path):
    with path.open() as stream:
        return json.loads(next(stream))


def originals(keys):
    return {key.split('~', 1)[0] for key in keys}


def dead_ends(seeds, arcs, links, boundary, side, eligible):
    """Follow a missing direction to actual termini of the exported A2 network."""
    visited = set(seeds)
    queue = list(seeds)
    ends = []
    for i in queue:
        outgoing = [j for j in arcs[i] if eligible(j)]
        if not outgoing:
            link = links[i]
            x, z = link['points'][side]
            distance = float(boundary.distance(Point(x, z)))
            endpoint = dict(link=link['id'], x=round(x, 3), z=round(z, 3), insideMetres=round(distance, 3),
                            reason='restricted connection' if arcs[i] else 'no surveyed continuation')
            if arcs[i]:
                endpoint['restrictedLinks'] = [links[j]['id'] for j in arcs[i]]
            ends.append(endpoint)
        for j in outgoing:
            if j not in visited:
                queue.append(j)
                visited.add(j)
    return sorted(ends, key=lambda r: (r['insideMetres'], r['link']))


def inspect(area, trace, reference):
    meta = header(trace)
    data = json.loads(asset(area, '-cars').read_text())
    links = data['links']
    boundary = area_window(area).boundary
    used = originals(meta['links'])
    comparisons = area['comparisonAreas']
    locals_by_area = {name: originals(header(reference/name/'trace.ndjson')['links'])
                      for name in comparisons}
    local_all = set.union(*locals_by_area.values())
    old_land = unary_union([area_window(read_area(Path(name))) for name in comparisons])
    used_pieces = set(meta['links'])
    new_land_links = originals(link['id'] for link in links if link['id'] in used_pieces
                               and LineString(link['points']).difference(old_land).length > .001)
    bus = set(sum(data.get('busRoutes', []), []))
    excluded = {row['id']: row['reason'] for row in meta['routing']['excluded']}
    by_source = defaultdict(list)
    backward = [[] for _ in links]
    for i, link in enumerate(links):
        by_source[link.get('source', link['id'])].append(i)
        for j in link['next']:
            backward[j].append(i)
    forward = [link['next'] for link in links]

    def eligible(j):
        return j not in bus and links[j]['kind'] != '4' and excluded.get(links[j]['id']) != 'duplicate'

    missing = []
    for key in sorted(local_all - used):
        pieces = by_source[key]
        reasons = sorted({excluded[links[i]['id']] for i in pieces})
        termini = {}
        if any('ingress' in reason for reason in reasons):
            termini['backward'] = dead_ends(pieces, backward, links, boundary, 0, eligible)
        if any('egress' in reason for reason in reasons):
            termini['forward'] = dead_ends(pieces, forward, links, boundary, -1, eligible)
        missing.append(dict(link=key, areas=[name for name, rows in locals_by_area.items() if key in rows],
                            reason=', '.join(reasons) if pieces else 'absent from combined bake',
                            termini=termini))
    return {
        'area': area['id'], 'localOriginalLinks': len(local_all), 'combinedOriginalLinks': len(used),
        'commonOriginalLinks': len(local_all & used), 'additionalOriginalLinks': len(used - local_all),
        'originalLinksInNewLand': len(new_land_links),
        'missingOriginalLinks': len(missing), 'missingByReason': dict(Counter(r['reason'] for r in missing)),
        'areas': {name:{'originalLinks':len(rows), 'missing':len(rows - used)} for name, rows in locals_by_area.items()},
        'boundary': {key:meta['routing'][key] for key in ('entries','totalEntries','exits','totalExits')},
        'missing': missing,
    }


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--area', type=Path, required=True)
    parser.add_argument('--trace', type=Path, required=True)
    parser.add_argument('--reference', type=Path, default=MAPO/'tmp/connect/baseline')
    args = parser.parse_args()
    print(json.dumps(inspect(read_area(args.area), args.trace, args.reference), ensure_ascii=False, indent=2))
