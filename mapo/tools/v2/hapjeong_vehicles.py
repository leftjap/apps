"""Select and schedule a fixed A2 vehicle trial on the Hapjeong A floor."""
from collections import defaultdict
from itertools import pairwise
import json
import math

from shapely.geometry import LineString, Point, Polygon
from shapely.ops import unary_union

from hapjeong_hd import ASSET, features, paths
from hapjeong_hd_a import surface

OUTPUT = ASSET.with_name('hapjeong-hd-vehicles.json')
SIZES = {'car': (4.45, 1.78), 'bus': (10.8, 2.45)}
SEAM_COS = .5  # Reject a heading change greater than 60° over the 2m on each side of a node.
STOP_GAP = .2


def dot_forward(a, b):
    end = Point(a.coords[-1])
    behind = a.interpolate(max(0, a.length-2))
    ahead = b.interpolate(min(2, b.length))
    length = behind.distance(end) * end.distance(ahead)
    return ((end.x-behind.x)*(ahead.x-end.x)+(end.y-behind.y)*(ahead.y-end.y))/length if length else -1


def compatible(a, b):
    return (a['to'] == b['from'] and a['raw'][-1] == b['raw'][0]
            and dot_forward(a['line'], b['line']) >= SEAM_COS)


def follow(entry, graph, central):
    def search(chain, through, exiting):
        last = chain[-1]
        if exiting:
            yield chain
            # Only extend a terminal road segment if it has not carried the vehicle beyond the central face yet.
            if central.distance(Point(last['line'].coords[-1])) > 12:
                return
        visited = {row['id'] for row in chain}
        for row in graph[last['id']]:
            if row['id'] in visited:
                continue
            if row['type'] == '1' and not exiting and row['line'].intersects(central):
                yield from search([*chain,row], True, False)
            elif through and row['type'] == entry['type']:
                yield from search([*chain,row], True, True)
    yield from search([entry], False, False)


def pose_corners(path, at, length, width):
    front = path.interpolate(at)
    rear = path.interpolate(at-length)
    span = front.distance(rear)
    ux, uz = (front.x-rear.x)/span, (front.y-rear.y)/span
    sx, sz = -uz*width/2, ux*width/2
    rx, rz = front.x-length*ux, front.y-length*uz
    return Polygon([(front.x+sx,front.y+sz),(front.x-sx,front.y-sz),(rx-sx,rz-sz),(rx+sx,rz+sz)])


def candidate(chain, road, central):
    entry = chain[0]
    kind = 'bus' if entry['type'] == '4' else 'car'
    length,width = SIZES[kind]
    stop = entry['line'].length
    start = max(length, stop - (20 if kind == 'bus' else 15))
    if stop-start < 7:
        return None
    path = LineString([*entry['line'].coords, *(p for row in chain[1:] for p in list(row['line'].coords)[1:])])
    end = path.length
    waiting = pose_corners(path,stop,length,width)
    last = pose_corners(path,end,length,width)
    exits = not last.intersects(central)
    if kind == 'car' and not exits:
        return None
    # Reject a candidate if the A2 line or sampled full-size body leaves the A floor.
    count = math.ceil((end-start)/.22)
    bodies = [pose_corners(path,start+(end-start)*i/count,length,width) for i in range(count+1)]
    if any(not road.covers(body) for body in bodies):
        return None
    approach = unary_union([body for i, body in enumerate(bodies) if start+(end-start)*i/count <= stop] + [waiting]).buffer(STOP_GAP)
    depart = unary_union([body for i, body in enumerate(bodies) if start+(end-start)*i/count >= stop]+[waiting]).buffer(STOP_GAP)
    if any(not road.covers(body) for body in (waiting,last)):
        return None
    return {'kind':kind,'links':[row['id'] for row in chain],'path':list(path.coords),
            'length':length,'width':width,'start':start,'stop':stop,'end':end,'exits':exits,
            'at':Point(path.interpolate(stop)), 'waiting':waiting,'last':last,
            'approach':approach,'depart':depart}


def pair_safe(first, second):
    return (not first['approach'].intersects(second['approach'])
            and not first['depart'].intersects(second['waiting'])
            and not second['depart'].intersects(first['last']))


def choose(cars, bus):
    def visit(chosen):
        if len(chosen)==6:
            return chosen
        candidates = [row for row in cars if row['links'][0] not in {v['links'][0] for v in chosen}
                      and all(pair_safe(v,row) for v in chosen)]
        candidates.sort(key=lambda row:(-min(row['at'].distance(v['at']) for v in chosen),row['links']))
        for candidate in candidates:
            result = visit([*chosen,candidate])
            if result:
                return result
        return None
    for row in sorted(bus,key=lambda row:(not row['exits'],-(row['end']-row['stop']),row['links'])):
        result = visit([row])
        if result:
            return result
    raise ValueError('No safe six-vehicle trial available from the original source')


def profile(distance, speed, acceleration):
    ramp = min(speed/acceleration, math.sqrt(distance/acceleration))
    duration = distance/(acceleration*ramp)+ramp
    return {'ramp':ramp, 'duration':duration}


def bake():
    previous = json.loads(ASSET.read_text())
    floor = json.loads(ASSET.with_name('hapjeong-hd-a.json').read_text())['floor']
    central = surface(previous['centralJunction'])
    road = surface(floor['road']).difference(surface(floor['walk']))
    edges = []
    for row in features('a2-expanded'):
        p = row['properties']
        projected = paths(row)
        if len(projected) != 1 or p['linktype'] not in ('1','4','6') or not p['fromnodeid'] or not p['tonodeid']:
            continue
        edges.append({'id':p['id'],'type':p['linktype'],'from':p['fromnodeid'],'to':p['tonodeid'],
                      'raw':row['geometry']['coordinates'][0],'line':LineString(projected[0])})
    by_start = defaultdict(list)
    for row in edges:
        by_start[row['from']].append(row)
    graph = {row['id']:[target for target in by_start[row['to']] if compatible(row,target)] for row in edges}
    core = {row['properties']['id'] for row in features('a2')}
    cars, bus = [], []
    for entry in edges:
        line = entry['line']
        start,end = Point(line.coords[0]), Point(line.coords[-1])
        if (entry['id'] not in core or entry['type'] not in ('4','6') or not central.covers(end)
            or central.boundary.distance(end) <= central.boundary.distance(start) and central.covers(start)):
            continue
        for chain in follow(entry,graph,central):
            prepared = candidate(chain,road,central)
            if prepared:
                (bus if prepared['kind']=='bus' else cars).append(prepared)
    order = choose(cars,bus)
    result = []
    for row in order:
        item = {key:row[key] for key in ('kind','links','path','length','width','start','stop','end','exits')}
        item['approach'] = profile(row['stop']-row['start'],4.8 if row['kind']=='bus' else 5.8,1.8 if row['kind']=='bus' else 2.6)
        item['departure'] = profile(row['end']-row['stop'],7.5 if row['kind']=='bus' else 9,1.8 if row['kind']=='bus' else 2.7)
        result.append(item)
    depart_at = max(row['approach']['duration'] for row in result)+2.5
    for row in result:
        row['departAt'] = depart_at
        depart_at += row['departure']['duration']+.6
    return {'vehicles':result,'duration':depart_at+1, 'candidateCounts':{'car':len(cars),'bus':len(bus)}}


if __name__=='__main__':
    asset = bake()
    OUTPUT.write_text(json.dumps(asset,separators=(',',':'))+'\n')
    print(asset['candidateCounts'], round(asset['duration'],2))
    for row in asset['vehicles']:
        print(row['kind'],row['links'], f"approach {row['stop']-row['start']:.2f}m, after stop {row['end']-row['stop']:.2f}m",
              'external exit',row['exits'])
