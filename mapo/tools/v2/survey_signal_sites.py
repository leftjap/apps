"""Associate surveyed signal faces and B2 stops, keeping A2 geometry intact."""
from collections import defaultdict
from itertools import pairwise, zip_longest
import math

from shapely import get_parts
from shapely.geometry import LineString, Point
from shapely.ops import substring


def survey_signal_sites(links, crossings, lights, stops, central, central_floor, settings):
    pending = set(range(len(lights)))
    groups = []
    while pending:
        cluster = [min(pending)]
        pending.remove(cluster[0])
        for i in cluster:
            near = sorted(j for j in pending if
                          math.dist(lights[i]['at'], lights[j]['at']) <= settings['lampClusterMetres'])
            cluster.extend(near)
            pending.difference_update(near)
        groups.append(cluster)

    def centre(indices):
        return Point(*(sum(lights[i]['at'][k] for i in indices) / len(indices) for k in (0, 1)))

    main = [g for g in groups if central_floor.distance(centre(g)) <= settings['junctionLampMetres']]
    grouped = ([(True, sum(main, []))] if main else []) + [
        (False, g) for g in sorted((g for g in groups if g not in main),
                                   key=lambda g: tuple(centre(g).coords[0]))]
    sites = []
    for junction, group in grouped:
        lamp_ids = {lights[i]['id'] for i in group}
        faces = [c['id'] for c in crossings if lamp_ids.intersection(c['lamps'])]
        if faces:
            sites.append(dict(kind='junction' if junction else 'midblock',
                              at=list(centre(group).coords[0]), crossings=faces, approaches=[]))
    if not sites:
        return sites

    owners = {}
    for key, line in stops:
        site = min(sites, key=lambda s: line.distance(Point(s['at'])))
        if line.distance(Point(site['at'])) <= settings['stopMatchMetres']:
            owners[key] = site

    inner = set(central)
    junction = next((s for s in sites if s['kind'] == 'junction'), None)
    for row in links:
        if row['kind'] == '1':
            continue
        lane = LineString(row['points'])
        matches = {}
        for key, line in stops:
            site = owners.get(key)
            if not site or site['kind'] != 'midblock':
                continue
            for p in get_parts(lane.intersection(line)):
                if p.geom_type != 'Point':
                    continue
                at = lane.project(p)
                if not 0.5 < at < lane.length - 0.5:
                    continue
                dist = p.distance(Point(site['at']))
                coord = (dist, key, at)
                if coord < matches.get(tuple(site['at']), (math.inf, '', 0)):
                    matches[tuple(site['at'])] = coord
        for site in sites:
            if tuple(site['at']) in matches:
                _, key, at = matches[tuple(site['at'])]
                site['approaches'].append(dict(link=row['id'], line=key, at=at))
        if junction and inner.intersection(row['next']) and row['stop']:
            junction['approaches'].append(dict(link=row['id'], line=row['stop']['id'], at=row['stop']['at']))
    return sites


def split_at_signal_stops(data, sites):
    rows = data['links']
    cuts = defaultdict(list)
    junction = {}
    for site in sites:
        for approach in site['approaches']:
            if site['kind'] == 'midblock':
                cuts[approach['link']].append(approach)
            else:
                junction[approach['link']] = approach

    pieces = []
    groups = []
    ids = {}
    for row in rows:
        lane = LineString(row['points'])
        cuts_for_lane = sorted(cuts[row['id']], key=lambda p: p['at'])
        marks = [0, *(p['at'] for p in cuts_for_lane), lane.length]
        group = []
        for k, (start, end) in enumerate(pairwise(marks)):
            edge = len(pieces)
            if end - start < 0.5:
                raise ValueError(f"Surveyed stop spacing is too small on {row['id']}")
            part = dict(row)
            if cuts_for_lane:
                part.update(source=row['id'], sourceAt=start, id=row['id'] if k == 0 else f"{row['id']}~{k}",
                            points=list(substring(lane, start, end).coords), len=end-start)
            if k < len(cuts_for_lane):
                hit = cuts_for_lane[k]
                hit['edge'] = edge
                part['stop'] = dict(id=hit['line'], at=end-start)
            elif row['id'] in junction:
                hit = junction[row['id']]
                hit['edge'] = edge
                if cuts_for_lane:
                    part['stop'] = dict(id=hit['line'], at=hit['at']-start)
            elif cuts_for_lane:
                part['stop'] = None
            pieces.append(part)
            group.append(edge)
            ids[row['id'], k] = part['id']
        groups.append(group)

    for row, group in zip(rows, groups, strict=True):
        for k, edge in enumerate(group):
            part = pieces[edge]
            part['next'] = [group[k+1]] if k+1 < len(group) else [groups[j][0] for j in row['next']]
            part['duplicateOf'] = ids.get((row['duplicateOf'], k))

    data.update(
        links=pieces,
        bundles=[dict(bundle, lanes=[i for i in peers if i is not None]) for bundle in data['bundles']
                 for peers in zip_longest(*(groups[i] for i in bundle['lanes']))],
        bus=[j for i in data['bus'] for j in groups[i]],
        central=[j for i in data['central'] for j in groups[i]],
        signalSites=sites)
