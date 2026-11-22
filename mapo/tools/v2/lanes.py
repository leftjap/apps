# 지시서 3a(docs/redraw-orders/3a-lanes.md, 5판) + 지시서 3b(docs/redraw-orders/3b-marks.md) 「먼저 할 일」: 2단계 찻길 면 위에 큰길 차로의 가운데선을 만든다.
# 읽는 것: public/data/v2/split.json 의 car, tmp/v2/roads.json(등급 0~3, 땅 위 선분).
# 결과는 public/data/v2/lanes.json 과 그림용 tmp/v2/lane-borders.json. 실행: tools/.venv/bin/python tools/v2/lanes.py
import json, math, os, time
import numpy as np
import shapely
from shapely.geometry import LineString, Point, Polygon, box
from shapely.ops import unary_union
from shapely import make_valid
from shapely.strtree import STRtree

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))

# docs/redraw.md 6절, 지시서 3a 「쓰는 값」
LANE_W = 3.0  # 차로 수를 정하는 폭
LANE_W_MAX = 3.5  # 남는 폭을 나눠 넓히는 한도
STEP = 4.0  # 단면을 재는 간격
SPAN = (0.25, 0.75)  # 구간의 폭을 정하는 범위(구간 길이 비율)
HALF_CUT = 45.0  # 단면 선의 길이(중심선 양쪽)
EDGE_MED = 30.0  # 가장자리를 고르게 하는 범위: 앞뒤 30m 안쪽 사분위 값(hi 는 25%, lo 는 75%)
EDGE_Q = {'lo': 0.75, 'hi': 0.25}
EDGE_AVG = 8.0  # 그다음 앞뒤 8m 평균
JUNCTION_DEG = 30.0  # 단면을 지나는 다른 구간 선의 방향이 이보다 더 다르면 「교차로 안」
NARROW = 1.5  # 단면 폭 ÷ 차로 수가 이보다 작은 단면에는 차로를 놓지 않는다
OPP_DEG = 150.0  # 가장자리를 정한 다른 구간 선이 이 각 이상으로 마주 보면 opp, 아니면 same
DIR_HALF = 1.0  # 다른 구간 선의 방향을 재는 길이(만나는 점 앞뒤)
STOP = 12.0  # 물리는 거리 = Wmax/2 + 12m(지시서 3b: 처음 8m 에서 서울시 횡단보도 자리에 맞춰 4m 더함)
MIN_LANE_LEN = 10.0  # 차로를 두는 가장 짧은 길이(물린 뒤), 1.5 × W_sec 와 큰 값
MIN_LANE_LEN_W = 1.5
MIN_TRUST_LEN = 40.0  # 폭을 믿는 가장 짧은 구간
STRAIGHT_DEG = 150.0  # 두 구간의 나가는 방향 사이 각이 이 이상이면 곧게 이어진다
OUT_LEN = 5.0  # 나가는 방향을 재는 길이
AHEAD = 0.5  # 단면의 진행 방향을 재는 길이


def dm(a):
    return [(a[i] / 10, a[i + 1] / 10) for i in range(0, len(a) - 1, 2)]


def key(x, z):
    return (round(x, 1), round(z, 1))


def load_car(split):
    return unary_union([make_valid(Polygon(dm(p[0]), [dm(h) for h in p[1:]])) for p in split['car']])


def right_of(u):
    """진행 방향 u = (dx, dz) 의 오른쪽 법선 r = (−dz, dx)(z 가 남쪽이라 동쪽으로 갈 때 남쪽이 오른쪽)"""
    return np.array([-u[1], u[0]])


def unit(v):
    n = math.hypot(v[0], v[1])
    return None if n == 0 else np.array([v[0] / n, v[1] / n])


# 1·2. 선분·노드·구간
def build_sections(roads, rect):
    segs = []  # (노드 a, 노드 b, 등급, 한 방향, 길이) — 목록 순서가 roads.json 에 나오는 순서, a→b 가 그 점 순서
    for r in roads:
        if r['cls'] > 3:
            continue
        p = r['p']
        pts = [(p[i], p[i + 1], p[i + 2]) for i in range(0, len(p) - 2, 3)]
        for s, e in zip(pts, pts[1:]):
            if s[1] < 0.3 and e[1] < 0.3:
                a, b = key(s[0], s[2]), key(e[0], e[2])
                if a != b:
                    segs.append((a, b, r['cls'], r['oneway'], math.dist(a, b)))
    touch = {}
    for i, (a, b, *_) in enumerate(segs):
        touch.setdefault(a, []).append(i)
        touch.setdefault(b, []).append(i)
    degree = {n: len(v) for n, v in touch.items()}

    def passes(n):
        """이 노드에서 사슬을 잇는가"""
        if degree[n] != 2:
            return False
        i, j = touch[n]
        if segs[i][3] != segs[j][3]:
            return False
        if segs[i][3]:  # 둘 다 한 방향: 한 선분의 끝과 다른 선분의 시작이 만나야 한다
            return (segs[i][1] == n and segs[j][0] == n) or (segs[j][1] == n and segs[i][0] == n)
        return True

    seen = [False] * len(segs)
    sections = []
    for start in range(len(segs)):
        if seen[start]:
            continue
        seen[start] = True
        chain = [(start, True)]  # (선분 번호, 사슬 방향이 선분의 점 순서와 같은가)
        head, tail = segs[start][0], segs[start][1]
        for side in ('tail', 'head'):
            while True:
                n = tail if side == 'tail' else head
                if not passes(n):
                    break
                nxt = [k for k in touch[n] if not seen[k]]
                if not nxt:
                    break  # 고리가 닫혔다
                k = nxt[0]
                seen[k] = True
                a, b = segs[k][0], segs[k][1]
                if side == 'tail':
                    fwd = a == n
                    chain.append((k, fwd))
                    tail = b if fwd else a
                else:
                    fwd = b == n
                    chain.insert(0, (k, fwd))
                    head = a if fwd else b
        # 방향: 한 방향 구간은 진행 방향(사슬 안 선분은 모두 같은 쪽으로 이어진다),
        # 양방향 구간은 사슬의 선분 가운데 roads.json 에 가장 먼저 나오는 선분의 방향
        ref = min(chain, key=lambda t: t[0])
        if not ref[1]:
            chain = [(k, not f) for k, f in reversed(chain)]
        pts = [segs[chain[0][0]][0] if chain[0][1] else segs[chain[0][0]][1]]
        for k, f in chain:
            pts.append(segs[k][1] if f else segs[k][0])
        full = LineString(pts)
        # 구역 직사각형으로 자른다(여러 조각이면 가장 긴 조각)
        parts = [g for g in shapely.get_parts(full.intersection(rect)) if g.geom_type == 'LineString' and g.length > 0]
        if not parts:
            continue
        line = max(parts, key=lambda g: g.length)
        if full.project(Point(line.coords[0])) > full.project(Point(line.coords[-1])):
            line = LineString(list(line.coords)[::-1])
        by_cls = {}
        for k, _ in chain:
            by_cls[segs[k][2]] = by_cls.get(segs[k][2], 0) + segs[k][4]
        cls = max(by_cls, key=lambda c: (by_cls[c], -c))
        # 구역 테두리에서 잘려 생긴 끝은 노드가 아니다(None)
        a = pts[0] if Point(line.coords[0]).distance(Point(pts[0])) < 1e-6 else None
        b = pts[-1] if Point(line.coords[-1]).distance(Point(pts[-1])) < 1e-6 else None
        sections.append({'a': a, 'b': b, 'cls': cls, 'oneway': segs[chain[0][0]][3], 'line': line})
    return sections, degree


# 3. 단면
JUNCTION = 'junction'


class Cutter:
    def __init__(self, sections, car):
        shapely.prepare(car)
        self.car = car
        self.lines = [s['line'] for s in sections]
        self.tree = STRtree(self.lines)

    def cut(self, si, d):
        """구간 si 의 선 위 거리 d 자리 단면: (p, r, lo, hi, lk, rk), None(「없음」) 또는 JUNCTION(「교차로 안」).
        lk·rk 는 왼쪽(lo)·오른쪽(hi) 끝을 정한 것: curb(찻길 면 끝), opp(마주 오는 다른 구간 선과의 가운데), same(같은 쪽으로 가는 선과의 가운데)"""
        line = self.lines[si]
        L = line.length
        if d + AHEAD <= L:
            p = np.array(line.interpolate(d).coords[0])
            u = unit(np.array(line.interpolate(d + AHEAD).coords[0]) - p)
        else:
            p = np.array(line.interpolate(d).coords[0])
            u = unit(p - np.array(line.interpolate(max(0.0, d - AHEAD)).coords[0]))
        if u is None:
            return None
        r = right_of(u)
        seg = LineString([p - HALF_CUT * r, p + HALF_CUT * r])
        P = Point(p)
        piece = None
        for g in shapely.get_parts(seg.intersection(self.car)):
            if g.geom_type == 'LineString' and g.distance(P) <= 0.05:
                piece = g
                break
        if piece is None:
            return None
        ts = [float(np.dot(np.array(c) - p, r)) for c in piece.coords]
        lo, hi = min(ts), max(ts)
        lk = rk = 'curb'
        ang = math.degrees(math.atan2(u[1], u[0])) % 180
        for oi in self.tree.query(piece):
            if oi == si:
                continue
            other = self.lines[oi]
            for c in shapely.get_coordinates(piece.intersection(other)):
                # 교차로 안 판정: 만나는 자리에서 다른 구간 선의 방향(앞뒤 1m)이 진행 방향과 30° 넘게 다르면(180° 나머지 기준)
                t0 = other.project(Point(c))
                a0 = other.interpolate(max(0.0, t0 - DIR_HALF))
                a1 = other.interpolate(min(other.length, t0 + DIR_HALF))
                kind = 'same'
                if (a1.x, a1.y) != (a0.x, a0.y):
                    oa = math.degrees(math.atan2(a1.y - a0.y, a1.x - a0.x)) % 180
                    da = abs(oa - ang) % 180
                    if min(da, 180 - da) > JUNCTION_DEG:
                        return JUNCTION
                    ov = unit((a1.x - a0.x, a1.y - a0.y))
                    if math.degrees(math.acos(max(-1.0, min(1.0, float(np.dot(ov, u)))))) >= OPP_DEG:
                        kind = 'opp'
                tt = float(np.dot(c - p, r))
                if tt > 0.01 and tt / 2 < hi:
                    hi, rk = tt / 2, kind
                elif tt < -0.01 and tt / 2 > lo:
                    lo, lk = tt / 2, kind
        return p, r, lo, hi, lk, rk


# 4. 구간의 폭·차로 수·물리기
def lane_count(W, oneway):
    if W <= 0:
        return 0
    return math.floor(W / LANE_W) if oneway else 2 * math.floor(W / (2 * LANE_W))


def out_dir(s, end):
    line = s['line']
    L = line.length
    if end == 'a':
        p, q = line.interpolate(0), line.interpolate(min(OUT_LEN, L))
    else:
        p, q = line.interpolate(L), line.interpolate(max(0.0, L - OUT_LEN))
    return unit((q.x - p.x, q.y - p.y))


def trims(sections, degree):
    at = {}
    for i, s in enumerate(sections):
        for end in ('a', 'b'):
            if s[end] is not None:
                at.setdefault(s[end], []).append((i, end))
    for i, s in enumerate(sections):
        for end in ('a', 'b'):
            node = s[end]
            if node is None or degree[node] <= 2:
                s['t' + end] = 0.0
                continue
            me = out_dir(s, end)
            widths = []
            for j, oend in at[node]:
                if j == i:
                    continue
                o = sections[j]
                od = out_dir(o, oend)
                if me is not None and od is not None:
                    ang = math.degrees(math.acos(max(-1.0, min(1.0, float(np.dot(me, od))))))
                    if ang >= STRAIGHT_DEG:
                        continue  # 곧게 이어지는 같은 길
                if o['line'].length >= MIN_TRUST_LEN and o['W'] > 0:
                    widths.append(o['W'])
            wmax = max(widths) if widths else s['W']
            s['t' + end] = wmax / 2 + STOP


def build(split_path=None, roads_path=None):
    split = json.load(open(split_path or os.path.join(ROOT, 'public', 'data', 'v2', 'split.json')))
    roads = json.load(open(roads_path or os.path.join(ROOT, 'tmp', 'v2', 'roads.json')))
    rect = box(*split['area'])
    car = load_car(split)
    sections, degree = build_sections(roads, rect)
    cutter = Cutter(sections, car)
    # 4. 구간 길이의 25%~75% 단면으로 W_sec
    for si, s in enumerate(sections):
        L = s['line'].length
        ds, d = [], SPAN[0] * L
        while d <= SPAN[1] * L + 1e-9:
            ds.append(d)
            d += STEP
        if len(ds) < 3:
            ds = [0.5 * L]
        cuts = [cutter.cut(si, d) for d in ds]
        s['jx_span'] = sum(1 for c in cuts if c == JUNCTION)
        Ws = [c[3] - c[2] for c in cuts if c is not None and c != JUNCTION]
        s['Ws'] = Ws
        # 쓸 수 있는 단면이 짚은 점의 절반을 넘을 때만 폭을 잰 것으로 본다(아니면 못 잼, 이웃을 물리는 데도 안 씀)
        s['W'] = float(np.median(Ws)) if len(Ws) > len(ds) / 2 else 0.0
        s['n'] = lane_count(s['W'], s['oneway'])
    trims(sections, degree)
    for si, s in enumerate(sections):
        s['lanes'], s['borders'], s['groups'], s['ks'], s['why'], s['runs'] = [], [], [], [], None, []
        s['skip'] = {'없음': 0, '교차로 안': 0, '좁음': 0}
        L = s['line'].length
        n = s['n']
        if s['W'] <= 0:
            s['why'] = '못 잼'
        elif n == 0:
            s['why'] = 'N = 0'
        elif L - s['ta'] - s['tb'] < max(MIN_LANE_LEN, MIN_LANE_LEN_W * s['W']):
            s['why'] = '물린 뒤 짧음'
        if s['why']:
            s['n'] = 0
            continue
        # 5. 차로 단면
        end = L - s['tb']
        ds, d = [], s['ta']
        while d < end - 1e-9:
            ds.append(d)
            d += STEP
        ds.append(end)
        # 「없음」·「교차로 안」·좁은 단면(W_k / N 이 1.5m 아래)에서 끊기는 묶음
        runs, cur = [], []
        for d in ds:
            c = cutter.cut(si, d)
            why = '없음' if c is None else '교차로 안' if c == JUNCTION else '좁음' if (c[3] - c[2]) / n < NARROW else None
            if why:
                s['skip'][why] += 1
                if cur:
                    runs.append(cur)
                cur = []
                continue
            p, r, lo, hi, lk, rk = c
            cur.append({'d': d, 'p': p, 'r': r, 'lo': lo, 'hi': hi, 'lk': lk, 'rk': rk})
        if cur:
            runs.append(cur)
        need = max(MIN_LANE_LEN, MIN_LANE_LEN_W * s['W'])
        groups = [q for q in runs if q[-1]['d'] - q[0]['d'] >= need]
        if not groups:
            s['why'] = '묶음 짧음'
            s['n'] = 0
            continue
        for gi, ks in enumerate(groups):
            # 가장자리를 따로 고르게(묶음 안에서): 앞뒤 30m 안쪽 사분위 값(lo 는 75%, hi 는 25%, 찻길 안쪽에 가까운 값) → 앞뒤 8m 평균. 찻길 안으로 당기지 않는다
            for side in ('lo', 'hi'):
                for k in ks:
                    k[side + '1'] = float(np.quantile([o[side] for o in ks if abs(o['d'] - k['d']) <= EDGE_MED], EDGE_Q[side]))
                for k in ks:
                    near = [o[side + '1'] for o in ks if abs(o['d'] - k['d']) <= EDGE_AVG]
                    k[side + '2'] = sum(near) / len(near)
            for k in ks:
                Wu = k['hi2'] - k['lo2']
                k['cu'] = (k['hi2'] + k['lo2']) / 2
                k['w'] = min(LANE_W_MAX, Wu / n)
            # 6. 차로 가운데선(묶음마다 N 개)
            for i in range(n):
                g = LineString([k['p'] + (k['cu'] + (i - (n - 1) / 2) * k['w']) * k['r'] for k in ks])
                dd = 1 if s['oneway'] or i >= n / 2 else -1
                s['lanes'].append({'gi': gi, 'd': dd, 'g': g if dd == 1 else LineString(list(g.coords)[::-1])})
            # 7. 차로 경계선(왼쪽부터 j = 0 … N). 묶음마다 runs 에도 넣는다
            run_b = []
            for j in range(n + 1):
                g = LineString([k['p'] + (k['cu'] + (j - n / 2) * k['w']) * k['r'] for k in ks])
                kind = 'edge' if j in (0, n) else 'center' if (not s['oneway'] and j * 2 == n) else 'lane'
                s['borders'].append({'k': kind, 'g': g})
                run_b.append({'k': kind, 'g': g})
            # 가장자리 종류: 묶음 단면들 가운데 가장 많은 것(같은 수면 curb, opp, same 순)
            mode = lambda vals: max(('curb', 'opp', 'same'), key=lambda v: vals.count(v))
            s['runs'].append({'g': gi, 's0': ks[0]['d'], 's1': ks[-1]['d'],
                              'lk': mode([k['lk'] for k in ks]), 'rk': mode([k['rk'] for k in ks]), 'borders': run_b})
        s['groups'] = groups
        s['ks'] = [k for q in groups for k in q]
    return {'area': split['area'], 'car': car, 'sections': sections, 'degree': degree}


def flat_dm(g):
    return [v for x, z in g.coords for v in (round(x * 10), round(z * 10))]


def main():
    t0 = time.time()
    res = build()
    secs = res['sections']
    nodes, idx = [], {}
    for s in secs:
        for end in ('a', 'b'):
            if s[end] is not None and s[end] not in idx:
                idx[s[end]] = len(nodes)
                nodes.append([round(s[end][0] * 10), round(s[end][1] * 10)])
    nid = lambda n: -1 if n is None else idx[n]
    out = {'v': 2, 'area': res['area'], 'nodes': nodes, 'sec': [{
        'a': nid(s['a']), 'b': nid(s['b']), 'cls': s['cls'], 'oneway': s['oneway'], 'len': round(s['line'].length * 10),
        'W': round(s['W'] * 100), 'n': s['n'], 'ta': round(s['ta'] * 10), 'tb': round(s['tb'] * 10),
        'axis': flat_dm(s['line']),
        'lanes': [{'g': l['gi'], 'd': l['d'], 'p': flat_dm(l['g'])} for l in s['lanes']],
        'runs': [{'g': q['g'], 's0': round(q['s0'] * 10), 's1': round(q['s1'] * 10), 'lk': q['lk'], 'rk': q['rk'],
                  'borders': [{'k': b['k'], 'p': flat_dm(b['g'])} for b in q['borders']]} for q in s['runs']]} for s in secs]}
    path = os.path.join(ROOT, 'public', 'data', 'v2', 'lanes.json')
    json.dump(out, open(path, 'w'), separators=(',', ':'))
    borders = [{'k': b['k'], 'p': flat_dm(b['g'])} for s in secs for b in s['borders']]
    bpath = os.path.join(ROOT, 'tmp', 'v2', 'lane-borders.json')
    json.dump(borders, open(bpath, 'w'), separators=(',', ':'))
    print(f'구간 {len(secs)}개(길이 {sum(s["line"].length for s in secs) / 1000:.2f}km), 차로를 둔 구간 {sum(1 for s in secs if s["n"])}개, '
          f'(묶음 둘 이상 {sum(1 for s in secs if len(s["groups"]) > 1)}개), 차로 가운데선 {sum(len(s["lanes"]) for s in secs)}개')
    sk = {k: sum(s.get('skip', {}).get(k, 0) for s in secs) for k in ('없음', '교차로 안', '좁음')}
    print(f'건너뛴 단면: 폭 재기(25~75%)에서 교차로 안 {sum(s["jx_span"] for s in secs)}개, 차로 단면에서 ' + ', '.join(f'{k} {v}개' for k, v in sk.items()))
    print(f'→ {path} ({os.path.getsize(path) / 1e6:.2f}MB), {bpath}, {time.time() - t0:.1f}초')


if __name__ == '__main__':
    main()
