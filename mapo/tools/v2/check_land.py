# 지시서 1(docs/redraw-orders/1-land.md): land.json 구조 검사(항목마다 PASS/FAIL, 하나라도 FAIL 이면 종료 코드 1)와
# 수치지형도 도로 부지와의 경계 거리(판정 없이 숫자만). 측량 좌표는 대조에만 쓰고 아무 데도 쓰지 않는다.
# 실행: tools/.venv/bin/python tools/v2/check_land.py
import glob, json, os, sys
import numpy as np
import shapely
from shapely.geometry import Polygon, LineString, box
from shapely.ops import unary_union
from shapely import make_valid
from shapely.strtree import STRtree

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
from tm import tm_to_xz  # noqa: E402
from shp import shapes  # noqa: E402

SURVEY = ('N1A_A0010000', 'N1A_A0033320', 'N1A_A0043325', 'N1A_A0080000')  # 도로·인도·횡단보도·교차로 면


def dm(a):
    return [(a[i] / 10, a[i + 1] / 10) for i in range(0, len(a) - 1, 2)]


def even_odd(rings):
    ps = [make_valid(Polygon(r)) for r in rings if len(r) >= 3]
    if not ps:
        return None
    out = ps[0]
    for h in ps[1:]:
        out = out.symmetric_difference(h)
    return out


def samples(line, step):
    n = int(line.length // step)
    return shapely.line_interpolate_point(line, [i * step for i in range(n + 1)])


def main():
    land = json.load(open(os.path.join(ROOT, 'public', 'data', 'v2', 'land.json')))
    rect = box(*land['area'])
    polys = [Polygon(dm(p[0]), [dm(h) for h in p[1:]]) for p in land['road']]
    road = unary_union(polys)
    bld = []
    for b in json.load(open(os.path.join(ROOT, 'public', 'data', 'board.json')))['b']:
        pts = dm(b[2:])
        if len(pts) >= 3:
            g = make_valid(Polygon(pts))
            if g.intersects(rect):
                bld.append(g)
    bld = unary_union(bld)

    results = []
    bad = sum(1 for p in polys if not p.is_valid)
    results.append((bad == 0, f'도로 부지 다각형 유효: {len(polys) - bad}/{len(polys)}'))
    # land.json 은 dm 정수라 경계가 건물 변과 만나는 점이 격자로 옮겨지며 폭 0.1m 아래 틈이 생긴다. 그 틈은 세지 않는다
    ov_g = road.intersection(bld)
    ov = ov_g.buffer(-0.05).area
    results.append((ov < 1, f'도로 부지와 건물 겹침 {ov:.2f}㎡ (0.05m 줄인 넓이, 1㎡ 아래. 줄이기 전 {ov_g.area:.2f}㎡)'))
    outside = road.difference(rect).area
    results.append((outside == 0, f'구역 밖으로 나간 넓이 {outside:.2f}㎡'))

    # 구역 안 땅 위 길 중심선(등급 0~4)을 5m 간격으로 짚은 점이 도로 부지 또는 건물 안인 비율. 등급 5 는 채우지 않으므로 뺀다
    covered = unary_union([road, bld])
    shapely.prepare(covered)
    roads = json.load(open(os.path.join(ROOT, 'tmp', 'v2', 'roads.json')))
    xs, zs = [], []
    for r in roads:
        if r['cls'] > 4:
            continue
        p = r['p']
        pts = [(p[i], p[i + 1], p[i + 2]) for i in range(0, len(p) - 2, 3)]
        chain = []
        for a, b in zip(pts + [None], pts[1:] + [None]):
            if b is not None and a[1] < 0.3 and b[1] < 0.3:
                if not chain:
                    chain = [(a[0], a[2])]
                chain.append((b[0], b[2]))
                continue
            if len(chain) >= 2 and LineString(chain).length > 0:
                s = samples(LineString(chain), 5.0)
                xs.extend(shapely.get_x(s))
                zs.extend(shapely.get_y(s))
            chain = []
    xs, zs = np.array(xs), np.array(zs)
    inside = shapely.contains_xy(rect, xs, zs)
    xs, zs = xs[inside], zs[inside]
    hit = shapely.intersects_xy(covered, xs, zs)
    share = hit.mean() * 100
    results.append((share > 98, f'길 중심선 점 {len(xs)}개 가운데 도로 부지·건물 안 {share:.2f}% (98% 넘게)'))

    for ok, msg in results:
        print(('PASS ' if ok else 'FAIL ') + msg)

    # 측량 도로 부지 = 수치지형도 도로·인도·횡단보도·교차로 면의 합
    sv = []
    for sheet in sorted(glob.glob(os.path.join(ROOT, 'tools', 'raw', 'ngii', 'suchi', 'sheets', '*'))):
        for layer in SURVEY:
            for kind, rings in shapes(os.path.join(sheet, layer + '.shp')):
                if kind == 5:
                    g = even_odd([[tm_to_xz(x, y) for x, y in ring] for ring in rings])
                    if g is not None:
                        sv.append(g)
    survey = unary_union(sv)
    # 우리 도로 부지 경계(구멍 고리 포함)를 2m 간격으로 짚고, 구역 직사각형 테두리 위의 점은 뺀다
    pts = []
    for g in polys:
        for ring in [g.exterior, *g.interiors]:
            pts.extend(shapely.get_parts(samples(LineString(ring.coords), 2.0)))
    pts = np.array(pts)
    on_edge = shapely.dwithin(rect.exterior, pts, 0.05)
    pts = pts[~on_edge]
    edges = []
    for b in shapely.get_parts(survey.boundary):
        c = shapely.get_coordinates(b)
        edges.extend(shapely.linestrings(np.stack([c[:-1], c[1:]], axis=1)))
    _, d = STRtree(edges).query_nearest(pts, return_distance=True, all_matches=False)
    # 우리 경계 점마다 가장 가까운 길 중심선(tmp/v2/roads.json 전체)이 큰길(등급 0~3)인지
    lines = [(r['cls'], LineString([(r['p'][i], r['p'][i + 2]) for i in range(0, len(r['p']) - 2, 3)])) for r in roads]
    lines = [(c, g) for c, g in lines if g.length > 0]
    (pi, li) = STRtree([g for _, g in lines]).query_nearest(pts, all_matches=False)
    big = np.zeros(len(pts), dtype=bool)
    big[pi] = np.array([lines[i][0] for i in li]) <= 3

    def report(name, v):
        print(f'측량 도로 부지 경계까지 거리({name} {len(v)}개): 중앙값 {np.median(v):.2f}m, 90% {np.quantile(v, 0.9):.2f}m, '
              f'1m 넘음 {100 * (v > 1).mean():.1f}%, 2m 넘음 {100 * (v > 2).mean():.1f}%')

    report('우리 경계 점', d)
    report('가장 가까운 중심선이 큰길(등급 0~3)인 점', d[big])
    report('그 밖의 점', d[~big])
    sys.exit(0 if all(ok for ok, _ in results) else 1)


if __name__ == '__main__':
    main()
