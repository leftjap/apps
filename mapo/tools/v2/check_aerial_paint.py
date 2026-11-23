"""Fail on intersections in the actual painted geometry of an aerial asset."""
import argparse
import json
import math
from collections import Counter
from pathlib import Path

from shapely.geometry import LineString, Polygon
from shapely.ops import unary_union
from shapely.strtree import STRtree

from aerial_paint import arrow_geometry, line_footprint, paint_definitions
from aerial_placement import ARROW_UPSTREAM_METRES, matching_stop, same_stop_lane
from bake_aerial_ground import Frame, RAW

TYPES = (
    ('arrow','arrow'), ('arrow','stop'), ('arrow','zebra'),
    ('lane','zebra'), ('lane','stop'),
)
EPS = 1e-8


def footprints(data):
    frame = Frame(*data['centre'],angle=0)
    groups = {key:[] for key in ('arrow','stop','zebra','lane')}
    for line in data['lines']:
        kind = 'stop' if line['kind']==4 else 'lane' if line['kind'] in (1,2,3,5,6,8,17,18) else None
        if kind:
            groups[kind].append((line['id'],line_footprint(line,frame.project)))
    for cross in data['crossings']:
        strips = [Polygon([frame.project(p) for p in ring]) for ring in cross['stripes']]
        groups['zebra'].append((cross['id'],unary_union(strips)))
    for arrow in data['arrows']:
        if not arrow.get('duplicateOf'):
            groups['arrow'].append((arrow['id'],arrow_geometry(arrow,frame.project,frame.vector)))
    return groups


def conflicts(data):
    groups = footprints(data)
    for a,b in TYPES:
        right = groups[b]
        tree = STRtree([g for _,g in right])
        for i,(key,g) in enumerate(groups[a]):
            for j in sorted(tree.query(g)):
                if a==b and j<=i:
                    continue
                other,h = right[j]
                area = g.intersection(h).area
                if area>EPS:
                    yield a,b,key,other,area


def check(data):
    found = list(conflicts(data))
    for a,b,key,other,area in found:
        print(f'FAIL | {a}×{b} | {key}×{other} | {area:.8f}㎡')
    for a,b in TYPES:
        print(f'{a}×{b} | 실패 {sum((x,y)==(a,b) for x,y,*_ in found)}')
    inventory = data.get('arrowInventory',{})
    omitted = inventory.get('omitted',[])
    placement = [row for row in omitted if row['reason'] in
                 ('no-clear-placement-at-fixed-offset','placement-outside-road')]
    for item in placement:
        print(f"FAIL | placement | {item['id']} | {item['reason']} · {item.get('stop')} · {item.get('lane')}")
    accounted = 0
    if 'omitted' in inventory:
        all_ids = [a['id'] for a in [*data['arrows'],*omitted]]
        source = json.loads((RAW/'seoul-arrows.json').read_text())['arrows']
        source_ok = all(
            (a['sourceAt'],a['kind'],a['sourceBearing'])==([q['lon'],q['lat']],int(q['kind']),q['drn'])
            for a in [*data['arrows'],*omitted] for q in [source[int(a['id'][1:])]])
        if len(set(all_ids))!=len(all_ids) or len(all_ids)!=inventory['frameRows'] or not source_ok:
            accounted = 1
            print('FAIL | arrow source inventory does not reconcile')
        frame = Frame(*data['centre'],angle=0)
        stops = {line['id']:line for line in data['lines'] if line['kind']==4}
        axes = {key:max((LineString([frame.project(p) for p in path]) for path in stop['parts']),
                        key=lambda line:line.length) for key,stop in stops.items()}
        prior = []
        for arrow in data['arrows']:
            angle = math.radians(arrow['bearing'])
            stop = stops.get(arrow['stop'])
            anchor = (matching_stop(frame.project(arrow['at']),(math.cos(angle),-math.sin(angle)),[stop],frame)
                      if stop else None)
            duplicate = any(same_stop_lane(p,arrow,axes,frame) for p in prior)
            if (anchor is None or abs(anchor[0]-ARROW_UPSTREAM_METRES)>.03 or duplicate or
                ARROW_UPSTREAM_METRES!=arrow['upstreamMetres']):
                print(f"FAIL | placement | {arrow['id']} | fixed offset or duplicate lane")
                placement.append(arrow)
            prior.append(arrow)
        print(f"원자료 {inventory['frameRows']}행 · 생성 {len(data['arrows'])} · 미생성 {len(omitted)} "
              f"· 사유 {dict(Counter(a['reason'] for a in omitted))}")
        print(f"읽을 수 있는 정지선 차로 {inventory['mappedStopLanes']}칸 · 대응 원자료 없음 {len(inventory['noMatchedSource'])}칸")
        print(f"같은 시설 중복 삭제 {dict(Counter(a['type'] for a in data['duplicates']))}")
    total = len(found)+len(placement)+accounted
    print(f'실패 {total}건 · 도색 겹침 {len(found)} · 배치 {len(placement)} · 원자료 회계 {accounted}')
    return total



if __name__=='__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('assets',nargs='+',type=Path)
    args = parser.parse_args()
    total = 0
    for path in args.assets:
        print(path)
        total += check(json.loads(path.read_text()))
    raise SystemExit(int(total>0))
