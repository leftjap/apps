"""Audit every frame of the same pedestrian and vehicle playback used by the browser."""
from itertools import combinations, pairwise
import json
import math
import subprocess

from shapely.geometry import LineString, Point
from shapely.prepared import prep

from check_hapjeong_signal_trial import body
from hapjeong_hd import ASSET, MAPO, project
from hapjeong_hd_a import surface

OUTPUT = ASSET.with_name('hapjeong-hd-pedestrians.json')
SCRIPT = """
import fs from 'node:fs';
import {signalFrames} from './src/aerial/hapjeong-signal-trial.ts';
import {pedestrianFrames} from './src/aerial/hapjeong-pedestrians.ts';
const read = name => JSON.parse(fs.readFileSync('public/data/v2/hapjeong-hd-'+name+'.json'));
const scene = read('pedestrians');
const traffic = read('signal-trial')[scene.traffic];
const cars = signalFrames(traffic);
console.log(JSON.stringify(pedestrianFrames(scene,traffic,cars)));
"""


def verify():
    assert OUTPUT.exists(), 'the three verified pedestrian routes and shared playback are missing'
    scene = json.loads(OUTPUT.read_text())
    source = json.loads(ASSET.with_name('hapjeong-hd-a.json').read_text())
    hd = json.loads(ASSET.read_text())
    traffic = json.loads(ASSET.with_name('hapjeong-hd-signal-trial.json').read_text())[scene['traffic']]
    assert [p['id'] for p in scene['people']]==['west','southeast','platform']
    building_rows = json.loads((MAPO/'public/data/aerial-pilot.json').read_text())['buildings']
    buildings = surface([[[project(p) for p in ring] for ring in r['rings']] for r in building_rows
                         if r['height'] or r['floors']])
    walk = surface(source['floor']['walk'])
    road = surface(source['floor']['road']).difference(walk)
    audited = {row['id']:row for row in source['crossingAudit']}
    platform = next(row for row in hd['floor']['a4'] if row['id']==scene['platform'])
    radius = scene['radius']
    assert radius==.25
    for p, expected in zip(scene['people'],(2,2,1),strict=True):
        crossings = [leg['crossing'] for leg in p['legs'] if leg.get('crossing')]
        assert len(crossings)==expected and all(audited[id]['id'][-4:] not in ('0020','0006') for id in crossings)
        assert all(a['path'][-1]==b['path'][0] for a,b in pairwise(p['legs']))
        areas = []
        for leg in p['legs']:
            line = LineString(leg['path'])
            face = surface(audited[leg['crossing']]['faces']) if leg.get('crossing') else Point().buffer(0)
            region = walk.union(face)
            if leg.get('crossing'):
                # Connections already verified in the A audit can include sub-pixel portions of paint.
                region = region.union(surface([f for end in audited[leg['crossing']]['approaches'] for f in end['faces']]))
                assert line.intersection(face).length>1
                assert walk.buffer(1e-7).covers(Point(leg['path'][0]).buffer(radius))
            area = line.buffer(radius)
            assert area.difference(region.buffer(1e-7)).area < 1e-7
            assert not area.intersects(buildings)
            assert area.intersection(road.difference(region)).area < 1e-7
            areas.append(region)
        p['areas'] = [prep(area.buffer(1e-7)) for area in areas]
    assert surface(platform['faces']).covers(Point(scene['people'][-1]['legs'][-1]['path'][-1]).buffer(radius))

    frames = json.loads(subprocess.check_output(['node','--input-type=module','-e',SCRIPT],cwd=MAPO,text=True))
    tracking = [dict(entered=[],finished=[],wait=set(),red=set(),arrived=None,step=0,min_car=math.inf,
                     traffic_uses_crossing=set()) for _ in scene['people']]
    corridors = [[(leg['crossing'],prep(LineString(leg['path']).buffer(radius))) for leg in p['legs'] if leg.get('crossing')]
                 for p in scene['people']]
    last = None
    for frame in frames:
        cars = [body(v,q) for v,q in zip(traffic['vehicles'],frame['vehicles'],strict=True)]
        disks = []
        swept_cars = [] if last is None else [body(v,q).union(car).convex_hull
                    for v,q,car in zip(traffic['vehicles'],last['vehicles'],cars,strict=True)]
        for i,(p,now,stats) in enumerate(zip(scene['people'],frame['people'],tracking,strict=True)):
            assert now['y']==.02, 'unexpected foot plane'
            disk = Point(now['position']).buffer(radius)
            assert p['areas'][now['leg']].covers(disk)
            disks.append(disk)
            stats['min_car'] = min(stats['min_car'],*(disk.distance(car) for car in cars))
            assert stats['min_car']>0
            for id,corridor in corridors[i]:
                for j,car in enumerate(cars):
                    if corridor.intersects(car):
                        stats['traffic_uses_crossing'].add((id[-4:],j))
            if now['status']=='wait' and not now['green']:
                stats['wait'].add(now['leg'])
            if now['status']=='cross' and not now['green']:
                stats['red'].add(now['leg'])
            if now['status']=='arrived' and stats['arrived'] is None:
                stats['arrived']=frame['time']
            if last is not None:
                before = last['people'][i]
                step = math.dist(before['position'],now['position'])
                stats['step']=max(stats['step'],step)
                assert step <= 1.5*(frame['time']-last['time'])+1e-7
                heading_delta = now['heading']-before['heading']
                assert abs(math.atan2(math.sin(heading_delta),math.cos(heading_delta))) <= 7/60+1e-7
                if before['status']=='wait' and not before['green']:
                    assert step==0
                if now['status']=='cross' and before['status']!='cross':
                    assert before['green'] and now['leg'] in stats['wait']
                    stats['entered'].append(frame['time'])
                if before['status']=='cross' and now['status']!='cross':
                    stats['finished'].append(frame['time'])
                sweep=LineString([before['position'],now['position']]).buffer(radius) if step else disk
                assert all(not sweep.intersects(car) for car in swept_cars)
        assert all(not a.intersects(b) for a,b in combinations(disks,2))
        last=frame
    assert len(frames)>3600
    for p,stats,expected in zip(scene['people'],tracking,(2,2,1),strict=True):
        assert stats['arrived'] is not None and len(stats['entered'])==len(stats['finished'])==expected
        assert stats['red'], 'a reserved crossing must continue safely once the entry signal returns to red'
        print(p['id'], 'entered',stats['entered'],'finished',stats['finished'],'arrived',stats['arrived'],
              'max step',round(stats['step'],4),'minimum car clearance',round(stats['min_car'],3),
              'car use of the same crossing space in the full cycle', sorted(stats['traffic_uses_crossing']))
    assert tracking[-1]['traffic_uses_crossing'] and tracking[-1]['entered'][0]>tracking[0]['entered'][0]
    print(len(frames),'runtime frames, 0 collisions, off-surface motions, signal violations or jumps')


if __name__=='__main__':
    verify()
