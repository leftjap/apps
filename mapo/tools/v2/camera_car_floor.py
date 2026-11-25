"""Measure rendered footprints against local road polygons and match lanes to surveyed major roads."""
from collections import Counter
from functools import lru_cache
import json
import math
import sys

import numpy as np
import shapely as sh
from shapely import affinity

from area import MAPO, area_window
from check_hapjeong_car_run import MIN_OFF_FLOOR_AREA, rendered_footprints
from check_hapjeong_walk import AREA, faces, read

MODEL_NAMES = ('sedan', 'suv', 'kei', 'van', 'taxi', 'bus', 'coach', 'minibus')
TILE = 32
PAD = 10


def names():
    from bake_aerial_ground import Frame
    from shp import dbf, shapes
    from tm import tm_to_ll

    sheets = AREA.get('sources', {}).get('sheets')
    if not sheets:
        return {}
    data = read(AREA['replay'].get('carAsset', 'cars'))
    outline = area_window(AREA).buffer(18)
    frame = Frame(*AREA['frame']['origin'], 0)
    roads = []
    for path in sorted((MAPO / sheets).glob('*/N1L_A0020000.shp')):
        _, attrs = dbf(path.with_suffix('.dbf'))
        for (kind, lines), attr in zip(shapes(path), attrs, strict=True):
            name = attr['도로명']
            width = float(attr['도로폭'] or 0)
            if kind != 3 or not name or (width < 8 and int(attr['차로수'] or 0) < 2):
                continue
            for line in lines:
                if len(line) < 2:
                    continue
                axis = sh.LineString([frame.project(tm_to_ll(*point)[::-1]) for point in line])
                if axis.length and outline.intersects(axis):
                    roads.append((name, axis, width))

    def line_heading(line, at):
        a, b = line.interpolate(at - min(at, 8)), line.interpolate(at + 8)
        return math.atan2(b.y - a.y, b.x - a.x)

    index = sh.STRtree([geom for _, geom, _ in roads])
    result = {}
    for lane in data['links']:
        line = sh.LineString(lane['points'])
        center = line.interpolate(.5, normalized=True)
        yaw = line_heading(line, line.length/2)
        candidates = []
        for i in index.query(center, predicate='dwithin', distance=38):
            name, axis, width = roads[i]
            distance = axis.distance(center)
            if distance <= max(5, width/2 + 3):
                angle = yaw - line_heading(axis, axis.project(center))
                candidates.append((distance + 10*abs(math.sin(angle)), name))
        if candidates:
            result[lane['id']] = min(candidates)[1]
    return result


class Floor:
    def __init__(self):
        ground = read('a')
        deck = [face for row in ground.get('decks', ()) for face in row['faces']]
        floor = ground['floor']
        self.road = faces(floor['road'] + deck).difference(faces(floor['walk'])).buffer(1e-6)
        self.models = [rendered_footprints()[name] for name in MODEL_NAMES]
        self.envelopes = np.array([[max(-x0, x1), max(-z0, z1)] for _, x0, z0, x1, z1 in self.models])
        assert np.max(np.linalg.norm(self.envelopes, axis=1)) < PAD
        self.reset()

    def reset(self):
        self.frames = set()
        self.uids = set()
        self.links = Counter()
        self.max_area = 0.0
        self.worst = None

    @lru_cache(maxsize=16384)
    def tile(self, x, z):
        clip = sh.box(x*TILE-PAD, z*TILE-PAD, (x+1)*TILE+PAD, (z+1)*TILE+PAD)
        road = self.road.intersection(clip)
        sh.prepare(road)
        return road

    @lru_cache(maxsize=65536)
    def outside(self, x, z, yaw, model):
        shape = self.models[model][0]
        body = affinity.translate(affinity.rotate(shape, yaw, origin=(0, 0), use_radians=True), x, z)
        road = self.tile(math.floor(x/TILE), math.floor(z/TILE))
        return body.difference(road).area

    def batch(self, rows):
        if not len(rows):
            return
        xt, zt = np.floor(rows[:, 2:4]/TILE).astype(np.int64).T
        # Every sample in a tile shares a small prepared road polygon.
        keys = (xt << 32) + (zt & 0xffffffff)
        order = np.argsort(keys, kind='stable')
        cuts = np.flatnonzero(np.diff(keys[order])) + 1
        for ids in np.split(order, cuts):
            road = self.tile(int(xt[ids[0]]), int(zt[ids[0]]))
            group = rows[ids]
            models = group[:, 5].astype(int)
            half = self.envelopes[models, None, :]
            xy = half * np.array([[1, 1], [-1, 1], [-1, -1], [1, -1]])
            dx, dz = xy.transpose(2, 0, 1)
            c, s = np.cos(group[:, 4:5]), np.sin(group[:, 4:5])
            x, z = group[:, 2:3], group[:, 3:4]
            polygons = sh.polygons(np.stack((x + c*dx - s*dz, z + s*dx + c*dz), axis=2))
            for frame, uid, x, z, yaw, model, link in group[~sh.covers(road, polygons)]:
                area = self.outside(x, z, yaw, int(model))
                if area > MIN_OFF_FLOOR_AREA:
                    self.frames.add(int(frame))
                    self.uids.add(int(uid))
                    self.links[int(link)] += 1
                if area > self.max_area:
                    self.max_area = area
                    self.worst = [int(frame), int(uid), x, z, int(link)]

    def result(self):
        return dict(frames=len(self.frames), vehicles=len(self.uids), samples=sum(self.links.values()),
                    byEdge=self.links, maxM2=self.max_area, worst=self.worst)


def measure():
    floor = Floor()
    print(json.dumps({'roads': names()}), flush=True)
    # The Node driver and worker exchange 7 native little-endian f64s per row.
    # A negative frame ends a scenario. Other rows carry the rendered pose.
    row_size = 7 * 8
    while raw := sys.stdin.buffer.read(8192 * row_size):
        rows = np.frombuffer(raw, dtype='<f8').reshape(-1, 7)
        start = 0
        for end in np.flatnonzero(rows[:, 0] == -1):
            floor.batch(rows[start:end])
            print(json.dumps(floor.result()), flush=True)
            floor.reset()
            start = end + 1
        floor.batch(rows[start:][rows[start:, 0] >= 0])


if __name__ == '__main__':
    measure()
