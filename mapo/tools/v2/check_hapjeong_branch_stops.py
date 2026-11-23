"""C4: detect a stopped vehicle with an open lane past its branch or merge."""
import argparse
from collections import Counter, defaultdict
import json
from pathlib import Path


def audit(stream, data):
    meta = json.loads(next(stream))
    source = {l['id']:l for l in data['links']}
    keys = meta['links']
    idx = {key:i for i,key in enumerate(keys)}
    links = [source[key] for key in keys]
    out = [[idx[data['links'][n]['id']] for n in e['next'] if data['links'][n]['id'] in idx] for e in links]
    incoming = Counter(i for nex in out for i in nex)
    gate = {int(i):s for i,s in meta['gates'].items()}
    stops = {i: e['stop']['at'] for i,e in enumerate(links) if e['stop'] and e['kind']=='6'}
    history = {}
    results = {}
    stoppages = defaultdict(lambda: defaultdict(float))
    for line in stream:
        t,cars,*_ = json.loads(line)
        lane = defaultdict(list)
        for c in cars:
            lane[c[7]].append(c)
        now = {}
        for c in cars:
            uid, length, e, s, v, why = c[0], c[5], c[7], c[8], c[9], c[10]
            nxt = c[21]
            if v >= .12:
                continue
            body_front = s + length / 2
            clearance = length + 2
            if nxt >= 0 and nxt in out[e] and links[nxt]['kind'] != '1' and (len(out[e]) > 1 or incoming[nxt] > 1) and 0 <= links[e]['len']-s <= clearance+2:
                # Only the first stopped vehicle in a lane can have an open way.
                # Space is measured to the next vehicle's rear bumper or stop line.
                headroom = min([gate.get(nxt, stops.get(nxt, links[nxt]['len']))] +
                               [n[8]-n[5]/2 for n in lane[nxt]])
                stoppages[(uid,keys[e],keys[nxt])][why] += 1/30
                if headroom >= clearance and not any(n[8]>s for n in lane[e]) and why not in (7, 10, 13):
                    track((uid,'branch',e,nxt), t, history, now, results, [keys[e],keys[nxt],why,s,headroom])
            stop = gate.get(e, stops.get(e))
            if stop is None or stop - body_front < clearance or s < max(0, stop-30):
                continue
            if not any(s < n[8] <= stop+n[5]/2 for n in lane[e]) and why not in (7, 13):
                track((uid,'stopLine',e,e),t,history,now,results,[keys[e],keys[e],why,s,stop-body_front])
        history = now
    return dict(episodes=list(results.values()), counts=Counter(r['type'] for r in results.values()),
                stopped=[dict(id=k[0],link=k[1],next=k[2],reasons={a:round(b,2) for a,b in v.items()})
                         for k,v in sorted(stoppages.items())])


def track(key,t,previous,current,results,details):
    start = current[key] = previous.get(key,t)
    if t - start > 5:
        results[(key,start)] = dict(id=key[0], type=key[1], start=start,end=t,seconds=round(t-start,3),
                                    link=details[0],next=details[1],why=details[2],s=round(details[3],3),
                                    room=round(details[4],3))


if __name__ == '__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('trace')
    parser.add_argument('--verify',action='store_true')
    args=parser.parse_args()
    path=Path(__file__).resolve().parents[2]/'public/data/v2/hapjeong-hd-cars.json'
    with open(args.trace) as trace:
        result=audit(trace,json.loads(path.read_text()))
    print(json.dumps(result,ensure_ascii=False))
    if args.verify and result['episodes']:
        parser.exit(1, 'C4 failed: ' + str(dict(result['counts'])) + '\n')
