"""Verify the fixed trial against original links and the renderer's actual motion."""
from collections import deque
from itertools import combinations, pairwise
import json
import math
import subprocess

from shapely import prepare
from shapely.geometry import LineString, Point, Polygon
from hapjeong_hd import ASSET, MAPO, features, paths
from hapjeong_hd_a import surface
from hapjeong_vehicles import OUTPUT, SEAM_COS, compatible, dot_forward, pose_corners

JS = """
import fs from 'node:fs';
import { vehicleMotion } from './src/aerial/hapjeong-vehicles.ts';
const trial = JSON.parse(fs.readFileSync('public/data/v2/hapjeong-hd-vehicles.json'));
const sample = trial.vehicles.map(vehicleMotion);
const checkpoints = trial.vehicles.map((v,i) => [
  sample[i]((v.approach.duration+v.departAt)/2),
  sample[i](v.departAt+v.departure.duration),
]);
console.log(JSON.stringify(checkpoints));
for (let i=0; i<=Math.ceil(trial.duration*120); i++) {
  console.log(JSON.stringify(sample.map(f=>f(i/120))));
}
"""


def input_edge(row):
    p = row['properties']
    projected, = paths(row)
    raw, = row['geometry']['coordinates']
    return {'id':p['id'], 'type':p['linktype'], 'from':p['fromnodeid'], 'to':p['tonodeid'],
            'line':LineString(projected), 'raw':raw}

def drawn_body(p, v):
    x,z = p['center']
    forward_x,forward_z = math.sin(p['heading']), math.cos(p['heading'])
    half_l,half_w = v['length']/2, v['width']/2
    return Polygon([(x+a*half_l*forward_x-b*half_w*forward_z,z+a*half_l*forward_z+b*half_w*forward_x)
                    for a,b in ((1,1),(1,-1),(-1,-1),(-1,1))])


if __name__ == '__main__':
    assert OUTPUT.exists(), 'vehicle trial needs its own route asset'
    asset = json.loads(OUTPUT.read_text())
    vehicles = asset['vehicles']
    assert sorted(v['kind'] for v in vehicles) == ['bus']+['car']*5
    assert len({v['links'][0] for v in vehicles})==6
    original = {r['properties']['id']:input_edge(r) for r in features('a2-expanded')}
    floor = json.loads(ASSET.with_name('hapjeong-hd-a.json').read_text())['floor']
    central = surface(json.loads(ASSET.read_text())['centralJunction'])
    road = surface(floor['road']).difference(surface(floor['walk']))
    prepare(road)
    traces = []
    seam_dots = []
    for v in vehicles:
        chain = [original[id] for id in v['links']]
        expected = '4' if v['kind']=='bus' else '6'
        assert chain[0]['type']==chain[-1]['type']==expected
        assert any(link['type']=='1' for link in chain[1:-1])
        assert all(compatible(a,b) for a,b in pairwise(chain)), v['links']
        seam_dots.extend(dot_forward(a['line'],b['line']) for a,b in pairwise(chain))
        vertices = [*chain[0]['line'].coords, *(pt for link in chain[1:] for pt in list(link['line'].coords)[1:])]
        assert [list(point) for point in vertices] == v['path']
        assert abs(v['stop']-chain[0]['line'].length)<1e-7
        path = LineString(vertices)
        assert abs(v['end']-path.length)<1e-7
        last = pose_corners(path,v['end'],v['length'],v['width'])
        assert v['exits']==(not last.intersects(central))
        if v['kind']=='car':
            assert v['exits']
        else:
            terminal = chain[-1]
            forward = [edge['id'] for edge in original.values() if compatible(terminal,edge)]
            assert not forward, forward
            print(f"bus verified exit link {terminal['id']}: {terminal['line'].length:.3f}m; exact successors {len(forward)}")
        assert v['departAt']-v['approach']['duration']>=2.49
        traces.append((path,chain[0]['line'].coords[-1]))
    for a,b in pairwise(vehicles):
        assert b['departAt'] >= a['departAt']+a['departure']['duration']

    result = subprocess.check_output(['node','--input-type=module','-e',JS],cwd=MAPO,text=True).splitlines()
    checkpoints = json.loads(result[0])
    stop_error = 0.
    for v, (_, stop), (s,e) in zip(vehicles,traces,checkpoints):
        assert s['phase']=='stopped' and e['phase']=='finished'
        stop_error = max(stop_error,math.dist(s['front'],stop))
        assert math.dist(e['front'],v['path'][-1])<1e-7
    assert stop_error<1e-7
    max_jump, max_turn, deviation, max_road_outside, max_render_frame = 0.,0.,0.,0.,0.
    min_clearance = math.inf
    previous = None
    history = deque(maxlen=6)
    for frame, line in enumerate(result[1:]):
        poses = json.loads(line)
        bodies = []
        for v,(path,_),p in zip(vehicles,traces,poses):
            front = Point(p['front'])
            assert front.distance(path)<1e-7
            body = drawn_body(p,v)
            if not road.covers(body):
                max_road_outside = max(max_road_outside,body.difference(road).area)
                assert max_road_outside<1e-7, (frame,v['links'],max_road_outside)
            deviation = max(deviation,path.interpolate(p['distance']-v['length']/2).distance(Point(p['center'])))
            bodies.append(body)
        for a,b in combinations(bodies,2):
            assert not a.intersects(b), (frame,a,b)
            min_clearance = min(min_clearance,a.distance(b))
        if previous:
            for a,b in zip(previous,poses):
                max_jump = max(max_jump,math.dist(a['front'],b['front']))
                max_turn = max(max_turn,abs(math.degrees((b['heading']-a['heading']+math.pi)%(2*math.pi)-math.pi)))
                assert b['distance']>=a['distance']-1e-8
        if len(history)==6:
            for a,b in zip(history[0],poses):
                max_render_frame = max(max_render_frame,math.dist(a['center'],b['center']))
        history.append(poses)
        previous=poses
    assert max_jump <= .076 and max_turn < 3 and deviation<.6 and max_render_frame < .48
    print(f'6 directed original traces, no XYZ join gaps; max sampled seam angle {math.degrees(math.acos(min(seam_dots))):.3f}° (limit {math.degrees(math.acos(SEAM_COS)):.0f}°)')
    print(f'{len(result)-1} samples at 120 Hz · 0 vehicle contacts · minimum separation {min_clearance:.3f}m')
    print(f'front bumper stop error {stop_error:.9f}m · max front step {max_jump:.4f}m · max turn {max_turn:.3f}°/sample')
    print(f'maximum center movement over 0.05s (runtime frame cap) {max_render_frame:.4f}m')
    print(f'fronts on A2 · max rigid-body-center deviation from corresponding A2 arc {deviation:.3f}m · exterior body area {max_road_outside:.9f}㎡')
    print(f'five full car exits; bus ends at verified link · one playback {asset["duration"]:.2f}s')
