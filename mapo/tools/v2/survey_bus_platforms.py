"""Project surveyed median stops to the reserved routes before the walking bake."""
import math
import re

from shapely.geometry import LineString, Point

from hapjeong_hd import MAPO, ORIGIN, project
from hapjeong_hd_a import surface


def bus_platforms(area, cars, floor):
    stops = (MAPO / area['sources']['medianStops']).read_text()
    dx, dz = project(ORIGIN[::-1])
    pavement = surface(floor['floor']['walk'])
    route_edges = {i for route in cars['busRoutes'] for i in route}
    result = []
    for key, name, x, z in re.findall(r"\['(\d+)', '([^']+)', (-?[\d.]+), (-?[\d.]+)\]", stops):
        if key not in area['platforms']['keys']:
            continue
        stop = Point(float(x) + dx, float(z) + dz)
        candidates = []
        for i in route_edges:
            row = cars['links'][i]
            if row['kind'] != '4':
                continue
            lane = LineString(row['points'])
            along = lane.project(stop)
            for k in range(-56, 57):
                at = along + k * .25
                if not 8 <= at <= lane.length - 8 or row['stop'] and abs(at-row['stop']['at']) < 8:
                    continue
                pos = lane.interpolate(at)
                a, b = lane.interpolate(at-.5), lane.interpolate(at+.5)
                yaw = math.atan2(b.y-a.y, b.x-a.x)
                if pos.distance(stop) > 14:
                    continue
                for q in range(27):
                    side = 1.7 + .15*q
                    x = pos.x + 3.5*math.cos(yaw) - side*math.sin(yaw)
                    z = pos.y + 3.5*math.sin(yaw) + side*math.cos(yaw)
                    door = Point(x,z)
                    if door.distance(stop) <= 14 and pavement.covers(door):
                        score = pos.distance(stop) + 2*(side-1.7)
                        candidates.append((score, i, at, dict(key=key,name=name,link=row['id'],at=at,x=x,z=z,yaw=yaw)))
                        break
        if not candidates:
            if 'districtTraffic' in area:
                continue
            raise ValueError(f'No platform approaches the through bus lanes: {key}')
        result.append(min(candidates)[3])
    if 'districtTraffic' not in area and {stop['key'] for stop in result} != set(area['platforms']['keys']):
        raise ValueError('Missing configured median stop')
    return result
