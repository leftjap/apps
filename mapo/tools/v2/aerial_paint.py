"""Bridge to the application's mark definitions for geometry checks and clipping."""
from functools import lru_cache
import json
import math
from pathlib import Path
import subprocess

from shapely.geometry import Polygon
from shapely.ops import unary_union

MAPO = Path(__file__).resolve().parents[2]


@lru_cache(maxsize=1)
def paint_definitions():
    output = subprocess.check_output(['node', '--input-type=module', '-e', """
      import { lineStyle, arrowShape } from './src/data/marks.ts';
      import { PAINT_DASHES } from './src/aerial/ground-paint.ts';
      const styles = {};
      const arrows = {};
      for (let k = 1; k <= 30; k++) {
        arrows[k] = arrowShape(k);
        for (let subtype = 0; subtype <= 9; subtype++) styles[k + '/' + subtype] = lineStyle(k, subtype);
      }
      console.log(JSON.stringify({styles, arrows, dashes: PAINT_DASHES}));
    """], cwd=MAPO)
    return json.loads(output)


def style(kind, subtype):
    return paint_definitions()['styles'][f'{kind}/{subtype}']


def footprint(path, width, lateral, dash, phase=0):
    """Same butt-ended segment quads and continuous phase as ground overlay."""
    on, off = paint_definitions()['dashes'][dash]
    progress = phase
    for (x,y), (x1,y1) in zip(path, path[1:]):
        length = math.hypot(x1-x,y1-y)
        if length == 0:
            continue
        u,v = (x1-x)/length,(y1-y)/length

        def at(d, o):
            return x+d*u-o*v,y+d*v+o*u

        cycle = on+off
        positions = [(0,length)] if not cycle else [
            (max(0,i*cycle-progress),min(length,i*cycle+on-progress))
            for i in range(math.floor(progress/cycle),math.ceil((progress+length)/cycle))
        ]
        lo,hi = lateral-width/2,lateral+width/2
        for a,b in positions:
            if b > a:
                yield Polygon([at(a,lo),at(b,lo),at(b,hi),at(a,hi)])
        progress += length


def line_footprint(mark, project):
    ink = style(mark['kind'],mark['subtype'])
    rails = mark.get('stripes')
    if not rails:
        direction = (-ink['sep'],ink['sep'])
        rails = [mark['parts']] * (2 if ink['sep'] else 1)
    else:
        direction = (0,0)
    return unary_union([
        fill for paths, side, dash in zip(rails,direction,(ink['dashL'],ink['dashR']))
        for i,path in enumerate(paths)
        for fill in footprint([project(p) for p in path],ink['w'],side,dash,mark['phase'][i] if 'phase' in mark else 0)
    ])


def arrow_footprint(kind, bearing, at, vector):
    """Match arrowShape and the renderer's east/negative-south bearing."""
    x,y = at
    angle = math.radians(bearing)
    fx, fy = math.cos(angle), -math.sin(angle)
    for part in paint_definitions()['arrows'].get(str(kind)) or []:
        path = []
        for u,v in zip(part[::2],part[1::2]):
            east, south = fx*u+fy*v,fy*u-fx*v
            dx,dy = vector(east,south)
            path.append((x+dx,y+dy))
        yield Polygon(path)


def arrow_geometry(arrow, project, vector):
    if 'paint' in arrow:
        shapes = [Polygon([project(p) for p in ring]) for ring in arrow['paint']]
    else:
        shapes = list(arrow_footprint(arrow['kind'],arrow['bearing'],project(arrow['at']),vector))
    return unary_union(shapes)


def arrow_conflicts(arrows, stops, project, vector):
    inks = {a['id']:arrow_geometry(a,project,vector) for a in arrows if 'duplicateOf' not in a}
    stop_ink = {s['id']:line_footprint(s,project) for s in stops}
    issues = {key:[] for key in inks}
    for index,(key,shape) in enumerate(inks.items()):
        for stop,mark in stop_ink.items():
            area = shape.intersection(mark).area
            if area>1e-6:
                issues[key].append({'type':'stop','with':stop,'squareMetres':round(area,6)})
        for other,mark in list(inks.items())[index+1:]:
            area = shape.intersection(mark).area
            if area>1e-6:
                issues[key].append({'type':'arrow','with':other,'squareMetres':round(area,6)})
                issues[other].append({'type':'arrow','with':key,'squareMetres':round(area,6)})
    return {key:found for key,found in issues.items() if found}
