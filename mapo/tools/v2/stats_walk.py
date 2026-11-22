# 지시서 2(docs/redraw-orders/2-split.md) 첫 일: 인도 폭 값이 자료에서 나온 것임을 다시 본다.
# (가) 수치지형도 인도 면의 「폭」을 우리 길 등급에 짝지어 넓이 가중 분위(찍기만), (나) 측량 도로중심선의 도로폭·차로수(찍기만),
# (다) 도로 부지 가장자리에서 측량 찻길까지의 거리(인도 폭 W 의 근거).
# 측량 좌표는 통계에만 쓰고 아무 데도 쓰지 않는다. 실행: tools/.venv/bin/python tools/v2/stats_walk.py
import glob, json, math, os, sys
from collections import defaultdict
import numpy as np
import shapely
from shapely.geometry import LineString, Point, Polygon
from shapely.ops import unary_union
from shapely import make_valid
from shapely.strtree import STRtree

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
from tm import tm_to_xz  # noqa: E402
from shp import shapes, dbf  # noqa: E402

SHEETS = sorted(glob.glob(os.path.join(ROOT, 'tools', 'raw', 'ngii', 'suchi', 'sheets', '*')))
W = {1: 3.75, 2: 3.25, 3: 2.75}  # 지시서 표의 인도 폭(등급 0 은 인도 없음)
SC_ADD = ('N1A_A0010000', 'N1A_A0080000', 'N1A_A0043325')  # 도로·교차로·횡단보도 면
SC_SUB = ('N1A_A0033320',)  # 인도 면


def angle(a, b):
    return math.degrees(math.atan2(b[1] - a[1], b[0] - a[0])) % 180


def adiff(a, b):
    d = abs(a - b) % 180
    return min(d, 180 - d)


def our_segments():
    """우리 중심선 선분(등급 0~5, 양 끝 y < 0.3): (등급, 방향, 선분)"""
    out = []
    for r in json.load(open(os.path.join(ROOT, 'tmp', 'v2', 'roads.json'))):
        if r['cls'] > 5:
            continue
        p = r['p']
        pts = [(p[i], p[i + 1], p[i + 2]) for i in range(0, len(p) - 2, 3)]
        for a, b in zip(pts, pts[1:]):
            if a[1] < 0.3 and b[1] < 0.3 and (a[0], a[2]) != (b[0], b[2]):
                out.append((r['cls'], angle((a[0], a[2]), (b[0], b[2])), LineString([(a[0], a[2]), (b[0], b[2])])))
    return out


class Matcher:
    def __init__(self, segs):
        self.segs = segs
        self.tree = STRtree([s for _, _, s in segs])

    def cls(self, pt, ang, dist):
        """pt 에서 dist 안, 방향 차이 30° 안인 선분 가운데 가장 가까운 것의 등급. 없으면 None"""
        best = None
        for i in self.tree.query(pt, predicate='dwithin', distance=dist):
            c, a, s = self.segs[i]
            if adiff(a, ang) <= 30:
                d = s.distance(pt)
                if best is None or d < best[0]:
                    best = (d, c)
        return None if best is None else best[1]


def wq(pairs, qs):
    """(값, 무게) 목록의 가중 분위: 값 순으로 무게를 더해 가다 전체의 q 를 처음 넘는 값"""
    pairs = sorted(pairs)
    tot = sum(w for _, w in pairs)
    out = []
    for q in qs:
        acc = 0
        for v, w in pairs:
            acc += w
            if acc > q * tot:
                out.append(v)
                break
    return out


def walk_stats(m):
    rows, no_dir, no_match = [], 0, 0
    for sheet in SHEETS:
        base = os.path.join(sheet, 'N1A_A0033320')
        _, attrs = dbf(base + '.dbf')
        for (kind, rings), a in zip(shapes(base + '.shp'), attrs):
            if kind != 5 or not rings or len(rings[0]) < 3:
                continue
            g = Polygon([tm_to_xz(x, y) for x, y in rings[0]])
            if not g.is_valid:
                g = g.buffer(0)
            if g.is_empty:
                continue
            c = list(g.minimum_rotated_rectangle.exterior.coords)
            e1, e2 = (c[0], c[1]), (c[1], c[2])
            l1, l2 = math.dist(*e1), math.dist(*e2)
            long_e, lo, sh = (e1, l1, l2) if l1 >= l2 else (e2, l2, l1)
            if lo < 2 * sh:
                no_dir += 1
                continue
            k = m.cls(g.representative_point(), angle(*long_e), 30)
            if k is None:
                no_match += 1
                continue
            rows.append((k, float(a['폭']), g.area))
    print(f'(가) 측량 인도 면: 짝지은 면 {len(rows)}개, 방향 없음 {no_dir}, 짝 없음 {no_match}')
    groups = [(str(k), {k}) for k in range(6)] + [('큰길 0~3', {0, 1, 2, 3})]
    print('  묶음        개수   넓이㎡     10%   25%   50%   75%   90%')
    for name, ks in groups:
        sel = [(w, ar) for k, w, ar in rows if k in ks]
        if not sel:
            print(f'  {name:<9} {0:>5}')
            continue
        q = wq(sel, (0.1, 0.25, 0.5, 0.75, 0.9))
        print(f'  {name:<9} {len(sel):>5} {sum(ar for _, ar in sel):>9.0f}  ' + '  '.join(f'{v:4.1f}' for v in q))


def centerline_stats(m):
    rows, no_match, parts_multi = [], 0, 0
    for sheet in SHEETS:
        base = os.path.join(sheet, 'N1L_A0020000')
        _, attrs = dbf(base + '.dbf')
        for (kind, parts), a in zip(shapes(base + '.shp'), attrs):
            if kind != 3 or not parts:
                continue
            if len(parts) > 1:
                parts_multi += 1
            pts = [tm_to_xz(x, y) for x, y in parts[0]]
            if len(pts) < 2:
                continue
            line = LineString(pts)
            if line.length == 0:
                continue
            mid = line.interpolate(line.length / 2)
            # 가운데 점이 놓인 선분의 방향
            s = line.length / 2
            acc, ang = 0.0, None
            for p, q in zip(pts, pts[1:]):
                d = math.dist(p, q)
                if acc + d >= s and d > 0:
                    ang = angle(p, q)
                    break
                acc += d
            k = m.cls(mid, ang, 15)
            if k is None:
                no_match += 1
                continue
            rows.append((k, line.length, float(a['도로폭'] or 'nan'), a['차로수']))
    print(f'(나) 측량 도로중심선: 짝지은 선 {len(rows)}개, 짝 없음 {no_match}' + (f', 여러 부분인 선 {parts_multi}개(첫 부분만 씀)' if parts_multi else ''))
    print('  등급  개수   길이m   도로폭 10%   50%   90%   차로수별 길이m(많은 순 넷)')
    for k in range(6):
        sel = [r for r in rows if r[0] == k]
        if not sel:
            print(f'  {k:>3} {0:>5}')
            continue
        q = wq([(w, ln) for _, ln, w, _ in sel if not math.isnan(w)], (0.1, 0.5, 0.9))
        lanes = defaultdict(float)
        for _, ln, _, n in sel:
            lanes[n] += ln
        top = sorted(lanes.items(), key=lambda t: -t[1])[:4]
        print(f'  {k:>3} {len(sel):>5} {sum(r[1] for r in sel):>8.0f}   ' + '  '.join(f'{v:5.1f}' for v in q)
              + '   ' + ', '.join(f'{n or "빈칸"}차로 {ln:.0f}' for n, ln in top))


def even_odd(rings):
    ps = [make_valid(Polygon(r)) for r in rings if len(r) >= 3]
    if not ps:
        return None
    out = ps[0]
    for h in ps[1:]:
        out = out.symmetric_difference(h)
    return out


def survey(layers):
    gs = []
    for sheet in SHEETS:
        for layer in layers:
            for kind, rings in shapes(os.path.join(sheet, layer + '.shp')):
                if kind == 5:
                    g = even_odd([[tm_to_xz(x, y) for x, y in ring] for ring in rings])
                    if g is not None:
                        gs.append(g)
    return unary_union(gs)


def edge_stats(m):
    land = json.load(open(os.path.join(ROOT, 'public', 'data', 'v2', 'land.json')))
    dm = lambda a: [(a[i] / 10, a[i + 1] / 10) for i in range(0, len(a) - 1, 2)]
    R = unary_union([make_valid(Polygon(dm(p[0]), [dm(h) for h in p[1:]])) for p in land['road']])
    pts = []
    for poly in getattr(R, 'geoms', [R]):
        for ring in [poly.exterior, *poly.interiors]:
            pts.extend(ring.interpolate(k * 2.0) for k in range(int(ring.length // 2)))
    pts = np.array([p for p in pts if -789 < p.x < 969 and -939 < p.y < 719])
    # 가장 가까운 우리 중심선 선분(등급 0~5, 땅 위)이 30m 안이면 그 등급
    (pi, ti), dist = m.tree.query_nearest(pts, return_distance=True, all_matches=False)
    cls = np.full(len(pts), -1)
    cls[pi] = np.where(dist <= 30, [m.segs[i][0] for i in ti], -1)
    # 측량 찻길 SC = (도로 ∪ 교차로 ∪ 횡단보도) − 인도. 점이 SC 안이면 0, 밖이면 SC 경계까지
    SC = survey(SC_ADD).difference(survey(SC_SUB))
    shapely.prepare(SC)
    edges = []
    for b in shapely.get_parts(SC.boundary):
        c = shapely.get_coordinates(b)
        edges.extend(shapely.linestrings(np.stack([c[:-1], c[1:]], axis=1)))
    (pi, _), dd = STRtree(edges).query_nearest(pts, return_distance=True, all_matches=False)
    d = np.empty(len(pts))
    d[pi] = dd
    d[shapely.contains_xy(SC, shapely.get_x(pts), shapely.get_y(pts))] = 0
    print(f'(다) 도로 부지 가장자리 점 {len(pts)}개(구역 테두리 1m 안 뺌)에서 측량 찻길까지의 거리, 등급은 30m 안 가장 가까운 중심선 선분')
    print('  등급   점 수    10%   25%   50%   75%   90%   0.5m 아래')
    med = {}
    for k in range(6):
        v = d[cls == k]
        if len(v) == 0:
            print(f'  {k:>3} {0:>7}')
            continue
        q = np.quantile(v, (0.1, 0.25, 0.5, 0.75, 0.9))
        med[k] = q[2]
        print(f'  {k:>3} {len(v):>7}  ' + '  '.join(f'{x:5.2f}' for x in q) + f'   {100 * (v < 0.5).mean():5.1f}%')
    print(f'  30m 안에 중심선이 없어 뺀 점 {(cls < 0).sum()}개')
    same = True
    for k, w in W.items():
        diff = abs(med.get(k, float('nan')) - w)
        ok = diff <= 0.3
        same &= ok
        print(f'  등급 {k}: 중앙값 {med.get(k, float("nan")):.2f} vs 지시서 W {w} → 차이 {diff:.2f}m {"(0.3m 안)" if ok else "(0.3m 넘음)"}')
    return same


def main():
    m = Matcher(our_segments())
    walk_stats(m)
    centerline_stats(m)
    same = edge_stats(m)
    print('인도 폭 W: 지시서 값과 ' + ('0.3m 안' if same else '0.3m 넘게 다름(split.py 를 고치지 않고 보고)'))


if __name__ == '__main__':
    main()
