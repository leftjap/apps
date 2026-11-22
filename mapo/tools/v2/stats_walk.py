# 지시서 2(docs/redraw-orders/2-split.md) 첫 일: 인도 폭 값이 자료에서 나온 것임을 다시 본다.
# (가) 수치지형도 인도 면의 「폭」을 우리 길 등급에 짝지어 넓이 가중 분위, (나) 측량 도로중심선의 도로폭·차로수(찍기만).
# 측량 좌표는 통계에만 쓰고 아무 데도 쓰지 않는다. 실행: tools/.venv/bin/python tools/v2/stats_walk.py
import glob, json, math, os, sys
from collections import defaultdict
import shapely
from shapely.geometry import LineString, Point, Polygon
from shapely.strtree import STRtree

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
from tm import tm_to_xz  # noqa: E402
from shp import shapes, dbf  # noqa: E402

SHEETS = sorted(glob.glob(os.path.join(ROOT, 'tools', 'raw', 'ngii', 'suchi', 'sheets', '*')))
W = {'g01': 5.0, 'g2': 4.0, 'g3': 3.5}  # 지시서 표의 인도 폭


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
    groups = [(str(k), {k}) for k in range(6)] + [('g01', {0, 1}), ('g2', {2}), ('g3', {3}), ('큰길 0~3', {0, 1, 2, 3})]
    med = {}
    print('  묶음        개수   넓이㎡     10%   25%   50%   75%   90%')
    for name, ks in groups:
        sel = [(w, ar) for k, w, ar in rows if k in ks]
        if not sel:
            print(f'  {name:<9} {0:>5}')
            continue
        q = wq(sel, (0.1, 0.25, 0.5, 0.75, 0.9))
        med[name] = q[2]
        print(f'  {name:<9} {len(sel):>5} {sum(ar for _, ar in sel):>9.0f}  ' + '  '.join(f'{v:4.1f}' for v in q))
    same = True
    for g, w in W.items():
        r = round(med.get(g, float('nan')) * 2) / 2 if g in med else None
        ok = r == w
        same &= ok
        print(f'  {g}: 중앙값 {med.get(g)} → 0.5m 반올림 {r}, 지시서 W {w} → {"같음" if ok else "다름"}')
    return same


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


def main():
    m = Matcher(our_segments())
    same = walk_stats(m)
    centerline_stats(m)
    print('인도 폭 W: 지시서 값과 ' + ('같음' if same else '다름(split.py 를 만들지 않고 보고)'))


if __name__ == '__main__':
    main()
