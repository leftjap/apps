"""Derive the two signal demos from unchanged A1/A2 and the existing A floor."""
from collections import defaultdict
from itertools import pairwise
import math
import json
from shapely.geometry import LineString, Point
from hapjeong_hd import ASSET, features, paths, parts
from hapjeong_hd_a import surface
from hapjeong_vehicles import compatible, follow, candidate, pose_corners

OUTPUT = ASSET.with_name('hapjeong-hd-signal-trial.json')
DIRECTIONS = ('서쪽','북서쪽','북쪽','북동쪽','동쪽','남동쪽','남쪽','남서쪽')


def source_graph():
    nodes = {r['properties']['id']: r['geometry']['coordinates'] for r in features('a1-vehicle-audit')}
    edges = {}
    outgoing = defaultdict(list)
    for r in features('a2-vehicle-audit'):
        p = r['properties']
        if p['linktype'] not in ('1','4','6') or len(paths(r)) != 1:
            continue
        raw, = r['geometry']['coordinates']
        if nodes.get(p['fromnodeid']) != raw[0] or nodes.get(p['tonodeid']) != raw[-1]:
            continue
        e = dict(id=p['id'], type=p['linktype'], raw=raw, line=LineString(paths(r)[0]))
        e.update({'from':p['fromnodeid'], 'to':p['tonodeid']})
        edges[e['id']] = e
        outgoing[e['from']].append(e)
    return edges, {key:[target for target in outgoing[e['to']] if compatible(e,target)] for key,e in edges.items()}


def heading(line, end=False):
    a,b = (line.interpolate(max(0,line.length-5)),line.interpolate(line.length)) if end else (line.interpolate(0),line.interpolate(5))
    return math.atan2(b.y-a.y,b.x-a.x)


def derive():
    base = json.loads(ASSET.read_text())
    floor = json.loads(ASSET.with_name('hapjeong-hd-a.json').read_text())['floor']
    road = surface(floor['road']).difference(surface(floor['walk']))
    central = surface(base['centralJunction'])
    edges, graph = source_graph()
    entries = [row['id'] for row in base['routing']['entries'] if row['route']]
    cars, buses = [], []
    bus_audit = []
    for key in entries:
        if key not in edges:
            continue
        entry = edges[key]
        for chain in follow(entry,graph,central):
            first,last = heading(entry['line'],True),heading(chain[-1]['line'])
            bend = math.degrees((last-first+math.pi)%(2*math.pi)-math.pi)
            movement = 'straight' if abs(bend)<=30 else 'left' if -125<=bend<=-45 else ''
            if entry['type']=='4':
                bus_audit.append({'links':[e['id'] for e in chain],
                    'outsideMetres':central.distance(Point(chain[-1]['line'].coords[-1]))})
            if not movement:
                continue
            trial = candidate(chain,road,central)
            if not trial:
                continue
            trial.update(group=round(first/(math.pi/4))%8, move=movement, bend=bend)
            (buses if trial['kind']=='bus' else cars).append(trial)
    return cars,buses,central,bus_audit


def choose(mode, cars, buses, central):
    def order(group, primary, bus):
        return 0 if group==primary else 1 if group==bus else 2+group

    def scene_pair(a,b, primary, bus):
        if a['approach'].intersects(b['approach']):
            return False
        x,y = order(a['group'],primary,bus), order(b['group'],primary,bus)
        if x==y:
            return not a['depart'].intersects(b['depart'])
        first,second = (a,b) if x<y else (b,a)
        return not first['depart'].intersects(second['waiting']) and not second['depart'].intersects(first['last'])

    def fill(slots, rest, focus, bus):
        if len(slots)==5:   # The focus path will carry a second, following car.
            return slots
        for i,row in enumerate(rest):
            if any(row['links'][0]==old['links'][0] for old in slots):
                continue
            if all(scene_pair(row,old,focus['group'],bus['group']) for old in slots):
                if chosen := fill([*slots,row],rest[i+1:],focus,bus):
                    return chosen
        return None

    # Keep the full turning (or straight) movement near the centre of the 80m view.
    focus_rows = sorted((row for row in cars if row['move']==mode),
                        key=lambda row:(abs(row['bend']-(-90 if mode=='left' else 0)),row['links']))
    for focus in focus_rows:
        line = LineString(focus['path'])
        if focus['stop'] < 17 or pose_corners(line,focus['end']-focus['length']-3,focus['length'],focus['width']).intersects(central):
            continue
        for bus in sorted(buses,key=lambda row:(not row['exits'],row['links'])):
            if not scene_pair(focus,bus,focus['group'],bus['group']):
                continue
            # Include the candidate's complete safe approach, including the follower.
            rest = sorted(cars,key=lambda row:(row['group']==focus['group'],
                          row['group']==bus['group'],row['group'],row['links']))
            chosen = fill([focus,bus],rest,focus,bus)
            if not chosen:
                continue
            slots = [bus,focus,focus,*chosen[2:]]
            vehicles = []
            for i,row in enumerate(slots):
                v = {key:row[key] for key in ('kind','links','path','length','width','stop','end','exits','group','bend','move')}
                v['start'] = max(v['length'],v['stop']-(13 if i==2 else 4))
                v['speed'] = 3 if i!=2 else 3.5
                track = LineString(v['path'])
                v['clearAt'] = max(track.project(Point(end)) for piece in parts(track.intersection(central),'LineString')
                                   for end in (piece.coords[0],piece.coords[-1])) + v['length']
                vehicles.append(v)
            groups = sorted({row['group'] for row in slots},key=lambda g:order(g,focus['group'],bus['group']))
            leaders = [next(row for row in vehicles if row['group']==g) for g in groups]
            midpoint = line.interpolate(focus['stop']+22)
            return {'mode':mode, 'duration':110,'clipSeconds':30,'vehicles':vehicles,'groups':groups,
                    'labels':{g:DIRECTIONS[g] for g in groups},'signalAnchors':{v['group']:list(LineString(v['path']).interpolate(v['stop']).coords[0]) for v in leaders},
                    'view':{'at':[midpoint.x,midpoint.y],'width':80}}
    raise ValueError(f'No safe six-vehicle configuration for {mode}')


if __name__ == '__main__':
    cars,buses,central,bus_audit=derive()
    data={mode:choose(mode,cars,buses,central) for mode in ('straight','left')}
    OUTPUT.write_text(json.dumps(data,separators=(',',':'),ensure_ascii=False)+'\n')
    print('Road-safe candidate routes:',len(cars),'cars,',len(buses),'bus')
    print('Source bus search:',bus_audit)
    for mode,scene in data.items():
        print(mode,scene['groups'],scene['view'])
        for v in scene['vehicles']:
            print('  ',v['kind'],v['group'],v['move'],round(v['bend'],1),v['links'])
