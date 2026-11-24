"""Compare named survey roads against cached VWorld level-19 imagery.

Run survey_roof_tiles.mts --area <area> first to populate tools/raw/aerial/19.
Missing photo tiles are identified in the report for later download.
"""
import argparse
from concurrent.futures import ProcessPoolExecutor
import json
import math
from collections import Counter, defaultdict
from pathlib import Path
from itertools import accumulate, pairwise

import numpy as np
from PIL import ImageDraw
import shapely as s
from shapely.geometry import LineString,Point
from shapely.ops import linemerge
from shapely.strtree import STRtree
from bake_aerial_ground import Frame
from shp import dbf,shapes
from tm import tm_to_ll
from area import MAPO, area_window, asset, read_area, read_asset
from road_audit_raster import Grid, Map, aerial, floor
from road_audit_profiles import configure, inspect

DENSE_ROADS={'양화로','강변북로'}


def raw_features(area,layer):
    return json.loads((MAPO/area['sources']['hd']/f'{layer}.json').read_text())['features']


def lines(g):
    if g.geom_type=='LineString': return [g]
    return [x for x in s.get_parts(g) if x.geom_type=='LineString' and x.length]

def line_heading(line, u, metres=8):
    a=line.interpolate(max(0,u-metres)); b=line.interpolate(min(line.length,u+metres))
    return math.atan2(b.y-a.y,b.x-a.x)

def read_axes(area, frame, outline, road_names):
    groups=defaultdict(list)
    local=outline.buffer(18)
    for file in sorted((MAPO/area['sources']['sheets']).glob('*/N1L_A0020000.shp')):
        _, attrs=dbf(file.with_suffix('.dbf'))
        for (kind,parts),row in zip(shapes(file),attrs,strict=True):
            name=row['도로명']
            if kind!=3 or (road_names and name not in road_names) or not parts: continue
            width=float(row['도로폭'] or 0)
            count=int(row['차로수'] or 0)
            if width<8 and count<2 and name!='강변북로': continue
            for path in parts:
                if len(path)<2:continue
                g=LineString([frame.project(tm_to_ll(*p)[::-1]) for p in path])
                if not g.length or not local.intersects(g): continue
                groups[name].append((g,width))
    return groups

def axis_score(line,point,h):
    m=line.project(point)
    return line.distance(point)+10*abs(math.sin(line_heading(line,m)-h))

def collect(area,frame,outline,road_names,reference,explicit_plan):
    a=read_asset(area,'-a')
    groups=read_axes(area,frame,outline,road_names)
    roads_to_scan=road_names or sorted(groups)
    raw=raw_features(area,'a2')
    roads=[(name,g) for name,gs in groups.items() for g,w in gs]
    index=STRtree([g for _,g in roads])
    assigned=defaultdict(list)
    for row in raw:
        p=row['properties']
        if p['linktype'] not in ('1','4','6'):continue
        geom=row['geometry']
        for path in (geom['coordinates'] if geom['type']=='MultiLineString' else [geom['coordinates']]):
            if len(path)<2:continue
            poly=LineString([frame.project(p[:2]) for p in path])
            if not outline.intersects(poly):continue
            center=poly.interpolate(.5,normalized=True); t=line_heading(poly,poly.length/2)
            ids=index.query(center,predicate='dwithin',distance=38 if p['roadtype']!='1' else 25)
            if not len(ids): continue
            name,g=roads[min(ids,key=lambda i:axis_score(roads[i][1],center,t))]
            assigned[name].append((p,poly,path))
    if explicit_plan:
        for key in {r['road'] for r in explicit_plan}:
            if key not in assigned:
                raise ValueError(f'No measured lanes for {key} in this area')
        return explicit_plan, assigned
    profiles=[]
    events = []
    numbered={k:0 for k in roads_to_scan}
    try:
        car=json.loads(asset(area,'-cars').read_text())
    except FileNotFoundError:
        car={}
    for x in car.get('platforms',[]):
        events.append((Point(x['x'],x['z']),'승강장',x['key']))
    for site in car.get('signalSites',[]):
        if site['kind']=='junction':events.append((Point(site['at']),'교차로',''))
    # Include unsignalized intersections of two named arterial axes.
    for road in groups:
        for i,g in [(i,g) for i,(name,g) in enumerate(roads) if name==road]:
            for j in index.query(g,predicate='intersects'):
                other,o=roads[j]
                if road==other or j<=i:continue
                for p in s.get_parts(g.intersection(o)):
                    if p.geom_type=='Point':
                        events.append((p,'교차로',''))
    for w in a['crossings']:
        if not w.get('faces'):continue
        for face in floor(w['faces']):
            if face.area>=14:
                events.append((face.centroid,'횡단보도',w['id']))
                break
    # A2 topology captures freeway ramps and changes in the through-lane count.
    comes=Counter(r['properties']['tonodeid'] for r in raw)
    goes=Counter(r['properties']['fromnodeid'] for r in raw)
    for name in DENSE_ROADS:
        for p,g,path in assigned[name]:
            if p['linktype']!='6':continue
            if goes[p['tonodeid']]>1 or comes[p['tonodeid']]>1:
                events.append((g.interpolate(g.length),'분기·합류',p['id']))
    for name,gs in groups.items():
        if not assigned[name]:continue
        surveyed=s.union_all([g for _,g,_ in assigned[name]])
        nearby=surveyed.buffer(33)
        # Retain the named corridor close to A2. A paint/data gap within a connected
        # stretch is sampled too. Keep each distinct elevated ramp where there is A2.
        network=[chunk for axis,_ in gs for chunk in lines(axis.intersection(outline))
                 if chunk.length>=2 and chunk.intersection(nearby).length>=min(6,chunk.length*.5)]
        if name=='강변북로':
            network += [piece for p,g,_ in assigned[name] if p['linktype']=='6'
                        for piece in lines(g.intersection(outline))
                        if piece.length>=24 and piece.distance(s.union_all(network))>16]
        if not network: continue
        merged=linemerge(s.union_all(network))
        chains=sorted(lines(merged),key=lambda g:-g.length)
        entries=[]
        step=20 if name in DENSE_ROADS else 40
        major=[g for g in chains if g.length>=8]
        for chain,g in enumerate(major,1):
            if tuple(g.coords[0])>tuple(g.coords[-1]):g=g.reverse()
            sites=sorted([(g.length*i/max(1,math.ceil(g.length/step)), '정기','')
                          for i in range(max(1,math.ceil(g.length/step))+1)])
            events_seen=set()
            for p,what,label in events:
                if g.distance(p)> (24 if what=='승강장' else 13): continue
                d=g.project(p)
                proposed=Point(g.interpolate(d))
                if what=='횡단보도':
                    # An actual crossing must lie out along the same road,
                    # not simply share an offset with a perpendicular road.
                    if proposed.distance(p)>12:continue
                k=(round(d/(7 if what=='분기·합류' else 5)),what)
                if k not in events_seen:
                    sites.append((d,what,label));events_seen.add(k)
            for d,what,label in sorted(sites):
                pt=g.interpolate(d)
                if any(old['kind']==what and math.dist(old['xy'],(pt.x,pt.y)) < (5 if what=='정기' else 8)
                       and abs(math.sin(old['heading']-line_heading(g,d)))<.5 for old in entries):
                    continue
                heading=line_heading(g,d)
                numbered[name]+=1
                entries.append(dict(id=f'R{roads_to_scan.index(name)+1:02d}-{numbered[name]:03d}',road=name,chain=chain,d=round(d,2),
                    xy=[pt.x,pt.y],heading=heading,h=120 if name=='강변북로' else 80,w=80,
                    kind=what,extra=label,reference=reference is not None and reference.covers(pt)))
        profiles.extend(entries)

    return profiles, assigned


def grade_crossings(assigned):
    links=[]
    seen=set()
    for group in assigned.values():
        for row,line,raw in group:
            key=row['id']
            if key in seen or not all(len(p)>2 for p in raw):
                continue
            seen.add(key)
            steps=list(accumulate((math.dist(a,b) for a,b in pairwise(line.coords)),initial=0.))
            links.append((key,line,steps,[p[2] for p in raw]))
    tree=STRtree([r[1] for r in links])
    result=[]
    for i,(key,line,steps,zs) in enumerate(links):
        for j in tree.query(line,predicate='intersects'):
            if j<=i:
                continue
            other,l2,steps2,zs2=links[j]
            for p in s.get_parts(line.intersection(l2)):
                if p.geom_type!='Point':
                    continue
                d1,d2=line.project(p),l2.project(p)
                if min(d1,d2,line.length-d1,l2.length-d2)<.4:
                    continue
                z1,z2=float(np.interp(d1,steps,zs)),float(np.interp(d2,steps2,zs2))
                if abs(z1-z2)>=2.5:
                    result.append((p.x,p.y,key,z1,other,z2))
    return result


def init_workers(area, output, assigned, crossings, include_detail):
    global model, area_config, output_path
    model=Map(area,include_detail)
    area_config,output_path=area,output
    configure(assigned,crossings)


def section(row):
    grid=Grid(row)
    photo,missing=aerial(grid,area_config)
    result,curbs=inspect(row,grid,model,photo,missing)
    view,overlay=model.render(photo,grid,curbs)
    for canvas in (photo,view,overlay):
        draw=ImageDraw.Draw(canvas)
        scale=(14,canvas.height-15,114,canvas.height-15)
        draw.line(scale,fill=(12,15,23),width=5)
        draw.line(scale,fill=(245,245,245),width=2)
        draw.text((15,canvas.height-31),'10 m',fill='white',stroke_width=1,stroke_fill=(12,15,23))
    directory=output_path/'panels'/row['id'][:3]
    directory.mkdir(parents=True,exist_ok=True)
    photo.save(directory/f"{row['id']}-photo.jpg",quality=84,subsampling=0)
    view.save(directory/f"{row['id']}-model.png",compress_level=2)
    overlay.save(directory/f"{row['id']}-overlay.jpg",quality=84,subsampling=0)
    return result


def main():
    from road_audit_report import report

    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--area',required=True)
    parser.add_argument('--out',required=True,type=Path)
    parser.add_argument('--roads',nargs='+',help='Named roads; default: all surveyed major roads')
    parser.add_argument('--reference',help='Same-coordinate area to flag as the comparison benchmark')
    parser.add_argument('--plan',type=Path,help='Reuse an existing plan.json for repeatable comparisons')
    parser.add_argument('--manual',type=Path,help='Optional keyed visual observations to include')
    parser.add_argument('--before',type=Path,help='Same-plan before directory, with optional shots/approach-400.png')
    parser.add_argument('--without-detail',action='store_true',help='Exclude optional safety zones and B3')
    parser.add_argument('--report-only',action='store_true',help='Update tables without re-rendering panels')
    parser.add_argument('--workers',type=int,default=4)
    args=parser.parse_args()
    if args.report_only:
        report(args.out,args.manual,args.before)
        return
    area=read_area(Path(args.area))
    reference=area_window(read_area(Path(args.reference))) if args.reference else None
    plan=json.loads(args.plan.read_text()) if args.plan else None
    samples,assigned=collect(area,Frame(*area['frame']['origin'],0),area_window(area),args.roads,reference,plan)
    if not samples:
        parser.error('No major road with A2 data in this area.')
    args.out.mkdir(parents=True,exist_ok=True)
    (args.out/'plan.json').write_text(json.dumps(samples,ensure_ascii=False)+'\n')
    grades=grade_crossings(assigned)
    with (args.out/'sections.ndjson').open('w') as evidence, ProcessPoolExecutor(
            args.workers,initializer=init_workers,initargs=(area,args.out,assigned,grades,not args.without_detail)) as pool:
        for row in pool.map(section,samples):
            evidence.write(json.dumps(row,ensure_ascii=False)+'\n')
    report(args.out,args.manual,args.before)
    print(f'{len(samples)} sections: {args.out / "index.html"}')


if __name__=='__main__':
    main()
