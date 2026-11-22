# 지시서 3b(docs/redraw-orders/3b-marks.md): 3a 의 차로에서 중앙선·차선·흰 실선·정지선·횡단보도를 규칙으로 만든다.
# 읽는 것: public/data/v2/lanes.json(v 2, runs), public/data/board.json 의 xw(가운데 점·건너는 방향·신호 유무만).
# 결과는 public/data/v2/marks.json. 실행: tools/.venv/bin/python tools/v2/marks.py
import json, math, os, time
import numpy as np
import shapely
from shapely.geometry import LineString, Point, Polygon, box

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))

# docs/redraw.md 6절, 지시서 3b 「쓰는 값」
XW_GAP = 2.0  # 정지선에서 횡단보도까지
XW_W = 6.0  # 횡단보도 폭
XW_SIDE = 3.0  # 횡단보도 자료를 갈래에 붙이는 옆 범위: W/2 + 3(한 방향은 W + 3)
XW_DOT = 0.5  # 건너는 방향과 구간 선 방향의 내적 절댓값이 이보다 작아야 한다(60° 넘게 엇갈림)
END_TOL = 4.1  # 묶음 끝이 교차로 쪽인지 보는 거리
XW_BACK = 4.0  # 교차로 갈래 횡단보도: 차로 끝에서 교차로 쪽으로 −4m ~ 물린 거리 + 2m
XW_FWD = 2.0
MID_MARGIN = 12.0  # 구간 중간 횡단보도: 묶음 s0 + 12 ~ s1 − 12, 같은 묶음 12m 안 건너뜀
MID_HALF = 3.0  # 구간 중간 횡단보도의 반 폭
MID_STOP = 5.0  # 구간 중간 정지선 자리(s ∓ 5)
PERP = 60.0  # 구간 선에 수직인 선의 반 길이(경계선과 만나는 점을 찾는 데만 쓴다)


def dm(a):
    return [(a[i] / 10, a[i + 1] / 10) for i in range(0, len(a) - 1, 2)]


def flat(pts):
    return [v for x, z in pts for v in (round(x * 10), round(z * 10))]


def unit(v):
    n = math.hypot(v[0], v[1])
    return None if n == 0 else np.array([v[0] / n, v[1] / n])


def axis_dir(axis, s):
    """구간 선 거리 s 자리의 구간 선 방향(앞뒤 1m)"""
    a = axis.interpolate(max(0.0, s - 1.0))
    b = axis.interpolate(min(axis.length, s + 1.0))
    return unit((b.x - a.x, b.y - a.y))


def perp_hit(axis, s, line):
    """구간 선 거리 s 자리에서 구간 선에 수직인 선이 line 과 만나는 점(가장 가까운 것) 또는 None"""
    p = np.array(axis.interpolate(s).coords[0])
    u = axis_dir(axis, s)
    if u is None:
        return None
    r = np.array([-u[1], u[0]])
    pts = list(shapely.get_coordinates(LineString([p - PERP * r, p + PERP * r]).intersection(line)))
    if not pts:
        return None
    return min(pts, key=lambda q: np.linalg.norm(q - p))


def load_xw(area):
    rect = box(*area)
    out = []
    for i, c in enumerate(json.load(open(os.path.join(ROOT, 'public', 'data', 'board.json')))['xw']):
        x, z = c[0] / 10, c[1] / 10
        if rect.covers(Point(x, z)):
            # board.ts: sig = c[6] & 1 (2 는 신호 모름, 4 는 두 단 횡단보도)
            out.append({'i': i, 'p': Point(x, z), 'u': np.array([c[2] / 1000, c[3] / 1000]), 'sig': c[6] & 1})
    return out


def build():
    lanes = json.load(open(os.path.join(ROOT, 'public', 'data', 'v2', 'lanes.json')))
    area = lanes['area']
    xws = load_xw(area)
    center, lane, solid, stop, cross = [], [], [], [], []
    used = set()
    ends = []  # 묶음 끝이 교차로 쪽인 곳: (구간, 묶음, 'a'|'b', 횡단보도를 놓았는가)
    mid_try = {}  # xw 번호 → 구간 중간에서 어떻게 됐는가
    runs_info = []  # (한 방향, lk, rk)
    nears = {}
    for si, s in enumerate(lanes['sec']):
        if not s['runs']:
            continue
        axis = LineString(dm(s['axis']))
        L, ta, tb, W, n, oneway = s['len'] / 10, s['ta'] / 10, s['tb'] / 10, s['W'] / 100, s['n'], s['oneway']
        side = (W if oneway else W / 2) + XW_SIDE
        half = n // 2
        near = []  # 이 구간의 범위 안이고 건너는 방향이 엇갈리는 xw: (xw, s)
        for x in xws:
            if axis.distance(x['p']) <= side:
                sx = axis.project(x['p'])
                u = axis_dir(axis, sx)
                if u is not None and abs(float(np.dot(u, x['u']))) < XW_DOT:
                    near.append((x, sx))
        nears[si] = near
        for q in s['runs']:
            B = [LineString(dm(b['p'])) for b in q['borders']]
            s0, s1 = q['s0'] / 10, q['s1'] / 10
            runs_info.append((oneway, q['lk'], q['rk']))
            # 1. 중앙선, 2. 차선·흰 실선
            if oneway:
                if q['lk'] == 'opp':
                    center.append(B[0])
                if q['rk'] == 'opp':
                    center.append(B[n])
            else:
                center.append(B[half])
            for b, bl in zip(q['borders'], B):
                if b['k'] == 'lane':
                    lane.append(bl)
            if q['lk'] == 'same':
                solid.append(B[0])
            if q['rk'] == 'same':
                solid.append(B[n])
            # 3·4. 교차로 쪽 묶음 끝: 정지선과 갈래 횡단보도
            for end in ('a', 'b'):
                if end == 'a' and not (ta > 0 and abs(s0 - ta) <= END_TOL):
                    continue
                if end == 'b' and not (tb > 0 and abs(s1 - (L - tb)) <= END_TOL):
                    continue
                if end == 'b':
                    i0, i1 = (0, n) if oneway else (half, n)
                    stop.append(LineString([B[i0].coords[-1], B[i1].coords[-1]]))
                elif not oneway:
                    stop.append(LineString([B[0].coords[0], B[half].coords[0]]))
                # 갈래 횡단보도
                hits = []
                for x, sx in near:
                    toward = (sx - s1) if end == 'b' else (s0 - sx)
                    if -XW_BACK <= toward <= (tb if end == 'b' else ta) + XW_FWD:
                        hits.append(x)
                if hits:
                    if end == 'b':
                        E0, EN = np.array(B[0].coords[-1]), np.array(B[n].coords[-1])
                        v = axis_dir(axis, s1)
                    else:
                        E0, EN = np.array(B[0].coords[0]), np.array(B[n].coords[0])
                        v = -axis_dir(axis, s0)
                    poly = [E0 + XW_GAP * v, EN + XW_GAP * v, EN + (XW_GAP + XW_W) * v, E0 + (XW_GAP + XW_W) * v]
                    cross.append({'poly': Polygon(poly), 'sig': int(any(x['sig'] for x in hits)), 'mid': 0, 'sec': si, 'end': end})
                    used.update(x['i'] for x in hits)
                ends.append((si, q['g'], end, bool(hits)))
    # 5. 구간 중간 횡단보도(모든 갈래의 4에서 쓰이지 않은 xw, 묶음마다)
    for si, s in enumerate(lanes['sec']):
        if not s['runs']:
            continue
        axis = LineString(dm(s['axis']))
        n, oneway, near = s['n'], s['oneway'], nears[si]
        half = n // 2
        for q in s['runs']:
            B = [LineString(dm(b['p'])) for b in q['borders']]
            s0, s1 = q['s0'] / 10, q['s1'] / 10
            placed = []
            for x, sx in near:
                if x['i'] in used or not (s0 + MID_MARGIN <= sx <= s1 - MID_MARGIN):
                    continue
                if any(abs(sx - o) < MID_MARGIN for o in placed):
                    mid_try.setdefault(x['i'], 'skip12')
                    continue
                c = [perp_hit(axis, sx - MID_HALF, B[0]), perp_hit(axis, sx - MID_HALF, B[n]),
                     perp_hit(axis, sx + MID_HALF, B[n]), perp_hit(axis, sx + MID_HALF, B[0])]
                if any(v is None for v in c):
                    mid_try.setdefault(x['i'], 'noshape')
                    continue
                cross.append({'poly': Polygon(c), 'sig': x['sig'], 'mid': 1, 'sec': si, 'end': None})
                placed.append(sx)
                mid_try[x['i']] = 'mid'
                # 정지선 둘(한 방향은 하나): d=1 쪽은 s − 5, d=−1 쪽은 s + 5
                pairs = [(sx - MID_STOP, 0, n)] if oneway else [(sx - MID_STOP, half, n), (sx + MID_STOP, 0, half)]
                for ss, j0, j1 in pairs:
                    e0, e1 = perp_hit(axis, ss, B[j0]), perp_hit(axis, ss, B[j1])
                    if e0 is not None and e1 is not None:
                        stop.append(LineString([e0, e1]))
    # xw 가 어떻게 쓰였는가(찍는 수치 3)
    secs = [(LineString(dm(s['axis'])), ((s['W'] / 100) if s['oneway'] else (s['W'] / 200)) + XW_SIDE) for s in lanes['sec']]
    use = {}
    for x in xws:
        if x['i'] in used:
            use[x['i']] = '교차로 갈래에 걸림'
            continue
        t = mid_try.get(x['i'])
        if t == 'mid':
            use[x['i']] = '구간 중간에 놓임'
            continue
        if t == 'skip12':
            use[x['i']] = '구간 중간, 12m 안에 이미 있어 건너뜀'
            continue
        if t == 'noshape':
            use[x['i']] = '구간 중간, 경계선과 만나지 않아 못 놓음'
            continue
        inside = [(ax, sd) for ax, sd in secs if ax.distance(x['p']) <= sd]
        if not inside:
            use[x['i']] = '큰길에서 멂'
            continue
        crossing = False
        for ax, _ in inside:
            u = axis_dir(ax, ax.project(x['p']))
            if u is not None and abs(float(np.dot(u, x['u']))) < XW_DOT:
                crossing = True
        use[x['i']] = '큰길 가까이, 차로가 없는 자리' if crossing else '큰길 가까이, 건너는 방향이 나란함'
    return {'area': area, 'center': center, 'lane': lane, 'solid': solid, 'stop': stop, 'cross': cross,
            'ends': ends, 'runs': runs_info, 'xw': xws, 'use': use, 'lanes': lanes}


def main():
    t0 = time.time()
    r = build()
    out = {'v': 1, 'area': r['area'],
           'center': [flat(g.coords) for g in r['center']], 'lane': [flat(g.coords) for g in r['lane']],
           'solid': [flat(g.coords) for g in r['solid']], 'stop': [flat(g.coords) for g in r['stop']],
           'cross': [{'p': flat(list(c['poly'].exterior.coords)[:4]), 'sig': c['sig'], 'mid': c['mid']} for c in r['cross']]}
    path = os.path.join(ROOT, 'public', 'data', 'v2', 'marks.json')
    json.dump(out, open(path, 'w'), separators=(',', ':'))
    print(f'중앙선 {len(out["center"])}, 차선 {len(out["lane"])}, 흰 실선 {len(out["solid"])}, 정지선 {len(out["stop"])}, '
          f'횡단보도 {len(out["cross"])}(구간 중간 {sum(c["mid"] for c in out["cross"])})')
    print(f'→ {path} ({os.path.getsize(path) / 1e6:.2f}MB, {time.time() - t0:.1f}초)')


if __name__ == '__main__':
    main()
