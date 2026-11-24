"""Associate surveyed signal faces and B2 stops, keeping A2 geometry intact."""
from collections import defaultdict
from itertools import pairwise, zip_longest
import math

from shapely import get_parts, union_all
from shapely.geometry import LineString, Point
from shapely.ops import substring


def junction_layout(links, floors):
    """Give each A2 connector to the A008 face covering its longest section."""
    areas = list(get_parts(union_all(floors)))
    members = defaultdict(list)
    for i, row in enumerate(links):
        if row['kind'] != '1':
            continue
        line = LineString(row['points'])
        length, owner = max(((face.intersection(line).length, j)
                             for j, face in enumerate(areas) if face.intersects(line)), default=(0, -1))
        if length > line.length / 2:
            members[owner].append(i)
    return [(areas[i], group) for i, group in members.items()]


def approach_arms(approaches, links):
    """Cluster directed headings, keeping opposite approaches in separate arms."""
    lanes = {row['id']: LineString(row['points']) for row in links}
    headings = []
    for row in approaches:
        line = lanes[row['link']]
        a = line.interpolate(max(0, line.length-18))
        b = line.interpolate(max(0, line.length-8))
        headings.append(math.atan2(b.y-a.y, b.x-a.x))
    arms = []
    for row, heading in zip(approaches, headings, strict=True):
        arm = next((i for i, angles in enumerate(arms) if all(
            abs(math.remainder(heading-a, math.tau)) <= math.radians(24) for a in angles)), None)
        if arm is None:
            arm = len(arms)
            arms.append([])
        arms[arm].append(heading)
        row['arm'] = arm


def survey_signal_sites(links, crossings, lights, stops, central, central_floor, settings, junctions=None):
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

    per_junction = defaultdict(list)
    layout = junctions if junctions is not None else [(central_floor, central)]
    remaining = []
    for group in groups:
        at = centre(group)
        distance, i = min(((face.distance(at), i) for i, (face, _) in enumerate(layout)), default=(math.inf, -1))
        if distance <= settings['junctionLampMetres']:
            per_junction[i].extend(group)
        else:
            remaining.append(group)
    grouped = list(sorted(per_junction.items())) + [
        (None, g) for g in sorted(remaining, key=lambda g: tuple(centre(g).coords[0]))]
    sites = []
    connector_site = {}
    for j, group in grouped:
        lamp_ids = {lights[i]['id'] for i in group}
        faces = [c['id'] for c in crossings if lamp_ids.intersection(c['lamps'])]
        if faces:
            site = dict(kind='junction' if j is not None else 'midblock',
                        at=list(centre(group).coords[0]), crossings=faces, approaches=[])
            if j is not None:
                connectors = layout[j][1]
                if junctions is not None:
                    site['connectors'] = connectors
                connector_site.update((i, site) for i in connectors)
            sites.append(site)
    if not sites:
        return sites

    owners = {}
    for key, line in stops:
        site = min(sites, key=lambda s: line.distance(Point(s['at'])))
        if line.distance(Point(site['at'])) <= settings['stopMatchMetres']:
            owners[key] = site

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
        junction = next((connector_site[i] for i in row['next'] if i in connector_site), None)
        if junction and (row['stop'] or junctions is not None):
            stop = row['stop']
            junction['approaches'].append(dict(link=row['id'], line=stop['id'] if stop else None,
                                               at=stop['at'] if stop else lane.length))
    if junctions is not None:
        for site in sites:
            if site['kind'] == 'junction':
                approach_arms(site['approaches'], links)
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
                part.update(source=row.get('source', row['id']), sourceAt=start, id=row['id'] if k == 0 else f"{row['id']}~{k}",
                            points=list(substring(lane, start, end).coords), len=end-start)
                if 'clippedStart' in row:
                    part.update(clippedStart=k == 0 and row['clippedStart'],
                                clippedEnd=k == len(marks)-2 and row['clippedEnd'])
            if k < len(cuts_for_lane):
                hit = cuts_for_lane[k]
                hit['edge'] = edge
                part['stop'] = dict(id=hit['line'], at=end-start)
            elif row['id'] in junction:
                hit = junction[row['id']]
                hit['edge'] = edge
                if cuts_for_lane or 'arm' in hit:
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

    for site in sites:
        if 'connectors' in site:
            site['connectors'] = [j for i in site['connectors'] for j in groups[i]]
    if 'busRoutes' in data:
        data['busRoutes'] = [[j for i in chain for j in groups[i]] for chain in data['busRoutes']]
    data.update(
        links=pieces,
        bundles=[dict(bundle, lanes=[i for i in peers if i is not None]) for bundle in data['bundles']
                 for peers in zip_longest(*(groups[i] for i in bundle['lanes']))],
        bus=[j for i in data['bus'] for j in groups[i]],
        central=[j for i in data['central'] for j in groups[i]],
        signalSites=sites)
