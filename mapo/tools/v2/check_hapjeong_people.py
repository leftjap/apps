"""Measure each 60 Hz frame of the same Hapjeong people playback used by the page."""
from collections import Counter, defaultdict
import json
import math
import subprocess
import sys

import numpy as np
from shapely import intersects_xy, prepare
from shapely.geometry import Point
from shapely.prepared import prep

from check_hapjeong_walk import DATA, faces, read

TRACE = """
import {readFileSync} from 'node:fs';
import {PerspectiveCamera, Vector3, MathUtils} from 'three';
import {peoplePlayback, peopleViews} from './src/aerial/hapjeong-people.ts';
import {signalFrames} from './src/aerial/hapjeong-signal-trial.ts';
import {AERIAL_BEARING} from './src/aerial/road-overlay.ts';
const read = name => JSON.parse(readFileSync('public/data/v2/hapjeong-hd-' + name + '.json'));
const graph = read('walk'), rehearsal = read('pedestrians'), trial = read('signal-trial').straight;
const traffic = signalFrames(trial);
const playback = peoplePlayback(graph, rehearsal, trial, traffic, true);
const cameras = peopleViews(rehearsal).map(view => {
  const camera = new PerspectiveCamera(34, 4 / 3);
  const distance = view.width / (2 * camera.aspect * Math.tan(MathUtils.degToRad(camera.fov / 2)));
  const tilt = MathUtils.degToRad(28);
  const offset = distance * Math.sin(tilt);
  const [x, z] = view.at;
  camera.position.set(x + offset * Math.sin(AERIAL_BEARING), distance * Math.cos(tilt), z + offset * Math.cos(AERIAL_BEARING));
  camera.lookAt(x, 0, z);
  camera.near = distance / 5;
  camera.far = distance * 2;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  return camera;
});
const screen = new Vector3();
console.log(JSON.stringify({ids: rehearsal.people.map(p => p.id), types: trial.vehicles.map(v => [v.length, v.width])}));
for (const [i, carFrame] of traffic.entries()) {
  const {w, MODES, stateOf, validAt} = playback.at(i);
  const people = Array.from({length: w.n}, (_, p) => {
    const x = w.x[p], z = w.z[p];
    const {mode, cross} = stateOf(p);
    const xw = cross?.xw ?? -1;
    const step = mode === MODES.CROSS ? 'cross' : mode === MODES.WAITX ? 'wait' : mode === MODES.QUEUE ? 'queue' : 'walk';
    const visible = cameras.map(camera => {
      screen.set(x, .8, z).project(camera);
      return w.fade[p] >= .2 && Math.abs(screen.x) <= 1 && Math.abs(screen.y) <= 1 && Math.abs(screen.z) <= 1;
    });
    return [w.id[p], x, z, step, xw, playback.signals[xw]?.left[i] ?? 0, visible, validAt(p)];
  });
  console.log(JSON.stringify([carFrame.time, people, carFrame.vehicles.map(v => [...v.center, v.heading])]));
}
"""


def widths(floor, walk):
    survey = {row['id']: faces(row['faces']) for row in floor['crossingAudit']}
    rows = []
    for i, key in enumerate(walk['crossings']):
        rect = survey[key].minimum_rotated_rectangle
        edge = list(rect.exterior.coords)
        short = min(math.dist(a, b) for a, b in zip(edge, edge[1:]))
        usable = max(.4, walk['x'][17*i+11] / 10 - .6)
        rows.append(dict(id=key[-4:], survey=short, usable=usable, ratio=usable / short))
    return rows


def audit():
    root = DATA.parents[2]
    process = subprocess.run(
        ['node', '--disable-warning=ExperimentalWarning', '--experimental-strip-types', '--input-type=module', '-e', TRACE],
        cwd=root, text=True, capture_output=True, check=True
    )
    lines = iter(process.stdout.splitlines())
    views = json.loads(next(lines))
    floor, walk = read('a'), read('walk')
    pavement = faces(floor['floor']['walk']).buffer(1e-7)
    survey = {row['id']: faces(row['faces']) for row in floor['crossingAudit']}
    areas = [prep(pavement.union(survey[key]).buffer(1e-7)) for key in walk['crossings']]
    prepare(pavement)
    totals, location, first = Counter(), Counter(), {}
    waits, enters, stuck, green_waits = Counter(), Counter(), {}, {}
    visible = [[], [], []]
    population = []
    previous_cross, old_pairs, old_raw_pairs, old_cars = {}, set(), set(), set()
    stationary = {}
    green_since = {}
    crossing_scenes = defaultdict(list)
    for line in lines:
        time, folks, cars = json.loads(line)
        totals['frames'] += 1
        population.append(len(folks))
        xs = np.array([p[1] for p in folks])
        zs = np.array([p[2] for p in folks])
        on_walk = intersects_xy(pavement, xs, zs)
        frame_off = 0
        crossing_now = {}
        for index, (uid, x, z, state, crossing, left, on_screen, valid) in enumerate(folks):
            cross_id = walk['crossings'][crossing][-4:] if crossing >= 0 else None
            if not valid:
                totals['engine_invalid_samples'] += 1
            if state == 'cross':
                crossing_now[uid] = crossing
                if previous_cross.get(uid) != crossing:
                    enters[cross_id] += 1
                    totals['red_entries'] += left <= 0
            if not on_walk[index] and (state != 'cross' or not areas[crossing].covers(Point(x, z))):
                frame_off += 1
                key = cross_id or state
                location[key] += 1
                first.setdefault(key, [time, uid, x, z])
            base_x, base_z, since = stationary.get(uid, (x, z, time))
            if state not in {'walk', 'cross'}:
                stationary.pop(uid, None)
            elif math.hypot(x - base_x, z - base_z) > .15:
                stationary[uid] = (x, z, time)
            else:
                stationary[uid] = (base_x, base_z, since)
                if time - since > 30:
                    stuck[uid] = [state, cross_id, round(time - since, 2), x, z, time]
            if state == 'wait':
                waits[cross_id] += 1
            if state == 'wait' and left > 0:
                key, since = green_since.get(uid, (crossing, time))
                if key != crossing:
                    since = time
                green_since[uid] = (crossing, since)
                if time - since > 10:
                    green_waits[uid] = [state, cross_id, round(time - since, 2), x, z, time]
            else:
                green_since.pop(uid, None)
        previous_cross = crossing_now
        totals['off_floor_samples'] += frame_off
        totals['off_floor_frames'] += frame_off > 0

        dx, dz = xs[:, None] - xs[None, :], zs[:, None] - zs[None, :]
        distances = dx * dx + dz * dz
        # Positions are Float32. At x≈−550 m, one ULP is about 0.06 mm.
        raw_i, raw_j = np.nonzero(np.triu(distances < .6**2, k=1))
        pair_i, pair_j = np.nonzero(np.triu(distances < (.6 - .0001)**2, k=1))
        raw_pairs = {tuple(sorted((folks[i][0], folks[j][0]))) for i, j in zip(raw_i, raw_j, strict=True)}
        totals['person_raw_contact_events'] += len(raw_pairs - old_raw_pairs)
        old_raw_pairs = raw_pairs
        totals['person_boundary_rounding_samples'] += len(raw_i) - len(pair_i)
        pairs = {tuple(sorted((folks[i][0], folks[j][0]))) for i, j in zip(pair_i, pair_j, strict=True)}
        totals['person_contact_samples'] += len(pairs)
        totals['person_contact_events'] += len(pairs - old_pairs)
        old_pairs = pairs
        touched = set()
        for i, ((cx, cz, heading), (length, width)) in enumerate(zip(cars, views['types'], strict=True)):
            dx, dz = xs - cx, zs - cz
            across = np.maximum(np.abs(dx * math.cos(heading) - dz * math.sin(heading)) - width / 2, 0)
            along = np.maximum(np.abs(dx * math.sin(heading) + dz * math.cos(heading)) - length / 2, 0)
            for j in np.flatnonzero(across * across + along * along < .4**2):
                uid, _, _, state, crossing, *_ = folks[j]
                contact = (uid, i)
                touched.add(contact)
                if contact not in old_cars:
                    cross_id = walk['crossings'][crossing][-4:] if crossing >= 0 else state
                    crossing_scenes['car contacts'].append([round(time, 2), cross_id, uid, i])
        totals['car_contact_samples'] += len(touched)
        totals['car_contact_events'] += len(touched - old_cars)
        old_cars = touched

        for j, view in enumerate(views['ids']):
            on_screen = [p for p in folks if p[6][j]]
            visible[j].append(len(on_screen))
            crossing = Counter(walk['crossings'][p[4]][-4:] for p in on_screen if p[3] == 'cross')
            waiting = sum(p[3] == 'wait' for p in on_screen)
            if crossing and totals['frames'] % 15 == 1:
                crossing_scenes[view].append([round(time, 2), len(on_screen), waiting, crossing])
    return {**totals, 'population': [min(population), max(population)],
            'visible': {view: [min(visible[i]), max(visible[i])] for i, view in enumerate(views['ids'])},
            'entries_by_crossing': enters, 'waiting_samples': waits, 'stationary': stuck,
            'green_waits': green_waits, 'widths': widths(floor, walk),
            'off_floor_locations': location, 'first_off_floor': first,
            'examples': {view: sorted(crossing_scenes[view], key=lambda p: (-sum(p[3].values()), -p[1], p[0]))[:8]
                         for view in views['ids']},
            'car_contact_locations': crossing_scenes['car contacts']}


if __name__ == '__main__':
    result = audit()
    print(json.dumps(result, indent=2, ensure_ascii=False))
    if '--verify' in sys.argv:
        # Survey width less 0.3 m of clearance on either side, rounded down to dm.
        assert all(row['usable'] + .7 >= row['survey'] for row in result['widths']), 'crossing widths'
        assert all(not result.get(key) for key in ('stationary', 'green_waits', 'off_floor_frames', 'red_entries')), 'people replay'
