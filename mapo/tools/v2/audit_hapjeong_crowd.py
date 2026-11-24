"""Audit two complete replay cycles, including non-fixture walkers at each crossing."""
from collections import Counter, defaultdict
from itertools import combinations
import json
import math
from pathlib import Path
from statistics import median
import sys

import numpy as np
from shapely import intersects_xy, prepare

from check_hapjeong_car_run import body
from check_hapjeong_crowding import walker_identity
from check_hapjeong_walk import faces, read


def summary(values):
    return [min(values), median(values), max(values)]


def audit(path, plan, static):
    with open(path) as f:
        meta = json.loads(next(f))
        return frames(f, meta, plan, static)


def frames(records, meta, plan, static):
    linked = {row['xw']: row for row in plan['linked']}
    groups = [{i} for i in range(len(plan['faces']))]
    full_ids = [row['id'] for row in plan['faces']]
    ids = [key[-4:] for key in full_ids]
    for pair in read('cars')['walkSignalGroups']:
        indices = {full_ids.index(key) for key in pair}
        for i in indices:
            groups[i] = indices
    crosses = [faces(row['faces']) for row in plan['faces']]
    island = {}
    for i,j in combinations(linked,2):
        if j not in groups[i]:
            continue
        ends = lambda r: ((r['pax'],r['paz']), (r['pbx'],r['pbz']))
        island[i],island[j] = min(((a,b) for a in ends(linked[i]) for b in ends(linked[j])),
                                  key=lambda pair: math.dist(*pair))
    island_since, waited_five, held_on_red = {}, defaultdict(set), defaultdict(set)
    last_face = {}
    platform_keys = {p['key'] for p in (meta.get('platforms') or [])}
    passenger_holds = defaultdict(set)
    red_holds = defaultdict(dict)
    prepare(crosses)
    bounds = np.array([face.bounds if not face.is_empty else [0]*4 for face in crosses])
    phase = [next(((p['start'], p['start']+p['duration']) for p in plan['phase'] if key in p['walk']), None)
             for key in full_ids]
    links = meta['links']
    conflicting = defaultdict(set)
    for row in plan['paths']:
        key = links.index(row['ingress']), links.index(row['outlet']), row['move']
        for name in static['paths_crossing'][str(row['id'])]:
            i = full_ids.index(name)
            for j in groups[i]:
                conflicting[j].add(key)
    gates = {int(key): value for key, value in meta['gates'].items()}

    def deadline(i, t):
        if phase[i] is None:
            return None
        _, end = phase[i]
        return t + ((end - (t + meta['offset'])) % meta['cycle'])

    start_side, old, last_exit = {}, {}, {}
    episodes = []
    blocked_timers, blocked = {}, set()
    completions = Counter()
    contacts, stopped, launched, refuges = defaultdict(set), defaultdict(set), defaultdict(set), defaultdict(set)
    road_wait, movement = {}, defaultdict(Counter)
    car_waits = {}
    anchors, stuck = {}, {}
    views = {v['id']: [] for v in meta['views']}
    directions = np.array([np.array(row['ends'][1])-row['ends'][0] for row in plan['faces']])
    centres = np.array([np.mean(row['ends'],axis=0) for row in plan['faces']])
    direction_len = np.hypot(directions[:,0],directions[:,1])
    directions /= np.maximum(.001,direction_len[:,None])
    last_cars = {}
    p_ever = set()
    dt = 1/30
    for line in records:
        t, cars, people, busy, *_ = json.loads(line)
        cycle = min(1,int(t // meta['cycle']))
        count_views = round(t * 30) % 6 == 0
        across = np.array([[p[1],p[2]] for p in people]).reshape(-1,2)
        inside = intersects_xy(crosses,across[:,0,None],across[:,1,None])
        has_people = inside.any(axis=0)
        tested = [i for i in linked if any(has_people[j] for j in groups[i])]
        tested_faces = sorted(set().union(*(groups[i] for i in tested)))
        tested_bounds = bounds[tested_faces]
        cur, c_now = {}, {}
        island_now = {}
        waiters = defaultdict(list)
        for p in people:
            if p[3]=='wait':
                waiters[p[4]].append(p)
        if count_views:
            tilt, bearing = map(math.radians, (28,-42))
            fov = math.tan(math.radians(17))
            dist = 80/(2*(4/3)*fov)
            for v in meta['views']:
                x,z = (across-np.asarray(v['at'])).T
                right = x*math.cos(bearing)-z*math.sin(bearing)
                depth = -x*math.sin(bearing)-z*math.cos(bearing)
                half = (dist+depth*math.sin(tilt))*fov
                views[v['id']].append(int(((abs(right)<=half*4/3)&(abs(depth*math.cos(tilt))<=half)).sum()))
        for idx,p in enumerate(people):
            uid,x,z,mode,i,light = p[:6]
            identity = walker_identity(p)
            journey = p[9] or {}
            bus_passenger = journey.get('from') in platform_keys or journey.get('to') in platform_keys
            p_ever.add(uid)
            cur[uid] = (mode,i)
            if mode=='cross':
                last_face[identity] = i
            if i in island and mode=='wait' and math.dist((x,z),island[i]) <= 3:
                if light==2 and last_face.get(identity) in groups[i]-{i}:
                    held_on_red[i].add(identity)
                    if bus_passenger:
                        passenger_holds[i].add(identity)
                    red_holds[i].setdefault(identity, dict(uid=uid, at=t, x=x, z=z, bus=bus_passenger, journey=journey))
                if not p[8]:
                    key = (identity,i)
                    t0 = island_now[key] = island_since.get(key,t)
                    if t-t0+dt > 5+1e-8:
                        waited_five[i].add(identity)
            if count_views:
                if mode in ('cross','walk'):
                    x0,z0,t0,m0 = anchors.get(uid,(x,z,t,mode))
                    if m0 != mode or math.hypot(x-x0,z-z0) > .15:
                        x0,z0,t0 = x,z,t
                    anchors[uid] = (x0,z0,t0,mode)
                    if t-t0 > 30:
                        stuck.setdefault(uid,dict(id=uid,x=x,z=z,mode=mode,xw=ids[i] if i>=0 else None,
                                                  since=t0,at=t,near5=int((np.hypot(across[:,0]-x,across[:,1]-z)<=5).sum())-1))
                else:
                    anchors.pop(uid,None)
            if uid in start_side:
                prev_i,direction,episode = start_side[uid]
                zprog = float((across[idx]-centres[prev_i]) @ directions[prev_i])
                if inside[idx,prev_i]:
                    episode['seen'] = True
                if episode['seen'] and zprog * direction > 0 and not inside[idx,prev_i]:
                    episode['physical_end'] = t
                    completions[prev_i, cycle] += 1
                    last_exit[uid] = (prev_i,t,episode['due'])
                    del start_side[uid]
            if i not in linked:
                continue
            progress = float((across[idx]-centres[i]) @ directions[i])
            old_state = old.get(uid)
            key = uid,i
            if mode == 'cross' and old_state != ('cross',i) and t:
                if last_exit.get(uid, (-1,))[0] == i:
                    last_exit.pop(uid)
                enter = dict(uid=uid,i=i,cycle=cycle,start=t,due=deadline(i,t),red=light==2,seen=bool(inside[idx,i]),bus=bus_passenger, journey=journey)
                episodes.append(enter)
                start_side[uid] = (i,1 if progress < 0 else -1,enter)
            if mode == 'wait' and (last := last_exit.get(uid)) and last[0] != i and last[0] in groups[i]:
                a,b = phase[i]
                if last[2] is not None and t >= last[2] + meta['cycle'] - (b-a):
                    refuges[i].add(uid)
            if mode == 'cross' and uid in last_exit and last_exit[uid][0] == i and old_state == ('cross',i):
                # Observed arrival conflict: after clearing the paint, little
                # displacement for 2s with a waiting walker in the exit lane.
                link = linked[i]
                end = max(((link['pax'],link['paz']), (link['pbx'],link['pbz'])),
                          key=lambda q: progress * ((q-centres[i]) @ directions[i]))
                blockers = [q for q in waiters[i] if math.hypot(x-q[1],z-q[2]) <= 1.1
                            and (end[0]-x)*(q[1]-x)+(end[1]-z)*(q[2]-z)>0]
                if blockers:
                    ax,az,t0 = blocked_timers.setdefault(key,(x,z,t))
                    if math.hypot(x-ax,z-az) > .15:
                        blocked_timers[key] = (x,z,t)
                    elif t-t0 >= 2:
                        blocked.add(key)
                else:
                    blocked_timers.pop(key,None)
            else:
                blocked_timers.pop(key,None)

        for c in cars:
            uid,x,z,yaw,kind,length,hw,e,s,v,why,light = c[:12]
            c_now[uid] = c
            if uid in last_cars:
                prev = last_cars[uid]
                if prev[16] and not c[16] and prev[15] and prev[24] >= 0:
                    a = prev[24]
                    movement[links[a][-4:],cycle][prev[15]] += 1
            reach = length/2 + hw
            near = (tested_bounds[:,0]-reach<=x)&(x<=tested_bounds[:,2]+reach)&(tested_bounds[:,1]-reach<=z)&(z<=tested_bounds[:,3]+reach)
            if near.any():
                outline = body(x,z,yaw,length,hw)
                for k in np.flatnonzero(near):
                    face = tested_faces[k]
                    if crosses[face].intersects(outline):
                        for i in groups[face]:
                            if i in tested:
                                contacts[i].add(uid)
            a,b = c[24:26]
            if a == e and a in gates:
                for i, paths in conflicting.items():
                    if (a,b,c[15]) not in paths:
                        continue
                    if phase[i] and phase[i][0] <= (t+meta['offset'])%meta['cycle'] < phase[i][1]:
                        if light == 2 and v < .12 and -.3<=gates[e]-s-length/2<=5:
                            stopped[i].add(uid)
                    elif uid in stopped[i] and light==0 and v>=.12:
                        launched[i].add(uid)
            if v < .1 and why in (7,13):
                t0 = road_wait.setdefault(uid,t)
                if t-t0+dt > car_waits.get(uid,{}).get('seconds',0):
                    car_waits[uid] = dict(uid=uid,edge=links[e],x=x,z=z,end=t,start=t0,seconds=t-t0+dt,reason=why)
            else:
                road_wait.pop(uid,None)
        old = cur
        island_since = island_now
        last_cars = c_now
        if count_views:
            anchors = {uid:a for uid,a in anchors.items() if uid in cur}

    rows = []
    for i in sorted(linked):
        e = [r for r in episodes if r['i']==i]
        late = [dict(uid=r['uid'], start=r['start'], due=r['due'], finish=r.get('physical_end'),
                     bus=r['bus'], journey=r['journey'])
                for r in e if r['due'] is not None and r['due']<=meta['duration']
                and r.get('physical_end',math.inf)>r['due']]
        rows.append(dict(face=ids[i], group=sorted(ids[j] for j in groups[i]), starts=len(e), red=sum(r['red'] for r in e),
                         completed=[completions[i,k] for k in (0,1)],
                         late=len(late), bus_late=sum(row['bus'] for row in late), late_detail=late,
                         next_phase_wait=len(refuges[i]), car_touch=sorted(contacts[i]),
                         island_wait_over_5=len(waited_five[i]), island_wait_on_red=len(held_on_red[i]),
                         bus_island_wait_on_red=len(passenger_holds[i]), island_wait_detail=list(red_holds[i].values()),
                         car_stop=len(stopped[i]), car_start=len(launched[i]),
                         blocked=[uid for uid,xw in sorted(blocked) if xw==i]))
    left = [dict(lane=lane,cycle=period+1,count=counts[1])
            for (lane,period),counts in sorted(movement.items()) if counts[1]]
    return dict(views={k:summary(v) for k,v in views.items()}, entrants=len(p_ever), stuck=list(stuck.values()),
                course_rows=rows, wait_for_people=sorted(car_waits.values(),key=lambda a:-a['seconds']),
                left=left,
                movements=[dict(lane=k[0],cycle=k[1]+1,counts=v) for k,v in sorted(movement.items())])


if __name__ == '__main__':
    path, plan, static = map(Path,sys.argv[1:])
    result = audit(path,json.loads(plan.read_text()),json.loads(static.read_text()))
    print(json.dumps(result,ensure_ascii=False,indent=2))
