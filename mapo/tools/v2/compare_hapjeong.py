"""Compare the same Hapjeong window in basic-board and surveyed replays."""
import argparse
from collections import Counter, defaultdict
import json
import math
from pathlib import Path
from statistics import median

from check_hapjeong_walk import faces, read


def camera_contains(x, z, view):
    tilt, bearing = map(math.radians, (28, -42))
    fov = math.tan(math.radians(17))
    d = view['width'] / (2 * (4/3) * fov)
    x, z = x - view['at'][0], z - view['at'][1]
    right = x*math.cos(bearing)-z*math.sin(bearing)
    depth = -x*math.sin(bearing)-z*math.cos(bearing)
    half = (d+depth*math.sin(tilt))*fov
    return abs(right) <= half*(4/3) and abs(depth*math.cos(tilt)) <= half


def describe(values):
    return [min(values), round(median(values), 2), max(values)] if values else None


def measure(path, limit=None, paved_only=False):
    f = path.open()
    meta = json.loads(next(f))
    basic = meta.get('basic', False)
    x0,z0,x1,z1 = read('cars')['window']
    if paved_only:
        from shapely import intersects_xy, prepare, union_all
        pads = read('walk')['landings']
        floor = union_all([faces(read('a')['floor']['walk']),
                           *(faces(row['faces']) for row in read('cars')['crosswalks']),
                           *(faces(end['faces']) for ends in pads.values() for end in ends)])
        prepare(floor)
    approaches = {a['edge']:a for a in meta['approach']}
    cycle = meta['cycle']
    end = min(meta['duration'], limit) if limit else meta['duration']
    windows = defaultdict(list)
    for e, a in approaches.items():
        for move in (1,2,4):
            last_end = None
            for start, finish, bits in a['green']:
                if not bits & move:
                    continue
                if start != last_end:
                    t = (start-meta['offset']) % cycle
                    while t <= end:
                        windows[e,move].append(t)
                        t += cycle
                last_end = finish
    marks = sorted((t,e,move) for (e,move), ts in windows.items() for t in ts)
    next_mark = 0
    queues, crossings, modes, finished, yield_event = [], [], {}, set(), []
    vehicle_count, people_count = [], []
    views = {v['id']:[] for v in meta['views']}
    bumper, bumper_through = [], []
    slip = set()
    curves = set(meta.get('curves', []))
    last, last_t = {}, 0
    ge = meta.get('gates', {})
    gate = lambda c: c[23] if basic else ge.get(str(c[7]), (approaches.get(c[7],{}).get('stop') or {}).get('at'))
    lane = lambda c: c[22] if len(c)>22 else 0
    for row in f:
        t, rows, walkers, *_ = json.loads(row)
        if t > end + 1e-5:
            break
        current = {c[0]:c for c in rows}
        vehicle_count.append(sum(x0<=c[1]<=x1 and z0<=c[2]<=z1 for c in rows))
        if walkers is not None and (not paved_only or abs(t - round(t/2)*2) < .0001):
            if paved_only:
                hit = intersects_xy(floor, [p[1] for p in walkers], [p[2] for p in walkers])
                walkers = [p for p, covered in zip(walkers, hit) if covered]
            people_count.append(sum(x0<=p[1]<=x1 and z0<=p[2]<=z1 for p in walkers))
            for view in meta['views']:
                views[view['id']].append(sum(camera_contains(p[1],p[2],view) for p in walkers))
        while next_mark<len(marks) and marks[next_mark][0]<=t:
            u,e,move=marks[next_mark]
            next_mark+=1
            watching = last or current
            by_lane = defaultdict(list)
            for c in watching.values():
                if c[7]!=e or c[9]>.35 or c[13] or (c[15] and c[15]!=move):
                    continue
                by_lane[lane(c)].append(c[0])
            lanes = approaches[e].get('laneMoves', [approaches[e]['moves']])
            for k, allowed in enumerate(lanes):
                if allowed & move:
                    queues.append([round(u,3),approaches[e]['id'],k,move,by_lane[k]])
        for c in rows:
            uid,e,v=c[0],c[7],c[9]
            prev = last.get(uid)
            follower = current.get(c[19])
            if follower and follower[0]!=uid and v>.5 and follower[9]>.5 and c[10] in (1,2) and c[7]==follower[7] and lane(c)==lane(follower):
                if e in approaches or c[16]:
                    gap = math.hypot(c[1]-follower[1],c[2]-follower[2])-(c[5]+follower[5])/2
                    if gap>=0:
                        bumper.append(gap)
                        if c[15]==2 and follower[15]==2: bumper_through.append(gap)
            g = gate(prev) if prev and prev[7] in approaches else None
            if g is not None and prev[8]+prev[5]/2<=g<c[8]+c[5]/2 and e==prev[7]:
                crossings.append([t,approaches[e]['id'],lane(prev),c[15],uid,c[11]])
            if prev and prev[7] in curves and prev[7] != e and uid not in slip:
                slip.add(uid)
                yield_event.append([t,meta['links'][prev[7]],4,uid])
            if len(c)>25:
                source, outlet = c[24:26]
                if source in approaches:
                    modes[uid] = (approaches[source]['id'],c[15])
                if prev and prev[7]!=e and e==prev[25] and prev[24] in approaches and uid not in finished:
                    finished.add(uid)
                    yield_event.append([t,approaches[prev[24]]['id'],prev[15],uid])
            elif prev and prev[16] and not c[16] and uid in modes and uid not in finished:
                finished.add(uid)
                yield_event.append([t,*modes[uid],uid])
            elif e in approaches and c[15]:
                modes[uid]=(approaches[e]['id'],c[15])
        last,last_t=current,t
    assert last_t >= end-.1, (last_t,end)
    queue_all = [len(q[4]) for q in queues if q[3]==2]
    headway, all_gaps, axis_gaps = [], [], []
    approach_group = {a['id']:a['group'] for a in approaches.values()}
    for t,source,k,move,ids in queues:
        if move != 2:
            continue
        later = [r for r in crossings if t<=r[0]<t+60 and r[1]==source and r[2]==k and r[3]==2 and r[5]==0]
        all_gaps.extend(b[0]-a[0] for a,b in zip(later,later[1:]))
        if approach_group[source]==0: axis_gaps.extend(b[0]-a[0] for a,b in zip(later,later[1:]))
        departed = [r for r in later if r[4] in ids]
        headway.extend(b[0]-a[0] for a,b in zip(departed,departed[1:]))
    by_in = {}
    for k in range(math.ceil(end/cycle)):
        counts = defaultdict(Counter)
        for t,a,m,_ in yield_event:
            if k*cycle<=t<(k+1)*cycle:
                counts[a][m]+=1
        by_in[str(k+1)]={a:[v[2],v[1],v[4]] for a,v in sorted(counts.items())}
    return {'vehicle':describe(vehicle_count),'people':describe(people_count),'views':{k:describe(v) for k,v in views.items()},
            'queues':queues,'queue_through':describe(queue_all),'headway_queue':describe(headway),'headway_all':describe(all_gaps),
            'queue_occupied':describe([n for n in queue_all if n]),
            'headway_axis0':describe(axis_gaps),'bumper':describe(bumper),'bumper_through':describe(bumper_through),
            'headway_queue_samples':len(headway),
            'movement':by_in,'passages':crossings,'outlets':yield_event}


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('trace',type=Path)
    parser.add_argument('--limit',type=float)
    parser.add_argument('--paved-only',action='store_true')
    args=parser.parse_args()
    print(json.dumps(measure(args.trace,args.limit,args.paved_only),ensure_ascii=False))
