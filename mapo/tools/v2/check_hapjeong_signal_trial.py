"""Audit actual signal/ACC frames and A1/A2/B2 geometry."""
import json
import math
import subprocess
from collections import Counter, defaultdict
from itertools import combinations, pairwise

from shapely import prepare
from shapely.geometry import LineString, Point, Polygon
from shapely.ops import unary_union

from hapjeong_hd import ASSET, MAPO, features, paths
from hapjeong_hd_a import surface
from hapjeong_vehicles import compatible
from hapjeong_signal_trial import OUTPUT, source_graph
from aerial_paint import footprint

SCRIPT = """
import fs from 'node:fs';
import { signalFrames } from './src/aerial/hapjeong-signal-trial.ts';
const data = JSON.parse(fs.readFileSync('public/data/v2/hapjeong-hd-signal-trial.json'));
for (const [mode, scene] of Object.entries(data)) console.log(JSON.stringify([mode,signalFrames(scene)]));
"""


def body(v, p):
    x,z = p['center']
    u,w = math.sin(p['heading']), math.cos(p['heading'])
    l,h = v['length']/2, v['width']/2
    return Polygon([(x+a*l*u-b*h*w,z+a*l*w+b*h*u) for a,b in ((1,1),(1,-1),(-1,-1),(-1,1))])


def b2_ink(active, asset):
    original = {r['properties']['id']:r for r in features('b2')}
    sides = defaultdict(lambda: {'left':[],'right':[]})
    for row in asset['lines']:
        raw = original[row['id']]['properties']
        if row['kind']=='530':
            continue
        targets = [(raw[id],side) for id,side in [('r_linkid','left'),('l_linkid','right')] if raw[id] in active]
        if not targets:
            continue
        ink = row['ink']
        shape = unary_union([p for line in row['paths'] for p in footprint(line,ink['width'],0,ink['dash'])])
        prepare(shape)
        for id,side in targets:
            sides[id][side].append((row['id'],shape))
    return sides


def audit(mode, scene, frames, edges, sides, road, walk, islands, platforms, central):
    vehicles = scene['vehicles']
    assert scene['clipSeconds']==30 and scene['view']['width']==80
    assert sorted(v['kind'] for v in vehicles)==['bus']+['car']*5
    assert 'departAt' not in str(scene)
    assert len(frames)>1801 and frames[1800]['time']==30 and frames[-1]['time']<scene['duration']
    assert all(any(f['colors'][i]==0 for f in frames) for i in range(len(scene['groups']))), 'replay must include a green for each approach'
    assert vehicles[1]['move']==vehicles[2]['move']==mode
    assert vehicles[1]['links']==vehicles[2]['links']
    route_data = []
    for v in vehicles:
        chain = [edges[id] for id in v['links']]
        assert all(compatible(a,b) for a,b in pairwise(chain))
        assert chain[0]['type']==chain[-1]['type']==('4' if v['kind']=='bus' else '6')
        path = LineString(v['path'])
        starts = [0]
        for link in chain:
            starts.append(starts[-1] + link['line'].length)
        assert abs(starts[1]-v['stop'])<1e-7
        assert [list(p) for p in [*chain[0]['line'].coords,*(p for r in chain[1:] for p in list(r['line'].coords)[1:])]]==v['path']
        route_data.append((path,chain,starts))
    print('\n'+mode)
    for id in sorted({id for v in vehicles for id in v['links']}):
        counts = sides[id]
        print('B2 refs',id,'L',','.join(i for i,_ in counts['left']) or '없음','R',','.join(i for i,_ in counts['right']) or '없음')
    gauges = Counter()
    unknown = Counter()
    mark_contacts = defaultdict(float)
    mark_contact_times = {}
    entries = {}
    red_stops = {}
    gap_min = math.inf
    step_max = 0.
    exit_follower = False
    previous = None
    for idx,frame in enumerate(frames):
        poses = frame['vehicles']
        polygons = []
        if idx and previous['colors']!=frame['colors']:
            print('phase',round(frame['time'],3),dict(zip(scene['groups'],frame['colors'])))
        for i,(v,p,(path,chain,starts)) in enumerate(zip(vehicles,poses,route_data)):
            poly = body(v,p)
            polygons.append(poly)
            gauges['road outside']+=not road.covers(poly)
            for name,shape in [('walk',walk),('island',islands),('platform',platforms)]:
                gauges[name]+=poly.intersection(shape).area>1e-7
            assert path.distance(Point(p['front'])) < 1e-7
            color = frame['colors'][scene['groups'].index(v['group'])]
            if color==2 and not p['admitted'] and p['speed']<.02 and abs(p['distance']-v['stop'])<.001:
                red_stops.setdefault(i,math.dist(p['front'],chain[0]['line'].coords[-1]))
            if previous:
                old = previous['vehicles'][i]
                step_max = max(step_max,math.dist(p['center'],old['center']))
                assert p['distance']>=old['distance']-1e-9
                if p['admitted'] and not old['admitted']:
                    entries[i] = frame['time']
                    if previous['colors'][scene['groups'].index(v['group'])]!=0:
                        gauges['red/amber crossing']+=1
            if p['leader']>=0:
                leader = p['leader']
                gap_min=min(gap_min,poses[leader]['distance']-vehicles[leader]['length']-p['distance'])
            if p['followingBrake']:
                gauges['leader braking frames']+=1
            for j,e in enumerate(chain):
                if min(p['distance'],starts[j+1])<=max(p['distance']-v['length'],starts[j]):
                    continue
                refs = sides[e['id']]
                if not refs['left'] or not refs['right']:
                    unknown[(e['type'],e['id'])]+=1
                for side,marks in refs.items():
                    for id,shape in marks:
                        if shape.intersects(poly):
                            area=poly.intersection(shape).area
                            if area>1e-6:
                                key = (i,e['id'],side,id)
                                mark_contacts[key] = max(area,mark_contacts[key])
                                first,_ = mark_contact_times.get(key,(frame['time'],frame['time']))
                                mark_contact_times[key] = (first,frame['time'])
            if i==2 and p['admitted'] and not poly.intersects(central):
                exit_follower=True
        gauges['contacts'] += sum(a.intersects(b) for a,b in combinations(polygons,2))
        previous=frame
    print('entries from green', {i:round(t,3) for i,t in entries.items()})
    cue = frames[419]['vehicles']
    assert cue[2]['speed'] < .02 and cue[2]['leader']==1 and not cue[2]['admitted']
    print('follower waiting at 6.983s', 'distance from stop',round(vehicles[2]['stop']-cue[2]['distance'],3),
          'bumper gap to leader',round(cue[1]['distance']-vehicles[1]['length']-cue[2]['distance'],3))
    print('first 30s green groups', [g for i,g in enumerate(scene['groups']) if any(f['colors'][i]==0 for f in frames[:1801])],
          'full cycle duration',round(frames[-1]['time'],3))
    print('red stops at link tip',len(red_stops),'max error',max(red_stops.values()),'leader/follower gap',round(gap_min,3))
    print('road/contacts/braking',dict(gauges),'max step',round(step_max,6))
    print('paint penetration by vehicle, active A2, side, B2',dict(mark_contacts))
    print('paint contact time range', {key:tuple(round(t,3) for t in interval) for key,interval in mark_contact_times.items()})
    print('one or more sides unverified, frames by A2 link',dict(unknown))
    print('focus follower also fully exited',exit_follower)
    assert {1,2} <= set(entries) and 1 in red_stops and len(red_stops)==5
    assert len(entries)==6 and all(c==2 for c in frames[-1]['colors'])
    assert exit_follower and gauges['leader braking frames'] > 0 and gap_min > 0
    assert not any(gauges[key] for key in ('road outside','walk','island','platform','contacts','red/amber crossing'))
    assert step_max < .20


if __name__ == '__main__':
    assert OUTPUT.exists(), 'two 30s signal scenarios with raw A1/A2 inputs are required'
    data=json.loads(OUTPUT.read_text())
    assert set(data)=={'straight','left'}
    edges,_=source_graph()
    print('A1 exact-XYZ verified directed A2 links',len(edges))
    hd=json.loads(ASSET.read_text())
    base=json.loads(ASSET.with_name('hapjeong-hd-a.json').read_text())
    central=surface(hd['centralJunction'])
    walk=surface(base['floor']['walk'])
    road=surface(base['floor']['road']).difference(walk)
    islands=surface(hd['floor']['islands'])
    # Three A4 surfaces independently identified from the two median bus-stop points in the A audit.
    ids={'A4251H300711','A424BH141156','A4251H300712'}
    platforms=surface([face for row in hd['floor']['a4'] if row['id'] in ids for face in row['faces']])
    prepare(road)
    active={id for scene in data.values() for v in scene['vehicles'] for id in v['links']}
    sides=b2_ink(active,base)
    rendered = subprocess.check_output(['node','--input-type=module','-e',SCRIPT],cwd=MAPO,text=True)
    for line in rendered.splitlines():
        mode, frames=json.loads(line)
        audit(mode,data[mode],frames,edges,sides,road,walk.difference(islands.union(platforms)),islands,platforms,central)
