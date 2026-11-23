# /// script
# requires-python = ">=3.10"
# dependencies = ["numpy", "shapely>=2.1"]
# ///
"""Replay and compare the Hapjeong behavior rules before committing."""
import argparse
import csv
from itertools import combinations
import json
import math
from pathlib import Path
from statistics import median
import subprocess

import numpy as np

import audit_hapjeong_crowd as courses
import audit_hapjeong_signals as signals
import check_hapjeong_branch_stops as branch
import check_hapjeong_car_run as cars
import check_hapjeong_crowding as crowd
import check_hapjeong_entrances as entrances
import check_hapjeong_people as people
import check_hapjeong_walk as walk
from measure_hapjeong_discharge import discharge

# Absolute limits. Compare additional flow measures to the previous replay.
LIMITS = {
    'P1': {'people_on_red': 0, 'cars_on_red': 0, 'signed_face_cars': 0, 'overlap_seconds': 0},
    'P2': {'unsignalized_cars': 0, 'body_contacts': 0, 'people_wait_s': 60, 'car_wait_s': 60},
    'P3': {'different_green': 0, 'refuge_wait': 0, 'trial_refuge_wait': 0},
    'P4': {'missing_direction': 0, 'visible_events': 0, 'peak_exit_per_second': 1},
    'P5': {'stuck': 0, 'green_wait': 0, 'repeat_people': 0, 'off_floor': 0, 'invalid': 0},
    'P6': {'green_queue_remaining': 0},
    'C1': {}, 'C2': {},
    'C3': {'late_left': 0, 'parallel_start_gap_s': .85, 'unserved_parallel': 0},
    'C4': {'open_branch_stop': 0, 'empty_stop_line': 0},
    'C5': {'stuck': 0, 'visible_events': 0, 'off_floor': 0, 'overlap': 0, 'a2_m': .001},
    'C6': {'trial_red': 0, 'late': 0, 'trial_late': 0, 'trial_face_cars': 0},
}
# Compare the traffic counts and accumulation where a zero is not the goal.
NO_INCREASE = {'P2': ('people_wait_s', 'car_wait_s'), 'P6': ('peak_5m', 'walk_blocked', 'growing_visible_ends')}
NO_DECREASE = {'P4': ('models',), 'C1': ('min_cars', 'max_cars', 'queue_median')}
# Allow one tick of 30 Hz quantization at each recorded stop line.
RANK_TOLERANCE = 1 / 30


def load(path):
    return json.loads(path.read_text())


def replay(tree, folder):
    def run(script, output, *args):
        dest = folder / output
        with dest.open('w') as stream:
            subprocess.run(['node', '--experimental-strip-types', f'tools/v2/{script}.mts', *args],
                           cwd=tree, stdout=stream, check=True)
    legacy_crowd = ['--crowd'] if (tree/'public/data/v2/hapjeong-hd-crowd.json').is_file() else []
    run('trace_hapjeong_cars', 'trace.ndjson', '--people', *legacy_crowd)
    run('trace_hapjeong_cars', 'signal.ndjson', '--signal-test', *legacy_crowd)
    run('hapjeong_signal_paths', 'paths.json')


def cross_cars(rows, signed, signatures):
    return sorted({uid for row in rows if signatures[row['face']] == signed for uid in row['car_touch']})


def left_pairs(flow, plan):
    headings = {p['ingress']:p['angle'] for p in plan['paths'] if p['move']==1}
    rows = [r for r in flow['phases'] if r['move']==1 and r['queue'] and r['edge'] in headings]
    pairs = []
    for a,b in combinations(rows,2):
        if a['start'] != b['start'] or abs(math.remainder(headings[a['edge']]-headings[b['edge']], math.tau)) > .15:
            continue
        first = [r['roll'].get(r['queue'][0]) for r in (a,b)]
        pairs.append(dict(lanes=[a['edge'],b['edge']], at=a['start'], first=first,
                          gap=round(abs(first[0]-first[1]),3) if None not in first else None))
    return pairs


def measure(tree, folder, label):
    # The historical code drives each replay and supplies the matching geometry.
    walk.DATA = cars.DATA = tree/'public/data/v2'
    cars.rendered_footprints.cache_clear()
    plan = load(folder/'paths.json')
    static = signals.measure(plan)
    static['paths_crossing'] = {str(k):v for k,v in static['paths_crossing'].items()}
    trace = folder/'trace.ndjson'
    with trace.open() as stream:
        meta = json.loads(next(stream))
        stream.seek(0)
        p = people.audit(stream)
        stream.seek(0)
        c = cars.audit(False, True, stream)
        stream.seek(0)
        growth = crowd.audit(stream,plan)
        stream.seek(0)
        portal = entrances.audit(stream)
        stream.seek(0)
        branch_result = branch.audit(stream,walk.read('cars'))
    trial = courses.audit(folder/'signal.ndjson',plan,static)
    ambient = courses.audit(trace,plan,static)
    flow = discharge(trace)
    pairs = left_pairs(flow,plan)
    signed = {r['id']:r['sig'] for r in meta['crosswalks']}
    green = {r['id']:r['green'] for r in meta['crosswalks']}
    full = {r['id']:r['id'][-4:] for r in plan['faces']}
    signed_cars = cross_cars(ambient['course_rows'],True,signed)
    unsignalized = cross_cars(ambient['course_rows'],False,signed)
    visible_growth = [r for r in growth['ends'] if not r['signed'] and r['exceed']
                      and any(crowd.in_view(np.array([r['at']]),v)[0] for v in meta['views'])]
    exit_rows = {r['key']:portal['events'].get(r['key'], {}) for r in meta.get('entrances',[])}
    maximum = lambda d,k: max((v[k] for v in d if v[k] is not None),default=0)
    metric = {
        'P1': dict(people_on_red=len(p['red_entries']), cars_on_red=len(c['red']),
                   signed_face_cars=len(signed_cars), overlap_seconds=static['conflict_seconds']),
        'P2': dict(unsignalized_cars=max(len(unsignalized),len(p['passing_with_person'])),
                   body_contacts=len(p['contact']), people_wait_s=growth['traffic_delay'][0]['seconds'],
                   car_wait_s=growth['traffic_delay'][1]['seconds']),
        'P3': dict(different_green=sum(len({str(green[full[x]]) for x in group})>1 for group in walk.read('cars')['walkSignalGroups']),
                   refuge_wait=sum(r['next_phase_wait'] for r in ambient['course_rows']),
                   trial_refuge_wait=sum(r['next_phase_wait'] for r in trial['course_rows'])),
        'P4': dict(models=portal['models'], missing_direction=sum(not (r.get('incoming') and r.get('outgoing')) for r in exit_rows.values()) if exit_rows else None,
                   visible_events=len(portal['visible']), peak_exit_per_second=max((r.get('peakPerSecond',0) for r in exit_rows.values()),default=None)),
        'P5': dict(stuck=len(p['stuck']), green_wait=len(p['green_wait']),
                   repeat_people=len({r[0] for r in p['repeat']}), off_floor=p['off_floor_samples'], invalid=p['engine_invalid_samples']),
        'P6': dict(peak_5m=max(r['best']['n'] for r in growth['peaks'] if r['best']),
                   green_queue_remaining=sum(len(r['remaining']) for r in growth['green_clearance']),
                   walk_blocked=len(growth['queue_blocked']), growing_visible_ends=len(visible_growth)),
        'C1': dict(min_cars=c['cars'][0], max_cars=c['cars'][1], queue_median=median(len(r['queue']) for r in flow['phases'] if r['move']==2)),
        'C2': dict(**{f'rank{k}_s':v[1] for k,v in flow['rank'].items() if int(k)>=4},
                   **{f'gap{k}_m':v[1] for k,v in flow['speed_gaps'].items()}),
        'C3': dict(late_left=len(flow['left_conflicts_over_three']),
                   parallel_start_gap_s=maximum(pairs,'gap'), unserved_parallel=sum(r['gap'] is None for r in pairs)),
        'C4': dict(open_branch_stop=branch_result['counts'].get('branch',0), empty_stop_line=branch_result['counts'].get('stopLine',0)),
        'C5': dict(stuck=len(c['stalled']), visible_events=len(c['visible_events']), off_floor=c['off_floor_samples'],
                   overlap=len(c['overlap']), a2_m=c['max_a2_deviation']),
        'C6': dict(trial_red=sum(r['red'] for r in trial['course_rows']), late=sum(r['late'] for r in ambient['course_rows']),
                   trial_late=sum(r['late'] for r in trial['course_rows']),
                   trial_face_cars=len({uid for r in trial['course_rows'] for uid in r['car_touch']})),
    }
    detail = dict(seconds=meta['duration'], views=ambient['views'], signed_cars=signed_cars, unsignalized_cars=unsignalized,
                  phases=flow['phases'], ranks=flow['rank'], speed_gaps=flow['speed_gaps'], reasons=flow['reasons'],
                  left_pairs=pairs, turn_conflicts=flow['left_conflicts_over_three'], crowding=growth, entrances=portal,
                  branch=branch_result, movement=c['movement'], car_floor={k:v for k,v in c.items() if 'Floor' in k},
                  ordinary_crossings=ambient['course_rows'], trial_crossings=trial['course_rows'],
                  stuck=p['stuck'], green_wait=p['green_wait'], repeat=p['repeat'])
    return dict(label=label,rules=metric,detail=detail)


def evaluate(result, incumbent=None):
    failure = []
    metrics = result['rules']
    for rule, checks in LIMITS.items():
        for key, limit in checks.items():
            val = metrics[rule].get(key)
            if val is None or val > limit:
                failure.append(dict(rule=rule,test=key,measured=val,limit=limit))
    if not metrics['P4']['models']:
        failure.append(dict(rule='P4',test='models',measured=0,limit='at least 1'))
    if incumbent:
        before = incumbent['rules']
        for rule, keys in NO_INCREASE.items():
            for key in keys:
                if metrics[rule][key] > before[rule][key]:
                    failure.append(dict(rule=rule,test=key,measured=metrics[rule][key],limit=before[rule][key]))
        for rule, keys in NO_DECREASE.items():
            for key in keys:
                if metrics[rule][key] < before[rule][key]:
                    failure.append(dict(rule=rule,test=key,measured=metrics[rule][key],limit=before[rule][key]))
        for key,value in before['C2'].items():
            limit = value + (RANK_TOLERANCE if key.startswith('rank') else 0)
            measured = metrics['C2'].get(key)
            if measured is None or measured > limit:
                failure.append(dict(rule='C2',test=key,measured=measured,limit=round(limit,3)))
    return failure


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out',type=Path,required=True)
    parser.add_argument('--tree',type=Path,default=walk.DATA.parents[2])
    parser.add_argument('--label', default='worktree')
    parser.add_argument('--against',type=Path,help='incumbent rules.json for non-regression')
    parser.add_argument('--target',nargs=2,metavar=('RULE','METRIC'),help='require this metric to improve against the incumbent')
    parser.add_argument('--recorded',action='store_true',help='reuse trace.ndjson, signal.ndjson and paths.json already in --out')
    parser.add_argument('--measure-only',action='store_true',help='write results for a historical revision even when the gate rejects it')
    arg = parser.parse_args()
    folder, tree = arg.out.resolve(),arg.tree.resolve()
    folder.mkdir(parents=True,exist_ok=True)
    if not arg.recorded:
        replay(tree,folder)
    result = measure(tree,folder,arg.label)
    incumbent = load(arg.against) if arg.against else None
    failures = evaluate(result,incumbent)
    if arg.target:
        rule,key = arg.target
        if not incumbent:
            parser.error('--target requires --against')
        measured, prior = result['rules'][rule][key],incumbent['rules'][rule][key]
        delta = measured - prior if measured is not None and prior is not None else 0
        if delta * (1 if key in NO_DECREASE.get(rule, ()) else -1) <= 0:
            failures.append(dict(rule=rule,test=f'{key} improvement',measured=measured,limit=prior))
    result['failures'] = failures
    (folder/'rules.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    with (folder/'rules.tsv').open('w') as stream:
        table = csv.writer(stream,delimiter='\t')
        table.writerow(['기준','항목',*([incumbent['label']] if incumbent else []),arg.label,'미달'])
        for rule, checks in result['rules'].items():
            for key,value in checks.items():
                table.writerow([rule,key,*([incumbent['rules'][rule].get(key)] if incumbent else []),
                                value,'예' if any(f['rule']==rule and f['test']==key for f in failures) else ''])
    print(f"{folder/'rules.tsv'} | {len(failures)}개 기준 미달")
    return int(bool(failures) and not arg.measure_only)


if __name__ == '__main__':
    raise SystemExit(main())
