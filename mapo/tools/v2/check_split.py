# 지시서 2(docs/redraw-orders/2-split.md): split.json 구조 검사(항목마다 PASS/FAIL, 하나라도 FAIL 이면 종료 코드 1)와
# 수치지형도와 재는 수치(판정 없이 숫자만). 측량 좌표는 대조에만 쓰고 아무 데도 쓰지 않는다.
# 실행: tools/.venv/bin/python tools/v2/check_split.py
import glob, json, os, sys
from itertools import combinations
import numpy as np
import shapely
from shapely.geometry import LineString, Polygon, box
from shapely.ops import unary_union
from shapely import make_valid
from shapely.strtree import STRtree

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
from tm import tm_to_xz  # noqa: E402
from shp import shapes  # noqa: E402
from split import dm, ground_chains, GROUP  # noqa: E402

NAMES = ('car', 'walk', 'mix', 'ped')
KR = {'car': '찻길', 'walk': '인도', 'mix': '함께 쓰는 면', 'ped': '보행 전용 띠'}
SR_LAYERS = ('N1A_A0010000', 'N1A_A0080000', 'N1A_A0043325')  # 도로·교차로·횡단보도 면
SW_LAYERS = ('N1A_A0033320',)  # 인도 면


def to_polys(lst):
    return [Polygon(dm(p[0]), [dm(h) for h in p[1:]]) for p in lst]


def even_odd(rings):
    ps = [make_valid(Polygon(r)) for r in rings if len(r) >= 3]
    if not ps:
        return None
    out = ps[0]
    for h in ps[1:]:
        out = out.symmetric_difference(h)
    return out


def survey(layers, rect):
    gs = []
    for sheet in sorted(glob.glob(os.path.join(ROOT, 'tools', 'raw', 'ngii', 'suchi', 'sheets', '*'))):
        for layer in layers:
            for kind, rings in shapes(os.path.join(sheet, layer + '.shp')):
                if kind == 5:
                    g = even_odd([[tm_to_xz(x, y) for x, y in ring] for ring in rings])
                    if g is not None:
                        gs.append(g)
    return unary_union(gs).intersection(rect)


def samples(line, step):
    n = int(line.length // step)
    return shapely.line_interpolate_point(line, [i * step for i in range(n + 1)])


def centerline_points(roads, classes):
    """땅 위 중심선을 토막마다 5m 간격으로 짚은 점"""
    pts = []
    for r in roads:
        if r['cls'] in classes:
            for ch in ground_chains(r):
                pts.extend(shapely.get_parts(samples(LineString(ch), 5.0)))
    return np.array(pts)


def edges_of(g):
    out = []
    for b in shapely.get_parts(g.boundary):
        c = shapely.get_coordinates(b)
        out.extend(shapely.linestrings(np.stack([c[:-1], c[1:]], axis=1)))
    return STRtree(out)


def nearest(tree, pts):
    """점마다 가장 가까운 것의 (번호, 거리), 점 순서대로"""
    (pi, ti), dist = tree.query_nearest(pts, return_distance=True, all_matches=False)
    idx, d = np.empty(len(pts), dtype=int), np.empty(len(pts))
    idx[pi], d[pi] = ti, dist
    return idx, d


def stat(name, v):
    if len(v) == 0:
        print(f'  {name}: 점 0개')
        return
    print(f'  {name}: 점 {len(v)}개, 중앙값 {np.median(v):.2f}m, 90% {np.quantile(v, 0.9):.2f}m, '
          f'1m 넘음 {100 * (v > 1).mean():.1f}%, 2m 넘음 {100 * (v > 2).mean():.1f}%')


def main():
    split = json.load(open(os.path.join(ROOT, 'public', 'data', 'v2', 'split.json')))
    land = json.load(open(os.path.join(ROOT, 'public', 'data', 'v2', 'land.json')))
    rect = box(*split['area'])
    R = unary_union([make_valid(p) for p in to_polys(land['road'])])
    polys = {n: to_polys(split[n]) for n in NAMES}
    face = {n: unary_union(polys[n]) for n in NAMES}
    grow = {n: face[n].buffer(0.1) for n in NAMES}  # 점이 면 안인지는 0.1m 넓힌 면으로 본다
    for g in grow.values():
        shapely.prepare(g)
    R_grow = R.buffer(0.1)
    shapely.prepare(R_grow)
    allf = unary_union(list(face.values()))

    results = []
    total = sum(len(v) for v in polys.values())
    bad = sum(1 for v in polys.values() for p in v if not p.is_valid)
    results.append((bad == 0, f'네 면 다각형 유효: {total - bad}/{total}'))
    worst = []
    for a, b in combinations(NAMES, 2):
        worst.append((face[a].intersection(face[b]).buffer(-0.05).area, a, b))
    ov = max(worst)
    results.append((ov[0] < 1, '네 면 겹침(0.05m 줄인 넓이, 1㎡ 아래): ' + ', '.join(f'{KR[a]}·{KR[b]} {v:.2f}' for v, a, b in worst)))
    out = allf.difference(R_grow).area
    results.append((out < 1, f'도로 부지 밖으로 나간 넓이 {out:.2f}㎡ (1㎡ 아래)'))
    gap = R.difference(allf).buffer(-0.05).area
    results.append((gap < R.area * 0.001, f'도로 부지에서 네 면 밖 {gap:.2f}㎡ = 도로 부지의 {100 * gap / R.area:.4f}% (0.1% 아래, 0.05m 줄인 넓이)'))

    roads = json.load(open(os.path.join(ROOT, 'tmp', 'v2', 'roads.json')))
    p = centerline_points(roads, {0, 1, 2, 3})
    x, z = shapely.get_x(p), shapely.get_y(p)
    inR = shapely.intersects_xy(R_grow, x, z)
    share = shapely.intersects_xy(grow['car'], x[inR], z[inR]).mean() * 100
    results.append((share > 98, f'큰길 중심선 점(도로 부지 안 {inR.sum()}개) 가운데 찻길 안 {share:.2f}% (98% 넘게)'))
    p = centerline_points(roads, {4, 5})
    x, z = shapely.get_x(p), shapely.get_y(p)
    inR = shapely.intersects_xy(R_grow, x, z)
    hit = shapely.intersects_xy(grow['car'], x[inR], z[inR]) | shapely.intersects_xy(grow['mix'], x[inR], z[inR])
    share = hit.mean() * 100
    results.append((share > 98, f'골목 중심선 점(도로 부지 안 {inR.sum()}개) 가운데 찻길·함께 쓰는 면 안 {share:.2f}% (98% 넘게)'))

    for ok, msg in results:
        print(('PASS ' if ok else 'FAIL ') + msg)

    # 측량 자료와 재는 수치
    Sr, Sw = survey(SR_LAYERS, rect), survey(SW_LAYERS, rect)
    big = {}
    for r in roads:
        if r['cls'] in GROUP:
            big.setdefault(GROUP[r['cls']], []).extend(LineString(ch) for ch in ground_chains(r))
    K = unary_union([ln.buffer(30) for v in big.values() for ln in v])
    car, walk, mix = face['car'], face['walk'], face['mix']
    print('측량 자료와 재는 수치(판정 없음)')
    print(f'  찻길 {car.area:.0f}㎡, 찻길∩측량 도로 {car.intersection(Sr).area:.0f}㎡, 찻길−측량 도로 {car.difference(Sr).area:.0f}㎡, '
          f'(측량 도로∩큰길 근처)−(찻길∪함께 쓰는 면) {Sr.intersection(K).difference(car.union(mix)).area:.0f}㎡')
    SwK = Sw.intersection(K)
    print(f'  인도 {walk.area:.0f}㎡, 인도∩측량 인도 {walk.intersection(Sw).area:.0f}㎡, 인도−측량 인도 {walk.difference(Sw).area:.0f}㎡, '
          f'측량 인도∩큰길 근처 {SwK.area:.0f}㎡, (측량 인도∩큰길 근처)−인도 {SwK.difference(walk).area:.0f}㎡')

    # 연석 거리: 찻길 경계를 2m 간격으로 짚은 점 가운데 인도에서 0.2m 안인 점
    pts = []
    for g in polys['car']:
        for ring in [g.exterior, *g.interiors]:
            pts.extend(shapely.get_parts(samples(LineString(ring.coords), 2.0)))
    pts = np.array(pts)
    pts = pts[shapely.dwithin(walk, pts, 0.2)]
    _, dw = nearest(edges_of(Sw), pts)
    _, dr = nearest(edges_of(Sr), pts)
    d = np.minimum(dw, dr)
    names = list(big)
    lines = [(g, ln) for g in names for ln in big[g]]
    li, _ = nearest(STRtree([ln for _, ln in lines]), pts)
    grp = np.array([lines[i][0] for i in li])
    print('  연석 거리(측량 인도·도로 경계 가운데 가까운 쪽까지)')
    stat('전체', d)
    for g in ('g01', 'g2', 'g3'):
        stat(g, d[grp == g])
    sys.exit(0 if all(ok for ok, _ in results) else 1)


if __name__ == '__main__':
    main()
