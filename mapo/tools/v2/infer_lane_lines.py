"""Infer missing road markings from surveyed carriageway sections and A002 attributes."""
import argparse
from collections import Counter, defaultdict
from functools import lru_cache
from itertools import groupby
import json
import math
from pathlib import Path

import numpy as np
import shapely as s
from shapely.geometry import LineString, Point, Polygon, mapping
from shapely.ops import substring
from shapely.strtree import STRtree

from area import MAPO, area_window, read_area, read_asset
from bake_aerial_ground import Frame
from hapjeong_hd import marking_style
from land import even_odd
from lanes import JUNCTION_DEG, LANE_W, LANE_W_MAX, lane_lines
from road_audit import axis_score, line_heading, lines, raw_features, read_axes
from road_audit_raster import floor
from shp import dbf, shapes
from tm import tm_to_ll

MAIN_TYPES = {'1', '4', '6'}
B2_RADIUS = 10
WIDTH_STEP = 2
CUT_HALF = 45
MIN_WIDTH = 8
MAX_INFERENCE_WIDTH = 30
ATTRIBUTES = ('일방통행', '차로수', '도로폭')
AXIS_TOLERANCE = .05
JUNCTION_TOLERANCE = .75
PAINT_MARGIN = .10
MIN_PAINT_LENGTH = 8


def projected_lines(area, frame, layer):
    for row in raw_features(area, layer):
        geometry = row['geometry']
        paths = geometry['coordinates']
        if geometry['type'] == 'LineString':
            paths = [paths]
        for path in paths:
            if len(path) >= 2:
                line = LineString([frame.project(point[:2]) for point in path])
                if line.length:
                    yield row['properties'], line


def gaps(axes, outline, a2, roads):
    indexed = [(name, line) for name, group in axes.items() for line, _ in group]
    tree = STRtree([line for _, line in indexed])
    assigned = defaultdict(list)
    for row, link in a2:
        if row['linktype'] not in MAIN_TYPES or not outline.intersects(link):
            continue
        center = link.interpolate(.5, normalized=True)
        heading = line_heading(link, link.length / 2)
        radius = 25 if row['roadtype'] == '1' else 38
        nearby = tree.query(center, predicate='dwithin', distance=radius)
        aligned = [i for i in nearby if
                   abs(math.sin(line_heading(indexed[i][1], indexed[i][1].project(center)) - heading))
                   <= math.sin(math.pi / 4)]
        if aligned:
            best = min(aligned, key=lambda i: (axis_score(indexed[i][1], center, heading), i))
            assigned[indexed[best][0]].append(link)
    for name in roads:
        if not name.strip():
            continue
        axis = s.union_all([line.intersection(outline) for line, _ in axes.get(name, ())])
        if assigned[name]:
            axis = axis.difference(s.union_all(s.buffer(assigned[name], 33, cap_style='flat')))
        if axis.length >= .005:
            yield name, axis


def source_axes(area, frame, outline):
    for file in sorted((MAPO / area['sources']['sheets']).glob('*/N1L_A0020000.shp')):
        _, attrs = dbf(file.with_suffix('.dbf'))
        for (kind, paths), row in zip(shapes(file), attrs, strict=True):
            if kind != 3:
                continue
            for path in paths:
                if len(path) >= 2:
                    line = LineString([frame.project(tm_to_ll(*p)[::-1]) for p in path])
                    if line.length and outline.intersects(line):
                        yield row, line


def survey_polygons(area, frame, outline, code):
    for file in sorted((MAPO / area['sources']['sheets']).glob(f'*/N1A_{code}.shp')):
        for kind, paths in shapes(file):
            if kind != 5 or not paths:
                continue
            projected = [[frame.project(tm_to_ll(*point)[::-1]) for point in ring] for ring in paths]
            if not Polygon(projected[0]).envelope.intersects(outline):
                continue
            face = even_odd(projected)
            if face is not None:
                yield from (part for part in s.get_parts(face.intersection(outline))
                            if part.geom_type == 'Polygon' and part.area)


def carriageways(roads, sidewalks):
    for road in roads:
        hits = sidewalks.query(road, predicate='intersects')
        face = road.difference(s.union_all(sidewalks.geometries[hits])) if len(hits) else road
        yield from (part for part in s.get_parts(face) if part.geom_type == 'Polygon' and part.area)


def section(line, distance, tree):
    point = line.interpolate(distance)
    heading = line_heading(line, distance)
    p = np.array([point.x, point.y])
    r = np.array([-math.sin(heading), math.cos(heading)])
    cut = LineString([p - CUT_HALF * r, p + CUT_HALF * r])
    hits = tree.query(cut, predicate='intersects')
    joined = s.line_merge(s.union_all(s.intersection(tree.geometries[hits], cut), grid_size=.00001))
    continuous = [part for part in lines(joined) if part.distance(point) < .00002]
    if not continuous:
        return point, None
    part = max(continuous, key=lambda part: part.length)
    lo, hi = sorted(float(np.dot(np.array(coord) - p, r)) for coord in (part.coords[0], part.coords[-1]))
    return point, {'d': distance, 'p': p, 'r': r, 'lo': lo, 'hi': hi, 'width': part.length}


def subtract_buffer(line, tree, radius, buffer):
    hits = tree.query(line, predicate='dwithin', distance=radius)
    return line.difference(s.union_all([buffer(int(i)) for i in hits])) if len(hits) else line


def junctions(axis, name, tree, sources):
    # Other A002 axes, including unnamed side streets, must leave the junction clear.
    masks = []
    for i in tree.query(axis, predicate='dwithin', distance=JUNCTION_TOLERANCE):
        row, other = sources[i]
        contact = axis.intersection(other)
        points = [point for point in s.get_parts(contact) if point.geom_type == 'Point']
        if contact.is_empty:
            close = axis.intersection(other.buffer(JUNCTION_TOLERANCE))
            points = [part.centroid for part in lines(close)]
        for point in points:
            angle = line_heading(axis, axis.project(point)) - line_heading(other, other.project(point))
            angle_sine = abs(math.sin(angle))
            if (contact.is_empty or row['도로명'] == name) and angle_sine < math.sin(math.radians(JUNCTION_DEG)):
                continue
            half_width = min(MAX_INFERENCE_WIDTH, float(row['도로폭'] or 0)) / 2
            # Project the entering road's half-width along this axis at skew junctions.
            radius = max(4.5, half_width / max(.35, angle_sine) + 2)
            masks.append(point.buffer(radius))
    return s.union_all(masks)


def lane_dividers(count, width):
    return count // 2 if count >= 4 and abs(count * LANE_W - width) <= .25 * width else 1


def align_sections(run):
    # A single valid station still represents its full sampling interval.
    if len(run) == 1:
        k = run[0]
        k.update(lo2=k['lo'], hi2=k['hi'], cu=(k['lo'] + k['hi']) / 2)
    else:
        lane_lines(run, 2, False)


def mark_paths(run, axis, step, half_count, offsets):
    distances = [max(0., run[0]['d'] - step / 2), *(k['d'] for k in run),
                 min(axis.length, run[-1]['d'] + step / 2)]
    sections = [run[0], *run, run[-1]]
    for i in offsets:
        coords = []
        for distance, k in zip(distances, sections):
            point = axis.interpolate(distance)
            width = min(LANE_W_MAX, (k['hi2'] - k['lo2']) / (2 * half_count))
            coords.append(np.array([point.x, point.y]) + (k['cu'] + i * width) * k['r'])
        yield LineString(coords)


def clear_paint(line, junction_faces, crossing_tree, road_tree, b2_tree, near_b2, stats):
    kept = line.difference(junction_faces)
    stats['junction'] += line.length - kept.length
    crossings = crossing_tree.query(kept, predicate='dwithin', distance=PAINT_MARGIN)
    clear = kept.difference(s.union_all(s.buffer(crossing_tree.geometries[crossings], PAINT_MARGIN)))
    stats['crossing'] += kept.length - clear.length
    b2_clear = subtract_buffer(clear, b2_tree, 2 + PAINT_MARGIN, near_b2)
    stats['near_b2'] += clear.length - b2_clear.length
    # Intersect locally so a tile-sized path never requires unioning the district floor.
    nearby = road_tree.query(b2_clear, predicate='intersects')
    inside = s.line_merge(s.union_all(s.intersection(road_tree.geometries[nearby], b2_clear)))
    stats['outside'] += b2_clear.length - inside.length
    paths = []
    for path in lines(inside):
        if path.length < MIN_PAINT_LENGTH:
            stats['fragment'] += path.length
        else:
            paths.append(list(path.coords))
    return paths


def infer_lane_lines(area, asset, *, road_names=None, collect_sections=False):
    frame = Frame(*area['frame']['origin'], 0)
    outline = area_window(area)
    # Keep the same A002 road inventory and A2 matching as the gap audit.
    axes = read_axes(area, frame, outline, None)
    sources = list(source_axes(area, frame, outline))
    axis_tree = STRtree([line for _, line in sources])
    b2_tree = STRtree([line for _, line in projected_lines(area, frame, 'b2')])
    cuts = STRtree(list(carriageways(
        survey_polygons(area, frame, outline, 'A0010000'),
        STRtree(list(survey_polygons(area, frame, outline, 'A0033320'))),
    )))
    crossing_tree = STRtree(list(floor(face for row in asset['crossings'] for face in row['faces'])))
    road_tree = STRtree(list(floor(asset['floor']['road'])))

    @lru_cache(maxsize=6000)
    def b2_buffer(index):
        return b2_tree.geometries[index].buffer(B2_RADIUS, quad_segs=24)

    @lru_cache(maxsize=6000)
    def near_b2(index):
        return b2_tree.geometries[index].buffer(2 + PAINT_MARGIN, quad_segs=24)

    result = []
    details = []
    stats = Counter()
    for name, missing in gaps(axes, outline, projected_lines(area, frame, 'a2'), road_names or axes):
        road_marks = defaultdict(list)
        junction_faces = s.union_all([junctions(axis, name, axis_tree, sources) for axis, _ in axes[name]])
        for part in lines(missing):
            open_axis = subtract_buffer(part, b2_tree, B2_RADIUS, b2_buffer)
            stats['b2'] += part.length - open_axis.length
            for axis in lines(open_axis):
                if axis.length <= 1e-7:
                    continue
                count = math.ceil(axis.length / WIDTH_STEP)
                step = axis.length / count
                samples = []
                for i in range(count):
                    point, k = section(axis, (i + .5) * step, cuts)
                    if k is None or not MIN_WIDTH <= k['width'] <= MAX_INFERENCE_WIDTH:
                        stats['width'] += step
                        samples.append(None)
                        continue
                    attrs = {tuple(sources[j][0][field] for field in ATTRIBUTES)
                             for j in axis_tree.query(point, predicate='dwithin', distance=AXIS_TOLERANCE)
                             if sources[j][0]['도로명'] == name}
                    k['attrs'] = attrs
                    samples.append(k)
                    stats['eligible_width'] += step
                if collect_sections:
                    for eligible, group in groupby(enumerate(samples), key=lambda item: item[1] is not None):
                        if eligible:
                            entries = list(group)
                            details.append({
                                'road': name,
                                'axis': mapping(substring(axis, entries[0][0] * step, (entries[-1][0] + 1) * step)),
                                'stations': [{'xy': k['p'].tolist(), 'width': k['width'],
                                              'attributes': [dict(zip(ATTRIBUTES, row)) for row in sorted(k['attrs'])]}
                                             for _, k in entries],
                            })
                for k in samples:
                    if k is None:
                        continue
                    attrs = k['attrs']
                    if not attrs or any(row[0] != '양방통행' for row in attrs):
                        stats['oneway' if any(row[0] == '일방통행' for row in attrs) else 'unknown'] += step
                        continue
                    counts = {int(row[1] or 0) for row in attrs}
                    k['lanes'] = lane_dividers(counts.pop(), k['width']) if len(counts) == 1 else 1
                for accepted, group in groupby(samples, key=lambda k: k is not None and 'lanes' in k):
                    if not accepted:
                        continue
                    run = list(group)
                    # Reuse the inward quartiles and local edge averaging. Keep one
                    # central line through changes in the number of dashed dividers.
                    align_sections(run)
                    markings = {('501', '111'): mark_paths(run, axis, step, 1, (0,)), ('503', '212'): []}
                    for half_count, divider_run in groupby(run, key=lambda k: k['lanes']):
                        if half_count > 1:
                            offsets = [i for i in range(1 - half_count, half_count) if i]
                            markings['503', '212'].extend(mark_paths(list(divider_run), axis, step, half_count, offsets))
                    for key, paths in markings.items():
                        for path in paths:
                            road_marks[key].extend(clear_paint(
                                path, junction_faces, crossing_tree, road_tree, b2_tree, near_b2, stats))
        for (kind, line_type), paths in sorted(road_marks.items()):
            if paths:
                result.append({'id': f'width-rule:{kind}:{name}', 'kind': kind, 'type': line_type,
                               'paths': paths, 'ink': marking_style(kind, line_type),
                               'origin': 'width-rule', 'road': name})
    return result, stats, details


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--area', type=Path, required=True)
    parser.add_argument('--road', action='append', help='Limit the report to named roads for review')
    args = parser.parse_args()
    area = read_area(args.area)
    markings, excluded, sections = infer_lane_lines(
        area, read_asset(area, '-a'), road_names=args.road, collect_sections=True)
    print(json.dumps({'lines': markings, 'metres': excluded, 'sections': sections}, ensure_ascii=False))


if __name__ == '__main__':
    main()
