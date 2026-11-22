# 지시서 1(docs/redraw-orders/1-land.md): 시제품 구역의 땅을 건물 / 도로 부지 / 그 밖으로 나눈다.
# 도로 부지 = (실폭도로 ∪ 도로 부지가 없는 길의 표준 폭 띠) − 건물. 결과는 public/data/v2/land.json.
# 실행: node tools/v2/roads_json.ts && tools/.venv/bin/python tools/v2/land.py
import json, os, sys, time
import shapely
from shapely.geometry import Polygon, LineString, Point, box
from shapely.ops import unary_union, substring
from shapely import make_valid

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
from tm import ll_to_xz  # noqa: E402

AREA = (-790, -940, 970, 720)
RECT = box(*AREA)
STEP = 2.0  # 길 중심선을 짚는 간격(m)
WIDTH = {0: 28, 1: 28, 2: 20, 3: 14, 4: 4}  # 도로 부지가 없는 길의 띠 폭(전체, m), docs/redraw.md 6절. 등급 5·6 은 채우지 않는다
MIN_AREA = 1.0  # 이보다 작은 조각·구멍은 지운다(㎡)


def even_odd(rings):
    """첫 고리가 바깥, 나머지는 짝홀 규칙(구멍)"""
    ps = [make_valid(Polygon(r)) for r in rings if len(r) >= 3]
    if not ps:
        return None
    out = ps[0]
    for h in ps[1:]:
        out = out.symmetric_difference(h)
    return out


def polygons(g):
    if g.is_empty:
        return []
    if g.geom_type == 'Polygon':
        return [g]
    return [p for part in getattr(g, 'geoms', []) for p in polygons(part)]


def load_gis_roads():
    out = []
    for r in json.load(open(os.path.join(ROOT, 'tools', 'raw', 'gis-roads.json')))['roads']:
        g = even_odd([[ll_to_xz(lat, lon) for lat, lon in ring] for ring in r['r'] if len(ring) >= 4])
        if g is not None and g.intersects(RECT):
            out.append(g)
    return unary_union(out)


def ground_chains(road):
    """땅 위(양 끝 y < 0.3) 선분이 이어진 토막마다 [(x,z), ...]"""
    p = road['p']
    pts = [(p[i], p[i + 1], p[i + 2]) for i in range(0, len(p) - 2, 3)]
    chains, cur = [], []
    for a, b in zip(pts, pts[1:]):
        if a[1] < 0.3 and b[1] < 0.3:
            if not cur:
                cur = [(a[0], a[2])]
            cur.append((b[0], b[2]))
        elif cur:
            chains.append(cur)
            cur = []
    if cur:
        chains.append(cur)
    return [c for c in chains if LineString(c).length > 0]


def fill_bands(roads, covered):
    """길 중심선을 2m 간격으로 짚어 도로 부지 밖인 점이 이어지는 토막을 등급 폭의 띠로"""
    bands = []
    for road in roads:
        if road['cls'] not in WIDTH:
            continue
        half = WIDTH[road['cls']] / 2
        for chain in ground_chains(road):
            line = LineString(chain)
            if not line.intersects(RECT):
                continue
            n = int(line.length // STEP)
            s = [i * STEP for i in range(n + 1)]
            if line.length - s[-1] > 1e-6:
                s.append(line.length)
            pts = shapely.line_interpolate_point(line, s)
            xs, zs = shapely.get_x(pts), shapely.get_y(pts)
            # 구역 안의 점만 본다(구역과 겹치는 도로 부지만 읽었으므로 구역 밖 점의 안/밖은 알 수 없다)
            out = ~shapely.contains_xy(covered, xs, zs) & shapely.contains_xy(RECT, xs, zs)
            i = 0
            while i < len(s):
                if not out[i]:
                    i += 1
                    continue
                j = i
                while j + 1 < len(s) and out[j + 1]:
                    j += 1
                piece = Point(xs[i], zs[i]) if j == i else substring(line, s[i], s[j])
                bands.append(piece.buffer(half, cap_style='round', join_style='round'))
                i = j + 1
    return unary_union(bands) if bands else Polygon()


def load_buildings():
    out = []
    for b in json.load(open(os.path.join(ROOT, 'public', 'data', 'board.json')))['b']:
        pts = [(b[i] / 10, b[i + 1] / 10) for i in range(2, len(b) - 1, 2)]
        if len(pts) >= 3:
            g = make_valid(Polygon(pts))
            if g.intersects(RECT):
                out.append(g)
    return unary_union(out)


def drop_small(g):
    keep = []
    for p in polygons(g):
        if p.area < MIN_AREA:
            continue
        holes = [h for h in p.interiors if Polygon(h).area >= MIN_AREA]
        keep.append(Polygon(p.exterior, holes))
    return keep


def ring_dm(ring):
    c = list(ring.coords)[:-1]  # 닫는 점은 board.json 건물처럼 되풀이하지 않는다
    return [v for x, z in c for v in (round(x * 10), round(z * 10))]


def main():
    t0 = time.time()
    gis = load_gis_roads()
    roads = json.load(open(os.path.join(ROOT, 'tmp', 'v2', 'roads.json')))
    shapely.prepare(gis)
    bands = fill_bands(roads, gis)
    fill = bands.difference(gis)
    site = unary_union([gis, bands])
    bld = load_buildings()
    road = site.difference(bld).intersection(RECT)
    # land.json 좌표는 dm 정수라 0.1m 격자에 맞춰 둔다(격자에 맞추면서 다각형이 유효하게 남도록 GEOS 가 처리한다)
    road = shapely.set_precision(road, 0.1)
    keep = drop_small(road)
    out = {
        'v': 1,
        'area': list(AREA),
        'road': [[ring_dm(p.exterior)] + [ring_dm(h) for h in p.interiors] for p in keep],
        'fill': round(fill.intersection(RECT).area),
    }
    path = os.path.join(ROOT, 'public', 'data', 'v2', 'land.json')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    json.dump(out, open(path, 'w'), separators=(',', ':'))
    lost = site.intersection(bld).intersection(RECT).area
    print(f'도로 부지 다각형 {len(keep)}개, 구멍 {sum(len(p.interiors) for p in keep)}개, 넓이 {sum(p.area for p in keep):.0f}㎡')
    print(f'채운 띠 {out["fill"]}㎡, 건물 때문에 도로 부지에서 빠진 넓이 {lost:.0f}㎡')
    print(f'→ {path} ({os.path.getsize(path) / 1e6:.2f}MB, {time.time() - t0:.1f}초)')


if __name__ == '__main__':
    main()
