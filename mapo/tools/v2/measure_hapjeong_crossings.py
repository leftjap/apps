"""Audit the explicitly placed crossing cohorts and every face occupied in their replay."""
import argparse
from collections import defaultdict
import json
import math

from shapely.geometry import Point
from shapely.prepared import prep

from check_hapjeong_car_run import body
from check_hapjeong_walk import faces


def measure(path, plan, static):
    handle = open(path)
    meta = json.loads(next(handle))
    courses = meta['crossingTrial']
    clock = meta['cycle']
    labels = {c['i']:c['id'][-4:] for c in plan['faces']}
    full = {c['i']:c['id'] for c in plan['faces']}
    shapes = {c['i']:faces(c['faces']) for c in plan['faces']}
    shapes = {i:p for i,p in shapes.items() if not p.is_empty}
    covers = {i:prep(p) for i,p in shapes.items()}
    bounds = {i:p.bounds for i,p in shapes.items()}
    by_name = {v:k for k,v in full.items()}
    index = {name:i for i,name in enumerate(meta['links'])}
    path_faces = {(p['ingress'],p['outlet'],p['move']):[by_name[name] for name in static['paths_crossing'][str(p['id'])]]
                  for p in plan['paths']}
    conflicts = defaultdict(set)
    for (ingress,outlet,move), stripes in path_faces.items():
        for i in stripes:
            conflicts[i].add((index[ingress],index[outlet],move))
    mates = {i:set(row['crossings']) for row in courses for i in row['crossings']}
    signed = {i for i in mates if meta['crosswalks'][i]['sig']}
    starts = defaultdict(list)
    for i in signed:
        starts[i] = [(p['start'],p['start']+p['duration']) for p in plan['phase'] if full[i] in p['walk']]
    people, contact, yielding, stop, departed = {}, defaultdict(set), defaultdict(set), defaultdict(set), defaultdict(dict)
    intersections = defaultdict(int)
    checked_bounds = [(i,*bounds[i]) for i in mates]
    axes = {c['i']:c['ends'] for c in plan['faces']}

    def progress(i, x, z):
        (a,b),(c,d) = axes[i]
        return (x-(a+c)/2)*(c-a)+(z-(b+d)/2)*(d-b)

    for line in handle:
        t, cars, walkers, *_ = json.loads(line)
        covered = defaultdict(set)
        for p in walkers:
            uid,x,z,mode,i,light,valid,by_car = p[:8]
            probe = p[10] if len(p)>10 else None
            for stripe,x0,z0,x1,z1 in checked_bounds:
                if x0<=x<=x1 and z0<=z<=z1 and covers[stripe].intersects(Point(x,z)):
                    for mate in mates[stripe]: covered[mate].add(uid)
            if i in mates and by_car:
                yielding[i].add(('person',uid))
            if not probe:
                continue
            key=(probe['course'],probe['wave'],probe['side'],probe['at'])
            row=people.setdefault(key,dict(**probe, wait={},enter={},enter_side={},on={},exit={},far={},red=[],route=[]))
            old = row.get('previous')
            row['previous']=(mode,i)
            for visited in row['on']:
                if visited not in row['far'] and progress(visited,x,z)*row['enter_side'][visited]<0 and not covers[visited].intersects(Point(x,z)):
                    row['far'][visited]=t
            if i<0:
                continue
            if mode=='wait':
                row['wait'].setdefault(i,t)
            if mode=='cross' and old!=('cross',i):
                row['route'].append(labels[i])
                row['enter'].setdefault(i,t)
                row['enter_side'].setdefault(i,progress(i,x,z))
                if light==2: row['red'].append([labels[i],round(t,3)])
            if mode=='cross' and covers[i].intersects(Point(x,z)):
                row['on'].setdefault(i,t)
                row['exit'][i]=t
        for c in cars:
            uid,x,z,yaw,kind,length,hw,e,at,v,reason,light,*_=c
            dist=length/2+hw
            near=[i for i in covered if bounds[i][0]-dist<=x<=bounds[i][2]+dist and bounds[i][1]-dist<=z<=bounds[i][3]+dist]
            if near:
                surface = body(x,z,yaw,length,hw)
                for i in near:
                    if covers[i].intersects(surface):
                        intersections[i]+=1
                        contact[i].add(uid)
                    if reason in (7,13) and v<.12:
                        yielding[i].add(('car',uid))
            source,outlet=c[24:26]
            if source<0 or outlet<0 or e!=source:
                continue
            gate=meta['gates'].get(str(source))
            if gate is None:
                continue
            for i in path_faces.get((meta['links'][source],meta['links'][outlet],c[15]), []):
                within_green = any(a<=(t+meta['offset'])%clock<b for a,b in starts.get(i,()))
                if light==2 and v<.12 and -.3<=gate-at-length/2<=5 and within_green:
                    stop[i].add(uid)
                elif light==0 and uid in stop[i] and v>=.12:
                    departed[i].setdefault(uid,t)

    rows=[]
    for i in sorted(mates):
        course=next(k for k,r in enumerate(courses) if i in r['crossings'])
        descriptor=courses[course]
        cohorts=[p for p in people.values() if p['course']==course]
        phase=[(a,b) for a,b in starts.get(i,())]
        transitions=[]
        for _,end in phase:
            u=end
            while u<end+clock:
                if any((a,b,m) in conflicts[i] and dict(s['green']).get(meta['links'][a],0)&m
                       for s in plan['phase'] if s['start']<=u%clock<s['start']+s['duration'] for a,b,m in conflicts[i]):
                    transitions.append(u-end)
                    break
                u+=1
        detail=[]
        for p in cohorts:
            g=descriptor['green']+p['wave']*clock
            end=g+(phase[0][1]-phase[0][0]) if phase else math.inf
            end_actual=p['far'].get(i)
            complete=i in p['on'] and p.get('previous')!=('cross',i)
            first=descriptor['crossings'][0 if p['side']==0 else -1]
            detail.append(dict(uid=p['uid'],wave=p['wave'],side=p['side'],at=round(p['at'],3),
                waiting=p['wait'].get(i),started=p['enter'].get(i),physicalEnd=end_actual,
                complete=complete,within=end_actual is not None and end_actual < end,
                delay=round(p['enter'][i]-g,3) if i in p['enter'] and phase else None,
                first=first==i,red=p['red'],route=p['route'],
                refuge=len(mates[i])>1 and
                    any(j in p['on'] and p['on'][j]<end for j in mates[i]) and
                    any(j in p['wait'] and p['wait'][j]<g+clock<=p['on'].get(j,math.inf) for j in mates[i])))
        rows.append(dict(face=labels[i],pair=sorted(labels[j] for j in mates[i]-{i}),signed=i in signed,
            count=len(detail),expected=descriptor['perSide']*4,
            firstSides=sorted({p['side'] for p in detail if p['started'] is not None and p['first']}),
            firstDelay=[p['delay'] for p in detail if p['first'] and p['delay'] is not None],
            starts=sum(p['started'] is not None for p in detail),
            completed_in_window=sum(p['within'] for p in detail),
            unfinished=sum(not p['within'] for p in detail),red=sum(any(r[0]==labels[i] for r in p['red']) for p in detail),
            refuge=sum(p['refuge'] for p in detail),touching=sorted(contact[i]),touchSamples=intersections[i],
            stopped=len(stop[i]),departed=len(departed[i]),lag=transitions,yielding=sorted(yielding[i]),detail=detail))
    return dict(courses=len(courses),cohorts=len(people),rows=rows)


if __name__=='__main__':
    p=argparse.ArgumentParser()
    p.add_argument('trace')
    p.add_argument('plan')
    p.add_argument('static')
    a=p.parse_args()
    with open(a.plan) as plan, open(a.static) as static:
        print(json.dumps(measure(a.trace,json.load(plan),json.load(static)),ensure_ascii=False))
