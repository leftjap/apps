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
import check_hapjeong_crossing_widths as crossing_widths
import check_hapjeong_entrances as entrances
import check_hapjeong_people as people
import check_hapjeong_walk as walk
import check_hapjeong_visible as visible
from measure_hapjeong_discharge import discharge
from area import MAPO, asset, read_area

# Absolute limits. Compare additional flow measures to the previous replay.
LIMITS = {
    'P1': {'people_on_red': 0, 'cars_on_red': 0, 'signed_face_cars': 0, 'overlap_seconds': 0},
    'P2': {'unsignalized_cars': 0, 'body_contacts': 0, 'people_wait_s': 60, 'car_wait_s': 60},
    'P3': {'different_green': 0, 'refuge_wait': 0, 'trial_refuge_wait': 0,
           'island_wait_on_red': 0, 'trial_island_wait_on_red': 0},
    'P4': {'missing_direction': 0, 'visible_events': 0, 'peak_exit_per_second': 1, 'rail_to_rail': 0},
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
NO_DECREASE = {'P4': ('models',), 'P5': ('min_link_face_pct',), 'C1': ('min_cars', 'max_cars', 'queue_median'),
               'C3': ('min_left_passed',)}
MIN_LEFT_PASSED = 3
RANK_TOLERANCE = .1
VIEW_MEDIAN_TOLERANCE = 2
PEOPLE_STAGE_LEFT_LIMIT = 12


def rank_average(metrics):
    values = [metrics.get(f'rank{n}_s') for n in (4, 5, 6)]
    return round(sum(values) / 3, 3) if None not in values else None


def load(path):
    return json.loads(path.read_text())


def replay(tree, folder, area, area_path, *, cars_only=False):
    area_args = ['--area', str(area_path)] if area_path else []
    def run(script, output, *args):
        dest = folder / output
        with dest.open('w') as stream:
            subprocess.run(['node', '--experimental-strip-types', f'tools/v2/{script}.mts', *args, *area_args],
                           cwd=tree, stdout=stream, check=True)
    if cars_only:
        run('trace_hapjeong_cars', 'trace.ndjson')
        return
    legacy_crowd = ['--crowd'] if asset(area, '-crowd', root=tree).is_file() else []
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


def measure_cars_only(tree, folder, area):
    walk.ROOT, walk.AREA = tree, area
    cars.rendered_footprints.cache_clear()
    with (folder/'trace.ndjson').open() as stream:
        report = cars.audit(False, False, stream)
    hashes = visible.check_legacy(tree)
    failures = {name: report[name] for name in
                ('red', 'visible_events', 'overlap', 'stalled', 'off_floor_samples') if report[name]}
    failures.update({name: data for name, data in hashes.items() if not data['passed']})
    return dict(cars=report, legacy=hashes, failures=failures)


def measure(tree, folder, label, area, *, visible_only=False, check_buses=True):
    # The historical code drives each replay and supplies the matching geometry.
    walk.ROOT, walk.AREA = tree, area
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
    widths = crossing_widths.measure(walk.read('a'), walk.read('walk'))
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
                   body_contacts=len(p['contact']), occupied_landing_passages=sum(map(len, p['landings_passage_episodes'].values())),
                   people_wait_s=growth['traffic_delay'][0]['seconds'],
                   car_wait_s=growth['traffic_delay'][1]['seconds']),
        'P3': dict(different_green=sum(len({str(green[full[x]]) for x in group})>1 for group in walk.read('cars')['walkSignalGroups']),
                   refuge_wait=sum(r['next_phase_wait'] for r in ambient['course_rows']),
                   trial_refuge_wait=sum(r['next_phase_wait'] for r in trial['course_rows']),
                   island_wait_on_red=sum(r['island_wait_on_red'] for r in ambient['course_rows']),
                   trial_island_wait_on_red=sum(r['island_wait_on_red'] for r in trial['course_rows'])),
        'P4': dict(models=portal['models'], missing_direction=sum(not (r.get('incoming') and r.get('outgoing')) for r in exit_rows.values()) if exit_rows else None,
                   visible_events=len(portal['visible']), peak_exit_per_second=max((r.get('peakPerSecond',0) for r in exit_rows.values()),default=None),
                   rail_to_rail=portal['trip_kinds'].get('rail->rail',0), min_entered_emerged=portal['min_entered_emerged']),
        'P5': dict(stuck=len(p['stuck']), green_wait=None if p['green_wait'] is None else len(p['green_wait']),
                   green_wait_any=len(p['green_wait_any']),
                   repeat_people=len({r[0] for r in p['repeat']}), off_floor=p['off_floor_samples'], invalid=len(p['invalid_runs']),
                   invalid_samples=p['engine_invalid_samples'],
                   **crossing_widths.summary(widths)),
        'P6': dict(peak_5m=max(r['best']['n'] for r in growth['peaks'] if r['best']),
                   green_queue_remaining=sum(len(r['remaining']) for r in growth['green_clearance']),
                   walk_blocked=len(growth['queue_blocked']), growing_visible_ends=len(visible_growth)),
        'C1': dict(min_cars=c['cars'][0], max_cars=c['cars'][1], queue_median=median(len(r['queue']) for r in flow['phases'] if r['move']==2),
                   **{f'free_{k}_kmh': v[1] for k,v in flow['free_speeds'].items()}),
        'C2': dict(**{f'rank{k}_s':v[1] for k,v in flow['rank'].items() if int(k)>=4},
                   **{f'gap{k}_m':v[1] for k,v in flow['speed_gaps'].items()}),
        'C3': dict(late_left=len(flow['left_conflicts_over_three']),
                   parallel_start_gap_s=maximum(pairs,'gap'), unserved_parallel=sum(r['gap'] is None for r in pairs),
                   min_left_passed=flow['min_left_passed'], slow_left_inside=len(flow['left_slow'])),
        'C4': dict(open_branch_stop=branch_result['counts'].get('branch',0), empty_stop_line=branch_result['counts'].get('stopLine',0),
                   blocked_branch=branch_result['counts'].get('blockedBranch',0)),
        'C5': dict(stuck=len(c['stalled']), visible_events=len(c['visible_events']), off_floor=c['off_floor_samples'],
                   off_floor_any=c.get('raw_off_floor_samples',0),
                   overlap=len(c['overlap']), a2_m=c['max_a2_deviation']),
        'C6': dict(trial_red=sum(r['red'] for r in trial['course_rows']), late=sum(r['late'] for r in ambient['course_rows']),
                   trial_late=sum(r['late'] for r in trial['course_rows']),
                   trial_face_cars=len({uid for r in trial['course_rows'] for uid in r['car_touch']})),
    }
    detail = dict(seconds=meta['duration'], views=ambient['views'], signed_cars=signed_cars, unsignalized_cars=unsignalized,
                  phases=flow['phases'], ranks=flow['rank'], speed_gaps=flow['speed_gaps'], free_speeds=flow['free_speeds'], reasons=flow['reasons'],
                  left_pairs=pairs, turn_conflicts=flow['left_conflicts_over_three'], slow_left_inside=flow['left_slow'],
                  crowding=growth, entrances=portal,
                  branch=branch_result, movement=c['movement'], car_floor={k:v for k,v in c.items() if 'Floor' in k},
                  ordinary_crossings=ambient['course_rows'], trial_crossings=trial['course_rows'],
                  stuck=p['stuck'], green_wait=p['green_wait'], green_wait_any=p['green_wait_any'], repeat=p['repeat'],
                  invalid_runs=p['invalid_runs'],
                  crossing_widths=widths, occupied_landing_passages=p['landings_passage_episodes'])
    metric['C2']['rank4_6_avg_s'] = rank_average(metric['C2'])
    result = dict(label=label,rules=metric,detail=detail)
    if visible_only:
        with trace.open() as stream:
            view = visible.measure(stream,plan,walk.read('a')['floor'],walk.read('walk'))
        view['legacy'] = visible.check_legacy(tree)
        view['bus_gate_checked'] = check_buses
        view['failures'] = visible.gate_failures(metric, view, check_buses=check_buses,
            exit_keys=[key for key in area.get('checks', {}).get('exitKeys', [])
                       if key not in (meta.get('unlinkedExits') or [])],
            stop_keys=area.get('platforms', {}).get('keys', []), exit_events=exit_rows)
        detail['visible_gate'] = dict(
            vehicle_red=c['red'], vehicle_overlap=c['overlap'], vehicle_stalled=c['stalled'],
            vehicle_off_floor=c.get('firstCountedOffFloor'), vehicle_appearance=c['visible_events'],
            pedestrian_red=p['red_entries'], person_vehicle_contact=p['contact'],
            pedestrian_appearance=portal['visible'])
        result['visible'] = view
    return result


def evaluate(result, incumbent=None, *, people_stage=False):
    failure = []
    metrics = result['rules']
    for rule, checks in LIMITS.items():
        for key, limit in checks.items():
            val = metrics[rule].get(key)
            if val is None or val > limit:
                failure.append(dict(rule=rule,test=key,measured=val,limit=limit))
    if not metrics['P4']['models']:
        failure.append(dict(rule='P4',test='models',measured=0,limit='at least 1'))
    left = metrics['C3']['min_left_passed']
    if left is None or left < MIN_LEFT_PASSED:
        failure.append(dict(rule='C3',test='min_left_passed',measured=left,limit=f'at least {MIN_LEFT_PASSED}'))
    if incumbent:
        before = incumbent['rules']
        for rule, keys in NO_INCREASE.items():
            for key in keys:
                if people_stage and (rule,key)==('P2','car_wait_s') and metrics[rule][key]-before[rule][key] < 1-1e-9:
                    continue
                if metrics[rule][key] > before[rule][key]:
                    failure.append(dict(rule=rule,test=key,measured=metrics[rule][key],limit=before[rule][key]))
        for rule, keys in NO_DECREASE.items():
            for key in keys:
                previous = before[rule].get(key)
                current = metrics[rule].get(key)
                if previous is not None and (current is None or current < previous):
                    failure.append(dict(rule=rule,test=key,measured=current,limit=previous))
        for key,value in {**before['C2'], 'rank4_6_avg_s':rank_average(before['C2'])}.items():
            if key in ('rank4_s', 'rank5_s', 'rank6_s') or value is None:
                continue
            if people_stage and key=='gap30_m':
                continue
            limit = value + (RANK_TOLERANCE if key.startswith('rank') else 0)
            measured = metrics['C2'].get(key)
            if measured is None or measured > round(limit,3):
                failure.append(dict(rule='C2',test=key,measured=measured,limit=round(limit,3)))
    return failure


def regressions(result, incumbent, *, view_tolerance=0, people_stage=False):
    current, before = result['rules'], incumbent['rules']
    rows = []
    for rule, metrics in current.items():
        prior = before[rule]
        for key in dict.fromkeys([*metrics, *prior]):
            value, baseline = metrics.get(key), prior.get(key)
            if key == 'rank4_6_avg_s':
                baseline = rank_average(prior)
            if key in ('green_wait_any', 'invalid_samples', 'off_floor_any', 'min_entered_emerged', 'slow_left_inside',
                       'blocked_branch', 'rank4_s', 'rank5_s', 'rank6_s') or key.startswith('free_') or (people_stage and (rule,key)==('C2','gap30_m')) or baseline is None:
                continue
            if people_stage and (rule,key)==('C3','late_left'):
                baseline = PEOPLE_STAGE_LEFT_LIMIT
            increase = key not in NO_DECREASE.get(rule, ())
            if key == 'a2_m':
                # The coordinates in the replay are Float32. Compare A2 deviation at mm resolution.
                worsened = value is None or round(value,3) > round(baseline,3)
            else:
                if key=='rank4_6_avg_s':
                    baseline = round(baseline + RANK_TOLERANCE, 3)
                    worsened = value is None or value > baseline
                elif people_stage and (rule,key)==('P2','car_wait_s'):
                    worsened = value is None or value-baseline >= 1-1e-9
                else:
                    worsened = value is None or (value > baseline if increase else value < baseline)
            if worsened:
                rows.append(dict(rule=rule,test=key,measured=value,limit=baseline))
    for view, values in incumbent['detail']['views'].items():
        now = result['detail']['views'].get(view)
        limit = values[1] - view_tolerance
        if not now or now[1] < limit:
            rows.append(dict(rule='인원',test=view,measured=now[1] if now else None,limit=limit))
    return rows


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out',type=Path,required=True)
    parser.add_argument('--tree',type=Path,default=MAPO)
    parser.add_argument('--area',type=Path,help='area manifest (default: Hapjeong)')
    parser.add_argument('--label', default='worktree')
    parser.add_argument('--against',type=Path,help='incumbent rules.json for non-regression')
    parser.add_argument('--target',nargs=2,metavar=('RULE','METRIC'),help='require this metric to improve against the incumbent')
    parser.add_argument('--relative-only',action='store_true',help='gate on target improvement and regressions, with absolute limits still reported')
    parser.add_argument('--cars-only', action='store_true', help='only the vehicle portions of visible rules 1, 2, 3, and legacy hashes')
    parser.add_argument('--visible-only',action='store_true',
                        help='gate only on the eight visible-behavior rules in the ordinary 240-second replay')
    parser.add_argument('--skip-bus-gate',action='store_true',
                        help='record bus metrics without gating on them in a pedestrian-only stage')
    parser.add_argument('--people-stage',action='store_true',help='apply S3 gates and traffic tolerances to a relative comparison')
    parser.add_argument('--recorded',action='store_true',help='reuse trace.ndjson, signal.ndjson and paths.json already in --out')
    parser.add_argument('--measure-only',action='store_true',help='write results for a historical revision even when the gate rejects it')
    arg = parser.parse_args()
    if arg.skip_bus_gate and not arg.visible_only:
        parser.error('--skip-bus-gate requires --visible-only')
    if arg.visible_only and arg.relative_only:
        parser.error('--visible-only cannot be combined with --relative-only')
    if arg.relative_only and not (arg.against and arg.target):
        parser.error('--relative-only requires --against and --target')
    if arg.people_stage and not arg.relative_only:
        parser.error('--people-stage requires --relative-only')
    if arg.target and not arg.against:
        parser.error('--target requires --against')
    folder, tree = arg.out.resolve(),arg.tree.resolve()
    folder.mkdir(parents=True,exist_ok=True)
    area = read_area(arg.area) if arg.area else read_area()
    if not arg.recorded:
        replay(tree, folder, area, arg.area.resolve() if arg.area else None, cars_only=arg.cars_only)
    if arg.cars_only:
        result = measure_cars_only(tree, folder, area)
        (folder/'rules.json').write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n')
        print(f"{folder/'rules.json'} | 차 보이는 문턱 미달 {len(result['failures'])}칸")
        return int(bool(result['failures']) and not arg.measure_only)
    result = measure(tree,folder,arg.label,area,visible_only=arg.visible_only,check_buses=not arg.skip_bus_gate)
    incumbent = load(arg.against) if arg.against else None
    if arg.relative_only and (incumbent['rules']['P5'].get('green_wait_any') is None or
                              incumbent['rules']['P5'].get('green_wait') is None):
        parser.error('--relative-only needs a baseline measured with the current green-wait definition')
    failures = evaluate(result,incumbent,people_stage=arg.people_stage)
    worse = regressions(result,incumbent,view_tolerance=VIEW_MEDIAN_TOLERANCE if arg.relative_only else 0,
                        people_stage=arg.people_stage) if incumbent else []
    target_failure = None
    if arg.target:
        rule,key = arg.target
        measured = result['rules'].get(rule, {}).get(key)
        prior = incumbent['rules'].get(rule, {}).get(key)
        delta = measured - prior if measured is not None and prior is not None else 0
        if delta * (1 if key in NO_DECREASE.get(rule, ()) else -1) <= 0:
            target_failure = dict(rule=rule,test=f'{key} improvement',measured=measured,limit=prior)
            failures.append(target_failure)
    result['failures'] = failures
    result['regressions'] = worse
    result['target_failure'] = target_failure
    people_failures = [row for row in failures if row['rule']=='P4' and row['test'] in ('rail_to_rail','missing_direction')]
    (folder/'rules.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    with (folder/'rules.tsv').open('w') as stream:
        table = csv.writer(stream,delimiter='\t')
        compared = {(r['rule'],r['test']):r for r in worse}
        absolute = {(r['rule'],r['test']) for r in failures}
        table.writerow(['기준','항목',*([incumbent['label']] if incumbent else []),arg.label,'미달','회귀'])
        tables = {**result['rules'], '인원': {k:v[1] for k,v in result['detail']['views'].items()}}
        for rule, checks in tables.items():
            past = ({k:v[1] for k,v in incumbent['detail']['views'].items()} if rule=='인원'
                    else incumbent['rules'][rule]) if incumbent else {}
            if past and rule=='C2':
                past = {**past, 'rank4_6_avg_s':rank_average(past)}
            for key in dict.fromkeys([*checks,*past]):
                table.writerow([rule,key,*([past.get(key)] if incumbent else []),checks.get(key),
                                '예' if (rule,key) in absolute else '', '예' if (rule,key) in compared else ''])
        if arg.visible_only:
            view = result['visible']
            rows = {'bus_gate_checked': view['bus_gate_checked'],
                    'road_red_over_30': len(view['road_red_over_30']),
                    'stuck_over_120': len(view['stuck_over_120']),
                    'sidewalk_30_to_120': len(view['sidewalk_30_to_120']),
                    'sidewalk_max_s': round(max((r['seconds'] for r in view['sidewalk_30_to_120']), default=0), 3)}
            for bus in view['buses']:
                rows.update({f"{bus['key']}.{key}": bus[key]
                             for key in ('calls','boarded','alighted','waiting','mean_waiting')})
            for key, value in view['legacy'].items():
                rows[f'legacy.{key}'] = value['passed']
            for key, value in rows.items():
                table.writerow(['보이는 문턱',key,*([''] if incumbent else []),value,'',''])
            for issue in view['failures']:
                table.writerow([f"보이는 문턱 {issue['gate']}",issue['test'],*([''] if incumbent else []),
                                json.dumps(issue['measured'],ensure_ascii=False),'예',''])
    print(f"{folder/'rules.tsv'} | {len(failures)}개 기준 미달, {len(worse)}개 회귀" +
          (' | 목표 개선 실패' if target_failure else ''))
    failed = (worse or target_failure or (arg.people_stage and people_failures)) if arg.relative_only else failures
    if arg.visible_only:
        failed = result['visible']['failures']
        print(f'보이는 문턱 미달 {len(failed)}칸')
    return int(bool(failed) and not arg.measure_only)


if __name__ == '__main__':
    raise SystemExit(main())
