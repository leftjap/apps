"""Bake three Hapjeong demo itineraries from audited survey crossings and A pavement."""
from collections import deque
from itertools import pairwise
import json
import math

from shapely import constrained_delaunay_triangles
from shapely.geometry import LineString, Point
from shapely.ops import substring

from hapjeong_crossings import half_metre_routes
from hapjeong_hd import ASSET, MAPO, parts, project
from hapjeong_hd_a import median_faces, surface

OUTPUT = ASSET.with_name('hapjeong-hd-pedestrians.json')
RADIUS = .25


def route(region, start, end):
    area = next(p for p in region if p.covers(start) and p.covers(end))
    if area.covers(LineString([start,end])):
        return [start.coords[0],end.coords[0]]
    triangles = list(constrained_delaunay_triangles(area).geoms)
    first = next(i for i,t in enumerate(triangles) if t.covers(start))
    last = next(i for i,t in enumerate(triangles) if t.covers(end))
    owners = {}
    neighbours = [[] for _ in triangles]
    for i, triangle in enumerate(triangles):
        for a,b in pairwise(triangle.exterior.coords):
            edge = tuple(sorted((a,b)))
            if edge in owners:
                j = owners[edge]
                portal = ((a[0]+b[0])/2,(a[1]+b[1])/2)
                neighbours[i].append((j,portal))
                neighbours[j].append((i,portal))
            else:
                owners[edge] = i
    previous = {first:None}
    queue = deque([first])
    while last not in previous:
        i = queue.popleft()
        for j,portal in neighbours[i]:
            if j not in previous:
                previous[j] = (i,portal)
                queue.append(j)
    path = [end.coords[0]]
    i = last
    while previous[i] is not None:
        i,portal = previous[i]
        path.append(portal)
    path.append(start.coords[0])
    path.reverse()
    simplified = [path[0]]
    i = 0
    while i<len(path)-1:
        i = next(j for j in range(len(path)-1,i,-1) if area.covers(LineString([path[i],path[j]])))
        simplified.append(path[i])
    return simplified


def anchor(row, side):
    a,b = row['approaches'][side],row['approaches'][1-side]
    assert a['status']=='joined'
    length=math.dist(a['end'],b['end'])
    return Point(*(x+(x-y)*(a['distance']+.6)/length for x,y in zip(a['end'],b['end'])))


def extend(region, point, away, length):
    component = next(p for p in region if p.covers(point))
    scale = length/point.distance(away)
    ray = LineString([point,(point.x+(point.x-away.x)*scale,point.y+(point.y-away.y)*scale)])
    supported = [p for p in parts(component.intersection(ray),'LineString') if p.distance(point)<1e-7]
    if not supported:
        return point
    reach = max(ray.project(Point(v)) for line in supported for v in line.coords)
    return ray.interpolate(max(0,reach-.12))


def close_view(path):
    x0,z0,x1,z1 = path.bounds
    x,z = (x0+x1)/2,(z0+z1)/2
    bearing,tilt = math.radians(-42),math.radians(28)
    slope = math.tan(math.radians(17))
    aspect = 4/3
    closest = 0
    # Reserve room for the tracking number at both near and distant path ends.
    for px,pz in path.coords:
        horizontal = (px-x)*math.cos(bearing)-(pz-z)*math.sin(bearing)
        toward = (px-x)*math.sin(bearing)+(pz-z)*math.cos(bearing)
        for y in (0,3.7):
            vertical = -toward*math.cos(tilt)+y*math.sin(tilt)
            depth_offset = toward*math.sin(tilt)+y*math.cos(tilt)
            closest = max(closest,depth_offset+max(abs(horizontal)/aspect,abs(vertical))/(.80*slope))
    return {'at':[x,z],'width':max(37,math.ceil(2*aspect*slope*closest))}


def itinerary(id, name, crossings, sides, walk, obstacles, destination=None):
    journeys = []
    clear_walk = half_metre_routes(walk.difference(obstacles))
    first = anchor(crossings[0],sides[0])
    start = extend(clear_walk,first,anchor(crossings[0],1-sides[0]),3.5)
    for row,side in zip(crossings,sides,strict=True):
        before,after = anchor(row,side),anchor(row,1-side)
        if start.distance(before)>.01:
            journeys.append({'path':route(clear_walk,start,before)})
        face = surface(row['faces'])
        landings = surface([f for e in row['approaches'] for f in e['faces']])
        crossing_area = half_metre_routes(walk.difference(obstacles),face.difference(obstacles),landings.difference(obstacles))
        journeys.append({'crossing':row['id'],'path':route(crossing_area,before,after)})
        start = after
    finish = destination if destination is not None else extend(clear_walk,after,before,2.5)
    if start.distance(finish)>.01:
        journeys.append({'path':route(clear_walk,start,finish)})
    route_line = LineString([p for leg in journeys for p in leg['path']])
    return {'id':id,'label':name,'legs':journeys,'view':close_view(route_line)}


def build():
    a = json.loads(ASSET.with_name('hapjeong-hd-a.json').read_text())
    hd = json.loads(ASSET.read_text())
    walk = surface(a['floor']['walk'])
    buildings = json.loads((MAPO/'public/data/aerial-pilot.json').read_text())['buildings']
    obstacles = surface([[[project(p) for p in ring] for ring in row['rings']] for row in buildings
                         if row['height'] or row['floors']])
    surveyed = {r['id'][-4:]:r for r in a['crossingAudit']}
    people = []
    # The requested pair is an itinerary input; route geometry comes from the common floor and crossing audit.
    for id,name,pair in (('west','서쪽 건물 옆',('0041','0028')),('southeast','남동쪽 골목',('0034','0035'))):
        first,second = [surveyed[key] for key in pair]
        x,y = [[e['walkComponent'] for e in row['approaches']] for row in (first,second)]
        shared, = set(x)&set(y)
        people.append(itinerary(id,name,[first,second],[1-x.index(shared),y.index(shared)],walk,obstacles))

    platform_id,platform,_,_ = max(median_faces(hd['floor']),key=lambda row:row[1].centroid.y)
    options = [(row,side) for row in a['crossingAudit'] for side in (0,1)
               if all(e['status']=='joined' for e in row['approaches']) and
               platform.buffer(-RADIUS).covers(anchor(row,side))]
    traffic = json.loads(ASSET.with_name('hapjeong-hd-signal-trial.json').read_text())['straight']
    lanes = [substring(LineString(v['path']),v['start'],v['end']).buffer(v['width']/2+RADIUS)
             for v in traffic['vehicles']]

    def conflict_score(option):
        row,_ = option
        crossing = LineString([anchor(row,0),anchor(row,1)])
        return sum(crossing.intersects(lane) for lane in lanes), -crossing.length

    # Exercise a real time separation on the platform approach where the staged cars use the same space.
    row,side = max(options,key=conflict_score)
    destination = platform.buffer(-.45).representative_point()
    people.append(itinerary('platform','중앙 승강장',[row],[1-side],walk,obstacles,destination))

    for p in people:
        print(p['id'], 'legs', [(leg.get('crossing','walk')[-4:], round(LineString(leg['path']).length,3))
                                  for leg in p['legs']], 'viewport',p['view'])
    print('central destination from median-stop survey A4',platform_id)
    return {'radius':RADIUS,'platform':platform_id,'traffic':'straight','people':people}


if __name__=='__main__':
    OUTPUT.write_text(json.dumps(build(), ensure_ascii=False,separators=(',', ':'))+'\n')
