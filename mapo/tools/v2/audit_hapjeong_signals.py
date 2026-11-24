"""Compare the released A2 paths and crossing polygons across the signal cycle."""
import argparse
from collections import defaultdict
from itertools import combinations
import json
from pathlib import Path
import subprocess

from shapely.geometry import LineString
from shapely.ops import substring

from check_hapjeong_walk import faces
from area import MAPO


def measure(plan):
    paths = {p['id']:p for p in plan['paths']}
    lanes = {i:LineString([point for link in p['route'] for point in link['points']]) for i,p in paths.items()}
    # Widest ordinary vehicle's half-width (sim/bodies.ts).
    strips = {i:line.buffer(1,cap_style='flat') for i,line in lanes.items()}
    polygons = {f['id']:faces(f['faces']) for f in plan['faces']}
    crossing = {i:{f for f,p in polygons.items() if strip.intersection(p).area>1e-6} for i,strip in strips.items()}
    pairs = []
    for p,q in combinations(paths.values(),2):
        if p['move']!=1 or q['move']!=1 or not set(p['phase'])&set(q['phase']):
            continue
        a,b = p['id'],q['id']
        overlap = strips[a].intersection(strips[b])
        lengths = []
        for i in (a,b):
            # Project intersecting pavement onto each centreline at 10cm spacing.
            line = lanes[i]
            lengths.append(round(sum(min(.1,line.length-s) for k in range(int(line.length*10)+1)
                                     if (s:=k*.1)<line.length and
                                     substring(line,s,min(line.length,s+.1)).buffer(1,cap_style='flat').intersection(overlap).area>1e-8),2))
        pairs.append(dict(a=p['ingress'],b=q['ingress'],distance=round(lanes[a].distance(lanes[b]),3),
                          overlap=round(overlap.area,3),lengths=lengths,engine=q['id'] in p['touches']))
    table = defaultdict(int)
    for second in range(plan['cycle']):
        phase = next(s for s in plan['phase'] if s['start']<=second<s['start']+s['duration'])
        green = dict(phase['green'])
        for i,p in paths.items():
            if not green.get(p['ingress'],0)&p['move']:
                continue
            for stripe in crossing[i]:
                table[phase['start'],p['ingress'],p['outlet'],p['move'],stripe,stripe in phase['walk']] += 1
    rows = [list(k)+[n] for k,n in sorted(table.items())]
    return dict(pairs=pairs,rows=rows,conflict_seconds=sum(row[-1] for row in rows if row[-2]),
                conflicts=[row for row in rows if row[-2]],paths_crossing={i:sorted(c) for i,c in crossing.items()})


def measure_car_phases(plan, result):
    paths = {p['id']:p for p in plan['paths']}
    lines = {i:LineString([point for link in path['route'] for point in link['points']])
             for i,path in paths.items()}
    pairs = {tuple(pair) for pair in plan['vehicleConflicts']}
    pairs.update((i,j) for i,j in combinations(paths,2)
                 if paths[i]['ingress'] != paths[j]['ingress'] and lines[i].crosses(lines[j]))
    vehicle, walking = [], []
    for step in plan['phase']:
        green = dict(step['green'])
        active = {i for i,p in paths.items() if green.get(p['ingress'],0) & p['move']}
        for i,j in sorted(pairs):
            if i in active and j in active:
                vehicle.append((step['start'], step['duration'], paths[i]['ingress'],paths[j]['ingress']))
        for i in sorted(active):
            for cross in sorted(set(result['paths_crossing'][i]).intersection(step['walk'])):
                walking.append((step['start'],step['duration'],paths[i]['ingress'],cross))
    result.update(vehicle_conflicts=vehicle, pedestrian_conflicts=walking,
                  vehicle_conflict_seconds=round(sum(row[1] for row in vehicle),6),
                  pedestrian_conflict_seconds=round(sum(row[1] for row in walking),6))


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    source=parser.add_mutually_exclusive_group(required=True)
    source.add_argument('plan', nargs='?', type=Path)
    source.add_argument('--area', type=Path)
    args=parser.parse_args()
    if args.area:
        plan=json.loads(subprocess.check_output(['node','--experimental-strip-types','tools/v2/hapjeong_signal_paths.mts',
                                                 '--cars-only','--area',str(args.area.resolve())],cwd=MAPO))
    else:
        plan=json.loads(args.plan.read_text())
    result=measure(plan)
    if 'vehicleConflicts' in plan:
        measure_car_phases(plan,result)
    print(json.dumps(result,ensure_ascii=False))
    if args.area and (result['vehicle_conflict_seconds'] or result['pedestrian_conflict_seconds']):
        raise SystemExit(1)
