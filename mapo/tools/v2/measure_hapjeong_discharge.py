"""Measure queues at green and same-lane gaps in a surveyed replay."""
import argparse
from collections import Counter, defaultdict
import json
import math
from statistics import median

from check_hapjeong_walk import read


def discharge(path):
    with open(path) as trace:
        meta = json.loads(next(trace))
        approaches = {a['edge']:a for a in meta['approach']}
        gates = {int(edge):at for edge,at in meta['gates'].items()}
        slips = set(meta.get('curves', ()))
        movements = {1: 'left', 2: 'straight', 4: 'right'}
        raw_lengths = {row['id']:row['len'] for row in read('cars')['links']}
        lengths = [raw_lengths[name] for name in meta['links']]
        step = 1/30
        greens = []
        for edge, a in approaches.items():
            for move in (1, 2):
                last = None
                for start, end, bits in a['green']:
                    if not bits & move:
                        continue
                    if start != last:
                        t = (start-meta['offset']) % meta['cycle']
                        while t < meta['duration']:
                            greens.append((t, t+end-start, edge, move))
                            t += meta['cycle']
                    last = end
        greens.sort()
        active, histories, previous = {}, [], {}
        gaps, samples, reasons, reason_runs = defaultdict(list), defaultdict(list), Counter(), {}
        free = defaultdict(list)
        long_conflicts = set()
        for line in trace:
            t, cars, *_ = json.loads(line)
            current = {c[0]:c for c in cars}
            while greens and greens[0][0] <= t:
                start,end,edge,move = greens.pop(0)
                position = lambda c: c[8] if c[7]==edge else c[8]-lengths[c[7]]
                q = sorted((c for c in (previous or current).values()
                            if (c[7]==edge or c[21]==edge and c[24]==edge) and
                            c[15]==move and c[9]<.12 and not c[13]), key=position, reverse=True)
                for k in range(1,len(q)):
                    if (position(q[k-1])-position(q[k])-(q[k-1][5]+q[k][5])/2)>5:
                        q=q[:k]
                        break
                row = dict(edge=approaches[edge]['id'],move=move,start=round(start,3),end=round(end,3),
                           queue=[c[0] for c in q],roll={},passed={},mouth=0)
                active[edge,move] = row
                histories.append(row)
            for c in cars:
                uid,e,move = c[0],c[7],c[15]
                # No active traffic, signal or stop constraint in this frame.
                if c[10] == 0 and c[9] > .5:
                    if c[16]:
                        section = movements.get(move)
                    else:
                        section = 'right_slip' if e in slips else 'outside'
                    if section:
                        free[section].append(c[9] * 3.6)
                row = active.get((e,move))
                p = previous.get(uid)
                if row is not None and t < row['end']:
                    if uid in row['queue'] and c[9]>=.12 and uid not in row['roll']:
                        row['roll'][uid] = round(t-row['start'],3)
                    if c[9]<.12 and c[11]==0 and not c[13] and c[20]>=0:
                        reasons[row['edge'],c[20]] += 1
                    key=(row['edge'],uid,row['start'])
                    if move==1 and c[9]<.12 and c[11]==0 and not c[13] and c[20]==3:
                        since=reason_runs.setdefault(key,t)
                        if t-since+step>3: long_conflicts.add(key)
                    else:
                        reason_runs.pop(key,None)
                    if p and p[7]==e and e in gates and p[8]+p[5]/2<=gates[e]<c[8]+c[5]/2 and c[11]==0:
                        row['passed'][uid]=round(t,3)
                        row['mouth']+=1
                ahead=current.get(c[19])
                if ahead and c[10] in (1,2) and c[7]==ahead[7] and c[22]==ahead[22] and ahead[9]>.5 and c[9]>.5:
                    kmh=c[9]*3.6
                    for v in (10,20,30,50):
                        if abs(kmh-v)<=1:
                            gap=ahead[8]-c[8]-(c[5]+ahead[5])/2
                            if gap>=0:
                                gaps[v].append(gap)
            previous=current
        for row in histories:
            if row['move']!=2:
                continue
            delta = row['start']
            for idx, uid in enumerate(row['queue'][:6],1):
                if uid in row['passed'] and delta is not None:
                    samples[idx].append(round(row['passed'][uid]-delta,3))
                delta = row['passed'].get(uid)
        stat = lambda d:{str(k):[len(v),round(median(v),3)] for k,v in sorted(d.items()) if v}
        left = [r['mouth'] for r in histories if r['move'] == 1 and r['end'] <= meta['duration']]
        return dict(rank=stat(samples),speed_gaps=stat(gaps),free_speeds=stat(free),
                    min_left_passed=min(left, default=None), phases=histories,
                    left_conflicts_over_three=sorted(long_conflicts),
                    reasons=[(a,k,round(n*step,2)) for (a,k),n in sorted(reasons.items())])


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('trace')
    print(json.dumps(discharge(parser.parse_args().trace),ensure_ascii=False))
